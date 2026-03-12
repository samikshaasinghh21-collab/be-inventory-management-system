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

const toIdentifier = (name) => `[${String(name).replace(/]/g, "]]")}]`;

const getSqlErrorNumber = (error) =>
  error?.number ??
  error?.originalError?.info?.number ??
  error?.originalError?.number ??
  error?.info?.number ??
  null;

const isSqlMissingTableError = (error) => {
  const number = getSqlErrorNumber(error);
  return number === 208 || number === 207;
};
const isSqlForeignKeyViolation = (error) => getSqlErrorNumber(error) === 547;

const uniqueColumnNames = (columns = []) => {
  const seen = new Set();
  return columns.filter((column) => {
    const normalized = String(column ?? "").toLowerCase();
    if (!normalized || seen.has(normalized)) {
      return false;
    }
    seen.add(normalized);
    return true;
  });
};

const buildTextCoalesceExpr = (columns = [], fallback = "N''") => {
  const normalizedColumns = uniqueColumnNames(columns);
  if (!normalizedColumns.length) {
    return fallback;
  }
  return `COALESCE(${normalizedColumns
    .map(
      (column) =>
        `NULLIF(LTRIM(RTRIM(CAST(${toIdentifier(column)} AS NVARCHAR(MAX)))), N'')`
    )
    .join(", ")}, ${fallback})`;
};

const buildNumberCoalesceExpr = (columns = [], fallback = "0") => {
  const normalizedColumns = uniqueColumnNames(columns);
  if (!normalizedColumns.length) {
    return fallback;
  }
  return `COALESCE(${normalizedColumns
    .map((column) => `TRY_CONVERT(DECIMAL(18, 2), ${toIdentifier(column)})`)
    .join(", ")}, ${fallback})`;
};

const buildIdCoalesceExpr = (columns = [], fallback = "NULL") => {
  const normalizedColumns = uniqueColumnNames(columns);
  if (!normalizedColumns.length) {
    return fallback;
  }
  return `COALESCE(${normalizedColumns
    .map((column) => `TRY_CONVERT(BIGINT, ${toIdentifier(column)})`)
    .join(", ")}, ${fallback})`;
};

const buildDateCoalesceExpr = (columns = [], fallback = "NULL") => {
  const normalizedColumns = uniqueColumnNames(columns);
  if (!normalizedColumns.length) {
    return fallback;
  }
  return `COALESCE(${normalizedColumns
    .map((column) => `TRY_CONVERT(DATETIME2, ${toIdentifier(column)})`)
    .join(", ")}, ${fallback})`;
};

const projectDependencySources = [
  { key: "locations", table: "Locations", singular: "location", plural: "locations" },
  {
    key: "purchaseOrders",
    table: "PurchaseOrders",
    singular: "purchase order",
    plural: "purchase orders",
  },
  {
    key: "receiveGoods",
    table: "ReceiveGoods",
    singular: "receive goods receipt",
    plural: "receive goods receipts",
  },
  { key: "boqs", table: "BOQProjects", singular: "BOQ", plural: "BOQs" },
  {
    key: "deliveryChallans",
    table: "DeliveryChallan",
    singular: "delivery challan",
    plural: "delivery challans",
  },
  {
    key: "consumptions",
    table: "Consumption",
    singular: "consumption record",
    plural: "consumption records",
  },
];

const formatCountLabel = (count, singular, plural) =>
  `${count} ${count === 1 ? singular : plural}`;

const loadProjectDependencyCounts = async (pool, projectId) => {
  const counts = {};
  for (const source of projectDependencySources) {
    try {
      const result = await pool
        .request()
        .input("ProjectId", sql.Int, projectId)
        .query(
          `SELECT COUNT(1) AS count FROM dbo.${toIdentifier(source.table)} WHERE ProjectId = @ProjectId`
        );
      counts[source.key] = Number(result.recordset?.[0]?.count ?? 0);
    } catch (error) {
      if (isSqlMissingTableError(error)) {
        counts[source.key] = 0;
        continue;
      }
      throw error;
    }
  }
  return counts;
};

const buildProjectDependencySummary = (counts = {}) => {
  const parts = projectDependencySources
    .map((source) => {
      const count = Number(counts[source.key] ?? 0);
      if (!count) {
        return null;
      }
      return formatCountLabel(count, source.singular, source.plural);
    })
    .filter(Boolean);
  return parts.join(", ");
};

const resolveItemsSchema = async () => {
  const pool = await getPool();
  const [columnsResult, identityResult] = await Promise.all([
    pool.request().query(`
      SELECT name AS ColumnName
      FROM sys.columns
      WHERE object_id = OBJECT_ID('dbo.Items')
    `),
    pool.request().query(`
      SELECT name AS ColumnName
      FROM sys.identity_columns
      WHERE object_id = OBJECT_ID('dbo.Items')
    `),
  ]);

  const columnsByName = new Map(
    (columnsResult.recordset ?? []).map((row) => {
      const actualName = String(row.ColumnName ?? "");
      return [actualName.toLowerCase(), actualName];
    })
  );
  const identityColumns = new Set(
    (identityResult.recordset ?? []).map((row) =>
      String(row.ColumnName ?? "").toLowerCase()
    )
  );

  const findColumns = (...candidates) =>
    uniqueColumnNames(
      candidates
        .map((candidate) => columnsByName.get(String(candidate).toLowerCase()) ?? null)
        .filter(Boolean)
    );

  const idColumns = findColumns(
    "item_id",
    "ItemId",
    "itemid",
    "itemId",
    "ID",
    "Id",
    "id",
    "product_id",
    "ProductId",
    "ProductID"
  );
  const nameColumns = findColumns(
    "item_name",
    "ItemName",
    "Name",
    "name",
    "ProductName",
    "product_name"
  );
  const categoryColumns = findColumns(
    "item_category",
    "ItemCategory",
    "Category",
    "category"
  );
  const hsnColumns = findColumns("hsn_code", "HSNCode", "HsnCode", "HSN", "hsn");
  const stockColumns = findColumns(
    "stock_qty",
    "StockQty",
    "stock",
    "Stock",
    "opening_stock",
    "OpeningStock",
    "quantity",
    "Quantity",
    "qty",
    "Qty"
  );
  const priceColumns = findColumns(
    "unit_price",
    "UnitPrice",
    "price",
    "Price",
    "selling_price",
    "SellingPrice",
    "rate",
    "Rate"
  );
  const gstColumns = findColumns("gst_rate", "GSTRate", "GST", "Gst", "gst");
  const descriptionColumns = findColumns(
    "item_description",
    "ItemDescription",
    "description",
    "Description",
    "details",
    "Details"
  );
  const createdAtColumns = findColumns(
    "created_at",
    "CreatedAt",
    "createdAt"
  );
  const updatedAtColumns = findColumns(
    "updated_at",
    "UpdatedAt",
    "updatedAt"
  );

  const idColumn =
    idColumns.find((column) => identityColumns.has(column.toLowerCase())) ??
    idColumns[0] ??
    null;

  return {
    idColumn,
    sortColumn: idColumn ?? nameColumns[0] ?? categoryColumns[0] ?? null,
    idColumns,
    nameColumns,
    categoryColumns,
    hsnColumns,
    stockColumns,
    priceColumns,
    gstColumns,
    descriptionColumns,
    createdAtColumns,
    updatedAtColumns,
  };
};

const normalizeItem = (row = {}) => ({
  id:
    row.item_id ??
    row.ItemId ??
    row.ItemID ??
    row.ID ??
    row.Id ??
    row.id ??
    row.ProductId ??
    row.ProductID ??
    null,
  name:
    row.item_name ??
    row.Name ??
    row.ItemName ??
    row.ProductName ??
    row.name ??
    row.itemName ??
    row.productName ??
    "",
  category:
    row.item_category ??
    row.Category ??
    row.ItemCategory ??
    row.category ??
    row.itemCategory ??
    "",
  hsn:
    row.hsn_code ??
    row.HSN ??
    row.HSNCode ??
    row.HsnCode ??
    row.hsn ??
    row.hsnCode ??
    "",
  stock: Number(
    row.stock_qty ??
    row.opening_stock ??
    row.Stock ??
    row.Quantity ??
    row.Qty ??
    row.stock ??
    row.quantity ??
    row.qty ??
    0
  ),
  price: Number(
    row.unit_price ??
      row.selling_price ??
      row.Price ??
      row.Rate ??
      row.UnitPrice ??
      row.price ??
      row.rate ??
      row.unitPrice ??
      0
  ),
  gst: row.gst_rate ?? row.GST ?? row.Gst ?? row.gst ?? "",
  description:
    row.item_description ??
    row.Description ??
    row.ItemDescription ??
    row.Details ??
    row.description ??
    row.itemDescription ??
    row.details ??
    "",
});

const formatDateOnlyValue = (value) => {
  if (value === undefined || value === null || value === "") {
    return null;
  }
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString().slice(0, 10);
  }
  const trimmed = String(value).trim();
  if (!trimmed) {
    return null;
  }
  const directMatch = /^(\d{4})-(\d{2})-(\d{2})/.exec(trimmed);
  if (directMatch) {
    return `${directMatch[1]}-${directMatch[2]}-${directMatch[3]}`;
  }
  const parsed = new Date(trimmed);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
};

const normalizeProject = (row = {}) => ({
  id: row.ProjectId ?? row.id ?? null,
  name: row.ProjectName ?? row.name ?? "",
  code: row.ProjectCode ?? row.code ?? "",
  client: row.Client ?? row.client ?? "",
  status: row.Status ?? row.status ?? "",
  startDate: formatDateOnlyValue(row.StartDate ?? row.startDate),
  endDate: formatDateOnlyValue(row.EndDate ?? row.endDate),
  notes: row.Notes ?? row.notes ?? "",
});

const normalizeLocation = (row = {}) => ({
  id: row.LocationId ?? row.Id ?? row.id ?? null,
  name: row.Name ?? row.name ?? row.LocationName ?? row.locationName ?? "",
  code: row.Code ?? row.code ?? "",
  type: row.Type ?? row.type ?? "",
  projectId: row.ProjectId ?? row.projectId ?? null,
  manager: row.Manager ?? row.manager ?? "",
  phone: row.Phone ?? row.phone ?? "",
  address: row.Address ?? row.address ?? "",
  status: row.Status ?? row.status ?? "Active",
  createdAt: row.CreatedAt ?? row.createdAt ?? null,
  updatedAt: row.UpdatedAt ?? row.updatedAt ?? null,
});

const normalizePurchaseOrder = (row = {}) => ({
  id: row.PurchaseOrderId ?? row.Id ?? row.id ?? null,
  poNumber: row.PONumber ?? row.poNumber ?? "",
  projectId: row.ProjectId ?? row.projectId ?? null,
  vendorId: row.VendorId ?? row.vendorId ?? null,
  locationId: row.LocationId ?? row.locationId ?? null,
  orderDate: row.OrderDate ?? row.orderDate ?? null,
  expectedDate:
    row.ExpectedDeliveryDate ??
    row.expectedDate ??
    row.ExpectedDate ??
    null,
  status: row.Status ?? row.status ?? "",
  notes: row.Notes ?? row.notes ?? "",
  total: Number(row.Total ?? row.total ?? 0),
});

const normalizePoItem = (row = {}) => {
  const quantity = Number(row.Quantity ?? row.Qty ?? row.quantity ?? 0);
  const unitPrice = Number(
    row.UnitPrice ?? row.unitPrice ?? row.Rate ?? row.rate ?? 0
  );
  return {
    id: row.PurchaseOrderItemId ?? row.Id ?? row.id ?? null,
    purchaseOrderId: row.PurchaseOrderId ?? row.purchaseOrderId ?? null,
    itemId: row.ItemId ?? row.itemId ?? null,
    name: row.ItemName ?? row.Name ?? row.name ?? "",
    description: row.Description ?? row.description ?? "",
    unit: row.Unit ?? row.unit ?? "PCS",
    hsn: row.HSN ?? row.hsn ?? row.Hsn ?? "",
    gst: row.GST ?? row.gst ?? row.Gst ?? "",
    quantity,
    unitPrice,
    totalPrice:
      Number(row.TotalPrice ?? row.totalPrice ?? row.Total ?? 0) ||
      quantity * unitPrice,
    location: row.Location ?? row.location ?? row.Notes ?? row.notes ?? "",
    notes: row.Notes ?? row.notes ?? row.Location ?? row.location ?? "",
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
  const rawConsumed =
    row.ConsumedQty ??
    row.consumedQty ??
    row.TotalConsumed ??
    row.totalConsumed ??
    null;
  const consumedQty = Number.isFinite(Number(rawConsumed)) ? Number(rawConsumed) : null;
  const rawAvailable =
    row.AvailableQty ?? row.availableQty ?? row.RemainingQty ?? row.remainingQty ?? null;
  const availableQty = Number.isFinite(Number(rawAvailable))
    ? Number(rawAvailable)
    : Number.isFinite(consumedQty)
    ? Math.max(quantity - consumedQty, 0)
    : null;
  return {
    id: row.LineItemId ?? row.lineItemId ?? null,
    boqId: row.BOQId ?? row.boqId ?? null,
    name: row.ItemName ?? row.name ?? "",
    description: row.Description ?? row.description ?? "",
    unit: row.Unit ?? row.unit ?? "",
    quantity,
    consumedQty,
    availableQty,
    rate,
    notes: row.Notes ?? row.notes ?? "",
    amount: quantity * rate,
  };
};

const normalizeDeliveryChallan = (row = {}) => {
  const id =
    row.DeliveryChallanId ??
    row.deliveryChallanId ??
    row.Id ??
    row.id ??
    null;
  return {
    id,
    deliveryChallanId: id,
    dcNumber: row.DCNumber ?? row.DcNumber ?? row.dcNumber ?? "",
    projectId: row.ProjectId ?? row.projectId ?? null,
    fromLocationId: row.FromLocationId ?? row.fromLocationId ?? null,
    toLocation: row.ToLocation ?? row.toLocation ?? "",
    vehicleNumber: row.VehicleNumber ?? row.vehicleNumber ?? "",
    eWayBillNumber:
      row.EWayBillNumber ??
      row.EwayBillNumber ??
      row.eWayBillNumber ??
      row.EBN ??
      row.ebn ??
      "",
    issueDate: row.IssueDate ?? row.issueDate ?? null,
    status: row.Status ?? row.status ?? "Draft",
    notes: row.Notes ?? row.notes ?? "",
    createdAt: row.CreatedAt ?? row.createdAt ?? null,
    updatedAt: row.UpdatedAt ?? row.updatedAt ?? null,
  };
};

const normalizeDeliveryChallanItem = (row = {}) => ({
  id: row.Id ?? row.id ?? null,
  deliveryChallanId:
    row.DeliveryChallanId ??
    row.DeliveryChallanID ??
    row.deliveryChallanId ??
    row.ChallanId ??
    null,
  name: row.ItemName ?? row.itemName ?? row.Name ?? row.name ?? "",
  description: row.Description ?? row.description ?? "",
  unit: row.Unit ?? row.unit ?? "PCS",
  hsn: row.HSN ?? row.hsn ?? row.Hsn ?? "",
  gst: row.GST ?? row.gst ?? row.Gst ?? "",
  quantity: Number(row.Quantity ?? row.quantity ?? 0) || 0,
  rate: Number(row.Rate ?? row.rate ?? 0) || 0,
  notes: row.Notes ?? row.notes ?? "",
});

const normalizeConsumption = (row = {}) => {
  const id = row.ConsumptionId ?? row.consumptionId ?? row.Id ?? row.id ?? null;
  return {
    id,
    consumptionId: id,
    consumptionNumber: row.ConsumptionNumber ?? row.consumptionNumber ?? "",
    projectId: row.ProjectId ?? row.projectId ?? null,
    locationId: row.LocationId ?? row.locationId ?? null,
    consumptionDate:
      row.ConsumptionDate ?? row.consumptionDate ?? row.Date ?? row.date ?? null,
    issuedBy: row.IssuedBy ?? row.issuedBy ?? "",
    status: row.Status ?? row.status ?? "Logged",
    notes: row.Notes ?? row.notes ?? "",
    createdAt: row.CreatedAt ?? row.createdAt ?? null,
    updatedAt: row.UpdatedAt ?? row.updatedAt ?? null,
  };
};

const normalizeConsumptionItem = (row = {}) => ({
  id: row.Id ?? row.id ?? null,
  consumptionId:
    row.ConsumptionId ??
    row.ConsumptionID ??
    row.consumptionId ??
    row.ParentId ??
    null,
  boqItemId: row.BoqItemId ?? row.BOQItemId ?? row.boqItemId ?? null,
  name: row.Item ?? row.item ?? row.Name ?? row.name ?? "",
  description: row.Description ?? row.description ?? "",
  unit: row.Unit ?? row.unit ?? "PCS",
  hsn: row.HSN ?? row.hsn ?? row.Hsn ?? "",
  gst: row.GST ?? row.gst ?? row.Gst ?? "",
  quantity: Number(row.Quantity ?? row.quantity ?? 0) || 0,
  rate: Number(row.Rate ?? row.rate ?? 0) || 0,
  notes: row.Notes ?? row.notes ?? "",
});

const normalizeReallocateInventory = (row = {}) => {
  const id = row.Id ?? row.id ?? row.TransferId ?? row.transferId ?? null;
  const rawNotes = row.Notes ?? row.notes ?? "";
  let metadata = {};

  if (typeof rawNotes === "string") {
    const trimmed = rawNotes.trim();
    if (trimmed.startsWith("{")) {
      try {
        const parsed = JSON.parse(trimmed);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          metadata = parsed;
        }
      } catch {
        metadata = {};
      }
    } else if (trimmed) {
      metadata = { notes: trimmed };
    }
  }

  return {
    id,
    transferId: id,
    referenceNumber: metadata.referenceNumber ?? `REL-${id}`,
    type: metadata.type === "Return" ? "Return" : "Reallocate",
    consumptionId: metadata.consumptionId ?? null,
    consumptionNumber: metadata.consumptionNumber ?? "",
    projectId: row.ProjectId ?? row.projectId ?? metadata.projectId ?? null,
    fromLocationId: row.FromLocationId ?? row.fromLocationId ?? null,
    toLocationId: row.ToLocationId ?? row.toLocationId ?? null,
    returnVendorId: metadata.returnVendorId ?? null,
    requestDate:
      row.TransferDate ?? row.transferDate ?? metadata.requestDate ?? null,
    transferDate: row.TransferDate ?? row.transferDate ?? null,
    requestedBy: metadata.requestedBy ?? "",
    status: metadata.status ?? "Pending",
    notes: metadata.notes ?? rawNotes ?? "",
    createdAt: row.CreatedAt ?? row.createdAt ?? metadata.createdAt ?? null,
    updatedAt: row.UpdatedAt ?? row.updatedAt ?? metadata.updatedAt ?? null,
  };
};

const normalizeReallocateInventoryItem = (row = {}) => ({
  id: row.Id ?? row.id ?? null,
  transferId:
    row.TransferId ??
    row.transferId ??
    row.ReallocateInventoryId ??
    row.reallocateInventoryId ??
    null,
  item: row.Item ?? row.item ?? row.Name ?? row.name ?? "",
  name: row.Item ?? row.item ?? row.Name ?? row.name ?? "",
  description: row.Description ?? row.description ?? "",
  unit: row.Unit ?? row.unit ?? "PCS",
  quantity: Number(row.Quantity ?? row.quantity ?? 0) || 0,
});

const buildReallocateNotesPayload = ({
  referenceNumber = null,
  type = "Reallocate",
  consumptionId = null,
  consumptionNumber = "",
  projectId = null,
  returnVendorId = null,
  requestDate = null,
  requestedBy = "",
  status = "Pending",
  notes = "",
  createdAt = null,
  updatedAt = null,
} = {}) =>
  JSON.stringify({
    referenceNumber,
    type,
    consumptionId,
    consumptionNumber,
    projectId,
    returnVendorId,
    requestDate,
    requestedBy,
    status,
    notes,
    createdAt,
    updatedAt,
  });

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

const rollbackTx = async (tx) => {
  if (!tx) {
    return;
  }
  try {
    await tx.rollback();
  } catch {
    // ignore rollback failure
  }
};

const RECEIVE_ID_COL = "ReceiveGoodsId";

