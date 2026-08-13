import { getMongoClient } from "../db/mongo.js";
import { toUserObjectId } from "../models/user.js";
import { ConflictError, NotFoundError } from "../utils/errors.js";

const USERS_COLLECTION = "users";

function getUsersCollection() {
  return getMongoClient().db().collection(USERS_COLLECTION);
}

function isDuplicateKeyError(error) {
  return error && error.code === 11000;
}

export async function createUser(user) {
  try {
    const result = await getUsersCollection().insertOne(user);
    return { ...user, _id: result.insertedId };
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      throw new ConflictError("A user with this email already exists.");
    }
    throw error;
  }
}

export async function findUserById(id) {
  const objectId = toUserObjectId(id);

  if (!objectId) {
    return null;
  }

  return getUsersCollection().findOne({ _id: objectId });
}

export async function findUserByEmail(email) {
  return getUsersCollection().findOne({ email });
}

export async function updateUser(id, update) {
  const objectId = toUserObjectId(id);

  if (!objectId) {
    throw new NotFoundError("User not found.");
  }

  try {
    const result = await getUsersCollection().findOneAndUpdate(
      { _id: objectId },
      { $set: { ...update, updatedAt: new Date() } },
      { returnDocument: "after" }
    );

    if (!result) {
      throw new NotFoundError("User not found.");
    }

    return result;
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      throw new ConflictError("A user with this email already exists.");
    }
    throw error;
  }
}

export async function deleteUser(id) {
  const objectId = toUserObjectId(id);

  if (!objectId) {
    return 0;
  }

  const result = await getUsersCollection().deleteOne({ _id: objectId });
  return result.deletedCount;
}

export async function listUsers({ page, limit, status }) {
  const filter = {};

  if (status) {
    filter.status = status;
  }

  const [items, total] = await Promise.all([
    getUsersCollection()
      .find(filter)
      .skip((page - 1) * limit)
      .limit(limit)
      .toArray(),
    getUsersCollection().countDocuments(filter),
  ]);

  return {
    items,
    total,
  };
}
