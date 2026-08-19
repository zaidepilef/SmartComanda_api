import { env } from "../config/env.js";

const USERS_COLLECTION = "users";

export async function up(db) {
  const collection = db.collection(USERS_COLLECTION);

  await collection.updateOne(
    { email: env.sysadminEmail, role: { $exists: false } },
    { $set: { role: "sysadmin" } }
  );

  await collection.updateMany(
    { email: { $ne: env.sysadminEmail }, role: { $exists: false } },
    { $set: { role: "owner" } }
  );
}