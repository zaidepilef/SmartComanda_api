import { ObjectId } from "mongodb";
import { getMongoClient } from "../db/mongo.js";
import { CASH_SESSION_STATUSES, toCashSessionDocument } from "../models/cashSession.js";

const CASH_SESSIONS_COLLECTION = "cash-sessions";

function getCashSessionsCollection() {
  return getMongoClient().db().collection(CASH_SESSIONS_COLLECTION);
}

export function toCashSessionObjectId(id) {
  return ObjectId.isValid(id) ? new ObjectId(id) : null;
}

function toTenantObjectId(tenantId) {
  return tenantId !== undefined && ObjectId.isValid(tenantId) ? new ObjectId(tenantId) : null;
}

export async function createCashSession(session) {
  const document = toCashSessionDocument(session);
  const result = await getCashSessionsCollection().insertOne(document);
  return { ...document, _id: result.insertedId };
}

export async function findOpenByBranch(branchId, tenantId) {
  const objectId = toCashSessionObjectId(branchId);

  if (!objectId) {
    return null;
  }

  return getCashSessionsCollection().findOne({
    branchId: objectId,
    tenantId: toTenantObjectId(tenantId),
    status: CASH_SESSION_STATUSES.OPEN,
  });
}

export async function incrementTotals(branchId, tenantId, method, total) {
  const objectId = toCashSessionObjectId(branchId);

  if (!objectId) {
    return null;
  }

  return getCashSessionsCollection().findOneAndUpdate(
    {
      branchId: objectId,
      tenantId: toTenantObjectId(tenantId),
      status: CASH_SESSION_STATUSES.OPEN,
    },
    { $inc: { [`totals.${method}`]: total, orderCount: 1 } },
    { returnDocument: "after" }
  );
}
