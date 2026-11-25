import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { connectPostgres, closePostgres, getPgPool } from "../src/db/postgres.js";
import { runPgMigrations } from "../src/db/migrations-pg.js";
import * as tenantRepo from "../src/repositories/tenantRepository.js";
import * as branchRepo from "../src/repositories/branchRepository.js";
import * as dishRepo from "../src/repositories/dishRepository.js";
import * as orderService from "../src/services/orderService.js";
import * as publicService from "../src/services/publicService.js";
import * as customerService from "../src/services/customerService.js";
import * as cashSessionService from "../src/services/cashSessionService.js";
import * as userService from "../src/services/userService.js";
import { can } from "../src/utils/permissions.js";
import { normalizeChileanMobile, normalizeLegacyPhone } from "../src/utils/phone.js";
import { customerFacingStatus, nextStatuses } from "../src/models/order.js";
import { createPublicOrderSchema } from "../src/validation/publicSchemas.js";
import { generateObjectIdHex } from "../src/utils/id.js";

const BRANCH_POINT = { lat: -33.4378, lng: -70.6504 };
const NEAR_POINT = { lat: -33.4405, lng: -70.645 };
const TENANT_IDS = [];
let emailSeq = 0;

test.before(async () => {
  await runPgMigrations(connectPostgres());
});

test.after(async () => {
  if (TENANT_IDS.length > 0) {
    await getPgPool().query("DELETE FROM tenant WHERE id = ANY($1::varchar[])", [TENANT_IDS]);
  }
  await closePostgres();
});

async function setup({ paymentMethods = ["cash", "debit", "credit", "transfer"] } = {}) {
  const tenantId = generateObjectIdHex();
  TENANT_IDS.push(tenantId);
  await tenantRepo.createTenant({ _id: tenantId, name: "Flow Tenant" });
  const branch = await branchRepo.createBranch({
    tenantId,
    name: "Flow Branch",
    paymentMethods,
    ...BRANCH_POINT,
    deliveryMaxKm: 5,
  });
  const branchId = String(branch._id);
  const dish = await dishRepo.createDish({ tenantId, name: "Completo", salePrice: 3500, recipe: [] });

  const user = async (role) => {
    const created = await userService.createUserWithPassword({
      firstName: role,
      lastName: "Test",
      email: `${role}${(emailSeq += 1)}-${tenantId}@test.cl`,
      password: "password123",
      roles: [role],
      tenantId,
      branchId,
    });
    return { _id: created._id, tenantId, branchId, roles: [role], role };
  };

  return { tenantId, branchId, dishId: String(dish._id), user };
}

function orderInput(ctx, overrides = {}) {
  return createPublicOrderSchema.parse({
    tenantId: ctx.tenantId,
    branchId: ctx.branchId,
    name: "Ana Pérez",
    phone: "912345678",
    orderType: "qr",
    clientRequestId: randomUUID(),
    expectedPaymentMethod: "debit",
    items: [{ dishId: ctx.dishId, quantity: 2, note: "sin mayo" }],
    ...overrides,
  });
}

function deliveryInput(ctx, overrides = {}) {
  return orderInput(ctx, {
    orderType: "delivery",
    expectedPaymentMethod: "cash",
    cashTendered: 10000,
    delivery: { address: "Merced 800, depto 12", reference: "Timbre 12", ...NEAR_POINT },
    ...overrides,
  });
}

async function createDelivery(ctx, overrides) {
  const { order } = await publicService.createPublicOrder(deliveryInput(ctx, overrides));
  return order;
}

/** Lleva un domicilio a `ready` como lo haría cocina. */
async function readyDelivery(ctx, cook) {
  const created = await createDelivery(ctx);
  await orderService.updateOrderStatus(cook, created.orderId, "preparing");
  await orderService.updateOrderStatus(cook, created.orderId, "ready");
  return created;
}

// ── Teléfono y reglas del modelo ─────────────────────────────────────

test("phone: Chilean mobiles are normalized to +569XXXXXXXX", () => {
  assert.equal(normalizeChileanMobile("912345678"), "+56912345678");
  assert.equal(normalizeChileanMobile("56912345678"), "+56912345678");
  assert.equal(normalizeChileanMobile("+56 9 1234 5678"), "+56912345678");
  assert.equal(normalizeChileanMobile("+56221234567"), null);
  assert.equal(normalizeChileanMobile("9123a5678"), null);
  assert.equal(normalizeLegacyPhone("056912345678"), "+56912345678");
});

