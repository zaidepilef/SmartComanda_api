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

function resolveNullableBranch(branchId) {
  if (branchId === null || branchId === undefined) {
    return null;
  }
  return toObjectId(branchId);
}

export function stockPoolFilter({ tenantId, ingredientId, branchId }) {
  const filter = {
    tenantId: toObjectId(tenantId),
    ingredientId: toObjectId(ingredientId),
  };

  const resolvedBranchId = resolveNullableBranch(branchId);

  if (resolvedBranchId === null) {
    filter.branchId = null;
  } else {
    filter.branchId = resolvedBranchId;
  }

  return filter;
}

export async function findStock(pool) {
  return getStocksCollection().findOne(stockPoolFilter(pool));
}

export async function listStocks({ tenantId, branchId } = {}) {
  const filter = {};

  if (tenantId !== undefined) {
    filter.tenantId = toObjectId(tenantId);
  }

  if (branchId !== undefined) {
    const resolvedBranchId = resolveNullableBranch(branchId);

    if (resolvedBranchId === null) {
      filter.branchId = null;
    } else {
      filter.branchId = resolvedBranchId;
    }
  }

  return getStocksCollection().find(filter).toArray();
}

export async function adjustStock(pool, quantityChange) {
  const filter = stockPoolFilter(pool);

  const document = {
    $set: {
      tenantId: toObjectId(pool.tenantId),
      ingredientId: toObjectId(pool.ingredientId),
      ...(filter.branchId === null ? {} : { branchId: filter.branchId }),
      updatedAt: new Date(),
    },
    $inc: { quantity: quantityChange },
    $setOnInsert: { createdAt: new Date() },
  };

  return getStocksCollection().findOneAndUpdate(
    filter,
    document,
    { upsert: true, returnDocument: "after" }
  );
}

export async function countStocksForTenant(tenantId) {
  return getStocksCollection().countDocuments({ tenantId: toObjectId(tenantId) });
}
