import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import app from '../../src/app';
import { pool } from '../../src/db';
import { clearDemo, seedDemo } from '../../db/demo/seed-demo';
import { auth, login } from '../helpers';

afterAll(async () => {
  await clearDemo(pool); // بنرجّع القاعدة نظيفة حتى لو فشل اختبار
  await pool.end();
});

const count = async (sql: string) => (await pool.query<{ c: number }>(sql)).rows[0].c;

describe('demo data', () => {
  it('builds a consistent dataset and refuses to run twice', async () => {
    const result = await seedDemo(pool, { fresh: true });
    expect(result.customers).toBeGreaterThan(20);
    expect(result.orders).toBeGreaterThan(40);
    expect(result.payments).toBeGreaterThan(20);
    expect(result.views).toBeGreaterThan(50);

    // قيد الـ CHECK بالقاعدة بيفحص المجاميع، وهون بنفحص الحالات والأكواد
    const unpaidButProcessed = await count(
      `SELECT COUNT(*)::int AS c FROM orders
       WHERE address LIKE '[demo]%' AND status IN ('processing', 'shipped', 'delivered') AND payment_status <> 'paid'`,
    );
    expect(unpaidButProcessed).toBe(0);

    const wrongUsage = await count(
      `SELECT COUNT(*)::int AS c FROM discount_codes d
       WHERE d.times_used <> (SELECT COUNT(*) FROM orders o WHERE o.discount_code_id = d.id AND o.status <> 'cancelled')`,
    );
    expect(wrongUsage).toBe(0);

    await expect(seedDemo(pool, { fresh: false })).rejects.toThrow(/already exists/);
    // وبعد الفشل ما تغيّر شي (transaction)
    expect(await count(`SELECT COUNT(*)::int AS c FROM users WHERE email LIKE '%@demo.test'`)).toBe(result.customers);
  });

  it('creates customers nobody can sign in as', async () => {
    const { rows } = await pool.query<{ email: string }>(`SELECT email FROM users WHERE email LIKE '%@demo.test' LIMIT 1`);
    for (const password of ['password123', 'Customer123!', 'Admin123!', 'demo', 'demo.test']) {
      const res = await request(app).post('/api/auth/login').send({ email: rows[0].email, password });
      expect(res.status).toBe(401);
    }
  });

  it('feeds the dashboard and the recommendations', async () => {
    const admin = await login('admin@example.com', 'Admin123!');
    const stats = await request(app).get('/api/stats').set(auth(admin));
    expect(stats.status).toBe(200);
    expect(stats.body.totalOrders).toBeGreaterThan(40);
    expect(stats.body.revenue).toBeGreaterThan(0);

    const lina = await login('lina@example.com', 'Customer123!');
    const recs = await request(app).get('/api/recommendations').set(auth(lina));
    expect(recs.body.personalized).toBe(true);
  });

  it('removes only the demo data and keeps the catalog and the real accounts', async () => {
    const products = await count('SELECT COUNT(*)::int AS c FROM products');
    const removed = await clearDemo(pool);
    expect(removed.orders).toBeGreaterThan(40);
    expect(removed.customers).toBeGreaterThan(20);

    expect(await count(`SELECT COUNT(*)::int AS c FROM orders WHERE address LIKE '[demo]%'`)).toBe(0);
    expect(await count(`SELECT COUNT(*)::int AS c FROM users WHERE email LIKE '%@demo.test'`)).toBe(0);
    expect(await count('SELECT COUNT(*)::int AS c FROM products')).toBe(products);
    expect(await login('lina@example.com', 'Customer123!')).toBeTruthy();
  });
});