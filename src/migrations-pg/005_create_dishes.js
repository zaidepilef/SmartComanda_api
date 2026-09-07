export async function up(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS dishes (
      id             VARCHAR(24)    PRIMARY KEY,
      tenant_id      VARCHAR(24)    REFERENCES tenant(id) ON DELETE CASCADE,
      name           VARCHAR(150)   NOT NULL,
      sale_price     NUMERIC(12,4)  NOT NULL,
      active         BOOLEAN        NOT NULL DEFAULT TRUE,
      description    TEXT,
      category       VARCHAR(100),
      icon           VARCHAR(20),
      recipe         JSONB          NOT NULL DEFAULT '[]'::jsonb,
      branch_prices  JSONB,
      created_at     TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
      updated_at     TIMESTAMPTZ    NOT NULL DEFAULT NOW()
    );

    CREATE UNIQUE INDEX IF NOT EXISTS uq_dishes_tenant_name
      ON dishes(tenant_id, name);
  `);
}