import test from "node:test";
import assert from "node:assert/strict";
import bcrypt from "bcryptjs";
import { connectPostgres, closePostgres, getPgPool } from "../src/db/postgres.js";
import { runPgMigrations } from "../src/db/migrations-pg.js";
import * as tenantRepo from "../src/repositories/tenantRepository.js";
import * as userRepo from "../src/repositories/userRepository.js";
import { login } from "../src/services/authService.js";
import { resetUserPassword } from "../src/services/userService.js";
import { ForbiddenError, UnauthorizedError } from "../src/utils/errors.js";
import { generateObjectIdHex } from "../src/utils/id.js";

const TENANT_IDS = [];
const USER_IDS = [];

const FAKE_HASH = "$2a$10$abcdefghijklmnopqrstuvwxyz0123456789ABCDEFGH";

async function cleanup() {
  const pool = getPgPool();
  if (USER_IDS.length > 0) {
    await pool.query("DELETE FROM user_roles WHERE user_id = ANY($1::varchar[])", [USER_IDS]);
    await pool.query("DELETE FROM users WHERE id = ANY($1::varchar[])", [USER_IDS]);
  }
  if (TENANT_IDS.length > 0) {
    await pool.query("DELETE FROM users WHERE tenant_id = ANY($1::varchar[])", [TENANT_IDS]);
    await pool.query("DELETE FROM tenant WHERE id = ANY($1::varchar[])", [TENANT_IDS]);
  }
  TENANT_IDS.length = 0;
  USER_IDS.length = 0;
}

test.before(async () => {
  const pool = connectPostgres();
  await runPgMigrations(pool);
});

test.after(async () => {
  await cleanup();
  await closePostgres();
});

async function createTestTenant() {
  const id = generateObjectIdHex();
  TENANT_IDS.push(id);
  await tenantRepo.createTenant({
    _id: id,
    name: "Reset Pwd Tenant",
    rut: `76.${TENANT_IDS.length}.${Date.now() % 1000}-8`,
  });
  return id;
}

async function createTestUser({ tenantId, email, passwordHash = FAKE_HASH, roles = ["cashier"] }) {
  const id = generateObjectIdHex();
  USER_IDS.push(id);
  await userRepo.createUser({
    _id: id,
    tenantId,
    firstName: "Reset",
    lastName: "Test",
    email,
    passwordHash,
    status: "active",
    roles,
  });
  return id;
}

// ── Login with null password hash ───────────────────────────────────

test("login: user with null passwordHash gets invalid credentials, not a crash", async () => {
  const tenantId = await createTestTenant();
  await createTestUser({ tenantId, email: "nohash@test.cl", passwordHash: null });

  await assert.rejects(
    () => login("nohash@test.cl", "Whatever123!"),
    (error) => error instanceof UnauthorizedError && error.message.includes("Invalid credentials")
  );
});

test("login: user with non-string passwordHash gets invalid credentials", async () => {
  const tenantId = await createTestTenant();
  await createTestUser({ tenantId, email: "badhash@test.cl", passwordHash: 12345 });

  await assert.rejects(
    () => login("badhash@test.cl", "Whatever123!"),
    (error) => error instanceof UnauthorizedError
  );
});

// ── Reset password ─────────────────────────────────────────────────

test("reset: non-privileged role is forbidden and password is unchanged", async () => {
  const tenantId = await createTestTenant();
  await createTestUser({ tenantId, email: "target@test.cl" });
  const cashierId = await createTestUser({ tenantId, email: "cashier@test.cl" });

  const actor = { _id: cashierId, tenantId, roles: ["cashier"] };
  const target = await userRepo.findUserByEmail("target@test.cl");

  await assert.rejects(
    () => resetUserPassword({ actor, id: target._id, password: "NuevaClave123!" }),
    (error) => error instanceof ForbiddenError
  );

  const unchanged = await userRepo.findUserByEmail("target@test.cl");
  assert.equal(unchanged.passwordHash, FAKE_HASH);
});

test("reset: admin cannot reset a user of another tenant", async () => {
  const tenantA = await createTestTenant();
  const tenantB = await createTestTenant();
  await createTestUser({ tenantId: tenantB, email: "other@test.cl" });
  const adminId = await createTestUser({ tenantId: tenantA, email: "admin@test.cl", roles: ["admin"] });

  const actor = { _id: adminId, tenantId: tenantA, roles: ["admin"] };
  const other = await userRepo.findUserByEmail("other@test.cl");

  await assert.rejects(
    () => resetUserPassword({ actor, id: other._id, password: "NuevaClave123!" }),
    (error) => error instanceof ForbiddenError
  );

  const unchanged = await userRepo.findUserByEmail("other@test.cl");
  assert.equal(unchanged.passwordHash, FAKE_HASH);
});

test("reset: sysadmin resets a user and the new password works", async () => {
  const tenantId = await createTestTenant();
  await createTestUser({ tenantId, email: "reset-me@test.cl" });
  const sysadminId = await createTestUser({ tenantId, email: "sys@test.cl", roles: ["sysadmin"] });

  const actor = { _id: sysadminId, tenantId, roles: ["sysadmin"] };
  const target = await userRepo.findUserByEmail("reset-me@test.cl");

  const publicUser = await resetUserPassword({ actor, id: target._id, password: "NuevaClave123!" });
  assert.equal(publicUser._id, target._id);
  assert.equal(publicUser.passwordHash, undefined);

  const updated = await userRepo.findUserByEmail("reset-me@test.cl");
  assert.ok(updated.passwordHash !== FAKE_HASH);
  assert.ok(await bcrypt.compare("NuevaClave123!", updated.passwordHash));

  const result = await login("reset-me@test.cl", "NuevaClave123!");
  assert.ok(result.token);
});

test("reset: nonexistent user returns 404-style error", async () => {
  const tenantId = await createTestTenant();
  const sysadminId = await createTestUser({ tenantId, email: "sys2@test.cl", roles: ["sysadmin"] });
  const actor = { _id: sysadminId, tenantId, roles: ["sysadmin"] };

  await assert.rejects(
    () => resetUserPassword({ actor, id: generateObjectIdHex(), password: "NuevaClave123!" }),
    (error) => error.message.includes("not found")
  );
});