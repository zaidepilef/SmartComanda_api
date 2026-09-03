import { getPgPool } from "../db/postgres.js";
import { toObjectIdHex, generateObjectIdHex } from "../utils/id.js";
import { ConflictError, NotFoundError } from "../utils/errors.js";

const USER_SELECT = `
  SELECT u.id, u.tenant_id, u.first_name, u.last_name, u.name, u.email,
         u.password_hash, u.status, u.branch_id, u.created_at, u.updated_at,
         COALESCE(
           array_agg(r.code ORDER BY r.code) FILTER (WHERE r.code IS NOT NULL),
           ARRAY[]::text[]
         ) AS roles
  FROM users u
  LEFT JOIN user_roles ur ON ur.user_id = u.id
  LEFT JOIN roles r ON r.id = ur.role_id
`;

function isDuplicateKeyError(error) {
  return error && error.code === "23505";
}

export function rowToUser(row) {
  if (!row) {
    return null;
  }

  const roles = Array.isArray(row.roles) ? row.roles : [];

  return {
    _id: row.id,
    id: row.id,
    tenantId: row.tenant_id ?? null,
    firstName: row.first_name,
    lastName: row.last_name,
    name: row.name,
    email: row.email,
    passwordHash: row.password_hash,
    status: row.status,
    branchId: row.branch_id ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    role: roles[0] ?? undefined,
    roles,
  };
}

async function findUser(conditions, params) {
  const pool = getPgPool();
  const where = conditions.join(" AND ");
  const { rows } = await pool.query(
    `${USER_SELECT} WHERE ${where} GROUP BY u.id`,
    params
  );
  return rows.length > 0 ? rowToUser(rows[0]) : null;
}

export async function createUser(user) {
  const id = toObjectIdHex(user._id) || user.id || generateObjectIdHex();
  const tenantId = user.tenantId || null;
  const branchId = user.branchId || null;

  const pool = getPgPool();
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    await client.query(
      `INSERT INTO users (id, tenant_id, first_name, last_name, name, email,
         password_hash, status, branch_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        id,
        tenantId,
        user.firstName || null,
        user.lastName || null,
        user.name || null,
        user.email,
        user.passwordHash,
        user.status || "active",
        branchId,
      ]
    );

    const roles = user.roles && user.roles.length > 0 ? user.roles : [];

    for (const role of roles) {
      await client.query(
        `INSERT INTO user_roles (user_id, role_id, tenant_id)
         SELECT $1, r.id, $2 FROM roles r WHERE r.code = $3
         ON CONFLICT (user_id, role_id) DO NOTHING`,
        [id, tenantId, role]
      );
    }

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    if (isDuplicateKeyError(error)) {
      throw new ConflictError("A user with this email already exists.");
    }
    throw error;
  } finally {
    client.release();
  }

  return findUser(["u.id = $1"], [id]);
}

export async function findUserById(id) {
  const objectId = toObjectIdHex(id);

  if (!objectId) {
    return null;
  }

  return findUser(["u.id = $1"], [objectId]);
}

export async function findUserByEmail(email) {
  if (!email) {
    return null;
  }

  const user = await findUser(["u.email = $1"], [email]);

  if (user) {
    return user;
  }

  const { rows } = await getPgPool().query(
    `SELECT u.id, u.tenant_id, u.first_name, u.last_name, u.name, u.email,
            u.password_hash, u.status, u.branch_id, u.created_at, u.updated_at,
            ARRAY[]::text[] AS roles
     FROM users u
     WHERE u.email ILIKE $1`,
    [email]
  );

  return rows.length > 0 ? rowToUser(rows[0]) : null;
}

export async function updateUser(id, update) {
  const objectId = toObjectIdHex(id);

  if (!objectId) {
    throw new NotFoundError("User not found.");
  }

  const pool = getPgPool();
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const sets = [];
    const params = [];

    const colMap = {
      firstName: "first_name",
      lastName: "last_name",
      name: "name",
      email: "email",
      passwordHash: "password_hash",
      status: "status",
      tenantId: "tenant_id",
      branchId: "branch_id",
    };

    for (const [key, col] of Object.entries(colMap)) {
      if (update[key] !== undefined) {
        params.push(update[key]);
        sets.push(`${col} = $${params.length}`);
      }
    }

    if (sets.length > 0) {
      params.push(new Date());
      sets.push(`updated_at = $${params.length}`);
      params.push(objectId);

      await client.query(
        `UPDATE users SET ${sets.join(", ")} WHERE id = $${params.length}`,
        params
      );
    }

    if (Array.isArray(update.roles)) {
      await client.query("DELETE FROM user_roles WHERE user_id = $1", [objectId]);

      const tenantId = update.tenantId ?? null;

      for (const role of update.roles) {
        await client.query(
          `INSERT INTO user_roles (user_id, role_id, tenant_id)
           SELECT $1, r.id, $2 FROM roles r WHERE r.code = $3
           ON CONFLICT (user_id, role_id) DO NOTHING`,
          [objectId, tenantId, role]
        );
      }
    }

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    if (isDuplicateKeyError(error)) {
      throw new ConflictError("A user with this email already exists.");
    }
    throw error;
  } finally {
    client.release();
  }

  const user = await findUser(["u.id = $1"], [objectId]);

  if (!user) {
    throw new NotFoundError("User not found.");
  }

  return user;
}

export async function deleteUser(id) {
  const objectId = toObjectIdHex(id);

  if (!objectId) {
    return 0;
  }

  const result = await getPgPool().query("DELETE FROM users WHERE id = $1", [objectId]);
  return result.rowCount ?? 0;
}

export async function listUsers({ page, limit, status, tenantId } = {}) {
  const pool = getPgPool();
  const where = [];
  const params = [];
  const conditions = [];

  if (status) {
    params.push(status);
    conditions.push(`u.status = $${params.length}`);
  }

  if (tenantId) {
    params.push(tenantId);
    conditions.push(`u.tenant_id = $${params.length}`);
  }

  if (conditions.length > 0) {
    where.push(`WHERE ${conditions.join(" AND ")}`);
  }

  const offset = (page - 1) * limit;

  params.push(limit);
  params.push(offset);

  const { rows } = await pool.query(
    `${USER_SELECT} ${where.join(" ")} GROUP BY u.id
     ORDER BY u.created_at DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );

  const countParams = params.slice(0, params.length - 2);
  const { rows: countRows } = await pool.query(
    `SELECT COUNT(*)::int AS total FROM users u ${where.join(" ")}`,
    countParams
  );

  return {
    items: rows.map(rowToUser),
    total: countRows[0].total,
  };
}
