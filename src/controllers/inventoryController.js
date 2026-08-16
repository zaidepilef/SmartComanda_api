import { BadRequestError, ConflictError, ForbiddenError, NotFoundError } from "../utils/errors.js";
import * as inventoryService from "../services/inventoryService.js";

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

export async function getWarehouseMode(req, res) {
  try {
    const mode = await inventoryService.getWarehouseMode(req.user, req.query.tenantId);
    return res.json(mode);
  } catch (error) {
    return handleError(res, error);
  }
}

export async function setWarehouseMode(req, res) {
  try {
    const tenant = await inventoryService.setWarehouseMode(
      req.user,
      req.body.tenantId,
      req.body.warehouseMode
    );
    return res.json({ warehouseMode: tenant.warehouseMode });
  } catch (error) {
    return handleError(res, error);
  }
}

export async function listStock(req, res) {
  try {
    const stock = await inventoryService.listStock(req.user, req.validatedQuery);
    return res.json(stock);
  } catch (error) {
    return handleError(res, error);
  }
}

export async function adjustStock(req, res) {
  try {
    const adjusted = await inventoryService.adjustStock(req.user, req.body);
    return res.status(201).json(adjusted);
  } catch (error) {
    return handleError(res, error);
  }
}

export async function listMovements(req, res) {
  try {
    const movements = await inventoryService.listMovements(req.user, req.validatedQuery);
    return res.json(movements);
  } catch (error) {
    return handleError(res, error);
  }
}
