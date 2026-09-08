import { getPgPool } from "../db/postgres.js";
import { toObjectIdHex, generateObjectIdHex } from "../utils/id.js";

export function rowToCustomer(row) {
  if (!row) {
    return null;
  }

  return {
    _id: row.id,
    id: row.id,
    tenantId: row.tenant_id,
    phone: row.phone,
    firstName: row.first_name ?? null,
    pointsBalance: Number(row.points_balance),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function findByTenantAndPhone(tenantId, phone) {
  const { rows } = await getPgPool().query(
    `SELECT * FROM customers WHERE tenant_id = $1 AND phone = $2`,
    [toObjectIdHex(tenantId), phone]
  );

  return rows.length > 0 ? rowToCustomer(rows[0]) : null;
}

export async function upsertCustomer(customer) {
  const id = generateObjectIdHex();
  const pool = getPgPool();

  const { rows } = await pool.query(
    `INSERT INTO customers (id, tenant_id, phone, first_name, points_balance)
     VALUES ($1, $2, $3, $4, 0)
     ON CONFLICT (tenant_id, phone)
     DO UPDATE SET
       first_name = COALESCE(EXCLUDED.first_name, customers.first_name),
       updated_at = NOW()
     RETURNING *`,
    [
      id,
      toObjectIdHex(customer.tenantId),
      customer.phone,
      customer.firstName ?? null,
    ]
  );

  return rowToCustomer(rows[0]);
}

export async function incrementBalance(customerId, points) {
  const objectId = toObjectIdHex(customerId);

  if (!objectId) {
    return null;
  }

  const { rows } = await getPgPool().query(
    `UPDATE customers
     SET points_balance = points_balance + $2, updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [objectId, points]
  );

  return rows.length > 0 ? rowToCustomer(rows[0]) : null;
}