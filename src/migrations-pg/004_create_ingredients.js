export async function up(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ingredients (
      id          VARCHAR(24)    PRIMARY KEY,
      tenant_id   VARCHAR(24)    REFERENCES tenant(id) ON DELETE CASCADE,
      name        VARCHAR(150)   NOT NULL,
      unit        VARCHAR(20)    NOT NULL,
      dimension   VARCHAR(10)    NOT NULL,
      unit_cost   NUMERIC(12,4)  NOT NULL DEFAULT 0,
      notes       TEXT,
      created_at  TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
      updated_at  TIMESTAMPTZ    NOT NULL DEFAULT NOW()
    );

    CREATE UNIQUE INDEX IF NOT EXISTS uq_ingredients_tenant_name
      ON ingredients(tenant_id, name);
  `);
}