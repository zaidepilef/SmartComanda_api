import * as dishRepository from "../repositories/dishRepository.js";
import * as branchRepository from "../repositories/branchRepository.js";
import * as ingredientRepository from "../repositories/ingredientRepository.js";
import * as movementRepository from "../repositories/movementRepository.js";
import * as orderRepository from "../repositories/orderRepository.js";
import * as stockRepository from "../repositories/stockRepository.js";
import * as inventoryService from "./inventoryService.js";
import * as fifoService from "./fifoService.js";
import { BadRequestError, ForbiddenError, NotFoundError } from "../utils/errors.js";
import { isGlobalActor } from "../utils/tenantScope.js";

const ROUND_SCALE = 4;

function round(value) {
  return Math.round(value * 10 ** ROUND_SCALE) / 10 ** ROUND_SCALE;
}

class InsufficientStockError extends Error {
  constructor(ingredientId, ingredientName, available, needed) {
    super("Insufficient stock.");
    this.ingredientId = ingredientId;
    this.ingredientName = ingredientName;
    this.available = available;
    this.needed = needed;
  }
}

function resolveDishPrice(dish, branchId) {
  const override = (dish.branchPrices ?? []).find(
    (entry) => String(entry.branchId) === String(branchId)
  );
  return override ? override.price : dish.salePrice;
}

async function assertBranchAccess(actor, branchId) {
  const branch = await branchRepository.findBranchById(branchId);

  if (!branch) {
    throw new NotFoundError("Branch not found.");
  }

  if (!isGlobalActor(actor) && String(branch.tenantId) !== String(actor.tenantId)) {
    throw new ForbiddenError("Forbidden. Cannot create an order for a branch outside your tenant.");
  }

  return branch;
}

function assertTenantActor(actor) {
  if (!actor?.tenantId && !isGlobalActor(actor)) {
    throw new ForbiddenError("Forbidden. A tenant is required.");
  }
}

export async function createOrder(actor, orderInput) {
  assertTenantActor(actor);

  const branch = await assertBranchAccess(actor, orderInput.foodtruckId);
  const tenantId = isGlobalActor(actor) ? branch.tenantId : actor.tenantId;

  const dishIds = orderInput.items.map((item) => item.dishId);
  const dishes = await dishRepository.findDishesByIds(dishIds, { tenantId });

  if (dishes.length !== new Set(dishIds.map(String)).size) {
    throw new BadRequestError("An item references a dish that does not exist.");
  }

  const dishesById = new Map(dishes.map((dish) => [String(dish._id), dish]));
  const warnings = [];
  let total = 0;

  const items = orderInput.items.map((item, index) => {
    const dish = dishesById.get(String(item.dishId));

    if (!dish) {
      throw new BadRequestError(`Item ${index + 1} references a dish outside your tenant.`);
    }

    const price = resolveDishPrice(dish, branch._id);

    total += price * item.quantity;

    return {
      dishId: dish._id,
      name: dish.name,
      price,
      quantity: item.quantity,
      stockApplied: false,
    };
  });

  const order = await createOrderDocument(tenantId, branch, orderInput, items, round(total));

  const pool = await inventoryService.resolveStockPool(actor, branch._id, tenantId);
  let stockRequested = false;

  for (let index = 0; index < orderInput.items.length; index += 1) {
    const item = orderInput.items[index];

    if (!item.stockApplied) {
      continue;
    }

    stockRequested = true;

    const dish = dishesById.get(String(item.dishId));
    const deductionResult = await tryDeductDishStock(
      pool,
      dish,
      item.quantity,
      tenantId,
      actor,
      order._id
    );

    items[index].stockApplied = deductionResult.applied;

    if (!deductionResult.applied) {
      warnings.push({
        itemIndex: index,
        dishId: dish._id,
        dishName: dish.name,
        missing: deductionResult.missing,
      });
    }
  }

  if (stockRequested) {
    await orderRepository.updateOrderItems(order._id, items);
  }

  return { order: { ...order, items }, warnings };
}

async function tryDeductDishStock(pool, dish, quantity, tenantId, actor, orderId) {
  const ingredientIds = dish.recipe.map((line) => line.ingredientId);
  const ingredients = await ingredientRepository.findIngredientsByIds(ingredientIds, {
    tenantId,
  });

  const ingredientsById = new Map(
    ingredients.map((ingredient) => [String(ingredient._id), ingredient])
  );

  const required = dish.recipe.map((line) => {
    const ingredient = ingredientsById.get(String(line.ingredientId));

    if (!ingredient) {
      throw new BadRequestError("Dish recipe references a missing ingredient.");
    }

    return {
      ingredient,
      needed: line.quantity * quantity,
    };
  });

  const missing = [];

  for (const { ingredient, needed } of required) {
    const batches = await stockRepository.listBatches({
      tenantId: pool.tenantId,
      branchId: pool.branchId,
      ingredientId: ingredient._id,
    });

    const available = batches.reduce((acc, batch) => acc + (batch.quantity ?? 0), 0);

    if (available + 1e-9 < needed) {
      missing.push({
        ingredientId: ingredient._id,
        ingredientName: ingredient.name,
        available,
        needed: round(needed),
      });
    }
  }

  if (missing.length > 0) {
    return { applied: false, missing };
  }

  const consumeAll = async (session) => {
    const deductions = [];

    for (const { ingredient, needed } of required) {
      const result = await fifoService.consumeFifo(
        {
          tenantId: pool.tenantId,
          branchId: pool.branchId,
          ingredientId: ingredient._id,
          quantity: needed,
        },
        { session }
      );

      if (!result.applied) {
        throw new InsufficientStockError(
          String(ingredient._id),
          ingredient.name,
          result.available,
          round(needed)
        );
      }

      deductions.push({ ingredient, needed, result });
    }

    return deductions;
  };

  let deductions;

  const outcome = await fifoService.withWriteTransaction(consumeAll);

  if (outcome.transactionUnsupported) {
    try {
      deductions = await consumeAll(null);
    } catch (error) {
      if (error instanceof InsufficientStockError) {
        return {
          applied: false,
          missing: [
            {
              ingredientId: error.ingredientId,
              ingredientName: error.ingredientName,
              available: error.available,
              needed: error.needed,
            },
          ],
        };
      }
      throw error;
    }
  } else {
    deductions = outcome;
  }

  for (const { ingredient, needed, result } of deductions) {
    await movementRepository.createMovement({
      tenantId: pool.tenantId,
      ingredientId: ingredient._id,
      branchId: pool.branchId,
      quantity: round(-needed),
      batches: result.breakdown,
      type: "sale",
      reason: `Venta: ${dish.name}`,
      orderId,
      createdBy: actor._id,
    });
  }

  return { applied: true, missing: [] };
}

async function createOrderDocument(tenantId, branch, orderInput, items, total) {
  return orderRepository.createOrder({
    tenantId,
    foodtruckId: branch._id,
    status: "pending",
    clientContact: orderInput.clientContact,
    items,
    total: round(total),
  });
}