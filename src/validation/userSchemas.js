import { z } from "zod";
import { USER_ROLES_LIST, USER_STATUSES } from "../models/user.js";

const OBJECT_ID_PATTERN = /^[0-9a-fA-F]{24}$/;

const branchIdSchema = z
  .string()
  .regex(OBJECT_ID_PATTERN, "branchId must be a valid ObjectId.")
  .optional();

export const createUserSchema = z.object({
  firstName: z.string().trim().min(1, "firstName is required."),
  lastName: z.string().trim().min(1, "lastName is required."),
  email: z.email("A valid email is required.").toLowerCase(),
  password: z.string().min(8, "password must be at least 8 characters."),
  status: z.enum(USER_STATUSES).optional(),
  name: z.string().trim().min(1).optional(),
  roles: z.array(z.enum(USER_ROLES_LIST)).optional(),
  tenantId: z
    .string()
    .regex(OBJECT_ID_PATTERN, "tenantId must be a valid ObjectId.")
    .optional(),
  branchId: branchIdSchema,
});

export const registerUserSchema = createUserSchema
  .omit({ name: true, roles: true, tenantId: true })
  .extend({
    captchaToken: z.string().min(1, "captchaToken is required."),
  });

export const updateUserSchema = z
  .object({
    firstName: z.string().trim().min(1).optional(),
    lastName: z.string().trim().min(1).optional(),
    email: z.email("A valid email is required.").toLowerCase().optional(),
    password: z.string().min(8, "password must be at least 8 characters.").optional(),
    status: z.enum(USER_STATUSES).optional(),
    name: z.string().trim().min(1).optional(),
    roles: z.array(z.enum(USER_ROLES_LIST)).optional(),
    tenantId: z
      .string()
      .regex(OBJECT_ID_PATTERN, "tenantId must be a valid ObjectId.")
      .optional(),
    branchId: branchIdSchema,
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field must be provided.",
  });

export const listUsersQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
  status: z.enum(USER_STATUSES).optional(),
});
