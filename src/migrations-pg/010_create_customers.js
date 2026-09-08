export async function up(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS customers (
        id             VARCHAR(24)   PRIMARY KEY,
        tenant_id      VARCHAR(24)   REFERENCES tenant(id) ON DELETE CASCADE,
        phone          VARCHAR(50)   NOT NULL,
        first_name     VARCHAR(150),
        points_balance INTEGER       NOT NULL DEFAULT 0,
        created_at     TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
        updated_at     TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
        CONSTRAINT uq_customers_tenant_phone UNIQUE (tenant_id, phone)
    );
  `);
}