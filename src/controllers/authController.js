import * as authService from "../services/authService.js";
import * as userService from "../services/userService.js";
import { verifyTurnstileToken } from "../services/captchaService.js";
import { USER_STATUS } from "../models/user.js";
import {
  BadRequestError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
} from "../utils/errors.js";

function mapError(error) {
  if (error instanceof BadRequestError) {
    return { status: 400, body: { error: error.message } };
  }

  if (error instanceof UnauthorizedError) {
    return { status: 401, body: { error: error.message } };
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

export async function login(req, res) {
  try {
    const { email, password } = req.body;
    const result = await authService.login(email, password);
    return res.json(result);
  } catch (error) {
    return handleError(res, error);
  }
}

export async function register(req, res) {
  try {
    const { captchaToken, ...userInput } = req.body;

    const isHuman = await verifyTurnstileToken(captchaToken, req.ip);

    if (!isHuman) {
      throw new BadRequestError("Captcha verification failed.");
    }

    const user = await userService.createUserWithPassword({
      ...userInput,
      status: USER_STATUS.PENDING,
    });
    return res.status(201).json(user);
  } catch (error) {
    return handleError(res, error);
  }
}

export async function me(req, res) {
  return res.json(req.user);
}

export async function logout(req, res) {
  try {
    await authService.logout(req.token);
    return res.status(204).send();
  } catch (error) {
    return handleError(res, error);
  }
}