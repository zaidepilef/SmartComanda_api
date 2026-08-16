import { ObjectId } from "mongodb";
import { getMongoClient } from "../db/mongo.js";
import { ConflictError, NotFoundError } from "../utils/errors.js";

const INGREDIENTS_COLLECTION = "ingredients";

function getIngredientsCollection() {
  return getMongoClient().db().collection(INGREDIENTS_COLLECTION);
}

export function toIngredientObjectId(id) {
  return ObjectId.isValid(id) ? new ObjectId(id) : null;
}

function toTenantObjectId(tenantId) {
  return ObjectId.isValid(tenantId) ? new ObjectId(tenantId) : null;
}

function escapeRegex(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isDuplicateKeyError(error) {
  return error && error.code === 11000;
}

export async function createIngredient(ingredient) {
  try {
    const result = await getIngredientsCollection().insertOne({
      ...ingredient,
      tenantId: toTenantObjectId(ingredient.tenantId),
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    return { ...ingredient, _id: result.insertedId };
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      throw new ConflictError("An ingredient with this name already exists.");
    }
    throw error;
  }
}

export async function updateIngredient(id, update) {
  const objectId = toIngredientObjectId(id);

  if (!objectId) {
    throw new NotFoundError("Ingredient not found.");
  }

  try {
    const result = await getIngredientsCollection().findOneAndUpdate(
      { _id: objectId },
      { $set: { ...update, updatedAt: new Date() } },
      { returnDocument: "after" }
    );

    if (!result) {
      throw new NotFoundError("Ingredient not found.");
    }

    return result;
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      throw new ConflictError("An ingredient with this name already exists.");
    }
    throw error;
  }
}

export async function listIngredients({ tenantId, q } = {}) {
  const filter = {};

  if (tenantId !== undefined) {
    filter.tenantId = toTenantObjectId(tenantId) ?? null;
  }

  if (q !== undefined && q.trim() !== "") {
    filter.name = { $regex: escapeRegex(q), $options: "i" };
  }

  return getIngredientsCollection()
    .find(filter)
    .sort({ name: 1 })
    .toArray();
}

export async function findIngredientById(id) {
  const objectId = toIngredientObjectId(id);

  if (!objectId) {
    return null;
  }

  return getIngredientsCollection().findOne({ _id: objectId });
}

export async function findIngredientsByIds(ids, { tenantId } = {}) {
  const objectIds = ids.map(toIngredientObjectId).filter(Boolean);

  if (objectIds.length === 0) {
    return [];
  }

  const filter = { _id: { $in: objectIds } };

  if (tenantId !== undefined) {
    filter.tenantId = toTenantObjectId(tenantId) ?? null;
  }

  return getIngredientsCollection().find(filter).toArray();
}

export async function findIngredientByNameAndTenant(name, tenantId) {
  return getIngredientsCollection().findOne({
    name: { $regex: `^${escapeRegex(name)}$`, $options: "i" },
    tenantId: toTenantObjectId(tenantId),
  });
}
