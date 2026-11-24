/**
 * Roles de operación (Cocinero, Encargado), trazabilidad de cobro/anulación/corrección
 * de pedidos y arqueo persistido al cerrar caja. Solo agrega: es idempotente.
 */
export async function up(pool) {
  await pool.query(`
    INSERT INTO roles (code, name, description, system_role) VALUES
        ('cook', 'Cocinero', 'Cocina: recibe y despacha pedidos', TRUE)
    ON CONFLICT (code) DO NOTHING;

    UPDATE roles SET name = 'Encargado', description = 'Encargado del local'
    WHERE code = 'admin' AND tenant_id IS NULL;

    ALTER TABLE orders
      ADD COLUMN IF NOT EXISTS cash_session_id VARCHAR(24) REFERENCES cash_sessions(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS paid_at         TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS cancel_reason   VARCHAR(200),
      ADD COLUMN IF NOT EXISTS cancelled_by    VARCHAR(24),
      ADD COLUMN IF NOT EXISTS cancelled_at    TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS corrected_by    VARCHAR(24),
      ADD COLUMN IF NOT EXISTS corrected_at    TIMESTAMPTZ;

    CREATE INDEX IF NOT EXISTS idx_orders_cash_session ON orders(cash_session_id);

    ALTER TABLE cash_sessions
      ADD COLUMN IF NOT EXISTS closing_note VARCHAR(500);

    CREATE TABLE IF NOT EXISTS cash_session_closures (
      session_id  VARCHAR(24)   NOT NULL REFERENCES cash_sessions(id) ON DELETE CASCADE,
      method      VARCHAR(50)   NOT NULL,
      expected    NUMERIC(12,4) NOT NULL DEFAULT 0,
      counted     NUMERIC(12,4) NOT NULL DEFAULT 0,
      difference  NUMERIC(12,4) NOT NULL DEFAULT 0,
      PRIMARY KEY (session_id, method)
    );
  `);
}
