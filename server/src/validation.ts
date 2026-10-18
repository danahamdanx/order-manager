export const isValidEmail = (value: unknown): value is string =>
  typeof value === 'string' && /^\S+@\S+\.\S+$/.test(value);

export function parseOrderItems(items: unknown): { merged: Map<number, number>; error?: string } {
  const merged = new Map<number, number>();
  if (!Array.isArray(items) || items.length === 0) {
    return { merged, error: 'items must be a non-empty array' };
  }
  for (const it of items) {
    const { productId, quantity } = (it ?? {}) as { productId?: unknown; quantity?: unknown };
    if (
      !Number.isInteger(productId) ||
      (productId as number) < 1 ||
      (productId as number) > 2147483647 ||
      !Number.isInteger(quantity) ||
      (quantity as number) < 1 ||
      (quantity as number) > 20
    ) {
      return { merged, error: 'each item needs an integer productId and a quantity between 1 and 20' };
    }
    merged.set(productId as number, (merged.get(productId as number) ?? 0) + (quantity as number));
  }
  return { merged };
}

export const PRODUCT_COLORS = ['purple', 'blue', 'amber', 'teal', 'coral', 'pink'] as const;

export interface ProductInput {
  name?: string;
  description?: string;
  category?: string;
  price?: number;
  stock?: number;
  icon?: string;
  color?: string;
  active?: boolean;
}

export function parseProductInput(body: unknown, requireAll: boolean): { data: ProductInput; errors: string[] } {
  const b = (body ?? {}) as Record<string, unknown>;
  const data: ProductInput = {};
  const errors: string[] = [];
  const has = (key: string) => b[key] !== undefined;

  if (requireAll || has('name')) {
    const v = b.name;
    if (typeof v !== 'string' || !v.trim() || v.trim().length > 120) {
      errors.push('name is required (up to 120 characters)');
    } else data.name = v.trim();
  }
  if (requireAll || has('category')) {
    const v = b.category;
    if (typeof v !== 'string' || !v.trim() || v.trim().length > 60) {
      errors.push('category is required (up to 60 characters)');
    } else data.category = v.trim();
  }
  if (has('description')) {
    const v = b.description;
    if (typeof v !== 'string' || v.length > 1000) {
      errors.push('description must be text of up to 1000 characters');
    } else data.description = v.trim();
  }
  if (requireAll || has('price')) {
    const v = b.price;
    if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0 || v > 100000 || Math.round(v * 100) / 100 !== v) {
      errors.push('price must be greater than 0, at most 100000, with up to 2 decimals');
    } else data.price = v;
  }
  if (requireAll || has('stock')) {
    const v = b.stock;
    if (typeof v !== 'number' || !Number.isInteger(v) || v < 0 || v > 100000) {
      errors.push('stock must be a whole number between 0 and 100000');
    } else data.stock = v;
  }
  if (has('icon')) {
    const v = b.icon;
    if (typeof v !== 'string' || !/^[a-z0-9-]{1,40}$/.test(v)) errors.push('icon is invalid');
    else data.icon = v;
  }
  if (has('color')) {
    const v = b.color;
    if (typeof v !== 'string' || !(PRODUCT_COLORS as readonly string[]).includes(v)) {
      errors.push(`color must be one of: ${PRODUCT_COLORS.join(', ')}`);
    } else data.color = v;
  }
  if (has('active')) {
    if (typeof b.active !== 'boolean') errors.push('active must be true or false');
    else data.active = b.active;
  }

  return { data, errors };
}

// بنتعرف على نوع الملف من أول بايتات فيه، مش من الامتداد أو الـ header
export function sniffImageType(buf: Buffer): 'image/jpeg' | 'image/png' | 'image/webp' | null {
  if (buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  return null;
}

// بنقرأ page و limit بحذر: أي قيمة مش رقم صحيح موجب بنرجع للافتراضي، والـ limit له حد أعلى
export function parsePaging(query: Record<string, unknown>, defaultLimit = 10, maxLimit = 50) {
  const toInt = (value: unknown, fallback: number) => {
    const n = typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : NaN;
    return Number.isSafeInteger(n) && n > 0 ? n : fallback;
  };
  return { limit: Math.min(toInt(query.limit, defaultLimit), maxLimit), page: toInt(query.page, 1) };
}

export const CARD_BRANDS = ['visa', 'mastercard', 'amex', 'discover', 'other'] as const;

// السيرفر ما بيستقبل رقم البطاقة كامل أبدًا: بس نوعها وآخر 4 أرقام
export function parsePaymentInput(body: unknown): { data: { cardBrand: string; cardLast4: string }; errors: string[] } {
  const b = (body ?? {}) as Record<string, unknown>;
  const errors: string[] = [];

  if (typeof b.cardBrand !== 'string' || !(CARD_BRANDS as readonly string[]).includes(b.cardBrand)) {
    errors.push(`cardBrand must be one of: ${CARD_BRANDS.join(', ')}`);
  }
  if (typeof b.cardLast4 !== 'string' || !/^\d{4}$/.test(b.cardLast4)) {
    errors.push('cardLast4 must be exactly 4 digits');
  }
  return { data: { cardBrand: String(b.cardBrand), cardLast4: String(b.cardLast4) }, errors };
}