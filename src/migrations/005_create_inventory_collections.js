const INGREDIENTS_COLLECTION = "ingredients";
const DISHES_COLLECTION = "dishes";
const STOCKS_COLLECTION = "stocks";
const INVENTORY_MOVEMENTS_COLLECTION = "inventory-movements";

export async function up(db) {
  const ingredients = db.collection(INGREDIENTS_COLLECTION);

  await ingredients.createIndex({ tenantId: 1, name: 1 }, { unique: true });

  const dishes = db.collection(DISHES_COLLECTION);

  await dishes.createIndex({ tenantId: 1 });

  const stocks = db.collection(STOCKS_COLLECTION);

  await stocks.createIndex({ tenantId: 1 });
  await stocks.createIndex({ tenantId: 1, ingredientId: 1, branchId: 1 }, { unique: true });

  const movements = db.collection(INVENTORY_MOVEMENTS_COLLECTION);

  await movements.createIndex({ tenantId: 1 });
  await movements.createIndex({ ingredientId: 1 });
  await movements.createIndex({ createdAt: -1 });

  const tenants = db.collection("tenants");

  await tenants.updateMany(
    { warehouseMode: { $exists: false } },
    { $set: { warehouseMode: "shared" } }
  );
}
