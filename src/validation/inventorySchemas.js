import { z } from "zod";

const OBJECT_ID_PATTERN = /^[0-9a-fA-F]{24}$/;

export const adjustStockSchema = z
  .object({
    tenantId: z
      .string()
      .regex(OBJECT_ID_PATTERN, "tenantId must be a valid ObjectId."),
    ingredientId: z
      .string()
      .regex(OBJECT_ID_PATTERN, "ingredientId must be a valid ObjectId."),
    branchId: z
      .string()
      .regex(OBJECT_ID_PATTERN, "branchId must be a valid ObjectId."),
    type: z.enum(["entry", "exit"], { message: "type must be entry or exit." }),
    quantity: z.number().positive("quantity must be greater than zero."),
    reason: z.string().trim().min(1, "reason is required."),
    unitCost: z.number().positive("unitCost must be greater than zero.").optional(),
  })
  .superRefine((data, ctx) => {
    if (data.type === "entry" && data.unitCost === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["unitCost"],
        message: "unitCost is required for stock entries.",
      });
    }

    if (data.type === "exit" && data.unitCost !== undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["unitCost"],
        message: "unitCost is only allowed for stock entries.",
      });
    }
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