import { z } from "zod";
import { INGREDIENT_DIMENSIONS_LIST } from "../models/ingredient.js";

const OBJECT_ID_PATTERN = /^[0-9a-fA-F]{24}$/;

export const createIngredientSchema = z.object({
  tenantId: z
    .string()
    .regex(OBJECT_ID_PATTERN, "tenantId must be a valid ObjectId."),
  name: z.string().trim().min(1, "name is required."),
  unit: z.string().trim().min(1, "unit is required."),
  dimension: z.enum(INGREDIENT_DIMENSIONS_LIST, {
    message: "dimension must be count, mass, or volume.",
  }),
  unitCost: z.number().nonnegative("unitCost must be zero or greater.").optional(),
  notes: z.string().trim().min(1).optional(),
});

export const updateIngredientSchema = z
  .object({
    name: z.string().trim().min(1).optional(),
    unit: z.string().trim().min(1).optional(),
    dimension: z
      .enum(INGREDIENT_DIMENSIONS_LIST, {
        message: "dimension must be count, mass, or volume.",
      })
      .optional(),
    unitCost: z.number().nonnegative("unitCost must be zero or greater.").optional(),
    notes: z.string().trim().min(1).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field must be provided.",
  });

export const listIngredientsQuerySchema = z.object({
  tenantId: z
    .string()
    .regex(OBJECT_ID_PATTERN, "tenantId must be a valid ObjectId.")
    .optional(),
  q: z.string().trim().min(1).optional(),
});
