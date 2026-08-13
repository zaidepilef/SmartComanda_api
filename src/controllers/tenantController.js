import { BadRequestError, ConflictError, NotFoundError } from "../utils/errors.js";
import * as tenantService from "../services/tenantService.js";

function mapError(error) {
  if (error instanceof BadRequestError) {
    return { status: 400, body: { error: error.message } };
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

export async function listTenants(req, res) {
  try {
    const tenants = await tenantService.listTenants(req.validatedQuery);
    return res.json(tenants);
  } catch (error) {
    return handleError(res, error);
  }
}

export async function createTenant(req, res) {
  try {
    const tenant = await tenantService.createTenant(req.body);
    return res.status(201).json(tenant);
  } catch (error) {
    return handleError(res, error);
  }
}

export async function updateTenant(req, res) {
  try {
    const tenant = await tenantService.updateTenantById(req.params.id, req.body);
    return res.json(tenant);
  } catch (error) {
    return handleError(res, error);
  }
}