import { Router } from "express";
import * as cashSessionController from "../controllers/cashSessionController.js";
import authRequired from "../middleware/authRequired.js";
import { validateBody, validateQuery } from "../middleware/validation.js";
import {
  currentCashSessionQuerySchema,
  openCashSessionSchema,
} from "../validation/cashSessionSchemas.js";

const router = Router();

router.use(authRequired);

router.post(
  "/",
  validateBody(openCashSessionSchema),
  cashSessionController.openCashSession
);
router.get(
  "/current",
  validateQuery(currentCashSessionQuerySchema),
  cashSessionController.getCurrentCashSession
);

export default router;
