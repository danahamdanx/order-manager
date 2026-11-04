import { capRows, MAX_EXPORT_ROWS, toCsv } from './csv.js';
import { query } from './db.js';
import { STATUSES } from './db.js';
import { HttpError } from './errors.js';
import { localToday, resolveRange, resolveTz } from './salesReport.js';

export interface CsvFile {
  filename: string;
  csv: string;
  truncated: boolean;
}

const money = (value: number) => value.toFixed(2);

const ORDER_HEADERS = [
  'Order ID', 'Created', 'Customer', 'Email', 'Status', 'Payment status', 'Paid at',
  'Units', 'Items', 'Subtotal', 'Discount', 'Discount code', 'Shipping', 'Total', 'Address',
] as const;

export async function ordersCsv(raw: Record<string, unknown>): Promise<CsvFile> {
  const range = await resolveRange(raw, true);

  const status = raw.status === undefined || raw.status === '' ? null : raw.status;
  if (status !== null && (typeof status !== 'string' || !(STATUSES as readonly string[]).includes(status))) {
    throw new HttpError(400, 'Validation failed', [`status must be one of: ${STATUSES.join(', ')}`]);
  }

  const result = await query<{
    id: number; created: string; customer: string; email: string; status: string; paymentStatus: string;
    paidAt: string | null; units: number; items: string | null; subtotal: number; discount: number;
    discountCode: string | null; shipping: number; total: number; address: string;
  }>(
    `SELECT o.id,
            to_char(o.created_at AT TIME ZONE $3::text, 'YYYY-MM-DD HH24:MI:SS') AS created,
            u.name AS customer, u.email, o.status, o.payment_status AS "paymentStatus",
            (SELECT to_char(pm.paid_at AT TIME ZONE $3::text, 'YYYY-MM-DD HH24:MI:SS')
               FROM payments pm WHERE pm.order_id = o.id AND pm.status IN ('succeeded', 'refunded')
               ORDER BY pm.id DESC LIMIT 1) AS "paidAt",
            (SELECT COALESCE(SUM(oi.quantity), 0) FROM order_items oi WHERE oi.order_id = o.id)::int AS units,
            (SELECT STRING_AGG(oi.quantity || ' x ' || oi.product_name, '; ' ORDER BY oi.id)
               FROM order_items oi WHERE oi.order_id = o.id) AS items,
            o.subtotal, o.discount, o.discount_code AS "discountCode", o.shipping, o.total, o.address
     FROM orders o JOIN users u ON u.id = o.user_id
     WHERE o.created_at >= ($1::date::timestamp AT TIME ZONE $3::text)
       AND o.created_at < (($2::date + 1)::timestamp AT TIME ZONE $3::text)
       AND ($4::text IS NULL OR o.status = $4)
     ORDER BY o.created_at, o.id
     LIMIT ${MAX_EXPORT_ROWS + 1}`,
    [range.from, range.to, range.tz, status],
  );

  const { rows, truncated } = capRows(result);
  const csv = toCsv(
    ORDER_HEADERS,
    rows.map((r) => [
      r.id, r.created, r.customer, r.email, r.status, r.paymentStatus, r.paidAt ?? '',
      r.units, r.items ?? '', money(r.subtotal), money(r.discount), r.discountCode ?? '',
      money(r.shipping), money(r.total), r.address,
    ]),
  );
  return { filename: `orders_${range.from}_to_${range.to}.csv`, csv, truncated };
}

const CUSTOMER_HEADERS = [
  'Customer ID', 'Name', 'Email', 'Phone', 'Joined', 'Orders', 'Paid orders', 'Total spent', 'Last order',
] as const;

export async function customersCsv(raw: Record<string, unknown>): Promise<CsvFile> {
  const tz = await resolveTz(raw);
  const today = await localToday(tz);

  const result = await query<{
    id: number; name: string; email: string; phone: string | null; joined: string; orders: number;
    paidOrders: number; totalSpent: number; lastOrder: string | null;
  }>(
    `SELECT u.id, u.name, u.email, u.phone,
            to_char(u.created_at AT TIME ZONE $1::text, 'YYYY-MM-DD HH24:MI:SS') AS joined,
            COUNT(o.id) FILTER (WHERE o.status <> 'cancelled')::int AS orders,
            COUNT(o.id) FILTER (WHERE o.payment_status = 'paid')::int AS "paidOrders",
            COALESCE(SUM(o.total) FILTER (WHERE o.payment_status = 'paid'), 0) AS "totalSpent",
            to_char((MAX(o.created_at) FILTER (WHERE o.status <> 'cancelled')) AT TIME ZONE $1::text,
                    'YYYY-MM-DD HH24:MI:SS') AS "lastOrder"
     FROM users u LEFT JOIN orders o ON o.user_id = u.id
     WHERE u.role = 'customer'
     GROUP BY u.id
     ORDER BY u.id
     LIMIT ${MAX_EXPORT_ROWS + 1}`,
    [tz],
  );

  const { rows, truncated } = capRows(result);
  const csv = toCsv(
    CUSTOMER_HEADERS,
    rows.map((r) => [r.id, r.name, r.email, r.phone ?? '', r.joined, r.orders, r.paidOrders, money(r.totalSpent), r.lastOrder ?? '']),
  );
  return { filename: `customers_${today}.csv`, csv, truncated };
}