const computeReceiveStatus = (items = [], fallback = "Draft") => {
  const normalized = Array.isArray(items) ? items : [];
  if (!normalized.length) {
    return fallback;
  }
  const anyReceived = normalized.some(
    (item) => Number(item.receivedQty ?? item.ReceivedQty ?? 0) > 0
  );
  const allReceived = normalized.every((item) => {
    const ordered = Number(item.orderedQty ?? item.OrderedQty ?? 0) || 0;
    const received = Number(item.receivedQty ?? item.ReceivedQty ?? 0) || 0;
    if (ordered === 0) return true;
    return received >= ordered;
  });
  if (allReceived) return "Closed";
  if (anyReceived) return "Partially Received";
  return fallback;
};

const normalizeReceiveGoods = (row = {}) => {
  const id =
    row.ReceiveGoodsId ?? row.receiveGoodsId ?? row.Id ?? row.id ?? null;
  return {
    id,
    receiveGoodsId: id,
    purchaseOrderId:
      row.PurchaseOrderId ?? row.purchaseOrderId ?? row.PurchaseorderId ?? null,
    projectId: row.ProjectId ?? row.projectId ?? null,
    vendorId: row.VendorId ?? row.vendorId ?? null,
    locationId: row.LocationId ?? row.locationId ?? null,
    receivedDate: row.ReceivedDate ?? row.receivedDate ?? null,
    receivedBy: row.ReceivedBy ?? row.receivedBy ?? "",
    notes: row.Notes ?? row.notes ?? "",
    status: row.Status ?? row.status ?? "",
    createdAt: row.CreatedAt ?? row.createdAt ?? null,
    updatedAt: row.UpdatedAt ?? row.updatedAt ?? null,
  };
};

const normalizeReceiveGoodsItem = (row = {}) => {
  const orderedQty = Number(row.OrderedQty ?? row.orderedQty ?? 0) || 0;
  const receivedQty = Number(row.ReceivedQty ?? row.receivedQty ?? 0) || 0;
  const receiveId =
    row.ReceiveGoodsId ??
    row.ReceiveGoodsID ??
    row.receiveGoodsId ??
    row.ReceivegoodsId ??
    row.ReceiptId ??
    row.ReceiveId ??
    null;
  return {
    id: row.Id ?? row.id ?? null,
    receiveGoodsId: receiveId,
    purchaseOrderId:
      row.PurchaseOrderId ?? row.purchaseOrderId ?? row.PurchaseorderId ?? null,
    itemId: row.ItemId ?? row.itemId ?? null,
    name: row.ItemName ?? row.itemName ?? row.Name ?? row.name ?? "",
    description: row.Description ?? row.description ?? "",
    unit: row.Unit ?? row.unit ?? "PCS",
    notes: row.ItemNotes ?? row.itemNotes ?? row.Notes ?? row.notes ?? "",
    orderedQty,
    receivedQty,
    balanceQty:
      Number(row.BalanceQty ?? row.balanceQty ?? orderedQty - receivedQty) || 0,
    createdAt: row.CreatedAt ?? row.createdAt ?? null,
  };
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

  await pool.request().query(`
    IF COL_LENGTH('dbo.Items', 'Name') IS NULL
    BEGIN
      ALTER TABLE dbo.Items ADD Name NVARCHAR(255) NULL;
    END;

    IF COL_LENGTH('dbo.Items', 'Category') IS NULL
    BEGIN
      ALTER TABLE dbo.Items ADD Category NVARCHAR(100) NULL;
    END;

    IF COL_LENGTH('dbo.Items', 'HSN') IS NULL
    BEGIN
      ALTER TABLE dbo.Items ADD HSN NVARCHAR(50) NULL;
    END;

    IF COL_LENGTH('dbo.Items', 'Stock') IS NULL
    BEGIN
      ALTER TABLE dbo.Items ADD Stock INT NULL;
    END;

    IF COL_LENGTH('dbo.Items', 'Price') IS NULL
    BEGIN
      ALTER TABLE dbo.Items ADD Price DECIMAL(18, 2) NULL;
    END;

    IF COL_LENGTH('dbo.Items', 'GST') IS NULL
    BEGIN
      ALTER TABLE dbo.Items ADD GST NVARCHAR(100) NULL;
    END;

    IF COL_LENGTH('dbo.Items', 'Description') IS NULL
    BEGIN
      ALTER TABLE dbo.Items ADD Description NVARCHAR(MAX) NULL;
    END;

    IF COL_LENGTH('dbo.Items', 'CreatedAt') IS NULL
    BEGIN
      ALTER TABLE dbo.Items ADD CreatedAt DATETIME2 NULL;
    END;

    IF COL_LENGTH('dbo.Items', 'UpdatedAt') IS NULL
    BEGIN
      ALTER TABLE dbo.Items ADD UpdatedAt DATETIME2 NULL;
    END;
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

  await pool.request().query(`
    IF COL_LENGTH('dbo.Projects', 'CreatedAt') IS NULL
    BEGIN
      ALTER TABLE dbo.Projects ADD CreatedAt DATETIME2 NULL;
    END;

    IF COL_LENGTH('dbo.Projects', 'UpdatedAt') IS NULL
    BEGIN
      ALTER TABLE dbo.Projects ADD UpdatedAt DATETIME2 NULL;
    END;
  `);

  await pool.request().query(`
    UPDATE dbo.Projects
    SET
      CreatedAt = COALESCE(CreatedAt, SYSUTCDATETIME()),
      UpdatedAt = COALESCE(UpdatedAt, CreatedAt, SYSUTCDATETIME())
    WHERE CreatedAt IS NULL OR UpdatedAt IS NULL;

    BEGIN TRY
      IF COLUMNPROPERTY(OBJECT_ID('dbo.Projects'), 'CreatedAt', 'AllowsNull') = 1
      BEGIN
        ALTER TABLE dbo.Projects ALTER COLUMN CreatedAt DATETIME2 NOT NULL;
      END;
    END TRY
    BEGIN CATCH
      -- Ignore if dependent objects prevent tightening the column definition.
    END CATCH;

    BEGIN TRY
      IF COLUMNPROPERTY(OBJECT_ID('dbo.Projects'), 'UpdatedAt', 'AllowsNull') = 1
      BEGIN
        ALTER TABLE dbo.Projects ALTER COLUMN UpdatedAt DATETIME2 NOT NULL;
      END;
    END TRY
    BEGIN CATCH
      -- Ignore if dependent objects prevent tightening the column definition.
    END CATCH;
  `);

  await pool.request().query(`
    IF NOT EXISTS (
      SELECT 1
      FROM sys.default_constraints dc
      INNER JOIN sys.columns c
        ON c.object_id = dc.parent_object_id
       AND c.column_id = dc.parent_column_id
      WHERE dc.parent_object_id = OBJECT_ID('dbo.Projects')
        AND c.name = 'CreatedAt'
    )
    BEGIN
      ALTER TABLE dbo.Projects
      ADD CONSTRAINT DF_Projects_CreatedAt DEFAULT SYSUTCDATETIME() FOR CreatedAt;
    END;

    IF NOT EXISTS (
      SELECT 1
      FROM sys.default_constraints dc
      INNER JOIN sys.columns c
        ON c.object_id = dc.parent_object_id
       AND c.column_id = dc.parent_column_id
      WHERE dc.parent_object_id = OBJECT_ID('dbo.Projects')
        AND c.name = 'UpdatedAt'
    )
    BEGIN
      ALTER TABLE dbo.Projects
      ADD CONSTRAINT DF_Projects_UpdatedAt DEFAULT SYSUTCDATETIME() FOR UpdatedAt;
    END;
  `);
};

const ensureLocationsTable = async () => {
  const pool = await getPool();
  await pool.request().query(`
    IF OBJECT_ID('dbo.Locations', 'U') IS NULL
    BEGIN
      CREATE TABLE dbo.Locations (
        LocationId INT IDENTITY(1,1) PRIMARY KEY,
        Name NVARCHAR(255) NOT NULL,
        Code NVARCHAR(50) NULL,
        Type NVARCHAR(50) NULL,
        ProjectId INT NULL,
        Manager NVARCHAR(100) NULL,
        Phone NVARCHAR(50) NULL,
        Address NVARCHAR(MAX) NULL,
        Status NVARCHAR(50) NULL,
        CreatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
        UpdatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
      )
    END
  `);

  await pool.request().query(`
    IF COL_LENGTH('dbo.Locations', 'Name') IS NULL
    BEGIN
      ALTER TABLE dbo.Locations ADD Name NVARCHAR(255) NULL;
    END;
    IF COL_LENGTH('dbo.Locations', 'Code') IS NULL
    BEGIN
      ALTER TABLE dbo.Locations ADD Code NVARCHAR(50) NULL;
    END;
    IF COL_LENGTH('dbo.Locations', 'Type') IS NULL
    BEGIN
      ALTER TABLE dbo.Locations ADD Type NVARCHAR(50) NULL;
    END;
    IF COL_LENGTH('dbo.Locations', 'ProjectId') IS NULL
    BEGIN
      ALTER TABLE dbo.Locations ADD ProjectId INT NULL;
    END;
    IF COL_LENGTH('dbo.Locations', 'Manager') IS NULL
    BEGIN
      ALTER TABLE dbo.Locations ADD Manager NVARCHAR(100) NULL;
    END;
    IF COL_LENGTH('dbo.Locations', 'Phone') IS NULL
    BEGIN
      ALTER TABLE dbo.Locations ADD Phone NVARCHAR(50) NULL;
    END;
    IF COL_LENGTH('dbo.Locations', 'Address') IS NULL
    BEGIN
      ALTER TABLE dbo.Locations ADD Address NVARCHAR(MAX) NULL;
    END;
    IF COL_LENGTH('dbo.Locations', 'Status') IS NULL
    BEGIN
      ALTER TABLE dbo.Locations ADD Status NVARCHAR(50) NULL;
    END;
    IF COL_LENGTH('dbo.Locations', 'CreatedAt') IS NULL
    BEGIN
      ALTER TABLE dbo.Locations ADD CreatedAt DATETIME2 NOT NULL
        CONSTRAINT DF_Locations_CreatedAt DEFAULT SYSUTCDATETIME();
    END;
    IF COL_LENGTH('dbo.Locations', 'UpdatedAt') IS NULL
    BEGIN
      ALTER TABLE dbo.Locations ADD UpdatedAt DATETIME2 NOT NULL
        CONSTRAINT DF_Locations_UpdatedAt DEFAULT SYSUTCDATETIME();
    END;
  `);
};

let ensurePurchaseTablesPromise = null;

const ensurePurchaseTables = async () => {
  if (ensurePurchaseTablesPromise) {
    return ensurePurchaseTablesPromise;
  }

  ensurePurchaseTablesPromise = (async () => {
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
        HSN NVARCHAR(50) NULL,
        GST NVARCHAR(100) NULL,
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
    IF COL_LENGTH('dbo.PurchaseOrderItems', 'HSN') IS NULL
    BEGIN
      ALTER TABLE dbo.PurchaseOrderItems ADD HSN NVARCHAR(50) NULL;
    END;
    IF COL_LENGTH('dbo.PurchaseOrderItems', 'GST') IS NULL
    BEGIN
      ALTER TABLE dbo.PurchaseOrderItems ADD GST NVARCHAR(100) NULL;
    END;
  `);
  })();

  try {
    await ensurePurchaseTablesPromise;
  } catch (error) {
    // Retry on next request if schema sync fails once.
    ensurePurchaseTablesPromise = null;
    throw error;
  }
};

let receiveGoodsPk = "ReceiveGoodsId";
let receiveGoodsItemsFk = "ReceiveGoodsId";
const ensureSchemaOnRequest =
  String(process.env.DB_ENSURE_SCHEMA_ON_REQUEST ?? "false").toLowerCase() ===
  "true";

const refreshReceiveGoodsPk = async () => {
  const pool = await getPool();
  const res = await pool.request().query(`
    SELECT name AS ColumnName FROM sys.columns WHERE object_id = OBJECT_ID('dbo.ReceiveGoods')
  `);
  const cols = new Set(res.recordset.map((row) => row.ColumnName));
  if (cols.has("ReceiveGoodsId")) {
    receiveGoodsPk = "ReceiveGoodsId";
  } else if (cols.has("Id")) {
    receiveGoodsPk = "Id";
  } else {
    receiveGoodsPk = "ReceiveGoodsId";
  }
  return receiveGoodsPk;
};

const refreshReceiveGoodsItemsFk = async () => {
  const pool = await getPool();
  const res = await pool.request().query(`
    SELECT name AS ColumnName FROM sys.columns WHERE object_id = OBJECT_ID('dbo.ReceiveGoodsItems')
  `);
  const cols = new Set(res.recordset.map((row) => row.ColumnName));

  if (cols.has("ReceiveGoodsId")) {
    receiveGoodsItemsFk = "ReceiveGoodsId";
  } else if (cols.has("ReceiveGoodsID")) {
    receiveGoodsItemsFk = "ReceiveGoodsID";
  } else if (cols.has("ReceiptId")) {
    receiveGoodsItemsFk = "ReceiptId";
  } else if (cols.has("ReceiveId")) {
    receiveGoodsItemsFk = "ReceiveId";
  } else {
    receiveGoodsItemsFk = "ReceiveGoodsId";
  }

  return receiveGoodsItemsFk;
};

let ensureReceiveTablesPromise = null;

