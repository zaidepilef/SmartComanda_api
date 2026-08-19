export function toDishDocument(dish) {
  const now = new Date();

  const document = {
    name: dish.name,
    salePrice: dish.salePrice,
    recipe: dish.recipe,
    tenantId: dish.tenantId,
    createdAt: now,
    updatedAt: now,
  };

  if (dish.active !== undefined) {
    document.active = dish.active;
  }

  if (dish.description !== undefined) {
    document.description = dish.description;
  }

  document.category = dish.category ?? "general";
  document.icon = dish.icon ?? "🍽️";

  if (dish.branchPrices !== undefined) {
    document.branchPrices = dish.branchPrices;
  }

  return document;
}
