import { getPgPool } from "../db/postgres.js";
import { toObjectIdHex, generateObjectIdHex } from "../utils/id.js";
import { NotFoundError } from "../utils/errors.js";

export function toOrderObjectId(id) {
  return toObjectIdHex(id);
}

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
    cancelReason: row.cancel_reason ?? null,
    cancelledBy: row.cancelled_by ?? null,
    cancelledAt: row.cancelled_at ?? null,
    correctedBy: row.corrected_by ?? null,
    correctedAt: row.corrected_at ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
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
  limit,
  offset,
}) {
  const pool = getPgPool();
  const conditions = [];
  const params = [];

  if (tenantId !== undefined) {
    params.push(tenantId);
    conditions.push(`tenant_id = $${params.length}`);
  }

  if (branchId !== undefined) {
    params.push(branchId);
    conditions.push(`foodtruck_id = $${params.length}`);
  }

  if (status !== undefined) {
    const statuses = Array.isArray(status) ? status : [status];
    params.push(statuses);
    conditions.push(`status = ANY($${params.length}::varchar[])`);
  }

  if (orderType !== undefined) {
    params.push(orderType);
    conditions.push(`order_type = $${params.length}`);
  }

  if (paymentStatus !== undefined) {
    params.push(paymentStatus);
    conditions.push(`payment_status = $${params.length}`);
  }

  if (paymentMethod !== undefined) {
    params.push(paymentMethod);
    conditions.push(`payment_method = $${params.length}`);
  }

  if (from !== undefined || to !== undefined) {
    if (from !== undefined) {
      params.push(new Date(from));
      conditions.push(`created_at >= $${params.length}`);
    }

    if (to !== undefined) {
      params.push(new Date(to));
      conditions.push(`created_at <= $${params.length}`);
    }
  }

  if (q !== undefined && String(q).trim() !== "") {
    const search = String(q).trim();
    const clauses = [];
    params.push(`%${escapeLike(search)}%`);
    clauses.push(`client_contact ILIKE $${params.length}`);

    const number = Number(search);

    if (Number.isInteger(number)) {
      params.push(number);
      clauses.push(`number = $${params.length}`);
    }

    conditions.push(`(${clauses.join(" OR ")})`);
  }

  if (kitchen) {
    // Cocina no ve pedidos QR hasta que se cobran.
    conditions.push(`NOT (order_type = 'qr' AND payment_status = 'pending')`);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const limitValue = limit ?? 50;
  const offsetValue = offset ?? 0;

  const { rows } = await pool.query(
    `SELECT * FROM orders ${where} ORDER BY created_at DESC
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
    tenantClause = `AND tenant_id = $${params.length}`;
  }

  const { rows } = await getPgPool().query(
    `SELECT * FROM orders WHERE id = $1 ${tenantClause}`,
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
        items, status_history, total, cash_session_id, paid_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
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
    ]
  );

  return rowToOrder(rows[0]);
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

/** Marca como cobrado un pedido pendiente y lo asocia a la caja. */
export async function markPaid(client, orderId, { paymentMethod, cashSessionId }) {
  const { rows } = await client.query(
    `UPDATE orders
     SET payment_status = 'paid', payment_method = $2, cash_session_id = $3,
         paid_at = NOW(), updated_at = NOW()
     WHERE id = $1 AND payment_status = 'pending' AND status <> 'cancelled'
     RETURNING *`,
    [orderId, paymentMethod, cashSessionId]
  );

  return rows.length > 0 ? rowToOrder(rows[0]) : null;
}

export async function markCancelled(client, orderId, { reason, actorId, refunded }) {
  const { rows } = await client.query(
    `UPDATE orders
     SET status = 'cancelled',
         payment_status = CASE WHEN $4 THEN 'refunded' ELSE payment_status END,
         cancel_reason = $2, cancelled_by = $3, cancelled_at = NOW(), updated_at = NOW(),
         status_history = status_history || $5::jsonb
     WHERE id = $1
     RETURNING *`,
    [orderId, reason, actorId ? String(actorId) : null, Boolean(refunded), historyEntry("cancelled", actorId)]
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