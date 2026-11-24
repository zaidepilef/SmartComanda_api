import { z } from "zod";
import { JOURNEY_EVENT_TYPES as T } from "../models/journeyEvent.js";

const OBJECT_ID_PATTERN = /^[0-9a-fA-F]{24}$/;
const PHONE_PATTERN = /^\+?[0-9]{9,15}$/;

export const MAX_EVENTS_PER_BATCH = 50;
const MAX_RANGE_DAYS = 31;
const DEFAULT_RANGE_MS = 24 * 60 * 60 * 1000;

const objectId = (field) => z.string().regex(OBJECT_ID_PATTERN, `${field} must be a valid ObjectId.`);
const reason = z.string().trim().max(200).optional();
const httpStatus = z.number().int().min(0).max(599);
const quantity = z.number().int().min(1).max(99);

const base = { occurredAt: z.iso.datetime({ offset: true }) };

// Cada tipo acepta solo los datos que lo explican (objetos estrictos, sin campos extra).
// order_created no se acepta del cliente: lo registra el servidor.
const clientEventSchema = z.discriminatedUnion("type", [
  z.strictObject({ ...base, type: z.literal(T.QR_OPENED), data: z.strictObject({}).optional() }),
  z.strictObject({
    ...base,
    type: z.literal(T.MENU_LOADED),
    data: z.strictObject({ dishCount: z.number().int().min(0).max(10000) }),
  }),
  z.strictObject({
    ...base,
    type: z.literal(T.MENU_FAILED),
    data: z.strictObject({ status: httpStatus, reason }),
  }),
  z.strictObject({
    ...base,
    type: z.literal(T.IDENTITY_SUBMITTED),
    // name y phone solo se usan para resolver el cliente; no se guardan en el evento.
    data: z.strictObject({
      name: z.string().trim().min(1).max(80),
      phone: z.string().trim().regex(PHONE_PATTERN, "phone must be a valid phone number."),
    }),
  }),
  z.strictObject({
    ...base,
    type: z.literal(T.ITEM_ADDED),
    data: z.strictObject({ dishId: objectId("dishId"), quantity }),
  }),
  z.strictObject({
    ...base,
    type: z.literal(T.ITEM_REMOVED),
    data: z.strictObject({ dishId: objectId("dishId"), quantity }),
  }),
  z.strictObject({
    ...base,
    type: z.literal(T.CART_OPENED),
    data: z.strictObject({ itemCount: z.number().int().min(0).max(999) }),
  }),
  z.strictObject({
    ...base,
    type: z.literal(T.ORDER_SUBMITTED),
    data: z.strictObject({
      itemCount: z.number().int().min(1).max(999),
      total: z.number().min(0).max(100_000_000),
    }),
  }),
  z.strictObject({
    ...base,
    type: z.literal(T.ORDER_FAILED),
    data: z.strictObject({ status: httpStatus, reason }),
  }),
]);

export const journeyEventBatchSchema = z.strictObject({
  tenantId: objectId("tenantId"),
  branchId: objectId("branchId"),
  sessionId: z.uuid("sessionId must be a valid UUID."),
  events: z.array(clientEventSchema).min(1).max(MAX_EVENTS_PER_BATCH),
});

export const journeySessionIdSchema = z.uuid();

export const journeyRangeQuerySchema = z
  .object({
    from: z.iso.datetime({ offset: true }).optional(),
    to: z.iso.datetime({ offset: true }).optional(),
    limit: z.coerce.number().int().min(1).max(500).default(200),
  })
  .transform(({ from, to, limit }) => {
    const toDate = to ? new Date(to) : new Date();
    const fromDate = from ? new Date(from) : new Date(toDate.getTime() - DEFAULT_RANGE_MS);
    return { from: fromDate, to: toDate, limit };
  })
  .refine(({ from, to }) => from < to, { message: "from must be before to." })
  .refine(({ from, to }) => to - from <= MAX_RANGE_DAYS * DEFAULT_RANGE_MS, {
    message: `The range cannot exceed ${MAX_RANGE_DAYS} days.`,
  });
