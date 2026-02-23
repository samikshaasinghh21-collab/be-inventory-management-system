import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";
import { checkDbConnection, getPool, sql } from "./config/db.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const loadEnv = (envPath) => {
  dotenv.config({ path: envPath });
};

// Prefer the backend/.env in this repo, but also allow the sibling backend/.env
// (C:\Users\adars\inventory-management-system\backend\.env) if that's what is edited.
loadEnv(path.resolve(__dirname, "../.env"));
loadEnv(path.resolve(__dirname, "../../../backend/.env"));

const app = express();
const port = Number.parseInt(process.env.PORT ?? "5000", 10);

app.use(cors());
app.use(express.json());

// Basic request logger to surface 2xx/4xx/5xx hits in the terminal
app.use((req, res, next) => {
  const start = Date.now();
  res.on("finish", () => {
    const duration = Date.now() - start;
    const status = res.statusCode;
    console.log(
      `[${new Date().toISOString()}] ${req.method} ${req.originalUrl} -> ${status} (${duration}ms)`
    );
  });
  next();
});

const getLanAddresses = () => {
  const interfaces = os.networkInterfaces();
  const addresses = [];

  Object.values(interfaces)
    .flat()
    .forEach((info) => {
      if (!info || info.family !== "IPv4" || info.internal) {
        return;
      }
      addresses.push(info.address);
    });

  return addresses;
};

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

const normalizeProject = (row = {}) => ({
  id: row.ProjectId ?? row.id ?? null,
  name: row.ProjectName ?? row.name ?? "",
  code: row.ProjectCode ?? row.code ?? "",
  client: row.Client ?? row.client ?? "",
  status: row.Status ?? row.status ?? "",
  startDate: row.StartDate ?? row.startDate ?? null,
  endDate: row.EndDate ?? row.endDate ?? null,
  notes: row.Notes ?? row.notes ?? "",
});

const normalizePurchaseOrder = (row = {}) => ({
  id: row.PurchaseOrderId ?? row.Id ?? row.id ?? null,
  projectId: row.ProjectId ?? row.projectId ?? null,
  vendorId: row.VendorId ?? row.vendorId ?? null,
  orderDate: row.OrderDate ?? row.orderDate ?? null,
  expectedDate:
    row.ExpectedDeliveryDate ??
    row.expectedDate ??
    row.ExpectedDate ??
    null,
  status: row.Status ?? row.status ?? "",
  notes: row.Notes ?? row.notes ?? "",
});

const normalizePoItem = (row = {}) => {
  const quantity = Number(row.Quantity ?? row.quantity ?? 0);
  const unitPrice = Number(
    row.UnitPrice ?? row.unitPrice ?? row.Rate ?? row.rate ?? 0
  );
  return {
    id: row.PurchaseOrderItemId ?? row.Id ?? row.id ?? null,
    purchaseOrderId: row.PurchaseOrderId ?? row.purchaseOrderId ?? null,
    itemId: row.ItemId ?? row.itemId ?? null,
    name: row.Name ?? row.name ?? "",
    description: row.Description ?? row.description ?? "",
    unit: row.Unit ?? row.unit ?? "PCS",
    quantity,
    unitPrice,
    totalPrice: quantity * unitPrice,
    notes: row.Notes ?? row.notes ?? "",
  };
};

const normalizeBoq = (row = {}) => ({
  id: row.BOQId ?? row.boqId ?? null,
  projectId: row.ProjectId ?? row.projectId ?? null,
  boqNumber: row.BOQNumber ?? row.boqNumber ?? "",
  version: String(row.Version ?? row.version ?? "1"),
  preparedBy: row.PreparedBy ?? row.preparedBy ?? "",
  status: row.Status ?? row.status ?? "",
  date: row.BOQDate ?? row.boqDate ?? row.Date ?? row.date ?? null,
  notes: row.Notes ?? row.notes ?? "",
  createdAt: row.CreatedAt ?? row.createdAt ?? null,
  updatedAt: row.UpdatedAt ?? row.updatedAt ?? null,
});

const normalizeBoqItem = (row = {}) => {
  const quantity = Number(row.Quantity ?? row.quantity ?? 0) || 0;
  const rate = Number(row.Rate ?? row.rate ?? 0) || 0;
  return {
    id: row.LineItemId ?? row.lineItemId ?? null,
    boqId: row.BOQId ?? row.boqId ?? null,
    name: row.ItemName ?? row.name ?? "",
    description: row.Description ?? row.description ?? "",
    unit: row.Unit ?? row.unit ?? "",
    quantity,
    rate,
    notes: row.Notes ?? row.notes ?? "",
    amount: quantity * rate,
  };
};

const normalizeOptionalString = (value) => {
  if (value === undefined) {
    return undefined;
  }
  const trimmed = String(value ?? "").trim();
  return trimmed.length ? trimmed : null;
};

const toNullableInt = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : null;
};

const parseDateInput = (value) => {
  if (value === undefined) {
    return undefined;
  }
  if (value === null) {
    return null;
  }
  const trimmed = String(value).trim();
  if (!trimmed) {
    return null;
  }
  const date = new Date(trimmed);
  return Number.isNaN(date.getTime()) ? NaN : date;
};

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

const ensureVendorsTable = async () => {
  const pool = await getPool();
  await pool.request().query(`
    IF OBJECT_ID('dbo.Vendors', 'U') IS NULL
    BEGIN
      CREATE TABLE dbo.Vendors (
        VendorId INT IDENTITY(1,1) PRIMARY KEY,
        VendorName NVARCHAR(255) NOT NULL,
        Phone NVARCHAR(20) NOT NULL,
        Email NVARCHAR(255) NULL,
        GSTNumber NVARCHAR(30) NULL,
        Address NVARCHAR(MAX) NULL,
        CreatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
        UpdatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
      )
    END
  `);
};

