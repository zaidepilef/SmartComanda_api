import { getPgPool } from "../db/postgres.js";
import { toObjectIdHex, generateObjectIdHex } from "../utils/id.js";

export function rowToLoyaltyTransaction(row) {
  if (!row) {
    return null;
  }

  return {
    _id: row.id,
    id: row.id,
    tenantId: row.tenant_id,
    branchId: row.branch_id,
    customerId: row.customer_id,
    sourceOrderId: row.source_order_id,
    type: row.type,
    points: Number(row.points),
    createdAt: row.created_at,
  };
}

export async function createTransaction(transaction) {
  const id = generateObjectIdHex();
  const pool = getPgPool();

  const { rows } = await pool.query(
    `INSERT INTO loyalty_transactions
       (id, tenant_id, branch_id, customer_id, source_order_id, type, points)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [
      id,
      toObjectIdHex(transaction.tenantId),
      toObjectIdHex(transaction.branchId),
      toObjectIdHex(transaction.customerId),
      toObjectIdHex(transaction.sourceOrderId),
      transaction.type,
      transaction.points ?? 0,
    ]
  );

  return rowToLoyaltyTransaction(rows[0]);
}

export async function findBySourceOrderId(sourceOrderId) {
  const objectId = toObjectIdHex(sourceOrderId);

  if (!objectId) {
    return null;
  }

  const { rows } = await getPgPool().query(
    `SELECT * FROM loyalty_transactions WHERE source_order_id = $1`,
    [objectId]
  );

  return rows.length > 0 ? rowToLoyaltyTransaction(rows[0]) : null;
}