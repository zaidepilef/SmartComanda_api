/**
 * Teléfono móvil chileno en formato canónico `+569XXXXXXXX` (ver customer-recognition).
 */
export const CHILEAN_MOBILE_PATTERN = /^\+569\d{8}$/;

const ACCEPTED_INPUT = /^(?:\+?56)?(9\d{8})$/;
const SEPARATORS = /[\s\-().]/g;

/** Acepta `9XXXXXXXX`, `569XXXXXXXX` o `+569XXXXXXXX` (con espacios o guiones). */
export function normalizeChileanMobile(value) {
  if (typeof value !== "string") {
    return null;
  }

  const match = value.replace(SEPARATORS, "").match(ACCEPTED_INPUT);
  return match ? `+56${match[1]}` : null;
}

/** Versión tolerante para datos antiguos: además ignora ceros iniciales (`0569…`). */
export function normalizeLegacyPhone(value) {
  if (typeof value !== "string") {
    return null;
  }

  return normalizeChileanMobile(value.replace(SEPARATORS, "").replace(/^0+/, ""));
}
