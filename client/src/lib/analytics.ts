export type Granularity = 'day' | 'week';

export const PRESETS = [
  { key: '7', label: '7 days', days: 7 },
  { key: '30', label: '30 days', days: 30 },
  { key: '90', label: '90 days', days: 90 },
  { key: '365', label: '12 months', days: 365 },
] as const;

const DAY_MS = 86_400_000;
const MAX_DAYS = 366;
const MAX_DAILY_DAYS = 92;

const parse = (iso: string): number | null => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const [y, m, d] = iso.split('-').map(Number);
  const ms = Date.UTC(y, m - 1, d);
  const back = new Date(ms);
  return back.getUTCFullYear() === y && back.getUTCMonth() === m - 1 && back.getUTCDate() === d ? ms : null;
};

// تاريخ اليوم عند المستخدم (بتوقيت جهازه، مش UTC)
export const localISO = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

export const shiftDays = (iso: string, days: number) => new Date(parse(iso)! + days * DAY_MS).toISOString().slice(0, 10);

export const daysInRange = (from: string, to: string) => Math.round((parse(to)! - parse(from)!) / DAY_MS) + 1;

export const autoGranularity = (days: number): Granularity => (days <= 62 ? 'day' : 'week');

export interface RangeValues {
  range: string;
  from: string;
  to: string;
  g: string;
}

export function resolveRange(values: RangeValues, today: string) {
  const preset = PRESETS.find((p) => p.key === values.range);
  const to = preset ? today : values.to || today;
  const from = preset ? shiftDays(today, -(preset.days - 1)) : values.from || (parse(to) ? shiftDays(to, -29) : today);
  const granularity: Granularity | undefined = values.g === 'day' || values.g === 'week' ? values.g : undefined;
  return { from, to, granularity };
}

// نفس قواعد السيرفر، عشان ما نبعت طلبات رح تنرفض
export function validateRange(from: string, to: string, today: string, granularity?: Granularity): string | null {
  if (parse(from) === null || parse(to) === null) return 'Enter valid dates.';
  if (from > to) return 'The start date must be on or before the end date.';
  if (to > today) return 'The end date cannot be in the future.';
  const days = daysInRange(from, to);
  if (days > MAX_DAYS) return 'Choose a range of at most 12 months.';
  if (granularity === 'day' && days > MAX_DAILY_DAYS) return 'The daily view supports up to 92 days. Choose weekly.';
  return null;
}

const shortDay = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
const longDay = new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
const withYear = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });

// التاريخ هون تاريخ تقويم (بدون توقيت)، فبننسقه بـ UTC عشان ما ينزاح يوم
export function formatBucket(iso: string, granularity: Granularity, long = false) {
  const date = new Date(`${iso}T00:00:00Z`);
  if (granularity === 'week') return long ? `Week of ${shortDay.format(date)}` : shortDay.format(date);
  return (long ? longDay : shortDay).format(date);
}

export const formatPeriod = (from: string, to: string) =>
  `${shortDay.format(new Date(`${from}T00:00:00Z`))} – ${withYear.format(new Date(`${to}T00:00:00Z`))}`;

export function formatMoneyShort(n: number) {
  if (n >= 10_000) return `$${Math.round(n / 1000)}k`;
  if (n >= 1_000) return `$${(n / 1000).toFixed(1)}k`;
  return `$${Math.round(n)}`;
}

export const exportFilename = (kind: 'orders' | 'customers', from: string, to: string) =>
  kind === 'orders' ? `orders_${from}_to_${to}.csv` : `customers_${to}.csv`;

// حد المخزون: رقم صحيح من 0 لـ 1000، وإلا null
export function parseThresholdInput(text: string): number | null {
  const value = text.trim();
  return /^\d{1,4}$/.test(value) && Number(value) <= 1000 ? Number(value) : null;
}