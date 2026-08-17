import { BadRequestError, ConflictError, ForbiddenError, NotFoundError } from "../utils/errors.js";
import * as ingredientService from "../services/ingredientService.js";

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
 * /api/ingredients:
 *   get:
 *     summary: Listar ingredientes
 *     description: Devuelve la lista de ingredientes según el rol del actor. Requiere rol manager.
 *     tags: [Ingredients]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: tenantId
 *         schema:
 *           type: string
 *         description: Filtrar por tenant
 *       - in: query
 *         name: q
 *         schema:
 *           type: string
 *         description: Búsqueda por texto
 *     responses:
 *       200:
 *         description: Lista de ingredientes
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Ingredient'
 *       401:
 *         description: Token ausente o inválido
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
export async function listIngredients(req, res) {
  try {
    const ingredients = await ingredientService.listIngredients(req.user, req.validatedQuery);
    return res.json(ingredients);
  } catch (error) {
    return handleError(res, error);
  }
}

/**
 * @swagger
 * /api/ingredients:
 *   post:
 *     summary: Crear un ingrediente
 *     description: Crea un nuevo ingrediente. Requiere rol manager.
 *     tags: [Ingredients]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [tenantId, name, unit, dimension, unitCost]
 *             properties:
 *               tenantId:
 *                 type: string
 *               name:
 *                 type: string
 *               unit:
 *                 type: string
 *               dimension:
 *                 type: string
 *                 enum: [count, mass, volume]
 *               unitCost:
 *                 type: number
 *                 minimum: 0
 *               notes:
 *                 type: string
 *     responses:
 *       201:
 *         description: Ingrediente creado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Ingredient'
 *       400:
 *         description: Datos inválidos
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       403:
 *         description: Sin permisos para crear ingredientes
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
export async function createIngredient(req, res) {
  try {
    const ingredient = await ingredientService.createIngredient(req.user, req.body);
    return res.status(201).json(ingredient);
  } catch (error) {
    return handleError(res, error);
  }
}

/**
 * @swagger
 * /api/ingredients/{id}:
 *   put:
 *     summary: Actualizar un ingrediente
 *     description: Actualiza los datos de un ingrediente. Requiere rol manager.
 *     tags: [Ingredients]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Identificador del ingrediente
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               unit:
 *                 type: string
 *               dimension:
 *                 type: string
 *                 enum: [count, mass, volume]
 *               unitCost:
 *                 type: number
 *                 minimum: 0
 *               notes:
 *                 type: string
 *     responses:
 *       200:
 *         description: Ingrediente actualizado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Ingredient'
 *       400:
 *         description: Datos inválidos
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       403:
 *         description: Sin permisos para actualizar ingredientes
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       404:
 *         description: Ingrediente no encontrado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
export async function updateIngredient(req, res) {
  try {
    const ingredient = await ingredientService.updateIngredientById(
      req.user,
      req.params.id,
      req.body
    );
    return res.json(ingredient);
  } catch (error) {
    return handleError(res, error);
  }
}
