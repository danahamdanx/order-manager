import express from 'express';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { db, STATUSES } from './db.js';
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
app.use(cors({ origin: 'http://localhost:5173' }));
app.use(express.json());

// ---------- Helpers ----------
interface UserRow {
  id: number;
  name: string;
  email: string;
  password_hash: string;
  role: Role;
}
const publicUser = (u: UserRow) => ({ id: u.id, name: u.name, email: u.email, role: u.role });
const signToken = (u: UserRow) => jwt.sign({ user_id: u.id, role: u.role }, JWT_SECRET, { expiresIn: '8h' });

// الدور بيجي من السيرفر دايمًا، مش من الطلب
function createUser(body: any, role: Role): UserRow {
  const { name, email, password, phone } = body ?? {};
  const errors: string[] = [];
  if (typeof name !== 'string' || !name.trim()) errors.push('name is required');
  if (!isValidEmail(email)) errors.push('email is invalid');
  if (typeof password !== 'string' || password.length < 8) errors.push('password must be at least 8 characters');
  if (phone !== undefined && typeof phone !== 'string') errors.push('phone must be a string');
  if (errors.length) throw new HttpError(400, 'Validation failed', errors);

  try {
    const info = db
      .prepare('INSERT INTO users (name, email, password_hash, phone, role) VALUES (?, ?, ?, ?, ?)')
      .run(name.trim(), email.trim().toLowerCase(), bcrypt.hashSync(password, 10), phone?.trim() || null, role);
    return db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid) as UserRow;
  } catch (err) {
    if (err instanceof Error && err.message.includes('UNIQUE')) {
      throw new HttpError(409, 'Email is already registered');
    }
    throw err;
  }
}

const ORDER_SELECT = `
  SELECT o.id, o.user_id AS userId, u.name AS customerName, u.email AS customerEmail,
         o.status, o.total, o.shipping, o.address, o.created_at AS createdAt
  FROM orders o JOIN users u ON u.id = o.user_id`;

const itemsStmt = db.prepare(
  `SELECT product_id AS productId, product_name AS productName, unit_price AS unitPrice, quantity
   FROM order_items WHERE order_id = ?`,
);
const withItems = <T extends { id: number }>(order: T) => ({ ...order, items: itemsStmt.all(order.id) });
const getOrder = (id: number) => db.prepare(`${ORDER_SELECT} WHERE o.id = ?`).get(id) as
  | ({ id: number; userId: number; status: Status })
  | undefined;

// تغيير الحالة، وإرجاع المخزون إذا انلغى الطلب
const changeStatus = db.transaction((orderId: number, next: Status) => {
  const order = db.prepare('SELECT id, status FROM orders WHERE id = ?').get(orderId) as
    | { id: number; status: Status }
    | undefined;
  if (!order) throw new HttpError(404, 'Order not found');
  if (order.status === 'delivered' || order.status === 'cancelled') {
    throw new HttpError(409, `Order is already ${order.status}`);
  }
  if (next === 'cancelled') {
    db.prepare(
      `UPDATE products SET stock = stock + (
         SELECT quantity FROM order_items WHERE order_id = ? AND product_id = products.id
       ) WHERE id IN (SELECT product_id FROM order_items WHERE order_id = ?)`,
    ).run(orderId, orderId);
  }
  db.prepare('UPDATE orders SET status = ? WHERE id = ?').run(next, orderId);
});

// ---------- Auth ----------
app.post('/api/auth/register', (req, res) => {
  const user = createUser(req.body, 'customer');
  res.status(201).json({ token: signToken(user), user: publicUser(user) });
});

app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body ?? {};
  if (typeof email !== 'string' || typeof password !== 'string') {
    throw new HttpError(400, 'Email and password are required');
  }
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email.trim().toLowerCase()) as
    | UserRow
    | undefined;
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    throw new HttpError(401, 'Invalid email or password');
  }
  res.json({ token: signToken(user), user: publicUser(user) });
});

app.get('/api/auth/me', authenticate, (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user!.user_id) as UserRow | undefined;
  if (!user) throw new HttpError(401, 'User no longer exists');
  res.json(publicUser(user));
});

