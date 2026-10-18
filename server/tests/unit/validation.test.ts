import { describe, expect, it } from 'vitest';
import { isValidEmail, parseOrderItems, parsePaging, parseProductInput, sniffImageType, parsePaymentInput } from '../../src/validation';

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

describe('parseProductInput', () => {
  const valid = { name: ' Desk Lamp ', category: 'Lighting', price: 24.5, stock: 10 };

  it('accepts a valid new product and trims text', () => {
    const { data, errors } = parseProductInput(valid, true);
    expect(errors).toEqual([]);
    expect(data.name).toBe('Desk Lamp');
  });

  it('requires the main fields when creating', () => {
    expect(parseProductInput({}, true).errors.length).toBe(4);
  });

  it('allows partial updates', () => {
    const { data, errors } = parseProductInput({ stock: 3 }, false);
    expect(errors).toEqual([]);
    expect(data).toEqual({ stock: 3 });
  });

  it('rejects bad prices, stock, colors, icons and flags', () => {
    const bad = [
      { price: 0 },
      { price: -1 },
      { price: 1.234 },
      { price: '5' },
      { stock: 1.5 },
      { stock: -1 },
      { color: 'red' },
      { icon: 'Bad Icon!' },
      { active: 'yes' },
    ];
    for (const body of bad) {
      expect(parseProductInput(body, false).errors.length, JSON.stringify(body)).toBe(1);
    }
  });
});

describe('sniffImageType', () => {
  const pad = (bytes: number[]) => Buffer.concat([Buffer.from(bytes), Buffer.alloc(32)]);

  it('recognizes JPEG, PNG and WebP by their first bytes', () => {
    expect(sniffImageType(pad([0xff, 0xd8, 0xff, 0xe0]))).toBe('image/jpeg');
    expect(sniffImageType(pad([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe('image/png');
    const webp = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBP'), Buffer.alloc(8)]);
    expect(sniffImageType(webp)).toBe('image/webp');
  });

  it('rejects SVG, text and tiny buffers', () => {
    expect(sniffImageType(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>'))).toBeNull();
    expect(sniffImageType(Buffer.from('hello'))).toBeNull();
  });
});

describe('parsePaging', () => {
  it('uses defaults when nothing is sent', () => {
    expect(parsePaging({})).toEqual({ limit: 10, page: 1 });
    expect(parsePaging({}, 12)).toEqual({ limit: 12, page: 1 });
  });

  it('reads valid numbers', () => {
    expect(parsePaging({ page: '3', limit: '20' })).toEqual({ limit: 20, page: 3 });
  });

  it('caps the limit', () => {
    expect(parsePaging({ limit: '1000' }).limit).toBe(50);
  });

  it('falls back on anything that is not a positive whole number', () => {
    for (const bad of ['abc', '-1', '0', '1.5', '', ' 2', '99999999999999999999', ['1', '2']]) {
      expect(parsePaging({ page: bad, limit: bad }), String(bad)).toEqual({ limit: 10, page: 1 });
    }
  });
});

describe('parsePaymentInput', () => {
  it('accepts a brand and the last four digits', () => {
    const { data, errors } = parsePaymentInput({ cardBrand: 'visa', cardLast4: '4242' });
    expect(errors).toEqual([]);
    expect(data).toEqual({ cardBrand: 'visa', cardLast4: '4242' });
  });

  it('rejects a full card number, unknown brands and non-strings', () => {
    const bad = [
      {},
      { cardBrand: 'visa', cardLast4: '4242424242424242' },
      { cardBrand: 'visa', cardLast4: '42' },
      { cardBrand: 'visa', cardLast4: 4242 },
      { cardBrand: 'bitcoin', cardLast4: '4242' },
    ];
    for (const body of bad) {
      expect(parsePaymentInput(body).errors.length, JSON.stringify(body)).toBeGreaterThan(0);
    }
  });
});