const ensureReceiveTables = async () => {
  if (ensureReceiveTablesPromise) {
    return ensureReceiveTablesPromise;
  }

  ensureReceiveTablesPromise = (async () => {
    const pool = await getPool();

    await pool.request().query(`
    IF OBJECT_ID('dbo.ReceiveGoods', 'U') IS NULL
    BEGIN
      CREATE TABLE dbo.ReceiveGoods (
        ReceiveGoodsId INT IDENTITY(1,1) PRIMARY KEY,
        PurchaseOrderId INT NULL,
        ProjectId INT NULL,
        VendorId INT NULL,
        LocationId INT NULL,
        ReceivedDate DATE NULL,
        ReceivedBy NVARCHAR(100) NULL,
        Notes NVARCHAR(MAX) NULL,
        Status NVARCHAR(50) NULL,
        CreatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
        UpdatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
      )
    END
  `);

  // Column patching for ReceiveGoods; avoid adding a second identity column
    const colsResult = await pool.request().query(`
    SELECT name AS ColumnName FROM sys.columns WHERE object_id = OBJECT_ID('dbo.ReceiveGoods')
  `);
    const cols = new Set(colsResult.recordset.map((row) => row.ColumnName));

    const identityResult = await pool.request().query(`
    SELECT name AS ColumnName FROM sys.identity_columns
    WHERE OBJECT_NAME(object_id) = 'ReceiveGoods'
  `);
    const hasIdentity = (identityResult.recordset ?? []).length > 0;
    const hasReceiveGoodsId = cols.has("ReceiveGoodsId");

    if (!hasReceiveGoodsId && !hasIdentity) {
      await pool.request().query(`
      ALTER TABLE dbo.ReceiveGoods ADD ReceiveGoodsId INT IDENTITY(1,1);
      ALTER TABLE dbo.ReceiveGoods ADD CONSTRAINT PK_ReceiveGoods PRIMARY KEY (ReceiveGoodsId);
    `);
    }

    await pool.request().query(`
    IF COL_LENGTH('dbo.ReceiveGoods', 'PurchaseOrderId') IS NULL
    BEGIN
      ALTER TABLE dbo.ReceiveGoods ADD PurchaseOrderId INT NULL;
    END;
    IF COL_LENGTH('dbo.ReceiveGoods', 'ProjectId') IS NULL
    BEGIN
      ALTER TABLE dbo.ReceiveGoods ADD ProjectId INT NULL;
    END;
    IF COL_LENGTH('dbo.ReceiveGoods', 'VendorId') IS NULL
    BEGIN
      ALTER TABLE dbo.ReceiveGoods ADD VendorId INT NULL;
    END;
    IF COL_LENGTH('dbo.ReceiveGoods', 'LocationId') IS NULL
    BEGIN
      ALTER TABLE dbo.ReceiveGoods ADD LocationId INT NULL;
    END;
    IF COL_LENGTH('dbo.ReceiveGoods', 'ReceivedDate') IS NULL
    BEGIN
      ALTER TABLE dbo.ReceiveGoods ADD ReceivedDate DATE NULL;
    END;
    IF COL_LENGTH('dbo.ReceiveGoods', 'ReceivedBy') IS NULL
    BEGIN
      ALTER TABLE dbo.ReceiveGoods ADD ReceivedBy NVARCHAR(100) NULL;
    END;
    IF COL_LENGTH('dbo.ReceiveGoods', 'Notes') IS NULL
    BEGIN
      ALTER TABLE dbo.ReceiveGoods ADD Notes NVARCHAR(MAX) NULL;
    END;
    IF COL_LENGTH('dbo.ReceiveGoods', 'Status') IS NULL
    BEGIN
      ALTER TABLE dbo.ReceiveGoods ADD Status NVARCHAR(50) NULL;
    END;
    IF COL_LENGTH('dbo.ReceiveGoods', 'CreatedAt') IS NULL
    BEGIN
      ALTER TABLE dbo.ReceiveGoods ADD CreatedAt DATETIME2 NOT NULL CONSTRAINT DF_ReceiveGoods_CreatedAt DEFAULT SYSUTCDATETIME();
    END;
    IF COL_LENGTH('dbo.ReceiveGoods', 'UpdatedAt') IS NULL
    BEGIN
      ALTER TABLE dbo.ReceiveGoods ADD UpdatedAt DATETIME2 NOT NULL CONSTRAINT DF_ReceiveGoods_UpdatedAt DEFAULT SYSUTCDATETIME();
    END;
  `);

  // Determine which PK column to reference (ReceiveGoodsId preferred, else Id)
    await refreshReceiveGoodsPk();

    await pool.request().query(`
    IF OBJECT_ID('dbo.ReceiveGoodsItems', 'U') IS NULL
    BEGIN
      CREATE TABLE dbo.ReceiveGoodsItems (
        Id INT IDENTITY(1,1) PRIMARY KEY,
        ReceiveGoodsId INT NULL,
        PurchaseOrderId INT NULL,
        ItemId INT NULL,
        OrderedQty INT NOT NULL DEFAULT 0,
        ReceivedQty INT NOT NULL DEFAULT 0,
        BalanceQty INT NOT NULL DEFAULT 0,
        CreatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
      )
    END
  `);

    await pool.request().query(`
    IF COL_LENGTH('dbo.ReceiveGoodsItems', 'ReceiveGoodsId') IS NULL
    BEGIN
      ALTER TABLE dbo.ReceiveGoodsItems ADD ReceiveGoodsId INT NULL;
    END;
    IF COL_LENGTH('dbo.ReceiveGoodsItems', 'PurchaseOrderId') IS NULL
    BEGIN
      ALTER TABLE dbo.ReceiveGoodsItems ADD PurchaseOrderId INT NULL;
    END;
    IF COL_LENGTH('dbo.ReceiveGoodsItems', 'ItemId') IS NULL
    BEGIN
      ALTER TABLE dbo.ReceiveGoodsItems ADD ItemId INT NULL;
    END;
    IF COL_LENGTH('dbo.ReceiveGoodsItems', 'ItemName') IS NULL
    BEGIN
      ALTER TABLE dbo.ReceiveGoodsItems ADD ItemName NVARCHAR(255) NULL;
    END;
    IF COL_LENGTH('dbo.ReceiveGoodsItems', 'Description') IS NULL
    BEGIN
      ALTER TABLE dbo.ReceiveGoodsItems ADD Description NVARCHAR(MAX) NULL;
    END;
    IF COL_LENGTH('dbo.ReceiveGoodsItems', 'Unit') IS NULL
    BEGIN
      ALTER TABLE dbo.ReceiveGoodsItems ADD Unit NVARCHAR(50) NULL;
    END;
    IF COL_LENGTH('dbo.ReceiveGoodsItems', 'ItemNotes') IS NULL
    BEGIN
      ALTER TABLE dbo.ReceiveGoodsItems ADD ItemNotes NVARCHAR(MAX) NULL;
    END;
    IF COL_LENGTH('dbo.ReceiveGoodsItems', 'OrderedQty') IS NULL
    BEGIN
      ALTER TABLE dbo.ReceiveGoodsItems ADD OrderedQty INT NOT NULL CONSTRAINT DF_ReceiveGoodsItems_OrderedQty DEFAULT 0;
    END;
    IF COL_LENGTH('dbo.ReceiveGoodsItems', 'ReceivedQty') IS NULL
    BEGIN
      ALTER TABLE dbo.ReceiveGoodsItems ADD ReceivedQty INT NOT NULL CONSTRAINT DF_ReceiveGoodsItems_ReceivedQty DEFAULT 0;
    END;
    IF COL_LENGTH('dbo.ReceiveGoodsItems', 'BalanceQty') IS NULL
    BEGIN
      ALTER TABLE dbo.ReceiveGoodsItems ADD BalanceQty INT NOT NULL CONSTRAINT DF_ReceiveGoodsItems_BalanceQty DEFAULT 0;
    END;
    IF COL_LENGTH('dbo.ReceiveGoodsItems', 'CreatedAt') IS NULL
    BEGIN
      ALTER TABLE dbo.ReceiveGoodsItems ADD CreatedAt DATETIME2 NOT NULL CONSTRAINT DF_ReceiveGoodsItems_CreatedAt DEFAULT SYSUTCDATETIME();
    END;
  `);

    const fkCol = await refreshReceiveGoodsItemsFk();
    const pkCol = await refreshReceiveGoodsPk();
    const fkMetaResult = await pool.request().query(`
    SELECT
      fk.name AS FkName,
      parentCol.name AS FkColumn,
      refCol.name AS PkColumn
    FROM sys.foreign_keys fk
    JOIN sys.foreign_key_columns fkc
      ON fk.object_id = fkc.constraint_object_id
    JOIN sys.columns parentCol
      ON parentCol.object_id = fkc.parent_object_id
     AND parentCol.column_id = fkc.parent_column_id
    JOIN sys.columns refCol
      ON refCol.object_id = fkc.referenced_object_id
     AND refCol.column_id = fkc.referenced_column_id
    WHERE fk.name = 'FK_ReceiveGoodsItems_ReceiveGoods'
  `);

    const existingFk = fkMetaResult.recordset?.[0] ?? null;
    const shouldRecreateFk =
      !existingFk ||
      existingFk.FkColumn !== fkCol ||
      existingFk.PkColumn !== pkCol;

    if (shouldRecreateFk && existingFk) {
      await pool.request().query(`
      ALTER TABLE dbo.ReceiveGoodsItems DROP CONSTRAINT FK_ReceiveGoodsItems_ReceiveGoods;
    `);
    }

    if (shouldRecreateFk) {
      // Cleanup orphan rows so FK creation does not fail and break read endpoints.
      await pool.request().query(`
      DELETE rgi
      FROM dbo.ReceiveGoodsItems rgi
      LEFT JOIN dbo.ReceiveGoods rg
        ON rgi.${fkCol} = rg.${pkCol}
      WHERE rgi.${fkCol} IS NOT NULL
        AND rg.${pkCol} IS NULL
    `);

      await pool.request().query(`
      ALTER TABLE dbo.ReceiveGoodsItems WITH CHECK ADD CONSTRAINT FK_ReceiveGoodsItems_ReceiveGoods
        FOREIGN KEY (${fkCol}) REFERENCES dbo.ReceiveGoods(${pkCol}) ON DELETE CASCADE
    `);
    }
  })();

  try {
    await ensureReceiveTablesPromise;
  } catch (error) {
    // Retry on next request if schema sync fails once.
    ensureReceiveTablesPromise = null;
    throw error;
  }
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
        ConsumedQty DECIMAL(18, 2) NULL,
        AvailableQty DECIMAL(18, 2) NULL,
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
    IF COL_LENGTH('dbo.BOQLineItems', 'AvailableQty') IS NULL
    BEGIN
      ALTER TABLE dbo.BOQLineItems ADD AvailableQty DECIMAL(18, 2) NULL;
    END;
    IF COL_LENGTH('dbo.BOQLineItems', 'ConsumedQty') IS NULL
    BEGIN
      ALTER TABLE dbo.BOQLineItems ADD ConsumedQty DECIMAL(18, 2) NULL;

      IF OBJECT_ID('dbo.ConsumptionItems', 'U') IS NOT NULL
      BEGIN
        EXEC('
          WITH Consumed AS (
            SELECT BoqItemId, SUM(Quantity) AS TotalConsumed
            FROM dbo.ConsumptionItems
            WHERE BoqItemId IS NOT NULL
            GROUP BY BoqItemId
          )
          UPDATE bi
          SET
            ConsumedQty = ISNULL(c.TotalConsumed, 0),
            AvailableQty = CASE
              WHEN bi.Quantity - ISNULL(c.TotalConsumed, 0) < 0 THEN 0
              ELSE bi.Quantity - ISNULL(c.TotalConsumed, 0)
            END
          FROM dbo.BOQLineItems bi
          LEFT JOIN Consumed c ON c.BoqItemId = bi.LineItemId;
        ');
      END
    END;
    IF COL_LENGTH('dbo.BOQLineItems', 'ConsumedQty') IS NOT NULL
    BEGIN
      UPDATE dbo.BOQLineItems
      SET ConsumedQty = 0
      WHERE ConsumedQty IS NULL;
    END;
  `);

  await pool.request().query(`
    UPDATE dbo.BOQLineItems
    SET AvailableQty = Quantity
    WHERE AvailableQty IS NULL
  `);
};

const uniqueBoqItemIds = (values = []) => {
  const set = new Set();
  (Array.isArray(values) ? values : []).forEach((value) => {
    const id = toNullableInt(value);
    if (id) {
      set.add(id);
    }
  });
  return Array.from(set);
};

const refreshBoqAvailability = async (tx, boqItemIds = []) => {
  const ids = uniqueBoqItemIds(boqItemIds);
  if (!ids.length) {
    return;
  }

  for (const boqItemId of ids) {
    const consumedResult = await new sql.Request(tx)
      .input("BoqItemId", sql.Int, boqItemId)
      .query(`
        SELECT SUM(Quantity) AS total
        FROM dbo.ConsumptionItems
        WHERE BoqItemId = @BoqItemId
      `);

    const consumed = Number(consumedResult.recordset?.[0]?.total ?? 0) || 0;

    const updateReq = new sql.Request(tx);
    updateReq.input("BoqItemId", sql.Int, boqItemId);
    updateReq.input("ConsumedQty", sql.Decimal(18, 2), consumed);
    await updateReq.query(`
      UPDATE dbo.BOQLineItems
      SET ConsumedQty = @ConsumedQty,
          AvailableQty = CASE
            WHEN Quantity - @ConsumedQty < 0 THEN 0
            ELSE Quantity - @ConsumedQty
          END
      WHERE LineItemId = @BoqItemId
    `);
  }
};

let deliveryChallanPk = "DeliveryChallanId";
let deliveryChallanItemsFk = "DeliveryChallanId";
let ensureDeliveryChallanTablesPromise = null;

const refreshDeliveryChallanPk = async () => {
  const pool = await getPool();
  const colsResult = await pool.request().query(`
    SELECT name AS ColumnName FROM sys.columns WHERE object_id = OBJECT_ID('dbo.DeliveryChallan')
  `);
  const cols = new Set((colsResult.recordset ?? []).map((row) => row.ColumnName));
  if (cols.has("DeliveryChallanId")) {
    deliveryChallanPk = "DeliveryChallanId";
  } else if (cols.has("Id")) {
    deliveryChallanPk = "Id";
  } else {
    deliveryChallanPk = "DeliveryChallanId";
  }
  return deliveryChallanPk;
};

const refreshDeliveryChallanItemsFk = async () => {
  const pool = await getPool();
  const colsResult = await pool.request().query(`
    SELECT name AS ColumnName FROM sys.columns WHERE object_id = OBJECT_ID('dbo.DeliveryChallanItems')
  `);
  const cols = new Set((colsResult.recordset ?? []).map((row) => row.ColumnName));
  if (cols.has("DeliveryChallanId")) {
    deliveryChallanItemsFk = "DeliveryChallanId";
  } else if (cols.has("DeliveryChallanID")) {
    deliveryChallanItemsFk = "DeliveryChallanID";
  } else if (cols.has("ChallanId")) {
    deliveryChallanItemsFk = "ChallanId";
  } else {
    deliveryChallanItemsFk = "DeliveryChallanId";
  }
  return deliveryChallanItemsFk;
};

const ensureDeliveryChallanTables = async () => {
  if (ensureDeliveryChallanTablesPromise) {
    return ensureDeliveryChallanTablesPromise;
  }

  ensureDeliveryChallanTablesPromise = (async () => {
    const pool = await getPool();

    await pool.request().query(`
      IF OBJECT_ID('dbo.DeliveryChallan', 'U') IS NULL
      BEGIN
        CREATE TABLE dbo.DeliveryChallan (
          DeliveryChallanId BIGINT IDENTITY(1,1) PRIMARY KEY,
          DCNumber NVARCHAR(100) NULL,
          ProjectId INT NULL,
          FromLocationId INT NULL,
          ToLocation NVARCHAR(200) NULL,
          VehicleNumber NVARCHAR(50) NULL,
          EWayBillNumber NVARCHAR(100) NULL,
          IssueDate DATE NULL,
          Status NVARCHAR(50) NULL,
          Notes NVARCHAR(MAX) NULL,
          CreatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
          UpdatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
        )
      END
    `);

    const challanColsResult = await pool.request().query(`
      SELECT name AS ColumnName FROM sys.columns WHERE object_id = OBJECT_ID('dbo.DeliveryChallan')
    `);
    const challanCols = new Set(
      (challanColsResult.recordset ?? []).map((row) => row.ColumnName)
    );
    const challanIdentity = await pool.request().query(`
      SELECT name AS ColumnName FROM sys.identity_columns
      WHERE OBJECT_NAME(object_id) = 'DeliveryChallan'
    `);
    const hasChallanIdentity = (challanIdentity.recordset ?? []).length > 0;

    if (
      !challanCols.has("DeliveryChallanId") &&
      !challanCols.has("Id") &&
      !hasChallanIdentity
    ) {
      await pool.request().query(`
        ALTER TABLE dbo.DeliveryChallan ADD DeliveryChallanId BIGINT IDENTITY(1,1);
        ALTER TABLE dbo.DeliveryChallan ADD CONSTRAINT PK_DeliveryChallan PRIMARY KEY (DeliveryChallanId);
      `);
    }

    await pool.request().query(`
      IF COL_LENGTH('dbo.DeliveryChallan', 'DCNumber') IS NULL
      BEGIN
        ALTER TABLE dbo.DeliveryChallan ADD DCNumber NVARCHAR(100) NULL;
      END;
      IF COL_LENGTH('dbo.DeliveryChallan', 'ProjectId') IS NULL
      BEGIN
        ALTER TABLE dbo.DeliveryChallan ADD ProjectId INT NULL;
      END;
      IF COL_LENGTH('dbo.DeliveryChallan', 'FromLocationId') IS NULL
      BEGIN
        ALTER TABLE dbo.DeliveryChallan ADD FromLocationId INT NULL;
      END;
      IF COL_LENGTH('dbo.DeliveryChallan', 'ToLocation') IS NULL
      BEGIN
        ALTER TABLE dbo.DeliveryChallan ADD ToLocation NVARCHAR(200) NULL;
      END;
      IF COL_LENGTH('dbo.DeliveryChallan', 'VehicleNumber') IS NULL
      BEGIN
        ALTER TABLE dbo.DeliveryChallan ADD VehicleNumber NVARCHAR(50) NULL;
      END;
      IF COL_LENGTH('dbo.DeliveryChallan', 'EWayBillNumber') IS NULL
      BEGIN
        ALTER TABLE dbo.DeliveryChallan ADD EWayBillNumber NVARCHAR(100) NULL;
      END;
      IF COL_LENGTH('dbo.DeliveryChallan', 'IssueDate') IS NULL
      BEGIN
        ALTER TABLE dbo.DeliveryChallan ADD IssueDate DATE NULL;
      END;
      IF COL_LENGTH('dbo.DeliveryChallan', 'Status') IS NULL
      BEGIN
        ALTER TABLE dbo.DeliveryChallan ADD Status NVARCHAR(50) NULL;
      END;
      IF COL_LENGTH('dbo.DeliveryChallan', 'Notes') IS NULL
      BEGIN
        ALTER TABLE dbo.DeliveryChallan ADD Notes NVARCHAR(MAX) NULL;
      END;
      IF COL_LENGTH('dbo.DeliveryChallan', 'CreatedAt') IS NULL
      BEGIN
        ALTER TABLE dbo.DeliveryChallan ADD CreatedAt DATETIME2 NOT NULL
          CONSTRAINT DF_DeliveryChallan_CreatedAt DEFAULT SYSUTCDATETIME();
      END;
      IF COL_LENGTH('dbo.DeliveryChallan', 'UpdatedAt') IS NULL
      BEGIN
        ALTER TABLE dbo.DeliveryChallan ADD UpdatedAt DATETIME2 NOT NULL
          CONSTRAINT DF_DeliveryChallan_UpdatedAt DEFAULT SYSUTCDATETIME();
      END;
    `);

    await pool.request().query(`
      IF OBJECT_ID('dbo.DeliveryChallanItems', 'U') IS NULL
      BEGIN
        CREATE TABLE dbo.DeliveryChallanItems (
          Id BIGINT IDENTITY(1,1) PRIMARY KEY,
          DeliveryChallanId BIGINT NOT NULL,
          ItemName NVARCHAR(200) NULL,
          Description NVARCHAR(500) NULL,
          Unit NVARCHAR(50) NULL,
          HSN NVARCHAR(50) NULL,
          GST NVARCHAR(100) NULL,
          Quantity DECIMAL(18,2) NOT NULL DEFAULT 0,
          Rate DECIMAL(18,2) NOT NULL DEFAULT 0,
          Notes NVARCHAR(500) NULL
        )
      END
    `);

    const itemColsResult = await pool.request().query(`
      SELECT name AS ColumnName FROM sys.columns WHERE object_id = OBJECT_ID('dbo.DeliveryChallanItems')
    `);
    const itemCols = new Set((itemColsResult.recordset ?? []).map((row) => row.ColumnName));
    const itemIdentity = await pool.request().query(`
      SELECT name AS ColumnName FROM sys.identity_columns
      WHERE OBJECT_NAME(object_id) = 'DeliveryChallanItems'
    `);
    const hasItemIdentity = (itemIdentity.recordset ?? []).length > 0;

    if (!itemCols.has("Id") && !hasItemIdentity) {
      await pool.request().query(`
        ALTER TABLE dbo.DeliveryChallanItems ADD Id BIGINT IDENTITY(1,1);
        ALTER TABLE dbo.DeliveryChallanItems ADD CONSTRAINT PK_DeliveryChallanItems PRIMARY KEY (Id);
      `);
    }

    await pool.request().query(`
      IF COL_LENGTH('dbo.DeliveryChallanItems', 'DeliveryChallanId') IS NULL
      BEGIN
        ALTER TABLE dbo.DeliveryChallanItems ADD DeliveryChallanId BIGINT NULL;
      END;
      IF COL_LENGTH('dbo.DeliveryChallanItems', 'ItemName') IS NULL
      BEGIN
        ALTER TABLE dbo.DeliveryChallanItems ADD ItemName NVARCHAR(200) NULL;
      END;
      IF COL_LENGTH('dbo.DeliveryChallanItems', 'Description') IS NULL
      BEGIN
        ALTER TABLE dbo.DeliveryChallanItems ADD Description NVARCHAR(500) NULL;
      END;
      IF COL_LENGTH('dbo.DeliveryChallanItems', 'Unit') IS NULL
      BEGIN
        ALTER TABLE dbo.DeliveryChallanItems ADD Unit NVARCHAR(50) NULL;
      END;
      IF COL_LENGTH('dbo.DeliveryChallanItems', 'HSN') IS NULL
      BEGIN
        ALTER TABLE dbo.DeliveryChallanItems ADD HSN NVARCHAR(50) NULL;
      END;
      IF COL_LENGTH('dbo.DeliveryChallanItems', 'GST') IS NULL
      BEGIN
        ALTER TABLE dbo.DeliveryChallanItems ADD GST NVARCHAR(100) NULL;
      END;
      IF COL_LENGTH('dbo.DeliveryChallanItems', 'Quantity') IS NULL
      BEGIN
        ALTER TABLE dbo.DeliveryChallanItems ADD Quantity DECIMAL(18,2) NOT NULL
          CONSTRAINT DF_DeliveryChallanItems_Quantity DEFAULT 0;
      END;
      IF COL_LENGTH('dbo.DeliveryChallanItems', 'Rate') IS NULL
      BEGIN
        ALTER TABLE dbo.DeliveryChallanItems ADD Rate DECIMAL(18,2) NOT NULL
          CONSTRAINT DF_DeliveryChallanItems_Rate DEFAULT 0;
      END;
      IF COL_LENGTH('dbo.DeliveryChallanItems', 'Notes') IS NULL
      BEGIN
        ALTER TABLE dbo.DeliveryChallanItems ADD Notes NVARCHAR(500) NULL;
      END;
    `);

    await refreshDeliveryChallanPk();
    await refreshDeliveryChallanItemsFk();
  })();

  try {
    await ensureDeliveryChallanTablesPromise;
  } catch (error) {
    ensureDeliveryChallanTablesPromise = null;
    throw error;
  }
};

let consumptionPk = "Id";
let consumptionItemsFk = "ConsumptionId";
let ensureConsumptionTablesPromise = null;

const refreshConsumptionPk = async () => {
  const pool = await getPool();
  const colsResult = await pool.request().query(`
    SELECT name AS ColumnName FROM sys.columns WHERE object_id = OBJECT_ID('dbo.Consumption')
  `);
  const cols = new Set((colsResult.recordset ?? []).map((row) => row.ColumnName));
  if (cols.has("Id")) {
    consumptionPk = "Id";
  } else if (cols.has("ConsumptionId")) {
    consumptionPk = "ConsumptionId";
  } else {
    consumptionPk = "Id";
  }
  return consumptionPk;
};

const refreshConsumptionItemsFk = async () => {
  const pool = await getPool();
  const colsResult = await pool.request().query(`
    SELECT name AS ColumnName FROM sys.columns WHERE object_id = OBJECT_ID('dbo.ConsumptionItems')
  `);
  const cols = new Set((colsResult.recordset ?? []).map((row) => row.ColumnName));
  if (cols.has("ConsumptionId")) {
    consumptionItemsFk = "ConsumptionId";
  } else if (cols.has("ConsumptionID")) {
    consumptionItemsFk = "ConsumptionID";
  } else if (cols.has("ParentId")) {
    consumptionItemsFk = "ParentId";
  } else {
    consumptionItemsFk = "ConsumptionId";
  }
  return consumptionItemsFk;
};

const ensureConsumptionTables = async () => {
  if (ensureConsumptionTablesPromise) {
    return ensureConsumptionTablesPromise;
  }

  ensureConsumptionTablesPromise = (async () => {
    const pool = await getPool();

    await pool.request().query(`
      IF OBJECT_ID('dbo.Consumption', 'U') IS NULL
      BEGIN
        CREATE TABLE dbo.Consumption (
          Id INT IDENTITY(1,1) PRIMARY KEY,
          ConsumptionNumber NVARCHAR(50) NULL,
          ProjectId INT NULL,
          LocationId INT NULL,
          ConsumptionDate DATE NULL,
          IssuedBy NVARCHAR(200) NULL,
          Status NVARCHAR(50) NULL,
          Notes NVARCHAR(MAX) NULL,
          CreatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
          UpdatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
        )
      END
    `);

    const consumptionColsResult = await pool.request().query(`
      SELECT name AS ColumnName FROM sys.columns WHERE object_id = OBJECT_ID('dbo.Consumption')
    `);
    const consumptionCols = new Set(
      (consumptionColsResult.recordset ?? []).map((row) => row.ColumnName)
    );
    const consumptionIdentity = await pool.request().query(`
      SELECT name AS ColumnName FROM sys.identity_columns
      WHERE OBJECT_NAME(object_id) = 'Consumption'
    `);
    const hasConsumptionIdentity = (consumptionIdentity.recordset ?? []).length > 0;

    if (
      !consumptionCols.has("Id") &&
      !consumptionCols.has("ConsumptionId") &&
      !hasConsumptionIdentity
    ) {
      await pool.request().query(`
        ALTER TABLE dbo.Consumption ADD Id INT IDENTITY(1,1);
        ALTER TABLE dbo.Consumption ADD CONSTRAINT PK_Consumption PRIMARY KEY (Id);
      `);
    }

    await pool.request().query(`
      IF COL_LENGTH('dbo.Consumption', 'ConsumptionNumber') IS NULL
      BEGIN
        ALTER TABLE dbo.Consumption ADD ConsumptionNumber NVARCHAR(50) NULL;
      END;
      IF COL_LENGTH('dbo.Consumption', 'ProjectId') IS NULL
      BEGIN
        ALTER TABLE dbo.Consumption ADD ProjectId INT NULL;
      END;
      IF COL_LENGTH('dbo.Consumption', 'LocationId') IS NULL
      BEGIN
        ALTER TABLE dbo.Consumption ADD LocationId INT NULL;
      END;
      IF COL_LENGTH('dbo.Consumption', 'ConsumptionDate') IS NULL
      BEGIN
        ALTER TABLE dbo.Consumption ADD ConsumptionDate DATE NULL;
      END;
      IF COL_LENGTH('dbo.Consumption', 'IssuedBy') IS NULL
      BEGIN
        ALTER TABLE dbo.Consumption ADD IssuedBy NVARCHAR(200) NULL;
      END;
      IF COL_LENGTH('dbo.Consumption', 'Status') IS NULL
      BEGIN
        ALTER TABLE dbo.Consumption ADD Status NVARCHAR(50) NULL;
      END;
      IF COL_LENGTH('dbo.Consumption', 'Notes') IS NULL
      BEGIN
        ALTER TABLE dbo.Consumption ADD Notes NVARCHAR(MAX) NULL;
      END;
      IF COL_LENGTH('dbo.Consumption', 'CreatedAt') IS NULL
      BEGIN
        ALTER TABLE dbo.Consumption ADD CreatedAt DATETIME2 NOT NULL
          CONSTRAINT DF_Consumption_CreatedAt DEFAULT SYSUTCDATETIME();
      END;
      IF COL_LENGTH('dbo.Consumption', 'UpdatedAt') IS NULL
      BEGIN
        ALTER TABLE dbo.Consumption ADD UpdatedAt DATETIME2 NOT NULL
          CONSTRAINT DF_Consumption_UpdatedAt DEFAULT SYSUTCDATETIME();
      END;
    `);

    await pool.request().query(`
      IF OBJECT_ID('dbo.ConsumptionItems', 'U') IS NULL
      BEGIN
        CREATE TABLE dbo.ConsumptionItems (
          Id INT IDENTITY(1,1) PRIMARY KEY,
          ConsumptionId INT NULL,
          BoqItemId INT NULL,
          Item NVARCHAR(200) NULL,
          Description NVARCHAR(500) NULL,
          Unit NVARCHAR(100) NULL,
          HSN NVARCHAR(50) NULL,
          GST NVARCHAR(100) NULL,
          Quantity DECIMAL(18,2) NOT NULL DEFAULT 0,
          Rate DECIMAL(18, 2) NOT NULL DEFAULT 0,
          Notes NVARCHAR(500) NULL
        )
      END
    `);

    const consumptionItemsColsResult = await pool.request().query(`
      SELECT name AS ColumnName FROM sys.columns WHERE object_id = OBJECT_ID('dbo.ConsumptionItems')
    `);
    const consumptionItemsCols = new Set(
      (consumptionItemsColsResult.recordset ?? []).map((row) => row.ColumnName)
    );
    const consumptionItemsIdentity = await pool.request().query(`
      SELECT name AS ColumnName FROM sys.identity_columns
      WHERE OBJECT_NAME(object_id) = 'ConsumptionItems'
    `);
    const hasConsumptionItemsIdentity =
      (consumptionItemsIdentity.recordset ?? []).length > 0;

    if (
      !consumptionItemsCols.has("Id") &&
      !consumptionItemsCols.has("ItemId") &&
      !hasConsumptionItemsIdentity
    ) {
      await pool.request().query(`
        ALTER TABLE dbo.ConsumptionItems ADD Id INT IDENTITY(1,1);
        ALTER TABLE dbo.ConsumptionItems ADD CONSTRAINT PK_ConsumptionItems PRIMARY KEY (Id);
      `);
    }

    await pool.request().query(`
      IF COL_LENGTH('dbo.ConsumptionItems', 'ConsumptionId') IS NULL
      BEGIN
        ALTER TABLE dbo.ConsumptionItems ADD ConsumptionId INT NULL;
      END;
      IF COL_LENGTH('dbo.ConsumptionItems', 'BoqItemId') IS NULL
      BEGIN
        ALTER TABLE dbo.ConsumptionItems ADD BoqItemId INT NULL;
      END;
      IF COL_LENGTH('dbo.ConsumptionItems', 'Item') IS NULL
      BEGIN
        ALTER TABLE dbo.ConsumptionItems ADD Item NVARCHAR(200) NULL;
      END;
      IF COL_LENGTH('dbo.ConsumptionItems', 'Description') IS NULL
      BEGIN
        ALTER TABLE dbo.ConsumptionItems ADD Description NVARCHAR(500) NULL;
      END;
      IF COL_LENGTH('dbo.ConsumptionItems', 'Unit') IS NULL
      BEGIN
        ALTER TABLE dbo.ConsumptionItems ADD Unit NVARCHAR(100) NULL;
      END;
      IF COL_LENGTH('dbo.ConsumptionItems', 'HSN') IS NULL
      BEGIN
        ALTER TABLE dbo.ConsumptionItems ADD HSN NVARCHAR(50) NULL;
      END;
      IF COL_LENGTH('dbo.ConsumptionItems', 'GST') IS NULL
      BEGIN
        ALTER TABLE dbo.ConsumptionItems ADD GST NVARCHAR(100) NULL;
      END;
      IF COL_LENGTH('dbo.ConsumptionItems', 'Quantity') IS NULL
      BEGIN
        ALTER TABLE dbo.ConsumptionItems ADD Quantity DECIMAL(18,2) NOT NULL
          CONSTRAINT DF_ConsumptionItems_Quantity DEFAULT 0;
      END;
      IF COL_LENGTH('dbo.ConsumptionItems', 'Rate') IS NULL
      BEGIN
        ALTER TABLE dbo.ConsumptionItems ADD Rate DECIMAL(18,2) NOT NULL
          CONSTRAINT DF_ConsumptionItems_Rate DEFAULT 0;
      END;
      IF COL_LENGTH('dbo.ConsumptionItems', 'Notes') IS NULL
      BEGIN
        ALTER TABLE dbo.ConsumptionItems ADD Notes NVARCHAR(500) NULL;
      END;
    `);

    await refreshConsumptionPk();
    await refreshConsumptionItemsFk();
  })();

  try {
    await ensureConsumptionTablesPromise;
  } catch (error) {
    ensureConsumptionTablesPromise = null;
    throw error;
  }
};

let reallocateInventoryPk = "Id";
let reallocateInventoryItemsFk = "TransferId";
let ensureReallocateInventoryTablesPromise = null;

const refreshReallocateInventoryPk = async () => {
  const pool = await getPool();
  const colsResult = await pool.request().query(`
    SELECT name AS ColumnName
    FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.ReallocateInventory')
  `);
  const colsByName = new Map(
    (colsResult.recordset ?? []).map((row) => {
      const actualName = String(row.ColumnName ?? "");
      return [actualName.toLowerCase(), actualName];
    })
  );
  reallocateInventoryPk =
    colsByName.get("id") ?? colsByName.get("transferid") ?? "Id";
  return reallocateInventoryPk;
};

const refreshReallocateInventoryItemsFk = async () => {
  const pool = await getPool();
  const colsResult = await pool.request().query(`
    SELECT name AS ColumnName
    FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.ReallocateInventoryItems')
  `);
  const colsByName = new Map(
    (colsResult.recordset ?? []).map((row) => {
      const actualName = String(row.ColumnName ?? "");
      return [actualName.toLowerCase(), actualName];
    })
  );
  reallocateInventoryItemsFk =
    colsByName.get("transferid") ??
    colsByName.get("reallocateinventoryid") ??
    colsByName.get("reallocationid") ??
    "TransferId";
  return reallocateInventoryItemsFk;
};

const ensureReallocateInventoryTables = async () => {
  if (ensureReallocateInventoryTablesPromise) {
    return ensureReallocateInventoryTablesPromise;
  }

  ensureReallocateInventoryTablesPromise = (async () => {
    const pool = await getPool();

    await pool.request().query(`
      IF OBJECT_ID('dbo.ReallocateInventory', 'U') IS NULL
      BEGIN
        CREATE TABLE dbo.ReallocateInventory (
          Id INT IDENTITY(1,1) PRIMARY KEY,
          FromLocationId INT NULL,
          ToLocationId INT NULL,
          TransferDate DATETIME NULL,
          Notes NVARCHAR(1000) NULL
        )
      END
    `);

    await pool.request().query(`
      IF COL_LENGTH('dbo.ReallocateInventory', 'FromLocationId') IS NULL
      BEGIN
        ALTER TABLE dbo.ReallocateInventory ADD FromLocationId INT NULL;
      END;
      IF COL_LENGTH('dbo.ReallocateInventory', 'ToLocationId') IS NULL
      BEGIN
        ALTER TABLE dbo.ReallocateInventory ADD ToLocationId INT NULL;
      END;
      IF COL_LENGTH('dbo.ReallocateInventory', 'TransferDate') IS NULL
      BEGIN
        ALTER TABLE dbo.ReallocateInventory ADD TransferDate DATETIME NULL;
      END;
      IF COL_LENGTH('dbo.ReallocateInventory', 'Notes') IS NULL
      BEGIN
        ALTER TABLE dbo.ReallocateInventory ADD Notes NVARCHAR(1000) NULL;
      END;
    `);

    await pool.request().query(`
      IF OBJECT_ID('dbo.ReallocateInventoryItems', 'U') IS NULL
      BEGIN
        CREATE TABLE dbo.ReallocateInventoryItems (
          Id INT IDENTITY(1,1) PRIMARY KEY,
          TransferId INT NULL,
          Item NVARCHAR(200) NULL,
          Description NVARCHAR(500) NULL,
          Unit NVARCHAR(100) NULL,
          Quantity DECIMAL(18,2) NOT NULL DEFAULT 0
        )
      END
    `);

    await pool.request().query(`
      IF COL_LENGTH('dbo.ReallocateInventoryItems', 'TransferId') IS NULL
      BEGIN
        ALTER TABLE dbo.ReallocateInventoryItems ADD TransferId INT NULL;
      END;
      IF COL_LENGTH('dbo.ReallocateInventoryItems', 'Item') IS NULL
      BEGIN
        ALTER TABLE dbo.ReallocateInventoryItems ADD Item NVARCHAR(200) NULL;
      END;
      IF COL_LENGTH('dbo.ReallocateInventoryItems', 'Description') IS NULL
      BEGIN
        ALTER TABLE dbo.ReallocateInventoryItems ADD Description NVARCHAR(500) NULL;
      END;
      IF COL_LENGTH('dbo.ReallocateInventoryItems', 'Unit') IS NULL
      BEGIN
        ALTER TABLE dbo.ReallocateInventoryItems ADD Unit NVARCHAR(100) NULL;
      END;
      IF COL_LENGTH('dbo.ReallocateInventoryItems', 'Quantity') IS NULL
      BEGIN
        ALTER TABLE dbo.ReallocateInventoryItems
          ADD Quantity DECIMAL(18,2) NOT NULL
          CONSTRAINT DF_ReallocateInventoryItems_Quantity DEFAULT 0;
      END;
    `);

    await refreshReallocateInventoryPk();
    await refreshReallocateInventoryItemsFk();
  })();

  try {
    await ensureReallocateInventoryTablesPromise;
  } catch (error) {
    ensureReallocateInventoryTablesPromise = null;
    throw error;
  }
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
    const itemSchema = await resolveItemsSchema();

    const result = await pool.request().query(`
      SELECT
        ${buildIdCoalesceExpr(itemSchema.idColumns)} AS [id],
        ${buildTextCoalesceExpr(itemSchema.nameColumns)} AS [name],
        ${buildTextCoalesceExpr(itemSchema.categoryColumns)} AS [category],
        ${buildTextCoalesceExpr(itemSchema.hsnColumns)} AS [hsn],
        ${buildNumberCoalesceExpr(itemSchema.stockColumns)} AS [stock],
        ${buildNumberCoalesceExpr(itemSchema.priceColumns)} AS [price],
        ${buildTextCoalesceExpr(itemSchema.gstColumns)} AS [gst],
        ${buildTextCoalesceExpr(itemSchema.descriptionColumns)} AS [description],
        ${buildDateCoalesceExpr(itemSchema.createdAtColumns)} AS [createdAt],
        ${buildDateCoalesceExpr(itemSchema.updatedAtColumns)} AS [updatedAt]
      FROM dbo.Items
      ORDER BY ${
        itemSchema.sortColumn
          ? `${toIdentifier(itemSchema.sortColumn)} ${
              itemSchema.sortColumn === itemSchema.idColumn ? "DESC" : "ASC"
            }`
          : "(SELECT NULL)"
      }
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
    const itemSchema = await resolveItemsSchema();
    const request = pool
      .request()
      .input("Name", sql.NVarChar(255), String(name).trim())
      .input("Category", sql.NVarChar(100), String(category ?? "").trim())
      .input("HSN", sql.NVarChar(50), String(hsn ?? "").trim())
      .input("Stock", sql.Int, validStock)
      .input("Price", sql.Decimal(18, 2), validPrice)
      .input("GST", sql.NVarChar(100), String(gst ?? "").trim())
      .input("Description", sql.NVarChar(sql.MAX), String(description ?? "").trim())
      .input("Now", sql.DateTime2, new Date());

    const insertColumns = [];
    const insertValues = [];
    const usedColumns = new Set();
    const addInsertFields = (columns, paramName) => {
      for (const column of uniqueColumnNames(columns)) {
        const normalized = column.toLowerCase();
        if (usedColumns.has(normalized)) {
          continue;
        }
        usedColumns.add(normalized);
        insertColumns.push(toIdentifier(column));
        insertValues.push(`@${paramName}`);
      }
    };

    addInsertFields(itemSchema.nameColumns, "Name");
    addInsertFields(itemSchema.categoryColumns, "Category");
    addInsertFields(itemSchema.hsnColumns, "HSN");
    addInsertFields(itemSchema.stockColumns, "Stock");
    addInsertFields(itemSchema.priceColumns, "Price");
    addInsertFields(itemSchema.gstColumns, "GST");
    addInsertFields(itemSchema.descriptionColumns, "Description");
    addInsertFields(itemSchema.createdAtColumns, "Now");
    addInsertFields(itemSchema.updatedAtColumns, "Now");

    if (!insertColumns.length) {
      throw new Error("Items table has no writable columns");
    }

    const result = await request.query(`
      INSERT INTO dbo.Items (${insertColumns.join(", ")})
      OUTPUT INSERTED.*
      VALUES (${insertValues.join(", ")})
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
    const itemSchema = await resolveItemsSchema();
    if (!itemSchema.idColumn) {
      throw new Error("Items table is missing a primary id column");
    }
    if (!itemSchema.stockColumns.length) {
      throw new Error("Items table is missing a stock column");
    }

    const setClauses = uniqueColumnNames(itemSchema.stockColumns).map(
      (column) => `${toIdentifier(column)} = @Stock`
    );
    for (const column of uniqueColumnNames(itemSchema.updatedAtColumns)) {
      setClauses.push(`${toIdentifier(column)} = @Now`);
    }

    const result = await pool
      .request()
      .input("ItemId", sql.BigInt, id)
      .input("Stock", sql.Int, stock)
      .input("Now", sql.DateTime2, new Date())
      .query(`
        UPDATE dbo.Items
        SET ${setClauses.join(", ")}
        OUTPUT INSERTED.*
        WHERE ${toIdentifier(itemSchema.idColumn)} = @ItemId
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
    const itemSchema = await resolveItemsSchema();
    if (!itemSchema.idColumn) {
      throw new Error("Items table is missing a primary id column");
    }

    const result = await pool
      .request()
      .input("ItemId", sql.BigInt, id)
      .query(`
        DELETE FROM dbo.Items
        OUTPUT DELETED.${toIdentifier(itemSchema.idColumn)} AS deletedItemId
        WHERE ${toIdentifier(itemSchema.idColumn)} = @ItemId
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
    const existing = await pool
      .request()
      .input("ProjectId", sql.Int, id)
      .query(`SELECT ProjectId FROM dbo.Projects WHERE ProjectId = @ProjectId`);
    if (!existing.recordset?.length) {
      return res.status(404).json({ ok: false, error: "Project not found" });
    }

    const dependencyCounts = await loadProjectDependencyCounts(pool, id);
    const dependencySummary = buildProjectDependencySummary(dependencyCounts);
    if (dependencySummary) {
      return res.status(409).json({
        ok: false,
        error: `Project cannot be deleted because it is used by ${dependencySummary}. Remove or reassign those records before deleting.`,
        conflicts: dependencyCounts,
      });
    }

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
    if (isSqlForeignKeyViolation(error)) {
      return res.status(409).json({
        ok: false,
        error:
          "Project cannot be deleted because it is referenced by other records. Remove or reassign those records before deleting.",
      });
    }
    return res.status(500).json({
      ok: false,
      error: error?.message ?? "Failed to delete project",
    });
  }
});

app.get("/api/locations", async (_req, res) => {
  try {
    await ensureLocationsTable();
    const pool = await getPool();
    const result = await pool.request().query(`
      SELECT *
      FROM dbo.Locations
      ORDER BY LocationId DESC
    `);
    return res.json({
      ok: true,
      locations: (result.recordset ?? []).map(normalizeLocation),
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error?.message ?? "Failed to fetch locations",
    });
  }
});

app.post("/api/locations", async (req, res) => {
  try {
    await ensureLocationsTable();
    const {
      name,
      code,
      type,
      projectId,
      manager,
      phone,
      address,
      status,
      Name,
      Code,
      Type,
      ProjectId,
      Manager,
      Phone,
      Address,
      Status,
    } = req.body ?? {};

    const nextName = normalizeOptionalString(name ?? Name);
    if (!nextName) {
      return res.status(400).json({ ok: false, error: "Location name is required" });
    }

    const nextCode = normalizeOptionalString(code ?? Code);
    const nextType = normalizeOptionalString(type ?? Type);
    const nextProjectId = toNullableInt(projectId ?? ProjectId);
    const nextManager = normalizeOptionalString(manager ?? Manager);
    const nextPhone = normalizeOptionalString(phone ?? Phone);
    const nextAddress = normalizeOptionalString(address ?? Address);
    const nextStatus = normalizeOptionalString(status ?? Status) ?? "Active";

    const pool = await getPool();
    const result = await pool
      .request()
      .input("Name", sql.NVarChar(255), nextName)
      .input("Code", sql.NVarChar(50), nextCode)
      .input("Type", sql.NVarChar(50), nextType)
      .input("ProjectId", sql.Int, nextProjectId)
      .input("Manager", sql.NVarChar(100), nextManager)
      .input("Phone", sql.NVarChar(50), nextPhone)
      .input("Address", sql.NVarChar(sql.MAX), nextAddress)
      .input("Status", sql.NVarChar(50), nextStatus)
      .query(`
        INSERT INTO dbo.Locations
          (Name, Code, Type, ProjectId, Manager, Phone, Address, Status)
        OUTPUT INSERTED.*
        VALUES
          (@Name, @Code, @Type, @ProjectId, @Manager, @Phone, @Address, @Status)
      `);

    return res.status(201).json({
      ok: true,
      location: normalizeLocation(result.recordset?.[0] ?? {}),
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error?.message ?? "Failed to create location",
    });
  }
});

app.put("/api/locations/:id", async (req, res) => {
  try {
    await ensureLocationsTable();
    const id = Number.parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ ok: false, error: "Invalid location id" });
    }

    const {
      name,
      code,
      type,
      projectId,
      manager,
      phone,
      address,
      status,
      Name,
      Code,
      Type,
      ProjectId,
      Manager,
      Phone,
      Address,
      Status,
    } = req.body ?? {};

    const hasName = name !== undefined || Name !== undefined;
    const hasCode = code !== undefined || Code !== undefined;
    const hasType = type !== undefined || Type !== undefined;
    const hasProjectId = projectId !== undefined || ProjectId !== undefined;
    const hasManager = manager !== undefined || Manager !== undefined;
    const hasPhone = phone !== undefined || Phone !== undefined;
    const hasAddress = address !== undefined || Address !== undefined;
    const hasStatus = status !== undefined || Status !== undefined;

    const nextName = hasName ? normalizeOptionalString(name ?? Name) : undefined;
    if (hasName && !nextName) {
      return res.status(400).json({ ok: false, error: "Location name is required" });
    }

    const nextCode = hasCode ? normalizeOptionalString(code ?? Code) : undefined;
    const nextType = hasType ? normalizeOptionalString(type ?? Type) : undefined;
    const nextProjectId = hasProjectId ? toNullableInt(projectId ?? ProjectId) : undefined;
    const nextManager = hasManager ? normalizeOptionalString(manager ?? Manager) : undefined;
    const nextPhone = hasPhone ? normalizeOptionalString(phone ?? Phone) : undefined;
    const nextAddress = hasAddress ? normalizeOptionalString(address ?? Address) : undefined;
    const nextStatus = hasStatus ? normalizeOptionalString(status ?? Status) : undefined;

    const pool = await getPool();
    const existingResult = await pool
      .request()
      .input("LocationId", sql.Int, id)
      .query(`SELECT * FROM dbo.Locations WHERE LocationId = @LocationId`);

    const existing = existingResult.recordset?.[0];
    if (!existing) {
      return res.status(404).json({ ok: false, error: "Location not found" });
    }

    const finalName = nextName ?? existing.Name;
    const finalCode = hasCode ? nextCode : existing.Code;
    const finalType = hasType ? nextType : existing.Type;
    const finalProjectId = hasProjectId ? nextProjectId : existing.ProjectId;
    const finalManager = hasManager ? nextManager : existing.Manager;
    const finalPhone = hasPhone ? nextPhone : existing.Phone;
    const finalAddress = hasAddress ? nextAddress : existing.Address;
    const finalStatus = hasStatus ? nextStatus : existing.Status;

    const result = await pool
      .request()
      .input("LocationId", sql.Int, id)
      .input("Name", sql.NVarChar(255), finalName)
      .input("Code", sql.NVarChar(50), finalCode)
      .input("Type", sql.NVarChar(50), finalType)
      .input("ProjectId", sql.Int, finalProjectId)
      .input("Manager", sql.NVarChar(100), finalManager)
      .input("Phone", sql.NVarChar(50), finalPhone)
      .input("Address", sql.NVarChar(sql.MAX), finalAddress)
      .input("Status", sql.NVarChar(50), finalStatus)
      .query(`
        UPDATE dbo.Locations
        SET Name = @Name,
            Code = @Code,
            Type = @Type,
            ProjectId = @ProjectId,
            Manager = @Manager,
            Phone = @Phone,
            Address = @Address,
            Status = @Status,
            UpdatedAt = SYSUTCDATETIME()
        OUTPUT INSERTED.*
        WHERE LocationId = @LocationId
      `);

    return res.json({
      ok: true,
      location: normalizeLocation(result.recordset?.[0] ?? {}),
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error?.message ?? "Failed to update location",
    });
  }
});

app.delete("/api/locations/:id", async (req, res) => {
  try {
    await ensureLocationsTable();
    const id = Number.parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ ok: false, error: "Invalid location id" });
    }

    const pool = await getPool();
    const result = await pool
      .request()
      .input("LocationId", sql.Int, id)
      .query(`
        DELETE FROM dbo.Locations
        OUTPUT DELETED.LocationId
        WHERE LocationId = @LocationId
      `);

    if (!result.recordset?.length) {
      return res.status(404).json({ ok: false, error: "Location not found" });
    }

    return res.json({ ok: true });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error?.message ?? "Failed to delete location",
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
    const data = (ordersResult.recordset ?? []).map((row) => {
      const items = itemsByOrder[row.Id] ?? [];
      const computedTotal = items.reduce(
        (sum, item) => sum + Number(item.totalPrice || 0),
        0
      );
      return {
        ...normalizePurchaseOrder(row),
        items,
        total: computedTotal || Number(row.Total ?? row.total ?? 0) || 0,
      };
    });
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
    const total =
      items.reduce((sum, item) => sum + Number(item.totalPrice || 0), 0) ||
      Number(orderRow.Total ?? orderRow.total ?? 0) ||
      0;

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
    poNumber = null,
    projectId = null,
    vendorId = null,
    locationId = null,
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

  let tx;
  try {
    await ensurePurchaseTables();
    const pool = await getPool();
    tx = pool.transaction();
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
    const parsedExpected = parseDateInput(expectedDate);
    const parsedExpectedDelivery = parseDateInput(expectedDeliveryDate ?? expectedDate);
    insertOrder.input("ExpectedDate", sql.Date, parsedExpected ?? parsedExpectedDelivery ?? null);
    insertOrder.input("ExpectedDeliveryDate", sql.Date, parsedExpectedDelivery ?? null);
    insertOrder.input("Notes", sql.NVarChar(sql.MAX), notes || null);

    const orderResult = await insertOrder.query(`
      INSERT INTO PurchaseOrders
        (PONumber, ProjectId, VendorId, LocationId, Status, OrderDate, ExpectedDate, ExpectedDeliveryDate, Notes, Total)
      OUTPUT INSERTED.*
      VALUES (@PONumber, @ProjectId, @VendorId, @LocationId, @Status, @OrderDate, @ExpectedDate, @ExpectedDeliveryDate, @Notes, 0)
    `);

    const orderRow = orderResult.recordset?.[0];
    const orderId = orderRow?.Id;

    let total = 0;
    try {
      const colCheck = await new sql.Request(tx).query(`
        SELECT name AS ColumnName FROM sys.columns WHERE object_id = OBJECT_ID('dbo.PurchaseOrderItems')
      `);
      const cols = new Set(colCheck.recordset.map((r) => r.ColumnName));
      const hasPoId = cols.has("PurchaseOrderId");
      const nameCol = cols.has("ItemName") ? "ItemName" : cols.has("Name") ? "Name" : null;
      const qtyCol = cols.has("Quantity") ? "Quantity" : cols.has("Qty") ? "Qty" : null;
      const unitPriceCol = cols.has("UnitPrice")
        ? "UnitPrice"
        : cols.has("Rate")
        ? "Rate"
        : cols.has("Price")
        ? "Price"
        : null;
      const totalCol = cols.has("TotalPrice") ? "TotalPrice" : cols.has("Total") ? "Total" : null;
      const unitCol = cols.has("Unit") ? "Unit" : null;
      const notesCol = cols.has("Notes") ? "Notes" : null;
      const itemIdCol = cols.has("ItemId") ? "ItemId" : null;
      const descCol = cols.has("Description") ? "Description" : null;
      const hsnCol = cols.has("HSN") ? "HSN" : cols.has("Hsn") ? "Hsn" : null;
      const gstCol = cols.has("GST") ? "GST" : cols.has("Gst") ? "Gst" : null;

      const canInsert = hasPoId && nameCol && qtyCol && unitPriceCol;

      if (canInsert) {
        for (const item of safeItems) {
          const qty = Number(item.quantity ?? item.qty ?? 0) || 0;
          const unitPrice = Number(item.unitPrice ?? item.rate ?? item.UnitPrice ?? 0) || 0;
          const lineTotal = qty * unitPrice;
          total += lineTotal;

          const req = new sql.Request(tx);
          req.input("PurchaseOrderId", sql.Int, orderId);
          req.input("ItemId", sql.Int, item.itemId ?? null);
          req.input("Name", sql.NVarChar(255), item.name ?? "");
          req.input("Desc", sql.NVarChar(sql.MAX), item.description ?? null);
          req.input("Qty", sql.Decimal(18, 2), qty);
          req.input("UnitPrice", sql.Decimal(18, 2), unitPrice);
          req.input("Total", sql.Decimal(18, 2), lineTotal);
          req.input("Unit", sql.NVarChar(50), item.unit ?? "PCS");
          req.input(
            "HSN",
            sql.NVarChar(50),
            normalizeOptionalString(item.hsn ?? item.HSN ?? item.hsnCode ?? item.HSNCode) ??
              null
          );
          req.input(
            "GST",
            sql.NVarChar(100),
            normalizeOptionalString(item.gst ?? item.GST ?? item.gstRate ?? item.GSTRate) ??
              null
          );
          const lineLocation = normalizeOptionalString(
            item.location ?? item.Location ?? item.notes ?? item.Notes
          );
          req.input("Notes", sql.NVarChar(sql.MAX), lineLocation ?? null);

          const colsToUse = [
            "PurchaseOrderId",
            itemIdCol ? "ItemId" : null,
            nameCol,
            descCol,
            hsnCol,
            gstCol,
            qtyCol,
            unitPriceCol,
            totalCol,
            unitCol,
            notesCol,
          ].filter(Boolean);

          const values = colsToUse.map((c) => {
            if (c === "PurchaseOrderId") return "@PurchaseOrderId";
            if (c === "ItemId") return "@ItemId";
            if (c === nameCol) return "@Name";
            if (c === descCol) return "@Desc";
            if (c === hsnCol) return "@HSN";
            if (c === gstCol) return "@GST";
            if (c === qtyCol) return "@Qty";
            if (c === unitPriceCol) return "@UnitPrice";
            if (c === totalCol) return "@Total";
            if (c === unitCol) return "@Unit";
            if (c === notesCol) return "@Notes";
            return "@Value";
          });

          await req.query(
            `INSERT INTO PurchaseOrderItems (${colsToUse.join(", ")}) VALUES (${values.join(", ")})`
          );
        }
      }
    } catch {
      // If items table/schema differs, skip items but keep PO header.
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
    await rollbackTx(tx);
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
    poNumber = null,
    projectId = null,
    vendorId = null,
    locationId = null,
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

  let tx;
  try {
    await ensurePurchaseTables();
    const pool = await getPool();
    tx = pool.transaction();
    await tx.begin();

    const updateOrder = new sql.Request(tx);
    updateOrder.input("Id", sql.Int, id);
    updateOrder.input("PONumber", sql.NVarChar(100), normalizeOptionalString(poNumber));
    updateOrder.input("ProjectId", sql.Int, projectId ?? null);
    updateOrder.input("VendorId", sql.Int, vendorId ?? null);
    updateOrder.input("LocationId", sql.Int, locationId ?? null);
    updateOrder.input("Status", sql.NVarChar(50), status || "Draft");
    updateOrder.input("OrderDate", sql.Date, parseDateInput(orderDate) || null);
    const parsedExpected = parseDateInput(expectedDate);
    const parsedExpectedDelivery = parseDateInput(expectedDeliveryDate ?? expectedDate);
    updateOrder.input("ExpectedDate", sql.Date, parsedExpected ?? parsedExpectedDelivery ?? null);
    updateOrder.input("ExpectedDeliveryDate", sql.Date, parsedExpectedDelivery ?? null);
    updateOrder.input("Notes", sql.NVarChar(sql.MAX), notes || null);

    const orderResult = await updateOrder.query(`
      UPDATE PurchaseOrders
      SET PONumber = COALESCE(@PONumber, PONumber),
          ProjectId = @ProjectId,
          VendorId = @VendorId,
          LocationId = @LocationId,
          Status = @Status,
          OrderDate = @OrderDate,
          ExpectedDate = @ExpectedDate,
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
    try {
      const colCheck = await new sql.Request(tx).query(`
        SELECT name AS ColumnName FROM sys.columns WHERE object_id = OBJECT_ID('dbo.PurchaseOrderItems')
      `);
      const cols = new Set(colCheck.recordset.map((r) => r.ColumnName));
      const hasPoId = cols.has("PurchaseOrderId");
      const nameCol = cols.has("ItemName") ? "ItemName" : cols.has("Name") ? "Name" : null;
      const qtyCol = cols.has("Quantity") ? "Quantity" : cols.has("Qty") ? "Qty" : null;
      const unitPriceCol = cols.has("UnitPrice")
        ? "UnitPrice"
        : cols.has("Rate")
        ? "Rate"
        : cols.has("Price")
        ? "Price"
        : null;
      const totalCol = cols.has("TotalPrice") ? "TotalPrice" : cols.has("Total") ? "Total" : null;
      const unitCol = cols.has("Unit") ? "Unit" : null;
      const notesCol = cols.has("Notes") ? "Notes" : null;
      const itemIdCol = cols.has("ItemId") ? "ItemId" : null;
      const descCol = cols.has("Description") ? "Description" : null;

      const canInsert = hasPoId && nameCol && qtyCol && unitPriceCol;

      if (canInsert) {
        for (const item of safeItems) {
          const qty = Number(item.quantity ?? item.qty ?? 0) || 0;
          const unitPrice = Number(item.unitPrice ?? item.rate ?? item.UnitPrice ?? 0) || 0;
          const lineTotal = qty * unitPrice;
          total += lineTotal;

          const req = new sql.Request(tx);
          req.input("PurchaseOrderId", sql.Int, id);
          req.input("ItemId", sql.Int, item.itemId ?? null);
          req.input("Name", sql.NVarChar(255), item.name ?? "");
          req.input("Desc", sql.NVarChar(sql.MAX), item.description ?? null);
          req.input("Qty", sql.Decimal(18, 2), qty);
          req.input("UnitPrice", sql.Decimal(18, 2), unitPrice);
          req.input("Total", sql.Decimal(18, 2), lineTotal);
          req.input("Unit", sql.NVarChar(50), item.unit ?? "PCS");
          req.input(
            "HSN",
            sql.NVarChar(50),
            normalizeOptionalString(item.hsn ?? item.HSN ?? item.hsnCode ?? item.HSNCode) ??
              null
          );
          req.input(
            "GST",
            sql.NVarChar(100),
            normalizeOptionalString(item.gst ?? item.GST ?? item.gstRate ?? item.GSTRate) ??
              null
          );
          const lineLocation = normalizeOptionalString(
            item.location ?? item.Location ?? item.notes ?? item.Notes
          );
          req.input("Notes", sql.NVarChar(sql.MAX), lineLocation ?? null);

          const colsToUse = [
            "PurchaseOrderId",
            itemIdCol ? "ItemId" : null,
            nameCol,
            descCol,
            hsnCol,
            gstCol,
            qtyCol,
            unitPriceCol,
            totalCol,
            unitCol,
            notesCol,
          ].filter(Boolean);

          const values = colsToUse.map((c) => {
            if (c === "PurchaseOrderId") return "@PurchaseOrderId";
            if (c === "ItemId") return "@ItemId";
            if (c === nameCol) return "@Name";
            if (c === descCol) return "@Desc";
            if (c === hsnCol) return "@HSN";
            if (c === gstCol) return "@GST";
            if (c === qtyCol) return "@Qty";
            if (c === unitPriceCol) return "@UnitPrice";
            if (c === totalCol) return "@Total";
            if (c === unitCol) return "@Unit";
            if (c === notesCol) return "@Notes";
            return "@Value";
          });

          await req.query(
            `INSERT INTO PurchaseOrderItems (${colsToUse.join(", ")}) VALUES (${values.join(", ")})`
          );
        }
      }
    } catch {
      // ignore item insert errors; we still return header
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
    await rollbackTx(tx);
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

  let tx;
  try {
    await ensurePurchaseTables();
    const pool = await getPool();
    tx = pool.transaction();
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
    await rollbackTx(tx);
    return res.status(500).json({
      ok: false,
      error: error?.message ?? "Failed to delete purchase order",
    });
  }
});

app.get("/api/receive-goods", async (req, res) => {
  try {
    if (ensureSchemaOnRequest) {
      await ensureReceiveTables();
    }
    const receivePk = await refreshReceiveGoodsPk();
    const pool = await getPool();

    const poFilter = Number.parseInt(req.query.purchaseOrderId, 10);
    const hasPoFilter = Number.isFinite(poFilter);

    const receiptsReq = pool.request();
    const itemsReq = pool.request();
    if (hasPoFilter) {
      receiptsReq.input("PurchaseOrderId", sql.Int, poFilter);
      itemsReq.input("PurchaseOrderId", sql.Int, poFilter);
    }

    const receiptsResult = await receiptsReq.query(
      hasPoFilter
        ? `SELECT * FROM dbo.ReceiveGoods WHERE PurchaseOrderId = @PurchaseOrderId ORDER BY ${receivePk} DESC`
        : `SELECT * FROM dbo.ReceiveGoods ORDER BY ${receivePk} DESC`
    );

    const itemsResult = await itemsReq.query(
      hasPoFilter
        ? `SELECT * FROM dbo.ReceiveGoodsItems WHERE PurchaseOrderId = @PurchaseOrderId`
        : `SELECT * FROM dbo.ReceiveGoodsItems`
    );

    const itemsByReceipt = (itemsResult.recordset ?? []).reduce(
      (acc, row) => {
        const normalized = normalizeReceiveGoodsItem(row);
        if (!normalized.receiveGoodsId) {
          return acc;
        }
        if (!acc[normalized.receiveGoodsId]) {
          acc[normalized.receiveGoodsId] = [];
        }
        acc[normalized.receiveGoodsId].push(normalized);
        return acc;
      },
      {}
    );

    const data = (receiptsResult.recordset ?? []).map((row) => {
      const normalized = normalizeReceiveGoods(row);
      return {
        ...normalized,
        items: itemsByReceipt[normalized.receiveGoodsId] ?? [],
      };
    });

    return res.json({ ok: true, receipts: data });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error?.message ?? "Failed to fetch receipts",
    });
  }
});

app.get("/api/receive-goods/:id", async (req, res) => {
  const id = Number.parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) {
    return res.status(400).json({ ok: false, error: "Invalid receive goods id" });
  }

  try {
    if (ensureSchemaOnRequest) {
      await ensureReceiveTables();
    }
    const receivePk = await refreshReceiveGoodsPk();
    const fkCol = await refreshReceiveGoodsItemsFk();
    const pool = await getPool();
    const receiptResult = await pool
      .request()
      .input("ReceiptId", sql.Int, id)
      .query(
        `SELECT * FROM dbo.ReceiveGoods WHERE ${receivePk} = @ReceiptId`
      );

    const receiptRow = receiptResult.recordset?.[0];
    if (!receiptRow) {
      return res.status(404).json({ ok: false, error: "Receipt not found" });
    }

    const itemsResult = await pool
      .request()
      .input("ReceiptId", sql.Int, id)
      .query(
        `SELECT * FROM dbo.ReceiveGoodsItems WHERE ${fkCol} = @ReceiptId`
      );

    return res.json({
      ok: true,
      receipt: {
        ...normalizeReceiveGoods(receiptRow),
        items: (itemsResult.recordset ?? []).map(normalizeReceiveGoodsItem),
      },
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error?.message ?? "Failed to fetch receipt",
    });
  }
});

