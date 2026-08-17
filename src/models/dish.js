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

  if (dish.branchPrices !== undefined) {
    document.branchPrices = dish.branchPrices;
  }

  return document;
}
