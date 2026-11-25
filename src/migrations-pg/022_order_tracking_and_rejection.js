/** Seguimiento del pedido por token y rechazo del pedido por el local. */
export async function up(pool) {
  await pool.query(`
    ALTER TABLE orders
      ADD COLUMN IF NOT EXISTS tracking_token_hash CHAR(64),
      ADD COLUMN IF NOT EXISTS rejection_reason    VARCHAR(200),
      ADD COLUMN IF NOT EXISTS rejected_by         VARCHAR(24),
      ADD COLUMN IF NOT EXISTS rejected_at         TIMESTAMPTZ;

    CREATE UNIQUE INDEX IF NOT EXISTS uq_orders_tracking_token_hash
      ON orders(tracking_token_hash) WHERE tracking_token_hash IS NOT NULL;
  `);
}
