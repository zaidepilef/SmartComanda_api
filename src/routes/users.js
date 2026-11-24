import { Router } from "express";
import * as userController from "../controllers/userController.js";
import authRequired from "../middleware/authRequired.js";
import requireSysadmin from "../middleware/requireSysadmin.js";
import requirePermission from "../middleware/requirePermission.js";
import { validateBody, validateQuery } from "../middleware/validation.js";
import {
  createUserSchema,
  listUsersQuerySchema,
  resetPasswordSchema,
  updateUserSchema,
} from "../validation/userSchemas.js";

const router = Router();

router.use(authRequired);

router.get("/", validateQuery(listUsersQuerySchema), userController.listUsers);
router.post("/", requirePermission("user.manage"), validateBody(createUserSchema), userController.createUser);
router.get("/:id", userController.getUser);
router.put("/:id", requirePermission("user.manage"), validateBody(updateUserSchema), userController.updateUser);
router.post("/:id/reset-password", requirePermission("user.manage"), validateBody(resetPasswordSchema), userController.resetUserPassword);
router.delete("/:id", requireSysadmin, userController.deleteUser);

export default router;
