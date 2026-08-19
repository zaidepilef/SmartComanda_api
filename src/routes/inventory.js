import { Router } from "express";
import * as inventoryController from "../controllers/inventoryController.js";
import authRequired from "../middleware/authRequired.js";
import requireManager from "../middleware/requireManager.js";
import { validateBody, validateQuery } from "../middleware/validation.js";
import {
  adjustStockSchema,
  listMovementsQuerySchema,
  listStockQuerySchema,
} from "../validation/inventorySchemas.js";

const router = Router();

router.use(authRequired);
router.use(requireManager);

router.get("/stock", validateQuery(listStockQuerySchema), inventoryController.listStock);
router.post("/stock/adjustments", validateBody(adjustStockSchema), inventoryController.adjustStock);
router.get("/movements", validateQuery(listMovementsQuerySchema), inventoryController.listMovements);

export default router;