import { z } from "zod";

const OBJECT_ID_PATTERN = /^[0-9a-fA-F]{24}$/;

export const warehouseModeSchema = z.object({
  tenantId: z
    .string()
    .regex(OBJECT_ID_PATTERN, "tenantId must be a valid ObjectId.")
    .optional(),
  warehouseMode: z.enum(["shared", "per_branch"], {
    message: "warehouseMode must be shared or per_branch.",
  }),
});

export const adjustStockSchema = z.object({
  tenantId: z
    .string()
    .regex(OBJECT_ID_PATTERN, "tenantId must be a valid ObjectId."),
  ingredientId: z
    .string()
    .regex(OBJECT_ID_PATTERN, "ingredientId must be a valid ObjectId."),
  branchId: z
    .string()
    .regex(OBJECT_ID_PATTERN, "branchId must be a valid ObjectId.")
    .optional()
    .nullable(),
  type: z.enum(["entry", "exit"], { message: "type must be entry or exit." }),
  quantity: z.number().positive("quantity must be greater than zero."),
  reason: z.string().trim().min(1, "reason is required."),
});

export const listStockQuerySchema = z.object({
  tenantId: z
    .string()
    .regex(OBJECT_ID_PATTERN, "tenantId must be a valid ObjectId.")
    .optional(),
  branchId: z
    .string()
    .regex(OBJECT_ID_PATTERN, "branchId must be a valid ObjectId.")
    .optional(),
});

export const listMovementsQuerySchema = z.object({
  tenantId: z
    .string()
    .regex(OBJECT_ID_PATTERN, "tenantId must be a valid ObjectId.")
    .optional(),
  ingredientId: z
    .string()
    .regex(OBJECT_ID_PATTERN, "ingredientId must be a valid ObjectId.")
    .optional(),
  branchId: z
    .string()
    .regex(OBJECT_ID_PATTERN, "branchId must be a valid ObjectId.")
    .optional(),
});
