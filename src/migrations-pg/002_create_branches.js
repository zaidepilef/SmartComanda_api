export async function up(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS branches (
        id                VARCHAR(24)   PRIMARY KEY,
        tenant_id         VARCHAR(24)   REFERENCES tenant(id) ON DELETE CASCADE,
        name              VARCHAR(150)  NOT NULL,
        type              VARCHAR(30)   NOT NULL DEFAULT 'Sucursal',
        address           VARCHAR(255),
        city              VARCHAR(100),
        phone             VARCHAR(50),
        active            BOOLEAN       NOT NULL DEFAULT TRUE,
        payment_methods   JSONB         NOT NULL
                                      DEFAULT '["cash","debit","credit","transfer"]'::jsonb,
        next_order_number INTEGER       NOT NULL DEFAULT 0,
        created_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
        updated_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_branches_tenant ON branches(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_branches_active ON branches(active);
  `);
}
