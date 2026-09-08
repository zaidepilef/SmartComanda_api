import * as customerRepository from "../repositories/customerRepository.js";

export async function upsertCustomer({ tenantId, phone, name }) {
  return customerRepository.upsertCustomer({ tenantId, phone, firstName: name });
}

export async function getCustomerByPhone({ tenantId, phone }) {
  return customerRepository.findByTenantAndPhone(tenantId, phone);
}

export async function getBalance({ tenantId, phone }) {
  const customer = await customerRepository.findByTenantAndPhone(tenantId, phone);
  return customer?.pointsBalance ?? 0;
}