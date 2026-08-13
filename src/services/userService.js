import bcrypt from "bcryptjs";
import {
  createUser,
  deleteUser,
  findUserById,
  listUsers,
  updateUser,
} from "../repositories/userRepository.js";
import { findTenantById, toTenantObjectId } from "../repositories/tenantRepository.js";
import { toPublicUser, toUserDocument } from "../models/user.js";
import { BadRequestError, NotFoundError } from "../utils/errors.js";

const BCRYPT_COST = 10;

function mapToPublic(user) {
  return toPublicUser(user);
}

async function resolveTenantId(tenantId) {
  if (!tenantId) {
    return undefined;
  }

  const objectId = toTenantObjectId(tenantId);

  if (!objectId) {
    throw new BadRequestError("tenantId must be a valid ObjectId.");
  }

  const tenant = await findTenantById(objectId);

  if (!tenant) {
    throw new BadRequestError("Tenant not found.");
  }

  return objectId;
}

export async function createUserWithPassword(userInput) {
  const passwordHash = await bcrypt.hash(userInput.password, BCRYPT_COST);
  const tenantId = await resolveTenantId(userInput.tenantId);
  const user = await createUser(
    toUserDocument({ ...userInput, passwordHash, tenantId })
  );
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
  const tenantId = await resolveTenantId(userInput.tenantId);

  if (tenantId !== undefined) {
    update.tenantId = tenantId;
  }

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
