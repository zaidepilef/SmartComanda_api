import { Router } from "express";
import * as dishController from "../controllers/dishController.js";
import authRequired from "../middleware/authRequired.js";
import requireManager from "../middleware/requireManager.js";
import { validateBody, validateQuery } from "../middleware/validation.js";
import {
  createDishSchema,
  listDishesQuerySchema,
  updateDishSchema,
} from "../validation/dishSchemas.js";

const router = Router();

router.use(authRequired);

router.get("/", validateQuery(listDishesQuerySchema), dishController.listDishes);
router.post("/", requireManager, validateBody(createDishSchema), dishController.createDish);
router.put("/:id", requireManager, validateBody(updateDishSchema), dishController.updateDish);

export default router;
