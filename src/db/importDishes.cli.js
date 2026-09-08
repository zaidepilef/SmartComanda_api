import { env } from "../config/env.js";
import { connectMongo, closeMongo } from "./mongo.js";
import { connectPostgres, closePostgres } from "./postgres.js";
import { importDishesFromMongo } from "./importDishes.js";

async function main() {
  if (!env.mongodbUri || !env.databaseUrl) {
    throw new Error("MONGO_URI and DATABASE_URL must be set.");
  }

  await connectMongo(env.mongodbUri);
  connectPostgres();

  const result = await importDishesFromMongo();
  console.log("Dishes import completed:");
  console.log(JSON.stringify(result, null, 2));

  await closeMongo();
  await closePostgres();
}

main().catch((error) => {
  console.error("Dishes import failed:", error);
  process.exit(1);
});