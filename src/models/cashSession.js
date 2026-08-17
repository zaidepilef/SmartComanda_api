export const CASH_SESSION_STATUSES = Object.freeze({
  OPEN: "open",
  CLOSED: "closed",
});

export function createCashSessionTotals() {
  return { cash: 0, debit: 0, credit: 0, transfer: 0 };
}

export function toCashSessionDocument(session) {
  const now = new Date();

  return {
    tenantId: session.tenantId,
    branchId: session.branchId,
    openedBy: session.openedBy,
    openedAt: session.openedAt ?? now,
    openingAmount: session.openingAmount,
    status: session.status ?? CASH_SESSION_STATUSES.OPEN,
    totals: session.totals ?? createCashSessionTotals(),
    orderCount: session.orderCount ?? 0,
    closedAt: null,
    closedBy: null,
    createdAt: now,
    updatedAt: now,
  };
}
