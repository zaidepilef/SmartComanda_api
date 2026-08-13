import { ObjectId } from "mongodb";

export const USER_STATUS = Object.freeze({
  ACTIVE: "active",
  INACTIVE: "inactive",
});

export const USER_STATUSES = Object.freeze([USER_STATUS.ACTIVE, USER_STATUS.INACTIVE]);

export function toPublicUser(user) {
  if (!user) {
    return null;
  }

  const { passwordHash: _passwordHash, ...publicUser } = user;
  return publicUser;
}

export function toUserDocument(user) {
  const now = new Date();

  return {
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
    passwordHash: user.passwordHash,
    status: user.status ?? USER_STATUS.ACTIVE,
    createdAt: now,
    updatedAt: now,
  };
}

export function toUserObjectId(id) {
  return ObjectId.isValid(id) ? new ObjectId(id) : null;
}
