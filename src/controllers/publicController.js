import {
  BadRequestError,
  ConflictError,
  NotFoundError,
  UnprocessableError,
} from "../utils/errors.js";
import * as publicService from "../services/publicService.js";

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

  if (error instanceof UnprocessableError) {
    return { status: 422, body: { error: error.message, code: error.code } };
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

/**
 * @swagger
 * /api/public/orders:
 *   post:
 *     summary: Crear un pedido desde la app del cliente
 *     description: >
 *       Retiro (`qr`) o domicilio (`delivery`). Precios calculados en el servidor, pago siempre
 *       `pending`. Idempotente por `clientRequestId`: repetirlo con el mismo teléfono devuelve el
 *       pedido existente con 200 (sin `trackingToken`). El `trackingToken` se entrega una sola vez.
 *       Domicilio fuera de cobertura → 422 `DELIVERY_OUT_OF_RANGE`; sucursal sin domicilio → 422
 *       `DELIVERY_UNAVAILABLE`.
 *     tags: [Public]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [tenantId, branchId, name, phone, clientRequestId, expectedPaymentMethod, items]
 *             properties:
 *               tenantId: { type: string }
 *               branchId: { type: string }
 *               name: { type: string, maxLength: 80 }
 *               phone: { type: string, example: "+56912345678" }
 *               orderType: { type: string, enum: [qr, delivery], default: qr }
 *               clientRequestId: { type: string, format: uuid }
 *               expectedPaymentMethod: { type: string, enum: [cash, debit, credit, card] }
 *               cashTendered: { type: integer }
 *               delivery:
 *                 type: object
 *                 properties:
 *                   addressId: { type: string }
 *                   address: { type: string }
 *                   reference: { type: string }
 *                   lat: { type: number }
 *                   lng: { type: number }
 *                   accuracy: { type: number }
 *               items:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required: [dishId, quantity]
 *                   properties:
 *                     dishId: { type: string }
 *                     quantity: { type: integer }
 *                     note: { type: string, maxLength: 140 }
 *     responses:
 *       201: { description: Pedido creado (incluye trackingToken) }
 *       200: { description: Pedido ya creado con ese clientRequestId }
 *       400: { description: Datos inválidos }
 *       409: { description: clientRequestId usado por otro teléfono }
 *       422: { description: Domicilio no disponible o fuera de cobertura }
 */
export async function createPublicOrder(req, res) {
  try {
    const { replayed, order } = await publicService.createPublicOrder(req.body);
    return res.status(replayed ? 200 : 201).json(order);
  } catch (error) {
    return handleError(res, error);
  }
}

/**
 * @swagger
 * /api/public/customers/lookup:
 *   post:
 *     summary: Reconocer al cliente por teléfono
 *     description: >
 *       Devuelve solo el primer nombre y las direcciones guardadas enmascaradas. Para un
 *       teléfono desconocido devuelve `{ known: false }`. Límite estricto por IP y por teléfono.
 *     tags: [Public]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [tenantId, branchId, phone]
 *             properties:
 *               tenantId: { type: string }
 *               branchId: { type: string }
 *               phone: { type: string }
 *     responses:
 *       200: { description: "{ known, firstName?, addresses?: [{ id, label }], lastAddressId? }" }
 *       429: { description: Demasiadas consultas }
 */
export async function lookupCustomer(req, res) {
  try {
    const result = await publicService.lookupCustomer(req.body);
    return res.json(result);
  } catch (error) {
    return handleError(res, error);
  }
}

/**
 * @swagger
 * /api/public/orders/track:
 *   post:
 *     summary: Seguimiento del pedido
 *     description: >
 *       Estado visible al cliente a partir del token entregado al crear el pedido. No incluye
 *       dirección, coordenadas, teléfono ni nombre.
 *     tags: [Public]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [tenantId, trackingToken]
 *             properties:
 *               tenantId: { type: string }
 *               trackingToken: { type: string }
 *     responses:
 *       200: { description: Estado del pedido }
 *       404: { description: Token desconocido }
 */
export async function trackOrder(req, res) {
  try {
    const result = await publicService.trackOrder(req.body);
    return res.json(result);
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

export async function getDeliveryEstimate(req, res) {
  try {
    const result = await publicService.getDeliveryEstimate(req.body);
    return res.json(result);
  } catch (error) {
    return handleError(res, error);
  }
}
