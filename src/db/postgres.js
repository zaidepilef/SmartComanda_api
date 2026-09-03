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

export async function closePostgres() {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

export function isPostgresConnected() {
  return pool !== null;
}
