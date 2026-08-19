export const LOYALTY_TRANSACTION_TYPES = Object.freeze(["earn"]);

export function toLoyaltyTransactionDocument(transaction) {
  return {
    tenantId: transaction.tenantId,
    branchId: transaction.branchId,
    customerId: transaction.customerId,
    type: transaction.type,
    points: transaction.points,
    sourceOrderId: transaction.sourceOrderId,
    createdAt: new Date(),
  };
}