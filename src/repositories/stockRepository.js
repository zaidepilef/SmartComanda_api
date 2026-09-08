import { getPgPool } from "../db/postgres.js";
import { toObjectIdHex, generateObjectIdHex } from "../utils/id.js";

export function toStockObjectId(id) {
  return toObjectIdHex(id);
}

export function rowToBatch(row) {
  if (!row) {
    return null;
  }

  return {
    _id: row.id,
    id: row.id,
    tenantId: row.tenant_id,
    branchId: row.branch_id,
    ingredientId: row.ingredient_id,
    quantity: Number(row.quantity),
    unitCost: Number(row.unit_cost),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function createBatch({ tenantId, branchId, ingredientId, quantity, unitCost }) {
  const id = generateObjectIdHex();
  const pool = getPgPool();

  const { rows } = await pool.query(
    `INSERT INTO stocks
       (id, tenant_id, branch_id, ingredient_id, quantity, unit_cost)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [id, tenantId, branchId, ingredientId, quantity, unitCost]
  );

  return rowToBatch(rows[0]);
}

export async function listBatches({ tenantId, branchId, ingredientId } = {}) {
  const pool = getPgPool();
  const conditions = [];
  const params = [];

  if (tenantId !== undefined) {
    params.push(tenantId);
    conditions.push(`tenant_id = $${params.length}`);
  }

  if (branchId !== undefined) {
    params.push(branchId);
    conditions.push(`branch_id = $${params.length}`);
  }

  if (ingredientId !== undefined) {
    params.push(ingredientId);
    conditions.push(`ingredient_id = $${params.length}`);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const { rows } = await pool.query(
    `SELECT * FROM stocks ${where} ORDER BY created_at ASC`,
    params
  );

  return rows.map(rowToBatch);
}

export async function updateBatchQuantity(batchId, quantity, { session } = {}) {
  const objectId = toStockObjectId(batchId);

  if (!objectId) {
    return null;
  }

  const run = session ?? getPgPool();

  if (quantity <= 0) {
    const { rows } = await run.query(
      `DELETE FROM stocks WHERE id = $1 RETURNING *`,
      [objectId]
    );

    return rowToBatch(rows[0] ?? null);
  }

  const { rows } = await run.query(
    `UPDATE stocks SET quantity = $1, updated_at = NOW() WHERE id = $2
     RETURNING *`,
    [quantity, objectId]
  );

  return rowToBatch(rows[0] ?? null);
}
