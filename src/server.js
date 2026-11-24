import express from "express";
import cors from "cors";
import swaggerUi from "swagger-ui-express";
import { env } from "./config/env.js";
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
import publicEventsRouter from "./routes/publicEvents.js";
import { purgeExpiredEvents } from "./services/journeyService.js";
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
// Antes de /api/public para usar su propio límite de tasa.
app.use("/api/public/events", publicEventsRouter);
app.use("/api/public", publicRouter);

if (env.enableApiDocs) {
  app.use("/api/docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));
  app.get("/api/docs.json", (req, res) => {
    res.json(swaggerSpec);
  });
}

// Describes the database target without credentials (never log DATABASE_URL).
function describeDatabase(databaseUrl) {
  try {
    const { hostname, port, pathname } = new URL(databaseUrl);
    return `${hostname}:${port || 5432}${pathname}`;
  } catch {
    return "(invalid DATABASE_URL)";
  }
}

const RETENTION_INTERVAL_MS = 24 * 60 * 60 * 1000;

// Borra a diario los eventos del recorrido de clientes con más de 90 días.
function scheduleJourneyRetention() {
  const run = () =>
    purgeExpiredEvents()
      .then((deleted) => {
        if (deleted > 0) {
          console.log(`Journey retention: ${deleted} expired events deleted.`);
        }
      })
      .catch((error) => console.error("Journey retention failed:", error.message));

  run();
  setInterval(run, RETENTION_INTERVAL_MS).unref();
}

async function start() {
  try {
    const pgPool = connectPostgres();
    console.log(`PostgreSQL connected: ${describeDatabase(env.databaseUrl)}`);

    await runPgMigrations(pgPool);
  } catch (error) {
    console.error("Failed to start:", error.message);
    process.exit(1);
  }

  scheduleJourneyRetention();

  app.listen(env.port, () => {
    console.log(`API running on port ${env.port}`);
  });
}

async function shutdown() {
  console.log("Shutting down...");
  await closePostgres();
  process.exit(0);
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

start();