export const ORDER_STATUSES = Object.freeze({
  PENDING: "pending",
});

export const ORDER_PAYMENT_STATUSES = Object.freeze({
  PENDING: "pending",
  PAID: "paid",
});

export const ORDER_TYPES = Object.freeze(["takeaway", "dinein", "delivery", "qr"]);

export function toOrderDocument(order) {
  const now = new Date();

  const document = {
    tenantId: order.tenantId,
    foodtruckId: order.foodtruckId,
    status: order.status ?? ORDER_STATUSES.PENDING,
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

  return document;
}
