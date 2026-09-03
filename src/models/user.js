import { toObjectIdHex } from "../utils/id.js";

export const USER_STATUS = Object.freeze({
  ACTIVE: "active",
  INACTIVE: "inactive",
  PENDING: "pending",
});

export const USER_STATUSES = Object.freeze([
  USER_STATUS.ACTIVE,
  USER_STATUS.INACTIVE,
  USER_STATUS.PENDING,
]);

export const USER_ROLES = Object.freeze({
  SYSADMIN: "sysadmin",
  OWNER: "owner",
  ADMIN: "admin",
  CASHIER: "cashier",
});

export const USER_ROLES_LIST = Object.freeze([
  USER_ROLES.SYSADMIN,
  USER_ROLES.OWNER,
  USER_ROLES.ADMIN,
  USER_ROLES.CASHIER,
]);

export function toPublicUser(user) {
  if (!user) {
    return null;
  }

  const { passwordHash: _passwordHash, ...publicUser } = user;
  return publicUser;
}

export function toUserDocument(user) {
  const now = new Date();

  const document = {
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
    passwordHash: user.passwordHash,
    status: user.status ?? USER_STATUS.ACTIVE,
    roles: Array.isArray(user.roles) ? user.roles : [],
    createdAt: now,
    updatedAt: now,
  };

  if (user.name) {
    document.name = user.name;
  }

  if (user.tenantId) {
    document.tenantId = user.tenantId;
  }

  if (user.branchId) {
    document.branchId = user.branchId;
  }

  return document;
}

export function toUserObjectId(id) {
  return toObjectIdHex(id);
}
