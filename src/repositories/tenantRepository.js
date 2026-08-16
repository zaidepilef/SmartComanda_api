import { ObjectId } from "mongodb";
import { getMongoClient } from "../db/mongo.js";
import { ConflictError, NotFoundError } from "../utils/errors.js";

const TENANTS_COLLECTION = "tenants";
const USERS_COLLECTION = "users";
const BRANCHES_COLLECTION = "branches";

function getTenantsCollection() {
  return getMongoClient().db().collection(TENANTS_COLLECTION);
}

export function toTenantObjectId(id) {
  return ObjectId.isValid(id) ? new ObjectId(id) : null;
}

function isDuplicateKeyError(error) {
  return error && error.code === 11000;
}

export async function createTenant(tenant) {
  try {
    const result = await getTenantsCollection().insertOne({
      ...tenant,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    return { ...tenant, _id: result.insertedId, userCount: 0 };
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      throw new ConflictError("A tenant with this rut already exists.");
    }
    throw error;
  }
}

export async function updateTenant(id, update) {
  const objectId = toTenantObjectId(id);

  if (!objectId) {
    throw new NotFoundError("Tenant not found.");
  }

  try {
    const result = await getTenantsCollection().findOneAndUpdate(
      { _id: objectId },
      { $set: { ...update, updatedAt: new Date() } },
      { returnDocument: "after" }
    );

    if (!result) {
      throw new NotFoundError("Tenant not found.");
    }

    return result;
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      throw new ConflictError("A tenant with this rut already exists.");
    }
    throw error;
  }
}

export async function listTenants({ active, id } = {}) {
  const filter = {};

  if (active !== undefined) {
    filter.active = active;
  }

  if (id) {
    filter._id = toTenantObjectId(id);
  }

  return getTenantsCollection()
    .aggregate([
      { $match: filter },
      { $sort: { name: 1 } },
      {
        $lookup: {
          from: USERS_COLLECTION,
          localField: "_id",
          foreignField: "tenantId",
          as: "users",
        },
      },
      {
        $lookup: {
          from: BRANCHES_COLLECTION,
          localField: "_id",
          foreignField: "tenantId",
          as: "branches",
        },
      },
      {
        $addFields: {
          userCount: { $size: "$users" },
          branchCount: { $size: "$branches" },
        },
      },
      { $project: { users: 0, branches: 0 } },
    ])
    .toArray();
}

export async function findTenantById(id) {
  const objectId = toTenantObjectId(id);

  if (!objectId) {
    return null;
  }

  return getTenantsCollection().findOne({ _id: objectId });
}

export async function updateTenantWarehouseMode(id, warehouseMode) {
  const objectId = toTenantObjectId(id);

  if (!objectId) {
    throw new NotFoundError("Tenant not found.");
  }

  const result = await getTenantsCollection().findOneAndUpdate(
    { _id: objectId },
    { $set: { warehouseMode, updatedAt: new Date() } },
    { returnDocument: "after" }
  );

  if (!result) {
    throw new NotFoundError("Tenant not found.");
  }

  return result;
}