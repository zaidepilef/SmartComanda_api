/** Datos de entrega y estimación de envío de los pedidos a domicilio. */
export async function up(pool) {
  await pool.query(`
    ALTER TABLE orders
      ADD COLUMN IF NOT EXISTS delivery_address TEXT,
      ADD COLUMN IF NOT EXISTS delivery_reference TEXT,
      ADD COLUMN IF NOT EXISTS delivery_lat NUMERIC(9,6),
      ADD COLUMN IF NOT EXISTS delivery_lng NUMERIC(9,6),
      ADD COLUMN IF NOT EXISTS delivery_accuracy_m INTEGER,
      ADD COLUMN IF NOT EXISTS delivery_distance_km NUMERIC(6,2),
      ADD COLUMN IF NOT EXISTS delivery_eta_minutes INTEGER,
      ADD COLUMN IF NOT EXISTS delivery_out_of_range BOOLEAN;
    CREATE INDEX IF NOT EXISTS idx_orders_branch_type_created
      ON orders(foodtruck_id, order_type, created_at);
  `);
}
