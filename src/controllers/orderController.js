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
