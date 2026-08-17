import { ObjectId } from "mongodb";
import { getMongoClient } from "../db/mongo.js";

const CUSTOMERS_COLLECTION = "customers";

function getCustomersCollection() {
  return getMongoClient().db().collection(CUSTOMERS_COLLECTION);
}

function toTenantObjectId(tenantId) {
  return ObjectId.isValid(tenantId) ? new ObjectId(tenantId) : null;
}

function toCustomerObjectId(id) {
  return ObjectId.isValid(id) ? new ObjectId(id) : null;
}

export async function findByTenantAndPhone(tenantId, phone) {
  return getCustomersCollection().findOne({
    tenantId: toTenantObjectId(tenantId),
    phone,
  });
}

export async function upsertCustomer(customer) {
  const tenantObjectId = toTenantObjectId(customer.tenantId);
  const now = new Date();

  const document = {
    tenantId: tenantObjectId,
    phone: customer.phone,
    pointsBalance: customer.pointsBalance ?? 0,
    createdAt: now,
  };

  if (customer.firstName !== undefined) {
    document.firstName = customer.firstName;
  }

  return getCustomersCollection().findOneAndUpdate(
    {
      tenantId: tenantObjectId,
      phone: document.phone,
    },
    {
      $setOnInsert: document,
      $set: { updatedAt: now },
    },
    { upsert: true, returnDocument: "after" }
  );
}

export async function incrementBalance(customerId, points) {
  const objectId = toCustomerObjectId(customerId);

  if (!objectId) {
    return null;
  }

  return getCustomersCollection().findOneAndUpdate(
    { _id: objectId },
    { $inc: { pointsBalance: points }, $set: { updatedAt: new Date() } },
    { returnDocument: "after" }
  );
}