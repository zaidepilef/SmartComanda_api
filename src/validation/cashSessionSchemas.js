import { z } from "zod";

const OBJECT_ID_PATTERN = /^[0-9a-fA-F]{24}$/;

export const openCashSessionSchema = z.object({
  branchId: z.string().regex(OBJECT_ID_PATTERN, "branchId must be a valid ObjectId."),
  openingAmount: z.number().nonnegative("openingAmount must be zero or greater."),
});

export const currentCashSessionQuerySchema = z.object({
  branchId: z.string().regex(OBJECT_ID_PATTERN, "branchId must be a valid ObjectId."),
});
