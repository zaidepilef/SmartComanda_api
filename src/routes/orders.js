import { Router } from "express";
import * as orderController from "../controllers/orderController.js";
import authRequired from "../middleware/authRequired.js";
import requirePermission from "../middleware/requirePermission.js";
import {
  validateBody,
  validateParams,
  validateQuery,
} from "../middleware/validation.js";
import { createOrderSchema } from "../validation/orderSchemas.js";
import {
  assignDriverSchema,
  cancelOrderSchema,
  correctOrderSchema,
  declinePaymentSchema,
  deliverOrderSchema,
  dispatchOrderSchema,
  rejectOrderSchema,
  deliveryAnalyticsQuerySchema,
  getOrderParamsSchema,
  listOrdersQuerySchema,
  payOrderSchema,
  updateOrderStatusSchema,
} from "../validation/orderQuerySchemas.js";

const router = Router();
const orderParams = validateParams(getOrderParamsSchema);

router.use(authRequired);

router.post(
  "/",
  requirePermission("order.create"),
  validateBody(createOrderSchema),
  orderController.createOrder
);
router.get(
  "/",
  requirePermission("order.read"),
  validateQuery(listOrdersQuerySchema),
  orderController.listOrders
);
router.get(
  "/delivery-analytics",
  requirePermission("order.analytics"),
  validateQuery(deliveryAnalyticsQuerySchema),
  orderController.getDeliveryAnalytics
);
router.get("/:id", requirePermission("order.read"), orderParams, orderController.getOrder);
router.patch(
  "/:id/status",
  requirePermission("order.status"),
  orderParams,
  validateBody(updateOrderStatusSchema),
  orderController.updateOrderStatus
);
router.patch(
  "/:id/pay",
  requirePermission("order.pay"),
  orderParams,
  validateBody(payOrderSchema),
  orderController.payOrder
);
router.post(
  "/:id/cancel",
  requirePermission("order.cancel"),
  orderParams,
  validateBody(cancelOrderSchema),
  orderController.cancelOrder
);
router.post(
  "/:id/reject",
  requirePermission("order.reject"),
  orderParams,
  validateBody(rejectOrderSchema),
  orderController.rejectOrder
);
router.post(
  "/:id/dispatch",
  requirePermission("order.dispatch"),
  orderParams,
  validateBody(dispatchOrderSchema),
  orderController.dispatchOrder
);
router.put(
  "/:id/driver",
  requirePermission("order.assign"),
  orderParams,
  validateBody(assignDriverSchema),
  orderController.assignDriver
);
router.post(
  "/:id/deliver",
  requirePermission("order.collect"),
  orderParams,
  validateBody(deliverOrderSchema),
  orderController.deliverOrder
);
router.post(
  "/:id/payment-declined",
  requirePermission("order.collect"),
  orderParams,
  validateBody(declinePaymentSchema),
  orderController.declinePayment
);
router.put(
  "/:id/items",
  requirePermission("order.correct"),
  orderParams,
  validateBody(correctOrderSchema),
  orderController.correctOrder
);

export default router;
