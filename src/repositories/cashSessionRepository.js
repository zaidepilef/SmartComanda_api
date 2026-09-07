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

export async function closeSession(sessionId, tenantId, patch) {
  const pool = getPgPool();
  const conditions = ["id = $1", "status = $2"];
  const params = [sessionId, CASH_SESSION_STATUSES.OPEN];

  if (tenantId !== undefined) {
    params.push(tenantId);
    conditions.push(`tenant_id = $${params.length}`);
  }

  params.push(patch.closedAt ?? new Date());
  params.push(patch.closedBy ?? null);

  const { rows } = await pool.query(
    `UPDATE cash_sessions
     SET status = $3, closed_at = $4, closed_by = $5, updated_at = NOW()
     WHERE ${conditions.join(" AND ")}
     RETURNING *`,
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

export async function incrementTotals(sessionId, method, total) {
  const pool = getPgPool();

  const { rows } = await pool.query(
    `INSERT INTO cash_session_totals (session_id, method, amount)
     VALUES ($1, $2, $3)
     ON CONFLICT (session_id, method)
     DO UPDATE SET amount = cash_session_totals.amount + EXCLUDED.amount
     RETURNING *`,
    [sessionId, method, total]
  );

  return rows[0] ?? null;
}
