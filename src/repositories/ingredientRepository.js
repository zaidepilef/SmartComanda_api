import { getPgPool } from "../db/postgres.js";
import { toObjectIdHex, generateObjectIdHex } from "../utils/id.js";
import { ConflictError, NotFoundError } from "../utils/errors.js";

export function toIngredientObjectId(id) {
  return toObjectIdHex(id);
}

function isDuplicateKeyError(error) {
  return error && error.code === "23505";
}

function escapeLike(text) {
  return text.replace(/[\\%_]/g, "\\$&");
}

export function rowToIngredient(row) {
  if (!row) {
    return null;
  }

  return {
    _id: row.id,
    id: row.id,
    tenantId: row.tenant_id,
    name: row.name,
    unit: row.unit,
    dimension: row.dimension,
    unitCost: Number(row.unit_cost),
    notes: row.notes ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function createIngredient(ingredient) {
  const id = generateObjectIdHex();
  const pool = getPgPool();

  try {
    const { rows } = await pool.query(
      `INSERT INTO ingredients (id, tenant_id, name, unit, dimension, unit_cost, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        id,
        ingredient.tenantId ?? null,
        ingredient.name,
        ingredient.unit,
        ingredient.dimension,
        ingredient.unitCost ?? 0,
        ingredient.notes ?? null,
      ]
    );

    return rowToIngredient(rows[0]);
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      throw new ConflictError("An ingredient with this name already exists.");
    }
    throw error;
  }
}

export async function updateIngredient(id, update) {
  const objectId = toIngredientObjectId(id);

  if (!objectId) {
    throw new NotFoundError("Ingredient not found.");
  }

  const colMap = {
    name: "name",
    unit: "unit",
    dimension: "dimension",
    unitCost: "unit_cost",
    notes: "notes",
  };

  const sets = [];
  const params = [];

  for (const [key, col] of Object.entries(colMap)) {
    if (update[key] !== undefined) {
      params.push(update[key]);
      sets.push(`${col} = $${params.length}`);
    }
  }

  if (sets.length === 0) {
    throw new NotFoundError("Ingredient not found.");
  }

  params.push(new Date());
  sets.push(`updated_at = $${params.length}`);
  params.push(objectId);

  const pool = getPgPool();

  try {
    const { rows } = await pool.query(
      `UPDATE ingredients SET ${sets.join(", ")} WHERE id = $${params.length}
       RETURNING *`,
      params
    );

    if (rows.length === 0) {
      throw new NotFoundError("Ingredient not found.");
    }

    return rowToIngredient(rows[0]);
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      throw new ConflictError("An ingredient with this name already exists.");
    }
    throw error;
  }
}

export async function listIngredients({ tenantId, q } = {}) {
  const pool = getPgPool();
  const conditions = [];
  const params = [];

  if (tenantId !== undefined) {
    params.push(tenantId);
    conditions.push(`tenant_id = $${params.length}`);
  }

  if (q !== undefined && q.trim() !== "") {
    params.push(`%${escapeLike(q)}%`);
    conditions.push(`name ILIKE $${params.length} ESCAPE '\\'`);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const { rows } = await pool.query(
    `SELECT * FROM ingredients ${where} ORDER BY name ASC`,
    params
  );

  return rows.map(rowToIngredient);
}

export async function findIngredientById(id) {
  const objectId = toIngredientObjectId(id);

  if (!objectId) {
    return null;
  }

  const pool = getPgPool();
  const { rows } = await pool.query(
    `SELECT * FROM ingredients WHERE id = $1`,
    [objectId]
  );

  return rowToIngredient(rows[0] ?? null);
}

export async function findIngredientsByIds(ids, { tenantId } = {}) {
  const objectIds = ids.map(toIngredientObjectId).filter(Boolean);

  if (objectIds.length === 0) {
    return [];
  }

  const pool = getPgPool();
  const conditions = [];
  const params = [];

  params.push(objectIds);
  conditions.push(`id = ANY($${params.length}::varchar[])`);

  if (tenantId !== undefined) {
    params.push(tenantId);
    conditions.push(`tenant_id = $${params.length}`);
  }

  const { rows } = await pool.query(
    `SELECT * FROM ingredients WHERE ${conditions.join(" AND ")}`,
    params
  );

  return rows.map(rowToIngredient);
}

export async function findIngredientByNameAndTenant(name, tenantId) {
  const pool = getPgPool();

  const { rows } = await pool.query(
    `SELECT * FROM ingredients
     WHERE tenant_id = $1 AND name ILIKE $2 ESCAPE '\\'
     LIMIT 1`,
    [tenantId, escapeLike(name)]
  );

  return rowToIngredient(rows[0] ?? null);
}