import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { pool } from '../../src/db';
import app from '../../src/app';

async function login(email: string, password: string) {
  const res = await request(app).post('/api/auth/login').send({ email, password });
  return res.body.token as string;
}
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
const stockOf = async (id: number) => (await request(app).get(`/api/products/${id}`)).body.stock as number;

let admin: string;
let customer: string;

beforeAll(async () => {
  admin = await login('admin@example.com', 'Admin123!');
  customer = await login('lina@example.com', 'Customer123!');
});

afterAll(async () => {
  await pool.end();
});

describe('authentication', () => {
  it('rejects a wrong password', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: 'lina@example.com', password: 'nope' });
    expect(res.status).toBe(401);
  });

  it('always registers new users as customers', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Eve', email: 'eve@test.com', password: 'password123', role: 'admin' });
    expect(res.status).toBe(201);
    expect(res.body.user.role).toBe('customer');
  });

  it('rejects a duplicate email', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Lina 2', email: 'lina@example.com', password: 'password123' });
    expect(res.status).toBe(409);
  });

  it('requires a token on protected routes', async () => {
    expect((await request(app).get('/api/orders/mine')).status).toBe(401);
  });
});

describe('role-based access', () => {
  it('blocks customers from admin endpoints', async () => {
    expect((await request(app).get('/api/customers').set(auth(customer))).status).toBe(403);
    expect((await request(app).get('/api/stats').set(auth(customer))).status).toBe(403);
  });

  it('lets an admin list customers', async () => {
    const res = await request(app).get('/api/customers').set(auth(admin));
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThan(0);
  });

  it('only lets an admin create staff accounts', async () => {
    const body = { name: 'Sam', email: 'sam@test.com', password: 'password123' };
    expect((await request(app).post('/api/staff').set(auth(customer)).send(body)).status).toBe(403);
    const res = await request(app).post('/api/staff').set(auth(admin)).send(body);
    expect(res.status).toBe(201);
    expect(res.body.role).toBe('staff');
  });
});

describe('orders', () => {
  const place = (items: unknown[], extra: object = {}) =>
    request(app).post('/api/orders').set(auth(customer)).send({ address: 'Nablus, Rafidia St', items, ...extra });

  it('calculates the total on the server and reduces stock', async () => {
    const before = await stockOf(1);
    // الـ total اللي بيبعته الزبون بيتجاهله السيرفر
    const res = await place([{ productId: 1, quantity: 2 }, { productId: 2, quantity: 1 }], { total: 1 });
    expect(res.status).toBe(201);
    expect(res.body.total).toBe(128); // 2 x 45.5 + 32 + 5 shipping
    expect(res.body.status).toBe('pending');
    expect(await stockOf(1)).toBe(before - 2);
  });

  it('rejects an order that exceeds the stock', async () => {
    const res = await place([{ productId: 4, quantity: 20 }]);
    expect(res.status).toBe(409);
  });

  it('rejects invalid input', async () => {
    expect((await place([])).status).toBe(400);
    expect((await place([{ productId: 1, quantity: 1 }], { address: 'x' })).status).toBe(400);
  });

  it('restores stock when a pending order is cancelled', async () => {
    const created = await place([{ productId: 3, quantity: 2 }]);
    const afterOrder = await stockOf(3);
    const res = await request(app).post(`/api/orders/${created.body.id}/cancel`).set(auth(customer));
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('cancelled');
    expect(await stockOf(3)).toBe(afterOrder + 2);
  });

  it('does not allow cancelling once processing has started', async () => {
    const created = await place([{ productId: 5, quantity: 1 }]);
    const patch = await request(app)
      .patch(`/api/orders/${created.body.id}/status`)
      .set(auth(admin))
      .send({ status: 'processing' });
    expect(patch.status).toBe(200);
    const res = await request(app).post(`/api/orders/${created.body.id}/cancel`).set(auth(customer));
    expect(res.status).toBe(409);
  });

  it("hides other customers' orders", async () => {
    // الطلب 2 تابع لـ Omar، وLina مسجلة الدخول
    expect((await request(app).get('/api/orders/2').set(auth(customer))).status).toBe(404);
  });

  it('only lets an admin delete an order', async () => {
    expect((await request(app).delete('/api/orders/1').set(auth(customer))).status).toBe(403);
    expect((await request(app).delete('/api/orders/1').set(auth(admin))).status).toBe(204);
  });

    it('never oversells when two orders race for the same stock', async () => {
    const stock = await stockOf(6);
    const qty = Math.ceil(stock / 2) + 1; // طلبين مع بعض بيتجاوزوا المخزون
    const [a, b] = await Promise.all([place([{ productId: 6, quantity: qty }]), place([{ productId: 6, quantity: qty }])]);
    expect([a.status, b.status].sort()).toEqual([201, 409]);
    expect(await stockOf(6)).toBe(stock - qty);
  });

  it('returns 404 for an invalid order id instead of failing', async () => {
    expect((await request(app).get('/api/orders/abc').set(auth(admin))).status).toBe(404);
  });

  it('searches orders without caring about letter case', async () => {
    const res = await request(app).get('/api/orders?search=LINA').set(auth(admin));
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThan(0);
  });
});