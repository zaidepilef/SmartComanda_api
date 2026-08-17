import { BadRequestError, NotFoundError } from "../utils/errors.js";
import * as publicService from "../services/publicService.js";

function mapError(error) {
  if (error instanceof BadRequestError) {
    return { status: 400, body: { error: error.message } };
  }

  if (error instanceof NotFoundError) {
    return { status: 404, body: { error: error.message } };
  }

  return { status: 500, body: { error: "Internal server error." } };
}

function handleError(res, error) {
  const { status, body } = mapError(error);
  return res.status(status).json(body);
}

export async function getPublicMenu(req, res) {
  try {
    const menu = await publicService.getPublicMenu(req.validatedQuery);
    return res.json(menu);
  } catch (error) {
    return handleError(res, error);
  }
}

export async function createPublicOrder(req, res) {
  try {
    const result = await publicService.createPublicOrder(req.body);
    return res.status(201).json(result);
  } catch (error) {
    return handleError(res, error);
  }
}

export async function getCustomerBalance(req, res) {
  try {
    const result = await publicService.getCustomerBalance(req.validatedQuery);
    return res.json(result);
  } catch (error) {
    return handleError(res, error);
  }
}