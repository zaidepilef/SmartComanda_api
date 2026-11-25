const WINDOW_MS = 15 * 60 * 1000;
const MAX_REQUESTS = 120;

/**
 * Límite de peticiones en memoria por IP y ruta (una sola réplica de la API).
 */
const defaultKey = (req) => `${req.ip}:${req.originalUrl.split("?")[0]}`;

export function createRateLimit({
  windowMs = WINDOW_MS,
  maxRequests = MAX_REQUESTS,
  keyFn = defaultKey,
} = {}) {
  const hitsByKey = new Map();

  return function rateLimit(req, res, next) {
    const key = keyFn(req);

    if (key === null) {
      return next();
    }

    const now = Date.now();

    const hits = (hitsByKey.get(key) ?? []).filter((timestamp) => now - timestamp < windowMs);

    if (hits.length >= maxRequests) {
      hitsByKey.set(key, hits);
      return res.status(429).json({ error: "Too many requests. Try again later." });
    }

    hits.push(now);
    hitsByKey.set(key, hits);

    return next();
  };
}

export const publicRateLimit = createRateLimit();

// Los eventos del recorrido se envían varias veces por visita y todos los clientes
// del Wi-Fi de un local comparten IP, por eso el límite es más alto.
export const journeyEventsRateLimit = createRateLimit({ maxRequests: 1200 });

// Búsqueda de clientes por teléfono: límite estricto por IP y por teléfono para
// dificultar recorrer números ajenos.
export const customerLookupIpRateLimit = createRateLimit({
  maxRequests: 30,
  keyFn: (req) => `lookup-ip:${req.ip}`,
});

export const customerLookupPhoneRateLimit = createRateLimit({
  maxRequests: 10,
  keyFn: (req) => {
    const digits = String(req.body?.phone ?? "").replace(/\D/g, "").slice(-8);
    return digits.length === 8 ? `lookup-phone:${digits}` : null;
  },
});

// Seguimiento del pedido: la app consulta cada 15 s y los clientes del Wi-Fi de
// un local comparten IP, por eso tiene su propio límite por IP, fuera del general.
export const orderTrackingRateLimit = createRateLimit({
  maxRequests: 1200,
  keyFn: (req) => `track-ip:${req.ip}`,
});
