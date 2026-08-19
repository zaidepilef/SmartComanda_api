import * as dishRepository from "../repositories/dishRepository.js";
import * as branchRepository from "../repositories/branchRepository.js";
import * as cashSessionRepository from "../repositories/cashSessionRepository.js";
import * as ingredientRepository from "../repositories/ingredientRepository.js";
import * as movementRepository from "../repositories/movementRepository.js";
import * as orderRepository from "../repositories/orderRepository.js";
import * as stockRepository from "../repositories/stockRepository.js";
import * as inventoryService from "./inventoryService.js";
import * as fifoService from "./fifoService.js";
import * as loyaltyService from "./loyaltyService.js";
import {
  ORDER_STATUSES,
  ORDER_STATUS_TRANSITIONS,
} from "../models/order.js";
import {
  BadRequestError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from "../utils/errors.js";
import { isGlobalActor } from "../utils/tenantScope.js";
import { PAYMENT_METHODS } from "../utils/paymentMethods.js";

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

async function assertOrderAccess(actor, order) {
  const orderTenantId = String(order.tenantId);
  const actorTenantId = actor.tenantId ? String(actor.tenantId) : null;

  if (isGlobalActor(actor)) {
    return;
  }

  if (actorTenantId !== orderTenantId) {
    throw new NotFoundError("Order not found.");
  }

  if (actor.role === "cashier" && actor.branchId) {
    if (String(order.foodtruckId) !== String(actor.branchId)) {
      throw new NotFoundError("Order not found.");
    }
  }
}

export async function listOrders(actor, query = {}) {
  assertTenantActor(actor);

  const tenantId = isGlobalActor(actor) ? query.tenantId : actor.tenantId;
  let branchId = query.branchId;

  if (actor.role === "cashier") {
    if (!actor.branchId) {
      throw new BadRequestError("Cashier must be assigned to a branch.");
    }

    branchId = String(actor.branchId);
  } else if (branchId !== undefined) {
    const branch = await branchRepository.findBranchById(branchId);

    if (!branch || (!isGlobalActor(actor) && String(branch.tenantId) !== String(actor.tenantId))) {
      throw new BadRequestError("Branch not found in your tenant.");
    }
  }

  return orderRepository.listOrders({
    tenantId,
    branchId,
    status: query.status,
    orderType: query.orderType,
    paymentStatus: query.paymentStatus,
    paymentMethod: query.paymentMethod,
    from: query.from,
    to: query.to,
    q: query.q,
    limit: query.limit,
    offset: query.offset,
  });
}

export async function getOrder(actor, orderId) {
  const tenantId = isGlobalActor(actor) ? undefined : actor.tenantId;

  const order = await orderRepository.findOrderById(orderId, tenantId);

  if (!order) {
    throw new NotFoundError("Order not found.");
  }

  await assertOrderAccess(actor, order);

  return order;
}

export async function updateOrderStatus(actor, orderId, status) {
  const order = await getOrder(actor, orderId);

  const allowed = ORDER_STATUS_TRANSITIONS[order.status] ?? [];

  if (!allowed.includes(status)) {
    throw new ConflictError(
      `Cannot transition order from "${order.status}" to "${status}".`
    );
  }

  const updated = await orderRepository.updateOrderStatus(orderId, status, actor._id);

  if (!updated) {
    throw new NotFoundError("Order not found.");
  }

  return updated;
}

export async function payOrder(actor, orderId, paymentMethod) {
  const order = await getOrder(actor, orderId);

  if (order.paymentStatus !== "pending") {
    throw new ConflictError("Only pending orders can be paid.");
  }

  const branch = await branchRepository.findBranchById(order.foodtruckId);

  if (!branch) {
    throw new NotFoundError("Branch not found.");
  }

  const branchPaymentMethods = branch.paymentMethods ?? PAYMENT_METHODS;

  if (!branchPaymentMethods.includes(paymentMethod)) {
    throw new BadRequestError("Payment method not supported by this branch.");
  }

  const openSession = await cashSessionRepository.findOpenByBranch(branch._id, order.tenantId);

  if (!openSession) {
    throw new ConflictError("No open cash session for this branch.");
  }

  const paid = await orderRepository.payOrder(orderId, paymentMethod);

  if (!paid) {
    throw new ConflictError("Order is not pending.");
  }

  await cashSessionRepository.incrementTotals(
    branch._id,
    order.tenantId,
    paymentMethod,
    round(paid.total)
  );

  const pointsEarned = await loyaltyService.awardForOrder(paid, {
    tenantId: order.tenantId,
    branchId: branch._id,
  });

  const result = { order: paid };

  if (pointsEarned !== null) {
    result.pointsEarned = pointsEarned;
  }

  return result;
}

export async function createOrder(actor, orderInput) {
  assertTenantActor(actor);

  const branch = await assertBranchAccess(actor, orderInput.foodtruckId);
  const tenantId = isGlobalActor(actor) ? branch.tenantId : actor.tenantId;

  const paymentMethod = orderInput.paymentMethod;
  const branchPaymentMethods = branch.paymentMethods ?? PAYMENT_METHODS;

  if (paymentMethod !== undefined && !branchPaymentMethods.includes(paymentMethod)) {
    throw new BadRequestError("Payment method not supported by this branch.");
  }

  let openSession = null;

  if (paymentMethod !== undefined) {
    openSession = await cashSessionRepository.findOpenByBranch(branch._id, tenantId);

    if (!openSession) {
      throw new ConflictError("No open cash session for this branch.");
    }
  }

  const number = await branchRepository.nextOrderNumber(branch._id);

  if (number === null) {
    throw new NotFoundError("Branch not found.");
  }

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

  const order = await createOrderDocument(tenantId, branch, orderInput, items, round(total), number);

  let pointsEarned = null;

  if (paymentMethod !== undefined) {
    pointsEarned = await loyaltyService.awardForOrder(order, {
      tenantId,
      branchId: branch._id,
    });

    const updated = await cashSessionRepository.incrementTotals(
      branch._id,
      tenantId,
      paymentMethod,
      round(total)
    );

    if (!updated) {
      console.warn(
        `Cash session for branch ${branch._id} closed before order ${order._id} could be recorded.`
      );
    }
  }

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

  const result = { order: { ...order, items }, warnings };

  if (pointsEarned !== null) {
    result.pointsEarned = pointsEarned;
  }

  return result;
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

async function createOrderDocument(tenantId, branch, orderInput, items, total, number) {
  const paymentMethod = orderInput.paymentMethod;

  return orderRepository.createOrder({
    tenantId,
    foodtruckId: branch._id,
    status: ORDER_STATUSES.NEW,
    number,
    orderType: orderInput.orderType ?? "takeaway",
    paymentStatus: paymentMethod !== undefined ? "paid" : "pending",
    paymentMethod,
    clientContact: orderInput.clientContact,
    items,
    total: round(total),
    statusHistory: [
      {
        status: ORDER_STATUSES.NEW,
        at: new Date(),
        by: branch._id,
      },
    ],
  });
}