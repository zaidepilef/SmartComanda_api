export function toDishDocument(dish) {
  const now = new Date();

  const document = {
    name: dish.name,
    salePrice: dish.salePrice,
    computedCost: dish.computedCost,
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

  return document;
}
