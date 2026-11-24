import { Router } from "express";
import * as cashSessionController from "../controllers/cashSessionController.js";
import authRequired from "../middleware/authRequired.js";
import requirePermission from "../middleware/requirePermission.js";
import { validateBody, validateParams, validateQuery } from "../middleware/validation.js";
import {
  closeCashSessionParamsSchema,
  closeCashSessionSchema,
  currentCashSessionQuerySchema,
  openCashSessionSchema,
} from "../validation/cashSessionSchemas.js";

const router = Router();

router.use(authRequired);

router.post(
  "/",
  requirePermission("cash.open"),
  validateBody(openCashSessionSchema),
  cashSessionController.openCashSession
);
router.get(
  "/current",
  requirePermission("cash.read"),
  validateQuery(currentCashSessionQuerySchema),
  cashSessionController.getCurrentCashSession
);
router.post(
  "/:id/close",
  requirePermission("cash.close"),
  validateParams(closeCashSessionParamsSchema),
  validateBody(closeCashSessionSchema),
  cashSessionController.closeCashSession
);

export default router;
