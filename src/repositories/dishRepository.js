import { ObjectId } from "mongodb";
import { getMongoClient } from "../db/mongo.js";
import { ConflictError, NotFoundError } from "../utils/errors.js";

const DISHES_COLLECTION = "dishes";

function getDishesCollection() {
  return getMongoClient().db().collection(DISHES_COLLECTION);
}

export function toDishObjectId(id) {
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

export async function createDish(dish) {
  try {
    const result = await getDishesCollection().insertOne({
      ...dish,
      tenantId: toTenantObjectId(dish.tenantId),
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    return { ...dish, _id: result.insertedId };
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      throw new ConflictError("A dish with this name already exists.");
    }
    throw error;
  }
}

export async function updateDish(id, update) {
  const objectId = toDishObjectId(id);

  if (!objectId) {
    throw new NotFoundError("Dish not found.");
  }

  try {
    const result = await getDishesCollection().findOneAndUpdate(
      { _id: objectId },
      { $set: { ...update, updatedAt: new Date() } },
      { returnDocument: "after" }
    );

    if (!result) {
      throw new NotFoundError("Dish not found.");
    }

    return result;
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      throw new ConflictError("A dish with this name already exists.");
    }
    throw error;
  }
}

export async function listDishes({ tenantId, active, q } = {}) {
  const filter = {};

  if (tenantId !== undefined) {
    filter.tenantId = toTenantObjectId(tenantId) ?? null;
  }

  if (active !== undefined) {
    filter.active = active;
  }

  if (q !== undefined && q.trim() !== "") {
    filter.name = { $regex: escapeRegex(q), $options: "i" };
  }

  return getDishesCollection()
    .find(filter)
    .sort({ name: 1 })
    .toArray();
}

export async function findDishById(id) {
  const objectId = toDishObjectId(id);

  if (!objectId) {
    return null;
  }

  return getDishesCollection().findOne({ _id: objectId });
}

export async function findDishesByIngredientId(ingredientId) {
  const objectId = toDishObjectId(ingredientId);

  if (!objectId) {
    return [];
  }

  return getDishesCollection().find({ "recipe.ingredientId": objectId }).toArray();
}

export async function findDishesByIds(ids, { tenantId } = {}) {
  const objectIds = ids.map(toDishObjectId).filter(Boolean);

  if (objectIds.length === 0) {
    return [];
  }

  const filter = { _id: { $in: objectIds } };

  if (tenantId !== undefined) {
    filter.tenantId = toTenantObjectId(tenantId) ?? null;
  }

  return getDishesCollection().find(filter).toArray();
}

export async function findDishByNameAndTenant(name, tenantId) {
  return getDishesCollection().findOne({
    name: { $regex: `^${escapeRegex(name)}$`, $options: "i" },
    tenantId: toTenantObjectId(tenantId),
  });
}
