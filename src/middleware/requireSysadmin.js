export function requireSysadmin(req, res, next) {
  if (req.user?.role !== "sysadmin") {
    return res.status(403).json({ error: "Forbidden. Sysadmin role required." });
  }

  return next();
}

export default requireSysadmin;