test("model: app delivery goes through out_for_delivery and only app orders can be rejected", () => {
  const appDelivery = { status: "ready", orderType: "delivery", deliveryAddress: "X 1" };
  const pickup = { status: "ready", orderType: "qr" };
  assert.deepEqual(nextStatuses(appDelivery).sort(), ["cancelled", "out_for_delivery"]);
  assert.deepEqual(nextStatuses(pickup).sort(), ["cancelled", "delivered"]);
  assert.ok(nextStatuses({ status: "new", orderType: "qr" }).includes("rejected"));
  assert.equal(nextStatuses({ status: "new", orderType: "takeaway" }).includes("rejected"), false);

  assert.equal(customerFacingStatus({ status: "new", orderType: "qr", paymentStatus: "pending" }), "awaiting_payment");
  assert.equal(customerFacingStatus({ status: "new", orderType: "delivery" }), "received");
  assert.equal(customerFacingStatus({ status: "ready", orderType: "delivery" }), "ready_for_dispatch");
  assert.equal(customerFacingStatus({ status: "ready", orderType: "qr" }), "ready_for_pickup");
});

test("permissions: driver dispatches and collects; cashier rejects; cook does neither", () => {
  const roles = ["sysadmin", "owner", "admin", "cashier", "cook", "driver"];
  const allowed = (action) => roles.filter((role) => can({ roles: [role] }, action));
  assert.deepEqual(allowed("order.reject"), ["sysadmin", "owner", "admin", "cashier"]);
  assert.deepEqual(allowed("order.dispatch"), ["sysadmin", "owner", "admin", "driver"]);
  assert.deepEqual(allowed("order.collect"), ["sysadmin", "owner", "admin", "driver"]);
  assert.deepEqual(allowed("order.assign"), ["sysadmin", "owner", "admin"]);
  assert.equal(can({ roles: ["driver"] }, "order.pay"), false);
  assert.equal(can({ roles: ["driver"] }, "cash.open"), false);
});

test("schema: pickup and delivery accept different expected payment methods", () => {
  const ctx = { tenantId: generateObjectIdHex(), branchId: generateObjectIdHex(), dishId: generateObjectIdHex() };
  assert.throws(() => orderInput(ctx, { expectedPaymentMethod: "card" }));
  assert.throws(() => deliveryInput(ctx, { expectedPaymentMethod: "debit", cashTendered: undefined }));
  assert.throws(() => orderInput(ctx, { cashTendered: 5000 }), "cashTendered only with cash");
  assert.equal(orderInput(ctx).phone, "+56912345678");
});

// ── Reconocimiento del cliente ───────────────────────────────────────

test("lookup: unknown phone, then first name and masked saved address", async () => {
  const ctx = await setup();
  const query = { tenantId: ctx.tenantId, branchId: ctx.branchId, phone: "+56912345678" };

  assert.deepEqual(await publicService.lookupCustomer(query), { known: false });

  await createDelivery(ctx);
  const known = await publicService.lookupCustomer(query);
  assert.equal(known.known, true);
  assert.equal(known.firstName, "Ana");
  assert.equal(known.addresses.length, 1);
  assert.equal(known.addresses[0].label, "Merced 80…");
  assert.equal(known.lastAddressId, known.addresses[0].id);
  assert.equal(JSON.stringify(known).includes("Timbre"), false, "no reference exposed");

  const other = await setup();
  assert.deepEqual(
    await publicService.lookupCustomer({ tenantId: other.tenantId, branchId: other.branchId, phone: "+56912345678" }),
    { known: false }
  );
});

test("addresses: reused within 30 m, saved addressId works, at most 5 kept", async () => {
  const ctx = await setup();
  await createDelivery(ctx);
  await createDelivery(ctx, {
    delivery: { address: "Merced 800 depto 12 (otra forma)", lat: NEAR_POINT.lat + 0.0001, lng: NEAR_POINT.lng },
  });

  const customer = await customerService.getCustomerByPhone({ tenantId: ctx.tenantId, phone: "+56912345678" });
  let lookup = await customerService.lookupCustomer({ tenantId: ctx.tenantId, phone: "+56912345678" });
  assert.equal(lookup.addresses.length, 1, "same point is reused");

  const reused = await createDelivery(ctx, { delivery: { addressId: lookup.lastAddressId } });
  assert.equal(reused.deliveryDistanceKm > 0, true);

  for (let index = 1; index <= 5; index += 1) {
    await customerService.saveDeliveryAddress({
      tenantId: ctx.tenantId,
      customerId: customer._id,
      address: `Calle ${index} 100`,
      lat: NEAR_POINT.lat + index * 0.002,
      lng: NEAR_POINT.lng,
    });
  }

  lookup = await customerService.lookupCustomer({ tenantId: ctx.tenantId, phone: "+56912345678" });
  assert.equal(lookup.addresses.length, 5);
  assert.equal(lookup.addresses.some((entry) => entry.label.startsWith("Merced")), false);

  const stranger = await setup();
  await assert.rejects(
    publicService.createPublicOrder(
      deliveryInput(ctx, { phone: "+56987654321", delivery: { addressId: lookup.lastAddressId } })
    ),
    /does not belong/
  );
  assert.ok(stranger);
});

