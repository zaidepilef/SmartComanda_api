const WINDOW_MS = 15 * 60 * 1000;
const MAX_REQUESTS = 120;

const hitsByKey = new Map();

export function publicRateLimit(req, res, next) {
  const key = `${req.ip}:${req.originalUrl.split("?")[0]}`;
  const now = Date.now();

  const hits = (hitsByKey.get(key) ?? []).filter((timestamp) => now - timestamp < WINDOW_MS);

  if (hits.length >= MAX_REQUESTS) {
    hitsByKey.set(key, hits);
    return res.status(429).json({ error: "Too many requests. Try again later." });
  }

  hits.push(now);
  hitsByKey.set(key, hits);

  return next();
}