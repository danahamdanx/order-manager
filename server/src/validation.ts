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