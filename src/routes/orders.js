import { Router } from "express";
import * as orderController from "../controllers/orderController.js";
import authRequired from "../middleware/authRequired.js";
import { validateBody } from "../middleware/validation.js";
import { createOrderSchema } from "../validation/orderSchemas.js";

const router = Router();

router.use(authRequired);

router.post("/", validateBody(createOrderSchema), orderController.createOrder);

export default router;
