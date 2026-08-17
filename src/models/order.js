export const ORDER_STATUSES = Object.freeze({
  NEW: "new",
  PREPARING: "preparing",
  READY: "ready",
  DELIVERED: "delivered",
  CANCELLED: "cancelled",
});

export const ORDER_STATUSES_LIST = Object.freeze(Object.values(ORDER_STATUSES));

export const ORDER_STATUS_TRANSITIONS = Object.freeze({
  [ORDER_STATUSES.NEW]: [ORDER_STATUSES.PREPARING, ORDER_STATUSES.CANCELLED],
  [ORDER_STATUSES.PREPARING]: [ORDER_STATUSES.READY, ORDER_STATUSES.CANCELLED],
  [ORDER_STATUSES.READY]: [ORDER_STATUSES.DELIVERED],
  [ORDER_STATUSES.DELIVERED]: [],
  [ORDER_STATUSES.CANCELLED]: [],
});

export const ORDER_PAYMENT_STATUSES = Object.freeze({
  PENDING: "pending",
  PAID: "paid",
});

export const ORDER_PAYMENT_STATUSES_LIST = Object.freeze(
  Object.values(ORDER_PAYMENT_STATUSES)
);

export const ORDER_TYPES = Object.freeze(["takeaway", "dinein", "delivery", "qr"]);

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

  if (order.statusHistory !== undefined) {
    document.statusHistory = order.statusHistory;
  }

  return document;
}
