export async function up(pool) {
  await pool.query(`
    ALTER TABLE users
      ALTER COLUMN password_hash DROP NOT NULL;
  `);
}