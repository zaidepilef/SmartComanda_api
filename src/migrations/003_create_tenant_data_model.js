const TENANTS_COLLECTION = "tenants";
const USERS_COLLECTION = "users";
const BRANCHES_COLLECTION = "branches";
const ORDERS_COLLECTION = "orders";

export async function up(db) {
  const tenants = db.collection(TENANTS_COLLECTION);

  await tenants.createIndex({ rut: 1 }, { unique: true });
  await tenants.createIndex({ active: 1 });

  const users = db.collection(USERS_COLLECTION);

  await users.createIndex({ tenantId: 1 });

  const branches = db.collection(BRANCHES_COLLECTION);

  await branches.createIndex({ tenantId: 1 });
  await branches.createIndex({ active: 1 });

  const orders = db.collection(ORDERS_COLLECTION);

  await orders.createIndex({ tenantId: 1 });
  await orders.createIndex({ foodtruckId: 1 });
  await orders.createIndex({ status: 1 });
}