import test from "node:test";
import assert from "node:assert/strict";
import { adjustStockSchema } from "../src/validation/inventorySchemas.js";
import { listDishesQuerySchema } from "../src/validation/dishSchemas.js";
import { createIngredientSchema } from "../src/validation/ingredientSchemas.js";

const ID = "64b000000000000000000000";

test("adjustStockSchema requires branchId", () => {
  const result = adjustStockSchema.safeParse({
    tenantId: ID,
    ingredientId: ID,
    type: "entry",
    quantity: 10,
    unitCost: 300,
    reason: "Compra",
  });

  assert.equal(result.success, false);
});

test("adjustStockSchema requires unitCost for entries", () => {
  const result = adjustStockSchema.safeParse({
    tenantId: ID,
    ingredientId: ID,
    branchId: ID,
    type: "entry",
    quantity: 10,
    reason: "Compra",
  });

  assert.equal(result.success, false);
  assert.match(result.error.issues[0].message, /unitCost/);
});

test("adjustStockSchema rejects unitCost on exits", () => {
  const result = adjustStockSchema.safeParse({
    tenantId: ID,
    ingredientId: ID,
    branchId: ID,
    type: "exit",
    quantity: 10,
    unitCost: 300,
    reason: "Merma",
  });

  assert.equal(result.success, false);
});

test("adjustStockSchema accepts a valid entry with unitCost", () => {
  const result = adjustStockSchema.safeParse({
    tenantId: ID,
    ingredientId: ID,
    branchId: ID,
    type: "entry",
    quantity: 10,
    unitCost: 300,
    reason: "Compra",
  });

  assert.equal(result.success, true);
});

test("adjustStockSchema accepts a valid exit without unitCost", () => {
  const result = adjustStockSchema.safeParse({
    tenantId: ID,
    ingredientId: ID,
    branchId: ID,
    type: "exit",
    quantity: 10,
    reason: "Merma",
  });

  assert.equal(result.success, true);
});

test("adjustStockSchema requires a reason", () => {
  const result = adjustStockSchema.safeParse({
    tenantId: ID,
    ingredientId: ID,
    branchId: ID,
    type: "entry",
    quantity: 10,
    unitCost: 300,
  });

  assert.equal(result.success, false);
});

test("listDishesQuerySchema accepts branchId", () => {
  const result = listDishesQuerySchema.safeParse({ branchId: ID });

  assert.equal(result.success, true);
});

test("createIngredientSchema accepts missing unitCost (reference)", () => {
  const result = createIngredientSchema.safeParse({
    tenantId: ID,
    name: "Tomate",
    unit: "gramos",
    dimension: "mass",
  });

  assert.equal(result.success, true);
});