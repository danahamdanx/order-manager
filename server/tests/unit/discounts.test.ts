import { describe, expect, it } from 'vitest';
import { evaluateDiscount, normalizeCode, parseDiscountInput, parseDiscountUpdate, toCents } from '../../src/discounts';

const rule = (over = {}) => ({
  code: 'SAVE10',
  type: 'percent' as const,
  value: 10,
  expiresAt: null,
  usageLimit: null,
  timesUsed: 0,
  active: true,
  ...over,
});
const now = new Date('2026-10-20T12:00:00Z');

describe('money in cents', () => {
  it('avoids floating point errors', () => {
    expect(toCents(19.99)).toBe(1999);
    expect(toCents(0.1 + 0.2)).toBe(30);
  });
});

describe('normalizeCode', () => {
  it('trims and uppercases', () => {
    expect(normalizeCode('  save10 ')).toBe('SAVE10');
  });
  it('rejects bad values', () => {
    for (const bad of ['ab', 'has space', 'x'.repeat(33), '', 123, null, undefined]) {
      expect(normalizeCode(bad), String(bad)).toBeNull();
    }
  });
});

describe('evaluateDiscount', () => {
  it('applies a percent discount with rounding', () => {
    expect(evaluateDiscount(rule(), 5000, now)).toEqual({ ok: true, discountCents: 500 });
    expect(evaluateDiscount(rule({ value: 12.5 }), 999, now)).toEqual({ ok: true, discountCents: 125 });
  });

  it('applies a fixed amount but never more than the subtotal', () => {
    expect(evaluateDiscount(rule({ type: 'amount', value: 5 }), 4000, now)).toEqual({ ok: true, discountCents: 500 });
    expect(evaluateDiscount(rule({ type: 'amount', value: 50 }), 2000, now)).toEqual({ ok: true, discountCents: 2000 });
  });

  it('rejects unknown and disabled codes with the same message', () => {
    const missing = evaluateDiscount(undefined, 1000, now);
    const disabled = evaluateDiscount(rule({ active: false }), 1000, now);
    expect(missing).toMatchObject({ ok: false, reason: 'invalid', message: 'This code is not valid.' });
    expect(disabled).toEqual(missing);
  });

  it('rejects expired codes, including the exact expiry moment', () => {
    expect(evaluateDiscount(rule({ expiresAt: new Date('2026-10-19T00:00:00Z') }), 1000, now)).toMatchObject({ reason: 'expired' });
    expect(evaluateDiscount(rule({ expiresAt: now }), 1000, now)).toMatchObject({ reason: 'expired' });
    expect(evaluateDiscount(rule({ expiresAt: new Date('2026-10-21T00:00:00Z') }), 1000, now).ok).toBe(true);
  });

  it('rejects exhausted codes', () => {
    expect(evaluateDiscount(rule({ usageLimit: 3, timesUsed: 3 }), 1000, now)).toMatchObject({ reason: 'exhausted' });
    expect(evaluateDiscount(rule({ usageLimit: 3, timesUsed: 2 }), 1000, now).ok).toBe(true);
  });
});

describe('parseDiscountInput', () => {
  const valid = { code: 'welcome10', type: 'percent', value: 10 };

  it('accepts a valid code and normalizes it', () => {
    const { data, errors } = parseDiscountInput({ ...valid, usageLimit: 50 }, now);
    expect(errors).toEqual([]);
    expect(data).toMatchObject({ code: 'WELCOME10', type: 'percent', value: 10, usageLimit: 50, expiresAt: null });
  });

  it('rejects invalid definitions', () => {
    const bad = [
      { ...valid, value: 150 },
      { ...valid, value: 0 },
      { ...valid, value: 1.234 },
      { ...valid, type: 'amount', value: -5 },
      { ...valid, type: 'free' },
      { ...valid, code: 'a' },
      { ...valid, expiresAt: '2020-01-01T00:00:00Z' },
      { ...valid, expiresAt: 'not a date' },
      { ...valid, usageLimit: 0 },
      { ...valid, usageLimit: 2.5 },
    ];
    for (const body of bad) {
      expect(parseDiscountInput(body, now).errors.length, JSON.stringify(body)).toBeGreaterThan(0);
    }
  });
});

describe('parseDiscountUpdate', () => {
  it('allows disabling, clearing limits and expiring now', () => {
    expect(parseDiscountUpdate({ active: false }).data).toEqual({ active: false });
    expect(parseDiscountUpdate({ usageLimit: null, expiresAt: null }).data).toEqual({ usageLimit: null, expiresAt: null });
    expect(parseDiscountUpdate({ expiresAt: '2020-01-01T00:00:00Z' }).errors).toEqual([]);
  });

  it('rejects bad values and ignores fields that cannot change', () => {
    expect(parseDiscountUpdate({ active: 'yes' }).errors.length).toBe(1);
    expect(parseDiscountUpdate({ usageLimit: 0 }).errors.length).toBe(1);
    expect(parseDiscountUpdate({ value: 99, type: 'amount' }).data).toEqual({});
  });
});