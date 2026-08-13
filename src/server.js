import express from "express";
import cors from "cors";
import { env } from "./config/env.js";
import { connectMongo, closeMongo, getMongoClient } from "./db/mongo.js";
import { runMigrations } from "./db/migrations.js";
import healthRouter from "./routes/health.js";
import usersRouter from "./routes/users.js";
import authRouter from "./routes/auth.js";
import tenantsRouter from "./routes/tenants.js";

const app = express();

app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
  res.json({
    project: "SmartComanda API",
    status: "online",
  });
});

app.use("/health", healthRouter);
app.use("/api/auth", authRouter);
app.use("/api/users", usersRouter);
app.use("/api/tenants", tenantsRouter);

async function start() {
  try {
    await connectMongo(env.mongodbUri);
    console.log(`MongoDB connected: ${env.mongodbUri}`);

    await runMigrations(getMongoClient().db());
  } catch (error) {
    console.error("Failed to start:", error.message);
    process.exit(1);
  }

  app.listen(env.port, () => {
    console.log(`API running on port ${env.port}`);
  });
}

async function shutdown() {
  console.log("Shutting down...");
  await closeMongo();
  process.exit(0);
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

start();