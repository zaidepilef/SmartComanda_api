import { Router } from "express";
import * as branchController from "../controllers/branchController.js";
import authRequired from "../middleware/authRequired.js";
import requireManager from "../middleware/requireManager.js";
import { validateBody, validateQuery } from "../middleware/validation.js";
import {
  createBranchSchema,
  listBranchesQuerySchema,
  updateBranchSchema,
} from "../validation/branchSchemas.js";

const router = Router();

router.use(authRequired);

router.get("/", validateQuery(listBranchesQuerySchema), branchController.listBranches);
router.post("/", requireManager, validateBody(createBranchSchema), branchController.createBranch);
router.put("/:id", requireManager, validateBody(updateBranchSchema), branchController.updateBranch);
router.get("/:id", requireManager, branchController.getBranch);

export default router;
