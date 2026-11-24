import { z } from "zod";
import { PAYMENT_METHODS } from "../utils/paymentMethods.js";

export const BRANCH_TYPES = ["Sucursal", "FoodTruck"];

const OBJECT_ID_PATTERN = /^[0-9a-fA-F]{24}$/;

const latSchema = z.number().min(-90, "lat must be between -90 and 90.").max(90, "lat must be between -90 and 90.");
const lngSchema = z.number().min(-180, "lng must be between -180 and 180.").max(180, "lng must be between -180 and 180.");

/** Ubicación y límites de delivery: `null` borra el valor. */
const geoFields = {
  lat: latSchema.nullable().optional(),
  lng: lngSchema.nullable().optional(),
  deliveryMaxKm: z.number().positive("deliveryMaxKm must be greater than 0.").max(999).nullable().optional(),
  deliveryMaxMinutes: z.number().int().positive("deliveryMaxMinutes must be greater than 0.").max(1440).nullable().optional(),
  deliveryAvgSpeedKmh: z.number().min(5, "deliveryAvgSpeedKmh must be between 5 and 120.").max(120, "deliveryAvgSpeedKmh must be between 5 and 120.").optional(),
};

/** lat y lng van juntos: ambos con valor, ambos null o ninguno. */
function coordinatesTogether(data) {
  const hasLat = data.lat !== undefined;
  const hasLng = data.lng !== undefined;

  if (hasLat !== hasLng) {
    return false;
  }

  return (data.lat === null) === (data.lng === null);
}

const coordinatesTogetherIssue = {
  message: "lat and lng must be sent together.",
  path: ["lng"],
};

const paymentMethodsSchema = z
  .array(z.enum(PAYMENT_METHODS))
  .min(1, "At least one payment method is required.");

export const listBranchesQuerySchema = z.object({
  tenantId: z
    .string()
    .regex(OBJECT_ID_PATTERN, "tenantId must be a valid ObjectId.")
    .optional(),
  active: z.enum(["true", "false"]).optional(),
  q: z.string().trim().min(1).optional(),
});

export const createBranchSchema = z.object({
  tenantId: z
    .string()
    .regex(OBJECT_ID_PATTERN, "tenantId must be a valid ObjectId."),
  name: z.string().trim().min(1, "name is required."),
  type: z.enum(BRANCH_TYPES, { message: "type must be Sucursal or FoodTruck." }),
  address: z.string().trim().min(1).optional(),
  city: z.string().trim().min(1).optional(),
  phone: z.string().trim().min(1).optional(),
  active: z.boolean().default(true),
  paymentMethods: paymentMethodsSchema.optional(),
  ...geoFields,
}).refine(coordinatesTogether, coordinatesTogetherIssue);

export const updateBranchSchema = z
  .object({
    tenantId: z
      .string()
      .regex(OBJECT_ID_PATTERN, "tenantId must be a valid ObjectId.")
      .optional(),
    name: z.string().trim().min(1).optional(),
    type: z.enum(BRANCH_TYPES, { message: "type must be Sucursal or FoodTruck." }).optional(),
    address: z.string().trim().min(1).optional(),
    city: z.string().trim().min(1).optional(),
    phone: z.string().trim().min(1).optional(),
    active: z.boolean().optional(),
    paymentMethods: paymentMethodsSchema.optional(),
    ...geoFields,
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field must be provided.",
  })
  .refine(coordinatesTogether, coordinatesTogetherIssue);
