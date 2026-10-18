import { describe, expect, it } from 'vitest';
import { detectBrand, formatCardNumber, formatExpiry, luhnValid, validateCard } from './card';

const valid = { number: '4242 4242 4242 4242', expiry: '12/30', cvc: '123', name: 'Dana Hamdan' };
const now = new Date(2026, 9, 15); // October 2026

describe('luhnValid', () => {
  it('accepts valid numbers and rejects typos', () => {
    expect(luhnValid('4242424242424242')).toBe(true);
    expect(luhnValid('4242424242424241')).toBe(false);
    expect(luhnValid('')).toBe(false);
    expect(luhnValid('abcd')).toBe(false);
  });
});

describe('detectBrand', () => {
  it('detects common brands', () => {
    expect(detectBrand('4242')).toBe('visa');
    expect(detectBrand('5555')).toBe('mastercard');
    expect(detectBrand('2221')).toBe('mastercard');
    expect(detectBrand('2720')).toBe('mastercard');
    expect(detectBrand('2721')).toBe('other');
    expect(detectBrand('378282246310005')).toBe('amex');
    expect(detectBrand('6011111111111117')).toBe('discover');
  });
});

describe('formatters', () => {
  it('groups card numbers', () => {
    expect(formatCardNumber('4242424242424242')).toBe('4242 4242 4242 4242');
    expect(formatCardNumber('378282246310005')).toBe('3782 822463 10005');
    expect(formatCardNumber('42ab42')).toBe('4242');
  });

  it('formats the expiry date', () => {
    expect(formatExpiry('1')).toBe('1');
    expect(formatExpiry('12')).toBe('12');
    expect(formatExpiry('1226')).toBe('12/26');
  });
});

describe('validateCard', () => {
  it('accepts a valid card', () => {
    expect(validateCard(valid, now)).toEqual({});
  });

  it('accepts the current month and rejects past months', () => {
    expect(validateCard({ ...valid, expiry: '10/26' }, now).expiry).toBeUndefined();
    expect(validateCard({ ...valid, expiry: '09/26' }, now).expiry).toMatch(/expired/);
    expect(validateCard({ ...valid, expiry: '12/25' }, now).expiry).toMatch(/expired/);
  });

  it('rejects bad months and formats', () => {
    expect(validateCard({ ...valid, expiry: '13/30' }, now).expiry).toBeDefined();
    expect(validateCard({ ...valid, expiry: '1/3' }, now).expiry).toBeDefined();
  });

  it('rejects wrong numbers, names and codes', () => {
    expect(validateCard({ ...valid, number: '4242 4242 4242 4241' }, now).number).toBeDefined();
    expect(validateCard({ ...valid, number: '' }, now).number).toBeDefined();
    expect(validateCard({ ...valid, name: '  ' }, now).name).toBeDefined();
    expect(validateCard({ ...valid, cvc: '12' }, now).cvc).toBeDefined();
  });

  it('needs a 4-digit code for American Express', () => {
    const amex = { ...valid, number: '3782 822463 10005' };
    expect(validateCard({ ...amex, cvc: '123' }, now).cvc).toBeDefined();
    expect(validateCard({ ...amex, cvc: '1234' }, now)).toEqual({});
  });
});