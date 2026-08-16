const OWNER_ROLES = ["sysadmin", "owner"];

export function requireOwner(req, res, next) {
  if (!OWNER_ROLES.includes(req.user?.role)) {
    return res.status(403).json({ error: "Forbidden. Owner role required." });
  }

  return next();
}

export default requireOwner;
