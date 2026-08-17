import * as cashSessionRepository from "../repositories/cashSessionRepository.js";
import * as branchRepository from "../repositories/branchRepository.js";
import {
  CASH_SESSION_STATUSES,
  createCashSessionTotals,
} from "../models/cashSession.js";
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
