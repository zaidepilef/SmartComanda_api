import test from "node:test";
import assert from "node:assert/strict";
import { connectPostgres, closePostgres, getPgPool } from "../src/db/postgres.js";
import { runPgMigrations } from "../src/db/migrations-pg.js";
import * as tenantRepo from "../src/repositories/tenantRepository.js";
import * as userRepo from "../src/repositories/userRepository.js";
import * as branchRepo from "../src/repositories/branchRepository.js";
import { generateObjectIdHex } from "../src/utils/id.js";

const TENANT_IDS = [];
const USER_IDS = [];
const BRANCH_IDS = [];

async function cleanup() {
  const pool = getPgPool();
  if (USER_IDS.length > 0) {
    await pool.query("DELETE FROM user_roles WHERE user_id = ANY($1::varchar[])", [USER_IDS]);
    await pool.query("DELETE FROM users WHERE id = ANY($1::varchar[])", [USER_IDS]);
  }
  if (BRANCH_IDS.length > 0) {
    await pool.query("DELETE FROM branches WHERE id = ANY($1::varchar[])", [BRANCH_IDS]);
  }
  if (TENANT_IDS.length > 0) {
    await pool.query("DELETE FROM users WHERE tenant_id = ANY($1::varchar[])", [TENANT_IDS]);
    await pool.query("DELETE FROM branches WHERE tenant_id = ANY($1::varchar[])", [TENANT_IDS]);
    await pool.query("DELETE FROM tenant WHERE id = ANY($1::varchar[])", [TENANT_IDS]);
  }
  TENANT_IDS.length = 0;
  USER_IDS.length = 0;
  BRANCH_IDS.length = 0;
}

test.before(async () => {
  const pool = connectPostgres();
  await runPgMigrations(pool);
});

test.after(async () => {
  await cleanup();
  await closePostgres();
});

// ── Tenant ──────────────────────────────────────────────────────────

test("tenant: create and find by id", async () => {
  const id = generateObjectIdHex();
  TENANT_IDS.push(id);

  const created = await tenantRepo.createTenant({
    _id: id,
    name: "Test Restaurant",
    rut: "12.345.678-9",
    razonSocial: "Test RUT",
    email: "test@restaurant.cl",
    phone: "+56912345678",
    address: "Av. Test 123",
    active: true,
  });

  assert.equal(created.id, id);
  assert.equal(created.name, "Test Restaurant");
  assert.equal(created.rut, "12.345.678-9");
  assert.equal(created.active, true);

  const found = await tenantRepo.findTenantById(id);
  assert.equal(found.id, id);
  assert.equal(found.name, "Test Restaurant");
});

test("tenant: list returns created tenants", async () => {
  const list = await tenantRepo.listTenants();
  const found = list.find((t) => t.rut === "12.345.678-9");
  assert.ok(found, "tenant should appear in list");
  assert.equal(found.name, "Test Restaurant");
});

test("tenant: update name", async () => {
  const id = TENANT_IDS[0];
  const updated = await tenantRepo.updateTenant(id, { name: "Updated Restaurant" });
  assert.equal(updated.name, "Updated Restaurant");

  const found = await tenantRepo.findTenantById(id);
  assert.equal(found.name, "Updated Restaurant");
});

test("tenant: duplicate rut throws ConflictError", async () => {
  await assert.rejects(
    () =>
      tenantRepo.createTenant({
        name: "Dup RUT",
        rut: "12.345.678-9",
      }),
    { message: /rut/i }
  );
});

// ── User ────────────────────────────────────────────────────────────

test("user: create with role and find by id", async () => {
  const id = generateObjectIdHex();
  USER_IDS.push(id);

  const created = await userRepo.createUser({
    _id: id,
    tenantId: TENANT_IDS[0],
    firstName: "Juan",
    lastName: "Pérez",
    name: "Juan Pérez",
    email: "juan@test.cl",
    passwordHash: "$2a$10$fakehashvalue123456789012345678901234567890",
    status: "active",
    roles: ["admin"],
  });

  assert.equal(created.id, id);
  assert.equal(created.email, "juan@test.cl");
  assert.ok(created.roles.includes("admin"));
});

test("user: find by email", async () => {
  const found = await userRepo.findUserByEmail("juan@test.cl");
  assert.ok(found);
  assert.equal(found.firstName, "Juan");
  assert.ok(found.roles.includes("admin"));
});

test("user: list with pagination", async () => {
  const result = await userRepo.listUsers({ page: 1, limit: 10, tenantId: TENANT_IDS[0] });
  assert.ok(result.items.length >= 1);
  assert.ok(result.total >= 1);
  assert.equal(result.items[0].email, "juan@test.cl");
});

test("user: update name and roles", async () => {
  const id = USER_IDS[0];
  const updated = await userRepo.updateUser(id, {
    firstName: "Juan Carlos",
    name: "Juan Carlos Pérez",
    roles: ["owner"],
  });

  assert.equal(updated.firstName, "Juan Carlos");
  assert.ok(updated.roles.includes("owner"));
  assert.ok(!updated.roles.includes("admin"));
});

test("user: delete removes user", async () => {
  const tempId = generateObjectIdHex();
  await userRepo.createUser({
    _id: tempId,
    email: `del-${tempId.slice(0, 8)}@test.cl`,
    passwordHash: "$2a$10$fakehash",
    status: "active",
  });

  const deleted = await userRepo.deleteUser(tempId);
  assert.equal(deleted, 1);

  const found = await userRepo.findUserById(tempId);
  assert.equal(found, null);
});

test("user: duplicate email throws ConflictError", async () => {
  await assert.rejects(
    () =>
      userRepo.createUser({
        email: "juan@test.cl",
        passwordHash: "$2a$10$fakehash",
        status: "active",
      }),
    { message: /email/i }
  );
});

// ── Branch ──────────────────────────────────────────────────────────

test("branch: create and find by id", async () => {
  const id = generateObjectIdHex();
  BRANCH_IDS.push(id);

  const created = await branchRepo.createBranch({
    _id: id,
    tenantId: TENANT_IDS[0],
    name: "Sucursal Centro",
    type: "Sucursal",
    address: "Calle 1",
    city: "Santiago",
    phone: "+56911111111",
    active: true,
    paymentMethods: ["cash", "debit"],
  });

  assert.equal(created.id, id);
  assert.equal(created.name, "Sucursal Centro");
  assert.equal(created.type, "Sucursal");
  assert.deepEqual(created.paymentMethods, ["cash", "debit"]);
});

test("branch: list by tenant", async () => {
  const list = await branchRepo.listBranches({ tenantId: TENANT_IDS[0] });
  assert.ok(list.length >= 1);
  assert.equal(list[0].name, "Sucursal Centro");
});

test("branch: update name", async () => {
  const id = BRANCH_IDS[0];
  const updated = await branchRepo.updateBranch(id, { name: "Sucursal Providencia" });
  assert.equal(updated.name, "Sucursal Providencia");
});

test("branch: nextOrderNumber increments", async () => {
  const id = BRANCH_IDS[0];
  const first = await branchRepo.nextOrderNumber(id);
  const second = await branchRepo.nextOrderNumber(id);
  assert.equal(first, 1);
  assert.equal(second, 2);
});

test("branch: update nonexistent throws NotFoundError", async () => {
  const fakeId = generateObjectIdHex();
  await assert.rejects(
    () => branchRepo.updateBranch(fakeId, { name: "No Existe" }),
    { message: /not found/i }
  );
});
