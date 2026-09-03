const MANAGER_ROLES = ["sysadmin", "admin", "owner"];

function hasAnyRole(actor, roles) {
  const actorRoles = Array.isArray(actor?.roles) ? actor.roles : (actor?.role ? [actor.role] : []);
  return roles.some((role) => actorRoles.includes(role));
}

export function requireManager(req, res, next) {
  if (!hasAnyRole(req.user, MANAGER_ROLES)) {
    return res.status(403).json({ error: "Forbidden. Sysadmin, admin, or owner role required." });
  }

  return next();
}

export default requireManager;
