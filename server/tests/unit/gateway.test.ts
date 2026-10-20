import { describe, expect, it } from 'vitest';
import { evaluateCard, luhnValid, validateCardInput } from '../../src/gateway/mock';
import { createClientSecret, readClientSecret, signWebhook, verifyWebhook } from '../../src/gateway/signing';

const secret = 'unit-test-secret';
const body = JSON.stringify({ hello: 'world' });
const now = 1_800_000_000;

describe('webhook signatures', () => {
  it('accepts a valid signature', () => {
    expect(verifyWebhook(secret, body, signWebhook(secret, body, now), now)).toBe(true);
  });

  it('rejects tampered bodies, wrong secrets and missing headers', () => {
    const header = signWebhook(secret, body, now);
    expect(verifyWebhook(secret, body.replace('world', 'WORLD'), header, now)).toBe(false);
    expect(verifyWebhook('other-secret', body, header, now)).toBe(false);
    expect(verifyWebhook(secret, body, undefined, now)).toBe(false);
  });

  it('rejects old timestamps but tolerates small clock differences', () => {
    expect(verifyWebhook(secret, body, signWebhook(secret, body, now - 301), now)).toBe(false);
    expect(verifyWebhook(secret, body, signWebhook(secret, body, now - 60), now)).toBe(true);
  });

  it('rejects malformed headers', () => {
    for (const header of ['', 'garbage', 't=abc,v1=xyz', `t=${now}`]) {
      expect(verifyWebhook(secret, body, header, now), header).toBe(false);
    }
  });
});

describe('client secrets', () => {
  it('round-trips the reference and the amount', () => {
    const value = createClientSecret(secret, { ref: 'pi_123', amount: 25 });
    expect(readClientSecret(secret, value)).toEqual({ ref: 'pi_123', amount: 25 });
  });

  it('rejects tampered, foreign, expired and malformed values', () => {
    const value = createClientSecret(secret, { ref: 'pi_123', amount: 25 });
    const [payload, signature] = value.split('.');
    const forged = Buffer.from(JSON.stringify({ ref: 'pi_123', amount: 1, exp: 9_999_999_999 })).toString('base64url');

    expect(readClientSecret(secret, `${forged}.${signature}`)).toBeNull();
    expect(readClientSecret('other-secret', value)).toBeNull();
    expect(readClientSecret(secret, createClientSecret(secret, { ref: 'pi_1', amount: 1 }, -10))).toBeNull();
    expect(readClientSecret(secret, payload)).toBeNull();
    expect(readClientSecret(secret, 'a.b.c')).toBeNull();
    expect(readClientSecret(secret, 42)).toBeNull();
  });
});

describe('test cards', () => {
  it('approves the success cards', () => {
    expect(evaluateCard('4242424242424242')).toMatchObject({ status: 'succeeded', brand: 'visa', last4: '4242' });
    expect(evaluateCard('378282246310005')).toMatchObject({ status: 'succeeded', brand: 'amex' });
  });

  it('fails the failure cards with the matching reason', () => {
    expect(evaluateCard('4000000000000002').reason).toBe('card_declined');
    expect(evaluateCard('4000000000009995').reason).toBe('insufficient_funds');
    expect(evaluateCard('4000000000000127').reason).toBe('incorrect_cvc');
    expect(evaluateCard('4000000000000119').reason).toBe('processing_error');
  });

  it('rejects other numbers without keeping any digits', () => {
    expect(evaluateCard('4111111111111111')).toEqual({ status: 'failed', reason: 'not_a_test_card', brand: 'other', last4: null });
  });
});

describe('card input validation', () => {
  const at = new Date(2026, 9, 15);
  const card = { number: '4242 4242 4242 4242', expiry: '12/30', cvc: '123' };

  it('accepts a well-formed card', () => {
    expect(validateCardInput(card, at)).toBeNull();
    expect(luhnValid('4242424242424242')).toBe(true);
  });

  it('reports the first problem', () => {
    expect(validateCardInput({ ...card, number: '4242 4242 4242 4241' }, at)?.code).toBe('incorrect_number');
    expect(validateCardInput({ ...card, expiry: '09/26' }, at)?.code).toBe('expired_card');
    expect(validateCardInput({ ...card, expiry: '13/30' }, at)?.code).toBe('invalid_expiry');
    expect(validateCardInput({ ...card, cvc: '12' }, at)?.code).toBe('invalid_cvc');
    expect(validateCardInput(undefined, at)?.code).toBe('incorrect_number');
  });
});