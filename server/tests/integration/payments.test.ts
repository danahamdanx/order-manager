import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import app from '../../src/app';
import { pool } from '../../src/db';

async function login(email: string, password: string) {
  const res = await request(app).post('/api/auth/login').send({ email, password });
  return res.body.token as string;
}
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
const card = { cardBrand: 'visa', cardLast4: '4242' };

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
    .send({ name: 'Payment Test Item', category: 'PayTests', price: 20, stock: 100 });
  productId = product.body.id;
});

afterAll(async () => {
  await pool.end();
});

const place = () =>
  request(app)
    .post('/api/orders')
    .set(auth(customer))
    .send({ address: 'Nablus, Rafidia St', items: [{ productId, quantity: 1 }] });
const pay = (id: number, token = customer, body: object = card) =>
  request(app).post(`/api/orders/${id}/pay`).set(auth(token)).send(body);
const setStatus = (id: number, status: string) =>
  request(app).patch(`/api/orders/${id}/status`).set(auth(admin)).send({ status });
const stockOf = async () => (await request(app).get(`/api/products/${productId}`)).body.stock as number;
const revenue = async () => (await request(app).get('/api/stats').set(auth(admin))).body.revenue as number;

describe('payments', () => {
  it('creates orders as unpaid', async () => {
    const res = await place();
    expect(res.status).toBe(201);
    expect(res.body.paymentStatus).toBe('unpaid');
    expect(res.body.cardLast4).toBeNull();
  });

  it('blocks processing until the order is paid', async () => {
    const order = (await place()).body;

    const blocked = await setStatus(order.id, 'processing');
    expect(blocked.status).toBe(409);
    expect(blocked.body.error).toMatch(/paid/i);

    const paid = await pay(order.id);
    expect(paid.status).toBe(200);
    expect(paid.body.paymentStatus).toBe('paid');
    expect(paid.body.cardBrand).toBe('visa');
    expect(paid.body.cardLast4).toBe('4242');

    expect((await setStatus(order.id, 'processing')).status).toBe(200);
  });

  it('rejects invalid payment input, including a full card number', async () => {
    const order = (await place()).body;
    expect((await pay(order.id, customer, {})).status).toBe(400);
    expect((await pay(order.id, customer, { cardBrand: 'visa', cardLast4: '4242424242424242' })).status).toBe(400);
    expect((await pay(order.id, customer, { cardBrand: 'bitcoin', cardLast4: '4242' })).status).toBe(400);
  });

  it('only lets the owner pay', async () => {
    const order = (await place()).body;
    expect((await pay(order.id, other)).status).toBe(404);
    expect((await pay(order.id, admin)).status).toBe(403);
  });

  it('does not accept a second payment', async () => {
    const order = (await place()).body;
    expect((await pay(order.id)).status).toBe(200);
    expect((await pay(order.id)).status).toBe(409);
  });

  it('does not accept payment for a cancelled order', async () => {
    const order = (await place()).body;
    await request(app).post(`/api/orders/${order.id}/cancel`).set(auth(customer));
    expect((await pay(order.id)).status).toBe(409);
  });

  it('refunds a paid order that is cancelled and restores stock', async () => {
    const before = await stockOf();
    const order = (await place()).body;
    expect(await stockOf()).toBe(before - 1);
    await pay(order.id);

    const cancelled = await request(app).post(`/api/orders/${order.id}/cancel`).set(auth(customer));
    expect(cancelled.status).toBe(200);
    expect(cancelled.body.status).toBe('cancelled');
    expect(cancelled.body.paymentStatus).toBe('refunded');
    expect(await stockOf()).toBe(before);
  });

  it('counts only paid orders as revenue', async () => {
    const start = await revenue();
    const order = (await place()).body;
    expect(await revenue()).toBeCloseTo(start, 2);

    await pay(order.id);
    expect(await revenue()).toBeCloseTo(start + 25, 2); // 20 + 5 شحن
  });
});