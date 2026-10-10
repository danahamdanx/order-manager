import express from 'express';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { pool, query, queryOne, withTransaction, STATUSES } from './db.js';
import type { Role, Status } from './db.js';
import { authenticate, authorizeRoles, JWT_SECRET } from './auth.js';
import { isValidEmail, parseOrderItems } from './validation.js';

const SHIPPING = 5;

class HttpError extends Error {
  status: number;
  details: string[];
  constructor(status: number, message: string, details: string[] = []) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

const app = express();
app.use(cors({ origin: process.env.CLIENT_ORIGIN ?? 'http://localhost:5173' }));
app.use(express.json());

// ---------- Types ----------
interface UserRow {
  id: number;
  name: string;
  email: string;
  password_hash: string;
  role: Role;
}
interface ProductRow {
  id: number;
  name: string;
  price: number;
  stock: number;
}
interface OrderRow {
  id: number;
  userId: number;
  customerName: string;
  customerEmail: string;
  status: Status;
  total: number;
  shipping: number;
  address: string;
  createdAt: Date;
}
interface OrderItemRow {
  productId: number;
  productName: string;
  unitPrice: number;
  quantity: number;
}

// ---------- Helpers ----------
const publicUser = (u: UserRow) => ({ id: u.id, name: u.name, email: u.email, role: u.role });
const signToken = (u: UserRow) => jwt.sign({ user_id: u.id, role: u.role }, JWT_SECRET, { expiresIn: '8h' });

// بيضيف القيمة للـ params وبيرجع $1 أو $2... حسب مكانها
const bind = (params: unknown[], value: unknown) => {
  params.push(value);
  return `$${params.length}`;
};

// id غير صالح بيرجع 404 بدل ما يوصل لقاعدة البيانات ويعمل خطأ
function idOf(value: string | undefined): number {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1 || n > 2147483647) throw new HttpError(404, 'Not found');
  return n;
}

// الدور بيجي من السيرفر دايمًا، مش من الطلب
async function createUser(body: any, role: Role): Promise<UserRow> {
  const { name, email, password, phone } = body ?? {};
  const errors: string[] = [];
  if (typeof name !== 'string' || !name.trim()) errors.push('name is required');
  if (!isValidEmail(email)) errors.push('email is invalid');
  if (typeof password !== 'string' || password.length < 8) errors.push('password must be at least 8 characters');
  if (phone !== undefined && typeof phone !== 'string') errors.push('phone must be a string');
  if (errors.length) throw new HttpError(400, 'Validation failed', errors);

  try {
    const user = await queryOne<UserRow>(
      'INSERT INTO users (name, email, password_hash, phone, role) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [name.trim(), email.trim().toLowerCase(), await bcrypt.hash(password, 10), phone?.trim() || null, role],
    );
    return user!;
  } catch (err) {
    // 23505 = unique_violation
    if ((err as { code?: string }).code === '23505') throw new HttpError(409, 'Email is already registered');
    throw err;
  }
}

const ORDER_SELECT = `
  SELECT o.id, o.user_id AS "userId", u.name AS "customerName", u.email AS "customerEmail",
         o.status, o.total, o.shipping, o.address, o.created_at AS "createdAt"
  FROM orders o JOIN users u ON u.id = o.user_id`;

// بنجيب بنود كل الطلبات بـ query واحد (بدل query لكل طلب)
async function attachItems<T extends { id: number }>(orders: T[]) {
  if (orders.length === 0) return [] as (T & { items: OrderItemRow[] })[];

  const rows = await query<OrderItemRow & { orderId: number }>(
    `SELECT order_id AS "orderId", product_id AS "productId", product_name AS "productName",
            unit_price AS "unitPrice", quantity
     FROM order_items WHERE order_id = ANY($1::int[]) ORDER BY id`,
    [orders.map((o) => o.id)],
  );

  const byOrder = new Map<number, OrderItemRow[]>();
  for (const { orderId, ...item } of rows) {
    const list = byOrder.get(orderId);
    if (list) list.push(item);
    else byOrder.set(orderId, [item]);
  }
  return orders.map((o) => ({ ...o, items: byOrder.get(o.id) ?? [] }));
}

