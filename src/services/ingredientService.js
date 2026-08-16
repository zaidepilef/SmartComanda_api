import * as ingredientRepository from "../repositories/ingredientRepository.js";
import * as dishRepository from "../repositories/dishRepository.js";
import * as dishService from "./dishService.js";
import { ConflictError, ForbiddenError, NotFoundError } from "../utils/errors.js";
import { getTenantFilter, isGlobalActor } from "../utils/tenantScope.js";

const MANAGER_ROLES = ["owner", "admin"];

function assertCanManage(actor) {
  if (!MANAGER_ROLES.includes(actor?.role)) {
    throw new ForbiddenError("Forbidden. Owner or admin role required.");
  }
}

async function assertIngredientOwnership(actor, ingredientId) {
  if (isGlobalActor(actor)) {
    return;
  }

  const ingredient = await ingredientRepository.findIngredientById(ingredientId);

  if (!ingredient || String(ingredient.tenantId) !== String(actor.tenantId)) {
    throw new ForbiddenError("Forbidden. Cannot manage an ingredient outside your own tenant.");
  }
}

async function assertNameAvailable(name, tenantId, excludeId) {
  const existing = await ingredientRepository.findIngredientByNameAndTenant(name, tenantId);

  if (existing && (!excludeId || String(existing._id) !== String(excludeId))) {
    throw new ConflictError("An ingredient with this name already exists.");
  }
}

function assertCanAssignTenant(actor, tenantId) {
  if (!isGlobalActor(actor) && String(tenantId) !== String(actor.tenantId)) {
    throw new ForbiddenError("Forbidden. Cannot assign a tenant outside your own.");
  }
}

export async function listIngredients(actor, { tenantId, q } = {}) {
  const filter = getTenantFilter(actor);

  if (tenantId !== undefined && isGlobalActor(actor)) {
    filter.tenantId = tenantId;
  }

  if (q !== undefined) {
    filter.q = q;
  }

  return ingredientRepository.listIngredients(filter);
}

export async function createIngredient(actor, ingredientInput) {
  assertCanManage(actor);
  assertCanAssignTenant(actor, ingredientInput.tenantId);

  const tenantId = isGlobalActor(actor)
    ? ingredientInput.tenantId
    : actor.tenantId;

  if (!tenantId) {
    throw new ForbiddenError("Forbidden. A tenant is required.");
  }

  await assertNameAvailable(ingredientInput.name, tenantId);

  return ingredientRepository.createIngredient({ ...ingredientInput, tenantId });
}

export async function updateIngredientById(actor, id, ingredientInput) {
  assertCanManage(actor);
  await assertIngredientOwnership(actor, id);

  const ingredient = await ingredientRepository.findIngredientById(id);

  if (!ingredient) {
    throw new NotFoundError("Ingredient not found.");
  }

  const nextName = ingredientInput.name ?? ingredient.name;
  await assertNameAvailable(nextName, ingredient.tenantId, id);

  const unitOrDimensionChanged =
    (ingredientInput.unit !== undefined && ingredientInput.unit !== ingredient.unit) ||
    (ingredientInput.dimension !== undefined && ingredientInput.dimension !== ingredient.dimension);

  if (unitOrDimensionChanged) {
    const referencingDishes = await dishRepository.findDishesByIngredientId(id);

    if (referencingDishes.length > 0) {
      throw new ConflictError(
        "Cannot change unit or dimension while the ingredient is used by dishes."
      );
    }
  }

  const costChanged =
    ingredientInput.unitCost !== undefined && ingredientInput.unitCost !== ingredient.unitCost;

  const updated = await ingredientRepository.updateIngredient(id, ingredientInput);

  if (costChanged) {
    await dishService.recomputeDishesCostForIngredient(id);
  }

  return updated;
}