app.post("/api/receive-goods", async (req, res) => {
  const {
    purchaseOrderId,
    projectId = null,
    vendorId = null,
    locationId = null,
    receivedDate = null,
    receivedBy = null,
    notes = null,
    items = [],
    status = null,
  } = req.body ?? {};

  const poId = Number.parseInt(purchaseOrderId, 10);
  if (!Number.isFinite(poId)) {
    return res.status(400).json({
      ok: false,
      error: "purchaseOrderId is required",
    });
  }
  const safeProjectId = toNullableInt(projectId);
  const safeVendorId = toNullableInt(vendorId);
  const safeLocationId = toNullableInt(locationId);

  const normalizedItems = (Array.isArray(items) ? items : []).map((item) => {
    const orderedQty =
      Number(item.orderedQty ?? item.OrderedQty ?? item.quantity ?? 0) || 0;
    let receivedQty =
      Number(item.receivedQty ?? item.ReceivedQty ?? item.received ?? 0) || 0;
    if (receivedQty < 0 || Number.isNaN(receivedQty)) {
      receivedQty = 0;
    }
    const cappedReceived =
      orderedQty > 0 ? Math.min(receivedQty, orderedQty) : receivedQty;
    return {
      itemId: toNullableInt(item.itemId ?? item.ItemId ?? null),
      name: normalizeOptionalString(item.name ?? item.Name ?? item.itemName) ?? null,
      description:
        normalizeOptionalString(item.description ?? item.Description) ?? null,
      unit: normalizeOptionalString(item.unit ?? item.Unit) ?? "PCS",
      itemNotes: normalizeOptionalString(item.notes ?? item.Notes) ?? null,
      orderedQty,
      receivedQty: cappedReceived,
      balanceQty: Math.max(orderedQty - cappedReceived, 0),
    };
  });

  const hasItems = normalizedItems.some(
    (item) => item.orderedQty > 0 || item.receivedQty > 0
  );
  if (!hasItems) {
    return res.status(400).json({
      ok: false,
      error: "At least one line item is required",
    });
  }

  const parsedDate = parseDateInput(receivedDate);
  if (Number.isNaN(parsedDate)) {
    return res.status(400).json({
      ok: false,
      error: "Invalid receivedDate",
    });
  }

  let tx;
  try {
    if (ensureSchemaOnRequest) {
      await ensurePurchaseTables();
      await ensureReceiveTables();
    }
    const receivePk = await refreshReceiveGoodsPk();
    const fkCol = await refreshReceiveGoodsItemsFk();
    const pool = await getPool();
    tx = pool.transaction();
    await tx.begin();

    const poResult = await new sql.Request(tx)
      .input("Id", sql.Int, poId)
      .query(`SELECT TOP 1 * FROM PurchaseOrders WHERE Id = @Id`);
    const poRow = poResult.recordset?.[0] ?? null;

    if (!poRow) {
      await tx.rollback();
      return res.status(404).json({
        ok: false,
        error: "Purchase order not found",
      });
    }

    const receiptStatus = status || computeReceiveStatus(normalizedItems, poRow?.Status ?? "Draft");

    const existingResult = await new sql.Request(tx)
      .input("PurchaseOrderId", sql.Int, poId)
      .query(
        `SELECT TOP 1 * FROM dbo.ReceiveGoods WHERE PurchaseOrderId = @PurchaseOrderId ORDER BY ${receivePk} DESC`
      );
    const existingRow = existingResult.recordset?.[0] ?? null;
    const existingId = existingRow?.[receivePk] ?? existingRow?.Id ?? null;

    const upsertReq = new sql.Request(tx);
    upsertReq.input("PurchaseOrderId", sql.Int, poId);
    upsertReq.input("ProjectId", sql.Int, safeProjectId ?? toNullableInt(poRow?.ProjectId));
    upsertReq.input("VendorId", sql.Int, safeVendorId ?? toNullableInt(poRow?.VendorId));
    upsertReq.input("LocationId", sql.Int, safeLocationId ?? toNullableInt(poRow?.LocationId));
    upsertReq.input("ReceivedDate", sql.Date, parsedDate ?? null);
    upsertReq.input("ReceivedBy", sql.NVarChar(100), normalizeOptionalString(receivedBy) ?? null);
    upsertReq.input("Notes", sql.NVarChar(sql.MAX), normalizeOptionalString(notes) ?? null);
    upsertReq.input("Status", sql.NVarChar(50), receiptStatus);

    let receiptRow;
    if (existingId) {
      upsertReq.input("ReceiptId", sql.Int, existingId);
      const updateResult = await upsertReq.query(`
        UPDATE dbo.ReceiveGoods
        SET PurchaseOrderId = @PurchaseOrderId,
            ProjectId = @ProjectId,
            VendorId = @VendorId,
            LocationId = @LocationId,
            ReceivedDate = @ReceivedDate,
            ReceivedBy = @ReceivedBy,
            Notes = @Notes,
            Status = @Status,
            UpdatedAt = SYSUTCDATETIME()
        OUTPUT INSERTED.*
        WHERE ${receivePk} = @ReceiptId
      `);
      receiptRow = updateResult.recordset?.[0] ?? null;
    } else {
      const insertResult = await upsertReq.query(`
        INSERT INTO dbo.ReceiveGoods
          (PurchaseOrderId, ProjectId, VendorId, LocationId, ReceivedDate, ReceivedBy, Notes, Status)
        OUTPUT INSERTED.*
        VALUES
          (@PurchaseOrderId, @ProjectId, @VendorId, @LocationId, @ReceivedDate, @ReceivedBy, @Notes, @Status)
      `);
      receiptRow = insertResult.recordset?.[0] ?? null;
    }

    const receiptId = receiptRow?.[receivePk] ?? receiptRow?.Id;

    const deleteItemsReq = new sql.Request(tx);
    deleteItemsReq.input("ReceiptId", sql.Int, receiptId);
    await deleteItemsReq.query(
      `DELETE FROM dbo.ReceiveGoodsItems WHERE ${fkCol} = @ReceiptId`
    );

    for (const item of normalizedItems) {
      const insertItemReq = new sql.Request(tx);
      insertItemReq.input("ReceiptId", sql.Int, receiptId);
      insertItemReq.input("PurchaseOrderId", sql.Int, poId);
      insertItemReq.input("ItemId", sql.Int, item.itemId ?? null);
      insertItemReq.input("ItemName", sql.NVarChar(255), item.name);
      insertItemReq.input("Description", sql.NVarChar(sql.MAX), item.description);
      insertItemReq.input("Unit", sql.NVarChar(50), item.unit ?? "PCS");
      insertItemReq.input("ItemNotes", sql.NVarChar(sql.MAX), item.itemNotes);
      insertItemReq.input("OrderedQty", sql.Int, item.orderedQty);
      insertItemReq.input("ReceivedQty", sql.Int, item.receivedQty);
      insertItemReq.input("BalanceQty", sql.Int, item.balanceQty ?? Math.max(item.orderedQty - item.receivedQty, 0));
      await insertItemReq.query(`
        INSERT INTO dbo.ReceiveGoodsItems
          (${fkCol}, PurchaseOrderId, ItemId, ItemName, Description, Unit, ItemNotes, OrderedQty, ReceivedQty, BalanceQty)
        VALUES
          (@ReceiptId, @PurchaseOrderId, @ItemId, @ItemName, @Description, @Unit, @ItemNotes, @OrderedQty, @ReceivedQty, @BalanceQty)
      `);
    }

    if (poRow) {
      const updatePoReq = new sql.Request(tx);
      updatePoReq.input("Id", sql.Int, poId);
      updatePoReq.input("Status", sql.NVarChar(50), receiptStatus);
      await updatePoReq.query(`
        UPDATE dbo.PurchaseOrders SET Status = @Status WHERE Id = @Id
      `);
    }

    await tx.commit();

    const itemsResult = await pool
      .request()
      .input("ReceiptId", sql.Int, receiptId)
      .query(
        `SELECT * FROM dbo.ReceiveGoodsItems WHERE ${fkCol} = @ReceiptId`
      );

    return res.status(existingId ? 200 : 201).json({
      ok: true,
      receipt: {
        ...normalizeReceiveGoods(receiptRow),
        items: (itemsResult.recordset ?? []).map(normalizeReceiveGoodsItem),
      },
    });
  } catch (error) {
    await rollbackTx(tx);
    console.error("POST /api/receive-goods failed:", error?.message ?? error);
    return res.status(500).json({
      ok: false,
      error: error?.message ?? "Failed to save receipt",
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

  const normalizedBoqNumber = String(boqNumber).trim();

  let tx;
  try {
    await ensureBoqTables();
    const pool = await getPool();

    const duplicateBoq = await pool
      .request()
      .input("BOQNumber", sql.NVarChar(50), normalizedBoqNumber)
      .query(`
        SELECT TOP 1 BOQId
        FROM dbo.BOQProjects
        WHERE BOQNumber = @BOQNumber
      `);
    if (duplicateBoq.recordset?.length) {
      return res
        .status(409)
        .json({ ok: false, error: "BOQ number already exists. Please use another." });
    }

    tx = pool.transaction();
    await tx.begin();

    const insertBoq = new sql.Request(tx);
    insertBoq.input("ProjectId", sql.Int, Number(projectId));
    insertBoq.input("BOQNumber", sql.NVarChar(50), normalizedBoqNumber);
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
      insertItem.input("ConsumedQty", sql.Decimal(18, 2), 0);
      insertItem.input("AvailableQty", sql.Decimal(18, 2), qty);
      insertItem.input("Notes", sql.NVarChar(sql.MAX), String(item.notes ?? "").trim());
      await insertItem.query(`
        INSERT INTO dbo.BOQLineItems
          (BOQId, ItemName, Description, Unit, Quantity, Rate, ConsumedQty, AvailableQty, Notes)
        VALUES
          (@BOQId, @ItemName, @Description, @Unit, @Quantity, @Rate, @ConsumedQty, @AvailableQty, @Notes)
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
    await rollbackTx(tx);
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

  const normalizedBoqNumber = String(boqNumber).trim();

  let tx;
  try {
    await ensureBoqTables();
    const pool = await getPool();

    const duplicateBoq = await pool
      .request()
      .input("BOQNumber", sql.NVarChar(50), normalizedBoqNumber)
      .input("BOQId", sql.Int, id)
      .query(`
        SELECT TOP 1 BOQId
        FROM dbo.BOQProjects
        WHERE BOQNumber = @BOQNumber
          AND BOQId <> @BOQId
      `);
    if (duplicateBoq.recordset?.length) {
      return res
        .status(409)
        .json({ ok: false, error: "BOQ number already exists. Please use another." });
    }

    tx = pool.transaction();
    await tx.begin();

    const updateBoq = new sql.Request(tx);
    updateBoq.input("BOQId", sql.Int, id);
    updateBoq.input("ProjectId", sql.Int, Number(projectId));
    updateBoq.input("BOQNumber", sql.NVarChar(50), normalizedBoqNumber);
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
      insertItem.input("ItemName", sql.NVarChar(200), item.name);
      insertItem.input("Description", sql.NVarChar(500), item.description);
      insertItem.input("Unit", sql.NVarChar(100), item.unit);
      insertItem.input("HSN", sql.NVarChar(50), item.hsn);
      insertItem.input("GST", sql.NVarChar(100), item.gst);
      insertItem.input("Quantity", sql.Decimal(18, 2), qty);
      insertItem.input("Rate", sql.Decimal(18, 2), rate);
      insertItem.input("Notes", sql.NVarChar(500), item.notes);
      await insertItem.query(`
        INSERT INTO dbo.BOQLineItems
          (BOQId, ItemName, Description, Unit, HSN, GST, Quantity, Rate, Notes)
        VALUES
          (@BOQId, @ItemName, @Description, @Unit, @HSN, @GST, @Quantity, @Rate, @Notes)
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
    await rollbackTx(tx);
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

  let tx;
  try {
    await ensureBoqTables();
    const pool = await getPool();
    tx = pool.transaction();
    await tx.begin();

    const deleteItems = new sql.Request(tx);
    deleteItems.input("BOQId", sql.Int, id);
    await deleteItems.query(`DELETE FROM dbo.BOQLineItems WHERE BOQId = @BOQId`);

    const deleteBoq = new sql.Request(tx);
    deleteBoq.input("BOQId", sql.Int, id);
    const result = await deleteBoq.query(`
      DELETE FROM dbo.BOQProjects WHERE BOQId = @BOQId
    `);

    await tx.commit();

    if (result.rowsAffected?.[0] === 0) {
      return res.status(404).json({ ok: false, error: "BOQ not found" });
    }

    return res.json({ ok: true });
  } catch (error) {
    await rollbackTx(tx);
    return res.status(500).json({
      ok: false,
      error: error?.message ?? "Failed to delete BOQ",
    });
  }
});

app.get("/api/delivery-challans", async (_req, res) => {
  try {
    await ensureDeliveryChallanTables();
    const pkCol = await refreshDeliveryChallanPk();
    await refreshDeliveryChallanItemsFk();
    const pool = await getPool();

    const challansResult = await pool.request().query(`
      SELECT * FROM dbo.DeliveryChallan ORDER BY ${pkCol} DESC
    `);
    const itemsResult = await pool.request().query(`
      SELECT * FROM dbo.DeliveryChallanItems
    `);

    const itemsByChallan = (itemsResult.recordset ?? []).reduce((acc, row) => {
      const item = normalizeDeliveryChallanItem(row);
      const parentId = item.deliveryChallanId;
      if (!parentId) {
        return acc;
      }
      if (!acc[parentId]) {
        acc[parentId] = [];
      }
      acc[parentId].push(item);
      return acc;
    }, {});

    const data = (challansResult.recordset ?? []).map((row) => {
      const challan = normalizeDeliveryChallan(row);
      return {
        ...challan,
        items: itemsByChallan[challan.id] ?? [],
      };
    });

    return res.json({ ok: true, deliveryChallans: data });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error?.message ?? "Failed to fetch delivery challans",
    });
  }
});

app.get("/api/delivery-challans/:id", async (req, res) => {
  const id = Number.parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) {
    return res.status(400).json({ ok: false, error: "Invalid delivery challan id" });
  }

  try {
    await ensureDeliveryChallanTables();
    const pkCol = await refreshDeliveryChallanPk();
    const fkCol = await refreshDeliveryChallanItemsFk();
    const pool = await getPool();

    const challanResult = await pool
      .request()
      .input("DeliveryChallanId", sql.BigInt, id)
      .query(`
        SELECT * FROM dbo.DeliveryChallan WHERE ${pkCol} = @DeliveryChallanId
      `);

    const challanRow = challanResult.recordset?.[0];
    if (!challanRow) {
      return res.status(404).json({ ok: false, error: "Delivery challan not found" });
    }

    const itemsResult = await pool
      .request()
      .input("DeliveryChallanId", sql.BigInt, id)
      .query(`
        SELECT * FROM dbo.DeliveryChallanItems WHERE ${fkCol} = @DeliveryChallanId
      `);

    return res.json({
      ok: true,
      deliveryChallan: {
        ...normalizeDeliveryChallan(challanRow),
        items: (itemsResult.recordset ?? []).map(normalizeDeliveryChallanItem),
      },
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error?.message ?? "Failed to fetch delivery challan",
    });
  }
});

app.post("/api/delivery-challans", async (req, res) => {
  const {
    dcNumber,
    projectId,
    fromLocationId,
    toLocation,
    vehicleNumber = null,
    eWayBillNumber = null,
    issueDate = null,
    status = "Draft",
    notes = null,
    items = [],
  } = req.body ?? {};

  const safeDcNumber = normalizeOptionalString(dcNumber);
  const safeProjectId = toNullableInt(projectId);
  const safeFromLocationId = toNullableInt(fromLocationId);
  const safeToLocation = normalizeOptionalString(toLocation);
  const safeVehicleNumber = normalizeOptionalString(vehicleNumber) ?? null;
  const safeEWayBillNumber = normalizeOptionalString(eWayBillNumber) ?? null;
  const safeStatus = normalizeOptionalString(status) ?? "Draft";
  const safeNotes = normalizeOptionalString(notes) ?? null;
  const parsedIssueDate = parseDateInput(issueDate);

  if (!safeDcNumber) {
    return res.status(400).json({ ok: false, error: "dcNumber is required" });
  }
  if (!safeProjectId) {
    return res.status(400).json({ ok: false, error: "projectId is required" });
  }
  if (!safeFromLocationId) {
    return res.status(400).json({ ok: false, error: "fromLocationId is required" });
  }
  if (!safeToLocation) {
    return res.status(400).json({ ok: false, error: "toLocation is required" });
  }
  if (Number.isNaN(parsedIssueDate)) {
    return res.status(400).json({ ok: false, error: "Invalid issueDate" });
  }

  const normalizedItems = (Array.isArray(items) ? items : [])
    .map((item) => {
      const name = String(item.name ?? item.Item ?? "").trim();
      const quantity = Number(item.quantity ?? item.Quantity ?? 0) || 0;
      const rate = Number(item.rate ?? item.Rate ?? 0) || 0;
      return {
        name,
        description: normalizeOptionalString(item.description ?? item.Description) ?? null,
        unit: normalizeOptionalString(item.unit ?? item.Unit) ?? "PCS",
        hsn: normalizeOptionalString(item.hsn ?? item.HSN ?? item.hsnCode ?? item.HSNCode) ?? null,
        gst: normalizeOptionalString(item.gst ?? item.GST ?? item.gstRate ?? item.GSTRate) ?? null,
        quantity,
        rate,
        notes: normalizeOptionalString(item.notes ?? item.Notes) ?? null,
      };
    })
    .filter((item) => item.name && item.quantity > 0);

  if (!normalizedItems.length) {
    return res.status(400).json({
      ok: false,
      error: "At least one line item is required",
    });
  }

  let tx;
  try {
    await ensureDeliveryChallanTables();
    const pkCol = await refreshDeliveryChallanPk();
    const fkCol = await refreshDeliveryChallanItemsFk();
    const pool = await getPool();
    tx = pool.transaction();
    await tx.begin();

    const insertHeaderReq = new sql.Request(tx);
    insertHeaderReq.input("DCNumber", sql.NVarChar(100), safeDcNumber);
    insertHeaderReq.input("ProjectId", sql.Int, safeProjectId);
    insertHeaderReq.input("FromLocationId", sql.Int, safeFromLocationId);
    insertHeaderReq.input("ToLocation", sql.NVarChar(200), safeToLocation);
    insertHeaderReq.input("VehicleNumber", sql.NVarChar(50), safeVehicleNumber);
    insertHeaderReq.input("EWayBillNumber", sql.NVarChar(100), safeEWayBillNumber);
    insertHeaderReq.input("IssueDate", sql.Date, parsedIssueDate ?? null);
    insertHeaderReq.input("Status", sql.NVarChar(50), safeStatus);
    insertHeaderReq.input("Notes", sql.NVarChar(sql.MAX), safeNotes);

    const headerResult = await insertHeaderReq.query(`
      INSERT INTO dbo.DeliveryChallan
        (DCNumber, ProjectId, FromLocationId, ToLocation, VehicleNumber, EWayBillNumber, IssueDate, Status, Notes)
      OUTPUT INSERTED.*
      VALUES
        (@DCNumber, @ProjectId, @FromLocationId, @ToLocation, @VehicleNumber, @EWayBillNumber, @IssueDate, @Status, @Notes)
    `);

    const headerRow = headerResult.recordset?.[0];
    const challanId = headerRow?.[pkCol] ?? headerRow?.Id ?? null;
    if (!challanId) {
      throw new Error("Failed to create delivery challan");
    }

    for (const item of normalizedItems) {
      const insertItemReq = new sql.Request(tx);
      insertItemReq.input("DeliveryChallanId", sql.BigInt, challanId);
      insertItemReq.input("ItemName", sql.NVarChar(200), item.name);
      insertItemReq.input("Description", sql.NVarChar(500), item.description);
      insertItemReq.input("Unit", sql.NVarChar(50), item.unit);
      insertItemReq.input("HSN", sql.NVarChar(50), item.hsn);
      insertItemReq.input("GST", sql.NVarChar(100), item.gst);
      insertItemReq.input("Quantity", sql.Decimal(18, 2), item.quantity);
      insertItemReq.input("Rate", sql.Decimal(18, 2), item.rate);
      insertItemReq.input("Notes", sql.NVarChar(500), item.notes);
      await insertItemReq.query(`
        INSERT INTO dbo.DeliveryChallanItems
          (${fkCol}, ItemName, Description, Unit, HSN, GST, Quantity, Rate, Notes)
        VALUES
          (@DeliveryChallanId, @ItemName, @Description, @Unit, @HSN, @GST, @Quantity, @Rate, @Notes)
      `);
    }

    await tx.commit();

    const itemsResult = await pool
      .request()
      .input("DeliveryChallanId", sql.BigInt, challanId)
      .query(`
        SELECT * FROM dbo.DeliveryChallanItems WHERE ${fkCol} = @DeliveryChallanId
      `);

    return res.status(201).json({
      ok: true,
      deliveryChallan: {
        ...normalizeDeliveryChallan(headerRow),
        items: (itemsResult.recordset ?? []).map(normalizeDeliveryChallanItem),
      },
    });
  } catch (error) {
    await rollbackTx(tx);
    return res.status(500).json({
      ok: false,
      error: error?.message ?? "Failed to create delivery challan",
    });
  }
});

app.put("/api/delivery-challans/:id", async (req, res) => {
  const id = Number.parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) {
    return res.status(400).json({ ok: false, error: "Invalid delivery challan id" });
  }

  const {
    dcNumber,
    projectId,
    fromLocationId,
    toLocation,
    vehicleNumber = null,
    eWayBillNumber = null,
    issueDate = null,
    status = "Draft",
    notes = null,
    items = [],
  } = req.body ?? {};

  const safeDcNumber = normalizeOptionalString(dcNumber);
  const safeProjectId = toNullableInt(projectId);
  const safeFromLocationId = toNullableInt(fromLocationId);
  const safeToLocation = normalizeOptionalString(toLocation);
  const safeVehicleNumber = normalizeOptionalString(vehicleNumber) ?? null;
  const safeEWayBillNumber = normalizeOptionalString(eWayBillNumber) ?? null;
  const safeStatus = normalizeOptionalString(status) ?? "Draft";
  const safeNotes = normalizeOptionalString(notes) ?? null;
  const parsedIssueDate = parseDateInput(issueDate);

  if (!safeDcNumber) {
    return res.status(400).json({ ok: false, error: "dcNumber is required" });
  }
  if (!safeProjectId) {
    return res.status(400).json({ ok: false, error: "projectId is required" });
  }
  if (!safeFromLocationId) {
    return res.status(400).json({ ok: false, error: "fromLocationId is required" });
  }
  if (!safeToLocation) {
    return res.status(400).json({ ok: false, error: "toLocation is required" });
  }
  if (Number.isNaN(parsedIssueDate)) {
    return res.status(400).json({ ok: false, error: "Invalid issueDate" });
  }

  const normalizedItems = (Array.isArray(items) ? items : [])
    .map((item) => {
      const name = String(item.name ?? item.Item ?? "").trim();
      const quantity = Number(item.quantity ?? item.Quantity ?? 0) || 0;
      const rate = Number(item.rate ?? item.Rate ?? 0) || 0;
      return {
        name,
        description: normalizeOptionalString(item.description ?? item.Description) ?? null,
        unit: normalizeOptionalString(item.unit ?? item.Unit) ?? "PCS",
        hsn: normalizeOptionalString(item.hsn ?? item.HSN ?? item.hsnCode ?? item.HSNCode) ?? null,
        gst: normalizeOptionalString(item.gst ?? item.GST ?? item.gstRate ?? item.GSTRate) ?? null,
        quantity,
        rate,
        notes: normalizeOptionalString(item.notes ?? item.Notes) ?? null,
      };
    })
    .filter((item) => item.name && item.quantity > 0);

  if (!normalizedItems.length) {
    return res.status(400).json({
      ok: false,
      error: "At least one line item is required",
    });
  }

  let tx;
  try {
    await ensureDeliveryChallanTables();
    const pkCol = await refreshDeliveryChallanPk();
    const fkCol = await refreshDeliveryChallanItemsFk();
    const pool = await getPool();
    tx = pool.transaction();
    await tx.begin();

    const updateHeaderReq = new sql.Request(tx);
    updateHeaderReq.input("DeliveryChallanId", sql.BigInt, id);
    updateHeaderReq.input("DCNumber", sql.NVarChar(100), safeDcNumber);
    updateHeaderReq.input("ProjectId", sql.Int, safeProjectId);
    updateHeaderReq.input("FromLocationId", sql.Int, safeFromLocationId);
    updateHeaderReq.input("ToLocation", sql.NVarChar(200), safeToLocation);
    updateHeaderReq.input("VehicleNumber", sql.NVarChar(50), safeVehicleNumber);
    updateHeaderReq.input("EWayBillNumber", sql.NVarChar(100), safeEWayBillNumber);
    updateHeaderReq.input("IssueDate", sql.Date, parsedIssueDate ?? null);
    updateHeaderReq.input("Status", sql.NVarChar(50), safeStatus);
    updateHeaderReq.input("Notes", sql.NVarChar(sql.MAX), safeNotes);

    const headerResult = await updateHeaderReq.query(`
      UPDATE dbo.DeliveryChallan
      SET DCNumber = @DCNumber,
          ProjectId = @ProjectId,
          FromLocationId = @FromLocationId,
          ToLocation = @ToLocation,
          VehicleNumber = @VehicleNumber,
          EWayBillNumber = @EWayBillNumber,
          IssueDate = @IssueDate,
          Status = @Status,
          Notes = @Notes,
          UpdatedAt = SYSUTCDATETIME()
      OUTPUT INSERTED.*
      WHERE ${pkCol} = @DeliveryChallanId
    `);

    const headerRow = headerResult.recordset?.[0];
    if (!headerRow) {
      await tx.rollback();
      return res.status(404).json({ ok: false, error: "Delivery challan not found" });
    }

    const deleteItemsReq = new sql.Request(tx);
    deleteItemsReq.input("DeliveryChallanId", sql.BigInt, id);
    await deleteItemsReq.query(`
      DELETE FROM dbo.DeliveryChallanItems WHERE ${fkCol} = @DeliveryChallanId
    `);

    for (const item of normalizedItems) {
      const insertItemReq = new sql.Request(tx);
      insertItemReq.input("DeliveryChallanId", sql.BigInt, id);
      insertItemReq.input("ItemName", sql.NVarChar(200), item.name);
      insertItemReq.input("Description", sql.NVarChar(500), item.description);
      insertItemReq.input("Unit", sql.NVarChar(100), item.unit);
      insertItemReq.input("HSN", sql.NVarChar(50), item.hsn);
      insertItemReq.input("GST", sql.NVarChar(100), item.gst);
      insertItemReq.input("Quantity", sql.Decimal(18, 2), item.quantity);
      insertItemReq.input("Rate", sql.Decimal(18, 2), item.rate);
      insertItemReq.input("Notes", sql.NVarChar(500), item.notes);
      await insertItemReq.query(`
        INSERT INTO dbo.DeliveryChallanItems
          (${fkCol}, ItemName, Description, Unit, HSN, GST, Quantity, Rate, Notes)
        VALUES
          (@DeliveryChallanId, @ItemName, @Description, @Unit, @HSN, @GST, @Quantity, @Rate, @Notes)
      `);
    }

    await tx.commit();

    const itemsResult = await pool
      .request()
      .input("DeliveryChallanId", sql.BigInt, id)
      .query(`
        SELECT * FROM dbo.DeliveryChallanItems WHERE ${fkCol} = @DeliveryChallanId
      `);

    return res.json({
      ok: true,
      deliveryChallan: {
        ...normalizeDeliveryChallan(headerRow),
        items: (itemsResult.recordset ?? []).map(normalizeDeliveryChallanItem),
      },
    });
  } catch (error) {
    await rollbackTx(tx);
    return res.status(500).json({
      ok: false,
      error: error?.message ?? "Failed to update delivery challan",
    });
  }
});

app.delete("/api/delivery-challans/:id", async (req, res) => {
  const id = Number.parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) {
    return res.status(400).json({ ok: false, error: "Invalid delivery challan id" });
  }

  let tx;
  try {
    await ensureDeliveryChallanTables();
    const pkCol = await refreshDeliveryChallanPk();
    const fkCol = await refreshDeliveryChallanItemsFk();
    const pool = await getPool();
    tx = pool.transaction();
    await tx.begin();

    const deleteItemsReq = new sql.Request(tx);
    deleteItemsReq.input("DeliveryChallanId", sql.BigInt, id);
    await deleteItemsReq.query(`
      DELETE FROM dbo.DeliveryChallanItems WHERE ${fkCol} = @DeliveryChallanId
    `);

    const deleteHeaderReq = new sql.Request(tx);
    deleteHeaderReq.input("DeliveryChallanId", sql.BigInt, id);
    const deleteResult = await deleteHeaderReq.query(`
      DELETE FROM dbo.DeliveryChallan WHERE ${pkCol} = @DeliveryChallanId
    `);

    await tx.commit();

    if ((deleteResult.rowsAffected?.[0] ?? 0) === 0) {
      return res.status(404).json({ ok: false, error: "Delivery challan not found" });
    }

    return res.json({ ok: true });
  } catch (error) {
    await rollbackTx(tx);
    return res.status(500).json({
      ok: false,
      error: error?.message ?? "Failed to delete delivery challan",
    });
  }
});

