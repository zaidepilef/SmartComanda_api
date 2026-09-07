import { getPgPool } from "../db/postgres.js";
import { toObjectIdHex, generateObjectIdHex } from "../utils/id.js";
import { ConflictError, NotFoundError } from "../utils/errors.js";

export function toDishObjectId(id) {
  return toObjectIdHex(id);
}

function toHex(value) {
  return value != null ? String(value) : null;
}

function isDuplicateKeyError(error) {
  return error && error.code === "23505";
}

function escapeLike(text) {
  return text.replace(/[\\%_]/g, "\\$&");
}

function serializeRecipe(recipe) {
  return recipe.map((line) => ({
    ingredientId: toHex(line.ingredientId),
    quantity: line.quantity,
    unit: line.unit,
  }));
}

function serializeBranchPrices(branchPrices) {
  return branchPrices.map((entry) => ({
    branchId: toHex(entry.branchId),
    price: entry.price,
  }));
}

export function rowToDish(row) {
  if (!row) {
    return null;
  }

  return {
    _id: row.id,
    id: row.id,
    tenantId: row.tenant_id,
    name: row.name,
    salePrice: Number(row.sale_price),
    active: row.active,
    description: row.description ?? null,
    category: row.category ?? null,
    icon: row.icon ?? null,
    recipe: row.recipe,
    branchPrices: row.branch_prices ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function createDish(dish) {
  const id = generateObjectIdHex();
  const pool = getPgPool();

  try {
    const { rows } = await pool.query(
      `INSERT INTO dishes
         (id, tenant_id, name, sale_price, active, description, category, icon, recipe, branch_prices)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [
        id,
        dish.tenantId ?? null,
        dish.name,
        dish.salePrice ?? 0,
        dish.active ?? true,
        dish.description ?? null,
        dish.category ?? null,
        dish.icon ?? null,
        dish.recipe ? JSON.stringify(serializeRecipe(dish.recipe)) : [],
        dish.branchPrices !== undefined
          ? JSON.stringify(serializeBranchPrices(dish.branchPrices))
          : null,
      ]
    );

    return rowToDish(rows[0]);
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      throw new ConflictError("A dish with this name already exists.");
    }
    throw error;
  }
}

export async function updateDish(id, update) {
  const objectId = toDishObjectId(id);

  if (!objectId) {
    throw new NotFoundError("Dish not found.");
  }

  const colMap = {
    name: "name",
    salePrice: "sale_price",
    active: "active",
    description: "description",
    category: "category",
    icon: "icon",
  };

  const sets = [];
  const params = [];

  for (const [key, col] of Object.entries(colMap)) {
    if (update[key] !== undefined) {
      params.push(update[key]);
      sets.push(`${col} = $${params.length}`);
    }
  }

  if (update.recipe !== undefined) {
    params.push(JSON.stringify(serializeRecipe(update.recipe)));
    sets.push(`recipe = $${params.length}`);
  }

  if (update.branchPrices !== undefined) {
    params.push(JSON.stringify(serializeBranchPrices(update.branchPrices)));
    sets.push(`branch_prices = $${params.length}`);
  }

  if (sets.length === 0) {
    throw new NotFoundError("Dish not found.");
  }

  params.push(new Date());
  sets.push(`updated_at = $${params.length}`);
  params.push(objectId);

  const pool = getPgPool();

  try {
    const { rows } = await pool.query(
      `UPDATE dishes SET ${sets.join(", ")} WHERE id = $${params.length}
       RETURNING *`,
      params
    );

    if (rows.length === 0) {
      throw new NotFoundError("Dish not found.");
    }

    return rowToDish(rows[0]);
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      throw new ConflictError("A dish with this name already exists.");
    }
    throw error;
  }
}

export async function listDishes({ tenantId, active, q } = {}) {
  const pool = getPgPool();
  const conditions = [];
  const params = [];

  if (tenantId !== undefined) {
    params.push(tenantId);
    conditions.push(`tenant_id = $${params.length}`);
  }

  if (active !== undefined) {
    params.push(active === true || active === "true");
    conditions.push(`active = $${params.length}`);
  }

  if (q !== undefined && q.trim() !== "") {
    params.push(`%${escapeLike(q)}%`);
    conditions.push(`name ILIKE $${params.length} ESCAPE '\\'`);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const { rows } = await pool.query(
    `SELECT * FROM dishes ${where} ORDER BY name ASC`,
    params
  );

  return rows.map(rowToDish);
}

export async function findDishById(id) {
  const objectId = toDishObjectId(id);

  if (!objectId) {
    return null;
  }

  const pool = getPgPool();
  const { rows } = await pool.query(
    `SELECT * FROM dishes WHERE id = $1`,
    [objectId]
  );

  return rowToDish(rows[0] ?? null);
}

export async function findDishesByIngredientId(ingredientId) {
  const objectId = toDishObjectId(ingredientId);

  if (!objectId) {
    return [];
  }

  const pool = getPgPool();
  const { rows } = await pool.query(
    `SELECT * FROM dishes WHERE recipe @> $1::jsonb`,
    [JSON.stringify([{ ingredientId: objectId }])]
  );

  return rows.map(rowToDish);
}

export async function findDishesByIds(ids, { tenantId } = {}) {
  const objectIds = ids.map(toDishObjectId).filter(Boolean);

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
    `SELECT * FROM dishes WHERE ${conditions.join(" AND ")}`,
    params
  );

  return rows.map(rowToDish);
}

export async function findDishByNameAndTenant(name, tenantId) {
  const pool = getPgPool();

  const { rows } = await pool.query(
    `SELECT * FROM dishes
     WHERE tenant_id = $1 AND name ILIKE $2 ESCAPE '\\'
     LIMIT 1`,
    [tenantId, escapeLike(name)]
  );

  return rowToDish(rows[0] ?? null);
}