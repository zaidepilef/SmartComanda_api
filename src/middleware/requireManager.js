const MANAGER_ROLES = ["sysadmin", "admin", "owner"];

export function requireManager(req, res, next) {
  if (!MANAGER_ROLES.includes(req.user?.role)) {
    return res.status(403).json({ error: "Forbidden. Sysadmin, admin, or owner role required." });
  }

  return next();
}

export default requireManager;