// الـ admin بس بيعمل حسابات staff
app.post('/api/staff', authenticate, authorizeRoles('admin'), (req, res) => {
  const user = createUser(req.body, 'staff');
  res.status(201).json(publicUser(user));
});

// ---------- Products (عام، بدون تسجيل دخول) ----------
app.get('/api/products', (req, res) => {
  const { category, search } = req.query;
  const where: string[] = [];
  const params: Record<string, string> = {};
  if (typeof category === 'string' && category) {
    where.push('category = @category');
    params.category = category;
  }
  if (typeof search === 'string' && search.trim()) {
    where.push('(name LIKE @like OR description LIKE @like)');
    params.like = `%${search.trim()}%`;
  }
  const sql = `SELECT * FROM products ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY id`;
  res.json(db.prepare(sql).all(params));
});

app.get('/api/products/:id', (req, res) => {
  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(Number(req.params.id));
  if (!product) throw new HttpError(404, 'Product not found');
  res.json(product);
});

// ---------- Orders: الزبون ----------
const placeOrder = db.transaction((userId: number, address: string, items: Map<number, number>) => {
  let subtotal = 0;
  const lines: { id: number; name: string; price: number; qty: number }[] = [];

  for (const [productId, qty] of items) {
    const p = db.prepare('SELECT id, name, price, stock FROM products WHERE id = ?').get(productId) as
      | { id: number; name: string; price: number; stock: number }
      | undefined;
    if (!p) throw new HttpError(400, `Product ${productId} not found`);
    if (p.stock < qty) throw new HttpError(409, `Not enough stock for ${p.name}`);
    subtotal += p.price * qty; // السعر من قاعدة البيانات، مش من الزبون
    lines.push({ id: p.id, name: p.name, price: p.price, qty });
  }

  const total = Math.round((subtotal + SHIPPING) * 100) / 100;
  const info = db
    .prepare('INSERT INTO orders (user_id, address, shipping, total) VALUES (?, ?, ?, ?)')
    .run(userId, address, SHIPPING, total);
  const orderId = Number(info.lastInsertRowid);

  const addItem = db.prepare(
    'INSERT INTO order_items (order_id, product_id, product_name, unit_price, quantity) VALUES (?, ?, ?, ?, ?)',
  );
  const takeStock = db.prepare('UPDATE products SET stock = stock - ? WHERE id = ?');
  for (const l of lines) {
    addItem.run(orderId, l.id, l.name, l.price, l.qty);
    takeStock.run(l.qty, l.id);
  }
  return orderId;
});

   app.post('/api/orders', authenticate, authorizeRoles('customer'), (req, res) => {
     const { items, address } = req.body ?? {};
     const errors: string[] = [];
     if (typeof address !== 'string' || address.trim().length < 5) {
       errors.push('address is required (at least 5 characters)');
     }
     const { merged, error } = parseOrderItems(items);
     if (error) errors.push(error);
     if (errors.length) throw new HttpError(400, 'Validation failed', errors);

     const orderId = placeOrder(req.user!.user_id, address.trim(), merged);
     res.status(201).json(withItems(getOrder(orderId)!));
   });

app.get('/api/orders/mine', authenticate, authorizeRoles('customer'), (req, res) => {
  const rows = db.prepare(`${ORDER_SELECT} WHERE o.user_id = ? ORDER BY o.id DESC`).all(req.user!.user_id) as {
    id: number;
  }[];
  res.json(rows.map(withItems));
});

app.post('/api/orders/:id/cancel', authenticate, authorizeRoles('customer'), (req, res) => {
  const id = Number(req.params.id);
  const order = getOrder(id);
  if (!order || order.userId !== req.user!.user_id) throw new HttpError(404, 'Order not found');
  if (order.status !== 'pending') throw new HttpError(409, 'Only pending orders can be cancelled');
  changeStatus(id, 'cancelled');
  res.json(withItems(getOrder(id)!));
});

