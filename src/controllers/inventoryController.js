import { BadRequestError, ForbiddenError, NotFoundError } from "../utils/errors.js";
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

  return { status: 500, body: { error: "Internal server error." } };
}

function handleError(res, error) {
  const { status, body } = mapError(error);
  return res.status(status).json(body);
}

/**
 * @swagger
 * /api/inventory/stock:
 *   get:
 *     summary: Listar stock
 *     description: Devuelve el stock de ingredientes, siempre por sucursal (bodega). Requiere rol manager.
 *     tags: [Inventory]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: tenantId
 *         schema:
 *           type: string
 *         description: Filtrar por tenant
 *       - in: query
 *         name: branchId
 *         schema:
 *           type: string
 *         description: Filtrar por sucursal
 *     responses:
 *       200:
 *         description: Lista de stock agregado por ingrediente y sucursal
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/StockItem'
 *       401:
 *         description: Token ausente o inválido
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
export async function listStock(req, res) {
  try {
    const stock = await inventoryService.listStock(req.user, req.validatedQuery);
    return res.json(stock);
  } catch (error) {
    return handleError(res, error);
  }
}

/**
 * @swagger
 * /api/inventory/stock/adjustments:
 *   post:
 *     summary: Ajustar stock
 *     description: Registra una entrada (compra con costo unitario puesto en bodega) o salida (consumo FIFO) de stock en una sucursal. Requiere rol manager.
 *     tags: [Inventory]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [tenantId, ingredientId, branchId, type, quantity, reason]
 *             properties:
 *               tenantId:
 *                 type: string
 *               ingredientId:
 *                 type: string
 *               branchId:
 *                 type: string
 *               type:
 *                 type: string
 *                 enum: [entry, exit]
 *               quantity:
 *                 type: number
 *                 exclusiveMinimum: 0
 *               reason:
 *                 type: string
 *               unitCost:
 *                 type: number
 *                 description: Costo unitario puesto en bodega. Obligatorio para entradas.
 *     responses:
 *       201:
 *         description: Stock ajustado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Movement'
 *       400:
 *         description: Datos inválidos o stock insuficiente
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       403:
 *         description: Sin permisos para ajustar stock
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
export async function adjustStock(req, res) {
  try {
    const adjusted = await inventoryService.adjustStock(req.user, req.body);
    return res.status(201).json(adjusted);
  } catch (error) {
    return handleError(res, error);
  }
}

/**
 * @swagger
 * /api/inventory/movements:
 *   get:
 *     summary: Listar movimientos
 *     description: Devuelve el historial de movimientos de stock. Requiere rol manager.
 *     tags: [Inventory]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: tenantId
 *         schema:
 *           type: string
 *         description: Filtrar por tenant
 *       - in: query
 *         name: ingredientId
 *         schema:
 *           type: string
 *         description: Filtrar por ingrediente
 *       - in: query
 *         name: branchId
 *         schema:
 *           type: string
 *         description: Filtrar por sucursal
 *     responses:
 *       200:
 *         description: Lista de movimientos
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Movement'
 *       401:
 *         description: Token ausente o inválido
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
export async function listMovements(req, res) {
  try {
    const movements = await inventoryService.listMovements(req.user, req.validatedQuery);
    return res.json(movements);
  } catch (error) {
    return handleError(res, error);
  }
}