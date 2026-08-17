import * as stockRepository from "../repositories/stockRepository.js";
import * as movementRepository from "../repositories/movementRepository.js";
import * as ingredientRepository from "../repositories/ingredientRepository.js";
import * as branchRepository from "../repositories/branchRepository.js";
import * as fifoService from "./fifoService.js";
import { BadRequestError, ForbiddenError, NotFoundError } from "../utils/errors.js";
import { isGlobalActor } from "../utils/tenantScope.js";

const ROUND_SCALE = 4;

function roundQuantity(value) {
  return Math.round(value * 10 ** ROUND_SCALE) / 10 ** ROUND_SCALE;
}

function resolveTenantId(actor, requestedTenantId) {
  if (isGlobalActor(actor)) {
    return requestedTenantId ?? null;
  }
  return actor.tenantId ?? null;
}

function assertCanManage(actor) {
  if (!["owner", "admin"].includes(actor?.role)) {
    throw new ForbiddenError("Forbidden. Owner or admin role required.");
  }
}

async function assertTenantScope(actor, tenantId) {
  if (!isGlobalActor(actor) && String(tenantId) !== String(actor.tenantId)) {
    throw new ForbiddenError("Forbidden. Cannot access inventory outside your own tenant.");
  }
}

async function assertBranchExists(tenantId, branchId) {
  const branch = await branchRepository.findBranchById(branchId);

  if (!branch || String(branch.tenantId) !== String(tenantId)) {
    throw new NotFoundError("Branch not found.");
  }
}

export async function resolveStockPool(actor, branchId, requestedTenantId, ingredientId = null) {
  const tenantId = resolveTenantId(actor, requestedTenantId);

  if (!tenantId) {
    throw new ForbiddenError("Forbidden. A tenant is required.");
  }

  if (!branchId) {
    throw new BadRequestError("branchId is required.");
  }

  return {
    tenantId,
    ingredientId,
    branchId,
  };
}

export async function listStock(actor, { tenantId, branchId } = {}) {
  const resolvedTenantId = resolveTenantId(actor, tenantId);

  if (!resolvedTenantId) {
    throw new ForbiddenError("Forbidden. A tenant is required.");
  }

  await assertTenantScope(actor, resolvedTenantId);

  const filter = { tenantId: resolvedTenantId };

  if (branchId !== undefined) {
    filter.branchId = branchId;
  }

  const batches = await stockRepository.listBatches(filter);
  const ingredientIds = [...new Set(batches.map((batch) => String(batch.ingredientId)))];
  const ingredients = await ingredientRepository.findIngredientsByIds(ingredientIds, {
    tenantId: resolvedTenantId,
  });
  const ingredientsById = new Map(
    ingredients.map((ingredient) => [String(ingredient._id), ingredient])
  );

  const grouped = new Map();

  for (const batch of batches) {
    const key = `${String(batch.branchId)}:${String(batch.ingredientId)}`;
    const entry = grouped.get(key) ?? {
      tenantId: resolvedTenantId,
      branchId: batch.branchId,
      ingredientId: batch.ingredientId,
      quantity: 0,
      totalValue: 0,
      batchCount: 0,
    };

    entry.quantity = roundQuantity(entry.quantity + (batch.quantity ?? 0));
    entry.totalValue += (batch.quantity ?? 0) * (batch.unitCost ?? 0);
    entry.batchCount += 1;
    grouped.set(key, entry);
  }

  return [...grouped.values()].map((entry) => ({
    ...entry,
    unitCost: entry.quantity > 0 ? entry.totalValue / entry.quantity : 0,
    ingredient: ingredientsById.get(String(entry.ingredientId)) ?? null,
  }));
}

export async function adjustStock(actor, input) {
  assertCanManage(actor);

  const tenantId = resolveTenantId(actor, input.tenantId);

  if (!tenantId) {
    throw new ForbiddenError("Forbidden. A tenant is required.");
  }

  await assertTenantScope(actor, tenantId);
  await assertBranchExists(tenantId, input.branchId);

  const ingredient = await ingredientRepository.findIngredientById(input.ingredientId);

  if (!ingredient || String(ingredient.tenantId) !== String(tenantId)) {
    throw new NotFoundError("Ingredient not found.");
  }

  const pool = await resolveStockPool(actor, input.branchId, tenantId, input.ingredientId);

  if (input.type === "entry") {
    if (input.unitCost === undefined || input.unitCost === null) {
      throw new BadRequestError("unitCost is required for stock entries.");
    }

    if (input.unitCost <= 0) {
      throw new BadRequestError("unitCost must be greater than zero.");
    }

    const batch = await stockRepository.createBatch({
      tenantId: pool.tenantId,
      branchId: pool.branchId,
      ingredientId: input.ingredientId,
      quantity: roundQuantity(input.quantity),
      unitCost: input.unitCost,
    });

    const movement = await movementRepository.createMovement({
      tenantId,
      ingredientId: input.ingredientId,
      branchId: pool.branchId,
      quantity: roundQuantity(input.quantity),
      unitCost: input.unitCost,
      batchId: batch._id,
      type: "entry",
      reason: input.reason,
      createdBy: actor._id,
    });

    return { batch, movement };
  }

  const outcome = await fifoService.withWriteTransaction(async (session) => {
    return fifoService.consumeFifo(
      {
        tenantId: pool.tenantId,
        branchId: pool.branchId,
        ingredientId: input.ingredientId,
        quantity: input.quantity,
      },
      { session }
    );
  });

  const consumption =
    outcome.transactionUnsupported
      ? await fifoService.consumeFifo({
          tenantId: pool.tenantId,
          branchId: pool.branchId,
          ingredientId: input.ingredientId,
          quantity: input.quantity,
        })
      : outcome;

  if (!consumption.applied) {
    throw new BadRequestError(
      `Insufficient stock. Available: ${consumption.available} ${ingredient.unit}.`
    );
  }

  const movement = await movementRepository.createMovement({
    tenantId,
    ingredientId: input.ingredientId,
    branchId: pool.branchId,
    quantity: roundQuantity(-input.quantity),
    batches: consumption.breakdown,
    type: "exit",
    reason: input.reason,
    createdBy: actor._id,
  });

  return { movement, batches: consumption.breakdown };
}

export async function listMovements(actor, { tenantId, ingredientId, branchId } = {}) {
  const resolvedTenantId = resolveTenantId(actor, tenantId);

  if (!resolvedTenantId) {
    throw new ForbiddenError("Forbidden. A tenant is required.");
  }

  await assertTenantScope(actor, resolvedTenantId);

  const filter = { tenantId: resolvedTenantId };

  if (ingredientId !== undefined) {
    filter.ingredientId = ingredientId;
  }

  if (branchId !== undefined) {
    filter.branchId = branchId;
  }

  return movementRepository.listMovements(filter);
}