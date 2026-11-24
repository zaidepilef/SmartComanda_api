import test from "node:test";
import assert from "node:assert/strict";
import { connectPostgres, closePostgres, getPgPool } from "../src/db/postgres.js";
import { runPgMigrations } from "../src/db/migrations-pg.js";
import * as tenantRepo from "../src/repositories/tenantRepository.js";
import * as branchRepo from "../src/repositories/branchRepository.js";
import * as dishRepo from "../src/repositories/dishRepository.js";
import * as orderRepo from "../src/repositories/orderRepository.js";
import * as orderService from "../src/services/orderService.js";
import * as cashSessionService from "../src/services/cashSessionService.js";
import * as userService from "../src/services/userService.js";
import { can } from "../src/utils/permissions.js";
import { requirePermission } from "../src/middleware/requirePermission.js";
import { BadRequestError, ConflictError, ForbiddenError } from "../src/utils/errors.js";
import { generateObjectIdHex } from "../src/utils/id.js";

const TENANT_IDS = [];
let emailSeq = 0;

test.before(async () => {
  await runPgMigrations(connectPostgres());
});

test.after(async () => {
  if (TENANT_IDS.length > 0) {
    // ON DELETE CASCADE borra sucursales, usuarios, cajas y pedidos del tenant.
    await getPgPool().query("DELETE FROM tenant WHERE id = ANY($1::varchar[])", [TENANT_IDS]);
  }
  await closePostgres();
});

async function setup() {
  const tenantId = generateObjectIdHex();
  TENANT_IDS.push(tenantId);
  await tenantRepo.createTenant({ _id: tenantId, name: "Roles Tenant" });
  const branch = await branchRepo.createBranch({
    tenantId,
    name: "Roles Branch",
    paymentMethods: ["cash", "debit", "credit", "transfer"],
  });
  const dish = await dishRepo.createDish({ tenantId, name: "Completo", salePrice: 5000, recipe: [] });
  const owner = await userService.createUserWithPassword({
    firstName: "Olga",
    lastName: "Owner",
    email: `owner${(emailSeq += 1)}-${tenantId}@test.cl`,
    password: "password123",
    roles: ["owner"],
    tenantId,
  });

  const actor = (role) => ({ _id: owner._id, tenantId, roles: [role], role });

  return { tenantId, branchId: String(branch._id), dishId: String(dish._id), owner, actor };
}

function qrOrder({ tenantId, branchId, dishId }, number = 1) {
  return orderRepo.createOrder({
    tenantId,
    foodtruckId: branchId,
    number,
    orderType: "qr",
    paymentStatus: "pending",
    items: [{ dishId, name: "Completo", price: 5000, quantity: 2, stockApplied: false }],
    total: 10000,
  });
}

// ── Matriz de permisos ──────────────────────────────────────────────

test("permissions: matrix by role", () => {
  const roles = ["sysadmin", "owner", "admin", "cashier", "cook"];
  const allowed = (action) => roles.filter((role) => can({ roles: [role] }, action));

  assert.deepEqual(allowed("cash.open"), ["sysadmin", "owner", "admin", "cashier"]);
  assert.deepEqual(allowed("order.create"), ["sysadmin", "owner", "admin", "cashier"]);
  assert.deepEqual(allowed("order.status"), roles);
  assert.deepEqual(allowed("order.cancel"), ["sysadmin", "owner", "admin"]);
  assert.deepEqual(allowed("order.correct"), ["sysadmin", "owner", "admin"]);
  assert.deepEqual(allowed("user.manage"), ["sysadmin", "owner", "admin"]);
});

test("permissions: middleware answers 403 for a cook creating orders", () => {
  let status = null;
  let nextCalled = false;
  const res = { status: (code) => ((status = code), { json: () => {} }) };

  requirePermission("order.create")({ user: { roles: ["cook"] } }, res, () => (nextCalled = true));
  assert.equal(status, 403);
  assert.equal(nextCalled, false);

  requirePermission("order.status")({ user: { roles: ["cook"] } }, res, () => (nextCalled = true));
  assert.equal(nextCalled, true);
});

// ── Caja: totales, cobro QR, anulación y cierre ─────────────────────

