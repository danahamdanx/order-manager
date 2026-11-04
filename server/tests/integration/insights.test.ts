import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import app from '../../src/app';
import { pool } from '../../src/db';
import { parseCsv } from '../csv-parse';
import { auth, login, payOrder } from '../helpers';

const ADDRESS = 'Insights test address';
const EVIL_NAME = '=HYPERLINK("http://evil.test","x")';
const email = (n: number) => `insights-test-${n}@test.local`;

let admin: string;
let staff: string;
let customer: string;
const ids: Record<string, number> = {};
const names: Record<number, string> = {};

const createProduct = async (key: string, name: string, price: number, stock: number, active = true) => {
  const res = await request(app).post('/api/products').set(auth(admin)).send({ name, category: 'Insights', price, stock });
  ids[key] = res.body.id;
  names[res.body.id] = name;
  if (!active) await request(app).patch(`/api/products/${res.body.id}`).set(auth(admin)).send({ active: false });
};

const addUser = async (n: number, name: string) =>
  (
    await pool.query<{ id: number }>(
      `INSERT INTO users (name, email, password_hash, role, created_at)
       VALUES ($1, $2, 'not-a-real-hash', 'customer', '2021-01-01T00:00:00Z') RETURNING id`,
      [name, email(n)],
    )
  ).rows[0].id;

// items: [productId, quantity, unitPrice]
const addOrder = async (
  userId: number,
  createdAt: string,
  status: string,
  paymentStatus: string,
  items: [number, number, number][],
  address = ADDRESS,
) => {
  const subtotal = items.reduce((sum, [, qty, price]) => sum + qty * price, 0);
  const { rows } = await pool.query<{ id: number }>(
    `INSERT INTO orders (user_id, status, payment_status, address, subtotal, discount, shipping, total, created_at)
     VALUES ($1, $2, $3, $4, $5, 0, 5, $6, $7) RETURNING id`,
    [userId, status, paymentStatus, address, subtotal, subtotal + 5, createdAt],
  );
  for (const [productId, qty, price] of items) {
    await pool.query(
      `INSERT INTO order_items (order_id, product_id, product_name, unit_price, quantity) VALUES ($1, $2, $3, $4, $5)`,
      [rows[0].id, productId, names[productId], price, qty],
    );
  }
  return rows[0].id;
};

let o1: number;
let o4: number;

beforeAll(async () => {
  admin = await login('admin@example.com', 'Admin123!');
  customer = await login('lina@example.com', 'Customer123!');
  await request(app)
    .post('/api/staff')
    .set(auth(admin))
    .send({ name: 'Ines', email: 'insights-staff@test.com', password: 'password123' });
  staff = await login('insights-staff@test.com', 'password123');

  await createProduct('keyboard', 'Insights Keyboard', 50, 100);
  await createProduct('mouse', 'Insights Mouse', 20, 4);
  await createProduct('cable', 'Insights Cable', 5, 0);
  await createProduct('archived', 'Insights Archived', 9, 1, false);
  await createProduct('plenty', 'Insights Plenty', 10, 50);
  const { keyboard, mouse, cable, plenty } = ids;

  const c1 = await addUser(1, 'Insights One');
  const c2 = await addUser(2, 'Insights Two');
  const c3 = await addUser(3, 'Insights Three');
  const c4 = await addUser(4, EVIL_NAME);

  o1 = await addOrder(c1, '2021-05-10T10:00:00Z', 'delivered', 'paid', [[keyboard, 2, 50], [mouse, 1, 20]]); // 125
  await addOrder(c2, '2021-05-12T09:00:00Z', 'shipped', 'paid', [[mouse, 3, 20]]); // 65
  await addOrder(c1, '2021-05-20T18:30:00Z', 'delivered', 'paid', [[cable, 10, 5], [keyboard, 1, 50]]); // 105
  o4 = await addOrder(c3, '2021-05-15T12:00:00Z', 'cancelled', 'refunded', [[keyboard, 5, 50]]); // 255 ملغي ومسترد
  await addOrder(c3, '2021-05-16T12:00:00Z', 'pending', 'unpaid', [[mouse, 2, 20]]); // 45 غير مدفوع
  await addOrder(c2, '2021-06-02T12:00:00Z', 'delivered', 'paid', [[keyboard, 1, 50]]); // 55 خارج الفترة
  await addOrder(c4, '2021-05-25T12:00:00Z', 'pending', 'unpaid', [[plenty, 1, 10]], '+1+1 Evil St'); // اسم وعنوان خبيثين

  await pool.query(
    `INSERT INTO payments (order_id, amount, status, method, card_brand, card_last4, paid_at)
     VALUES ($1, 125, 'succeeded', 'card', 'visa', '4242', '2021-05-10T10:05:00Z')`,
    [o1],
  );
});

