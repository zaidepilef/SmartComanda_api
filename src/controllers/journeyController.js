import { BadRequestError, ForbiddenError, NotFoundError } from "../utils/errors.js";
import * as journeyService from "../services/journeyService.js";

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

  console.error("Journey error:", error.message);
  return { status: 500, body: { error: "Internal server error." } };
}

function handleError(res, error) {
  const { status, body } = mapError(error);
  return res.status(status).json(body);
}

/**
 * @swagger
 * /api/public/events:
 *   post:
 *     summary: Registrar eventos del recorrido del cliente (QR)
 *     description: >
 *       Recibe un lote (máx. 50) de eventos de una sesión anónima del flujo de pedido por QR.
 *       Acepta `application/json` y `text/plain` (para navigator.sendBeacon). Público, con límite de tasa.
 *       `identity_submitted` resuelve el cliente por teléfono y no guarda nombre ni teléfono en el evento.
 *     tags: [Public]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [tenantId, branchId, sessionId, events]
 *             properties:
 *               tenantId: { type: string }
 *               branchId: { type: string }
 *               sessionId: { type: string, format: uuid }
 *               events:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required: [type, occurredAt]
 *                   properties:
 *                     type:
 *                       type: string
 *                       enum: [qr_opened, menu_loaded, menu_failed, identity_submitted, item_added, item_removed, cart_opened, order_submitted, order_failed]
 *                     occurredAt: { type: string, format: date-time }
 *                     data: { type: object }
 *     responses:
 *       202: { description: Eventos aceptados }
 *       400: { description: Lote inválido }
 *       404: { description: Tenant o sucursal no encontrados }
 *       429: { description: Demasiadas peticiones }
 */
export async function ingestEvents(req, res) {
  try {
    const accepted = await journeyService.ingestClientEvents(req.body);
    return res.status(202).json({ accepted });
  } catch (error) {
    return handleError(res, error);
  }
}

/**
 * @swagger
 * /api/branches/{id}/journey/sessions:
 *   get:
 *     summary: Sesiones del recorrido de clientes QR de una sucursal
 *     description: Lista sesiones con actividad en el rango (por defecto, últimas 24 h) con su etapa derivada. Requiere rol manager y la sucursal debe ser del tenant del usuario.
 *     tags: [Journey]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string } }
 *       - { in: query, name: from, schema: { type: string, format: date-time } }
 *       - { in: query, name: to, schema: { type: string, format: date-time } }
 *       - { in: query, name: limit, schema: { type: integer, maximum: 500 } }
 *     responses:
 *       200: { description: Lista de sesiones }
 *       403: { description: Sucursal de otro tenant }
 */
export async function listSessions(req, res) {
  try {
    const sessions = await journeyService.listSessions(req.user, req.params.id, req.validatedQuery);
    return res.json(sessions);
  } catch (error) {
    return handleError(res, error);
  }
}

/**
 * @swagger
 * /api/branches/{id}/journey/sessions/{sessionId}:
 *   get:
 *     summary: Línea de tiempo de una sesión
 *     tags: [Journey]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string } }
 *       - { in: path, name: sessionId, required: true, schema: { type: string, format: uuid } }
 *     responses:
 *       200: { description: Eventos de la sesión en orden cronológico }
 *       404: { description: Sesión no encontrada }
 */
export async function getSessionTimeline(req, res) {
  try {
    const timeline = await journeyService.getSessionTimeline(
      req.user,
      req.params.id,
      req.validatedParams.sessionId
    );
    return res.json(timeline);
  } catch (error) {
    return handleError(res, error);
  }
}

/**
 * @swagger
 * /api/branches/{id}/journey/funnel:
 *   get:
 *     summary: Embudo de conversión del flujo QR
 *     tags: [Journey]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string } }
 *       - { in: query, name: from, schema: { type: string, format: date-time } }
 *       - { in: query, name: to, schema: { type: string, format: date-time } }
 *     responses:
 *       200: { description: Sesiones por paso e intentos fallidos }
 */
export async function getFunnel(req, res) {
  try {
    const funnel = await journeyService.getFunnel(req.user, req.params.id, req.validatedQuery);
    return res.json(funnel);
  } catch (error) {
    return handleError(res, error);
  }
}
