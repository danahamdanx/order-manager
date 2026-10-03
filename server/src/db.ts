import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';

export const STATUSES = ['pending', 'processing', 'shipped', 'delivered', 'cancelled'] as const;
export type Status = (typeof STATUSES)[number];
export type Role = 'admin' | 'staff' | 'customer';

export const db = new Database('data.db');
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    phone TEXT,
    role TEXT NOT NULL DEFAULT 'customer' CHECK (role IN ('admin', 'staff', 'customer')),
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
  );

  CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    category TEXT NOT NULL,
    price REAL NOT NULL CHECK (price > 0),
    stock INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0),
    icon TEXT NOT NULL DEFAULT 'package',
    color TEXT NOT NULL DEFAULT 'teal'
  );

  CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id),
    status TEXT NOT NULL DEFAULT 'pending'
      CHECK (status IN ('pending', 'processing', 'shipped', 'delivered', 'cancelled')),
    address TEXT NOT NULL,
    shipping REAL NOT NULL DEFAULT 0,
    total REAL NOT NULL CHECK (total > 0),
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
  );

  CREATE TABLE IF NOT EXISTS order_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    product_id INTEGER NOT NULL REFERENCES products(id),
    product_name TEXT NOT NULL,
    unit_price REAL NOT NULL,
    quantity INTEGER NOT NULL CHECK (quantity > 0)
  );

  CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id);
  CREATE INDEX IF NOT EXISTS idx_items_order ON order_items(order_id);
`);

const count = (table: string) =>
  (db.prepare(`SELECT COUNT(*) AS c FROM ${table}`).get() as { c: number }).c;

// ---------- بيانات تجريبية (أول مرة بس) ----------
if (count('products') === 0) {
  const add = db.prepare(
    'INSERT INTO products (name, description, category, price, stock, icon, color) VALUES (?, ?, ?, ?, ?, ?, ?)',
  );
  const products: [string, string, string, number, number, string, string][] = [
    ['Wireless Keyboard', 'Slim, quiet keys with months of battery life.', 'Keyboards', 45.5, 25, 'keyboard', 'purple'],
    ['USB-C Hub', 'Seven ports in one compact hub.', 'Accessories', 32, 40, 'usb', 'blue'],
    ['Laptop Stand', 'Adjustable aluminum stand for better posture.', 'Accessories', 28.9, 30, 'device-laptop', 'amber'],
    ['Monitor 24"', 'Full HD display with thin bezels.', 'Monitors', 160, 12, 'device-desktop', 'teal'],
    ['Mechanical Mouse', 'Precise sensor and comfortable grip.', 'Accessories', 19.99, 50, 'mouse', 'coral'],
    ['Webcam HD', '1080p webcam with a built-in microphone.', 'Accessories', 54, 18, 'camera', 'pink'],
  ];
  for (const p of products) add.run(...p);
}

if (count('users') === 0) {
  const addUser = db.prepare(
    'INSERT INTO users (name, email, password_hash, phone, role) VALUES (?, ?, ?, ?, ?)',
  );
  addUser.run('Admin', 'admin@example.com', bcrypt.hashSync('Admin123!', 10), null, 'admin');
  const lina = addUser.run('Lina Haddad', 'lina@example.com', bcrypt.hashSync('Customer123!', 10), null, 'customer').lastInsertRowid;
  const omar = addUser.run('Omar Khalil', 'omar@example.com', bcrypt.hashSync('Customer123!', 10), null, 'customer').lastInsertRowid;

  const addOrder = db.prepare(
    'INSERT INTO orders (user_id, status, address, shipping, total, created_at) VALUES (?, ?, ?, ?, ?, ?)',
  );
  const addItem = db.prepare(
    'INSERT INTO order_items (order_id, product_id, product_name, unit_price, quantity) VALUES (?, ?, ?, ?, ?)',
  );
  const demo: [number | bigint, Status, number, string, number, string][] = [
    [lina, 'pending', 1, 'Wireless Keyboard', 45.5, '2026-09-20T10:15:00Z'],
    [omar, 'processing', 2, 'USB-C Hub', 32, '2026-09-21T09:30:00Z'],
    [lina, 'delivered', 5, 'Mechanical Mouse', 19.99, '2026-09-19T16:20:00Z'],
    [omar, 'shipped', 4, 'Monitor 24"', 160, '2026-09-23T17:55:00Z'],
  ];
  for (const [uid, status, pid, pname, price, at] of demo) {
    const total = Math.round((price + 5) * 100) / 100;
    const oid = addOrder.run(uid, status, 'Demo address, Nablus', 5, total, at).lastInsertRowid;
    addItem.run(oid, pid, pname, price, 1);
  }
  console.log('Seeded demo accounts:');
  console.log('  admin    admin@example.com / Admin123!');
  console.log('  customer lina@example.com  / Customer123!');
}