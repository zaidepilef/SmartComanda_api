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

export async function findSessionById(sessionId, tenantId) {
  const objectId = toCashSessionObjectId(sessionId);

  if (!objectId) {
    return null;
  }

  const filter = { _id: objectId };

  if (tenantId !== undefined) {
    filter.tenantId = toTenantObjectId(tenantId);
  }

  return getCashSessionsCollection().findOne(filter);
}

export async function closeSession(sessionId, tenantId, patch) {
  const objectId = toCashSessionObjectId(sessionId);

  if (!objectId) {
    return null;
  }

  const filter = {
    _id: objectId,
    status: CASH_SESSION_STATUSES.OPEN,
  };

  if (tenantId !== undefined) {
    filter.tenantId = toTenantObjectId(tenantId);
  }

  return getCashSessionsCollection().findOneAndUpdate(
    filter,
    { $set: { ...patch, status: CASH_SESSION_STATUSES.CLOSED, updatedAt: new Date() } },
    { returnDocument: "after" }
  );
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