const ensureProjectsTable = async () => {
  const pool = await getPool();
  await pool.request().query(`
    IF OBJECT_ID('dbo.Projects', 'U') IS NULL
    BEGIN
      CREATE TABLE dbo.Projects (
        ProjectId INT IDENTITY(1,1) PRIMARY KEY,
        ProjectName NVARCHAR(255) NOT NULL,
        ProjectCode NVARCHAR(100) NULL,
        Client NVARCHAR(255) NULL,
        Status NVARCHAR(50) NULL,
        StartDate DATE NULL,
        EndDate DATE NULL,
        Notes NVARCHAR(MAX) NULL,
        CreatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
        UpdatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
      )
    END
  `);
};

const ensurePurchaseTables = async () => {
  const pool = await getPool();
  await pool.request().query(`
    IF OBJECT_ID('dbo.PurchaseOrders', 'U') IS NULL
    BEGIN
      CREATE TABLE dbo.PurchaseOrders (
        Id INT IDENTITY(1,1) PRIMARY KEY,
        PONumber NVARCHAR(100) NULL,
        ProjectId INT NULL,
        VendorId INT NULL,
        LocationId INT NULL,
        Status NVARCHAR(50) NULL,
        OrderDate DATE NULL,
        ExpectedDate DATE NULL,
        ExpectedDeliveryDate DATE NULL,
        Notes NVARCHAR(255) NULL,
        Total DECIMAL(10,2) NULL
      )
    END
  `);

  await pool.request().query(`
    IF COL_LENGTH('dbo.PurchaseOrders', 'ExpectedDeliveryDate') IS NULL
    BEGIN
      ALTER TABLE dbo.PurchaseOrders ADD ExpectedDeliveryDate DATE NULL;
    END;
  `);

  await pool.request().query(`
    IF OBJECT_ID('dbo.PurchaseOrderItems', 'U') IS NULL
    BEGIN
      CREATE TABLE dbo.PurchaseOrderItems (
        Id INT IDENTITY(1,1) PRIMARY KEY,
        PurchaseOrderId INT NOT NULL,
        ItemId INT NULL,
        Name NVARCHAR(255) NOT NULL DEFAULT '',
        Description NVARCHAR(MAX) NULL,
        Unit NVARCHAR(30) NULL,
        Quantity INT NOT NULL DEFAULT 0,
        Rate DECIMAL(10, 2) NOT NULL DEFAULT 0,
        Notes NVARCHAR(MAX) NULL,
        CONSTRAINT FK_PurchaseOrderItems_Order FOREIGN KEY (PurchaseOrderId)
          REFERENCES dbo.PurchaseOrders(Id) ON DELETE CASCADE
      )
    END
  `);

  await pool.request().query(`
    IF COL_LENGTH('dbo.PurchaseOrderItems', 'Rate') IS NULL
    BEGIN
      ALTER TABLE dbo.PurchaseOrderItems ADD Rate DECIMAL(10,2) NOT NULL CONSTRAINT DF_POItems_Rate DEFAULT 0;
    END;
  `);
};

