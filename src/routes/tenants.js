import { Router } from "express";
import * as tenantController from "../controllers/tenantController.js";
import authRequired from "../middleware/authRequired.js";
import requireSysadmin from "../middleware/requireSysadmin.js";
import { validateBody, validateQuery } from "../middleware/validation.js";
import {
  createTenantSchema,
  listTenantsQuerySchema,
  updateTenantSchema,
} from "../validation/tenantSchemas.js";

const router = Router();

router.use(authRequired);

router.get("/", validateQuery(listTenantsQuerySchema), tenantController.listTenants);
router.post("/", requireSysadmin, validateBody(createTenantSchema), tenantController.createTenant);
router.put("/:id", requireSysadmin, validateBody(updateTenantSchema), tenantController.updateTenant);

export default router;