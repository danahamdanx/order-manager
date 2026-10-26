import { randomBytes } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import app from '../../src/app';
import { pool } from '../../src/db';
import { auth, login } from '../helpers';

let admin: string;

const uid = () => randomBytes(3).toString('hex');

beforeAll(async () => {
  admin = await login('admin@example.com', 'Admin123!');
});

afterAll(async () => {
  await pool.end();
});

const register = async (label: string) =>
  (
    await request(app)
      .post('/api/auth/register')
      .send({ name: `Reco ${label}`, email: `reco-${label}-${uid()}@test.com`, password: 'password123' })
  ).body.token as string;

const product = async (name: string, category: string, stock = 100) =>
  (
    await request(app)
      .post('/api/products')
      .set(auth(admin))
      .send({ name: `${name} ${uid()}`, category, price: 10, stock })
  ).body as { id: number; name: string; category: string };

const order = (token: string, productIds: number[]) =>
  request(app)
    .post('/api/orders')
    .set(auth(token))
    .send({ address: 'Nablus, Rafidia St', items: productIds.map((productId) => ({ productId, quantity: 1 })) });

const recs = (token?: string, query = '') => {
  const req = request(app).get(`/api/recommendations${query}`);
  return token ? req.set(auth(token)) : req;
};

type Item = { id: number; category: string; stock: number; reason: { type: string; label: string } };

describe('personalization', () => {
  it('recommends more of the categories a customer ordered, but not what they bought', async () => {
    const cat = `Ordered-${uid()}`;
    const bought = await product('Bought', cat);
    const sibling = await product('Sibling', cat);
    const buyer = await register('buyer');
    expect((await order(buyer, [bought.id])).status).toBe(201);

    const res = await recs(buyer);
    expect(res.status).toBe(200);
    expect(res.body.personalized).toBe(true);
    const items: Item[] = res.body.items;
    expect(items.map((i) => i.id)).not.toContain(bought.id);
    expect(items[0].id).toBe(sibling.id);
    expect(items[0].reason.type).toBe('ordered_category');
  });

  it('gives customers with different histories different recommendations', async () => {
    const catX = `CatX-${uid()}`;
    const catY = `CatY-${uid()}`;
    const [x1, , y1] = [await product('X1', catX), await product('X2', catX), await product('Y1', catY), await product('Y2', catY)];

    const customerX = await register('x');
    const customerY = await register('y');
    await order(customerX, [x1.id]);
    await order(customerY, [y1.id]);

    const topX = (await recs(customerX)).body.items[0] as Item;
    const topY = (await recs(customerY)).body.items[0] as Item;
    expect(topX.category).toBe(catX);
    expect(topY.category).toBe(catY);
  });

  it('uses what the customer viewed', async () => {
    const cat = `Viewed-${uid()}`;
    const first = await product('Viewed 1', cat);
    await product('Viewed 2', cat);
    const viewer = await register('viewer');
    expect((await request(app).post(`/api/products/${first.id}/view`).set(auth(viewer))).status).toBe(200);

    const res = await recs(viewer);
    expect(res.body.personalized).toBe(true);
    expect(res.body.items[0].category).toBe(cat);
    expect(res.body.items[0].reason.type).toBe('viewed_category');
  });

  it('suggests what other customers bought together with the customer\'s products', async () => {
    const a = await product('Pair A', `PairCat-${uid()}`);
    const b = await product('Pair B', `PairCat-${uid()}`);
    await order(await register('earlier'), [a.id, b.id]);

    const later = await register('later');
    await order(later, [a.id]);
    const top = (await recs(later)).body.items[0] as Item;
    expect(top.id).toBe(b.id);
    expect(top.reason.type).toBe('bought_together');
    expect(top.reason.label).toContain(a.name);
  });

  it('ignores cancelled orders', async () => {
    const buyer = await register('canceller');
    const item = await product('Cancelled', `CancelCat-${uid()}`);
    const placed = await order(buyer, [item.id]);
    await request(app).post(`/api/orders/${placed.body.id}/cancel`).set(auth(buyer));

    expect((await recs(buyer)).body.personalized).toBe(false);
  });
});

describe('guests, new customers and staff', () => {
  it('shows a sensible popular list to new customers and guests', async () => {
    const fresh = await register('fresh');
    for (const token of [fresh, undefined, admin]) {
      const res = await recs(token);
      expect(res.status).toBe(200);
      expect(res.body.personalized).toBe(false);
      expect(res.body.items.length).toBeGreaterThan(0);
      for (const item of res.body.items as Item[]) {
        expect(item.stock).toBeGreaterThan(0);
        expect(item.reason.type).toBe('popular');
      }
    }
  });

  it('treats an invalid token like a guest', async () => {
    const res = await request(app).get('/api/recommendations').set('Authorization', 'Bearer garbage');
    expect(res.status).toBe(200);
    expect(res.body.personalized).toBe(false);
  });
});

describe('what is never recommended', () => {
  it('skips out-of-stock and archived products', async () => {
    const cat = `Hidden-${uid()}`;
    const bought = await product('Anchor', cat);
    const empty = await product('Empty', cat, 0);
    const archived = await product('Archived', cat);
    await request(app).patch(`/api/products/${archived.id}`).set(auth(admin)).send({ active: false });

    const buyer = await register('hidden');
    await order(buyer, [bought.id]);
    const found = ((await recs(buyer, '?limit=20')).body.items as Item[]).map((i) => i.id);
    expect(found).not.toContain(empty.id);
    expect(found).not.toContain(archived.id);
  });
});

describe('product pages', () => {
  it('suggests products bought together with the current one, without the product itself', async () => {
    const a = await product('Context A', `CtxCat-${uid()}`);
    const b = await product('Context B', `CtxCat-${uid()}`);
    await order(await register('ctx'), [a.id, b.id]);

    const res = await recs(undefined, `?productId=${a.id}&limit=5`);
    expect(res.status).toBe(200);
    const items: Item[] = res.body.items;
    expect(items.map((i) => i.id)).not.toContain(a.id);
    expect(items[0].id).toBe(b.id);
    expect(items[0].reason.type).toBe('bought_together');
  });

  it('suggests more from the same category when there is no purchase data', async () => {
    const cat = `Same-${uid()}`;
    const current = await product('Current', cat);
    const sibling = await product('Neighbor', cat);
    await product('Different', `Diff-${uid()}`);

    const items: Item[] = (await recs(undefined, `?productId=${current.id}`)).body.items;
    expect(items[0].id).toBe(sibling.id);
    expect(items[0].reason.type).toBe('similar');
  });
});

describe('parameters', () => {
  it('validates the product id and the limit', async () => {
    expect((await recs(undefined, '?productId=abc')).status).toBe(400);
    expect((await recs(undefined, '?productId=99999999')).status).toBe(404);

    const big = await recs(undefined, '?limit=999');
    expect(big.body.items.length).toBeLessThanOrEqual(20);
    const bad = await recs(undefined, '?limit=abc');
    expect(bad.status).toBe(200);
    expect(bad.body.items.length).toBeLessThanOrEqual(8);
    expect((await recs(undefined, '?limit=2')).body.items.length).toBeLessThanOrEqual(2);
  });

  it('does not let shared caches store personalized answers', async () => {
    const res = await recs(await register('cache'));
    expect(res.headers['cache-control']).toContain('private');
  });
});