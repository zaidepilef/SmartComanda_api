import { can } from "../utils/permissions.js";

/** Rechaza con 403 si el usuario autenticado no tiene permiso para la acción. */
export function requirePermission(action) {
  return function permissionGuard(req, res, next) {
    if (!can(req.user, action)) {
      return res.status(403).json({ error: "Forbidden. Your role does not allow this action." });
    }

    return next();
  };
}

export default requirePermission;