// ── Pedido público ───────────────────────────────────────────────────

test("customer name: confirming only the first name keeps the full name", async () => {
  assert.equal(customerService.resolveCustomerName("Ana Pérez", "ana"), "Ana Pérez");
  assert.equal(customerService.resolveCustomerName("Ana Pérez", "Ána"), "Ana Pérez");
  assert.equal(customerService.resolveCustomerName("Ana Pérez", "Ana María Soto"), "Ana María Soto");
  assert.equal(customerService.resolveCustomerName("Ana Pérez", "Beatriz"), "Beatriz");
  assert.equal(customerService.resolveCustomerName("Ana", "Ana"), "Ana");
  assert.equal(customerService.resolveCustomerName(null, "Ana"), "Ana");
  assert.equal(customerService.resolveCustomerName("Ana Pérez", "  "), null);

  const ctx = await setup();
  await publicService.createPublicOrder(orderInput(ctx));
  const { order } = await publicService.createPublicOrder(orderInput(ctx, { name: "Ana" }));

  const customer = await customerService.getCustomerByPhone({ tenantId: ctx.tenantId, phone: "+56912345678" });
  assert.equal(customer.firstName, "Ana Pérez");
  const stored = await orderService.getOrder(await ctx.user("admin"), order.orderId);
  assert.equal(stored.clientName, "Ana Pérez");

  await publicService.createPublicOrder(orderInput(ctx, { name: "Ana Soto" }));
  const renamed = await customerService.getCustomerByPhone({ tenantId: ctx.tenantId, phone: "+56912345678" });
  assert.equal(renamed.firstName, "Ana Soto");
});

test("public order: pending, notes stored, extra payment fields ignored", async () => {
  const ctx = await setup();
  const input = orderInput(ctx);
  const { order } = await publicService.createPublicOrder({ ...input, paymentStatus: "paid" });

  assert.equal(order.total, 7000);
  assert.equal(order.status, "awaiting_payment");
  assert.match(order.trackingToken, /^[A-Za-z0-9_-]{43}$/);

  const stored = await orderService.getOrder((await ctx.user("admin")), order.orderId);
  assert.equal(stored.paymentStatus, "pending");
  assert.equal(stored.items[0].note, "sin mayo");
  assert.equal(stored.expectedPaymentMethod, "debit");
  assert.equal(stored.clientPhone, "+56912345678");
  assert.equal(stored.paymentHistory[0].status, "pending");
});

test("public order: same clientRequestId returns the same order; another phone gets 409", async () => {
  const ctx = await setup();
  const input = orderInput(ctx);
  const first = await publicService.createPublicOrder(input);
  const again = await publicService.createPublicOrder(input);

  assert.equal(again.replayed, true);
  assert.equal(again.order.orderId, first.order.orderId);
  assert.equal(again.order.trackingToken, undefined);

  await assert.rejects(
    publicService.createPublicOrder({ ...input, phone: "+56987654321" }),
    (error) => error.name === "ConflictError"
  );
});

test("public order: expected method must be enabled and cash must cover the total", async () => {
  const ctx = await setup({ paymentMethods: ["cash", "debit"] });
  await assert.rejects(
    publicService.createPublicOrder(orderInput(ctx, { expectedPaymentMethod: "credit" })),
    /not enabled/
  );
  await assert.rejects(
    publicService.createPublicOrder(deliveryInput(ctx, { cashTendered: 5000 })),
    /cover the order total/
  );

  const cashOnly = await setup({ paymentMethods: ["cash"] });
  await assert.rejects(
    publicService.createPublicOrder(
      deliveryInput(cashOnly, { expectedPaymentMethod: "card", cashTendered: undefined })
    ),
    /not enabled/
  );
});

