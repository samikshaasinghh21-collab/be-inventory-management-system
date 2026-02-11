import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import { checkDbConnection, getPool } from "./config/db.js";

dotenv.config();

const app = express();
const port = Number.parseInt(process.env.PORT ?? "3000", 10);

app.use(cors());
app.use(express.json());

app.get("/api/health", async (_req, res) => {
  try {
    await checkDbConnection();
    res.status(200).json({
      ok: true,
      api: "up",
      db: "connected",
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      ok: false,
      api: "up",
      db: "disconnected",
      error: error?.message ?? "Unknown database error",
    });
  }
});

app.get("/api/db-test", async (_req, res) => {
  try {
    const pool = await getPool();
    const result = await pool.request().query("SELECT GETDATE() AS serverTime");
    res.json({
      ok: true,
      row: result.recordset?.[0] ?? null,
    });
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: error?.message ?? "Unknown database error",
    });
  }
});

app.use((err, _req, res, _next) => {
  res.status(500).json({
    ok: false,
    error: err?.message ?? "Internal server error",
  });
});

app.listen(port, () => {
  console.log(`API server running on http://localhost:${port}`);
});