async function loadOrder(id: number) {
  const order = await queryOne<OrderRow>(`${ORDER_SELECT} WHERE o.id = $1`, [id]);
  if (!order) throw new HttpError(404, 'Order not found');
  return (await attachItems([order]))[0];
}

// تغيير الحالة داخل transaction، مع قفل صف الطلب. وبيرجع المخزون إذا انلغى الطلب
async function changeStatus(orderId: number, next: Status, onlyFrom?: Status) {
  await withTransaction(async (client) => {
    const found = await client.query<{ status: Status }>('SELECT status FROM orders WHERE id = $1 FOR UPDATE', [orderId]);
    const order = found.rows[0];
    if (!order) throw new HttpError(404, 'Order not found');
    if (onlyFrom && order.status !== onlyFrom) {
      throw new HttpError(409, `Only ${onlyFrom} orders can be cancelled`);
    }
    if (order.status === 'delivered' || order.status === 'cancelled') {
      throw new HttpError(409, `Order is already ${order.status}`);
    }
    if (next === 'cancelled') {
      await client.query(
        `UPDATE products p SET stock = p.stock + oi.quantity
         FROM order_items oi WHERE oi.order_id = $1 AND oi.product_id = p.id`,
        [orderId],
      );
    }
    await client.query('UPDATE orders SET status = $1 WHERE id = $2', [next, orderId]);
  });
}

async function placeOrder(userId: number, address: string, items: Map<number, number>): Promise<number> {
  return withTransaction(async (client) => {
    const lines: { id: number; name: string; price: number; qty: number }[] = [];
    let subtotal = 0;

    // FOR UPDATE بيقفل صف المنتج: طلبين لنفس آخر قطعة ما بيقدروا ينجحوا سوا
    // والترتيب الثابت بيمنع deadlock بين طلبين متزامنين
    for (const productId of [...items.keys()].sort((a, b) => a - b)) {
      const qty = items.get(productId)!;
      const found = await client.query<ProductRow>(
        'SELECT id, name, price, stock FROM products WHERE id = $1 FOR UPDATE',
        [productId],
      );
      const p = found.rows[0];
      if (!p) throw new HttpError(400, `Product ${productId} not found`);
      if (p.stock < qty) throw new HttpError(409, `Not enough stock for ${p.name}`);
      subtotal += p.price * qty; // السعر من قاعدة البيانات، مش من الزبون
      lines.push({ id: p.id, name: p.name, price: p.price, qty });
    }

    const total = Math.round((subtotal + SHIPPING) * 100) / 100;
    const created = await client.query<{ id: number }>(
      'INSERT INTO orders (user_id, address, shipping, total) VALUES ($1, $2, $3, $4) RETURNING id',
      [userId, address, SHIPPING, total],
    );
    const orderId = created.rows[0].id;

    for (const l of lines) {
      await client.query(
        'INSERT INTO order_items (order_id, product_id, product_name, unit_price, quantity) VALUES ($1, $2, $3, $4, $5)',
        [orderId, l.id, l.name, l.price, l.qty],
      );
      await client.query('UPDATE products SET stock = stock - $1 WHERE id = $2', [l.qty, l.id]);
    }
    return orderId;
  });
}

// ---------- Health ----------
app.get('/api/health', async (_req, res) => {
  await pool.query('SELECT 1');
  res.json({ status: 'ok' });
});

// ---------- Auth ----------
app.post('/api/auth/register', async (req, res) => {
  const user = await createUser(req.body, 'customer');
  res.status(201).json({ token: signToken(user), user: publicUser(user) });
});

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body ?? {};
  if (typeof email !== 'string' || typeof password !== 'string') {
    throw new HttpError(400, 'Email and password are required');
  }
  const user = await queryOne<UserRow>('SELECT * FROM users WHERE email = $1', [email.trim().toLowerCase()]);
  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    throw new HttpError(401, 'Invalid email or password');
  }
  res.json({ token: signToken(user), user: publicUser(user) });
});

