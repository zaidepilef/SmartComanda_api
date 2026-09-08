export async function up(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS orders (
        id              VARCHAR(24)   PRIMARY KEY,
        tenant_id       VARCHAR(24)   REFERENCES tenant(id) ON DELETE CASCADE,
        foodtruck_id    VARCHAR(24)   REFERENCES branches(id) ON DELETE CASCADE,
        number          INTEGER       NOT NULL,
        status          VARCHAR(20)   NOT NULL DEFAULT 'new',
        order_type      VARCHAR(20)   NOT NULL DEFAULT 'takeaway',
        payment_status  VARCHAR(20)   NOT NULL DEFAULT 'pending',
        payment_method  VARCHAR(30),
        client_contact  VARCHAR(255),
        client_phone    VARCHAR(50),
        points_awarded  BOOLEAN       NOT NULL DEFAULT FALSE,
        items           JSONB         NOT NULL,
        status_history  JSONB         NOT NULL DEFAULT '[]'::jsonb,
        total           NUMERIC(12,4) NOT NULL DEFAULT 0,
        created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
        updated_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_orders_tenant         ON orders(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_orders_foodtruck      ON orders(foodtruck_id);
    CREATE INDEX IF NOT EXISTS idx_orders_status         ON orders(status);
    CREATE INDEX IF NOT EXISTS idx_orders_order_type     ON orders(order_type);
    CREATE INDEX IF NOT EXISTS idx_orders_payment_status ON orders(payment_status);
    CREATE INDEX IF NOT EXISTS idx_orders_created        ON orders(created_at DESC);
  `);
}