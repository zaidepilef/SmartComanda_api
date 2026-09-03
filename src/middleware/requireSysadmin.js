function hasRole(actor, role) {
  if (Array.isArray(actor?.roles)) {
    return actor.roles.includes(role);
  }
  return actor?.role === role;
}

export function requireSysadmin(req, res, next) {
  if (!hasRole(req.user, "sysadmin")) {
    return res.status(403).json({ error: "Forbidden. Sysadmin role required." });
  }

  return next();
}

export default requireSysadmin;