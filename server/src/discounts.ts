export type DiscountType = 'percent' | 'amount';

export interface DiscountRule {
  code: string;
  type: DiscountType;
  value: number;
  expiresAt: Date | null;
  usageLimit: number | null;
  timesUsed: number;
  active: boolean;
}

export type DiscountCheck =
  | { ok: true; discountCents: number }
  | { ok: false; reason: 'invalid' | 'expired' | 'exhausted'; message: string };

// الفلوس كلها بالسنتات (أرقام صحيحة) عشان ما يصير أخطاء تقريب
export const toCents = (amount: number) => Math.round(amount * 100);
export const fromCents = (cents: number) => cents / 100;

export function normalizeCode(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const code = value.trim().toUpperCase();
  return /^[A-Z0-9_-]{3,32}$/.test(code) ? code : null;
}

// الكود المعطّل أو غير الموجود بياخدوا نفس الرسالة، عشان ما حدا يعرف إذا الكود موجود
export function evaluateDiscount(rule: DiscountRule | undefined, subtotalCents: number, now = new Date()): DiscountCheck {
  if (!rule || !rule.active) return { ok: false, reason: 'invalid', message: 'This code is not valid.' };
  if (rule.expiresAt && rule.expiresAt.getTime() <= now.getTime()) {
    return { ok: false, reason: 'expired', message: 'This code has expired.' };
  }
  if (rule.usageLimit !== null && rule.timesUsed >= rule.usageLimit) {
    return { ok: false, reason: 'exhausted', message: 'This code has reached its usage limit.' };
  }
  const raw = rule.type === 'percent' ? Math.round((subtotalCents * rule.value) / 100) : toCents(rule.value);
  // الخصم ما بيتعدى المجموع الفرعي، فالشحن ما بينخصم منه
  return { ok: true, discountCents: Math.min(raw, subtotalCents) };
}

const twoDecimals = (n: number) => Math.round(n * 100) / 100 === n;

export interface NewDiscount {
  code: string;
  type: DiscountType;
  value: number;
  expiresAt: Date | null;
  usageLimit: number | null;
}

export function parseDiscountInput(body: unknown, now = new Date()): { data: NewDiscount; errors: string[] } {
  const b = (body ?? {}) as Record<string, unknown>;
  const errors: string[] = [];

  const code = normalizeCode(b.code);
  if (!code) errors.push('code must be 3 to 32 letters, digits, - or _');

  const type = b.type;
  if (type !== 'percent' && type !== 'amount') errors.push('type must be percent or amount');

  const value = b.value;
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0 || !twoDecimals(value)) {
    errors.push('value must be greater than 0 with up to 2 decimals');
  } else if (type === 'percent' && value > 100) {
    errors.push('a percent discount cannot be above 100');
  } else if (type === 'amount' && value > 100000) {
    errors.push('an amount discount cannot be above 100000');
  }

  let expiresAt: Date | null = null;
  if (b.expiresAt !== undefined && b.expiresAt !== null) {
    const date = typeof b.expiresAt === 'string' ? new Date(b.expiresAt) : null;
    if (!date || Number.isNaN(date.getTime())) errors.push('expiresAt must be a valid date');
    else if (date.getTime() <= now.getTime()) errors.push('expiresAt must be in the future');
    else expiresAt = date;
  }

  let usageLimit: number | null = null;
  if (b.usageLimit !== undefined && b.usageLimit !== null) {
    const limit = b.usageLimit;
    if (typeof limit !== 'number' || !Number.isInteger(limit) || limit < 1 || limit > 1_000_000) {
      errors.push('usageLimit must be a whole number from 1 to 1000000');
    } else usageLimit = limit;
  }

  return {
    data: { code: code ?? '', type: type as DiscountType, value: value as number, expiresAt, usageLimit },
    errors,
  };
}

export interface DiscountUpdate {
  active?: boolean;
  expiresAt?: Date | null;
  usageLimit?: number | null;
}

// نوع الكود وقيمته ما بيتعدلوا بعد الإنشاء، عشان سجل الطلبات يضل مفهوم
export function parseDiscountUpdate(body: unknown): { data: DiscountUpdate; errors: string[] } {
  const b = (body ?? {}) as Record<string, unknown>;
  const data: DiscountUpdate = {};
  const errors: string[] = [];

  if (b.active !== undefined) {
    if (typeof b.active !== 'boolean') errors.push('active must be true or false');
    else data.active = b.active;
  }
  if (b.expiresAt !== undefined) {
    if (b.expiresAt === null) data.expiresAt = null;
    else {
      const date = typeof b.expiresAt === 'string' ? new Date(b.expiresAt) : null;
      // تاريخ بالماضي مسموح هون: هيك الأدمن بيقدر ينهي الكود فورًا
      if (!date || Number.isNaN(date.getTime())) errors.push('expiresAt must be a valid date or null');
      else data.expiresAt = date;
    }
  }
  if (b.usageLimit !== undefined) {
    if (b.usageLimit === null) data.usageLimit = null;
    else if (typeof b.usageLimit !== 'number' || !Number.isInteger(b.usageLimit) || b.usageLimit < 1 || b.usageLimit > 1_000_000) {
      errors.push('usageLimit must be a whole number from 1 to 1000000, or null');
    } else data.usageLimit = b.usageLimit;
  }
  return { data, errors };
}