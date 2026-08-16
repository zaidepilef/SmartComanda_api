import { ObjectId } from "mongodb";
import { getMongoClient } from "../db/mongo.js";
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
