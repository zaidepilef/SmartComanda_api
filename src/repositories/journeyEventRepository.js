import { getPgPool } from "../db/postgres.js";
import { generateObjectIdHex } from "../utils/id.js";

const INSERT_COLUMNS = 9;

function rowToEvent(row) {
  return {
    id: row.id,
    sessionId: row.session_id,
    type: row.type,
    source: row.source,
    customerId: row.customer_id ?? null,
    orderId: row.order_id ?? null,
    data: row.data ?? {},
    occurredAt: row.occurred_at,
  };
}

/**
 * Inserta varios eventos en una sola sentencia.
 * @param {Array<{tenantId, branchId, sessionId, type, source, customerId?, orderId?, data?, occurredAt}>} events
 */
export async function insertEvents(events) {
  if (events.length === 0) {
    return 0;
  }

  const values = [];
  const placeholders = events.map((event, index) => {
    const base = index * INSERT_COLUMNS;
    values.push(
      generateObjectIdHex(),
      event.tenantId,
      event.branchId,
      event.sessionId,
      event.type,
      event.source,
      event.customerId ?? null,
      event.orderId ?? null,
      JSON.stringify(event.data ?? {})
    );
    const params = Array.from({ length: INSERT_COLUMNS }, (_, i) => `$${base + i + 1}`);
    return `(${params.join(", ")}, $${events.length * INSERT_COLUMNS + index + 1})`;
  });

  values.push(...events.map((event) => event.occurredAt));

  const { rowCount } = await getPgPool().query(
    `INSERT INTO customer_journey_events
       (id, tenant_id, branch_id, session_id, type, source, customer_id, order_id, data, occurred_at)
     VALUES ${placeholders.join(", ")}`,
    values
  );

  return rowCount;
}

/**
 * Sesiones de una sucursal con actividad en el rango, agregadas por session_id.
 * La etapa se deriva en el servicio a partir de estos indicadores.
 */
export async function listSessions({ tenantId, branchId, from, to, limit }) {
  const { rows } = await getPgPool().query(
    `WITH ranged AS (
       SELECT DISTINCT session_id
       FROM customer_journey_events
       WHERE tenant_id = $1 AND branch_id = $2 AND occurred_at >= $3 AND occurred_at < $4
     ),
     agg AS (
       SELECT
         e.session_id,
         MIN(e.occurred_at) AS started_at,
         MAX(e.occurred_at) AS last_activity_at,
         COUNT(*)::int AS event_count,
         BOOL_OR(e.type = 'identity_submitted') AS identified,
         COALESCE(SUM(CASE
           WHEN e.type = 'item_added' THEN (e.data->>'quantity')::int
           WHEN e.type = 'item_removed' THEN -(e.data->>'quantity')::int
           ELSE 0 END), 0)::int AS cart_quantity,
         (ARRAY_AGG(e.type ORDER BY e.occurred_at DESC, e.received_at DESC)
            FILTER (WHERE e.type IN ('order_submitted', 'order_created', 'order_failed')))[1]
           AS last_order_step,
         (ARRAY_AGG(e.data ORDER BY e.occurred_at DESC)
            FILTER (WHERE e.type = 'order_failed'))[1] AS last_failure,
         (ARRAY_AGG(e.customer_id ORDER BY e.occurred_at DESC)
            FILTER (WHERE e.customer_id IS NOT NULL))[1] AS customer_id,
         (ARRAY_AGG(e.order_id ORDER BY e.occurred_at DESC)
            FILTER (WHERE e.order_id IS NOT NULL))[1] AS order_id
       FROM customer_journey_events e
       JOIN ranged r ON r.session_id = e.session_id
       WHERE e.tenant_id = $1 AND e.branch_id = $2
       GROUP BY e.session_id
     )
     SELECT agg.*, c.first_name AS customer_name, c.phone AS customer_phone,
            o.number AS order_number, o.total AS order_total
     FROM agg
     LEFT JOIN customers c ON c.id = agg.customer_id AND c.tenant_id = $1
     LEFT JOIN orders o ON o.id = agg.order_id AND o.tenant_id = $1
     ORDER BY agg.last_activity_at DESC
     LIMIT $5`,
    [tenantId, branchId, from, to, limit]
  );

  return rows.map((row) => ({
    sessionId: row.session_id,
    startedAt: row.started_at,
    lastActivityAt: row.last_activity_at,
    eventCount: row.event_count,
    identified: row.identified,
    cartQuantity: row.cart_quantity,
    lastOrderStep: row.last_order_step ?? null,
    lastFailure: row.last_failure ?? null,
    customerName: row.customer_name ?? null,
    customerPhone: row.customer_phone ?? null,
    orderId: row.order_id ?? null,
    orderNumber: row.order_number ?? null,
    orderTotal: row.order_total === null || row.order_total === undefined ? null : Number(row.order_total),
  }));
}

export async function listSessionEvents({ tenantId, branchId, sessionId }) {
  const { rows } = await getPgPool().query(
    `SELECT * FROM customer_journey_events
     WHERE tenant_id = $1 AND branch_id = $2 AND session_id = $3
     ORDER BY occurred_at ASC, received_at ASC`,
    [tenantId, branchId, sessionId]
  );

  return rows.map(rowToEvent);
}

/**
 * Cantidad de sesiones que alcanzaron cada paso, e intentos fallidos.
 * Es acumulativo: una sesión que llegó a un paso cuenta en todos los anteriores,
 * aunque se haya perdido algún evento del cliente (cierre abrupto, bloqueador).
 */
export async function funnel({ tenantId, branchId, from, to }) {
  const { rows } = await getPgPool().query(
    `WITH per_session AS (
       SELECT
         session_id,
         BOOL_OR(type = 'identity_submitted') AS identified,
         BOOL_OR(type = 'item_added') AS with_cart,
         BOOL_OR(type IN ('order_submitted', 'order_created', 'order_failed')) AS submitted,
         BOOL_OR(type = 'order_created') AS created,
         COUNT(*) FILTER (WHERE type = 'order_failed')::int AS failures
       FROM customer_journey_events
       WHERE tenant_id = $1 AND branch_id = $2 AND occurred_at >= $3 AND occurred_at < $4
       GROUP BY session_id
     )
     SELECT
       COUNT(*)::int AS sessions,
       COUNT(*)::int AS qr_opened,
       COUNT(*) FILTER (WHERE identified OR with_cart OR submitted)::int AS identified,
       COUNT(*) FILTER (WHERE with_cart OR submitted)::int AS with_cart,
       COUNT(*) FILTER (WHERE submitted)::int AS order_submitted,
       COUNT(*) FILTER (WHERE created)::int AS order_created,
       COALESCE(SUM(failures), 0)::int AS failed_attempts
     FROM per_session`,
    [tenantId, branchId, from, to]
  );

  const row = rows[0];

  return {
    sessions: row.sessions,
    qrOpened: row.qr_opened,
    identified: row.identified,
    withCart: row.with_cart,
    orderSubmitted: row.order_submitted,
    orderCreated: row.order_created,
    failedAttempts: row.failed_attempts,
  };
}

export async function deleteOlderThan(days) {
  const { rowCount } = await getPgPool().query(
    `DELETE FROM customer_journey_events WHERE occurred_at < NOW() - ($1 || ' days')::interval`,
    [String(days)]
  );

  return rowCount;
}
