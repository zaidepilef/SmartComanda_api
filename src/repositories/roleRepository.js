import { getPgPool } from "../db/postgres.js";

export function rowToRole(row) {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    description: row.description,
    systemRole: row.system_role,
    tenantId: row.tenant_id ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listRoles() {
  const { rows } = await getPgPool().query(
    "SELECT * FROM roles ORDER BY code ASC"
  );
  return rows.map(rowToRole);
}

export async function findRoleByCode(code) {
  const { rows } = await getPgPool().query(
    "SELECT * FROM roles WHERE code = $1",
    [code]
  );
  return rows.length > 0 ? rowToRole(rows[0]) : null;
}

export async function findRolesByUserId(userId) {
  const { rows } = await getPgPool().query(
    `SELECT r.*
     FROM roles r
     INNER JOIN user_roles ur ON ur.role_id = r.id
     WHERE ur.user_id = $1
     ORDER BY r.code ASC`,
    [userId]
  );
  return rows.map(rowToRole);
}
