// Eventos del recorrido del cliente en el flujo de pedido por QR.
// No guarda nombre ni teléfono: la identidad se referencia vía customer_id.
export async function up(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS customer_journey_events (
        id           VARCHAR(24)  PRIMARY KEY,
        tenant_id    VARCHAR(24)  NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
        branch_id    VARCHAR(24)  NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
        session_id   UUID         NOT NULL,
        type         VARCHAR(40)  NOT NULL,
        source       VARCHAR(10)  NOT NULL,
        customer_id  VARCHAR(24)  REFERENCES customers(id) ON DELETE SET NULL,
        order_id     VARCHAR(24)  REFERENCES orders(id) ON DELETE SET NULL,
        data         JSONB        NOT NULL DEFAULT '{}'::jsonb,
        occurred_at  TIMESTAMPTZ  NOT NULL,
        received_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        CONSTRAINT ck_journey_events_source CHECK (source IN ('client', 'server'))
    );
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS ix_journey_events_branch_time
      ON customer_journey_events (tenant_id, branch_id, occurred_at DESC);
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS ix_journey_events_session
      ON customer_journey_events (session_id, occurred_at);
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS ix_journey_events_occurred_at
      ON customer_journey_events (occurred_at);
  `);
}
