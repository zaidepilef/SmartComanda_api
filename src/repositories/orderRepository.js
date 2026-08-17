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

function toTenantObjectId(tenantId) {
  return tenantId !== undefined && ObjectId.isValid(tenantId) ? new ObjectId(tenantId) : null;
}

export async function listOrders({
  tenantId,
  branchId,
  status,
  orderType,
  paymentStatus,
  paymentMethod,
  from,
  to,
  q,
  limit,
  offset,
}) {
  const filter = {};

  if (tenantId !== undefined) {
    filter.tenantId = toTenantObjectId(tenantId);
  }

  if (branchId !== undefined) {
    filter.foodtruckId = toOrderObjectId(branchId);
  }

  if (status !== undefined) {
    filter.status = Array.isArray(status) ? { $in: status } : status;
  }

  if (orderType !== undefined) {
    filter.orderType = orderType;
  }

  if (paymentStatus !== undefined) {
    filter.paymentStatus = paymentStatus;
  }

  if (paymentMethod !== undefined) {
    filter.paymentMethod = paymentMethod;
  }

  if (from !== undefined || to !== undefined) {
    filter.createdAt = {};

    if (from !== undefined) {
      filter.createdAt.$gte = new Date(from);
    }

    if (to !== undefined) {
      filter.createdAt.$lte = new Date(to);
    }
  }

  if (q !== undefined) {
    filter.$or = [{ clientContact: { $regex: q, $options: "i" } }];

    const number = Number(q);

    if (Number.isInteger(number)) {
      filter.$or.push({ number });
    }
  }

  return getOrdersCollection()
    .find(filter)
    .sort({ createdAt: -1 })
    .skip(offset ?? 0)
    .limit(limit ?? 50)
    .toArray();
}

export async function findOrderById(orderId, tenantId) {
  const objectId = toOrderObjectId(orderId);

  if (!objectId) {
    return null;
  }

  const filter = { _id: objectId };

  if (tenantId !== undefined) {
    filter.tenantId = toTenantObjectId(tenantId);
  }

  return getOrdersCollection().findOne(filter);
}

export async function updateOrderStatus(orderId, status, actorId) {
  const objectId = toOrderObjectId(orderId);

  if (!objectId) {
    return null;
  }

  return getOrdersCollection().findOneAndUpdate(
    { _id: objectId },
    {
      $set: { status, updatedAt: new Date() },
      $push: {
        statusHistory: {
          status,
          at: new Date(),
          by: toOrderObjectId(actorId) ?? actorId,
        },
      },
    },
    { returnDocument: "after" }
  );
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