afterAll(async () => {
  await pool.query(`DELETE FROM orders WHERE user_id IN (SELECT id FROM users WHERE email LIKE 'insights-test-%@test.local')`);
  await pool.query(`DELETE FROM users WHERE email LIKE 'insights-test-%@test.local'`);
  await pool.query(`UPDATE products SET active = false WHERE name LIKE 'Insights %'`);
  await pool.end();
});

const insights = (query: string, token = admin) => request(app).get(`/api/analytics/insights?${query}`).set(auth(token));
const RANGE = 'from=2021-05-01&to=2021-05-31&tz=UTC';
type Prod = { id: number; units: number; revenue: number };

describe('access', () => {
  it('is only for staff and admins', async () => {
    expect((await request(app).get('/api/analytics/insights')).status).toBe(401);
    expect((await insights(RANGE, customer)).status).toBe(403);
    expect((await insights(RANGE, staff)).status).toBe(200);
    expect((await request(app).get('/api/export/orders.csv').set(auth(customer))).status).toBe(403);
    expect((await request(app).get('/api/export/customers.csv')).status).toBe(401);
  });
});

describe('top products', () => {
  it('counts only paid orders inside the range', async () => {
    const { body } = await insights(RANGE);
    const units: Prod[] = body.topProducts.byUnits;
    const revenue: Prod[] = body.topProducts.byRevenue;

    // الملغي والمسترد وغير المدفوع والخارج عن الفترة ما بينحسبوا
    expect(units.map((p) => [p.id, p.units, p.revenue])).toEqual([
      [ids.cable, 10, 50],
      [ids.mouse, 4, 80],
      [ids.keyboard, 3, 150],
    ]);
    expect(revenue.map((p) => p.id)).toEqual([ids.keyboard, ids.mouse, ids.cable]);
    expect(body.topProducts.byUnits[0]).toMatchObject({ name: 'Insights Cable', category: 'Insights' });
  });

  it('respects the limit and the range', async () => {
    const one = (await insights(`${RANGE}&limit=1`)).body;
    expect(one.topProducts.byUnits).toHaveLength(1);
    expect(one.topProducts.byRevenue[0].id).toBe(ids.keyboard);

    // الأسبوع الأول من أيار ما فيه مبيعات مدفوعة كثير: بس طلب 10 أيار
    const early = (await insights('from=2021-05-09&to=2021-05-11&tz=UTC')).body;
    expect(early.topProducts.byUnits.map((p: Prod) => [p.id, p.units])).toEqual([
      [ids.keyboard, 2],
      [ids.mouse, 1],
    ]);

    const june = (await insights('from=2021-06-01&to=2021-06-30&tz=UTC')).body;
    expect(june.topProducts.byUnits.map((p: Prod) => p.id)).toEqual([ids.keyboard]);
    expect((await insights('from=2019-01-01&to=2019-01-31&tz=UTC')).body.topProducts.byUnits).toEqual([]);
  });
});

