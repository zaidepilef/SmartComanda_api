import * as cashSessionRepository from "../repositories/cashSessionRepository.js";
import * as branchRepository from "../repositories/branchRepository.js";
import { CASH_SESSION_STATUSES } from "../models/cashSession.js";
import { findUserById } from "../repositories/userRepository.js";
import { withTransaction } from "../db/postgres.js";
import { ConflictError, ForbiddenError, NotFoundError } from "../utils/errors.js";
import { isGlobalActor } from "../utils/tenantScope.js";

async function assertBranchAccess(actor, branchId) {
  const branch = await branchRepository.findBranchById(branchId);

  if (!branch) {
    throw new NotFoundError("Branch not found.");
  }

  if (!isGlobalActor(actor) && String(branch.tenantId) !== String(actor.tenantId)) {
    throw new ForbiddenError("Forbidden. Cannot access a branch outside your tenant.");
  }

  return branch;
}

function assertTenantActor(actor) {
  if (!actor?.tenantId && !isGlobalActor(actor)) {
    throw new ForbiddenError("Forbidden. A tenant is required.");
  }
}

export async function openCashSession(actor, { branchId, openingAmount }) {
  assertTenantActor(actor);

  const branch = await assertBranchAccess(actor, branchId);
  const tenantId = isGlobalActor(actor) ? branch.tenantId : actor.tenantId;

  const existing = await cashSessionRepository.findOpenByBranch(branchId, tenantId);

  if (existing) {
    throw new ConflictError("A cash session is already open for this branch.");
  }

  const created = await cashSessionRepository.createCashSession({
    tenantId,
    branchId,
    openedBy: actor._id,
    openedAt: new Date(),
    status: CASH_SESSION_STATUSES.OPEN,
    orderCount: 0,
    openingAmount,
  });

  return withDetails(created);
}

/** Métodos que siempre aparecen en el arqueo, además de los que tengan ventas. */
const BASE_METHODS = ["cash", "debit", "credit", "transfer"];

function round(value) {
  return Math.round(value * 10000) / 10000;
}

/** Esperado por medio: efectivo = apertura + ventas en efectivo; resto = ventas. */
function expectedAmounts(session, totals) {
  const methods = new Set([...BASE_METHODS, ...Object.keys(totals)]);
  const expected = {};

  for (const method of methods) {
    expected[method] = round((totals[method] ?? 0) + (method === "cash" ? session.openingAmount : 0));
  }

  return expected;
}

async function withDetails(session) {
  if (!session) {
    return null;
  }

  const totals = await cashSessionRepository.findTotalsBySessionId(session.id);
  const normalized = Object.fromEntries(BASE_METHODS.map((method) => [method, 0]));
  Object.assign(normalized, totals);

  const opener = session.openedBy ? await findUserById(session.openedBy) : null;
  const result = {
    ...session,
    totals: normalized,
    expected: expectedAmounts(session, normalized),
    openedByName: opener ? [opener.firstName, opener.lastName].filter(Boolean).join(" ") : null,
  };

  if (session.status === CASH_SESSION_STATUSES.CLOSED) {
    result.closure = await cashSessionRepository.findClosureLines(session.id);
  }

  return result;
}

export async function getCurrentCashSession(actor, { branchId }) {
  assertTenantActor(actor);

  const branch = await assertBranchAccess(actor, branchId);
  const tenantId = isGlobalActor(actor) ? branch.tenantId : actor.tenantId;

  return withDetails(await cashSessionRepository.findOpenByBranch(branchId, tenantId));
}

/**
 * Cierra la caja y persiste el arqueo: por medio, lo esperado, lo contado
 * (a mano; si no se informa se asume lo esperado) y la diferencia.
 */
export async function closeCashSession(actor, sessionId, { closingAmounts, note } = {}) {
  const tenantId = isGlobalActor(actor) ? undefined : actor.tenantId;

  const session = await cashSessionRepository.findSessionById(sessionId, tenantId);

  if (!session) {
    throw new NotFoundError("Cash session not found.");
  }

  const closed = await withTransaction(async (client) => {
    const locked = await cashSessionRepository.lockById(client, sessionId);

    if (locked.status !== CASH_SESSION_STATUSES.OPEN) {
      throw new ConflictError("Cash session is already closed.");
    }

    // Los totales se leen con la caja bloqueada: ningún cobro entra a mitad del cierre.
    const { rows } = await client.query(
      "SELECT method, amount FROM cash_session_totals WHERE session_id = $1",
      [sessionId]
    );
    const totals = Object.fromEntries(rows.map((row) => [row.method, Number(row.amount)]));
    const expected = expectedAmounts(locked, totals);

    const lines = Object.entries(expected).map(([method, expectedAmount]) => {
      const counted = closingAmounts?.[method] ?? expectedAmount;
      return {
        method,
        expected: expectedAmount,
        counted,
        difference: round(counted - expectedAmount),
      };
    });

    return cashSessionRepository.saveClosure(client, sessionId, {
      closedBy: actor._id,
      note: note ?? null,
      lines,
    });
  });

  if (!closed) {
    throw new ConflictError("Cash session is already closed.");
  }

  const detailed = await withDetails(closed);
  const difference = Object.fromEntries(detailed.closure.map((line) => [line.method, line.difference]));
  const closingAmountsResult = Object.fromEntries(detailed.closure.map((line) => [line.method, line.counted]));

  return { ...detailed, closingAmounts: closingAmountsResult, difference };
}
