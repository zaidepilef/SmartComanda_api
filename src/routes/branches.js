import { Router } from "express";
import * as branchController from "../controllers/branchController.js";
import * as journeyController from "../controllers/journeyController.js";
import authRequired from "../middleware/authRequired.js";
import requireManager from "../middleware/requireManager.js";
import { validateBody, validateParams, validateQuery } from "../middleware/validation.js";
import {
  createBranchSchema,
  listBranchesQuerySchema,
  updateBranchSchema,
} from "../validation/branchSchemas.js";
import { journeyRangeQuerySchema, journeySessionIdSchema } from "../validation/journeySchemas.js";
import { z } from "zod";

const router = Router();

router.use(authRequired);

router.get("/", validateQuery(listBranchesQuerySchema), branchController.listBranches);
router.post("/", requireManager, validateBody(createBranchSchema), branchController.createBranch);
router.put("/:id", requireManager, validateBody(updateBranchSchema), branchController.updateBranch);
router.get("/:id", requireManager, branchController.getBranch);

// Recorrido de clientes QR (spec customer-journey-viewer).
router.get(
  "/:id/journey/sessions",
  requireManager,
  validateQuery(journeyRangeQuerySchema),
  journeyController.listSessions
);
router.get(
  "/:id/journey/sessions/:sessionId",
  requireManager,
  validateParams(z.object({ id: z.string(), sessionId: journeySessionIdSchema })),
  journeyController.getSessionTimeline
);
router.get(
  "/:id/journey/funnel",
  requireManager,
  validateQuery(journeyRangeQuerySchema),
  journeyController.getFunnel
);

export default router;
