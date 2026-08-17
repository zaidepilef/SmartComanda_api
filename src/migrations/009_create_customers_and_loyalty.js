const CUSTOMERS_COLLECTION = "customers";
const LOYALTY_TRANSACTIONS_COLLECTION = "loyalty-transactions";

export async function up(db) {
  const customers = db.collection(CUSTOMERS_COLLECTION);

  await customers.createIndex({ tenantId: 1 });
  await customers.createIndex({ tenantId: 1, phone: 1 }, { unique: true });

  const loyaltyTransactions = db.collection(LOYALTY_TRANSACTIONS_COLLECTION);

  await loyaltyTransactions.createIndex({ tenantId: 1 });
  await loyaltyTransactions.createIndex({ customerId: 1 });
  await loyaltyTransactions.createIndex({ branchId: 1 });
  await loyaltyTransactions.createIndex({ sourceOrderId: 1 });
}