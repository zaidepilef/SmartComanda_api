import { z } from "zod";

export const loginSchema = z.object({
  email: z.email("A valid email is required.").toLowerCase(),
  password: z.string().min(1, "password is required."),
});