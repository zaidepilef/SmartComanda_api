import { z } from "zod";
import { PAYMENT_METHODS } from "../utils/paymentMethods.js";

const OBJECT_ID_PATTERN = /^[0-9a-fA-F]{24}$/;

export const openCashSessionSchema = z.object({
  branchId: z.string().regex(OBJECT_ID_PATTERN, "branchId must be a valid ObjectId."),
  openingAmount: z.number().nonnegative("openingAmount must be zero or greater."),
});

export const currentCashSessionQuerySchema = z.object({
  branchId: z.string().regex(OBJECT_ID_PATTERN, "branchId must be a valid ObjectId."),
});

export const closeCashSessionSchema = z.object({
  closingAmounts: z
    .object({
      cash: z.number().nonnegative("closingAmount must be zero or greater.").optional(),
      debit: z.number().nonnegative("closingAmount must be zero or greater.").optional(),
      credit: z.number().nonnegative("closingAmount must be zero or greater.").optional(),
      transfer: z.number().nonnegative("closingAmount must be zero or greater.").optional(),
    })
    .refine((amounts) => PAYMENT_METHODS.some((method) => amounts[method] !== undefined), {
      message: "At least one closing amount must be provided.",
    })
    .optional(),
});

export const closeCashSessionParamsSchema = z.object({
  id: z.string().regex(OBJECT_ID_PATTERN, "id must be a valid ObjectId."),
});
