import { z } from "zod";
import {
  ORDER_PAYMENT_STATUSES_LIST,
  ORDER_STATUSES_LIST,
  ORDER_TYPES,
} from "../models/order.js";
import { PAYMENT_METHODS } from "../utils/paymentMethods.js";

const OBJECT_ID_PATTERN = /^[0-9a-fA-F]{24}$/;

export const listOrdersQuerySchema = z.object({
  tenantId: z
    .string()
    .regex(OBJECT_ID_PATTERN, "tenantId must be a valid ObjectId.")
    .optional(),
  branchId: z
    .string()
    .regex(OBJECT_ID_PATTERN, "branchId must be a valid ObjectId.")
    .optional(),
  status: z
    .union([z.enum(ORDER_STATUSES_LIST), z.array(z.enum(ORDER_STATUSES_LIST))])
    .optional()
    .transform((value) => {
      if (value === undefined) {
        return undefined;
      }

      return Array.isArray(value) ? value : [value];
    }),
  orderType: z.enum(ORDER_TYPES).optional(),
  paymentStatus: z.enum(ORDER_PAYMENT_STATUSES_LIST).optional(),
  paymentMethod: z.enum(PAYMENT_METHODS).optional(),
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
  q: z.string().trim().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export const getOrderParamsSchema = z.object({
  id: z.string().regex(OBJECT_ID_PATTERN, "id must be a valid ObjectId."),
});

export const updateOrderStatusSchema = z.object({
  status: z.enum(ORDER_STATUSES_LIST, {
    message: "status must be one of the order statuses.",
  }),
});

export const updateOrderStatusParamsSchema = z.object({
  id: z.string().regex(OBJECT_ID_PATTERN, "id must be a valid ObjectId."),
});