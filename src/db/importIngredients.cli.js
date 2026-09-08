import { env } from "../config/env.js";
import { connectMongo, closeMongo } from "./mongo.js";
import { connectPostgres, closePostgres } from "./postgres.js";
import { importIngredientsFromMongo } from "./importIngredients.js";

async function main() {
  if (!env.mongodbUri || !env.databaseUrl) {
    throw new Error("MONGO_URI and DATABASE_URL must be set.");
  }

  await connectMongo(env.mongodbUri);
  connectPostgres();

  const result = await importIngredientsFromMongo();
  console.log("Ingredients import completed:");
  console.log(JSON.stringify(result, null, 2));

  await closeMongo();
  await closePostgres();
}

main().catch((error) => {
  console.error("Ingredients import failed:", error);
  process.exit(1);
});