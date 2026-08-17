import { ObjectId } from "mongodb";
import { getMongoClient } from "../db/mongo.js";
import { NotFoundError } from "../utils/errors.js";
import { toOrderDocument } from "../models/order.js";

const ORDERS_COLLECTION = "orders";

function getOrdersCollection() {
  return getMongoClient().db().collection(ORDERS_COLLECTION);
}

export function toOrderObjectId(id) {
  return ObjectId.isValid(id) ? new ObjectId(id) : null;
}

export async function createOrder(order) {
  const document = toOrderDocument(order);
  const result = await getOrdersCollection().insertOne(document);
  return { ...document, _id: result.insertedId };
}

export async function updateOrderItems(orderId, items) {
  const objectId = toOrderObjectId(orderId);

  if (!objectId) {
    throw new NotFoundError("Order not found.");
  }

  const result = await getOrdersCollection().findOneAndUpdate(
    { _id: objectId },
    { $set: { items, updatedAt: new Date() } },
    { returnDocument: "after" }
  );

  if (!result) {
    throw new NotFoundError("Order not found.");
  }

  return result;
}