app.get("/api/consumptions", async (_req, res) => {
  try {
    await ensureConsumptionTables();
    const pkCol = await refreshConsumptionPk();
    await refreshConsumptionItemsFk();
    const pool = await getPool();

    const consumptionsResult = await pool.request().query(`
      SELECT * FROM dbo.Consumption ORDER BY ${pkCol} DESC
    `);
    const itemsResult = await pool.request().query(`
      SELECT * FROM dbo.ConsumptionItems
    `);

    const itemsByConsumption = (itemsResult.recordset ?? []).reduce((acc, row) => {
      const item = normalizeConsumptionItem(row);
      const parentId = item.consumptionId;
      if (parentId === null || parentId === undefined) {
        return acc;
      }
      if (!acc[parentId]) {
        acc[parentId] = [];
      }
      acc[parentId].push(item);
      return acc;
    }, {});

    const data = (consumptionsResult.recordset ?? []).map((row) => {
      const consumption = normalizeConsumption(row);
      return {
        ...consumption,
        items: itemsByConsumption[consumption.id] ?? [],
      };
    });

    return res.json({ ok: true, consumptions: data });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error?.message ?? "Failed to fetch consumptions",
    });
  }
});

app.get("/api/consumptions/:id", async (req, res) => {
  const id = Number.parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) {
    return res.status(400).json({ ok: false, error: "Invalid consumption id" });
  }

  try {
    await ensureConsumptionTables();
    await ensureBoqTables();
    const pkCol = await refreshConsumptionPk();
    const fkCol = await refreshConsumptionItemsFk();
    const pool = await getPool();

    const consumptionResult = await pool
      .request()
      .input("ConsumptionId", sql.Int, id)
      .query(`
        SELECT * FROM dbo.Consumption WHERE ${pkCol} = @ConsumptionId
      `);

    const consumptionRow = consumptionResult.recordset?.[0];
    if (!consumptionRow) {
      return res.status(404).json({ ok: false, error: "Consumption not found" });
    }

    const itemsResult = await pool
      .request()
      .input("ConsumptionId", sql.Int, id)
      .query(`
        SELECT * FROM dbo.ConsumptionItems WHERE ${fkCol} = @ConsumptionId
      `);

    return res.json({
      ok: true,
      consumption: {
        ...normalizeConsumption(consumptionRow),
        items: (itemsResult.recordset ?? []).map(normalizeConsumptionItem),
      },
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error?.message ?? "Failed to fetch consumption",
    });
  }
});

