export async function up(pool) {
  await pool.query(`
    ALTER TABLE orders
      ADD COLUMN IF NOT EXISTS client_name VARCHAR(150);
  `);
}