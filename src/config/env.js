import dotenv from "dotenv";

dotenv.config();

const MONGODB_URI =
  process.env.MONGODB_URI || "mongodb://localhost:27017/smartcomanda";

export const env = {
  port: Number(process.env.PORT) || 3000,
  mongodbUri: MONGODB_URI,
};