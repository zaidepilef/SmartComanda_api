import { readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const MIGRATIONS_TABLE = "schema_migrations";
const MIGRATIONS_DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "migrations-pg"
);

const MIGRATION_FILE_PATTERN = /^(\d+)_(.+)\.js$/;

async function getAppliedVersions(pool) {
  const { rows } = await pool.query(
    `SELECT id FROM ${MIGRATIONS_TABLE}`
  );
  return new Set(rows.map((row) => String(row.id)));
}

async function ensureMigrationsTable(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${MIGRATIONS_TABLE} (
      id        TEXT PRIMARY KEY,
      file      TEXT NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

export async function runPgMigrations(pool) {
  await ensureMigrationsTable(pool);

  const entries = await readdir(MIGRATIONS_DIR);

  const migrations = entries
    .filter((file) => MIGRATION_FILE_PATTERN.test(file))
    .map((file) => {
      const [, version] = file.match(MIGRATION_FILE_PATTERN);
      return {
        version,
        file,
        path: path.join(MIGRATIONS_DIR, file),
      };
    })
    .sort((a, b) => Number(a.version) - Number(b.version));

  const applied = await getAppliedVersions(pool);
  const pending = migrations.filter((migration) => !applied.has(migration.version));

  for (const migration of pending) {
    console.log(`Running PG migration ${migration.version}: ${migration.file}`);
    const module = await import(migration.path);
    await module.up(pool);

    await pool.query(
      `INSERT INTO ${MIGRATIONS_TABLE} (id, file) VALUES ($1, $2) ON CONFLICT (id) DO NOTHING`,
      [migration.version, migration.file]
    );
  }

  if (pending.length === 0) {
    console.log("No pending PG migrations.");
  }
}
