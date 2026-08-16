import { BadRequestError, ConflictError, ForbiddenError, NotFoundError } from "../utils/errors.js";
import * as dishService from "../services/dishService.js";

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

export async function listDishes(req, res) {
  try {
    const dishes = await dishService.listDishes(req.user, req.validatedQuery);
    return res.json(dishes);
  } catch (error) {
    return handleError(res, error);
  }
}

export async function createDish(req, res) {
  try {
    const dish = await dishService.createDish(req.user, req.body);
    return res.status(201).json(dish);
  } catch (error) {
    return handleError(res, error);
  }
}

export async function updateDish(req, res) {
  try {
    const dish = await dishService.updateDishById(req.user, req.params.id, req.body);
    return res.json(dish);
  } catch (error) {
    return handleError(res, error);
  }
}
