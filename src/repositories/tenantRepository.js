import { getPgPool } from "../db/postgres.js";
import { toObjectIdHex, generateObjectIdHex } from "../utils/id.js";
import { ConflictError, NotFoundError } from "../utils/errors.js";

const BRANCHES_TABLE = "branches";

function isDuplicateKeyError(error) {
  return error && error.code === "23505";
}

export function toTenantObjectId(id) {
  return toObjectIdHex(id);
}

export function rowToTenant(row) {
  if (!row) {
    return null;
  }

  const tenant = {
    _id: row.id,
    id: row.id,
    name: row.name,
    rut: row.rut,
    razonSocial: row.razon_social,
    email: row.email,
    phone: row.phone,
    address: row.address,
    active: row.active,
    loyalty: row.loyalty,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };

  if (row.user_count !== undefined) {
    tenant.userCount = row.user_count;
  }

  return tenant;
}

async function countBranches(tenantIds) {
  if (!tenantIds || tenantIds.length === 0) {
    return new Map();
  }

  const { rows } = await getPgPool().query(
    `SELECT tenant_id, COUNT(*)::int AS branch_count
     FROM branches
     WHERE tenant_id = ANY($1::varchar[])
     GROUP BY tenant_id`,
    [tenantIds]
  );

  const counts = new Map();
  for (const row of rows) {
    counts.set(row.tenant_id, row.branch_count);
  }

  return counts;
}

export async function createTenant(tenant) {
  const id = toObjectIdHex(tenant._id) || toObjectIdHex(tenant.id) || generateObjectIdHex();
  const loyalty = tenant.loyalty === undefined ? null : tenant.loyalty;

  const pool = getPgPool();

  try {
    const { rows } = await pool.query(
      `INSERT INTO tenant (id, name, rut, razon_social, email, phone, address, active, loyalty)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [
        id,
        tenant.name,
        tenant.rut || null,
        tenant.razonSocial || null,
        tenant.email || null,
        tenant.phone || null,
        tenant.address || null,
        tenant.active === undefined ? true : tenant.active,
        loyalty === null ? null : JSON.stringify(loyalty),
      ]
    );

    return { ...rowToTenant(rows[0]), userCount: 0, branchCount: 0 };
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      throw new ConflictError("A tenant with this rut already exists.");
    }
    throw error;
  }
}

export async function updateTenant(id, update) {
  const objectId = toObjectIdHex(id);

  if (!objectId) {
    throw new NotFoundError("Tenant not found.");
  }

  const sets = [];
  const params = [];

  const colMap = {
    name: "name",
    rut: "rut",
    razonSocial: "razon_social",
    email: "email",
    phone: "phone",
    address: "address",
    active: "active",
  };

  for (const [key, col] of Object.entries(colMap)) {
    if (update[key] !== undefined) {
      params.push(update[key]);
      sets.push(`${col} = $${params.length}`);
    }
  }

  if (update.loyalty !== undefined) {
    if (update.loyalty === null) {
      params.push(null);
      sets.push(`loyalty = $${params.length}`);
    } else {
      params.push(JSON.stringify(update.loyalty));
      sets.push(`loyalty = $${params.length}`);
    }
  }

  if (sets.length > 0) {
    params.push(new Date());
    sets.push(`updated_at = $${params.length}`);

    params.push(objectId);

    try {
      await getPgPool().query(
        `UPDATE tenant SET ${sets.join(", ")} WHERE id = $${params.length}`,
        params
      );
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        throw new ConflictError("A tenant with this rut already exists.");
      }
      throw error;
    }
  }

  const tenant = await findTenantById(objectId);

  if (!tenant) {
    throw new NotFoundError("Tenant not found.");
  }

  return tenant;
}

export async function listTenants({ active, id } = {}) {
  const pool = getPgPool();
  const where = [];
  const params = [];

  if (active !== undefined) {
    params.push(active);
    where.push(`t.active = $${params.length}`);
  }

  if (id) {
    params.push(id);
    where.push(`t.id = $${params.length}`);
  }

  const whereSql = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";

  const { rows } = await pool.query(
    `SELECT t.*, COUNT(u.id)::int AS user_count
     FROM tenant t
     LEFT JOIN users u ON u.tenant_id = t.id
     ${whereSql}
     GROUP BY t.id
     ORDER BY t.name ASC`,
    params
  );

  const tenantIds = rows.map((row) => row.id);
  const branchCounts = await countBranches(tenantIds);

  return rows.map((row) => {
    const tenant = rowToTenant(row);
    tenant.branchCount = branchCounts.get(row.id) ?? 0;
    return tenant;
  });
}

export async function findTenantById(id) {
  const objectId = toObjectIdHex(id);

  if (!objectId) {
    return null;
  }

  const { rows } = await getPgPool().query(
    `SELECT t.*, COUNT(u.id)::int AS user_count
     FROM tenant t
     LEFT JOIN users u ON u.tenant_id = t.id
     WHERE t.id = $1
     GROUP BY t.id`,
    [objectId]
  );

  if (rows.length === 0) {
    return null;
  }

  return rowToTenant(rows[0]);
}
