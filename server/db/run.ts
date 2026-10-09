import { Pool } from 'pg';
import { migrate } from './migrate.js';
import { seed } from './seed.js';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is not set (see server/.env.example)');

const commands = ['migrate', 'seed', 'setup', 'reset'];
const command = process.argv[2];
if (!commands.includes(command)) {
  console.error(`Usage: tsx db/run.ts <${commands.join('|')}>`);
  process.exit(1);
}

const pool = new Pool({ connectionString: url });
try {
  if (command === 'reset') {
    // حماية: ما بنمسح إلا قاعدة محلية
    const host = new URL(url).hostname;
    if (!['localhost', '127.0.0.1'].includes(host)) {
      throw new Error('Refusing to reset a non-local database');
    }
    await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
    console.log('Schema dropped');
  }
  if (command !== 'seed') await migrate(pool);
  if (command !== 'migrate') await seed(pool);
} finally {
  await pool.end();
}