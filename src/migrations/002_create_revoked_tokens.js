const REVOKED_TOKENS_COLLECTION = "revoked_tokens";

export async function up(db) {
  const collection = db.collection(REVOKED_TOKENS_COLLECTION);

  await collection.createIndex({ jti: 1 }, { unique: true });
  await collection.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
}
