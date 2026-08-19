import test from "node:test";
import assert from "node:assert/strict";
import { computeFifoCost, planFifoConsumption } from "../src/services/fifoService.js";

function batch(id, quantity, unitCost) {
  return { _id: id, quantity, unitCost };
}

test("planFifoConsumption consumes from the oldest batch first", () => {
  const plan = planFifoConsumption(
    [batch("a", 1500, 300), batch("b", 450, 303)],
    300
  );

  assert.equal(plan.fulfilled, true);
  assert.deepEqual(plan.breakdown, [{ batchId: "a", quantity: 300, unitCost: 300 }]);
});

test("planFifoConsumption crosses batches when the oldest is exhausted", () => {
  const plan = planFifoConsumption(
    [batch("a", 1500, 300), batch("b", 450, 303)],
    1800
  );

  assert.equal(plan.fulfilled, true);
  assert.deepEqual(plan.breakdown, [
    { batchId: "a", quantity: 1500, unitCost: 300 },
    { batchId: "b", quantity: 300, unitCost: 303 },
  ]);
});

test("planFifoConsumption reports shortfall with remaining quantity", () => {
  const plan = planFifoConsumption([batch("a", 100, 300)], 250);

  assert.equal(plan.fulfilled, false);
  assert.equal(plan.remaining, 150);
  assert.deepEqual(plan.breakdown, [{ batchId: "a", quantity: 100, unitCost: 300 }]);
});

test("planFifoConsumption skips empty batches", () => {
  const plan = planFifoConsumption([batch("a", 0, 300), batch("b", 10, 400)], 5);

  assert.equal(plan.fulfilled, true);
  assert.deepEqual(plan.breakdown, [{ batchId: "b", quantity: 5, unitCost: 400 }]);
});

test("computeFifoCost uses oldest batch cost", () => {
  const cost = computeFifoCost([batch("a", 1500, 300), batch("b", 450, 303)], 1);

  assert.equal(cost, 300);
});

test("computeFifoCost crosses batches with weighted cost", () => {
  const cost = computeFifoCost([batch("a", 1500, 300), batch("b", 450, 303)], 1800);

  assert.equal(cost, 1500 * 300 + 300 * 303);
});

test("computeFifoCost falls back to reference cost for the shortfall", () => {
  const cost = computeFifoCost([batch("a", 100, 300)], 250, 310);

  assert.equal(cost, 100 * 300 + 150 * 310);
});