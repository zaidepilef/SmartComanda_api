import * as stockRepository from "../repositories/stockRepository.js";
import * as movementRepository from "../repositories/movementRepository.js";
import * as ingredientRepository from "../repositories/ingredientRepository.js";
import * as tenantRepository from "../repositories/tenantRepository.js";
import { BadRequestError, ConflictError, ForbiddenError, NotFoundError } from "../utils/errors.js";
import { getTenantFilter, isGlobalActor } from "../utils/tenantScope.js";

const WAREHOUSE_MODES = Object.freeze(["shared", "per_branch"]);
const ADJUSTMENT_TYPES = Object.freeze(["entry", "exit"]);
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

export async function getWarehouseMode(actor, requestedTenantId) {
  const tenantId = resolveTenantId(actor, requestedTenantId);

  if (!tenantId) {
    throw new ForbiddenError("Forbidden. A tenant is required.");
  }

  await assertTenantScope(actor, tenantId);

  const tenant = await tenantRepository.findTenantById(tenantId);

  if (!tenant) {
    throw new NotFoundError("Tenant not found.");
  }

  return { warehouseMode: tenant.warehouseMode ?? "shared" };
}

export async function setWarehouseMode(actor, requestedTenantId, warehouseMode) {
  if (actor?.role !== "owner" && !isGlobalActor(actor)) {
    throw new ForbiddenError("Forbidden. Owner role required.");
  }

  const tenantId = resolveTenantId(actor, requestedTenantId);

  if (!tenantId) {
    throw new ForbiddenError("Forbidden. A tenant is required.");
  }

  await assertTenantScope(actor, tenantId);

  if (!WAREHOUSE_MODES.includes(warehouseMode)) {
    throw new BadRequestError("warehouseMode must be shared or per_branch.");
  }

  const existingStock = await stockRepository.countStocksForTenant(tenantId);

  if (existingStock > 0) {
    throw new ConflictError(
      "Cannot change the warehouse mode while stock records exist. Clear stock first."
    );
  }

  return tenantRepository.updateTenantWarehouseMode(tenantId, warehouseMode);
}

export async function resolveStockPool(actor, branchId, requestedTenantId, ingredientId = null) {
  const tenantId = resolveTenantId(actor, requestedTenantId);

  if (!tenantId) {
    throw new ForbiddenError("Forbidden. A tenant is required.");
  }

  const tenant = await tenantRepository.findTenantById(tenantId);

  if (!tenant) {
    throw new NotFoundError("Tenant not found.");
  }

  const mode = tenant.warehouseMode ?? "shared";

  return {
    tenantId,
    ingredientId,
    branchId: mode === "per_branch" ? branchId : null,
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

  const stocks = await stockRepository.listStocks(filter);
  const ingredientIds = stocks.map((stock) => stock.ingredientId);
  const ingredients = await ingredientRepository.findIngredientsByIds(ingredientIds, {
    tenantId: resolvedTenantId,
  });
  const ingredientsById = new Map(
    ingredients.map((ingredient) => [String(ingredient._id), ingredient])
  );

  return stocks.map((stock) => ({
    ...stock,
    ingredient: ingredientsById.get(String(stock.ingredientId)) ?? null,
  }));
}

export async function adjustStock(actor, input) {
  assertCanManage(actor);

  const tenantId = resolveTenantId(actor, input.tenantId);

  if (!tenantId) {
    throw new ForbiddenError("Forbidden. A tenant is required.");
  }

  await assertTenantScope(actor, tenantId);

  if (!ADJUSTMENT_TYPES.includes(input.type)) {
    throw new BadRequestError("type must be entry or exit.");
  }

  if (input.quantity <= 0) {
    throw new BadRequestError("quantity must be greater than zero.");
  }

  const ingredient = await ingredientRepository.findIngredientById(input.ingredientId);

  if (!ingredient || String(ingredient.tenantId) !== String(tenantId)) {
    throw new NotFoundError("Ingredient not found.");
  }

  const pool = await resolveStockPool(actor, input.branchId, tenantId, input.ingredientId);

  if (pool.branchId !== null && !input.branchId) {
    throw new BadRequestError("branchId is required in per_branch warehouse mode.");
  }

  const signedChange = input.type === "exit" ? -input.quantity : input.quantity;
  const adjusted = await stockRepository.adjustStock(pool, signedChange);

  await movementRepository.createMovement({
    tenantId,
    ingredientId: input.ingredientId,
    branchId: pool.branchId,
    quantity: roundQuantity(signedChange),
    type: input.type,
    reason: input.reason,
    createdBy: actor._id,
  });

  return adjusted;
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
