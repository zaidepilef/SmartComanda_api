export function requireSysadminOrAdmin(req, res, next) {
  if (req.user?.role !== "sysadmin" && req.user?.role !== "admin") {
    return res.status(403).json({ error: "Forbidden. Sysadmin or admin role required." });
  }

  return next();
}

export default requireSysadminOrAdmin;
