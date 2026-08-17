import * as tenantRepository from "../repositories/tenantRepository.js";
import { ForbiddenError, NotFoundError } from "../utils/errors.js";
import { isGlobalActor } from "../utils/tenantScope.js";

export async function listTenants({ actor, active } = {}) {
  const normalizedActive = active === undefined ? undefined : active === true || active === "true";

  if (isGlobalActor(actor)) {
    return tenantRepository.listTenants({ active: normalizedActive });
  }

  return tenantRepository.listTenants({ active: normalizedActive, id: actor.tenantId });
}

export async function getTenantById(id, actor) {
  const tenant = await tenantRepository.findTenantById(id);

  if (!tenant) {
    throw new NotFoundError("Tenant not found.");
  }

  if (!isGlobalActor(actor) && String(tenant._id) !== String(actor.tenantId)) {
    throw new NotFoundError("Tenant not found.");
  }

  return tenant;
}

export async function createTenant(tenantInput) {
  return tenantRepository.createTenant(tenantInput);
}

export async function updateTenantById(id, tenantInput, actor) {
  if (!isGlobalActor(actor)) {
    if (String(id) !== String(actor.tenantId)) {
      throw new NotFoundError("Tenant not found.");
    }

    const allowedKeys = ["loyalty"];

    const scoped = Object.fromEntries(
      Object.entries(tenantInput).filter(([key]) => allowedKeys.includes(key))
    );

    if (Object.keys(scoped).length === 0) {
      throw new ForbiddenError("Forbidden. Only the tenant loyalty rule can be updated.");
    }

    return tenantRepository.updateTenant(id, scoped);
  }

  return tenantRepository.updateTenant(id, tenantInput);
}