import { ObjectId } from "mongodb";
import { getMongoClient } from "../db/mongo.js";

const STOCKS_COLLECTION = "stocks";

function getStocksCollection() {
  return getMongoClient().db().collection(STOCKS_COLLECTION);
}

function toObjectId(value) {
  return ObjectId.isValid(value) ? new ObjectId(value) : null;
}

export function toStockObjectId(id) {
  return ObjectId.isValid(id) ? new ObjectId(id) : null;
}

export async function createBatch({ tenantId, branchId, ingredientId, quantity, unitCost }) {
  const document = {
    tenantId: toObjectId(tenantId),
    branchId: toObjectId(branchId),
    ingredientId: toObjectId(ingredientId),
    quantity,
    unitCost,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const result = await getStocksCollection().insertOne(document);
  return { ...document, _id: result.insertedId };
}

export async function listBatches({ tenantId, branchId, ingredientId } = {}) {
  const filter = {};

  if (tenantId !== undefined) {
    filter.tenantId = toObjectId(tenantId);
  }

  if (branchId !== undefined) {
    filter.branchId = toObjectId(branchId);
  }

  if (ingredientId !== undefined) {
    filter.ingredientId = toObjectId(ingredientId);
  }

  return getStocksCollection().find(filter).sort({ createdAt: 1 }).toArray();
}

export async function updateBatchQuantity(batchId, quantity, { session } = {}) {
  const objectId = toStockObjectId(batchId);

  if (!objectId) {
    return null;
  }

  const options = session ? { session } : {};

  if (quantity <= 0) {
    return getStocksCollection().findOneAndDelete({ _id: objectId }, options);
  }

  return getStocksCollection().findOneAndUpdate(
    { _id: objectId },
    { $set: { quantity, updatedAt: new Date() } },
    { ...options, returnDocument: "after" }
  );
}