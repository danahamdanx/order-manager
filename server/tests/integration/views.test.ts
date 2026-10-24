import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import app from '../../src/app';
import { pool } from '../../src/db';
import { VIEW_WINDOW_MINUTES } from '../../src/views';
import { auth, login } from '../helpers';

let admin: string;
let staff: string;
let customer: string;
let other: string;
let customerId: number;
let otherId: number;
let productA: number;
let productB: number;

const createProduct = async (name: string) =>
  (
    await request(app)
      .post('/api/products')
      .set(auth(admin))
      .send({ name, category: 'ViewTests', price: 10, stock: 10 })
  ).body.id as number;

const view = (token: string | undefined, id: number | string) => {
  const req = request(app).post(`/api/products/${id}/view`);
  return token ? req.set(auth(token)) : req;
};
const rowsFor = async (userId: number, productId: number) =>
  (
    await pool.query<{ view_count: number }>(
      'SELECT view_count FROM product_views WHERE user_id = $1 AND product_id = $2',
      [userId, productId],
    )
  ).rows;
const totalRows = async (productId: number) =>
  (await pool.query<{ c: number }>('SELECT COUNT(*)::int AS c FROM product_views WHERE product_id = $1', [productId]))
    .rows[0].c;

beforeAll(async () => {
  admin = await login('admin@example.com', 'Admin123!');
  customer = await login('lina@example.com', 'Customer123!');
  customerId = (await request(app).get('/api/auth/me').set(auth(customer))).body.id;

  const reg = await request(app)
    .post('/api/auth/register')
    .send({ name: 'Viewer Two', email: 'viewer-two@test.com', password: 'password123' });
  other = reg.body.token;
  otherId = reg.body.user.id;

  await request(app)
    .post('/api/staff')
    .set(auth(admin))
    .send({ name: 'Vic', email: 'views-staff@test.com', password: 'password123' });
  staff = await login('views-staff@test.com', 'password123');

  productA = await createProduct('ViewsProbe A');
  productB = await createProduct('ViewsProbe B');
});

afterAll(async () => {
  await pool.end();
});

describe('who can record a view', () => {
  it('only stores views for signed-in customers', async () => {
    expect((await view(undefined, productA)).status).toBe(401);
    expect((await view(admin, productA)).status).toBe(403);
    expect((await view(staff, productA)).status).toBe(403);
    expect(await totalRows(productA)).toBe(0);
  });

  it('rejects missing, invalid and archived products', async () => {
    expect((await view(customer, 99999999)).status).toBe(404);
    expect((await view(customer, 'abc')).status).toBe(404);

    const archived = await createProduct('ViewsProbe Archived');
    await request(app).patch(`/api/products/${archived}`).set(auth(admin)).send({ active: false });
    expect((await view(customer, archived)).status).toBe(404);
    expect(await totalRows(archived)).toBe(0);
  });
});

describe('counting', () => {
  it('counts the first view', async () => {
    const res = await view(customer, productA);
    expect(res.status).toBe(200);
    expect(res.body.counted).toBe(true);
    expect(await rowsFor(customerId, productA)).toEqual([{ view_count: 1 }]);
  });

  it('ignores repeated views inside the visit window (refresh spam)', async () => {
    for (let i = 0; i < 5; i++) {
      const res = await view(customer, productA);
      expect(res.status).toBe(200);
      expect(res.body.counted).toBe(false);
    }
    expect(await rowsFor(customerId, productA)).toEqual([{ view_count: 1 }]);
  });

  it('counts a new view after the window, still in one row', async () => {
    await pool.query(
      `UPDATE product_views SET last_viewed_at = now() - ($3::int * interval '1 minute')
       WHERE user_id = $1 AND product_id = $2`,
      [customerId, productA, VIEW_WINDOW_MINUTES + 1],
    );

    expect((await view(customer, productA)).body.counted).toBe(true);
    expect(await rowsFor(customerId, productA)).toEqual([{ view_count: 2 }]);

    const times = await pool.query<{ later: boolean }>(
      'SELECT last_viewed_at > first_viewed_at AS later FROM product_views WHERE user_id = $1 AND product_id = $2',
      [customerId, productA],
    );
    expect(times.rows[0].later).toBe(true);
  });

  it('keeps one row per customer and product', async () => {
    await view(other, productA);
    await view(customer, productB);
    expect(await totalRows(productA)).toBe(2);
    expect(await totalRows(productB)).toBe(1);
    expect(await rowsFor(otherId, productA)).toEqual([{ view_count: 1 }]);
  });

  it('is safe under concurrent requests', async () => {
    const fresh = await createProduct('ViewsProbe Race');
    const results = await Promise.all(Array.from({ length: 10 }, () => view(customer, fresh)));
    expect(results.every((r) => r.status === 200)).toBe(true);
    expect(results.filter((r) => r.body.counted).length).toBe(1);
    expect(await rowsFor(customerId, fresh)).toEqual([{ view_count: 1 }]);
  });
});

describe('related behavior', () => {
  it('deletes views together with the product', async () => {
    const doomed = await createProduct('ViewsProbe Doomed');
    await view(customer, doomed);
    expect(await totalRows(doomed)).toBe(1);

    expect((await request(app).delete(`/api/products/${doomed}`).set(auth(admin))).status).toBe(204);
    expect(await totalRows(doomed)).toBe(0);
  });

  it('shows total views to staff in the admin product list', async () => {
    const res = await request(app).get('/api/admin/products?search=ViewsProbe%20A').set(auth(staff));
    expect(res.status).toBe(200);
    const probe = res.body.items.find((p: { id: number }) => p.id === productA);
    expect(probe.views).toBe(3); // lina مرتين، والزبون الثاني مرة
  });
});