app.post("/api/consumptions", async (req, res) => {
  const {
    consumptionNumber,
    projectId,
    locationId,
    consumptionDate = null,
    issuedBy = null,
    status = "Logged",
    notes = null,
    items = [],
  } = req.body ?? {};

  const safeConsumptionNumber = normalizeOptionalString(consumptionNumber);
  const safeProjectId = toNullableInt(projectId);
  const safeLocationId = toNullableInt(locationId);
  const safeIssuedBy = normalizeOptionalString(issuedBy) ?? null;
  const safeStatus = normalizeOptionalString(status) ?? "Logged";
  const safeNotes = normalizeOptionalString(notes) ?? null;
  const parsedConsumptionDate = parseDateInput(consumptionDate);

  if (!safeConsumptionNumber) {
    return res.status(400).json({
      ok: false,
      error: "consumptionNumber is required",
    });
  }
  if (!safeProjectId) {
    return res.status(400).json({ ok: false, error: "projectId is required" });
  }
  if (!safeLocationId) {
    return res.status(400).json({ ok: false, error: "locationId is required" });
  }
  if (Number.isNaN(parsedConsumptionDate)) {
    return res.status(400).json({ ok: false, error: "Invalid consumptionDate" });
  }

  const normalizedItems = (Array.isArray(items) ? items : [])
    .map((item) => {
      const name = String(item.name ?? item.Item ?? "").trim();
      const quantity = Number(item.quantity ?? item.Quantity ?? 0) || 0;
      const rate = Number(item.rate ?? item.Rate ?? 0) || 0;
      const boqItemId = toNullableInt(
        item.boqItemId ?? item.BoqItemId ?? item.BOQItemId ?? item.LineItemId
      );
      return {
        boqItemId,
        name,
        description: normalizeOptionalString(item.description ?? item.Description) ?? null,
        unit: normalizeOptionalString(item.unit ?? item.Unit) ?? "PCS",
        hsn: normalizeOptionalString(item.hsn ?? item.HSN ?? item.hsnCode ?? item.HSNCode) ?? null,
        gst: normalizeOptionalString(item.gst ?? item.GST ?? item.gstRate ?? item.GSTRate) ?? null,
        quantity,
        rate,
        notes: normalizeOptionalString(item.notes ?? item.Notes) ?? null,
      };
    })
    .filter((item) => item.name && item.quantity > 0);

  if (!normalizedItems.length) {
    return res.status(400).json({
      ok: false,
      error: "At least one consumed item is required",
    });
  }

  let tx;
  try {
    await ensureConsumptionTables();
    await ensureBoqTables();
    const pkCol = await refreshConsumptionPk();
    const fkCol = await refreshConsumptionItemsFk();
    const pool = await getPool();
    tx = pool.transaction();
    await tx.begin();

    const insertHeaderReq = new sql.Request(tx);
    insertHeaderReq.input("ConsumptionNumber", sql.NVarChar(50), safeConsumptionNumber);
    insertHeaderReq.input("ProjectId", sql.Int, safeProjectId);
    insertHeaderReq.input("LocationId", sql.Int, safeLocationId);
    insertHeaderReq.input("ConsumptionDate", sql.Date, parsedConsumptionDate ?? null);
    insertHeaderReq.input("IssuedBy", sql.NVarChar(200), safeIssuedBy);
    insertHeaderReq.input("Status", sql.NVarChar(50), safeStatus);
    insertHeaderReq.input("Notes", sql.NVarChar(sql.MAX), safeNotes);

    const headerResult = await insertHeaderReq.query(`
      INSERT INTO dbo.Consumption
        (ConsumptionNumber, ProjectId, LocationId, ConsumptionDate, IssuedBy, Status, Notes)
      OUTPUT INSERTED.*
      VALUES
        (@ConsumptionNumber, @ProjectId, @LocationId, @ConsumptionDate, @IssuedBy, @Status, @Notes)
    `);

    const headerRow = headerResult.recordset?.[0];
    const consumptionId =
      headerRow?.[pkCol] ?? headerRow?.Id ?? headerRow?.ConsumptionId ?? null;
    if (!consumptionId) {
      throw new Error("Failed to create consumption entry");
    }

    for (const item of normalizedItems) {
      const insertItemReq = new sql.Request(tx);
      insertItemReq.input("ConsumptionId", sql.Int, consumptionId);
      insertItemReq.input("BoqItemId", sql.Int, item.boqItemId);
      insertItemReq.input("Item", sql.NVarChar(200), item.name);
      insertItemReq.input("Description", sql.NVarChar(500), item.description);
      insertItemReq.input("Unit", sql.NVarChar(100), item.unit);
      insertItemReq.input("HSN", sql.NVarChar(50), item.hsn);
      insertItemReq.input("GST", sql.NVarChar(100), item.gst);
      insertItemReq.input("Quantity", sql.Decimal(18, 2), item.quantity);
      insertItemReq.input("Rate", sql.Decimal(18, 2), item.rate);
      insertItemReq.input("Notes", sql.NVarChar(500), item.notes);
      await insertItemReq.query(`
        INSERT INTO dbo.ConsumptionItems
          (${fkCol}, BoqItemId, Item, Description, Unit, HSN, GST, Quantity, Rate, Notes)
        VALUES
          (@ConsumptionId, @BoqItemId, @Item, @Description, @Unit, @HSN, @GST, @Quantity, @Rate, @Notes)
      `);
    }

    await refreshBoqAvailability(
      tx,
      normalizedItems.map((item) => item.boqItemId)
    );

    await tx.commit();

    const itemsResult = await pool
      .request()
      .input("ConsumptionId", sql.Int, consumptionId)
      .query(`
        SELECT * FROM dbo.ConsumptionItems WHERE ${fkCol} = @ConsumptionId
      `);

    return res.status(201).json({
      ok: true,
      consumption: {
        ...normalizeConsumption(headerRow),
        items: (itemsResult.recordset ?? []).map(normalizeConsumptionItem),
      },
    });
  } catch (error) {
    await rollbackTx(tx);
    return res.status(500).json({
      ok: false,
      error: error?.message ?? "Failed to create consumption",
    });
  }
});

