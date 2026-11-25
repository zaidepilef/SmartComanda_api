import test from "node:test";
import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { connectPostgres, closePostgres, getPgPool } from "../src/db/postgres.js";
import { runPgMigrations } from "../src/db/migrations-pg.js";
import * as tenantRepo from "../src/repositories/tenantRepository.js";
import * as branchRepo from "../src/repositories/branchRepository.js";
import * as dishRepo from "../src/repositories/dishRepository.js";
import * as orderService from "../src/services/orderService.js";
import * as publicService from "../src/services/publicService.js";
import { can } from "../src/utils/permissions.js";
import { createBranchSchema, updateBranchSchema } from "../src/validation/branchSchemas.js";
import { createPublicOrderSchema } from "../src/validation/publicSchemas.js";
import { generateObjectIdHex } from "../src/utils/id.js";

// Plaza de Armas de Santiago (sucursal) → Plaza Ñuñoa (cliente): ~7,4 km con factor calles.
const BRANCH_POINT = { lat: -33.4378, lng: -70.6504 };
const CUSTOMER_POINT = { lat: -33.4569, lng: -70.5978 };

const TENANT_IDS = [];

test.before(async () => {
  await runPgMigrations(connectPostgres());
});

test.after(async () => {
  if (TENANT_IDS.length > 0) {
    await getPgPool().query("DELETE FROM tenant WHERE id = ANY($1::varchar[])", [TENANT_IDS]);
  }
  await closePostgres();
});

async function setup(branchFields = {}) {
  const tenantId = generateObjectIdHex();
  TENANT_IDS.push(tenantId);
  await tenantRepo.createTenant({ _id: tenantId, name: "Delivery Tenant" });
  const branch = await branchRepo.createBranch({ tenantId, name: "Delivery Branch", ...branchFields });
  const dish = await dishRepo.createDish({ tenantId, name: "Completo", salePrice: 5000, recipe: [] });
  const actor = (role) => ({ _id: generateObjectIdHex(), tenantId, roles: [role], role });

  return { tenantId, branchId: String(branch._id), dishId: String(dish._id), branch, actor };
}

function deliveryInput(ctx, delivery) {
  return createPublicOrderSchema.parse({
    tenantId: ctx.tenantId,
    branchId: ctx.branchId,
    name: "Ana",
    phone: "+56911111111",
    orderType: "delivery",
    clientRequestId: randomUUID(),
    expectedPaymentMethod: "cash",
    delivery,
    items: [{ dishId: ctx.dishId, quantity: 1 }],
  });
}

// ── Validación ──────────────────────────────────────────────────────

test("branch schema: lat and lng go together and within range", () => {
  const base = { tenantId: generateObjectIdHex(), name: "X", type: "Sucursal" };

  assert.equal(createBranchSchema.safeParse({ ...base, lat: -33.4 }).success, false);
  assert.equal(createBranchSchema.safeParse({ ...base, lat: 91, lng: 0 }).success, false);
  assert.equal(createBranchSchema.safeParse({ ...base, ...BRANCH_POINT }).success, true);
  assert.equal(updateBranchSchema.safeParse({ lat: null, lng: null }).success, true);
  assert.equal(updateBranchSchema.safeParse({ deliveryAvgSpeedKmh: 2 }).success, false);
});

test("public order schema: delivery requires an address with coordinates, qr is the default", () => {
  const base = {
    tenantId: generateObjectIdHex(),
    branchId: generateObjectIdHex(),
    name: "Ana",
    phone: "+56911111111",
    clientRequestId: randomUUID(),
    expectedPaymentMethod: "cash",
    items: [{ dishId: generateObjectIdHex(), quantity: 1 }],
  };

  assert.equal(createPublicOrderSchema.parse(base).orderType, "qr");
  assert.equal(createPublicOrderSchema.safeParse({ ...base, orderType: "delivery" }).success, false);
  assert.equal(
    createPublicOrderSchema.safeParse({
      ...base,
      orderType: "delivery",
      delivery: { address: "Irarrázaval 3000", lat: -33.45 },
    }).success,
    false
  );
  assert.equal(
    createPublicOrderSchema.safeParse({
      ...base,
      orderType: "delivery",
      delivery: { address: "Irarrázaval 3000" },
    }).success,
    false
  );
});

test("permissions: only managers see the delivery report", () => {
  const roles = ["sysadmin", "owner", "admin", "cashier", "cook"];
  assert.deepEqual(
    roles.filter((role) => can({ roles: [role] }, "order.analytics")),
    ["sysadmin", "owner", "admin"]
  );
});

// ── Sucursal y estimación ───────────────────────────────────────────

test("branch stores coordinates and delivery limits, default speed 25", async () => {
  const ctx = await setup(BRANCH_POINT);
  assert.equal(ctx.branch.lat, BRANCH_POINT.lat);
  assert.equal(ctx.branch.lng, BRANCH_POINT.lng);
  assert.equal(ctx.branch.deliveryAvgSpeedKmh, 25);
  assert.equal(ctx.branch.deliveryMaxKm, null);

  const updated = await branchRepo.updateBranch(ctx.branchId, { deliveryMaxKm: 5, deliveryMaxMinutes: 30 });
  assert.equal(updated.deliveryMaxKm, 5);
  assert.equal(updated.deliveryMaxMinutes, 30);

  const cleared = await branchRepo.updateBranch(ctx.branchId, { deliveryMaxKm: null });
  assert.equal(cleared.deliveryMaxKm, null);
});

