import { Pool, types } from 'pg';
import { clearDemo, exportImages, seedDemo } from './seed-demo.js';

// نفس إعدادات التطبيق: pg بيرجع NUMERIC و bigint كنصوص بدونها
types.setTypeParser(types.builtins.NUMERIC, (value) => parseFloat(value));
types.setTypeParser(types.builtins.INT8, (value) => parseInt(value, 10));

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is not set (see server/.env.example)');

const [, , command = '', ...rest] = process.argv;
const flags = new Set(rest);
const commands = ['seed', 'clear', 'export-images'];
if (!commands.includes(command)) {
  console.error(`Usage: tsx db/demo/run.ts <${commands.join('|')}> [--fresh] [--remote] [--overwrite]`);
  process.exit(1);
}

// حماية: ما منشتغل على قاعدة بعيدة (مثل Neon) إلا إذا قلتي --remote صراحة
const target = new URL(url);
const isLocal = ['localhost', '127.0.0.1'].includes(target.hostname);
if (!isLocal && !flags.has('--remote')) {
  throw new Error(`${target.hostname} is not a local database. Add --remote if you really mean to use it.`);
}
console.log(`Database: ${target.hostname}${target.pathname}${isLocal ? '' : '  (REMOTE)'}`);

const pool = new Pool({ connectionString: url });
try {
  if (command === 'seed') {
    const r = await seedDemo(pool, { fresh: flags.has('--fresh') });
    console.log(`Products added: ${r.newProducts}`);
    console.log(`Images uploaded: ${r.images.uploaded}`);
    for (const s of r.images.skipped) console.log(`  skipped image: ${s}`);
    console.log(`Customers: ${r.customers}, orders: ${r.orders}, payments: ${r.payments}, product views: ${r.views}`);
    if (r.skippedOrders > 0) console.log(`Skipped ${r.skippedOrders} orders for accounts that do not exist in this database`);
  } else if (command === 'clear') {
    const r = await clearDemo(pool);
    console.log(`Removed ${r.orders} orders and ${r.customers} demo customers`);
  } else {
    const r = await exportImages(pool, flags.has('--overwrite'));
    console.log(`Exported ${r.written} images to server/db/demo-images`);
    for (const s of r.skipped) console.log(`  already exists (use --overwrite): ${s}`);
    for (const n of r.unmatched) console.log(`  no matching demo product, rename it or update data.ts: ${n}`);
  }
} finally {
  await pool.end();
}