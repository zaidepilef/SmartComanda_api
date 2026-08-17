import { z } from "zod";

const RUT_PATTERN = /^\d{1,2}\.\d{3}\.\d{3}-[\dkK]$/;

const loyaltySchema = z
  .object({
    pointsPerAmount: z
      .number()
      .int()
      .positive("pointsPerAmount must be a positive integer.")
      .optional(),
    currency: z.string().trim().min(1).default("CLP"),
  })
  .refine((data) => data.pointsPerAmount !== undefined, {
    message: "pointsPerAmount is required when loyalty is set.",
  });

function omitUndefined(value) {
  if (value === undefined) {
    return undefined;
  }
  return value;
}

export const listTenantsQuerySchema = z.object({
  active: z.enum(["true", "false"]).optional(),
});

export const createTenantSchema = z.object({
  name: z.string().trim().min(1, "name is required."),
  rut: z
    .string()
    .regex(RUT_PATTERN, "rut must follow the format 12.345.678-9.")
    .optional(),
  razonSocial: z.string().trim().min(1).optional(),
  active: z.boolean().default(true),
  loyalty: loyaltySchema.optional(),
});

export const updateTenantSchema = z
  .object({
    name: z.string().trim().min(1).optional(),
    rut: z
      .string()
      .regex(RUT_PATTERN, "rut must follow the format 12.345.678-9.")
      .optional(),
    razonSocial: z.string().trim().min(1).optional(),
    active: z.boolean().optional(),
    loyalty: z.union([loyaltySchema, z.null()]).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field must be provided.",
  });

export function normalizeTenantInput(input) {
  if (input.loyalty === undefined || input.loyalty === null) {
    return input;
  }

  return {
    ...input,
    loyalty: omitUndefined(input.loyalty),
  };
}