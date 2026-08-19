export const INGREDIENT_DIMENSIONS = Object.freeze({
  COUNT: "count",
  MASS: "mass",
  VOLUME: "volume",
});

export const INGREDIENT_DIMENSIONS_LIST = Object.freeze([
  INGREDIENT_DIMENSIONS.COUNT,
  INGREDIENT_DIMENSIONS.MASS,
  INGREDIENT_DIMENSIONS.VOLUME,
]);

export function toIngredientDocument(ingredient) {
  const now = new Date();

  const document = {
    name: ingredient.name,
    unit: ingredient.unit,
    dimension: ingredient.dimension,
    unitCost: ingredient.unitCost,
    tenantId: ingredient.tenantId,
    createdAt: now,
    updatedAt: now,
  };

  if (ingredient.notes !== undefined) {
    document.notes = ingredient.notes;
  }

  return document;
}
