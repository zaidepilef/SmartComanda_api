import { z } from "zod";

const RUT_PATTERN = /^\d{1,2}\.\d{3}\.\d{3}-[\dkK]$/;

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
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field must be provided.",
  });