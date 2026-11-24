import { test } from "node:test";
import assert from "node:assert/strict";
import { estimateDelivery, haversineKm, ROAD_FACTOR } from "../src/utils/geo.js";

// Plaza de Armas de Santiago → Plaza Ñuñoa: ~5,2 km en línea recta.
const PLAZA_ARMAS = { lat: -33.4378, lng: -70.6504 };
const PLAZA_NUNOA = { lat: -33.4569, lng: -70.5978 };

test("haversineKm matches a known distance within 2%", () => {
  const km = haversineKm(PLAZA_ARMAS, PLAZA_NUNOA);
  assert.ok(Math.abs(km - 5.27) / 5.27 < 0.02, `got ${km}`);
});

test("haversineKm is zero for the same point", () => {
  assert.equal(haversineKm(PLAZA_ARMAS, PLAZA_ARMAS), 0);
});

test("estimateDelivery applies road factor and average speed", () => {
  const branch = { ...PLAZA_ARMAS, deliveryAvgSpeedKmh: 25 };
  const estimate = estimateDelivery(branch, PLAZA_NUNOA);
  const expectedKm = haversineKm(PLAZA_ARMAS, PLAZA_NUNOA) * ROAD_FACTOR;

  assert.ok(Math.abs(estimate.distanceKm - expectedKm) < 0.01);
  assert.equal(estimate.etaMinutes, Math.ceil((estimate.distanceKm / 25) * 60));
  assert.equal(estimate.outOfRange, false);
  assert.deepEqual(estimate.reasons, []);
});

test("estimateDelivery defaults the speed to 25 km/h", () => {
  const withDefault = estimateDelivery({ ...PLAZA_ARMAS }, PLAZA_NUNOA);
  const explicit = estimateDelivery({ ...PLAZA_ARMAS, deliveryAvgSpeedKmh: 25 }, PLAZA_NUNOA);
  assert.deepEqual(withDefault, explicit);
});

test("estimateDelivery flags distance and time limits", () => {
  const branch = { ...PLAZA_ARMAS, deliveryMaxKm: 3, deliveryMaxMinutes: 10 };
  const estimate = estimateDelivery(branch, PLAZA_NUNOA);

  assert.equal(estimate.outOfRange, true);
  assert.deepEqual(estimate.reasons, ["distance", "time"]);
});

test("estimateDelivery returns null without coordinates", () => {
  assert.equal(estimateDelivery({ lat: null, lng: null }, PLAZA_NUNOA), null);
  assert.equal(estimateDelivery({ ...PLAZA_ARMAS }, { lat: 200, lng: 0 }), null);
  assert.equal(estimateDelivery(null, PLAZA_NUNOA), null);
});
