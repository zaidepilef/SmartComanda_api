import { Router } from "express";
import * as authController from "../controllers/authController.js";
import authRequired from "../middleware/authRequired.js";
import { validateBody } from "../middleware/validation.js";
import { loginSchema } from "../validation/authSchemas.js";
import { createUserSchema } from "../validation/userSchemas.js";

const router = Router();

router.post("/login", validateBody(loginSchema), authController.login);
router.post("/register", validateBody(createUserSchema), authController.register);
router.get("/me", authRequired, authController.me);

export default router;