import { getMongoClient } from "./mongo.js";
import { getPgPool } from "./postgres.js";
import { generateObjectIdHex } from "../utils/id.js";

const DISHES_COLLECTION = "dishes";

function normalizeId(id) {
  if (id && typeof id.toString === "function" && id._bsontype !== undefined) {
    return id.toString();
  }
  if (id && typeof id === "string") {
    return id;
  }
  if (id && typeof id.toString === "function") {
    return id.toString();
  }
  return id || null;
}

function toHexOrNull(value) {
  if (!value && value !== "") {
    return null;
  }
  return normalizeId(value);
}

function serializeRecipe(recipe) {
  if (!Array.isArray(recipe)) {
    return [];
  }
  return recipe.map((line) => ({
    ingredientId: toHexOrNull(line.ingredientId),
    quantity: typeof line.quantity === "number" ? line.quantity : 1,
    unit: line.unit ?? "unidad",
  }));
}

function serializeBranchPrices(branchPrices) {
  if (!Array.isArray(branchPrices)) {
    return null;
  }
  return branchPrices.map((entry) => ({
    branchId: toHexOrNull(entry.branchId),
    price: typeof entry.price === "number" ? entry.price : null,
  }));
}

export async function importDishesFromMongo() {
  const mongo = getMongoClient();
  const pool = getPgPool();

  const docs = await mongo.db().collection(DISHES_COLLECTION).find({}).toArray();

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    for (const doc of docs) {
      const id = toHexOrNull(doc._id) || generateObjectIdHex();

      await client.query(
        `INSERT INTO dishes (id, tenant_id, name, sale_price, active, description, category, icon, recipe, branch_prices, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
         ON CONFLICT (id) DO UPDATE SET
           tenant_id = EXCLUDED.tenant_id,
           name = EXCLUDED.name,
           sale_price = EXCLUDED.sale_price,
           active = EXCLUDED.active,
           description = EXCLUDED.description,
           category = EXCLUDED.category,
           icon = EXCLUDED.icon,
           recipe = EXCLUDED.recipe,
           branch_prices = EXCLUDED.branch_prices,
           updated_at = EXCLUDED.updated_at`,
        [
          id,
          toHexOrNull(doc.tenantId),
          doc.name,
          typeof doc.salePrice === "number" ? doc.salePrice : 0,
          doc.active === undefined ? true : doc.active,
          doc.description ?? null,
          doc.category ?? null,
          doc.icon ?? null,
          JSON.stringify(serializeRecipe(doc.recipe)),
          serializeBranchPrices(doc.branchPrices)
            ? JSON.stringify(serializeBranchPrices(doc.branchPrices))
            : null,
          doc.createdAt ? new Date(doc.createdAt) : new Date(),
          doc.updatedAt ? new Date(doc.updatedAt) : new Date(),
        ]
      );
    }

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }

  return {
    dishesImported: docs.length,
    dishesCountMongo: docs.length,
  };
}