app.put("/api/consumptions/:id", async (req, res) => {
  const id = Number.parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) {
    return res.status(400).json({ ok: false, error: "Invalid consumption id" });
  }

  const {
    consumptionNumber,
    projectId,
    locationId,
    consumptionDate = null,
    issuedBy = null,
    status = "Logged",
    notes = null,
    items = [],
  } = req.body ?? {};

  const safeConsumptionNumber = normalizeOptionalString(consumptionNumber);
  const safeProjectId = toNullableInt(projectId);
  const safeLocationId = toNullableInt(locationId);
  const safeIssuedBy = normalizeOptionalString(issuedBy) ?? null;
  const safeStatus = normalizeOptionalString(status) ?? "Logged";
  const safeNotes = normalizeOptionalString(notes) ?? null;
  const parsedConsumptionDate = parseDateInput(consumptionDate);

  if (!safeConsumptionNumber) {
    return res.status(400).json({
      ok: false,
      error: "consumptionNumber is required",
    });
  }
  if (!safeProjectId) {
    return res.status(400).json({ ok: false, error: "projectId is required" });
  }
  if (!safeLocationId) {
    return res.status(400).json({ ok: false, error: "locationId is required" });
  }
  if (Number.isNaN(parsedConsumptionDate)) {
    return res.status(400).json({ ok: false, error: "Invalid consumptionDate" });
  }

  const normalizedItems = (Array.isArray(items) ? items : [])
    .map((item) => {
      const name = String(item.name ?? item.Item ?? "").trim();
      const quantity = Number(item.quantity ?? item.Quantity ?? 0) || 0;
      const rate = Number(item.rate ?? item.Rate ?? 0) || 0;
      const boqItemId = toNullableInt(
        item.boqItemId ?? item.BoqItemId ?? item.BOQItemId ?? item.LineItemId
      );
      return {
        boqItemId,
        name,
        description: normalizeOptionalString(item.description ?? item.Description) ?? null,
        unit: normalizeOptionalString(item.unit ?? item.Unit) ?? "PCS",
        hsn: normalizeOptionalString(item.hsn ?? item.HSN ?? item.hsnCode ?? item.HSNCode) ?? null,
        gst: normalizeOptionalString(item.gst ?? item.GST ?? item.gstRate ?? item.GSTRate) ?? null,
        quantity,
        rate,
        notes: normalizeOptionalString(item.notes ?? item.Notes) ?? null,
      };
    })
    .filter((item) => item.name && item.quantity > 0);

  if (!normalizedItems.length) {
    return res.status(400).json({
      ok: false,
      error: "At least one consumed item is required",
    });
  }

  let tx;
  try {
    await ensureConsumptionTables();
    await ensureBoqTables();
    const pkCol = await refreshConsumptionPk();
    const fkCol = await refreshConsumptionItemsFk();
    const pool = await getPool();
    tx = pool.transaction();
    await tx.begin();

    const existingItemsResult = await new sql.Request(tx)
      .input("ConsumptionId", sql.Int, id)
      .query(`
        SELECT BoqItemId FROM dbo.ConsumptionItems WHERE ${fkCol} = @ConsumptionId
      `);
    const existingBoqItemIds = (existingItemsResult.recordset ?? []).map(
      (row) => row.BoqItemId ?? row.BOQItemId ?? row.boqItemId ?? null
    );

    const updateHeaderReq = new sql.Request(tx);
    updateHeaderReq.input("ConsumptionId", sql.Int, id);
    updateHeaderReq.input("ConsumptionNumber", sql.NVarChar(50), safeConsumptionNumber);
    updateHeaderReq.input("ProjectId", sql.Int, safeProjectId);
    updateHeaderReq.input("LocationId", sql.Int, safeLocationId);
    updateHeaderReq.input("ConsumptionDate", sql.Date, parsedConsumptionDate ?? null);
    updateHeaderReq.input("IssuedBy", sql.NVarChar(200), safeIssuedBy);
    updateHeaderReq.input("Status", sql.NVarChar(50), safeStatus);
    updateHeaderReq.input("Notes", sql.NVarChar(sql.MAX), safeNotes);

    const headerResult = await updateHeaderReq.query(`
      UPDATE dbo.Consumption
      SET ConsumptionNumber = @ConsumptionNumber,
          ProjectId = @ProjectId,
          LocationId = @LocationId,
          ConsumptionDate = @ConsumptionDate,
          IssuedBy = @IssuedBy,
          Status = @Status,
          Notes = @Notes,
          UpdatedAt = SYSUTCDATETIME()
      OUTPUT INSERTED.*
      WHERE ${pkCol} = @ConsumptionId
    `);

    const headerRow = headerResult.recordset?.[0];
    if (!headerRow) {
      await tx.rollback();
      return res.status(404).json({ ok: false, error: "Consumption not found" });
    }

    const deleteItemsReq = new sql.Request(tx);
    deleteItemsReq.input("ConsumptionId", sql.Int, id);
    await deleteItemsReq.query(`
      DELETE FROM dbo.ConsumptionItems WHERE ${fkCol} = @ConsumptionId
    `);

    for (const item of normalizedItems) {
      const insertItemReq = new sql.Request(tx);
      insertItemReq.input("ConsumptionId", sql.Int, id);
      insertItemReq.input("BoqItemId", sql.Int, item.boqItemId);
      insertItemReq.input("Item", sql.NVarChar(200), item.name);
      insertItemReq.input("Description", sql.NVarChar(500), item.description);
      insertItemReq.input("Unit", sql.NVarChar(100), item.unit);
      insertItemReq.input("HSN", sql.NVarChar(50), item.hsn);
      insertItemReq.input("GST", sql.NVarChar(100), item.gst);
      insertItemReq.input("Quantity", sql.Decimal(18, 2), item.quantity);
      insertItemReq.input("Rate", sql.Decimal(18, 2), item.rate);
      insertItemReq.input("Notes", sql.NVarChar(500), item.notes);
      await insertItemReq.query(`
        INSERT INTO dbo.ConsumptionItems
          (${fkCol}, BoqItemId, Item, Description, Unit, HSN, GST, Quantity, Rate, Notes)
        VALUES
          (@ConsumptionId, @BoqItemId, @Item, @Description, @Unit, @HSN, @GST, @Quantity, @Rate, @Notes)
      `);
    }

    await refreshBoqAvailability(tx, [
      ...existingBoqItemIds,
      ...normalizedItems.map((item) => item.boqItemId),
    ]);

    await tx.commit();

    const itemsResult = await pool
      .request()
      .input("ConsumptionId", sql.Int, id)
      .query(`
        SELECT * FROM dbo.ConsumptionItems WHERE ${fkCol} = @ConsumptionId
      `);

    return res.json({
      ok: true,
      consumption: {
        ...normalizeConsumption(headerRow),
        items: (itemsResult.recordset ?? []).map(normalizeConsumptionItem),
      },
    });
  } catch (error) {
    await rollbackTx(tx);
    return res.status(500).json({
      ok: false,
      error: error?.message ?? "Failed to update consumption",
    });
  }
});

