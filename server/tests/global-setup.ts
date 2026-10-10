import { Pool } from 'pg';
import { migrate } from '../db/migrate';
import { seed } from '../db/seed';
import { TEST_DATABASE_URL } from './test-db';

export default async function setup() {
  // حماية: ما بنمسح إلا قاعدة اسمها بينتهي بـ _test
  if (!new URL(TEST_DATABASE_URL).pathname.endsWith('_test')) {
    throw new Error('Refusing to reset a database whose name does not end with _test');
  }

  const pool = new Pool({ connectionString: TEST_DATABASE_URL });
  try {
    await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
    await migrate(pool);
    await seed(pool);
  } finally {
    await pool.end();
  }
}