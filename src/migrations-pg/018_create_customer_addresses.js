/** Direcciones de despacho guardadas por cliente (máximo 5, ver customer-recognition). */
export async function up(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS customer_addresses (
        id            VARCHAR(24)   PRIMARY KEY,
        tenant_id     VARCHAR(24)   NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
        customer_id   VARCHAR(24)   NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
        address       VARCHAR(200)  NOT NULL,
        reference     VARCHAR(200),
        lat           NUMERIC(9,6)  NOT NULL,
        lng           NUMERIC(9,6)  NOT NULL,
        last_used_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
        created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_customer_addresses_customer
      ON customer_addresses(customer_id, last_used_at DESC);
  `);
}
