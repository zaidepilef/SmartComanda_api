export const ORDER_STATUSES = Object.freeze({
  NEW: "new",
  PREPARING: "preparing",
  READY: "ready",
  OUT_FOR_DELIVERY: "out_for_delivery",
  DELIVERED: "delivered",
  REJECTED: "rejected",
  CANCELLED: "cancelled",
});

export const ORDER_STATUSES_LIST = Object.freeze(Object.values(ORDER_STATUSES));

/** Transiciones posibles de cualquier pedido (las reglas por modalidad están en `nextStatuses`). */
export const ORDER_STATUS_TRANSITIONS = Object.freeze({
  [ORDER_STATUSES.NEW]: [ORDER_STATUSES.PREPARING, ORDER_STATUSES.REJECTED, ORDER_STATUSES.CANCELLED],
  [ORDER_STATUSES.PREPARING]: [ORDER_STATUSES.READY, ORDER_STATUSES.CANCELLED],
  [ORDER_STATUSES.READY]: [
    ORDER_STATUSES.DELIVERED,
    ORDER_STATUSES.OUT_FOR_DELIVERY,
    ORDER_STATUSES.CANCELLED,
  ],
  [ORDER_STATUSES.OUT_FOR_DELIVERY]: [ORDER_STATUSES.DELIVERED, ORDER_STATUSES.CANCELLED],
  [ORDER_STATUSES.DELIVERED]: [],
  [ORDER_STATUSES.REJECTED]: [],
  [ORDER_STATUSES.CANCELLED]: [],
});

export const ORDER_PAYMENT_STATUSES = Object.freeze({
  PENDING: "pending",
  PAID: "paid",
  DECLINED: "declined",
  VOIDED: "voided",
  REFUNDED: "refunded",
});

export const ORDER_PAYMENT_STATUSES_LIST = Object.freeze(
  Object.values(ORDER_PAYMENT_STATUSES)
);

/** Transiciones del estado de pago (ver order-checkout "Payment status lifecycle"). */
export const PAYMENT_STATUS_TRANSITIONS = Object.freeze({
  [ORDER_PAYMENT_STATUSES.PENDING]: [
    ORDER_PAYMENT_STATUSES.PAID,
    ORDER_PAYMENT_STATUSES.DECLINED,
    ORDER_PAYMENT_STATUSES.VOIDED,
  ],
  [ORDER_PAYMENT_STATUSES.DECLINED]: [ORDER_PAYMENT_STATUSES.PAID, ORDER_PAYMENT_STATUSES.VOIDED],
  [ORDER_PAYMENT_STATUSES.PAID]: [ORDER_PAYMENT_STATUSES.REFUNDED],
  [ORDER_PAYMENT_STATUSES.VOIDED]: [],
  [ORDER_PAYMENT_STATUSES.REFUNDED]: [],
});

/** Estados de pago que todavía se pueden cobrar. */
export const COLLECTABLE_PAYMENT_STATUSES = Object.freeze([
  ORDER_PAYMENT_STATUSES.PENDING,
  ORDER_PAYMENT_STATUSES.DECLINED,
]);

/** Estados desde los que un Encargado o superior puede anular un pedido. */
export const CANCELLABLE_STATUSES = Object.freeze([
  ORDER_STATUSES.NEW,
  ORDER_STATUSES.PREPARING,
  ORDER_STATUSES.READY,
  ORDER_STATUSES.OUT_FOR_DELIVERY,
]);

export const ORDER_TYPES = Object.freeze(["takeaway", "dinein", "delivery", "qr"]);

/**
 * Cómo dice pagar el cliente desde la app. `card` = débito o crédito, se decide
 * en la puerta. Es solo una intención: nunca marca el pedido como pagado.
 */
export const EXPECTED_PAYMENT_METHODS = Object.freeze(["cash", "debit", "credit", "card"]);
export const PICKUP_EXPECTED_METHODS = Object.freeze(["cash", "debit", "credit"]);
export const DELIVERY_EXPECTED_METHODS = Object.freeze(["cash", "card"]);

/** Medios con los que el repartidor registra el cobro en la entrega. */
export const DELIVERY_COLLECT_METHODS = Object.freeze(["cash", "debit", "credit"]);

