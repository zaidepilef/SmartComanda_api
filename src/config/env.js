import dotenv from "dotenv";

dotenv.config();

const MONGODB_URI =
  process.env.MONGODB_URI || "mongodb://localhost:27017/smartcomanda";

const JWT_SECRET = process.env.JWT_SECRET || "";

const MIN_JWT_SECRET_LENGTH = 32;

if (JWT_SECRET.length < MIN_JWT_SECRET_LENGTH) {
  console.error(
    "JWT_SECRET is missing or too short (minimum 32 characters). Set it in the environment before starting the API."
  );
  process.exit(1);
}

export const env = {
  port: Number(process.env.PORT) || 3000,
  mongodbUri: MONGODB_URI,
  jwtSecret: JWT_SECRET,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || "1h",
};