import { getPgPool } from "../db/postgres.js";

export async function setUserRoles({ userId, tenantId, roles }) {
  if (!Array.isArray(roles)) {
    return [];
  }

  const pool = getPgPool();
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    await client.query("DELETE FROM user_roles WHERE user_id = $1", [userId]);

    for (const role of roles) {
      await client.query(
        `INSERT INTO user_roles (user_id, role_id, tenant_id)
         SELECT $1, r.id, $2 FROM roles r WHERE r.code = $3
         ON CONFLICT (user_id, role_id) DO NOTHING`,
        [userId, tenantId || null, role]
      );
    }

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }

  return roles;
}
