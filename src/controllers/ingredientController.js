import { BadRequestError, ConflictError, ForbiddenError, NotFoundError } from "../utils/errors.js";
import * as ingredientService from "../services/ingredientService.js";

function mapError(error) {
  if (error instanceof BadRequestError) {
    return { status: 400, body: { error: error.message } };
  }

  if (error instanceof ForbiddenError) {
    return { status: 403, body: { error: error.message } };
  }

  if (error instanceof NotFoundError) {
    return { status: 404, body: { error: error.message } };
  }

  if (error instanceof ConflictError) {
    return { status: 409, body: { error: error.message } };
  }

  return { status: 500, body: { error: "Internal server error." } };
}

function handleError(res, error) {
  const { status, body } = mapError(error);
  return res.status(status).json(body);
}

export async function listIngredients(req, res) {
  try {
    const ingredients = await ingredientService.listIngredients(req.user, req.validatedQuery);
    return res.json(ingredients);
  } catch (error) {
    return handleError(res, error);
  }
}

export async function createIngredient(req, res) {
  try {
    const ingredient = await ingredientService.createIngredient(req.user, req.body);
    return res.status(201).json(ingredient);
  } catch (error) {
    return handleError(res, error);
  }
}

export async function updateIngredient(req, res) {
  try {
    const ingredient = await ingredientService.updateIngredientById(
      req.user,
      req.params.id,
      req.body
    );
    return res.json(ingredient);
  } catch (error) {
    return handleError(res, error);
  }
}
