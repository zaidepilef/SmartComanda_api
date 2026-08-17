import { BadRequestError, ConflictError, ForbiddenError, NotFoundError } from "../utils/errors.js";
import * as dishService from "../services/dishService.js";

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
 * /api/dishes:
 *   get:
 *     summary: Listar platos
 *     description: Devuelve la lista de platos según el rol del actor. Requiere rol manager.
 *     tags: [Dishes]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: tenantId
 *         schema:
 *           type: string
 *         description: Filtrar por tenant
 *       - in: query
 *         name: active
 *         schema:
 *           type: string
 *           enum: [true, false]
 *         description: Filtrar por estado activo
 *       - in: query
 *         name: q
 *         schema:
 *           type: string
 *         description: Búsqueda por texto
 *       - in: query
 *         name: branchId
 *         schema:
 *           type: string
 *         description: Enriquecer cada plato con su costo FIFO en esa sucursal
 *     responses:
 *       200:
 *         description: Lista de platos
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Dish'
 *       401:
 *         description: Token ausente o inválido
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
export async function listDishes(req, res) {
  try {
    const dishes = await dishService.listDishes(req.user, req.validatedQuery);
    return res.json(dishes);
  } catch (error) {
    return handleError(res, error);
  }
}

/**
 * @swagger
 * /api/dishes:
 *   post:
 *     summary: Crear un plato
 *     description: Crea un nuevo plato con su receta. Requiere rol manager.
 *     tags: [Dishes]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [tenantId, name, salePrice, recipe]
 *             properties:
 *               tenantId:
 *                 type: string
 *               name:
 *                 type: string
 *               salePrice:
 *                 type: number
 *                 minimum: 0
 *               recipe:
 *                 type: array
 *                 minItems: 1
 *                 items:
 *                   type: object
 *                   required: [ingredientId, quantity, unit]
 *                   properties:
 *                     ingredientId:
 *                       type: string
 *                     quantity:
 *                       type: number
 *                       exclusiveMinimum: 0
 *                     unit:
 *                       type: string
 *               active:
 *                 type: boolean
 *                 default: true
 *               description:
 *                 type: string
 *     responses:
 *       201:
 *         description: Plato creado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Dish'
 *       400:
 *         description: Datos inválidos
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       403:
 *         description: Sin permisos para crear platos
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
export async function createDish(req, res) {
  try {
    const dish = await dishService.createDish(req.user, req.body);
    return res.status(201).json(dish);
  } catch (error) {
    return handleError(res, error);
  }
}

/**
 * @swagger
 * /api/dishes/{id}:
 *   put:
 *     summary: Actualizar un plato
 *     description: Actualiza los datos de un plato. Requiere rol manager.
 *     tags: [Dishes]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Identificador del plato
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               salePrice:
 *                 type: number
 *                 minimum: 0
 *               recipe:
 *                 type: array
 *                 minItems: 1
 *                 items:
 *                   type: object
 *                   required: [ingredientId, quantity, unit]
 *                   properties:
 *                     ingredientId:
 *                       type: string
 *                     quantity:
 *                       type: number
 *                       exclusiveMinimum: 0
 *                     unit:
 *                       type: string
 *               active:
 *                 type: boolean
 *               description:
 *                 type: string
 *     responses:
 *       200:
 *         description: Plato actualizado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Dish'
 *       400:
 *         description: Datos inválidos
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       403:
 *         description: Sin permisos para actualizar platos
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       404:
 *         description: Plato no encontrado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
export async function updateDish(req, res) {
  try {
    const dish = await dishService.updateDishById(req.user, req.params.id, req.body);
    return res.json(dish);
  } catch (error) {
    return handleError(res, error);
  }
}
