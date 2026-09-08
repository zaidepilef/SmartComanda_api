export async function up(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS loyalty_transactions (
        id              VARCHAR(24)  PRIMARY KEY,
        tenant_id       VARCHAR(24)  REFERENCES tenant(id) ON DELETE CASCADE,
        branch_id       VARCHAR(24)  REFERENCES branches(id) ON DELETE CASCADE,
        customer_id     VARCHAR(24)  REFERENCES customers(id) ON DELETE CASCADE,
        source_order_id VARCHAR(24)  REFERENCES orders(id) ON DELETE CASCADE,
        type            VARCHAR(20)  NOT NULL,
        points          INTEGER      NOT NULL DEFAULT 0,
        created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_loyalty_customer
      ON loyalty_transactions(customer_id);
    CREATE INDEX IF NOT EXISTS idx_loyalty_order
      ON loyalty_transactions(source_order_id);
  `);
}