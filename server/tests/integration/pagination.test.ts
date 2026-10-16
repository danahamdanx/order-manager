import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import app from '../../src/app';
import { pool } from '../../src/db';

async function login(email: string, password: string) {
  const res = await request(app).post('/api/auth/login').send({ email, password });
  return res.body.token as string;
}
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

let admin: string;

beforeAll(async () => {
  admin = await login('admin@example.com', 'Admin123!');
  for (let i = 1; i <= 3; i++) {
    await request(app)
      .post('/api/auth/register')
      .send({ name: `Pager ${i}`, email: `pager${i}@test.com`, password: 'password123' });
  }
  for (let i = 1; i <= 5; i++) {
    await request(app)
      .post('/api/products')
      .set(auth(admin))
      .send({ name: `Pager Product ${i}`, category: 'PagerCat', price: 10 + i, stock: 5 });
  }
});

afterAll(async () => {
  await pool.end();
});

describe('pagination', () => {
  it('returns the page metadata', async () => {
    const res = await request(app).get('/api/orders?limit=2&page=1').set(auth(admin));
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(2);
    expect(res.body.page).toBe(1);
    expect(res.body.total).toBeGreaterThanOrEqual(3);
    expect(res.body.pages).toBe(Math.ceil(res.body.total / 2));
  });

  it('keeps pages in order without overlap', async () => {
    const one = await request(app).get('/api/orders?limit=2&page=1').set(auth(admin));
    const two = await request(app).get('/api/orders?limit=2&page=2').set(auth(admin));
    const ids = [...one.body.items, ...two.body.items].map((o: { id: number }) => o.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual([...ids].sort((a, b) => b - a));
  });

  it('clamps a page beyond the end to the last page', async () => {
    const res = await request(app).get('/api/orders?limit=2&page=9999').set(auth(admin));
    expect(res.status).toBe(200);
    expect(res.body.page).toBe(res.body.pages);
    expect(res.body.items.length).toBeGreaterThan(0);
  });

  it('falls back to defaults on bad values', async () => {
    const res = await request(app).get('/api/orders?page=abc&limit=-5').set(auth(admin));
    expect(res.status).toBe(200);
    expect(res.body.page).toBe(1);
    expect(res.body.items.length).toBeLessThanOrEqual(10);
  });

  it('paginates customers together with search', async () => {
    const first = await request(app).get('/api/customers?search=pager&limit=2&page=1').set(auth(admin));
    expect(first.body.total).toBe(3);
    expect(first.body.pages).toBe(2);
    expect(first.body.items).toHaveLength(2);

    const second = await request(app).get('/api/customers?search=pager&limit=2&page=2').set(auth(admin));
    expect(second.body.items).toHaveLength(1);
  });

  it('paginates the public shop with category and sort', async () => {
    const first = await request(app).get('/api/products?category=PagerCat&sort=price_asc&limit=2&page=1');
    expect(first.body.items.map((p: { price: number }) => p.price)).toEqual([11, 12]);

    const last = await request(app).get('/api/products?category=PagerCat&sort=price_asc&limit=2&page=3');
    expect(last.body.total).toBe(5);
    expect(last.body.pages).toBe(3);
    expect(last.body.items.map((p: { price: number }) => p.price)).toEqual([15]);
  });

  it('hides archived products in the admin list unless asked', async () => {
    const list = await request(app).get('/api/admin/products?search=Pager%20Product').set(auth(admin));
    const target = list.body.items[0];
    await request(app).patch(`/api/products/${target.id}`).set(auth(admin)).send({ active: false });

    const hidden = await request(app).get('/api/admin/products?search=Pager%20Product').set(auth(admin));
    const all = await request(app)
      .get('/api/admin/products?search=Pager%20Product&includeArchived=true')
      .set(auth(admin));
    expect(hidden.body.total).toBe(4);
    expect(all.body.total).toBe(5);
  });
});