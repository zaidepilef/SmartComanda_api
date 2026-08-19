import { ObjectId } from "mongodb";
import * as dishRepository from "../repositories/dishRepository.js";
import * as ingredientRepository from "../repositories/ingredientRepository.js";
import * as stockRepository from "../repositories/stockRepository.js";
import * as fifoService from "./fifoService.js";
import { BadRequestError, ConflictError, ForbiddenError, NotFoundError } from "../utils/errors.js";
import { getTenantFilter, isGlobalActor } from "../utils/tenantScope.js";

const MANAGER_ROLES = ["owner", "admin"];

function toRecipeLine(line) {
  return { ...line, ingredientId: new ObjectId(line.ingredientId) };
}

function toBranchPrice(entry) {
  return { ...entry, branchId: new ObjectId(entry.branchId) };
}

function assertCanManage(actor) {
  if (!MANAGER_ROLES.includes(actor?.role)) {
    throw new ForbiddenError("Forbidden. Owner or admin role required.");
  }
}

export async function computeDishCostPerBranch(recipe, { tenantId, branchId }) {
  const ingredientIds = recipe.map((line) => line.ingredientId);
  const ingredients = await ingredientRepository.findIngredientsByIds(ingredientIds, { tenantId });

  const ingredientsById = new Map(
    ingredients.map((ingredient) => [String(ingredient._id), ingredient])
  );

  let cost = 0;

  for (const line of recipe) {
    const ingredient = ingredientsById.get(String(line.ingredientId));

    if (!ingredient) {
      throw new BadRequestError("Recipe references an ingredient that does not exist.");
    }

    if (line.unit !== ingredient.unit) {
      throw new BadRequestError(
        `Ingredient "${ingredient.name}" uses unit "${ingredient.unit}", not "${line.unit}".`
      );
    }

    const batches = await stockRepository.listBatches({
      tenantId,
      branchId,
      ingredientId: ingredient._id,
    });

    cost += fifoService.computeFifoCost(batches, line.quantity, ingredient.unitCost ?? 0);
  }

  return cost;
}

async function assertNameAvailable(name, tenantId, excludeId) {
  const existing = await dishRepository.findDishByNameAndTenant(name, tenantId);

  if (existing && (!excludeId || String(existing._id) !== String(excludeId))) {
    throw new ConflictError("A dish with this name already exists.");
  }
}

async function assertDishOwnership(actor, dishId) {
  if (isGlobalActor(actor)) {
    return;
  }

  const dish = await dishRepository.findDishById(dishId);

  if (!dish || String(dish.tenantId) !== String(actor.tenantId)) {
    throw new ForbiddenError("Forbidden. Cannot manage a dish outside your own tenant.");
  }
}

function assertCanAssignTenant(actor, tenantId) {
  if (!isGlobalActor(actor) && String(tenantId) !== String(actor.tenantId)) {
    throw new ForbiddenError("Forbidden. Cannot assign a tenant outside your own.");
  }
}

export async function listDishes(actor, { tenantId, active, q, branchId } = {}) {
  const filter = getTenantFilter(actor);

  if (tenantId !== undefined && isGlobalActor(actor)) {
    filter.tenantId = tenantId;
  }

  if (q !== undefined) {
    filter.q = q;
  }

  const normalizedActive =
    active === undefined ? undefined : active === true || active === "true";

  const dishes = await dishRepository.listDishes({ ...filter, active: normalizedActive });

  if (branchId === undefined) {
    return dishes;
  }

  const resolvedTenantId = isGlobalActor(actor) ? filter.tenantId : actor.tenantId;

  for (const dish of dishes) {
    dish.cost = await computeDishCostPerBranch(dish.recipe, {
      tenantId: resolvedTenantId,
      branchId,
    });
  }

  return dishes;
}

export async function createDish(actor, dishInput) {
  assertCanManage(actor);
  assertCanAssignTenant(actor, dishInput.tenantId);

  const tenantId = isGlobalActor(actor) ? dishInput.tenantId : actor.tenantId;

  if (!tenantId) {
    throw new ForbiddenError("Forbidden. A tenant is required.");
  }

  await assertNameAvailable(dishInput.name, tenantId);

  return dishRepository.createDish({
    name: dishInput.name,
    salePrice: dishInput.salePrice,
    active: dishInput.active,
    description: dishInput.description,
    category: dishInput.category,
    icon: dishInput.icon,
    recipe: dishInput.recipe.map(toRecipeLine),
    ...(dishInput.branchPrices !== undefined
      ? { branchPrices: dishInput.branchPrices.map(toBranchPrice) }
      : {}),
    tenantId,
  });
}

export async function updateDishById(actor, id, dishInput) {
  assertCanManage(actor);
  await assertDishOwnership(actor, id);

  const dish = await dishRepository.findDishById(id);

  if (!dish) {
    throw new NotFoundError("Dish not found.");
  }

  const nextName = dishInput.name ?? dish.name;
  await assertNameAvailable(nextName, dish.tenantId, id);

  const nextRecipe = dishInput.recipe ?? dish.recipe;

  const update = { ...dishInput };

  if (dishInput.recipe !== undefined) {
    update.recipe = nextRecipe.map(toRecipeLine);
  }

  if (dishInput.branchPrices !== undefined) {
    update.branchPrices = dishInput.branchPrices.map(toBranchPrice);
  }

  return dishRepository.updateDish(id, update);
}