import { Router } from "express";
import * as publicController from "../controllers/publicController.js";
import { publicRateLimit } from "../middleware/rateLimit.js";
import { validateBody, validateQuery } from "../middleware/validation.js";
import {
  createPublicOrderSchema,
  customerBalanceQuerySchema,
  publicMenuQuerySchema,
} from "../validation/publicSchemas.js";

const router = Router();

router.use(publicRateLimit);

router.get(
  "/menu",
  validateQuery(publicMenuQuerySchema),
  publicController.getPublicMenu
);
router.post(
  "/orders",
  validateBody(createPublicOrderSchema),
  publicController.createPublicOrder
);
router.get(
  "/customers/balance",
  validateQuery(customerBalanceQuerySchema),
  publicController.getCustomerBalance
);

export default router;