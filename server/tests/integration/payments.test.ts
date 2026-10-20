import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import app from '../../src/app';
import { pool } from '../../src/db';
import { signWebhook } from '../../src/gateway/signing';
import { auth, confirm, login, payOrder, startPayment } from '../helpers';

const secret = process.env.GATEWAY_SECRET!;

let admin: string;
let customer: string;
let other: string;
let productId: number;

beforeAll(async () => {
  admin = await login('admin@example.com', 'Admin123!');
  customer = await login('lina@example.com', 'Customer123!');
  const reg = await request(app)
    .post('/api/auth/register')
    .send({ name: 'Other Payer', email: 'other-payer@test.com', password: 'password123' });
  other = reg.body.token as string;

  const product = await request(app)
    .post('/api/products')
    .set(auth(admin))
    .send({ name: 'Payment Test Item', category: 'PayTests', price: 20, stock: 1000 });
  productId = product.body.id;
});

afterAll(async () => {
  await pool.end();
});

const placeOrder = async () =>
  (
    await request(app)
      .post('/api/orders')
      .set(auth(customer))
      .send({ address: 'Nablus, Rafidia St', items: [{ productId, quantity: 1 }] })
  ).body;
const getOrder = async (id: number) => (await request(app).get(`/api/orders/${id}`).set(auth(admin))).body;
const getPayment = (id: number, token = customer) => request(app).get(`/api/payments/${id}`).set(auth(token));
const setStatus = (id: number, status: string) =>
  request(app).patch(`/api/orders/${id}/status`).set(auth(admin)).send({ status });
const count = async (orderId: number, status?: string) =>
  (
    await pool.query<{ c: number }>(
      `SELECT COUNT(*)::int AS c FROM payments WHERE order_id = $1 AND ($2::text IS NULL OR status = $2)`,
      [orderId, status ?? null],
    )
  ).rows[0]!.c;

const refOf = async (paymentId: number) => {
  const { rows } = await pool.query<{ gateway_ref: string }>(
    'SELECT gateway_ref FROM payments WHERE id = $1',
    [paymentId],
  );
  if (!rows[0]) throw new Error(`payment ${paymentId} not found`);
  return rows[0].gateway_ref;
};

const postWebhook = (rawBody: string, signature?: string) => {
  const req = request(app).post('/api/webhooks/gateway').set('Content-Type', 'application/json');
  if (signature) req.set('X-Gateway-Signature', signature);
  return req.send(rawBody);
};
const eventFor = (ref: string, over: object = {}) =>
  JSON.stringify({
    id: 'evt_test',
    type: 'payment.succeeded',
    created: Math.floor(Date.now() / 1000),
    data: { ref, amount: 25, cardBrand: 'visa', cardLast4: '4242', failureReason: null, ...over },
  });

describe('creating a payment', () => {
  it('opens a payment with the amount from the database and a client secret', async () => {
    const order = await placeOrder();
    const res = await startPayment(customer, order.id);
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('requires_payment');
    expect(res.body.amount).toBe(25);
    expect(typeof res.body.clientSecret).toBe('string');
    expect(res.body.gatewayRef).toBeUndefined();
  });

  it('requires a valid idempotency key and order id', async () => {
    const order = await placeOrder();
    const noKey = await request(app).post('/api/payments').set(auth(customer)).send({ orderId: order.id });
    expect(noKey.status).toBe(400);
    expect((await startPayment(customer, order.id, 'short')).status).toBe(400);
    expect((await startPayment(customer, 'abc')).status).toBe(400);
  });

  it('only lets the owner pay', async () => {
    const order = await placeOrder();
    expect((await startPayment(other, order.id)).status).toBe(404);
    expect((await startPayment(admin, order.id)).status).toBe(403);
    expect((await request(app).post('/api/payments').send({ orderId: order.id })).status).toBe(401);
  });
});

