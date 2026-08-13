import bcrypt from "bcryptjs";
import {
  createUser,
  deleteUser,
  findUserById,
  listUsers,
  updateUser,
} from "../repositories/userRepository.js";
import { toPublicUser, toUserDocument } from "../models/user.js";
import { NotFoundError } from "../utils/errors.js";

const BCRYPT_COST = 10;

function mapToPublic(user) {
  return toPublicUser(user);
}

export async function createUserWithPassword(userInput) {
  const passwordHash = await bcrypt.hash(userInput.password, BCRYPT_COST);
  const user = await createUser(toUserDocument({ ...userInput, passwordHash }));
  return mapToPublic(user);
}

export async function getUser(id) {
  const user = await findUserById(id);

  if (!user) {
    throw new NotFoundError("User not found.");
  }

  return mapToPublic(user);
}

export async function updateUserById(id, userInput) {
  const existing = await findUserById(id);

  if (!existing) {
    throw new NotFoundError("User not found.");
  }

  const update = { ...userInput };

  if (userInput.password) {
    update.passwordHash = await bcrypt.hash(userInput.password, BCRYPT_COST);
  }

  delete update.password;

  const user = await updateUser(id, update);
  return mapToPublic(user);
}

export async function deleteUserById(id) {
  const deletedCount = await deleteUser(id);

  if (deletedCount === 0) {
    throw new NotFoundError("User not found.");
  }
}

export async function listUsersPaginated({ page, limit, status }) {
  const { items, total } = await listUsers({ page, limit, status });

  return {
    data: items.map(mapToPublic),
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}
