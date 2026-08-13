import { z } from "zod";
import { USER_STATUSES } from "../models/user.js";

export const createUserSchema = z.object({
  firstName: z.string().trim().min(1, "firstName is required."),
  lastName: z.string().trim().min(1, "lastName is required."),
  email: z.email("A valid email is required.").toLowerCase(),
  password: z.string().min(8, "password must be at least 8 characters."),
  status: z.enum(USER_STATUSES).optional(),
});

export const registerUserSchema = createUserSchema.extend({
  captchaToken: z.string().min(1, "captchaToken is required."),
});

export const updateUserSchema = z
  .object({
    firstName: z.string().trim().min(1).optional(),
    lastName: z.string().trim().min(1).optional(),
    email: z.email("A valid email is required.").toLowerCase().optional(),
    password: z.string().min(8, "password must be at least 8 characters.").optional(),
    status: z.enum(USER_STATUSES).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field must be provided.",
  });

export const listUsersQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
  status: z.enum(USER_STATUSES).optional(),
});