describe('idempotency', () => {
  it('returns the same payment for the same key', async () => {
    const order = await placeOrder();
    const key = randomUUID();
    const first = await startPayment(customer, order.id, key);
    const second = await startPayment(customer, order.id, key);
    expect(first.status).toBe(201);
    expect(second.status).toBe(200);
    expect(second.body.id).toBe(first.body.id);
    expect(await count(order.id)).toBe(1);
  });

  it('keeps a single open payment even for concurrent attempts with different keys', async () => {
    const order = await placeOrder();
    const results = await Promise.all([1, 2, 3, 4].map(() => startPayment(customer, order.id)));
    const ids = new Set(results.map((r) => r.body.id));
    expect(ids.size).toBe(1);
    expect(await count(order.id, 'requires_payment')).toBe(1);
  });
});

describe('gateway results', () => {
  it('marks the order paid after an approved card and lets staff process it', async () => {
    const order = await placeOrder();
    const { payment } = await payOrder(customer, order.id);
    expect(payment.status).toBe('succeeded');
    expect(payment.cardBrand).toBe('visa');
    expect(payment.cardLast4).toBe('4242');

    expect((await getOrder(order.id)).paymentStatus).toBe('paid');
    expect((await setStatus(order.id, 'processing')).status).toBe(200);
  });

  it('keeps the order unpaid after a decline, then allows a retry', async () => {
    const order = await placeOrder();
    const failed = await payOrder(customer, order.id, '4000000000000002');
    expect(failed.payment.status).toBe('failed');
    expect(failed.payment.failureReason).toBe('card_declined');

    const afterFailure = await getOrder(order.id);
    expect(afterFailure.paymentStatus).toBe('failed');
    expect(afterFailure.paymentFailure).toBe('card_declined');
    expect((await setStatus(order.id, 'processing')).status).toBe(409);

    const retry = await payOrder(customer, order.id);
    expect(retry.payment.id).not.toBe(failed.payment.id);
    expect(retry.payment.status).toBe('succeeded');
    expect((await getOrder(order.id)).paymentStatus).toBe('paid');
    expect(await count(order.id, 'succeeded')).toBe(1);
    expect(await count(order.id)).toBe(2);
  });

  it('reports the reason for each failure card', async () => {
    const cases: [string, string][] = [
      ['4000000000009995', 'insufficient_funds'],
      ['4000000000000127', 'incorrect_cvc'],
      ['4000000000000119', 'processing_error'],
    ];
    for (const [number, reason] of cases) {
      const order = await placeOrder();
      const { payment } = await payOrder(customer, order.id, number);
      expect(payment.failureReason, number).toBe(reason);
    }
  });

  it('rejects numbers that are not test cards and keeps no digits', async () => {
    const order = await placeOrder();
    const { payment } = await payOrder(customer, order.id, '4111111111111111');
    expect(payment.status).toBe('failed');
    expect(payment.failureReason).toBe('not_a_test_card');
    expect(payment.cardLast4).toBeNull();
  });

  it('does not fail the payment for input errors', async () => {
    const order = await placeOrder();
    const started = await startPayment(customer, order.id);
    const secretValue = started.body.clientSecret;

    const badNumber = await confirm(secretValue, '4242424242424241');
    expect(badNumber.status).toBe(422);
    expect(badNumber.body.error).toBe('incorrect_number');
    expect((await confirm(secretValue, '4242424242424242', '01/20')).body.error).toBe('expired_card');
    expect((await confirm(secretValue, '4242424242424242', undefined, '12')).body.error).toBe('invalid_cvc');

    expect((await getPayment(started.body.id)).body.status).toBe('requires_payment');
  });

  it('rejects invalid or tampered client secrets', async () => {
    const order = await placeOrder();
    const started = await startPayment(customer, order.id);
    const tampered = started.body.clientSecret.replace(/.$/, (c: string) => (c === 'a' ? 'b' : 'a'));
    expect((await confirm(tampered)).status).toBe(400);
    expect((await confirm('nonsense')).status).toBe(400);
  });

  it('does not charge twice when the same session is confirmed again', async () => {
    const order = await placeOrder();
    const started = await startPayment(customer, order.id);
    expect((await confirm(started.body.clientSecret)).status).toBe(200);
    expect((await confirm(started.body.clientSecret)).status).toBe(200);

    expect(await count(order.id, 'succeeded')).toBe(1);
    expect((await startPayment(customer, order.id)).status).toBe(409);
  });
});

