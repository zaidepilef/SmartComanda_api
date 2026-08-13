import { readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const MIGRATIONS_COLLECTION = "migrations";
const MIGRATIONS_DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "migrations"
);

const MIGRATION_FILE_PATTERN = /^(\d+)_(.+)\.js$/;

async function getAppliedVersions(db) {
  const collection = db.collection(MIGRATIONS_COLLECTION);
  const documents = await collection.find({}, { projection: { _id: 1 } }).toArray();
  return new Set(documents.map((doc) => doc._id));
}

export async function runMigrations(db) {
  const entries = await readdir(MIGRATIONS_DIR);

  const migrations = entries
    .filter((file) => MIGRATION_FILE_PATTERN.test(file))
    .map((file) => {
      const [, version] = file.match(MIGRATION_FILE_PATTERN);
      return {
        version: Number(version),
        file,
        path: path.join(MIGRATIONS_DIR, file),
      };
    })
    .sort((a, b) => a.version - b.version);

  const applied = await getAppliedVersions(db);
  const pending = migrations.filter((migration) => !applied.has(migration.version));

  for (const migration of pending) {
    console.log(`Running migration ${migration.version}: ${migration.file}`);
    const module = await import(migration.path);
    await module.up(db);

    await db.collection(MIGRATIONS_COLLECTION).insertOne({
      _id: migration.version,
      file: migration.file,
      appliedAt: new Date(),
    });
  }

  if (pending.length === 0) {
    console.log("No pending migrations.");
  }
}