test("menu exposes payment methods and delivery availability", async () => {
  const ctx = await setup();
  const menu = await publicService.getPublicMenu({ tenantId: ctx.tenantId, branchId: ctx.branchId });
  assert.equal(menu.deliveryAvailable, true);
  assert.deepEqual(menu.paymentMethods, ["cash", "debit", "credit", "transfer"]);

  await branchRepo.updateBranch(ctx.branchId, { deliveryMaxKm: null });
  const noDelivery = await publicService.getPublicMenu({ tenantId: ctx.tenantId, branchId: ctx.branchId });
  assert.equal(noDelivery.deliveryAvailable, false);
});

// ── Cocina, cobro en caja y rechazo ──────────────────────────────────

test("kitchen: unpaid pickup waits for the register, delivery starts with payment pending", async () => {
  const ctx = await setup();
  const cook = await ctx.user("cook");
  const { order: pickup } = await publicService.createPublicOrder(orderInput(ctx));
  const delivery = await createDelivery(ctx);

  const kitchen = await orderService.listOrders(cook, { kitchen: true });
  assert.equal(kitchen.some((order) => order._id === pickup.orderId), false);
  assert.equal(kitchen.some((order) => order._id === delivery.orderId), true);

  await assert.rejects(
    orderService.updateOrderStatus(cook, pickup.orderId, "preparing"),
    (error) => error.name === "ConflictError"
  );

  const preparing = await orderService.updateOrderStatus(cook, delivery.orderId, "preparing");
  assert.equal(preparing.status, "preparing");
  assert.equal(preparing.paymentStatus, "pending");
});

test("reject: cashier rejects a new app order with a reason; payment voided", async () => {
  const ctx = await setup();
  const cashier = await ctx.user("cashier");
  const cook = await ctx.user("cook");
  const { order } = await publicService.createPublicOrder(orderInput(ctx));

  const rejected = await orderService.rejectOrder(cashier, order.orderId, "No tenemos pan de completo");
  assert.equal(rejected.status, "rejected");
  assert.equal(rejected.paymentStatus, "voided");
  assert.equal(rejected.rejectionReason, "No tenemos pan de completo");

  await assert.rejects(
    orderService.updateOrderStatus(cook, order.orderId, "preparing"),
    (error) => error.name === "ConflictError"
  );

  const delivery = await createDelivery(ctx);
  await orderService.updateOrderStatus(cook, delivery.orderId, "preparing");
  await assert.rejects(
    orderService.rejectOrder(cashier, delivery.orderId, "Tarde"),
    /cancel it instead/
  );
});

test("cancel: an unpaid order is voided", async () => {
  const ctx = await setup();
  const admin = await ctx.user("admin");
  const { order } = await publicService.createPublicOrder(orderInput(ctx));
  const cancelled = await orderService.cancelOrder(admin, order.orderId, "Cliente no vino");
  assert.equal(cancelled.status, "cancelled");
  assert.equal(cancelled.paymentStatus, "voided");
});

test("register cannot charge app delivery orders", async () => {
  const ctx = await setup();
  const cashier = await ctx.user("cashier");
  const delivery = await createDelivery(ctx);
  await assert.rejects(
    orderService.payOrder(cashier, delivery.orderId, "cash"),
    /collected by the driver/
  );
});

// ── Reparto y cobro con entrega ──────────────────────────────────────

test("dispatch: driver takes a ready order once; ready app delivery cannot skip the route", async () => {
  const ctx = await setup();
  const cook = await ctx.user("cook");
  const driver = await ctx.user("driver");
  const otherDriver = await ctx.user("driver");
  const created = await readyDelivery(ctx, cook);

  await assert.rejects(
    orderService.updateOrderStatus(cook, created.orderId, "delivered"),
    (error) => error.name === "ConflictError"
  );

  const out = await orderService.dispatchOrder(driver, created.orderId);
  assert.equal(out.status, "out_for_delivery");
  assert.equal(out.driverId, String(driver._id));

  await assert.rejects(
    orderService.dispatchOrder(otherDriver, created.orderId),
    (error) => error.name === "ConflictError"
  );

  const driverView = await orderService.listOrders(otherDriver, {});
  assert.equal(driverView.some((order) => order._id === created.orderId), false);
  const ownView = await orderService.listOrders(driver, {});
  assert.equal(ownView.some((order) => order._id === created.orderId), true);

  await assert.rejects(
    orderService.deliverOrder(otherDriver, created.orderId, { paymentMethod: "debit" }),
    (error) => error.name === "ForbiddenError"
  );
});

