import { randomBytes } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import app from '../../src/app';
import { pool } from '../../src/db';
import { auth, login, payOrder, startPayment } from '../helpers';

let admin: string;
let staff: string;
let customer: string;
let productId: number;

const uid = () => randomBytes(4).toString('hex').toUpperCase();

beforeAll(async () => {
  admin = await login('admin@example.com', 'Admin123!');
  customer = await login('lina@example.com', 'Customer123!');
  await request(app)
    .post('/api/staff')
    .set(auth(admin))
    .send({ name: 'Dee', email: 'disc-staff@test.com', password: 'password123' });
  staff = await login('disc-staff@test.com', 'password123');

  const product = await request(app)
    .post('/api/products')
    .set(auth(admin))
    .send({ name: 'Discount Test Item', category: 'DiscountTests', price: 20, stock: 1000 });
  productId = product.body.id;
});

afterAll(async () => {
  await pool.end();
});

const items = (quantity = 2) => [{ productId, quantity }];
const createCode = (over: object = {}) =>
  request(app).post('/api/discounts').set(auth(admin)).send({ code: `T${uid()}`, type: 'percent', value: 10, ...over });
const patchCode = (id: number, body: object) =>
  request(app).patch(`/api/discounts/${id}`).set(auth(admin)).send(body);
const quote = (code?: string, quantity = 2) =>
  request(app).post('/api/orders/quote').set(auth(customer)).send({ items: items(quantity), code });
const placeOrder = (code?: string, extra: object = {}) =>
  request(app)
    .post('/api/orders')
    .set(auth(customer))
    .send({ address: 'Nablus, Rafidia St', items: items(), code, ...extra });
const stockOf = async () => (await request(app).get(`/api/products/${productId}`)).body.stock as number;
const usedCount = async (id: number) => {
  const res = await request(app).get('/api/admin/discounts?limit=50').set(auth(admin));
  return res.body.items.find((d: { id: number }) => d.id === id).timesUsed as number;
};

describe('managing codes', () => {
  it('only lets admins create codes', async () => {
    const body = { code: `NOPE${uid()}`, type: 'percent', value: 10 };
    expect((await request(app).post('/api/discounts').set(auth(customer)).send(body)).status).toBe(403);
    expect((await request(app).post('/api/discounts').set(auth(staff)).send(body)).status).toBe(403);
    expect((await request(app).get('/api/admin/discounts').set(auth(staff))).status).toBe(200);
    expect((await request(app).get('/api/admin/discounts').set(auth(customer))).status).toBe(403);
  });

  it('stores codes in uppercase and rejects duplicates in any letter case', async () => {
    const name = `lower-${uid().toLowerCase()}`;
    const first = await createCode({ code: name });
    expect(first.status).toBe(201);
    expect(first.body.code).toBe(name.toUpperCase());
    expect(first.body.status).toBe('active');
    expect((await createCode({ code: name.toUpperCase() })).status).toBe(409);
  });

  it('rejects invalid definitions', async () => {
    const base = { code: `GOOD${uid()}`, type: 'percent', value: 10 };
    const bad = [
      { ...base, value: 150 },
      { ...base, value: 0 },
      { ...base, value: 1.234 },
      { ...base, type: 'amount', value: -5 },
      { ...base, type: 'free' },
      { ...base, code: 'a' },
      { ...base, code: 'has space' },
      { ...base, expiresAt: new Date(Date.now() - 86_400_000).toISOString() },
      { ...base, usageLimit: 0 },
    ];
    for (const body of bad) {
      const res = await request(app).post('/api/discounts').set(auth(admin)).send(body);
      expect(res.status, JSON.stringify(body)).toBe(400);
    }
  });

  it('shows the status in the list', async () => {
    const code = (await createCode()).body;
    expect((await patchCode(code.id, { active: false })).body.status).toBe('disabled');
    expect((await patchCode(code.id, { active: true })).body.status).toBe('active');
    const expired = await patchCode(code.id, { expiresAt: new Date(Date.now() - 1000).toISOString() });
    expect(expired.body.status).toBe('expired');
  });
});

