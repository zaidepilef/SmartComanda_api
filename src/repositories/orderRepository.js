import { getPgPool } from "../db/postgres.js";
import { toObjectIdHex, generateObjectIdHex } from "../utils/id.js";
import { NotFoundError } from "../utils/errors.js";

export function toOrderObjectId(id) {
  return toObjectIdHex(id);
}

const numberOrNull = (value) => (value === null || value === undefined ? null : Number(value));

export function rowToOrder(row) {
  if (!row) {
    return null;
  }

  return {
    _id: row.id,
    id: row.id,
    tenantId: row.tenant_id,
    foodtruckId: row.foodtruck_id,
    number: Number(row.number),
    status: row.status,
    orderType: row.order_type,
    paymentStatus: row.payment_status,
    paymentMethod: row.payment_method ?? null,
    clientContact: row.client_contact ?? null,
    clientName: row.client_name ?? null,
    clientPhone: row.client_phone ?? null,
    pointsAwarded: row.points_awarded,
    items: row.items ?? null,
    statusHistory: row.status_history ?? null,
    total: Number(row.total),
    cashSessionId: row.cash_session_id ?? null,
    paidAt: row.paid_at ?? null,
    paidBy: row.paid_by ?? null,
    paidByName: row.paid_by_name ?? null,
    cancelReason: row.cancel_reason ?? null,
    cancelledBy: row.cancelled_by ?? null,
    cancelledAt: row.cancelled_at ?? null,
    correctedBy: row.corrected_by ?? null,
    correctedAt: row.corrected_at ?? null,
    deliveryAddress: row.delivery_address ?? null,
    deliveryReference: row.delivery_reference ?? null,
    deliveryLat: numberOrNull(row.delivery_lat),
    deliveryLng: numberOrNull(row.delivery_lng),
    deliveryAccuracyM: numberOrNull(row.delivery_accuracy_m),
    deliveryDistanceKm: numberOrNull(row.delivery_distance_km),
    deliveryEtaMinutes: numberOrNull(row.delivery_eta_minutes),
    deliveryOutOfRange: row.delivery_out_of_range ?? null,
    expectedPaymentMethod: row.expected_payment_method ?? null,
    cashTendered: numberOrNull(row.cash_tendered),
    clientRequestId: row.client_request_id ?? null,
    customerAddressId: row.customer_address_id ?? null,
    driverId: row.driver_id ?? null,
    driverName: row.driver_name ?? null,
    paymentHistory: row.payment_history ?? [],
    rejectionReason: row.rejection_reason ?? null,
    rejectedBy: row.rejected_by ?? null,
    rejectedAt: row.rejected_at ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Columnas de pedido más el nombre de quien lo cobró y del repartidor. */
const ORDER_SELECT = `SELECT o.*,
     NULLIF(TRIM(CONCAT(pu.first_name, ' ', pu.last_name)), '') AS paid_by_name,
     NULLIF(TRIM(CONCAT(du.first_name, ' ', du.last_name)), '') AS driver_name
   FROM orders o
   LEFT JOIN users pu ON pu.id = o.paid_by
   LEFT JOIN users du ON du.id = o.driver_id`;

/** Pedido a domicilio hecho desde la app (tiene dirección). */
const APP_DELIVERY_SQL = `(o.order_type = 'delivery' AND o.delivery_address IS NOT NULL)`;

function paymentEntry(status, { method = null, actorId = null, note = null } = {}) {
  return JSON.stringify([
    { status, method, at: new Date(), by: actorId ? String(actorId) : null, note },
  ]);
}

function escapeLike(text) {
  return text.replace(/[\\%_]/g, "\\$&");
}

export async function listOrders({
  tenantId,
  branchId,
  status,
  orderType,
  paymentStatus,
  paymentMethod,
  from,
  to,
  q,
  kitchen,
  appDeliveryOnly,
  driverId,
  limit,
  offset,
}) {
  const pool = getPgPool();
  const conditions = [];
  const params = [];

  if (tenantId !== undefined) {
    params.push(tenantId);
    conditions.push(`o.tenant_id = $${params.length}`);
  }

  if (branchId !== undefined) {
    params.push(branchId);
    conditions.push(`o.foodtruck_id = $${params.length}`);
  }

  if (status !== undefined) {
    const statuses = Array.isArray(status) ? status : [status];
    params.push(statuses);
    conditions.push(`o.status = ANY($${params.length}::varchar[])`);
  }

  if (orderType !== undefined) {
    const orderTypes = Array.isArray(orderType) ? orderType : [orderType];
    params.push(orderTypes);
    conditions.push(`o.order_type = ANY($${params.length}::varchar[])`);
  }

  if (paymentStatus !== undefined) {
    params.push(paymentStatus);
    conditions.push(`o.payment_status = $${params.length}`);
  }

  if (paymentMethod !== undefined) {
    params.push(paymentMethod);
    conditions.push(`o.payment_method = $${params.length}`);
  }

  if (from !== undefined || to !== undefined) {
    if (from !== undefined) {
      params.push(new Date(from));
      conditions.push(`o.created_at >= $${params.length}`);
    }

    if (to !== undefined) {
      params.push(new Date(to));
      conditions.push(`o.created_at <= $${params.length}`);
    }
  }

  if (q !== undefined && String(q).trim() !== "") {
    const search = String(q).trim();
    const clauses = [];
    params.push(`%${escapeLike(search)}%`);
    clauses.push(`o.client_contact ILIKE $${params.length}`);

    const number = Number(search);

    if (Number.isInteger(number)) {
      params.push(number);
      clauses.push(`o.number = $${params.length}`);
    }

    conditions.push(`(${clauses.join(" OR ")})`);
  }

  if (kitchen) {
    // Cocina no ve los retiros de la app hasta que se cobran; los domicilios de la
    // app entran con el pago pendiente. Rechazados y en reparto ya no son de cocina.
    conditions.push(`NOT (o.order_type = 'qr' AND o.payment_status = 'pending')`);
    conditions.push(`o.status NOT IN ('rejected', 'out_for_delivery')`);
  }

  if (appDeliveryOnly) {
    conditions.push(APP_DELIVERY_SQL);
  }

  if (driverId !== undefined) {
    // Un repartidor solo ve en reparto los pedidos que tomó él.
    params.push(String(driverId));
    conditions.push(`(o.status <> 'out_for_delivery' OR o.driver_id = $${params.length})`);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const limitValue = limit ?? 50;
  const offsetValue = offset ?? 0;

  const { rows } = await pool.query(
    `${ORDER_SELECT} ${where} ORDER BY o.created_at DESC
     LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, limitValue, offsetValue]
  );

  return rows.map(rowToOrder);
}

export async function findOrderById(orderId, tenantId) {
  const objectId = toOrderObjectId(orderId);

  if (!objectId) {
    return null;
  }

  const params = [objectId];
  let tenantClause = "";

  if (tenantId !== undefined) {
    params.push(tenantId);
    tenantClause = `AND o.tenant_id = $${params.length}`;
  }

  const { rows } = await getPgPool().query(
    `${ORDER_SELECT} WHERE o.id = $1 ${tenantClause}`,
    params
  );

  return rows.length > 0 ? rowToOrder(rows[0]) : null;
}

export async function updateOrderStatus(orderId, status, actorId) {
  const objectId = toOrderObjectId(orderId);

  if (!objectId) {
    return null;
  }

  const { rows } = await getPgPool().query(
    `UPDATE orders
     SET status = $2, updated_at = NOW(),
         status_history = status_history || $3::jsonb
     WHERE id = $1
     RETURNING *`,
    [
      objectId,
      status,
      JSON.stringify([
        {
          status,
          at: new Date(),
          by: actorId ? String(actorId) : null,
        },
      ]),
    ]
  );

  return rows.length > 0 ? rowToOrder(rows[0]) : null;
}

export async function createOrder(order, client = getPgPool()) {
  const id = generateObjectIdHex();
  const pool = client;

  const { rows } = await pool.query(
    `INSERT INTO orders
       (id, tenant_id, foodtruck_id, number, status, order_type, payment_status,
        payment_method, client_contact, client_phone, client_name, points_awarded,
        items, status_history, total, cash_session_id, paid_at, paid_by,
        delivery_address, delivery_reference, delivery_lat, delivery_lng, delivery_accuracy_m,
        delivery_distance_km, delivery_eta_minutes, delivery_out_of_range,
        expected_payment_method, cash_tendered, client_request_id, customer_address_id,
        payment_history, tracking_token_hash)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18,
             $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32)
     RETURNING *`,
    [
      id,
      order.tenantId ?? null,
      order.foodtruckId ?? null,
      order.number ?? 0,
      order.status ?? "new",
      order.orderType ?? "takeaway",
      order.paymentStatus ?? "pending",
      order.paymentMethod ?? null,
      order.clientContact ?? null,
      order.clientPhone ?? null,
      order.clientName ?? null,
      order.pointsAwarded ?? false,
      JSON.stringify(order.items ?? []),
      JSON.stringify(order.statusHistory ?? []),
      order.total ?? 0,
      order.cashSessionId ?? null,
      order.cashSessionId ? new Date() : null,
      order.cashSessionId && order.paidBy ? String(order.paidBy) : null,
      order.deliveryAddress ?? null,
      order.deliveryReference ?? null,
      order.deliveryLat ?? null,
      order.deliveryLng ?? null,
      order.deliveryAccuracyM ?? null,
      order.deliveryDistanceKm ?? null,
      order.deliveryEtaMinutes ?? null,
      order.deliveryOutOfRange ?? null,
      order.expectedPaymentMethod ?? null,
      order.cashTendered ?? null,
      order.clientRequestId ?? null,
      order.customerAddressId ?? null,
      JSON.stringify(
        order.paymentHistory ?? [
          {
            status: order.paymentStatus ?? "pending",
            method: order.paymentMethod ?? null,
            at: new Date(),
            by: order.paidBy ? String(order.paidBy) : null,
            note: null,
          },
        ]
      ),
      order.trackingTokenHash ?? null,
    ]
  );

  return rowToOrder(rows[0]);
}

export async function findByClientRequestId(tenantId, clientRequestId) {
  const { rows } = await getPgPool().query(
    `${ORDER_SELECT} WHERE o.tenant_id = $1 AND o.client_request_id = $2`,
    [tenantId, clientRequestId]
  );

  return rows.length > 0 ? rowToOrder(rows[0]) : null;
}

export async function findByTrackingTokenHash(tenantId, tokenHash) {
  const { rows } = await getPgPool().query(
    `${ORDER_SELECT} WHERE o.tenant_id = $1 AND o.tracking_token_hash = $2`,
    [tenantId, tokenHash]
  );

  return rows.length > 0 ? rowToOrder(rows[0]) : null;
}

export async function updateOrderItems(orderId, items) {
  const objectId = toOrderObjectId(orderId);

  if (!objectId) {
    throw new NotFoundError("Order not found.");
  }

  const { rows } = await getPgPool().query(
    `UPDATE orders SET items = $2, updated_at = NOW() WHERE id = $1 RETURNING *`,
    [objectId, JSON.stringify(items)]
  );

  if (rows.length === 0) {
    throw new NotFoundError("Order not found.");
  }

  return rowToOrder(rows[0]);
}

function historyEntry(status, actorId) {
  return JSON.stringify([{ status, at: new Date(), by: actorId ? String(actorId) : null }]);
}

/** Lee y bloquea el pedido dentro de una transacción. */
export async function lockOrder(client, orderId) {
  const objectId = toOrderObjectId(orderId);

  if (!objectId) {
    return null;
  }

  const { rows } = await client.query(`SELECT * FROM orders WHERE id = $1 FOR UPDATE`, [objectId]);
  return rows.length > 0 ? rowToOrder(rows[0]) : null;
}

/** Marca como cobrado un pedido pendiente (o con cobro rechazado) y lo asocia a la caja. */
export async function markPaid(client, orderId, { paymentMethod, cashSessionId, paidBy, note = null }) {
  const { rows } = await client.query(
    `UPDATE orders
     SET payment_status = 'paid', payment_method = $2, cash_session_id = $3,
         paid_at = NOW(), paid_by = $4, updated_at = NOW(),
         payment_history = payment_history || $5::jsonb
     WHERE id = $1 AND payment_status IN ('pending', 'declined')
       AND status NOT IN ('cancelled', 'rejected')
     RETURNING *`,
    [
      orderId,
      paymentMethod,
      cashSessionId,
      paidBy ? String(paidBy) : null,
      paymentEntry("paid", { method: paymentMethod, actorId: paidBy, note }),
    ]
  );

  return rows.length > 0 ? rowToOrder(rows[0]) : null;
}

/** Cambia el estado operativo dentro de una transacción y lo registra en el historial. */
export async function setStatus(client, orderId, { status, actorId, driverId }) {
  const params = [orderId, status, historyEntry(status, actorId)];
  let driverClause = "";

  if (driverId !== undefined) {
    params.push(driverId ? String(driverId) : null);
    driverClause = `, driver_id = $${params.length}`;
  }

  const { rows } = await client.query(
    `UPDATE orders
     SET status = $2, updated_at = NOW(),
         status_history = status_history || $3::jsonb ${driverClause}
     WHERE id = $1
     RETURNING *`,
    params
  );

  return rows.length > 0 ? rowToOrder(rows[0]) : null;
}

/** Asigna o reasigna el repartidor sin cambiar el estado. */
export async function setDriver(client, orderId, { driverId, actorId }) {
  const { rows } = await client.query(
    `UPDATE orders
     SET driver_id = $2, updated_at = NOW(),
         status_history = status_history || $3::jsonb
     WHERE id = $1
     RETURNING *`,
    [
      orderId,
      String(driverId),
      JSON.stringify([
        { status: "driver_assigned", at: new Date(), by: actorId ? String(actorId) : null, driverId: String(driverId) },
      ]),
    ]
  );

  return rows.length > 0 ? rowToOrder(rows[0]) : null;
}

/** El local rechaza un pedido de la app: estado `rejected` y pago `voided`. */
export async function markRejected(client, orderId, { reason, actorId }) {
  const { rows } = await client.query(
    `UPDATE orders
     SET status = 'rejected', payment_status = 'voided',
         rejection_reason = $2, rejected_by = $3, rejected_at = NOW(), updated_at = NOW(),
         status_history = status_history || $4::jsonb,
         payment_history = payment_history || $5::jsonb
     WHERE id = $1
     RETURNING *`,
    [
      orderId,
      reason,
      actorId ? String(actorId) : null,
      historyEntry("rejected", actorId),
      paymentEntry("voided", { actorId, note: reason }),
    ]
  );

  return rows.length > 0 ? rowToOrder(rows[0]) : null;
}

/** Registra un cobro con tarjeta rechazado en la entrega; no cambia el estado operativo. */
export async function markPaymentDeclined(client, orderId, { actorId, note }) {
  const { rows } = await client.query(
    `UPDATE orders
     SET payment_status = 'declined', updated_at = NOW(),
         payment_history = payment_history || $2::jsonb
     WHERE id = $1
     RETURNING *`,
    [orderId, paymentEntry("declined", { actorId, note: note ?? null })]
  );

  return rows.length > 0 ? rowToOrder(rows[0]) : null;
}

export async function markCancelled(client, orderId, { reason, actorId, refunded }) {
  const paymentStatus = refunded ? "refunded" : "voided";
  const { rows } = await client.query(
    `UPDATE orders
     SET status = 'cancelled',
         payment_status = $4,
         cancel_reason = $2, cancelled_by = $3, cancelled_at = NOW(), updated_at = NOW(),
         status_history = status_history || $5::jsonb,
         payment_history = payment_history || $6::jsonb
     WHERE id = $1
     RETURNING *`,
    [
      orderId,
      reason,
      actorId ? String(actorId) : null,
      paymentStatus,
      historyEntry("cancelled", actorId),
      paymentEntry(paymentStatus, { actorId, note: reason }),
    ]
  );

  return rows.length > 0 ? rowToOrder(rows[0]) : null;
}

export async function replaceItems(client, orderId, { items, total, actorId }) {
  const { rows } = await client.query(
    `UPDATE orders
     SET items = $2, total = $3, corrected_by = $4, corrected_at = NOW(), updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [orderId, JSON.stringify(items), total, actorId ? String(actorId) : null]
  );

  return rows.length > 0 ? rowToOrder(rows[0]) : null;
}

export async function updateOrderPointsAwarded(orderId) {
  const objectId = toOrderObjectId(orderId);

  if (!objectId) {
    return null;
  }

  const { rows } = await getPgPool().query(
    `UPDATE orders
     SET points_awarded = TRUE, updated_at = NOW()
     WHERE id = $1 AND points_awarded IS NOT TRUE
     RETURNING *`,
    [objectId]
  );

  return rows.length > 0 ? rowToOrder(rows[0]) : null;
}
/** Tramos de distancia del reporte de delivery, en km. */
export const DELIVERY_DISTANCE_BUCKETS = Object.freeze([
  { key: "0-2", min: 0, max: 2 },
  { key: "2-5", min: 2, max: 5 },
  { key: "5-10", min: 5, max: 10 },
  { key: "10+", min: 10, max: null },
]);

/**
 * Pedidos a domicilio de un periodo con su estimación, para el reporte de análisis.
 * Excluye los anulados.
 */
export async function listDeliveryOrders({ tenantId, branchId, from, to, limit = 500 }) {
  const conditions = [`o.order_type = 'delivery'`, `o.status <> 'cancelled'`];
  const params = [];

  if (tenantId !== undefined) {
    params.push(tenantId);
    conditions.push(`o.tenant_id = $${params.length}`);
  }

  if (branchId !== undefined) {
    params.push(branchId);
    conditions.push(`o.foodtruck_id = $${params.length}`);
  }

  if (from !== undefined) {
    params.push(new Date(from));
    conditions.push(`o.created_at >= $${params.length}`);
  }

  if (to !== undefined) {
    params.push(new Date(to));
    conditions.push(`o.created_at <= $${params.length}`);
  }

  params.push(limit);

  const { rows } = await getPgPool().query(
    `${ORDER_SELECT}
     WHERE ${conditions.join(" AND ")}
     ORDER BY o.created_at DESC
     LIMIT $${params.length}`,
    params
  );

  return rows.map(rowToOrder);
}