describe('webhook security', () => {
  it('rejects missing, wrong, stale and tampered signatures', async () => {
    const order = await placeOrder();
    const started = await startPayment(customer, order.id);
    const body = eventFor(await refOf(started.body.id));
    const now = Math.floor(Date.now() / 1000);

    expect((await postWebhook(body)).status).toBe(400);
    expect((await postWebhook(body, signWebhook('wrong-secret', body))).status).toBe(400);
    expect((await postWebhook(body, signWebhook(secret, body, now - 3600))).status).toBe(400);
    expect((await postWebhook(body.replace('"amount":25', '"amount":1'), signWebhook(secret, body))).status).toBe(400);

    expect((await getPayment(started.body.id)).body.status).toBe('requires_payment');
  });

  it('ignores events for unknown payments', async () => {
    const body = eventFor('pi_unknown');
    const res = await postWebhook(body, signWebhook(secret, body));
    expect(res.status).toBe(200);
    expect(res.body.note).toBe('unknown payment');
  });

  it('fails a payment when the confirmed amount does not match', async () => {
    const order = await placeOrder();
    const started = await startPayment(customer, order.id);
    const body = eventFor(await refOf(started.body.id), { amount: 1 });

    expect((await postWebhook(body, signWebhook(secret, body))).status).toBe(200);
    const payment = (await getPayment(started.body.id)).body;
    expect(payment.status).toBe('failed');
    expect(payment.failureReason).toBe('amount_mismatch');
    expect((await getOrder(order.id)).paymentStatus).toBe('failed');
  });

  it('ignores a duplicate delivery of the same event', async () => {
    const order = await placeOrder();
    const { payment } = await payOrder(customer, order.id);
    const body = eventFor(await refOf(payment.id));

    const res = await postWebhook(body, signWebhook(secret, body));
    expect(res.status).toBe(200);
    expect(res.body.note).toBe('already processed');
    expect(await count(order.id, 'succeeded')).toBe(1);
  });
});

describe('payments and order changes', () => {
  it('closes the open payment when the order is cancelled', async () => {
    const order = await placeOrder();
    const started = await startPayment(customer, order.id);
    await request(app).post(`/api/orders/${order.id}/cancel`).set(auth(customer));

    const payment = (await getPayment(started.body.id)).body;
    expect(payment.status).toBe('failed');
    expect(payment.failureReason).toBe('order_cancelled');
    expect((await startPayment(customer, order.id)).status).toBe(409);

    // تأكيد متأخر من المتصفح ما بيرجّع الطلب للحياة
    expect((await confirm(started.body.clientSecret)).status).toBe(200);
    expect((await getOrder(order.id)).paymentStatus).toBe('unpaid');
  });

  it('refunds a paid order that is cancelled', async () => {
    const order = await placeOrder();
    const { payment } = await payOrder(customer, order.id);
    const cancelled = await request(app).post(`/api/orders/${order.id}/cancel`).set(auth(customer));
    expect(cancelled.status).toBe(200);
    expect(cancelled.body.paymentStatus).toBe('refunded');
    expect((await getPayment(payment.id)).body.status).toBe('refunded');
  });

  it('counts only paid orders as revenue', async () => {
    const revenue = async () => (await request(app).get('/api/stats').set(auth(admin))).body.revenue as number;
    const start = await revenue();
    const order = await placeOrder();
    expect(await revenue()).toBeCloseTo(start, 2);

    await payOrder(customer, order.id);
    expect(await revenue()).toBeCloseTo(start + 25, 2);
  });

  it('shows a payment to its owner and to staff only', async () => {
    const order = await placeOrder();
    const started = await startPayment(customer, order.id);
    expect((await getPayment(started.body.id, other)).status).toBe(404);

    const asStaff = await getPayment(started.body.id, admin);
    expect(asStaff.status).toBe(200);
    expect(asStaff.body.clientSecret).toBeUndefined();
    expect((await getPayment(started.body.id)).body.clientSecret).toBeDefined();
  });
});