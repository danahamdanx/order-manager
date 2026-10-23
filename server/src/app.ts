import express from 'express';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { pool, query, queryOne, withTransaction, STATUSES } from './db.js';
import { authenticate, authorizeRoles, JWT_SECRET } from './auth.js';
import type { QueryResultRow } from 'pg';
import type { PaymentStatus, Role, Status } from './db.js';
import { isValidEmail, parseOrderItems, parsePaging, parseIdempotencyKey, parseProductInput, sniffImageType } from './validation.js';
import { HttpError } from './errors.js';
import { createMockGatewayRouter } from './gateway/mock.js';
import { getPayment, paymentResponse, processGatewayEvent, startPayment } from './payments.js';
import { evaluateDiscount, fromCents, normalizeCode, parseDiscountInput, parseDiscountUpdate, toCents } from './discounts.js';
import type { DiscountRule } from './discounts.js';

const SHIPPING = 5;

const app = express();
const allowedOrigins = (process.env.CLIENT_ORIGIN ?? 'http://localhost:5173').split(',').map((o) => o.trim());
app.use(cors({ origin: allowedOrigins }));
app.use(
  express.json({
    verify: (req, _res, buf) => {
      (req as express.Request).rawBody = buf;
    },
  }),
);
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
  active: boolean;
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
  paymentStatus: PaymentStatus;
  cardBrand: string | null;
  cardLast4: string | null;
  paymentFailure: string | null;
  subtotal: number;
  discount: number;
  discountCode: string | null;
  paidAt: Date | null;
  refundedAt: Date | null;
  createdAt: Date;
}
interface OrderItemRow {
  productId: number;
  productName: string;
  unitPrice: number;
  quantity: number;
  icon: string;
  color: string;
  imageVersion: number | null;
}

// ---------- Helpers ----------
const publicUser = (u: UserRow) => ({ id: u.id, name: u.name, email: u.email, role: u.role });
const signToken = (u: UserRow) => jwt.sign({ user_id: u.id, role: u.role }, JWT_SECRET, { expiresIn: '8h' });

// بيضيف القيمة للـ params وبيرجع $1 أو $2... حسب مكانها
const bind = (params: unknown[], value: unknown) => {
  params.push(value);
  return `$${params.length}`;
};

// بتجيب العدد الكلي، وبتحصر رقم الصفحة بين 1 وآخر صفحة، وبتجيب العناصر
async function queryPage<T extends QueryResultRow>(
  countSql: string,
  listSql: string,
  params: unknown[],
  paging: { page: number; limit: number },
) {
  const counted = await queryOne<{ total: number }>(countSql, params);
  const total = counted?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / paging.limit));
  const page = Math.min(paging.page, pages);

  const listParams = [...params];
  const items = await query<T>(
    `${listSql} LIMIT ${bind(listParams, paging.limit)} OFFSET ${bind(listParams, (page - 1) * paging.limit)}`,
    listParams,
  );
  return { items, total, page, pages };
}

