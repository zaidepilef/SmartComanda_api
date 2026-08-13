import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { env } from "../config/env.js";
import { findUserByEmail, findUserById } from "../repositories/userRepository.js";
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