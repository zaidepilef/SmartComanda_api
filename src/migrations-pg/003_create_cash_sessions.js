export async function up(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS cash_sessions (
      id              VARCHAR(24)   PRIMARY KEY,
      tenant_id       VARCHAR(24)   REFERENCES tenant(id) ON DELETE CASCADE,
      branch_id       VARCHAR(24)   NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
      opened_by       VARCHAR(24)   REFERENCES users(id) ON DELETE SET NULL,
      opened_at       TIMESTAMPTZ   NOT NULL,
      opening_amount  NUMERIC(12,4) NOT NULL DEFAULT 0,
      status          VARCHAR(10)   NOT NULL DEFAULT 'open',
      closed_at       TIMESTAMPTZ,
      closed_by       VARCHAR(24),
      order_count     INTEGER       NOT NULL DEFAULT 0,
      created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
      updated_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS cash_session_totals (
      session_id  VARCHAR(24)   NOT NULL REFERENCES cash_sessions(id) ON DELETE CASCADE,
      method      VARCHAR(50)   NOT NULL,
      amount      NUMERIC(12,4) NOT NULL DEFAULT 0,
      PRIMARY KEY (session_id, method)
    );

    CREATE INDEX IF NOT EXISTS idx_cash_sessions_tenant     ON cash_sessions(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_cash_sessions_branch     ON cash_sessions(branch_id, status);
    CREATE INDEX IF NOT EXISTS idx_cash_session_totals_sid  ON cash_session_totals(session_id);
  `);
}
