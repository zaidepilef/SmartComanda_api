import jwt from "jsonwebtoken";
import { env } from "../config/env.js";
import { findUserById } from "../repositories/userRepository.js";
import { isTokenRevoked } from "../repositories/revokedTokenRepository.js";
import { toPublicUser } from "../models/user.js";

const BEARER_PATTERN = /^Bearer\s+(.+)$/i;

export async function authRequired(req, res, next) {
  const header = req.headers.authorization;

  if (!header) {
    return res.status(401).json({ error: "Authentication required." });
  }

  const match = header.match(BEARER_PATTERN);

  if (!match) {
    return res.status(401).json({ error: "Invalid authorization header." });
  }

  let payload;

  try {
    payload = jwt.verify(match[1], env.jwtSecret);
  } catch {
    return res.status(401).json({ error: "Invalid or expired token." });
  }

  if (await isTokenRevoked(payload.jti)) {
    return res.status(401).json({ error: "Invalid or expired token." });
  }

  const user = await findUserById(payload.sub);

  if (!user || user.status !== "active") {
    return res.status(401).json({ error: "Unauthorized." });
  }

  req.token = match[1];
  req.userId = user._id.toString();
  req.user = toPublicUser(user);

  return next();
}

export default authRequired;