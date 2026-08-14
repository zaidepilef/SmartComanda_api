import * as tenantRepository from "../repositories/tenantRepository.js";
import { isGlobalActor } from "../utils/tenantScope.js";

export async function listTenants({ actor, active } = {}) {
  const normalizedActive = active === undefined ? undefined : active === true || active === "true";

  if (isGlobalActor(actor)) {
    return tenantRepository.listTenants({ active: normalizedActive });
  }

  return tenantRepository.listTenants({ active: normalizedActive, id: actor.tenantId });
}

export async function createTenant(tenantInput) {
  return tenantRepository.createTenant(tenantInput);
}

export async function updateTenantById(id, tenantInput) {
  return tenantRepository.updateTenant(id, tenantInput);
}