test("deliver: needs an open session, collects cash with change, and cannot be paid twice", async () => {
  const ctx = await setup();
  const cook = await ctx.user("cook");
  const driver = await ctx.user("driver");
  const cashier = await ctx.user("cashier");
  const created = await readyDelivery(ctx, cook);
  await orderService.dispatchOrder(driver, created.orderId);

  await assert.rejects(
    orderService.deliverOrder(driver, created.orderId, { paymentMethod: "cash", cashReceived: 10000 }),
    /No open cash session/
  );

  const session = await cashSessionService.openCashSession(cashier, { branchId: ctx.branchId, openingAmount: 0 });

  await assert.rejects(
    orderService.deliverOrder(driver, created.orderId, { paymentMethod: "cash", cashReceived: 5000 }),
    /cover the order total/
  );

  const result = await orderService.deliverOrder(driver, created.orderId, {
    paymentMethod: "cash",
    cashReceived: 10000,
  });
  assert.equal(result.order.status, "delivered");
  assert.equal(result.order.paymentStatus, "paid");
  assert.equal(result.order.paidBy, String(driver._id));
  assert.equal(result.change, 3000);

  const current = await cashSessionService.getCurrentCashSession(cashier, { branchId: ctx.branchId });
  assert.equal(current.id ?? current._id, session.id ?? session._id);
  assert.equal(Number(current.totals.cash), 7000);

  await assert.rejects(
    orderService.deliverOrder(driver, created.orderId, { paymentMethod: "cash", cashReceived: 10000 }),
    (error) => error.name === "ConflictError"
  );
});

test("declined card at the door, then paid in cash: payment history keeps both", async () => {
  const ctx = await setup();
  const cook = await ctx.user("cook");
  const driver = await ctx.user("driver");
  const cashier = await ctx.user("cashier");
  await cashSessionService.openCashSession(cashier, { branchId: ctx.branchId, openingAmount: 0 });
  const created = await readyDelivery(ctx, cook);
  await orderService.dispatchOrder(driver, created.orderId);

  const declined = await orderService.declinePayment(driver, created.orderId, "Tarjeta rechazada");
  assert.equal(declined.paymentStatus, "declined");
  assert.equal(declined.status, "out_for_delivery");

  const { order } = await orderService.deliverOrder(driver, created.orderId, {
    paymentMethod: "cash",
    cashReceived: 7000,
  });
  assert.deepEqual(
    order.paymentHistory.map((entry) => entry.status),
    ["pending", "declined", "paid"]
  );
  assert.equal(order.paymentHistory[2].method, "cash");
});

// ── Seguimiento ──────────────────────────────────────────────────────

test("tracking: valid token shows status without personal data; invented token is 404", async () => {
  const ctx = await setup();
  const cook = await ctx.user("cook");
  const cashier = await ctx.user("cashier");
  const created = await createDelivery(ctx);

  let tracked = await publicService.trackOrder({ tenantId: ctx.tenantId, trackingToken: created.trackingToken });
  assert.equal(tracked.number, created.number);
  assert.equal(tracked.status, "received");
  assert.equal(tracked.expectedPaymentMethod, "cash");

  const serialized = JSON.stringify(tracked);
  for (const secret of ["Merced", "Timbre", "+569", "Ana", String(NEAR_POINT.lat)]) {
    assert.equal(serialized.includes(secret), false, `tracking must not expose ${secret}`);
  }

  await orderService.updateOrderStatus(cook, created.orderId, "preparing");
  tracked = await publicService.trackOrder({ tenantId: ctx.tenantId, trackingToken: created.trackingToken });
  assert.equal(tracked.status, "preparing");

  const { order: pickup } = await publicService.createPublicOrder(orderInput(ctx));
  await orderService.rejectOrder(cashier, pickup.orderId, "Cerramos en 10 minutos");
  const rejected = await publicService.trackOrder({ tenantId: ctx.tenantId, trackingToken: pickup.trackingToken });
  assert.equal(rejected.status, "rejected");
  assert.equal(rejected.rejectionReason, "Cerramos en 10 minutos");

  await assert.rejects(
    publicService.trackOrder({ tenantId: ctx.tenantId, trackingToken: "a".repeat(43) }),
    (error) => error.name === "NotFoundError"
  );
});