test("cash: QR order is hidden from kitchen until charged, then cancel reverses totals", async () => {
  const ctx = await setup();
  const cashier = ctx.actor("cashier");
  const admin = ctx.actor("admin");

  const session = await cashSessionService.openCashSession(cashier, {
    branchId: ctx.branchId,
    openingAmount: 20000,
  });
  assert.deepEqual(session.totals, { cash: 0, debit: 0, credit: 0, transfer: 0 });
  assert.equal(session.expected.cash, 20000);

  const order = await qrOrder(ctx);

  const kitchenBefore = await orderService.listOrders(admin, { branchId: ctx.branchId, kitchen: true });
  assert.equal(kitchenBefore.some((item) => item._id === order._id), false);

  await assert.rejects(
    () => orderService.updateOrderStatus(ctx.actor("cook"), order._id, "preparing"),
    ConflictError
  );

  const { order: paid } = await orderService.payOrder(cashier, order._id, "cash");
  assert.equal(paid.paymentStatus, "paid");
  assert.equal(paid.cashSessionId, session.id);
  assert.equal(paid.paidBy, ctx.owner._id);

  const fetched = await orderService.getOrder(cashier, order._id);
  assert.equal(fetched.paidByName, "Olga Owner");
  const [listed] = await orderService.listOrders(admin, { branchId: ctx.branchId, q: String(order.number) });
  assert.equal(listed.paidByName, "Olga Owner");
  assert.ok(paid.paidAt);

  await assert.rejects(() => orderService.payOrder(cashier, order._id, "cash"), ConflictError);

  const kitchenAfter = await orderService.listOrders(admin, { branchId: ctx.branchId, kitchen: true });
  assert.equal(kitchenAfter.some((item) => item._id === order._id), true);

  let current = await cashSessionService.getCurrentCashSession(cashier, { branchId: ctx.branchId });
  assert.equal(current.totals.cash, 10000);
  assert.equal(current.orderCount, 1);
  assert.equal(current.expected.cash, 30000);
  assert.equal(current.openedByName, "Olga Owner");

  await assert.rejects(
    () => orderService.updateOrderStatus(cashier, order._id, "cancelled"),
    ForbiddenError
  );
  await assert.rejects(
    () => orderService.updateOrderStatus(admin, order._id, "cancelled"),
    BadRequestError
  );

  const cancelled = await orderService.cancelOrder(admin, order._id, "Cliente se fue");
  assert.equal(cancelled.status, "cancelled");
  assert.equal(cancelled.paymentStatus, "refunded");
  assert.equal(cancelled.cancelReason, "Cliente se fue");

  current = await cashSessionService.getCurrentCashSession(cashier, { branchId: ctx.branchId });
  assert.equal(current.totals.cash, 0);
  assert.equal(current.orderCount, 0);

  await assert.rejects(() => orderService.cancelOrder(admin, order._id, "otra vez"), ConflictError);
});

test("cash: close persists counted amounts and differences; reopen after closing", async () => {
  const ctx = await setup();
  const cashier = ctx.actor("cashier");

  const session = await cashSessionService.openCashSession(cashier, {
    branchId: ctx.branchId,
    openingAmount: 20000,
  });

  await assert.rejects(
    () => cashSessionService.openCashSession(cashier, { branchId: ctx.branchId, openingAmount: 0 }),
    ConflictError
  );

  const { order: counterOrder } = await orderService.createOrder(cashier, {
    foodtruckId: ctx.branchId,
    orderType: "takeaway",
    paymentMethod: "cash",
    items: [{ dishId: ctx.dishId, quantity: 6, stockApplied: false }],
  });
  assert.equal(counterOrder.paidBy, ctx.owner._id);
  await orderService.createOrder(cashier, {
    foodtruckId: ctx.branchId,
    orderType: "takeaway",
    paymentMethod: "debit",
    items: [{ dishId: ctx.dishId, quantity: 1, stockApplied: false }],
  });

  const closed = await cashSessionService.closeCashSession(cashier, session.id, {
    closingAmounts: { cash: 48000 },
    note: "Faltan 2 lucas",
  });

  assert.equal(closed.status, "closed");
  assert.equal(closed.orderCount, 2);
  assert.equal(closed.closingNote, "Faltan 2 lucas");
  const byMethod = Object.fromEntries(closed.closure.map((line) => [line.method, line]));
  assert.deepEqual(byMethod.cash, { method: "cash", expected: 50000, counted: 48000, difference: -2000 });
  assert.deepEqual(byMethod.debit, { method: "debit", expected: 5000, counted: 5000, difference: 0 });
  assert.equal(closed.difference.cash, -2000);

  await assert.rejects(() => cashSessionService.closeCashSession(cashier, session.id, {}), ConflictError);

  const reopened = await cashSessionService.openCashSession(cashier, {
    branchId: ctx.branchId,
    openingAmount: 0,
  });
  assert.equal(reopened.status, "open");
});

