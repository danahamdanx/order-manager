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
let staff: string;
let customer: string;

beforeAll(async () => {
  admin = await login('admin@example.com', 'Admin123!');
  customer = await login('lina@example.com', 'Customer123!');
  await request(app)
    .post('/api/staff')
    .set(auth(admin))
    .send({ name: 'Pat', email: 'pat-staff@test.com', password: 'password123' });
  staff = await login('pat-staff@test.com', 'password123');
});

afterAll(async () => {
  await pool.end();
});

const createProduct = (extra: object = {}) =>
  request(app)
    .post('/api/products')
    .set(auth(admin))
    .send({ name: 'Test Lamp', category: 'Lighting', price: 24.5, stock: 10, ...extra });

describe('product management', () => {
  it('only lets admins create products', async () => {
    const body = { name: 'Nope', category: 'x', price: 5, stock: 1 };
    expect((await request(app).post('/api/products').set(auth(customer)).send(body)).status).toBe(403);
    expect((await request(app).post('/api/products').set(auth(staff)).send(body)).status).toBe(403);

    const res = await createProduct();
    expect(res.status).toBe(201);
    expect(res.body.active).toBe(true);
    expect(res.body.icon).toBe('package');
    expect(res.body.price).toBe(24.5);
  });

  it('rejects invalid input', async () => {
    expect((await createProduct({ price: -1 })).status).toBe(400);
    expect((await createProduct({ price: 1.234 })).status).toBe(400);
    expect((await createProduct({ name: '' })).status).toBe(400);
    expect((await createProduct({ stock: 1.5 })).status).toBe(400);
    expect((await createProduct({ color: 'red' })).status).toBe(400);
  });

  it('lets staff view every product but not change them', async () => {
    const created = await createProduct({ name: 'Staff View' });
    const list = await request(app).get('/api/admin/products').set(auth(staff));
    expect(list.status).toBe(200);
    expect(list.body.some((p: { id: number }) => p.id === created.body.id)).toBe(true);

    const patch = await request(app).patch(`/api/products/${created.body.id}`).set(auth(staff)).send({ stock: 1 });
    expect(patch.status).toBe(403);
    expect((await request(app).get('/api/admin/products').set(auth(customer))).status).toBe(403);
  });

  it('updates a product', async () => {
    const created = await createProduct({ name: 'To Update' });
    const res = await request(app)
      .patch(`/api/products/${created.body.id}`)
      .set(auth(admin))
      .send({ stock: 7, price: 30 });
    expect(res.status).toBe(200);
    expect(res.body.stock).toBe(7);
    expect(res.body.price).toBe(30);
    expect(res.body.name).toBe('To Update');
  });

  it('deletes a product that was never ordered', async () => {
    const created = await createProduct({ name: 'To Delete' });
    expect((await request(app).delete(`/api/products/${created.body.id}`).set(auth(admin))).status).toBe(204);
    expect((await request(app).delete(`/api/products/${created.body.id}`).set(auth(admin))).status).toBe(404);
  });

  it('cannot delete a product that is in orders, but it can be archived', async () => {
    const created = await createProduct({ name: 'Archive Me' });
    const id = created.body.id as number;
    const place = () =>
      request(app)
        .post('/api/orders')
        .set(auth(customer))
        .send({ address: 'Nablus, Rafidia St', items: [{ productId: id, quantity: 1 }] });

    expect((await place()).status).toBe(201);
    expect((await request(app).delete(`/api/products/${id}`).set(auth(admin))).status).toBe(409);

    const archived = await request(app).patch(`/api/products/${id}`).set(auth(admin)).send({ active: false });
    expect(archived.status).toBe(200);
    expect(archived.body.active).toBe(false);

    // مخفي من المتجر ومن صفحة المنتج، ومش ممكن يتطلب
    const publicList = await request(app).get('/api/products');
    expect(publicList.body.some((p: { id: number }) => p.id === id)).toBe(false);
    expect((await request(app).get(`/api/products/${id}`)).status).toBe(404);
    expect((await place()).status).toBe(409);
  });
});