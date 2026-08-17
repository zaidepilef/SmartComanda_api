const STOCKS_COLLECTION = "stocks";
const INGREDIENTS_COLLECTION = "ingredients";
const TENANTS_COLLECTION = "tenants";
const BRANCHES_COLLECTION = "branches";
const DISHES_COLLECTION = "dishes";

export async function up(db) {
  const stocks = db.collection(STOCKS_COLLECTION);

  await stocks.dropIndex("tenantId_1_ingredientId_1_branchId_1");

  const ingredients = db.collection(INGREDIENTS_COLLECTION);
  const ingredientsById = new Map();

  for await (const ingredient of ingredients.find({})) {
    ingredientsById.set(String(ingredient._id), ingredient);
  }

  const branches = db.collection(BRANCHES_COLLECTION);
  const firstBranchByTenant = new Map();

  for await (const branch of branches.find({})) {
    if (!firstBranchByTenant.has(String(branch.tenantId))) {
      firstBranchByTenant.set(String(branch.tenantId), branch._id);
    }
  }

  for await (const stock of stocks.find({})) {
    const ingredient = ingredientsById.get(String(stock.ingredientId));

    const update = {
      $set: {
        unitCost: stock.unitCost ?? ingredient?.unitCost ?? 0,
        createdAt: stock.createdAt ?? stock.updatedAt ?? new Date(),
      },
    };

    if (stock.branchId === null || stock.branchId === undefined) {
      const branchId = firstBranchByTenant.get(String(stock.tenantId));

      if (branchId) {
        update.$set.branchId = branchId;
      }
    }

    await stocks.updateOne({ _id: stock._id }, update);
  }

  await stocks.createIndex({ tenantId: 1, branchId: 1, ingredientId: 1 });
  await stocks.createIndex({ createdAt: 1 });

  await db.collection(TENANTS_COLLECTION).updateMany({}, { $unset: { warehouseMode: "" } });
  await db.collection(DISHES_COLLECTION).updateMany({}, { $unset: { computedCost: "" } });
}