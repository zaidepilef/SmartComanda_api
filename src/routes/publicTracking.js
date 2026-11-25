import { Router } from "express";
import * as publicController from "../controllers/publicController.js";
import { orderTrackingRateLimit } from "../middleware/rateLimit.js";
import { validateBody } from "../middleware/validation.js";
import { trackOrderSchema } from "../validation/publicSchemas.js";

const router = Router();

router.use(orderTrackingRateLimit);

router.post("/", validateBody(trackOrderSchema), publicController.trackOrder);

export default router;
