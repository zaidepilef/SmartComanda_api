import { getPgPool } from "../db/postgres.js";
import { CASH_SESSION_STATUSES } from "../models/cashSession.js";
import { toObjectIdHex, generateObjectIdHex } from "../utils/id.js";
import { NotFoundError } from "../utils/errors.js";

export function toCashSessionObjectId(id) {
  return toObjectIdHex(id);
}

function rowToSession(row) {
  if (!row) {
    return null;
  }

  return {
    _id: row.id,
    id: row.id,
    tenantId: row.tenant_id,
    branchId: row.branch_id,
    openedBy: row.opened_by,
    openedAt: row.opened_at,
    openingAmount: Number(row.opening_amount),
    status: row.status,
    closedAt: row.closed_at,
    closedBy: row.closed_by,
    orderCount: row.order_count,
    closingNote: row.closing_note ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function createCashSession(session) {
  const id = generateObjectIdHex();
  const pool = getPgPool();

  const { rows } = await pool.query(
    `INSERT INTO cash_sessions
       (id, tenant_id, branch_id, opened_by, opened_at, opening_amount, status, order_count)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING *`,
    [
      id,
      session.tenantId,
      session.branchId,
      session.openedBy ?? null,
      session.openedAt ?? new Date(),
      session.openingAmount ?? 0,
      session.status ?? CASH_SESSION_STATUSES.OPEN,
      session.orderCount ?? 0,
    ]
  );

  return rowToSession(rows[0]);
}

export async function findOpenByBranch(branchId, tenantId) {
  const pool = getPgPool();

  const { rows } = await pool.query(
    `SELECT * FROM cash_sessions
     WHERE branch_id = $1
       AND tenant_id = $2
       AND status = $3
     LIMIT 1`,
    [branchId, tenantId, CASH_SESSION_STATUSES.OPEN]
  );

  return rowToSession(rows[0] ?? null);
}

export async function findSessionById(sessionId, tenantId) {
  const pool = getPgPool();
  const conditions = ["id = $1"];
  const params = [sessionId];

  if (tenantId !== undefined) {
    params.push(tenantId);
    conditions.push(`tenant_id = $${params.length}`);
  }

  const { rows } = await pool.query(
    `SELECT * FROM cash_sessions WHERE ${conditions.join(" AND ")}`,
    params
  );

  return rowToSession(rows[0] ?? null);
}

export async function findTotalsBySessionId(sessionId) {
  const pool = getPgPool();

  const { rows } = await pool.query(
    `SELECT method, amount FROM cash_session_totals WHERE session_id = $1`,
    [sessionId]
  );

  const totals = {};

  for (const row of rows) {
    totals[row.method] = Number(row.amount);
  }

  return totals;
}

/** Lee y bloquea la caja abierta de la sucursal dentro de una transacción. */
export async function lockOpenByBranch(client, branchId, tenantId) {
  const { rows } = await client.query(
    `SELECT * FROM cash_sessions
     WHERE branch_id = $1 AND tenant_id = $2 AND status = $3
     LIMIT 1
     FOR UPDATE`,
    [branchId, tenantId, CASH_SESSION_STATUSES.OPEN]
  );

  return rowToSession(rows[0] ?? null);
}

export async function lockById(client, sessionId) {
  const { rows } = await client.query(`SELECT * FROM cash_sessions WHERE id = $1 FOR UPDATE`, [
    sessionId,
  ]);

  return rowToSession(rows[0] ?? null);
}

/**
 * Suma (o resta, con valores negativos) una venta al total del medio de pago
 * y a la cantidad de ventas de la caja.
 */
export async function recordSale(client, sessionId, { method, amount, count }) {
  await client.query(
    `INSERT INTO cash_session_totals (session_id, method, amount)
     VALUES ($1, $2, $3)
     ON CONFLICT (session_id, method)
     DO UPDATE SET amount = cash_session_totals.amount + EXCLUDED.amount`,
    [sessionId, method, amount]
  );

  await client.query(
    `UPDATE cash_sessions SET order_count = GREATEST(order_count + $2, 0), updated_at = NOW()
     WHERE id = $1`,
    [sessionId, count]
  );
}

/** Cierra la caja y guarda el arqueo por medio de pago. */
export async function saveClosure(client, sessionId, { closedBy, note, lines }) {
  const { rows } = await client.query(
    `UPDATE cash_sessions
     SET status = $2, closed_at = NOW(), closed_by = $3, closing_note = $4, updated_at = NOW()
     WHERE id = $1 AND status = $5
     RETURNING *`,
    [sessionId, CASH_SESSION_STATUSES.CLOSED, closedBy ?? null, note ?? null, CASH_SESSION_STATUSES.OPEN]
  );

  if (rows.length === 0) {
    return null;
  }

  for (const line of lines) {
    await client.query(
      `INSERT INTO cash_session_closures (session_id, method, expected, counted, difference)
       VALUES ($1, $2, $3, $4, $5)`,
      [sessionId, line.method, line.expected, line.counted, line.difference]
    );
  }

  return rowToSession(rows[0]);
}

export async function findClosureLines(sessionId) {
  const { rows } = await getPgPool().query(
    `SELECT method, expected, counted, difference FROM cash_session_closures
     WHERE session_id = $1 ORDER BY method`,
    [sessionId]
  );

  return rows.map((row) => ({
    method: row.method,
    expected: Number(row.expected),
    counted: Number(row.counted),
    difference: Number(row.difference),
  }));
}
