import { z } from "zod";

const OBJECT_ID_PATTERN = /^[0-9a-fA-F]{24}$/;
const PHONE_PATTERN = /^\+?[0-9]{9,15}$/;

const tenantIdSchema = z.string().regex(OBJECT_ID_PATTERN, "tenantId must be a valid ObjectId.");
const branchIdSchema = z.string().regex(OBJECT_ID_PATTERN, "branchId must be a valid ObjectId.");

export const publicMenuQuerySchema = z.object({
  tenantId: tenantIdSchema,
  branchId: branchIdSchema,
});

export const customerBalanceQuerySchema = z.object({
  tenantId: tenantIdSchema,
  branchId: branchIdSchema,
  phone: z.string().trim().regex(PHONE_PATTERN, "phone must be a valid phone number."),
});

const publicOrderItemSchema = z.object({
  dishId: z.string().regex(OBJECT_ID_PATTERN, "dishId must be a valid ObjectId."),
  quantity: z.number().int().positive("quantity must be a positive integer."),
});

const latSchema = z.number().min(-90, "lat must be between -90 and 90.").max(90, "lat must be between -90 and 90.");
const lngSchema = z.number().min(-180, "lng must be between -180 and 180.").max(180, "lng must be between -180 and 180.");

/** Pedido desde la app: retiro en local (`qr`) o a domicilio (`delivery`). */
export const PUBLIC_ORDER_TYPES = ["qr", "delivery"];

const deliverySchema = z
  .object({
    address: z.string().trim().min(5, "delivery.address is too short.").max(200, "delivery.address is too long."),
    reference: z.string().trim().max(200, "delivery.reference is too long.").optional(),
    lat: latSchema.optional(),
    lng: lngSchema.optional(),
    accuracy: z.number().min(0).max(100000).optional(),
  })
  .refine((data) => (data.lat === undefined) === (data.lng === undefined), {
    message: "delivery.lat and delivery.lng must be sent together.",
    path: ["lng"],
  });

export const createPublicOrderSchema = z
  .object({
    tenantId: tenantIdSchema,
    branchId: branchIdSchema,
    name: z.string().trim().min(1, "name must not be empty.").max(80, "name is too long."),
    phone: z.string().trim().regex(PHONE_PATTERN, "phone must be a valid phone number."),
    orderType: z.enum(PUBLIC_ORDER_TYPES).default("qr"),
    delivery: deliverySchema.optional(),
    items: z.array(publicOrderItemSchema).min(1, "items must have at least one dish."),
  })
  .refine((data) => data.orderType !== "delivery" || data.delivery !== undefined, {
    message: "delivery.address is required for delivery orders.",
    path: ["delivery", "address"],
  });

export const deliveryEstimateSchema = z.object({
  tenantId: tenantIdSchema,
  branchId: branchIdSchema,
  lat: latSchema,
  lng: lngSchema,
});