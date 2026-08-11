import express from "express";
import cors from "cors";
import { env } from "./config/env.js";
import { connectMongo, closeMongo } from "./db/mongo.js";
import healthRouter from "./routes/health.js";

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

async function start() {
  try {
    await connectMongo(env.mongodbUri);
    console.log(`MongoDB connected: ${env.mongodbUri}`);
  } catch (error) {
    console.error("Failed to connect to MongoDB:", error.message);
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