import { parseThreshold } from './analytics.js';
import type { SalesRange } from './analytics.js';
import { query } from './db.js';
import { HttpError } from './errors.js';
import { resolveRange } from './salesReport.js';
import { parsePaging } from './validation.js';

// حدود الفترة بتتحول لتوقيت UTC (مش AT TIME ZONE على العمود) عشان الـ index يضل شغال
const IN_RANGE = `o.created_at >= ($1::date::timestamp AT TIME ZONE $3::text)
  AND o.created_at < (($2::date + 1)::timestamp AT TIME ZONE $3::text)`;

// الترتيب من قائمة ثابتة (مش من المستخدم)، مع تعادل ثابت عشان النتيجة تكون ثابتة
const PRODUCT_ORDER = {
  units: 'units DESC, revenue DESC, p.id',
  revenue: 'revenue DESC, units DESC, p.id',
} as const;

// الإيراد هون = سعر البند × الكمية قبل خصومات الطلب والشحن. وبس الطلبات المدفوعة
async function topProducts(range: SalesRange, limit: number, by: keyof typeof PRODUCT_ORDER) {
  return query<{ id: number; name: string; category: string; units: number; revenue: number }>(
    `SELECT p.id, p.name, c.name AS category,
            SUM(oi.quantity)::int AS units,
            SUM(oi.unit_price * oi.quantity) AS revenue
     FROM order_items oi
     JOIN orders o ON o.id = oi.order_id
     JOIN products p ON p.id = oi.product_id
     JOIN categories c ON c.id = p.category_id
     WHERE o.payment_status = 'paid' AND ${IN_RANGE}
     GROUP BY p.id, c.name
     ORDER BY ${PRODUCT_ORDER[by]}
     LIMIT $4`,
    [range.from, range.to, range.tz, limit],
  );
}

async function topCustomers(range: SalesRange, limit: number) {
  return query<{ id: number; name: string; email: string; orders: number; spent: number; lastOrderAt: Date }>(
    `SELECT u.id, u.name, u.email,
            COUNT(*)::int AS orders,
            SUM(o.total) AS spent,
            MAX(o.created_at) AS "lastOrderAt"
     FROM orders o JOIN users u ON u.id = o.user_id
     WHERE o.payment_status = 'paid' AND ${IN_RANGE}
     GROUP BY u.id
     ORDER BY spent DESC, orders DESC, u.id
     LIMIT $4`,
    [range.from, range.to, range.tz, limit],
  );
}

// المخزون الحالي (مش مربوط بالفترة). sold30 = المباع آخر 30 يوم بالطلبات المدفوعة
async function lowStock(threshold: number) {
  return query<{ id: number; name: string; category: string; stock: number; sold30: number }>(
    `SELECT p.id, p.name, c.name AS category, p.stock,
            COALESCE((SELECT SUM(oi.quantity)
                      FROM order_items oi JOIN orders o ON o.id = oi.order_id
                      WHERE oi.product_id = p.id AND o.payment_status = 'paid'
                        AND o.created_at >= now() - interval '30 days'), 0)::int AS sold30
     FROM products p JOIN categories c ON c.id = p.category_id
     WHERE p.active = true AND p.stock <= $1
     ORDER BY p.stock ASC, sold30 DESC, p.name
     LIMIT 100`,
    [threshold],
  );
}

export async function insightsReport(raw: Record<string, unknown>) {
  const range = await resolveRange(raw, true);
  const limit = parsePaging({ limit: raw.limit }, 10, 50).limit;
  const threshold = parseThreshold(raw.threshold);
  if (threshold === null) throw new HttpError(400, 'Validation failed', ['threshold must be a whole number from 0 to 1000']);

  const [byUnits, byRevenue, customers, low] = await Promise.all([
    topProducts(range, limit, 'units'),
    topProducts(range, limit, 'revenue'),
    topCustomers(range, limit),
    lowStock(threshold),
  ]);

  return { range, topProducts: { byUnits, byRevenue }, topCustomers: customers, lowStock: { threshold, items: low } };
}