// id غير صالح بيرجع 404 بدل ما يوصل لقاعدة البيانات ويعمل خطأ
function idOf(value: unknown): number {
  const n = typeof value === 'string' ? Number(value) : NaN;
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
         o.status, o.payment_status AS "paymentStatus", o.subtotal, o.discount,
         o.discount_code AS "discountCode", o.total, o.shipping, o.address, o.created_at AS "createdAt",
         (SELECT pm.card_brand FROM payments pm WHERE pm.order_id = o.id AND pm.status IN ('succeeded', 'refunded')
           ORDER BY pm.id DESC LIMIT 1) AS "cardBrand",
         (SELECT pm.card_last4 FROM payments pm WHERE pm.order_id = o.id AND pm.status IN ('succeeded', 'refunded')
           ORDER BY pm.id DESC LIMIT 1) AS "cardLast4",
         (SELECT pm.failure_reason FROM payments pm WHERE pm.order_id = o.id AND pm.status = 'failed'
           ORDER BY pm.id DESC LIMIT 1) AS "paymentFailure",
         (SELECT pm.paid_at FROM payments pm WHERE pm.order_id = o.id AND pm.status IN ('succeeded', 'refunded')
           ORDER BY pm.id DESC LIMIT 1) AS "paidAt",
         (SELECT pm.refunded_at FROM payments pm WHERE pm.order_id = o.id AND pm.status = 'refunded'
           ORDER BY pm.id DESC LIMIT 1) AS "refundedAt"
  FROM orders o JOIN users u ON u.id = o.user_id`;

// بنجيب بنود كل الطلبات بـ query واحد (بدل query لكل طلب)
async function attachItems<T extends { id: number }>(orders: T[]) {
  if (orders.length === 0) return [] as (T & { items: OrderItemRow[] })[];

    const rows = await query<OrderItemRow & { orderId: number }>(
    `SELECT oi.order_id AS "orderId", oi.product_id AS "productId", oi.product_name AS "productName",
            oi.unit_price AS "unitPrice", oi.quantity, p.icon, p.color,
            (SELECT EXTRACT(EPOCH FROM i.updated_at)::bigint FROM product_images i
              WHERE i.product_id = oi.product_id) AS "imageVersion"
     FROM order_items oi JOIN products p ON p.id = oi.product_id
     WHERE oi.order_id = ANY($1::int[]) ORDER BY oi.id`,
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

// هدول الحالات بتحتاج دفع كامل قبلها
const PAID_REQUIRED: Status[] = ['processing', 'shipped', 'delivered'];

// تغيير الحالة داخل transaction، مع قفل صف الطلب
async function changeStatus(orderId: number, next: Status, onlyFrom?: Status) {
  await withTransaction(async (client) => {
    const found = await client.query<{ status: Status; payment_status: PaymentStatus }>(
      'SELECT status, payment_status FROM orders WHERE id = $1 FOR UPDATE',
      [orderId],
    );
    const order = found.rows[0];
    if (!order) throw new HttpError(404, 'Order not found');
    if (onlyFrom && order.status !== onlyFrom) {
      throw new HttpError(409, `Only ${onlyFrom} orders can be cancelled`);
    }
    if (order.status === 'delivered' || order.status === 'cancelled') {
      throw new HttpError(409, `Order is already ${order.status}`);
    }
    if (PAID_REQUIRED.includes(next) && order.payment_status !== 'paid') {
      throw new HttpError(409, 'The order must be paid before it can be processed');
    }

    if (next === 'cancelled') {
      // 1) بنرجع المخزون
      await client.query(
        `UPDATE products p SET stock = p.stock + oi.quantity
         FROM order_items oi WHERE oi.order_id = $1 AND oi.product_id = p.id`,
        [orderId],
      );
      // 2) الطلب الملغي ما بيحسب من استخدامات كود الخصم
      await client.query(
        `UPDATE discount_codes SET times_used = GREATEST(times_used - 1, 0)
         WHERE id = (SELECT discount_code_id FROM orders WHERE id = $1)`,
        [orderId],
      );
      // 3) أي دفعة مفتوحة بتنسكّر (مش ممكن تنجح بعد الإلغاء)
      await client.query(
        `UPDATE payments SET status = 'failed', failure_reason = 'order_cancelled', updated_at = now()
         WHERE order_id = $1 AND status = 'requires_payment'`,
        [orderId],
      );
      // 4) وإذا الطلب مدفوع، بنعتبر الدفعة مستردة وبنسجل الوقت
      if (order.payment_status === 'paid') {
        await client.query(
          `UPDATE payments SET status = 'refunded', refunded_at = now(), updated_at = now()
           WHERE order_id = $1 AND status = 'succeeded'`,
          [orderId],
        );
        await client.query(`UPDATE orders SET payment_status = 'refunded' WHERE id = $1`, [orderId]);
      }
    }
    await client.query('UPDATE orders SET status = $1 WHERE id = $2', [next, orderId]);
  });
}

interface CodeRow extends DiscountRule {
  id: number;
}
const CODE_COLUMNS = `id, code, type, value, expires_at AS "expiresAt", usage_limit AS "usageLimit",
  times_used AS "timesUsed", active`;

// null = ما في كود. '' = كود بصيغة غلط (بنعتبره غير صالح)
function readCode(value: unknown): string | null {
  if (value === undefined || value === null || (typeof value === 'string' && value.trim() === '')) return null;
  return normalizeCode(value) ?? '';
}

function assertAvailable(p: ProductRow | undefined, productId: number, qty: number): asserts p is ProductRow {
  if (!p) throw new HttpError(400, `Product ${productId} not found`);
  if (!p.active) throw new HttpError(409, `${p.name} is no longer available`);
  if (p.stock < qty) throw new HttpError(409, `Not enough stock for ${p.name}`);
}

// معاينة السعر للسلة: نفس الحسابات، بدون قفل وبدون ما نغيّر شي. الكود الغلط بيرجع رسالة مش خطأ
async function quoteOrder(items: Map<number, number>, code: string | null) {
  const rows = await query<ProductRow>('SELECT id, name, price, stock, active FROM products WHERE id = ANY($1::int[])', [
    [...items.keys()],
  ]);
  const byId = new Map(rows.map((p) => [p.id, p]));

  const lines = [...items.entries()]
    .sort(([a], [b]) => a - b)
    .map(([productId, quantity]) => {
      const p = byId.get(productId);
      assertAvailable(p, productId, quantity);
      return { productId, name: p.name, unitPrice: p.price, quantity };
    });
  const subtotalCents = lines.reduce((sum, l) => sum + toCents(l.unitPrice) * l.quantity, 0);

  let discountCents = 0;
  let appliedCode: string | null = null;
  let codeError: string | null = null;
  if (code !== null) {
    const rule = code ? await queryOne<CodeRow>(`SELECT ${CODE_COLUMNS} FROM discount_codes WHERE code = $1`, [code]) : undefined;
    const check = evaluateDiscount(rule, subtotalCents);
    if (check.ok) {
      discountCents = check.discountCents;
      appliedCode = rule!.code;
    } else {
      codeError = check.message;
    }
  }

  const shippingCents = toCents(SHIPPING);
  return {
    items: lines,
    subtotal: fromCents(subtotalCents),
    discount: fromCents(discountCents),
    shipping: fromCents(shippingCents),
    total: fromCents(subtotalCents - discountCents + shippingCents),
    code: appliedCode,
    codeError,
  };
}

async function placeOrder(
  userId: number,
  address: string,
  items: Map<number, number>,
  code: string | null,
): Promise<number> {
  return withTransaction(async (client) => {
    const lines: { id: number; name: string; priceCents: number; qty: number }[] = [];

    // FOR UPDATE بيقفل صف المنتج، والترتيب الثابت بيمنع deadlock بين طلبين متزامنين
    for (const productId of [...items.keys()].sort((a, b) => a - b)) {
      const qty = items.get(productId)!;
      const found = await client.query<ProductRow>(
        'SELECT id, name, price, stock, active FROM products WHERE id = $1 FOR UPDATE',
        [productId],
      );
      const p = found.rows[0];
      assertAvailable(p, productId, qty);
      lines.push({ id: p.id, name: p.name, priceCents: toCents(p.price), qty });
    }
    const subtotalCents = lines.reduce((sum, l) => sum + l.priceCents * l.qty, 0);

    let discountCents = 0;
    let applied: CodeRow | undefined;
    if (code !== null) {
      // قفل صف الكود: طلبين متزامنين ما بيقدروا ياخدوا آخر استخدام سوا
      const res = await client.query<CodeRow>(`SELECT ${CODE_COLUMNS} FROM discount_codes WHERE code = $1 FOR UPDATE`, [code]);
      const check = evaluateDiscount(res.rows[0], subtotalCents);
      if (!check.ok) throw new HttpError(422, check.message, [check.reason]);
      discountCents = check.discountCents;
      applied = res.rows[0];
      await client.query('UPDATE discount_codes SET times_used = times_used + 1 WHERE id = $1', [applied.id]);
    }

    const shippingCents = toCents(SHIPPING);
    const totalCents = subtotalCents - discountCents + shippingCents;
    const created = await client.query<{ id: number }>(
      `INSERT INTO orders (user_id, address, subtotal, discount, discount_code_id, discount_code, shipping, total)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
      [
        userId,
        address,
        fromCents(subtotalCents),
        fromCents(discountCents),
        applied?.id ?? null,
        applied?.code ?? null,
        fromCents(shippingCents),
        fromCents(totalCents),
      ],
    );
    const orderId = created.rows[0].id;

    const addItem = client.query.bind(client);
    for (const l of lines) {
      await addItem(
        'INSERT INTO order_items (order_id, product_id, product_name, unit_price, quantity) VALUES ($1, $2, $3, $4, $5)',
        [orderId, l.id, l.name, fromCents(l.priceCents), l.qty],
      );
      await addItem('UPDATE products SET stock = stock - $1 WHERE id = $2', [l.qty, l.id]);
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

// ---------- Products ----------
const PRODUCT_SELECT = `
  SELECT p.id, p.name, p.description, c.name AS category, p.price, p.stock, p.icon, p.color, p.active,
         p.created_at AS "createdAt",
         (SELECT EXTRACT(EPOCH FROM i.updated_at)::bigint FROM product_images i
           WHERE i.product_id = p.id) AS "imageVersion"
  FROM products p JOIN categories c ON c.id = p.category_id`;

// خيارات الترتيب من قائمة ثابتة، فما بيدخل أي نص من الطلب للـ SQL
const SORTS: Record<string, string> = {
  newest: 'p.created_at DESC, p.id DESC',
  price_asc: 'p.price ASC, p.id',
  price_desc: 'p.price DESC, p.id',
  name: 'lower(p.name) ASC, p.id',
};

async function loadProduct(id: number) {
  const product = await queryOne(`${PRODUCT_SELECT} WHERE p.id = $1`, [id]);
  if (!product) throw new HttpError(404, 'Product not found');
  return product;
}

// بنلاقي التصنيف بغض النظر عن حالة الأحرف، وإلا بنعمله
async function categoryIdFor(name: string): Promise<number> {
  const existing = await queryOne<{ id: number }>('SELECT id FROM categories WHERE lower(name) = lower($1)', [name]);
  if (existing) return existing.id;
  const created = await queryOne<{ id: number }>(
    'INSERT INTO categories (name) VALUES ($1) ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name RETURNING id',
    [name],
  );
  return created!.id;
}

app.get('/api/categories', async (_req, res) => {
  res.json(
    await query(
      `SELECT c.name, COUNT(p.id)::int AS count
       FROM categories c JOIN products p ON p.category_id = c.id AND p.active
       GROUP BY c.id ORDER BY c.name`,
    ),
  );
});

// عام، بدون تسجيل دخول
app.get('/api/products', async (req, res) => {
  const { category, search, sort } = req.query;
  const where: string[] = ['p.active = true'];
  const params: unknown[] = [];

  if (typeof category === 'string' && category) where.push(`c.name = ${bind(params, category)}`);
  if (typeof search === 'string' && search.trim()) {
    const like = bind(params, `%${search.trim()}%`);
    where.push(`(p.name ILIKE ${like} OR p.description ILIKE ${like})`);
  }
  const sortKey = typeof sort === 'string' && Object.hasOwn(SORTS, sort) ? sort : 'newest';
  const whereSql = `WHERE ${where.join(' AND ')}`;

  res.json(
    await queryPage(
      `SELECT COUNT(*) AS total FROM products p JOIN categories c ON c.id = p.category_id ${whereSql}`,
      `${PRODUCT_SELECT} ${whereSql} ORDER BY ${SORTS[sortKey]}`,
      params,
      parsePaging(req.query, 12),
    ),
  );
});

app.get('/api/products/:id', async (req, res) => {
  const product = await queryOne(`${PRODUCT_SELECT} WHERE p.id = $1 AND p.active = true`, [idOf(req.params.id)]);
  if (!product) throw new HttpError(404, 'Product not found');
  res.json(product);
});

// الصورة نفسها. مع ?v= بتنخزن بالمتصفح لسنة، لأنه كل صورة جديدة إلها رقم نسخة جديد
app.get('/api/products/:id/image', async (req, res) => {
  const image = await queryOne<{ content_type: string; data: Buffer }>(
    'SELECT content_type, data FROM product_images WHERE product_id = $1',
    [idOf(req.params.id)],
  );
  if (!image) throw new HttpError(404, 'Image not found');

  const versioned = typeof req.query.v === 'string';
  res.set({
    'Content-Type': image.content_type,
    'Cache-Control': versioned ? 'public, max-age=31536000, immutable' : 'public, max-age=300',
    'X-Content-Type-Options': 'nosniff',
  });
  res.send(image.data);
});

// staff و admin. المؤرشفة بتظهر بس مع ?includeArchived=true
app.get('/api/admin/products', authenticate, authorizeRoles('admin', 'staff'), async (req, res) => {
  const { search, includeArchived } = req.query;
  const where: string[] = [];
  const params: unknown[] = [];

  if (includeArchived !== 'true') where.push('p.active = true');
  if (typeof search === 'string' && search.trim()) {
    const like = bind(params, `%${search.trim()}%`);
    where.push(`(p.name ILIKE ${like} OR c.name ILIKE ${like})`);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  res.json(
    await queryPage(
      `SELECT COUNT(*) AS total FROM products p JOIN categories c ON c.id = p.category_id ${whereSql}`,
      `${PRODUCT_SELECT} ${whereSql} ORDER BY p.id DESC`,
      params,
      parsePaging(req.query),
    ),
  );
});

app.post('/api/products', authenticate, authorizeRoles('admin'), async (req, res) => {
  const { data, errors } = parseProductInput(req.body, true);
  if (errors.length) throw new HttpError(400, 'Validation failed', errors);

  const created = await queryOne<{ id: number }>(
    `INSERT INTO products (name, description, category_id, price, stock, icon, color, active)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
    [
      data.name,
      data.description ?? '',
      await categoryIdFor(data.category!),
      data.price,
      data.stock,
      data.icon ?? 'package',
      data.color ?? 'teal',
      data.active ?? true,
    ],
  );
  res.status(201).json(await loadProduct(created!.id));
});

app.patch('/api/products/:id', authenticate, authorizeRoles('admin'), async (req, res) => {
  const id = idOf(req.params.id);
  await loadProduct(id); // 404 إذا مش موجود
  const { data, errors } = parseProductInput(req.body, false);
  if (errors.length) throw new HttpError(400, 'Validation failed', errors);

  // أسماء الأعمدة من قائمة ثابتة عندنا (مش من الطلب)، والقيم بتروح كـ parameters
  const columns: Record<string, string> = {
    name: 'name',
    description: 'description',
    price: 'price',
    stock: 'stock',
    icon: 'icon',
    color: 'color',
    active: 'active',
  };
  const { category, ...rest } = data;
  const params: unknown[] = [];
  const sets = Object.entries(rest).map(([key, value]) => `${columns[key]} = ${bind(params, value)}`);
  if (category !== undefined) sets.push(`category_id = ${bind(params, await categoryIdFor(category))}`);
  if (sets.length === 0) throw new HttpError(400, 'Validation failed', ['nothing to update']);

  await pool.query(`UPDATE products SET ${sets.join(', ')} WHERE id = ${bind(params, id)}`, params);
  res.json(await loadProduct(id));
});

// رفع صورة: الجسم هو الملف نفسه (مش JSON). الـ authenticate بيشتغل قبل قراءة الملف
app.put(
  '/api/products/:id/image',
  authenticate,
  authorizeRoles('admin'),
  express.raw({ type: ['image/jpeg', 'image/png', 'image/webp'], limit: '1mb' }),
  async (req, res) => {
    const id = idOf(req.params.id);
    await loadProduct(id);

    const body: unknown = req.body;
    if (!Buffer.isBuffer(body) || body.length === 0) {
      throw new HttpError(415, 'Send a JPEG, PNG or WebP image');
    }
    const type = sniffImageType(body);
    if (!type) throw new HttpError(415, 'The file is not a valid JPEG, PNG or WebP image');

    await pool.query(
      `INSERT INTO product_images (product_id, content_type, data, updated_at)
       VALUES ($1, $2, $3, now())
       ON CONFLICT (product_id) DO UPDATE
         SET content_type = EXCLUDED.content_type, data = EXCLUDED.data, updated_at = now()`,
      [id, type, body],
    );
    res.json(await loadProduct(id));
  },
);

app.delete('/api/products/:id/image', authenticate, authorizeRoles('admin'), async (req, res) => {
  const id = idOf(req.params.id);
  await loadProduct(id);
  await pool.query('DELETE FROM product_images WHERE product_id = $1', [id]);
  res.json(await loadProduct(id));
});

const IN_USE = 'This product appears in existing orders. Archive it instead of deleting it.';

app.delete('/api/products/:id', authenticate, authorizeRoles('admin'), async (req, res) => {
  const id = idOf(req.params.id);
  const used = await queryOne<{ used: boolean }>(
    'SELECT EXISTS (SELECT 1 FROM order_items WHERE product_id = $1) AS used',
    [id],
  );
  if (used?.used) throw new HttpError(409, IN_USE);

  try {
    const result = await pool.query('DELETE FROM products WHERE id = $1', [id]);
    if (result.rowCount === 0) throw new HttpError(404, 'Product not found');
  } catch (err) {
    // 23503 = foreign_key_violation (طلب انعمل بنفس اللحظة)
    if ((err as { code?: string }).code === '23503') throw new HttpError(409, IN_USE);
    throw err;
  }
  res.status(204).end();
});

// ---------- Orders: الزبون ----------
// معاينة السعر مع الخصم (ما بتنشئ شي)
app.post('/api/orders/quote', authenticate, authorizeRoles('customer'), async (req, res) => {
  const { merged, error } = parseOrderItems(req.body?.items);
  if (error) throw new HttpError(400, 'Validation failed', [error]);
  res.json(await quoteOrder(merged, readCode(req.body?.code)));
});

app.post('/api/orders', authenticate, authorizeRoles('customer'), async (req, res) => {
  const { items, address } = req.body ?? {};
  const errors: string[] = [];
  if (typeof address !== 'string' || address.trim().length < 5) {
    errors.push('address is required (at least 5 characters)');
  }
  const { merged, error } = parseOrderItems(items);
  if (error) errors.push(error);
  if (errors.length) throw new HttpError(400, 'Validation failed', errors);

  // السعر والخصم والمجموع بنحسبهم هون. أي total أو discount بيجي من الزبون بنتجاهله
  const orderId = await placeOrder(req.user!.user_id, address.trim(), merged, readCode(req.body?.code));
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


// ---------- Payments ----------

app.post('/api/payments', authenticate, authorizeRoles('customer'), async (req, res) => {
  const key = parseIdempotencyKey(req.header('idempotency-key'));
  if (!key) {
    throw new HttpError(400, 'Validation failed', [
      'Idempotency-Key header is required (8 to 64 letters, digits, - or _)',
    ]);
  }
  const orderId = req.body?.orderId;
  if (!Number.isInteger(orderId) || orderId < 1 || orderId > 2147483647) {
    throw new HttpError(400, 'Validation failed', ['orderId must be a valid order id']);
  }

  const { payment, created } = await startPayment(req.user!.user_id, orderId, key);
  res.status(created ? 201 : 200).json(await paymentResponse(payment, true));
});

app.get('/api/payments/:id', authenticate, async (req, res) => {
  res.json(await getPayment(idOf(req.params.id), req.user!));
});

// الـ webhook: التأكيد الحقيقي للدفع بيجي من البوابة، والتوقيع هو الثقة الوحيدة
app.post('/api/webhooks/gateway', async (req, res) => {
  const raw = req.rawBody?.toString('utf8');
  if (!raw) throw new HttpError(400, 'Missing request body');
  res.json(await processGatewayEvent(raw, req.header('x-gateway-signature')));
});

// البوابة التجريبية: بتمثل خدمة خارجية (مع بوابة حقيقية بتكون على دومين ثاني)
app.use('/mock-gateway/v1', createMockGatewayRouter(processGatewayEvent));

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
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const result = await queryPage<OrderRow>(
    `SELECT COUNT(*) AS total FROM orders o JOIN users u ON u.id = o.user_id ${whereSql}`,
    `${ORDER_SELECT} ${whereSql} ORDER BY o.id DESC`,
    params,
    parsePaging(req.query),
  );
  res.json({ ...result, items: await attachItems(result.items) });
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
    await queryPage(
      `SELECT COUNT(*) AS total FROM users u WHERE u.role = 'customer' ${filter}`,
      `SELECT u.id, u.name, u.email, u.phone, u.created_at AS "createdAt",
              COUNT(o.id) AS "ordersCount",
              ROUND(COALESCE(SUM(CASE WHEN o.payment_status = 'paid' THEN o.total END), 0), 2) AS "totalSpent"
       FROM users u LEFT JOIN orders o ON o.user_id = u.id
       WHERE u.role = 'customer' ${filter}
       GROUP BY u.id ORDER BY u.id`,
      params,
      parsePaging(req.query, 12),
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
      `SELECT ROUND(COALESCE(SUM(total), 0), 2) AS revenue FROM orders WHERE payment_status = 'paid'`,
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

// ---------- Discount codes ----------
// الحالة بتنحسب بالـ SQL (مصدر واحد للحقيقة)
const DISCOUNT_SELECT = `
  SELECT id, code, type, value, expires_at AS "expiresAt", usage_limit AS "usageLimit",
         times_used AS "timesUsed", active, created_at AS "createdAt",
         CASE WHEN NOT active THEN 'disabled'
              WHEN expires_at IS NOT NULL AND expires_at <= now() THEN 'expired'
              WHEN usage_limit IS NOT NULL AND times_used >= usage_limit THEN 'exhausted'
              ELSE 'active' END AS status
  FROM discount_codes`;

app.get('/api/admin/discounts', authenticate, authorizeRoles('admin', 'staff'), async (req, res) => {
  res.json(
    await queryPage(
      'SELECT COUNT(*) AS total FROM discount_codes',
      `${DISCOUNT_SELECT} ORDER BY id DESC`,
      [],
      parsePaging(req.query),
    ),
  );
});

app.post('/api/discounts', authenticate, authorizeRoles('admin'), async (req, res) => {
  const { data, errors } = parseDiscountInput(req.body);
  if (errors.length) throw new HttpError(400, 'Validation failed', errors);

  try {
    const created = await queryOne<{ id: number }>(
      `INSERT INTO discount_codes (code, type, value, expires_at, usage_limit)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [data.code, data.type, data.value, data.expiresAt, data.usageLimit],
    );
    res.status(201).json(await queryOne(`${DISCOUNT_SELECT} WHERE id = $1`, [created!.id]));
  } catch (err) {
    if ((err as { code?: string }).code === '23505') throw new HttpError(409, 'This code already exists');
    throw err;
  }
});

app.patch('/api/discounts/:id', authenticate, authorizeRoles('admin'), async (req, res) => {
  const id = idOf(req.params.id);
  const { data, errors } = parseDiscountUpdate(req.body);
  if (errors.length) throw new HttpError(400, 'Validation failed', errors);

  // أسماء الأعمدة من قائمة ثابتة، والقيم parameters
  const columns: Record<string, string> = { active: 'active', expiresAt: 'expires_at', usageLimit: 'usage_limit' };
  const params: unknown[] = [];
  const sets = Object.entries(data).map(([key, value]) => `${columns[key]} = ${bind(params, value)}`);
  if (sets.length === 0) throw new HttpError(400, 'Validation failed', ['nothing to update']);

  const updated = await queryOne(
    `UPDATE discount_codes SET ${sets.join(', ')} WHERE id = ${bind(params, id)} RETURNING id`,
    params,
  );
  if (!updated) throw new HttpError(404, 'Discount code not found');
  res.json(await queryOne(`${DISCOUNT_SELECT} WHERE id = $1`, [id]));
});

// ---------- Error handler ----------
app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.message, ...(err.details.length && { details: err.details }) });
  }
    // أخطاء الـ parsers (ملف كبير، JSON غلط) بتيجي مع status من نوع 4xx
  const status = (err as { status?: number }).status;
  if (typeof status === 'number' && status >= 400 && status < 500) {
    return res.status(status).json({ error: status === 413 ? 'The uploaded file is too large' : 'Bad request' });
  }
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

export default app;