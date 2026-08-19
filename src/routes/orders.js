import { Router } from "express";
import * as orderController from "../controllers/orderController.js";
import authRequired from "../middleware/authRequired.js";
import {
  validateBody,
  validateParams,
  validateQuery,
} from "../middleware/validation.js";
import { createOrderSchema } from "../validation/orderSchemas.js";
import {
  getOrderParamsSchema,
  listOrdersQuerySchema,
  payOrderParamsSchema,
  payOrderSchema,
  updateOrderStatusParamsSchema,
  updateOrderStatusSchema,
} from "../validation/orderQuerySchemas.js";

const router = Router();

router.use(authRequired);

router.post("/", validateBody(createOrderSchema), orderController.createOrder);
router.get("/", validateQuery(listOrdersQuerySchema), orderController.listOrders);
router.get("/:id", validateParams(getOrderParamsSchema), orderController.getOrder);
router.patch(
  "/:id/status",
  validateParams(updateOrderStatusParamsSchema),
  validateBody(updateOrderStatusSchema),
  orderController.updateOrderStatus
);
router.patch(
  "/:id/pay",
  validateParams(payOrderParamsSchema),
  validateBody(payOrderSchema),
  orderController.payOrder
);

export default router;