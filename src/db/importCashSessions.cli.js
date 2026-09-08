import { env } from "../config/env.js";
import { connectMongo, closeMongo } from "./mongo.js";
import { connectPostgres, closePostgres } from "./postgres.js";
import { importCashSessionsFromMongo } from "./importCashSessions.js";

async function main() {
  if (!env.mongodbUri || !env.databaseUrl) {
    throw new Error("MONGO_URI and DATABASE_URL must be set.");
  }

  await connectMongo(env.mongodbUri);
  connectPostgres();

  const result = await importCashSessionsFromMongo();
  console.log("Cash sessions import completed:");
  console.log(JSON.stringify(result, null, 2));

  await closeMongo();
  await closePostgres();
}

main().catch((error) => {
  console.error("Cash sessions import failed:", error);
  process.exit(1);
});