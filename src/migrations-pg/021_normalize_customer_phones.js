import { normalizeLegacyPhone } from "../utils/phone.js";

/**
 * Normaliza los teléfonos guardados al formato +569XXXXXXXX. Si dos clientes del
 * mismo tenant quedarían con el mismo teléfono no se fusionan: se informan en el log.
 */
export async function up(pool) {
  const { rows: customers } = await pool.query(
    `SELECT id, tenant_id, phone FROM customers WHERE phone !~ '^\\+569[0-9]{8}$'`
  );

  for (const customer of customers) {
    const phone = normalizeLegacyPhone(customer.phone);

    if (!phone) {
      console.warn(`[021] Teléfono no normalizable, se mantiene: cliente ${customer.id}`);
      continue;
    }

    const { rows: clash } = await pool.query(
      `SELECT id FROM customers WHERE tenant_id = $1 AND phone = $2 AND id <> $3`,
      [customer.tenant_id, phone, customer.id]
    );

    if (clash.length > 0) {
      console.warn(
        `[021] Teléfono duplicado al normalizar, revisar a mano: clientes ${customer.id} y ${clash[0].id}`
      );
      continue;
    }

    await pool.query(`UPDATE customers SET phone = $2, updated_at = NOW() WHERE id = $1`, [
      customer.id,
      phone,
    ]);
  }

  const { rows: orders } = await pool.query(
    `SELECT id, client_phone FROM orders
     WHERE client_phone IS NOT NULL AND client_phone !~ '^\\+569[0-9]{8}$'`
  );

  for (const order of orders) {
    const phone = normalizeLegacyPhone(order.client_phone);

    if (phone) {
      await pool.query(`UPDATE orders SET client_phone = $2 WHERE id = $1`, [order.id, phone]);
    }
  }
}
