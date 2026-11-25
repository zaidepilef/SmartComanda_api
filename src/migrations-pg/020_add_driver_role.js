/** Rol Repartidor: toma pedidos a domicilio, cobra y confirma la entrega. */
export async function up(pool) {
  await pool.query(`
    INSERT INTO roles (code, name, description, system_role) VALUES
        ('driver', 'Repartidor', 'Reparto: entrega y cobra pedidos a domicilio', TRUE)
    ON CONFLICT (code) DO NOTHING;
  `);
}
