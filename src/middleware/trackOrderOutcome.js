import * as journeyService from "../services/journeyService.js";
import { JOURNEY_SESSION_HEADER } from "../models/journeyEvent.js";
import { journeySessionIdSchema } from "../validation/journeySchemas.js";

/**
 * Registra en el recorrido del cliente el resultado real de POST /api/public/orders
 * (creado o rechazado, incluida la validación). Va antes de la validación para
 * capturar también los rechazos con 400. Nunca afecta la respuesta del pedido.
 */
export function trackOrderOutcome(req, res, next) {
  const parsedSession = journeySessionIdSchema.safeParse(req.get(JOURNEY_SESSION_HEADER));

  if (!parsedSession.success) {
    return next();
  }

  const { tenantId, branchId, phone } = req.body ?? {};
  let responseBody;

  const originalJson = res.json.bind(res);
  res.json = (body) => {
    responseBody = body;
    return originalJson(body);
  };

  res.on("finish", () => {
    journeyService
      .recordOrderOutcome({
        sessionId: parsedSession.data,
        tenantId,
        branchId,
        phone,
        status: res.statusCode,
        body: responseBody,
      })
      .catch((error) => {
        console.error("Failed to record order outcome:", error.message);
      });
  });

  return next();
}

export default trackOrderOutcome;
