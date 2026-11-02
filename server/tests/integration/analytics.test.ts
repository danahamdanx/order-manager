import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import app from '../../src/app';
import { pool } from '../../src/db';
import { auth, login } from '../helpers';

const ADDRESS = 'Analytics test address';
let admin: string;
let staff: string;
let customer: string;

const addUser = async (n: number, createdAt: string) =>
  (
    await pool.query<{ id: number }>(
      `INSERT INTO users (name, email, password_hash, role, created_at)
       VALUES ($1, $2, 'not-a-real-hash', 'customer', $3) RETURNING id`,
      [`Analytics ${n}`, `analytics-test-${n}@test.local`, createdAt],
    )
  ).rows[0].id;

const addOrder = (userId: number, createdAt: string, status: string, paymentStatus: string, total: number) =>
  pool.query(
    `INSERT INTO orders (user_id, status, payment_status, address, subtotal, discount, shipping, total, created_at)
     VALUES ($1, $2, $3, $4, $5, 0, 5, $6, $7)`,
    [userId, status, paymentStatus, ADDRESS, total - 5, total, createdAt],
  );

beforeAll(async () => {
  admin = await login('admin@example.com', 'Admin123!');
  customer = await login('lina@example.com', 'Customer123!');
  await request(app)
    .post('/api/staff')
    .set(auth(admin))
    .send({ name: 'Ana', email: 'analytics-staff@test.com', password: 'password123' });
  staff = await login('analytics-staff@test.com', 'password123');

  const u1 = await addUser(1, '2020-03-02T08:00:00Z');
  await addUser(2, '2020-03-05T09:00:00Z');
  await addUser(3, '2020-03-05T10:00:00Z');

  await addOrder(u1, '2020-02-27T12:00:00Z', 'delivered', 'paid', 60); // الفترة السابقة
  await addOrder(u1, '2020-03-02T10:00:00Z', 'delivered', 'paid', 50);
  await addOrder(u1, '2020-03-02T15:30:00Z', 'pending', 'paid', 30);
  await addOrder(u1, '2020-03-02T18:00:00Z', 'cancelled', 'unpaid', 20); // ملغي
  await addOrder(u1, '2020-03-03T09:00:00Z', 'cancelled', 'refunded', 40); // ملغي ومسترد
  await addOrder(u1, '2020-03-05T11:00:00Z', 'pending', 'unpaid', 15); // غير مدفوع
  await addOrder(u1, '2020-03-05T20:00:00Z', 'delivered', 'paid', 100.5);
  await addOrder(u1, '2020-03-10T23:30:00Z', 'processing', 'paid', 25); // لاختبار التوقيت
});

afterAll(async () => {
  await pool.query('DELETE FROM orders WHERE address = $1', [ADDRESS]);
  await pool.query(`DELETE FROM users WHERE email LIKE 'analytics-test-%@test.local'`);
  await pool.end();
});

const sales = (query: string, token = admin) => request(app).get(`/api/analytics/sales?${query}`).set(auth(token));
type Point = { date: string; orders: number; paidOrders: number; revenue: number; aov: number | null; newCustomers: number };
const at = (points: Point[], date: string) => points.find((p) => p.date === date)!;

describe('access', () => {
  it('is only for staff and admins', async () => {
    expect((await request(app).get('/api/analytics/sales')).status).toBe(401);
    expect((await sales('', customer)).status).toBe(403);
    expect((await sales('from=2020-03-01&to=2020-03-07', staff)).status).toBe(200);
  });
});

