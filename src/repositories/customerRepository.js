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
const numberOrNull = (value) => (value === null || value === undefined ? null : Number(value));

export function rowToAddress(row) {
  if (!row) {
    return null;
  }

  return {
    _id: row.id,
    id: row.id,
    tenantId: row.tenant_id,
    customerId: row.customer_id,
    address: row.address,
    reference: row.reference ?? null,
    lat: numberOrNull(row.lat),
    lng: numberOrNull(row.lng),
    lastUsedAt: row.last_used_at,
    createdAt: row.created_at,
  };
}

/** Direcciones del cliente, la más usada recientemente primero. */
export async function listAddresses(customerId) {
  const { rows } = await getPgPool().query(
    `SELECT * FROM customer_addresses WHERE customer_id = $1 ORDER BY last_used_at DESC, created_at DESC`,
    [toObjectIdHex(customerId)]
  );

  return rows.map(rowToAddress);
}

export async function findAddressForCustomer(addressId, customerId) {
  const objectId = toObjectIdHex(addressId);

  if (!objectId) {
    return null;
  }

  const { rows } = await getPgPool().query(
    `SELECT * FROM customer_addresses WHERE id = $1 AND customer_id = $2`,
    [objectId, toObjectIdHex(customerId)]
  );

  return rows.length > 0 ? rowToAddress(rows[0]) : null;
}

export async function insertAddress(address) {
  const { rows } = await getPgPool().query(
    `INSERT INTO customer_addresses (id, tenant_id, customer_id, address, reference, lat, lng)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [
      generateObjectIdHex(),
      toObjectIdHex(address.tenantId),
      toObjectIdHex(address.customerId),
      address.address,
      address.reference ?? null,
      address.lat,
      address.lng,
    ]
  );

  return rowToAddress(rows[0]);
}

/** Marca la dirección como usada ahora y actualiza la referencia si viene una. */
export async function touchAddress(addressId, { reference } = {}) {
  const { rows } = await getPgPool().query(
    `UPDATE customer_addresses
     SET last_used_at = NOW(), reference = COALESCE($2, reference)
     WHERE id = $1
     RETURNING *`,
    [toObjectIdHex(addressId), reference ?? null]
  );

  return rows.length > 0 ? rowToAddress(rows[0]) : null;
}

/** Deja solo las `keep` direcciones usadas más recientemente. */
export async function pruneAddresses(customerId, keep) {
  await getPgPool().query(
    `DELETE FROM customer_addresses
     WHERE customer_id = $1 AND id NOT IN (
       SELECT id FROM customer_addresses WHERE customer_id = $1
       ORDER BY last_used_at DESC, created_at DESC LIMIT $2
     )`,
    [toObjectIdHex(customerId), keep]
  );
}
