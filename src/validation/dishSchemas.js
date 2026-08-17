import { z } from "zod";

const OBJECT_ID_PATTERN = /^[0-9a-fA-F]{24}$/;

const recipeLineSchema = z.object({
  ingredientId: z.string().regex(OBJECT_ID_PATTERN, "ingredientId must be a valid ObjectId."),
  quantity: z.number().positive("quantity must be greater than zero."),
  unit: z.string().trim().min(1, "unit is required."),
});

const branchPriceSchema = z.object({
  branchId: z.string().regex(OBJECT_ID_PATTERN, "branchId must be a valid ObjectId."),
  price: z.number().nonnegative("price must be zero or greater."),
});

export const createDishSchema = z.object({
  tenantId: z
    .string()
    .regex(OBJECT_ID_PATTERN, "tenantId must be a valid ObjectId."),
  name: z.string().trim().min(1, "name is required."),
  salePrice: z.number().nonnegative("salePrice must be zero or greater."),
  recipe: z.array(recipeLineSchema).min(1, "recipe must have at least one ingredient."),
  active: z.boolean().default(true),
  description: z.string().trim().min(1).optional(),
  branchPrices: z.array(branchPriceSchema).optional(),
});

export const updateDishSchema = z
  .object({
    name: z.string().trim().min(1).optional(),
    salePrice: z.number().nonnegative("salePrice must be zero or greater.").optional(),
    recipe: z.array(recipeLineSchema).min(1, "recipe must have at least one ingredient.").optional(),
    active: z.boolean().optional(),
    description: z.string().trim().min(1).optional(),
    branchPrices: z.array(branchPriceSchema).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field must be provided.",
  });

export const listDishesQuerySchema = z.object({
  tenantId: z
    .string()
    .regex(OBJECT_ID_PATTERN, "tenantId must be a valid ObjectId.")
    .optional(),
  active: z.enum(["true", "false"]).optional(),
  q: z.string().trim().min(1).optional(),
  branchId: z
    .string()
    .regex(OBJECT_ID_PATTERN, "branchId must be a valid ObjectId.")
    .optional(),
});
