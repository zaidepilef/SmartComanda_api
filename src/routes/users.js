import { Router } from "express";
import * as userController from "../controllers/userController.js";
import authRequired from "../middleware/authRequired.js";
import { validateBody, validateQuery } from "../middleware/validation.js";
import {
  createUserSchema,
  listUsersQuerySchema,
  updateUserSchema,
} from "../validation/userSchemas.js";

const router = Router();

router.use(authRequired);

router.get("/", validateQuery(listUsersQuerySchema), userController.listUsers);
router.post("/", validateBody(createUserSchema), userController.createUser);
router.get("/:id", userController.getUser);
router.put("/:id", validateBody(updateUserSchema), userController.updateUser);
router.delete("/:id", userController.deleteUser);

export default router;