describe('quotes', () => {
  it('calculates a percent discount on the server', async () => {
    const code = (await createCode({ value: 10 })).body.code;
    const res = await quote(code);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ subtotal: 40, discount: 4, shipping: 5, total: 41, code, codeError: null });
  });

  it('works without a code and ignores letter case', async () => {
    const none = await quote();
    expect(none.body).toMatchObject({ subtotal: 40, discount: 0, total: 45, code: null, codeError: null });

    const code = (await createCode({ value: 10 })).body.code as string;
    expect((await quote(code.toLowerCase())).body.discount).toBe(4);
  });

  it('never discounts below the shipping cost', async () => {
    const code = (await createCode({ type: 'amount', value: 50 })).body.code;
    const res = await quote(code);
    expect(res.body).toMatchObject({ subtotal: 40, discount: 40, total: 5 });
  });

  it('reports bad codes with a message instead of failing', async () => {
    const unknown = await quote('NOSUCHCODE');
    expect(unknown.status).toBe(200);
    expect(unknown.body.codeError).toMatch(/not valid/);
    expect(unknown.body.discount).toBe(0);
    expect((await quote('bad code!')).body.codeError).toMatch(/not valid/);
  });

    it('checks stock and availability like a real order', async () => {
    const scarce = (
      await request(app)
        .post('/api/products')
        .set(auth(admin))
        .send({ name: 'Scarce Item', category: 'DiscountTests', price: 10, stock: 2 })
    ).body;
    const quoteFor = (quantity: number) =>
      request(app).post('/api/orders/quote').set(auth(customer)).send({ items: [{ productId: scarce.id, quantity }] });

    const tooMany = await quoteFor(5);
    expect(tooMany.status).toBe(409);
    expect(tooMany.body.error).toMatch(/stock/i);

    await request(app).patch(`/api/products/${scarce.id}`).set(auth(admin)).send({ active: false });
    const archived = await quoteFor(1);
    expect(archived.status).toBe(409);
    expect(archived.body.error).toMatch(/no longer available/);
  });
});

describe('placing orders with codes', () => {
  it('recalculates everything on the server and ignores client totals', async () => {
    const code = (await createCode({ value: 25 })).body.code;
    const res = await placeOrder(code, { total: 1, discount: 999, subtotal: 1 });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ subtotal: 40, discount: 10, discountCode: code, shipping: 5, total: 35 });

    // الدفع بيطلب المبلغ بعد الخصم
    const payment = await startPayment(customer, res.body.id);
    expect(payment.body.amount).toBe(35);
  });

  it('rejects an invalid code and changes nothing', async () => {
    const before = await stockOf();
    const res = await placeOrder('NOSUCHCODE');
    expect(res.status).toBe(422);
    expect(res.body.error).toMatch(/not valid/);
    expect((await placeOrder('bad code!')).status).toBe(422);
    expect(await stockOf()).toBe(before);
  });

  it('explains expired, disabled and exhausted codes', async () => {
    const expired = (await createCode()).body;
    await patchCode(expired.id, { expiresAt: new Date(Date.now() - 1000).toISOString() });
    expect((await quote(expired.code)).body.codeError).toMatch(/expired/);
    const late = await placeOrder(expired.code);
    expect(late.status).toBe(422);
    expect(late.body.error).toMatch(/expired/);

    const disabled = (await createCode()).body;
    await patchCode(disabled.id, { active: false });
    expect((await quote(disabled.code)).body.codeError).toMatch(/not valid/);

    const limited = (await createCode({ usageLimit: 1 })).body;
    expect((await placeOrder(limited.code)).status).toBe(201);
    expect((await quote(limited.code)).body.codeError).toMatch(/usage limit/);
    const second = await placeOrder(limited.code);
    expect(second.status).toBe(422);
    expect(second.body.error).toMatch(/usage limit/);
  });

  it('gives the use back when the order is cancelled', async () => {
    const code = (await createCode({ usageLimit: 2 })).body;
    const placed = (await placeOrder(code.code)).body;
    expect(await usedCount(code.id)).toBe(1);

    await request(app).post(`/api/orders/${placed.id}/cancel`).set(auth(customer));
    expect(await usedCount(code.id)).toBe(0);
  });

  it('never exceeds the usage limit under concurrent orders', async () => {
    const code = (await createCode({ usageLimit: 1 })).body;
    const results = await Promise.all([1, 2, 3, 4].map(() => placeOrder(code.code)));
    expect(results.map((r) => r.status).sort()).toEqual([201, 422, 422, 422]);
    expect(await usedCount(code.id)).toBe(1);
  });
});

describe('receipt data', () => {
  it('records when an order was paid and refunded', async () => {
    const placed = (await placeOrder()).body;
    expect(placed.paidAt).toBeNull();
    expect(placed.refundedAt).toBeNull();

    await payOrder(customer, placed.id);
    const paid = (await request(app).get(`/api/orders/${placed.id}`).set(auth(customer))).body;
    expect(typeof paid.paidAt).toBe('string');
    expect(paid.refundedAt).toBeNull();

    await request(app).post(`/api/orders/${placed.id}/cancel`).set(auth(customer));
    const refunded = (await request(app).get(`/api/orders/${placed.id}`).set(auth(customer))).body;
    expect(refunded.paymentStatus).toBe('refunded');
    expect(typeof refunded.refundedAt).toBe('string');
    expect(typeof refunded.paidAt).toBe('string');
  });
});