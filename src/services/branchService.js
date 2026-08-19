import * as branchRepository from "../repositories/branchRepository.js";
import { findTenantById } from "../repositories/tenantRepository.js";
import { ForbiddenError, NotFoundError } from "../utils/errors.js";
import { getTenantFilter, isGlobalActor } from "../utils/tenantScope.js";

async function assertTenantExists(tenantId) {
  const tenant = await findTenantById(tenantId);

  if (!tenant) {
    throw new NotFoundError("Tenant not found.");
  }
}

function assertCanAssignTenant(actor, tenantId) {
  if (!isGlobalActor(actor) && String(tenantId) !== String(actor.tenantId)) {
    throw new ForbiddenError("Forbidden. Cannot assign a tenant outside your own.");
  }
}

async function assertBranchOwnership(actor, branchId) {
  if (isGlobalActor(actor)) {
    return;
  }

  const branch = await branchRepository.findBranchById(branchId);

  if (!branch || String(branch.tenantId) !== String(actor.tenantId)) {
    throw new ForbiddenError("Forbidden. Cannot manage a branch outside your own tenant.");
  }
}

export async function listBranches(actor, { tenantId, active, q } = {}) {
  const normalizedActive =
    active === undefined ? undefined : active === true || active === "true";

  const filter = getTenantFilter(actor);

  if (tenantId !== undefined && isGlobalActor(actor)) {
    filter.tenantId = tenantId;
  }

  if (q !== undefined) {
    filter.q = q;
  }

  const effectiveActive = actor?.role === "cashier" ? true : normalizedActive;

  return branchRepository.listBranches({ ...filter, active: effectiveActive });
}

export async function createBranch(actor, branchInput) {
  assertCanAssignTenant(actor, branchInput.tenantId);
  await assertTenantExists(branchInput.tenantId);
  return branchRepository.createBranch(branchInput);
}

export async function updateBranchById(actor, id, branchInput) {
  if (branchInput.tenantId !== undefined) {
    assertCanAssignTenant(actor, branchInput.tenantId);
  }

  await assertBranchOwnership(actor, id);

  if (branchInput.tenantId !== undefined) {
    await assertTenantExists(branchInput.tenantId);
  }

  return branchRepository.updateBranch(id, branchInput);
}

export async function getBranchById(actor, id) {
  const branch = await branchRepository.findBranchById(id);

  if (!branch) {
    throw new NotFoundError("Branch not found.");
  }

  if (!isGlobalActor(actor) && String(branch.tenantId) !== String(actor.tenantId)) {
    throw new ForbiddenError("Forbidden. Cannot access a branch outside your own tenant.");
  }

  return branch;
}
