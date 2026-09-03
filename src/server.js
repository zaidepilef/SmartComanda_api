import express from "express";
import cors from "cors";
import swaggerUi from "swagger-ui-express";
import { env } from "./config/env.js";
import { connectMongo, closeMongo, getMongoClient } from "./db/mongo.js";
import { runMigrations } from "./db/migrations.js";
import { connectPostgres, closePostgres, isPostgresConnected } from "./db/postgres.js";
import { runPgMigrations } from "./db/migrations-pg.js";
import healthRouter from "./routes/health.js";
import usersRouter from "./routes/users.js";
import authRouter from "./routes/auth.js";
import tenantsRouter from "./routes/tenants.js";
import branchesRouter from "./routes/branches.js";
import ingredientsRouter from "./routes/ingredients.js";
import dishesRouter from "./routes/dishes.js";
import inventoryRouter from "./routes/inventory.js";
import ordersRouter from "./routes/orders.js";
import cashSessionsRouter from "./routes/cash-sessions.js";
import publicRouter from "./routes/public.js";
import swaggerSpec from "./config/swagger.js";

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
app.use("/api/branches", branchesRouter);
app.use("/api/ingredients", ingredientsRouter);
app.use("/api/dishes", dishesRouter);
app.use("/api/inventory", inventoryRouter);
app.use("/api/orders", ordersRouter);
app.use("/api/cash-sessions", cashSessionsRouter);
app.use("/api/public", publicRouter);

if (env.enableApiDocs) {
  app.use("/api/docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));
  app.get("/api/docs.json", (req, res) => {
    res.json(swaggerSpec);
  });
}

async function start() {
  try {
    const pgPool = connectPostgres();
    console.log(`PostgreSQL connected: ${env.databaseUrl}`);

    await runPgMigrations(pgPool);

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
  await closePostgres();
  await closeMongo();
  process.exit(0);
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

start();