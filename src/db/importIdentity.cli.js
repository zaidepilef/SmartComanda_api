import { env } from "../config/env.js";
import { connectMongo, closeMongo } from "./mongo.js";
import { connectPostgres, closePostgres } from "./postgres.js";
import { importIdentityFromMongo } from "./importIdentity.js";

async function main() {
  if (!env.mongodbUri || !env.databaseUrl) {
    throw new Error("MONGO_URI and DATABASE_URL must be set.");
  }

  await connectMongo(env.mongodbUri);
  connectPostgres();

  const result = await importIdentityFromMongo();
  console.log("Identity import completed:");
  console.log(JSON.stringify(result, null, 2));

  await closeMongo();
  await closePostgres();
}

main().catch((error) => {
  console.error("Identity import failed:", error);
  process.exit(1);
});
