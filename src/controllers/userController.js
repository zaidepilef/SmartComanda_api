import { BadRequestError, ConflictError, NotFoundError } from "../utils/errors.js";
import * as userService from "../services/userService.js";

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

export async function createUser(req, res) {
  try {
    const user = await userService.createUserWithPassword(req.body);
    return res.status(201).json(user);
  } catch (error) {
    return handleError(res, error);
  }
}

export async function getUser(req, res) {
  try {
    const user = await userService.getUser(req.params.id);
    return res.json(user);
  } catch (error) {
    return handleError(res, error);
  }
}

export async function updateUser(req, res) {
  try {
    const user = await userService.updateUserById(req.params.id, req.body);
    return res.json(user);
  } catch (error) {
    return handleError(res, error);
  }
}

export async function deleteUser(req, res) {
  try {
    await userService.deleteUserById(req.params.id);
    return res.status(204).end();
  } catch (error) {
    return handleError(res, error);
  }
}

export async function listUsers(req, res) {
  try {
    const result = await userService.listUsersPaginated(req.validatedQuery);
    return res.json(result);
  } catch (error) {
    return handleError(res, error);
  }
}
