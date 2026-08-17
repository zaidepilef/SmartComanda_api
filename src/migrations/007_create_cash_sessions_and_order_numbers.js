const CASH_SESSIONS_COLLECTION = "cash-sessions";
const ORDERS_COLLECTION = "orders";
const BRANCHES_COLLECTION = "branches";

export async function up(db) {
  const cashSessions = db.collection(CASH_SESSIONS_COLLECTION);

  await cashSessions.createIndex({ tenantId: 1 });
  await cashSessions.createIndex({ branchId: 1, status: 1 });

  const orders = db.collection(ORDERS_COLLECTION);

  await orders.createIndex(
    { tenantId: 1, foodtruckId: 1, number: 1 },
    { unique: true, partialFilterExpression: { number: { $exists: true } } }
  );

  const branches = db.collection(BRANCHES_COLLECTION);

  await branches.updateMany(
    { nextOrderNumber: { $exists: false } },
    { $set: { nextOrderNumber: 0 } }
  );
}
