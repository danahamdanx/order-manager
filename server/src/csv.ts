export const MAX_EXPORT_ROWS = 50_000;

// نص بيبدأ بهالحروف بيتعامل كصيغة بالـ Excel وGoogle Sheets
const FORMULA_START = /^[=+\-@\t\r]/;

export function escapeCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '';
  if (typeof value === 'boolean') return value ? 'true' : 'false';

  let text = value instanceof Date ? value.toISOString() : String(value);
  // حماية من حقن الصيغ: بنحط ' قبل النص. الأرقام (الرقمية فعلًا) ما بتنلمس
  if (FORMULA_START.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) || text !== text.trim() ? `"${text.replace(/"/g, '""')}"` : text;
}

// RFC 4180: الأسطر بـ CRLF، وآخر سطر كمان بيخلص بـ CRLF
export function toCsv(headers: readonly string[], rows: readonly (readonly unknown[])[]): string {
  return [headers, ...rows].map((row) => row.map(escapeCell).join(',')).join('\r\n') + '\r\n';
}

export function capRows<T>(rows: T[], max = MAX_EXPORT_ROWS): { rows: T[]; truncated: boolean } {
  return rows.length > max ? { rows: rows.slice(0, max), truncated: true } : { rows, truncated: false };
}