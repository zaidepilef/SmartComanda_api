import { z } from "zod";

export const BRANCH_TYPES = ["Sucursal", "FoodTruck"];

const OBJECT_ID_PATTERN = /^[0-9a-fA-F]{24}$/;

export const listBranchesQuerySchema = z.object({
  tenantId: z
    .string()
    .regex(OBJECT_ID_PATTERN, "tenantId must be a valid ObjectId.")
    .optional(),
  active: z.enum(["true", "false"]).optional(),
  q: z.string().trim().min(1).optional(),
});

export const createBranchSchema = z.object({
  tenantId: z
    .string()
    .regex(OBJECT_ID_PATTERN, "tenantId must be a valid ObjectId."),
  name: z.string().trim().min(1, "name is required."),
  type: z.enum(BRANCH_TYPES, { message: "type must be Sucursal or FoodTruck." }),
  address: z.string().trim().min(1).optional(),
  city: z.string().trim().min(1).optional(),
  phone: z.string().trim().min(1).optional(),
  active: z.boolean().default(true),
});

export const updateBranchSchema = z
  .object({
    tenantId: z
      .string()
      .regex(OBJECT_ID_PATTERN, "tenantId must be a valid ObjectId.")
      .optional(),
    name: z.string().trim().min(1).optional(),
    type: z.enum(BRANCH_TYPES, { message: "type must be Sucursal or FoodTruck." }).optional(),
    address: z.string().trim().min(1).optional(),
    city: z.string().trim().min(1).optional(),
    phone: z.string().trim().min(1).optional(),
    active: z.boolean().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field must be provided.",
  });
