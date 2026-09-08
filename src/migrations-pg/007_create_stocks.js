export async function up(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS stocks (
        id            VARCHAR(24)   PRIMARY KEY,
        tenant_id     VARCHAR(24)   REFERENCES tenant(id) ON DELETE CASCADE,
        branch_id     VARCHAR(24)   REFERENCES branches(id) ON DELETE CASCADE,
        ingredient_id VARCHAR(24)   REFERENCES ingredients(id) ON DELETE CASCADE,
        quantity      NUMERIC(12,4) NOT NULL,
        unit_cost     NUMERIC(12,4) NOT NULL DEFAULT 0,
        created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
        updated_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_stocks_tenant ON stocks(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_stocks_lookup
      ON stocks(tenant_id, branch_id, ingredient_id, created_at);
  `);
}