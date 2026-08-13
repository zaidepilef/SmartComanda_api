const USERS_COLLECTION = "users";

export async function up(db) {
  const collection = db.collection(USERS_COLLECTION);

  await collection.createIndex({ email: 1 }, { unique: true });
  await collection.createIndex({ status: 1 });
}