describe('top customers', () => {
  it('ranks by what was actually paid', async () => {
    const { body } = await insights(RANGE);
    const rows = body.topCustomers as { email: string; orders: number; spent: number; lastOrderAt: string }[];
    expect(rows.map((r) => r.email)).toEqual([email(1), email(2)]); // الزبون 3 بدون دفعات
    expect(rows[0]).toMatchObject({ orders: 2, spent: 230 });
    expect(rows[0].lastOrderAt.startsWith('2021-05-20')).toBe(true);
    expect(rows[1]).toMatchObject({ orders: 1, spent: 65 });
  });
});

describe('low stock', () => {
  const low = async (threshold: string) =>
    ((await insights(`${RANGE}&threshold=${threshold}`)).body.lowStock.items as { id: number; stock: number; sold30: number }[]);

  it('lists active products at or below the threshold, lowest first', async () => {
    const items = await low('5');
    const mine = items.filter((i) => Object.values(ids).includes(i.id));
    expect(mine.map((i) => [i.id, i.stock])).toEqual([[ids.cable, 0], [ids.mouse, 4]]);
    // المؤرشف والمنتجات اللي مخزونها كافي ما بتظهر
    expect(items.some((i) => i.id === ids.archived || i.id === ids.keyboard || i.id === ids.plenty)).toBe(false);
  });

  it('follows the threshold', async () => {
    const none = (await low('0')).filter((i) => Object.values(ids).includes(i.id));
    expect(none.map((i) => i.id)).toEqual([ids.cable]);
    const wide = (await low('100')).map((i) => i.id);
    expect(wide).toContain(ids.keyboard);
    expect(wide).toContain(ids.plenty);
  });

  it('shows what sold in the last 30 days', async () => {
    const before = (await low('5')).find((i) => i.id === ids.mouse)!;
    expect(before.sold30).toBe(0);

    const placed = await request(app)
      .post('/api/orders')
      .set(auth(customer))
      .send({ address: 'Nablus, Rafidia St', items: [{ productId: ids.mouse, quantity: 1 }] });
    await payOrder(customer, placed.body.id);

    const after = (await low('5')).find((i) => i.id === ids.mouse)!;
    expect(after.sold30).toBe(1);
    expect(after.stock).toBe(3);
  });

  it('rejects a bad threshold', async () => {
    for (const bad of ['abc', '-1', '5000', '2.5']) expect((await insights(`${RANGE}&threshold=${bad}`)).status, bad).toBe(400);
  });
});

describe('validation', () => {
  it('uses the same range rules as the other reports', async () => {
    expect((await insights('from=nope')).status).toBe(400);
    expect((await insights('to=2999-01-01')).status).toBe(400);
    expect((await insights('tz=Mars/Olympus')).status).toBe(400);
    expect((await insights('')).status).toBe(200);
  });
});

