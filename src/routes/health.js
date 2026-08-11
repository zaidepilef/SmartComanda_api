import { Router } from "express";
import { getMongoClient } from "../db/mongo.js";

const PING_TIMEOUT_MS = 2000;
const router = Router();

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