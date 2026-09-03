function hasAnyRole(actor, roles) {
  const actorRoles = Array.isArray(actor?.roles) ? actor.roles : (actor?.role ? [actor.role] : []);
  return roles.some((role) => actorRoles.includes(role));
}

export function requireSysadminOrAdmin(req, res, next) {
  if (!hasAnyRole(req.user, ["sysadmin", "admin"])) {
    return res.status(403).json({ error: "Forbidden. Sysadmin or admin role required." });
  }

  return next();
}

export default requireSysadminOrAdmin;
