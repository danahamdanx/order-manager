import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import bcrypt from 'bcryptjs';
import type { Pool, PoolClient } from 'pg';
import { sniffImageType } from '../../src/validation.js';
import { DEMO_ADDRESS_PREFIX, DEMO_EMAIL_DOMAIN, DEMO_PRODUCTS, demoCodes, slugify } from './data.js';
import { generateDemo } from './generate.js';
import type { DemoPlan, DemoProduct } from './generate.js';

const IMAGES_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'demo-images');
const EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp'];
const MAX_IMAGE_BYTES = 1_000_000;

const emailPattern = `%@${DEMO_EMAIL_DOMAIN}`;

// ---------- الكتالوج ----------
async function ensureCatalog(client: PoolClient) {
  const categoryIds = new Map<string, number>();
  for (const name of new Set(DEMO_PRODUCTS.map((p) => p.category))) {
    const res = await client.query<{ id: number }>(
      'INSERT INTO categories (name) VALUES ($1) ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name RETURNING id',
      [name],
    );
    categoryIds.set(name, res.rows[0].id);
  }

  const existing = await client.query<DemoProduct>('SELECT id, name, price FROM products');
  const byName = new Map(existing.rows.map((r) => [r.name.toLowerCase(), r]));

  let created = 0;
  for (const p of DEMO_PRODUCTS) {
    if (byName.has(p.name.toLowerCase())) continue; // ما بنلمس منتج موجود (ممكن الأدمن عدّله)
    const res = await client.query<DemoProduct>(
      `INSERT INTO products (name, description, category_id, price, stock, icon, color)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id, name, price`,
      [p.name, p.description, categoryIds.get(p.category), p.price, p.stock, p.icon, p.color],
    );
    byName.set(p.name.toLowerCase(), res.rows[0]);
    created++;
  }

  return {
    products: DEMO_PRODUCTS.flatMap((p) => byName.get(p.name.toLowerCase()) ?? []),
    created,
  };
}

async function ensureCodes(client: PoolClient, now: Date) {
  for (const c of demoCodes(now)) {
    await client.query(
      `INSERT INTO discount_codes (code, type, value, expires_at, usage_limit)
       VALUES ($1, $2, $3, $4, $5) ON CONFLICT (code) DO NOTHING`,
      [c.code, c.type, c.value, c.until && c.until < now ? c.until : null, c.limit],
    );
  }
}

// ---------- الصور: ملف باسم المنتج (monitor-24.jpg) من مجلد db/demo-images ----------
async function uploadImages(client: PoolClient) {
  const skipped: string[] = [];
  if (!fs.existsSync(IMAGES_DIR)) return { uploaded: 0, skipped };

  const files = fs.readdirSync(IMAGES_DIR).filter((f) => EXTENSIONS.includes(path.extname(f).toLowerCase()));
  const rows = await client.query<{ id: number; name: string; hasImage: boolean }>(
    `SELECT p.id, p.name, (i.product_id IS NOT NULL) AS "hasImage"
     FROM products p LEFT JOIN product_images i ON i.product_id = p.id`,
  );
  const bySlug = new Map(rows.rows.map((p) => [slugify(p.name), p]));

  let uploaded = 0;
  for (const file of files) {
    const product = bySlug.get(slugify(path.basename(file, path.extname(file))));
    if (!product) {
      skipped.push(`${file} (no product with this name)`);
      continue;
    }
    if (product.hasImage) continue; // ما منكتب فوق صورة موجودة
    const data = fs.readFileSync(path.join(IMAGES_DIR, file));
    const type = sniffImageType(data);
    if (!type || data.length > MAX_IMAGE_BYTES) {
      skipped.push(`${file} (not a valid JPEG, PNG or WebP under 1 MB)`);
      continue;
    }
    await client.query('INSERT INTO product_images (product_id, content_type, data) VALUES ($1, $2, $3)', [
      product.id,
      type,
      data,
    ]);
    uploaded++;
  }
  return { uploaded, skipped };
}

// بتطلّع الصور الموجودة بالقاعدة لملفات (مرة وحدة، من قاعدتك المحلية اللي رفعتي عليها صورك)
export async function exportImages(pool: Pool, overwrite: boolean) {
  fs.mkdirSync(IMAGES_DIR, { recursive: true });
  const rows = await pool.query<{ name: string; content_type: string; data: Buffer }>(
    `SELECT p.name, i.content_type, i.data
     FROM product_images i JOIN products p ON p.id = i.product_id ORDER BY p.id`,
  );
  const extensions: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
  const known = new Set(DEMO_PRODUCTS.map((p) => slugify(p.name)));

  let written = 0;
  const skipped: string[] = [];
  const unmatched: string[] = [];
  for (const row of rows.rows) {
    const slug = slugify(row.name);
    if (!known.has(slug)) unmatched.push(row.name);
    const file = path.join(IMAGES_DIR, `${slug}.${extensions[row.content_type] ?? 'jpg'}`);
    if (fs.existsSync(file) && !overwrite) {
      skipped.push(path.basename(file));
      continue;
    }
    fs.writeFileSync(file, row.data);
    written++;
  }
  return { written, skipped, unmatched };
}

// ---------- مسح الديمو (الزبائن والطلبات والمشاهدات بس) ----------
async function recountCodeUsage(client: PoolClient) {
  await client.query(
    `UPDATE discount_codes d SET times_used =
       (SELECT COUNT(*)::int FROM orders o WHERE o.discount_code_id = d.id AND o.status <> 'cancelled')`,
  );
}

