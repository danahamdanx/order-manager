import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import app from '../../src/app';
import { pool } from '../../src/db';

async function login(email: string, password: string) {
  const res = await request(app).post('/api/auth/login').send({ email, password });
  return res.body.token as string;
}
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

const fakePng = () => Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(40, 7)]);

let admin: string;
let customer: string;

beforeAll(async () => {
  admin = await login('admin@example.com', 'Admin123!');
  customer = await login('lina@example.com', 'Customer123!');
});

afterAll(async () => {
  await pool.end();
});

const create = (extra: object = {}) =>
  request(app)
    .post('/api/products')
    .set(auth(admin))
    .send({ name: 'Image Test', category: 'Images', price: 10, stock: 5, ...extra });

const upload = (id: number, token: string, body: Buffer, type = 'image/png') =>
  request(app).put(`/api/products/${id}/image`).set(auth(token)).set('Content-Type', type).send(body);

describe('product images', () => {
  it('only lets admins upload', async () => {
    const { body: product } = await create();
    expect((await upload(product.id, customer, fakePng())).status).toBe(403);
    expect((await request(app).put(`/api/products/${product.id}/image`).set('Content-Type', 'image/png').send(fakePng())).status).toBe(401);
  });

  it('stores and serves an image with a version for caching', async () => {
    const { body: product } = await create({ name: 'With Image' });
    expect(product.imageVersion).toBeNull();

    const res = await upload(product.id, admin, fakePng());
    expect(res.status).toBe(200);
    expect(res.body.imageVersion).toBeGreaterThan(0);

    const image = await request(app).get(`/api/products/${product.id}/image?v=${res.body.imageVersion}`);
    expect(image.status).toBe(200);
    expect(image.headers['content-type']).toBe('image/png');
    expect(image.headers['cache-control']).toContain('immutable');
    expect(Buffer.compare(image.body, fakePng())).toBe(0);
  });

  it('rejects files that are not real images', async () => {
    const { body: product } = await create({ name: 'Bad Upload' });
    const disguised = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
    expect((await upload(product.id, admin, disguised, 'image/png')).status).toBe(415);
    expect((await upload(product.id, admin, disguised, 'image/svg+xml')).status).toBe(415);
  });

  it('rejects files over the size limit', async () => {
    const { body: product } = await create({ name: 'Too Big' });
    const big = Buffer.concat([fakePng(), Buffer.alloc(1_200_000)]);
    expect((await upload(product.id, admin, big)).status).toBe(413);
  });

  it('removes an image', async () => {
    const { body: product } = await create({ name: 'Remove Image' });
    await upload(product.id, admin, fakePng());
    const res = await request(app).delete(`/api/products/${product.id}/image`).set(auth(admin));
    expect(res.status).toBe(200);
    expect(res.body.imageVersion).toBeNull();
    expect((await request(app).get(`/api/products/${product.id}/image`)).status).toBe(404);
  });
});

describe('categories and sorting', () => {
  it('reuses a category regardless of letter case', async () => {
    await create({ name: 'Case A', category: 'Gadgets' });
    const second = await create({ name: 'Case B', category: 'gadgets' });
    expect(second.body.category).toBe('Gadgets');

    const categories = await request(app).get('/api/categories');
    const gadgets = categories.body.filter((c: { name: string }) => c.name.toLowerCase() === 'gadgets');
    expect(gadgets).toHaveLength(1);
    expect(gadgets[0].count).toBe(2);
  });

  it('filters by category and sorts', async () => {
    for (const [name, price] of [['Zeta', 30], ['Alpha', 10], ['Mid', 20]] as const) {
      await create({ name, price, category: 'SortTest' });
    }
    const prices = async (sort: string) =>
      (await request(app).get(`/api/products?category=SortTest&sort=${sort}`)).body.items.map((p: { price: number }) => p.price);

    expect(await prices('price_asc')).toEqual([10, 20, 30]);
    expect(await prices('price_desc')).toEqual([30, 20, 10]);

    const names = (await request(app).get('/api/products?category=SortTest&sort=name')).body.items.map((p: { name: string }) => p.name);
    expect(names).toEqual(['Alpha', 'Mid', 'Zeta']);
  });

  it('ignores unknown sort values instead of failing', async () => {
    expect((await request(app).get('/api/products?sort=constructor')).status).toBe(200);
    expect((await request(app).get('/api/products?sort=price_asc;DROP TABLE products')).status).toBe(200);
  });
});