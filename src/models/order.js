export const ORDER_STATUSES = Object.freeze({
  PENDING: "pending",
});

export function toOrderDocument(order) {
  const now = new Date();

  return {
    tenantId: order.tenantId,
    foodtruckId: order.foodtruckId,
    status: order.status ?? ORDER_STATUSES.PENDING,
    clientContact: order.clientContact,
    items: order.items,
    total: order.total,
    createdAt: now,
    updatedAt: now,
  };
}
