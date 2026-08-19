import * as branchRepository from "../repositories/branchRepository.js";
import * as dishRepository from "../repositories/dishRepository.js";
import * as orderRepository from "../repositories/orderRepository.js";
import * as tenantRepository from "../repositories/tenantRepository.js";
import * as customerService from "./customerService.js";
import * as loyaltyService from "./loyaltyService.js";
import { ORDER_STATUSES } from "../models/order.js";
import { NotFoundError, BadRequestError } from "../utils/errors.js";

const ROUND_SCALE = 4;

function round(value) {
  return Math.round(value * 10 ** ROUND_SCALE) / 10 ** ROUND_SCALE;
}

function resolveDishPrice(dish, branchId) {
  const override = (dish.branchPrices ?? []).find(
    (entry) => String(entry.branchId) === String(branchId)
  );
  return override ? override.price : dish.salePrice;
}

async function assertPublicBranch(tenantId, branchId) {
  const tenant = await tenantRepository.findTenantById(tenantId);

  if (!tenant || tenant.active === false) {
    throw new NotFoundError("Tenant not found.");
  }

  const branch = await branchRepository.findBranchById(branchId);

  if (!branch || String(branch.tenantId) !== String(tenantId)) {
    throw new NotFoundError("Branch not found.");
  }

  if (branch.active === false) {
    throw new BadRequestError("Branch is not active.");
  }

  return { tenant, branch };
}

export async function getPublicMenu({ tenantId, branchId }) {
  const { tenant, branch } = await assertPublicBranch(tenantId, branchId);

  const dishes = await dishRepository.listDishes({ tenantId, active: true });

  return {
    tenancy: {
      businessName: tenant.name,
      branchName: branch.name,
    },
    dishes: dishes.map((dish) => ({
      id: String(dish._id),
      name: dish.name,
      description: dish.description,
      icon: dish.icon,
      category: dish.category ?? "general",
      price: round(resolveDishPrice(dish, branch._id)),
    })),
  };
}

export async function createPublicOrder({ tenantId, branchId, phone, items }) {
  const { tenant, branch } = await assertPublicBranch(tenantId, branchId);

  const number = await branchRepository.nextOrderNumber(branch._id);

  if (number === null) {
    throw new NotFoundError("Branch not found.");
  }

  const dishIds = items.map((item) => item.dishId);
  const dishes = await dishRepository.findDishesByIds(dishIds, { tenantId });

  if (dishes.length !== new Set(dishIds.map(String)).size) {
    throw new BadRequestError("An item references a dish that does not exist.");
  }

  const dishesById = new Map(dishes.map((dish) => [String(dish._id), dish]));
  let total = 0;

  const orderItems = items.map((item, index) => {
    const dish = dishesById.get(String(item.dishId));

    if (!dish || dish.active === false) {
      throw new BadRequestError(`Item ${index + 1} references a dish outside the tenant.`);
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

  const customer = await customerService.upsertCustomer({ tenantId, phone });

  const order = await orderRepository.createOrder({
    tenantId,
    foodtruckId: branch._id,
    status: ORDER_STATUSES.NEW,
    number,
    orderType: "qr",
    paymentStatus: "pending",
    clientPhone: phone,
    items: orderItems,
    total: round(total),
    statusHistory: [
      {
        status: ORDER_STATUSES.NEW,
        at: new Date(),
        by: branch._id,
      },
    ],
  });

  const rule = await loyaltyService.getRule(tenantId);

  return {
    number: order.number,
    orderId: String(order._id),
    total: order.total,
    pointsRate: rule?.pointsPerAmount ?? null,
    pointsBalance: customer?.pointsBalance ?? 0,
  };
}

export async function getCustomerBalance({ tenantId, branchId, phone }) {
  await assertPublicBranch(tenantId, branchId);

  const balance = await customerService.getBalance({ tenantId, phone });

  return { phone, pointsBalance: balance };
}