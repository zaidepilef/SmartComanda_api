import { getMongoClient } from "./mongo.js";
import { getPgPool } from "./postgres.js";
import { generateObjectIdHex } from "../utils/id.js";

const INGREDIENTS_COLLECTION = "ingredients";

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

export async function importIngredientsFromMongo() {
  const mongo = getMongoClient();
  const pool = getPgPool();

  const docs = await mongo.db().collection(INGREDIENTS_COLLECTION).find({}).toArray();

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    for (const doc of docs) {
      const id = toHexOrNull(doc._id) || generateObjectIdHex();

      await client.query(
        `INSERT INTO ingredients (id, tenant_id, name, unit, dimension, unit_cost, notes, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (id) DO UPDATE SET
           tenant_id = EXCLUDED.tenant_id,
           name = EXCLUDED.name,
           unit = EXCLUDED.unit,
           dimension = EXCLUDED.dimension,
           unit_cost = EXCLUDED.unit_cost,
           notes = EXCLUDED.notes,
           updated_at = EXCLUDED.updated_at`,
        [
          id,
          toHexOrNull(doc.tenantId),
          doc.name,
          doc.unit,
          doc.dimension,
          typeof doc.unitCost === "number" ? doc.unitCost : 0,
          doc.notes ?? null,
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
    ingredientsImported: docs.length,
    ingredientsCountMongo: docs.length,
  };
}