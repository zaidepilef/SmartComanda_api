import { ForbiddenError } from "./errors.js";
import { USER_ROLES } from "../models/user.js";

function actorRoles(actor) {
  if (!actor) {
    return [];
  }

  if (Array.isArray(actor.roles)) {
    return actor.roles;
  }

  if (actor.role) {
    return [actor.role];
  }

  return [];
}

function hasRole(actor, role) {
  return actorRoles(actor).includes(role);
}

export function isGlobalActor(actor) {
  return hasRole(actor, USER_ROLES.SYSADMIN);
}

function tenantIdsEqual(a, b) {
  if (!a || !b) {
    return false;
  }
  return String(a) === String(b);
}

export function getTenantFilter(actor) {
  if (isGlobalActor(actor)) {
    return {};
  }
  return { tenantId: actor.tenantId };
}

export function canReadUser(actor, targetUser) {
  if (isGlobalActor(actor)) {
    return true;
  }
  if (!targetUser || !targetUser.tenantId || hasRole(targetUser, USER_ROLES.SYSADMIN)) {
    return false;
  }
  return tenantIdsEqual(targetUser.tenantId, actor.tenantId);
}

export function canManageUser(actor, targetUser) {
  if (isGlobalActor(actor)) {
    return true;
  }
  if (!hasRole(actor, USER_ROLES.ADMIN)) {
    return false;
  }
  if (!targetUser || !targetUser.tenantId || hasRole(targetUser, USER_ROLES.SYSADMIN)) {
    return false;
  }
  return tenantIdsEqual(targetUser.tenantId, actor.tenantId);
}

export function assertUserPayloadScoped(actor, payload) {
  if (isGlobalActor(actor)) {
    return;
  }
  const payloadRoles = Array.isArray(payload.roles) ? payload.roles : [];
  if (payloadRoles.includes(USER_ROLES.SYSADMIN)) {
    throw new ForbiddenError("Forbidden. Cannot assign the sysadmin role.");
  }
  if (
    payload.tenantId !== undefined &&
    !tenantIdsEqual(payload.tenantId, actor.tenantId)
  ) {
    throw new ForbiddenError("Forbidden. Cannot assign a tenant outside your own.");
  }
}

export { hasRole, actorRoles };
