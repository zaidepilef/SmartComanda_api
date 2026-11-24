import pg from "pg";
import { env } from "../config/env.js";

const { Pool } = pg;

let pool = null;

export function connectPostgres() {
  if (pool) {
    return pool;
  }

  pool = new Pool({
    connectionString: env.databaseUrl,
    max: 10,
    connectionTimeoutMillis: 5000,
  });

  return pool;
}

export function getPgPool() {
  return pool;
}

/**
 * Ejecuta fn(client) dentro de una transacción; hace ROLLBACK si fn lanza.
 */
export async function withTransaction(fn) {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function closePostgres() {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

export function isPostgresConnected() {
  return pool !== null;
}