test("public estimate hides branch coordinates and flags out of range", async () => {
  const ctx = await setup({ ...BRANCH_POINT, deliveryMaxKm: 5 });

  const result = await publicService.getDeliveryEstimate({
    tenantId: ctx.tenantId,
    branchId: ctx.branchId,
    ...CUSTOMER_POINT,
  });

  assert.deepEqual(Object.keys(result.estimate).sort(), ["distanceKm", "etaMinutes", "outOfRange"]);
  assert.ok(result.estimate.distanceKm > 7 && result.estimate.distanceKm < 8);
  assert.equal(result.estimate.outOfRange, true);
});

test("public estimate is null when the branch has no coordinates", async () => {
  const ctx = await setup();
  const result = await publicService.getDeliveryEstimate({
    tenantId: ctx.tenantId,
    branchId: ctx.branchId,
    ...CUSTOMER_POINT,
  });
  assert.deepEqual(result, { estimate: null });
});

// ── Pedido a domicilio ──────────────────────────────────────────────

test("delivery order stores address and the server-computed estimate", async () => {
  const ctx = await setup({ ...BRANCH_POINT, deliveryMaxMinutes: 60 });
  const input = deliveryInput(ctx, {
    address: "Irarrázaval 3000, Ñuñoa",
    reference: "Depto 501",
    ...CUSTOMER_POINT,
    accuracy: 12.6,
    // Valores enviados por el cliente que el servidor ignora.
    distanceKm: 0.1,
  });

  const { order: created } = await publicService.createPublicOrder(input);
  assert.equal(created.orderType, "delivery");
  assert.ok(created.deliveryDistanceKm > 7);
  assert.equal(created.deliveryOutOfRange, false);

  const order = await orderService.getOrder(ctx.actor("admin"), created.orderId);
  assert.equal(order.orderType, "delivery");
  assert.equal(order.deliveryAddress, "Irarrázaval 3000, Ñuñoa");
  assert.equal(order.deliveryReference, "Depto 501");
  assert.equal(order.deliveryLat, CUSTOMER_POINT.lat);
  assert.equal(order.deliveryAccuracyM, 13);
  assert.equal(order.deliveryEtaMinutes, Math.ceil((order.deliveryDistanceKm / 25) * 60));
});

test("delivery is rejected when the branch has no delivery limit", async () => {
  const ctx = await setup(BRANCH_POINT);
  await assert.rejects(
    publicService.createPublicOrder(
      deliveryInput(ctx, { address: "Irarrázaval 3000, Ñuñoa", ...CUSTOMER_POINT })
    ),
    (error) => error.code === "DELIVERY_UNAVAILABLE"
  );
});

test("out-of-range delivery is rejected; in-range app delivery goes to the kitchen and the report", async () => {
  const ctx = await setup({ ...BRANCH_POINT, deliveryMaxKm: 5 });

  await assert.rejects(
    publicService.createPublicOrder(
      deliveryInput(ctx, { address: "Irarrázaval 3000, Ñuñoa", ...CUSTOMER_POINT })
    ),
    (error) => error.code === "DELIVERY_OUT_OF_RANGE"
  );

  const nearPoint = { lat: -33.4405, lng: -70.6450 };
  const { order: created } = await publicService.createPublicOrder(
    deliveryInput(ctx, { address: "Merced 800, Santiago", ...nearPoint })
  );
  const admin = ctx.actor("admin");

  const kitchen = await orderService.listOrders(admin, { branchId: ctx.branchId, kitchen: true });
  const inKitchen = kitchen.find((order) => order._id === created.orderId);
  assert.ok(inKitchen, "app delivery orders enter the kitchen with the payment pending");
  assert.equal(inKitchen.paymentStatus, "pending");

  const report = await orderService.getDeliveryAnalytics(admin, { branchId: ctx.branchId });
  assert.equal(report.branch.lat, BRANCH_POINT.lat);
  assert.equal(report.summary.totalOrders, 1);
  assert.equal(report.summary.withEstimate, 1);
  assert.equal(report.summary.outOfRangeCount, 0);
  assert.deepEqual(
    report.summary.buckets.map((bucket) => bucket.count),
    [1, 0, 0, 0]
  );
  assert.equal(report.orders[0].deliveryAddress, "Merced 800, Santiago");
});

test("summarizeDeliveryOrders handles orders without estimate", () => {
  const summary = orderService.summarizeDeliveryOrders([
    { deliveryDistanceKm: null, deliveryEtaMinutes: null, deliveryOutOfRange: null },
    { deliveryDistanceKm: 1.5, deliveryEtaMinutes: 4, deliveryOutOfRange: false },
    { deliveryDistanceKm: 12, deliveryEtaMinutes: 29, deliveryOutOfRange: true },
  ]);

  assert.equal(summary.totalOrders, 3);
  assert.equal(summary.withEstimate, 2);
  assert.equal(summary.avgDistanceKm, 6.75);
  assert.equal(summary.avgEtaMinutes, 16.5);
  assert.equal(summary.outOfRangePct, 50);
  assert.deepEqual(summary.buckets.map((bucket) => bucket.count), [1, 0, 0, 1]);
});
