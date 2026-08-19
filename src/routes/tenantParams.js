import { z } from "zod";

const OBJECT_ID_PATTERN = /^[0-9a-fA-F]{24}$/;

export const getTenantParamsSchema = z.object({
  id: z.string().regex(OBJECT_ID_PATTERN, "id must be a valid ObjectId."),
});