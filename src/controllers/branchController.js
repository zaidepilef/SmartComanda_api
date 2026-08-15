import { BadRequestError, ConflictError, ForbiddenError, NotFoundError } from "../utils/errors.js";
import * as branchService from "../services/branchService.js";

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

export async function listBranches(req, res) {
  try {
    const branches = await branchService.listBranches(req.user, req.validatedQuery);
    return res.json(branches);
  } catch (error) {
    return handleError(res, error);
  }
}

export async function createBranch(req, res) {
  try {
    const branch = await branchService.createBranch(req.user, req.body);
    return res.status(201).json(branch);
  } catch (error) {
    return handleError(res, error);
  }
}

export async function updateBranch(req, res) {
  try {
    const branch = await branchService.updateBranchById(req.user, req.params.id, req.body);
    return res.json(branch);
  } catch (error) {
    return handleError(res, error);
  }
}

export async function getBranch(req, res) {
  try {
    const branch = await branchService.getBranchById(req.user, req.params.id);
    return res.json(branch);
  } catch (error) {
    return handleError(res, error);
  }
}
