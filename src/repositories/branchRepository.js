import { getPgPool } from "../db/postgres.js";
import { toObjectIdHex, generateObjectIdHex } from "../utils/id.js";
import { NotFoundError } from "../utils/errors.js";
import { PAYMENT_METHODS } from "../utils/paymentMethods.js";

export { PAYMENT_METHODS };

export function toBranchObjectId(id) {
  return toObjectIdHex(id);
}

function rowToBranch(row) {
  if (!row) {
    return null;
  }

  return {
    _id: row.id,
    id: row.id,
    tenantId: row.tenant_id ?? null,
    name: row.name,
    type: row.type,
    address: row.address ?? null,
    city: row.city ?? null,
    phone: row.phone ?? null,
    active: row.active,
    paymentMethods: Array.isArray(row.payment_methods)
      ? row.payment_methods
      : PAYMENT_METHODS,
    nextOrderNumber: row.next_order_number ?? 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function createBranch(branch) {
  const id = toBranchObjectId(branch._id) || toBranchObjectId(branch.id) || generateObjectIdHex();
  const tenantId = toBranchObjectId(branch.tenantId);
  const paymentMethods =
    Array.isArray(branch.paymentMethods) && branch.paymentMethods.length > 0
      ? branch.paymentMethods
      : PAYMENT_METHODS;

  const { rows } = await getPgPool().query(
    `INSERT INTO branches (id, tenant_id, name, type, address, city, phone, active, payment_methods, next_order_number)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     RETURNING *`,
    [
      id,
      tenantId,
      branch.name,
      branch.type || "Sucursal",
      branch.address ?? null,
      branch.city ?? null,
      branch.phone ?? null,
      branch.active === undefined ? true : branch.active,
      JSON.stringify(paymentMethods),
      branch.nextOrderNumber ?? 0,
    ]
  );

  return rowToBranch(rows[0]);
}

export async function updateBranch(id, update) {
  const objectId = toBranchObjectId(id);

  if (!objectId) {
    throw new NotFoundError("Branch not found.");
  }

  const sets = [];
  const params = [];

  const colMap = {
    name: "name",
    type: "type",
    address: "address",
    city: "city",
    phone: "phone",
    active: "active",
  };

  for (const [key, col] of Object.entries(colMap)) {
    if (update[key] !== undefined) {
      params.push(update[key]);
      sets.push(`${col} = $${params.length}`);
    }
  }

  if (update.tenantId !== undefined) {
    params.push(toBranchObjectId(update.tenantId));
    sets.push(`tenant_id = $${params.length}`);
  }

  if (Array.isArray(update.paymentMethods)) {
    params.push(JSON.stringify(update.paymentMethods));
    sets.push(`payment_methods = $${params.length}`);
  }

  if (sets.length > 0) {
    params.push(new Date());
    sets.push(`updated_at = $${params.length}`);
    params.push(objectId);

    const { rows } = await getPgPool().query(
      `UPDATE branches SET ${sets.join(", ")} WHERE id = $${params.length} RETURNING *`,
      params
    );

    if (rows.length === 0) {
      throw new NotFoundError("Branch not found.");
    }

    return rowToBranch(rows[0]);
  }

  const existing = await findBranchById(objectId);

  if (!existing) {
    throw new NotFoundError("Branch not found.");
  }

  return existing;
}

function escapeLike(text) {
  return text.replace(/[\\%_]/g, "\\$&");
}

export async function listBranches({ tenantId, active, q } = {}) {
  const where = [];
  const params = [];

  if (active !== undefined) {
    params.push(active === true || active === "true");
    where.push(`active = $${params.length}`);
  }

  if (tenantId !== undefined) {
    const tid = toBranchObjectId(tenantId);
    params.push(tid ?? null);
    where.push(`tenant_id = $${params.length}`);
  }

  if (q !== undefined && String(q).trim() !== "") {
    params.push(`%${escapeLike(String(q).trim())}%`);
    where.push(`name ILIKE $${params.length}`);
  }

  const whereSql = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";

  const { rows } = await getPgPool().query(
    `SELECT * FROM branches ${whereSql} ORDER BY name ASC`,
    params
  );

  return rows.map(rowToBranch);
}

export async function findBranchById(id) {
  const objectId = toBranchObjectId(id);

  if (!objectId) {
    return null;
  }

  const { rows } = await getPgPool().query(
    "SELECT * FROM branches WHERE id = $1",
    [objectId]
  );

  return rows.length > 0 ? rowToBranch(rows[0]) : null;
}

export async function nextOrderNumber(branchId) {
  const objectId = toBranchObjectId(branchId);

  if (!objectId) {
    return null;
  }

  const { rows } = await getPgPool().query(
    `UPDATE branches
     SET next_order_number = next_order_number + 1, updated_at = NOW()
     WHERE id = $1
     RETURNING next_order_number`,
    [objectId]
  );

  return rows.length > 0 ? rows[0].next_order_number : null;
}
