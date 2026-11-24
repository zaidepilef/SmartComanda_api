/** Ubicación exacta de la sucursal y límites de delivery (ver change delivery-location-estimate). */
export async function up(pool) {
  await pool.query(`
    ALTER TABLE branches
      ADD COLUMN IF NOT EXISTS lat NUMERIC(9,6),
      ADD COLUMN IF NOT EXISTS lng NUMERIC(9,6),
      ADD COLUMN IF NOT EXISTS delivery_max_km NUMERIC(5,2),
      ADD COLUMN IF NOT EXISTS delivery_max_minutes INTEGER,
      ADD COLUMN IF NOT EXISTS delivery_avg_speed_kmh NUMERIC(5,2) NOT NULL DEFAULT 25;
  `);
}
