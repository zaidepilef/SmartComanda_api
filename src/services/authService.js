import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { randomUUID } from "node:crypto";
import { env } from "../config/env.js";
import { findUserByEmail, findUserById } from "../repositories/userRepository.js";
import { revokeToken } from "../repositories/revokedTokenRepository.js";
import { toPublicUser } from "../models/user.js";
import {
  ForbiddenError,
  UnauthorizedError,
} from "../utils/errors.js";

const BCRYPT_COST = 10;
const GENERIC_LOGIN_ERROR = "Invalid credentials.";

const DUMMY_HASH = bcrypt.hashSync("authentication-timing-equalizer", BCRYPT_COST);

async function comparePassword(plain, hash) {
  return bcrypt.compare(plain, hash);
}

export async function login(email, password) {
  const user = await findUserByEmail(email);

  if (!user) {
    await comparePassword(password, DUMMY_HASH);
    throw new UnauthorizedError(GENERIC_LOGIN_ERROR);
  }

  const isValidPassword = await comparePassword(password, user.passwordHash);

  if (!isValidPassword) {
    throw new UnauthorizedError(GENERIC_LOGIN_ERROR);
  }

  if (user.status !== "active") {
    throw new ForbiddenError("This account is inactive.");
  }

  const token = issueToken(user);

  return {
    token,
    expiresIn: getTokenExpirySeconds(token),
    user: toPublicUser(user),
  };
}

export function issueToken(user) {
  return jwt.sign(
    {
      email: user.email,
      status: user.status,
      jti: randomUUID(),
    },
    env.jwtSecret,
    {
      subject: user._id.toString(),
      algorithm: "HS256",
      expiresIn: env.jwtExpiresIn,
    }
  );
}

function getTokenExpirySeconds(token) {
  const decoded = jwt.decode(token);
  return decoded.exp - Math.floor(Date.now() / 1000);
}

export async function getAuthenticatedUser(userId) {
  return findUserById(userId);
}

export async function logout(token) {
  let payload;

  try {
    payload = jwt.verify(token, env.jwtSecret);
  } catch {
    throw new UnauthorizedError("Invalid or expired token.");
  }

  if (!payload.jti) {
    return;
  }

  await revokeToken({
    jti: payload.jti,
    expiresAt: new Date(payload.exp * 1000),
  });
}