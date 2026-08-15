import { ObjectId } from "mongodb";
import { getMongoClient } from "../db/mongo.js";
import { NotFoundError } from "../utils/errors.js";

const BRANCHES_COLLECTION = "branches";

function getBranchesCollection() {
  return getMongoClient().db().collection(BRANCHES_COLLECTION);
}

export function toBranchObjectId(id) {
  return ObjectId.isValid(id) ? new ObjectId(id) : null;
}

function toTenantObjectId(tenantId) {
  return ObjectId.isValid(tenantId) ? new ObjectId(tenantId) : null;
}

function escapeRegex(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export async function createBranch(branch) {
  const document = { ...branch, tenantId: toTenantObjectId(branch.tenantId) };
  const result = await getBranchesCollection().insertOne({
    ...document,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  return { ...document, _id: result.insertedId };
}

export async function updateBranch(id, update) {
  const objectId = toBranchObjectId(id);

  if (!objectId) {
    throw new NotFoundError("Branch not found.");
  }

  const document = {
    ...update,
    ...(update.tenantId !== undefined ? { tenantId: toTenantObjectId(update.tenantId) } : {}),
  };

  const result = await getBranchesCollection().findOneAndUpdate(
    { _id: objectId },
    { $set: { ...document, updatedAt: new Date() } },
    { returnDocument: "after" }
  );

  if (!result) {
    throw new NotFoundError("Branch not found.");
  }

  return result;
}

export async function listBranches({ tenantId, active, q } = {}) {
  const filter = {};

  if (active !== undefined) {
    filter.active = active;
  }

  if (tenantId !== undefined) {
    filter.tenantId = toTenantObjectId(tenantId) ?? null;
  }

  if (q !== undefined && q.trim() !== "") {
    filter.name = { $regex: escapeRegex(q), $options: "i" };
  }

  return getBranchesCollection()
    .find(filter)
    .sort({ name: 1 })
    .toArray();
}

export async function findBranchById(id) {
  const objectId = toBranchObjectId(id);

  if (!objectId) {
    return null;
  }

  return getBranchesCollection().findOne({ _id: objectId });
}