app.get('/api/auth/me', authenticate, async (req, res) => {
  const user = await queryOne<UserRow>('SELECT * FROM users WHERE id = $1', [req.user!.user_id]);
  if (!user) throw new HttpError(401, 'User no longer exists');
  res.json(publicUser(user));
});

// الـ admin بس بيعمل حسابات staff
app.post('/api/staff', authenticate, authorizeRoles('admin'), async (req, res) => {
  const user = await createUser(req.body, 'staff');
  res.status(201).json(publicUser(user));
});

// ---------- Products (عام، بدون تسجيل دخول) ----------
app.get('/api/products', async (req, res) => {
  const { category, search } = req.query;
  const where: string[] = [];
  const params: unknown[] = [];

  if (typeof category === 'string' && category) {
    where.push(`category = ${bind(params, category)}`);
  }
  if (typeof search === 'string' && search.trim()) {
    const like = bind(params, `%${search.trim()}%`);
    where.push(`(name ILIKE ${like} OR description ILIKE ${like})`);
  }

  const sql = `SELECT id, name, description, category, price, stock, icon, color
               FROM products ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY id`;
  res.json(await query(sql, params));
});

app.get('/api/products/:id', async (req, res) => {
  const product = await queryOne(
    'SELECT id, name, description, category, price, stock, icon, color FROM products WHERE id = $1',
    [idOf(req.params.id)],
  );
  if (!product) throw new HttpError(404, 'Product not found');
  res.json(product);
});

// ---------- Orders: الزبون ----------
app.post('/api/orders', authenticate, authorizeRoles('customer'), async (req, res) => {
  const { items, address } = req.body ?? {};
  const errors: string[] = [];
  if (typeof address !== 'string' || address.trim().length < 5) {
    errors.push('address is required (at least 5 characters)');
  }
  const { merged, error } = parseOrderItems(items);
  if (error) errors.push(error);
  if (errors.length) throw new HttpError(400, 'Validation failed', errors);

  const orderId = await placeOrder(req.user!.user_id, address.trim(), merged);
  res.status(201).json(await loadOrder(orderId));
});

app.get('/api/orders/mine', authenticate, authorizeRoles('customer'), async (req, res) => {
  const orders = await query<OrderRow>(`${ORDER_SELECT} WHERE o.user_id = $1 ORDER BY o.id DESC`, [
    req.user!.user_id,
  ]);
  res.json(await attachItems(orders));
});

app.post('/api/orders/:id/cancel', authenticate, authorizeRoles('customer'), async (req, res) => {
  const id = idOf(req.params.id);
  const order = await loadOrder(id);
  if (order.userId !== req.user!.user_id) throw new HttpError(404, 'Order not found');

  await changeStatus(id, 'cancelled', 'pending');
  res.json(await loadOrder(id));
});

// ---------- Orders: staff / admin ----------
app.get('/api/orders', authenticate, authorizeRoles('admin', 'staff'), async (req, res) => {
  const { status, search } = req.query;
  const where: string[] = [];
  const params: unknown[] = [];

  if (typeof status === 'string' && status) {
    where.push(`o.status = ${bind(params, status)}`);
  }
  if (typeof search === 'string' && search.trim()) {
    const like = bind(params, `%${search.trim()}%`);
    const raw = bind(params, search.trim());
    where.push(`(u.name ILIKE ${like} OR u.email ILIKE ${like} OR CAST(o.id AS TEXT) = ${raw})`);
  }

  const orders = await query<OrderRow>(
    `${ORDER_SELECT} ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY o.id DESC`,
    params,
  );
  res.json(await attachItems(orders));
});

