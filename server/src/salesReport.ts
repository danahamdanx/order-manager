import { averageOrderValue, isTzName, parseRange, pctChange, previousRange, summarize } from './analytics.js';
import type { SalesPoint, SalesRange } from './analytics.js';
import { query, queryOne } from './db.js';
import { HttpError } from './errors.js';

// unit بيجي من قائمة ثابتة (day أو week) مش من المستخدم، فمسموح ندخله بالنص
async function loadSeries(from: string, to: string, unit: 'day' | 'week', tz: string): Promise<SalesPoint[]> {
  const rows = await query<{ date: string; orders: number; paidOrders: number; revenue: number; newCustomers: number }>(
    `WITH buckets AS (
       SELECT g::date AS bucket
       FROM generate_series(date_trunc('${unit}', $1::date::timestamp), $2::date::timestamp, interval '1 ${unit}') AS g),
     sales AS (
       SELECT date_trunc('${unit}', o.created_at AT TIME ZONE $3::text)::date AS bucket,
              COUNT(*) FILTER (WHERE o.status <> 'cancelled')::int AS orders,
              COUNT(*) FILTER (WHERE o.payment_status = 'paid')::int AS "paidOrders",
              COALESCE(SUM(o.total) FILTER (WHERE o.payment_status = 'paid'), 0) AS revenue
       FROM orders o
       WHERE o.created_at >= ($1::date::timestamp AT TIME ZONE $3::text)
         AND o.created_at <  (($2::date + 1)::timestamp AT TIME ZONE $3::text)
       GROUP BY 1),
     signups AS (
       SELECT date_trunc('${unit}', u.created_at AT TIME ZONE $3::text)::date AS bucket, COUNT(*)::int AS "newCustomers"
       FROM users u
       WHERE u.role = 'customer'
         AND u.created_at >= ($1::date::timestamp AT TIME ZONE $3::text)
         AND u.created_at <  (($2::date + 1)::timestamp AT TIME ZONE $3::text)
       GROUP BY 1)
     SELECT b.bucket::text AS date,
            COALESCE(s.orders, 0) AS orders,
            COALESCE(s."paidOrders", 0) AS "paidOrders",
            COALESCE(s.revenue, 0) AS revenue,
            COALESCE(n."newCustomers", 0) AS "newCustomers"
     FROM buckets b
     LEFT JOIN sales s ON s.bucket = b.bucket
     LEFT JOIN signups n ON n.bucket = b.bucket
     ORDER BY b.bucket`,
    [from, to, tz],
  );
  return rows.map((r) => ({ ...r, aov: averageOrderValue(r.revenue, r.paidOrders) }));
}

// "اليوم" بتوقيت المستخدم. وإذا اسم التوقيت غلط، PostgreSQL بيرفضه (22023) وبنرجع 400
export async function localToday(tz: string): Promise<string> {
  try {
    const row = await queryOne<{ today: string }>(`SELECT (now() AT TIME ZONE $1::text)::date::text AS today`, [tz]);
    return row!.today;
  } catch (err) {
    if ((err as { code?: string }).code === '22023') {
      throw new HttpError(400, 'Validation failed', ['tz must be a valid time zone name']);
    }
    throw err;
  }
}

export async function resolveTz(raw: Record<string, unknown>): Promise<string> {
  const tz = raw.tz === undefined ? 'UTC' : raw.tz;
  if (!isTzName(tz)) throw new HttpError(400, 'Validation failed', ['tz must be a valid time zone name']);
  await localToday(tz);
  return tz;
}

// الفترة من الـ query (نفس القواعد بكل التقارير). ignoreGranularity: التقارير اللي ما بتجمّع بالزمن
export async function resolveRange(raw: Record<string, unknown>, ignoreGranularity = false): Promise<SalesRange> {
  const input = ignoreGranularity ? { ...raw, granularity: undefined } : raw;
  const today = await localToday(isTzName(raw.tz) ? raw.tz : 'UTC');
  const parsed = parseRange(input, today);
  if (!parsed.range) throw new HttpError(400, 'Validation failed', [parsed.error ?? 'invalid range']);
  return parsed.range;
}

export async function salesReport(raw: Record<string, unknown>) {
  const range = await resolveRange(raw);
  const previous = previousRange(range.from, range.to);
  const [series, previousSeries] = await Promise.all([
    loadSeries(range.from, range.to, range.granularity, range.tz),
    loadSeries(previous.from, previous.to, 'day', range.tz), // للمجاميع بس، فالتجميع مش مهم
  ]);

  const totals = summarize(series);
  const previousTotals = summarize(previousSeries);

  return {
    range,
    series,
    totals,
    previous: { ...previous, totals: previousTotals },
    changes: {
      revenue: pctChange(totals.revenue, previousTotals.revenue),
      orders: pctChange(totals.orders, previousTotals.orders),
      aov: pctChange(totals.aov, previousTotals.aov),
      newCustomers: pctChange(totals.newCustomers, previousTotals.newCustomers),
    },
  };
}