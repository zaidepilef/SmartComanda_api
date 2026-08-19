export function toCustomerDocument(customer) {
  const now = new Date();

  const document = {
    tenantId: customer.tenantId,
    phone: customer.phone,
    pointsBalance: customer.pointsBalance ?? 0,
    createdAt: now,
    updatedAt: now,
  };

  if (customer.firstName !== undefined) {
    document.firstName = customer.firstName;
  }

  return document;
}