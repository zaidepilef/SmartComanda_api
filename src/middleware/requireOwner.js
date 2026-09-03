const OWNER_ROLES = ["sysadmin", "owner"];

function hasAnyRole(actor, roles) {
  const actorRoles = Array.isArray(actor?.roles) ? actor.roles : (actor?.role ? [actor.role] : []);
  return roles.some((role) => actorRoles.includes(role));
}

export function requireOwner(req, res, next) {
  if (!hasAnyRole(req.user, OWNER_ROLES)) {
    return res.status(403).json({ error: "Forbidden. Owner role required." });
  }

  return next();
}

export default requireOwner;
