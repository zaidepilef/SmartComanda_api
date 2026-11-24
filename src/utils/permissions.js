import { USER_ROLES } from "../models/user.js";
import { actorRoles } from "./tenantScope.js";

const { SYSADMIN, OWNER, ADMIN, CASHIER, COOK } = USER_ROLES;

const MANAGERS = [SYSADMIN, OWNER, ADMIN];
const CASH_STAFF = [...MANAGERS, CASHIER];
const ALL_STAFF = [...CASH_STAFF, COOK];

/**
 * Matriz de permisos por acción (fuente de verdad, ver spec role-permissions).
 */
export const PERMISSIONS = Object.freeze({
  "cash.read": CASH_STAFF,
  "cash.open": CASH_STAFF,
  "cash.close": CASH_STAFF,
  "order.read": ALL_STAFF,
  "order.create": CASH_STAFF,
  "order.pay": CASH_STAFF,
  "order.status": ALL_STAFF,
  "order.cancel": MANAGERS,
  "order.correct": MANAGERS,
  "user.manage": MANAGERS,
});

/** Roles que cada rol puede asignar a otros usuarios. */
export const ASSIGNABLE_ROLES = Object.freeze({
  [SYSADMIN]: [SYSADMIN, OWNER, ADMIN, CASHIER, COOK],
  [OWNER]: [ADMIN, CASHIER, COOK],
  [ADMIN]: [CASHIER, COOK],
});

export function can(actor, action) {
  const allowed = PERMISSIONS[action];

  if (!allowed) {
    throw new Error(`Unknown permission "${action}".`);
  }

  return actorRoles(actor).some((role) => allowed.includes(role));
}

/** Unión de los roles que el actor puede asignar. */
export function assignableRoles(actor) {
  const roles = new Set();

  for (const role of actorRoles(actor)) {
    for (const assignable of ASSIGNABLE_ROLES[role] ?? []) {
      roles.add(assignable);
    }
  }

  return roles;
}
