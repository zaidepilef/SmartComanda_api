/**
 * Flujo de compra del comensal: medio de pago esperado, idempotencia,
 * repartidor, dirección guardada e historial de pagos (ver customer-purchase-flow).
 */
export async function up(pool) {
  await pool.query(`
    ALTER TABLE orders
      ADD COLUMN IF NOT EXISTS expected_payment_method VARCHAR(20),
      ADD COLUMN IF NOT EXISTS cash_tendered           NUMERIC(12,4),
      ADD COLUMN IF NOT EXISTS client_request_id       UUID,
      ADD COLUMN IF NOT EXISTS driver_id               VARCHAR(24) REFERENCES users(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS customer_address_id     VARCHAR(24) REFERENCES customer_addresses(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS payment_history         JSONB NOT NULL DEFAULT '[]'::jsonb;

    CREATE UNIQUE INDEX IF NOT EXISTS uq_orders_tenant_client_request
      ON orders(tenant_id, client_request_id) WHERE client_request_id IS NOT NULL;

    CREATE INDEX IF NOT EXISTS idx_orders_delivery_board
      ON orders(foodtruck_id, status) WHERE order_type = 'delivery';
  `);
}
