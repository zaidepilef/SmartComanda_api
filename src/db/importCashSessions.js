import { getMongoClient } from "./mongo.js";
import { getPgPool } from "./postgres.js";
import { generateObjectIdHex } from "../utils/id.js";

const CASH_SESSIONS_COLLECTION = "cash-sessions";
const DEFAULT_PAYMENT_METHODS = [
  "cash",
  "debit",
  "credit",
  "transfer",
  "mercadopago",
  "points",
  "wallet",
];

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

function toTotals(totals) {
  if (!totals || typeof totals !== "object") {
    return DEFAULT_PAYMENT_METHODS.map((method) => ({ method, amount: 0 }));
  }
  return DEFAULT_PAYMENT_METHODS.map((method) => ({
    method,
    amount: typeof totals[method] === "number" ? totals[method] : 0,
  }));
}

export async function importCashSessionsFromMongo() {
  const mongo = getMongoClient();
  const pool = getPgPool();

  const docs = await mongo
    .db()
    .collection(CASH_SESSIONS_COLLECTION)
    .find({})
    .toArray();

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    for (const doc of docs) {
      const id = toHexOrNull(doc._id) || generateObjectIdHex();

      await client.query(
        `INSERT INTO cash_sessions (id, tenant_id, branch_id, opened_by, opened_at, opening_amount, status, closed_at, closed_by, order_count, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
         ON CONFLICT (id) DO UPDATE SET
           tenant_id = EXCLUDED.tenant_id,
           branch_id = EXCLUDED.branch_id,
           opened_by = EXCLUDED.opened_by,
           opened_at = EXCLUDED.opened_at,
           opening_amount = EXCLUDED.opening_amount,
           status = EXCLUDED.status,
           closed_at = EXCLUDED.closed_at,
           closed_by = EXCLUDED.closed_by,
           order_count = EXCLUDED.order_count,
           updated_at = EXCLUDED.updated_at`,
        [
          id,
          toHexOrNull(doc.tenantId),
          toHexOrNull(doc.branchId),
          toHexOrNull(doc.openedBy),
          doc.openedAt ? new Date(doc.openedAt) : new Date(),
          typeof doc.openingAmount === "number" ? doc.openingAmount : 0,
          doc.status || "open",
          doc.closedAt ? new Date(doc.closedAt) : null,
          toHexOrNull(doc.closedBy),
          typeof doc.orderCount === "number" ? doc.orderCount : 0,
          doc.createdAt ? new Date(doc.createdAt) : new Date(),
          doc.updatedAt ? new Date(doc.updatedAt) : new Date(),
        ]
      );

      await client.query("DELETE FROM cash_session_totals WHERE session_id = $1", [id]);

      for (const { method, amount } of toTotals(doc.totals)) {
        await client.query(
          `INSERT INTO cash_session_totals (session_id, method, amount)
           VALUES ($1, $2, $3)
           ON CONFLICT (session_id, method) DO UPDATE SET amount = EXCLUDED.amount`,
          [id, method, amount]
        );
      }
    }

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }

  return {
    cashSessionsImported: docs.length,
    cashSessionsCountMongo: docs.length,
  };
}