import * as customerRepository from "../repositories/customerRepository.js";
import { haversineKm } from "../utils/geo.js";

/** Máximo de direcciones guardadas por cliente (ver customer-recognition). */
export const MAX_SAVED_ADDRESSES = 5;

/** Distancia bajo la cual dos puntos se consideran la misma dirección. */
const SAME_ADDRESS_METERS = 30;

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

export function firstNameOf(name) {
  const first = String(name ?? "").trim().split(/\s+/)[0];
  return first || null;
}

/**
 * Etiqueta enmascarada de una dirección: la calle y los primeros dígitos del
 * número, sin referencia ni coordenadas. "Av. Providencia 1234, depto 56" → "Av. Providencia 12…".
 */
export function maskAddress(address) {
  const firstPart = String(address ?? "").split(",")[0].trim();
  const match = firstPart.match(/^(.*?\D)\s*(\d+)/);

  if (match) {
    return `${match[1].trim()} ${match[2].slice(0, 2)}…`;
  }

  return firstPart.length > 12 ? `${firstPart.slice(0, 12).trim()}…` : `${firstPart}…`;
}

/**
 * Búsqueda pública del cliente: solo primer nombre y direcciones enmascaradas.
 */
export async function lookupCustomer({ tenantId, phone }) {
  const customer = await customerRepository.findByTenantAndPhone(tenantId, phone);

  if (!customer) {
    return { known: false };
  }

  const addresses = await customerRepository.listAddresses(customer._id);

  return {
    known: true,
    firstName: firstNameOf(customer.firstName),
    addresses: addresses.map((entry) => ({ id: entry._id, label: maskAddress(entry.address) })),
    lastAddressId: addresses[0]?._id ?? null,
  };
}

/** Dirección guardada del cliente, o `null` si no le pertenece. */
export async function findCustomerAddress(customerId, addressId) {
  return customerRepository.findAddressForCustomer(addressId, customerId);
}

function normalizeText(text) {
  return String(text ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function isSameAddress(saved, candidate) {
  if (normalizeText(saved.address) === normalizeText(candidate.address)) {
    return true;
  }

  const meters = haversineKm(saved, candidate) * 1000;
  return meters < SAME_ADDRESS_METERS;
}

/**
 * Guarda la dirección usada en un domicilio: reutiliza una igual (mismo texto o a
 * menos de 30 m) y deja como máximo 5 por cliente.
 */
export async function saveDeliveryAddress({ tenantId, customerId, address, reference, lat, lng }) {
  const saved = await customerRepository.listAddresses(customerId);
  const match = saved.find((entry) => isSameAddress(entry, { address, lat, lng }));

  if (match) {
    return customerRepository.touchAddress(match._id, { reference });
  }

  const created = await customerRepository.insertAddress({
    tenantId,
    customerId,
    address,
    reference,
    lat,
    lng,
  });

  await customerRepository.pruneAddresses(customerId, MAX_SAVED_ADDRESSES);
  return created;
}

/** Marca como usada una dirección guardada (y actualiza su referencia si viene). */
export async function touchCustomerAddress(addressId, reference) {
  return customerRepository.touchAddress(addressId, { reference: reference || null });
}
