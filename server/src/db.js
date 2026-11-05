import pg from 'pg';
import { config } from './config.js';

// BIGINT -> JS number (IDs and coin balances stay well below 2^53)
pg.types.setTypeParser(20, (v) => (v === null ? null : Number(v)));
// NUMERIC -> number
pg.types.setTypeParser(1700, (v) => (v === null ? null : Number(v)));

const isRemoteDb = !config.databaseUrl.includes('localhost') && !config.databaseUrl.includes('127.0.0.1') && !config.databaseUrl.includes('@postgres:');

export const pool = new pg.Pool({
  connectionString: config.databaseUrl,
  max: 20,
  ...(isRemoteDb ? { ssl: { rejectUnauthorized: false } } : {}),
});

export async function q(text, params = []) {
  const r = await pool.query(text, params);
  return r.rows;
}

export async function one(text, params = []) {
  const r = await pool.query(text, params);
  return r.rows[0] || null;
}

/** Run fn inside a transaction. fn receives a client with q/one helpers. */
export async function tx(fn) {
  const client = await pool.connect();
  const c = {
    q: async (t, p = []) => (await client.query(t, p)).rows,
    one: async (t, p = []) => (await client.query(t, p)).rows[0] || null,
  };
  try {
    await client.query('BEGIN');
    const res = await fn(c);
    await client.query('COMMIT');
    return res;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}