const ensureBoqTables = async () => {
  const pool = await getPool();
  await pool.request().query(`
    IF OBJECT_ID('dbo.BOQProjects', 'U') IS NULL
    BEGIN
      CREATE TABLE dbo.BOQProjects (
        BOQId INT IDENTITY(1,1) PRIMARY KEY,
        ProjectId INT NOT NULL,
        BOQNumber NVARCHAR(50) NOT NULL,
        Version INT NOT NULL DEFAULT 1,
        PreparedBy NVARCHAR(100) NULL,
        Status NVARCHAR(50) NULL,
        BOQDate DATE NULL,
        Notes NVARCHAR(MAX) NULL,
        CreatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
        UpdatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
      )
    END
  `);

  await pool.request().query(`
    IF COL_LENGTH('dbo.BOQProjects', 'BOQDate') IS NULL
    BEGIN
      ALTER TABLE dbo.BOQProjects ADD BOQDate DATE NULL;
    END;
    IF COL_LENGTH('dbo.BOQProjects', 'CreatedAt') IS NULL
    BEGIN
      ALTER TABLE dbo.BOQProjects ADD CreatedAt DATETIME2 NOT NULL
        CONSTRAINT DF_BOQProjects_CreatedAt DEFAULT SYSUTCDATETIME();
    END;
    IF COL_LENGTH('dbo.BOQProjects', 'UpdatedAt') IS NULL
    BEGIN
      ALTER TABLE dbo.BOQProjects ADD UpdatedAt DATETIME2 NOT NULL
        CONSTRAINT DF_BOQProjects_UpdatedAt DEFAULT SYSUTCDATETIME();
    END;
  `);

  await pool.request().query(`
    IF OBJECT_ID('dbo.BOQLineItems', 'U') IS NULL
    BEGIN
      CREATE TABLE dbo.BOQLineItems (
        LineItemId INT IDENTITY(1,1) PRIMARY KEY,
        BOQId INT NOT NULL,
        ItemName NVARCHAR(200) NOT NULL,
        Description NVARCHAR(MAX) NULL,
        Unit NVARCHAR(50) NULL,
        Quantity DECIMAL(18, 2) NOT NULL DEFAULT 0,
        Rate DECIMAL(18, 2) NOT NULL DEFAULT 0,
        Notes NVARCHAR(MAX) NULL,
        CONSTRAINT FK_BOQLineItems_BOQ FOREIGN KEY (BOQId)
          REFERENCES dbo.BOQProjects(BOQId) ON DELETE CASCADE
      )
    END
  `);

  await pool.request().query(`
    IF COL_LENGTH('dbo.BOQLineItems', 'Notes') IS NULL
    BEGIN
      ALTER TABLE dbo.BOQLineItems ADD Notes NVARCHAR(MAX) NULL;
    END;
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
    await ensureVendorsTable();
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
    await ensureVendorsTable();
    const {
      name,
      phone,
      email,
      gstNumber,
      address,
      VendorName,
      Phone,
      Email,
      GSTNumber,
      Address,
    } = req.body ?? {};

    const nextName = String(name ?? VendorName ?? "").trim();
    const nextPhone = String(phone ?? Phone ?? "").trim();
    const nextEmail = String(email ?? Email ?? "").trim();
    const nextGstNumber = String(gstNumber ?? GSTNumber ?? "").trim();
    const nextAddress = String(address ?? Address ?? "").trim();

    const missingFields = [];
    if (!nextName) {
      missingFields.push("VendorName");
    }
    if (!nextPhone) {
      missingFields.push("Phone");
    }

    if (missingFields.length > 0) {
      const message = `Missing required fields: ${missingFields.join(", ")}`;
      return res.status(400).json({
        ok: false,
        error: message,
        message,
      });
    }

    const pool = await getPool();
    const result = await pool
      .request()
      .input("VendorName", sql.NVarChar(255), nextName)
      .input("Phone", sql.NVarChar(20), nextPhone)
      .input("Email", sql.NVarChar(255), nextEmail)
      .input("GSTNumber", sql.NVarChar(30), nextGstNumber)
      .input("Address", sql.NVarChar(sql.MAX), nextAddress)
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

app.put("/api/vendors/:id", async (req, res) => {
  try {
    await ensureVendorsTable();
    const id = Number.parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) {
      return res.status(400).json({
        ok: false,
        error: "Invalid vendor id",
        message: "Invalid vendor id",
      });
    }

    const {
      name,
      phone,
      email,
      gstNumber,
      address,
      VendorName,
      Phone,
      Email,
      GSTNumber,
      Address,
    } = req.body ?? {};

    const nextName = String(name ?? VendorName ?? "").trim();
    const nextPhone = String(phone ?? Phone ?? "").trim();
    const nextEmail = String(email ?? Email ?? "").trim();
    const nextGstNumber = String(gstNumber ?? GSTNumber ?? "").trim();
    const nextAddress = String(address ?? Address ?? "").trim();

    const missingFields = [];
    if (!nextName) {
      missingFields.push("VendorName");
    }
    if (!nextPhone) {
      missingFields.push("Phone");
    }

    if (missingFields.length > 0) {
      const message = `Missing required fields: ${missingFields.join(", ")}`;
      return res.status(400).json({
        ok: false,
        error: message,
        message,
      });
    }

    const pool = await getPool();
    const result = await pool
      .request()
      .input("VendorId", sql.Int, id)
      .input("VendorName", sql.NVarChar(255), nextName)
      .input("Phone", sql.NVarChar(20), nextPhone)
      .input("Email", sql.NVarChar(255), nextEmail)
      .input("GSTNumber", sql.NVarChar(30), nextGstNumber)
      .input("Address", sql.NVarChar(sql.MAX), nextAddress)
      .query(`
        UPDATE Vendors
        SET VendorName = @VendorName,
            Phone = @Phone,
            Email = @Email,
            GSTNumber = @GSTNumber,
            Address = @Address
        OUTPUT INSERTED.*
        WHERE VendorId = @VendorId
      `);

    const updated = result.recordset?.[0];
    if (!updated) {
      return res.status(404).json({
        ok: false,
        error: "Vendor not found",
        message: "Vendor not found",
      });
    }

    return res.json({
      ok: true,
      vendor: updated,
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error?.message ?? "Failed to update vendor",
      message: error?.message ?? "Failed to update vendor",
    });
  }
});

app.delete("/api/vendors/:id", async (req, res) => {
  try {
    await ensureVendorsTable();
    const id = Number.parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) {
      return res.status(400).json({
        ok: false,
        error: "Invalid vendor id",
        message: "Invalid vendor id",
      });
    }

    const pool = await getPool();
    const result = await pool
      .request()
      .input("VendorId", sql.Int, id)
      .query(`
        DELETE FROM Vendors
        OUTPUT DELETED.VendorId
        WHERE VendorId = @VendorId
      `);

    if (!result.recordset?.length) {
      return res.status(404).json({
        ok: false,
        error: "Vendor not found",
        message: "Vendor not found",
      });
    }

    return res.json({ ok: true });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error?.message ?? "Failed to delete vendor",
      message: error?.message ?? "Failed to delete vendor",
    });
  }
});

app.get("/api/projects", async (_req, res) => {
  try {
    await ensureProjectsTable();
    const pool = await getPool();
    const result = await pool.request().query(`
      SELECT
        ProjectId,
        ProjectName,
        ProjectCode,
        Client,
        Status,
        StartDate,
        EndDate,
        Notes
      FROM dbo.Projects
      ORDER BY ProjectId DESC
    `);
    res.json((result.recordset ?? []).map(normalizeProject));
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: error?.message ?? "Failed to fetch projects",
    });
  }
});

app.get("/api/projects/:id", async (req, res) => {
  try {
    await ensureProjectsTable();
    const id = Number.parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ ok: false, error: "Invalid project id" });
    }

    const pool = await getPool();
    const result = await pool
      .request()
      .input("ProjectId", sql.Int, id)
      .query(`
        SELECT
          ProjectId,
          ProjectName,
          ProjectCode,
          Client,
          Status,
          StartDate,
          EndDate,
          Notes
        FROM dbo.Projects
        WHERE ProjectId = @ProjectId
      `);

    const project = result.recordset?.[0];
    if (!project) {
      return res.status(404).json({ ok: false, error: "Project not found" });
    }

    return res.json({ ok: true, project: normalizeProject(project) });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error?.message ?? "Failed to fetch project",
    });
  }
});

app.post("/api/projects", async (req, res) => {
  try {
    await ensureProjectsTable();
    const {
      name,
      code,
      client,
      status,
      startDate,
      endDate,
      notes,
      ProjectName,
      ProjectCode,
      Client,
      Status,
      StartDate,
      EndDate,
      Notes,
    } = req.body ?? {};

    const nextName = normalizeOptionalString(name ?? ProjectName);
    if (!nextName) {
      return res.status(400).json({ ok: false, error: "Project name is required" });
    }

    const nextCode = normalizeOptionalString(code ?? ProjectCode);
    const nextClient = normalizeOptionalString(client ?? Client);
    const nextStatus = normalizeOptionalString(status ?? Status);
    const nextNotes = normalizeOptionalString(notes ?? Notes);

    const parsedStartDate = parseDateInput(startDate ?? StartDate);
    if (Number.isNaN(parsedStartDate)) {
      return res.status(400).json({ ok: false, error: "Invalid start date" });
    }
    const parsedEndDate = parseDateInput(endDate ?? EndDate);
    if (Number.isNaN(parsedEndDate)) {
      return res.status(400).json({ ok: false, error: "Invalid end date" });
    }

    const pool = await getPool();
    const result = await pool
      .request()
      .input("ProjectName", sql.NVarChar(255), nextName)
      .input("ProjectCode", sql.NVarChar(100), nextCode)
      .input("Client", sql.NVarChar(255), nextClient)
      .input("Status", sql.NVarChar(50), nextStatus)
      .input("StartDate", sql.Date, parsedStartDate)
      .input("EndDate", sql.Date, parsedEndDate)
      .input("Notes", sql.NVarChar(sql.MAX), nextNotes)
      .query(`
        INSERT INTO dbo.Projects (ProjectName, ProjectCode, Client, Status, StartDate, EndDate, Notes)
        OUTPUT INSERTED.*
        VALUES (@ProjectName, @ProjectCode, @Client, @Status, @StartDate, @EndDate, @Notes)
      `);

    return res.status(201).json({
      ok: true,
      project: normalizeProject(result.recordset?.[0] ?? {}),
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error?.message ?? "Failed to create project",
    });
  }
});

app.put("/api/projects/:id", async (req, res) => {
  try {
    await ensureProjectsTable();
    const id = Number.parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ ok: false, error: "Invalid project id" });
    }

    const {
      name,
      code,
      client,
      status,
      startDate,
      endDate,
      notes,
      ProjectName,
      ProjectCode,
      Client,
      Status,
      StartDate,
      EndDate,
      Notes,
    } = req.body ?? {};

    const hasName = name !== undefined || ProjectName !== undefined;
    const hasCode = code !== undefined || ProjectCode !== undefined;
    const hasClient = client !== undefined || Client !== undefined;
    const hasStatus = status !== undefined || Status !== undefined;
    const hasStartDate = startDate !== undefined || StartDate !== undefined;
    const hasEndDate = endDate !== undefined || EndDate !== undefined;
    const hasNotes = notes !== undefined || Notes !== undefined;

    const nextName = hasName ? normalizeOptionalString(name ?? ProjectName) : undefined;
    if (hasName && !nextName) {
      return res.status(400).json({ ok: false, error: "Project name is required" });
    }

    const nextCode = hasCode ? normalizeOptionalString(code ?? ProjectCode) : undefined;
    const nextClient = hasClient ? normalizeOptionalString(client ?? Client) : undefined;
    const nextStatus = hasStatus ? normalizeOptionalString(status ?? Status) : undefined;
    const nextNotes = hasNotes ? normalizeOptionalString(notes ?? Notes) : undefined;

    const parsedStartDate = hasStartDate
      ? parseDateInput(startDate ?? StartDate)
      : undefined;
    if (hasStartDate && Number.isNaN(parsedStartDate)) {
      return res.status(400).json({ ok: false, error: "Invalid start date" });
    }

    const parsedEndDate = hasEndDate ? parseDateInput(endDate ?? EndDate) : undefined;
    if (hasEndDate && Number.isNaN(parsedEndDate)) {
      return res.status(400).json({ ok: false, error: "Invalid end date" });
    }

    const pool = await getPool();
    const existingResult = await pool
      .request()
      .input("ProjectId", sql.Int, id)
      .query(`
        SELECT
          ProjectId,
          ProjectName,
          ProjectCode,
          Client,
          Status,
          StartDate,
          EndDate,
          Notes
        FROM dbo.Projects
        WHERE ProjectId = @ProjectId
      `);

    const existing = existingResult.recordset?.[0];
    if (!existing) {
      return res.status(404).json({ ok: false, error: "Project not found" });
    }

    const finalName = nextName ?? existing.ProjectName;
    const finalCode = hasCode ? nextCode : existing.ProjectCode;
    const finalClient = hasClient ? nextClient : existing.Client;
    const finalStatus = hasStatus ? nextStatus : existing.Status;
    const finalStartDate = hasStartDate ? parsedStartDate : existing.StartDate;
    const finalEndDate = hasEndDate ? parsedEndDate : existing.EndDate;
    const finalNotes = hasNotes ? nextNotes : existing.Notes;

    const result = await pool
      .request()
      .input("ProjectId", sql.Int, id)
      .input("ProjectName", sql.NVarChar(255), finalName)
      .input("ProjectCode", sql.NVarChar(100), finalCode)
      .input("Client", sql.NVarChar(255), finalClient)
      .input("Status", sql.NVarChar(50), finalStatus)
      .input("StartDate", sql.Date, finalStartDate)
      .input("EndDate", sql.Date, finalEndDate)
      .input("Notes", sql.NVarChar(sql.MAX), finalNotes)
      .query(`
        UPDATE dbo.Projects
        SET ProjectName = @ProjectName,
            ProjectCode = @ProjectCode,
            Client = @Client,
            Status = @Status,
            StartDate = @StartDate,
            EndDate = @EndDate,
            Notes = @Notes,
            UpdatedAt = SYSUTCDATETIME()
        OUTPUT INSERTED.*
        WHERE ProjectId = @ProjectId
      `);

    return res.json({
      ok: true,
      project: normalizeProject(result.recordset?.[0] ?? {}),
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error?.message ?? "Failed to update project",
    });
  }
});

app.delete("/api/projects/:id", async (req, res) => {
  try {
    await ensureProjectsTable();
    const id = Number.parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ ok: false, error: "Invalid project id" });
    }

    const pool = await getPool();
    const result = await pool
      .request()
      .input("ProjectId", sql.Int, id)
      .query(`
        DELETE FROM dbo.Projects
        OUTPUT DELETED.ProjectId
        WHERE ProjectId = @ProjectId
      `);

    if (!result.recordset?.length) {
      return res.status(404).json({ ok: false, error: "Project not found" });
    }

    return res.json({ ok: true });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error?.message ?? "Failed to delete project",
    });
  }
});

app.get("/api/purchase-orders", async (_req, res) => {
  try {
    await ensurePurchaseTables();
    const pool = await getPool();
    const ordersResult = await pool.request().query(`
      SELECT * FROM PurchaseOrders ORDER BY Id DESC
    `);
    const itemsResult = await pool.request().query(`
      SELECT * FROM PurchaseOrderItems
    `);
    const itemsByOrder = itemsResult.recordset.reduce((acc, row) => {
      const key = row.PurchaseOrderId;
      if (!acc[key]) acc[key] = [];
      acc[key].push(normalizePoItem(row));
      return acc;
    }, {});
    const data = (ordersResult.recordset ?? []).map((row) => ({
      ...normalizePurchaseOrder(row),
      items: itemsByOrder[row.Id] ?? [],
      total: (itemsByOrder[row.Id] ?? []).reduce(
        (sum, item) => sum + Number(item.totalPrice || 0),
        0
      ),
    }));
    return res.json({ ok: true, purchaseOrders: data });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error?.message ?? "Failed to fetch purchase orders",
    });
  }
});

app.get("/api/purchase-orders/:id", async (req, res) => {
  try {
    await ensurePurchaseTables();
    const id = Number.parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ ok: false, error: "Invalid purchase order id" });
    }

    const pool = await getPool();
    const orderResult = await pool
      .request()
      .input("Id", sql.Int, id)
      .query(`
        SELECT * FROM PurchaseOrders WHERE Id = @Id
      `);

    const orderRow = orderResult.recordset?.[0];
    if (!orderRow) {
      return res.status(404).json({ ok: false, error: "Purchase order not found" });
    }

    const itemsResult = await pool
      .request()
      .input("PurchaseOrderId", sql.Int, id)
      .query(`
        SELECT * FROM PurchaseOrderItems WHERE PurchaseOrderId = @PurchaseOrderId
      `);

    const items = (itemsResult.recordset ?? []).map(normalizePoItem);
    const total = items.reduce((sum, item) => sum + Number(item.totalPrice || 0), 0);

    return res.json({
      ok: true,
      purchaseOrder: {
        ...normalizePurchaseOrder(orderRow),
        items,
        total,
      },
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error?.message ?? "Failed to fetch purchase order",
    });
  }
});

app.post("/api/purchase-orders", async (req, res) => {
  const {
    projectId = null,
    vendorId = null,
    status = "Draft",
    orderDate = null,
    expectedDate = null,
    expectedDeliveryDate = null,
    notes = null,
    items = [],
    poNumber = null,
    locationId = null,
  } = req.body ?? {};

  const safeItems = Array.isArray(items) ? items : [];
  const hasValidItem = safeItems.some(
    (item) => Number(item.quantity ?? item.qty ?? 0) > 0
  );
  if (!hasValidItem) {
    return res.status(400).json({ ok: false, error: "At least one line item is required" });
  }

  try {
    await ensurePurchaseTables();
    const pool = await getPool();
    const tx = pool.transaction();
    await tx.begin();

    const poNumValue = String(poNumber || `PO-${Date.now()}`).trim();

    const insertOrder = new sql.Request(tx);
    insertOrder.input("PONumber", sql.NVarChar(100), poNumValue || null);
    insertOrder.input("ProjectId", sql.Int, projectId ?? null);
    insertOrder.input("VendorId", sql.Int, vendorId ?? null);
    insertOrder.input("LocationId", sql.Int, locationId ?? null);
    insertOrder.input("Status", sql.NVarChar(50), status || "Draft");
    insertOrder.input(
      "OrderDate",
      sql.Date,
      parseDateInput(orderDate) || null
    );
    insertOrder.input(
      "ExpectedDeliveryDate",
      sql.Date,
      parseDateInput(expectedDeliveryDate ?? expectedDate) || null
    );
    insertOrder.input("Notes", sql.NVarChar(255), notes || null);

    const orderResult = await insertOrder.query(`
      INSERT INTO PurchaseOrders
        (PONumber, ProjectId, VendorId, LocationId, Status, OrderDate, ExpectedDate, ExpectedDeliveryDate, Notes, Total)
      OUTPUT INSERTED.*
      VALUES (@PONumber, @ProjectId, @VendorId, @LocationId, @Status, @OrderDate, @ExpectedDeliveryDate, @ExpectedDeliveryDate, @Notes, 0)
    `);

    const orderRow = orderResult.recordset?.[0];
    const orderId = orderRow?.Id;

    let total = 0;
    for (const item of safeItems) {
      const qty = Number(item.quantity ?? item.qty ?? 0) || 0;
      const unitPrice = Number(item.unitPrice ?? item.rate ?? item.UnitPrice ?? 0) || 0;
      total += qty * unitPrice;
      const r = new sql.Request(tx);
      r.input("PurchaseOrderId", sql.Int, orderId);
      r.input("Name", sql.NVarChar(255), item.name ?? "");
      r.input("Description", sql.NVarChar(sql.MAX), item.description ?? null);
      r.input("Unit", sql.NVarChar(30), item.unit ?? "PCS");
      r.input("Quantity", sql.Int, qty);
      r.input("Rate", sql.Decimal(10, 2), unitPrice);
      r.input("Notes", sql.NVarChar(sql.MAX), item.notes ?? null);
      await r.query(`
        INSERT INTO PurchaseOrderItems
          (PurchaseOrderId, Name, Description, Unit, Quantity, Rate, Notes)
        VALUES
          (@PurchaseOrderId, @Name, @Description, @Unit, @Quantity, @Rate, @Notes)
      `);
    }

    const totalReq = new sql.Request(tx);
    totalReq.input("Id", sql.Int, orderId);
    totalReq.input("Total", sql.Decimal(10, 2), total);
    await totalReq.query(`
      UPDATE PurchaseOrders SET Total = @Total WHERE Id = @Id
    `);

    await tx.commit();

    const itemsResult = await pool
      .request()
      .input("PurchaseOrderId", sql.Int, orderId)
      .query(`
        SELECT * FROM PurchaseOrderItems WHERE PurchaseOrderId = @PurchaseOrderId
      `);

    return res.status(201).json({
      ok: true,
      purchaseOrder: {
        ...normalizePurchaseOrder(orderRow),
        total,
        items: (itemsResult.recordset ?? []).map(normalizePoItem),
      },
    });
  } catch (error) {
    try {
      // rollback if the transaction object exists
      if (error?.transaction?.state === "begun") {
        await error.transaction.rollback();
      }
    } catch {
      // ignore
    }
    return res.status(500).json({
      ok: false,
      error: error?.message ?? "Failed to create purchase order",
    });
  }
});

app.put("/api/purchase-orders/:id", async (req, res) => {
  const id = Number.parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) {
    return res.status(400).json({ ok: false, error: "Invalid purchase order id" });
  }

  const {
    projectId = null,
    vendorId = null,
    status = "Draft",
    orderDate = null,
    expectedDate = null,
    expectedDeliveryDate = null,
    notes = null,
    items = [],
  } = req.body ?? {};

  const safeItems = Array.isArray(items) ? items : [];
  const hasValidItem = safeItems.some(
    (item) => Number(item.quantity ?? item.qty ?? 0) > 0
  );
  if (!hasValidItem) {
    return res.status(400).json({ ok: false, error: "At least one line item is required" });
  }

  try {
    await ensurePurchaseTables();
    const pool = await getPool();
    const tx = pool.transaction();
    await tx.begin();

    const updateOrder = new sql.Request(tx);
    updateOrder.input("Id", sql.Int, id);
    updateOrder.input("ProjectId", sql.Int, projectId ?? null);
    updateOrder.input("VendorId", sql.Int, vendorId ?? null);
    updateOrder.input("Status", sql.NVarChar(50), status || "Draft");
    updateOrder.input(
      "OrderDate",
      sql.Date,
      parseDateInput(orderDate) || null
    );
    updateOrder.input(
      "ExpectedDeliveryDate",
      sql.Date,
      parseDateInput(expectedDeliveryDate ?? expectedDate) || null
    );
    updateOrder.input("Notes", sql.NVarChar(255), notes || null);

    const orderResult = await updateOrder.query(`
      UPDATE PurchaseOrders
      SET ProjectId = @ProjectId,
          VendorId = @VendorId,
          Status = @Status,
          OrderDate = @OrderDate,
          ExpectedDeliveryDate = @ExpectedDeliveryDate,
          Notes = @Notes
      OUTPUT INSERTED.*
      WHERE Id = @Id
    `);

    const orderRow = orderResult.recordset?.[0];
    if (!orderRow) {
      await tx.rollback();
      return res.status(404).json({ ok: false, error: "Purchase order not found" });
    }

    const deleteItems = new sql.Request(tx);
    deleteItems.input("PurchaseOrderId", sql.Int, id);
    await deleteItems.query(`
      DELETE FROM PurchaseOrderItems WHERE PurchaseOrderId = @PurchaseOrderId
    `);

    let total = 0;
    for (const item of safeItems) {
      const qty = Number(item.quantity ?? item.qty ?? 0) || 0;
      const unitPrice = Number(item.unitPrice ?? item.rate ?? item.UnitPrice ?? 0) || 0;
      total += qty * unitPrice;
      const r = new sql.Request(tx);
      r.input("PurchaseOrderId", sql.Int, id);
      r.input("Name", sql.NVarChar(255), item.name ?? "");
      r.input("Description", sql.NVarChar(sql.MAX), item.description ?? null);
      r.input("Unit", sql.NVarChar(30), item.unit ?? "PCS");
      r.input("Quantity", sql.Int, qty);
      r.input("Rate", sql.Decimal(10, 2), unitPrice);
      r.input("Notes", sql.NVarChar(sql.MAX), item.notes ?? null);
      await r.query(`
        INSERT INTO PurchaseOrderItems
          (PurchaseOrderId, Name, Description, Unit, Quantity, Rate, Notes)
        VALUES
          (@PurchaseOrderId, @Name, @Description, @Unit, @Quantity, @Rate, @Notes)
      `);
    }

    const totalReq = new sql.Request(tx);
    totalReq.input("Id", sql.Int, id);
    totalReq.input("Total", sql.Decimal(10, 2), total);
    await totalReq.query(`
      UPDATE PurchaseOrders SET Total = @Total WHERE Id = @Id
    `);

    await tx.commit();

    const itemsResult = await pool
      .request()
      .input("PurchaseOrderId", sql.Int, id)
      .query(`
        SELECT * FROM PurchaseOrderItems WHERE PurchaseOrderId = @PurchaseOrderId
      `);

    return res.json({
      ok: true,
      purchaseOrder: {
        ...normalizePurchaseOrder(orderRow),
        total,
        items: (itemsResult.recordset ?? []).map(normalizePoItem),
      },
    });
  } catch (error) {
    try {
      if (error?.transaction?.state === "begun") {
        await error.transaction.rollback();
      }
    } catch {
      // ignore
    }
    return res.status(500).json({
      ok: false,
      error: error?.message ?? "Failed to update purchase order",
    });
  }
});

app.delete("/api/purchase-orders/:id", async (req, res) => {
  const id = Number.parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) {
    return res.status(400).json({ ok: false, error: "Invalid purchase order id" });
  }

  try {
    await ensurePurchaseTables();
    const pool = await getPool();
    const tx = pool.transaction();
    await tx.begin();

    const deleteItems = new sql.Request(tx);
    deleteItems.input("PurchaseOrderId", sql.Int, id);
    await deleteItems.query(`
      DELETE FROM PurchaseOrderItems WHERE PurchaseOrderId = @PurchaseOrderId
    `);

    const deleteOrder = new sql.Request(tx);
    deleteOrder.input("Id", sql.Int, id);
    const result = await deleteOrder.query(`
      DELETE FROM PurchaseOrders WHERE Id = @Id
    `);

    await tx.commit();

    if (result.rowsAffected?.[0] === 0) {
      return res.status(404).json({ ok: false, error: "Purchase order not found" });
    }

    return res.json({ ok: true });
  } catch (error) {
    try {
      if (error?.transaction?.state === "begun") {
        await error.transaction.rollback();
      }
    } catch {
      // ignore
    }
    return res.status(500).json({
      ok: false,
      error: error?.message ?? "Failed to delete purchase order",
    });
  }
});

app.get("/api/boqs", async (_req, res) => {
  try {
    await ensureBoqTables();
    const pool = await getPool();
    const boqsResult = await pool.request().query(`
      SELECT * FROM dbo.BOQProjects ORDER BY BOQId DESC
    `);
    const itemsResult = await pool.request().query(`
      SELECT * FROM dbo.BOQLineItems
    `);
    const itemsByBoq = itemsResult.recordset.reduce((acc, row) => {
      const key = row.BOQId;
      if (!acc[key]) acc[key] = [];
      acc[key].push(normalizeBoqItem(row));
      return acc;
    }, {});

    const data = (boqsResult.recordset ?? []).map((row) => {
      const items = itemsByBoq[row.BOQId] ?? [];
      const total = items.reduce((sum, item) => sum + Number(item.amount || 0), 0);
      return { ...normalizeBoq(row), items, total };
    });

    return res.json({ ok: true, boqs: data });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error?.message ?? "Failed to fetch BOQs",
    });
  }
});

app.get("/api/boqs/:id", async (req, res) => {
  try {
    await ensureBoqTables();
    const id = Number.parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ ok: false, error: "Invalid BOQ id" });
    }

    const pool = await getPool();
    const boqResult = await pool
      .request()
      .input("BOQId", sql.Int, id)
      .query(`SELECT * FROM dbo.BOQProjects WHERE BOQId = @BOQId`);

    const boqRow = boqResult.recordset?.[0];
    if (!boqRow) {
      return res.status(404).json({ ok: false, error: "BOQ not found" });
    }

    const itemsResult = await pool
      .request()
      .input("BOQId", sql.Int, id)
      .query(`SELECT * FROM dbo.BOQLineItems WHERE BOQId = @BOQId`);

    const items = (itemsResult.recordset ?? []).map(normalizeBoqItem);
    const total = items.reduce((sum, item) => sum + Number(item.amount || 0), 0);

    return res.json({
      ok: true,
      boq: { ...normalizeBoq(boqRow), items, total },
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error?.message ?? "Failed to fetch BOQ",
    });
  }
});

app.post("/api/boqs", async (req, res) => {
  const {
    projectId,
    boqNumber,
    version = "1",
    preparedBy = null,
    status = "Draft",
    date = null,
    notes = null,
    items = [],
  } = req.body ?? {};

  const safeItems = Array.isArray(items) ? items : [];
  const hasValidItem = safeItems.some((item) => Number(item.quantity ?? 0) > 0);
  if (!projectId) {
    return res.status(400).json({ ok: false, error: "Project is required" });
  }
  if (!String(boqNumber ?? "").trim()) {
    return res.status(400).json({ ok: false, error: "BOQ number is required" });
  }
  if (!hasValidItem) {
    return res.status(400).json({ ok: false, error: "At least one line item is required" });
  }

  try {
    await ensureBoqTables();
    const pool = await getPool();
    const tx = pool.transaction();
    await tx.begin();

    const insertBoq = new sql.Request(tx);
    insertBoq.input("ProjectId", sql.Int, Number(projectId));
    insertBoq.input("BOQNumber", sql.NVarChar(50), String(boqNumber).trim());
    insertBoq.input("Version", sql.Int, Number.parseInt(version, 10) || 1);
    insertBoq.input("PreparedBy", sql.NVarChar(100), preparedBy || null);
    insertBoq.input("Status", sql.NVarChar(50), status || "Draft");
    insertBoq.input("BOQDate", sql.Date, parseDateInput(date) || null);
    insertBoq.input("Notes", sql.NVarChar(sql.MAX), notes || null);

    const boqResult = await insertBoq.query(`
      INSERT INTO dbo.BOQProjects
        (ProjectId, BOQNumber, Version, PreparedBy, Status, BOQDate, Notes)
      OUTPUT INSERTED.*
      VALUES (@ProjectId, @BOQNumber, @Version, @PreparedBy, @Status, @BOQDate, @Notes)
    `);

    const boqRow = boqResult.recordset?.[0];
    const boqId = boqRow?.BOQId;

    let total = 0;
    for (const item of safeItems) {
      const qty = Number(item.quantity ?? 0) || 0;
      const rate = Number(item.rate ?? 0) || 0;
      total += qty * rate;

      const insertItem = new sql.Request(tx);
      insertItem.input("BOQId", sql.Int, boqId);
      insertItem.input("ItemName", sql.NVarChar(200), String(item.name ?? "").trim());
      insertItem.input("Description", sql.NVarChar(sql.MAX), String(item.description ?? "").trim());
      insertItem.input("Unit", sql.NVarChar(50), String(item.unit ?? "").trim());
      insertItem.input("Quantity", sql.Decimal(18, 2), qty);
      insertItem.input("Rate", sql.Decimal(18, 2), rate);
      insertItem.input("Notes", sql.NVarChar(sql.MAX), String(item.notes ?? "").trim());
      await insertItem.query(`
        INSERT INTO dbo.BOQLineItems
          (BOQId, ItemName, Description, Unit, Quantity, Rate, Notes)
        VALUES
          (@BOQId, @ItemName, @Description, @Unit, @Quantity, @Rate, @Notes)
      `);
    }

    await tx.commit();

    const itemsResult = await pool
      .request()
      .input("BOQId", sql.Int, boqId)
      .query(`SELECT * FROM dbo.BOQLineItems WHERE BOQId = @BOQId`);

    return res.status(201).json({
      ok: true,
      boq: {
        ...normalizeBoq(boqRow),
        items: (itemsResult.recordset ?? []).map(normalizeBoqItem),
        total,
      },
    });
  } catch (error) {
    try {
      if (error?.transaction?.state === "begun") {
        await error.transaction.rollback();
      }
    } catch {
      // ignore
    }
    return res.status(500).json({
      ok: false,
      error: error?.message ?? "Failed to create BOQ",
    });
  }
});

app.put("/api/boqs/:id", async (req, res) => {
  const id = Number.parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) {
    return res.status(400).json({ ok: false, error: "Invalid BOQ id" });
  }

  const {
    projectId,
    boqNumber,
    version = "1",
    preparedBy = null,
    status = "Draft",
    date = null,
    notes = null,
    items = [],
  } = req.body ?? {};

  const safeItems = Array.isArray(items) ? items : [];
  const hasValidItem = safeItems.some((item) => Number(item.quantity ?? 0) > 0);
  if (!projectId) {
    return res.status(400).json({ ok: false, error: "Project is required" });
  }
  if (!String(boqNumber ?? "").trim()) {
    return res.status(400).json({ ok: false, error: "BOQ number is required" });
  }
  if (!hasValidItem) {
    return res.status(400).json({ ok: false, error: "At least one line item is required" });
  }

  try {
    await ensureBoqTables();
    const pool = await getPool();
    const tx = pool.transaction();
    await tx.begin();

    const updateBoq = new sql.Request(tx);
    updateBoq.input("BOQId", sql.Int, id);
    updateBoq.input("ProjectId", sql.Int, Number(projectId));
    updateBoq.input("BOQNumber", sql.NVarChar(50), String(boqNumber).trim());
    updateBoq.input("Version", sql.Int, Number.parseInt(version, 10) || 1);
    updateBoq.input("PreparedBy", sql.NVarChar(100), preparedBy || null);
    updateBoq.input("Status", sql.NVarChar(50), status || "Draft");
    updateBoq.input("BOQDate", sql.Date, parseDateInput(date) || null);
    updateBoq.input("Notes", sql.NVarChar(sql.MAX), notes || null);

    const boqResult = await updateBoq.query(`
      UPDATE dbo.BOQProjects
      SET ProjectId = @ProjectId,
          BOQNumber = @BOQNumber,
          Version = @Version,
          PreparedBy = @PreparedBy,
          Status = @Status,
          BOQDate = @BOQDate,
          Notes = @Notes,
          UpdatedAt = SYSUTCDATETIME()
      OUTPUT INSERTED.*
      WHERE BOQId = @BOQId
    `);

    const boqRow = boqResult.recordset?.[0];
    if (!boqRow) {
      await tx.rollback();
      return res.status(404).json({ ok: false, error: "BOQ not found" });
    }

    const deleteItems = new sql.Request(tx);
    deleteItems.input("BOQId", sql.Int, id);
    await deleteItems.query(`DELETE FROM dbo.BOQLineItems WHERE BOQId = @BOQId`);

    let total = 0;
    for (const item of safeItems) {
      const qty = Number(item.quantity ?? 0) || 0;
      const rate = Number(item.rate ?? 0) || 0;
      total += qty * rate;

      const insertItem = new sql.Request(tx);
      insertItem.input("BOQId", sql.Int, id);
      insertItem.input("ItemName", sql.NVarChar(200), String(item.name ?? "").trim());
      insertItem.input("Description", sql.NVarChar(sql.MAX), String(item.description ?? "").trim());
      insertItem.input("Unit", sql.NVarChar(50), String(item.unit ?? "").trim());
      insertItem.input("Quantity", sql.Decimal(18, 2), qty);
      insertItem.input("Rate", sql.Decimal(18, 2), rate);
      insertItem.input("Notes", sql.NVarChar(sql.MAX), String(item.notes ?? "").trim());
      await insertItem.query(`
        INSERT INTO dbo.BOQLineItems
          (BOQId, ItemName, Description, Unit, Quantity, Rate, Notes)
        VALUES
          (@BOQId, @ItemName, @Description, @Unit, @Quantity, @Rate, @Notes)
      `);
    }

    await tx.commit();

    const itemsResult = await pool
      .request()
      .input("BOQId", sql.Int, id)
      .query(`SELECT * FROM dbo.BOQLineItems WHERE BOQId = @BOQId`);

    return res.json({
      ok: true,
      boq: {
        ...normalizeBoq(boqRow),
        items: (itemsResult.recordset ?? []).map(normalizeBoqItem),
        total,
      },
    });
  } catch (error) {
    try {
      if (error?.transaction?.state === "begun") {
        await error.transaction.rollback();
      }
    } catch {
      // ignore
    }
    return res.status(500).json({
      ok: false,
      error: error?.message ?? "Failed to update BOQ",
    });
  }
});

app.delete("/api/boqs/:id", async (req, res) => {
  const id = Number.parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) {
    return res.status(400).json({ ok: false, error: "Invalid BOQ id" });
  }

  try {
    await ensureBoqTables();
    const pool = await getPool();
    const tx = pool.transaction();
    await tx.begin();

    const deleteItems = new sql.Request(tx);
    deleteItems.input("BOQId", sql.Int, id);
    await deleteItems.query(`DELETE FROM dbo.BOQLineItems WHERE BOQId = @BOQId`);

    const deleteBoq = new sql.Request(tx);
    deleteBoq.input("BOQId", sql.Int, id);
    const result = await deleteBoq.query(`DELETE FROM dbo.BOQProjects WHERE BOQId = @BOQId`);

    await tx.commit();

    if (result.rowsAffected?.[0] === 0) {
      return res.status(404).json({ ok: false, error: "BOQ not found" });
    }

    return res.json({ ok: true });
  } catch (error) {
    try {
      if (error?.transaction?.state === "begun") {
        await error.transaction.rollback();
      }
    } catch {
      // ignore
    }
    return res.status(500).json({
      ok: false,
      error: error?.message ?? "Failed to delete BOQ",
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
  const localUrl = `http://localhost:${port}/api`;
  console.log(`API server running on ${localUrl}`);

  const lanAddresses = getLanAddresses();
  if (lanAddresses.length > 0) {
    console.log("LAN URLs:");
    lanAddresses.forEach((address) => {
      console.log(`  http://${address}:${port}/api`);
    });
  }
});

