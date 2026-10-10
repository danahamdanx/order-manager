import { describe, expect, it } from 'vitest';
import { isValidEmail, parseOrderItems } from '../../src/validation';

describe('isValidEmail', () => {
  it('accepts normal addresses', () => {
    expect(isValidEmail('lina@example.com')).toBe(true);
  });
  it('rejects malformed values', () => {
    expect(isValidEmail('lina@')).toBe(false);
    expect(isValidEmail('no spaces@example.com')).toBe(false);
    expect(isValidEmail(42)).toBe(false);
  });
});

describe('parseOrderItems', () => {
  it('merges duplicate products', () => {
    const { merged, error } = parseOrderItems([
      { productId: 1, quantity: 2 },
      { productId: 1, quantity: 3 },
      { productId: 2, quantity: 1 },
    ]);
    expect(error).toBeUndefined();
    expect(merged.get(1)).toBe(5);
    expect(merged.get(2)).toBe(1);
  });

  it('rejects an empty or non-array list', () => {
    expect(parseOrderItems([]).error).toBeDefined();
    expect(parseOrderItems('x').error).toBeDefined();
  });

  it('rejects invalid quantities and ids', () => {
    expect(parseOrderItems([{ productId: 1, quantity: 0 }]).error).toBeDefined();
    expect(parseOrderItems([{ productId: 1, quantity: 21 }]).error).toBeDefined();
    expect(parseOrderItems([{ productId: 1, quantity: 1.5 }]).error).toBeDefined();
    expect(parseOrderItems([{ quantity: 1 }]).error).toBeDefined();
    expect(parseOrderItems([{ productId: 99999999999, quantity: 1 }]).error).toBeDefined();
  });
});