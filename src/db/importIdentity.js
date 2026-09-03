import { getMongoClient } from "./mongo.js";
import { getPgPool } from "./postgres.js";
import { generateObjectIdHex } from "../utils/id.js";
import { env } from "../config/env.js";

const TENANTS_COLLECTION = "tenant";
const USERS_COLLECTION = "users";
const SYSADMIN_EMAIL = env.sysadminEmail;

function normalizeId(id) {
  if (id && typeof id.toString === "function" && id._bsontype !== undefined) {
    return id.toString();
  }
  if (id && typeof id === "string") {
    return id;
  }
  if (id && typeof id.toString === "function") {
    return id.toString();
  }
  return id || null;
}

function toHexOrNull(value) {
  if (!value && value !== "") {
    return null;
  }
  return normalizeId(value);
}

async function upsertTenant(client, doc) {
  const id = toHexOrNull(doc._id) || generateObjectIdHex();
  const loyalty = doc.loyalty === undefined || doc.loyalty === null
    ? null
    : JSON.stringify(doc.loyalty);

  await client.query(
    `INSERT INTO tenant (id, name, rut, razon_social, email, phone, address, active, loyalty, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     ON CONFLICT (id) DO UPDATE SET
       name = EXCLUDED.name,
       rut = EXCLUDED.rut,
       razon_social = EXCLUDED.razon_social,
       email = EXCLUDED.email,
       phone = EXCLUDED.phone,
       address = EXCLUDED.address,
       active = EXCLUDED.active,
       loyalty = EXCLUDED.loyalty,
       updated_at = EXCLUDED.updated_at`,
    [
      id,
      doc.name,
      doc.rut ?? null,
      doc.razonSocial ?? null,
      doc.email ?? null,
      doc.phone ?? null,
      doc.address ?? null,
      doc.active === undefined ? true : doc.active,
      loyalty,
      doc.createdAt ? new Date(doc.createdAt) : new Date(),
      doc.updatedAt ? new Date(doc.updatedAt) : new Date(),
    ]
  );

  return id;
}

async function upsertUser(client, doc) {
  const id = toHexOrNull(doc._id) || generateObjectIdHex();
  const isSysadmin = doc.email === SYSADMIN_EMAIL;

  const sourceRoles = Array.isArray(doc.roles) && doc.roles.length > 0
    ? doc.roles.slice()
    : doc.role
      ? [doc.role]
      : [];

  const roles = isSysadmin
    ? ["sysadmin"]
    : sourceRoles.length > 0
      ? sourceRoles
      : ["cashier"];

  await client.query(
    `INSERT INTO users (id, tenant_id, first_name, last_name, name, email,
       password_hash, status, branch_id, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     ON CONFLICT (id) DO UPDATE SET
       tenant_id = EXCLUDED.tenant_id,
       first_name = EXCLUDED.first_name,
       last_name = EXCLUDED.last_name,
       name = EXCLUDED.name,
       email = EXCLUDED.email,
       password_hash = EXCLUDED.password_hash,
       status = EXCLUDED.status,
       branch_id = EXCLUDED.branch_id,
       updated_at = EXCLUDED.updated_at`,
    [
      id,
      toHexOrNull(doc.tenantId),
      doc.firstName ?? null,
      doc.lastName ?? null,
      doc.name ?? null,
      doc.email,
      doc.passwordHash,
      doc.status || "active",
      toHexOrNull(doc.branchId),
      doc.createdAt ? new Date(doc.createdAt) : new Date(),
      doc.updatedAt ? new Date(doc.updatedAt) : new Date(),
    ]
  );

  await client.query("DELETE FROM user_roles WHERE user_id = $1", [id]);

  const uniqueRoles = [...new Set(roles)];

  for (const code of uniqueRoles) {
    await client.query(
      `INSERT INTO user_roles (user_id, role_id, tenant_id)
       SELECT $1, r.id, $2 FROM roles r WHERE r.code = $3
       ON CONFLICT (user_id, role_id) DO NOTHING`,
      [id, toHexOrNull(doc.tenantId), code]
    );
  }

  return id;
}

export async function importIdentityFromMongo() {
  const mongo = getMongoClient();
  const pool = getPgPool();

  const tenantDocs = await mongo.db().collection(TENANTS_COLLECTION).find({}).toArray();
  const userDocs = await mongo.db().collection(USERS_COLLECTION).find({}).toArray();

  const client = await pool.connect();
  let tenantCount = 0;
  let userCount = 0;
  const tenantIds = new Set();

  try {
    await client.query("BEGIN");

    for (const doc of tenantDocs) {
      const id = await upsertTenant(client, doc);
      tenantIds.add(id);
      tenantCount += 1;
    }

    for (const doc of userDocs) {
      await upsertUser(client, doc);
      userCount += 1;
    }

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }

  const { rows: roleRows } = await pool.query(
    "SELECT code FROM roles ORDER BY code ASC"
  );

  return {
    tenantsImported: tenantCount,
    usersImported: userCount,
    tenantCountMongo: tenantDocs.length,
    userCountMongo: userDocs.length,
    rolesProvisioned: roleRows.map((row) => row.code),
  };
}
