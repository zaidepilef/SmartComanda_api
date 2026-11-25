import * as branchRepository from "../repositories/branchRepository.js";
import * as dishRepository from "../repositories/dishRepository.js";
import * as orderRepository from "../repositories/orderRepository.js";
import * as tenantRepository from "../repositories/tenantRepository.js";
import * as customerService from "./customerService.js";
import * as loyaltyService from "./loyaltyService.js";
import { createHash, randomBytes } from "node:crypto";
import {
  ORDER_PAYMENT_STATUSES,
  ORDER_STATUSES,
  customerFacingStatus,
} from "../models/order.js";
import {
  BadRequestError,
  ConflictError,
  NotFoundError,
  UnprocessableError,
} from "../utils/errors.js";
import { estimateDelivery } from "../utils/geo.js";
import { PAYMENT_METHODS } from "../utils/paymentMethods.js";

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

export async function assertPublicBranch(tenantId, branchId) {
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

/**
 * La sucursal ofrece domicilio solo si tiene ubicación y al menos un límite
 * (km o minutos) para validar la cobertura.
 */
export function isDeliveryAvailable(branch) {
  return (
    Number.isFinite(branch?.lat) &&
    Number.isFinite(branch?.lng) &&
    (Number.isFinite(branch.deliveryMaxKm) || Number.isFinite(branch.deliveryMaxMinutes))
  );
}

function branchPaymentMethods(branch) {
  return branch.paymentMethods ?? PAYMENT_METHODS;
}

export async function getPublicMenu({ tenantId, branchId }) {
  const { tenant, branch } = await assertPublicBranch(tenantId, branchId);

  const dishes = await dishRepository.listDishes({ tenantId, active: true });

  return {
    tenancy: {
      businessName: tenant.name,
      branchName: branch.name,
    },
    paymentMethods: branchPaymentMethods(branch),
    deliveryAvailable: isDeliveryAvailable(branch),
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

/**
 * Estimación de envío para la app del cliente. No expone las coordenadas
 * ni los límites de la sucursal.
 */
export async function getDeliveryEstimate({ tenantId, branchId, lat, lng }) {
  const { branch } = await assertPublicBranch(tenantId, branchId);
  const estimate = estimateDelivery(branch, { lat, lng });

  if (!estimate) {
    return { estimate: null };
  }

  return {
    estimate: {
      distanceKm: estimate.distanceKm,
      etaMinutes: estimate.etaMinutes,
      outOfRange: estimate.outOfRange,
    },
  };
}

/** Hash con el que se guarda el token de seguimiento (el token solo lo tiene el cliente). */
export function hashTrackingToken(token) {
  return createHash("sha256").update(token).digest("hex");
}

function assertExpectedPaymentMethod(branch, expectedPaymentMethod) {
  const methods = branchPaymentMethods(branch);
  const allowed =
    expectedPaymentMethod === "card"
      ? methods.includes("debit") || methods.includes("credit")
      : methods.includes(expectedPaymentMethod);

  if (!allowed) {
    throw new BadRequestError("expectedPaymentMethod is not enabled on this branch.");
  }
}

/**
 * Resuelve la dirección del domicilio (guardada o nueva) y valida la cobertura.
 * La estimación siempre la calcula el servidor.
 */
async function resolveDelivery(branch, customer, delivery) {
  if (!isDeliveryAvailable(branch)) {
    throw new UnprocessableError("This branch does not deliver.", "DELIVERY_UNAVAILABLE");
  }

  let point = delivery;

  if (delivery.addressId !== undefined) {
    const saved = customer
      ? await customerService.findCustomerAddress(customer._id, delivery.addressId)
      : null;

    if (!saved) {
      throw new BadRequestError("delivery.addressId does not belong to this customer.");
    }

    point = {
      addressId: saved._id,
      address: saved.address,
      reference: delivery.reference || saved.reference,
      lat: saved.lat,
      lng: saved.lng,
    };
  }

  const estimate = estimateDelivery(branch, { lat: point.lat, lng: point.lng });

  if (!estimate) {
    throw new UnprocessableError("This branch does not deliver.", "DELIVERY_UNAVAILABLE");
  }

  if (estimate.outOfRange) {
    throw new UnprocessableError("The address is outside the delivery zone.", "DELIVERY_OUT_OF_RANGE");
  }

  return { point, estimate };
}

function toPublicOrderResult(order, { trackingToken, pointsRate, pointsBalance }) {
  const result = {
    number: order.number,
    orderId: String(order._id),
    total: order.total,
    orderType: order.orderType,
    status: customerFacingStatus(order),
    expectedPaymentMethod: order.expectedPaymentMethod,
    cashTendered: order.cashTendered,
    deliveryEtaMinutes: order.deliveryEtaMinutes,
    deliveryDistanceKm: order.deliveryDistanceKm,
    deliveryOutOfRange: order.deliveryOutOfRange,
    pointsRate,
    pointsBalance,
  };

  if (trackingToken) {
    result.trackingToken = trackingToken;
  }

  return result;
}

/**
 * Crea el pedido desde la app del cliente. Siempre queda con el pago pendiente;
 * repetir el mismo `clientRequestId` devuelve el pedido ya creado (`replayed`).
 */
export async function createPublicOrder({
  tenantId,
  branchId,
  name,
  phone,
  orderType = "qr",
  clientRequestId,
  expectedPaymentMethod,
  cashTendered,
  delivery,
  items,
}) {
  const { branch } = await assertPublicBranch(tenantId, branchId);

  const existing = await orderRepository.findByClientRequestId(tenantId, clientRequestId);

  if (existing) {
    return replayExisting(existing, { tenantId, phone });
  }

  assertExpectedPaymentMethod(branch, expectedPaymentMethod);

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

    const orderItem = {
      dishId: dish._id,
      name: dish.name,
      price,
      quantity: item.quantity,
      stockApplied: false,
    };

    if (item.note) {
      orderItem.note = item.note;
    }

    return orderItem;
  });

  total = round(total);

  if (cashTendered !== undefined && cashTendered < total) {
    throw new BadRequestError("cashTendered must cover the order total.");
  }

  const knownCustomer = await customerService.getCustomerByPhone({ tenantId, phone });
  const deliveryInfo =
    orderType === "delivery" ? await resolveDelivery(branch, knownCustomer, delivery) : null;

  const customer = await customerService.upsertCustomer({ tenantId, phone, name });
  let savedAddress = null;

  if (deliveryInfo) {
    savedAddress = deliveryInfo.point.addressId
      ? { _id: deliveryInfo.point.addressId }
      : await customerService.saveDeliveryAddress({
          tenantId,
          customerId: customer._id,
          address: deliveryInfo.point.address,
          reference: deliveryInfo.point.reference || null,
          lat: deliveryInfo.point.lat,
          lng: deliveryInfo.point.lng,
        });

    if (deliveryInfo.point.addressId) {
      await customerService.touchCustomerAddress(deliveryInfo.point.addressId, deliveryInfo.point.reference);
    }
  }

  const number = await branchRepository.nextOrderNumber(branch._id);

  if (number === null) {
    throw new NotFoundError("Branch not found.");
  }

  const trackingToken = randomBytes(32).toString("base64url");
  let order;

  try {
    order = await orderRepository.createOrder({
      tenantId,
      foodtruckId: branch._id,
      status: ORDER_STATUSES.NEW,
      number,
      orderType,
      paymentStatus: ORDER_PAYMENT_STATUSES.PENDING,
      clientName: customer?.firstName ?? name,
      clientPhone: phone,
      items: orderItems,
      total,
      expectedPaymentMethod,
      cashTendered: cashTendered ?? null,
      clientRequestId,
      trackingTokenHash: hashTrackingToken(trackingToken),
      ...(deliveryInfo
        ? {
            customerAddressId: savedAddress?._id ?? null,
            deliveryAddress: deliveryInfo.point.address,
            deliveryReference: deliveryInfo.point.reference || null,
            deliveryLat: deliveryInfo.point.lat,
            deliveryLng: deliveryInfo.point.lng,
            deliveryAccuracyM:
              delivery?.accuracy !== undefined ? Math.round(delivery.accuracy) : null,
            deliveryDistanceKm: deliveryInfo.estimate.distanceKm,
            deliveryEtaMinutes: deliveryInfo.estimate.etaMinutes,
            deliveryOutOfRange: false,
          }
        : {}),
      statusHistory: [
        {
          status: ORDER_STATUSES.NEW,
          at: new Date(),
          by: branch._id,
        },
      ],
    });
  } catch (error) {
    // Dos confirmaciones simultáneas con el mismo clientRequestId: gana la primera.
    if (error?.code === "23505") {
      const raced = await orderRepository.findByClientRequestId(tenantId, clientRequestId);

      if (raced) {
        return replayExisting(raced, { tenantId, phone });
      }
    }

    throw error;
  }

  const rule = await loyaltyService.getRule(tenantId);

  return {
    replayed: false,
    order: toPublicOrderResult(order, {
      trackingToken,
      pointsRate: rule?.pointsPerAmount ?? null,
      pointsBalance: customer?.pointsBalance ?? 0,
    }),
  };
}

async function replayExisting(order, { tenantId, phone }) {
  if (order.clientPhone !== phone) {
    throw new ConflictError("clientRequestId was already used by another order.");
  }

  const rule = await loyaltyService.getRule(tenantId);
  const balance = await customerService.getBalance({ tenantId, phone });

  // El token de seguimiento se entrega una sola vez; la app ya lo tiene guardado.
  return {
    replayed: true,
    order: toPublicOrderResult(order, {
      trackingToken: null,
      pointsRate: rule?.pointsPerAmount ?? null,
      pointsBalance: balance,
    }),
  };
}

/** Búsqueda pública del cliente por teléfono (datos mínimos). */
export async function lookupCustomer({ tenantId, branchId, phone }) {
  await assertPublicBranch(tenantId, branchId);
  return customerService.lookupCustomer({ tenantId, phone });
}

/**
 * Seguimiento del pedido por token: sin dirección, coordenadas, teléfono ni nombre.
 */
export async function trackOrder({ tenantId, trackingToken }) {
  const order = await orderRepository.findByTrackingTokenHash(
    tenantId,
    hashTrackingToken(trackingToken)
  );

  if (!order) {
    throw new NotFoundError("Order not found.");
  }

  const timestamps = {};

  for (const entry of order.statusHistory ?? []) {
    if (entry?.status && entry.at && !timestamps[entry.status]) {
      timestamps[entry.status] = entry.at;
    }
  }

  return {
    number: order.number,
    orderType: order.orderType,
    status: customerFacingStatus(order),
    items: (order.items ?? []).map((item) => ({
      name: item.name,
      quantity: item.quantity,
      price: item.price,
      note: item.note ?? null,
    })),
    total: order.total,
    expectedPaymentMethod: order.expectedPaymentMethod,
    paymentStatus: order.paymentStatus,
    deliveryEtaMinutes: order.deliveryEtaMinutes,
    rejectionReason: order.rejectionReason,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
    timestamps,
  };
}

export async function getCustomerBalance({ tenantId, branchId, phone }) {
  await assertPublicBranch(tenantId, branchId);

  const balance = await customerService.getBalance({ tenantId, phone });

  return { phone, pointsBalance: balance };
}