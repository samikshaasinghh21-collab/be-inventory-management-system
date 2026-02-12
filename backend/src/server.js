import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import { checkDbConnection, getPool, sql } from "./config/db.js";

dotenv.config();

const app = express();
const port = Number.parseInt(process.env.PORT ?? "3000", 10);

app.use(cors());
app.use(express.json());

const normalizeItem = (row = {}) => ({
  id: row.ItemId ?? row.id ?? null,
  name: row.Name ?? row.name ?? "",
  category: row.Category ?? row.category ?? "",
  hsn: row.HSN ?? row.hsn ?? "",
  stock: Number(row.Stock ?? row.stock ?? 0),
  price: Number(row.Price ?? row.price ?? 0),
  gst: row.GST ?? row.gst ?? "",
  description: row.Description ?? row.description ?? "",
});

const ensureItemsTable = async () => {
  const pool = await getPool();
  await pool.request().query(`
    IF OBJECT_ID('dbo.Items', 'U') IS NULL
    BEGIN
      CREATE TABLE dbo.Items (
        ItemId INT IDENTITY(1,1) PRIMARY KEY,
        Name NVARCHAR(255) NOT NULL,
        Category NVARCHAR(100) NULL,
        HSN NVARCHAR(50) NULL,
        Stock INT NOT NULL DEFAULT 0,
        Price DECIMAL(18, 2) NOT NULL DEFAULT 0,
        GST NVARCHAR(100) NULL,
        Description NVARCHAR(MAX) NULL,
        CreatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
        UpdatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
      )
    END
  `);
};

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

app.get("/api/items", async (_req, res) => {
  try {
    await ensureItemsTable();
    const pool = await getPool();
    const result = await pool.request().query(`
      SELECT
        ItemId,
        Name,
        Category,
        HSN,
        Stock,
        Price,
        GST,
        Description
      FROM dbo.Items
      ORDER BY ItemId DESC
    `);
    res.json((result.recordset ?? []).map(normalizeItem));
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: error?.message ?? "Failed to fetch items",
    });
  }
});

app.post("/api/items", async (req, res) => {
  try {
    await ensureItemsTable();

    const { name, category, hsn, stock, price, gst, description } = req.body ?? {};
    if (!String(name ?? "").trim()) {
      return res.status(400).json({
        ok: false,
        error: "Item name is required",
      });
    }

    const cleanStock = Number.parseInt(stock, 10);
    const cleanPrice = Number.parseFloat(price);
    const validStock = Number.isFinite(cleanStock) ? cleanStock : 0;
    const validPrice = Number.isFinite(cleanPrice) ? cleanPrice : 0;

    const pool = await getPool();
    const result = await pool
      .request()
      .input("Name", sql.NVarChar(255), String(name).trim())
      .input("Category", sql.NVarChar(100), String(category ?? "").trim())
      .input("HSN", sql.NVarChar(50), String(hsn ?? "").trim())
      .input("Stock", sql.Int, validStock)
      .input("Price", sql.Decimal(18, 2), validPrice)
      .input("GST", sql.NVarChar(100), String(gst ?? "").trim())
      .input("Description", sql.NVarChar(sql.MAX), String(description ?? "").trim())
      .query(`
        INSERT INTO dbo.Items (Name, Category, HSN, Stock, Price, GST, Description)
        OUTPUT INSERTED.*
        VALUES (@Name, @Category, @HSN, @Stock, @Price, @GST, @Description)
      `);

    return res.status(201).json({
      ok: true,
      item: normalizeItem(result.recordset?.[0] ?? {}),
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error?.message ?? "Failed to create item",
    });
  }
});

app.patch("/api/items/:id/quantity", async (req, res) => {
  try {
    await ensureItemsTable();

    const id = Number.parseInt(req.params.id, 10);
    const stock = Number.parseInt(req.body?.stock, 10);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ ok: false, error: "Invalid item id" });
    }
    if (!Number.isFinite(stock)) {
      return res.status(400).json({ ok: false, error: "Invalid stock value" });
    }

    const pool = await getPool();
    const result = await pool
      .request()
      .input("ItemId", sql.Int, id)
      .input("Stock", sql.Int, stock)
      .query(`
        UPDATE dbo.Items
        SET Stock = @Stock, UpdatedAt = SYSUTCDATETIME()
        OUTPUT INSERTED.*
        WHERE ItemId = @ItemId
      `);

    const updated = result.recordset?.[0];
    if (!updated) {
      return res.status(404).json({ ok: false, error: "Item not found" });
    }
    return res.json({ ok: true, item: normalizeItem(updated) });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error?.message ?? "Failed to update item quantity",
    });
  }
});

app.delete("/api/items/:id", async (req, res) => {
  try {
    await ensureItemsTable();

    const id = Number.parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ ok: false, error: "Invalid item id" });
    }

    const pool = await getPool();
    const result = await pool
      .request()
      .input("ItemId", sql.Int, id)
      .query(`
        DELETE FROM dbo.Items
        OUTPUT DELETED.ItemId
        WHERE ItemId = @ItemId
      `);

    if (!result.recordset?.length) {
      return res.status(404).json({ ok: false, error: "Item not found" });
    }
    return res.json({ ok: true });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error?.message ?? "Failed to delete item",
    });
  }
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

app.use((err, _req, res, _next) => {
  res.status(500).json({
    ok: false,
    error: err?.message ?? "Internal server error",
  });
});

app.listen(port, () => {
  console.log(`API server running on http://localhost:${port}`);
});