// ---------- Orders: staff / admin ----------
app.get('/api/orders', authenticate, authorizeRoles('admin', 'staff'), (req, res) => {
  const { status, search } = req.query;
  const where: string[] = [];
  const params: Record<string, string> = {};
  if (typeof status === 'string' && status) {
    where.push('o.status = @status');
    params.status = status;
  }
  if (typeof search === 'string' && search.trim()) {
    where.push('(u.name LIKE @like OR u.email LIKE @like OR CAST(o.id AS TEXT) = @raw)');
    params.like = `%${search.trim()}%`;
    params.raw = search.trim();
  }
  const sql = `${ORDER_SELECT} ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY o.id DESC`;
  res.json((db.prepare(sql).all(params) as { id: number }[]).map(withItems));
});

// الزبون بيشوف طلباته بس، والـ staff/admin بيشوفوا الكل
app.get('/api/orders/:id', authenticate, (req, res) => {
  const order = getOrder(Number(req.params.id));
  const isStaff = req.user!.role !== 'customer';
  if (!order || (!isStaff && order.userId !== req.user!.user_id)) {
    throw new HttpError(404, 'Order not found');
  }
  res.json(withItems(order));
});

app.patch('/api/orders/:id/status', authenticate, authorizeRoles('admin', 'staff'), (req, res) => {
  const id = Number(req.params.id);
  const { status } = req.body ?? {};
  if (!STATUSES.includes(status)) {
    throw new HttpError(400, 'Validation failed', [`status must be one of: ${STATUSES.join(', ')}`]);
  }
  changeStatus(id, status);
  res.json(withItems(getOrder(id)!));
});

app.delete('/api/orders/:id', authenticate, authorizeRoles('admin'), (req, res) => {
  const info = db.prepare('DELETE FROM orders WHERE id = ?').run(Number(req.params.id));
  if (info.changes === 0) throw new HttpError(404, 'Order not found');
  res.status(204).end();
});

// ---------- Customers (staff / admin) ----------
app.get('/api/customers', authenticate, authorizeRoles('admin', 'staff'), (req, res) => {
  const { search } = req.query;
  const params: Record<string, string> = {};
  let filter = '';
  if (typeof search === 'string' && search.trim()) {
    filter = 'AND (u.name LIKE @like OR u.email LIKE @like)';
    params.like = `%${search.trim()}%`;
  }
  const rows = db
    .prepare(
      `SELECT u.id, u.name, u.email, u.phone, u.created_at AS createdAt,
              COUNT(o.id) AS ordersCount,
              ROUND(COALESCE(SUM(CASE WHEN o.status != 'cancelled' THEN o.total END), 0), 2) AS totalSpent
       FROM users u LEFT JOIN orders o ON o.user_id = u.id
       WHERE u.role = 'customer' ${filter}
       GROUP BY u.id ORDER BY u.id`,
    )
    .all(params);
  res.json(rows);
});

app.get('/api/customers/:id', authenticate, authorizeRoles('admin', 'staff'), (req, res) => {
  const id = Number(req.params.id);
  const customer = db
    .prepare("SELECT id, name, email, phone, created_at AS createdAt FROM users WHERE id = ? AND role = 'customer'")
    .get(id);
  if (!customer) throw new HttpError(404, 'Customer not found');
  const orders = db.prepare(`${ORDER_SELECT} WHERE o.user_id = ? ORDER BY o.id DESC`).all(id) as { id: number }[];
  res.json({ ...customer, orders: orders.map(withItems) });
});

// ---------- Stats (staff / admin) ----------
app.get('/api/stats', authenticate, authorizeRoles('admin', 'staff'), (_req, res) => {
  const rows = db.prepare('SELECT status, COUNT(*) AS count FROM orders GROUP BY status').all() as {
    status: Status;
    count: number;
  }[];
  const byStatus = Object.fromEntries(STATUSES.map((s) => [s, 0])) as Record<Status, number>;
  for (const r of rows) byStatus[r.status] = r.count;

  const { revenue } = db
    .prepare("SELECT ROUND(COALESCE(SUM(total), 0), 2) AS revenue FROM orders WHERE status != 'cancelled'")
    .get() as { revenue: number };
  const { customers } = db.prepare("SELECT COUNT(*) AS customers FROM users WHERE role = 'customer'").get() as {
    customers: number;
  };

  res.json({
    totalOrders: Object.values(byStatus).reduce((a, b) => a + b, 0),
    revenue,
    customers,
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