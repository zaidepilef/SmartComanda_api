import * as tenantRepository from "../repositories/tenantRepository.js";

export async function listTenants({ active } = {}) {
  const filter = {};

  if (active !== undefined) {
    filter.active = active === true || active === "true";
  }

  return tenantRepository.listTenants(filter);
}

export async function createTenant(tenantInput) {
  return tenantRepository.createTenant(tenantInput);
}

export async function updateTenantById(id, tenantInput) {
  return tenantRepository.updateTenant(id, tenantInput);
}