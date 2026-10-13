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