const WINDOW_MS = 15 * 60 * 1000;
const MAX_REQUESTS = 120;

/**
 * Límite de peticiones en memoria por IP y ruta (una sola réplica de la API).
 */
export function createRateLimit({ windowMs = WINDOW_MS, maxRequests = MAX_REQUESTS } = {}) {
  const hitsByKey = new Map();

  return function rateLimit(req, res, next) {
    const key = `${req.ip}:${req.originalUrl.split("?")[0]}`;
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
