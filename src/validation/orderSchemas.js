import { z } from "zod";
import { PAYMENT_METHODS } from "../utils/paymentMethods.js";

const OBJECT_ID_PATTERN = /^[0-9a-fA-F]{24}$/;

const ORDER_TYPES = ["takeaway", "dinein", "delivery", "qr"];

const orderItemSchema = z.object({
  dishId: z.string().regex(OBJECT_ID_PATTERN, "dishId must be a valid ObjectId."),
  quantity: z.number().int().positive("quantity must be a positive integer."),
  stockApplied: z.boolean().default(false),
});

export const createOrderSchema = z.object({
  foodtruckId: z.string().regex(OBJECT_ID_PATTERN, "foodtruckId must be a valid ObjectId."),
  clientContact: z.string().trim().min(1).optional(),
  orderType: z.enum(ORDER_TYPES).default("takeaway"),
  paymentMethod: z.enum(PAYMENT_METHODS).optional(),
  items: z.array(orderItemSchema).min(1, "items must have at least one dish."),
});
