export async function up(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS inventory_movements (
        id            VARCHAR(24)   PRIMARY KEY,
        tenant_id     VARCHAR(24)   REFERENCES tenant(id) ON DELETE CASCADE,
        ingredient_id VARCHAR(24)   REFERENCES ingredients(id) ON DELETE CASCADE,
        branch_id     VARCHAR(24)   REFERENCES branches(id) ON DELETE CASCADE,
        quantity      NUMERIC(12,4) NOT NULL,
        type          VARCHAR(30)   NOT NULL,
        reason        TEXT,
        unit_cost     NUMERIC(12,4),
        batch_id      VARCHAR(24)   REFERENCES stocks(id) ON DELETE SET NULL,
        batches       JSONB,
        order_id      VARCHAR(24),
        created_by    VARCHAR(24),
        created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_movements_tenant_ingredient
      ON inventory_movements(tenant_id, ingredient_id);
    CREATE INDEX IF NOT EXISTS idx_movements_tenant_branch
      ON inventory_movements(tenant_id, branch_id);
    CREATE INDEX IF NOT EXISTS idx_movements_created
      ON inventory_movements(created_at);
  `);
}