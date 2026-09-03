import { getMongoClient } from "./mongo.js";
import { getPgPool } from "./postgres.js";
import { generateObjectIdHex } from "../utils/id.js";
import { PAYMENT_METHODS } from "../utils/paymentMethods.js";

const BRANCHES_COLLECTION = "branches";

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

export async function importBranchesFromMongo() {
  const mongo = getMongoClient();
  const pool = getPgPool();

  const docs = await mongo.db().collection(BRANCHES_COLLECTION).find({}).toArray();

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    for (const doc of docs) {
      const id = toHexOrNull(doc._id) || generateObjectIdHex();
      const paymentMethods =
        Array.isArray(doc.paymentMethods) && doc.paymentMethods.length > 0
          ? doc.paymentMethods
          : PAYMENT_METHODS;

      await client.query(
        `INSERT INTO branches (id, tenant_id, name, type, address, city, phone, active, payment_methods, next_order_number, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
         ON CONFLICT (id) DO UPDATE SET
           tenant_id = EXCLUDED.tenant_id,
           name = EXCLUDED.name,
           type = EXCLUDED.type,
           address = EXCLUDED.address,
           city = EXCLUDED.city,
           phone = EXCLUDED.phone,
           active = EXCLUDED.active,
           payment_methods = EXCLUDED.payment_methods,
           next_order_number = EXCLUDED.next_order_number,
           updated_at = EXCLUDED.updated_at`,
        [
          id,
          toHexOrNull(doc.tenantId),
          doc.name,
          doc.type || "Sucursal",
          doc.address ?? null,
          doc.city ?? null,
          doc.phone ?? null,
          doc.active === undefined ? true : doc.active,
          JSON.stringify(paymentMethods),
          typeof doc.nextOrderNumber === "number" ? doc.nextOrderNumber : 0,
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
    branchesImported: docs.length,
    branchesCountMongo: docs.length,
  };
}
