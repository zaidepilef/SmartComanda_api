import { Router } from "express";
import * as tenantController from "../controllers/tenantController.js";
import authRequired from "../middleware/authRequired.js";
import requireSysadmin from "../middleware/requireSysadmin.js";
import { validateBody, validateParams, validateQuery } from "../middleware/validation.js";
import {
  createTenantSchema,
  listTenantsQuerySchema,
  updateTenantSchema,
} from "../validation/tenantSchemas.js";
import { getTenantParamsSchema } from "./tenantParams.js";

const router = Router();

router.use(authRequired);

router.get("/", validateQuery(listTenantsQuerySchema), tenantController.listTenants);
router.get("/:id", validateParams(getTenantParamsSchema), tenantController.getTenant);
router.post("/", requireSysadmin, validateBody(createTenantSchema), tenantController.createTenant);
router.put("/:id", validateParams(getTenantParamsSchema), validateBody(updateTenantSchema), tenantController.updateTenant);

export default router;