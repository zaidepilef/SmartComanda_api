import { Router } from "express";
import { getMongoClient } from "../db/mongo.js";

const PING_TIMEOUT_MS = 2000;
const router = Router();

/**
 * @swagger
 * /health:
 *   get:
 *     summary: Estado del servicio
 *     description: Verifica la conectividad con la base de datos MongoDB.
 *     tags: [Health]
 *     responses:
 *       200:
 *         description: Servicio operativo
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: ok
 *                 database:
 *                   type: string
 *                   example: connected
 *       503:
 *         description: Base de datos no disponible
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: degraded
 *                 database:
 *                   type: string
 *                   example: disconnected
 */
router.get("/", async (req, res) => {
  const client = getMongoClient();

  if (!client) {
    return res.status(503).json({
      status: "degraded",
      database: "disconnected",
    });
  }

  try {
    await client.db().command({ ping: 1 }, { timeoutMS: PING_TIMEOUT_MS });
    res.json({
      status: "ok",
      database: "connected",
    });
  } catch {
    res.status(503).json({
      status: "degraded",
      database: "disconnected",
    });
  }
});

export default router;