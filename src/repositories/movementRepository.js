import { getPgPool } from "../db/postgres.js";
import { toObjectIdHex, generateObjectIdHex } from "../utils/id.js";

function toHex(value) {
  return value != null ? String(value) : null;
}

export function toMovementObjectId(id) {
  return toObjectIdHex(id);
}

export function rowToMovement(row) {
  if (!row) {
    return null;
  }

  return {
    _id: row.id,
    id: row.id,
    tenantId: row.tenant_id,
    ingredientId: row.ingredient_id,
    branchId: row.branch_id ?? null,
    quantity: Number(row.quantity),
    type: row.type,
    reason: row.reason ?? null,
    createdBy: row.created_by ?? null,
    createdAt: row.created_at,
    unitCost: row.unit_cost != null ? Number(row.unit_cost) : null,
    batchId: row.batch_id ?? null,
    batches: row.batches ?? null,
    orderId: row.order_id ?? null,
  };
}

export async function createMovement(movement) {
  const id = generateObjectIdHex();
  const pool = getPgPool();

  const batches =
    movement.batches !== undefined && movement.batches !== null
      ? movement.batches.map((entry) => ({
          batchId: toHex(entry.batchId),
          quantity: entry.quantity,
          unitCost: entry.unitCost,
        }))
      : null;

  const { rows } = await pool.query(
    `INSERT INTO inventory_movements
       (id, tenant_id, ingredient_id, branch_id, quantity, type, reason, unit_cost,
        batch_id, batches, order_id, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
     RETURNING *`,
    [
      id,
      toHex(movement.tenantId),
      toHex(movement.ingredientId),
      movement.branchId != null ? toHex(movement.branchId) : null,
      movement.quantity,
      movement.type,
      movement.reason ?? null,
      movement.unitCost !== undefined && movement.unitCost !== null
        ? movement.unitCost
        : null,
      movement.batchId ? toHex(movement.batchId) : null,
      batches ? JSON.stringify(batches) : null,
      movement.orderId ? toHex(movement.orderId) : null,
      movement.createdBy ? toHex(movement.createdBy) : null,
    ]
  );

  return rowToMovement(rows[0]);
}

export async function listMovements({ tenantId, ingredientId, branchId } = {}) {
  const pool = getPgPool();
  const conditions = [];
  const params = [];

  if (tenantId !== undefined) {
    params.push(toHex(tenantId));
    conditions.push(`tenant_id = $${params.length}`);
  }

  if (ingredientId !== undefined) {
    params.push(toHex(ingredientId));
    conditions.push(`ingredient_id = $${params.length}`);
  }

  if (branchId !== undefined) {
    params.push(toHex(branchId));
    conditions.push(`branch_id = $${params.length}`);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const { rows } = await pool.query(
    `SELECT * FROM inventory_movements ${where} ORDER BY created_at DESC`,
    params
  );

  return rows.map(rowToMovement);
}