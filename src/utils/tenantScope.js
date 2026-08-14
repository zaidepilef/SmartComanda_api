import { ForbiddenError } from "./errors.js";

export function isGlobalActor(actor) {
  return actor?.role === "sysadmin";
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
  if (!targetUser || !targetUser.tenantId || targetUser.role === "sysadmin") {
    return false;
  }
  return tenantIdsEqual(targetUser.tenantId, actor.tenantId);
}

export function canManageUser(actor, targetUser) {
  if (isGlobalActor(actor)) {
    return true;
  }
  if (actor?.role !== "admin") {
    return false;
  }
  if (!targetUser || !targetUser.tenantId || targetUser.role === "sysadmin") {
    return false;
  }
  return tenantIdsEqual(targetUser.tenantId, actor.tenantId);
}

export function assertUserPayloadScoped(actor, payload) {
  if (isGlobalActor(actor)) {
    return;
  }
  if (payload.role === "sysadmin") {
    throw new ForbiddenError("Forbidden. Cannot assign the sysadmin role.");
  }
  if (
    payload.tenantId !== undefined &&
    !tenantIdsEqual(payload.tenantId, actor.tenantId)
  ) {
    throw new ForbiddenError("Forbidden. Cannot assign a tenant outside your own.");
  }
}
