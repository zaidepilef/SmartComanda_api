import { Router } from "express";
import * as ingredientController from "../controllers/ingredientController.js";
import authRequired from "../middleware/authRequired.js";
import requireManager from "../middleware/requireManager.js";
import { validateBody, validateQuery } from "../middleware/validation.js";
import {
  createIngredientSchema,
  listIngredientsQuerySchema,
  updateIngredientSchema,
} from "../validation/ingredientSchemas.js";

const router = Router();

router.use(authRequired);
router.use(requireManager);

router.get("/", validateQuery(listIngredientsQuerySchema), ingredientController.listIngredients);
router.post("/", validateBody(createIngredientSchema), ingredientController.createIngredient);
router.put("/:id", validateBody(updateIngredientSchema), ingredientController.updateIngredient);

export default router;
