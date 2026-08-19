import * as cashSessionRepository from "../repositories/cashSessionRepository.js";
import * as branchRepository from "../repositories/branchRepository.js";
import {
  CASH_SESSION_STATUSES,
  createCashSessionTotals,
} from "../models/cashSession.js";
import { PAYMENT_METHODS } from "../utils/paymentMethods.js";
import { ConflictError, ForbiddenError, NotFoundError } from "../utils/errors.js";
import { isGlobalActor } from "../utils/tenantScope.js";

function toBranchObjectId(branchId) {
  return cashSessionRepository.toCashSessionObjectId(branchId);
}

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

  return cashSessionRepository.createCashSession({
    tenantId,
    branchId: toBranchObjectId(branchId),
    openedBy: actor._id,
    openedAt: new Date(),
    status: CASH_SESSION_STATUSES.OPEN,
    totals: createCashSessionTotals(),
    orderCount: 0,
    openingAmount,
  });
}

export async function getCurrentCashSession(actor, { branchId }) {
  assertTenantActor(actor);

  const branch = await assertBranchAccess(actor, branchId);
  const tenantId = isGlobalActor(actor) ? branch.tenantId : actor.tenantId;

  return cashSessionRepository.findOpenByBranch(branchId, tenantId);
}

export async function closeCashSession(actor, sessionId, { closingAmounts } = {}) {
  const tenantId = isGlobalActor(actor) ? undefined : actor.tenantId;

  const session = await cashSessionRepository.findSessionById(sessionId, tenantId);

  if (!session) {
    throw new NotFoundError("Cash session not found.");
  }

  if (session.status !== CASH_SESSION_STATUSES.OPEN) {
    throw new ConflictError("Cash session is already closed.");
  }

  const totals = session.totals ?? createCashSessionTotals();
  const finalClosing = {};
  const difference = {};

  for (const method of PAYMENT_METHODS) {
    const closing = closingAmounts?.[method] ?? totals[method] ?? 0;
    finalClosing[method] = closing;
    difference[method] = closing - (totals[method] ?? 0);
  }

  const closed = await cashSessionRepository.closeSession(sessionId, tenantId, {
    closingAmounts: finalClosing,
    difference,
    closedAt: new Date(),
    closedBy: actor._id,
  });

  if (!closed) {
    throw new ConflictError("Cash session is already closed.");
  }

  return closed;
}