describe('orders CSV', () => {
  const download = (query = RANGE, token = staff) => request(app).get(`/api/export/orders.csv?${query}`).set(auth(token));
  const parsed = async (query = RANGE) => parseCsv((await download(query)).text.replace(/^\uFEFF/, ''));

  it('is a UTF-8 file with a BOM and a download name', async () => {
    const res = await download().buffer(true).parse((r, done) => {
      const chunks: Buffer[] = [];
      r.on('data', (c: Buffer) => chunks.push(c));
      r.on('end', () => done(null, Buffer.concat(chunks)));
    });
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('text/csv; charset=utf-8');
    expect(res.headers['content-disposition']).toBe('attachment; filename="orders_2021-05-01_to_2021-05-31.csv"');
    expect(res.headers['x-export-truncated']).toBe('false');
    expect(res.headers['cache-control']).toBe('no-store');
    const bytes = res.body as Buffer;
    expect([...bytes.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    expect(bytes.toString('utf8')).toContain('\r\n');
  });

  it('has a header and one row per order in the range', async () => {
    const rows = await parsed();
    expect(rows[0]).toEqual([
      'Order ID', 'Created', 'Customer', 'Email', 'Status', 'Payment status', 'Paid at',
      'Units', 'Items', 'Subtotal', 'Discount', 'Discount code', 'Shipping', 'Total', 'Address',
    ]);
    expect(rows).toHaveLength(7); // 6 طلبات بأيار، والطلب بحزيران ما بيدخل
    expect(rows.every((r) => r.length === rows[0].length)).toBe(true);
  });

  it('writes every column of an order correctly', async () => {
    const row = (await parsed()).find((r) => r[0] === String(o1))!;
    expect(row).toEqual([
      String(o1), '2021-05-10 10:00:00', 'Insights One', email(1), 'delivered', 'paid', '2021-05-10 10:05:00',
      '3', '2 x Insights Keyboard; 1 x Insights Mouse', '120.00', '0.00', '', '5.00', '125.00', ADDRESS,
    ]);
  });

  it('uses the requested time zone', async () => {
    const utc = (await parsed()).find((r) => r[0] === String(o1))![1];
    const local = (await parsed(`${RANGE.replace('tz=UTC', 'tz=Asia/Jerusalem')}`)).find((r) => r[0] === String(o1))![1];
    expect(local).not.toBe(utc);
    expect(local.startsWith('2021-05-10')).toBe(true);
  });

  it('filters by status', async () => {
    const rows = await parsed(`${RANGE}&status=cancelled`);
    expect(rows.slice(1).map((r) => r[0])).toEqual([String(o4)]);
    expect((await download(`${RANGE}&status=nonsense`)).status).toBe(400);
  });

  it('defuses formulas typed by customers', async () => {
    const rows = await parsed();
    const row = rows.find((r) => r[3] === email(4))!;
    expect(row[2]).toBe(`'${EVIL_NAME}`);
    expect(row[14]).toBe("'+1+1 Evil St");
  });

  it('rejects bad ranges', async () => {
    expect((await download('from=2021-05-31&to=2021-05-01')).status).toBe(400);
    expect((await download('tz=nope!')).status).toBe(400);
  });
});

describe('customers CSV', () => {
  it('lists customers with their totals and nothing sensitive', async () => {
    const res = await request(app).get('/api/export/customers.csv').set(auth(staff));
    expect(res.status).toBe(200);
    expect(res.headers['content-disposition']).toMatch(/^attachment; filename="customers_\d{4}-\d{2}-\d{2}\.csv"$/);

    const rows = parseCsv(res.text.replace(/^\uFEFF/, ''));
    expect(rows[0]).toEqual(['Customer ID', 'Name', 'Email', 'Phone', 'Joined', 'Orders', 'Paid orders', 'Total spent', 'Last order']);
    expect(res.text).not.toMatch(/password|hash/i);

    const byEmail = (e: string) => rows.find((r) => r[2] === e)!;
    expect(byEmail(email(1))).toMatchObject({ 1: 'Insights One', 5: '2', 6: '2', 7: '230.00' });
    expect(byEmail(email(2))).toMatchObject({ 5: '2', 6: '2', 7: '120.00' }); // 65 + 55
    expect(byEmail(email(3))).toMatchObject({ 5: '1', 6: '0', 7: '0.00' }); // الملغي ما بينحسب
    expect(byEmail(email(4))[1]).toBe(`'${EVIL_NAME}`);
    expect(rows.some((r) => r[2] === 'admin@example.com')).toBe(false); // الموظفين مش زبائن
  });
});

describe('single product for the admin', () => {
  it('returns one product for staff and admin only', async () => {
    const ok = await request(app).get(`/api/admin/products/${ids.mouse}`).set(auth(staff));
    expect(ok.status).toBe(200);
    expect(ok.body).toMatchObject({ id: ids.mouse, name: 'Insights Mouse', category: 'Insights' });
    expect(typeof ok.body.views).toBe('number');

    expect((await request(app).get(`/api/admin/products/${ids.mouse}`).set(auth(customer))).status).toBe(403);
    expect((await request(app).get('/api/admin/products/99999999').set(auth(admin))).status).toBe(404);
    expect((await request(app).get('/api/admin/products/abc').set(auth(admin))).status).toBe(404);
  });
});