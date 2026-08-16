import { Router } from "express";
import * as inventoryController from "../controllers/inventoryController.js";
import authRequired from "../middleware/authRequired.js";
import requireManager from "../middleware/requireManager.js";
import requireOwner from "../middleware/requireOwner.js";
import { validateBody, validateQuery } from "../middleware/validation.js";
import {
  adjustStockSchema,
  listMovementsQuerySchema,
  listStockQuerySchema,
  warehouseModeSchema,
} from "../validation/inventorySchemas.js";

const router = Router();

router.use(authRequired);
router.use(requireManager);

router.get("/mode", inventoryController.getWarehouseMode);
router.put(
  "/mode",
  requireOwner,
  validateBody(warehouseModeSchema),
  inventoryController.setWarehouseMode
);
router.get("/stock", validateQuery(listStockQuerySchema), inventoryController.listStock);
router.post("/stock/adjustments", validateBody(adjustStockSchema), inventoryController.adjustStock);
router.get("/movements", validateQuery(listMovementsQuerySchema), inventoryController.listMovements);

export default router;
