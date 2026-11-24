/**
 * Estimación de envío en línea recta (ver change delivery-location-estimate).
 * Única fuente de verdad: la usan el endpoint público de estimación y la creación del pedido.
 */

const EARTH_RADIUS_KM = 6371;

/** Factor que aproxima el recorrido por calles a partir de la línea recta. */
export const ROAD_FACTOR = 1.4;

export const DEFAULT_AVG_SPEED_KMH = 25;

const toRadians = (degrees) => (degrees * Math.PI) / 180;

function isCoordinate(point) {
  return (
    point != null &&
    Number.isFinite(point.lat) &&
    Number.isFinite(point.lng) &&
    Math.abs(point.lat) <= 90 &&
    Math.abs(point.lng) <= 180
  );
}

/** Distancia en línea recta entre dos puntos `{ lat, lng }`, en km. */
export function haversineKm(a, b) {
  const dLat = toRadians(b.lat - a.lat);
  const dLng = toRadians(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(a.lat)) * Math.cos(toRadians(b.lat)) * Math.sin(dLng / 2) ** 2;

  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Estima distancia y minutos desde la sucursal hasta el punto del cliente.
 * Devuelve `null` si la sucursal o el punto no tienen coordenadas válidas.
 */
export function estimateDelivery(branch, point) {
  const origin = branch ? { lat: branch.lat, lng: branch.lng } : null;

  if (!isCoordinate(origin) || !isCoordinate(point)) {
    return null;
  }

  const speed =
    Number.isFinite(branch.deliveryAvgSpeedKmh) && branch.deliveryAvgSpeedKmh > 0
      ? branch.deliveryAvgSpeedKmh
      : DEFAULT_AVG_SPEED_KMH;

  const distanceKm = Math.round(haversineKm(origin, point) * ROAD_FACTOR * 100) / 100;
  const etaMinutes = Math.max(1, Math.ceil((distanceKm / speed) * 60));

  const reasons = [];

  if (Number.isFinite(branch.deliveryMaxKm) && distanceKm > branch.deliveryMaxKm) {
    reasons.push("distance");
  }

  if (Number.isFinite(branch.deliveryMaxMinutes) && etaMinutes > branch.deliveryMaxMinutes) {
    reasons.push("time");
  }

  return { distanceKm, etaMinutes, outOfRange: reasons.length > 0, reasons };
}