describe('daily series', () => {
  it('fills every day and counts only what should be counted', async () => {
    const res = await sales('from=2020-03-01&to=2020-03-07&tz=UTC');
    expect(res.status).toBe(200);
    const series: Point[] = res.body.series;

    expect(series.map((p) => p.date)).toEqual([
      '2020-03-01', '2020-03-02', '2020-03-03', '2020-03-04', '2020-03-05', '2020-03-06', '2020-03-07',
    ]);
    expect(at(series, '2020-03-01')).toMatchObject({ orders: 0, paidOrders: 0, revenue: 0, aov: null, newCustomers: 0 });
    // الملغي ما بينحسب، والمدفوع بس بيدخل بالإيراد
    expect(at(series, '2020-03-02')).toMatchObject({ orders: 2, paidOrders: 2, revenue: 80, aov: 40, newCustomers: 1 });
    // طلب ملغي ومسترد: لا طلب ولا إيراد
    expect(at(series, '2020-03-03')).toMatchObject({ orders: 0, paidOrders: 0, revenue: 0, aov: null });
    // طلب غير مدفوع بيحسب كطلب بس مش كإيراد
    expect(at(series, '2020-03-05')).toMatchObject({ orders: 2, paidOrders: 1, revenue: 100.5, aov: 100.5, newCustomers: 2 });
  });

  it('adds up the totals from the same numbers', async () => {
    const { body } = await sales('from=2020-03-01&to=2020-03-07&tz=UTC');
    expect(body.totals).toEqual({ revenue: 180.5, orders: 4, paidOrders: 3, aov: 60.17, newCustomers: 3 });
    expect(body.range).toEqual({ from: '2020-03-01', to: '2020-03-07', granularity: 'day', tz: 'UTC', days: 7 });
  });

  it('compares with the period right before', async () => {
    const { body } = await sales('from=2020-03-01&to=2020-03-07&tz=UTC');
    expect(body.previous).toMatchObject({ from: '2020-02-23', to: '2020-02-29' });
    expect(body.previous.totals).toEqual({ revenue: 60, orders: 1, paidOrders: 1, aov: 60, newCustomers: 0 });
    expect(body.changes.revenue).toBe(200.8);
    expect(body.changes.orders).toBe(300);
    expect(body.changes.newCustomers).toBeNull(); // الفترة السابقة صفر
  });

  it('changes every number when the range changes', async () => {
    const wide = (await sales('from=2020-03-01&to=2020-03-07&tz=UTC')).body;
    const narrow = (await sales('from=2020-03-02&to=2020-03-02&tz=UTC')).body;
    expect(narrow.series).toHaveLength(1);
    expect(narrow.totals).toEqual({ revenue: 80, orders: 2, paidOrders: 2, aov: 40, newCustomers: 1 });
    expect(narrow.totals.revenue).not.toBe(wide.totals.revenue);
  });
});

describe('weekly series', () => {
  it('groups by week starting on Monday', async () => {
    const { body } = await sales('from=2020-02-24&to=2020-03-08&granularity=week&tz=UTC');
    expect(body.range.granularity).toBe('week');
    const series: Point[] = body.series;
    expect(series.map((p) => p.date)).toEqual(['2020-02-24', '2020-03-02']);
    expect(series[0]).toMatchObject({ orders: 1, revenue: 60, newCustomers: 0 });
    expect(series[1]).toMatchObject({ orders: 4, paidOrders: 3, revenue: 180.5, newCustomers: 3 });
  });
});

describe('time zones', () => {
  it('puts a late-evening order on the right local day', async () => {
    const utc = (await sales('from=2020-03-09&to=2020-03-12&tz=UTC')).body.series as Point[];
    expect(at(utc, '2020-03-10').revenue).toBe(25);
    expect(at(utc, '2020-03-11').revenue).toBe(0);

    // 23:30 UTC = 01:30 بالقدس (UTC+2 بهالفترة)، يعني اليوم اللي بعده
    const local = (await sales('from=2020-03-09&to=2020-03-12&tz=Asia/Jerusalem')).body.series as Point[];
    expect(at(local, '2020-03-10').revenue).toBe(0);
    expect(at(local, '2020-03-11').revenue).toBe(25);
  });
});

describe('defaults and validation', () => {
  it('returns the last 30 days when no range is given', async () => {
    const res = await sales('');
    expect(res.status).toBe(200);
    expect(res.body.range.days).toBe(30);
    expect(res.body.series).toHaveLength(30);
    expect(res.body.series[29].date).toBe(new Date().toISOString().slice(0, 10));
  });

  it('rejects bad parameters with a 400', async () => {
    const bad = [
      'from=2020-03-08&to=2020-03-01',
      'from=nope',
      'to=2999-01-01',
      'from=2000-01-01&to=2020-01-01',
      'from=2020-01-01&to=2020-06-30&granularity=day',
      'granularity=month',
      'tz=bad%20zone',
      'tz=Mars/Olympus',
    ];
    for (const query of bad) expect((await sales(query)).status, query).toBe(400);
  });

  it('accepts a long range by switching to weeks automatically', async () => {
    const res = await sales('from=2020-01-01&to=2020-06-30');
    expect(res.status).toBe(200);
    expect(res.body.range.granularity).toBe('week');
  });
});