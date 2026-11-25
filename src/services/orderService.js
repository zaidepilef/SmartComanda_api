import * as dishRepository from "../repositories/dishRepository.js";
import * as branchRepository from "../repositories/branchRepository.js";
import * as cashSessionRepository from "../repositories/cashSessionRepository.js";
import * as ingredientRepository from "../repositories/ingredientRepository.js";
import * as movementRepository from "../repositories/movementRepository.js";
import * as orderRepository from "../repositories/orderRepository.js";
import * as stockRepository from "../repositories/stockRepository.js";
import * as userRepository from "../repositories/userRepository.js";
import * as inventoryService from "./inventoryService.js";
import * as fifoService from "./fifoService.js";
import * as loyaltyService from "./loyaltyService.js";
import {
  CANCELLABLE_STATUSES,
  COLLECTABLE_PAYMENT_STATUSES,
  ORDER_PAYMENT_STATUSES,
  ORDER_STATUSES,
  isAppDeliveryOrder,
  isAppPickupOrder,
  isCustomerAppOrder,
  nextStatuses,
} from "../models/order.js";
import { USER_ROLES } from "../models/user.js";
import { withTransaction } from "../db/postgres.js";
import { can } from "../utils/permissions.js";
import {
  BadRequestError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from "../utils/errors.js";
import { actorRoles, isGlobalActor } from "../utils/tenantScope.js";
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

const MANAGER_ROLES = [USER_ROLES.SYSADMIN, USER_ROLES.OWNER, USER_ROLES.ADMIN];

/** Cajero o cocinero sin rol de gestión: opera solo en su sucursal asignada. */
function isBranchStaff(actor) {
  const roles = actorRoles(actor);
  return roles.length > 0 && !roles.some((role) => MANAGER_ROLES.includes(role));
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

  if (isBranchStaff(actor) && actor.branchId) {
    if (String(order.foodtruckId) !== String(actor.branchId)) {
      throw new NotFoundError("Order not found.");
    }
  }
}

export async function listOrders(actor, query = {}) {
  assertTenantActor(actor);

  const tenantId = isGlobalActor(actor) ? query.tenantId : actor.tenantId;
  let branchId = query.branchId;

  if (isBranchStaff(actor) && actor.branchId) {
    branchId = String(actor.branchId);
  } else if (branchId !== undefined) {
    const branch = await branchRepository.findBranchById(branchId);

    if (!branch || (!isGlobalActor(actor) && String(branch.tenantId) !== String(actor.tenantId))) {
      throw new BadRequestError("Branch not found in your tenant.");
    }
  }

  // El repartidor solo ve domicilios de la app, y en reparto solo los suyos.
  const isDriverOnly =
    actorRoles(actor).includes(USER_ROLES.DRIVER) && !can(actor, "order.status");

  return orderRepository.listOrders({
    tenantId,
    branchId,
    appDeliveryOnly: isDriverOnly ? true : query.appDeliveryOnly,
    driverId: isDriverOnly ? String(actor._id) : undefined,
    status: query.status,
    orderType: query.orderType,
    paymentStatus: query.paymentStatus,
    paymentMethod: query.paymentMethod,
    from: query.from,
    to: query.to,
    q: query.q,
    kitchen: query.kitchen,
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

/** Estados que tienen su propio endpoint (con motivo, repartidor o cobro). */
const DEDICATED_STATUS_ENDPOINTS = Object.freeze({
  [ORDER_STATUSES.CANCELLED]: "POST /api/orders/:id/cancel",
  [ORDER_STATUSES.REJECTED]: "POST /api/orders/:id/reject",
  [ORDER_STATUSES.OUT_FOR_DELIVERY]: "POST /api/orders/:id/dispatch",
});

export async function updateOrderStatus(actor, orderId, status) {
  const order = await getOrder(actor, orderId);

  if (status === ORDER_STATUSES.CANCELLED && !can(actor, "order.cancel")) {
    throw new ForbiddenError("Forbidden. Your role cannot cancel orders.");
  }

  if (DEDICATED_STATUS_ENDPOINTS[status]) {
    throw new BadRequestError(`Use ${DEDICATED_STATUS_ENDPOINTS[status]} for this change.`);
  }

  if (order.status === ORDER_STATUSES.OUT_FOR_DELIVERY) {
    throw new ConflictError("Use POST /api/orders/:id/deliver to collect and deliver this order.");
  }

  if (!nextStatuses(order).includes(status)) {
    throw new ConflictError(
      `Cannot transition order from "${order.status}" to "${status}".`
    );
  }

  if (
    isAppPickupOrder(order) &&
    order.paymentStatus !== ORDER_PAYMENT_STATUSES.PAID &&
    status === ORDER_STATUSES.PREPARING
  ) {
    throw new ConflictError("Pickup orders from the app must be charged before the kitchen starts them.");
  }

  const updated = await orderRepository.updateOrderStatus(orderId, status, actor._id);

  if (!updated) {
    throw new NotFoundError("Order not found.");
  }

  return updated;
}

async function resolveBranchPaymentMethod(branchId, paymentMethod) {
  const branch = await branchRepository.findBranchById(branchId);

  if (!branch) {
    throw new NotFoundError("Branch not found.");
  }

  const branchPaymentMethods = branch.paymentMethods ?? PAYMENT_METHODS;

  if (!branchPaymentMethods.includes(paymentMethod)) {
    throw new BadRequestError("Payment method not supported by this branch.");
  }

  return branch;
}

export async function payOrder(actor, orderId, paymentMethod) {
  const order = await getOrder(actor, orderId);

  if (isAppDeliveryOrder(order)) {
    throw new ConflictError("App delivery orders are collected by the driver on delivery.");
  }

  const branch = await resolveBranchPaymentMethod(order.foodtruckId, paymentMethod);

  const paid = await withTransaction(async (client) => {
    const locked = await orderRepository.lockOrder(client, orderId);

    if (
      !locked ||
      locked.status === ORDER_STATUSES.CANCELLED ||
      locked.status === ORDER_STATUSES.REJECTED
    ) {
      throw new ConflictError("Cancelled or rejected orders cannot be paid.");
    }

    if (!COLLECTABLE_PAYMENT_STATUSES.includes(locked.paymentStatus)) {
      throw new ConflictError("Only pending orders can be paid.");
    }

    const session = await cashSessionRepository.lockOpenByBranch(client, branch._id, order.tenantId);

    if (!session) {
      throw new ConflictError("No open cash session for this branch.");
    }

    const updated = await orderRepository.markPaid(client, locked._id, {
      paymentMethod,
      cashSessionId: session.id,
      paidBy: actor._id,
    });

    await cashSessionRepository.recordSale(client, session.id, {
      method: paymentMethod,
      amount: round(updated.total),
      count: 1,
    });

    return updated;
  });

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

/**
 * Anula un pedido con motivo. Si estaba cobrado, revierte su monto en la caja
 * donde se cobró (debe seguir abierta).
 */
export async function cancelOrder(actor, orderId, reason) {
  await getOrder(actor, orderId);

  return withTransaction(async (client) => {
    const order = await orderRepository.lockOrder(client, orderId);

    if (!CANCELLABLE_STATUSES.includes(order.status)) {
      throw new ConflictError(`Cannot cancel an order in status "${order.status}".`);
    }

    const wasPaid = order.paymentStatus === ORDER_PAYMENT_STATUSES.PAID;

    if (wasPaid) {
      if (!order.cashSessionId) {
        throw new ConflictError("This paid order has no cash session recorded; it cannot be reversed.");
      }

      const session = await cashSessionRepository.lockById(client, order.cashSessionId);

      if (!session || session.status !== "open") {
        throw new ConflictError("The cash session where this order was paid is already closed.");
      }

      await cashSessionRepository.recordSale(client, session.id, {
        method: order.paymentMethod,
        amount: -round(order.total),
        count: -1,
      });
    }

    return orderRepository.markCancelled(client, order._id, {
      reason,
      actorId: actor._id,
      refunded: wasPaid,
    });
  });
}

/**
 * El local rechaza un pedido de la app antes de prepararlo, con un motivo que
 * verá el cliente en el seguimiento.
 */
export async function rejectOrder(actor, orderId, reason) {
  await getOrder(actor, orderId);

  return withTransaction(async (client) => {
    const order = await orderRepository.lockOrder(client, orderId);

    if (!isCustomerAppOrder(order)) {
      throw new ConflictError("Only orders placed from the customer app can be rejected.");
    }

    if (order.status !== ORDER_STATUSES.NEW) {
      throw new ConflictError("Only new orders can be rejected; cancel it instead.");
    }

    if (order.paymentStatus === ORDER_PAYMENT_STATUSES.PAID) {
      throw new ConflictError("Paid orders cannot be rejected; cancel it instead.");
    }

    return orderRepository.markRejected(client, order._id, { reason, actorId: actor._id });
  });
}

function isManager(actor) {
  return actorRoles(actor).some((role) => MANAGER_ROLES.includes(role));
}

/** Un repartidor solo opera los pedidos que tiene asignados. */
function assertDriverOwnsOrder(actor, order) {
  if (!isManager(actor) && String(order.driverId) !== String(actor._id)) {
    throw new ForbiddenError("Forbidden. This delivery is assigned to another driver.");
  }
}

async function resolveDriver(order, driverId) {
  const driver = await userRepository.findUserById(driverId);

  if (
    !driver ||
    driver.status !== "active" ||
    !driver.roles.includes(USER_ROLES.DRIVER) ||
    String(driver.tenantId) !== String(order.tenantId) ||
    (driver.branchId && String(driver.branchId) !== String(order.foodtruckId))
  ) {
    throw new BadRequestError("Driver not found in this branch.");
  }

  return driver;
}

/**
 * Sale a reparto un domicilio listo. El repartidor se lo asigna a sí mismo; un
 * Encargado o superior puede indicar el repartidor.
 */
export async function dispatchOrder(actor, orderId, { driverId } = {}) {
  const order = await getOrder(actor, orderId);

  if (!isAppDeliveryOrder(order)) {
    throw new ConflictError("Only app delivery orders go out for delivery.");
  }

  let assignedDriverId = actor._id;

  if (driverId !== undefined) {
    if (!can(actor, "order.assign")) {
      throw new ForbiddenError("Forbidden. Your role cannot assign drivers.");
    }

    assignedDriverId = (await resolveDriver(order, driverId))._id;
  }

  return withTransaction(async (client) => {
    const locked = await orderRepository.lockOrder(client, orderId);

    if (locked.status !== ORDER_STATUSES.READY) {
      throw new ConflictError("Only ready orders can go out for delivery.");
    }

    return orderRepository.setStatus(client, locked._id, {
      status: ORDER_STATUSES.OUT_FOR_DELIVERY,
      actorId: actor._id,
      driverId: assignedDriverId,
    });
  });
}

/** Encargado o superior reasigna el repartidor de un domicilio listo o en reparto. */
export async function assignDriver(actor, orderId, driverId) {
  const order = await getOrder(actor, orderId);
  const driver = await resolveDriver(order, driverId);

  return withTransaction(async (client) => {
    const locked = await orderRepository.lockOrder(client, orderId);

    if (![ORDER_STATUSES.READY, ORDER_STATUSES.OUT_FOR_DELIVERY].includes(locked.status)) {
      throw new ConflictError("Only ready or out-for-delivery orders can be reassigned.");
    }

    return orderRepository.setDriver(client, locked._id, {
      driverId: driver._id,
      actorId: actor._id,
    });
  });
}

/**
 * Cobro con entrega: en una transacción registra el pago en la caja abierta de
 * la sucursal y marca el pedido como entregado.
 */
export async function deliverOrder(actor, orderId, { paymentMethod, cashReceived }) {
  const order = await getOrder(actor, orderId);

  if (!isAppDeliveryOrder(order)) {
    throw new ConflictError("Only app delivery orders are collected on delivery.");
  }

  assertDriverOwnsOrder(actor, order);

  // Domicilios cobrados en caja antes de existir el cobro contra entrega: solo se entregan.
  if (order.paymentStatus === ORDER_PAYMENT_STATUSES.PAID) {
    return deliverPrepaidOrder(actor, order);
  }

  if (!paymentMethod) {
    throw new BadRequestError("paymentMethod is required to collect this order.");
  }

  const branch = await resolveBranchPaymentMethod(order.foodtruckId, paymentMethod);

  const delivered = await withTransaction(async (client) => {
    const locked = await orderRepository.lockOrder(client, orderId);

    if (locked.status !== ORDER_STATUSES.OUT_FOR_DELIVERY) {
      throw new ConflictError("Only orders out for delivery can be delivered.");
    }

    if (!COLLECTABLE_PAYMENT_STATUSES.includes(locked.paymentStatus)) {
      throw new ConflictError("This order is already paid or voided.");
    }

    const total = round(locked.total);

    if (paymentMethod === "cash" && !(cashReceived >= total)) {
      throw new BadRequestError("cashReceived must cover the order total.");
    }

    const session = await cashSessionRepository.lockOpenByBranch(client, branch._id, locked.tenantId);

    if (!session) {
      throw new ConflictError("No open cash session for this branch. Ask the manager to open it.");
    }

    await orderRepository.markPaid(client, locked._id, {
      paymentMethod,
      cashSessionId: session.id,
      paidBy: actor._id,
      note: "collected_on_delivery",
    });

    await cashSessionRepository.recordSale(client, session.id, {
      method: paymentMethod,
      amount: total,
      count: 1,
    });

    return orderRepository.setStatus(client, locked._id, {
      status: ORDER_STATUSES.DELIVERED,
      actorId: actor._id,
    });
  });

  const result = {
    order: delivered,
    change: paymentMethod === "cash" ? round(cashReceived - delivered.total) : 0,
  };

  return withLoyaltyPoints(result, branch._id);
}

/** Entrega un domicilio que ya estaba pagado: no cobra, no exige caja ni toca sus totales. */
async function deliverPrepaidOrder(actor, order) {
  const delivered = await withTransaction(async (client) => {
    const locked = await orderRepository.lockOrder(client, order._id);

    if (locked.status !== ORDER_STATUSES.OUT_FOR_DELIVERY) {
      throw new ConflictError("Only orders out for delivery can be delivered.");
    }

    if (locked.paymentStatus !== ORDER_PAYMENT_STATUSES.PAID) {
      throw new ConflictError("The order payment changed. Reload and try again.");
    }

    return orderRepository.setStatus(client, locked._id, {
      status: ORDER_STATUSES.DELIVERED,
      actorId: actor._id,
    });
  });

  return withLoyaltyPoints({ order: delivered, change: 0 }, order.foodtruckId);
}

/** Suma los puntos del pedido entregado (una sola vez por pedido) a la respuesta. */
async function withLoyaltyPoints(result, branchId) {
  const pointsEarned = await loyaltyService.awardForOrder(result.order, {
    tenantId: result.order.tenantId,
    branchId,
  });

  if (pointsEarned !== null) {
    result.pointsEarned = pointsEarned;
  }

  return result;
}

/** El cobro con tarjeta fue rechazado en la puerta; el pedido sigue en reparto. */
export async function declinePayment(actor, orderId, note) {
  const order = await getOrder(actor, orderId);
  assertDriverOwnsOrder(actor, order);

  return withTransaction(async (client) => {
    const locked = await orderRepository.lockOrder(client, orderId);

    if (locked.status !== ORDER_STATUSES.OUT_FOR_DELIVERY) {
      throw new ConflictError("Only orders out for delivery can record a declined payment.");
    }

    if (!COLLECTABLE_PAYMENT_STATUSES.includes(locked.paymentStatus)) {
      throw new ConflictError("This order is already paid or voided.");
    }

    return orderRepository.markPaymentDeclined(client, locked._id, { actorId: actor._id, note });
  });
}

/** Reemplaza los ítems de un pedido pendiente que cocina aún no empezó. */
export async function correctOrder(actor, orderId, inputItems) {
  const order = await getOrder(actor, orderId);
  const { items, total } = await buildOrderItems(order.tenantId, order.foodtruckId, inputItems);

  return withTransaction(async (client) => {
    const locked = await orderRepository.lockOrder(client, orderId);

    if (
      locked.paymentStatus !== ORDER_PAYMENT_STATUSES.PENDING ||
      locked.status !== ORDER_STATUSES.NEW
    ) {
      throw new ConflictError("Only pending orders not yet in preparation can be corrected.");
    }

    return orderRepository.replaceItems(client, locked._id, {
      items,
      total,
      actorId: actor._id,
    });
  });
}

/** Resuelve platos y precios del servidor para los ítems pedidos. */
async function buildOrderItems(tenantId, branchId, inputItems) {
  const dishIds = inputItems.map((item) => item.dishId);
  const dishes = await dishRepository.findDishesByIds(dishIds, { tenantId });

  if (dishes.length !== new Set(dishIds.map(String)).size) {
    throw new BadRequestError("An item references a dish that does not exist.");
  }

  const dishesById = new Map(dishes.map((dish) => [String(dish._id), dish]));
  let total = 0;

  const items = inputItems.map((item, index) => {
    const dish = dishesById.get(String(item.dishId));

    if (!dish) {
      throw new BadRequestError(`Item ${index + 1} references a dish outside your tenant.`);
    }

    const price = resolveDishPrice(dish, branchId);
    total += price * item.quantity;

    return {
      dishId: dish._id,
      name: dish.name,
      price,
      quantity: item.quantity,
      stockApplied: false,
    };
  });

  return { items, total: round(total), dishesById };
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

  // Verificación temprana para no consumir un número de pedido si no hay caja.
  if (
    paymentMethod !== undefined &&
    !(await cashSessionRepository.findOpenByBranch(branch._id, tenantId))
  ) {
    throw new ConflictError("No open cash session for this branch.");
  }

  const number = await branchRepository.nextOrderNumber(branch._id);

  if (number === null) {
    throw new NotFoundError("Branch not found.");
  }

  const { items, total, dishesById } = await buildOrderItems(
    tenantId,
    branch._id,
    orderInput.items
  );
  const warnings = [];

  const order =
    paymentMethod === undefined
      ? await createOrderDocument(tenantId, branch, orderInput, items, total, number)
      : await withTransaction(async (client) => {
          const session = await cashSessionRepository.lockOpenByBranch(client, branch._id, tenantId);

          if (!session) {
            throw new ConflictError("No open cash session for this branch.");
          }

          const created = await createOrderDocument(
            tenantId,
            branch,
            orderInput,
            items,
            total,
            number,
            { client, cashSessionId: session.id, paidBy: actor._id }
          );

          await cashSessionRepository.recordSale(client, session.id, {
            method: paymentMethod,
            amount: total,
            count: 1,
          });

          return created;
        });

  let pointsEarned = null;

  if (paymentMethod !== undefined) {
    pointsEarned = await loyaltyService.awardForOrder(order, {
      tenantId,
      branchId: branch._id,
    });
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

async function createOrderDocument(
  tenantId,
  branch,
  orderInput,
  items,
  total,
  number,
  { client, cashSessionId, paidBy } = {}
) {
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
    cashSessionId,
    paidBy,
    statusHistory: [
      {
        status: ORDER_STATUSES.NEW,
        at: new Date(),
        by: branch._id,
      },
    ],
  }, client);
}
/** Resume los pedidos a domicilio: promedios, % fuera de rango y tramos de distancia. */
export function summarizeDeliveryOrders(orders) {
  const withEstimate = orders.filter((order) => order.deliveryDistanceKm !== null);
  const average = (values) =>
    values.length === 0
      ? null
      : Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 100) / 100;

  const buckets = orderRepository.DELIVERY_DISTANCE_BUCKETS.map((bucket) => ({
    key: bucket.key,
    count: withEstimate.filter(
      (order) =>
        order.deliveryDistanceKm >= bucket.min &&
        (bucket.max === null || order.deliveryDistanceKm < bucket.max)
    ).length,
  }));

  const outOfRange = withEstimate.filter((order) => order.deliveryOutOfRange).length;

  return {
    totalOrders: orders.length,
    withEstimate: withEstimate.length,
    avgDistanceKm: average(withEstimate.map((order) => order.deliveryDistanceKm)),
    avgEtaMinutes: average(withEstimate.map((order) => order.deliveryEtaMinutes)),
    outOfRangeCount: outOfRange,
    outOfRangePct:
      withEstimate.length === 0 ? null : Math.round((outOfRange / withEstimate.length) * 1000) / 10,
    buckets,
  };
}

/** Reporte de análisis de delivery por sucursal y periodo (ver spec delivery-analytics). */
export async function getDeliveryAnalytics(actor, query = {}) {
  assertTenantActor(actor);

  const tenantId = isGlobalActor(actor) ? query.tenantId : actor.tenantId;
  let branch = null;

  if (query.branchId !== undefined) {
    branch = await branchRepository.findBranchById(query.branchId);

    if (!branch || (!isGlobalActor(actor) && String(branch.tenantId) !== String(actor.tenantId))) {
      throw new BadRequestError("Branch not found in your tenant.");
    }
  }

  const orders = await orderRepository.listDeliveryOrders({
    tenantId,
    branchId: query.branchId,
    from: query.from,
    to: query.to,
  });

  return {
    branch: branch
      ? {
          _id: branch._id,
          name: branch.name,
          lat: branch.lat,
          lng: branch.lng,
          deliveryMaxKm: branch.deliveryMaxKm,
          deliveryMaxMinutes: branch.deliveryMaxMinutes,
          deliveryAvgSpeedKmh: branch.deliveryAvgSpeedKmh,
        }
      : null,
    summary: summarizeDeliveryOrders(orders),
    orders: orders.map((order) => ({
      _id: order._id,
      number: order.number,
      createdAt: order.createdAt,
      status: order.status,
      paymentStatus: order.paymentStatus,
      clientName: order.clientName,
      total: order.total,
      deliveryAddress: order.deliveryAddress,
      deliveryReference: order.deliveryReference,
      deliveryLat: order.deliveryLat,
      deliveryLng: order.deliveryLng,
      deliveryDistanceKm: order.deliveryDistanceKm,
      deliveryEtaMinutes: order.deliveryEtaMinutes,
      deliveryOutOfRange: order.deliveryOutOfRange,
    })),
  };
}
