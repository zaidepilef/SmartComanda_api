/** Usuario que cobró el pedido (para el cuadre por cajero). */
export async function up(pool) {
  await pool.query(`
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS paid_by VARCHAR(24) REFERENCES users(id) ON DELETE SET NULL;
    CREATE INDEX IF NOT EXISTS idx_orders_paid_by ON orders(paid_by);
  `);
}
