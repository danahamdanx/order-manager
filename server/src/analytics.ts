import { fromCents, toCents } from './discounts.js';

export type Granularity = 'day' | 'week';

export interface SalesRange {
  from: string;
  to: string;
  granularity: Granularity;
  tz: string;
  days: number;
}

export interface SalesPoint {
  date: string;
  orders: number;
  paidOrders: number;
  revenue: number;
  aov: number | null;
  newCustomers: number;
}

export interface SalesTotals {
  revenue: number;
  orders: number;
  paidOrders: number;
  aov: number | null;
  newCustomers: number;
}

const DAY_MS = 86_400_000;
const MAX_DAYS = 366;
const MAX_DAILY_DAYS = 92;
const AUTO_WEEKLY_AFTER_DAYS = 62;

// التواريخ كلها نصوص YYYY-MM-DD (تاريخ تقويم بدون توقيت)، فالحساب بيتم بـ UTC بدون مفاجآت
export function parseDate(value: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [y, m, d] = value.split('-').map(Number);
  const ms = Date.UTC(y, m - 1, d);
  const back = new Date(ms);
  const same = back.getUTCFullYear() === y && back.getUTCMonth() === m - 1 && back.getUTCDate() === d;
  return same ? ms : null;
}

export const addDays = (date: string, days: number) =>
  new Date(parseDate(date)! + days * DAY_MS).toISOString().slice(0, 10);

// شاملة الطرفين: من 5 لـ 5 = يوم واحد
export const daysBetween = (from: string, to: string) => Math.round((parseDate(to)! - parseDate(from)!) / DAY_MS) + 1;

export const isTzName = (value: unknown): value is string =>
  typeof value === 'string' && value.length > 0 && value.length <= 64 && /^[A-Za-z0-9_+\-/]+$/.test(value);

// today: تاريخ اليوم بتوقيت المستخدم (بيجي من القاعدة). الافتراضي: آخر 30 يوم
export function parseRange(query: Record<string, unknown>, today: string): { range?: SalesRange; error?: string } {
  const tz = query.tz === undefined ? 'UTC' : query.tz;
  if (!isTzName(tz)) return { error: 'tz must be a valid time zone name' };

  const to = query.to === undefined ? today : query.to;
  if (typeof to !== 'string' || parseDate(to) === null) return { error: 'to must be a date like 2026-10-31' };

  const from = query.from === undefined ? addDays(to, -29) : query.from;
  if (typeof from !== 'string' || parseDate(from) === null) return { error: 'from must be a date like 2026-10-01' };

  if (from > to) return { error: 'from must be on or before to' }; // الترتيب النصي = ترتيب التواريخ
  if (to > today) return { error: 'to cannot be in the future' };

  const days = daysBetween(from, to);
  if (days > MAX_DAYS) return { error: `the range can be at most ${MAX_DAYS} days` };

  const g = query.granularity;
  if (g !== undefined && g !== 'day' && g !== 'week') return { error: 'granularity must be day or week' };
  const granularity: Granularity = g ?? (days <= AUTO_WEEKLY_AFTER_DAYS ? 'day' : 'week');
  if (granularity === 'day' && days > MAX_DAILY_DAYS) {
    return { error: `the daily view supports up to ${MAX_DAILY_DAYS} days, use weekly` };
  }

  return { range: { from, to, granularity, tz, days } };
}

// الفترة اللي قبلها مباشرة بنفس الطول (للمقارنة)
export function previousRange(from: string, to: string) {
  const days = daysBetween(from, to);
  const prevTo = addDays(from, -1);
  return { from: addDays(prevTo, -(days - 1)), to: prevTo };
}

export const averageOrderValue = (revenue: number, paidOrders: number) =>
  paidOrders > 0 ? fromCents(Math.round(toCents(revenue) / paidOrders)) : null;
// المجاميع بالسنتات (أرقام صحيحة)، فما في أخطاء تقريب مثل 0.1 + 0.2
export function summarize(
  points: Pick<SalesPoint, 'orders' | 'paidOrders' | 'revenue' | 'newCustomers'>[],
): SalesTotals {
  let cents = 0;
  let orders = 0;
  let paidOrders = 0;
  let newCustomers = 0;
  for (const p of points) {
    cents += toCents(p.revenue);
    orders += p.orders;
    paidOrders += p.paidOrders;
    newCustomers += p.newCustomers;
  }
  const revenue = fromCents(cents);
  return { revenue, orders, paidOrders, aov: averageOrderValue(revenue, paidOrders), newCustomers };
}

// نسبة التغيير بالمية (بخانة عشرية وحدة). بدون فترة سابقة (صفر) ما في نسبة ذات معنى
export function pctChange(current: number | null, previous: number | null): number | null {
  if (current === null || previous === null || previous === 0) return null;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}