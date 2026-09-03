import { getPgPool } from "../db/postgres.js";

export async function revokeToken({ jti, expiresAt }) {
  if (!jti) {
    return;
  }

  await getPgPool().query(
    `INSERT INTO revoked_tokens (jti, expires_at)
     VALUES ($1, $2)
     ON CONFLICT (jti) DO NOTHING`,
    [jti, expiresAt instanceof Date ? expiresAt : new Date(expiresAt)]
  );
}

export async function isTokenRevoked(jti) {
  if (!jti) {
    return false;
  }

  const { rows } = await getPgPool().query(
    "SELECT 1 FROM revoked_tokens WHERE jti = $1 LIMIT 1",
    [jti]
  );

  return rows.length > 0;
}
