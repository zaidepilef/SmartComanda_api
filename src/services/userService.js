import bcrypt from "bcryptjs";
import {
  createUser,
  deleteUser,
  findUserById,
  listUsers,
  updateUser,
} from "../repositories/userRepository.js";
import { findTenantById, toTenantObjectId } from "../repositories/tenantRepository.js";
import { findBranchById } from "../repositories/branchRepository.js";
import { toPublicUser, toUserDocument, USER_ROLES } from "../models/user.js";
import {
  BadRequestError,
  ForbiddenError,
  NotFoundError,
} from "../utils/errors.js";
import { toObjectIdHex } from "../utils/id.js";
import {
  assertUserPayloadScoped,
  canManageUser,
  canReadUser,
  getTenantFilter,
  isGlobalActor,
} from "../utils/tenantScope.js";

const BCRYPT_COST = 10;

function mapToPublic(user) {
  return toPublicUser(user);
}

function assertCanWriteUsers(actor) {
  if (!isGlobalActor(actor) && !(actor?.roles || []).includes(USER_ROLES.ADMIN)) {
    throw new ForbiddenError("Forbidden. Sysadmin or admin role required.");
  }
}

async function resolveTenantId(tenantId) {
  if (!tenantId) {
    return undefined;
  }

  const id = toObjectIdHex(tenantId);

  if (!id) {
    throw new BadRequestError("tenantId must be a valid id.");
  }

  const tenant = await findTenantById(id);

  if (!tenant) {
    throw new BadRequestError("Tenant not found.");
  }

  return id;
}

async function resolveBranchId(branchId, tenantId) {
  if (!branchId) {
    return undefined;
  }

  const id = toObjectIdHex(branchId);

  if (!id) {
    throw new BadRequestError("branchId must be a valid id.");
  }

  if (!tenantId) {
    throw new BadRequestError("branchId requires the user to belong to a tenant.");
  }

  const branch = await findBranchById(id);

  if (!branch) {
    throw new BadRequestError("Branch not found.");
  }

  if (String(branch.tenantId) !== String(tenantId)) {
    throw new BadRequestError("Branch does not belong to the user's tenant.");
  }

  return id;
}

export async function createUserWithPassword({ actor, ...userInput }) {
  if (actor) {
    assertCanWriteUsers(actor);
    assertUserPayloadScoped(actor, userInput);
  }

  const passwordHash = await bcrypt.hash(userInput.password, BCRYPT_COST);

  const tenantId =
    actor && !isGlobalActor(actor) && !userInput.tenantId
      ? actor.tenantId
      : await resolveTenantId(userInput.tenantId);
  const branchId = await resolveBranchId(userInput.branchId, tenantId);

  const roles = Array.isArray(userInput.roles) && userInput.roles.length > 0
    ? userInput.roles
    : [USER_ROLES.CASHIER];

  const user = await createUser(
    toUserDocument({ ...userInput, passwordHash, tenantId, branchId, roles })
  );
  return mapToPublic(user);
}

export async function getUser({ actor, id }) {
  const user = await findUserById(id);

  if (!user) {
    throw new NotFoundError("User not found.");
  }

  if (!canReadUser(actor, user)) {
    throw new ForbiddenError("Forbidden. You can only access users of your own tenant.");
  }

  return mapToPublic(user);
}

export async function updateUserById({ actor, id, ...userInput }) {
  const existing = await findUserById(id);

  if (!existing) {
    throw new NotFoundError("User not found.");
  }

  if (!canManageUser(actor, existing)) {
    throw new ForbiddenError("Forbidden. You can only manage users of your own tenant.");
  }

  assertUserPayloadScoped(actor, userInput);

  const update = { ...userInput };
  const tenantId = await resolveTenantId(userInput.tenantId);
  const tenantForBranch = tenantId ?? existing.tenantId;
  const branchId = await resolveBranchId(userInput.branchId, tenantForBranch);

  if (tenantId !== undefined) {
    update.tenantId = tenantId;
  }

  if (branchId !== undefined) {
    update.branchId = branchId;
  }

  if (userInput.password) {
    update.passwordHash = await bcrypt.hash(userInput.password, BCRYPT_COST);
  }

  delete update.password;

  const user = await updateUser(id, update);
  return mapToPublic(user);
}

export async function deleteUserById({ actor, id }) {
  if (!isGlobalActor(actor)) {
    throw new ForbiddenError("Forbidden. Sysadmin role required.");
  }

  const deletedCount = await deleteUser(id);

  if (deletedCount === 0) {
    throw new NotFoundError("User not found.");
  }
}

export async function listUsersPaginated({ actor, page, limit, status }) {
  const { tenantId } = getTenantFilter(actor);
  const { items, total } = await listUsers({ page, limit, status, tenantId });

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
