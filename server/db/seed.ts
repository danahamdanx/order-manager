import bcrypt from 'bcryptjs';
import type { Pool } from 'pg';

const products: [string, string, string, number, number, string, string][] = [
  ['Wireless Keyboard', 'Slim, quiet keys with months of battery life.', 'Keyboards', 45.5, 25, 'keyboard', 'purple'],
  ['USB-C Hub', 'Seven ports in one compact hub.', 'Accessories', 32, 40, 'usb', 'blue'],
  ['Laptop Stand', 'Adjustable aluminum stand for better posture.', 'Accessories', 28.9, 30, 'device-laptop', 'amber'],
  ['Monitor 24"', 'Full HD display with thin bezels.', 'Monitors', 160, 12, 'device-desktop', 'teal'],
  ['Mechanical Mouse', 'Precise sensor and comfortable grip.', 'Accessories', 19.99, 50, 'mouse', 'coral'],
  ['Webcam HD', '1080p webcam with a built-in microphone.', 'Accessories', 54, 18, 'camera', 'pink'],
];

export async function seed(pool: Pool) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const p = await client.query<{ c: number }>('SELECT COUNT(*)::int AS c FROM products');
        if (p.rows[0].c === 0) {
      const categoryIds = new Map<string, number>();
      for (const name of new Set(products.map((row) => row[2]))) {
        const res = await client.query<{ id: number }>(
          'INSERT INTO categories (name) VALUES ($1) ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name RETURNING id',
          [name],
        );
        categoryIds.set(name, res.rows[0].id);
      }
      for (const [name, description, category, price, stock, icon, color] of products) {
        await client.query(
          'INSERT INTO products (name, description, category_id, price, stock, icon, color) VALUES ($1, $2, $3, $4, $5, $6, $7)',
          [name, description, categoryIds.get(category), price, stock, icon, color],
        );
      }
      console.log('Seeded products');
    }

    const u = await client.query<{ c: number }>('SELECT COUNT(*)::int AS c FROM users');
    if (u.rows[0].c === 0) {
      const addUser = async (name: string, email: string, password: string, role: string) => {
        const res = await client.query<{ id: number }>(
          'INSERT INTO users (name, email, password_hash, role) VALUES ($1, $2, $3, $4) RETURNING id',
          [name, email, bcrypt.hashSync(password, 10), role],
        );
        return res.rows[0].id;
      };

      await addUser('Admin', 'admin@example.com', 'Admin123!', 'admin');
      const lina = await addUser('Lina Haddad', 'lina@example.com', 'Customer123!', 'customer');
      const omar = await addUser('Omar Khalil', 'omar@example.com', 'Customer123!', 'customer');

      const demo: [number, string, number, string, number, string][] = [
        [lina, 'pending', 1, 'Wireless Keyboard', 45.5, '2026-09-20T10:15:00Z'],
        [omar, 'processing', 2, 'USB-C Hub', 32, '2026-09-21T09:30:00Z'],
        [lina, 'delivered', 5, 'Mechanical Mouse', 19.99, '2026-09-19T16:20:00Z'],
        [omar, 'shipped', 4, 'Monitor 24"', 160, '2026-09-23T17:55:00Z'],
      ];
        for (const [userId, status, productId, productName, price, at] of demo) {
        const total = Math.round((price + 5) * 100) / 100;
        const paid = status !== 'pending';
        const order = await client.query<{ id: number }>(
          `INSERT INTO orders (user_id, status, payment_status, address, shipping, total, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
          [userId, status, paid ? 'paid' : 'unpaid', 'Demo address, Nablus', 5, total, at],
        );
        const orderId = order.rows[0].id;
        await client.query(
          'INSERT INTO order_items (order_id, product_id, product_name, unit_price, quantity) VALUES ($1, $2, $3, $4, 1)',
          [orderId, productId, productName, price],
        );
        if (paid) {
          await client.query(
            `INSERT INTO payments (order_id, amount, status, method, card_brand, card_last4, created_at)
             VALUES ($1, $2, 'succeeded', 'card', 'visa', '4242', $3)`,
            [orderId, total, at],
          );
        }
      }
      console.log('Seeded demo accounts: admin@example.com / Admin123!, lina@example.com / Customer123!');
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}