test("cash: cancelling a paid order of a closed session is rejected", async () => {
  const ctx = await setup();
  const cashier = ctx.actor("cashier");

  const session = await cashSessionService.openCashSession(cashier, {
    branchId: ctx.branchId,
    openingAmount: 0,
  });
  const { order } = await orderService.createOrder(cashier, {
    foodtruckId: ctx.branchId,
    orderType: "takeaway",
    paymentMethod: "cash",
    items: [{ dishId: ctx.dishId, quantity: 1, stockApplied: false }],
  });
  await cashSessionService.closeCashSession(cashier, session.id, {});

  await assert.rejects(() => orderService.cancelOrder(ctx.actor("owner"), order._id, "error"), ConflictError);
});

// ── Corregir ────────────────────────────────────────────────────────

test("orders: correct only pending orders not yet in preparation", async () => {
  const ctx = await setup();
  const admin = ctx.actor("admin");
  const order = await qrOrder(ctx);

  const corrected = await orderService.correctOrder(admin, order._id, [{ dishId: ctx.dishId, quantity: 3 }]);
  assert.equal(corrected.number, order.number);
  assert.equal(corrected.total, 15000);
  assert.equal(corrected.items[0].quantity, 3);
  assert.ok(corrected.correctedAt);

  await cashSessionService.openCashSession(admin, { branchId: ctx.branchId, openingAmount: 0 });
  await orderService.payOrder(admin, order._id, "transfer");

  await assert.rejects(
    () => orderService.correctOrder(admin, order._id, [{ dishId: ctx.dishId, quantity: 1 }]),
    ConflictError
  );
});

// ── Usuarios ────────────────────────────────────────────────────────

test("users: owner creates staff, admin only cashier and cook", async () => {
  const ctx = await setup();
  const owner = { ...ctx.owner, roles: ["owner"] };
  const newUser = (roles) => ({
    firstName: "Staff",
    lastName: "Test",
    email: `staff${(emailSeq += 1)}-${ctx.tenantId}@test.cl`,
    password: "password123",
    roles,
  });

  const encargado = await userService.createUserWithPassword({ actor: owner, ...newUser(["admin"]) });
  assert.deepEqual(encargado.roles, ["admin"]);
  assert.equal(encargado.tenantId, ctx.tenantId);

  const cook = await userService.createUserWithPassword({ actor: owner, ...newUser(["cook"]) });
  assert.deepEqual(cook.roles, ["cook"]);

  await assert.rejects(
    () => userService.createUserWithPassword({ actor: owner, ...newUser(["owner"]) }),
    ForbiddenError
  );

  const adminActor = { ...encargado, roles: ["admin"] };
  await userService.createUserWithPassword({ actor: adminActor, ...newUser(["cashier"]) });
  await assert.rejects(
    () => userService.createUserWithPassword({ actor: adminActor, ...newUser(["admin"]) }),
    ForbiddenError
  );
  await assert.rejects(
    () => userService.updateUserById({ actor: adminActor, id: ctx.owner._id, firstName: "X" }),
    ForbiddenError
  );

  const cashierActor = { _id: cook._id, tenantId: ctx.tenantId, roles: ["cashier"] };
  await assert.rejects(
    () => userService.createUserWithPassword({ actor: cashierActor, ...newUser(["cook"]) }),
    ForbiddenError
  );
});
