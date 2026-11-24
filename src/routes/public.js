import { Router } from "express";
import * as publicController from "../controllers/publicController.js";
import { publicRateLimit } from "../middleware/rateLimit.js";
import { trackOrderOutcome } from "../middleware/trackOrderOutcome.js";
import { validateBody, validateQuery } from "../middleware/validation.js";
import {
  createPublicOrderSchema,
  customerBalanceQuerySchema,
  deliveryEstimateSchema,
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
  trackOrderOutcome,
  validateBody(createPublicOrderSchema),
  publicController.createPublicOrder
);
router.post(
  "/delivery-estimate",
  validateBody(deliveryEstimateSchema),
  publicController.getDeliveryEstimate
);
router.get(
  "/customers/balance",
  validateQuery(customerBalanceQuerySchema),
  publicController.getCustomerBalance
);

export default router;