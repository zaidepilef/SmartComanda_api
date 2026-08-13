import { getMongoClient } from "../db/mongo.js";

const REVOKED_TOKENS_COLLECTION = "revoked_tokens";

function getRevokedTokensCollection() {
  return getMongoClient().db().collection(REVOKED_TOKENS_COLLECTION);
}

export async function revokeToken({ jti, expiresAt }) {
  await getRevokedTokensCollection().insertOne({
    jti,
    expiresAt,
  });
}

export async function isTokenRevoked(jti) {
  if (!jti) {
    return false;
  }

  const found = await getRevokedTokensCollection().findOne(
    { jti },
    { projection: { _id: 1 } }
  );

  return found !== null;
}