export async function clearDemoData(client: PoolClient) {
  // الطلبات أول (بتمسح معاها البنود والدفعات)، وبعدين الزبائن (بيمسح معهم المشاهدات)
  const orders = await client.query(
    `DELETE FROM orders WHERE address LIKE $1 OR user_id IN (SELECT id FROM users WHERE email LIKE $2)`,
    [`${DEMO_ADDRESS_PREFIX}%`, emailPattern],
  );
  const users = await client.query('DELETE FROM users WHERE email LIKE $1', [emailPattern]);
  await recountCodeUsage(client);
  return { orders: orders.rowCount ?? 0, customers: users.rowCount ?? 0 };
}

export async function clearDemo(pool: Pool) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await clearDemoData(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// ---------- إدخال الخطة ----------
async function insertPlan(client: PoolClient, plan: DemoPlan) {
  // كلمة سر عشوائية ما حدا بيعرفها: زبائن الديمو ما بيقدروا يسجلوا دخول
  const passwordHash = bcrypt.hashSync(randomBytes(24).toString('hex'), 10);
  const userIds = new Map<string, number>();

  for (const c of plan.customers) {
    if (c.existing) {
      const found = await client.query<{ id: number }>('SELECT id FROM users WHERE email = $1', [c.email]);
      if (found.rows[0]) userIds.set(c.key, found.rows[0].id);
      continue;
    }
    const res = await client.query<{ id: number }>(
      `INSERT INTO users (name, email, password_hash, role, created_at) VALUES ($1, $2, $3, 'customer', $4) RETURNING id`,
      [c.name, c.email, passwordHash, c.createdAt],
    );
    userIds.set(c.key, res.rows[0].id);
  }

  const codes = await client.query<{ id: number; code: string }>('SELECT id, code FROM discount_codes');
  const codeIds = new Map(codes.rows.map((r) => [r.code, r.id]));

  let orders = 0;
  let payments = 0;
  let skippedOrders = 0;
  for (const o of plan.orders) {
    const userId = userIds.get(o.customerKey);
    if (!userId) {
      skippedOrders++; // مثلًا حساب Lina مش موجود بهالقاعدة
      continue;
    }
    const codeId = o.discountCode ? codeIds.get(o.discountCode) : undefined;
    const created = await client.query<{ id: number }>(
      `INSERT INTO orders (user_id, status, payment_status, address, subtotal, discount, discount_code_id, discount_code, shipping, total, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING id`,
      [userId, o.status, o.paymentStatus, o.address, o.subtotal, o.discount, codeId ?? null, codeId ? o.discountCode : null, o.shipping, o.total, o.createdAt],
    );
    const orderId = created.rows[0].id;

    await client.query(
      `INSERT INTO order_items (order_id, product_id, product_name, unit_price, quantity)
       SELECT $1, * FROM unnest($2::int[], $3::text[], $4::numeric[], $5::int[])`,
      [orderId, o.items.map((i) => i.productId), o.items.map((i) => i.name), o.items.map((i) => i.unitPrice), o.items.map((i) => i.quantity)],
    );

    for (const p of o.payments) {
      await client.query(
        `INSERT INTO payments (order_id, amount, status, method, card_brand, card_last4, failure_reason, gateway_ref, paid_at, refunded_at, created_at, updated_at)
         VALUES ($1, $2, $3, 'card', $4, $5, $6, $7, $8, $9, $10, $11)`,
        [orderId, p.amount, p.status, p.cardBrand, p.cardLast4, p.failureReason, p.ref, p.paidAt, p.refundedAt, p.createdAt, p.refundedAt ?? p.paidAt ?? p.createdAt],
      );
      payments++;
    }
    orders++;
  }

  const views = plan.views.filter((v) => userIds.has(v.customerKey));
  if (views.length > 0) {
    await client.query(
      `INSERT INTO product_views (user_id, product_id, view_count, first_viewed_at, last_viewed_at)
       SELECT * FROM unnest($1::int[], $2::int[], $3::int[], $4::timestamptz[], $5::timestamptz[])`,
      [
        views.map((v) => userIds.get(v.customerKey) as number),
        views.map((v) => v.productId),
        views.map((v) => v.viewCount),
        views.map((v) => v.firstViewedAt),
        views.map((v) => v.lastViewedAt),
      ],
    );
  }

  await recountCodeUsage(client);
  return { customers: plan.customers.filter((c) => !c.existing).length, orders, payments, views: views.length, skippedOrders };
}

export interface SeedOptions {
  fresh: boolean;
  now?: Date;
}

export async function seedDemo(pool: Pool, { fresh, now = new Date() }: SeedOptions) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const existing = await client.query<{ c: number }>(
      `SELECT (SELECT COUNT(*) FROM users WHERE email LIKE $1) + (SELECT COUNT(*) FROM orders WHERE address LIKE $2) AS c`,
      [emailPattern, `${DEMO_ADDRESS_PREFIX}%`],
    );
    if (Number(existing.rows[0].c) > 0) {
      if (!fresh) throw new Error('Demo data already exists. Use --fresh to rebuild it, or demo:clear to remove it.');
      await clearDemoData(client);
    }

    const catalog = await ensureCatalog(client);
    await ensureCodes(client, now);
    const images = await uploadImages(client);
    const plan = generateDemo({ products: catalog.products, now });
    const inserted = await insertPlan(client, plan);

    await client.query('COMMIT');
    return { newProducts: catalog.created, images, ...inserted };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}