app.delete("/api/consumptions/:id", async (req, res) => {
  const id = Number.parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) {
    return res.status(400).json({ ok: false, error: "Invalid consumption id" });
  }

  let tx;
  try {
    await ensureConsumptionTables();
    await ensureBoqTables();
    const pkCol = await refreshConsumptionPk();
    const fkCol = await refreshConsumptionItemsFk();
    const pool = await getPool();
    tx = pool.transaction();
    await tx.begin();

    const existingItemsResult = await new sql.Request(tx)
      .input("ConsumptionId", sql.Int, id)
      .query(`
        SELECT BoqItemId FROM dbo.ConsumptionItems WHERE ${fkCol} = @ConsumptionId
      `);
    const existingBoqItemIds = (existingItemsResult.recordset ?? []).map(
      (row) => row.BoqItemId ?? row.BOQItemId ?? row.boqItemId ?? null
    );

    const deleteItemsReq = new sql.Request(tx);
    deleteItemsReq.input("ConsumptionId", sql.Int, id);
    await deleteItemsReq.query(`
      DELETE FROM dbo.ConsumptionItems WHERE ${fkCol} = @ConsumptionId
    `);

    const deleteHeaderReq = new sql.Request(tx);
    deleteHeaderReq.input("ConsumptionId", sql.Int, id);
    const deleteResult = await deleteHeaderReq.query(`
      DELETE FROM dbo.Consumption WHERE ${pkCol} = @ConsumptionId
    `);

    await refreshBoqAvailability(tx, existingBoqItemIds);

    await tx.commit();

    if ((deleteResult.rowsAffected?.[0] ?? 0) === 0) {
      return res.status(404).json({ ok: false, error: "Consumption not found" });
    }

    return res.json({ ok: true });
  } catch (error) {
    await rollbackTx(tx);
    return res.status(500).json({
      ok: false,
      error: error?.message ?? "Failed to delete consumption",
    });
  }
});

app.get("/api/reallocate-inventory", async (_req, res) => {
  try {
    await ensureReallocateInventoryTables();
    const pkCol = await refreshReallocateInventoryPk();
    await refreshReallocateInventoryItemsFk();
    const pool = await getPool();

    const headersResult = await pool.request().query(`
      SELECT * FROM dbo.ReallocateInventory ORDER BY ${toIdentifier(pkCol)} DESC
    `);
    const itemsResult = await pool.request().query(`
      SELECT * FROM dbo.ReallocateInventoryItems
    `);

    const itemsByTransfer = (itemsResult.recordset ?? []).reduce((acc, row) => {
      const item = normalizeReallocateInventoryItem(row);
      const parentId = item.transferId;
      if (parentId === null || parentId === undefined) {
        return acc;
      }
      if (!acc[parentId]) {
        acc[parentId] = [];
      }
      acc[parentId].push(item);
      return acc;
    }, {});

    const reallocations = (headersResult.recordset ?? []).map((row) => {
      const transfer = normalizeReallocateInventory(row);
      return {
        ...transfer,
        items: itemsByTransfer[transfer.id] ?? [],
      };
    });

    return res.json({ ok: true, reallocations });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error?.message ?? "Failed to fetch reallocate inventory records",
    });
  }
});

app.get("/api/reallocate-inventory/:id", async (req, res) => {
  const id = Number.parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) {
    return res.status(400).json({
      ok: false,
      error: "Invalid reallocate inventory id",
    });
  }

  try {
    await ensureReallocateInventoryTables();
    const pkCol = await refreshReallocateInventoryPk();
    const fkCol = await refreshReallocateInventoryItemsFk();
    const pool = await getPool();

    const headerResult = await pool
      .request()
      .input("TransferId", sql.Int, id)
      .query(`
        SELECT * FROM dbo.ReallocateInventory
        WHERE ${toIdentifier(pkCol)} = @TransferId
      `);

    const transferRow = headerResult.recordset?.[0];
    if (!transferRow) {
      return res.status(404).json({
        ok: false,
        error: "Reallocate inventory record not found",
      });
    }

    const itemsResult = await pool
      .request()
      .input("TransferId", sql.Int, id)
      .query(`
        SELECT * FROM dbo.ReallocateInventoryItems
        WHERE ${toIdentifier(fkCol)} = @TransferId
      `);

    return res.json({
      ok: true,
      reallocation: {
        ...normalizeReallocateInventory(transferRow),
        items: (itemsResult.recordset ?? []).map(normalizeReallocateInventoryItem),
      },
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error?.message ?? "Failed to fetch reallocate inventory record",
    });
  }
});

app.post("/api/reallocate-inventory", async (req, res) => {
  const {
    referenceNumber = null,
    type = "Reallocate",
    consumptionId = null,
    consumptionNumber = "",
    projectId = null,
    fromLocationId,
    toLocationId = null,
    returnVendorId = null,
    requestDate = null,
    requestedBy = null,
    status = "Pending",
    notes = null,
    items = [],
  } = req.body ?? {};

  const safeType = String(type ?? "Reallocate").trim() === "Return"
    ? "Return"
    : "Reallocate";
  const safeReferenceNumber = normalizeOptionalString(referenceNumber);
  const safeConsumptionId = toNullableInt(consumptionId);
  const safeConsumptionNumber = normalizeOptionalString(consumptionNumber) ?? "";
  const safeProjectId = toNullableInt(projectId);
  const safeFromLocationId = toNullableInt(fromLocationId);
  const safeToLocationId = toNullableInt(toLocationId);
  const safeReturnVendorId = toNullableInt(returnVendorId);
  const safeRequestedBy = normalizeOptionalString(requestedBy) ?? "";
  const safeStatus = normalizeOptionalString(status) ?? "Pending";
  const safeNotes = normalizeOptionalString(notes) ?? "";
  const parsedRequestDate = parseDateInput(requestDate);

  if (!safeFromLocationId) {
    return res.status(400).json({
      ok: false,
      error: "fromLocationId is required",
    });
  }
  if (safeType === "Reallocate" && !safeToLocationId) {
    return res.status(400).json({
      ok: false,
      error: "toLocationId is required",
    });
  }
  if (Number.isNaN(parsedRequestDate)) {
    return res.status(400).json({
      ok: false,
      error: "Invalid requestDate",
    });
  }

  const normalizedItems = (Array.isArray(items) ? items : [])
    .map((item) => ({
      name: String(item.name ?? item.item ?? item.Item ?? "").trim(),
      description:
        normalizeOptionalString(item.description ?? item.Description) ?? null,
      unit: normalizeOptionalString(item.unit ?? item.Unit) ?? "PCS",
      quantity: Number(item.quantity ?? item.Quantity ?? 0) || 0,
    }))
    .filter((item) => item.name && item.quantity > 0);

  if (!normalizedItems.length) {
    return res.status(400).json({
      ok: false,
      error: "At least one reallocation item is required",
    });
  }

  let tx;
  try {
    await ensureReallocateInventoryTables();
    const pkCol = await refreshReallocateInventoryPk();
    const fkCol = await refreshReallocateInventoryItemsFk();
    const pool = await getPool();
    tx = pool.transaction();
    await tx.begin();

    const now = new Date().toISOString();
    const notesPayload = buildReallocateNotesPayload({
      referenceNumber: safeReferenceNumber,
      type: safeType,
      consumptionId: safeConsumptionId,
      consumptionNumber: safeConsumptionNumber,
      projectId: safeProjectId,
      returnVendorId: safeReturnVendorId,
      requestDate: parsedRequestDate?.toISOString?.() ?? requestDate ?? null,
      requestedBy: safeRequestedBy,
      status: safeStatus,
      notes: safeNotes,
      createdAt: now,
      updatedAt: now,
    });

    const insertHeaderReq = new sql.Request(tx);
    insertHeaderReq.input("FromLocationId", sql.Int, safeFromLocationId);
    insertHeaderReq.input("ToLocationId", sql.Int, safeToLocationId);
    insertHeaderReq.input("TransferDate", sql.DateTime, parsedRequestDate ?? null);
    insertHeaderReq.input("Notes", sql.NVarChar(1000), notesPayload);
    const headerResult = await insertHeaderReq.query(`
      INSERT INTO dbo.ReallocateInventory
        (FromLocationId, ToLocationId, TransferDate, Notes)
      OUTPUT INSERTED.*
      VALUES
        (@FromLocationId, @ToLocationId, @TransferDate, @Notes)
    `);

    const headerRow = headerResult.recordset?.[0];
    const transferId =
      headerRow?.[pkCol] ??
      headerRow?.Id ??
      headerRow?.TransferId ??
      null;
    if (!transferId) {
      throw new Error("Failed to create reallocation");
    }

    for (const item of normalizedItems) {
      const insertItemReq = new sql.Request(tx);
      insertItemReq.input("TransferId", sql.Int, transferId);
      insertItemReq.input("Item", sql.NVarChar(200), item.name);
      insertItemReq.input("Description", sql.NVarChar(500), item.description);
      insertItemReq.input("Unit", sql.NVarChar(100), item.unit);
      insertItemReq.input("Quantity", sql.Decimal(18, 2), item.quantity);
      await insertItemReq.query(`
        INSERT INTO dbo.ReallocateInventoryItems
          (${fkCol}, Item, Description, Unit, Quantity)
        VALUES
          (@TransferId, @Item, @Description, @Unit, @Quantity)
      `);
    }

    await tx.commit();

    const itemsResult = await pool
      .request()
      .input("TransferId", sql.Int, transferId)
      .query(`
        SELECT * FROM dbo.ReallocateInventoryItems
        WHERE ${toIdentifier(fkCol)} = @TransferId
      `);

    return res.status(201).json({
      ok: true,
      reallocation: {
        ...normalizeReallocateInventory(headerRow),
        items: (itemsResult.recordset ?? []).map(normalizeReallocateInventoryItem),
      },
    });
  } catch (error) {
    await rollbackTx(tx);
    return res.status(500).json({
      ok: false,
      error: error?.message ?? "Failed to create reallocation",
    });
  }
});

app.put("/api/reallocate-inventory/:id", async (req, res) => {
  const id = Number.parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) {
    return res.status(400).json({
      ok: false,
      error: "Invalid reallocate inventory id",
    });
  }

  const {
    referenceNumber = null,
    type = "Reallocate",
    consumptionId = null,
    consumptionNumber = "",
    projectId = null,
    fromLocationId,
    toLocationId = null,
    returnVendorId = null,
    requestDate = null,
    requestedBy = null,
    status = "Pending",
    notes = null,
    items = [],
  } = req.body ?? {};

  const safeType = String(type ?? "Reallocate").trim() === "Return"
    ? "Return"
    : "Reallocate";
  const safeReferenceNumber = normalizeOptionalString(referenceNumber);
  const safeConsumptionId = toNullableInt(consumptionId);
  const safeConsumptionNumber = normalizeOptionalString(consumptionNumber) ?? "";
  const safeProjectId = toNullableInt(projectId);
  const safeFromLocationId = toNullableInt(fromLocationId);
  const safeToLocationId = toNullableInt(toLocationId);
  const safeReturnVendorId = toNullableInt(returnVendorId);
  const safeRequestedBy = normalizeOptionalString(requestedBy) ?? "";
  const safeStatus = normalizeOptionalString(status) ?? "Pending";
  const safeNotes = normalizeOptionalString(notes) ?? "";
  const parsedRequestDate = parseDateInput(requestDate);

  if (!safeFromLocationId) {
    return res.status(400).json({
      ok: false,
      error: "fromLocationId is required",
    });
  }
  if (safeType === "Reallocate" && !safeToLocationId) {
    return res.status(400).json({
      ok: false,
      error: "toLocationId is required",
    });
  }
  if (Number.isNaN(parsedRequestDate)) {
    return res.status(400).json({
      ok: false,
      error: "Invalid requestDate",
    });
  }

  const normalizedItems = (Array.isArray(items) ? items : [])
    .map((item) => ({
      name: String(item.name ?? item.item ?? item.Item ?? "").trim(),
      description:
        normalizeOptionalString(item.description ?? item.Description) ?? null,
      unit: normalizeOptionalString(item.unit ?? item.Unit) ?? "PCS",
      quantity: Number(item.quantity ?? item.Quantity ?? 0) || 0,
    }))
    .filter((item) => item.name && item.quantity > 0);

  if (!normalizedItems.length) {
    return res.status(400).json({
      ok: false,
      error: "At least one reallocation item is required",
    });
  }

  let tx;
  try {
    await ensureReallocateInventoryTables();
    const pkCol = await refreshReallocateInventoryPk();
    const fkCol = await refreshReallocateInventoryItemsFk();
    const pool = await getPool();
    tx = pool.transaction();
    await tx.begin();

    const currentResult = await new sql.Request(tx)
      .input("TransferId", sql.Int, id)
      .query(`
        SELECT * FROM dbo.ReallocateInventory
        WHERE ${toIdentifier(pkCol)} = @TransferId
      `);

    const currentRow = currentResult.recordset?.[0];
    if (!currentRow) {
      await tx.rollback();
      return res.status(404).json({
        ok: false,
        error: "Reallocate inventory record not found",
      });
    }

    const previousRecord = normalizeReallocateInventory(currentRow);
    const notesPayload = buildReallocateNotesPayload({
      referenceNumber: safeReferenceNumber,
      type: safeType,
      consumptionId: safeConsumptionId,
      consumptionNumber: safeConsumptionNumber,
      projectId: safeProjectId,
      returnVendorId: safeReturnVendorId,
      requestDate: parsedRequestDate?.toISOString?.() ?? requestDate ?? null,
      requestedBy: safeRequestedBy,
      status: safeStatus,
      notes: safeNotes,
      createdAt: previousRecord.createdAt ?? new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const updateHeaderReq = new sql.Request(tx);
    updateHeaderReq.input("TransferId", sql.Int, id);
    updateHeaderReq.input("FromLocationId", sql.Int, safeFromLocationId);
    updateHeaderReq.input("ToLocationId", sql.Int, safeToLocationId);
    updateHeaderReq.input("TransferDate", sql.DateTime, parsedRequestDate ?? null);
    updateHeaderReq.input("Notes", sql.NVarChar(1000), notesPayload);
    const headerResult = await updateHeaderReq.query(`
      UPDATE dbo.ReallocateInventory
      SET FromLocationId = @FromLocationId,
          ToLocationId = @ToLocationId,
          TransferDate = @TransferDate,
          Notes = @Notes
      OUTPUT INSERTED.*
      WHERE ${toIdentifier(pkCol)} = @TransferId
    `);

    const headerRow = headerResult.recordset?.[0];
    if (!headerRow) {
      await tx.rollback();
      return res.status(404).json({
        ok: false,
        error: "Reallocate inventory record not found",
      });
    }

    await new sql.Request(tx)
      .input("TransferId", sql.Int, id)
      .query(`
        DELETE FROM dbo.ReallocateInventoryItems
        WHERE ${toIdentifier(fkCol)} = @TransferId
      `);

    for (const item of normalizedItems) {
      const insertItemReq = new sql.Request(tx);
      insertItemReq.input("TransferId", sql.Int, id);
      insertItemReq.input("Item", sql.NVarChar(200), item.name);
      insertItemReq.input("Description", sql.NVarChar(500), item.description);
      insertItemReq.input("Unit", sql.NVarChar(100), item.unit);
      insertItemReq.input("Quantity", sql.Decimal(18, 2), item.quantity);
      await insertItemReq.query(`
        INSERT INTO dbo.ReallocateInventoryItems
          (${fkCol}, Item, Description, Unit, Quantity)
        VALUES
          (@TransferId, @Item, @Description, @Unit, @Quantity)
      `);
    }

    await tx.commit();

    const itemsResult = await pool
      .request()
      .input("TransferId", sql.Int, id)
      .query(`
        SELECT * FROM dbo.ReallocateInventoryItems
        WHERE ${toIdentifier(fkCol)} = @TransferId
      `);

    return res.json({
      ok: true,
      reallocation: {
        ...normalizeReallocateInventory(headerRow),
        items: (itemsResult.recordset ?? []).map(normalizeReallocateInventoryItem),
      },
    });
  } catch (error) {
    await rollbackTx(tx);
    return res.status(500).json({
      ok: false,
      error: error?.message ?? "Failed to update reallocation",
    });
  }
});

app.delete("/api/reallocate-inventory/:id", async (req, res) => {
  const id = Number.parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) {
    return res.status(400).json({
      ok: false,
      error: "Invalid reallocate inventory id",
    });
  }

  let tx;
  try {
    await ensureReallocateInventoryTables();
    const pkCol = await refreshReallocateInventoryPk();
    const fkCol = await refreshReallocateInventoryItemsFk();
    const pool = await getPool();
    tx = pool.transaction();
    await tx.begin();

    await new sql.Request(tx)
      .input("TransferId", sql.Int, id)
      .query(`
        DELETE FROM dbo.ReallocateInventoryItems
        WHERE ${toIdentifier(fkCol)} = @TransferId
      `);

    const deleteResult = await new sql.Request(tx)
      .input("TransferId", sql.Int, id)
      .query(`
        DELETE FROM dbo.ReallocateInventory
        WHERE ${toIdentifier(pkCol)} = @TransferId
      `);

    await tx.commit();

    if ((deleteResult.rowsAffected?.[0] ?? 0) === 0) {
      return res.status(404).json({
        ok: false,
        error: "Reallocate inventory record not found",
      });
    }

    return res.json({ ok: true });
  } catch (error) {
    await rollbackTx(tx);
    return res.status(500).json({
      ok: false,
      error: error?.message ?? "Failed to delete reallocation",
    });
  }
});

app.use((err, _req, res, _next) => {
  void _next;
  res.status(500).json({
    ok: false,
    error: err?.message ?? "Internal server error",
  });
});

const warmupSchema = async () => {
  try {
    await Promise.all([
      ensureItemsTable(),
      ensureVendorsTable(),
      ensureProjectsTable(),
      ensureLocationsTable(),
      ensurePurchaseTables(),
      ensureReceiveTables(),
      ensureBoqTables(),
      ensureDeliveryChallanTables(),
      ensureConsumptionTables(),
      ensureReallocateInventoryTables(),
    ]);
    console.log("Schema warmup complete");
  } catch (error) {
    console.error("Schema warmup failed:", error?.message ?? error);
  }
};

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

  void warmupSchema();
});
