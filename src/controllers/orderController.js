import {
  BadRequestError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from "../utils/errors.js";
import * as orderService from "../services/orderService.js";

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

/**
 * @swagger
 * /api/orders:
 *   post:
 *     summary: Crear un pedido
 *     description: Crea un nuevo pedido con uno o más platos.
 *     tags: [Orders]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/OrderRequest'
 *     responses:
 *       201:
 *         description: Pedido creado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Order'
 *       400:
 *         description: Datos inválidos
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       401:
 *         description: Token ausente o inválido
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
export async function createOrder(req, res) {
  try {
    const result = await orderService.createOrder(req.user, req.body);
    return res.status(201).json(result);
  } catch (error) {
    return handleError(res, error);
  }
}

export async function listOrders(req, res) {
  try {
    const orders = await orderService.listOrders(req.user, req.validatedQuery);
    return res.status(200).json(orders);
  } catch (error) {
    return handleError(res, error);
  }
}

export async function getOrder(req, res) {
  try {
    const order = await orderService.getOrder(req.user, req.params.id);
    return res.status(200).json(order);
  } catch (error) {
    return handleError(res, error);
  }
}

export async function updateOrderStatus(req, res) {
  try {
    const order = await orderService.updateOrderStatus(
      req.user,
      req.params.id,
      req.body.status
    );
    return res.status(200).json(order);
  } catch (error) {
    return handleError(res, error);
  }
}
