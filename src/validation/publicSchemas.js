import { z } from "zod";
import {
  DELIVERY_EXPECTED_METHODS,
  EXPECTED_PAYMENT_METHODS,
  PICKUP_EXPECTED_METHODS,
} from "../models/order.js";
import { normalizeChileanMobile } from "../utils/phone.js";

const OBJECT_ID_PATTERN = /^[0-9a-fA-F]{24}$/;
// Caracteres de control (salvo espacios normales) que no deben llegar a cocina.
const CONTROL_CHARS = /[\u0000-\u001F\u007F]/g;

const tenantIdSchema = z.string().regex(OBJECT_ID_PATTERN, "tenantId must be a valid ObjectId.");
const branchIdSchema = z.string().regex(OBJECT_ID_PATTERN, "branchId must be a valid ObjectId.");

/** Celular chileno: acepta 9XXXXXXXX, 569XXXXXXXX o +569XXXXXXXX y lo deja en +569XXXXXXXX. */
export const chileanMobileSchema = z
  .string({ message: "phone is required." })
  .transform((value, ctx) => {
    const phone = normalizeChileanMobile(value);

    if (!phone) {
      ctx.addIssue({ code: "custom", message: "phone must be a Chilean mobile number (+569XXXXXXXX)." });
      return z.NEVER;
    }

    return phone;
  });

const cleanText = (max, field) =>
  z
    .string()
    .transform((value) => value.replace(CONTROL_CHARS, " ").trim())
    .pipe(z.string().max(max, `${field} is too long.`));

export const publicMenuQuerySchema = z.object({
  tenantId: tenantIdSchema,
  branchId: branchIdSchema,
});

export const customerBalanceQuerySchema = z.object({
  tenantId: tenantIdSchema,
  branchId: branchIdSchema,
  phone: chileanMobileSchema,
});

export const customerLookupSchema = z.strictObject({
  tenantId: tenantIdSchema,
  branchId: branchIdSchema,
  phone: chileanMobileSchema,
});

const publicOrderItemSchema = z.object({
  dishId: z.string().regex(OBJECT_ID_PATTERN, "dishId must be a valid ObjectId."),
  quantity: z.number().int().positive("quantity must be a positive integer.").max(99),
  note: cleanText(140, "note").optional(),
});

const latSchema = z.number().min(-90, "lat must be between -90 and 90.").max(90, "lat must be between -90 and 90.");
const lngSchema = z.number().min(-180, "lng must be between -180 and 180.").max(180, "lng must be between -180 and 180.");

/** Pedido desde la app: retiro en local (`qr`) o a domicilio (`delivery`). */
export const PUBLIC_ORDER_TYPES = ["qr", "delivery"];

const deliverySchema = z
  .object({
    addressId: z.string().regex(OBJECT_ID_PATTERN, "delivery.addressId must be a valid ObjectId.").optional(),
    address: cleanText(200, "delivery.address").pipe(z.string().min(5, "delivery.address is too short.")).optional(),
    reference: cleanText(200, "delivery.reference").optional(),
    lat: latSchema.optional(),
    lng: lngSchema.optional(),
    accuracy: z.number().min(0).max(100000).optional(),
  })
  .refine(
    (data) =>
      data.addressId !== undefined ||
      (data.address !== undefined && data.lat !== undefined && data.lng !== undefined),
    {
      message: "delivery needs a saved addressId or an address with lat and lng.",
      path: ["address"],
    }
  );

// z.object descarta campos extra (precios, totales o pagos enviados por el cliente).
export const createPublicOrderSchema = z
  .object({
    tenantId: tenantIdSchema,
    branchId: branchIdSchema,
    name: cleanText(80, "name").pipe(z.string().min(1, "name must not be empty.")),
    phone: chileanMobileSchema,
    orderType: z.enum(PUBLIC_ORDER_TYPES).default("qr"),
    clientRequestId: z.uuid({ message: "clientRequestId must be a UUID." }),
    expectedPaymentMethod: z.enum(EXPECTED_PAYMENT_METHODS, {
      message: "expectedPaymentMethod must be cash, debit, credit or card.",
    }),
    cashTendered: z.number().int().positive().max(10_000_000).optional(),
    delivery: deliverySchema.optional(),
    items: z.array(publicOrderItemSchema).min(1, "items must have at least one dish.").max(50),
  })
  .refine((data) => data.orderType !== "delivery" || data.delivery !== undefined, {
    message: "delivery is required for delivery orders.",
    path: ["delivery"],
  })
  .refine(
    (data) =>
      (data.orderType === "delivery" ? DELIVERY_EXPECTED_METHODS : PICKUP_EXPECTED_METHODS).includes(
        data.expectedPaymentMethod
      ),
    {
      message: "Pickup accepts cash, debit or credit; delivery accepts cash or card on delivery.",
      path: ["expectedPaymentMethod"],
    }
  )
  .refine((data) => data.cashTendered === undefined || data.expectedPaymentMethod === "cash", {
    message: "cashTendered only applies to cash.",
    path: ["cashTendered"],
  });

export const deliveryEstimateSchema = z.object({
  tenantId: tenantIdSchema,
  branchId: branchIdSchema,
  lat: latSchema,
  lng: lngSchema,
});

export const trackOrderSchema = z.strictObject({
  tenantId: tenantIdSchema,
  trackingToken: z
    .string()
    .regex(/^[A-Za-z0-9_-]{43}$/, "trackingToken is invalid."),
});
