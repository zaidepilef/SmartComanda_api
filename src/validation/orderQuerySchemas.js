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
  orderType: z.union([z.enum(ORDER_TYPES), z.array(z.enum(ORDER_TYPES))]).optional(),
  paymentStatus: z.enum(ORDER_PAYMENT_STATUSES_LIST).optional(),
  paymentMethod: z.enum(PAYMENT_METHODS).optional(),
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
  q: z.string().trim().min(1).optional(),
  kitchen: z
    .enum(["true", "false"])
    .optional()
    .transform((value) => value === "true"),
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

export const payOrderParamsSchema = z.object({
  id: z.string().regex(OBJECT_ID_PATTERN, "id must be a valid ObjectId."),
});

export const payOrderSchema = z.object({
  paymentMethod: z.enum(PAYMENT_METHODS, {
    message: "paymentMethod must be one of the payment methods.",
  }),
});
export const cancelOrderSchema = z.strictObject({
  reason: z
    .string({ message: "reason is required." })
    .trim()
    .min(1, "reason is required.")
    .max(200, "reason must be at most 200 characters."),
});

export const correctOrderSchema = z.strictObject({
  items: z
    .array(
      z.strictObject({
        dishId: z.string().regex(OBJECT_ID_PATTERN, "dishId must be a valid ObjectId."),
        quantity: z.number().int().positive("quantity must be a positive integer.").max(99),
      })
    )
    .min(1, "items must have at least one dish.")
    .max(50),
});

export const deliveryAnalyticsQuerySchema = z.object({
  tenantId: z
    .string()
    .regex(OBJECT_ID_PATTERN, "tenantId must be a valid ObjectId.")
    .optional(),
  branchId: z
    .string()
    .regex(OBJECT_ID_PATTERN, "branchId must be a valid ObjectId.")
    .optional(),
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
});