// الزبون بيشوف طلباته بس، والـ staff/admin بيشوفوا الكل
app.get('/api/orders/:id', authenticate, async (req, res) => {
  const order = await loadOrder(idOf(req.params.id));
  const isStaff = req.user!.role !== 'customer';
  if (!isStaff && order.userId !== req.user!.user_id) throw new HttpError(404, 'Order not found');
  res.json(order);
});

app.patch('/api/orders/:id/status', authenticate, authorizeRoles('admin', 'staff'), async (req, res) => {
  const id = idOf(req.params.id);
  const { status } = req.body ?? {};
  if (!STATUSES.includes(status)) {
    throw new HttpError(400, 'Validation failed', [`status must be one of: ${STATUSES.join(', ')}`]);
  }
  await changeStatus(id, status);
  res.json(await loadOrder(id));
});

app.delete('/api/orders/:id', authenticate, authorizeRoles('admin'), async (req, res) => {
  const result = await pool.query('DELETE FROM orders WHERE id = $1', [idOf(req.params.id)]);
  if (result.rowCount === 0) throw new HttpError(404, 'Order not found');
  res.status(204).end();
});

// ---------- Customers (staff / admin) ----------
app.get('/api/customers', authenticate, authorizeRoles('admin', 'staff'), async (req, res) => {
  const { search } = req.query;
  const params: unknown[] = [];
  let filter = '';
  if (typeof search === 'string' && search.trim()) {
    const like = bind(params, `%${search.trim()}%`);
    filter = `AND (u.name ILIKE ${like} OR u.email ILIKE ${like})`;
  }

  res.json(
    await query(
      `SELECT u.id, u.name, u.email, u.phone, u.created_at AS "createdAt",
              COUNT(o.id) AS "ordersCount",
              ROUND(COALESCE(SUM(CASE WHEN o.status <> 'cancelled' THEN o.total END), 0), 2) AS "totalSpent"
       FROM users u LEFT JOIN orders o ON o.user_id = u.id
       WHERE u.role = 'customer' ${filter}
       GROUP BY u.id ORDER BY u.id`,
      params,
    ),
  );
});

app.get('/api/customers/:id', authenticate, authorizeRoles('admin', 'staff'), async (req, res) => {
  const id = idOf(req.params.id);
  const customer = await queryOne(
    `SELECT id, name, email, phone, created_at AS "createdAt" FROM users WHERE id = $1 AND role = 'customer'`,
    [id],
  );
  if (!customer) throw new HttpError(404, 'Customer not found');

  const orders = await query<OrderRow>(`${ORDER_SELECT} WHERE o.user_id = $1 ORDER BY o.id DESC`, [id]);
  res.json({ ...customer, orders: await attachItems(orders) });
});

// ---------- Stats (staff / admin) ----------
app.get('/api/stats', authenticate, authorizeRoles('admin', 'staff'), async (_req, res) => {
  const [rows, revenueRow, customersRow] = await Promise.all([
    query<{ status: Status; count: number }>('SELECT status, COUNT(*) AS count FROM orders GROUP BY status'),
    queryOne<{ revenue: number }>(
      `SELECT ROUND(COALESCE(SUM(total), 0), 2) AS revenue FROM orders WHERE status <> 'cancelled'`,
    ),
    queryOne<{ customers: number }>(`SELECT COUNT(*) AS customers FROM users WHERE role = 'customer'`),
  ]);

  const byStatus = Object.fromEntries(STATUSES.map((s) => [s, 0])) as Record<Status, number>;
  for (const r of rows) byStatus[r.status] = r.count;

  res.json({
    totalOrders: Object.values(byStatus).reduce((a, b) => a + b, 0),
    revenue: revenueRow?.revenue ?? 0,
    customers: customersRow?.customers ?? 0,
    byStatus,
  });
});

// ---------- Error handler ----------
app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.message, ...(err.details.length && { details: err.details }) });
  }
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

export default app;