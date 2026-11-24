import express, { Router } from "express";
import * as journeyController from "../controllers/journeyController.js";
import { journeyEventsRateLimit } from "../middleware/rateLimit.js";
import { validateBody } from "../middleware/validation.js";
import { journeyEventBatchSchema } from "../validation/journeySchemas.js";

const router = Router();

const MAX_BODY_SIZE = "32kb";

// navigator.sendBeacon envía text/plain para evitar el preflight CORS:
// se acepta y se interpreta como JSON.
function parseTextBody(req, res, next) {
  if (typeof req.body !== "string") {
    return next();
  }

  try {
    req.body = JSON.parse(req.body);
    return next();
  } catch {
    return res.status(400).json({ error: "Invalid JSON body." });
  }
}

router.use(journeyEventsRateLimit);

router.post(
  "/",
  express.text({ type: "text/plain", limit: MAX_BODY_SIZE }),
  parseTextBody,
  validateBody(journeyEventBatchSchema),
  journeyController.ingestEvents
);

export default router;
