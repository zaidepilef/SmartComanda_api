import { ObjectId } from "mongodb";
import { getMongoClient } from "../db/mongo.js";

const MOVEMENTS_COLLECTION = "inventory-movements";

function getMovementsCollection() {
  return getMongoClient().db().collection(MOVEMENTS_COLLECTION);
}

function toObjectId(value) {
  return ObjectId.isValid(value) ? new ObjectId(value) : null;
}

export function toMovementObjectId(id) {
  return ObjectId.isValid(id) ? new ObjectId(id) : null;
}

export async function createMovement(movement) {
  const document = {
    tenantId: toObjectId(movement.tenantId),
    ingredientId: toObjectId(movement.ingredientId),
    quantity: movement.quantity,
    type: movement.type,
    reason: movement.reason,
    createdBy: movement.createdBy ? toObjectId(movement.createdBy) : null,
    createdAt: new Date(),
  };

  if (movement.branchId !== null && movement.branchId !== undefined) {
    document.branchId = toObjectId(movement.branchId);
  }

  if (movement.orderId) {
    document.orderId = toObjectId(movement.orderId);
  }

  const result = await getMovementsCollection().insertOne(document);
  return { ...document, _id: result.insertedId };
}

export async function listMovements({ tenantId, ingredientId, branchId } = {}) {
  const filter = {};

  if (tenantId !== undefined) {
    filter.tenantId = toObjectId(tenantId);
  }

  if (ingredientId !== undefined) {
    filter.ingredientId = toObjectId(ingredientId);
  }

  if (branchId !== undefined) {
    filter.branchId = toObjectId(branchId);
  }

  return getMovementsCollection()
    .find(filter)
    .sort({ createdAt: -1 })
    .toArray();
}
