import {
  BadRequestError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from "../utils/errors.js";
import * as cashSessionService from "../services/cashSessionService.js";

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

export async function openCashSession(req, res) {
  try {
    const session = await cashSessionService.openCashSession(req.user, req.body);
    return res.status(201).json(session);
  } catch (error) {
    return handleError(res, error);
  }
}

export async function getCurrentCashSession(req, res) {
  try {
    const session = await cashSessionService.getCurrentCashSession(
      req.user,
      req.query
    );
    return res.status(200).json(session);
  } catch (error) {
    return handleError(res, error);
  }
}