/** Pedido de retiro hecho por el cliente desde su teléfono: se cobra en caja antes de cocina. */
export function isAppPickupOrder(order) {
  return order?.orderType === "qr";
}

/** Pedido a domicilio hecho desde la app: entra a cocina con el pago pendiente y se cobra al entregar. */
export function isAppDeliveryOrder(order) {
  return order?.orderType === "delivery" && Boolean(order.deliveryAddress);
}

/** Pedido hecho por el cliente desde su teléfono (retiro o domicilio). */
export function isCustomerAppOrder(order) {
  return isAppPickupOrder(order) || isAppDeliveryOrder(order);
}

/**
 * Estados a los que puede pasar el pedido según su modalidad: los domicilios de
 * la app pasan por reparto y solo los pedidos de la app se pueden rechazar.
 */
export function nextStatuses(order) {
  const base = ORDER_STATUS_TRANSITIONS[order.status] ?? [];

  return base.filter((status) => {
    if (status === ORDER_STATUSES.REJECTED) {
      return isCustomerAppOrder(order);
    }

    if (order.status === ORDER_STATUSES.READY && status === ORDER_STATUSES.OUT_FOR_DELIVERY) {
      return isAppDeliveryOrder(order);
    }

    if (order.status === ORDER_STATUSES.READY && status === ORDER_STATUSES.DELIVERED) {
      return !isAppDeliveryOrder(order);
    }

    return true;
  });
}

/** Estado que ve el cliente en el seguimiento (ver customer-order-flow). */
export const CUSTOMER_FACING_STATUSES = Object.freeze({
  AWAITING_PAYMENT: "awaiting_payment",
  RECEIVED: "received",
  PREPARING: "preparing",
  READY_FOR_PICKUP: "ready_for_pickup",
  READY_FOR_DISPATCH: "ready_for_dispatch",
  OUT_FOR_DELIVERY: "out_for_delivery",
  DELIVERED: "delivered",
  REJECTED: "rejected",
  CANCELLED: "cancelled",
});

export function customerFacingStatus(order) {
  const S = CUSTOMER_FACING_STATUSES;
  const delivery = order.orderType === "delivery";

  switch (order.status) {
    case ORDER_STATUSES.NEW:
      return delivery || order.paymentStatus === ORDER_PAYMENT_STATUSES.PAID
        ? S.RECEIVED
        : S.AWAITING_PAYMENT;
    case ORDER_STATUSES.PREPARING:
      return S.PREPARING;
    case ORDER_STATUSES.READY:
      return delivery ? S.READY_FOR_DISPATCH : S.READY_FOR_PICKUP;
    case ORDER_STATUSES.OUT_FOR_DELIVERY:
      return S.OUT_FOR_DELIVERY;
    case ORDER_STATUSES.DELIVERED:
      return S.DELIVERED;
    case ORDER_STATUSES.REJECTED:
      return S.REJECTED;
    default:
      return S.CANCELLED;
  }
}

/** Estados en los que el pedido ya no cambia (el seguimiento deja de consultar). */
export const FINAL_STATUSES = Object.freeze([
  ORDER_STATUSES.DELIVERED,
  ORDER_STATUSES.REJECTED,
  ORDER_STATUSES.CANCELLED,
]);

export function toOrderDocument(order) {
  const now = new Date();

  const document = {
    tenantId: order.tenantId,
    foodtruckId: order.foodtruckId,
    status: order.status ?? ORDER_STATUSES.NEW,
    clientContact: order.clientContact,
    items: order.items,
    total: order.total,
    createdAt: now,
    updatedAt: now,
  };

  if (order.number !== undefined) {
    document.number = order.number;
  }

  if (order.orderType !== undefined) {
    document.orderType = order.orderType;
  }

  if (order.paymentStatus !== undefined) {
    document.paymentStatus = order.paymentStatus;
  }

  if (order.paymentMethod !== undefined) {
    document.paymentMethod = order.paymentMethod;
  }

  if (order.clientPhone !== undefined) {
    document.clientPhone = order.clientPhone;
  }

  if (order.clientName !== undefined) {
    document.clientName = order.clientName;
  }

  if (order.pointsAwarded !== undefined) {
    document.pointsAwarded = order.pointsAwarded;
  }

  if (order.statusHistory !== undefined) {
    document.statusHistory = order.statusHistory;
  }

  return document;
}
