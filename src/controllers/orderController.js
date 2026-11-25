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

export async function payOrder(req, res) {
  try {
    const result = await orderService.payOrder(req.user, req.params.id, req.body.paymentMethod);
    return res.json(result);
  } catch (error) {
    return handleError(res, error);
  }
}

/**
 * @swagger
 * /api/orders/{id}/cancel:
 *   post:
 *     summary: Anular un pedido
 *     description: >
 *       Solo Encargado (admin), owner o sysadmin. Exige motivo. Si el pedido estaba cobrado,
 *       revierte su monto en la caja donde se cobró (409 si esa caja ya está cerrada).
 *     tags: [Orders]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [reason]
 *             properties:
 *               reason: { type: string, maxLength: 200 }
 *     responses:
 *       200: { description: Pedido anulado }
 *       400: { description: Falta el motivo }
 *       403: { description: El rol no permite anular }
 *       404: { description: Pedido no encontrado }
 *       409: { description: Estado no anulable o caja de origen cerrada }
 */
export async function cancelOrder(req, res) {
  try {
    const order = await orderService.cancelOrder(req.user, req.params.id, req.body.reason);
    return res.status(200).json(order);
  } catch (error) {
    return handleError(res, error);
  }
}

/**
 * @swagger
 * /api/orders/{id}/reject:
 *   post:
 *     summary: Rechazar un pedido de la app
 *     description: >
 *       Cajero, Encargado, owner o sysadmin. Solo pedidos hechos desde la app del cliente
 *       (retiro o domicilio) en estado `new` y no cobrados. Exige motivo, que el cliente ve
 *       en el seguimiento. El pago queda `voided`.
 *     tags: [Orders]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [reason]
 *             properties:
 *               reason: { type: string, minLength: 3, maxLength: 200 }
 *     responses:
 *       200: { description: Pedido rechazado }
 *       400: { description: Motivo inválido }
 *       403: { description: El rol no permite rechazar }
 *       404: { description: Pedido no encontrado }
 *       409: { description: El pedido no es de la app, ya está en preparación o está cobrado }
 */
export async function rejectOrder(req, res) {
  try {
    const order = await orderService.rejectOrder(req.user, req.params.id, req.body.reason);
    return res.json(order);
  } catch (error) {
    return handleError(res, error);
  }
}

/**
 * @swagger
 * /api/orders/{id}/dispatch:
 *   post:
 *     summary: Salir a reparto
 *     description: >
 *       Pasa un domicilio de la app de `ready` a `out_for_delivery`. El repartidor se lo
 *       asigna a sí mismo; Encargado o superior puede indicar `driverId`.
 *     tags: [Orders]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               driverId: { type: string }
 *     responses:
 *       200: { description: Pedido en reparto }
 *       403: { description: El rol no permite despachar o asignar }
 *       409: { description: El pedido no está listo o ya lo tomó otro repartidor }
 */
export async function dispatchOrder(req, res) {
  try {
    const order = await orderService.dispatchOrder(req.user, req.params.id, req.body);
    return res.json(order);
  } catch (error) {
    return handleError(res, error);
  }
}

/**
 * @swagger
 * /api/orders/{id}/driver:
 *   put:
 *     summary: Reasignar repartidor
 *     description: Encargado o superior. Pedido `ready` u `out_for_delivery`.
 *     tags: [Orders]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [driverId]
 *             properties:
 *               driverId: { type: string }
 *     responses:
 *       200: { description: Repartidor asignado }
 *       400: { description: Repartidor no válido para la sucursal }
 *       409: { description: Estado no reasignable }
 */
export async function assignDriver(req, res) {
  try {
    const order = await orderService.assignDriver(req.user, req.params.id, req.body.driverId);
    return res.json(order);
  } catch (error) {
    return handleError(res, error);
  }
}

/**
 * @swagger
 * /api/orders/{id}/deliver:
 *   post:
 *     summary: Cobrar y entregar un domicilio
 *     description: >
 *       Repartidor asignado o Encargado o superior. En una transacción registra el cobro en la
 *       caja abierta de la sucursal y marca el pedido como `delivered`. En efectivo exige
 *       `cashReceived` mayor o igual al total y devuelve el vuelto. Si el pedido ya estaba
 *       pagado (cobrado en caja antes del cobro contra entrega), solo lo marca `delivered`:
 *       no exige caja abierta, no cambia el pago y `paymentMethod` se ignora.
 *     tags: [Orders]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               paymentMethod: { type: string, enum: [cash, debit, credit], description: "Obligatorio si el pedido no está pagado" }
 *               cashReceived: { type: number }
 *     responses:
 *       200: { description: "Pedido pagado y entregado: { order, change, pointsEarned? }" }
 *       400: { description: Falta el medio de pago, efectivo insuficiente o medio no habilitado }
 *       403: { description: Pedido asignado a otro repartidor }
 *       409: { description: Pedido no en reparto, anulado o sin caja abierta }
 */
export async function deliverOrder(req, res) {
  try {
    const result = await orderService.deliverOrder(req.user, req.params.id, req.body);
    return res.json(result);
  } catch (error) {
    return handleError(res, error);
  }
}

/**
 * @swagger
 * /api/orders/{id}/payment-declined:
 *   post:
 *     summary: Registrar cobro con tarjeta rechazado en la entrega
 *     description: El pago queda `declined` y el pedido sigue en reparto; se puede cobrar después.
 *     tags: [Orders]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               note: { type: string, maxLength: 200 }
 *     responses:
 *       200: { description: Rechazo registrado }
 *       403: { description: Pedido asignado a otro repartidor }
 *       409: { description: Pedido no en reparto o ya pagado }
 */
export async function declinePayment(req, res) {
  try {
    const order = await orderService.declinePayment(req.user, req.params.id, req.body.note);
    return res.json(order);
  } catch (error) {
    return handleError(res, error);
  }
}

/**
 * @swagger
 * /api/orders/{id}/items:
 *   put:
 *     summary: Corregir los ítems de un pedido
 *     description: >
 *       Solo Encargado (admin), owner o sysadmin, y solo para pedidos sin cobrar que cocina
 *       aún no empezó. Los precios se recalculan en el servidor.
 *     tags: [Orders]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [items]
 *             properties:
 *               items:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required: [dishId, quantity]
 *                   properties:
 *                     dishId: { type: string }
 *                     quantity: { type: integer, minimum: 1 }
 *     responses:
 *       200: { description: Pedido corregido }
 *       403: { description: El rol no permite corregir }
 *       409: { description: El pedido ya se cobró o está en preparación }
 */
export async function correctOrder(req, res) {
  try {
    const order = await orderService.correctOrder(req.user, req.params.id, req.body.items);
    return res.status(200).json(order);
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

/**
 * @swagger
 * /api/orders/delivery-analytics:
 *   get:
 *     summary: Reporte de análisis de delivery
 *     description: >
 *       Pedidos a domicilio del periodo con distancia, minutos estimados y fuera de rango,
 *       más totales y tramos de distancia. Solo Encargado, owner y sysadmin.
 *     tags: [Orders]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: branchId
 *         schema: { type: string }
 *       - in: query
 *         name: from
 *         schema: { type: string, format: date-time }
 *       - in: query
 *         name: to
 *         schema: { type: string, format: date-time }
 *     responses:
 *       200:
 *         description: Reporte de delivery
 *       403:
 *         description: El rol no permite ver el reporte
 */
export async function getDeliveryAnalytics(req, res) {
  try {
    const result = await orderService.getDeliveryAnalytics(req.user, req.validatedQuery);
    return res.json(result);
  } catch (error) {
    return handleError(res, error);
  }
}
