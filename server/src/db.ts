import { Pool, types } from 'pg';
import type { PoolClient, QueryResultRow } from 'pg';

export const STATUSES = ['pending', 'processing', 'shipped', 'delivered', 'cancelled'] as const;
export type Status = (typeof STATUSES)[number];
export type Role = 'admin' | 'staff' | 'customer';

// pg بيرجع NUMERIC و bigint (مثل COUNT) كنصوص، فبنحولهم لأرقام
types.setTypeParser(types.builtins.NUMERIC, (value) => parseFloat(value));
types.setTypeParser(types.builtins.INT8, (value) => parseInt(value, 10));

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL is not set. Add it to server/.env');
}

export const pool = new Pool({ connectionString, max: 10 });

export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params: unknown[] = [],
): Promise<T[]> {
  const result = await pool.query<T>(text, params);
  return result.rows;
}

export async function queryOne<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params: unknown[] = [],
): Promise<T | undefined> {
  return (await query<T>(text, params))[0];
}

// أي خطأ جوا الدالة بيعمل ROLLBACK لكل شي
export async function withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}