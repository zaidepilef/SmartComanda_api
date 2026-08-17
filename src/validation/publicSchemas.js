import { z } from "zod";

const OBJECT_ID_PATTERN = /^[0-9a-fA-F]{24}$/;
const PHONE_PATTERN = /^\+?[0-9]{9,15}$/;

const tenantIdSchema = z.string().regex(OBJECT_ID_PATTERN, "tenantId must be a valid ObjectId.");
const branchIdSchema = z.string().regex(OBJECT_ID_PATTERN, "branchId must be a valid ObjectId.");

export const publicMenuQuerySchema = z.object({
  tenantId: tenantIdSchema,
  branchId: branchIdSchema,
});

export const customerBalanceQuerySchema = z.object({
  tenantId: tenantIdSchema,
  branchId: branchIdSchema,
  phone: z.string().trim().regex(PHONE_PATTERN, "phone must be a valid phone number."),
});

const publicOrderItemSchema = z.object({
  dishId: z.string().regex(OBJECT_ID_PATTERN, "dishId must be a valid ObjectId."),
  quantity: z.number().int().positive("quantity must be a positive integer."),
});

export const createPublicOrderSchema = z.object({
  tenantId: tenantIdSchema,
  branchId: branchIdSchema,
  phone: z.string().trim().regex(PHONE_PATTERN, "phone must be a valid phone number."),
  items: z.array(publicOrderItemSchema).min(1, "items must have at least one dish."),
});