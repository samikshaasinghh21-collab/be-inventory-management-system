import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import { checkDbConnection, getPool, sql } from "./config/db.js";

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

app.get("/api/vendors", async (_req, res) => {
  try {
    const pool = await getPool();
    const result = await pool.request().query("SELECT * FROM Vendors");

    res.json(result.recordset);
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: error?.message ?? "Failed to fetch vendors",
    });
  }
});

app.post("/api/vendors", async (req, res) => {
  try {
    const { VendorName, Phone, Email, GSTNumber, Address } = req.body ?? {};

    const requiredFields = { VendorName, Phone, Email, GSTNumber, Address };
    const missingFields = Object.entries(requiredFields)
      .filter(([, value]) => !String(value ?? "").trim())
      .map(([field]) => field);

    if (missingFields.length > 0) {
      return res.status(400).json({
        ok: false,
        error: `Missing required fields: ${missingFields.join(", ")}`,
      });
    }

    const pool = await getPool();
    const result = await pool
      .request()
      .input("VendorName", sql.NVarChar(255), String(VendorName).trim())
      .input("Phone", sql.NVarChar(20), String(Phone).trim())
      .input("Email", sql.NVarChar(255), String(Email).trim())
      .input("GSTNumber", sql.NVarChar(30), String(GSTNumber).trim())
      .input("Address", sql.NVarChar(sql.MAX), String(Address).trim())
      .query(
        `INSERT INTO Vendors (VendorName, Phone, Email, GSTNumber, Address)
         OUTPUT INSERTED.*
         VALUES (@VendorName, @Phone, @Email, @GSTNumber, @Address)`
      );

    return res.status(201).json({
      ok: true,
      vendor: result.recordset?.[0] ?? null,
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error?.message ?? "Failed to create vendor",
    });
  }
});
