import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";
import { checkDbConnection, getPool, sql } from "./config/db.js";
import version from "../../scripts/getVersion.js";

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
process.env.APP_VERSION = process.env.APP_VERSION || version;
console.log(`Backend starting with app version: ${process.env.APP_VERSION}`);

app.use(cors());
app.use(express.json({ limit: "25mb" }));

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
const HRMS_DATABASE_NAME =
  String(process.env.HRMS_DB_NAME || process.env.HRMS_DB_DATABASE || "").trim() ||
  "HRMS_DB";
const escapeSqlLiteral = (value) => String(value).replace(/'/g, "''");
const toQualifiedTable = (databaseName, tableName) =>
  `${toIdentifier(databaseName)}.${toIdentifier("dbo")}.${toIdentifier(tableName)}`;
const toObjectNameLiteral = (databaseName, tableName) =>
  escapeSqlLiteral(`${databaseName}.dbo.${tableName}`);
const hrmsTable = (tableName) => toQualifiedTable(HRMS_DATABASE_NAME, tableName);
const hrmsObjectName = (tableName) =>
  toObjectNameLiteral(HRMS_DATABASE_NAME, tableName);

const getSqlErrorNumber = (error) =>
  error?.number ??
  error?.originalError?.info?.number ??
  error?.originalError?.number ??
  error?.info?.number ??
  null;

const getSqlErrorDiagnostics = (error) => {
  const info = error?.originalError?.info ?? error?.info ?? {};
  return {
    message: error?.message ?? String(error),
    stack: error?.stack ?? null,
    sqlNumber: getSqlErrorNumber(error),
    sqlProcedure:
      info?.procName ?? info?.procedure ?? error?.procName ?? error?.procedure ?? null,
    sqlLineNumber:
      info?.lineNumber ?? error?.lineNumber ?? error?.originalError?.lineNumber ?? null,
  };
};

const logBoqSqlStatement = (boqId, label, statement) => {
  console.log("[BOQ SQL]", {
    boqId: toNullableInt(boqId),
    label,
    statement: String(statement).replace(/\s+/g, " ").trim(),
  });
};

const isSqlMissingTableError = (error) => {
  const number = getSqlErrorNumber(error);
  return number === 208 || number === 207;
};
const isSqlForeignKeyViolation = (error) => getSqlErrorNumber(error) === 547;
const isSqlLockTimeoutError = (error) => getSqlErrorNumber(error) === 1222;
const isSqlUniqueConstraintError = (error) => {
  const number = getSqlErrorNumber(error);
  return number === 2627 || number === 2601;
};
const RECEIVE_GOODS_LOCK_TIMEOUT_MS = 5000;
const RECEIVE_GOODS_LOCK_MESSAGE =
  "Receive goods data is temporarily locked by another request. Retry after the current save finishes. If it keeps happening, restart the backend to clear the stuck transaction.";
const withSqlLockTimeout = (query, timeoutMs = RECEIVE_GOODS_LOCK_TIMEOUT_MS) =>
  `SET LOCK_TIMEOUT ${timeoutMs};\n${query}`;

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

const formatPercentageNumber = (value) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return "0";
  }
  const normalized = Number(parsed.toFixed(2));
  if (Number.isInteger(normalized)) {
    return String(normalized);
  }
  return String(normalized).replace(/(\.\d*?)0+$/, "$1");
};

const parseTaxPercentageValue = (value) => {
  if (value === undefined || value === null || value === "") {
    return null;
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  const trimmed = String(value).trim();
  if (!trimmed) {
    return null;
  }
  const match = trimmed.match(/-?\d+(?:\.\d+)?/);
  if (!match) {
    return null;
  }
  const parsed = Number(match[0]);
  return Number.isFinite(parsed) ? parsed : null;
};

const formatTaxPercentageLabel = (value) => {
  const parsed = parseTaxPercentageValue(value);
  return parsed === null ? "" : `${formatPercentageNumber(parsed)}%`;
};

const normalizeBooleanFlag = (value, fallback = false) => {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    return value !== 0;
  }
  const normalized = String(value).trim().toLowerCase();
  if (!normalized) {
    return fallback;
  }
  return !["0", "false", "no", "off"].includes(normalized);
};

const roundCurrencyValue = (value) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return 0;
  }
  return Number(parsed.toFixed(2));
};

const normalizeCurrencyValue = (value, fallback = 0) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return roundCurrencyValue(fallback);
  }
  return roundCurrencyValue(parsed);
};

const normalizeSerialNumbers = (value) => {
  const list = Array.isArray(value)
    ? value
    : typeof value === "string"
    ? value
        .split(/\r?\n|,|;|\t/)
        .map((item) => item.trim())
        .filter(Boolean)
    : [];
  return list.map((item) => String(item ?? "").trim()).filter(Boolean);
};

const serializeJson = (value) => {
  try {
    return JSON.stringify(value ?? null);
  } catch {
    return JSON.stringify(null);
  }
};

const parseJsonArray = (value) => {
  if (!value) {
    return [];
  }
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const parseJsonObject = (value) => {
  if (!value) {
    return {};
  }
  try {
    const parsed = typeof value === "string" ? JSON.parse(value) : value;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed
      : {};
  } catch {
    return {};
  }
};

const buildReceiveTaxBreakdown = ({
  quantity = 0,
  unitPrice = 0,
  taxPercentage = 0,
  taxMode = "intra",
} = {}) => {
  const safeQuantity = Number(quantity) || 0;
  const safeUnitPrice = Number(unitPrice) || 0;
  const safeTaxPercentage = Number(taxPercentage) || 0;
  const taxableAmount = roundCurrencyValue(safeQuantity * safeUnitPrice);
  const gstAmount = roundCurrencyValue((taxableAmount * safeTaxPercentage) / 100);
  const interState = String(taxMode).trim().toLowerCase() === "inter";
  const halfRate = roundCurrencyValue(safeTaxPercentage / 2);
  const halfAmount = roundCurrencyValue(gstAmount / 2);

  return {
    taxableAmount,
    cgstPercent: interState ? 0 : halfRate,
    sgstPercent: interState ? 0 : halfRate,
    igstPercent: interState ? safeTaxPercentage : 0,
    cgstAmount: interState ? 0 : halfAmount,
    sgstAmount: interState ? 0 : halfAmount,
    igstAmount: interState ? gstAmount : 0,
    gstAmount,
  };
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

const DEFAULT_PURCHASE_ORDER_TERMS = `Scope :
• The scope of supply by the Vendor / OEM for includes design, engineering, manufacture, supply (duly packed), inspection, testing (as applicable) including transport, transit insurance, packing and forwarding till site.
• Design responsibility will be in scope of the respective OEM only.
• No deviation is acceptable from Technical / Contractual specification.

Pricing :
• The Prices quoted are in INR
• No variations of any nature shall be allowed except for statuary variations in taxes and duties.
• Prices are valid for entire package as per the Order.

Statutory Levies :
• GST, Sales Tax , VAT , Service Tax, Octroi & any other statutory levies may be charged extra as applicable at the time of invoicing.
• Road permit / Way bill or any other entry permit documents, if applicable to be provided by Vendor.

Invoice :
• Invoice to be raised on : Bangalore Electronics
• Please mention the Bangalore Electronics PO reference in your invoice – This is mandatory for Invoice acceptance.
• The vendor shall include the Billing & Shipping addresses, GSTIN, PAN, CIN, Comprehensive contact details in your Invoice.
• In case of a dispute, the Terms and Conditions (T&C) mentioned in our purchase order will supersede the T&C in your quote / invoice.

Delivery / Billing:
• Delivery Terms: Upon Readiness Within 2-4 Weeks. Tentatively 5th April, 2026.
• Incoterms: DAP Site - Bangalore, including packing & forwarding, loading and unloading charges.
• Vendor to ensure timely submission of documents for customer approval and clearances.
• Delivery terms given above are based on the standard delivery terms of the Vendor/ OEM/ Technology Partner and the same can vary on a case to case basis.
• Vendor responsibility is to supply materials / products as per the PO placed by Bangalore Electronics.
• No extra hidden charges should be levied upon Bangalore Electronics.
• The goods shall be delivered to the site as specified in the PO conditions.

Billing & Shipping Details :
Bangalore Electronics
No. 124, Sadar Patrappa Road,
Bangalore, India – 560002
PAN : AAAFB8092P
GSTIN : 29AAAFB8092P1ZS

Insurance :
• Vendor shall arrange Transit Insurance covering loss or damage occurring while in transit from the vendor's place until arrival at site.

Test / Inspection :
• OEM / Vendor at its own expenses shall carry out required tests / Inspection at manufacturer's place as per requirement approved by Bangalore Electronics.

Quality Control :
• Vendor / OEM shall emphasize extremely on the quality assurance and maintenance aspects as per the standard of industry practice.

Documentation :
• The expected technical documentation includes technical descriptions, Drawings, Catalogues, Data Sheets , BOQ , circuit diagrams, quality assurance plan , maintenance plan including user manual for preventive and corrective maintenance, commissioning instructions, test certificates, assembly and disassembly instructions etc. Vendor shall provide dispatch documents e.g. Tax Invoice, Challan, LR / AWB / Bill of Lading , Packing List , Insurance Certificate , Factory Test Reports , Certificate of Conformance, Warranty Certificate etc.

Quantity Variation :
• Additional Quantity variation will be applicable on the purchase order at the same cost.

Payment Terms :
• For Supply: 100% payment shall be released within 30 days from the date of Goods Receipt at site (GRN) date duly certified by Bangalore Electronics Project Engineer.

Warranty :
• Warranty & support is applicable, including RMA & DOA, will be as per the terms & conditions of the Tender by the OEM.
• Warranty Period: 12 months.

Others :
• General - All other general terms & conditions shall be applicable as per Bangalore Electronics PO.
• This PO may not be used for reference, advertisement or any similar purposes without expressly stated permission.
• Changes or additions to the PO are only effective if they have been confirmed by the End Customer in writing.
• The Customer (or Purchaser) may cancel the PO if the Supplier has not confirmed acceptance of the PO in writing within two weeks of receipt. If the confirmation vary from terms of the PO, the Purchaser is only bound if the Purchaser approves the deviation in writing.
• The goods / materials / licenses supplied by you against our PO will be treated as our property upon acceptance of invoice & is commercially cleared as per the agreed payment terms.

Important:
Terms mentioned in the PO are final. Any discussions or sign off w.r.t terms (if any) with anyone else including the OEM/Vendor, shall not be valid until the same captured in the purchase order & the same accepted by us. Terms of the PO cannot be changed or modified or altered at a later stage for any reason. Vendor to honour the PO terms without any
deviation.

All disputes are subject to Bangalore Jurisdiction only`;

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
  const brandIdColumns = findColumns("BrandId", "brandId", "brand_id");
  const brandColumns = findColumns("Brand", "brand", "BrandName", "brand_name");
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
  const unitColumns = findColumns("unit", "Unit", "measuring_unit", "MeasuringUnit");
  const taxColumns = findColumns(
    "tax_percentage",
    "TaxPercentage",
    "taxPercentage",
    "tax",
    "Tax"
  );
  const serialRequiredColumns = findColumns(
    "serial_required",
    "SerialRequired",
    "serialRequired",
    "IsSerialTracked",
    "isSerialTracked"
  );
  const serialNumberColumns = findColumns(
    "serial_number",
    "SerialNumber",
    "serialNumber",
    "SerialNumbe",
    "serialNumbe"
  );
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
    brandIdColumns,
    brandColumns,
    hsnColumns,
    stockColumns,
    priceColumns,
    gstColumns,
    unitColumns,
    taxColumns,
    serialRequiredColumns,
    serialNumberColumns,
    descriptionColumns,
    createdAtColumns,
    updatedAtColumns,
  };
};

const normalizeItem = (row = {}) => {
  const taxPercentage = parseTaxPercentageValue(
    row.tax_percentage ??
      row.TaxPercentage ??
      row.taxPercentage ??
      row.tax ??
      row.Tax ??
      row.gst_rate ??
      row.GST ??
      row.Gst ??
      row.gst ??
      null
  );
  const gstLabel =
    row.gst_rate ??
    row.GST ??
    row.Gst ??
    row.gst ??
    formatTaxPercentageLabel(taxPercentage);

  return {
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
    brandId: row.BrandId ?? row.brandId ?? row.brand_id ?? null,
    brand:
      row.Brand ??
      row.brand ??
      row.BrandName ??
      row.brandName ??
      row.brand_name ??
      "",
    hsn:
      row.hsn_code ??
      row.HSN ??
      row.HSNCode ??
      row.HsnCode ??
      row.hsn ??
      row.hsnCode ??
      "",
    unit:
      row.Unit ??
      row.unit ??
      row.MeasuringUnit ??
      row.measuringUnit ??
      row.measuring_unit ??
      "PCS",
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
    taxPercentage: taxPercentage ?? 0,
    gst: String(gstLabel ?? "").trim(),
    serialRequired: normalizeBooleanFlag(
      row.serial_required ??
        row.SerialRequired ??
        row.serialRequired ??
        row.IsSerialTracked ??
        row.isSerialTracked,
      false
    ),
    serialNumber:
      row.serial_number ??
      row.SerialNumber ??
      row.SerialNumbe ??
      row.serialNumber ??
      row.serialNumbe ??
      "",
    description:
      row.item_description ??
      row.Description ??
      row.ItemDescription ??
      row.Details ??
      row.description ??
      row.itemDescription ??
      row.details ??
      "",
  };
};

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
  customerId: row.CustomerId ?? row.customerId ?? null,
  clientId: row.CustomerId ?? row.customerId ?? row.ClientId ?? row.clientId ?? null,
  client: row.Client ?? row.client ?? "",
  companyName:
    row.ClientCompany ??
    row.clientCompany ??
    row.CompanyName ??
    row.companyName ??
    "",
  address:
    row.ClientAddress ??
    row.clientAddress ??
    row.Address ??
    row.address ??
    "",
  gstNumber:
    row.ClientGSTNumber ??
    row.ClientGstNumber ??
    row.clientGstNumber ??
    row.gstNumber ??
    "",
  phone:
    row.ClientPhone ??
    row.clientPhone ??
    row.Phone ??
    row.phone ??
    "",
  email:
    row.ClientEmail ??
    row.clientEmail ??
    row.Email ??
    row.email ??
    "",
  contactPerson:
    row.ClientContactPerson ??
    row.clientContactPerson ??
    row.ContactPerson ??
    row.contactPerson ??
    "",
  designation:
    row.ClientDesignation ??
    row.clientDesignation ??
    row.Designation ??
    row.designation ??
    "",
  status: row.Status ?? row.status ?? "",
  startDate: formatDateOnlyValue(row.StartDate ?? row.startDate),
  endDate: formatDateOnlyValue(row.EndDate ?? row.endDate),
  notes: row.Notes ?? row.notes ?? "",
});

const normalizeVendorContact = (row = {}) => ({
  id: row.VendorContactId ?? row.Id ?? row.id ?? null,
  vendorId: row.VendorId ?? row.vendorId ?? null,
  contactName: row.ContactName ?? row.contactName ?? "",
  email: row.Email ?? row.email ?? "",
  designation: row.Designation ?? row.designation ?? "",
  phone: row.Phone ?? row.phone ?? "",
});

const normalizeCustomerContact = (row = {}) => ({
  id: row.CustomerContactId ?? row.Id ?? row.id ?? null,
  customerId: row.CustomerId ?? row.customerId ?? null,
  contactName: row.ContactName ?? row.contactName ?? "",
  email: row.Email ?? row.email ?? "",
  designation: row.Designation ?? row.designation ?? "",
  phone: row.Phone ?? row.phone ?? "",
});

const normalizeVendor = (row = {}) => ({
  id: row.VendorId ?? row.Id ?? row.id ?? null,
  name: row.VendorName ?? row.Name ?? row.name ?? "",
  phone: row.Phone ?? row.phone ?? "",
  email: row.Email ?? row.email ?? "",
  gstNumber: row.GSTNumber ?? row.gstNumber ?? "",
  panNumber: row.PANNumber ?? row.PanNumber ?? row.panNumber ?? "",
  bankAccountName:
    row.BankAccountName ?? row.AccountHolderName ?? row.bankAccountName ?? "",
  bankAccountNumber:
    row.BankAccountNumber ?? row.AccountNumber ?? row.bankAccountNumber ?? "",
  bankName: row.BankName ?? row.bankName ?? "",
  ifscCode: row.IFSCCode ?? row.IfscCode ?? row.ifscCode ?? "",
  bankBranch: row.BankBranch ?? row.bankBranch ?? "",
  documents: Array.isArray(row.documents)
    ? row.documents
    : Array.isArray(row.Documents)
    ? row.Documents
    : parseJsonArray(row.DocumentsJson ?? row.documentsJson),
  address: row.Address ?? row.address ?? "",
  city: row.City ?? row.city ?? "",
  state: row.State ?? row.state ?? "",
  pincode: row.Pincode ?? row.pincode ?? "",
  createdAt: row.CreatedAt ?? row.createdAt ?? null,
  updatedAt: row.UpdatedAt ?? row.updatedAt ?? null,
});

const normalizeCustomer = (row = {}) => ({
  id: row.CustomerId ?? row.customerId ?? row.Id ?? row.id ?? null,
  name: row.CustomerName ?? row.Name ?? row.name ?? "",
  companyName: row.CompanyName ?? row.companyName ?? "",
  address: row.Address ?? row.address ?? "",
  gstNumber: row.GSTNumber ?? row.gstNumber ?? "",
  gstType:
    String(row.GSTType ?? row.gstType ?? "intra")
      .trim()
      .toLowerCase() === "inter"
      ? "inter"
      : "intra",
  city: row.City ?? row.city ?? "",
  state: row.State ?? row.state ?? "",
  pincode: row.Pincode ?? row.pincode ?? "",
  phone: row.ContactNumber ?? row.Phone ?? row.phone ?? "",
  email: row.Email ?? row.email ?? "",
  contactPerson: row.ContactPerson ?? row.contactPerson ?? "",
  designation: row.Designation ?? row.designation ?? "",
  documents: Array.isArray(row.documents)
    ? row.documents
    : Array.isArray(row.Documents)
    ? row.Documents
    : parseJsonArray(row.DocumentsJson ?? row.documentsJson),
  createdAt: row.CreatedAt ?? row.createdAt ?? null,
  updatedAt: row.UpdatedAt ?? row.updatedAt ?? null,
});

const attachCustomerContacts = (customer = {}, contacts = []) => {
  const normalizedContacts = Array.isArray(contacts)
    ? contacts.map(normalizeCustomerContact)
    : [];
  const hasLegacyContact = [
    customer.contactPerson,
    customer.designation,
  ].some((value) => String(value || "").trim());
  const legacyContact = hasLegacyContact
    ? {
        id: null,
        customerId: customer.id ?? null,
        contactName: customer.contactPerson ?? "",
        email: customer.email ?? "",
        designation: customer.designation ?? "",
        phone: customer.phone ?? "",
      }
    : null;
  const resolvedContacts = normalizedContacts.length
    ? normalizedContacts
    : legacyContact
    ? [legacyContact]
    : [];
  const primaryContact = resolvedContacts[0] ?? null;

  return {
    ...customer,
    phone: customer.phone || primaryContact?.phone || "",
    email: customer.email || primaryContact?.email || "",
    contactPerson: customer.contactPerson || primaryContact?.contactName || "",
    designation: customer.designation || primaryContact?.designation || "",
    contacts: resolvedContacts,
  };
};

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
  shipToLocationId:
    row.ShipToLocationId ??
    row.shipToLocationId ??
    row.LocationId ??
    row.locationId ??
    null,
  boqId: row.BOQId ?? row.BoqId ?? row.boqId ?? null,
  orderDate: row.OrderDate ?? row.orderDate ?? null,
  expectedDate:
    row.ExpectedDeliveryDate ??
    row.expectedDate ??
    row.ExpectedDate ??
    null,
  status: row.Status ?? row.status ?? "",
  notes: row.Notes ?? row.notes ?? "",
  termsAndConditions: normalizePurchaseOrderTerms(
    row.TermsAndConditions ?? row.termsAndConditions
  ),
  total: Number(row.Total ?? row.total ?? 0),
});

const normalizePoItem = (row = {}) => {
  const quantity = Number(row.Quantity ?? row.Qty ?? row.quantity ?? 0);
  const unitPrice = Number(
    row.UnitPrice ?? row.unitPrice ?? row.Rate ?? row.rate ?? 0
  );
  return {
    id: row.POItemId ?? row.PurchaseOrderItemId ?? row.Id ?? row.id ?? null,
    poItemId: row.POItemId ?? row.PurchaseOrderItemId ?? row.Id ?? row.id ?? null,
    purchaseOrderId: row.PurchaseOrderId ?? row.purchaseOrderId ?? null,
    itemId: row.ItemId ?? row.itemId ?? null,
    boqItemId: row.BoqItemId ?? row.BOQItemId ?? row.boqItemId ?? null,
    name: row.ItemName ?? row.Name ?? row.name ?? "",
    description: row.Description ?? row.description ?? "",
    unit: row.Unit ?? row.unit ?? "PCS",
    hsn: row.HSN ?? row.hsn ?? row.Hsn ?? "",
    gst: row.GST ?? row.gst ?? row.Gst ?? "",
    serialNumber: row.SerialNumber ?? row.serialNumber ?? "",
    serialRequired: normalizeBooleanFlag(
      row.SerialRequired ?? row.serialRequired ?? row.IsSerialTracked,
      false
    ),
    taxPercentage:
      parseTaxPercentageValue(
        row.TaxPercentage ??
          row.taxPercentage ??
          row.GST ??
          row.gst ??
          row.Gst ??
          null
      ) ?? 0,
    quantity,
    unitPrice,
    totalPrice:
      Number(row.TotalPrice ?? row.totalPrice ?? row.Total ?? 0) ||
      quantity * unitPrice,
    location: row.Location ?? row.location ?? row.Notes ?? row.notes ?? "",
    shipTo: row.Location ?? row.location ?? row.Notes ?? row.notes ?? "",
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

const normalizeLinkedPurchaseOrderSummary = (row = {}) => ({
  id: row.Id ?? row.id ?? row.PurchaseOrderId ?? null,
  boqId: row.BOQId ?? row.boqId ?? row.BoqId ?? null,
  poNumber: row.PONumber ?? row.poNumber ?? "",
  status: row.Status ?? row.status ?? "",
  orderDate: row.OrderDate ?? row.orderDate ?? null,
  expectedDate:
    row.ExpectedDeliveryDate ??
    row.expectedDeliveryDate ??
    row.ExpectedDate ??
    row.expectedDate ??
    null,
  total: Number(row.Total ?? row.total ?? 0) || 0,
  updatedAt: row.UpdatedAt ?? row.updatedAt ?? row.CreatedAt ?? row.createdAt ?? null,
});

const loadLinkedPurchaseOrdersByBoqIds = async (db, boqIds = []) => {
  const ids = Array.from(
    new Set(
      (Array.isArray(boqIds) ? boqIds : [])
        .map((value) => toNullableInt(value))
        .filter((value) => value !== null)
    )
  );
  if (!ids.length) {
    return new Map();
  }

  await ensurePurchaseTables();

  const request = new sql.Request(db);
  const inClause = buildPurchaseOrderItemInClause(request, ids, "BoqId");
  const result = await request.query(`
    SELECT
      Id,
      BOQId,
      PONumber,
      Status,
      OrderDate,
      ExpectedDate,
      ExpectedDeliveryDate,
      Total,
      UpdatedAt,
      CreatedAt
    FROM dbo.PurchaseOrders
    WHERE BOQId IN (${inClause})
    ORDER BY BOQId ASC, COALESCE(UpdatedAt, CreatedAt, OrderDate) DESC, Id DESC
  `);

  return (result.recordset ?? []).reduce((acc, row) => {
    const boqId = toNullableInt(row.BOQId);
    if (boqId === null) {
      return acc;
    }
    if (!acc.has(boqId)) {
      acc.set(boqId, []);
    }
    acc.get(boqId).push(normalizeLinkedPurchaseOrderSummary(row));
    return acc;
  }, new Map());
};

const loadLinkedPurchaseOrderItemsByBoqIds = async (db, boqIds = []) => {
  const ids = Array.from(
    new Set(
      (Array.isArray(boqIds) ? boqIds : [])
        .map((value) => toNullableInt(value))
        .filter((value) => value !== null)
    )
  );
  if (!ids.length) {
    return new Map();
  }

  await ensurePurchaseTables();

  const request = new sql.Request(db);
  const inClause = buildPurchaseOrderItemInClause(request, ids, "BoqLinkedItemId");
  const result = await request.query(`
    SELECT
      po.BOQId,
      po.Id AS PurchaseOrderId,
      po.UpdatedAt AS PurchaseOrderUpdatedAt,
      poi.*
    FROM dbo.PurchaseOrders po
    INNER JOIN dbo.PurchaseOrderItems poi
      ON poi.PurchaseOrderId = po.Id
    WHERE po.BOQId IN (${inClause})
    ORDER BY po.BOQId ASC, COALESCE(po.UpdatedAt, po.CreatedAt, po.OrderDate) DESC, poi.POItemId ASC
  `);

  return (result.recordset ?? []).reduce((acc, row) => {
    const boqId = toNullableInt(row.BOQId);
    if (boqId === null) {
      return acc;
    }
    if (!acc.has(boqId)) {
      acc.set(boqId, []);
    }
    acc.get(boqId).push(normalizePoItem(row));
    return acc;
  }, new Map());
};

const attachLinkedPurchaseOrdersToBoqs = async (db, boqs = []) => {
  const normalizedBoqs = Array.isArray(boqs) ? boqs : [];
  if (!normalizedBoqs.length) {
    return [];
  }

  const boqIds = normalizedBoqs.map((boq) => boq?.id);
  const [linkedPurchaseOrdersByBoqId, linkedPurchaseOrderItemsByBoqId] =
    await Promise.all([
      loadLinkedPurchaseOrdersByBoqIds(db, boqIds),
      loadLinkedPurchaseOrderItemsByBoqIds(db, boqIds),
    ]);

  return normalizedBoqs.map((boq) => {
    const linkedPurchaseOrders = linkedPurchaseOrdersByBoqId.get(boq.id) ?? [];
    const linkedPurchaseOrderItems =
      linkedPurchaseOrderItemsByBoqId.get(boq.id) ?? [];
    return {
      ...boq,
      linkedPurchaseOrders,
      linkedPurchaseOrderItems,
      linkedPurchaseOrderCount: linkedPurchaseOrders.length,
      latestPurchaseOrder: linkedPurchaseOrders[0] ?? null,
    };
  });
};

const normalizeBoqItem = (row = {}) => {
  const quantity =
    Number(
      row.Quantity ??
        row.quantity ??
        row.UnitQty ??
        row.unitQty ??
        row.UnitQuantity ??
        row.unitQuantity ??
        row.Qty ??
        row.qty ??
        0
    ) || 0;
  const rate = Number(row.Rate ?? row.rate ?? 0) || 0;
  const itemId = toNullableInt(
    row.ItemId ?? row.itemId ?? row.InventoryItemId ?? row.inventoryItemId
  );
  const inventoryQtyRaw =
    row.InventoryQty ??
    row.inventoryQty ??
    row.CurrentStock ??
    row.currentStock ??
    row.Stock ??
    row.stock ??
    null;
  const inventoryQty = Number.isFinite(Number(inventoryQtyRaw))
    ? Number(inventoryQtyRaw)
    : null;
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
    itemId,
    name: row.ItemName ?? row.name ?? "",
    description: row.Description ?? row.description ?? "",
    serialNumber: row.SerialNumber ?? row.serialNumber ?? "",
    unit: row.Unit ?? row.unit ?? "",
    hsn: row.HSN ?? row.hsn ?? row.Hsn ?? "",
    gst: row.GST ?? row.gst ?? row.Gst ?? "",
    taxPercentage:
      parseTaxPercentageValue(
        row.TaxPercentage ??
          row.taxPercentage ??
          row.GST ??
          row.gst ??
          row.Gst ??
          null
      ) ?? 0,
    quantity,
    consumedQty,
    availableQty,
    inventoryQty,
    currentStock: inventoryQty,
    stock: inventoryQty,
    rate,
    unitPrice: rate,
    notes: row.Notes ?? row.notes ?? "",
    amount: quantity * rate,
  };
};

const hydrateBoqItemsWithInventoryStock = async (items = []) => {
  if (!Array.isArray(items) || !items.length) {
    return items;
  }

  const itemSchema = await resolveItemsSchema();
  if (!itemSchema.idColumn || !itemSchema.stockColumns.length) {
    return items;
  }

  const pool = await getPool();
  const result = await pool.request().query(`
    SELECT
      ${buildIdCoalesceExpr(itemSchema.idColumns)} AS [id],
      ${buildTextCoalesceExpr(itemSchema.nameColumns)} AS [name],
      ${buildTextCoalesceExpr(itemSchema.unitColumns, "N'PCS'")} AS [unit],
      ${buildNumberCoalesceExpr(itemSchema.stockColumns)} AS [stock]
    FROM dbo.Items
  `);

  const inventoryRows = (result.recordset ?? []).map(normalizeItem);
  const byId = new Map();
  const byNameUnit = new Map();
  const byName = new Map();
  inventoryRows.forEach((item) => {
    const id = toNullableInt(item.id);
    if (id !== null) {
      byId.set(String(id), item);
    }
    const name = String(item.name ?? "").trim().toLowerCase();
    const unit = String(item.unit ?? "").trim().toLowerCase();
    if (name && unit && !byNameUnit.has(`${name}|${unit}`)) {
      byNameUnit.set(`${name}|${unit}`, item);
    }
    if (name && !byName.has(name)) {
      byName.set(name, item);
    }
  });

  return items.map((item) => {
    const itemId = toNullableInt(item.itemId);
    const name = String(item.name ?? "").trim().toLowerCase();
    const unit = String(item.unit ?? "").trim().toLowerCase();
    const inventoryItem =
      (itemId !== null ? byId.get(String(itemId)) : null) ??
      (name && unit ? byNameUnit.get(`${name}|${unit}`) : null) ??
      (name ? byName.get(name) : null);

    if (!inventoryItem) {
      return item;
    }

    const stock = Number(inventoryItem.stock ?? inventoryItem.currentStock ?? 0) || 0;
    return {
      ...item,
      itemId: item.itemId ?? inventoryItem.id ?? null,
      inventoryQty: stock,
      currentStock: stock,
      stock,
    };
  });
};

const POD_STATUS = Object.freeze({
  PENDING: "POD_PENDING",
  UPLOADED: "POD_UPLOADED",
  UNDER_VERIFICATION: "POD_UNDER_VERIFICATION",
  VERIFIED: "POD_VERIFIED",
  REJECTED: "POD_REJECTED",
  DISPUTED: "POD_DISPUTED",
  WAIVED: "POD_WAIVED",
});

const POD_STATUS_ALIASES = new Map([
  ["", POD_STATUS.PENDING],
  ["pending", POD_STATUS.PENDING],
  ["pod pending", POD_STATUS.PENDING],
  ["pod_pending", POD_STATUS.PENDING],
  ["uploaded", POD_STATUS.UPLOADED],
  ["pod uploaded", POD_STATUS.UPLOADED],
  ["pod_uploaded", POD_STATUS.UPLOADED],
  ["under verification", POD_STATUS.UNDER_VERIFICATION],
  ["pod under verification", POD_STATUS.UNDER_VERIFICATION],
  ["pod_under_verification", POD_STATUS.UNDER_VERIFICATION],
  ["verified", POD_STATUS.VERIFIED],
  ["pod verified", POD_STATUS.VERIFIED],
  ["pod_verified", POD_STATUS.VERIFIED],
  ["received", POD_STATUS.VERIFIED],
  ["delivered", POD_STATUS.VERIFIED],
  ["rejected", POD_STATUS.REJECTED],
  ["pod rejected", POD_STATUS.REJECTED],
  ["pod_rejected", POD_STATUS.REJECTED],
  ["disputed", POD_STATUS.DISPUTED],
  ["pod disputed", POD_STATUS.DISPUTED],
  ["pod_disputed", POD_STATUS.DISPUTED],
  ["waived", POD_STATUS.WAIVED],
  ["pod waived", POD_STATUS.WAIVED],
  ["not required", POD_STATUS.WAIVED],
  ["pod_waived", POD_STATUS.WAIVED],
]);

const normalizePodStatus = (value) => {
  const raw = String(value ?? "").trim();
  if (Object.values(POD_STATUS).includes(raw)) {
    return raw;
  }
  const key = raw.replace(/\s+/g, " ").toLowerCase();
  return POD_STATUS_ALIASES.get(key) ?? POD_STATUS.PENDING;
};

const isPodReviewerRole = (role) =>
  ["admin", "manager"].includes(String(role ?? "").trim().toLowerCase());

const buildPodActor = (body = {}) => ({
  name:
    normalizeOptionalString(
      body.auditBy ?? body.performedBy ?? body.userName ?? body.uploadedBy
    ) ?? "System",
  role: normalizeOptionalString(body.auditRole ?? body.performedRole ?? body.role) ?? "User",
});

const ensurePodReviewer = (actor) => {
  if (!isPodReviewerRole(actor?.role)) {
    const error = new Error("Only Admin or Manager users can approve POD workflow actions.");
    error.statusCode = 403;
    throw error;
  }
};

const hasPodDocument = (row = {}) =>
  Boolean(
    normalizeOptionalString(row.PODDocumentData ?? row.podDocumentData) ||
      normalizeOptionalString(row.PODDocumentName ?? row.podDocumentName)
  );

const normalizeDeliveryChallanPodAuditEntry = (row = {}) => ({
  id: row.AuditId ?? row.id ?? null,
  auditId: row.AuditId ?? row.auditId ?? null,
  deliveryChallanId: row.DeliveryChallanId ?? row.deliveryChallanId ?? null,
  actionName: row.ActionName ?? row.actionName ?? "",
  action: row.ActionName ?? row.action ?? "",
  fromStatus: normalizePodStatus(row.FromStatus ?? row.fromStatus),
  toStatus: normalizePodStatus(row.ToStatus ?? row.toStatus),
  performedBy: row.PerformedBy ?? row.performedBy ?? "",
  performedRole: row.PerformedRole ?? row.performedRole ?? "",
  remarks: row.Remarks ?? row.remarks ?? "",
  snapshotJson: row.SnapshotJson ?? row.snapshotJson ?? null,
  createdAt: row.CreatedAt ?? row.createdAt ?? null,
});

const writeDeliveryChallanPodAuditLog = async (
  tx,
  {
    deliveryChallanId,
    actionName,
    fromStatus,
    toStatus,
    performedBy,
    performedRole,
    remarks = null,
    snapshot = null,
  }
) => {
  await new sql.Request(tx)
    .input("DeliveryChallanId", sql.BigInt, toNullableInt(deliveryChallanId))
    .input("ActionName", sql.NVarChar(50), normalizeOptionalString(actionName) ?? "POD_UPDATE")
    .input("FromStatus", sql.NVarChar(50), normalizePodStatus(fromStatus))
    .input("ToStatus", sql.NVarChar(50), normalizePodStatus(toStatus))
    .input("PerformedBy", sql.NVarChar(255), normalizeOptionalString(performedBy) ?? null)
    .input("PerformedRole", sql.NVarChar(100), normalizeOptionalString(performedRole) ?? null)
    .input("Remarks", sql.NVarChar(sql.MAX), normalizeOptionalString(remarks) ?? null)
    .input("Snapshot", sql.NVarChar(sql.MAX), serializeJson(snapshot))
    .query(`
      INSERT INTO dbo.DeliveryChallanPODAuditLog
        (DeliveryChallanId, ActionName, FromStatus, ToStatus, PerformedBy, PerformedRole, Remarks, SnapshotJson)
      VALUES
        (@DeliveryChallanId, @ActionName, @FromStatus, @ToStatus, @PerformedBy, @PerformedRole, @Remarks, @Snapshot)
    `);
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
    receiveGoodsId: row.ReceiveGoodsId ?? row.receiveGoodsId ?? null,
    receiveGoodsIds: Array.isArray(row.receiveGoodsIds)
      ? row.receiveGoodsIds
      : Array.isArray(row.ReceiveGoodsIds)
      ? row.ReceiveGoodsIds
      : [],
    fromLocationId: row.FromLocationId ?? row.fromLocationId ?? null,
    toLocationId: row.ToLocationId ?? row.toLocationId ?? null,
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
    podStatus: normalizePodStatus(row.PODStatus ?? row.podStatus),
    podReference: row.PODReference ?? row.podReference ?? "",
    podDate: row.PODDate ?? row.podDate ?? null,
    podDocumentName: row.PODDocumentName ?? row.podDocumentName ?? "",
    podDocumentType: row.PODDocumentType ?? row.podDocumentType ?? "",
    podDocumentSize: Number(row.PODDocumentSize ?? row.podDocumentSize ?? 0) || 0,
    podDocumentData: row.PODDocumentData ?? row.podDocumentData ?? "",
    podUploadedAt: row.PODUploadedAt ?? row.podUploadedAt ?? null,
    podUploadedBy: row.PODUploadedBy ?? row.podUploadedBy ?? "",
    podVerifiedAt: row.PODVerifiedAt ?? row.podVerifiedAt ?? null,
    podVerifiedBy: row.PODVerifiedBy ?? row.podVerifiedBy ?? "",
    podRejectedAt: row.PODRejectedAt ?? row.podRejectedAt ?? null,
    podRejectedBy: row.PODRejectedBy ?? row.podRejectedBy ?? "",
    podRejectionRemarks:
      row.PODRejectionRemarks ?? row.podRejectionRemarks ?? "",
    podDisputedAt: row.PODDisputedAt ?? row.podDisputedAt ?? null,
    podDisputedBy: row.PODDisputedBy ?? row.podDisputedBy ?? "",
    podDisputeRemarks: row.PODDisputeRemarks ?? row.podDisputeRemarks ?? "",
    podResolvedAt: row.PODResolvedAt ?? row.podResolvedAt ?? null,
    podResolvedBy: row.PODResolvedBy ?? row.podResolvedBy ?? "",
    podResolutionRemarks:
      row.PODResolutionRemarks ?? row.podResolutionRemarks ?? "",
    podWaivedAt: row.PODWaivedAt ?? row.podWaivedAt ?? null,
    podWaivedBy: row.PODWaivedBy ?? row.podWaivedBy ?? "",
    podWaiverReason: row.PODWaiverReason ?? row.podWaiverReason ?? "",
    podWaiverApprovedBy:
      row.PODWaiverApprovedBy ?? row.podWaiverApprovedBy ?? "",
    notes: row.Notes ?? row.notes ?? "",
    deliveredQty: Number(row.DeliveredQty ?? row.deliveredQty ?? 0) || 0,
    consumedQty: Number(row.ConsumedQty ?? row.consumedQty ?? 0) || 0,
    balanceQty: Number(row.BalanceQty ?? row.balanceQty ?? 0) || 0,
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
  deliveryChallanItemId:
    row.DeliveryChallanItemId ??
    row.deliveryChallanItemId ??
    row.DeliveryChallanLineItemId ??
    row.deliveryChallanLineItemId ??
    row.Id ??
    row.id ??
    null,
  receiveGoodsItemId:
    row.ReceiveGoodsItemId ?? row.receiveGoodsItemId ?? null,
  sourceType: row.SourceType ?? row.sourceType ?? "",
  sourceKey: row.SourceKey ?? row.sourceKey ?? "",
  sourceRef: row.SourceRef ?? row.sourceRef ?? "",
  poItemId:
    row.PurchaseOrderItemId ??
    row.purchaseOrderItemId ??
    row.POItemId ??
    row.poItemId ??
    null,
  itemId: row.ItemId ?? row.itemId ?? null,
  name: row.ItemName ?? row.itemName ?? row.Name ?? row.name ?? "",
  description: row.Description ?? row.description ?? "",
  unit: row.Unit ?? row.unit ?? "PCS",
  hsn: row.HSN ?? row.hsn ?? row.Hsn ?? "",
  gst: row.GST ?? row.gst ?? row.Gst ?? "",
  quantity: Number(row.Quantity ?? row.quantity ?? 0) || 0,
  rate: Number(row.Rate ?? row.rate ?? 0) || 0,
  notes: row.Notes ?? row.notes ?? "",
});

const deriveDeliveryChallanReceiveGoodsIds = (
  challan = {},
  challanItems = [],
  receiveGoodsIdByItemId = new Map()
) => {
  const derivedIds = uniqueReceiveGoodsIds(
    (Array.isArray(challanItems) ? challanItems : []).map((item) => {
      const receiveGoodsItemId = toNullableInt(
        item.receiveGoodsItemId ?? item.ReceiveGoodsItemId
      );
      if (receiveGoodsItemId === null) {
        return null;
      }
      return toNullableInt(receiveGoodsIdByItemId.get(receiveGoodsItemId));
    })
  );

  if (derivedIds.length) {
    return derivedIds;
  }
  const fallbackId = toNullableInt(challan.receiveGoodsId ?? challan.ReceiveGoodsId);
  return fallbackId === null ? [] : [fallbackId];
};

const normalizeInventoryKeyValue = (value = "") =>
  String(value ?? "").trim().toLowerCase();

const buildInventoryMaterialKey = (item = {}) => {
  const normalizedName = normalizeInventoryKeyValue(
    item.name ?? item.ItemName ?? item.item ?? item.Item ?? ""
  );
  if (!normalizedName) {
    return "";
  }
  const normalizedUnit =
    normalizeInventoryKeyValue(item.unit ?? item.Unit ?? "PCS") || "pcs";
  return `${normalizedName}::${normalizedUnit}`;
};

const buildDeliveryChallanMaterialGroups = (items = []) => {
  const groups = new Map();
  const sourceKeyToGroupKey = new Map();
  const deliveryChallanItemIdToGroupKey = new Map();
  const receiveGoodsItemIdToMaterialKey = new Map();

  (Array.isArray(items) ? items : []).forEach((item) => {
    const materialKey = buildInventoryMaterialKey(item);
    if (!materialKey) {
      return;
    }

    const explicitSourceKey = normalizeOptionalString(
      item.sourceKey ?? item.SourceKey
    );
    const deliveryChallanItemId = toNullableInt(
      item.deliveryChallanItemId ??
        item.DeliveryChallanItemId ??
        item.deliveryChallanLineItemId ??
        item.DeliveryChallanLineItemId ??
        item.id ??
        item.Id
    );
    const deliveredQty = Number(item.quantity ?? item.Quantity ?? 0) || 0;
    const groupKey =
      explicitSourceKey ??
      (deliveryChallanItemId !== null
        ? `delivery-challan-item:${deliveryChallanItemId}`
        : materialKey);
    if (!groups.has(groupKey)) {
      groups.set(groupKey, {
        groupKey,
        materialKey,
        name: item.name ?? item.ItemName ?? "Item",
        unit: item.unit ?? item.Unit ?? "PCS",
        deliveredQty: 0,
        consumedQty: 0,
      });
    }

    const group = groups.get(groupKey);
    group.deliveredQty += deliveredQty;

    if (explicitSourceKey) {
      sourceKeyToGroupKey.set(explicitSourceKey, groupKey);
    }

    if (deliveryChallanItemId !== null) {
      deliveryChallanItemIdToGroupKey.set(deliveryChallanItemId, groupKey);
    }

    const receiveGoodsItemId = toNullableInt(
      item.receiveGoodsItemId ?? item.ReceiveGoodsItemId
    );
    if (receiveGoodsItemId !== null) {
      receiveGoodsItemIdToMaterialKey.set(receiveGoodsItemId, groupKey);
    }
  });

  return {
    groups,
    sourceKeyToGroupKey,
    deliveryChallanItemIdToGroupKey,
    receiveGoodsItemIdToMaterialKey,
  };
};

const resolveDeliveryChallanMaterialKey = (
  item = {},
  groups = new Map(),
  sourceKeyToGroupKey = new Map(),
  deliveryChallanItemIdToGroupKey = new Map(),
  receiveGoodsItemIdToMaterialKey = new Map()
) => {
  const explicitSourceKey = normalizeOptionalString(
    item.sourceKey ?? item.SourceKey
  );
  if (explicitSourceKey && sourceKeyToGroupKey.has(explicitSourceKey)) {
    return sourceKeyToGroupKey.get(explicitSourceKey);
  }

  const deliveryChallanItemId = toNullableInt(
    item.deliveryChallanItemId ??
      item.DeliveryChallanItemId ??
      item.deliveryChallanLineItemId ??
      item.DeliveryChallanLineItemId
  );
  if (
    deliveryChallanItemId !== null &&
    deliveryChallanItemIdToGroupKey.has(deliveryChallanItemId)
  ) {
    return deliveryChallanItemIdToGroupKey.get(deliveryChallanItemId);
  }

  const receiveGoodsItemId = toNullableInt(
    item.receiveGoodsItemId ?? item.ReceiveGoodsItemId
  );
  if (
    receiveGoodsItemId !== null &&
    receiveGoodsItemIdToMaterialKey.has(receiveGoodsItemId)
  ) {
    return receiveGoodsItemIdToMaterialKey.get(receiveGoodsItemId);
  }

  const materialKey = buildInventoryMaterialKey(item);
  return materialKey && groups.has(materialKey) ? materialKey : null;
};

const isConsumptionLinkedToDeliveryChallan = (consumption = {}, challan = {}) => {
  const challanId = toNullableInt(challan.id ?? challan.deliveryChallanId);
  const consumptionChallanId = toNullableInt(consumption.deliveryChallanId);
  if (challanId !== null && consumptionChallanId === challanId) {
    return true;
  }

  const challanRef = normalizeInventoryKeyValue(
    challan.dcNumber ?? challan.DCNumber ?? ""
  );
  const consumptionRef = normalizeInventoryKeyValue(
    consumption.deliveryChallanRef ?? consumption.DeliveryChallanRef ?? ""
  );

  return Boolean(challanRef && consumptionRef && challanRef === consumptionRef);
};

const isConsumptionItemLinkedToDeliveryChallan = (
  item = {},
  consumption = {},
  challan = {},
  challanItemIds = new Set()
) => {
  const challanId = toNullableInt(challan.id ?? challan.deliveryChallanId);
  const itemChallanId = toNullableInt(
    item.deliveryChallanId ?? item.DeliveryChallanId ?? item.ChallanId
  );
  if (itemChallanId !== null) {
    return challanId !== null && itemChallanId === challanId;
  }

  const sourceKey = normalizeInventoryKeyValue(item.sourceKey ?? item.SourceKey);
  const sourceDcMatch = /^dc:(\d+):/i.exec(sourceKey);
  if (sourceDcMatch) {
    return challanId !== null && Number(sourceDcMatch[1]) === challanId;
  }

  const deliveryChallanItemId = toNullableInt(
    item.deliveryChallanItemId ??
      item.DeliveryChallanItemId ??
      item.deliveryChallanLineItemId ??
      item.DeliveryChallanLineItemId
  );
  if (deliveryChallanItemId !== null) {
    return challanItemIds.has(deliveryChallanItemId);
  }

  // Legacy consumption rows may predate item-level source identifiers. Only
  // those rows are allowed to fall back to their header DC reference.
  return isConsumptionLinkedToDeliveryChallan(consumption, challan);
};

const buildDeliveryChallanMetrics = (
  challan = {},
  challanItems = [],
  consumptions = []
) => {
  const {
    groups,
    sourceKeyToGroupKey,
    deliveryChallanItemIdToGroupKey,
    receiveGoodsItemIdToMaterialKey,
  } =
    buildDeliveryChallanMaterialGroups(challanItems);
  const challanItemIds = new Set(
    (Array.isArray(challanItems) ? challanItems : [])
      .map((item) =>
        toNullableInt(
          item.deliveryChallanItemId ??
            item.DeliveryChallanItemId ??
            item.deliveryChallanLineItemId ??
            item.DeliveryChallanLineItemId ??
            item.id ??
            item.Id
        )
      )
      .filter((id) => id !== null)
  );

  (Array.isArray(consumptions) ? consumptions : []).forEach((consumption) => {
    (consumption.items || []).forEach((item) => {
      if (
        !isConsumptionItemLinkedToDeliveryChallan(
          item,
          consumption,
          challan,
          challanItemIds
        )
      ) {
        return;
      }

      const materialKey = resolveDeliveryChallanMaterialKey(
        item,
        groups,
        sourceKeyToGroupKey,
        deliveryChallanItemIdToGroupKey,
        receiveGoodsItemIdToMaterialKey
      );
      if (!materialKey) {
        return;
      }

      const group = groups.get(materialKey);
      group.consumedQty += Number(item.quantity ?? item.Quantity ?? 0) || 0;
    });
  });

  let deliveredQty = 0;
  let consumedQty = 0;
  let balanceQty = 0;

  groups.forEach((group) => {
    deliveredQty += group.deliveredQty;
    consumedQty += group.consumedQty;
    balanceQty += Math.max(group.deliveredQty - group.consumedQty, 0);
  });

  return {
    deliveredQty,
    consumedQty,
    balanceQty,
  };
};

const normalizeConsumption = (row = {}) => {
  const id = row.ConsumptionId ?? row.consumptionId ?? row.Id ?? row.id ?? null;
  const deliveryChallanIds = parseJsonArray(
    row.DeliveryChallanIds ?? row.deliveryChallanIds ?? row.DeliveryChallanIdsJson
  )
    .map((value) => toNullableInt(value))
    .filter((value) => value !== null);
  const primaryDeliveryChallanId = toNullableInt(
    row.DeliveryChallanId ?? row.deliveryChallanId ?? row.DeliverychallanId
  );
  return {
    id,
    consumptionId: id,
    consumptionNumber: row.ConsumptionNumber ?? row.consumptionNumber ?? "",
    projectId: row.ProjectId ?? row.projectId ?? null,
    fromLocationId: row.FromLocationId ?? row.fromLocationId ?? null,
    locationId: row.LocationId ?? row.locationId ?? null,
    receiveGoodsId: row.ReceiveGoodsId ?? row.receiveGoodsId ?? null,
    deliveryChallanId: primaryDeliveryChallanId,
    deliveryChallanIds: deliveryChallanIds.length
      ? deliveryChallanIds
      : primaryDeliveryChallanId !== null
      ? [primaryDeliveryChallanId]
      : [],
    deliveryChallanRef:
      row.DeliveryChallanRef ??
      row.deliveryChallanRef ??
      row.DCReference ??
      row.dcReference ??
      "",
    consumptionDate:
      row.ConsumptionDate ?? row.consumptionDate ?? row.Date ?? row.date ?? null,
    issuedBy: row.IssuedBy ?? row.issuedBy ?? "",
    status: row.Status ?? row.status ?? "Logged",
    notes: row.Notes ?? row.notes ?? "",
    companyAddress: row.CompanyAddress ?? row.companyAddress ?? "",
    companyGstin:
      row.CompanyGstin ??
      row.companyGstin ??
      row.CompanyGSTIN ??
      row.companyGSTIN ??
      "",
    companyPhone: row.CompanyPhone ?? row.companyPhone ?? "",
    companyEmail: row.CompanyEmail ?? row.companyEmail ?? "",
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
  itemId: row.ItemId ?? row.itemId ?? null,
  deliveryChallanId:
    row.DeliveryChallanId ?? row.deliveryChallanId ?? row.ChallanId ?? null,
  deliveryChallanItemId:
    row.DeliveryChallanItemId ??
    row.deliveryChallanItemId ??
    row.DeliveryChallanLineItemId ??
    row.deliveryChallanLineItemId ??
    null,
  receiveGoodsItemId:
    row.ReceiveGoodsItemId ?? row.receiveGoodsItemId ?? null,
  sourceType: row.SourceType ?? row.sourceType ?? "",
  sourceKey: row.SourceKey ?? row.sourceKey ?? "",
  name: row.Item ?? row.item ?? row.Name ?? row.name ?? "",
  description: row.Description ?? row.description ?? "",
  unit: row.Unit ?? row.unit ?? "PCS",
  hsn: row.HSN ?? row.hsn ?? row.Hsn ?? "",
  gst: row.GST ?? row.gst ?? row.Gst ?? "",
  quantity: Number(row.Quantity ?? row.quantity ?? 0) || 0,
  consumeQty: Number(row.Quantity ?? row.quantity ?? 0) || 0,
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
    referenceType:
      metadata.referenceType ??
      (metadata.consumptionId ? "consumption" : ""),
    referenceId:
      metadata.referenceId ?? metadata.consumptionId ?? null,
    referenceNo:
      metadata.referenceNo ??
      metadata.consumptionNumber ??
      "",
    type: metadata.type === "Return" ? "Return" : "Reallocate",
    consumptionId: metadata.consumptionId ?? null,
    consumptionNumber: metadata.consumptionNumber ?? "",
    projectId: row.ProjectId ?? row.projectId ?? metadata.projectId ?? null,
    sourceProjectId: metadata.sourceProjectId ?? null,
    fromLocationId: row.FromLocationId ?? row.fromLocationId ?? null,
    toLocationId: row.ToLocationId ?? row.toLocationId ?? null,
    returnVendorId: metadata.returnVendorId ?? null,
    requestDate:
      row.TransferDate ?? row.transferDate ?? metadata.requestDate ?? null,
    transferDate: row.TransferDate ?? row.transferDate ?? null,
    requestedBy: metadata.requestedBy ?? "",
    eWayBillNumber: metadata.eWayBillNumber ?? "",
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
  receiveGoodsItemId:
    row.ReceiveGoodsItemId ?? row.receiveGoodsItemId ?? null,
  deliveryChallanId:
    row.DeliveryChallanId ?? row.deliveryChallanId ?? row.ChallanId ?? null,
  deliveryChallanItemId:
    row.DeliveryChallanItemId ??
    row.deliveryChallanItemId ??
    row.DeliveryChallanLineItemId ??
    row.deliveryChallanLineItemId ??
    null,
  sourceType: row.SourceType ?? row.sourceType ?? "",
  sourceKey: row.SourceKey ?? row.sourceKey ?? "",
  sourceRef: row.SourceRef ?? row.sourceRef ?? "",
  item: row.Item ?? row.item ?? row.Name ?? row.name ?? "",
  name: row.Item ?? row.item ?? row.Name ?? row.name ?? "",
  description: row.Description ?? row.description ?? "",
  unit: row.Unit ?? row.unit ?? "PCS",
  quantity: Number(row.Quantity ?? row.quantity ?? 0) || 0,
});
const generateReallocateReferenceNumber = (id) => `REL-${id}`;
const buildReallocateNotesPayload = ({
  referenceNumber = null,
  referenceType = null,
  referenceId = null,
  referenceNo = "",
  type = "Reallocate",
  consumptionId = null,
  consumptionNumber = "",
  projectId = null,
  sourceProjectId = null,
  returnVendorId = null,
  requestDate = null,
  requestedBy = "",
  eWayBillNumber = "",
  status = "Pending",
  notes = "",
  createdAt = null,
  updatedAt = null,
} = {}) =>
  JSON.stringify({
    referenceNumber,
    referenceType,
    referenceId,
    referenceNo,
    type,
    consumptionId,
    consumptionNumber,
    projectId,
    sourceProjectId,
    returnVendorId,
    requestDate,
    requestedBy,
    eWayBillNumber,
    status,
    notes,
    createdAt,
    updatedAt,
  });

const loadLinkedConsumptionTransfer = async (
  tx,
  { consumptionId = null, consumptionNumber = "" } = {}
) => {
  await ensureReallocateInventoryTables();
  const pkCol = await refreshReallocateInventoryPk();
  const fkCol = await refreshReallocateInventoryItemsFk();
  const safeConsumptionId = toNullableInt(consumptionId);
  const safeConsumptionNumber = normalizeOptionalString(consumptionNumber) ?? "";

  const transfersResult = await new sql.Request(tx).query(`
    SELECT * FROM dbo.ReallocateInventory ORDER BY ${toIdentifier(pkCol)} DESC
  `);
  const matchedTransferRow = (transfersResult.recordset ?? []).find((row) => {
    const transfer = normalizeReallocateInventory(row);
    if (transfer.type !== "Reallocate") {
      return false;
    }
    if (normalizeInventoryKeyValue(transfer.referenceType) !== "consumption") {
      return false;
    }
    if (safeConsumptionId !== null) {
      return (
        toNullableInt(transfer.referenceId) === safeConsumptionId ||
        toNullableInt(transfer.consumptionId) === safeConsumptionId
      );
    }
    return (
      safeConsumptionNumber &&
      normalizeInventoryKeyValue(transfer.referenceNo) ===
        normalizeInventoryKeyValue(safeConsumptionNumber)
    );
  });

  if (!matchedTransferRow) {
    return null;
  }

  const transfer = normalizeReallocateInventory(matchedTransferRow);
  const transferId = toNullableInt(transfer.id);
  if (transferId === null) {
    return null;
  }

  const itemsResult = await new sql.Request(tx)
    .input("TransferId", sql.Int, transferId)
    .query(`
      SELECT * FROM dbo.ReallocateInventoryItems
      WHERE ${toIdentifier(fkCol)} = @TransferId
    `);

  return {
    ...transfer,
    items: (itemsResult.recordset ?? []).map(normalizeReallocateInventoryItem),
  };
};

const deleteReallocateInventoryRecord = async (tx, transferId) => {
  const safeTransferId = toNullableInt(transferId);
  if (safeTransferId === null) {
    return;
  }
  await ensureReallocateInventoryTables();
  const pkCol = await refreshReallocateInventoryPk();
  const fkCol = await refreshReallocateInventoryItemsFk();

  await new sql.Request(tx)
    .input("TransferId", sql.Int, safeTransferId)
    .query(`
      DELETE FROM dbo.ReallocateInventoryItems
      WHERE ${toIdentifier(fkCol)} = @TransferId
    `);

  await new sql.Request(tx)
    .input("TransferId", sql.Int, safeTransferId)
    .query(`
      DELETE FROM dbo.ReallocateInventory
      WHERE ${toIdentifier(pkCol)} = @TransferId
    `);
};

const upsertConsumptionTransfer = async (
  tx,
  {
    existingTransferId = null,
    consumptionId = null,
    consumptionNumber = "",
    projectId = null,
    fromLocationId,
    toLocationId,
    requestDate = null,
    requestedBy = "",
    notes = "",
    items = [],
  } = {}
) => {
  await ensureReallocateInventoryTables();
  const pkCol = await refreshReallocateInventoryPk();
  const fkCol = await refreshReallocateInventoryItemsFk();

  const safeTransferId = toNullableInt(existingTransferId);
  const safeFromLocationId = toNullableInt(fromLocationId);
  const safeToLocationId = toNullableInt(toLocationId);
  const safeConsumptionId = toNullableInt(consumptionId);
  const safeProjectId = toNullableInt(projectId);
  const safeConsumptionNumber = normalizeOptionalString(consumptionNumber) ?? "";
  const safeRequestedBy = normalizeOptionalString(requestedBy) ?? "";
  const safeNotes = normalizeOptionalString(notes) ?? "";
  const parsedRequestDate = parseDateInput(requestDate);
  const now = new Date().toISOString();
  const normalizedItems = (Array.isArray(items) ? items : [])
    .map((item) => ({
      name: String(item.name ?? item.item ?? item.Item ?? "").trim(),
      description:
        normalizeOptionalString(item.description ?? item.Description) ?? null,
      unit: normalizeOptionalString(item.unit ?? item.Unit) ?? "PCS",
      quantity: Number(item.quantity ?? item.Quantity ?? 0) || 0,
      receiveGoodsItemId: toNullableInt(
        item.receiveGoodsItemId ?? item.ReceiveGoodsItemId ?? item.ReceiveItemId
      ),
      deliveryChallanId: toNullableInt(
        item.deliveryChallanId ?? item.DeliveryChallanId
      ),
      deliveryChallanItemId: toNullableInt(
        item.deliveryChallanItemId ??
          item.DeliveryChallanItemId ??
          item.deliveryChallanLineItemId ??
          item.DeliveryChallanLineItemId
      ),
      sourceType:
        normalizeAvailabilitySourceType(item.sourceType ?? item.SourceType) ||
        (toNullableInt(item.deliveryChallanId ?? item.DeliveryChallanId) !== null
          ? "dc"
          : "receive"),
      sourceKey:
        normalizeOptionalString(item.sourceKey ?? item.SourceKey) ??
        buildAvailabilitySourceKey(item),
      sourceRef: normalizeOptionalString(item.sourceRef ?? item.SourceRef) ?? null,
    }))
    .filter((item) => item.name && item.quantity > 0);

  const upsertMetadata = (transferId, createdAt = null) =>
    buildReallocateNotesPayload({
      referenceNumber: generateReallocateReferenceNumber(transferId),
      referenceType: "consumption",
      referenceId: safeConsumptionId,
      referenceNo: safeConsumptionNumber,
      type: "Reallocate",
      consumptionId: safeConsumptionId,
      consumptionNumber: safeConsumptionNumber,
      projectId: safeProjectId,
      requestDate: parsedRequestDate?.toISOString?.() ?? requestDate ?? null,
      requestedBy: safeRequestedBy,
      status: "Completed",
      notes: safeNotes,
      createdAt: createdAt ?? now,
      updatedAt: now,
    });

  let transferId = safeTransferId;
  let createdAt = now;

  if (transferId === null) {
    const insertHeaderReq = new sql.Request(tx);
    insertHeaderReq.input("FromLocationId", sql.Int, safeFromLocationId);
    insertHeaderReq.input("ToLocationId", sql.Int, safeToLocationId);
    insertHeaderReq.input("TransferDate", sql.DateTime, parsedRequestDate ?? null);
    insertHeaderReq.input("Notes", sql.NVarChar(sql.MAX), buildReallocateNotesPayload({
      referenceNumber: null,
      referenceType: "consumption",
      referenceId: safeConsumptionId,
      referenceNo: safeConsumptionNumber,
      type: "Reallocate",
      consumptionId: safeConsumptionId,
      consumptionNumber: safeConsumptionNumber,
      projectId: safeProjectId,
      requestDate: parsedRequestDate?.toISOString?.() ?? requestDate ?? null,
      requestedBy: safeRequestedBy,
      status: "Completed",
      notes: safeNotes,
      createdAt: now,
      updatedAt: now,
    }));
    const headerResult = await insertHeaderReq.query(`
      INSERT INTO dbo.ReallocateInventory
        (FromLocationId, ToLocationId, TransferDate, Notes)
      OUTPUT INSERTED.*
      VALUES
        (@FromLocationId, @ToLocationId, @TransferDate, @Notes)
    `);
    const headerRow = headerResult.recordset?.[0];
    transferId =
      headerRow?.[pkCol] ?? headerRow?.Id ?? headerRow?.TransferId ?? null;
    if (!transferId) {
      throw new Error("Failed to create linked reallocation");
    }
  } else {
    const existingTransfer = await loadLinkedConsumptionTransfer(tx, {
      consumptionId: safeConsumptionId,
      consumptionNumber: safeConsumptionNumber,
    });
    createdAt = existingTransfer?.createdAt ?? now;
    await new sql.Request(tx)
      .input("TransferId", sql.Int, transferId)
      .input("FromLocationId", sql.Int, safeFromLocationId)
      .input("ToLocationId", sql.Int, safeToLocationId)
      .input("TransferDate", sql.DateTime, parsedRequestDate ?? null)
      .input("Notes", sql.NVarChar(sql.MAX), upsertMetadata(transferId, createdAt))
      .query(`
        UPDATE dbo.ReallocateInventory
        SET FromLocationId = @FromLocationId,
            ToLocationId = @ToLocationId,
            TransferDate = @TransferDate,
            Notes = @Notes
        WHERE ${toIdentifier(pkCol)} = @TransferId
      `);

    await new sql.Request(tx)
      .input("TransferId", sql.Int, transferId)
      .query(`
        DELETE FROM dbo.ReallocateInventoryItems
        WHERE ${toIdentifier(fkCol)} = @TransferId
      `);
  }

  await new sql.Request(tx)
    .input("TransferId", sql.Int, transferId)
    .input("Notes", sql.NVarChar(sql.MAX), upsertMetadata(transferId, createdAt))
    .query(`
      UPDATE dbo.ReallocateInventory
      SET Notes = @Notes
      WHERE ${toIdentifier(pkCol)} = @TransferId
    `);

  for (const item of normalizedItems) {
    await new sql.Request(tx)
      .input("TransferId", sql.Int, transferId)
      .input("ReceiveGoodsItemId", sql.Int, item.receiveGoodsItemId)
      .input("DeliveryChallanId", sql.Int, item.deliveryChallanId)
      .input("DeliveryChallanItemId", sql.BigInt, item.deliveryChallanItemId)
      .input("SourceType", sql.NVarChar(50), item.sourceType)
      .input("SourceKey", sql.NVarChar(200), item.sourceKey)
      .input("SourceRef", sql.NVarChar(255), item.sourceRef)
      .input("Item", sql.NVarChar(200), item.name)
      .input("Description", sql.NVarChar(500), item.description)
      .input("Unit", sql.NVarChar(100), item.unit)
      .input("Quantity", sql.Decimal(18, 2), item.quantity)
      .query(`
        INSERT INTO dbo.ReallocateInventoryItems
          (${toIdentifier(fkCol)}, ReceiveGoodsItemId, DeliveryChallanId, DeliveryChallanItemId, SourceType, SourceKey, SourceRef, Item, Description, Unit, Quantity)
        VALUES
          (@TransferId, @ReceiveGoodsItemId, @DeliveryChallanId, @DeliveryChallanItemId, @SourceType, @SourceKey, @SourceRef, @Item, @Description, @Unit, @Quantity)
      `);
  }

  return transferId;
};

const normalizeOptionalString = (value) => {
  if (value === undefined) {
    return undefined;
  }
  const trimmed = String(value ?? "").trim();
  return trimmed.length ? trimmed : null;
};

const normalizeMultilineString = (value) => {
  if (value === undefined) {
    return undefined;
  }
  if (value === null) {
    return null;
  }
  return String(value).replace(/\r\n/g, "\n").trim();
};

const normalizePurchaseOrderTerms = (value, fallback = DEFAULT_PURCHASE_ORDER_TERMS) => {
  if (value === undefined || value === null) {
    return fallback;
  }
  return normalizeMultilineString(value) ?? "";
};

const toNullableInt = (value) => {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === "string" && !value.trim()) {
    return null;
  }
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
  const ddmmyyyyMatch = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(trimmed);
  if (ddmmyyyyMatch) {
    const [, dayText, monthText, yearText] = ddmmyyyyMatch;
    const day = Number(dayText);
    const month = Number(monthText);
    const year = Number(yearText);
    const date = new Date(Date.UTC(year, month - 1, day));
    const isValid =
      !Number.isNaN(date.getTime()) &&
      date.getUTCFullYear() === year &&
      date.getUTCMonth() === month - 1 &&
      date.getUTCDate() === day;
    return isValid ? date : NaN;
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

const createDbRequest = (source) =>
  typeof source?.request === "function" ? source.request() : new sql.Request(source);

const normalizeVendorContactsInput = (contacts = []) =>
  (Array.isArray(contacts) ? contacts : [])
    .map((contact) => ({
      contactName: String(
        contact?.contactName ?? contact?.ContactName ?? contact?.name ?? ""
      ).trim(),
      email: String(contact?.email ?? contact?.Email ?? "").trim(),
      designation: String(
        contact?.designation ?? contact?.Designation ?? ""
      ).trim(),
      phone: String(contact?.phone ?? contact?.Phone ?? "").trim(),
    }))
    .filter((contact) =>
      [contact.contactName, contact.email, contact.designation, contact.phone].some(Boolean)
    );

const normalizeCustomerContactsInput = (contacts = []) =>
  (Array.isArray(contacts) ? contacts : [])
    .map((contact) => ({
      contactName: String(
        contact?.contactName ?? contact?.ContactName ?? contact?.name ?? ""
      ).trim(),
      email: String(contact?.email ?? contact?.Email ?? "").trim(),
      designation: String(
        contact?.designation ?? contact?.Designation ?? ""
      ).trim(),
      phone: String(contact?.phone ?? contact?.Phone ?? "").trim(),
    }))
    .filter((contact) =>
      [contact.contactName, contact.email, contact.designation, contact.phone].some(Boolean)
    );

const normalizeUploadedDocumentsInput = (documents = []) =>
  (Array.isArray(documents) ? documents : [])
    .map((document) => ({
      name: String(document?.name ?? document?.fileName ?? "").trim(),
      type: String(document?.type ?? document?.fileType ?? "").trim(),
      size: Number(document?.size ?? document?.fileSize ?? 0) || 0,
      uploadedAt: String(
        document?.uploadedAt ?? document?.createdAt ?? new Date().toISOString()
      ).trim(),
      dataUrl: String(document?.dataUrl ?? document?.fileData ?? "").trim(),
    }))
    .filter((document) => document.name && document.dataUrl);

const normalizeInvoiceStatus = (value) => {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "submitted") {
    return "Submitted";
  }
  if (normalized === "approved") {
    return "Approved";
  }
  if (normalized === "rejected") {
    return "Rejected";
  }
  return "Draft";
};

const normalizeInvoicePartyInput = (party = {}) => ({
  id: toNullableInt(party?.id ?? party?.Id ?? party?.vendorId ?? party?.VendorId),
  name: normalizeOptionalString(party?.name ?? party?.Name) ?? "",
  companyName:
    normalizeOptionalString(party?.companyName ?? party?.CompanyName ?? party?.name) ?? "",
  contactPerson:
    normalizeOptionalString(
      party?.contactPerson ?? party?.ContactPerson ?? party?.contactName ?? party?.ContactName
    ) ?? "",
  phone: normalizeOptionalString(party?.phone ?? party?.Phone) ?? "",
  email: normalizeOptionalString(party?.email ?? party?.Email) ?? "",
  gstNumber:
    normalizeOptionalString(party?.gstNumber ?? party?.GSTNumber ?? party?.gst ?? party?.GST) ??
    "",
  address: normalizeOptionalString(party?.address ?? party?.Address) ?? "",
  city: normalizeOptionalString(party?.city ?? party?.City) ?? "",
  state: normalizeOptionalString(party?.state ?? party?.State) ?? "",
  stateCode: normalizeOptionalString(party?.stateCode ?? party?.StateCode) ?? "",
  pincode: normalizeOptionalString(party?.pincode ?? party?.Pincode) ?? "",
});

const normalizeInvoicePaymentInput = (payment = {}) => ({
  status: normalizeOptionalString(payment?.status ?? payment?.Status) ?? "Unpaid",
  mode: normalizeOptionalString(payment?.mode ?? payment?.Mode) ?? "Bank Transfer",
  bankName: normalizeOptionalString(payment?.bankName ?? payment?.BankName) ?? "",
  accountNumber:
    normalizeOptionalString(payment?.accountNumber ?? payment?.AccountNumber) ?? "",
  ifsc: normalizeOptionalString(payment?.ifsc ?? payment?.IFSC) ?? "",
  referenceNumber:
    normalizeOptionalString(payment?.referenceNumber ?? payment?.ReferenceNumber) ?? "",
  paymentDate: (() => {
    const parsed = parseDateInput(payment?.paymentDate ?? payment?.PaymentDate);
    return Number.isNaN(parsed) ? null : parsed;
  })(),
  paidAmount: Number(payment?.paidAmount ?? payment?.PaidAmount ?? 0) || 0,
});

const normalizeInvoiceNotesInput = (notes = {}) => ({
  internal: normalizeOptionalString(notes?.internal ?? notes?.Internal) ?? "",
  supplier: normalizeOptionalString(notes?.supplier ?? notes?.Supplier) ?? "",
  delivery: normalizeOptionalString(notes?.delivery ?? notes?.Delivery) ?? "",
  billTo: normalizeOptionalString(notes?.billTo ?? notes?.BillTo) ?? "",
  shipTo: normalizeOptionalString(notes?.shipTo ?? notes?.ShipTo) ?? "",
  terms: normalizeOptionalString(notes?.terms ?? notes?.Terms) ?? "",
  footerNote: normalizeOptionalString(notes?.footerNote ?? notes?.FooterNote) ?? "",
  approvalComment:
    normalizeOptionalString(notes?.approvalComment ?? notes?.ApprovalComment) ?? "",
  rejectionReason:
    normalizeOptionalString(notes?.rejectionReason ?? notes?.RejectionReason) ?? "",
});

const roundInvoiceAmount = (value) => {
  const numeric = Number(value) || 0;
  return Math.round(numeric * 100) / 100;
};

const normalizeInvoiceItemInput = (item = {}, index = 0) => ({
  id:
    normalizeOptionalString(item?.id ?? item?.Id) ??
    `item-${Date.now()}-${index}`,
  sourceItemId: toNullableInt(
    item?.sourceItemId ?? item?.SourceItemId ?? item?.receiveGoodsItemId ?? item?.ReceiveGoodsItemId
  ),
  poItemId: toNullableInt(item?.poItemId ?? item?.POItemId ?? item?.purchaseOrderItemId),
  productCode: normalizeOptionalString(item?.productCode ?? item?.ProductCode) ?? "",
  productName:
    normalizeOptionalString(item?.productName ?? item?.ProductName ?? item?.name ?? item?.Name) ??
    "",
  description: normalizeOptionalString(item?.description ?? item?.Description) ?? "",
  hsn: normalizeOptionalString(item?.hsn ?? item?.HSN) ?? "",
  uom: normalizeOptionalString(item?.uom ?? item?.UOM ?? item?.unit ?? item?.Unit) ?? "PCS",
  orderedQty: Number(item?.orderedQty ?? item?.OrderedQty ?? 0) || 0,
  receivedQty: Number(item?.receivedQty ?? item?.ReceivedQty ?? 0) || 0,
  unitPrice: Number(item?.unitPrice ?? item?.UnitPrice ?? 0) || 0,
  discount: Number(item?.discount ?? item?.Discount ?? 0) || 0,
  tax: Number(item?.tax ?? item?.Tax ?? item?.gst ?? item?.GST ?? 0) || 0,
  batchNo: normalizeOptionalString(item?.batchNo ?? item?.BatchNo) ?? "",
  expiryDate: normalizeOptionalString(item?.expiryDate ?? item?.ExpiryDate) ?? "",
});

const normalizeInvoiceItemsInput = (items = []) =>
  (Array.isArray(items) ? items : []).map(normalizeInvoiceItemInput);

const calculateInvoiceLine = (item = {}, taxMode = "intra") => {
  const quantity = Number(item.receivedQty ?? 0) || 0;
  const unitPrice = Number(item.unitPrice ?? 0) || 0;
  const discountPercent = Number(item.discount ?? 0) || 0;
  const taxPercent = Number(item.tax ?? 0) || 0;
  const gross = quantity * unitPrice;
  const discountAmount = (gross * discountPercent) / 100;
  const taxable = Math.max(gross - discountAmount, 0);
  const taxAmount = (taxable * taxPercent) / 100;
  const isInter = String(taxMode).trim().toLowerCase() === "inter";
  const cgstAmount = isInter ? 0 : taxAmount / 2;
  const sgstAmount = isInter ? 0 : taxAmount / 2;
  const igstAmount = isInter ? taxAmount : 0;

  return {
    gross: roundInvoiceAmount(gross),
    discountAmount: roundInvoiceAmount(discountAmount),
    taxable: roundInvoiceAmount(taxable),
    cgstAmount: roundInvoiceAmount(cgstAmount),
    sgstAmount: roundInvoiceAmount(sgstAmount),
    igstAmount: roundInvoiceAmount(igstAmount),
    taxAmount: roundInvoiceAmount(taxAmount),
    lineTotal: roundInvoiceAmount(taxable + taxAmount),
  };
};

const buildInvoiceTotalsSnapshot = (items = [], payment = {}, taxMode = "intra") => {
  const summary = (Array.isArray(items) ? items : []).reduce(
    (acc, item) => {
      const line = calculateInvoiceLine(item, taxMode);
      acc.totalItems += item.productName || item.productCode ? 1 : 0;
      acc.totalQuantity += Number(item.receivedQty ?? 0) || 0;
      acc.subtotal += line.gross;
      acc.discount += line.discountAmount;
      acc.taxable += line.taxable;
      acc.cgst += line.cgstAmount;
      acc.sgst += line.sgstAmount;
      acc.igst += line.igstAmount;
      acc.taxAmount += line.taxAmount;
      acc.grandTotal += line.lineTotal;
      return acc;
    },
    {
      totalItems: 0,
      totalQuantity: 0,
      subtotal: 0,
      discount: 0,
      taxable: 0,
      cgst: 0,
      sgst: 0,
      igst: 0,
      taxAmount: 0,
      grandTotal: 0,
    }
  );

  const roundedGrandTotal = Math.round(summary.grandTotal);
  const paidAmount = Number(payment?.paidAmount ?? 0) || 0;

  return {
    totalItems: summary.totalItems,
    totalQuantity: roundInvoiceAmount(summary.totalQuantity),
    subtotal: roundInvoiceAmount(summary.subtotal),
    discount: roundInvoiceAmount(summary.discount),
    taxable: roundInvoiceAmount(summary.taxable),
    cgst: roundInvoiceAmount(summary.cgst),
    sgst: roundInvoiceAmount(summary.sgst),
    igst: roundInvoiceAmount(summary.igst),
    taxAmount: roundInvoiceAmount(summary.taxAmount),
    roundOff: roundInvoiceAmount(roundedGrandTotal - summary.grandTotal),
    grandTotal: roundedGrandTotal,
    dueAmount: roundInvoiceAmount(Math.max(roundedGrandTotal - paidAmount, 0)),
  };
};

const normalizeInvoice = (row = {}) => {
  const invoiceId = row.InvoiceId ?? row.invoiceId ?? row.Id ?? row.id ?? null;
  const supplier = parseJsonObject(row.SupplierJson ?? row.supplierJson);
  const buyer = parseJsonObject(row.BuyerJson ?? row.buyerJson);
  const items = parseJsonArray(row.ItemsJson ?? row.itemsJson).map((item, index) =>
    normalizeInvoiceItemInput(item, index)
  );
  const payment = normalizeInvoicePaymentInput(
    parseJsonObject(row.PaymentJson ?? row.paymentJson)
  );
  const notes = normalizeInvoiceNotesInput(parseJsonObject(row.NotesJson ?? row.notesJson));
  const documents = normalizeUploadedDocumentsInput(
    parseJsonArray(row.DocumentsJson ?? row.documentsJson)
  );
  const taxMode =
    String(row.TaxMode ?? row.taxMode ?? "intra").trim().toLowerCase() === "inter"
      ? "inter"
      : "intra";
  const totals =
    parseJsonObject(row.TotalsJson ?? row.totalsJson) ||
    buildInvoiceTotalsSnapshot(items, payment, taxMode);

  return {
    invoiceId,
    id: invoiceId,
    invoiceNumber: row.InvoiceNumber ?? row.invoiceNumber ?? "",
    status: normalizeInvoiceStatus(row.Status ?? row.status),
    invoiceDate: row.InvoiceDate ?? row.invoiceDate ?? null,
    dueDate: row.DueDate ?? row.dueDate ?? null,
    poReference: row.POReference ?? row.poReference ?? "",
    paymentTerms: row.PaymentTerms ?? row.paymentTerms ?? "Net 30 Days",
    currency: row.Currency ?? row.currency ?? "INR - Indian Rupee",
    taxMode,
    placeOfSupply: row.PlaceOfSupply ?? row.placeOfSupply ?? "",
    reverseCharge: row.ReverseCharge ?? row.reverseCharge ?? "No",
    irn: row.IRN ?? row.irn ?? "",
    qrReference: row.QRReference ?? row.qrReference ?? "",
    receiveGoodsId: row.ReceiveGoodsId ?? row.receiveGoodsId ?? null,
    purchaseOrderId: row.PurchaseOrderId ?? row.purchaseOrderId ?? null,
    vendorId: row.VendorId ?? row.vendorId ?? null,
    projectId: row.ProjectId ?? row.projectId ?? null,
    supplier: normalizeInvoicePartyInput(supplier),
    buyer: normalizeInvoicePartyInput(buyer),
    items,
    payment,
    notes,
    documents,
    totals,
    createdAt: row.CreatedAt ?? row.createdAt ?? null,
    updatedAt: row.UpdatedAt ?? row.updatedAt ?? null,
  };
};

const findInvoiceRow = async (source, id) => {
  const result = await createDbRequest(source)
    .input("InvoiceId", sql.Int, id)
    .query(`
      SELECT TOP 1 *
      FROM dbo.Invoices
      WHERE InvoiceId = @InvoiceId
    `);
  return result.recordset?.[0] ?? null;
};

const getVendorContactsValidationError = (contacts = []) => {
  for (const [index, contact] of contacts.entries()) {
    if (!contact.contactName || !contact.email || !contact.designation) {
      return `Vendor contact ${index + 1} must include contact name, email, and designation.`;
    }
  }
  return "";
};

const getCustomerContactsValidationError = (contacts = []) => {
  for (const [index, contact] of contacts.entries()) {
    if (!contact.contactName || !contact.email || !contact.designation) {
      return `Customer contact ${index + 1} must include contact name, email, and designation.`;
    }
  }
  return "";
};

const getProjectSnapshotFromBody = (source = {}) => ({
  client: normalizeOptionalString(source.client ?? source.Client),
  companyName: normalizeOptionalString(
    source.companyName ?? source.CompanyName ?? source.clientCompany ?? source.ClientCompany
  ),
  address: normalizeOptionalString(
    source.address ?? source.Address ?? source.clientAddress ?? source.ClientAddress
  ),
  gstNumber: normalizeOptionalString(
    source.gstNumber ??
      source.GSTNumber ??
      source.clientGstNumber ??
      source.ClientGSTNumber ??
      source.ClientGstNumber
  ),
  phone: normalizeOptionalString(
    source.phone ?? source.Phone ?? source.clientPhone ?? source.ClientPhone
  ),
  email: normalizeOptionalString(
    source.email ?? source.Email ?? source.clientEmail ?? source.ClientEmail
  ),
  contactPerson: normalizeOptionalString(
    source.contactPerson ??
      source.ContactPerson ??
      source.clientContactPerson ??
      source.ClientContactPerson
  ),
  designation: normalizeOptionalString(
    source.designation ??
      source.Designation ??
      source.clientDesignation ??
      source.ClientDesignation
  ),
});

const getProjectSnapshotFromCustomer = (customer = null) => ({
  client: customer?.name ?? null,
  companyName: customer?.companyName ?? null,
  address:
    [
      customer?.address,
      [customer?.city, customer?.state, customer?.pincode]
        .map((value) => String(value ?? "").trim())
        .filter(Boolean)
        .join(", "),
    ]
      .filter((value) => String(value ?? "").trim())
      .join("\n") || null,
  gstNumber: customer?.gstNumber ?? null,
  phone: customer?.phone ?? null,
  email: customer?.email ?? null,
  contactPerson: customer?.contactPerson ?? null,
  designation: customer?.designation ?? null,
});

const getCustomerById = async (pool, customerId) => {
  const safeCustomerId = toNullableInt(customerId);
  if (!safeCustomerId) {
    return null;
  }

  const result = await pool
    .request()
    .input("CustomerId", sql.Int, safeCustomerId)
    .query(`
      SELECT
        CustomerId,
        CustomerName,
        CompanyName,
        Address,
        GSTNumber,
        GSTType,
        City,
        State,
        Pincode,
        ContactNumber,
        Email,
        ContactPerson,
        Designation,
        CreatedAt,
        UpdatedAt
      FROM dbo.Customers
      WHERE CustomerId = @CustomerId
    `);

  const customerRow = result.recordset?.[0];
  if (!customerRow) {
    return null;
  }

  const contactsResult = await pool
    .request()
    .input("CustomerId", sql.Int, safeCustomerId)
    .query(`
      SELECT *
      FROM dbo.CustomerContacts
      WHERE CustomerId = @CustomerId
      ORDER BY CustomerContactId ASC
    `);

  return attachCustomerContacts(
    normalizeCustomer(customerRow),
    contactsResult.recordset ?? []
  );
};

const getCustomerSnapshotById = async (pool, customerId) => {
  const safeCustomerId = toNullableInt(customerId);
  if (!safeCustomerId) {
    return null;
  }

  const result = await pool
    .request()
    .input("CustomerId", sql.Int, safeCustomerId)
    .query(`
      SELECT
        CustomerId,
        CustomerName,
        CompanyName,
        Address,
        GSTNumber,
        GSTType,
        City,
        State,
        Pincode,
        ContactNumber,
        Email,
        ContactPerson,
        Designation
      FROM dbo.Customers
      WHERE CustomerId = @CustomerId
    `);

  const customerRow = result.recordset?.[0];
  return customerRow ? normalizeCustomer(customerRow) : null;
};

const buildNextPurchaseOrderNumber = (poNumbers = [], year = new Date().getFullYear()) => {
  const safeYear = Number.isFinite(Number(year))
    ? Number(year)
    : new Date().getFullYear();
  const prefix = `PO-${safeYear}-`;
  const pattern = new RegExp(`^PO-${safeYear}-(\\d+)$`, "i");
  let maxSequence = 0;
  const seen = new Set();

  for (const rawValue of poNumbers) {
    const value = String(rawValue ?? "").trim();
    if (!value) {
      continue;
    }
    seen.add(value.toUpperCase());
    const match = value.match(pattern);
    if (!match) {
      continue;
    }
    const parsed = Number.parseInt(match[1], 10);
    if (Number.isFinite(parsed)) {
      maxSequence = Math.max(maxSequence, parsed);
    }
  }

  let nextSequence = maxSequence + 1;
  let candidate = `${prefix}${String(nextSequence).padStart(4, "0")}`;
  while (seen.has(candidate.toUpperCase())) {
    nextSequence += 1;
    candidate = `${prefix}${String(nextSequence).padStart(4, "0")}`;
  }
  return candidate;
};

const generateNextPurchaseOrderNumber = async (source, dateValue, excludeId = null) => {
  const parsedDate = parseDateInput(dateValue);
  const year =
    parsedDate instanceof Date && !Number.isNaN(parsedDate.getTime())
      ? parsedDate.getUTCFullYear()
      : new Date().getFullYear();

  const request = createDbRequest(source);
  if (excludeId !== null && excludeId !== undefined) {
    request.input("PurchaseOrderId", sql.Int, excludeId);
  }
  const result = await request.query(`
    SELECT PONumber
    FROM dbo.PurchaseOrders
    ${excludeId !== null && excludeId !== undefined ? "WHERE Id <> @PurchaseOrderId" : ""}
  `);

  return buildNextPurchaseOrderNumber(
    (result.recordset ?? []).map((row) => row.PONumber ?? row.poNumber ?? ""),
    year
  );
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

const normalizePurchaseOrderStatusValue = (status) =>
  String(status ?? "").trim().toLowerCase();

const isClosedPurchaseOrderStatus = (status) =>
  normalizePurchaseOrderStatusValue(status) === "closed";

const isCancelledPurchaseOrderStatus = (status) => {
  const normalized = normalizePurchaseOrderStatusValue(status);
  return normalized === "cancelled" || normalized === "canceled";
};

const isLockedPurchaseOrderStatus = (status) =>
  isClosedPurchaseOrderStatus(status) || isCancelledPurchaseOrderStatus(status);

const getLockedPurchaseOrderError = (status) =>
  isCancelledPurchaseOrderStatus(status)
    ? "This Purchase Order is Cancelled."
    : "PO is Closed";

const normalizeReceiveGoods = (row = {}) => {
  const id =
    row.ReceiveGoodsId ?? row.receiveGoodsId ?? row.Id ?? row.id ?? null;
  const rawShowProjectDetails =
    row.ShowProjectDetails ?? row.showProjectDetails ?? null;
  return {
    id,
    receiveGoodsId: id,
    purchaseOrderId:
      row.PurchaseOrderId ?? row.purchaseOrderId ?? row.PurchaseorderId ?? null,
    boqId: row.BOQId ?? row.boqId ?? null,
    projectId: row.ProjectId ?? row.projectId ?? null,
    vendorId: row.VendorId ?? row.vendorId ?? null,
    locationId: row.LocationId ?? row.locationId ?? null,
    receivedDate: row.ReceivedDate ?? row.receivedDate ?? null,
    receivedBy: row.ReceivedBy ?? row.receivedBy ?? "",
    invoiceNumber: row.InvoiceNumber ?? row.invoiceNumber ?? "",
    invoiceDate: row.InvoiceDate ?? row.invoiceDate ?? null,
    invoiceDocumentName:
      row.InvoiceDocumentName ?? row.invoiceDocumentName ?? "",
    invoiceDocumentType:
      row.InvoiceDocumentType ?? row.invoiceDocumentType ?? "",
    invoiceDocumentSize:
      Number(row.InvoiceDocumentSize ?? row.invoiceDocumentSize ?? 0) || 0,
    invoiceDocumentData:
      row.InvoiceDocumentData ?? row.invoiceDocumentData ?? "",
    billFrom:
      row.BillFrom ?? row.billFrom ?? row.BillTo ?? row.billTo ?? "",
    billTo:
      row.BillFrom ?? row.billFrom ?? row.BillTo ?? row.billTo ?? "",
    shipTo: row.ShipTo ?? row.shipTo ?? "",
    showProjectDetails:
      rawShowProjectDetails === null || rawShowProjectDetails === undefined
        ? true
        : !["0", "false", "no"].includes(String(rawShowProjectDetails).toLowerCase()),
    notes: row.Notes ?? row.notes ?? "",
    taxMode:
      String(row.TaxMode ?? row.taxMode ?? "intra").trim().toLowerCase() === "inter"
        ? "inter"
        : "intra",
    status: row.Status ?? row.status ?? "",
    createdAt: row.CreatedAt ?? row.createdAt ?? null,
    updatedAt: row.UpdatedAt ?? row.updatedAt ?? null,
  };
};

const normalizeReceiveGoodsItem = (row = {}) => {
  const orderedQty = Number(row.OrderedQty ?? row.orderedQty ?? 0) || 0;
  const receivedQty = Number(row.ReceivedQty ?? row.receivedQty ?? 0) || 0;
  const poBalanceQty =
    Number(row.BalanceQty ?? row.balanceQty ?? orderedQty - receivedQty) || 0;
  const rawConsumed = row.ConsumedQty ?? row.consumedQty ?? null;
  const consumedQty = Number.isFinite(Number(rawConsumed)) ? Number(rawConsumed) : 0;
  const rawAvailable =
    row.AvailableQty ??
    row.availableQty ??
    row.CurrentAvailableQty ??
    row.currentAvailableQty ??
    null;
  const availableQty = Number.isFinite(Number(rawAvailable))
    ? Number(rawAvailable)
    : Math.max(receivedQty - consumedQty, 0);
  const taxPercentage =
    parseTaxPercentageValue(
      row.TaxPercentage ??
        row.taxPercentage ??
        row.GST ??
        row.gst ??
        row.Gst ??
        null
    ) ?? 0;
  const receiveId =
    row.ReceiveGoodsId ??
    row.ReceiveGoodsID ??
    row.receiveGoodsId ??
    row.ReceivegoodsId ??
    row.ReceiptId ??
    row.ReceiveId ??
    null;
  return {
    id:
      row.ReceiveGoodsItemId ??
      row.receiveGoodsItemId ??
      row.ReceiveGoodsItemID ??
      row.Id ??
      row.id ??
      null,
    receiveGoodsId: receiveId,
    purchaseOrderId:
      row.PurchaseOrderId ?? row.purchaseOrderId ?? row.PurchaseorderId ?? null,
    poItemId:
      row.PurchaseOrderItemId ??
      row.purchaseOrderItemId ??
      row.PurchaseorderItemId ??
      null,
    itemId: row.ItemId ?? row.itemId ?? null,
    name: row.ItemName ?? row.itemName ?? row.Name ?? row.name ?? "",
    description: row.Description ?? row.description ?? "",
    unit: row.Unit ?? row.unit ?? "PCS",
    hsn: row.HSN ?? row.hsn ?? row.Hsn ?? "",
    gst: row.GST ?? row.gst ?? row.Gst ?? formatTaxPercentageLabel(taxPercentage),
    taxPercentage,
    unitPrice: Number(row.UnitPrice ?? row.unitPrice ?? row.Rate ?? row.rate ?? 0) || 0,
    taxableAmount: Number(row.TaxableAmount ?? row.taxableAmount ?? 0) || 0,
    cgstPercent: Number(row.CGSTPercent ?? row.cgstPercent ?? 0) || 0,
    sgstPercent: Number(row.SGSTPercent ?? row.sgstPercent ?? 0) || 0,
    igstPercent: Number(row.IGSTPercent ?? row.igstPercent ?? 0) || 0,
    cgstAmount: Number(row.CGSTAmount ?? row.cgstAmount ?? 0) || 0,
    sgstAmount: Number(row.SGSTAmount ?? row.sgstAmount ?? 0) || 0,
    igstAmount: Number(row.IGSTAmount ?? row.igstAmount ?? 0) || 0,
    gstAmount: Number(row.GSTAmount ?? row.gstAmount ?? 0) || 0,
    serialRequired: normalizeBooleanFlag(
      row.SerialRequired ?? row.serialRequired ?? row.IsSerialTracked,
      false
    ),
    serialNumbers: normalizeSerialNumbers(
      parseJsonArray(row.SerialNumbersJson ?? row.serialNumbersJson)
    ),
    notes: row.ItemNotes ?? row.itemNotes ?? row.Notes ?? row.notes ?? "",
    orderedQty,
    receivedQty,
    balanceQty: poBalanceQty,
    poBalanceQty,
    consumedQty,
    availableQty,
    createdAt: row.CreatedAt ?? row.createdAt ?? null,
  };
};

const toReceiveQuantity = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const getReceiveChronologyTime = (...values) => {
  for (const value of values) {
    if (!value) {
      continue;
    }
    const time = new Date(value).getTime();
    if (Number.isFinite(time)) {
      return time;
    }
  }
  return 0;
};

const sortReceiveRowsChronologically = (rows = [], receivePk = RECEIVE_ID_COL) =>
  [...rows].sort((left, right) => {
    const leftTime = getReceiveChronologyTime(left.ReceivedDate, left.CreatedAt);
    const rightTime = getReceiveChronologyTime(right.ReceivedDate, right.CreatedAt);
    if (leftTime !== rightTime) {
      return leftTime - rightTime;
    }

    return (
      toReceiveQuantity(left?.[receivePk] ?? left?.ReceiveGoodsId ?? left?.Id) -
      toReceiveQuantity(right?.[receivePk] ?? right?.ReceiveGoodsId ?? right?.Id)
    );
  });

const buildReceivePoItemKey = (row = {}, index = 0) => {
  // Use canonical line identity: poItemId > itemId > index
  // Never use name as a fallback key to prevent duplicate item names from collapsing multiple PO lines
  const poItemId =
    row.poItemId ??
    row.POItemId ??
    row.PurchaseOrderItemId ??
    row.purchaseOrderItemId ??
    null;
  if (Number.isFinite(Number(poItemId))) {
    return `po:${Number(poItemId)}`;
  }

  const itemId = row.itemId ?? row.ItemId ?? null;
  if (Number.isFinite(Number(itemId))) {
    return `item:${Number(itemId)}`;
  }

  return `index:${index}`;
};

const buildReceiveItemSource = (items = []) => {
  const source = {
    byKey: new Map(),
    ordered: [],
  };

  (Array.isArray(items) ? items : []).forEach((item, index) => {
    const keys = [buildReceivePoItemKey(item, index)];
    const itemId = item.itemId ?? item.ItemId ?? null;
    if (Number.isFinite(Number(itemId))) {
      keys.push(`item:${Number(itemId)}`);
    }
    keys.forEach((key) => {
      if (key && !source.byKey.has(key)) {
        source.byKey.set(key, item);
      }
    });
    source.ordered.push(item);
  });

  return source;
};

const findMatchingReceiveItemIndex = (
  purchaseOrderItems = [],
  receiptItem = {},
  index = 0
) => {
  if (!Array.isArray(purchaseOrderItems) || !purchaseOrderItems.length) {
    return -1;
  }

  const receiptPoItemId =
    receiptItem.poItemId ??
    receiptItem.POItemId ??
    receiptItem.PurchaseOrderItemId ??
    receiptItem.purchaseOrderItemId ??
    null;
  if (Number.isFinite(Number(receiptPoItemId))) {
    const exactIndex = purchaseOrderItems.findIndex(
      (poItem) =>
        Number(poItem.poItemId ?? poItem.POItemId ?? poItem.id ?? poItem.PurchaseOrderItemId ?? NaN) ===
        Number(receiptPoItemId)
    );
    if (exactIndex >= 0) {
      return exactIndex;
    }
  }

  const receiptItemId = receiptItem.itemId ?? receiptItem.ItemId ?? null;
  if (Number.isFinite(Number(receiptItemId))) {
    const exactIndex = purchaseOrderItems.findIndex(
      (poItem) =>
        Number(poItem.itemId ?? poItem.ItemId ?? NaN) ===
        Number(receiptItemId)
    );
    if (exactIndex >= 0) {
      return exactIndex;
    }
  }

  return index >= 0 && index < purchaseOrderItems.length ? index : -1;
};

const findReceiveSourceItem = (source, poItem, index = 0) => {
  const itemKey = buildReceivePoItemKey(poItem, index);
  const preferred = source.byKey.get(itemKey);
  if (preferred) {
    return preferred;
  }

  const itemId = poItem.itemId ?? poItem.ItemId ?? null;
  if (Number.isFinite(Number(itemId))) {
    const itemKeyByItem = `item:${Number(itemId)}`;
    const fallback = source.byKey.get(itemKeyByItem);
    if (fallback) {
      return fallback;
    }
  }

  return source.ordered[index] ?? null;
};

const loadReceivePurchaseOrderItems = async (tx, purchaseOrderId) => {
  const result = await new sql.Request(tx)
    .input("PurchaseOrderId", sql.Int, purchaseOrderId)
    .query(`
      SELECT * FROM dbo.PurchaseOrderItems
      WHERE PurchaseOrderId = @PurchaseOrderId
    `);

  return [...(result.recordset ?? [])]
    .sort((left, right) => {
      const leftId = Number(
        left.POItemId ?? left.PurchaseOrderItemId ?? left.Id ?? left.id ?? 0
      );
      const rightId = Number(
        right.POItemId ?? right.PurchaseOrderItemId ?? right.Id ?? right.id ?? 0
      );
      return leftId - rightId;
    })
    .map((row) => ({
      ...normalizePoItem(row),
      poItemId: row.POItemId ?? row.PurchaseOrderItemId ?? row.Id ?? row.id ?? null,
    }));
};

const computeOverallReceiveStatus = (
  purchaseOrderItems = [],
  cumulativeByKey = new Map(),
  fallback = "Draft"
) => {
  const normalizedItems = Array.isArray(purchaseOrderItems) ? purchaseOrderItems : [];
  if (!normalizedItems.length) {
    return fallback;
  }

  let anyReceived = false;
  const allReceived = normalizedItems.every((item, index) => {
    const orderedQty = toReceiveQuantity(item.quantity ?? item.orderedQty);
    const receivedQty = toReceiveQuantity(
      cumulativeByKey.get(buildReceivePoItemKey(item, index))
    );

    if (receivedQty > 0) {
      anyReceived = true;
    }

    return orderedQty === 0 || receivedQty >= orderedQty;
  });

  if (allReceived) {
    return "Closed";
  }
  if (anyReceived) {
    return "Partially Received";
  }
  return fallback;
};

const groupReceiveItemsByReceipt = (rows = []) =>
  (Array.isArray(rows) ? rows : []).reduce((acc, row) => {
    const normalized = normalizeReceiveGoodsItem(row);
    const receiptId = normalized.receiveGoodsId;
    if (!receiptId) {
      return acc;
    }

    if (!acc[receiptId]) {
      acc[receiptId] = [];
    }
    acc[receiptId].push(normalized);
    return acc;
  }, {});

const replaceReceiveGoodsItems = async (
  tx,
  {
    receiptId,
    purchaseOrderId,
    fkCol,
    items = [],
  }
) => {
  await new sql.Request(tx)
    .input("ReceiptId", sql.Int, receiptId)
    .query(`
      DELETE FROM dbo.ReceiveGoodsItems WHERE ${fkCol} = @ReceiptId
    `);

  for (const item of items) {
    const insertItemReq = new sql.Request(tx);
    insertItemReq.input("ReceiptId", sql.Int, receiptId);
    insertItemReq.input("PurchaseOrderId", sql.Int, purchaseOrderId);
    insertItemReq.input("PurchaseOrderItemId", sql.Int, item.poItemId ?? null);
    insertItemReq.input("ItemId", sql.Int, item.itemId ?? null);
    insertItemReq.input("ItemName", sql.NVarChar(255), item.name ?? null);
    insertItemReq.input("Description", sql.NVarChar(sql.MAX), item.description ?? null);
    insertItemReq.input("Unit", sql.NVarChar(50), item.unit ?? "PCS");
    insertItemReq.input("HSN", sql.NVarChar(50), item.hsn ?? null);
    insertItemReq.input("GST", sql.NVarChar(100), item.gst ?? null);
    insertItemReq.input("TaxPercentage", sql.Decimal(5, 2), item.taxPercentage ?? 0);
    insertItemReq.input("SerialRequired", sql.Bit, normalizeBooleanFlag(item.serialRequired, false));
    insertItemReq.input("UnitPrice", sql.Decimal(18, 2), item.unitPrice ?? 0);
    insertItemReq.input("TaxableAmount", sql.Decimal(18, 2), item.taxableAmount ?? 0);
    insertItemReq.input("CGSTPercent", sql.Decimal(5, 2), item.cgstPercent ?? 0);
    insertItemReq.input("SGSTPercent", sql.Decimal(5, 2), item.sgstPercent ?? 0);
    insertItemReq.input("IGSTPercent", sql.Decimal(5, 2), item.igstPercent ?? 0);
    insertItemReq.input("CGSTAmount", sql.Decimal(18, 2), item.cgstAmount ?? 0);
    insertItemReq.input("SGSTAmount", sql.Decimal(18, 2), item.sgstAmount ?? 0);
    insertItemReq.input("IGSTAmount", sql.Decimal(18, 2), item.igstAmount ?? 0);
    insertItemReq.input("GSTAmount", sql.Decimal(18, 2), item.gstAmount ?? 0);
    insertItemReq.input(
      "SerialNumbersJson",
      sql.NVarChar(sql.MAX),
      serializeJson(normalizeSerialNumbers(item.serialNumbers))
    );
    insertItemReq.input("ItemNotes", sql.NVarChar(sql.MAX), item.itemNotes ?? null);
    insertItemReq.input("OrderedQty", sql.Int, item.orderedQty);
    insertItemReq.input("ReceivedQty", sql.Int, item.receivedQty);
    insertItemReq.input("BalanceQty", sql.Int, item.balanceQty);

    await insertItemReq.query(`
      INSERT INTO dbo.ReceiveGoodsItems
        (${fkCol}, PurchaseOrderId, PurchaseOrderItemId, ItemId, ItemName, Description, Unit, HSN, GST, TaxPercentage, SerialRequired, UnitPrice, TaxableAmount, CGSTPercent, SGSTPercent, IGSTPercent, CGSTAmount, SGSTAmount, IGSTAmount, GSTAmount, SerialNumbersJson, ItemNotes, OrderedQty, ReceivedQty, BalanceQty)
      VALUES
        (@ReceiptId, @PurchaseOrderId, @PurchaseOrderItemId, @ItemId, @ItemName, @Description, @Unit, @HSN, @GST, @TaxPercentage, @SerialRequired, @UnitPrice, @TaxableAmount, @CGSTPercent, @SGSTPercent, @IGSTPercent, @CGSTAmount, @SGSTAmount, @IGSTAmount, @GSTAmount, @SerialNumbersJson, @ItemNotes, @OrderedQty, @ReceivedQty, @BalanceQty)
    `);
  }
};

const replaceReceiveSerialNumbers = async (
  tx,
  {
    receiptId,
    purchaseOrderId,
    locationId = null,
    items = [],
  }
) => {
  await new sql.Request(tx)
    .input("ReceiptId", sql.Int, receiptId)
    .query(`
      DELETE FROM dbo.SerialNumbers WHERE ReceiveGoodsId = @ReceiptId
    `);

  for (const item of items) {
    for (const serialNumber of normalizeSerialNumbers(item.serialNumbers)) {
      await new sql.Request(tx)
        .input("PurchaseOrderId", sql.Int, toNullableInt(purchaseOrderId))
        .input("PurchaseOrderItemId", sql.Int, toNullableInt(item.poItemId))
        .input("ReceiveGoodsId", sql.Int, toNullableInt(receiptId))
        .input("ItemId", sql.Int, toNullableInt(item.itemId))
        .input("ProductName", sql.NVarChar(255), normalizeOptionalString(item.name))
        .input("SerialNumber", sql.NVarChar(255), serialNumber)
        .input("LocationId", sql.Int, toNullableInt(locationId))
        .query(`
          INSERT INTO dbo.SerialNumbers
            (PurchaseOrderId, PurchaseOrderItemId, ReceiveGoodsId, ItemId, ProductName, SerialNumber, LocationId)
          VALUES
            (@PurchaseOrderId, @PurchaseOrderItemId, @ReceiveGoodsId, @ItemId, @ProductName, @SerialNumber, @LocationId)
        `);
    }
  }
};

const recalculateReceiveGoodsChain = async (
  tx,
  {
    purchaseOrderId,
    receivePk,
    fkCol,
    overrideItemsByReceiptId = {},
  }
) => {
  const headersResult = await new sql.Request(tx)
    .input("PurchaseOrderId", sql.Int, purchaseOrderId)
    .query(withSqlLockTimeout(`
      SELECT *
      FROM dbo.ReceiveGoods
      WHERE PurchaseOrderId = @PurchaseOrderId
    `));
  const itemsResult = await new sql.Request(tx)
    .input("PurchaseOrderId", sql.Int, purchaseOrderId)
    .query(withSqlLockTimeout(`
      SELECT *
      FROM dbo.ReceiveGoodsItems
      WHERE PurchaseOrderId = @PurchaseOrderId
    `));
  const purchaseOrderItems = await loadReceivePurchaseOrderItems(
    tx,
    purchaseOrderId
  );

  const groupedItems = groupReceiveItemsByReceipt(itemsResult.recordset ?? []);
  const sortedHeaders = sortReceiveRowsChronologically(
    headersResult.recordset ?? [],
    receivePk
  );
  const cumulativeByKey = new Map();
  let finalStatus = "Draft";

  for (const headerRow of sortedHeaders) {
    const receiptId = headerRow?.[receivePk] ?? headerRow?.ReceiveGoodsId ?? headerRow?.Id;
    const source =
      overrideItemsByReceiptId[String(receiptId)] ??
      buildReceiveItemSource(groupedItems[receiptId] ?? []);
    const taxMode =
      String(headerRow?.TaxMode ?? headerRow?.taxMode ?? "intra").toLowerCase() === "inter"
        ? "inter"
        : "intra";

    const recalculatedItems = purchaseOrderItems.map((poItem, index) => {
      const matchedItem = findReceiveSourceItem(source, poItem, index);
      const itemKey = buildReceivePoItemKey(poItem, index);
      const orderedQty = toReceiveQuantity(poItem.quantity ?? poItem.orderedQty);
      const previouslyReceived = toReceiveQuantity(cumulativeByKey.get(itemKey));
      const receivableQty = Math.max(orderedQty - previouslyReceived, 0);
      const requestedQty = Math.max(
        toReceiveQuantity(matchedItem?.receivedQty ?? matchedItem?.ReceivedQty),
        0
      );
      const appliedQty = Math.min(requestedQty, receivableQty);
      const balanceQty = Math.max(receivableQty - appliedQty, 0);
      const taxPercentage =
        parseTaxPercentageValue(
          matchedItem?.taxPercentage ??
            matchedItem?.TaxPercentage ??
            poItem.taxPercentage ??
            poItem.gst
        ) ?? 0;
      const taxBreakdown = buildReceiveTaxBreakdown({
        quantity: appliedQty,
        unitPrice: matchedItem?.unitPrice ?? poItem.unitPrice ?? 0,
        taxPercentage,
        taxMode,
      });
      const serialRequired = normalizeBooleanFlag(
        matchedItem?.serialRequired ?? poItem.serialRequired,
        false
      );
      const serialNumbers = normalizeSerialNumbers(
        matchedItem?.serialNumbers
      ).slice(0, appliedQty);

      cumulativeByKey.set(itemKey, previouslyReceived + appliedQty);

      return {
        poItemId: toNullableInt(poItem.poItemId ?? poItem.id),
        itemId: toNullableInt(poItem.itemId),
        name:
          normalizeOptionalString(
            matchedItem?.name ?? matchedItem?.itemName ?? poItem.name
          ) ?? poItem.name ?? null,
        description:
          normalizeOptionalString(
            matchedItem?.description ?? poItem.description
          ) ?? null,
        unit:
          normalizeOptionalString(matchedItem?.unit ?? poItem.unit) ?? "PCS",
        hsn:
          normalizeOptionalString(matchedItem?.hsn ?? poItem.hsn) ?? null,
        gst:
          normalizeOptionalString(matchedItem?.gst ?? poItem.gst) ??
          formatTaxPercentageLabel(taxPercentage),
        taxPercentage,
        serialRequired,
        unitPrice: roundCurrencyValue(matchedItem?.unitPrice ?? poItem.unitPrice ?? 0),
        ...taxBreakdown,
        serialNumbers,
        itemNotes:
          normalizeOptionalString(
            matchedItem?.notes ?? matchedItem?.itemNotes ?? poItem.notes
          ) ?? null,
        orderedQty,
        receivedQty: appliedQty,
        balanceQty,
      };
    });

    finalStatus = computeOverallReceiveStatus(purchaseOrderItems, cumulativeByKey, "Draft");

    await replaceReceiveGoodsItems(tx, {
      receiptId,
      purchaseOrderId,
      fkCol,
      items: recalculatedItems,
    });
    await replaceReceiveSerialNumbers(tx, {
      receiptId,
      purchaseOrderId,
      locationId: headerRow?.LocationId ?? null,
      items: recalculatedItems,
    });

    await new sql.Request(tx)
      .input("ReceiptId", sql.Int, receiptId)
      .input("Status", sql.NVarChar(50), finalStatus)
      .query(`
        UPDATE dbo.ReceiveGoods
        SET Status = @Status,
            UpdatedAt = SYSUTCDATETIME()
        WHERE ${receivePk} = @ReceiptId
      `);
  }

  return {
    finalStatus,
  };
};

const normalizeReceiveGoodsItemsInput = (items = []) =>
  buildReceiveItemSource(
    (Array.isArray(items) ? items : []).map((item) => ({
      poItemId:
        toNullableInt(
          item.poItemId ??
            item.POItemId ??
            item.purchaseOrderItemId ??
            item.PurchaseOrderItemId
        ) ?? null,
      itemId: toNullableInt(item.itemId ?? item.ItemId) ?? null,
      name:
        normalizeOptionalString(item.name ?? item.Name ?? item.itemName) ?? null,
      description:
        normalizeOptionalString(item.description ?? item.Description) ?? null,
      unit: normalizeOptionalString(item.unit ?? item.Unit) ?? "PCS",
      hsn:
        normalizeOptionalString(
          item.hsn ?? item.HSN ?? item.hsnCode ?? item.HSNCode
        ) ?? null,
      gst:
        normalizeOptionalString(
          item.gst ?? item.GST ?? item.gstRate ?? item.GSTRate
        ) ?? null,
      taxPercentage:
        parseTaxPercentageValue(
          item.taxPercentage ??
            item.TaxPercentage ??
            item.gst ??
            item.GST ??
            item.gstRate ??
            item.GSTRate
        ) ?? 0,
      serialRequired: normalizeBooleanFlag(
        item.serialRequired ?? item.SerialRequired,
        false
      ),
      unitPrice: roundCurrencyValue(item.unitPrice ?? item.UnitPrice ?? item.rate ?? item.Rate ?? 0),
      taxableAmount: roundCurrencyValue(item.taxableAmount ?? item.TaxableAmount ?? 0),
      cgstPercent: roundCurrencyValue(item.cgstPercent ?? item.CGSTPercent ?? 0),
      sgstPercent: roundCurrencyValue(item.sgstPercent ?? item.SGSTPercent ?? 0),
      igstPercent: roundCurrencyValue(item.igstPercent ?? item.IGSTPercent ?? 0),
      cgstAmount: roundCurrencyValue(item.cgstAmount ?? item.CGSTAmount ?? 0),
      sgstAmount: roundCurrencyValue(item.sgstAmount ?? item.SGSTAmount ?? 0),
      igstAmount: roundCurrencyValue(item.igstAmount ?? item.IGSTAmount ?? 0),
      gstAmount: roundCurrencyValue(item.gstAmount ?? item.GSTAmount ?? 0),
      serialNumbers: normalizeSerialNumbers(
        item.serialNumbers ?? item.SerialNumbers ?? item.serials
      ),
      itemNotes: normalizeOptionalString(item.notes ?? item.Notes) ?? null,
      receivedQty: Math.max(
        toReceiveQuantity(item.receivedQty ?? item.ReceivedQty ?? item.received),
        0
      ),
    }))
  );

const ensureItemsTable = async () => {
  const pool = await getPool();
  await pool.request().query(`
    IF OBJECT_ID('dbo.Items', 'U') IS NULL
    BEGIN
      CREATE TABLE dbo.Items (
        ItemId INT IDENTITY(1,1) PRIMARY KEY,
        Name NVARCHAR(255) NOT NULL,
        Category NVARCHAR(100) NULL,
        BrandId INT NULL,
        Brand NVARCHAR(255) NULL,
        HSN NVARCHAR(50) NULL,
        Unit NVARCHAR(50) NULL,
        Stock INT NOT NULL DEFAULT 0,
        Price DECIMAL(18, 2) NOT NULL DEFAULT 0,
        GST NVARCHAR(100) NULL,
        TaxPercentage DECIMAL(5, 2) NULL,
        SerialRequired BIT NOT NULL DEFAULT 0,
        SerialNumber NVARCHAR(255) NULL,
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

    IF COL_LENGTH('dbo.Items', 'BrandId') IS NULL
    BEGIN
      ALTER TABLE dbo.Items ADD BrandId INT NULL;
    END;

    IF COL_LENGTH('dbo.Items', 'Brand') IS NULL
    BEGIN
      ALTER TABLE dbo.Items ADD Brand NVARCHAR(255) NULL;
    END;

    IF COL_LENGTH('dbo.Items', 'HSN') IS NULL
    BEGIN
      ALTER TABLE dbo.Items ADD HSN NVARCHAR(50) NULL;
    END;

    IF COL_LENGTH('dbo.Items', 'Unit') IS NULL
    BEGIN
      ALTER TABLE dbo.Items ADD Unit NVARCHAR(50) NULL;
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

    IF COL_LENGTH('dbo.Items', 'TaxPercentage') IS NULL
    BEGIN
      ALTER TABLE dbo.Items ADD TaxPercentage DECIMAL(5, 2) NULL;
    END;

    IF COL_LENGTH('dbo.Items', 'SerialRequired') IS NULL
    BEGIN
      ALTER TABLE dbo.Items ADD SerialRequired BIT NOT NULL CONSTRAINT DF_Items_SerialRequired DEFAULT 0;
    END;

    IF COL_LENGTH('dbo.Items', 'SerialNumber') IS NULL
    BEGIN
      ALTER TABLE dbo.Items ADD SerialNumber NVARCHAR(255) NULL;
    END;

    IF COL_LENGTH('dbo.Items', 'SerialNumbe') IS NOT NULL
       AND COL_LENGTH('dbo.Items', 'SerialNumber') IS NOT NULL
    BEGIN
      EXEC(N'
        UPDATE dbo.Items
        SET
          SerialNumber = COALESCE(NULLIF(SerialNumber, ''''''), NULLIF(SerialNumbe, '''''')),
          SerialNumbe = COALESCE(NULLIF(SerialNumbe, ''''''), NULLIF(SerialNumber, ''''''))
        WHERE NULLIF(SerialNumber, '''''') IS NOT NULL
           OR NULLIF(SerialNumbe, '''''') IS NOT NULL;
      ');
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

const ensureBrandsTable = async () => {
  const pool = await getPool();
  await pool.request().query(`
    IF OBJECT_ID('dbo.Brands', 'U') IS NULL
    BEGIN
      CREATE TABLE dbo.Brands (
        BrandId INT IDENTITY(1,1) PRIMARY KEY,
        BrandName NVARCHAR(255) NOT NULL,
        CreatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
        UpdatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
      )
    END
  `);

  await pool.request().query(`
    IF COL_LENGTH('dbo.Brands', 'BrandName') IS NULL
    BEGIN
      ALTER TABLE dbo.Brands ADD BrandName NVARCHAR(255) NULL;
    END;
    IF COL_LENGTH('dbo.Brands', 'CreatedAt') IS NULL
    BEGIN
      ALTER TABLE dbo.Brands ADD CreatedAt DATETIME2 NOT NULL
        CONSTRAINT DF_Brands_CreatedAt DEFAULT SYSUTCDATETIME();
    END;
    IF COL_LENGTH('dbo.Brands', 'UpdatedAt') IS NULL
    BEGIN
      ALTER TABLE dbo.Brands ADD UpdatedAt DATETIME2 NOT NULL
        CONSTRAINT DF_Brands_UpdatedAt DEFAULT SYSUTCDATETIME();
    END;
  `);
};

const normalizeBrand = (row = {}) => ({
  id: row.BrandId ?? row.brandId ?? row.Id ?? row.id ?? null,
  name: row.BrandName ?? row.brandName ?? row.Name ?? row.name ?? "",
  createdAt: row.CreatedAt ?? row.createdAt ?? null,
  updatedAt: row.UpdatedAt ?? row.updatedAt ?? null,
});

const resolveOrCreateBrand = async (pool, brandName) => {
  const safeBrandName = normalizeOptionalString(brandName);
  if (!safeBrandName) {
    return null;
  }

  await ensureBrandsTable();

  const existingResult = await pool
    .request()
    .input("BrandName", sql.NVarChar(255), safeBrandName)
    .query(`
      SELECT TOP 1 *
      FROM dbo.Brands
      WHERE UPPER(LTRIM(RTRIM(BrandName))) = UPPER(LTRIM(RTRIM(@BrandName)))
      ORDER BY BrandId ASC
    `);
  const existing = existingResult.recordset?.[0] ?? null;
  if (existing) {
    return normalizeBrand(existing);
  }

  const createdResult = await pool
    .request()
    .input("BrandName", sql.NVarChar(255), safeBrandName)
    .query(`
      INSERT INTO dbo.Brands (BrandName)
      OUTPUT INSERTED.*
      VALUES (@BrandName)
    `);
  return normalizeBrand(createdResult.recordset?.[0] ?? {});
};

const ensureVendorsTable = async () => {
  const pool = await getPool();
  await pool.request().query(`
    IF OBJECT_ID('dbo.Vendors', 'U') IS NULL
    BEGIN
      CREATE TABLE dbo.Vendors (
        VendorId INT IDENTITY(1,1) PRIMARY KEY,
        VendorName NVARCHAR(255) NOT NULL,
        Phone NVARCHAR(50) NOT NULL,
        Email NVARCHAR(255) NULL,
        GSTNumber NVARCHAR(30) NULL,
        PANNumber NVARCHAR(20) NULL,
        BankAccountName NVARCHAR(255) NULL,
        BankAccountNumber NVARCHAR(120) NULL,
        BankName NVARCHAR(255) NULL,
        IFSCCode NVARCHAR(30) NULL,
        BankBranch NVARCHAR(255) NULL,
        DocumentsJson NVARCHAR(MAX) NULL,
        Address NVARCHAR(MAX) NULL,
        City NVARCHAR(120) NULL,
        State NVARCHAR(120) NULL,
        Pincode NVARCHAR(20) NULL,
        CreatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
        UpdatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
      )
    END
  `);

  await pool.request().query(`
    IF COL_LENGTH('dbo.Vendors', 'VendorName') IS NULL
    BEGIN
      ALTER TABLE dbo.Vendors ADD VendorName NVARCHAR(255) NULL;
    END;
    IF COL_LENGTH('dbo.Vendors', 'Phone') IS NULL
    BEGIN
      ALTER TABLE dbo.Vendors ADD Phone NVARCHAR(50) NULL;
    END;
    IF COL_LENGTH('dbo.Vendors', 'Email') IS NULL
    BEGIN
      ALTER TABLE dbo.Vendors ADD Email NVARCHAR(255) NULL;
    END;
    IF COL_LENGTH('dbo.Vendors', 'GSTNumber') IS NULL
    BEGIN
      ALTER TABLE dbo.Vendors ADD GSTNumber NVARCHAR(30) NULL;
    END;
    IF COL_LENGTH('dbo.Vendors', 'PANNumber') IS NULL
    BEGIN
      ALTER TABLE dbo.Vendors ADD PANNumber NVARCHAR(20) NULL;
    END;
    IF COL_LENGTH('dbo.Vendors', 'BankAccountName') IS NULL
    BEGIN
      ALTER TABLE dbo.Vendors ADD BankAccountName NVARCHAR(255) NULL;
    END;
    IF COL_LENGTH('dbo.Vendors', 'BankAccountNumber') IS NULL
    BEGIN
      ALTER TABLE dbo.Vendors ADD BankAccountNumber NVARCHAR(120) NULL;
    END;
    IF COL_LENGTH('dbo.Vendors', 'BankName') IS NULL
    BEGIN
      ALTER TABLE dbo.Vendors ADD BankName NVARCHAR(255) NULL;
    END;
    IF COL_LENGTH('dbo.Vendors', 'IFSCCode') IS NULL
    BEGIN
      ALTER TABLE dbo.Vendors ADD IFSCCode NVARCHAR(30) NULL;
    END;
    IF COL_LENGTH('dbo.Vendors', 'BankBranch') IS NULL
    BEGIN
      ALTER TABLE dbo.Vendors ADD BankBranch NVARCHAR(255) NULL;
    END;
    IF COL_LENGTH('dbo.Vendors', 'DocumentsJson') IS NULL
    BEGIN
      ALTER TABLE dbo.Vendors ADD DocumentsJson NVARCHAR(MAX) NULL;
    END;
    IF COL_LENGTH('dbo.Vendors', 'Address') IS NULL
    BEGIN
      ALTER TABLE dbo.Vendors ADD Address NVARCHAR(MAX) NULL;
    END;
    IF COL_LENGTH('dbo.Vendors', 'City') IS NULL
    BEGIN
      ALTER TABLE dbo.Vendors ADD City NVARCHAR(120) NULL;
    END;
    IF COL_LENGTH('dbo.Vendors', 'State') IS NULL
    BEGIN
      ALTER TABLE dbo.Vendors ADD State NVARCHAR(120) NULL;
    END;
    IF COL_LENGTH('dbo.Vendors', 'Pincode') IS NULL
    BEGIN
      ALTER TABLE dbo.Vendors ADD Pincode NVARCHAR(20) NULL;
    END;
    IF COL_LENGTH('dbo.Vendors', 'CreatedAt') IS NULL
    BEGIN
      ALTER TABLE dbo.Vendors ADD CreatedAt DATETIME2 NOT NULL
        CONSTRAINT DF_Vendors_CreatedAt DEFAULT SYSUTCDATETIME();
    END;
    IF COL_LENGTH('dbo.Vendors', 'UpdatedAt') IS NULL
    BEGIN
      ALTER TABLE dbo.Vendors ADD UpdatedAt DATETIME2 NOT NULL
        CONSTRAINT DF_Vendors_UpdatedAt DEFAULT SYSUTCDATETIME();
    END;

    BEGIN TRY
      IF COL_LENGTH('dbo.Vendors', 'Phone') IS NOT NULL
         AND COL_LENGTH('dbo.Vendors', 'Phone') < 100
      BEGIN
        ALTER TABLE dbo.Vendors ALTER COLUMN Phone NVARCHAR(50) NULL;
      END;
    END TRY
    BEGIN CATCH
    END CATCH;

    BEGIN TRY
      IF COL_LENGTH('dbo.Vendors', 'BankAccountNumber') IS NOT NULL
         AND COL_LENGTH('dbo.Vendors', 'BankAccountNumber') < 240
      BEGIN
        ALTER TABLE dbo.Vendors ALTER COLUMN BankAccountNumber NVARCHAR(120) NULL;
      END;
    END TRY
    BEGIN CATCH
    END CATCH;
  `);

  await pool.request().query(`
    IF OBJECT_ID('dbo.VendorContacts', 'U') IS NULL
    BEGIN
      CREATE TABLE dbo.VendorContacts (
        VendorContactId INT IDENTITY(1,1) PRIMARY KEY,
        VendorId INT NOT NULL,
        ContactName NVARCHAR(255) NOT NULL,
        Email NVARCHAR(255) NOT NULL,
        Designation NVARCHAR(255) NOT NULL,
        Phone NVARCHAR(50) NULL,
        CreatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
        UpdatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
        CONSTRAINT FK_VendorContacts_Vendor FOREIGN KEY (VendorId)
          REFERENCES dbo.Vendors(VendorId) ON DELETE CASCADE
      )
    END
  `);

  await pool.request().query(`
    IF COL_LENGTH('dbo.VendorContacts', 'VendorId') IS NULL
    BEGIN
      ALTER TABLE dbo.VendorContacts ADD VendorId INT NULL;
    END;
    IF COL_LENGTH('dbo.VendorContacts', 'ContactName') IS NULL
    BEGIN
      ALTER TABLE dbo.VendorContacts ADD ContactName NVARCHAR(255) NULL;
    END;
    IF COL_LENGTH('dbo.VendorContacts', 'Email') IS NULL
    BEGIN
      ALTER TABLE dbo.VendorContacts ADD Email NVARCHAR(255) NULL;
    END;
    IF COL_LENGTH('dbo.VendorContacts', 'Designation') IS NULL
    BEGIN
      ALTER TABLE dbo.VendorContacts ADD Designation NVARCHAR(255) NULL;
    END;
    IF COL_LENGTH('dbo.VendorContacts', 'Phone') IS NULL
    BEGIN
      ALTER TABLE dbo.VendorContacts ADD Phone NVARCHAR(50) NULL;
    END;
    IF COL_LENGTH('dbo.VendorContacts', 'CreatedAt') IS NULL
    BEGIN
      ALTER TABLE dbo.VendorContacts ADD CreatedAt DATETIME2 NOT NULL
        CONSTRAINT DF_VendorContacts_CreatedAt DEFAULT SYSUTCDATETIME();
    END;
    IF COL_LENGTH('dbo.VendorContacts', 'UpdatedAt') IS NULL
    BEGIN
      ALTER TABLE dbo.VendorContacts ADD UpdatedAt DATETIME2 NOT NULL
        CONSTRAINT DF_VendorContacts_UpdatedAt DEFAULT SYSUTCDATETIME();
    END;

    BEGIN TRY
      IF COL_LENGTH('dbo.VendorContacts', 'Phone') IS NOT NULL
         AND COL_LENGTH('dbo.VendorContacts', 'Phone') < 100
      BEGIN
        ALTER TABLE dbo.VendorContacts ALTER COLUMN Phone NVARCHAR(50) NULL;
      END;
    END TRY
    BEGIN CATCH
    END CATCH;
  `);
};

const ensureCustomersTable = async () => {
  if (ensureCustomersTable.promise) {
    return ensureCustomersTable.promise;
  }

  ensureCustomersTable.promise = (async () => {
  const pool = await getPool();
  await pool.request().query(`
    IF OBJECT_ID('dbo.Customers', 'U') IS NULL
    BEGIN
      CREATE TABLE dbo.Customers (
        CustomerId INT IDENTITY(1,1) PRIMARY KEY,
        CustomerName NVARCHAR(255) NOT NULL,
        CompanyName NVARCHAR(255) NULL,
        Address NVARCHAR(MAX) NULL,
        GSTNumber NVARCHAR(30) NULL,
        GSTType NVARCHAR(20) NULL,
        City NVARCHAR(120) NULL,
        State NVARCHAR(120) NULL,
        Pincode NVARCHAR(20) NULL,
        ContactNumber NVARCHAR(50) NULL,
        Email NVARCHAR(255) NULL,
        ContactPerson NVARCHAR(255) NULL,
        Designation NVARCHAR(255) NULL,
        DocumentsJson NVARCHAR(MAX) NULL,
        CreatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
        UpdatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
      )
    END
  `);

  await pool.request().query(`
    IF COL_LENGTH('dbo.Customers', 'CustomerName') IS NULL
    BEGIN
      ALTER TABLE dbo.Customers ADD CustomerName NVARCHAR(255) NULL;
    END;
    IF COL_LENGTH('dbo.Customers', 'CompanyName') IS NULL
    BEGIN
      ALTER TABLE dbo.Customers ADD CompanyName NVARCHAR(255) NULL;
    END;
    IF COL_LENGTH('dbo.Customers', 'Address') IS NULL
    BEGIN
      ALTER TABLE dbo.Customers ADD Address NVARCHAR(MAX) NULL;
    END;
    IF COL_LENGTH('dbo.Customers', 'GSTNumber') IS NULL
    BEGIN
      ALTER TABLE dbo.Customers ADD GSTNumber NVARCHAR(30) NULL;
    END;
    IF COL_LENGTH('dbo.Customers', 'GSTType') IS NULL
    BEGIN
      ALTER TABLE dbo.Customers ADD GSTType NVARCHAR(20) NULL;
    END;
    IF COL_LENGTH('dbo.Customers', 'City') IS NULL
    BEGIN
      ALTER TABLE dbo.Customers ADD City NVARCHAR(120) NULL;
    END;
    IF COL_LENGTH('dbo.Customers', 'State') IS NULL
    BEGIN
      ALTER TABLE dbo.Customers ADD State NVARCHAR(120) NULL;
    END;
    IF COL_LENGTH('dbo.Customers', 'Pincode') IS NULL
    BEGIN
      ALTER TABLE dbo.Customers ADD Pincode NVARCHAR(20) NULL;
    END;
    IF COL_LENGTH('dbo.Customers', 'ContactNumber') IS NULL
    BEGIN
      ALTER TABLE dbo.Customers ADD ContactNumber NVARCHAR(50) NULL;
    END;
    IF COL_LENGTH('dbo.Customers', 'Email') IS NULL
    BEGIN
      ALTER TABLE dbo.Customers ADD Email NVARCHAR(255) NULL;
    END;
    IF COL_LENGTH('dbo.Customers', 'ContactPerson') IS NULL
    BEGIN
      ALTER TABLE dbo.Customers ADD ContactPerson NVARCHAR(255) NULL;
    END;
    IF COL_LENGTH('dbo.Customers', 'Designation') IS NULL
    BEGIN
      ALTER TABLE dbo.Customers ADD Designation NVARCHAR(255) NULL;
    END;
    IF COL_LENGTH('dbo.Customers', 'DocumentsJson') IS NULL
    BEGIN
      ALTER TABLE dbo.Customers ADD DocumentsJson NVARCHAR(MAX) NULL;
    END;
    IF COL_LENGTH('dbo.Customers', 'CreatedAt') IS NULL
    BEGIN
      ALTER TABLE dbo.Customers ADD CreatedAt DATETIME2 NOT NULL
        CONSTRAINT DF_Customers_CreatedAt DEFAULT SYSUTCDATETIME();
    END;
    IF COL_LENGTH('dbo.Customers', 'UpdatedAt') IS NULL
    BEGIN
      ALTER TABLE dbo.Customers ADD UpdatedAt DATETIME2 NOT NULL
        CONSTRAINT DF_Customers_UpdatedAt DEFAULT SYSUTCDATETIME();
    END;

    BEGIN TRY
      IF COL_LENGTH('dbo.Customers', 'ContactNumber') IS NOT NULL
         AND COL_LENGTH('dbo.Customers', 'ContactNumber') < 100
      BEGIN
        ALTER TABLE dbo.Customers ALTER COLUMN ContactNumber NVARCHAR(50) NULL;
      END;
    END TRY
    BEGIN CATCH
    END CATCH;
  `);

  await pool.request().query(`
    IF OBJECT_ID('dbo.CustomerContacts', 'U') IS NULL
    BEGIN
      CREATE TABLE dbo.CustomerContacts (
        CustomerContactId INT IDENTITY(1,1) PRIMARY KEY,
        CustomerId INT NOT NULL,
        ContactName NVARCHAR(255) NOT NULL,
        Email NVARCHAR(255) NOT NULL,
        Designation NVARCHAR(255) NOT NULL,
        Phone NVARCHAR(50) NULL,
        CreatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
        UpdatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
        CONSTRAINT FK_CustomerContacts_Customer FOREIGN KEY (CustomerId)
          REFERENCES dbo.Customers(CustomerId) ON DELETE CASCADE
      )
    END
  `);

  await pool.request().query(`
    IF COL_LENGTH('dbo.CustomerContacts', 'CustomerId') IS NULL
    BEGIN
      ALTER TABLE dbo.CustomerContacts ADD CustomerId INT NULL;
    END;
    IF COL_LENGTH('dbo.CustomerContacts', 'ContactName') IS NULL
    BEGIN
      ALTER TABLE dbo.CustomerContacts ADD ContactName NVARCHAR(255) NULL;
    END;
    IF COL_LENGTH('dbo.CustomerContacts', 'Email') IS NULL
    BEGIN
      ALTER TABLE dbo.CustomerContacts ADD Email NVARCHAR(255) NULL;
    END;
    IF COL_LENGTH('dbo.CustomerContacts', 'Designation') IS NULL
    BEGIN
      ALTER TABLE dbo.CustomerContacts ADD Designation NVARCHAR(255) NULL;
    END;
    IF COL_LENGTH('dbo.CustomerContacts', 'Phone') IS NULL
    BEGIN
      ALTER TABLE dbo.CustomerContacts ADD Phone NVARCHAR(50) NULL;
    END;
    IF COL_LENGTH('dbo.CustomerContacts', 'CreatedAt') IS NULL
    BEGIN
      ALTER TABLE dbo.CustomerContacts ADD CreatedAt DATETIME2 NOT NULL
        CONSTRAINT DF_CustomerContacts_CreatedAt DEFAULT SYSUTCDATETIME();
    END;
    IF COL_LENGTH('dbo.CustomerContacts', 'UpdatedAt') IS NULL
    BEGIN
      ALTER TABLE dbo.CustomerContacts ADD UpdatedAt DATETIME2 NOT NULL
        CONSTRAINT DF_CustomerContacts_UpdatedAt DEFAULT SYSUTCDATETIME();
    END;

    BEGIN TRY
      IF COL_LENGTH('dbo.CustomerContacts', 'Phone') IS NOT NULL
         AND COL_LENGTH('dbo.CustomerContacts', 'Phone') < 100
      BEGIN
        ALTER TABLE dbo.CustomerContacts ALTER COLUMN Phone NVARCHAR(50) NULL;
      END;
    END TRY
    BEGIN CATCH
    END CATCH;
  `);
  })();

  try {
    return await ensureCustomersTable.promise;
  } catch (error) {
    ensureCustomersTable.promise = null;
    throw error;
  }
};

const createTimingLogger = (label) => {
  const startedAt = Date.now();
  let lastAt = startedAt;
  return (stage, details = {}) => {
    const now = Date.now();
    console.debug(`[timing] ${label} ${stage}`, {
      stageMs: now - lastAt,
      totalMs: now - startedAt,
      ...details,
    });
    lastAt = now;
  };
};
ensureCustomersTable.promise = null;

const ensureProjectsTable = async () => {
  if (ensureProjectsTable.promise) {
    return ensureProjectsTable.promise;
  }

  ensureProjectsTable.promise = (async () => {
  const pool = await getPool();
  await pool.request().query(`
    IF OBJECT_ID('dbo.Projects', 'U') IS NULL
    BEGIN
      CREATE TABLE dbo.Projects (
        ProjectId INT IDENTITY(1,1) PRIMARY KEY,
        ProjectName NVARCHAR(255) NOT NULL,
        ProjectCode NVARCHAR(100) NULL,
        CustomerId INT NULL,
        Client NVARCHAR(255) NULL,
        ClientCompany NVARCHAR(255) NULL,
        ClientAddress NVARCHAR(MAX) NULL,
        ClientGSTNumber NVARCHAR(30) NULL,
        ClientPhone NVARCHAR(50) NULL,
        ClientEmail NVARCHAR(255) NULL,
        ClientContactPerson NVARCHAR(255) NULL,
        ClientDesignation NVARCHAR(255) NULL,
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
    IF COL_LENGTH('dbo.Projects', 'CustomerId') IS NULL
    BEGIN
      ALTER TABLE dbo.Projects ADD CustomerId INT NULL;
    END;
    IF COL_LENGTH('dbo.Projects', 'ClientCompany') IS NULL
    BEGIN
      ALTER TABLE dbo.Projects ADD ClientCompany NVARCHAR(255) NULL;
    END;
    IF COL_LENGTH('dbo.Projects', 'ClientAddress') IS NULL
    BEGIN
      ALTER TABLE dbo.Projects ADD ClientAddress NVARCHAR(MAX) NULL;
    END;
    IF COL_LENGTH('dbo.Projects', 'ClientGSTNumber') IS NULL
    BEGIN
      ALTER TABLE dbo.Projects ADD ClientGSTNumber NVARCHAR(30) NULL;
    END;
    IF COL_LENGTH('dbo.Projects', 'ClientPhone') IS NULL
    BEGIN
      ALTER TABLE dbo.Projects ADD ClientPhone NVARCHAR(50) NULL;
    END;
    IF COL_LENGTH('dbo.Projects', 'ClientEmail') IS NULL
    BEGIN
      ALTER TABLE dbo.Projects ADD ClientEmail NVARCHAR(255) NULL;
    END;
    IF COL_LENGTH('dbo.Projects', 'ClientContactPerson') IS NULL
    BEGIN
      ALTER TABLE dbo.Projects ADD ClientContactPerson NVARCHAR(255) NULL;
    END;
    IF COL_LENGTH('dbo.Projects', 'ClientDesignation') IS NULL
    BEGIN
      ALTER TABLE dbo.Projects ADD ClientDesignation NVARCHAR(255) NULL;
    END;

    BEGIN TRY
      IF COL_LENGTH('dbo.Projects', 'ClientPhone') IS NOT NULL
         AND COL_LENGTH('dbo.Projects', 'ClientPhone') < 100
      BEGIN
        ALTER TABLE dbo.Projects ALTER COLUMN ClientPhone NVARCHAR(50) NULL;
      END;
    END TRY
    BEGIN CATCH
    END CATCH;
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
  })();

  try {
    return await ensureProjectsTable.promise;
  } catch (error) {
    ensureProjectsTable.promise = null;
    throw error;
  }
};
ensureProjectsTable.promise = null;

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
        ShipToLocationId INT NULL,
        Status NVARCHAR(50) NULL,
        OrderDate DATE NULL,
        ExpectedDate DATE NULL,
        ExpectedDeliveryDate DATE NULL,
        Notes NVARCHAR(255) NULL,
        TermsAndConditions NVARCHAR(MAX) NULL,
        Total DECIMAL(18,2) NULL,
        CreatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
        UpdatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
      )
    END
  `);

  await pool.request().query(`
    IF COL_LENGTH('dbo.PurchaseOrders', 'ExpectedDeliveryDate') IS NULL
    BEGIN
      ALTER TABLE dbo.PurchaseOrders ADD ExpectedDeliveryDate DATE NULL;
    END;
    IF COL_LENGTH('dbo.PurchaseOrders', 'CreatedAt') IS NULL
    BEGIN
      ALTER TABLE dbo.PurchaseOrders ADD CreatedAt DATETIME2 NOT NULL
        CONSTRAINT DF_PurchaseOrders_CreatedAt DEFAULT SYSUTCDATETIME();
    END;
    IF COL_LENGTH('dbo.PurchaseOrders', 'UpdatedAt') IS NULL
    BEGIN
      ALTER TABLE dbo.PurchaseOrders ADD UpdatedAt DATETIME2 NOT NULL
        CONSTRAINT DF_PurchaseOrders_UpdatedAt DEFAULT SYSUTCDATETIME();
    END;
    IF COL_LENGTH('dbo.PurchaseOrders', 'BOQId') IS NULL
    BEGIN
      ALTER TABLE dbo.PurchaseOrders ADD BOQId INT NULL;
    END;
    IF COL_LENGTH('dbo.PurchaseOrders', 'TermsAndConditions') IS NULL
    BEGIN
      ALTER TABLE dbo.PurchaseOrders ADD TermsAndConditions NVARCHAR(MAX) NULL;
    END;
    IF EXISTS (
      SELECT 1
      FROM sys.columns
      WHERE object_id = OBJECT_ID('dbo.PurchaseOrders')
        AND name = 'Total'
        AND ([precision] < 18 OR [scale] <> 2)
    )
    BEGIN
      ALTER TABLE dbo.PurchaseOrders ALTER COLUMN Total DECIMAL(18,2) NULL;
    END;
  `);

  await pool.request().query(`
    IF COL_LENGTH('dbo.PurchaseOrders', 'ShipToLocationId') IS NULL
    BEGIN
      ALTER TABLE dbo.PurchaseOrders ADD ShipToLocationId INT NULL;
    END;
  `);

  await pool.request().query(`
    UPDATE dbo.PurchaseOrders
    SET ShipToLocationId = LocationId
    WHERE ShipToLocationId IS NULL
      AND LocationId IS NOT NULL;
  `);

  await pool.request().query(`
    IF OBJECT_ID('dbo.PurchaseOrderItems', 'U') IS NULL
    BEGIN
      CREATE TABLE dbo.PurchaseOrderItems (
        Id INT IDENTITY(1,1) PRIMARY KEY,
        PurchaseOrderId INT NOT NULL,
        ItemId INT NULL,
        BoqItemId INT NULL,
        Name NVARCHAR(255) NOT NULL DEFAULT '',
        Description NVARCHAR(MAX) NULL,
        Unit NVARCHAR(30) NULL,
        HSN NVARCHAR(50) NULL,
        GST NVARCHAR(100) NULL,
        TaxPercentage DECIMAL(5,2) NULL,
        SerialRequired BIT NOT NULL DEFAULT 0,
        SerialNumber NVARCHAR(255) NULL,
        Quantity INT NOT NULL DEFAULT 0,
        UnitPrice DECIMAL(18, 2) NULL,
        Rate DECIMAL(18, 2) NOT NULL DEFAULT 0,
        TotalPrice DECIMAL(18, 2) NULL,
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
    IF COL_LENGTH('dbo.PurchaseOrderItems', 'BoqItemId') IS NULL
    BEGIN
      ALTER TABLE dbo.PurchaseOrderItems ADD BoqItemId INT NULL;
    END;
    IF COL_LENGTH('dbo.PurchaseOrderItems', 'HSN') IS NULL
    BEGIN
      ALTER TABLE dbo.PurchaseOrderItems ADD HSN NVARCHAR(50) NULL;
    END;
    IF COL_LENGTH('dbo.PurchaseOrderItems', 'GST') IS NULL
    BEGIN
      ALTER TABLE dbo.PurchaseOrderItems ADD GST NVARCHAR(100) NULL;
    END;
    IF COL_LENGTH('dbo.PurchaseOrderItems', 'TaxPercentage') IS NULL
    BEGIN
      ALTER TABLE dbo.PurchaseOrderItems ADD TaxPercentage DECIMAL(5,2) NULL;
    END;
    IF COL_LENGTH('dbo.PurchaseOrderItems', 'SerialRequired') IS NULL
    BEGIN
      ALTER TABLE dbo.PurchaseOrderItems ADD SerialRequired BIT NOT NULL CONSTRAINT DF_POItems_SerialRequired DEFAULT 0;
    END;
    IF COL_LENGTH('dbo.PurchaseOrderItems', 'SerialNumber') IS NULL
    BEGIN
      ALTER TABLE dbo.PurchaseOrderItems ADD SerialNumber NVARCHAR(255) NULL;
    END;
    IF COL_LENGTH('dbo.PurchaseOrderItems', 'UnitPrice') IS NULL
    BEGIN
      ALTER TABLE dbo.PurchaseOrderItems ADD UnitPrice DECIMAL(18,2) NULL;
    END;
    IF COL_LENGTH('dbo.PurchaseOrderItems', 'TotalPrice') IS NULL
    BEGIN
      ALTER TABLE dbo.PurchaseOrderItems ADD TotalPrice DECIMAL(18,2) NULL;
    END;
    IF EXISTS (
      SELECT 1
      FROM sys.columns
      WHERE object_id = OBJECT_ID('dbo.PurchaseOrderItems')
        AND name = 'UnitPrice'
        AND ([precision] < 18 OR [scale] <> 2)
    )
    BEGIN
      ALTER TABLE dbo.PurchaseOrderItems ALTER COLUMN UnitPrice DECIMAL(18,2) NULL;
    END;
    IF EXISTS (
      SELECT 1
      FROM sys.columns
      WHERE object_id = OBJECT_ID('dbo.PurchaseOrderItems')
        AND name = 'Quantity'
        AND (
          system_type_id <> TYPE_ID('decimal')
          OR [precision] < 18
          OR [scale] <> 2
        )
    )
    BEGIN
      ALTER TABLE dbo.PurchaseOrderItems ALTER COLUMN Quantity DECIMAL(18,2) NOT NULL;
    END;
    IF EXISTS (
      SELECT 1
      FROM sys.columns
      WHERE object_id = OBJECT_ID('dbo.PurchaseOrderItems')
        AND name = 'Rate'
        AND ([precision] < 18 OR [scale] <> 2)
    )
    BEGIN
      ALTER TABLE dbo.PurchaseOrderItems ALTER COLUMN Rate DECIMAL(18,2) NOT NULL;
    END;
    IF EXISTS (
      SELECT 1
      FROM sys.columns
      WHERE object_id = OBJECT_ID('dbo.PurchaseOrderItems')
        AND name = 'TotalPrice'
        AND ([precision] < 18 OR [scale] <> 2)
    )
    BEGIN
      ALTER TABLE dbo.PurchaseOrderItems ALTER COLUMN TotalPrice DECIMAL(18,2) NULL;
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

const normalizePurchaseOrderItemsInput = (items = []) =>
  (Array.isArray(items) ? items : [])
    .map((item) => {
      const quantity = normalizeCurrencyValue(
        item.quantity ?? item.qty ?? item.Quantity ?? 0
      );
      const unitPrice = normalizeCurrencyValue(
        item.unitPrice ?? item.rate ?? item.UnitPrice ?? item.Rate ?? 0
      );
      const taxPercentage =
        parseTaxPercentageValue(
          item.taxPercentage ??
            item.TaxPercentage ??
            item.gst ??
            item.GST ??
            item.gstRate ??
            item.GSTRate
        ) ?? 0;
      const gstLabel =
        normalizeOptionalString(item.gst ?? item.GST ?? item.gstRate ?? item.GSTRate) ??
        formatTaxPercentageLabel(taxPercentage);
      const notesValue = normalizeOptionalString(
        item.location ?? item.Location ?? item.notes ?? item.Notes
      );

      return {
        itemId: toNullableInt(item.itemId ?? item.ItemId),
        boqItemId: toNullableInt(
          item.boqItemId ?? item.BoqItemId ?? item.BOQItemId
        ),
        name: String(item.name ?? item.Name ?? item.ItemName ?? "").trim(),
        description: normalizeOptionalString(item.description ?? item.Description),
        unit: normalizeOptionalString(item.unit ?? item.Unit) ?? "PCS",
        hsn:
          normalizeOptionalString(
            item.hsn ?? item.HSN ?? item.hsnCode ?? item.HSNCode
          ) ?? "",
        gst: gstLabel ?? "",
        serialNumber:
          normalizeOptionalString(item.serialNumber ?? item.SerialNumber) ?? "",
        serialRequired: normalizeBooleanFlag(
          item.serialRequired ?? item.SerialRequired,
          false
        ),
        taxPercentage,
        quantity,
        unitPrice,
        totalPrice: normalizeCurrencyValue(
          item.totalPrice ?? item.TotalPrice,
          quantity * unitPrice
        ),
        notes: notesValue ?? "",
      };
    })
    .filter((item) => item.quantity > 0 && item.name);

const normalizePurchaseOrderItemIdentityName = (item = {}) =>
  String(item.name ?? item.ItemName ?? "")
    .trim()
    .toLowerCase();

const validatePurchaseOrderItemsInput = (items = []) => {
  const identityMap = new Map();

  for (const item of Array.isArray(items) ? items : []) {
    const boqItemId = toNullableInt(
      item.boqItemId ?? item.BoqItemId ?? item.BOQItemId
    );
    const itemId = toNullableInt(item.itemId ?? item.ItemId);
    const normalizedName = normalizePurchaseOrderItemIdentityName(item);
    const normalizedUnit = String(item.unit ?? item.Unit ?? "PCS")
      .trim()
      .toUpperCase();
    const identityKey =
      boqItemId !== null
        ? `boq-item-id:${boqItemId}`
        : itemId !== null
        ? `item-id:${itemId}`
        : normalizedName
        ? `item-name:${normalizedName}::${normalizedUnit || "PCS"}`
        : null;
    if (!identityKey) {
      continue;
    }
    if (identityMap.has(identityKey)) {
      const duplicateName = item.name || identityMap.get(identityKey)?.name || "item";
      const error = new Error(
        `${duplicateName} is duplicated in the purchase order line items. Remove duplicates and try again.`
      );
      error.statusCode = 400;
      throw error;
    }
    identityMap.set(identityKey, item);
  }
};

const validatePurchaseOrderBoqItemsAvailable = async (
  tx,
  {
    projectId = null,
    boqId = null,
    items = [],
    excludePurchaseOrderId = null,
  } = {}
) => {
  const safeProjectId = toNullableInt(projectId);
  const safeBoqId = toNullableInt(boqId);
  const safeExcludePurchaseOrderId = toNullableInt(excludePurchaseOrderId);
  if (safeBoqId === null) {
    return;
  }

  await ensureBoqTables();
  const result = await new sql.Request(tx)
    .input("BOQId", sql.Int, safeBoqId)
    .query(`
      SELECT TOP 1 BOQId, ProjectId, BOQNumber, Status
      FROM dbo.BOQProjects
      WHERE BOQId = @BOQId
  `);

  const boq = result.recordset?.[0] ?? null;
  if (!boq) {
    const error = new Error("Selected BOQ was not found.");
    error.statusCode = 404;
    throw error;
  }

  if (
    safeProjectId !== null &&
    toNullableInt(boq.ProjectId) !== safeProjectId
  ) {
    const error = new Error("The selected BOQ does not belong to the selected project.");
    error.statusCode = 400;
    error.details = {
      projectId: safeProjectId,
      boqId: safeBoqId,
      boqProjectId: toNullableInt(boq.ProjectId),
    };
    throw error;
  }

  if (normalizeInventoryKeyValue(boq.Status) === "closed") {
    const error = new Error(
      `BOQ ${boq.BOQNumber || safeBoqId} is closed and cannot be linked to a purchase order.`
    );
    error.statusCode = 409;
    throw error;
  }

  const linkedItems = (Array.isArray(items) ? items : []).filter(
    (item) => toNullableInt(item?.boqItemId) !== null
  );
  if (!linkedItems.length) {
    return;
  }

  const requestedQtyByBoqItemId = new Map();
  linkedItems.forEach((item) => {
    const boqItemId = toNullableInt(item.boqItemId);
    const quantity = Number(item.quantity ?? 0) || 0;
    if (boqItemId === null || quantity <= 0) {
      return;
    }
    requestedQtyByBoqItemId.set(
      boqItemId,
      (requestedQtyByBoqItemId.get(boqItemId) ?? 0) + quantity
    );
  });

  const boqItemIds = Array.from(requestedQtyByBoqItemId.keys());
  if (!boqItemIds.length) {
    return;
  }

  const itemReq = new sql.Request(tx);
  const inClause = buildPurchaseOrderItemInClause(itemReq, boqItemIds, "BoqItemId");
  const itemResult = await itemReq
    .input("BOQId", sql.Int, safeBoqId)
    .query(`
      SELECT LineItemId, BOQId, ItemId, ItemName, Quantity
      FROM dbo.BOQLineItems
      WHERE BOQId = @BOQId
        AND LineItemId IN (${inClause})
    `);

  const boqRows = itemResult.recordset ?? [];
  if (boqRows.length !== boqItemIds.length) {
    const error = new Error("One or more linked BOQ items do not belong to the selected BOQ.");
    error.statusCode = 400;
    throw error;
  }

  const orderedTotals = await loadBoqOrderedTotals(tx, boqItemIds, {
    excludePurchaseOrderId: safeExcludePurchaseOrderId,
  });
  for (const row of boqRows) {
    const boqItemId = toNullableInt(row.LineItemId);
    const boqQty = Number(row.Quantity ?? 0) || 0;
    const existingOrderedQty = orderedTotals.get(boqItemId) ?? 0;
    const requestedQty = requestedQtyByBoqItemId.get(boqItemId) ?? 0;
    const boqBalanceQty = Math.max(boqQty - existingOrderedQty, 0);

    if (requestedQty - boqBalanceQty > 0.0001) {
      const error = new Error(
        `PO quantity for ${row.ItemName || "the selected BOQ item"} cannot exceed the BOQ balance. BOQ Qty: ${boqQty}, Existing PO Qty: ${existingOrderedQty}, Available BOQ Balance: ${boqBalanceQty}, Requested PO Qty: ${requestedQty}.`
      );
      error.statusCode = 400;
      error.details = {
        projectId: safeProjectId,
        boqId: safeBoqId,
        boqItemId,
        itemId: toNullableInt(row.ItemId),
        boqQty,
        existingPoQty: existingOrderedQty,
        availableBoqBalance: boqBalanceQty,
        requestedPoQty: requestedQty,
      };
      throw error;
    }
  }
};

const normalizeBoqItemsInput = (items = []) =>
  (Array.isArray(items) ? items : [])
    .map((item) => ({
      id: toNullableInt(item.id ?? item.Id ?? item.LineItemId ?? item.lineItemId),
      itemId: toNullableInt(
        item.itemId ?? item.ItemId ?? item.inventoryItemId ?? item.InventoryItemId
      ),
      name: String(item.name ?? item.Name ?? item.ItemName ?? "").trim(),
      description: normalizeOptionalString(item.description ?? item.Description) ?? "",
      serialNumber:
        normalizeOptionalString(item.serialNumber ?? item.SerialNumber) ?? "",
      unit: normalizeOptionalString(item.unit ?? item.Unit) ?? "PCS",
      hsn:
        normalizeOptionalString(
          item.hsn ?? item.HSN ?? item.hsnCode ?? item.HSNCode
        ) ?? "",
      gst:
        normalizeOptionalString(
          item.gst ?? item.GST ?? item.gstRate ?? item.GSTRate
        ) ?? "",
      quantity:
        Number(
          item.quantity ??
            item.Quantity ??
            item.unitQty ??
            item.UnitQty ??
            item.unitQuantity ??
            item.UnitQuantity ??
            item.qty ??
            item.Qty ??
            0
        ) || 0,
      rate: Number(item.rate ?? item.Rate ?? item.unitPrice ?? item.UnitPrice ?? 0) || 0,
      notes: normalizeOptionalString(item.notes ?? item.Notes) ?? "",
    }))
    .filter((item) => item.quantity > 0 && item.name);

const resolvePurchaseOrderItemColumns = (cols = new Set()) => {
  const hasPoId = cols.has("PurchaseOrderId");
  return {
    hasPoId,
    poIdCol: hasPoId ? "PurchaseOrderId" : null,
    itemIdCol: cols.has("ItemId") ? "ItemId" : null,
    boqItemIdCol: cols.has("BoqItemId")
      ? "BoqItemId"
      : cols.has("BOQItemId")
      ? "BOQItemId"
      : null,
    nameCol: cols.has("ItemName") ? "ItemName" : cols.has("Name") ? "Name" : null,
    descCol: cols.has("Description") ? "Description" : null,
    hsnCol: cols.has("HSN") ? "HSN" : cols.has("Hsn") ? "Hsn" : null,
    gstCol: cols.has("GST") ? "GST" : cols.has("Gst") ? "Gst" : null,
    taxCol: cols.has("TaxPercentage")
      ? "TaxPercentage"
      : cols.has("Tax")
      ? "Tax"
      : null,
    serialNumberCol: cols.has("SerialNumber")
      ? "SerialNumber"
      : cols.has("serialNumber")
      ? "serialNumber"
      : null,
    serialRequiredCol: cols.has("SerialRequired") ? "SerialRequired" : null,
    qtyCol: cols.has("Quantity") ? "Quantity" : cols.has("Qty") ? "Qty" : null,
    unitPriceCol: cols.has("UnitPrice")
      ? "UnitPrice"
      : cols.has("Rate")
      ? "Rate"
      : cols.has("Price")
      ? "Price"
      : null,
    rateCol: cols.has("Rate") ? "Rate" : null,
    totalCol: cols.has("TotalPrice") ? "TotalPrice" : cols.has("Total") ? "Total" : null,
    unitCol: cols.has("Unit") ? "Unit" : null,
    notesCol: cols.has("Notes") ? "Notes" : null,
  };
};

const insertPurchaseOrderItems = async (tx, purchaseOrderId, items = []) => {
  const colCheck = await new sql.Request(tx).query(`
    SELECT name AS ColumnName
    FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.PurchaseOrderItems')
  `);
  const cols = new Set((colCheck.recordset ?? []).map((row) => row.ColumnName));
  const config = resolvePurchaseOrderItemColumns(cols);
  const canInsert = config.hasPoId && config.nameCol && config.qtyCol && config.unitPriceCol;
  if (!canInsert) {
    return 0;
  }

  let total = 0;
  for (const item of items) {
    const safeQuantity = normalizeCurrencyValue(item.quantity);
    const safeUnitPrice = normalizeCurrencyValue(item.unitPrice);
    const safeTotalPrice = normalizeCurrencyValue(
      item.totalPrice,
      safeQuantity * safeUnitPrice
    );
    const req = new sql.Request(tx);
    req.input("PurchaseOrderId", sql.Int, purchaseOrderId);
    req.input("ItemId", sql.Int, item.itemId ?? null);
    req.input("BoqItemId", sql.Int, item.boqItemId ?? null);
    req.input("Name", sql.NVarChar(255), item.name);
    req.input("Desc", sql.NVarChar(sql.MAX), item.description ?? null);
    req.input("HSN", sql.NVarChar(50), item.hsn || null);
    req.input("GST", sql.NVarChar(100), item.gst || null);
    req.input("TaxPercentage", sql.Decimal(5, 2), item.taxPercentage ?? 0);
    req.input("SerialNumber", sql.NVarChar(255), item.serialNumber || null);
    req.input("SerialRequired", sql.Bit, normalizeBooleanFlag(item.serialRequired, false));
    req.input("Qty", sql.Decimal(18, 2), safeQuantity);
    req.input("UnitPrice", sql.Decimal(18, 2), safeUnitPrice);
    req.input("Total", sql.Decimal(18, 2), safeTotalPrice);
    req.input("Unit", sql.NVarChar(50), item.unit ?? "PCS");
    req.input("Notes", sql.NVarChar(sql.MAX), item.notes || null);

    const colsToUse = [
      "PurchaseOrderId",
      config.itemIdCol,
      config.boqItemIdCol,
      config.nameCol,
      config.descCol,
      config.hsnCol,
      config.gstCol,
      config.taxCol,
      config.serialNumberCol,
      config.serialRequiredCol,
      config.qtyCol,
      config.unitPriceCol,
      config.rateCol && config.rateCol !== config.unitPriceCol ? config.rateCol : null,
      config.totalCol,
      config.unitCol,
      config.notesCol,
    ].filter(Boolean);

    const values = colsToUse.map((column) => {
      if (column === "PurchaseOrderId") return "@PurchaseOrderId";
      if (column === config.itemIdCol) return "@ItemId";
      if (column === config.boqItemIdCol) return "@BoqItemId";
      if (column === config.nameCol) return "@Name";
      if (column === config.descCol) return "@Desc";
      if (column === config.hsnCol) return "@HSN";
      if (column === config.gstCol) return "@GST";
      if (column === config.taxCol) return "@TaxPercentage";
      if (column === config.serialNumberCol) return "@SerialNumber";
      if (column === config.serialRequiredCol) return "@SerialRequired";
      if (column === config.qtyCol) return "@Qty";
      if (column === config.unitPriceCol || column === config.rateCol) return "@UnitPrice";
      if (column === config.totalCol) return "@Total";
      if (column === config.unitCol) return "@Unit";
      if (column === config.notesCol) return "@Notes";
      return "NULL";
    });

    try {
      await req.query(`
        INSERT INTO dbo.PurchaseOrderItems (${colsToUse.join(", ")})
        VALUES (${values.join(", ")})
      `);
      total += safeTotalPrice;
    } catch (insertError) {
      console.error(
        "Error inserting purchase order item:",
        insertError?.message,
        "Columns:",
        colsToUse.join(", "),
        "Values:",
        values.join(", ")
      );
      throw insertError;
    }
  }

  return total;
};

const loadPurchaseOrderItemsConfig = async (tx) => {
  const colCheck = await new sql.Request(tx).query(`
    SELECT name AS ColumnName
    FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.PurchaseOrderItems')
  `);
  const cols = new Set((colCheck.recordset ?? []).map((row) => row.ColumnName));
  return resolvePurchaseOrderItemColumns(cols);
};

const buildPurchaseOrderItemInClause = (request, ids = [], paramBase = "Id") =>
  ids
    .map((id, index) => {
      const paramName = `${paramBase}${index}`;
      request.input(paramName, sql.Int, id);
      return `@${paramName}`;
    })
    .join(", ");

const buildPurchaseOrderUnitPriceExpression = (config = {}, tableAlias = "") => {
  const qualify = (column) =>
    tableAlias ? `${tableAlias}.${toIdentifier(column)}` : toIdentifier(column);
  const unitPriceCol = config.unitPriceCol ? qualify(config.unitPriceCol) : null;
  const rateCol =
    config.rateCol && config.rateCol !== config.unitPriceCol
      ? qualify(config.rateCol)
      : null;

  if (unitPriceCol && rateCol) {
    return `COALESCE(${unitPriceCol}, ${rateCol}, 0)`;
  }
  if (unitPriceCol) {
    return `COALESCE(${unitPriceCol}, 0)`;
  }
  if (rateCol) {
    return `COALESCE(${rateCol}, 0)`;
  }
  return "0";
};

const recalculatePurchaseOrderTotal = async (tx, purchaseOrderId, config = null) => {
  const resolvedConfig = config ?? (await loadPurchaseOrderItemsConfig(tx));
  const qtyCol = resolvedConfig.qtyCol ? toIdentifier(resolvedConfig.qtyCol) : null;
  const totalCol = resolvedConfig.totalCol ? toIdentifier(resolvedConfig.totalCol) : null;
  const unitPriceExpr = buildPurchaseOrderUnitPriceExpression(resolvedConfig);
  const totalExpr =
    totalCol && qtyCol
      ? `COALESCE(${totalCol}, ${qtyCol} * ${unitPriceExpr})`
      : qtyCol
      ? `${qtyCol} * ${unitPriceExpr}`
      : "0";

  const totalResult = await new sql.Request(tx)
    .input("PurchaseOrderId", sql.Int, purchaseOrderId)
    .query(`
      SELECT SUM(${totalExpr}) AS Total
      FROM dbo.PurchaseOrderItems
      WHERE PurchaseOrderId = @PurchaseOrderId
    `);

  const total = roundCurrencyValue(totalResult.recordset?.[0]?.Total ?? 0);

  await new sql.Request(tx)
    .input("PurchaseOrderId", sql.Int, purchaseOrderId)
    .input("Total", sql.Decimal(18, 2), total)
    .query(`
      UPDATE dbo.PurchaseOrders
      SET Total = @Total,
          UpdatedAt = SYSUTCDATETIME()
      WHERE Id = @PurchaseOrderId
    `);

  return total;
};

const loadBoqConsumedTotals = async (tx, boqItemIds = []) => {
  const ids = uniqueBoqItemIds(boqItemIds);
  if (!ids.length) {
    return new Map();
  }

  const tableCheck = await new sql.Request(tx).query(`
    SELECT OBJECT_ID('dbo.ConsumptionItems', 'U') AS TableId,
           COL_LENGTH('dbo.ConsumptionItems', 'BoqItemId') AS BoqItemIdLength
  `);
  if (!tableCheck.recordset?.[0]?.TableId || !tableCheck.recordset?.[0]?.BoqItemIdLength) {
    return new Map();
  }

  const request = new sql.Request(tx);
  const inClause = buildPurchaseOrderItemInClause(request, ids, "BoqItemId");
  const result = await request.query(`
    SELECT BoqItemId, SUM(Quantity) AS TotalConsumed
    FROM dbo.ConsumptionItems
    WHERE BoqItemId IN (${inClause})
    GROUP BY BoqItemId
  `);

  return (result.recordset ?? []).reduce((acc, row) => {
    const id = toNullableInt(row.BoqItemId);
    if (id !== null) {
      acc.set(id, Number(row.TotalConsumed ?? 0) || 0);
    }
    return acc;
  }, new Map());
};

const loadBoqOrderedTotals = async (
  tx,
  boqItemIds = [],
  { excludePurchaseOrderId = null } = {}
) => {
  const ids = uniqueBoqItemIds(boqItemIds);
  if (!ids.length) {
    return new Map();
  }

  const config = await loadPurchaseOrderItemsConfig(tx);
  if (!config.boqItemIdCol || !config.qtyCol) {
    return new Map();
  }

  const request = new sql.Request(tx);
  const inClause = buildPurchaseOrderItemInClause(request, ids, "BoqItemId");
  const safeExcludePurchaseOrderId = toNullableInt(excludePurchaseOrderId);
  if (safeExcludePurchaseOrderId !== null && config.hasPoId) {
    request.input("ExcludePurchaseOrderId", sql.Int, safeExcludePurchaseOrderId);
  }

  const poItemsAlias = config.hasPoId ? "poi." : "";
  const result = await request.query(`
    SELECT ${poItemsAlias}${toIdentifier(config.boqItemIdCol)} AS BoqItemId,
           SUM(${poItemsAlias}${toIdentifier(config.qtyCol)}) AS TotalOrdered
    FROM dbo.PurchaseOrderItems${config.hasPoId ? " poi" : ""}
    ${
      config.hasPoId
        ? `INNER JOIN dbo.PurchaseOrders po
             ON po.Id = poi.${toIdentifier(config.poIdCol)}`
        : ""
    }
    WHERE ${poItemsAlias}${toIdentifier(config.boqItemIdCol)} IN (${inClause})
      ${
        config.hasPoId
          ? `AND LOWER(LTRIM(RTRIM(COALESCE(po.Status, '')))) NOT IN
               ('cancelled', 'canceled', 'rejected', 'void')`
          : ""
      }
      ${
        safeExcludePurchaseOrderId !== null && config.hasPoId
          ? `AND poi.${toIdentifier(config.poIdCol)} <> @ExcludePurchaseOrderId`
          : ""
      }
    GROUP BY ${poItemsAlias}${toIdentifier(config.boqItemIdCol)}
  `);

  return (result.recordset ?? []).reduce((acc, row) => {
    const id = toNullableInt(row.BoqItemId);
    if (id !== null) {
      acc.set(id, Number(row.TotalOrdered ?? 0) || 0);
    }
    return acc;
  }, new Map());
};

const applyBoqQuantitiesFromPurchaseOrderItems = async (
  tx,
  { boqId = null, items = [] } = {}
) => {
  const linkedItems = (Array.isArray(items) ? items : []).filter(
    (item) => item?.boqItemId !== null && item?.boqItemId !== undefined
  );
  if (!linkedItems.length) {
    return [];
  }

  const quantityByBoqItemId = new Map();
  for (const item of linkedItems) {
    const boqItemId = toNullableInt(item.boqItemId);
    if (!boqItemId) {
      continue;
    }
    const nextQuantity = Number(item.quantity ?? 0) || 0;
    quantityByBoqItemId.set(
      boqItemId,
      (quantityByBoqItemId.get(boqItemId) ?? 0) + nextQuantity
    );
  }

  const boqItemIds = Array.from(quantityByBoqItemId.keys());
  if (!boqItemIds.length) {
    return [];
  }

  const request = new sql.Request(tx);
  const inClause = buildPurchaseOrderItemInClause(request, boqItemIds, "BoqItemId");
  const result = await request.query(`
    SELECT LineItemId, BOQId, ItemName, Quantity
    FROM dbo.BOQLineItems
    WHERE LineItemId IN (${inClause})
  `);
  const existingRows = result.recordset ?? [];

  if (existingRows.length !== boqItemIds.length) {
    const error = new Error("One or more linked BOQ items could not be found.");
    error.statusCode = 400;
    throw error;
  }

  const normalizedBoqId = toNullableInt(boqId);
  if (
    normalizedBoqId !== null &&
    existingRows.some((row) => toNullableInt(row.BOQId) !== normalizedBoqId)
  ) {
    const error = new Error("The selected BOQ does not match the linked purchase-order items.");
    error.statusCode = 400;
    throw error;
  }

  const consumedTotals = await loadBoqConsumedTotals(tx, boqItemIds);
  const orderedTotals = await loadBoqOrderedTotals(tx, boqItemIds);
  for (const row of existingRows) {
    const boqItemId = toNullableInt(row.LineItemId);
    const boqQuantity = Number(row.Quantity ?? 0) || 0;
    const consumedQty = consumedTotals.get(boqItemId) ?? 0;
    const orderedQty = orderedTotals.get(boqItemId) ?? 0;
    const currentRequestQty = quantityByBoqItemId.get(boqItemId) ?? 0;
    const priorOrderedQty = Math.max(orderedQty - currentRequestQty, 0);
    const boqBalanceQty = Math.max(boqQuantity - priorOrderedQty, 0);
    if (boqQuantity < consumedQty) {
      const error = new Error(
        `Quantity for ${row.ItemName || "the linked BOQ item"} cannot be lower than the consumed quantity (${consumedQty}).`
      );
      error.statusCode = 400;
      throw error;
    }
    if (orderedQty - boqQuantity > 0.0001) {
      const error = new Error(
        `PO quantity for ${row.ItemName || "the linked BOQ item"} cannot exceed the BOQ balance (${boqBalanceQty}).`
      );
      error.statusCode = 400;
      throw error;
    }
  }

  const touchedBoqIds = Array.from(
    new Set(existingRows.map((row) => toNullableInt(row.BOQId)).filter((value) => value !== null))
  );
  for (const touchedBoqId of touchedBoqIds) {
    await new sql.Request(tx)
      .input("BOQId", sql.Int, touchedBoqId)
      .query(`
        UPDATE dbo.BOQProjects
        SET UpdatedAt = SYSUTCDATETIME()
        WHERE BOQId = @BOQId
      `);
  }

  await refreshBoqAvailability(tx, boqItemIds);
  return boqItemIds;
};

const syncBoqFromPurchaseOrderItems = async (
  tx,
  { boqId = null, items = [], purchaseOrderId = null } = {}
) => {
  const normalizedBoqId = toNullableInt(boqId);
  if (normalizedBoqId === null) {
    return {
      items: Array.isArray(items) ? items : [],
      affectedBoqItemIds: [],
    };
  }

  const nextItems = Array.isArray(items)
    ? items.map((item) => ({ ...item }))
    : [];
  const boqResult = await new sql.Request(tx)
    .input("BOQId", sql.Int, normalizedBoqId)
    .query(`
      SELECT *
      FROM dbo.BOQLineItems
      WHERE BOQId = @BOQId
    `);
  const existingRows = boqResult.recordset ?? [];
  const existingRowsById = new Map(
    existingRows
      .map((row) => [toNullableInt(row.LineItemId), row])
      .filter(([lineItemId]) => lineItemId !== null)
  );

  const existingPoId = toNullableInt(purchaseOrderId);
  const previousLinkedBoqItemIds = existingPoId
    ? (
        await new sql.Request(tx)
          .input("PurchaseOrderId", sql.Int, existingPoId)
          .query(`
            SELECT DISTINCT BoqItemId
            FROM dbo.PurchaseOrderItems
            WHERE PurchaseOrderId = @PurchaseOrderId
              AND BoqItemId IS NOT NULL
          `)
      ).recordset
        ?.map((row) => toNullableInt(row.BoqItemId))
        .filter((value) => value !== null) ?? []
    : [];

  const affectedBoqItemIds = new Set();
  const nextLinkedBoqItemIds = new Set();

  for (const item of nextItems) {
    const quantity = normalizeCurrencyValue(item.quantity);
    const rate = normalizeCurrencyValue(item.unitPrice ?? item.rate);
    const lineItemId = toNullableInt(item.boqItemId);
    const consumedQty =
      lineItemId !== null
        ? Number(existingRowsById.get(lineItemId)?.ConsumedQty ?? 0) || 0
        : 0;

    if (lineItemId !== null && existingRowsById.has(lineItemId)) {
      await new sql.Request(tx)
        .input("LineItemId", sql.Int, lineItemId)
        .input("ItemId", sql.Int, item.itemId ?? null)
        .input("ItemName", sql.NVarChar(200), item.name)
        .input("Description", sql.NVarChar(sql.MAX), item.description ?? null)
        .input("SerialNumber", sql.NVarChar(255), item.serialNumber || null)
        .input("Unit", sql.NVarChar(50), item.unit ?? "PCS")
        .input("HSN", sql.NVarChar(50), item.hsn || null)
        .input("GST", sql.NVarChar(100), item.gst || null)
        .input("Quantity", sql.Decimal(18, 2), quantity)
        .input("Rate", sql.Decimal(18, 2), rate)
        .input("ConsumedQty", sql.Decimal(18, 2), consumedQty)
        .input("Notes", sql.NVarChar(sql.MAX), item.notes || null)
        .query(`
          UPDATE dbo.BOQLineItems
          SET ItemId = @ItemId,
              ItemName = @ItemName,
              Description = @Description,
              SerialNumber = @SerialNumber,
              Unit = @Unit,
              HSN = @HSN,
              GST = @GST,
              Quantity = @Quantity,
              Rate = @Rate,
              ConsumedQty = @ConsumedQty,
              AvailableQty = CASE
                WHEN @Quantity - @ConsumedQty < 0 THEN 0
                ELSE @Quantity - @ConsumedQty
              END,
              Notes = @Notes
          WHERE LineItemId = @LineItemId
        `);
      nextLinkedBoqItemIds.add(lineItemId);
      affectedBoqItemIds.add(lineItemId);
      continue;
    }

    const insertResult = await new sql.Request(tx)
      .input("BOQId", sql.Int, normalizedBoqId)
      .input("ItemId", sql.Int, item.itemId ?? null)
      .input("ItemName", sql.NVarChar(200), item.name)
      .input("Description", sql.NVarChar(sql.MAX), item.description ?? null)
      .input("SerialNumber", sql.NVarChar(255), item.serialNumber || null)
      .input("Unit", sql.NVarChar(50), item.unit ?? "PCS")
      .input("HSN", sql.NVarChar(50), item.hsn || null)
      .input("GST", sql.NVarChar(100), item.gst || null)
      .input("Quantity", sql.Decimal(18, 2), quantity)
      .input("Rate", sql.Decimal(18, 2), rate)
      .input("ConsumedQty", sql.Decimal(18, 2), 0)
      .input("AvailableQty", sql.Decimal(18, 2), quantity)
      .input("Notes", sql.NVarChar(sql.MAX), item.notes || null)
      .query(`
        DECLARE @InsertedBoqLineItems TABLE (LineItemId INT NOT NULL);

        INSERT INTO dbo.BOQLineItems
          (BOQId, ItemId, ItemName, Description, SerialNumber, Unit, HSN, GST, Quantity, Rate, ConsumedQty, AvailableQty, Notes)
        OUTPUT INSERTED.LineItemId INTO @InsertedBoqLineItems (LineItemId)
        VALUES
          (@BOQId, @ItemId, @ItemName, @Description, @SerialNumber, @Unit, @HSN, @GST, @Quantity, @Rate, @ConsumedQty, @AvailableQty, @Notes);

        SELECT LineItemId FROM @InsertedBoqLineItems;
      `);
    const insertedBoqItemId = toNullableInt(insertResult.recordset?.[0]?.LineItemId);
    if (insertedBoqItemId !== null) {
      item.boqItemId = insertedBoqItemId;
      nextLinkedBoqItemIds.add(insertedBoqItemId);
      affectedBoqItemIds.add(insertedBoqItemId);
    }
  }

  const removedBoqItemIds = previousLinkedBoqItemIds.filter(
    (boqItemId) => !nextLinkedBoqItemIds.has(boqItemId)
  );
  if (removedBoqItemIds.length) {
    const otherPoRequest = new sql.Request(tx);
    const otherPoInClause = buildPurchaseOrderItemInClause(
      otherPoRequest,
      removedBoqItemIds,
      "RemovedBoqItemId"
    );
    if (existingPoId !== null) {
      otherPoRequest.input("CurrentPurchaseOrderId", sql.Int, existingPoId);
    }
    const otherPoLinksResult = await otherPoRequest.query(`
      SELECT DISTINCT BoqItemId
      FROM dbo.PurchaseOrderItems
      WHERE BoqItemId IN (${otherPoInClause})
        ${
          existingPoId !== null
            ? "AND PurchaseOrderId <> @CurrentPurchaseOrderId"
            : ""
        }
    `);
    const linkedElsewhere = new Set(
      (otherPoLinksResult.recordset ?? [])
        .map((row) => toNullableInt(row.BoqItemId))
        .filter((value) => value !== null)
    );
    const consumedTotals = await loadBoqConsumedTotals(tx, removedBoqItemIds);
    const removableBoqItemIds = removedBoqItemIds.filter((boqItemId) => {
      if (linkedElsewhere.has(boqItemId)) {
        return false;
      }
      return (consumedTotals.get(boqItemId) ?? 0) <= 0;
    });

    if (removableBoqItemIds.length) {
      const deleteReq = new sql.Request(tx);
      const deleteInClause = buildPurchaseOrderItemInClause(
        deleteReq,
        removableBoqItemIds,
        "DeleteBoqItemId"
      );
      await deleteReq.query(`
        DELETE FROM dbo.BOQLineItems
        WHERE LineItemId IN (${deleteInClause})
      `);
    }
  }

  await new sql.Request(tx)
    .input("BOQId", sql.Int, normalizedBoqId)
    .query(`
      UPDATE dbo.BOQProjects
      SET UpdatedAt = SYSUTCDATETIME()
      WHERE BOQId = @BOQId
    `);

  return {
    items: nextItems,
    affectedBoqItemIds: Array.from(affectedBoqItemIds),
  };
};

const detachPurchaseOrderItemsFromBoq = async (tx, boqItemIds = []) => {
  const ids = uniqueBoqItemIds(boqItemIds);
  if (!ids.length) {
    return [];
  }

  const config = await loadPurchaseOrderItemsConfig(tx);
  if (!config.boqItemIdCol || !config.hasPoId) {
    return [];
  }

  const selectReq = new sql.Request(tx);
  const inClause = buildPurchaseOrderItemInClause(selectReq, ids, "BoqItemId");
  const affectedResult = await selectReq.query(`
    SELECT DISTINCT PurchaseOrderId
    FROM dbo.PurchaseOrderItems
    WHERE ${toIdentifier(config.boqItemIdCol)} IN (${inClause})
  `);
  const affectedPurchaseOrderIds = (affectedResult.recordset ?? [])
    .map((row) => toNullableInt(row.PurchaseOrderId))
    .filter((value) => value !== null);

  const updateReq = new sql.Request(tx);
  const updateInClause = buildPurchaseOrderItemInClause(updateReq, ids, "DetachBoqItemId");
  await updateReq.query(`
    UPDATE dbo.PurchaseOrderItems
    SET ${toIdentifier(config.boqItemIdCol)} = NULL
    WHERE ${toIdentifier(config.boqItemIdCol)} IN (${updateInClause})
  `);

  return affectedPurchaseOrderIds;
};

const syncPurchaseOrderItemsFromBoq = async (tx, boqItemIds = []) => {
  const ids = uniqueBoqItemIds(boqItemIds);
  if (!ids.length) {
    return [];
  }

  const config = await loadPurchaseOrderItemsConfig(tx);
  if (!config.boqItemIdCol || !config.qtyCol || !config.hasPoId) {
    return [];
  }

  const affectedReq = new sql.Request(tx);
  const affectedInClause = buildPurchaseOrderItemInClause(
    affectedReq,
    ids,
    "BoqItemId"
  );
  const affectedResult = await affectedReq.query(`
    SELECT DISTINCT PurchaseOrderId
    FROM dbo.PurchaseOrderItems
    WHERE ${toIdentifier(config.boqItemIdCol)} IN (${affectedInClause})
  `);
  const affectedPurchaseOrderIds = (affectedResult.recordset ?? [])
    .map((row) => toNullableInt(row.PurchaseOrderId))
    .filter((value) => value !== null);

  if (!affectedPurchaseOrderIds.length) {
    return [];
  }

  const setClauses = [];
  if (config.nameCol) {
    setClauses.push(`poi.${toIdentifier(config.nameCol)} = bi.ItemName`);
  }
  if (config.descCol) {
    setClauses.push(`poi.${toIdentifier(config.descCol)} = bi.Description`);
  }
  if (config.hsnCol) {
    setClauses.push(`poi.${toIdentifier(config.hsnCol)} = bi.HSN`);
  }
  if (config.gstCol) {
    setClauses.push(`poi.${toIdentifier(config.gstCol)} = bi.GST`);
  }
  if (config.serialNumberCol) {
    setClauses.push(`poi.${toIdentifier(config.serialNumberCol)} = bi.SerialNumber`);
  }
  if (config.unitCol) {
    setClauses.push(`poi.${toIdentifier(config.unitCol)} = bi.Unit`);
  }
  if (config.notesCol) {
    setClauses.push(`poi.${toIdentifier(config.notesCol)} = bi.Notes`);
  }
  if (!setClauses.length) {
    return affectedPurchaseOrderIds;
  }

  const updateReq = new sql.Request(tx);
  const updateInClause = buildPurchaseOrderItemInClause(
    updateReq,
    ids,
    "SyncBoqItemId"
  );
  await updateReq.query(`
    UPDATE poi
    SET ${setClauses.join(", ")}
    FROM dbo.PurchaseOrderItems poi
    INNER JOIN dbo.BOQLineItems bi
      ON bi.LineItemId = poi.${toIdentifier(config.boqItemIdCol)}
    WHERE poi.${toIdentifier(config.boqItemIdCol)} IN (${updateInClause})
  `);

  return affectedPurchaseOrderIds;
};

const refreshPurchaseOrdersDerivedData = async (tx, purchaseOrderIds = []) => {
  const ids = Array.from(
    new Set(
      (Array.isArray(purchaseOrderIds) ? purchaseOrderIds : [])
        .map((value) => toNullableInt(value))
        .filter((value) => value !== null)
    )
  );
  if (!ids.length) {
    return;
  }

  const config = await loadPurchaseOrderItemsConfig(tx);
  await ensureReceiveTables();
  const receivePk = await refreshReceiveGoodsPk();
  const receiveItemsFk = await refreshReceiveGoodsItemsFk();

  for (const purchaseOrderId of ids) {
    await recalculatePurchaseOrderTotal(tx, purchaseOrderId, config);

    const orderResult = await new sql.Request(tx)
      .input("PurchaseOrderId", sql.Int, purchaseOrderId)
      .query(`
        SELECT Status
        FROM dbo.PurchaseOrders
        WHERE Id = @PurchaseOrderId
      `);
    const currentStatus =
      orderResult.recordset?.[0]?.Status ?? orderResult.recordset?.[0]?.status ?? "Draft";
    if (isCancelledPurchaseOrderStatus(currentStatus)) {
      continue;
    }

    const receiptCountResult = await new sql.Request(tx)
      .input("PurchaseOrderId", sql.Int, purchaseOrderId)
      .query(`
        SELECT COUNT(1) AS Total
        FROM dbo.ReceiveGoods
        WHERE PurchaseOrderId = @PurchaseOrderId
      `);
    const receiptCount = Number(receiptCountResult.recordset?.[0]?.Total ?? 0) || 0;
    if (!receiptCount) {
      continue;
    }

    const { finalStatus } = await recalculateReceiveGoodsChain(tx, {
      purchaseOrderId,
      receivePk,
      fkCol: receiveItemsFk,
    });

    await new sql.Request(tx)
      .input("PurchaseOrderId", sql.Int, purchaseOrderId)
      .input("Status", sql.NVarChar(50), finalStatus || currentStatus || "Draft")
      .query(`
        UPDATE dbo.PurchaseOrders
        SET Status = @Status,
            UpdatedAt = SYSUTCDATETIME()
        WHERE Id = @PurchaseOrderId
      `);
  }
};

let receiveGoodsPk = "ReceiveGoodsId";
let receiveGoodsItemsFk = "ReceiveGoodsId";
let purchaseOrderItemsPk = "Id";
let receiveGoodsItemsPk = "Id";
const ensureSchemaOnRequest =
  String(process.env.DB_ENSURE_SCHEMA_ON_REQUEST ?? "false").toLowerCase() ===
  "true";

const pickMostPopulatedColumn = async (pool, tableName, columns = []) => {
  const candidates = uniqueColumnNames(columns).filter(Boolean);
  if (candidates.length <= 1) {
    return candidates[0] ?? null;
  }

  const countsResult = await pool.request().query(`
    SELECT ${candidates
      .map(
        (column) =>
          `SUM(CASE WHEN ${toIdentifier(column)} IS NULL THEN 0 ELSE 1 END) AS ${toIdentifier(column)}`
      )
      .join(", ")}
    FROM ${tableName}
  `);

  const counts = countsResult.recordset?.[0] ?? {};
  return candidates.reduce((bestColumn, column) => {
    const bestCount = Number(counts?.[bestColumn] ?? -1);
    const currentCount = Number(counts?.[column] ?? -1);
    return currentCount > bestCount ? column : bestColumn;
  }, candidates[0]);
};

const refreshReceiveGoodsPk = async () => {
  const pool = await getPool();
  const [colsResult, pkResult, identityResult] = await Promise.all([
    pool.request().query(`
      SELECT name AS ColumnName
      FROM sys.columns
      WHERE object_id = OBJECT_ID('dbo.ReceiveGoods')
    `),
    pool.request().query(`
      SELECT col.name AS ColumnName
      FROM sys.key_constraints kc
      JOIN sys.index_columns ic
        ON kc.parent_object_id = ic.object_id
       AND kc.unique_index_id = ic.index_id
      JOIN sys.columns col
        ON col.object_id = ic.object_id
       AND col.column_id = ic.column_id
      WHERE kc.parent_object_id = OBJECT_ID('dbo.ReceiveGoods')
        AND kc.[type] = 'PK'
    `),
    pool.request().query(`
      SELECT name AS ColumnName
      FROM sys.identity_columns
      WHERE object_id = OBJECT_ID('dbo.ReceiveGoods')
    `),
  ]);

  const cols = new Set((colsResult.recordset ?? []).map((row) => row.ColumnName));
  const candidates = ["ReceiveGoodsId", "Id"].filter((column) => cols.has(column));
  const primaryKeyColumn =
    (pkResult.recordset ?? [])
      .map((row) => row.ColumnName)
      .find((column) => candidates.includes(column)) ?? null;
  const identityColumn =
    (identityResult.recordset ?? [])
      .map((row) => row.ColumnName)
      .find((column) => candidates.includes(column)) ?? null;
  const populatedColumn = await pickMostPopulatedColumn(
    pool,
    "dbo.ReceiveGoods",
    candidates
  );

  receiveGoodsPk =
    primaryKeyColumn ??
    identityColumn ??
    populatedColumn ??
    candidates[0] ??
    "ReceiveGoodsId";
  return receiveGoodsPk;
};

const refreshReceiveGoodsItemsFk = async () => {
  const pool = await getPool();
  const [colsResult, fkResult] = await Promise.all([
    pool.request().query(`
      SELECT name AS ColumnName
      FROM sys.columns
      WHERE object_id = OBJECT_ID('dbo.ReceiveGoodsItems')
    `),
    pool.request().query(`
      SELECT TOP 1 parentCol.name AS ColumnName
      FROM sys.foreign_keys fk
      JOIN sys.foreign_key_columns fkc
        ON fk.object_id = fkc.constraint_object_id
      JOIN sys.columns parentCol
        ON parentCol.object_id = fkc.parent_object_id
       AND parentCol.column_id = fkc.parent_column_id
      WHERE fk.parent_object_id = OBJECT_ID('dbo.ReceiveGoodsItems')
        AND fk.referenced_object_id = OBJECT_ID('dbo.ReceiveGoods')
      ORDER BY CASE WHEN fk.name = 'FK_ReceiveGoodsItems_ReceiveGoods' THEN 0 ELSE 1 END,
               fk.name
    `),
  ]);

  const cols = new Set((colsResult.recordset ?? []).map((row) => row.ColumnName));
  const candidates = ["ReceiveGoodsId", "ReceiveGoodsID", "ReceiptId", "ReceiveId"].filter(
    (column) => cols.has(column)
  );
  const foreignKeyColumn =
    (fkResult.recordset ?? [])
      .map((row) => row.ColumnName)
      .find((column) => candidates.includes(column)) ?? null;
  const populatedColumn = await pickMostPopulatedColumn(
    pool,
    "dbo.ReceiveGoodsItems",
    candidates
  );

  receiveGoodsItemsFk =
    foreignKeyColumn ??
    populatedColumn ??
    candidates[0] ??
    "ReceiveGoodsId";

  return receiveGoodsItemsFk;
};

const refreshPurchaseOrderItemsPk = async () => {
  const pool = await getPool();
  const [colsResult, pkResult, identityResult] = await Promise.all([
    pool.request().query(`
      SELECT name AS ColumnName
      FROM sys.columns
      WHERE object_id = OBJECT_ID('dbo.PurchaseOrderItems')
    `),
    pool.request().query(`
      SELECT col.name AS ColumnName
      FROM sys.key_constraints kc
      JOIN sys.index_columns ic
        ON kc.parent_object_id = ic.object_id
       AND kc.unique_index_id = ic.index_id
      JOIN sys.columns col
        ON col.object_id = ic.object_id
       AND col.column_id = ic.column_id
      WHERE kc.parent_object_id = OBJECT_ID('dbo.PurchaseOrderItems')
        AND kc.[type] = 'PK'
    `),
    pool.request().query(`
      SELECT name AS ColumnName
      FROM sys.identity_columns
      WHERE object_id = OBJECT_ID('dbo.PurchaseOrderItems')
    `),
  ]);

  const cols = new Set((colsResult.recordset ?? []).map((row) => row.ColumnName));
  const candidates = ["POItemId", "PurchaseOrderItemId", "Id"].filter((column) =>
    cols.has(column)
  );
  const primaryKeyColumn =
    (pkResult.recordset ?? [])
      .map((row) => row.ColumnName)
      .find((column) => candidates.includes(column)) ?? null;
  const identityColumn =
    (identityResult.recordset ?? [])
      .map((row) => row.ColumnName)
      .find((column) => candidates.includes(column)) ?? null;
  const populatedColumn = await pickMostPopulatedColumn(
    pool,
    "dbo.PurchaseOrderItems",
    candidates
  );

  purchaseOrderItemsPk =
    primaryKeyColumn ??
    identityColumn ??
    populatedColumn ??
    candidates[0] ??
    "Id";
  return purchaseOrderItemsPk;
};

const refreshReceiveGoodsItemsPk = async () => {
  const pool = await getPool();
  const [colsResult, pkResult, identityResult] = await Promise.all([
    pool.request().query(`
      SELECT name AS ColumnName
      FROM sys.columns
      WHERE object_id = OBJECT_ID('dbo.ReceiveGoodsItems')
    `),
    pool.request().query(`
      SELECT col.name AS ColumnName
      FROM sys.key_constraints kc
      JOIN sys.index_columns ic
        ON kc.parent_object_id = ic.object_id
       AND kc.unique_index_id = ic.index_id
      JOIN sys.columns col
        ON col.object_id = ic.object_id
       AND col.column_id = ic.column_id
      WHERE kc.parent_object_id = OBJECT_ID('dbo.ReceiveGoodsItems')
        AND kc.[type] = 'PK'
    `),
    pool.request().query(`
      SELECT name AS ColumnName
      FROM sys.identity_columns
      WHERE object_id = OBJECT_ID('dbo.ReceiveGoodsItems')
    `),
  ]);

  const cols = new Set((colsResult.recordset ?? []).map((row) => row.ColumnName));
  const candidates = ["ReceiveGoodsItemId", "Id"].filter((column) => cols.has(column));
  const primaryKeyColumn =
    (pkResult.recordset ?? [])
      .map((row) => row.ColumnName)
      .find((column) => candidates.includes(column)) ?? null;
  const identityColumn =
    (identityResult.recordset ?? [])
      .map((row) => row.ColumnName)
      .find((column) => candidates.includes(column)) ?? null;
  const populatedColumn = await pickMostPopulatedColumn(
    pool,
    "dbo.ReceiveGoodsItems",
    candidates
  );

  receiveGoodsItemsPk =
    primaryKeyColumn ??
    identityColumn ??
    populatedColumn ??
    candidates[0] ??
    "Id";
  return receiveGoodsItemsPk;
};

const findReceiveGoodsRow = async (poolOrTx, id) => {
  const colsResult = await poolOrTx
    .request()
    .query(`
      SELECT name AS ColumnName
      FROM sys.columns
      WHERE object_id = OBJECT_ID('dbo.ReceiveGoods')
    `);
  const cols = new Set((colsResult.recordset ?? []).map((row) => row.ColumnName));
  const candidateColumns = ["ReceiveGoodsId", "Id"].filter((column) => cols.has(column));
  if (!candidateColumns.length) {
    return null;
  }
  const whereClause = candidateColumns
    .map((column) => `${toIdentifier(column)} = @ReceiptId`)
    .join(" OR ");
  const result = await poolOrTx
    .request()
    .input("ReceiptId", sql.Int, id)
    .query(withSqlLockTimeout(`
      SELECT TOP 1 *
      FROM dbo.ReceiveGoods
      WHERE ${whereClause}
    `));
  return result.recordset?.[0] ?? null;
};

const loadReceiveItemTotalsByItemId = async (tx, purchaseOrderId) => {
  const result = await new sql.Request(tx)
    .input("PurchaseOrderId", sql.Int, purchaseOrderId)
    .query(`
      SELECT ItemId, SUM(COALESCE(ReceivedQty, 0)) AS ReceivedQty
      FROM dbo.ReceiveGoodsItems
      WHERE PurchaseOrderId = @PurchaseOrderId
        AND ItemId IS NOT NULL
      GROUP BY ItemId
    `);

  return (result.recordset ?? []).reduce((acc, row) => {
    const itemId = toNullableInt(row.ItemId);
    if (itemId === null) {
      return acc;
    }
    acc.set(itemId, toReceiveQuantity(row.ReceivedQty));
    return acc;
  }, new Map());
};

const applyReceiveStockDelta = async (tx, beforeTotals = new Map(), afterTotals = new Map()) => {
  const itemSchema = await resolveItemsSchema();
  if (!itemSchema.idColumn || !itemSchema.stockColumns.length) {
    return;
  }

  const impactedIds = new Set([
    ...beforeTotals.keys(),
    ...afterTotals.keys(),
  ]);
  if (!impactedIds.size) {
    return;
  }

  const stockSetClauses = uniqueColumnNames(itemSchema.stockColumns).map(
    (column) =>
      `${toIdentifier(column)} = COALESCE(TRY_CONVERT(INT, ${toIdentifier(
        column
      )}), 0) + @Delta`
  );
  const timestampSetClauses = uniqueColumnNames(itemSchema.updatedAtColumns).map(
    (column) => `${toIdentifier(column)} = @Now`
  );
  const setClauses = [...stockSetClauses, ...timestampSetClauses];
  if (!setClauses.length) {
    return;
  }

  for (const itemId of impactedIds) {
    const beforeQty = toReceiveQuantity(beforeTotals.get(itemId));
    const afterQty = toReceiveQuantity(afterTotals.get(itemId));
    const delta = afterQty - beforeQty;
    if (!delta) {
      continue;
    }

    await new sql.Request(tx)
      .input("ItemId", sql.Int, itemId)
      .input("Delta", sql.Int, delta)
      .input("Now", sql.DateTime2, new Date())
      .query(`
        UPDATE dbo.Items
        SET ${setClauses.join(", ")}
        WHERE ${toIdentifier(itemSchema.idColumn)} = @ItemId
      `);
  }
};

const buildConsumptionStockTotals = (items = []) => {
  const totals = new Map();
  (Array.isArray(items) ? items : []).forEach((item) => {
    const itemId = toNullableInt(item.itemId ?? item.ItemId);
    if (itemId === null) {
      return;
    }
    const quantity = Math.max(
      Number(item.quantity ?? item.Quantity ?? item.consumeQty ?? item.ConsumeQty ?? 0) || 0,
      0
    );
    if (!quantity) {
      return;
    }
    totals.set(itemId, (Number(totals.get(itemId)) || 0) + quantity);
  });
  return totals;
};

const applyConsumptionStockDelta = async (tx, beforeItems = [], afterItems = []) => {
  const itemSchema = await resolveItemsSchema();
  if (!itemSchema.idColumn || !itemSchema.stockColumns.length) {
    return;
  }

  const beforeTotals = buildConsumptionStockTotals(beforeItems);
  const afterTotals = buildConsumptionStockTotals(afterItems);
  const impactedIds = new Set([...beforeTotals.keys(), ...afterTotals.keys()]);
  if (!impactedIds.size) {
    return;
  }

  const stockSetClauses = uniqueColumnNames(itemSchema.stockColumns).map(
    (column) =>
      `${toIdentifier(column)} = COALESCE(TRY_CONVERT(DECIMAL(18, 2), ${toIdentifier(
        column
      )}), 0) + @Delta`
  );
  const timestampSetClauses = uniqueColumnNames(itemSchema.updatedAtColumns).map(
    (column) => `${toIdentifier(column)} = @Now`
  );
  const setClauses = [...stockSetClauses, ...timestampSetClauses];
  if (!setClauses.length) {
    return;
  }

  for (const itemId of impactedIds) {
    const beforeQty = Number(beforeTotals.get(itemId)) || 0;
    const afterQty = Number(afterTotals.get(itemId)) || 0;
    const delta = beforeQty - afterQty;
    if (!delta) {
      continue;
    }

    await new sql.Request(tx)
      .input("ItemId", sql.Int, itemId)
      .input("Delta", sql.Decimal(18, 2), delta)
      .input("Now", sql.DateTime2, new Date())
      .query(`
        UPDATE dbo.Items
        SET ${setClauses.join(", ")}
        WHERE ${toIdentifier(itemSchema.idColumn)} = @ItemId
      `);
  }
};

const buildRequestedReceiveTotalsExcludingReceipt = (
  purchaseOrderItems = [],
  headers = [],
  groupedItems = {},
  targetReceiptId = null
) => {
  const totals = new Map();
  const excludedId = targetReceiptId === null ? null : String(targetReceiptId);

  for (const header of headers) {
    const receiptId = String(
      header?.ReceiveGoodsId ?? header?.receiveGoodsId ?? header?.Id ?? header?.id ?? ""
    );
    if (excludedId && receiptId === excludedId) {
      continue;
    }

    const items = groupedItems[receiptId] ?? groupedItems[Number(receiptId)] ?? [];
    items.forEach((item, index) => {
      const matchedIndex = findMatchingReceiveItemIndex(purchaseOrderItems, item, index);
      if (matchedIndex < 0) {
        return;
      }
      const key = buildReceivePoItemKey(purchaseOrderItems[matchedIndex], matchedIndex);
      totals.set(
        key,
        toReceiveQuantity(totals.get(key)) + toReceiveQuantity(item.receivedQty)
      );
    });
  }

  return purchaseOrderItems.reduce((acc, item, index) => {
    const key = buildReceivePoItemKey(item, index);
    acc.set(key, toReceiveQuantity(acc.get(key)));
    return acc;
  }, totals);
};

const validateReceiveQuantitiesAgainstAvailability = async (
  tx,
  {
    purchaseOrderId,
    receivePk,
    targetReceiptId = null,
    normalizedItems,
  }
) => {
  const headersResult = await new sql.Request(tx)
    .input("PurchaseOrderId", sql.Int, purchaseOrderId)
    .query(withSqlLockTimeout(`
      SELECT *
      FROM dbo.ReceiveGoods
      WHERE PurchaseOrderId = @PurchaseOrderId
    `));
  const itemsResult = await new sql.Request(tx)
    .input("PurchaseOrderId", sql.Int, purchaseOrderId)
    .query(withSqlLockTimeout(`
      SELECT *
      FROM dbo.ReceiveGoodsItems
      WHERE PurchaseOrderId = @PurchaseOrderId
    `));

  const purchaseOrderItems = await loadReceivePurchaseOrderItems(tx, purchaseOrderId);
  const groupedItems = groupReceiveItemsByReceipt(itemsResult.recordset ?? []);
  const sortedHeaders = sortReceiveRowsChronologically(
    headersResult.recordset ?? [],
    receivePk
  );
  const receivedByOtherReceipts = buildRequestedReceiveTotalsExcludingReceipt(
    purchaseOrderItems,
    sortedHeaders,
    groupedItems,
    targetReceiptId
  );

  purchaseOrderItems.forEach((poItem, index) => {
    const itemKey = buildReceivePoItemKey(poItem, index);
    const requestedItem =
      normalizedItems.byKey.get(itemKey) ?? normalizedItems.ordered[index] ?? null;
    const orderedQty = toReceiveQuantity(poItem.quantity ?? poItem.orderedQty);
    const remainingQty = Math.max(
      orderedQty - toReceiveQuantity(receivedByOtherReceipts.get(itemKey)),
      0
    );
    const requestedQty = Math.max(
      toReceiveQuantity(requestedItem?.receivedQty ?? requestedItem?.ReceivedQty),
      0
    );

    if (requestedQty > remainingQty) {
      const error = new Error(
        `Received quantity for ${poItem.name || "item"} cannot exceed remaining PO quantity (${remainingQty}).`
      );
      error.statusCode = 400;
      throw error;
    }
  });
};

const validateReceiveSerialNumbers = async (
  tx,
  {
    targetReceiptId = null,
    normalizedItems,
  }
) => {
  const serials = [];
  for (const item of normalizedItems.ordered) {
    const itemSerials = normalizeSerialNumbers(item.serialNumbers);
    const normalizedKeys = itemSerials.map((value) => value.toLocaleLowerCase());
    if (new Set(normalizedKeys).size !== normalizedKeys.length) {
      const error = new Error(`Duplicate serial numbers entered for ${item.name || "item"}.`);
      error.statusCode = 400;
      throw error;
    }
    if (item.serialRequired && itemSerials.length !== toReceiveQuantity(item.receivedQty)) {
      const error = new Error(
        `${item.name || "Item"} requires one unique serial number for each received unit.`
      );
      error.statusCode = 400;
      throw error;
    }
    serials.push(...itemSerials);
  }

  const normalizedSerials = serials.map((value) => value.toLocaleLowerCase());
  if (new Set(normalizedSerials).size !== normalizedSerials.length) {
    const error = new Error("A serial number cannot be used more than once in a receipt.");
    error.statusCode = 400;
    throw error;
  }
  if (!serials.length) {
    return;
  }

  const request = new sql.Request(tx);
  const placeholders = serials.map((serialNumber, index) => {
    const parameter = `ReceiveSerial${index}`;
    request.input(parameter, sql.NVarChar(255), serialNumber);
    return `@${parameter}`;
  });
  request.input("TargetReceiptId", sql.Int, toNullableInt(targetReceiptId));
  const result = await request.query(`
    SELECT TOP 1 SerialNumber
    FROM dbo.SerialNumbers
    WHERE SerialNumber IN (${placeholders.join(", ")})
      AND (@TargetReceiptId IS NULL OR ReceiveGoodsId <> @TargetReceiptId)
  `);
  if (result.recordset?.length) {
    const error = new Error(
      `Serial number ${result.recordset[0].SerialNumber} is already in inventory.`
    );
    error.statusCode = 400;
    throw error;
  }
};

const writeReceiveAuditLog = async (
  tx,
  {
    receiptId = null,
    purchaseOrderId = null,
    action = "",
    performedBy = null,
    details = null,
    snapshot = null,
  } = {}
) => {
  await new sql.Request(tx)
    .input("ReceiveGoodsId", sql.Int, toNullableInt(receiptId))
    .input("PurchaseOrderId", sql.Int, toNullableInt(purchaseOrderId))
    .input("Action", sql.NVarChar(50), String(action || "").trim() || "UPDATE")
    .input("PerformedBy", sql.NVarChar(255), normalizeOptionalString(performedBy) ?? null)
    .input("Details", sql.NVarChar(sql.MAX), normalizeOptionalString(details) ?? null)
    .input("Snapshot", sql.NVarChar(sql.MAX), serializeJson(snapshot))
    .query(`
      INSERT INTO dbo.ReceiveGoodsAuditLog
        (ReceiveGoodsId, PurchaseOrderId, ActionName, PerformedBy, Details, SnapshotJson)
      VALUES
        (@ReceiveGoodsId, @PurchaseOrderId, @Action, @PerformedBy, @Details, @Snapshot)
    `);
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
        BillFrom NVARCHAR(MAX) NULL,
        BillTo NVARCHAR(MAX) NULL,
        ShipTo NVARCHAR(MAX) NULL,
        ShowProjectDetails BIT NOT NULL DEFAULT 1,
        Notes NVARCHAR(MAX) NULL,
      TaxMode NVARCHAR(20) NULL,
        InvoiceNumber NVARCHAR(100) NULL,
        InvoiceDate DATE NULL,
        InvoiceDocumentName NVARCHAR(255) NULL,
        InvoiceDocumentType NVARCHAR(120) NULL,
        InvoiceDocumentSize INT NULL,
        InvoiceDocumentData NVARCHAR(MAX) NULL,
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
    IF COL_LENGTH('dbo.ReceiveGoods', 'BillTo') IS NULL
    BEGIN
      ALTER TABLE dbo.ReceiveGoods ADD BillTo NVARCHAR(MAX) NULL;
    END;
    IF COL_LENGTH('dbo.ReceiveGoods', 'BillFrom') IS NULL
    BEGIN
      ALTER TABLE dbo.ReceiveGoods ADD BillFrom NVARCHAR(MAX) NULL;
    END;
    IF COL_LENGTH('dbo.ReceiveGoods', 'BillFrom') IS NOT NULL
       AND COL_LENGTH('dbo.ReceiveGoods', 'BillTo') IS NOT NULL
    BEGIN
      EXEC('UPDATE dbo.ReceiveGoods SET BillFrom = BillTo WHERE BillFrom IS NULL AND BillTo IS NOT NULL');
    END;
    IF COL_LENGTH('dbo.ReceiveGoods', 'ShipTo') IS NULL
    BEGIN
      ALTER TABLE dbo.ReceiveGoods ADD ShipTo NVARCHAR(MAX) NULL;
    END;
    IF COL_LENGTH('dbo.ReceiveGoods', 'ShowProjectDetails') IS NULL
    BEGIN
      ALTER TABLE dbo.ReceiveGoods ADD ShowProjectDetails BIT NOT NULL CONSTRAINT DF_ReceiveGoods_ShowProjectDetails DEFAULT 1;
    END;
    IF COL_LENGTH('dbo.ReceiveGoods', 'Notes') IS NULL
    BEGIN
      ALTER TABLE dbo.ReceiveGoods ADD Notes NVARCHAR(MAX) NULL;
    END;
    IF COL_LENGTH('dbo.ReceiveGoods', 'TaxMode') IS NULL
    BEGIN
      ALTER TABLE dbo.ReceiveGoods ADD TaxMode NVARCHAR(20) NULL;
    END;
    IF COL_LENGTH('dbo.ReceiveGoods', 'InvoiceNumber') IS NULL
    BEGIN
      ALTER TABLE dbo.ReceiveGoods ADD InvoiceNumber NVARCHAR(100) NULL;
    END;
    IF COL_LENGTH('dbo.ReceiveGoods', 'InvoiceDate') IS NULL
    BEGIN
      ALTER TABLE dbo.ReceiveGoods ADD InvoiceDate DATE NULL;
    END;
    IF COL_LENGTH('dbo.ReceiveGoods', 'InvoiceDocumentName') IS NULL
    BEGIN
      ALTER TABLE dbo.ReceiveGoods ADD InvoiceDocumentName NVARCHAR(255) NULL;
    END;
    IF COL_LENGTH('dbo.ReceiveGoods', 'InvoiceDocumentType') IS NULL
    BEGIN
      ALTER TABLE dbo.ReceiveGoods ADD InvoiceDocumentType NVARCHAR(120) NULL;
    END;
    IF COL_LENGTH('dbo.ReceiveGoods', 'InvoiceDocumentSize') IS NULL
    BEGIN
      ALTER TABLE dbo.ReceiveGoods ADD InvoiceDocumentSize INT NULL;
    END;
    IF COL_LENGTH('dbo.ReceiveGoods', 'InvoiceDocumentData') IS NULL
    BEGIN
      ALTER TABLE dbo.ReceiveGoods ADD InvoiceDocumentData NVARCHAR(MAX) NULL;
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
        PurchaseOrderItemId INT NULL,
        ItemId INT NULL,
        ItemName NVARCHAR(255) NULL,
        Description NVARCHAR(MAX) NULL,
        Unit NVARCHAR(50) NULL,
        HSN NVARCHAR(50) NULL,
        GST NVARCHAR(100) NULL,
        TaxPercentage DECIMAL(5,2) NULL,
        SerialRequired BIT NOT NULL DEFAULT 0,
        UnitPrice DECIMAL(18,2) NULL,
        TaxableAmount DECIMAL(18,2) NULL,
        CGSTPercent DECIMAL(5,2) NULL,
        SGSTPercent DECIMAL(5,2) NULL,
        IGSTPercent DECIMAL(5,2) NULL,
        CGSTAmount DECIMAL(18,2) NULL,
        SGSTAmount DECIMAL(18,2) NULL,
        IGSTAmount DECIMAL(18,2) NULL,
        GSTAmount DECIMAL(18,2) NULL,
        SerialNumbersJson NVARCHAR(MAX) NULL,
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
    IF COL_LENGTH('dbo.ReceiveGoodsItems', 'PurchaseOrderItemId') IS NULL
    BEGIN
      ALTER TABLE dbo.ReceiveGoodsItems ADD PurchaseOrderItemId INT NULL;
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
    IF COL_LENGTH('dbo.ReceiveGoodsItems', 'HSN') IS NULL
    BEGIN
      ALTER TABLE dbo.ReceiveGoodsItems ADD HSN NVARCHAR(50) NULL;
    END;
    IF COL_LENGTH('dbo.ReceiveGoodsItems', 'GST') IS NULL
    BEGIN
      ALTER TABLE dbo.ReceiveGoodsItems ADD GST NVARCHAR(100) NULL;
    END;
    IF COL_LENGTH('dbo.ReceiveGoodsItems', 'TaxPercentage') IS NULL
    BEGIN
      ALTER TABLE dbo.ReceiveGoodsItems ADD TaxPercentage DECIMAL(5,2) NULL;
    END;
    IF COL_LENGTH('dbo.ReceiveGoodsItems', 'SerialRequired') IS NULL
    BEGIN
      ALTER TABLE dbo.ReceiveGoodsItems ADD SerialRequired BIT NOT NULL CONSTRAINT DF_ReceiveGoodsItems_SerialRequired DEFAULT 0;
    END;
    IF COL_LENGTH('dbo.ReceiveGoodsItems', 'UnitPrice') IS NULL
    BEGIN
      ALTER TABLE dbo.ReceiveGoodsItems ADD UnitPrice DECIMAL(18,2) NULL;
    END;
    IF COL_LENGTH('dbo.ReceiveGoodsItems', 'TaxableAmount') IS NULL
    BEGIN
      ALTER TABLE dbo.ReceiveGoodsItems ADD TaxableAmount DECIMAL(18,2) NULL;
    END;
    IF COL_LENGTH('dbo.ReceiveGoodsItems', 'CGSTPercent') IS NULL
    BEGIN
      ALTER TABLE dbo.ReceiveGoodsItems ADD CGSTPercent DECIMAL(5,2) NULL;
    END;
    IF COL_LENGTH('dbo.ReceiveGoodsItems', 'SGSTPercent') IS NULL
    BEGIN
      ALTER TABLE dbo.ReceiveGoodsItems ADD SGSTPercent DECIMAL(5,2) NULL;
    END;
    IF COL_LENGTH('dbo.ReceiveGoodsItems', 'IGSTPercent') IS NULL
    BEGIN
      ALTER TABLE dbo.ReceiveGoodsItems ADD IGSTPercent DECIMAL(5,2) NULL;
    END;
    IF COL_LENGTH('dbo.ReceiveGoodsItems', 'CGSTAmount') IS NULL
    BEGIN
      ALTER TABLE dbo.ReceiveGoodsItems ADD CGSTAmount DECIMAL(18,2) NULL;
    END;
    IF COL_LENGTH('dbo.ReceiveGoodsItems', 'SGSTAmount') IS NULL
    BEGIN
      ALTER TABLE dbo.ReceiveGoodsItems ADD SGSTAmount DECIMAL(18,2) NULL;
    END;
    IF COL_LENGTH('dbo.ReceiveGoodsItems', 'IGSTAmount') IS NULL
    BEGIN
      ALTER TABLE dbo.ReceiveGoodsItems ADD IGSTAmount DECIMAL(18,2) NULL;
    END;
    IF COL_LENGTH('dbo.ReceiveGoodsItems', 'GSTAmount') IS NULL
    BEGIN
      ALTER TABLE dbo.ReceiveGoodsItems ADD GSTAmount DECIMAL(18,2) NULL;
    END;
    IF COL_LENGTH('dbo.ReceiveGoodsItems', 'SerialNumbersJson') IS NULL
    BEGIN
      ALTER TABLE dbo.ReceiveGoodsItems ADD SerialNumbersJson NVARCHAR(MAX) NULL;
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

    await pool.request().query(`
    IF OBJECT_ID('dbo.SerialNumbers', 'U') IS NULL
    BEGIN
      CREATE TABLE dbo.SerialNumbers (
        SerialNumberId INT IDENTITY(1,1) PRIMARY KEY,
        PurchaseOrderId INT NULL,
        PurchaseOrderItemId INT NULL,
        ReceiveGoodsId INT NULL,
        ItemId INT NULL,
        ProductName NVARCHAR(255) NULL,
        SerialNumber NVARCHAR(255) NOT NULL,
        Status NVARCHAR(50) NOT NULL DEFAULT N'In Stock',
        LocationId INT NULL,
        CreatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
        UpdatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
      )
    END
  `);

    await pool.request().query(`
    IF NOT EXISTS (
      SELECT 1
      FROM sys.indexes
      WHERE name = 'UX_SerialNumbers_SerialNumber'
        AND object_id = OBJECT_ID('dbo.SerialNumbers')
    )
    BEGIN
      CREATE UNIQUE INDEX UX_SerialNumbers_SerialNumber
      ON dbo.SerialNumbers(SerialNumber);
    END
  `);

    await pool.request().query(`
    IF OBJECT_ID('dbo.ReceiveGoodsAuditLog', 'U') IS NULL
    BEGIN
      CREATE TABLE dbo.ReceiveGoodsAuditLog (
        AuditId INT IDENTITY(1,1) PRIMARY KEY,
        ReceiveGoodsId INT NULL,
        PurchaseOrderId INT NULL,
        ActionName NVARCHAR(50) NOT NULL,
        PerformedBy NVARCHAR(255) NULL,
        Details NVARCHAR(MAX) NULL,
        SnapshotJson NVARCHAR(MAX) NULL,
        CreatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
      )
    END
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

let ensureBoqTablesPromise = null;

const ensureBoqTables = async () => {
  if (ensureBoqTablesPromise) {
    return ensureBoqTablesPromise;
  }

  ensureBoqTablesPromise = (async () => {
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
        ItemId INT NULL,
        ItemName NVARCHAR(200) NOT NULL,
        Description NVARCHAR(MAX) NULL,
        SerialNumber NVARCHAR(255) NULL,
        Unit NVARCHAR(50) NULL,
        HSN NVARCHAR(50) NULL,
        GST NVARCHAR(100) NULL,
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
    IF COL_LENGTH('dbo.BOQLineItems', 'ItemId') IS NULL
    BEGIN
      ALTER TABLE dbo.BOQLineItems ADD ItemId INT NULL;
    END;
    IF COL_LENGTH('dbo.BOQLineItems', 'HSN') IS NULL
    BEGIN
      ALTER TABLE dbo.BOQLineItems ADD HSN NVARCHAR(50) NULL;
    END;
    IF COL_LENGTH('dbo.BOQLineItems', 'GST') IS NULL
    BEGIN
      ALTER TABLE dbo.BOQLineItems ADD GST NVARCHAR(100) NULL;
    END;
    IF COL_LENGTH('dbo.BOQLineItems', 'SerialNumber') IS NULL
    BEGIN
      ALTER TABLE dbo.BOQLineItems ADD SerialNumber NVARCHAR(255) NULL;
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
  })();

  try {
    await ensureBoqTablesPromise;
  } catch (error) {
    ensureBoqTablesPromise = null;
    throw error;
  }
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

  const consumedTotals = await loadBoqConsumedTotals(tx, ids);
  const orderedTotals = await loadBoqOrderedTotals(tx, ids);

  for (const boqItemId of ids) {
    const consumedQty = consumedTotals.get(boqItemId) ?? 0;
    const orderedQty = orderedTotals.get(boqItemId) ?? 0;

    const updateReq = new sql.Request(tx);
    updateReq.input("BoqItemId", sql.Int, boqItemId);
    updateReq.input("ConsumedQty", sql.Decimal(18, 2), consumedQty);
    updateReq.input("OrderedQty", sql.Decimal(18, 2), orderedQty);
    logBoqSqlStatement(
      null,
      `recalculate BOQ line-item balance ${boqItemId}`,
      `UPDATE dbo.BOQLineItems
       SET ConsumedQty = @ConsumedQty,
           AvailableQty = CASE
             WHEN Quantity - @OrderedQty < 0 THEN 0
             ELSE Quantity - @OrderedQty
           END
       WHERE LineItemId = @BoqItemId`
    );
    await updateReq.query(`
      UPDATE dbo.BOQLineItems
      SET ConsumedQty = @ConsumedQty,
          AvailableQty = CASE
            WHEN Quantity - @OrderedQty < 0 THEN 0
            ELSE Quantity - @OrderedQty
          END
      WHERE LineItemId = @BoqItemId
    `);
  }
};

const uniqueReceiveGoodsItemIds = (values = []) => {
  const set = new Set();
  (Array.isArray(values) ? values : []).forEach((value) => {
    const id = toNullableInt(value);
    if (id) {
      set.add(id);
    }
  });
  return Array.from(set);
};

const uniqueReceiveGoodsIds = (values = []) => {
  const set = new Set();
  (Array.isArray(values) ? values : []).forEach((value) => {
    const id = toNullableInt(value);
    if (id) {
      set.add(id);
    }
  });
  return Array.from(set);
};

const resolveReceiveGoodsSelectionId = (value) => {
  const directId = toNullableInt(value);
  if (directId) {
    return directId;
  }

  let candidate = value;
  if (candidate && typeof candidate === "object") {
    const nestedId = toNullableInt(
      candidate.receiveGoodsId ??
        candidate.ReceiveGoodsId ??
        candidate.id ??
        candidate.Id ??
        candidate.value ??
        null
    );
    if (nestedId) {
      return nestedId;
    }
    candidate =
      candidate.receiveReceiptReference ??
      candidate.receiveGoodsReference ??
      candidate.reference ??
      candidate.label ??
      candidate.text ??
      "";
  }

  const text = String(candidate ?? "").trim();
  if (!text) {
    return null;
  }
  const normalizedText = text.toLowerCase();
  const rgMatch = /^rg(?:[\s\-_]*ref(?:erence)?)?[\s\-_]*0*(\d+)$/i.exec(
    normalizedText
  );
  if (rgMatch) {
    return toNullableInt(rgMatch[1]);
  }
  const rrMatch = /^rr(?:[\s\-_]*ref(?:erence)?)?[\s\-_]*0*(\d+)$/i.exec(
    normalizedText
  );
  if (rrMatch) {
    return toNullableInt(rrMatch[1]);
  }
  return null;
};

const uniqueReceiveGoodsIdsFromSelections = (values = []) => {
  const set = new Set();
  (Array.isArray(values) ? values : []).forEach((value) => {
    const id = resolveReceiveGoodsSelectionId(value);
    if (id) {
      set.add(id);
    }
  });
  return Array.from(set);
};

const uniquePurchaseOrderIds = (values = []) => {
  const set = new Set();
  (Array.isArray(values) ? values : []).forEach((value) => {
    const id = toNullableInt(value);
    if (id !== null) {
      set.add(id);
    }
  });
  return Array.from(set);
};

const buildPurchaseOrderItemMetricKey = (purchaseOrderId, poItemId) => {
  const normalizedPurchaseOrderId = toNullableInt(purchaseOrderId);
  const normalizedPoItemId = toNullableInt(poItemId);
  if (normalizedPurchaseOrderId === null || normalizedPoItemId === null) {
    return null;
  }
  return `${normalizedPurchaseOrderId}:${normalizedPoItemId}`;
};

const mergePurchaseOrderItemReceiveMetrics = (item = {}, metrics = null) => {
  const orderedQty = Number(
    metrics?.orderedQty ?? item.orderedQty ?? item.quantity ?? item.OrderedQty ?? item.Quantity ?? 0
  ) || 0;
  const totalReceivedQty = Number(
    metrics?.totalReceivedQty ?? item.totalReceivedQty ?? item.receivedQty ?? item.ReceivedQty ?? 0
  ) || 0;
  const totalAvailableQty = Number(
    metrics?.totalAvailableQty ?? item.totalAvailableQty ?? item.availableQty ?? item.AvailableQty ?? totalReceivedQty
  ) || 0;
  const totalPoBalanceQty = Math.max(
    Number(
      metrics?.poBalanceQty ??
        item.totalPoBalanceQty ??
        item.poBalanceQty ??
        item.balanceQty ??
        item.POBalanceQty ??
        0
    ) || Math.max(orderedQty - totalReceivedQty, 0),
    0
  );

  return {
    ...item,
    orderedQty,
    receivedQty: totalReceivedQty,
    totalReceivedQty,
    availableQty: totalAvailableQty,
    totalAvailableQty,
    poBalanceQty: totalPoBalanceQty,
    totalPoBalanceQty,
  };
};

const pickPurchaseOrderItemReceiveMetrics = (primary = null, fallback = null) => {
  if (!primary) {
    return fallback;
  }
  if (
    fallback &&
    toReceiveQuantity(fallback.totalReceivedQty) >
      toReceiveQuantity(primary.totalReceivedQty)
  ) {
    return fallback;
  }
  return primary;
};

const loadPurchaseOrderItemReceiveMetricsMap = async (db, purchaseOrderIds = []) => {
  const ids = uniquePurchaseOrderIds(purchaseOrderIds);
  if (!ids.length) {
    return new Map();
  }

  await ensureReceiveTables();

  const [poConfig, poItemPkCol, receiveGoodsItemPkCol, receiveGoodsItemColsResult] =
    await Promise.all([
      loadPurchaseOrderItemsConfig(db),
      refreshPurchaseOrderItemsPk(),
      refreshReceiveGoodsItemsPk(),
      new sql.Request(db).query(`
        SELECT name AS ColumnName
        FROM sys.columns
        WHERE object_id = OBJECT_ID('dbo.ReceiveGoodsItems')
      `),
    ]);

  const receiveGoodsItemCols = new Set(
    (receiveGoodsItemColsResult.recordset ?? []).map((row) => row.ColumnName)
  );
  const receivePurchaseOrderIdCol = receiveGoodsItemCols.has("PurchaseOrderId")
    ? "PurchaseOrderId"
    : null;
  const receivePoItemIdCol = receiveGoodsItemCols.has("PurchaseOrderItemId")
    ? "PurchaseOrderItemId"
    : receiveGoodsItemCols.has("PurchaseorderItemId")
    ? "PurchaseorderItemId"
    : null;
  const receiveItemIdCol = receiveGoodsItemCols.has("ItemId") ? "ItemId" : null;
  const receiveQtyCol = receiveGoodsItemCols.has("ReceivedQty") ? "ReceivedQty" : null;

  if (!poConfig.hasPoId || !poConfig.qtyCol || !poItemPkCol || !receivePurchaseOrderIdCol || !receiveQtyCol) {
    return new Map();
  }

  const canFallbackByItem = Boolean(poConfig.itemIdCol && receiveItemIdCol);
  const canJoinConsumptionByReceiveItemId = Boolean(
    receiveGoodsItemPkCol && receiveGoodsItemCols.has(receiveGoodsItemPkCol)
  );

  const tableCheck = await new sql.Request(db).query(`
    SELECT OBJECT_ID('dbo.ConsumptionItems', 'U') AS TableId,
           COL_LENGTH('dbo.ConsumptionItems', 'ReceiveGoodsItemId') AS ReceiveGoodsItemIdLength
  `);
  const hasConsumptionItems =
    Boolean(tableCheck.recordset?.[0]?.TableId) &&
    Boolean(tableCheck.recordset?.[0]?.ReceiveGoodsItemIdLength);

  const poItemsRequest = new sql.Request(db);
  const poItemsInClause = buildPurchaseOrderItemInClause(
    poItemsRequest,
    ids,
    "PoMetricPurchaseOrderId"
  );
  const poItemsResult = await poItemsRequest.query(withSqlLockTimeout(`
      SELECT
        PurchaseOrderId,
        ${toIdentifier(poItemPkCol)} AS PurchaseOrderItemId,
        ${poConfig.itemIdCol ? toIdentifier(poConfig.itemIdCol) : "CAST(NULL AS INT)"} AS ItemId,
        COALESCE(${toIdentifier(poConfig.qtyCol)}, 0) AS OrderedQty
      FROM dbo.PurchaseOrderItems
      WHERE PurchaseOrderId IN (${poItemsInClause})
    `));

  const receiveItemsRequest = new sql.Request(db);
  const receiveItemsInClause = buildPurchaseOrderItemInClause(
    receiveItemsRequest,
    ids,
    "ReceiveMetricPurchaseOrderId"
  );
  const receiveItemsResult = await receiveItemsRequest.query(withSqlLockTimeout(`
    SELECT
      ${toIdentifier(receivePurchaseOrderIdCol)} AS PurchaseOrderId,
      ${receivePoItemIdCol ? toIdentifier(receivePoItemIdCol) : "CAST(NULL AS INT)"} AS PurchaseOrderItemId,
      ${receiveItemIdCol ? toIdentifier(receiveItemIdCol) : "CAST(NULL AS INT)"} AS ItemId,
      COALESCE(${toIdentifier(receiveQtyCol)}, 0) AS ReceivedQty,
      ${
        canJoinConsumptionByReceiveItemId
          ? toIdentifier(receiveGoodsItemPkCol)
          : "CAST(NULL AS INT)"
      } AS ReceiveGoodsItemId
    FROM dbo.ReceiveGoodsItems
    WHERE ${toIdentifier(receivePurchaseOrderIdCol)} IN (${receiveItemsInClause})
  `));

  const consumptionByReceiveItemId = new Map();
  if (hasConsumptionItems && canJoinConsumptionByReceiveItemId) {
    const receiveItemIds = (receiveItemsResult.recordset ?? [])
      .map((row) => toNullableInt(row.ReceiveGoodsItemId))
      .filter((value) => value !== null);
    if (receiveItemIds.length) {
      const consumptionRequest = new sql.Request(db);
      const consumptionInClause = buildPurchaseOrderItemInClause(
        consumptionRequest,
        receiveItemIds,
        "ReceiveMetricConsumedItemId"
      );
      const consumptionResult = await consumptionRequest.query(withSqlLockTimeout(`
        SELECT ReceiveGoodsItemId, SUM(COALESCE(Quantity, 0)) AS TotalConsumed
        FROM dbo.ConsumptionItems
        WHERE ReceiveGoodsItemId IN (${consumptionInClause})
        GROUP BY ReceiveGoodsItemId
      `));
      (consumptionResult.recordset ?? []).forEach((row) => {
        const receiveItemId = toNullableInt(row.ReceiveGoodsItemId);
        if (receiveItemId !== null) {
          consumptionByReceiveItemId.set(
            receiveItemId,
            toReceiveQuantity(row.TotalConsumed)
          );
        }
      });
    }
  }

  const poItems = poItemsResult.recordset ?? [];
  const itemCounts = new Map();
  if (canFallbackByItem) {
    poItems.forEach((row) => {
      const itemId = toNullableInt(row.ItemId);
      if (itemId === null || itemId <= 0) {
        return;
      }
      const key = `${row.PurchaseOrderId}:${itemId}`;
      itemCounts.set(key, (itemCounts.get(key) ?? 0) + 1);
    });
  }

  const totalsByPoItem = new Map();
  const totalsByItem = new Map();
  (receiveItemsResult.recordset ?? []).forEach((row) => {
    const purchaseOrderId = toNullableInt(row.PurchaseOrderId);
    const poItemId = toNullableInt(row.PurchaseOrderItemId);
    const itemId = toNullableInt(row.ItemId);
    const receivedQty = toReceiveQuantity(row.ReceivedQty);
    const consumedQty = toReceiveQuantity(
      consumptionByReceiveItemId.get(toNullableInt(row.ReceiveGoodsItemId))
    );

    if (purchaseOrderId !== null && poItemId !== null) {
      const key = `${purchaseOrderId}:${poItemId}`;
      const current = totalsByPoItem.get(key) ?? { received: 0, consumed: 0 };
      current.received += receivedQty;
      current.consumed += consumedQty;
      totalsByPoItem.set(key, current);
      return;
    }

    if (purchaseOrderId !== null && itemId !== null && itemId > 0) {
      const key = `${purchaseOrderId}:${itemId}`;
      const current = totalsByItem.get(key) ?? { received: 0, consumed: 0 };
      current.received += receivedQty;
      current.consumed += consumedQty;
      totalsByItem.set(key, current);
    }
  });

  return poItems.reduce((acc, row) => {
    const key = buildPurchaseOrderItemMetricKey(
      row.PurchaseOrderId,
      row.PurchaseOrderItemId
    );
    if (!key) {
      return acc;
    }

    const orderedQty = Number(row.OrderedQty ?? 0) || 0;
    const poItemTotals = totalsByPoItem.get(key) ?? null;
    const itemId = toNullableInt(row.ItemId);
    const itemKey =
      row.PurchaseOrderId !== null &&
      row.PurchaseOrderId !== undefined &&
      itemId !== null &&
      itemId > 0
        ? `${row.PurchaseOrderId}:${itemId}`
        : null;
    const itemTotals =
      itemKey && itemCounts.get(itemKey) === 1 ? totalsByItem.get(itemKey) : null;
    const totals = poItemTotals ?? itemTotals ?? { received: 0, consumed: 0 };
    const totalReceivedQty = Number(totals.received ?? 0) || 0;
    const totalConsumedQty = Number(totals.consumed ?? 0) || 0;
    acc.set(key, {
      orderedQty,
      totalReceivedQty,
      totalConsumedQty,
      totalAvailableQty: Math.max(totalReceivedQty - totalConsumedQty, 0),
      poBalanceQty: Math.max(orderedQty - totalReceivedQty, 0),
    });
    return acc;
  }, new Map());
};

const loadPurchaseOrderItemReceiveMetricsFallbackMap = async (
  db,
  purchaseOrderIds = []
) => {
  const ids = uniquePurchaseOrderIds(purchaseOrderIds);
  if (!ids.length) {
    return new Map();
  }

  const request = new sql.Request(db);
  const inClause = buildPurchaseOrderItemInClause(
    request,
    ids,
    "FallbackMetricPurchaseOrderId"
  );
  const result = await request.query(withSqlLockTimeout(`
    SELECT
      poi.PurchaseOrderId,
      poi.POItemId AS PurchaseOrderItemId,
      COALESCE(poi.Quantity, 0) AS OrderedQty,
      COALESCE(SUM(rgi.ReceivedQty), 0) AS TotalReceivedQty
    FROM dbo.PurchaseOrderItems poi
    LEFT JOIN dbo.ReceiveGoodsItems rgi
      ON rgi.PurchaseOrderId = poi.PurchaseOrderId
     AND rgi.PurchaseOrderItemId = poi.POItemId
    WHERE poi.PurchaseOrderId IN (${inClause})
    GROUP BY poi.PurchaseOrderId, poi.POItemId, poi.Quantity
  `));

  return (result.recordset ?? []).reduce((acc, row) => {
    const key = buildPurchaseOrderItemMetricKey(
      row.PurchaseOrderId,
      row.PurchaseOrderItemId
    );
    if (!key) {
      return acc;
    }
    const orderedQty = toReceiveQuantity(row.OrderedQty);
    const totalReceivedQty = toReceiveQuantity(row.TotalReceivedQty);
    acc.set(key, {
      orderedQty,
      totalReceivedQty,
      totalConsumedQty: 0,
      totalAvailableQty: totalReceivedQty,
      poBalanceQty: Math.max(orderedQty - totalReceivedQty, 0),
    });
    return acc;
  }, new Map());
};

const loadReceiveConsumedTotals = async (tx, receiveGoodsItemIds = []) => {
  const ids = uniqueReceiveGoodsItemIds(receiveGoodsItemIds);
  if (!ids.length) {
    return new Map();
  }

  const tableCheck = await new sql.Request(tx).query(`
    SELECT OBJECT_ID('dbo.ConsumptionItems', 'U') AS TableId,
           COL_LENGTH('dbo.ConsumptionItems', 'ReceiveGoodsItemId') AS ReceiveGoodsItemIdLength
  `);
  if (
    !tableCheck.recordset?.[0]?.TableId ||
    !tableCheck.recordset?.[0]?.ReceiveGoodsItemIdLength
  ) {
    return new Map();
  }

  const request = new sql.Request(tx);
  const inClause = buildPurchaseOrderItemInClause(request, ids, "ReceiveGoodsItemId");
  const result = await request.query(`
    SELECT ReceiveGoodsItemId, SUM(Quantity) AS TotalConsumed
    FROM dbo.ConsumptionItems
    WHERE ReceiveGoodsItemId IN (${inClause})
    GROUP BY ReceiveGoodsItemId
  `);

  return (result.recordset ?? []).reduce((acc, row) => {
    const id = toNullableInt(row.ReceiveGoodsItemId);
    if (id !== null) {
      acc.set(id, Number(row.TotalConsumed ?? 0) || 0);
    }
    return acc;
  }, new Map());
};

const buildReceiveProgressItemKey = (item = {}, index = 0) => {
  const purchaseOrderId = toNullableInt(
    item.purchaseOrderId ?? item.PurchaseOrderId
  );
  const keyPrefix =
    purchaseOrderId === null ? "po:unknown" : `po:${purchaseOrderId}`;
  const poItemId = toNullableInt(
    item.poItemId ?? item.POItemId ?? item.PurchaseOrderItemId
  );
  if (poItemId !== null) {
    return `${keyPrefix}:po-item:${poItemId}`;
  }

  const itemId = toNullableInt(item.itemId ?? item.ItemId);
  if (itemId !== null && itemId > 0) {
    return `${keyPrefix}:item:${itemId}`;
  }

  return `${keyPrefix}:index:${index}`;
};

const loadReceiveProgressMetricsByItemId = async (db, rows = []) => {
  const normalizedRows = (Array.isArray(rows) ? rows : []).map(
    normalizeReceiveGoodsItem
  );
  const purchaseOrderIds = uniquePurchaseOrderIds(
    normalizedRows.map((item) => item.purchaseOrderId)
  );
  if (!purchaseOrderIds.length) {
    return new Map();
  }

  const [receivePk, receiveItemsPk, receiveItemsFk] = await Promise.all([
    refreshReceiveGoodsPk(),
    refreshReceiveGoodsItemsPk(),
    refreshReceiveGoodsItemsFk(),
  ]);
  const request = new sql.Request(db);
  const purchaseOrderInClause = buildPurchaseOrderItemInClause(
    request,
    purchaseOrderIds,
    "ReceiveProgressPurchaseOrderId"
  );

  const [headersResult, itemsResult] = await Promise.all([
    request.query(withSqlLockTimeout(`
      SELECT *
      FROM dbo.ReceiveGoods
      WHERE PurchaseOrderId IN (${purchaseOrderInClause})
    `)),
    (() => {
      const itemsRequest = new sql.Request(db);
      const itemPurchaseOrderInClause = buildPurchaseOrderItemInClause(
        itemsRequest,
        purchaseOrderIds,
        "ReceiveProgressItemPurchaseOrderId"
      );
      return itemsRequest.query(withSqlLockTimeout(`
        SELECT *
        FROM dbo.ReceiveGoodsItems
        WHERE PurchaseOrderId IN (${itemPurchaseOrderInClause})
      `));
    })(),
  ]);

  const itemsByReceiptId = (itemsResult.recordset ?? []).reduce((acc, row) => {
    const receiptId = toNullableInt(
      row?.[receiveItemsFk] ??
        row.ReceiveGoodsId ??
        row.ReceiveGoodsID ??
        row.ReceivegoodsId ??
        row.ReceiptId ??
        row.ReceiveId
    );
    if (receiptId === null) {
      return acc;
    }
    if (!acc[receiptId]) {
      acc[receiptId] = [];
    }
    acc[receiptId].push(row);
    return acc;
  }, {});

  Object.keys(itemsByReceiptId).forEach((receiptId) => {
    itemsByReceiptId[receiptId].sort((left, right) => {
      const leftPoItemId = toReceiveQuantity(
        left.PurchaseOrderItemId ?? left.POItemId
      );
      const rightPoItemId = toReceiveQuantity(
        right.PurchaseOrderItemId ?? right.POItemId
      );
      if (leftPoItemId !== rightPoItemId) {
        return leftPoItemId - rightPoItemId;
      }
      return (
        toReceiveQuantity(left?.[receiveItemsPk] ?? left.ReceiveGoodsItemId ?? left.Id) -
        toReceiveQuantity(right?.[receiveItemsPk] ?? right.ReceiveGoodsItemId ?? right.Id)
      );
    });
  });

  const metricsByReceiveItemId = new Map();
  const cumulativeByLineKey = new Map();
  const sortedHeaders = sortReceiveRowsChronologically(
    headersResult.recordset ?? [],
    receivePk
  );

  sortedHeaders.forEach((headerRow) => {
    const receiptId = toNullableInt(
      headerRow?.[receivePk] ?? headerRow?.ReceiveGoodsId ?? headerRow?.Id
    );
    if (receiptId === null) {
      return;
    }

    (itemsByReceiptId[receiptId] ?? []).forEach((row, index) => {
      const item = normalizeReceiveGoodsItem(row);
      const receiveItemId = toNullableInt(item.id);
      const lineKey = buildReceiveProgressItemKey(item, index);
      const orderedQty = toReceiveQuantity(item.orderedQty);
      const receiptReceivedQty = toReceiveQuantity(item.receivedQty);
      const previouslyReceivedQty = toReceiveQuantity(
        cumulativeByLineKey.get(lineKey)
      );
      const availableBalanceQty = Math.max(
        orderedQty - previouslyReceivedQty,
        0
      );
      const totalReceivedQty = previouslyReceivedQty + receiptReceivedQty;
      const poBalanceQty = Math.max(orderedQty - totalReceivedQty, 0);

      cumulativeByLineKey.set(lineKey, totalReceivedQty);

      if (receiveItemId !== null) {
        metricsByReceiveItemId.set(receiveItemId, {
          orderedQty,
          previouslyReceivedQty,
          availableBalanceQty,
          receiptReceivedQty,
          totalReceivedQty,
          poBalanceQty,
        });
      }
    });
  });

  return metricsByReceiveItemId;
};

const hydrateReceiveGoodsItemsWithInventoryMetrics = async (
  db,
  rows = []
) => {
  const normalizedItems = (Array.isArray(rows) ? rows : []).map(
    normalizeReceiveGoodsItem
  );
  if (!normalizedItems.length) {
    return [];
  }

  const consumedTotals = await loadReceiveConsumedTotals(
    db,
    normalizedItems.map((item) => item.id)
  );
  const progressMetricsByItemId = await loadReceiveProgressMetricsByItemId(
    db,
    rows
  );

  return normalizedItems.map((item) => {
    const itemId = toNullableInt(item.id);
    const receiptReceivedQty = toReceiveQuantity(item.receivedQty);
    const receiptConsumedQty =
      itemId === null
        ? toReceiveQuantity(item.consumedQty)
        : toReceiveQuantity(consumedTotals.get(itemId));
    const receiptAvailableQty = Math.max(receiptReceivedQty - receiptConsumedQty, 0);
    const progressMetrics =
      itemId === null ? null : progressMetricsByItemId.get(itemId);
    const orderedQty =
      Number(progressMetrics?.orderedQty ?? item.orderedQty ?? item.OrderedQty ?? 0) || 0;
    const previouslyReceivedQty = Math.max(
      Number(
        progressMetrics?.previouslyReceivedQty ??
          item.previouslyReceivedQty ??
          item.PreviouslyReceivedQty ??
          Math.max(orderedQty - receiptReceivedQty - toReceiveQuantity(item.balanceQty), 0)
      ) || 0,
      0
    );
    const availableBalanceQty = Math.max(
      Number(
        progressMetrics?.availableBalanceQty ??
          item.availableBalanceQty ??
          item.AvailableBalanceQty ??
          orderedQty - previouslyReceivedQty
      ) || 0,
      0
    );
    const totalReceivedQty =
      Number(
        progressMetrics?.totalReceivedQty ??
          item.totalReceivedQty ??
          previouslyReceivedQty + receiptReceivedQty
      ) || 0;
    const totalPoBalanceQty = Math.max(
      Number(
        progressMetrics?.poBalanceQty ??
          item.totalPoBalanceQty ??
          Math.max(orderedQty - totalReceivedQty, 0)
      ) || 0,
      0
    );
    const receiptBalanceQty = totalPoBalanceQty;
    const totalAvailableQty = Math.max(totalReceivedQty - receiptConsumedQty, 0);

    return {
      ...item,
      orderedQty,
      balanceQty: receiptBalanceQty,
      poBalanceQty: receiptBalanceQty,
      consumedQty: receiptConsumedQty,
      availableQty: receiptAvailableQty,
      receiptReceivedQty,
      receiptAvailableQty,
      receiptBalanceQty,
      previouslyReceivedQty,
      availableBalanceQty,
      totalReceivedQty,
      totalConsumedQty: receiptConsumedQty,
      totalAvailableQty,
      totalPoBalanceQty,
    };
  });
};

const loadReceiveGoodsItemsForConsumption = async (
  tx,
  {
    receiveGoodsId = null,
    receiveGoodsIds = [],
    receiveGoodsItemIds = [],
  } = {}
) => {
  const ids = uniqueReceiveGoodsItemIds(receiveGoodsItemIds);
  if (!ids.length) {
    return [];
  }

  await ensureReceiveTables();
  const receivePk = await refreshReceiveGoodsPk();
  const receiveItemsPk = await refreshReceiveGoodsItemsPk();
  const request = new sql.Request(tx);
  const inClause = buildPurchaseOrderItemInClause(request, ids, "ReceiveGoodsItemId");
  const result = await request.query(`
    SELECT *, ${toIdentifier(receiveItemsPk)} AS Id
    FROM dbo.ReceiveGoodsItems
    WHERE ${toIdentifier(receiveItemsPk)} IN (${inClause})
  `);
  const rows = result.recordset ?? [];

  if (rows.length !== ids.length) {
    const error = new Error("One or more linked receive receipt items could not be found.");
    error.statusCode = 400;
    throw error;
  }

  const normalizedReceiveGoodsIds = uniqueReceiveGoodsIdsFromSelections([
    ...(Array.isArray(receiveGoodsIds) ? receiveGoodsIds : []),
    receiveGoodsId,
  ]);
  if (
    normalizedReceiveGoodsIds.length &&
    rows.some((row) => {
      const linkedReceiveGoodsId = toNullableInt(row.ReceiveGoodsId);
      return (
        linkedReceiveGoodsId === null ||
        !normalizedReceiveGoodsIds.includes(linkedReceiveGoodsId)
      );
    })
  ) {
    const error = new Error(
      "The selected receive receipt references do not match the linked receipt items."
    );
    error.statusCode = 400;
    throw error;
  }

  if (normalizedReceiveGoodsIds.length) {
    const receiptRequest = new sql.Request(tx);
    const selectedReceiptIdsClause = buildPurchaseOrderItemInClause(
      receiptRequest,
      normalizedReceiveGoodsIds,
      "SelectedReceiveGoodsId"
    );
    const selectedReceiptsResult = await receiptRequest.query(`
      SELECT ${toIdentifier(receivePk)} AS ReceiveGoodsId
      FROM dbo.ReceiveGoods
      WHERE ${toIdentifier(receivePk)} IN (${selectedReceiptIdsClause})
    `);
    const existingReceiptIds = uniqueReceiveGoodsIds(
      (selectedReceiptsResult.recordset ?? []).map((row) => row.ReceiveGoodsId)
    );
    if (existingReceiptIds.length !== normalizedReceiveGoodsIds.length) {
      const error = new Error(
        "One or more selected receive receipt references were not found."
      );
      error.statusCode = 400;
      throw error;
    }
  }

  return rows.map(normalizeReceiveGoodsItem);
};

let deliveryChallanPk = "DeliveryChallanId";
let deliveryChallanItemsFk = "DeliveryChallanId";
let ensureDeliveryChallanTablesPromise = null;
const DELIVERY_CHALLAN_NUMBER_PREFIX = "DC-";
const DELIVERY_CHALLAN_NUMBER_PAD = 4;

const resolveDeliveryChallanDestination = async (
  tx,
  {
    toLocationId = null,
    toLocation = null,
  } = {}
) => {
  const safeToLocationId = toNullableInt(toLocationId);
  const safeToLocation = normalizeOptionalString(toLocation);

  if (!safeToLocationId) {
    return {
      toLocationId: null,
      toLocation: safeToLocation ?? "",
    };
  }

  const locationResult = await new sql.Request(tx)
    .input("LocationId", sql.Int, safeToLocationId)
    .query(`
      SELECT TOP 1 *
      FROM dbo.Locations
      WHERE LocationId = @LocationId
    `);
  const locationRow = locationResult.recordset?.[0] ?? null;

  if (!locationRow) {
    const error = new Error("Destination location not found");
    error.statusCode = 400;
    throw error;
  }

  return {
    toLocationId: safeToLocationId,
    toLocation:
      normalizeOptionalString(
        locationRow.Name ?? locationRow.LocationName ?? safeToLocation
      ) ?? "",
  };
};

const parseDeliveryChallanSequence = (value) => {
  const normalized = String(value ?? "").trim().toUpperCase();
  if (!normalized) {
    return null;
  }
  const match = /^DC-(\d+)$/.exec(normalized);
  if (!match) {
    return null;
  }
  const sequence = Number.parseInt(match[1], 10);
  return Number.isFinite(sequence) ? sequence : null;
};

const generateNextDeliveryChallanNumber = async (db) => {
  const result = await new sql.Request(db).query(`
    SELECT DCNumber
    FROM dbo.DeliveryChallan
    WHERE DCNumber IS NOT NULL
  `);
  const maxSequence = (result.recordset ?? []).reduce((max, row) => {
    const sequence = parseDeliveryChallanSequence(row.DCNumber ?? row.dcNumber);
    return sequence === null ? max : Math.max(max, sequence);
  }, 0);
  return `${DELIVERY_CHALLAN_NUMBER_PREFIX}${String(maxSequence + 1).padStart(
    DELIVERY_CHALLAN_NUMBER_PAD,
    "0"
  )}`;
};

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
          ReceiveGoodsId INT NULL,
          FromLocationId INT NULL,
          ToLocationId INT NULL,
          ToLocation NVARCHAR(200) NULL,
          VehicleNumber NVARCHAR(50) NULL,
          EWayBillNumber NVARCHAR(100) NULL,
          IssueDate DATE NULL,
          Status NVARCHAR(50) NULL,
          PODStatus NVARCHAR(50) NULL,
          PODReference NVARCHAR(100) NULL,
          PODDate DATE NULL,
          PODDocumentName NVARCHAR(255) NULL,
          PODDocumentType NVARCHAR(100) NULL,
          PODDocumentSize BIGINT NULL,
          PODDocumentData NVARCHAR(MAX) NULL,
          PODUploadedAt DATETIME2 NULL,
          PODUploadedBy NVARCHAR(255) NULL,
          PODVerifiedAt DATETIME2 NULL,
          PODVerifiedBy NVARCHAR(255) NULL,
          PODRejectedAt DATETIME2 NULL,
          PODRejectedBy NVARCHAR(255) NULL,
          PODRejectionRemarks NVARCHAR(MAX) NULL,
          PODDisputedAt DATETIME2 NULL,
          PODDisputedBy NVARCHAR(255) NULL,
          PODDisputeRemarks NVARCHAR(MAX) NULL,
          PODResolvedAt DATETIME2 NULL,
          PODResolvedBy NVARCHAR(255) NULL,
          PODResolutionRemarks NVARCHAR(MAX) NULL,
          PODWaivedAt DATETIME2 NULL,
          PODWaivedBy NVARCHAR(255) NULL,
          PODWaiverReason NVARCHAR(MAX) NULL,
          PODWaiverApprovedBy NVARCHAR(255) NULL,
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
      IF COL_LENGTH('dbo.DeliveryChallan', 'ReceiveGoodsId') IS NULL
      BEGIN
        ALTER TABLE dbo.DeliveryChallan ADD ReceiveGoodsId INT NULL;
      END;
      IF COL_LENGTH('dbo.DeliveryChallan', 'FromLocationId') IS NULL
      BEGIN
        ALTER TABLE dbo.DeliveryChallan ADD FromLocationId INT NULL;
      END;
      IF COL_LENGTH('dbo.DeliveryChallan', 'ToLocationId') IS NULL
      BEGIN
        ALTER TABLE dbo.DeliveryChallan ADD ToLocationId INT NULL;
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
      IF COL_LENGTH('dbo.DeliveryChallan', 'PODStatus') IS NULL
      BEGIN
        ALTER TABLE dbo.DeliveryChallan ADD PODStatus NVARCHAR(50) NULL;
      END;
      IF COL_LENGTH('dbo.DeliveryChallan', 'PODReference') IS NULL
      BEGIN
        ALTER TABLE dbo.DeliveryChallan ADD PODReference NVARCHAR(100) NULL;
      END;
      IF COL_LENGTH('dbo.DeliveryChallan', 'PODDate') IS NULL
      BEGIN
        ALTER TABLE dbo.DeliveryChallan ADD PODDate DATE NULL;
      END;
      IF COL_LENGTH('dbo.DeliveryChallan', 'PODDocumentName') IS NULL
      BEGIN
        ALTER TABLE dbo.DeliveryChallan ADD PODDocumentName NVARCHAR(255) NULL;
      END;
      IF COL_LENGTH('dbo.DeliveryChallan', 'PODDocumentType') IS NULL
      BEGIN
        ALTER TABLE dbo.DeliveryChallan ADD PODDocumentType NVARCHAR(100) NULL;
      END;
      IF COL_LENGTH('dbo.DeliveryChallan', 'PODDocumentSize') IS NULL
      BEGIN
        ALTER TABLE dbo.DeliveryChallan ADD PODDocumentSize BIGINT NULL;
      END;
      IF COL_LENGTH('dbo.DeliveryChallan', 'PODDocumentData') IS NULL
      BEGIN
        ALTER TABLE dbo.DeliveryChallan ADD PODDocumentData NVARCHAR(MAX) NULL;
      END;
      IF COL_LENGTH('dbo.DeliveryChallan', 'PODUploadedAt') IS NULL
      BEGIN
        ALTER TABLE dbo.DeliveryChallan ADD PODUploadedAt DATETIME2 NULL;
      END;
      IF COL_LENGTH('dbo.DeliveryChallan', 'PODUploadedBy') IS NULL
      BEGIN
        ALTER TABLE dbo.DeliveryChallan ADD PODUploadedBy NVARCHAR(255) NULL;
      END;
      IF COL_LENGTH('dbo.DeliveryChallan', 'PODVerifiedAt') IS NULL
      BEGIN
        ALTER TABLE dbo.DeliveryChallan ADD PODVerifiedAt DATETIME2 NULL;
      END;
      IF COL_LENGTH('dbo.DeliveryChallan', 'PODVerifiedBy') IS NULL
      BEGIN
        ALTER TABLE dbo.DeliveryChallan ADD PODVerifiedBy NVARCHAR(255) NULL;
      END;
      IF COL_LENGTH('dbo.DeliveryChallan', 'PODRejectedAt') IS NULL
      BEGIN
        ALTER TABLE dbo.DeliveryChallan ADD PODRejectedAt DATETIME2 NULL;
      END;
      IF COL_LENGTH('dbo.DeliveryChallan', 'PODRejectedBy') IS NULL
      BEGIN
        ALTER TABLE dbo.DeliveryChallan ADD PODRejectedBy NVARCHAR(255) NULL;
      END;
      IF COL_LENGTH('dbo.DeliveryChallan', 'PODRejectionRemarks') IS NULL
      BEGIN
        ALTER TABLE dbo.DeliveryChallan ADD PODRejectionRemarks NVARCHAR(MAX) NULL;
      END;
      IF COL_LENGTH('dbo.DeliveryChallan', 'PODDisputedAt') IS NULL
      BEGIN
        ALTER TABLE dbo.DeliveryChallan ADD PODDisputedAt DATETIME2 NULL;
      END;
      IF COL_LENGTH('dbo.DeliveryChallan', 'PODDisputedBy') IS NULL
      BEGIN
        ALTER TABLE dbo.DeliveryChallan ADD PODDisputedBy NVARCHAR(255) NULL;
      END;
      IF COL_LENGTH('dbo.DeliveryChallan', 'PODDisputeRemarks') IS NULL
      BEGIN
        ALTER TABLE dbo.DeliveryChallan ADD PODDisputeRemarks NVARCHAR(MAX) NULL;
      END;
      IF COL_LENGTH('dbo.DeliveryChallan', 'PODResolvedAt') IS NULL
      BEGIN
        ALTER TABLE dbo.DeliveryChallan ADD PODResolvedAt DATETIME2 NULL;
      END;
      IF COL_LENGTH('dbo.DeliveryChallan', 'PODResolvedBy') IS NULL
      BEGIN
        ALTER TABLE dbo.DeliveryChallan ADD PODResolvedBy NVARCHAR(255) NULL;
      END;
      IF COL_LENGTH('dbo.DeliveryChallan', 'PODResolutionRemarks') IS NULL
      BEGIN
        ALTER TABLE dbo.DeliveryChallan ADD PODResolutionRemarks NVARCHAR(MAX) NULL;
      END;
      IF COL_LENGTH('dbo.DeliveryChallan', 'PODWaivedAt') IS NULL
      BEGIN
        ALTER TABLE dbo.DeliveryChallan ADD PODWaivedAt DATETIME2 NULL;
      END;
      IF COL_LENGTH('dbo.DeliveryChallan', 'PODWaivedBy') IS NULL
      BEGIN
        ALTER TABLE dbo.DeliveryChallan ADD PODWaivedBy NVARCHAR(255) NULL;
      END;
      IF COL_LENGTH('dbo.DeliveryChallan', 'PODWaiverReason') IS NULL
      BEGIN
        ALTER TABLE dbo.DeliveryChallan ADD PODWaiverReason NVARCHAR(MAX) NULL;
      END;
      IF COL_LENGTH('dbo.DeliveryChallan', 'PODWaiverApprovedBy') IS NULL
      BEGIN
        ALTER TABLE dbo.DeliveryChallan ADD PODWaiverApprovedBy NVARCHAR(255) NULL;
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
      IF NOT EXISTS (
        SELECT 1
        FROM sys.indexes
        WHERE name = 'UX_DeliveryChallan_DCNumber'
          AND object_id = OBJECT_ID('dbo.DeliveryChallan')
      )
      BEGIN
        CREATE UNIQUE INDEX UX_DeliveryChallan_DCNumber
          ON dbo.DeliveryChallan(DCNumber)
          WHERE DCNumber IS NOT NULL;
      END
    `);

    await pool.request().query(`
      UPDATE dbo.DeliveryChallan
      SET PODStatus = CASE
        WHEN PODStatus IS NULL OR LTRIM(RTRIM(PODStatus)) = '' THEN N'POD_PENDING'
        WHEN LOWER(LTRIM(RTRIM(PODStatus))) IN (N'pending', N'pod pending', N'pod_pending') THEN N'POD_PENDING'
        WHEN LOWER(LTRIM(RTRIM(PODStatus))) IN (N'uploaded', N'pod uploaded', N'pod_uploaded') THEN N'POD_UPLOADED'
        WHEN LOWER(LTRIM(RTRIM(PODStatus))) IN (N'under verification', N'pod under verification', N'pod_under_verification') THEN N'POD_UNDER_VERIFICATION'
        WHEN LOWER(LTRIM(RTRIM(PODStatus))) IN (N'verified', N'pod verified', N'pod_verified', N'received', N'delivered') THEN N'POD_VERIFIED'
        WHEN LOWER(LTRIM(RTRIM(PODStatus))) IN (N'rejected', N'pod rejected', N'pod_rejected') THEN N'POD_REJECTED'
        WHEN LOWER(LTRIM(RTRIM(PODStatus))) IN (N'disputed', N'pod disputed', N'pod_disputed') THEN N'POD_DISPUTED'
        WHEN LOWER(LTRIM(RTRIM(PODStatus))) IN (N'waived', N'pod waived', N'pod_waived', N'not required') THEN N'POD_WAIVED'
        ELSE N'POD_PENDING'
      END
      WHERE PODStatus IS NULL
        OR PODStatus NOT IN (
          N'POD_PENDING',
          N'POD_UPLOADED',
          N'POD_UNDER_VERIFICATION',
          N'POD_VERIFIED',
          N'POD_REJECTED',
          N'POD_DISPUTED',
          N'POD_WAIVED'
        );

      UPDATE dbo.DeliveryChallan
      SET PODVerifiedAt = COALESCE(PODVerifiedAt, TRY_CONVERT(DATETIME2, PODDate), UpdatedAt, CreatedAt),
          PODVerifiedBy = COALESCE(PODVerifiedBy, N'Legacy POD')
      WHERE PODStatus = N'POD_VERIFIED'
        AND PODVerifiedAt IS NULL;

      UPDATE dbo.DeliveryChallan
      SET PODWaivedAt = COALESCE(PODWaivedAt, UpdatedAt, CreatedAt),
          PODWaiverApprovedBy = COALESCE(PODWaiverApprovedBy, N'Legacy POD'),
          PODWaiverReason = COALESCE(PODWaiverReason, N'Legacy Not Required status')
      WHERE PODStatus = N'POD_WAIVED'
        AND PODWaivedAt IS NULL;
    `);

    await pool.request().query(`
      IF OBJECT_ID('dbo.DeliveryChallanPODAuditLog', 'U') IS NULL
      BEGIN
        CREATE TABLE dbo.DeliveryChallanPODAuditLog (
          AuditId BIGINT IDENTITY(1,1) PRIMARY KEY,
          DeliveryChallanId BIGINT NOT NULL,
          ActionName NVARCHAR(50) NOT NULL,
          FromStatus NVARCHAR(50) NULL,
          ToStatus NVARCHAR(50) NULL,
          PerformedBy NVARCHAR(255) NULL,
          PerformedRole NVARCHAR(100) NULL,
          Remarks NVARCHAR(MAX) NULL,
          SnapshotJson NVARCHAR(MAX) NULL,
          CreatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
        )
      END
    `);

    await pool.request().query(`
      IF OBJECT_ID('dbo.DeliveryChallanItems', 'U') IS NULL
      BEGIN
        CREATE TABLE dbo.DeliveryChallanItems (
          Id BIGINT IDENTITY(1,1) PRIMARY KEY,
          DeliveryChallanId BIGINT NOT NULL,
          ReceiveGoodsItemId INT NULL,
          PurchaseOrderItemId INT NULL,
          ItemId INT NULL,
          ItemName NVARCHAR(200) NULL,
          Description NVARCHAR(500) NULL,
          Unit NVARCHAR(50) NULL,
          HSN NVARCHAR(50) NULL,
          GST NVARCHAR(100) NULL,
          Quantity DECIMAL(18,2) NOT NULL DEFAULT 0,
          Rate DECIMAL(18,2) NOT NULL DEFAULT 0,
          SourceType NVARCHAR(50) NULL,
          SourceKey NVARCHAR(200) NULL,
          SourceRef NVARCHAR(255) NULL,
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
      IF COL_LENGTH('dbo.DeliveryChallanItems', 'ReceiveGoodsItemId') IS NULL
      BEGIN
        ALTER TABLE dbo.DeliveryChallanItems ADD ReceiveGoodsItemId INT NULL;
      END;
      IF COL_LENGTH('dbo.DeliveryChallanItems', 'SourceType') IS NULL
      BEGIN
        ALTER TABLE dbo.DeliveryChallanItems ADD SourceType NVARCHAR(50) NULL;
      END;
      IF COL_LENGTH('dbo.DeliveryChallanItems', 'SourceKey') IS NULL
      BEGIN
        ALTER TABLE dbo.DeliveryChallanItems ADD SourceKey NVARCHAR(200) NULL;
      END;
      IF COL_LENGTH('dbo.DeliveryChallanItems', 'SourceRef') IS NULL
      BEGIN
        ALTER TABLE dbo.DeliveryChallanItems ADD SourceRef NVARCHAR(255) NULL;
      END;
      IF COL_LENGTH('dbo.DeliveryChallanItems', 'PurchaseOrderItemId') IS NULL
      BEGIN
        ALTER TABLE dbo.DeliveryChallanItems ADD PurchaseOrderItemId INT NULL;
      END;
      IF COL_LENGTH('dbo.DeliveryChallanItems', 'ItemId') IS NULL
      BEGIN
        ALTER TABLE dbo.DeliveryChallanItems ADD ItemId INT NULL;
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
          FromLocationId INT NULL,
          LocationId INT NULL,
          ReceiveGoodsId INT NULL,
          DeliveryChallanId INT NULL,
          DeliveryChallanIds NVARCHAR(MAX) NULL,
          DeliveryChallanRef NVARCHAR(100) NULL,
          ConsumptionDate DATE NULL,
          IssuedBy NVARCHAR(200) NULL,
          Status NVARCHAR(50) NULL,
          Notes NVARCHAR(MAX) NULL,
          CompanyAddress NVARCHAR(MAX) NULL,
          CompanyGstin NVARCHAR(50) NULL,
          CompanyPhone NVARCHAR(50) NULL,
          CompanyEmail NVARCHAR(100) NULL,
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
      IF COL_LENGTH('dbo.Consumption', 'FromLocationId') IS NULL
      BEGIN
        ALTER TABLE dbo.Consumption ADD FromLocationId INT NULL;
      END;
      IF COL_LENGTH('dbo.Consumption', 'LocationId') IS NULL
      BEGIN
        ALTER TABLE dbo.Consumption ADD LocationId INT NULL;
      END;
      IF COL_LENGTH('dbo.Consumption', 'ReceiveGoodsId') IS NULL
      BEGIN
        ALTER TABLE dbo.Consumption ADD ReceiveGoodsId INT NULL;
      END;
      IF COL_LENGTH('dbo.Consumption', 'DeliveryChallanId') IS NULL
      BEGIN
        ALTER TABLE dbo.Consumption ADD DeliveryChallanId INT NULL;
      END;
      IF COL_LENGTH('dbo.Consumption', 'DeliveryChallanIds') IS NULL
      BEGIN
        ALTER TABLE dbo.Consumption ADD DeliveryChallanIds NVARCHAR(MAX) NULL;
      END;
      IF COL_LENGTH('dbo.Consumption', 'DeliveryChallanRef') IS NULL
      BEGIN
        ALTER TABLE dbo.Consumption ADD DeliveryChallanRef NVARCHAR(100) NULL;
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
      IF COL_LENGTH('dbo.Consumption', 'CompanyAddress') IS NULL
      BEGIN
        ALTER TABLE dbo.Consumption ADD CompanyAddress NVARCHAR(MAX) NULL;
      END;
      IF COL_LENGTH('dbo.Consumption', 'CompanyGstin') IS NULL
      BEGIN
        ALTER TABLE dbo.Consumption ADD CompanyGstin NVARCHAR(50) NULL;
      END;
      IF COL_LENGTH('dbo.Consumption', 'CompanyPhone') IS NULL
      BEGIN
        ALTER TABLE dbo.Consumption ADD CompanyPhone NVARCHAR(50) NULL;
      END;
      IF COL_LENGTH('dbo.Consumption', 'CompanyEmail') IS NULL
      BEGIN
        ALTER TABLE dbo.Consumption ADD CompanyEmail NVARCHAR(100) NULL;
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
          ItemId INT NULL,
          DeliveryChallanId INT NULL,
          DeliveryChallanItemId BIGINT NULL,
          ReceiveGoodsItemId INT NULL,
          SourceType NVARCHAR(50) NULL,
          SourceKey NVARCHAR(200) NULL,
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
      IF COL_LENGTH('dbo.ConsumptionItems', 'ItemId') IS NULL
      BEGIN
        ALTER TABLE dbo.ConsumptionItems ADD ItemId INT NULL;
      END;
      IF COL_LENGTH('dbo.ConsumptionItems', 'DeliveryChallanId') IS NULL
      BEGIN
        ALTER TABLE dbo.ConsumptionItems ADD DeliveryChallanId INT NULL;
      END;
      IF COL_LENGTH('dbo.ConsumptionItems', 'DeliveryChallanItemId') IS NULL
      BEGIN
        ALTER TABLE dbo.ConsumptionItems ADD DeliveryChallanItemId BIGINT NULL;
      END;
      IF COL_LENGTH('dbo.ConsumptionItems', 'ReceiveGoodsItemId') IS NULL
      BEGIN
        ALTER TABLE dbo.ConsumptionItems ADD ReceiveGoodsItemId INT NULL;
      END;
      IF COL_LENGTH('dbo.ConsumptionItems', 'SourceType') IS NULL
      BEGIN
        ALTER TABLE dbo.ConsumptionItems ADD SourceType NVARCHAR(50) NULL;
      END;
      IF COL_LENGTH('dbo.ConsumptionItems', 'SourceKey') IS NULL
      BEGIN
        ALTER TABLE dbo.ConsumptionItems ADD SourceKey NVARCHAR(200) NULL;
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

const validateConsumptionAgainstDeliveryChallan = async (
  tx,
  {
    deliveryChallanId = null,
    deliveryChallanRef = null,
    consumptionId = null,
    items = [],
  } = {}
) => {
  const safeDeliveryChallanId = toNullableInt(deliveryChallanId);
  const safeDeliveryChallanRef = normalizeOptionalString(deliveryChallanRef);
  if (safeDeliveryChallanId === null && !safeDeliveryChallanRef) {
    return;
  }

  await ensureDeliveryChallanTables();
  await ensureConsumptionTables();
  const deliveryPk = await refreshDeliveryChallanPk();
  const deliveryFk = await refreshDeliveryChallanItemsFk();
  const consumptionHeaderPk = await refreshConsumptionPk();
  const consumptionItemFk = await refreshConsumptionItemsFk();

  const challanRequest = new sql.Request(tx);
  challanRequest.input("DeliveryChallanId", sql.BigInt, safeDeliveryChallanId);
  challanRequest.input(
    "DeliveryChallanRef",
    sql.NVarChar(100),
    safeDeliveryChallanRef ?? null
  );
  const challanResult = await challanRequest.query(`
    SELECT TOP 1 *
    FROM dbo.DeliveryChallan
    WHERE ${toIdentifier(deliveryPk)} = @DeliveryChallanId
      OR (
        @DeliveryChallanRef IS NOT NULL
        AND LTRIM(RTRIM(@DeliveryChallanRef)) <> ''
        AND LOWER(LTRIM(RTRIM(DCNumber))) = LOWER(LTRIM(RTRIM(@DeliveryChallanRef)))
      )
    ORDER BY CASE
      WHEN ${toIdentifier(deliveryPk)} = @DeliveryChallanId THEN 0
      ELSE 1
    END,
    ${toIdentifier(deliveryPk)} DESC
  `);

  const challan = normalizeDeliveryChallan(challanResult.recordset?.[0] ?? {});
  if (!challan.id) {
    const error = new Error("Selected delivery challan was not found.");
    error.statusCode = 400;
    throw error;
  }

  const challanItemsResult = await new sql.Request(tx)
    .input("DeliveryChallanId", sql.BigInt, challan.id)
    .query(`
      SELECT *
      FROM dbo.DeliveryChallanItems
      WHERE ${toIdentifier(deliveryFk)} = @DeliveryChallanId
    `);
  const challanItems = (challanItemsResult.recordset ?? []).map(
    normalizeDeliveryChallanItem
  );
  const {
    groups,
    sourceKeyToGroupKey,
    deliveryChallanItemIdToGroupKey,
    receiveGoodsItemIdToMaterialKey,
  } = buildDeliveryChallanMaterialGroups(challanItems);

  if (!groups.size) {
    const error = new Error("The selected delivery challan has no line items.");
    error.statusCode = 400;
    throw error;
  }

  const linkedItemsResult = await new sql.Request(tx)
    .input("DeliveryChallanId", sql.Int, toNullableInt(challan.id))
    .input(
      "DeliveryChallanRef",
      sql.NVarChar(100),
      challan.dcNumber || safeDeliveryChallanRef || null
    )
    .input("ConsumptionId", sql.Int, toNullableInt(consumptionId))
    .query(`
      SELECT ci.*
      FROM dbo.ConsumptionItems ci
      INNER JOIN dbo.Consumption c
        ON c.${toIdentifier(consumptionHeaderPk)} = ci.${toIdentifier(
      consumptionItemFk
    )}
      WHERE (
        c.DeliveryChallanId = @DeliveryChallanId
        OR (
          @DeliveryChallanRef IS NOT NULL
          AND LTRIM(RTRIM(@DeliveryChallanRef)) <> ''
          AND LOWER(LTRIM(RTRIM(c.DeliveryChallanRef))) = LOWER(LTRIM(RTRIM(@DeliveryChallanRef)))
        )
      )
      AND (
        @ConsumptionId IS NULL
        OR c.${toIdentifier(consumptionHeaderPk)} <> @ConsumptionId
      )
    `);

  const consumedByMaterialKey = new Map();
  (linkedItemsResult.recordset ?? []).forEach((row) => {
    const item = normalizeConsumptionItem(row);
    const materialKey = resolveDeliveryChallanMaterialKey(
      item,
      groups,
      sourceKeyToGroupKey,
      deliveryChallanItemIdToGroupKey,
      receiveGoodsItemIdToMaterialKey
    );
    if (!materialKey) {
      return;
    }

    consumedByMaterialKey.set(
      materialKey,
      (consumedByMaterialKey.get(materialKey) ?? 0) +
        (Number(item.quantity ?? item.Quantity ?? 0) || 0)
    );
  });

  const requestedByMaterialKey = new Map();
  (Array.isArray(items) ? items : []).forEach((item) => {
    const materialKey = resolveDeliveryChallanMaterialKey(
      item,
      groups,
      receiveGoodsItemIdToMaterialKey
    );
    if (!materialKey) {
      const error = new Error(
        `${item.name || "This material"} is not present in the selected delivery challan.`
      );
      error.statusCode = 400;
      throw error;
    }

    requestedByMaterialKey.set(
      materialKey,
      (requestedByMaterialKey.get(materialKey) ?? 0) +
        (Number(item.quantity ?? item.Quantity ?? 0) || 0)
    );
  });

  requestedByMaterialKey.forEach((requestedQty, materialKey) => {
    const group = groups.get(materialKey);
    const alreadyConsumed = consumedByMaterialKey.get(materialKey) ?? 0;
    const availableQty = Math.max((group?.deliveredQty ?? 0) - alreadyConsumed, 0);

    if (requestedQty > availableQty) {
      const error = new Error(
        `Quantity for ${group?.name || "the selected material"} cannot be greater than the available delivery challan balance (${availableQty}).`
      );
      error.statusCode = 400;
      throw error;
    }
  });
};

const validateDeliveryChallanAgainstReceivedGoods = async (
  tx,
  {
    deliveryChallanId = null,
    receiveGoodsId = null,
    receiveGoodsIds = [],
    projectId = null,
    items = [],
  } = {}
) => {
  const safeDeliveryChallanId = toNullableInt(deliveryChallanId);
  const safeReceiveGoodsId = resolveReceiveGoodsSelectionId(receiveGoodsId);
  const safeReceiveGoodsIds = uniqueReceiveGoodsIdsFromSelections([
    ...(Array.isArray(receiveGoodsIds) ? receiveGoodsIds : []),
    safeReceiveGoodsId,
  ]);
  const requestedItems = Array.isArray(items) ? items : [];
  const requestedReceiveGoodsItemIds = uniqueReceiveGoodsItemIds(
    requestedItems.map((item) =>
      toNullableInt(item.receiveGoodsItemId ?? item.ReceiveGoodsItemId)
    )
  );

  if (!safeReceiveGoodsIds.length && !requestedReceiveGoodsItemIds.length) {
    const error = new Error(
      "Delivery challan items must be loaded from receive receipts."
    );
    error.statusCode = 400;
    throw error;
  }

  await ensureReceiveTables();
  await ensureDeliveryChallanTables();
  const receivePk = await refreshReceiveGoodsPk();
  const receiveItemsPk = await refreshReceiveGoodsItemsPk();
  const deliveryPk = await refreshDeliveryChallanPk();
  const deliveryFk = await refreshDeliveryChallanItemsFk();

  let receiptItems = [];

  if (safeReceiveGoodsIds.length) {
    const receiptItemsReq = new sql.Request(tx);
    const receiptIdsClause = buildPurchaseOrderItemInClause(
      receiptItemsReq,
      safeReceiveGoodsIds,
      "ReceiveGoodsId"
    );
    const receiptItemsResult = await receiptItemsReq.query(`
      SELECT *
      FROM dbo.ReceiveGoodsItems
      WHERE ReceiveGoodsId IN (${receiptIdsClause})
    `);
    receiptItems = (receiptItemsResult.recordset ?? []).map(normalizeReceiveGoodsItem);
  } else if (requestedReceiveGoodsItemIds.length) {
    receiptItems = await loadReceiveGoodsItemsForConsumption(tx, {
      receiveGoodsId: safeReceiveGoodsId,
      receiveGoodsIds: safeReceiveGoodsIds,
      receiveGoodsItemIds: requestedReceiveGoodsItemIds,
    });
  } else if (safeReceiveGoodsId !== null) {
    const receiptItemsResult = await new sql.Request(tx)
      .input("ReceiveGoodsId", sql.Int, safeReceiveGoodsId)
      .query(`
        SELECT *
        FROM dbo.ReceiveGoodsItems
        WHERE ReceiveGoodsId = @ReceiveGoodsId
      `);
    receiptItems = (receiptItemsResult.recordset ?? []).map(normalizeReceiveGoodsItem);
  }

  if (!receiptItems.length) {
    const error = new Error(
      "A receive receipt is required to validate the delivery challan items."
    );
    error.statusCode = 400;
    throw error;
  }

  const receiptItemIdSet = new Set(
    receiptItems
      .map((item) => toNullableInt(item.id ?? item.receiveGoodsItemId))
      .filter((id) => id !== null)
  );
  if (
    safeReceiveGoodsIds.length &&
    requestedReceiveGoodsItemIds.some((id) => !receiptItemIdSet.has(id))
  ) {
    const error = new Error(
      "The selected receive receipt references do not match the linked receipt items."
    );
    error.statusCode = 400;
    throw error;
  }

  const effectiveReceiveGoodsIds = uniqueReceiveGoodsIds(
    receiptItems.map((item) => toNullableInt(item.receiveGoodsId))
  );
  if (!effectiveReceiveGoodsIds.length) {
    const error = new Error(
      "The selected receipt items are missing the linked receive receipt reference."
    );
    error.statusCode = 400;
    throw error;
  }

  if (
    safeReceiveGoodsIds.length &&
    effectiveReceiveGoodsIds.some((id) => !safeReceiveGoodsIds.includes(id))
  ) {
    const error = new Error(
      "The selected receipt items must belong to the selected receive receipts."
    );
    error.statusCode = 400;
    throw error;
  }

  const receiptHeaderReq = new sql.Request(tx);
  const receiptIdsClause = buildPurchaseOrderItemInClause(
    receiptHeaderReq,
    effectiveReceiveGoodsIds,
    "ReceiveGoodsId"
  );
  const receiptHeaderResult = await receiptHeaderReq.query(`
    SELECT *
    FROM dbo.ReceiveGoods
    WHERE ${toIdentifier(receivePk)} IN (${receiptIdsClause})
  `);
  const receiptHeaders = receiptHeaderResult.recordset ?? [];
  if (receiptHeaders.length !== effectiveReceiveGoodsIds.length) {
    const error = new Error("Receive receipt not found.");
    error.statusCode = 400;
    throw error;
  }

  const safeProjectId = toNullableInt(projectId);
  if (
    safeProjectId &&
    receiptHeaders.some((receiptHeader) => {
      const receiptProjectId = toNullableInt(
        receiptHeader.ProjectId ?? receiptHeader.projectId
      );
      return receiptProjectId !== null && receiptProjectId !== safeProjectId;
    })
  ) {
    const error = new Error("Selected receipt does not belong to the chosen project");
    error.statusCode = 400;
    throw error;
  }

  const receiptGroups = new Map();
  const receiveGoodsItemIdToMaterialKey = new Map();
  const purchaseOrderItemIdToMaterialKey = new Map();
  const itemIdToMaterialKey = new Map();

  receiptItems.forEach((item) => {
    const materialKey = buildInventoryMaterialKey(item);
    if (!materialKey) {
      return;
    }

    if (!receiptGroups.has(materialKey)) {
      receiptGroups.set(materialKey, {
        materialKey,
        name: item.name ?? "Item",
        unit: item.unit ?? "PCS",
        receivedQty: 0,
      });
    }

    receiptGroups.get(materialKey).receivedQty +=
      Number(item.receivedQty ?? item.ReceivedQty ?? 0) || 0;

    const receiveGoodsItemId = toNullableInt(item.id ?? item.receiveGoodsItemId);
    if (receiveGoodsItemId !== null) {
      receiveGoodsItemIdToMaterialKey.set(receiveGoodsItemId, materialKey);
    }

    const purchaseOrderItemId = toNullableInt(
      item.poItemId ?? item.POItemId ?? item.purchaseOrderItemId ?? item.PurchaseOrderItemId
    );
    if (
      purchaseOrderItemId !== null &&
      !purchaseOrderItemIdToMaterialKey.has(purchaseOrderItemId)
    ) {
      purchaseOrderItemIdToMaterialKey.set(purchaseOrderItemId, materialKey);
    }

    const itemId = toNullableInt(item.itemId ?? item.ItemId);
    if (itemId !== null && itemId > 0 && !itemIdToMaterialKey.has(itemId)) {
      itemIdToMaterialKey.set(itemId, materialKey);
    }
  });

  const resolveReceiptMaterialKey = (item = {}) => {
    const receiveGoodsItemId = toNullableInt(
      item.receiveGoodsItemId ?? item.ReceiveGoodsItemId
    );
    if (
      receiveGoodsItemId !== null &&
      receiveGoodsItemIdToMaterialKey.has(receiveGoodsItemId)
    ) {
      return receiveGoodsItemIdToMaterialKey.get(receiveGoodsItemId);
    }

    const purchaseOrderItemId = toNullableInt(
      item.poItemId ?? item.POItemId ?? item.purchaseOrderItemId ?? item.PurchaseOrderItemId
    );
    if (
      purchaseOrderItemId !== null &&
      purchaseOrderItemIdToMaterialKey.has(purchaseOrderItemId)
    ) {
      return purchaseOrderItemIdToMaterialKey.get(purchaseOrderItemId);
    }

    const itemId = toNullableInt(item.itemId ?? item.ItemId);
    if (itemId !== null && itemId > 0 && itemIdToMaterialKey.has(itemId)) {
      return itemIdToMaterialKey.get(itemId);
    }

    const materialKey = buildInventoryMaterialKey(item);
    return materialKey && receiptGroups.has(materialKey) ? materialKey : null;
  };

  const deliveredItemsRequest = new sql.Request(tx);
  const deliveredReceiptIdsClause = buildPurchaseOrderItemInClause(
    deliveredItemsRequest,
    effectiveReceiveGoodsIds,
    "ReceiveGoodsId"
  );
  const deliveredItemsResult = await deliveredItemsRequest
    .input("DeliveryChallanId", sql.BigInt, safeDeliveryChallanId)
    .query(`
      SELECT dci.*
      FROM dbo.DeliveryChallanItems dci
      INNER JOIN dbo.DeliveryChallan dc
        ON dc.${toIdentifier(deliveryPk)} = dci.${toIdentifier(deliveryFk)}
      LEFT JOIN dbo.ReceiveGoodsItems rgi
        ON rgi.${toIdentifier(receiveItemsPk)} = dci.ReceiveGoodsItemId
      WHERE (
          rgi.ReceiveGoodsId IN (${deliveredReceiptIdsClause})
          OR (
            dci.ReceiveGoodsItemId IS NULL
            AND dc.ReceiveGoodsId IN (${deliveredReceiptIdsClause})
          )
        )
        AND (
          @DeliveryChallanId IS NULL
          OR dc.${toIdentifier(deliveryPk)} <> @DeliveryChallanId
        )
    `);

  const deliveredByMaterialKey = new Map();
  (deliveredItemsResult.recordset ?? []).forEach((row) => {
    const materialKey = resolveReceiptMaterialKey({
      receiveGoodsItemId: row.ReceiveGoodsItemId ?? row.receiveGoodsItemId ?? null,
      itemId: row.ItemId ?? row.itemId ?? null,
      name: row.ItemName ?? row.itemName ?? row.name ?? "",
      unit: row.Unit ?? row.unit ?? "PCS",
    });
    if (!materialKey) {
      // Historical/manual lines without a resolvable receipt mapping should not
      // block creating new challans from the same receipt.
      return;
    }

    deliveredByMaterialKey.set(
      materialKey,
      (deliveredByMaterialKey.get(materialKey) ?? 0) +
        (Number(row.Quantity ?? row.quantity ?? 0) || 0)
    );
  });

  const requestedByMaterialKey = new Map();
  requestedItems.forEach((item) => {
    const materialKey = resolveReceiptMaterialKey(item);
    if (!materialKey) {
      const error = new Error(
        `${item.name || "This material"} must be loaded from the selected receive receipt.`
      );
      error.statusCode = 400;
      throw error;
    }

    requestedByMaterialKey.set(
      materialKey,
      (requestedByMaterialKey.get(materialKey) ?? 0) +
        (Number(item.quantity ?? item.Quantity ?? 0) || 0)
    );
  });

  requestedByMaterialKey.forEach((requestedQty, materialKey) => {
    const group = receiptGroups.get(materialKey);
    const alreadyDelivered = deliveredByMaterialKey.get(materialKey) ?? 0;
    const availableQty = Math.max((group?.receivedQty ?? 0) - alreadyDelivered, 0);

    if (requestedQty > availableQty) {
      const error = new Error(
        `Quantity for ${group?.name || "the selected material"} cannot be greater than the available received quantity (${availableQty}).`
      );
      error.statusCode = 400;
      throw error;
    }
  });

  return effectiveReceiveGoodsIds[0] ?? null;
};

const resolvePrimaryReceiveGoodsIdForDeliveryChallan = async (
  tx,
  { receiveGoodsId = null, receiveGoodsIds = [], items = [] } = {}
) => {
  const directIds = uniqueReceiveGoodsIdsFromSelections([
    ...(Array.isArray(receiveGoodsIds) ? receiveGoodsIds : []),
    resolveReceiveGoodsSelectionId(receiveGoodsId),
  ]);
  if (directIds.length) {
    return directIds[0];
  }

  const receiveGoodsItemIds = uniqueReceiveGoodsItemIds(
    (Array.isArray(items) ? items : []).map((item) =>
      toNullableInt(item.receiveGoodsItemId ?? item.ReceiveGoodsItemId)
    )
  );
  if (!receiveGoodsItemIds.length) {
    return null;
  }

  await ensureReceiveTables();
  const receiveItemsPk = await refreshReceiveGoodsItemsPk();
  const request = new sql.Request(tx);
  const inClause = buildPurchaseOrderItemInClause(
    request,
    receiveGoodsItemIds,
    "ReceiveGoodsItemId"
  );
  const result = await request.query(`
    SELECT TOP 1 ReceiveGoodsId
    FROM dbo.ReceiveGoodsItems
    WHERE ${toIdentifier(receiveItemsPk)} IN (${inClause})
      AND ReceiveGoodsId IS NOT NULL
    ORDER BY ReceiveGoodsId ASC
  `);

  return toNullableInt(result.recordset?.[0]?.ReceiveGoodsId);
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
          ReceiveGoodsItemId INT NULL,
          DeliveryChallanId INT NULL,
          DeliveryChallanItemId BIGINT NULL,
          SourceType NVARCHAR(50) NULL,
          SourceKey NVARCHAR(200) NULL,
          SourceRef NVARCHAR(255) NULL,
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
      IF COL_LENGTH('dbo.ReallocateInventoryItems', 'ReceiveGoodsItemId') IS NULL
      BEGIN
        ALTER TABLE dbo.ReallocateInventoryItems ADD ReceiveGoodsItemId INT NULL;
      END;
      IF COL_LENGTH('dbo.ReallocateInventoryItems', 'DeliveryChallanId') IS NULL
      BEGIN
        ALTER TABLE dbo.ReallocateInventoryItems ADD DeliveryChallanId INT NULL;
      END;
      IF COL_LENGTH('dbo.ReallocateInventoryItems', 'DeliveryChallanItemId') IS NULL
      BEGIN
        ALTER TABLE dbo.ReallocateInventoryItems ADD DeliveryChallanItemId BIGINT NULL;
      END;
      IF COL_LENGTH('dbo.ReallocateInventoryItems', 'SourceType') IS NULL
      BEGIN
        ALTER TABLE dbo.ReallocateInventoryItems ADD SourceType NVARCHAR(50) NULL;
      END;
      IF COL_LENGTH('dbo.ReallocateInventoryItems', 'SourceKey') IS NULL
      BEGIN
        ALTER TABLE dbo.ReallocateInventoryItems ADD SourceKey NVARCHAR(200) NULL;
      END;
      IF COL_LENGTH('dbo.ReallocateInventoryItems', 'SourceRef') IS NULL
      BEGIN
        ALTER TABLE dbo.ReallocateInventoryItems ADD SourceRef NVARCHAR(255) NULL;
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

const normalizeAvailabilitySourceType = (value = "") => {
  const normalized = normalizeInventoryKeyValue(value);
  if (["dc", "delivery", "delivery-challan", "delivery challan"].includes(normalized)) {
    return "dc";
  }
  if (["receive", "receipt", "receive-goods", "receive goods"].includes(normalized)) {
    return "receive";
  }
  if (["reallocate", "reallocation"].includes(normalized)) {
    return "reallocation";
  }
  return normalized;
};

const buildAvailabilitySourceKey = (item = {}) => {
  const explicit = normalizeOptionalString(item.sourceKey ?? item.SourceKey);
  if (explicit) {
    return explicit;
  }

  const sourceType = normalizeAvailabilitySourceType(
    item.sourceType ?? item.SourceType
  );
  const deliveryChallanId = toNullableInt(
    item.deliveryChallanId ??
      item.DeliveryChallanId ??
      item.deliveryChallanID ??
      item.ChallanId
  );
  const receiveGoodsItemId = toNullableInt(
    item.receiveGoodsItemId ?? item.ReceiveGoodsItemId ?? item.ReceiveItemId
  );
  const deliveryChallanItemId = toNullableInt(
    item.deliveryChallanItemId ??
      item.DeliveryChallanItemId ??
      item.deliveryChallanLineItemId ??
      item.DeliveryChallanLineItemId
  );
  const consumptionId = toNullableInt(
    item.consumptionId ?? item.ConsumptionId ?? item.ConsumptionID
  );
  const itemId = toNullableInt(item.itemId ?? item.ItemId);
  const materialKey = buildInventoryMaterialKey(item);

  if (sourceType === "dc" || deliveryChallanId !== null) {
    const identity =
      deliveryChallanItemId ?? receiveGoodsItemId ?? itemId ?? materialKey;
    return identity ? `dc:${deliveryChallanId ?? "unknown"}:${identity}` : "";
  }

  if (sourceType === "receive" || receiveGoodsItemId !== null) {
    return receiveGoodsItemId !== null ? `receive:${receiveGoodsItemId}` : "";
  }

  if (sourceType === "reallocation") {
    const id = item.id ?? item.Id ?? item.transferId ?? item.TransferId ?? materialKey;
    return id ? `reallocation:${id}` : "";
  }

  if (sourceType === "consumption") {
    const identity =
      item.id ??
      item.Id ??
      deliveryChallanItemId ??
      receiveGoodsItemId ??
      deliveryChallanId ??
      itemId ??
      materialKey;
    return identity ? `consumption:${consumptionId ?? "unknown"}:${identity}` : "";
  }

  return "";
};

const buildReallocationAvailabilitySourceKey = ({
  transferId = null,
  item = {},
} = {}) => {
  const safeTransferId = toNullableInt(transferId);
  const itemId = toNullableInt(item.id ?? item.Id);
  const deliveryChallanItemId = toNullableInt(
    item.deliveryChallanItemId ??
      item.DeliveryChallanItemId ??
      item.deliveryChallanLineItemId ??
      item.DeliveryChallanLineItemId
  );
  const receiveGoodsItemId = toNullableInt(
    item.receiveGoodsItemId ?? item.ReceiveGoodsItemId ?? item.ReceiveItemId
  );
  const sourceKey = normalizeOptionalString(item.sourceKey ?? item.SourceKey);
  const materialKey = buildInventoryMaterialKey(item);
  const identity =
    itemId ?? deliveryChallanItemId ?? receiveGoodsItemId ?? sourceKey ?? materialKey;

  return safeTransferId !== null && identity
    ? `reallocation:${safeTransferId}:${identity}`
    : "";
};

const isInactiveAvailabilityMovementStatus = (status = "") =>
  ["cancelled", "canceled", "rejected", "void"].includes(
    normalizeInventoryKeyValue(status)
  );

const isConsumptionLinkedReallocation = (transfer = {}) =>
  normalizeInventoryKeyValue(transfer.referenceType) === "consumption" ||
  toNullableInt(transfer.consumptionId) !== null;

const toAvailabilityQuantity = (value) => Math.max(Number(value ?? 0) || 0, 0);

const findNegativeQuantityInput = (items = [], fieldNames = []) => {
  const normalizedItems = Array.isArray(items) ? items : [];
  for (const item of normalizedItems) {
    const matchedField = fieldNames.find(
      (fieldName) => item?.[fieldName] !== undefined && item?.[fieldName] !== null
    );
    if (!matchedField) {
      continue;
    }
    const quantity = Number(item?.[matchedField]);
    if (Number.isFinite(quantity) && quantity < 0) {
      return item;
    }
  }
  return null;
};

const loadAvailableInventoryRows = async (
  db,
  {
    projectId = null,
    locationId = null,
    excludeDeliveryChallanId = null,
    excludeConsumptionId = null,
    excludeReallocateInventoryId = null,
    includeConsumptionLeftover = false,
    includeZero = false,
  } = {}
) => {
  const safeLocationId = toNullableInt(locationId);
  if (!safeLocationId) {
    const error = new Error("locationId is required");
    error.statusCode = 400;
    throw error;
  }

  await ensureLocationsTable();
  const resolvedLocationResult = await new sql.Request(db)
    .input("LocationId", sql.Int, safeLocationId)
    .query(`
      SELECT TOP 1 *
      FROM dbo.Locations
      WHERE LocationId = @LocationId
    `);
  const resolvedLocation = normalizeLocation(
    resolvedLocationResult.recordset?.[0] ?? {}
  );
  if (!resolvedLocation?.id) {
    const error = new Error("Source location not found");
    error.statusCode = 400;
    throw error;
  }

  const safeProjectId = toNullableInt(projectId);

  await ensureReceiveTables();
  await ensureDeliveryChallanTables();
  await ensureConsumptionTables();
  await ensureReallocateInventoryTables();

  const receivePk = await refreshReceiveGoodsPk();
  const receiveItemsFk = await refreshReceiveGoodsItemsFk();
  const deliveryPk = await refreshDeliveryChallanPk();
  const deliveryFk = await refreshDeliveryChallanItemsFk();
  const consumptionPk = await refreshConsumptionPk();
  const consumptionFk = await refreshConsumptionItemsFk();
  const reallocatePk = await refreshReallocateInventoryPk();
  const reallocateFk = await refreshReallocateInventoryItemsFk();

  const buildConsumptionLeftoverSourceKey = (item = {}) => {
    const baseSourceKey = normalizeOptionalString(item.sourceKey ?? item.SourceKey);
    if (baseSourceKey) {
      return `consumption:${baseSourceKey}`;
    }

    const deliveryChallanId = toNullableInt(
      item.deliveryChallanId ?? item.DeliveryChallanId ?? item.ChallanId
    );
    const deliveryChallanItemId = toNullableInt(
      item.deliveryChallanItemId ??
        item.DeliveryChallanItemId ??
        item.deliveryChallanLineItemId ??
        item.DeliveryChallanLineItemId
    );
    const receiveGoodsItemId = toNullableInt(
      item.receiveGoodsItemId ?? item.ReceiveGoodsItemId ?? item.ReceiveItemId
    );
    const itemId = toNullableInt(item.itemId ?? item.ItemId);
    const materialKey = buildInventoryMaterialKey(item);
    const identity =
      deliveryChallanItemId ??
      receiveGoodsItemId ??
      itemId ??
      materialKey;

    if (deliveryChallanId !== null && identity) {
      return `consumption:dc:${deliveryChallanId}:${identity}`;
    }
    if (receiveGoodsItemId !== null) {
      return `consumption:receive:${receiveGoodsItemId}`;
    }
    return identity ? `consumption:material:${identity}` : "";
  };

  const sourceEntries = new Map();
  const materialIndex = new Map();
  const makeEntryMapKey = (entry) =>
    `${entry.projectId ?? ""}|${entry.locationId}|${entry.sourceKey}`;
  const makeMaterialIndexKey = (entry) =>
    `${entry.projectId ?? ""}|${entry.locationId}|${entry.materialKey}`;
  const findSourceEntryByLocationAndSourceKey = (sourceKey) => {
    const normalizedSourceKey = normalizeOptionalString(sourceKey);
    if (!normalizedSourceKey) {
      return null;
    }
    const matches = Array.from(sourceEntries.values()).filter(
      (entry) =>
        entry.locationId === safeLocationId &&
        normalizeOptionalString(entry.sourceKey) === normalizedSourceKey
    );
    return matches.length === 1 ? matches[0] : null;
  };
  const getMaterialCandidatesAtLocation = (materialKey) =>
    Array.from(sourceEntries.values()).filter(
      (entry) => entry.locationId === safeLocationId && entry.materialKey === materialKey
    );

  const indexEntry = (entry) => {
    const indexKey = makeMaterialIndexKey(entry);
    if (!materialIndex.has(indexKey)) {
      materialIndex.set(indexKey, []);
    }
      materialIndex.get(indexKey).push(entry);
  };

  const addSourceEntry = (rawEntry, quantity) => {
    const sourceQty = toAvailabilityQuantity(quantity);
    if (!sourceQty) {
      return null;
    }

    const materialKey = buildInventoryMaterialKey(rawEntry);
    const sourceKey = buildAvailabilitySourceKey(rawEntry);
    const entryProjectId = toNullableInt(rawEntry.projectId) ?? safeProjectId;
    const entryLocationId = toNullableInt(rawEntry.locationId) ?? safeLocationId;
    if (!materialKey || !sourceKey || entryLocationId !== safeLocationId) {
      return null;
    }

    const entry = {
      projectId: entryProjectId,
      locationId: entryLocationId,
      sourceType: normalizeAvailabilitySourceType(rawEntry.sourceType) || "receive",
      sourceKey,
      sourceRowId:
        normalizeOptionalString(rawEntry.sourceRowId ?? rawEntry.SourceRowId) ?? sourceKey,
      receiveGoodsId: toNullableInt(rawEntry.receiveGoodsId),
      receiptItemId:
        toNullableInt(
          rawEntry.receiptItemId ??
            rawEntry.ReceiptItemId ??
            rawEntry.receiveGoodsItemId ??
            rawEntry.ReceiveGoodsItemId
        ) ?? null,
      receiveGoodsItemId: toNullableInt(rawEntry.receiveGoodsItemId),
      deliveryChallanId: toNullableInt(rawEntry.deliveryChallanId),
      deliveryChallanItemId: toNullableInt(rawEntry.deliveryChallanItemId),
      itemId: toNullableInt(rawEntry.itemId),
      name: normalizeOptionalString(rawEntry.name ?? rawEntry.item) ?? "Item",
      description: normalizeOptionalString(rawEntry.description) ?? "",
      unit: normalizeOptionalString(rawEntry.unit) ?? "PCS",
      hsn: normalizeOptionalString(rawEntry.hsn) ?? "",
      gst: normalizeOptionalString(rawEntry.gst) ?? "",
      rate: Number(rawEntry.rate ?? rawEntry.unitPrice ?? 0) || 0,
      sourceRef: normalizeOptionalString(rawEntry.sourceRef) ?? "",
      sourceDate: rawEntry.sourceDate ?? null,
      materialKey,
      sourceQty: 0,
      consumedQty: 0,
      reallocatedQty: 0,
    };

    const mapKey = makeEntryMapKey(entry);
    const existing = sourceEntries.get(mapKey);
    if (existing) {
      existing.sourceQty += sourceQty;
      return existing;
    }

    entry.sourceQty = sourceQty;
    sourceEntries.set(mapKey, entry);
    indexEntry(entry);
    return entry;
  };

  const getAvailableBeforeMovement = (entry) =>
    Math.max(entry.sourceQty - entry.consumedQty - entry.reallocatedQty, 0);

  const applyMovementQuantity = ({
    projectId: movementProjectId = safeProjectId,
    locationId: movementLocationId = safeLocationId,
    item = {},
    quantity,
    field,
    fallbackDeliveryChallanId = null,
  }) => {
    const safeMovementLocationId = toNullableInt(movementLocationId);
    const movementQty = toAvailabilityQuantity(quantity);
    if (safeMovementLocationId !== safeLocationId || !movementQty) {
      return;
    }

    const explicitSourceKey = buildAvailabilitySourceKey({
      ...item,
      deliveryChallanId:
        item.deliveryChallanId ??
        item.DeliveryChallanId ??
        fallbackDeliveryChallanId,
    });
    if (explicitSourceKey) {
      const exact =
        sourceEntries.get(
          `${toNullableInt(movementProjectId) ?? safeProjectId ?? ""}|${safeLocationId}|${explicitSourceKey}`
        ) ?? findSourceEntryByLocationAndSourceKey(explicitSourceKey);
      if (exact) {
        exact[field] += movementQty;
        return;
      }
    }

    const receiveGoodsItemId = toNullableInt(
      item.receiveGoodsItemId ?? item.ReceiveGoodsItemId ?? item.ReceiveItemId
    );
    const deliveryChallanId = toNullableInt(
      item.deliveryChallanId ??
        item.DeliveryChallanId ??
        fallbackDeliveryChallanId
    );
    const materialKey = buildInventoryMaterialKey(item);
    let candidates = [];

    if (materialKey) {
      candidates =
        materialIndex.get(
          `${toNullableInt(movementProjectId) ?? safeProjectId ?? ""}|${safeLocationId}|${materialKey}`
        ) ?? [];
      if (!candidates.length) {
        candidates = getMaterialCandidatesAtLocation(materialKey);
      }
    }

    if (deliveryChallanId !== null) {
      const dcCandidates = candidates.filter(
        (entry) =>
          entry.sourceType === "dc" &&
          entry.deliveryChallanId === deliveryChallanId &&
          (receiveGoodsItemId === null ||
            entry.receiveGoodsItemId === receiveGoodsItemId)
      );
      if (dcCandidates.length) {
        candidates = dcCandidates;
      }
    } else if (receiveGoodsItemId !== null) {
      const receiveCandidates = candidates.filter(
        (entry) =>
          entry.sourceType === "receive" &&
          entry.receiveGoodsItemId === receiveGoodsItemId
      );
      if (receiveCandidates.length) {
        candidates = receiveCandidates;
      }
    }

    if (!candidates.length) {
      return;
    }

    let remaining = movementQty;
    candidates.forEach((entry, index) => {
      if (remaining <= 0) {
        return;
      }
      const available = getAvailableBeforeMovement(entry);
      const shouldForceLast = index === candidates.length - 1;
      const applied = Math.min(
        remaining,
        available > 0 ? available : shouldForceLast ? remaining : 0
      );
      if (applied > 0) {
        entry[field] += applied;
        remaining -= applied;
      }
    });
  };

  const receiveRequest = new sql.Request(db);
  receiveRequest.input("LocationId", sql.Int, safeLocationId);
  const receiveItemsResult = await receiveRequest.query(`
    SELECT
      rgi.*,
      rg.${toIdentifier(receivePk)} AS HeaderReceiveGoodsId,
      rg.ProjectId AS HeaderProjectId,
      rg.LocationId AS HeaderLocationId,
      rg.ReceivedDate AS HeaderDate,
      rg.InvoiceNumber AS HeaderInvoiceNumber
    FROM dbo.ReceiveGoods rg
    INNER JOIN dbo.ReceiveGoodsItems rgi
      ON rgi.${toIdentifier(receiveItemsFk)} = rg.${toIdentifier(receivePk)}
    WHERE rg.LocationId = @LocationId
  `);

  (receiveItemsResult.recordset ?? []).forEach((row) => {
    const item = normalizeReceiveGoodsItem(row);
    addSourceEntry(
      {
        sourceType: "receive",
        sourceKey: `receive:${item.id}`,
        projectId: row.HeaderProjectId,
        locationId: row.HeaderLocationId,
        receiveGoodsId: row.HeaderReceiveGoodsId ?? item.receiveGoodsId,
        receiveGoodsItemId: item.id,
        itemId: item.itemId,
        name: item.name,
        description: item.description,
        unit: item.unit,
        hsn: item.hsn,
        gst: item.gst,
        rate: item.unitPrice,
        sourceRef: row.HeaderInvoiceNumber
          ? `Receipt ${row.HeaderReceiveGoodsId} | INV ${row.HeaderInvoiceNumber}`
          : `Receipt ${row.HeaderReceiveGoodsId}`,
        sourceDate: row.HeaderDate,
      },
      item.receivedQty
    );
  });

  const dcSourceRequest = new sql.Request(db);
  dcSourceRequest.input("LocationId", sql.Int, safeLocationId);
  const dcItemsAtLocationResult = await dcSourceRequest.query(`
    SELECT
      dci.*,
      dci.Id AS DeliveryChallanItemId,
      dc.${toIdentifier(deliveryPk)} AS HeaderDeliveryChallanId,
      dc.ProjectId AS HeaderProjectId,
      dc.ToLocationId AS HeaderLocationId,
      dc.DCNumber AS HeaderDcNumber,
      dc.IssueDate AS HeaderDate
    FROM dbo.DeliveryChallan dc
    INNER JOIN dbo.DeliveryChallanItems dci
      ON dci.${toIdentifier(deliveryFk)} = dc.${toIdentifier(deliveryPk)}
    WHERE dc.ToLocationId = @LocationId
  `);

  (dcItemsAtLocationResult.recordset ?? []).forEach((row) => {
    const item = normalizeDeliveryChallanItem(row);
    addSourceEntry(
      {
        sourceType: "dc",
        projectId: row.HeaderProjectId,
        locationId: row.HeaderLocationId,
        deliveryChallanId: row.HeaderDeliveryChallanId,
        deliveryChallanItemId: row.DeliveryChallanItemId ?? item.id,
        receiveGoodsItemId: item.receiveGoodsItemId,
        itemId: item.itemId,
        name: item.name,
        description: item.description,
        unit: item.unit,
        hsn: item.hsn,
        gst: item.gst,
        rate: item.rate,
        sourceRef: row.HeaderDcNumber || `DC ${row.HeaderDeliveryChallanId}`,
        sourceDate: row.HeaderDate,
      },
      item.quantity
    );
  });

  const outgoingDcRequest = new sql.Request(db);
  outgoingDcRequest.input("LocationId", sql.Int, safeLocationId);
  outgoingDcRequest.input(
    "ExcludeDeliveryChallanId",
    sql.BigInt,
    toNullableInt(excludeDeliveryChallanId)
  );
  const outgoingDcItemsResult = await outgoingDcRequest.query(`
    SELECT
      dci.*,
      dc.ProjectId AS HeaderProjectId,
      dc.FromLocationId AS HeaderLocationId
    FROM dbo.DeliveryChallan dc
    INNER JOIN dbo.DeliveryChallanItems dci
      ON dci.${toIdentifier(deliveryFk)} = dc.${toIdentifier(deliveryPk)}
    WHERE dc.FromLocationId = @LocationId
      AND (
        @ExcludeDeliveryChallanId IS NULL
        OR dc.${toIdentifier(deliveryPk)} <> @ExcludeDeliveryChallanId
      )
  `);

  (outgoingDcItemsResult.recordset ?? []).forEach((row) => {
    const item = normalizeDeliveryChallanItem(row);
    const sourceType =
      normalizeAvailabilitySourceType(item.sourceType) ||
      (item.receiveGoodsItemId ? "receive" : "");
    const sourceKey =
      normalizeOptionalString(item.sourceKey) ||
      (sourceType === "receive" && item.receiveGoodsItemId
        ? `receive:${item.receiveGoodsItemId}`
        : buildAvailabilitySourceKey({
            ...item,
            sourceType,
          }));
    applyMovementQuantity({
      projectId: row.HeaderProjectId,
      locationId: row.HeaderLocationId,
      item: {
        ...item,
        sourceType,
        sourceKey,
      },
      quantity: item.quantity,
      field: "reallocatedQty",
    });
  });

  const reallocateItemsResult = await new sql.Request(db).query(`
    SELECT
      rii.*,
      ri.${toIdentifier(reallocatePk)} AS HeaderTransferId,
      ri.FromLocationId AS HeaderFromLocationId,
      ri.ToLocationId AS HeaderToLocationId,
      ri.TransferDate AS HeaderTransferDate,
      ri.Notes AS HeaderNotes
    FROM dbo.ReallocateInventory ri
    INNER JOIN dbo.ReallocateInventoryItems rii
      ON rii.${toIdentifier(reallocateFk)} = ri.${toIdentifier(reallocatePk)}
  `);

  (reallocateItemsResult.recordset ?? []).forEach((row) => {
    const transfer = normalizeReallocateInventory({
      Id: row.HeaderTransferId,
      FromLocationId: row.HeaderFromLocationId,
      ToLocationId: row.HeaderToLocationId,
      TransferDate: row.HeaderTransferDate,
      Notes: row.HeaderNotes,
    });
    const targetProjectId = toNullableInt(transfer.projectId);
    const transferId = toNullableInt(transfer.id);
    if (
      toNullableInt(excludeReallocateInventoryId) !== null &&
      transferId === toNullableInt(excludeReallocateInventoryId)
    ) {
      return;
    }
    if (
      isInactiveAvailabilityMovementStatus(transfer.status) ||
      isConsumptionLinkedReallocation(transfer)
    ) {
      return;
    }
    if (
      transfer.type !== "Reallocate" ||
      toNullableInt(transfer.toLocationId) !== safeLocationId
    ) {
      return;
    }

    const item = normalizeReallocateInventoryItem(row);
    const itemQty = toAvailabilityQuantity(item.quantity);
    if (!itemQty) {
      return;
    }
    const sourceKey =
      buildReallocationAvailabilitySourceKey({ transferId, item }) ||
      `reallocation:${transferId ?? "record"}:${item.id ?? buildInventoryMaterialKey(item)}`;
    addSourceEntry(
      {
        ...item,
        sourceType: "reallocation",
        sourceKey,
        projectId: targetProjectId ?? safeProjectId,
        locationId: transfer.toLocationId,
        sourceRef: transfer.referenceNumber,
        sourceDate: transfer.transferDate ?? transfer.requestDate,
      },
      itemQty
    );
  });

  const consumptionRequest = new sql.Request(db);
  consumptionRequest.input("LocationId", sql.Int, safeLocationId);
  consumptionRequest.input("ExcludeConsumptionId", sql.Int, toNullableInt(excludeConsumptionId));
  const consumptionItemsResult = await consumptionRequest.query(`
    SELECT
      ci.*,
      c.${toIdentifier(consumptionPk)} AS HeaderConsumptionId,
      c.ProjectId AS HeaderProjectId,
      c.FromLocationId AS HeaderFromLocationId,
      c.LocationId AS HeaderLocationId,
      c.DeliveryChallanId AS HeaderDeliveryChallanId,
      c.DeliveryChallanRef AS HeaderDeliveryChallanRef
    FROM dbo.Consumption c
    INNER JOIN dbo.ConsumptionItems ci
      ON ci.${toIdentifier(consumptionFk)} = c.${toIdentifier(consumptionPk)}
    WHERE (c.LocationId = @LocationId OR c.FromLocationId = @LocationId)
      AND (
        @ExcludeConsumptionId IS NULL
        OR c.${toIdentifier(consumptionPk)} <> @ExcludeConsumptionId
      )
  `);

  (consumptionItemsResult.recordset ?? []).forEach((row) => {
    const item = normalizeConsumptionItem(row);
    applyMovementQuantity({
      projectId: row.HeaderProjectId,
      locationId: row.HeaderFromLocationId ?? row.HeaderLocationId,
      item,
      quantity: item.quantity,
      field: "consumedQty",
      fallbackDeliveryChallanId: row.HeaderDeliveryChallanId,
    });
  });

  if (includeConsumptionLeftover) {
    const addedConsumptionLeftoverKeys = new Set();
    (consumptionItemsResult.recordset ?? []).forEach((row) => {
      const item = normalizeConsumptionItem(row);
      const consumedQty = toAvailabilityQuantity(item.quantity);
      if (!consumedQty) {
        return;
      }
      const originalSourceKey =
        normalizeOptionalString(item.sourceKey ?? item.SourceKey) ??
        buildAvailabilitySourceKey({
          ...item,
          deliveryChallanId:
            item.deliveryChallanId ??
            item.DeliveryChallanId ??
            row.HeaderDeliveryChallanId,
          sourceType:
            normalizeAvailabilitySourceType(item.sourceType ?? item.SourceType) || "dc",
        });
      if (!originalSourceKey) {
        return;
      }

      const originalSourceEntry =
        sourceEntries.get(
          `${toNullableInt(row.HeaderProjectId) ?? safeProjectId ?? ""}|${safeLocationId}|${originalSourceKey}`
        ) ?? findSourceEntryByLocationAndSourceKey(originalSourceKey);
      if (!originalSourceEntry) {
        return;
      }

      const remainingQty = Math.max(
        originalSourceEntry.sourceQty -
          originalSourceEntry.consumedQty -
          originalSourceEntry.reallocatedQty,
        0
      );
      if (!includeZero && remainingQty <= 0) {
        return;
      }

      const leftoverSourceKey = buildConsumptionLeftoverSourceKey({
        ...item,
        sourceKey: originalSourceKey,
      });
      if (!leftoverSourceKey || addedConsumptionLeftoverKeys.has(leftoverSourceKey)) {
        return;
      }
      addedConsumptionLeftoverKeys.add(leftoverSourceKey);

      const leftoverEntry = addSourceEntry(
        {
          ...item,
          consumptionId: row.HeaderConsumptionId ?? item.consumptionId,
          sourceType: "consumption",
          sourceKey: leftoverSourceKey,
          sourceRowId: leftoverSourceKey,
          projectId: row.HeaderProjectId,
          locationId: row.HeaderFromLocationId ?? row.HeaderLocationId,
          deliveryChallanId:
            item.deliveryChallanId ??
            item.DeliveryChallanId ??
            row.HeaderDeliveryChallanId,
          sourceRef:
            normalizeOptionalString(
              row.HeaderDeliveryChallanRef ??
                row.SourceRef ??
                item.sourceRef ??
                item.deliveryChallanRef
            ) ??
            normalizeOptionalString(originalSourceEntry.sourceRef) ??
            `Consumption ${row.HeaderConsumptionId ?? item.consumptionId ?? ""}`.trim(),
        },
        originalSourceEntry.sourceQty
      );
      if (leftoverEntry) {
        leftoverEntry.consumedQty = Math.max(
          leftoverEntry.consumedQty,
          originalSourceEntry.consumedQty
        );
        leftoverEntry.reallocatedQty = Math.max(
          leftoverEntry.reallocatedQty,
          originalSourceEntry.reallocatedQty
        );
      }
    });
  }

  (reallocateItemsResult.recordset ?? []).forEach((row) => {
    const transfer = normalizeReallocateInventory({
      Id: row.HeaderTransferId,
      FromLocationId: row.HeaderFromLocationId,
      ToLocationId: row.HeaderToLocationId,
      TransferDate: row.HeaderTransferDate,
      Notes: row.HeaderNotes,
    });
    const sourceProjectId =
      toNullableInt(transfer.sourceProjectId) ?? toNullableInt(transfer.projectId);
    const transferId = toNullableInt(transfer.id);
    if (
      toNullableInt(excludeReallocateInventoryId) !== null &&
      transferId === toNullableInt(excludeReallocateInventoryId)
    ) {
      return;
    }
    if (
      isInactiveAvailabilityMovementStatus(transfer.status) ||
      isConsumptionLinkedReallocation(transfer)
    ) {
      return;
    }

    const item = normalizeReallocateInventoryItem(row);
    const itemQty = toAvailabilityQuantity(item.quantity);
    if (!itemQty) {
      return;
    }

    applyMovementQuantity({
      projectId: sourceProjectId ?? safeProjectId,
      locationId: transfer.fromLocationId,
      item,
      quantity: itemQty,
      field: "reallocatedQty",
    });

  });

  const finalRows = Array.from(sourceEntries.values())
    .map((entry) => {
      const remainingAvailableQty = Math.max(
        entry.sourceQty - entry.consumedQty - entry.reallocatedQty,
        0
      );
      return {
        ...entry,
        adjustedQty: entry.reallocatedQty,
        availableQty: remainingAvailableQty,
        remainingAvailableQty,
      };
    })
    .filter((entry) => includeZero || entry.availableQty > 0)
    .sort((left, right) => {
      const sourceTypeOrder = left.sourceType.localeCompare(right.sourceType);
      if (sourceTypeOrder !== 0) {
        return sourceTypeOrder;
      }
        return String(left.name || "").localeCompare(String(right.name || ""));
      });
  finalRows
    .filter((entry) => normalizeAvailabilitySourceType(entry.sourceType) === "dc")
    .forEach((entry) => {
      console.debug("[available-inventory] DC row balance", {
        requestedProjectId: safeProjectId,
        destinationLocationId: entry.locationId,
        deliveryChallanId: entry.deliveryChallanId,
        deliveryChallanItemId: entry.deliveryChallanItemId,
        dcNumber: entry.sourceRef,
        itemId: entry.itemId,
        itemName: entry.name,
        dcQuantity: entry.sourceQty,
        consumedQuantity: entry.consumedQty,
        transferredQuantity: entry.reallocatedQty,
        adjustedQuantity: entry.adjustedQty,
        availableQuantity: entry.availableQty,
        sourceKey: entry.sourceKey,
      });
    });
  return finalRows;
};

const buildDeliveryChallanDestinationSourceKey = (deliveryChallanId, item = {}) =>
  buildAvailabilitySourceKey({
    sourceType: "dc",
    deliveryChallanId,
    deliveryChallanItemId:
      item.deliveryChallanItemId ??
      item.DeliveryChallanItemId ??
      item.id ??
      item.Id,
  });

const attachPersistedConsumptionBalances = async (db, consumptions = []) => {
  const records = Array.isArray(consumptions) ? consumptions : [];
  const exactDcItemIds = Array.from(
    new Set(
      records
        .flatMap((record) => record.items || [])
        .map((item) =>
          toNullableInt(
            item.deliveryChallanItemId ??
              item.DeliveryChallanItemId ??
              item.deliveryChallanLineItemId ??
              item.DeliveryChallanLineItemId
          )
        )
        .filter((value) => value !== null)
    )
  );
  const exactDcSourceQtyByKey = new Map();
  const consumedAfterByRecordAndSource = new Map();
  const buildExactDcSourceKey = ({
    projectId,
    deliveryChallanId,
    deliveryChallanItemId,
    itemId,
    fromLocationId,
  }) =>
    [
      toNullableInt(projectId) ?? "",
      toNullableInt(deliveryChallanId) ?? "",
      toNullableInt(deliveryChallanItemId) ?? "",
      toNullableInt(itemId) ?? "",
      toNullableInt(fromLocationId) ?? "",
    ].join("|");
  const buildScopedSourceKey = ({ projectId, fromLocationId, sourceKey }) =>
    `${toNullableInt(projectId) ?? ""}|${
      toNullableInt(fromLocationId) ?? ""
    }|${normalizeOptionalString(sourceKey) ?? ""}`;

  const consumptionPk = await refreshConsumptionPk();
  const consumptionFk = await refreshConsumptionItemsFk();
  const historicalRowsResult = await new sql.Request(db).query(`
    SELECT
      ci.*,
      c.${toIdentifier(consumptionPk)} AS HeaderConsumptionId,
      c.ProjectId AS HeaderProjectId,
      COALESCE(c.FromLocationId, c.LocationId) AS HeaderFromLocationId,
      c.LocationId AS HeaderLocationId,
      c.DeliveryChallanId AS HeaderDeliveryChallanId
    FROM dbo.Consumption c
    INNER JOIN dbo.ConsumptionItems ci
      ON ci.${toIdentifier(consumptionFk)} = c.${toIdentifier(consumptionPk)}
    ORDER BY c.${toIdentifier(consumptionPk)} ASC, ci.Id ASC
  `);
  const movementsByConsumptionId = new Map();
  (historicalRowsResult.recordset ?? []).forEach((row) => {
    const consumptionId = toNullableInt(row.HeaderConsumptionId);
    const item = normalizeConsumptionItem(row);
    const sourceKey =
      normalizeOptionalString(item.sourceKey ?? item.SourceKey) ??
      buildAvailabilitySourceKey({
        ...item,
        deliveryChallanId:
          item.deliveryChallanId ?? row.HeaderDeliveryChallanId,
      });
    if (consumptionId === null || !sourceKey) {
      return;
    }
    const scopedSourceKey = buildScopedSourceKey({
      projectId: row.HeaderProjectId,
      fromLocationId: row.HeaderFromLocationId,
      sourceKey,
    });
    if (!movementsByConsumptionId.has(consumptionId)) {
      movementsByConsumptionId.set(consumptionId, new Map());
    }
    const transactionSources = movementsByConsumptionId.get(consumptionId);
    transactionSources.set(
      scopedSourceKey,
      (transactionSources.get(scopedSourceKey) ?? 0) +
        toAvailabilityQuantity(item.quantity)
    );
  });

  const cumulativeConsumedBySource = new Map();
  Array.from(movementsByConsumptionId.entries())
    .sort(([leftId], [rightId]) => leftId - rightId)
    .forEach(([consumptionId, transactionSources]) => {
      transactionSources.forEach((transactionQty, scopedSourceKey) => {
        const consumedAfter =
          (cumulativeConsumedBySource.get(scopedSourceKey) ?? 0) + transactionQty;
        cumulativeConsumedBySource.set(scopedSourceKey, consumedAfter);
        consumedAfterByRecordAndSource.set(
          `${consumptionId}|${scopedSourceKey}`,
          consumedAfter
        );
      });
    });

  if (exactDcItemIds.length) {
    const deliveryPk = await refreshDeliveryChallanPk();
    const deliveryFk = await refreshDeliveryChallanItemsFk();

    const sourceRequest = new sql.Request(db);
    const sourceInClause = buildPurchaseOrderItemInClause(
      sourceRequest,
      exactDcItemIds,
      "ConsumptionDcItemId"
    );
    const sourceResult = await sourceRequest.query(`
      SELECT
        dc.${toIdentifier(deliveryPk)} AS HeaderDeliveryChallanId,
        dc.ProjectId AS HeaderProjectId,
        dc.ToLocationId AS HeaderSourceLocationId,
        dci.Id AS DeliveryChallanItemId,
        dci.ItemId,
        dci.Quantity AS SourceQty
      FROM dbo.DeliveryChallan dc
      INNER JOIN dbo.DeliveryChallanItems dci
        ON dci.${toIdentifier(deliveryFk)} = dc.${toIdentifier(deliveryPk)}
      WHERE dci.Id IN (${sourceInClause})
    `);
    (sourceResult.recordset ?? []).forEach((row) => {
      exactDcSourceQtyByKey.set(
        buildExactDcSourceKey({
          projectId: row.HeaderProjectId,
          deliveryChallanId: row.HeaderDeliveryChallanId,
          deliveryChallanItemId: row.DeliveryChallanItemId,
          itemId: row.ItemId,
          fromLocationId: row.HeaderSourceLocationId,
        }),
        toAvailabilityQuantity(row.SourceQty)
      );
    });

  }

  const inventoryRowsByScope = new Map();
  const sourceDetailsByScopedKey = new Map();

  for (const record of records) {
    const projectId = toNullableInt(record.projectId ?? record.ProjectId);
    const locationId = toNullableInt(
      record.fromLocationId ??
        record.FromLocationId ??
        record.locationId ??
        record.LocationId
    );
    if (locationId === null) {
      continue;
    }

    const scopeKey = `${projectId ?? ""}|${locationId}`;
    if (!inventoryRowsByScope.has(scopeKey)) {
      const availableRows = await loadAvailableInventoryRows(db, {
        projectId,
        locationId,
        includeZero: true,
      });
      inventoryRowsByScope.set(scopeKey, availableRows);
      availableRows.forEach((row) => {
        sourceDetailsByScopedKey.set(
          buildScopedSourceKey({
            projectId: row.projectId,
            fromLocationId: row.locationId,
            sourceKey: row.sourceKey,
          }),
          row
        );
      });
    }
  }

  const reallocatePk = await refreshReallocateInventoryPk();
  const reallocateFk = await refreshReallocateInventoryItemsFk();
  const reallocationSourcesResult = await new sql.Request(db).query(`
    SELECT
      rii.*,
      ri.${toIdentifier(reallocatePk)} AS HeaderTransferId,
      ri.ToLocationId AS HeaderLocationId,
      ri.Notes AS HeaderNotes
    FROM dbo.ReallocateInventory ri
    INNER JOIN dbo.ReallocateInventoryItems rii
      ON rii.${toIdentifier(reallocateFk)} = ri.${toIdentifier(reallocatePk)}
  `);
  (reallocationSourcesResult.recordset ?? []).forEach((row) => {
    const transfer = normalizeReallocateInventory({
      Id: row.HeaderTransferId,
      ToLocationId: row.HeaderLocationId,
      Notes: row.HeaderNotes,
    });
    const item = normalizeReallocateInventoryItem(row);
    const sourceKey = buildReallocationAvailabilitySourceKey({
      transferId: transfer.id,
      item,
    });
    if (!sourceKey) {
      return;
    }
    sourceDetailsByScopedKey.set(
      buildScopedSourceKey({
        projectId: transfer.projectId,
        fromLocationId: transfer.toLocationId,
        sourceKey,
      }),
      {
        sourceQty: toAvailabilityQuantity(item.quantity),
        sourceRef: transfer.referenceNumber,
      }
    );
  });

  return records.map((record) => {
    const projectId = toNullableInt(record.projectId ?? record.ProjectId);
    const locationId = toNullableInt(
      record.fromLocationId ??
        record.FromLocationId ??
        record.locationId ??
        record.LocationId
    );
    const availableRows =
      inventoryRowsByScope.get(`${projectId ?? ""}|${locationId ?? ""}`) ?? [];
    const rowsBySourceKey = new Map(
      availableRows.map((row) => [String(row.sourceKey ?? ""), row])
    );

    return {
      ...record,
      items: (record.items || []).map((item) => {
        const sourceKey =
          normalizeOptionalString(item.sourceKey ?? item.SourceKey) ??
          buildAvailabilitySourceKey({
            ...item,
            deliveryChallanId:
              item.deliveryChallanId ??
              item.DeliveryChallanId ??
              record.deliveryChallanId ??
              record.DeliveryChallanId,
          });
        const scopedSourceKey = buildScopedSourceKey({
          projectId,
          fromLocationId: locationId,
          sourceKey,
        });
        const totalConsumedQty =
          consumedAfterByRecordAndSource.get(
            `${toNullableInt(record.id ?? record.consumptionId) ?? ""}|${scopedSourceKey}`
          ) ?? toAvailabilityQuantity(item.quantity);
        const exactIdentity = {
          projectId,
          deliveryChallanId:
            item.deliveryChallanId ??
            item.DeliveryChallanId ??
            record.deliveryChallanId ??
            record.DeliveryChallanId,
          deliveryChallanItemId:
            item.deliveryChallanItemId ?? item.DeliveryChallanItemId,
          itemId: item.itemId ?? item.ItemId,
          fromLocationId: locationId,
          locationId: toNullableInt(record.locationId ?? record.LocationId),
        };
        const exactSourceKey = buildExactDcSourceKey(exactIdentity);
        if (exactDcSourceQtyByKey.has(exactSourceKey)) {
          const sourceQty = exactDcSourceQtyByKey.get(exactSourceKey) ?? 0;
          const remainingQty = Math.max(sourceQty - totalConsumedQty, 0);
          return {
            ...item,
            sourceRef:
              normalizeOptionalString(item.sourceRef ?? item.SourceRef) ??
              normalizeOptionalString(record.deliveryChallanRef) ??
              "",
            sourceQty,
            totalConsumedQty,
            adjustedQty: 0,
            remainingQty,
            remainingAvailableQty: remainingQty,
            availableQty: remainingQty,
            balanceQty: remainingQty,
          };
        }

        const balanceRow = sourceKey ? rowsBySourceKey.get(sourceKey) : null;
        const sourceDetails = sourceDetailsByScopedKey.get(scopedSourceKey) ?? balanceRow;
        if (!sourceDetails) {
          return item;
        }

        const sourceQty = toAvailabilityQuantity(sourceDetails.sourceQty);
        const adjustedQty = 0;
        const remainingQty = Math.max(sourceQty - totalConsumedQty, 0);

        return {
          ...item,
          sourceRef:
            normalizeOptionalString(item.sourceRef ?? item.SourceRef) ??
            normalizeOptionalString(sourceDetails.sourceRef) ??
            normalizeOptionalString(record.deliveryChallanRef) ??
            "",
          sourceQty,
          totalConsumedQty,
          adjustedQty,
          remainingQty,
          remainingAvailableQty: remainingQty,
          availableQty: remainingQty,
          balanceQty: remainingQty,
        };
      }),
    };
  });
};

const assertDeliveryChallanDestinationIsReversible = async (
  db,
  { challan = {}, items = [], action = "change" } = {}
) => {
  const deliveryChallanId = toNullableInt(
    challan.id ?? challan.deliveryChallanId ?? challan.DeliveryChallanId
  );
  const projectId = toNullableInt(challan.projectId ?? challan.ProjectId);
  const destinationLocationId = toNullableInt(
    challan.toLocationId ?? challan.ToLocationId
  );
  if (deliveryChallanId === null || destinationLocationId === null) {
    const error = new Error(
      `This delivery challan cannot be ${action}d because its destination location is missing.`
    );
    error.statusCode = 409;
    throw error;
  }

  const destinationRows = await loadAvailableInventoryRows(db, {
    projectId,
    locationId: destinationLocationId,
    includeZero: true,
  });
  const rowsBySourceKey = new Map(
    destinationRows.map((row) => [String(row.sourceKey ?? ""), row])
  );

  for (const item of Array.isArray(items) ? items : []) {
    const originalQty = toAvailabilityQuantity(item.quantity ?? item.Quantity);
    const sourceKey = buildDeliveryChallanDestinationSourceKey(
      deliveryChallanId,
      item
    );
    const destinationRow = rowsBySourceKey.get(sourceKey);
    const remainingQty = toAvailabilityQuantity(destinationRow?.availableQty);
    if (!destinationRow || remainingQty + 0.0001 < originalQty) {
      const usedQty = Math.max(originalQty - remainingQty, 0);
      const error = new Error(
        `Delivery challan ${
          challan.dcNumber ?? challan.DCNumber ?? deliveryChallanId
        } cannot be ${action}d because ${
          item.name ?? item.ItemName ?? "an item"
        } has already been consumed or transferred onward (${usedQty} used).`
      );
      error.statusCode = 409;
      throw error;
    }
  }
};

const hasDeliveryChallanStockDefinitionChanged = ({
  existingChallan = {},
  existingItems = [],
  projectId = null,
  fromLocationId = null,
  toLocationId = null,
  items = [],
} = {}) => {
  if (
    toNullableInt(existingChallan.projectId ?? existingChallan.ProjectId) !==
      toNullableInt(projectId) ||
    toNullableInt(existingChallan.fromLocationId ?? existingChallan.FromLocationId) !==
      toNullableInt(fromLocationId) ||
    toNullableInt(existingChallan.toLocationId ?? existingChallan.ToLocationId) !==
      toNullableInt(toLocationId)
  ) {
    return true;
  }

  const oldById = new Map(
    (Array.isArray(existingItems) ? existingItems : []).map((item) => [
      toNullableInt(item.deliveryChallanItemId ?? item.id ?? item.Id),
      item,
    ])
  );
  if (oldById.size !== (Array.isArray(items) ? items : []).length) {
    return true;
  }

  return items.some((item) => {
    const itemId = toNullableInt(item.deliveryChallanItemId);
    const oldItem = itemId === null ? null : oldById.get(itemId);
    if (!oldItem) {
      return true;
    }
    return (
      normalizeAvailabilitySourceType(oldItem.sourceType) !==
        normalizeAvailabilitySourceType(item.sourceType) ||
      normalizeOptionalString(oldItem.sourceKey) !==
        normalizeOptionalString(item.sourceKey) ||
      toNullableInt(oldItem.receiveGoodsItemId) !==
        toNullableInt(item.receiveGoodsItemId) ||
      toNullableInt(oldItem.itemId) !== toNullableInt(item.itemId) ||
      Math.abs(
        toAvailabilityQuantity(oldItem.quantity) -
          toAvailabilityQuantity(item.quantity)
      ) > 0.0001
    );
  });
};

const validateAvailableInventorySelection = async (
  tx,
  {
    projectId = null,
    locationId = null,
    items = [],
    excludeDeliveryChallanId = null,
    excludeConsumptionId = null,
    excludeReallocateInventoryId = null,
  } = {}
) => {
  const requestedItems = Array.isArray(items) ? items : [];
  if (!requestedItems.length) {
    return;
  }

  const availableRows = await loadAvailableInventoryRows(tx, {
    projectId,
    locationId,
    excludeDeliveryChallanId,
    excludeConsumptionId,
    excludeReallocateInventoryId,
    includeConsumptionLeftover: requestedItems.some(
      (item) =>
        normalizeAvailabilitySourceType(item.sourceType ?? item.SourceType) ===
        "consumption"
    ),
    includeZero: true,
  });
  const rowsBySourceKey = new Map();
  const rowsBySourceRowId = new Map();
  const rowsByReceiptItemId = new Map();
  const rowsByMaterialKey = new Map();
  availableRows.forEach((row) => {
    rowsBySourceKey.set(row.sourceKey, row);
    const rowSourceRowId =
      normalizeOptionalString(row.sourceRowId ?? row.SourceRowId ?? row.sourceKey) ?? null;
    if (rowSourceRowId) {
      rowsBySourceRowId.set(rowSourceRowId, row);
    }
    const rowReceiptItemId = toNullableInt(
      row.receiptItemId ??
        row.ReceiptItemId ??
        row.receiveGoodsItemId ??
        row.ReceiveGoodsItemId
    );
    if (rowReceiptItemId !== null) {
      rowsByReceiptItemId.set(rowReceiptItemId, row);
    }
    if (!rowsByMaterialKey.has(row.materialKey)) {
      rowsByMaterialKey.set(row.materialKey, []);
    }
    rowsByMaterialKey.get(row.materialKey).push(row);
  });

  const requestedByKey = new Map();
  requestedItems.forEach((item) => {
    const quantity = toAvailabilityQuantity(item.quantity ?? item.Quantity);
    if (!quantity) {
      return;
    }
    const normalizedSourceType = normalizeAvailabilitySourceType(
      item.sourceType ?? item.SourceType
    );
    const sourceRowId =
      normalizeOptionalString(item.sourceRowId ?? item.SourceRowId ?? item.sourceKey) ?? null;
    const receiptItemId =
      normalizedSourceType === "receive"
        ? toNullableInt(
            item.receiptItemId ??
              item.ReceiptItemId ??
              item.receiveGoodsItemId ??
              item.ReceiveGoodsItemId
          )
        : null;
    const sourceKey = buildAvailabilitySourceKey(item);
    const materialKey = buildInventoryMaterialKey(item);
    const exactRow =
      (sourceRowId ? rowsBySourceRowId.get(sourceRowId) ?? null : null) ??
      (receiptItemId !== null ? rowsByReceiptItemId.get(receiptItemId) ?? null : null) ??
      (sourceKey ? rowsBySourceKey.get(sourceKey) ?? null : null);
    const key = sourceRowId
      ? `row:${sourceRowId}`
      : receiptItemId !== null
      ? `receipt:${receiptItemId}`
      : sourceKey
      ? `source:${sourceKey}`
      : `material:${materialKey}`;
    const sourceLabel = `${exactRow?.sourceRef ?? item.sourceRef ?? "Source row"} | ${
      exactRow?.name ?? item.name ?? item.Item ?? "item"
    }`;
    if ((sourceRowId || receiptItemId !== null) && !exactRow) {
      console.debug("Available inventory row missing during validation", {
        projectId,
        locationId,
        sourceRowId,
        receiptItemId,
        sourceKey,
        materialKey,
        item: item.name ?? item.Item ?? "item",
      });
      const error = new Error(`${sourceLabel} is no longer available.`);
      error.statusCode = 400;
      throw error;
    }
    requestedByKey.set(key, {
      sourceRowId,
      receiptItemId,
      sourceKey,
      materialKey,
      name: item.name ?? item.Item ?? "the selected material",
      sourceLabel,
      quantity: (requestedByKey.get(key)?.quantity ?? 0) + quantity,
    });
  });

  for (const request of requestedByKey.values()) {
    const exactRow =
      (request.sourceRowId ? rowsBySourceRowId.get(request.sourceRowId) ?? null : null) ??
      (request.receiptItemId !== null
        ? rowsByReceiptItemId.get(request.receiptItemId) ?? null
        : null);
    const availableQty = exactRow
      ? exactRow.availableQty ?? 0
      : request.sourceKey
      ? rowsBySourceKey.get(request.sourceKey)?.availableQty ?? 0
      : (rowsByMaterialKey.get(request.materialKey) ?? []).reduce(
          (sum, row) => sum + toAvailabilityQuantity(row.availableQty),
          0
        );
    if (request.quantity > availableQty + 0.0001) {
      console.debug("Available inventory quantity mismatch", {
        projectId,
        locationId,
        sourceRowId: request.sourceRowId,
        receiptItemId: request.receiptItemId,
        sourceKey: request.sourceKey,
        requestedQty: request.quantity,
        backendAvailableQty: availableQty,
        sourceLabel: request.sourceLabel,
      });
      const error = new Error(
        `Quantity for ${request.sourceLabel || request.name} cannot be greater than the available inventory balance (${availableQty}).`
      );
      error.statusCode = 400;
      throw error;
    }
  }
};

const isInactiveReallocationLookupStatus = (value = "") =>
  ["inactive", "completed", "complete", "closed", "cancelled", "canceled", "archived"].includes(
    normalizeInventoryKeyValue(value)
  );

const classifyReallocationLookupSourceType = (sourceType = "", location = {}) => {
  const normalizedSourceType = normalizeAvailabilitySourceType(sourceType);
  if (normalizedSourceType === "dc") {
    return "DC";
  }
  if (normalizedSourceType === "consumption") {
    return "Consumption";
  }

  const normalizedLocationType = normalizeInventoryKeyValue(location.type);
  const isDcLikeLocation =
    !toNullableInt(location.projectId) ||
    ["dc", "warehouse", "depot", "distribution center", "distributioncentre"].includes(
      normalizedLocationType
    );
  return isDcLikeLocation ? "DC" : "Project";
};

const loadReallocationLocationLookupRows = async (db) => {
  await ensureProjectsTable();
  await ensureLocationsTable();

  const projectRowsResult = await new sql.Request(db).query(`
    SELECT ProjectId, ProjectName, ProjectCode, Status
    FROM dbo.Projects
  `);
  const projectMap = new Map(
    (projectRowsResult.recordset ?? [])
      .map((row) => normalizeProject(row))
      .filter((project) => project?.id && !isInactiveReallocationLookupStatus(project.status))
      .map((project) => [String(project.id), project])
  );

  const locationRowsResult = await new sql.Request(db).query(`
    SELECT *
    FROM dbo.Locations
    ORDER BY LocationId DESC
  `);
  const activeLocations = (locationRowsResult.recordset ?? [])
    .map(normalizeLocation)
    .filter((location) => location?.id && !isInactiveReallocationLookupStatus(location.status));

  const lookupRows = [];
  for (const location of activeLocations) {
    const explicitProjectId = toNullableInt(location.projectId);
    const projectIdsToTry = [
      null,
      explicitProjectId,
      ...Array.from(projectMap.keys()).map((value) => toNullableInt(value)),
    ].filter((value, index, array) => {
      if (value === null) {
        return array.indexOf(null) === index;
      }
      return Number.isFinite(value) && array.findIndex((candidate) => candidate === value) === index;
    });

    let availableRows = [];
    let resolvedProjectId = explicitProjectId;
    for (const projectId of projectIdsToTry) {
      const rows = await loadAvailableInventoryRows(db, {
        locationId: location.id,
        projectId: projectId ?? undefined,
      }).catch(() => []);
      if (rows.length) {
        availableRows = rows;
        if (projectId !== null && projectId !== undefined) {
          resolvedProjectId = projectId;
        }
        break;
      }
    }

    if (!availableRows.length) {
      continue;
    }

    const sourceLabels = Array.from(
      new Set(
        availableRows
          .map((row) => classifyReallocationLookupSourceType(row.sourceType, location))
          .filter(Boolean)
      )
    );
    const sourceReferenceIds = Array.from(
      new Set(
        availableRows
          .map((row) => row.sourceKey || row.sourceRef || "")
          .filter(Boolean)
      )
    );

    lookupRows.push({
      locationId: location.id,
      locationName: location.name,
      code: location.code,
      type: location.type,
      projectId: resolvedProjectId,
      projectName: projectMap.get(String(resolvedProjectId))?.name ?? "",
      status: location.status,
      totalAvailableQty: availableRows.reduce(
        (sum, row) => sum + toAvailabilityQuantity(row.availableQty),
        0
      ),
      stockRows: availableRows.length,
      sourceTypes: sourceLabels.map((label) => normalizeInventoryKeyValue(label)),
      sourceLabels,
      sourceReferenceIds,
    });
  }

  return lookupRows.sort((left, right) =>
    String(left.locationName || "").localeCompare(String(right.locationName || ""))
  );
};

let ensureHrmsEmployeesTablePromise = null;

const parseHrmsDateInput = (value) => {
  if (value === undefined || value === null) {
    return null;
  }
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? NaN : value;
  }

  const trimmed = String(value).trim();
  if (!trimmed) {
    return null;
  }

  const isoMatch = /^(\d{4})-(\d{2})-(\d{2})/.exec(trimmed);
  if (isoMatch) {
    const [, yearText, monthText, dayText] = isoMatch;
    const year = Number(yearText);
    const month = Number(monthText);
    const day = Number(dayText);
    const date = new Date(Date.UTC(year, month - 1, day));
    const isValid =
      !Number.isNaN(date.getTime()) &&
      date.getUTCFullYear() === year &&
      date.getUTCMonth() === month - 1 &&
      date.getUTCDate() === day;
    return isValid ? date : NaN;
  }

  const dmyMatch = /^(\d{2})[-/](\d{2})[-/](\d{4})$/.exec(trimmed);
  if (dmyMatch) {
    const [, dayText, monthText, yearText] = dmyMatch;
    const day = Number(dayText);
    const month = Number(monthText);
    const year = Number(yearText);
    const date = new Date(Date.UTC(year, month - 1, day));
    const isValid =
      !Number.isNaN(date.getTime()) &&
      date.getUTCFullYear() === year &&
      date.getUTCMonth() === month - 1 &&
      date.getUTCDate() === day;
    return isValid ? date : NaN;
  }

  const date = new Date(trimmed);
  return Number.isNaN(date.getTime()) ? NaN : date;
};

const formatHrmsDate = (value) => {
  if (!value) {
    return "";
  }
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? "" : value.toISOString().slice(0, 10);
  }
  const text = String(value);
  const isoMatch = /^(\d{4})-(\d{2})-(\d{2})/.exec(text);
  if (isoMatch) {
    return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
  }
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? text : date.toISOString().slice(0, 10);
};

const toHrmsNullableInt = (value) => {
  if (value === undefined || value === null) {
    return null;
  }
  const text = String(value).trim();
  if (!text) {
    return null;
  }
  return toNullableInt(text);
};

const trimToLength = (value, maxLength) => {
  const normalized = normalizeOptionalString(value);
  return normalized ? normalized.slice(0, maxLength) : null;
};

const normalizeHrmsPhotoPath = (value) => {
  const normalized = normalizeOptionalString(value);
  if (!normalized || normalized.startsWith("data:") || normalized.length > 255) {
    return null;
  }
  return normalized;
};

const normalizeHrmsOptionalDecimal = (value) => {
  if (value === undefined || value === null || value === "") {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const ensureHrmsEmployeesTable = async () => {
  if (ensureHrmsEmployeesTablePromise) {
    return ensureHrmsEmployeesTablePromise;
  }

  ensureHrmsEmployeesTablePromise = (async () => {
    const pool = await getPool();
    await pool.request().query(`
      IF DB_ID(N'${escapeSqlLiteral(HRMS_DATABASE_NAME)}') IS NULL
      BEGIN
        THROW 51000, 'HRMS database ${escapeSqlLiteral(
          HRMS_DATABASE_NAME
        )} was not found on this SQL Server.', 1;
      END

      IF OBJECT_ID(N'${hrmsObjectName("Departments")}', N'U') IS NULL
      BEGIN
        CREATE TABLE ${hrmsTable("Departments")} (
          DepartmentID INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
          Name NVARCHAR(200) NULL
        );
      END

      IF OBJECT_ID(N'${hrmsObjectName("Designations")}', N'U') IS NULL
      BEGIN
        CREATE TABLE ${hrmsTable("Designations")} (
          DesignationID INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
          Title NVARCHAR(200) NULL
        );
      END

      IF OBJECT_ID(N'${hrmsObjectName("Employees")}', N'U') IS NULL
      BEGIN
        CREATE TABLE ${hrmsTable("Employees")} (
          EmployeeID VARCHAR(20) NOT NULL PRIMARY KEY,
          FullName VARCHAR(150) NOT NULL,
          DateOfBirth DATE NULL,
          Gender VARCHAR(20) NULL,
          DateOfJoining DATE NULL,
          ReportingManager VARCHAR(100) NULL,
          Nationality VARCHAR(50) NULL,
          MaritalStatus VARCHAR(20) NULL,
          BloodGroup VARCHAR(10) NULL,
          PhoneNumber VARCHAR(20) NULL,
          EmergencyContactName VARCHAR(150) NULL,
          EmergencyContactNumber VARCHAR(20) NULL,
          EmergencyContactRelation VARCHAR(100) NULL,
          EmergencyContactAddress VARCHAR(500) NULL,
          Email VARCHAR(150) NULL,
          DepartmentID INT NULL,
          DesignationID INT NULL,
          BasicSalary DECIMAL(18,2) NULL,
          Allowances DECIMAL(18,2) NULL,
          SalaryDeduction DECIMAL(18,2) NULL,
          ProvidentFund DECIMAL(18,2) NULL,
          ProfessionalTax DECIMAL(18,2) NULL,
          TDSAmount DECIMAL(18,2) NULL,
          ESIAmount DECIMAL(18,2) NULL,
          PANNumber VARCHAR(10) NULL,
          DocumentNumber VARCHAR(100) NULL,
          UANNumber VARCHAR(50) NULL,
          ESINumber VARCHAR(50) NULL,
          PermanentAddress VARCHAR(500) NULL,
          PresentAddress VARCHAR(500) NULL,
          SameAsPermanentAddress BIT NULL,
          Address VARCHAR(500) NULL,
          PhotoPath VARCHAR(255) NULL,
          DocumentsJson NVARCHAR(MAX) NULL,
          Status VARCHAR(20) NULL,
          CreatedAt DATETIME NULL DEFAULT GETDATE()
        );
      END

      IF COL_LENGTH(N'${hrmsObjectName("Employees")}', N'EmergencyContactName') IS NULL
      BEGIN
        ALTER TABLE ${hrmsTable("Employees")} ADD EmergencyContactName VARCHAR(150) NULL;
      END

      IF COL_LENGTH(N'${hrmsObjectName("Employees")}', N'EmergencyContactNumber') IS NULL
      BEGIN
        ALTER TABLE ${hrmsTable("Employees")} ADD EmergencyContactNumber VARCHAR(20) NULL;
      END

      IF COL_LENGTH(N'${hrmsObjectName("Employees")}', N'EmergencyContactRelation') IS NULL
      BEGIN
        ALTER TABLE ${hrmsTable("Employees")} ADD EmergencyContactRelation VARCHAR(100) NULL;
      END

      IF COL_LENGTH(N'${hrmsObjectName("Employees")}', N'EmergencyContactAddress') IS NULL
      BEGIN
        ALTER TABLE ${hrmsTable("Employees")} ADD EmergencyContactAddress VARCHAR(500) NULL;
      END

      IF COL_LENGTH(N'${hrmsObjectName("Employees")}', N'PermanentAddress') IS NULL
      BEGIN
        ALTER TABLE ${hrmsTable("Employees")} ADD PermanentAddress VARCHAR(500) NULL;
      END

      IF COL_LENGTH(N'${hrmsObjectName("Employees")}', N'PresentAddress') IS NULL
      BEGIN
        ALTER TABLE ${hrmsTable("Employees")} ADD PresentAddress VARCHAR(500) NULL;
      END

      IF COL_LENGTH(N'${hrmsObjectName("Employees")}', N'SameAsPermanentAddress') IS NULL
      BEGIN
        ALTER TABLE ${hrmsTable("Employees")} ADD SameAsPermanentAddress BIT NULL;
      END

      IF COL_LENGTH(N'${hrmsObjectName("Employees")}', N'DocumentsJson') IS NULL
      BEGIN
        ALTER TABLE ${hrmsTable("Employees")} ADD DocumentsJson NVARCHAR(MAX) NULL;
      END

      IF COL_LENGTH(N'${hrmsObjectName("Employees")}', N'Allowances') IS NULL
      BEGIN
        ALTER TABLE ${hrmsTable("Employees")} ADD Allowances DECIMAL(18,2) NULL;
      END

      IF COL_LENGTH(N'${hrmsObjectName("Employees")}', N'SalaryDeduction') IS NULL
      BEGIN
        ALTER TABLE ${hrmsTable("Employees")} ADD SalaryDeduction DECIMAL(18,2) NULL;
      END

      IF COL_LENGTH(N'${hrmsObjectName("Employees")}', N'ProvidentFund') IS NULL
      BEGIN
        ALTER TABLE ${hrmsTable("Employees")} ADD ProvidentFund DECIMAL(18,2) NULL;
      END

      IF COL_LENGTH(N'${hrmsObjectName("Employees")}', N'ProfessionalTax') IS NULL
      BEGIN
        ALTER TABLE ${hrmsTable("Employees")} ADD ProfessionalTax DECIMAL(18,2) NULL;
      END

      IF COL_LENGTH(N'${hrmsObjectName("Employees")}', N'TDSAmount') IS NULL
      BEGIN
        ALTER TABLE ${hrmsTable("Employees")} ADD TDSAmount DECIMAL(18,2) NULL;
      END

      IF COL_LENGTH(N'${hrmsObjectName("Employees")}', N'ESIAmount') IS NULL
      BEGIN
        ALTER TABLE ${hrmsTable("Employees")} ADD ESIAmount DECIMAL(18,2) NULL;
      END

      IF COL_LENGTH(N'${hrmsObjectName("Employees")}', N'PANNumber') IS NULL
      BEGIN
        ALTER TABLE ${hrmsTable("Employees")} ADD PANNumber VARCHAR(10) NULL;
      END

      IF COL_LENGTH(N'${hrmsObjectName("Employees")}', N'DocumentNumber') IS NULL
      BEGIN
        ALTER TABLE ${hrmsTable("Employees")} ADD DocumentNumber VARCHAR(100) NULL;
      END

      IF COL_LENGTH(N'${hrmsObjectName("Employees")}', N'UANNumber') IS NULL
      BEGIN
        ALTER TABLE ${hrmsTable("Employees")} ADD UANNumber VARCHAR(50) NULL;
      END

      IF COL_LENGTH(N'${hrmsObjectName("Employees")}', N'ESINumber') IS NULL
      BEGIN
        ALTER TABLE ${hrmsTable("Employees")} ADD ESINumber VARCHAR(50) NULL;
      END

      IF OBJECT_ID(N'${hrmsObjectName("EmployeeIdSequences")}', N'U') IS NULL
      BEGIN
        CREATE TABLE ${hrmsTable("EmployeeIdSequences")} (
          Prefix VARCHAR(10) NOT NULL PRIMARY KEY,
          LastNumber INT NOT NULL,
          UpdatedAt DATETIME NULL DEFAULT GETDATE()
        );
      END

      DECLARE @MaxExistingBENumber INT;
      SELECT @MaxExistingBENumber = MAX(TRY_CONVERT(INT, SUBSTRING(EmployeeID, 3, 20)))
      FROM ${hrmsTable("Employees")}
      WHERE EmployeeID LIKE 'BE%';

      IF NOT EXISTS (
        SELECT 1 FROM ${hrmsTable("EmployeeIdSequences")} WHERE Prefix = 'BE'
      )
      BEGIN
        INSERT INTO ${hrmsTable("EmployeeIdSequences")} (Prefix, LastNumber, UpdatedAt)
        VALUES ('BE', ISNULL(@MaxExistingBENumber, 0), GETDATE());
      END
      ELSE
      BEGIN
        UPDATE ${hrmsTable("EmployeeIdSequences")}
        SET
          LastNumber = CASE
            WHEN LastNumber < ISNULL(@MaxExistingBENumber, 0)
            THEN ISNULL(@MaxExistingBENumber, 0)
            ELSE LastNumber
          END,
          UpdatedAt = GETDATE()
        WHERE Prefix = 'BE';
      END
    `);
  })();

  try {
    await ensureHrmsEmployeesTablePromise;
  } finally {
    ensureHrmsEmployeesTablePromise = null;
  }
};

const resolveHrmsLookupId = async (
  tx,
  tableName,
  idColumn,
  valueColumn,
  value
) => {
  const explicitId = toHrmsNullableInt(value);
  if (explicitId !== null) {
    return explicitId;
  }

  const normalized = trimToLength(value, 200);
  if (!normalized) {
    return null;
  }

  const existingResult = await createDbRequest(tx)
    .input("LookupValue", sql.NVarChar(200), normalized)
    .query(`
      SELECT TOP (1) ${toIdentifier(idColumn)} AS id
      FROM ${hrmsTable(tableName)}
      WHERE LOWER(LTRIM(RTRIM(${toIdentifier(valueColumn)}))) = LOWER(@LookupValue)
    `);
  const existingId = toHrmsNullableInt(existingResult.recordset?.[0]?.id);
  if (existingId !== null) {
    return existingId;
  }

  const insertResult = await createDbRequest(tx)
    .input("LookupValue", sql.NVarChar(200), normalized)
    .query(`
      INSERT INTO ${hrmsTable(tableName)} (${toIdentifier(valueColumn)})
      OUTPUT INSERTED.${toIdentifier(idColumn)} AS id
      VALUES (@LookupValue)
    `);
  return toHrmsNullableInt(insertResult.recordset?.[0]?.id);
};

const buildHrmsEmployeePayload = async (source = {}, tx) => {
  const dateOfBirth = parseHrmsDateInput(
    source.dateOfBirth ?? source.DateOfBirth
  );
  const dateOfJoining = parseHrmsDateInput(
    source.joined ?? source.dateOfJoining ?? source.DateOfJoining
  );
  if (Number.isNaN(dateOfBirth)) {
    const error = new Error("Invalid date of birth.");
    error.statusCode = 400;
    throw error;
  }
  if (Number.isNaN(dateOfJoining)) {
    const error = new Error("Invalid date of joining.");
    error.statusCode = 400;
    throw error;
  }

  const departmentId =
    toHrmsNullableInt(source.departmentId ?? source.DepartmentID) ??
    (await resolveHrmsLookupId(
      tx,
      "Departments",
      "DepartmentID",
      "Name",
      source.department ?? source.departmentName ?? source.DepartmentName
    ));
  const designationId =
    toHrmsNullableInt(source.designationId ?? source.DesignationID) ??
    (await resolveHrmsLookupId(
      tx,
      "Designations",
      "DesignationID",
      "Title",
      source.designation ??
        source.designationTitle ??
        source.DesignationTitle
    ));
  const salary = Number(
    source.salary ?? source.basicSalary ?? source.BasicSalary ?? 0
  );
  const allowances = normalizeHrmsOptionalDecimal(
    source.allowances ?? source.allowance ?? source.Allowances
  );
  const salaryDeduction = normalizeHrmsOptionalDecimal(
    source.salaryDeduction ?? source.deduction ?? source.SalaryDeduction
  );
  const providentFund = normalizeHrmsOptionalDecimal(
    source.pfAmount ?? source.providentFund ?? source.ProvidentFund
  );
  const professionalTax = normalizeHrmsOptionalDecimal(
    source.professionalTax ?? source.pt ?? source.ProfessionalTax
  );
  const tdsAmount = normalizeHrmsOptionalDecimal(
    source.tdsAmount ?? source.tds ?? source.TDSAmount
  );
  const esiAmount = normalizeHrmsOptionalDecimal(
    source.esiAmount ?? source.esi ?? source.ESIAmount
  );
  const permanentAddress = trimToLength(
    source.permanentAddress ?? source.PermanentAddress,
    500
  );
  const presentAddress = trimToLength(
    source.presentAddress ?? source.PresentAddress ?? source.address ?? source.Address,
    500
  );
  const sameAsPermanentAddressSource =
    source.sameAsPermanentAddress ?? source.SameAsPermanentAddress;

  return {
    employeeId: trimToLength(
      source.id ?? source.employeeId ?? source.EmployeeID,
      20
    ),
    fullName: trimToLength(
      source.name ?? source.fullName ?? source.FullName,
      150
    ),
    dateOfBirth,
    gender: trimToLength(source.gender ?? source.Gender, 20),
    dateOfJoining,
    reportingManager: trimToLength(
      source.manager ?? source.reportingManager ?? source.ReportingManager,
      100
    ),
    nationality: trimToLength(source.nationality ?? source.Nationality, 50),
    maritalStatus: trimToLength(
      source.maritalStatus ?? source.MaritalStatus,
      20
    ),
    bloodGroup: trimToLength(source.bloodGroup ?? source.BloodGroup, 10),
    phoneNumber: trimToLength(
      source.phone ?? source.phoneNumber ?? source.PhoneNumber,
      20
    ),
    emergencyContactName: trimToLength(
      source.emergencyContactName ?? source.EmergencyContactName,
      150
    ),
    emergencyContactNumber: trimToLength(
      source.emergencyContactNumber ??
        source.emergencyPhone ??
        source.EmergencyContactNumber,
      20
    ),
    emergencyContactRelation: trimToLength(
      source.emergencyContactRelation ??
        source.relation ??
        source.EmergencyContactRelation,
      100
    ),
    emergencyContactAddress: trimToLength(
      source.emergencyContactAddress ?? source.EmergencyContactAddress,
      500
    ),
    email: trimToLength(source.email ?? source.Email, 150),
    departmentId,
    designationId,
    basicSalary: Number.isFinite(salary) ? salary : 0,
    allowances,
    salaryDeduction,
    providentFund,
    professionalTax,
    tdsAmount,
    esiAmount,
    panNumber: trimToLength(source.panNumber ?? source.PANNumber, 10),
    documentNumber: trimToLength(
      source.documentNumber ?? source.DocumentNumber,
      100
    ),
    uanNumber: trimToLength(source.uanNumber ?? source.UANNumber, 50),
    esiNumber: trimToLength(source.esiNumber ?? source.ESINumber, 50),
    permanentAddress,
    presentAddress,
    sameAsPermanentAddress:
      sameAsPermanentAddressSource === undefined ||
      sameAsPermanentAddressSource === null ||
      sameAsPermanentAddressSource === ""
        ? Boolean(
            permanentAddress &&
              presentAddress &&
              permanentAddress === presentAddress
          )
        : Boolean(sameAsPermanentAddressSource),
    address: presentAddress,
    photoPath: normalizeHrmsPhotoPath(
      source.photoPath ?? source.PhotoPath ?? source.photo
    ),
    documentsJson: serializeJson(
      parseJsonObject(source.documents ?? source.DocumentsJson)
    ),
    status: trimToLength(source.status ?? source.Status, 20) ?? "Active",
  };
};

const normalizeHrmsEmployeeRow = (row = {}) => ({
  id: row.EmployeeID ?? "",
  employeeId: row.EmployeeID ?? "",
  name: row.FullName ?? "",
  fullName: row.FullName ?? "",
  dateOfBirth: formatHrmsDate(row.DateOfBirth),
  gender: row.Gender ?? "",
  joined: formatHrmsDate(row.DateOfJoining),
  dateOfJoining: formatHrmsDate(row.DateOfJoining),
  manager: row.ReportingManager ?? "",
  reportingManager: row.ReportingManager ?? "",
  nationality: row.Nationality ?? "",
  maritalStatus: row.MaritalStatus ?? "",
  bloodGroup: row.BloodGroup ?? "",
  phone: row.PhoneNumber ?? "",
  phoneNumber: row.PhoneNumber ?? "",
  emergencyContactName: row.EmergencyContactName ?? "",
  emergencyContactNumber: row.EmergencyContactNumber ?? "",
  emergencyPhone: row.EmergencyContactNumber ?? "",
  emergencyContactRelation: row.EmergencyContactRelation ?? "",
  relation: row.EmergencyContactRelation ?? "",
  emergencyContactAddress: row.EmergencyContactAddress ?? "",
  email: row.Email ?? "",
  departmentId: row.DepartmentID ?? null,
  department: row.DepartmentName ?? "",
  designationId: row.DesignationID ?? null,
  designation: row.DesignationTitle ?? "",
  salary: Number(row.BasicSalary ?? 0),
  basicSalary: Number(row.BasicSalary ?? 0),
  allowances: normalizeHrmsOptionalDecimal(row.Allowances),
  allowance: normalizeHrmsOptionalDecimal(row.Allowances),
  salaryDeduction: normalizeHrmsOptionalDecimal(row.SalaryDeduction),
  deduction: normalizeHrmsOptionalDecimal(row.SalaryDeduction),
  pfAmount: normalizeHrmsOptionalDecimal(row.ProvidentFund),
  providentFund: normalizeHrmsOptionalDecimal(row.ProvidentFund),
  professionalTax: normalizeHrmsOptionalDecimal(row.ProfessionalTax),
  pt: normalizeHrmsOptionalDecimal(row.ProfessionalTax),
  tdsAmount: normalizeHrmsOptionalDecimal(row.TDSAmount),
  tds: normalizeHrmsOptionalDecimal(row.TDSAmount),
  esiAmount: normalizeHrmsOptionalDecimal(row.ESIAmount),
  esi: normalizeHrmsOptionalDecimal(row.ESIAmount),
  panNumber: row.PANNumber ?? "",
  documentNumber: row.DocumentNumber ?? "",
  uanNumber: row.UANNumber ?? "",
  esiNumber: row.ESINumber ?? "",
  permanentAddress: row.PermanentAddress ?? "",
  presentAddress: row.PresentAddress ?? row.Address ?? "",
  sameAsPermanentAddress:
    typeof row.SameAsPermanentAddress === "boolean"
      ? row.SameAsPermanentAddress
      : Boolean(
          (row.PermanentAddress ?? "") &&
            (row.PresentAddress ?? row.Address ?? "") &&
            String(row.PermanentAddress ?? "").trim() ===
              String(row.PresentAddress ?? row.Address ?? "").trim()
        ),
  address: row.PresentAddress ?? row.Address ?? "",
  photo: row.PhotoPath ?? "",
  photoPath: row.PhotoPath ?? "",
  documents: parseJsonObject(row.DocumentsJson),
  status: row.Status ?? "Active",
  createdAt: row.CreatedAt ?? null,
});

const loadHrmsEmployeeById = async (source, employeeId) => {
  const result = await createDbRequest(source)
    .input("EmployeeID", sql.VarChar(20), employeeId)
    .query(`
      SELECT
        e.EmployeeID,
        e.FullName,
        e.DateOfBirth,
        e.Gender,
        e.DateOfJoining,
        e.ReportingManager,
        e.Nationality,
        e.MaritalStatus,
        e.BloodGroup,
        e.PhoneNumber,
        e.EmergencyContactName,
        e.EmergencyContactNumber,
        e.EmergencyContactRelation,
        e.EmergencyContactAddress,
        e.Email,
        e.DepartmentID,
        d.Name AS DepartmentName,
        e.DesignationID,
        g.Title AS DesignationTitle,
        e.BasicSalary,
        e.Allowances,
        e.SalaryDeduction,
        e.ProvidentFund,
        e.ProfessionalTax,
        e.TDSAmount,
        e.ESIAmount,
        e.PANNumber,
        e.DocumentNumber,
        e.UANNumber,
        e.ESINumber,
        e.PermanentAddress,
        e.PresentAddress,
        e.SameAsPermanentAddress,
        e.Address,
        e.PhotoPath,
        e.DocumentsJson,
        e.Status,
        e.CreatedAt
      FROM ${hrmsTable("Employees")} e
      LEFT JOIN ${hrmsTable("Departments")} d
        ON e.DepartmentID = d.DepartmentID
      LEFT JOIN ${hrmsTable("Designations")} g
        ON e.DesignationID = g.DesignationID
      WHERE e.EmployeeID = @EmployeeID
    `);
  const row = result.recordset?.[0];
  return row ? normalizeHrmsEmployeeRow(row) : null;
};

const getNextHrmsEmployeeId = async (source) => {
  const result = await createDbRequest(source).query(`
    UPDATE ${hrmsTable("EmployeeIdSequences")} WITH (UPDLOCK, HOLDLOCK)
    SET
      LastNumber = LastNumber + 1,
      UpdatedAt = GETDATE()
    OUTPUT INSERTED.LastNumber AS nextNumber
    WHERE Prefix = 'BE'
  `);
  const nextNumber = Number(result.recordset?.[0]?.nextNumber ?? 1);
  return `BE${String(nextNumber).padStart(2, "0")}`;
};

let ensureHrmsReviewsTablePromise = null;

const ensureHrmsReviewsTable = async () => {
  if (ensureHrmsReviewsTablePromise) {
    return ensureHrmsReviewsTablePromise;
  }

  ensureHrmsReviewsTablePromise = (async () => {
    await ensureHrmsEmployeesTable();
    const pool = await getPool();
    await pool.request().query(`
      IF OBJECT_ID(N'${hrmsObjectName("Reviews")}', N'U') IS NULL
      BEGIN
        CREATE TABLE ${hrmsTable("Reviews")} (
          Id INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
          EmployeeID VARCHAR(20) NULL,
          ReviewPeriod VARCHAR(100) NULL,
          ReviewStartDate DATE NULL,
          ReviewEndDate DATE NULL,
          ReviewDate DATE NULL,
          ReviewType VARCHAR(50) NULL,
          Reviewer VARCHAR(150) NULL,
          OverallRating INT NULL,
          Strengths VARCHAR(1000) NULL,
          AreasOfImprovement VARCHAR(1000) NULL,
          Comments VARCHAR(1000) NULL,
          SavedDate DATETIME NULL
        );
      END

      IF COL_LENGTH(N'${hrmsObjectName("Reviews")}', N'ReviewStartDate') IS NULL
      BEGIN
        ALTER TABLE ${hrmsTable("Reviews")} ADD ReviewStartDate DATE NULL;
      END

      IF COL_LENGTH(N'${hrmsObjectName("Reviews")}', N'ReviewEndDate') IS NULL
      BEGIN
        ALTER TABLE ${hrmsTable("Reviews")} ADD ReviewEndDate DATE NULL;
      END

      IF COL_LENGTH(N'${hrmsObjectName("Reviews")}', N'ReviewDate') IS NULL
      BEGIN
        ALTER TABLE ${hrmsTable("Reviews")} ADD ReviewDate DATE NULL;
      END
    `);
  })();

  try {
    await ensureHrmsReviewsTablePromise;
  } finally {
    ensureHrmsReviewsTablePromise = null;
  }
};

const normalizeHrmsReviewRating = (value) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return 0;
  }
  return Math.min(5, Math.max(0, Math.trunc(parsed)));
};

const buildHrmsReviewPayload = (source = {}) => {
  const reviewStartDate = parseHrmsDateInput(
    source.reviewStartDate ?? source.ReviewStartDate
  );
  const reviewEndDate = parseHrmsDateInput(
    source.reviewEndDate ?? source.ReviewEndDate
  );
  const reviewDate = parseHrmsDateInput(source.reviewDate ?? source.ReviewDate);

  if (
    Number.isNaN(reviewStartDate) ||
    Number.isNaN(reviewEndDate) ||
    Number.isNaN(reviewDate)
  ) {
    const error = new Error("Invalid review date.");
    error.statusCode = 400;
    throw error;
  }

  return {
    employeeId: trimToLength(
      source.employeeId ?? source.EmployeeID,
      20
    ),
    period: trimToLength(source.period ?? source.ReviewPeriod, 100),
    reviewDate,
    reviewEndDate,
    reviewStartDate,
    type: trimToLength(source.type ?? source.ReviewType, 50),
    reviewer: trimToLength(source.reviewer ?? source.Reviewer, 150),
    rating: normalizeHrmsReviewRating(
      source.rating ?? source.OverallRating
    ),
    strengths: trimToLength(source.strengths ?? source.Strengths, 1000),
    improvement: trimToLength(
      source.improvement ?? source.AreasOfImprovement,
      1000
    ),
    comments: trimToLength(source.comments ?? source.Comments, 1000),
  };
};

const normalizeHrmsReviewRow = (row = {}) => ({
  id: String(row.Id ?? ""),
  employeeId: row.EmployeeID ?? "",
  employeeName: row.EmployeeName ?? row.FullName ?? row.EmployeeID ?? "",
  period: row.ReviewPeriod ?? "",
  reviewDate: formatHrmsDate(row.ReviewDate),
  reviewEndDate: formatHrmsDate(row.ReviewEndDate),
  reviewStartDate: formatHrmsDate(row.ReviewStartDate),
  type: row.ReviewType ?? "",
  reviewer: row.Reviewer ?? "",
  rating: Number(row.OverallRating ?? 0) || 0,
  strengths: row.Strengths ?? "",
  improvement: row.AreasOfImprovement ?? "",
  comments: row.Comments ?? "",
  savedAt: row.SavedDate ?? null,
});

const loadHrmsReviewById = async (source, reviewId) => {
  const result = await createDbRequest(source)
    .input("ReviewId", sql.Int, reviewId)
    .query(`
      SELECT
        r.Id,
        r.EmployeeID,
        COALESCE(e.FullName, r.EmployeeID) AS EmployeeName,
        r.ReviewPeriod,
        r.ReviewStartDate,
        r.ReviewEndDate,
        r.ReviewDate,
        r.ReviewType,
        r.Reviewer,
        r.OverallRating,
        r.Strengths,
        r.AreasOfImprovement,
        r.Comments,
        r.SavedDate
      FROM ${hrmsTable("Reviews")} r
      LEFT JOIN ${hrmsTable("Employees")} e
        ON r.EmployeeID = e.EmployeeID
      WHERE r.Id = @ReviewId
    `);
  const row = result.recordset?.[0];
  return row ? normalizeHrmsReviewRow(row) : null;
};

app.get("/api/hrms/reviews", async (_req, res) => {
  try {
    await ensureHrmsReviewsTable();
    const pool = await getPool();
    const result = await pool.request().query(`
      SELECT
        r.Id,
        r.EmployeeID,
        COALESCE(e.FullName, r.EmployeeID) AS EmployeeName,
        r.ReviewPeriod,
        r.ReviewStartDate,
        r.ReviewEndDate,
        r.ReviewDate,
        r.ReviewType,
        r.Reviewer,
        r.OverallRating,
        r.Strengths,
        r.AreasOfImprovement,
        r.Comments,
        r.SavedDate
      FROM ${hrmsTable("Reviews")} r
      LEFT JOIN ${hrmsTable("Employees")} e
        ON r.EmployeeID = e.EmployeeID
      ORDER BY r.SavedDate DESC, r.Id DESC
    `);

    return res.json({
      ok: true,
      reviews: (result.recordset ?? []).map(normalizeHrmsReviewRow),
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error?.message ?? "Failed to fetch HRMS reviews",
    });
  }
});

app.post("/api/hrms/reviews", async (req, res) => {
  try {
    await ensureHrmsReviewsTable();
    const payload = buildHrmsReviewPayload(req.body);

    if (!payload.employeeId) {
      return res.status(400).json({
        ok: false,
        error: "employeeId is required.",
      });
    }

    const pool = await getPool();
    const insertResult = await pool
      .request()
      .input("EmployeeID", sql.VarChar(20), payload.employeeId)
      .input("ReviewPeriod", sql.VarChar(100), payload.period)
      .input("ReviewStartDate", sql.Date, payload.reviewStartDate)
      .input("ReviewEndDate", sql.Date, payload.reviewEndDate)
      .input("ReviewDate", sql.Date, payload.reviewDate)
      .input("ReviewType", sql.VarChar(50), payload.type)
      .input("Reviewer", sql.VarChar(150), payload.reviewer)
      .input("OverallRating", sql.Int, payload.rating)
      .input("Strengths", sql.VarChar(1000), payload.strengths)
      .input("AreasOfImprovement", sql.VarChar(1000), payload.improvement)
      .input("Comments", sql.VarChar(1000), payload.comments)
      .query(`
        INSERT INTO ${hrmsTable("Reviews")} (
          EmployeeID,
          ReviewPeriod,
          ReviewStartDate,
          ReviewEndDate,
          ReviewDate,
          ReviewType,
          Reviewer,
          OverallRating,
          Strengths,
          AreasOfImprovement,
          Comments,
          SavedDate
        )
        OUTPUT INSERTED.Id AS id
        VALUES (
          @EmployeeID,
          @ReviewPeriod,
          @ReviewStartDate,
          @ReviewEndDate,
          @ReviewDate,
          @ReviewType,
          @Reviewer,
          @OverallRating,
          @Strengths,
          @AreasOfImprovement,
          @Comments,
          GETDATE()
        )
      `);

    const reviewId = toNullableInt(insertResult.recordset?.[0]?.id);
    const review = await loadHrmsReviewById(pool, reviewId);
    return res.status(201).json({ ok: true, review });
  } catch (error) {
    return res.status(error?.statusCode || 500).json({
      ok: false,
      error: error?.message ?? "Failed to create HRMS review",
    });
  }
});

let ensureHrmsSalaryReassessmentsTablePromise = null;

const ensureHrmsSalaryReassessmentsTable = async () => {
  if (ensureHrmsSalaryReassessmentsTablePromise) {
    return ensureHrmsSalaryReassessmentsTablePromise;
  }

  ensureHrmsSalaryReassessmentsTablePromise = (async () => {
    await ensureHrmsEmployeesTable();
    const pool = await getPool();
    await pool.request().query(`
      IF OBJECT_ID(N'${hrmsObjectName("SalaryReassessments")}', N'U') IS NULL
      BEGIN
        CREATE TABLE ${hrmsTable("SalaryReassessments")} (
          Id INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
          EmployeeID VARCHAR(20) NOT NULL,
          ReviewPeriod VARCHAR(100) NULL,
          ReviewerName VARCHAR(150) NULL,
          ReviewDate DATE NULL,
          KPIScore INT NULL,
          AttendanceScore INT NULL,
          BehaviorScore INT NULL,
          ProductivityScore INT NULL,
          WorkQuality INT NULL,
          Communication INT NULL,
          Teamwork INT NULL,
          Leadership INT NULL,
          Punctuality INT NULL,
          TaskCompletion INT NULL,
          Innovation INT NULL,
          ClientFeedback INT NULL,
          Reporting INT NULL,
          SkillDevelopment INT NULL,
          CurrentSalary DECIMAL(18,2) NULL,
          RecommendedIncrementPercent DECIMAL(5,2) NULL,
          Bonus DECIMAL(18,2) NULL,
          RevisedSalary DECIMAL(18,2) NULL,
          Allowances DECIMAL(18,2) NULL,
          SalaryDeduction DECIMAL(18,2) NULL,
          ProvidentFund DECIMAL(18,2) NULL,
          ESIAmount DECIMAL(18,2) NULL,
          ProfessionalTax DECIMAL(18,2) NULL,
          TDSAmount DECIMAL(18,2) NULL,
          TotalDeductions DECIMAL(18,2) NULL,
          NetSalary DECIMAL(18,2) NULL,
          CurrentRole VARCHAR(100) NULL,
          ProposedRole VARCHAR(100) NULL,
          PromotionEffectiveDate DATE NULL,
          DepartmentTransfer VARCHAR(100) NULL,
          EmployeeStrengths VARCHAR(1000) NULL,
          AreasOfImprovement VARCHAR(1000) NULL,
          HRComments VARCHAR(1000) NULL,
          ManagerComments VARCHAR(1000) NULL,
          EmployeeSelfReview VARCHAR(1000) NULL,
          ManagerReviewStatus VARCHAR(50) NULL,
          HRApprovalStatus VARCHAR(50) NULL,
          DirectorApprovalStatus VARCHAR(50) NULL,
          SalaryActivatedStatus VARCHAR(50) NULL,
          AcknowledgementStatus VARCHAR(50) NULL,
          EmployeeComments VARCHAR(1000) NULL,
          DigitalSignature VARCHAR(150) NULL,
          Status VARCHAR(50) NULL,
          SavedDate DATETIME NULL
        );
      END

      IF COL_LENGTH(N'${hrmsObjectName("SalaryReassessments")}', N'Reporting') IS NULL
      BEGIN
        ALTER TABLE ${hrmsTable("SalaryReassessments")} ADD Reporting INT NULL;
      END

      IF COL_LENGTH(N'${hrmsObjectName("SalaryReassessments")}', N'SkillDevelopment') IS NULL
      BEGIN
        ALTER TABLE ${hrmsTable("SalaryReassessments")} ADD SkillDevelopment INT NULL;
      END

      IF COL_LENGTH(N'${hrmsObjectName("SalaryReassessments")}', N'SalaryDeduction') IS NULL
      BEGIN
        ALTER TABLE ${hrmsTable("SalaryReassessments")} ADD SalaryDeduction DECIMAL(18,2) NULL;
      END

      IF COL_LENGTH(N'${hrmsObjectName("SalaryReassessments")}', N'Allowances') IS NULL
      BEGIN
        ALTER TABLE ${hrmsTable("SalaryReassessments")} ADD Allowances DECIMAL(18,2) NULL;
      END

      IF COL_LENGTH(N'${hrmsObjectName("SalaryReassessments")}', N'ProvidentFund') IS NULL
      BEGIN
        ALTER TABLE ${hrmsTable("SalaryReassessments")} ADD ProvidentFund DECIMAL(18,2) NULL;
      END

      IF COL_LENGTH(N'${hrmsObjectName("SalaryReassessments")}', N'ESIAmount') IS NULL
      BEGIN
        ALTER TABLE ${hrmsTable("SalaryReassessments")} ADD ESIAmount DECIMAL(18,2) NULL;
      END

      IF COL_LENGTH(N'${hrmsObjectName("SalaryReassessments")}', N'ProfessionalTax') IS NULL
      BEGIN
        ALTER TABLE ${hrmsTable("SalaryReassessments")} ADD ProfessionalTax DECIMAL(18,2) NULL;
      END

      IF COL_LENGTH(N'${hrmsObjectName("SalaryReassessments")}', N'TDSAmount') IS NULL
      BEGIN
        ALTER TABLE ${hrmsTable("SalaryReassessments")} ADD TDSAmount DECIMAL(18,2) NULL;
      END

      IF COL_LENGTH(N'${hrmsObjectName("SalaryReassessments")}', N'TotalDeductions') IS NULL
      BEGIN
        ALTER TABLE ${hrmsTable("SalaryReassessments")} ADD TotalDeductions DECIMAL(18,2) NULL;
      END

      IF COL_LENGTH(N'${hrmsObjectName("SalaryReassessments")}', N'NetSalary') IS NULL
      BEGIN
        ALTER TABLE ${hrmsTable("SalaryReassessments")} ADD NetSalary DECIMAL(18,2) NULL;
      END
    `);
  })();

  try {
    await ensureHrmsSalaryReassessmentsTablePromise;
  } finally {
    ensureHrmsSalaryReassessmentsTablePromise = null;
  }
};

const normalizeHrmsScore = (value) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return 0;
  }
  return Math.min(100, Math.max(0, Math.trunc(parsed)));
};

const normalizeHrmsDecimal = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const calculateHrmsPfAmount = (grossSalary) =>
  Math.round(normalizeHrmsDecimal(grossSalary) * 0.12);

const calculateHrmsEsiAmount = (grossSalary) =>
  Math.round(normalizeHrmsDecimal(grossSalary) * 0.015);

const buildHrmsSalaryReassessmentPayload = (source = {}) => {
  const reviewDate = parseHrmsDateInput(source.reviewDate ?? source.ReviewDate);
  const promotionEffectiveDate = parseHrmsDateInput(
    source.promotionEffectiveDate ??
      source.PromotionEffectiveDate ??
      source.effectiveDate
  );
  if (Number.isNaN(reviewDate)) {
    const error = new Error("Invalid review date.");
    error.statusCode = 400;
    throw error;
  }
  if (Number.isNaN(promotionEffectiveDate)) {
    const error = new Error("Invalid promotion effective date.");
    error.statusCode = 400;
    throw error;
  }

  const metrics = source.metrics ?? {};
  const salaryStatus =
    trimToLength(
      source.salaryStatus ??
        source.status ??
        source.SalaryActivatedStatus ??
        source.Status,
      50
    ) ?? "Pending";
  const revisedSalary = normalizeHrmsDecimal(
    source.revisedSalary ?? source.RevisedSalary
  );
  const allowances = normalizeHrmsDecimal(
    source.allowances ?? source.allowance ?? source.Allowances
  );
  const salaryDeduction = normalizeHrmsDecimal(
    source.salaryDeduction ?? source.deduction ?? source.SalaryDeduction
  );
  const providedPfAmount =
    source.pfAmount ?? source.providentFund ?? source.ProvidentFund;
  const pfAmount =
    providedPfAmount === undefined ||
    providedPfAmount === null ||
    providedPfAmount === ""
      ? calculateHrmsPfAmount(revisedSalary)
      : normalizeHrmsDecimal(providedPfAmount);
  const providedEsiAmount = source.esiAmount ?? source.esi ?? source.ESIAmount;
  const esiAmount =
    providedEsiAmount === undefined ||
    providedEsiAmount === null ||
    providedEsiAmount === ""
      ? calculateHrmsEsiAmount(revisedSalary)
      : normalizeHrmsDecimal(providedEsiAmount);
  const professionalTax = normalizeHrmsDecimal(
    source.professionalTax ?? source.pt ?? source.ProfessionalTax
  );
  const tdsAmount = normalizeHrmsDecimal(
    source.tdsAmount ?? source.tds ?? source.TDSAmount
  );
  const totalDeductions =
    salaryDeduction + pfAmount + esiAmount + professionalTax + tdsAmount;
  const netSalary = revisedSalary + allowances - totalDeductions;

  return {
    employeeId: trimToLength(source.employeeId ?? source.EmployeeID, 20),
    reviewPeriod: trimToLength(source.reviewPeriod ?? source.ReviewPeriod, 100),
    reviewerName: trimToLength(source.reviewerName ?? source.ReviewerName, 150),
    reviewDate,
    kpiScore: normalizeHrmsScore(source.kpiScore ?? source.KPIScore),
    attendanceScore: normalizeHrmsScore(
      source.attendanceScore ?? source.AttendanceScore
    ),
    behaviorScore: normalizeHrmsScore(
      source.behaviorScore ?? source.BehaviorScore
    ),
    productivityScore: normalizeHrmsScore(
      source.productivityScore ?? source.ProductivityScore
    ),
    workQuality: normalizeHrmsScore(
      metrics.workQuality ?? source.workQuality ?? source.WorkQuality
    ),
    communication: normalizeHrmsScore(
      metrics.communication ?? source.communication ?? source.Communication
    ),
    teamwork: normalizeHrmsScore(
      metrics.teamwork ?? source.teamwork ?? source.Teamwork
    ),
    leadership: normalizeHrmsScore(
      metrics.leadership ?? source.leadership ?? source.Leadership
    ),
    punctuality: normalizeHrmsScore(
      metrics.punctuality ?? source.punctuality ?? source.Punctuality
    ),
    taskCompletion: normalizeHrmsScore(
      metrics.taskCompletion ?? source.taskCompletion ?? source.TaskCompletion
    ),
    innovation: normalizeHrmsScore(
      metrics.innovation ?? source.innovation ?? source.Innovation
    ),
    clientFeedback: normalizeHrmsScore(
      metrics.clientFeedback ?? source.clientFeedback ?? source.ClientFeedback
    ),
    reporting: normalizeHrmsScore(
      metrics.reporting ?? source.reporting ?? source.Reporting
    ),
    skillDevelopment: normalizeHrmsScore(
      metrics.skillDevelopment ??
        source.skillDevelopment ??
        source.SkillDevelopment
    ),
    currentSalary: normalizeHrmsDecimal(
      source.currentSalary ?? source.CurrentSalary
    ),
    incrementPercent: normalizeHrmsDecimal(
      source.incrementPercent ??
        source.recommendedIncrementPercent ??
        source.RecommendedIncrementPercent
    ),
    bonus: normalizeHrmsDecimal(source.bonus ?? source.Bonus),
    revisedSalary,
    allowances,
    salaryDeduction,
    providentFund: pfAmount,
    esiAmount,
    professionalTax,
    tdsAmount,
    totalDeductions,
    netSalary,
    currentRole: trimToLength(source.currentRole ?? source.CurrentRole, 100),
    proposedRole: trimToLength(source.proposedRole ?? source.ProposedRole, 100),
    promotionEffectiveDate,
    departmentTransfer: trimToLength(
      source.departmentTransfer ?? source.DepartmentTransfer,
      100
    ),
    strengths: trimToLength(
      source.strengths ?? source.EmployeeStrengths,
      1000
    ),
    improvement: trimToLength(
      source.improvement ?? source.AreasOfImprovement,
      1000
    ),
    hrComments: trimToLength(source.hrComments ?? source.HRComments, 1000),
    managerComments: trimToLength(
      source.managerComments ?? source.ManagerComments,
      1000
    ),
    employeeSelfReview: trimToLength(
      source.employeeSelfReview ?? source.EmployeeSelfReview,
      1000
    ),
    managerStatus:
      trimToLength(source.managerStatus ?? source.ManagerReviewStatus, 50) ??
      "Pending",
    hrStatus:
      trimToLength(source.hrStatus ?? source.HRApprovalStatus, 50) ?? "Pending",
    directorStatus:
      trimToLength(source.directorStatus ?? source.DirectorApprovalStatus, 50) ??
      "Pending",
    salaryActivationStatus:
      trimToLength(
        source.salaryActivationStatus ?? source.SalaryActivatedStatus,
        50
      ) ?? salaryStatus,
    acknowledgement:
      trimToLength(
        source.acknowledgement ?? source.AcknowledgementStatus,
        50
      ) ?? "Pending",
    employeeComment: trimToLength(
      source.employeeComment ?? source.EmployeeComments,
      1000
    ),
    digitalSignature: trimToLength(
      source.digitalSignature ?? source.DigitalSignature,
      150
    ),
    status: salaryStatus,
  };
};

const normalizeHrmsSalaryReassessmentRow = (row = {}) => ({
  id: String(row.Id ?? ""),
  employeeId: row.EmployeeID ?? "",
  employeeName: row.EmployeeName ?? row.FullName ?? row.EmployeeID ?? "",
  reviewPeriod: row.ReviewPeriod ?? "",
  reviewerName: row.ReviewerName ?? "",
  reviewDate: formatHrmsDate(row.ReviewDate),
  kpiScore: Number(row.KPIScore ?? 0),
  attendanceScore: Number(row.AttendanceScore ?? 0),
  behaviorScore: Number(row.BehaviorScore ?? 0),
  productivityScore: Number(row.ProductivityScore ?? 0),
  metrics: {
    workQuality: Number(row.WorkQuality ?? 0),
    communication: Number(row.Communication ?? 0),
    teamwork: Number(row.Teamwork ?? 0),
    leadership: Number(row.Leadership ?? 0),
    punctuality: Number(row.Punctuality ?? 0),
    taskCompletion: Number(row.TaskCompletion ?? 0),
    innovation: Number(row.Innovation ?? 0),
    clientFeedback: Number(row.ClientFeedback ?? 0),
    reporting: Number(row.Reporting ?? 0),
    skillDevelopment: Number(row.SkillDevelopment ?? 0),
  },
  currentSalary: Number(row.CurrentSalary ?? 0),
  incrementPercent: Number(row.RecommendedIncrementPercent ?? 0),
  bonus: Number(row.Bonus ?? 0),
  revisedSalary: Number(row.RevisedSalary ?? 0),
  salaryDeduction: Number(row.SalaryDeduction ?? 0),
  deduction: Number(row.SalaryDeduction ?? 0),
  pfAmount:
    normalizeHrmsOptionalDecimal(row.ProvidentFund) ??
    calculateHrmsPfAmount(row.RevisedSalary),
  providentFund:
    normalizeHrmsOptionalDecimal(row.ProvidentFund) ??
    calculateHrmsPfAmount(row.RevisedSalary),
  esiAmount:
    normalizeHrmsOptionalDecimal(row.ESIAmount) ??
    calculateHrmsEsiAmount(row.RevisedSalary),
  esi:
    normalizeHrmsOptionalDecimal(row.ESIAmount) ??
    calculateHrmsEsiAmount(row.RevisedSalary),
  totalDeductions:
    normalizeHrmsOptionalDecimal(row.TotalDeductions) ??
    Number(row.SalaryDeduction ?? 0) +
      (normalizeHrmsOptionalDecimal(row.ProvidentFund) ??
        calculateHrmsPfAmount(row.RevisedSalary)) +
      (normalizeHrmsOptionalDecimal(row.ESIAmount) ??
        calculateHrmsEsiAmount(row.RevisedSalary)),
  netSalary:
    normalizeHrmsOptionalDecimal(row.NetSalary) ??
    Number(row.RevisedSalary ?? 0) -
      (Number(row.SalaryDeduction ?? 0) +
        (normalizeHrmsOptionalDecimal(row.ProvidentFund) ??
          calculateHrmsPfAmount(row.RevisedSalary)) +
        (normalizeHrmsOptionalDecimal(row.ESIAmount) ??
          calculateHrmsEsiAmount(row.RevisedSalary))),
  currentRole: row.CurrentRole ?? "",
  proposedRole: row.ProposedRole ?? "",
  effectiveDate: formatHrmsDate(row.PromotionEffectiveDate),
  promotionEffectiveDate: formatHrmsDate(row.PromotionEffectiveDate),
  departmentTransfer: row.DepartmentTransfer ?? "",
  strengths: row.EmployeeStrengths ?? "",
  improvement: row.AreasOfImprovement ?? "",
  hrComments: row.HRComments ?? "",
  managerComments: row.ManagerComments ?? "",
  employeeSelfReview: row.EmployeeSelfReview ?? "",
  managerStatus: row.ManagerReviewStatus ?? "Pending",
  hrStatus: row.HRApprovalStatus ?? "Pending",
  directorStatus: row.DirectorApprovalStatus ?? "Pending",
  salaryActivationStatus: row.SalaryActivatedStatus ?? "Pending",
  salaryStatus: row.Status ?? row.SalaryActivatedStatus ?? "Pending",
  acknowledgement: row.AcknowledgementStatus ?? "Pending",
  employeeComment: row.EmployeeComments ?? "",
  digitalSignature: row.DigitalSignature ?? "",
  status: row.Status ?? "Pending",
  savedAt: row.SavedDate ?? null,
});

const loadHrmsSalaryReassessmentById = async (source, id) => {
  const result = await createDbRequest(source)
    .input("Id", sql.Int, id)
    .query(`
      SELECT
        s.*,
        COALESCE(e.FullName, s.EmployeeID) AS EmployeeName
      FROM ${hrmsTable("SalaryReassessments")} s
      LEFT JOIN ${hrmsTable("Employees")} e
        ON s.EmployeeID = e.EmployeeID
      WHERE s.Id = @Id
    `);
  const row = result.recordset?.[0];
  return row ? normalizeHrmsSalaryReassessmentRow(row) : null;
};

const bindHrmsSalaryReassessmentInputs = (request, payload) =>
  request
    .input("EmployeeID", sql.VarChar(20), payload.employeeId)
    .input("ReviewPeriod", sql.VarChar(100), payload.reviewPeriod)
    .input("ReviewerName", sql.VarChar(150), payload.reviewerName)
    .input("ReviewDate", sql.Date, payload.reviewDate)
    .input("KPIScore", sql.Int, payload.kpiScore)
    .input("AttendanceScore", sql.Int, payload.attendanceScore)
    .input("BehaviorScore", sql.Int, payload.behaviorScore)
    .input("ProductivityScore", sql.Int, payload.productivityScore)
    .input("WorkQuality", sql.Int, payload.workQuality)
    .input("Communication", sql.Int, payload.communication)
    .input("Teamwork", sql.Int, payload.teamwork)
    .input("Leadership", sql.Int, payload.leadership)
    .input("Punctuality", sql.Int, payload.punctuality)
    .input("TaskCompletion", sql.Int, payload.taskCompletion)
    .input("Innovation", sql.Int, payload.innovation)
    .input("ClientFeedback", sql.Int, payload.clientFeedback)
    .input("Reporting", sql.Int, payload.reporting)
    .input("SkillDevelopment", sql.Int, payload.skillDevelopment)
    .input("CurrentSalary", sql.Decimal(18, 2), payload.currentSalary)
    .input(
      "RecommendedIncrementPercent",
      sql.Decimal(5, 2),
      payload.incrementPercent
    )
    .input("Bonus", sql.Decimal(18, 2), payload.bonus)
    .input("RevisedSalary", sql.Decimal(18, 2), payload.revisedSalary)
    .input("SalaryDeduction", sql.Decimal(18, 2), payload.salaryDeduction)
    .input("ProvidentFund", sql.Decimal(18, 2), payload.providentFund)
    .input("ESIAmount", sql.Decimal(18, 2), payload.esiAmount)
    .input("TotalDeductions", sql.Decimal(18, 2), payload.totalDeductions)
    .input("NetSalary", sql.Decimal(18, 2), payload.netSalary)
    .input("CurrentRole", sql.VarChar(100), payload.currentRole)
    .input("ProposedRole", sql.VarChar(100), payload.proposedRole)
    .input("PromotionEffectiveDate", sql.Date, payload.promotionEffectiveDate)
    .input("DepartmentTransfer", sql.VarChar(100), payload.departmentTransfer)
    .input("EmployeeStrengths", sql.VarChar(1000), payload.strengths)
    .input("AreasOfImprovement", sql.VarChar(1000), payload.improvement)
    .input("HRComments", sql.VarChar(1000), payload.hrComments)
    .input("ManagerComments", sql.VarChar(1000), payload.managerComments)
    .input("EmployeeSelfReview", sql.VarChar(1000), payload.employeeSelfReview)
    .input("ManagerReviewStatus", sql.VarChar(50), payload.managerStatus)
    .input("HRApprovalStatus", sql.VarChar(50), payload.hrStatus)
    .input("DirectorApprovalStatus", sql.VarChar(50), payload.directorStatus)
    .input(
      "SalaryActivatedStatus",
      sql.VarChar(50),
      payload.salaryActivationStatus
    )
    .input("AcknowledgementStatus", sql.VarChar(50), payload.acknowledgement)
    .input("EmployeeComments", sql.VarChar(1000), payload.employeeComment)
    .input("DigitalSignature", sql.VarChar(150), payload.digitalSignature)
    .input("Status", sql.VarChar(50), payload.status);

app.get("/api/hrms/salary-reassessments", async (_req, res) => {
  try {
    await ensureHrmsSalaryReassessmentsTable();
    const pool = await getPool();
    const result = await pool.request().query(`
      SELECT
        s.*,
        COALESCE(e.FullName, s.EmployeeID) AS EmployeeName
      FROM ${hrmsTable("SalaryReassessments")} s
      LEFT JOIN ${hrmsTable("Employees")} e
        ON s.EmployeeID = e.EmployeeID
      ORDER BY s.SavedDate DESC, s.Id DESC
    `);

    return res.json({
      ok: true,
      salaryReassessments: (result.recordset ?? []).map(
        normalizeHrmsSalaryReassessmentRow
      ),
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error?.message ?? "Failed to fetch HRMS salary reassessments",
    });
  }
});

app.post("/api/hrms/salary-reassessments", async (req, res) => {
  try {
    await ensureHrmsSalaryReassessmentsTable();
    const payload = buildHrmsSalaryReassessmentPayload(req.body);
    if (!payload.employeeId) {
      return res.status(400).json({
        ok: false,
        error: "employeeId is required.",
      });
    }

    const pool = await getPool();
    const insertRequest = bindHrmsSalaryReassessmentInputs(
      pool.request(),
      payload
    );
    const insertResult = await insertRequest.query(`
      INSERT INTO ${hrmsTable("SalaryReassessments")} (
        EmployeeID,
        ReviewPeriod,
        ReviewerName,
        ReviewDate,
        KPIScore,
        AttendanceScore,
        BehaviorScore,
        ProductivityScore,
        WorkQuality,
        Communication,
        Teamwork,
        Leadership,
        Punctuality,
        TaskCompletion,
        Innovation,
        ClientFeedback,
        Reporting,
        SkillDevelopment,
        CurrentSalary,
        RecommendedIncrementPercent,
        Bonus,
        RevisedSalary,
        SalaryDeduction,
        ProvidentFund,
        ESIAmount,
        TotalDeductions,
        NetSalary,
        CurrentRole,
        ProposedRole,
        PromotionEffectiveDate,
        DepartmentTransfer,
        EmployeeStrengths,
        AreasOfImprovement,
        HRComments,
        ManagerComments,
        EmployeeSelfReview,
        ManagerReviewStatus,
        HRApprovalStatus,
        DirectorApprovalStatus,
        SalaryActivatedStatus,
        AcknowledgementStatus,
        EmployeeComments,
        DigitalSignature,
        Status,
        SavedDate
      )
      OUTPUT INSERTED.Id AS id
      VALUES (
        @EmployeeID,
        @ReviewPeriod,
        @ReviewerName,
        @ReviewDate,
        @KPIScore,
        @AttendanceScore,
        @BehaviorScore,
        @ProductivityScore,
        @WorkQuality,
        @Communication,
        @Teamwork,
        @Leadership,
        @Punctuality,
        @TaskCompletion,
        @Innovation,
        @ClientFeedback,
        @Reporting,
        @SkillDevelopment,
        @CurrentSalary,
        @RecommendedIncrementPercent,
        @Bonus,
        @RevisedSalary,
        @SalaryDeduction,
        @ProvidentFund,
        @ESIAmount,
        @TotalDeductions,
        @NetSalary,
        @CurrentRole,
        @ProposedRole,
        @PromotionEffectiveDate,
        @DepartmentTransfer,
        @EmployeeStrengths,
        @AreasOfImprovement,
        @HRComments,
        @ManagerComments,
        @EmployeeSelfReview,
        @ManagerReviewStatus,
        @HRApprovalStatus,
        @DirectorApprovalStatus,
        @SalaryActivatedStatus,
        @AcknowledgementStatus,
        @EmployeeComments,
        @DigitalSignature,
        @Status,
        GETDATE()
      )
    `);

    const id = toNullableInt(insertResult.recordset?.[0]?.id);
    const salaryReassessment = await loadHrmsSalaryReassessmentById(pool, id);
    return res.status(201).json({ ok: true, salaryReassessment });
  } catch (error) {
    return res.status(error?.statusCode ?? 500).json({
      ok: false,
      error: error?.message ?? "Failed to create HRMS salary reassessment",
    });
  }
});

app.put("/api/hrms/salary-reassessments/:id", async (req, res) => {
  const id = toNullableInt(req.params.id);
  if (id === null) {
    return res.status(400).json({
      ok: false,
      error: "Invalid salary reassessment id.",
    });
  }

  try {
    await ensureHrmsSalaryReassessmentsTable();
    const pool = await getPool();
    const existing = await loadHrmsSalaryReassessmentById(pool, id);
    if (!existing) {
      return res.status(404).json({
        ok: false,
        error: "Salary reassessment not found.",
      });
    }

    const payload = buildHrmsSalaryReassessmentPayload({
      ...existing,
      ...req.body,
      employeeId: req.body?.employeeId ?? existing.employeeId,
    });
    if (!payload.employeeId) {
      return res.status(400).json({
        ok: false,
        error: "employeeId is required.",
      });
    }

    const updateRequest = bindHrmsSalaryReassessmentInputs(
      pool.request().input("Id", sql.Int, id),
      payload
    );
    await updateRequest.query(`
      UPDATE ${hrmsTable("SalaryReassessments")}
      SET
        EmployeeID = @EmployeeID,
        ReviewPeriod = @ReviewPeriod,
        ReviewerName = @ReviewerName,
        ReviewDate = @ReviewDate,
        KPIScore = @KPIScore,
        AttendanceScore = @AttendanceScore,
        BehaviorScore = @BehaviorScore,
        ProductivityScore = @ProductivityScore,
        WorkQuality = @WorkQuality,
        Communication = @Communication,
        Teamwork = @Teamwork,
        Leadership = @Leadership,
        Punctuality = @Punctuality,
        TaskCompletion = @TaskCompletion,
        Innovation = @Innovation,
        ClientFeedback = @ClientFeedback,
        Reporting = @Reporting,
        SkillDevelopment = @SkillDevelopment,
        CurrentSalary = @CurrentSalary,
        RecommendedIncrementPercent = @RecommendedIncrementPercent,
        Bonus = @Bonus,
        RevisedSalary = @RevisedSalary,
        SalaryDeduction = @SalaryDeduction,
        ProvidentFund = @ProvidentFund,
        ESIAmount = @ESIAmount,
        TotalDeductions = @TotalDeductions,
        NetSalary = @NetSalary,
        CurrentRole = @CurrentRole,
        ProposedRole = @ProposedRole,
        PromotionEffectiveDate = @PromotionEffectiveDate,
        DepartmentTransfer = @DepartmentTransfer,
        EmployeeStrengths = @EmployeeStrengths,
        AreasOfImprovement = @AreasOfImprovement,
        HRComments = @HRComments,
        ManagerComments = @ManagerComments,
        EmployeeSelfReview = @EmployeeSelfReview,
        ManagerReviewStatus = @ManagerReviewStatus,
        HRApprovalStatus = @HRApprovalStatus,
        DirectorApprovalStatus = @DirectorApprovalStatus,
        SalaryActivatedStatus = @SalaryActivatedStatus,
        AcknowledgementStatus = @AcknowledgementStatus,
        EmployeeComments = @EmployeeComments,
        DigitalSignature = @DigitalSignature,
        Status = @Status
      WHERE Id = @Id
    `);

    const salaryReassessment = await loadHrmsSalaryReassessmentById(pool, id);
    return res.json({ ok: true, salaryReassessment });
  } catch (error) {
    return res.status(error?.statusCode ?? 500).json({
      ok: false,
      error: error?.message ?? "Failed to update HRMS salary reassessment",
    });
  }
});

app.delete("/api/hrms/salary-reassessments/:id", async (req, res) => {
  const id = toNullableInt(req.params.id);
  if (id === null) {
    return res.status(400).json({
      ok: false,
      error: "Invalid salary reassessment id.",
    });
  }

  try {
    await ensureHrmsSalaryReassessmentsTable();
    const pool = await getPool();
    const result = await pool
      .request()
      .input("Id", sql.Int, id)
      .query(`
        DELETE FROM ${hrmsTable("SalaryReassessments")}
        WHERE Id = @Id
      `);

    if ((result.rowsAffected?.[0] ?? 0) === 0) {
      return res.status(404).json({
        ok: false,
        error: "Salary reassessment not found.",
      });
    }

    return res.json({ ok: true });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error?.message ?? "Failed to delete HRMS salary reassessment",
    });
  }
});

let ensureHrmsAttendanceTablePromise = null;

const ensureHrmsAttendanceTable = async () => {
  if (ensureHrmsAttendanceTablePromise) {
    return ensureHrmsAttendanceTablePromise;
  }

  ensureHrmsAttendanceTablePromise = (async () => {
    await ensureHrmsEmployeesTable();
    const pool = await getPool();
    await pool.request().query(`
      IF OBJECT_ID(N'${hrmsObjectName("Attendance")}', N'U') IS NULL
      BEGIN
        CREATE TABLE ${hrmsTable("Attendance")} (
          Id INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
          EmployeeID VARCHAR(20) NOT NULL,
          AttendanceMonth VARCHAR(50) NOT NULL,
          DayStatusJson VARCHAR(MAX) NULL,
          PresentCount INT NULL,
          AbsentCount INT NULL,
          LeaveCount INT NULL,
          HolidayCount INT NULL,
          SavedDate DATETIME NULL
        );
      END
    `);
  })();

  try {
    await ensureHrmsAttendanceTablePromise;
  } finally {
    ensureHrmsAttendanceTablePromise = null;
  }
};

const hrmsAttendanceStatuses = new Set(["P", "A", "L", "H"]);

const normalizeHrmsAttendanceStatus = (value) => {
  const status = String(value || "P").trim().toUpperCase();
  return hrmsAttendanceStatuses.has(status) ? status : "P";
};

const parseHrmsAttendanceStatuses = (value) => {
  let parsed = value;
  if (typeof value === "string") {
    try {
      parsed = JSON.parse(value);
    } catch {
      parsed = [];
    }
  }

  if (Array.isArray(parsed)) {
    return Array.from({ length: 31 }, (_, index) =>
      normalizeHrmsAttendanceStatus(parsed[index])
    );
  }

  if (parsed && typeof parsed === "object") {
    return Array.from({ length: 31 }, (_, index) =>
      normalizeHrmsAttendanceStatus(
        parsed[String(index + 1)] ?? parsed[index + 1]
      )
    );
  }

  return Array.from({ length: 31 }, () => "P");
};

const buildHrmsAttendanceStatusMap = (statuses = []) =>
  Array.from({ length: 31 }, (_, index) => [
    String(index + 1),
    normalizeHrmsAttendanceStatus(statuses[index]),
  ]).reduce(
    (statusMap, [day, status]) => ({
      ...statusMap,
      [day]: status,
    }),
    {}
  );

const countHrmsAttendanceStatuses = (statuses = []) =>
  statuses.reduce(
    (counts, status) => {
      const key = normalizeHrmsAttendanceStatus(status);
      counts[key] += 1;
      return counts;
    },
    { A: 0, H: 0, L: 0, P: 0 }
  );

const buildHrmsAttendancePayload = (source = {}) => {
  const statuses = parseHrmsAttendanceStatuses(
    source.statuses ?? source.DayStatusJson ?? source.dayStatusJson
  );
  const counts = countHrmsAttendanceStatuses(statuses);

  return {
    employeeId: trimToLength(source.employeeId ?? source.EmployeeID, 20),
    month: trimToLength(
      source.month ?? source.AttendanceMonth ?? source.attendanceMonth,
      50
    ),
    statuses,
    dayStatusJson: serializeJson(buildHrmsAttendanceStatusMap(statuses)),
    counts,
  };
};

const normalizeHrmsAttendanceRow = (row = {}) => {
  const statuses = parseHrmsAttendanceStatuses(row.DayStatusJson);
  const calculatedCounts = countHrmsAttendanceStatuses(statuses);

  return {
    id: String(row.Id ?? ""),
    employeeId: row.EmployeeID ?? "",
    employeeName: row.EmployeeName ?? row.FullName ?? row.EmployeeID ?? "",
    month: row.AttendanceMonth ?? "",
    statuses,
    counts: {
      P: Number(row.PresentCount ?? calculatedCounts.P ?? 0),
      A: Number(row.AbsentCount ?? calculatedCounts.A ?? 0),
      L: Number(row.LeaveCount ?? calculatedCounts.L ?? 0),
      H: Number(row.HolidayCount ?? calculatedCounts.H ?? 0),
    },
    savedAt: row.SavedDate ?? null,
  };
};

const loadHrmsAttendanceById = async (source, id) => {
  const result = await createDbRequest(source)
    .input("Id", sql.Int, id)
    .query(`
      SELECT
        a.*,
        COALESCE(e.FullName, a.EmployeeID) AS EmployeeName
      FROM ${hrmsTable("Attendance")} a
      LEFT JOIN ${hrmsTable("Employees")} e
        ON a.EmployeeID = e.EmployeeID
      WHERE a.Id = @Id
    `);
  const row = result.recordset?.[0];
  return row ? normalizeHrmsAttendanceRow(row) : null;
};

app.get("/api/hrms/attendance", async (_req, res) => {
  try {
    await ensureHrmsAttendanceTable();
    const pool = await getPool();
    const result = await pool.request().query(`
      SELECT
        a.*,
        COALESCE(e.FullName, a.EmployeeID) AS EmployeeName
      FROM ${hrmsTable("Attendance")} a
      LEFT JOIN ${hrmsTable("Employees")} e
        ON a.EmployeeID = e.EmployeeID
      ORDER BY a.SavedDate DESC, a.Id DESC
    `);

    return res.json({
      ok: true,
      attendance: (result.recordset ?? []).map(normalizeHrmsAttendanceRow),
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error?.message ?? "Failed to fetch HRMS attendance",
    });
  }
});

app.post("/api/hrms/attendance", async (req, res) => {
  try {
    await ensureHrmsAttendanceTable();
    const payload = buildHrmsAttendancePayload(req.body);

    if (!payload.employeeId) {
      return res.status(400).json({
        ok: false,
        error: "employeeId is required.",
      });
    }

    if (!payload.month) {
      return res.status(400).json({
        ok: false,
        error: "month is required.",
      });
    }

    const pool = await getPool();
    const existingResult = await pool
      .request()
      .input("EmployeeID", sql.VarChar(20), payload.employeeId)
      .input("AttendanceMonth", sql.VarChar(50), payload.month)
      .query(`
        SELECT TOP (1) Id
        FROM ${hrmsTable("Attendance")}
        WHERE EmployeeID = @EmployeeID
          AND AttendanceMonth = @AttendanceMonth
        ORDER BY Id DESC
      `);
    const existingId = toNullableInt(existingResult.recordset?.[0]?.Id);

    const saveRequest = pool
      .request()
      .input("EmployeeID", sql.VarChar(20), payload.employeeId)
      .input("AttendanceMonth", sql.VarChar(50), payload.month)
      .input("DayStatusJson", sql.VarChar(sql.MAX), payload.dayStatusJson)
      .input("PresentCount", sql.Int, payload.counts.P)
      .input("AbsentCount", sql.Int, payload.counts.A)
      .input("LeaveCount", sql.Int, payload.counts.L)
      .input("HolidayCount", sql.Int, payload.counts.H);

    let id = existingId;
    if (existingId !== null) {
      await saveRequest.input("Id", sql.Int, existingId).query(`
        UPDATE ${hrmsTable("Attendance")}
        SET
          DayStatusJson = @DayStatusJson,
          PresentCount = @PresentCount,
          AbsentCount = @AbsentCount,
          LeaveCount = @LeaveCount,
          HolidayCount = @HolidayCount,
          SavedDate = GETDATE()
        WHERE Id = @Id
      `);
    } else {
      const insertResult = await saveRequest.query(`
        INSERT INTO ${hrmsTable("Attendance")} (
          EmployeeID,
          AttendanceMonth,
          DayStatusJson,
          PresentCount,
          AbsentCount,
          LeaveCount,
          HolidayCount,
          SavedDate
        )
        OUTPUT INSERTED.Id AS id
        VALUES (
          @EmployeeID,
          @AttendanceMonth,
          @DayStatusJson,
          @PresentCount,
          @AbsentCount,
          @LeaveCount,
          @HolidayCount,
          GETDATE()
        )
      `);
      id = toNullableInt(insertResult.recordset?.[0]?.id);
    }

    const attendanceRecord = await loadHrmsAttendanceById(pool, id);
    return res.status(existingId !== null ? 200 : 201).json({
      ok: true,
      attendanceRecord,
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error?.message ?? "Failed to save HRMS attendance",
    });
  }
});

let ensureHrmsSalariesTablePromise = null;

const ensureHrmsSalariesTable = async () => {
  if (ensureHrmsSalariesTablePromise) {
    return ensureHrmsSalariesTablePromise;
  }

  ensureHrmsSalariesTablePromise = (async () => {
    await ensureHrmsEmployeesTable();
    const pool = await getPool();
    await pool.request().query(`
      IF OBJECT_ID(N'${hrmsObjectName("Salaries")}', N'U') IS NULL
      BEGIN
        CREATE TABLE ${hrmsTable("Salaries")} (
          Id INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
          EmployeeID VARCHAR(20) NOT NULL,
          PayrollMonth VARCHAR(50) NOT NULL,
          Department VARCHAR(100) NULL,
          BasicSalary DECIMAL(12,2) NULL,
          Allowances DECIMAL(12,2) NULL,
          Deductions DECIMAL(12,2) NULL,
          PFAmount DECIMAL(12,2) NULL,
          ESIAmount DECIMAL(12,2) NULL,
          ProfessionalTax DECIMAL(12,2) NULL,
          TDSAmount DECIMAL(12,2) NULL,
          NetSalary AS (ISNULL(BasicSalary, 0) + ISNULL(Allowances, 0) - ISNULL(Deductions, 0) - ISNULL(PFAmount, 0) - ISNULL(ESIAmount, 0) - ISNULL(ProfessionalTax, 0) - ISNULL(TDSAmount, 0)),
          Status VARCHAR(50) NULL,
          SavedDate DATETIME NULL
        );
      END

      IF COL_LENGTH(N'${hrmsObjectName("Salaries")}', N'Allowances') IS NULL
      BEGIN
        ALTER TABLE ${hrmsTable("Salaries")} ADD Allowances DECIMAL(12,2) NULL;
      END

      IF COL_LENGTH(N'${hrmsObjectName("Salaries")}', N'PFAmount') IS NULL
      BEGIN
        ALTER TABLE ${hrmsTable("Salaries")} ADD PFAmount DECIMAL(12,2) NULL;
      END

      IF COL_LENGTH(N'${hrmsObjectName("Salaries")}', N'ESIAmount') IS NULL
      BEGIN
        ALTER TABLE ${hrmsTable("Salaries")} ADD ESIAmount DECIMAL(12,2) NULL;
      END

      IF COL_LENGTH(N'${hrmsObjectName("Salaries")}', N'ProfessionalTax') IS NULL
      BEGIN
        ALTER TABLE ${hrmsTable("Salaries")} ADD ProfessionalTax DECIMAL(12,2) NULL;
      END

      IF COL_LENGTH(N'${hrmsObjectName("Salaries")}', N'TDSAmount') IS NULL
      BEGIN
        ALTER TABLE ${hrmsTable("Salaries")} ADD TDSAmount DECIMAL(12,2) NULL;
      END
    `);
  })();

  try {
    await ensureHrmsSalariesTablePromise;
  } finally {
    ensureHrmsSalariesTablePromise = null;
  }
};

const buildHrmsSalaryPayload = (source = {}, inherited = {}) => {
  const basicSalary = normalizeHrmsDecimal(
    source.salary ?? source.basicSalary ?? source.BasicSalary
  );
  const allowances = normalizeHrmsDecimal(
    source.allowance ?? source.allowances ?? source.Allowances
  );
  const deductions = normalizeHrmsDecimal(
    source.deduction ?? source.deductions ?? source.Deductions
  );
  const professionalTax = normalizeHrmsDecimal(
    source.professionalTax ?? source.pt ?? source.ProfessionalTax
  );
  const tdsAmount = normalizeHrmsDecimal(
    source.tdsAmount ?? source.tds ?? source.TDSAmount
  );
  const providedPfAmount =
    source.pfAmount ?? source.providentFund ?? source.PFAmount;
  const pfAmount =
    providedPfAmount === undefined ||
    providedPfAmount === null ||
    providedPfAmount === ""
      ? calculateHrmsPfAmount(basicSalary)
      : normalizeHrmsDecimal(providedPfAmount);
  const providedEsiAmount = source.esiAmount ?? source.esi ?? source.ESIAmount;
  const esiAmount =
    providedEsiAmount === undefined ||
    providedEsiAmount === null ||
    providedEsiAmount === ""
      ? calculateHrmsEsiAmount(basicSalary)
      : normalizeHrmsDecimal(providedEsiAmount);
  const netSalary =
    basicSalary + allowances - deductions - pfAmount - esiAmount - professionalTax - tdsAmount;

  return {
    employeeId: trimToLength(
      source.employeeId ?? source.EmployeeID ?? source.id,
      20
    ),
    month: trimToLength(
      inherited.month ??
        inherited.PayrollMonth ??
        source.month ??
        source.payrollMonth ??
        source.PayrollMonth,
      50
    ),
    department:
      trimToLength(
        inherited.department ??
          inherited.Department ??
          source.department ??
          source.Department,
        100
      ) ?? "All",
    basicSalary,
    allowances,
    deductions,
    esiAmount,
    netSalary,
    pfAmount,
    professionalTax,
    tdsAmount,
    status:
      trimToLength(source.status ?? source.Status, 50) ?? "Processed",
  };
};

const normalizeHrmsSalaryRow = (row = {}) => {
  const basicSalary = Number(row.BasicSalary ?? 0);
  const allowances = Number(row.Allowances ?? 0);
  const deductions = Number(row.Deductions ?? 0);
  const pfAmount =
    normalizeHrmsOptionalDecimal(row.PFAmount) ?? calculateHrmsPfAmount(basicSalary);
  const esiAmount =
    normalizeHrmsOptionalDecimal(row.ESIAmount) ?? calculateHrmsEsiAmount(basicSalary);
  const professionalTax = Number(row.ProfessionalTax ?? 0);
  const tdsAmount = Number(row.TDSAmount ?? 0);
  const totalDeductions =
    deductions + pfAmount + esiAmount + professionalTax + tdsAmount;
  const netSalary = basicSalary + allowances - totalDeductions;

  return {
    id: String(row.Id ?? ""),
    employeeId: row.EmployeeID ?? "",
    employeeName: row.EmployeeName ?? row.FullName ?? row.EmployeeID ?? "",
    name: row.EmployeeName ?? row.FullName ?? row.EmployeeID ?? "",
    month: row.PayrollMonth ?? "",
    payrollMonth: row.PayrollMonth ?? "",
    department: row.Department ?? "All",
    salary: basicSalary,
    basicSalary,
    grossSalary: basicSalary,
    monthlySalary: Math.round(basicSalary / 12),
    allowance: allowances,
    allowances,
    deduction: deductions,
    deductions,
    esi: esiAmount,
    esiAmount,
    net: netSalary,
    netSalary,
    pfAmount,
    providentFund: pfAmount,
    professionalTax,
    pt: professionalTax,
    tdsAmount,
    tds: tdsAmount,
    totalEarnings: basicSalary + allowances,
    totalDeductions,
    status: row.Status ?? "Processed",
    savedAt: row.SavedDate ?? null,
  };
};

const loadHrmsSalaryRowsByIds = async (source, ids = []) => {
  const normalizedIds = ids
    .map((id) => toNullableInt(id))
    .filter((id) => id !== null);
  if (!normalizedIds.length) {
    return [];
  }

  const request = createDbRequest(source);
  const idParams = normalizedIds.map((id, index) => {
    const name = `Id${index}`;
    request.input(name, sql.Int, id);
    return `@${name}`;
  });

  const result = await request.query(`
    SELECT
      s.*,
      COALESCE(e.FullName, s.EmployeeID) AS EmployeeName
    FROM ${hrmsTable("Salaries")} s
    LEFT JOIN ${hrmsTable("Employees")} e
      ON s.EmployeeID = e.EmployeeID
    WHERE s.Id IN (${idParams.join(", ")})
    ORDER BY s.SavedDate DESC, s.Id DESC
  `);

  return (result.recordset ?? []).map(normalizeHrmsSalaryRow);
};

const isHrmsSalariesIdIdentity = async (source) => {
  const result = await createDbRequest(source).query(`
    SELECT CASE WHEN EXISTS (
      SELECT 1
      FROM ${toIdentifier(HRMS_DATABASE_NAME)}.sys.identity_columns ic
      INNER JOIN ${toIdentifier(HRMS_DATABASE_NAME)}.sys.tables t
        ON ic.object_id = t.object_id
      INNER JOIN ${toIdentifier(HRMS_DATABASE_NAME)}.sys.schemas s
        ON t.schema_id = s.schema_id
      WHERE s.name = N'dbo'
        AND t.name = N'Salaries'
        AND ic.name = N'Id'
    ) THEN 1 ELSE 0 END AS isIdentity
  `);

  return Number(result.recordset?.[0]?.isIdentity ?? 0) === 1;
};

const getNextHrmsSalaryId = async (source) => {
  const result = await createDbRequest(source).query(`
    SELECT COALESCE(MAX(Id), 0) + 1 AS nextId
    FROM ${hrmsTable("Salaries")}
  `);
  return toNullableInt(result.recordset?.[0]?.nextId) ?? 1;
};

const bindHrmsSalaryInputs = (request, payload) =>
  request
    .input("EmployeeID", sql.VarChar(20), payload.employeeId)
    .input("PayrollMonth", sql.VarChar(50), payload.month)
    .input("Department", sql.VarChar(100), payload.department)
    .input("BasicSalary", sql.Decimal(12, 2), payload.basicSalary)
    .input("Allowances", sql.Decimal(12, 2), payload.allowances)
    .input("Deductions", sql.Decimal(12, 2), payload.deductions)
    .input("PFAmount", sql.Decimal(12, 2), payload.pfAmount)
    .input("ESIAmount", sql.Decimal(12, 2), payload.esiAmount)
    .input("ProfessionalTax", sql.Decimal(12, 2), payload.professionalTax)
    .input("TDSAmount", sql.Decimal(12, 2), payload.tdsAmount)
    .input("Status", sql.VarChar(50), payload.status);

const saveHrmsSalaryRow = async (source, payload) => {
  const existingResult = await createDbRequest(source)
    .input("EmployeeID", sql.VarChar(20), payload.employeeId)
    .input("PayrollMonth", sql.VarChar(50), payload.month)
    .input("Department", sql.VarChar(100), payload.department)
    .query(`
      SELECT TOP (1) Id
      FROM ${hrmsTable("Salaries")}
      WHERE EmployeeID = @EmployeeID
        AND PayrollMonth = @PayrollMonth
        AND COALESCE(Department, '') = COALESCE(@Department, '')
      ORDER BY Id DESC
    `);
  const existingId = toNullableInt(existingResult.recordset?.[0]?.Id);

  if (existingId !== null) {
    await bindHrmsSalaryInputs(
      createDbRequest(source).input("Id", sql.Int, existingId),
      payload
    ).query(`
      UPDATE ${hrmsTable("Salaries")}
      SET
        PayrollMonth = @PayrollMonth,
        Department = @Department,
        BasicSalary = @BasicSalary,
        Allowances = @Allowances,
        Deductions = @Deductions,
        PFAmount = @PFAmount,
        ESIAmount = @ESIAmount,
        ProfessionalTax = @ProfessionalTax,
        TDSAmount = @TDSAmount,
        Status = @Status,
        SavedDate = GETDATE()
      WHERE Id = @Id
    `);
    return { created: false, id: existingId };
  }

  const hasIdentityId = await isHrmsSalariesIdIdentity(source);
  if (hasIdentityId) {
    const insertResult = await bindHrmsSalaryInputs(
      createDbRequest(source),
      payload
    ).query(`
      INSERT INTO ${hrmsTable("Salaries")} (
        EmployeeID,
        PayrollMonth,
        Department,
        BasicSalary,
        Allowances,
        Deductions,
        PFAmount,
        ESIAmount,
        ProfessionalTax,
        TDSAmount,
        Status,
        SavedDate
      )
      OUTPUT INSERTED.Id AS id
      VALUES (
        @EmployeeID,
        @PayrollMonth,
        @Department,
        @BasicSalary,
        @Allowances,
        @Deductions,
        @PFAmount,
        @ESIAmount,
        @ProfessionalTax,
        @TDSAmount,
        @Status,
        GETDATE()
      )
    `);
    return {
      created: true,
      id: toNullableInt(insertResult.recordset?.[0]?.id),
    };
  }

  const nextId = await getNextHrmsSalaryId(source);
  await bindHrmsSalaryInputs(
    createDbRequest(source).input("Id", sql.Int, nextId),
    payload
  ).query(`
    INSERT INTO ${hrmsTable("Salaries")} (
      Id,
      EmployeeID,
      PayrollMonth,
      Department,
      BasicSalary,
      Allowances,
      Deductions,
      PFAmount,
      ESIAmount,
      ProfessionalTax,
      TDSAmount,
      Status,
      SavedDate
    )
    VALUES (
      @Id,
      @EmployeeID,
      @PayrollMonth,
      @Department,
      @BasicSalary,
      @Allowances,
      @Deductions,
      @PFAmount,
      @ESIAmount,
      @ProfessionalTax,
      @TDSAmount,
      @Status,
      GETDATE()
    )
  `);
  return { created: true, id: nextId };
};

app.get("/api/hrms/salaries", async (req, res) => {
  try {
    await ensureHrmsSalariesTable();
    const month = trimToLength(req.query?.month, 50);
    const department = trimToLength(req.query?.department, 100);
    const pool = await getPool();
    const result = await pool
      .request()
      .input("PayrollMonth", sql.VarChar(50), month)
      .input("Department", sql.VarChar(100), department)
      .query(`
        SELECT
          s.*,
          COALESCE(e.FullName, s.EmployeeID) AS EmployeeName
        FROM ${hrmsTable("Salaries")} s
        LEFT JOIN ${hrmsTable("Employees")} e
          ON s.EmployeeID = e.EmployeeID
        WHERE (@PayrollMonth IS NULL OR s.PayrollMonth = @PayrollMonth)
          AND (@Department IS NULL OR COALESCE(s.Department, '') = COALESCE(@Department, ''))
        ORDER BY s.SavedDate DESC, s.Id DESC
      `);

    return res.json({
      ok: true,
      salaries: (result.recordset ?? []).map(normalizeHrmsSalaryRow),
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error?.message ?? "Failed to fetch HRMS salaries",
    });
  }
});

app.post("/api/hrms/salaries", async (req, res) => {
  let tx;
  try {
    await ensureHrmsSalariesTable();
    const rows = Array.isArray(req.body?.rows) ? req.body.rows : [req.body ?? {}];
    if (!rows.length) {
      return res.status(400).json({
        ok: false,
        error: "At least one salary row is required.",
      });
    }

    const inherited = {
      month: req.body?.month ?? req.body?.payrollMonth ?? req.body?.PayrollMonth,
      department: req.body?.department ?? req.body?.Department,
    };
    const payloads = rows.map((row) => buildHrmsSalaryPayload(row, inherited));
    const invalidPayload = payloads.find(
      (payload) => !payload.employeeId || !payload.month
    );
    if (invalidPayload) {
      return res.status(400).json({
        ok: false,
        error: invalidPayload.employeeId
          ? "month is required."
          : "employeeId is required.",
      });
    }

    const pool = await getPool();
    tx = pool.transaction();
    await tx.begin();

    const savedRows = [];
    for (const payload of payloads) {
      savedRows.push(await saveHrmsSalaryRow(tx, payload));
    }

    await tx.commit();
    const salaryRows = await loadHrmsSalaryRowsByIds(
      pool,
      savedRows.map((row) => row.id)
    );

    return res.status(savedRows.some((row) => row.created) ? 201 : 200).json({
      ok: true,
      salaryRows,
    });
  } catch (error) {
    await rollbackTx(tx);
    return res.status(error?.statusCode ?? 500).json({
      ok: false,
      error: error?.message ?? "Failed to save HRMS salaries",
    });
  }
});

app.delete("/api/hrms/salaries", async (req, res) => {
  try {
    await ensureHrmsSalariesTable();
    const month = trimToLength(
      req.body?.month ?? req.query?.month ?? req.body?.PayrollMonth,
      50
    );
    const department =
      trimToLength(
        req.body?.department ?? req.query?.department ?? req.body?.Department,
        100
      ) ?? "All";

    if (!month) {
      return res.status(400).json({
        ok: false,
        error: "month is required.",
      });
    }

    const pool = await getPool();
    const result = await pool
      .request()
      .input("PayrollMonth", sql.VarChar(50), month)
      .input("Department", sql.VarChar(100), department)
      .query(`
        DELETE FROM ${hrmsTable("Salaries")}
        WHERE PayrollMonth = @PayrollMonth
          AND COALESCE(Department, '') = COALESCE(@Department, '')
      `);

    return res.json({
      ok: true,
      deleted: result.rowsAffected?.[0] ?? 0,
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error?.message ?? "Failed to delete HRMS salary batch",
    });
  }
});

let ensureHrmsRelievingTablePromise = null;

const ensureHrmsRelievingTable = async () => {
  if (ensureHrmsRelievingTablePromise) {
    return ensureHrmsRelievingTablePromise;
  }

  ensureHrmsRelievingTablePromise = (async () => {
    await ensureHrmsEmployeesTable();
    const pool = await getPool();
    await pool.request().query(`
      IF OBJECT_ID(N'${hrmsObjectName("Relieving")}', N'U') IS NULL
      BEGIN
        CREATE TABLE ${hrmsTable("Relieving")} (
          Id INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
          EmployeeID VARCHAR(20) NOT NULL,
          ReferenceNo VARCHAR(100) NOT NULL,
          ResignationDate DATE NULL,
          LastWorkingDate DATE NULL,
          NoticePeriod VARCHAR(50) NULL,
          HandoverDocuments BIT NULL,
          ClearPendingTasks BIT NULL,
          ReturnCompanyAssets BIT NULL,
          ExitInterview BIT NULL,
          FinalSettlement BIT NULL,
          RelievingStatus VARCHAR(50) NULL,
          LetterGenerated BIT NULL,
          PdfPath VARCHAR(500) NULL,
          CreatedAt DATETIME NULL
        );
      END
    `);
  })();

  try {
    await ensureHrmsRelievingTablePromise;
  } finally {
    ensureHrmsRelievingTablePromise = null;
  }
};

const hrmsRelievingChecklistColumns = [
  ["Handover Documents", "HandoverDocuments"],
  ["Clear Pending Tasks", "ClearPendingTasks"],
  ["Return Company Assets", "ReturnCompanyAssets"],
  ["Exit Interview", "ExitInterview"],
  ["Final Settlement", "FinalSettlement"],
];

const normalizeHrmsBit = (value) =>
  value === true || value === 1 || value === "1";

const buildHrmsRelievingChecklistValues = (source = {}) => {
  if (Array.isArray(source.checklist)) {
    const byLabel = new Map(
      source.checklist.map((item) => [
        String(item?.label ?? "").trim().toLowerCase(),
        Boolean(item?.checked),
      ])
    );

    return hrmsRelievingChecklistColumns.reduce(
      (values, [label, column]) => ({
        ...values,
        [column]: Boolean(byLabel.get(label.toLowerCase())),
      }),
      {}
    );
  }

  return {
    HandoverDocuments: normalizeHrmsBit(
      source.handoverDocuments ?? source.HandoverDocuments
    ),
    ClearPendingTasks: normalizeHrmsBit(
      source.clearPendingTasks ?? source.ClearPendingTasks
    ),
    ReturnCompanyAssets: normalizeHrmsBit(
      source.returnCompanyAssets ?? source.ReturnCompanyAssets
    ),
    ExitInterview: normalizeHrmsBit(
      source.exitInterview ?? source.ExitInterview
    ),
    FinalSettlement: normalizeHrmsBit(
      source.finalSettlement ?? source.FinalSettlement
    ),
  };
};

const buildHrmsRelievingPayload = (source = {}) => {
  const resignationDate = parseHrmsDateInput(
    source.resignationDate ?? source.ResignationDate
  );
  const lastWorkingDate = parseHrmsDateInput(
    source.lastWorkingDate ?? source.LastWorkingDate
  );

  if (Number.isNaN(resignationDate)) {
    const error = new Error("Invalid resignation date.");
    error.statusCode = 400;
    throw error;
  }
  if (Number.isNaN(lastWorkingDate)) {
    const error = new Error("Invalid last working date.");
    error.statusCode = 400;
    throw error;
  }

  return {
    employeeId: trimToLength(source.employeeId ?? source.EmployeeID, 20),
    referenceNo:
      trimToLength(
        source.referenceNo ?? source.ReferenceNo ?? source.id,
        100
      ) ?? `REL-${Date.now()}`,
    resignationDate,
    lastWorkingDate,
    noticePeriod: trimToLength(source.noticePeriod ?? source.NoticePeriod, 50),
    checklist: buildHrmsRelievingChecklistValues(source),
    status:
      trimToLength(
        source.status ?? source.relievingStatus ?? source.RelievingStatus,
        50
      ) ?? "Relieved",
    letterGenerated: normalizeHrmsBit(
      source.letterGenerated ?? source.LetterGenerated ?? true
    ),
    pdfPath: trimToLength(source.pdfPath ?? source.PdfPath, 500),
  };
};

const normalizeHrmsRelievingRow = (row = {}) => ({
  id: row.ReferenceNo ?? String(row.Id ?? ""),
  relievingId: String(row.Id ?? ""),
  employeeId: row.EmployeeID ?? "",
  employeeName: row.EmployeeName ?? row.FullName ?? row.EmployeeID ?? "",
  referenceNo: row.ReferenceNo ?? "",
  resignationDate: formatHrmsDate(row.ResignationDate),
  lastWorkingDate: formatHrmsDate(row.LastWorkingDate),
  noticePeriod: row.NoticePeriod ?? "",
  checklist: hrmsRelievingChecklistColumns.map(([label, column]) => ({
    label,
    checked: Boolean(row[column]),
  })),
  handoverDocuments: Boolean(row.HandoverDocuments),
  clearPendingTasks: Boolean(row.ClearPendingTasks),
  returnCompanyAssets: Boolean(row.ReturnCompanyAssets),
  exitInterview: Boolean(row.ExitInterview),
  finalSettlement: Boolean(row.FinalSettlement),
  status: row.RelievingStatus ?? "Relieved",
  relievingStatus: row.RelievingStatus ?? "Relieved",
  letterGenerated: Boolean(row.LetterGenerated),
  pdfPath: row.PdfPath ?? "",
  savedAt: row.CreatedAt ?? null,
});

const isHrmsRelievingIdIdentity = async (source) => {
  const result = await createDbRequest(source).query(`
    SELECT CASE WHEN EXISTS (
      SELECT 1
      FROM ${toIdentifier(HRMS_DATABASE_NAME)}.sys.identity_columns ic
      INNER JOIN ${toIdentifier(HRMS_DATABASE_NAME)}.sys.tables t
        ON ic.object_id = t.object_id
      INNER JOIN ${toIdentifier(HRMS_DATABASE_NAME)}.sys.schemas s
        ON t.schema_id = s.schema_id
      WHERE s.name = N'dbo'
        AND t.name = N'Relieving'
        AND ic.name = N'Id'
    ) THEN 1 ELSE 0 END AS isIdentity
  `);

  return Number(result.recordset?.[0]?.isIdentity ?? 0) === 1;
};

const getNextHrmsRelievingId = async (source) => {
  const result = await createDbRequest(source).query(`
    SELECT COALESCE(MAX(Id), 0) + 1 AS nextId
    FROM ${hrmsTable("Relieving")}
  `);
  return toNullableInt(result.recordset?.[0]?.nextId) ?? 1;
};

const bindHrmsRelievingInputs = (request, payload) =>
  request
    .input("EmployeeID", sql.VarChar(20), payload.employeeId)
    .input("ReferenceNo", sql.VarChar(100), payload.referenceNo)
    .input("ResignationDate", sql.Date, payload.resignationDate)
    .input("LastWorkingDate", sql.Date, payload.lastWorkingDate)
    .input("NoticePeriod", sql.VarChar(50), payload.noticePeriod)
    .input("HandoverDocuments", sql.Bit, payload.checklist.HandoverDocuments)
    .input("ClearPendingTasks", sql.Bit, payload.checklist.ClearPendingTasks)
    .input(
      "ReturnCompanyAssets",
      sql.Bit,
      payload.checklist.ReturnCompanyAssets
    )
    .input("ExitInterview", sql.Bit, payload.checklist.ExitInterview)
    .input("FinalSettlement", sql.Bit, payload.checklist.FinalSettlement)
    .input("RelievingStatus", sql.VarChar(50), payload.status)
    .input("LetterGenerated", sql.Bit, payload.letterGenerated)
    .input("PdfPath", sql.VarChar(500), payload.pdfPath);

const loadHrmsRelievingById = async (source, id) => {
  const result = await createDbRequest(source)
    .input("Id", sql.Int, id)
    .query(`
      SELECT
        r.*,
        COALESCE(e.FullName, r.EmployeeID) AS EmployeeName
      FROM ${hrmsTable("Relieving")} r
      LEFT JOIN ${hrmsTable("Employees")} e
        ON r.EmployeeID = e.EmployeeID
      WHERE r.Id = @Id
    `);
  const row = result.recordset?.[0];
  return row ? normalizeHrmsRelievingRow(row) : null;
};

app.get("/api/hrms/relieving", async (_req, res) => {
  try {
    await ensureHrmsRelievingTable();
    const pool = await getPool();
    const result = await pool.request().query(`
      SELECT
        r.*,
        COALESCE(e.FullName, r.EmployeeID) AS EmployeeName
      FROM ${hrmsTable("Relieving")} r
      LEFT JOIN ${hrmsTable("Employees")} e
        ON r.EmployeeID = e.EmployeeID
      ORDER BY r.CreatedAt DESC, r.Id DESC
    `);

    return res.json({
      ok: true,
      relieving: (result.recordset ?? []).map(normalizeHrmsRelievingRow),
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error?.message ?? "Failed to fetch HRMS relieving records",
    });
  }
});

app.post("/api/hrms/relieving", async (req, res) => {
  try {
    await ensureHrmsRelievingTable();
    const payload = buildHrmsRelievingPayload(req.body);

    if (!payload.employeeId) {
      return res.status(400).json({
        ok: false,
        error: "employeeId is required.",
      });
    }

    if (!payload.referenceNo) {
      return res.status(400).json({
        ok: false,
        error: "referenceNo is required.",
      });
    }

    const pool = await getPool();
    const hasIdentityId = await isHrmsRelievingIdIdentity(pool);
    let id = null;

    if (hasIdentityId) {
      const insertResult = await bindHrmsRelievingInputs(
        pool.request(),
        payload
      ).query(`
        INSERT INTO ${hrmsTable("Relieving")} (
          EmployeeID,
          ReferenceNo,
          ResignationDate,
          LastWorkingDate,
          NoticePeriod,
          HandoverDocuments,
          ClearPendingTasks,
          ReturnCompanyAssets,
          ExitInterview,
          FinalSettlement,
          RelievingStatus,
          LetterGenerated,
          PdfPath,
          CreatedAt
        )
        OUTPUT INSERTED.Id AS id
        VALUES (
          @EmployeeID,
          @ReferenceNo,
          @ResignationDate,
          @LastWorkingDate,
          @NoticePeriod,
          @HandoverDocuments,
          @ClearPendingTasks,
          @ReturnCompanyAssets,
          @ExitInterview,
          @FinalSettlement,
          @RelievingStatus,
          @LetterGenerated,
          @PdfPath,
          GETDATE()
        )
      `);
      id = toNullableInt(insertResult.recordset?.[0]?.id);
    } else {
      id = await getNextHrmsRelievingId(pool);
      await bindHrmsRelievingInputs(
        pool.request().input("Id", sql.Int, id),
        payload
      ).query(`
        INSERT INTO ${hrmsTable("Relieving")} (
          Id,
          EmployeeID,
          ReferenceNo,
          ResignationDate,
          LastWorkingDate,
          NoticePeriod,
          HandoverDocuments,
          ClearPendingTasks,
          ReturnCompanyAssets,
          ExitInterview,
          FinalSettlement,
          RelievingStatus,
          LetterGenerated,
          PdfPath,
          CreatedAt
        )
        VALUES (
          @Id,
          @EmployeeID,
          @ReferenceNo,
          @ResignationDate,
          @LastWorkingDate,
          @NoticePeriod,
          @HandoverDocuments,
          @ClearPendingTasks,
          @ReturnCompanyAssets,
          @ExitInterview,
          @FinalSettlement,
          @RelievingStatus,
          @LetterGenerated,
          @PdfPath,
          GETDATE()
        )
      `);
    }

    const relievingRecord = await loadHrmsRelievingById(pool, id);
    return res.status(201).json({ ok: true, relievingRecord });
  } catch (error) {
    return res.status(error?.statusCode ?? 500).json({
      ok: false,
      error: error?.message ?? "Failed to create HRMS relieving record",
    });
  }
});

app.get("/api/hrms/employees", async (_req, res) => {
  try {
    await ensureHrmsEmployeesTable();
    const pool = await getPool();
    const result = await pool.request().query(`
      SELECT
        e.EmployeeID,
        e.FullName,
        e.DateOfBirth,
        e.Gender,
        e.DateOfJoining,
        e.ReportingManager,
        e.Nationality,
        e.MaritalStatus,
        e.BloodGroup,
        e.PhoneNumber,
        e.EmergencyContactName,
        e.EmergencyContactNumber,
        e.EmergencyContactRelation,
        e.EmergencyContactAddress,
        e.Email,
        e.DepartmentID,
        d.Name AS DepartmentName,
        e.DesignationID,
        g.Title AS DesignationTitle,
        e.BasicSalary,
        e.Allowances,
        e.SalaryDeduction,
        e.ProvidentFund,
        e.ProfessionalTax,
        e.TDSAmount,
        e.ESIAmount,
        e.PANNumber,
        e.DocumentNumber,
        e.UANNumber,
        e.ESINumber,
        e.PermanentAddress,
        e.PresentAddress,
        e.SameAsPermanentAddress,
        e.Address,
        e.PhotoPath,
        e.DocumentsJson,
        e.Status,
        e.CreatedAt
      FROM ${hrmsTable("Employees")} e
      LEFT JOIN ${hrmsTable("Departments")} d
        ON e.DepartmentID = d.DepartmentID
      LEFT JOIN ${hrmsTable("Designations")} g
        ON e.DesignationID = g.DesignationID
      ORDER BY e.CreatedAt DESC, e.EmployeeID DESC
    `);

    res.json({
      ok: true,
      employees: (result.recordset ?? []).map(normalizeHrmsEmployeeRow),
    });
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: error?.message ?? "Failed to fetch HRMS employees",
    });
  }
});

app.get("/api/hrms/employees/:id", async (req, res) => {
  try {
    await ensureHrmsEmployeesTable();
    const pool = await getPool();
    const employee = await loadHrmsEmployeeById(pool, req.params.id);
    if (!employee) {
      return res.status(404).json({
        ok: false,
        error: "Employee not found",
      });
    }
    return res.json({ ok: true, employee });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error?.message ?? "Failed to fetch HRMS employee",
    });
  }
});

app.post("/api/hrms/employees", async (req, res) => {
  let tx;
  try {
    await ensureHrmsEmployeesTable();
    const pool = await getPool();
    tx = pool.transaction();
    await tx.begin();

    const payload = await buildHrmsEmployeePayload(req.body, tx);
    if (!payload.fullName) {
      await tx.rollback();
      return res.status(400).json({
        ok: false,
        error: "Full name is required.",
      });
    }

    const employeeId = await getNextHrmsEmployeeId(tx);
    const existingEmployee = await loadHrmsEmployeeById(tx, employeeId);
    if (existingEmployee) {
      await tx.rollback();
      return res.status(409).json({
        ok: false,
        error: `Employee ID ${employeeId} already exists.`,
      });
    }

    await createDbRequest(tx)
      .input("EmployeeID", sql.VarChar(20), employeeId)
      .input("FullName", sql.VarChar(150), payload.fullName)
      .input("DateOfBirth", sql.Date, payload.dateOfBirth)
      .input("Gender", sql.VarChar(20), payload.gender)
      .input("DateOfJoining", sql.Date, payload.dateOfJoining)
      .input("ReportingManager", sql.VarChar(100), payload.reportingManager)
      .input("Nationality", sql.VarChar(50), payload.nationality)
      .input("MaritalStatus", sql.VarChar(20), payload.maritalStatus)
      .input("BloodGroup", sql.VarChar(10), payload.bloodGroup)
      .input("PhoneNumber", sql.VarChar(20), payload.phoneNumber)
      .input("EmergencyContactName", sql.VarChar(150), payload.emergencyContactName)
      .input("EmergencyContactNumber", sql.VarChar(20), payload.emergencyContactNumber)
      .input("EmergencyContactRelation", sql.VarChar(100), payload.emergencyContactRelation)
      .input("EmergencyContactAddress", sql.VarChar(500), payload.emergencyContactAddress)
      .input("Email", sql.VarChar(150), payload.email)
      .input("DepartmentID", sql.Int, payload.departmentId)
      .input("DesignationID", sql.Int, payload.designationId)
      .input("BasicSalary", sql.Decimal(18, 2), payload.basicSalary)
      .input("Allowances", sql.Decimal(18, 2), payload.allowances)
      .input("SalaryDeduction", sql.Decimal(18, 2), payload.salaryDeduction)
      .input("ProvidentFund", sql.Decimal(18, 2), payload.providentFund)
      .input("ProfessionalTax", sql.Decimal(18, 2), payload.professionalTax)
      .input("TDSAmount", sql.Decimal(18, 2), payload.tdsAmount)
      .input("ESIAmount", sql.Decimal(18, 2), payload.esiAmount)
      .input("PANNumber", sql.VarChar(10), payload.panNumber)
      .input("DocumentNumber", sql.VarChar(100), payload.documentNumber)
      .input("UANNumber", sql.VarChar(50), payload.uanNumber)
      .input("ESINumber", sql.VarChar(50), payload.esiNumber)
      .input("PermanentAddress", sql.VarChar(500), payload.permanentAddress)
      .input("PresentAddress", sql.VarChar(500), payload.presentAddress)
      .input("SameAsPermanentAddress", sql.Bit, payload.sameAsPermanentAddress)
      .input("Address", sql.VarChar(500), payload.address)
      .input("PhotoPath", sql.VarChar(255), payload.photoPath)
      .input("DocumentsJson", sql.NVarChar(sql.MAX), payload.documentsJson)
      .input("Status", sql.VarChar(20), payload.status)
      .query(`
        INSERT INTO ${hrmsTable("Employees")} (
          EmployeeID,
          FullName,
          DateOfBirth,
          Gender,
          DateOfJoining,
          ReportingManager,
          Nationality,
          MaritalStatus,
          BloodGroup,
          PhoneNumber,
          EmergencyContactName,
          EmergencyContactNumber,
          EmergencyContactRelation,
          EmergencyContactAddress,
          Email,
          DepartmentID,
          DesignationID,
          BasicSalary,
          Allowances,
          SalaryDeduction,
          ProvidentFund,
          ProfessionalTax,
          TDSAmount,
          ESIAmount,
          PANNumber,
          DocumentNumber,
          UANNumber,
          ESINumber,
          PermanentAddress,
          PresentAddress,
          SameAsPermanentAddress,
          Address,
          PhotoPath,
          DocumentsJson,
          Status,
          CreatedAt
        )
        VALUES (
          @EmployeeID,
          @FullName,
          @DateOfBirth,
          @Gender,
          @DateOfJoining,
          @ReportingManager,
          @Nationality,
          @MaritalStatus,
          @BloodGroup,
          @PhoneNumber,
          @EmergencyContactName,
          @EmergencyContactNumber,
          @EmergencyContactRelation,
          @EmergencyContactAddress,
          @Email,
          @DepartmentID,
          @DesignationID,
          @BasicSalary,
          @Allowances,
          @SalaryDeduction,
          @ProvidentFund,
          @ProfessionalTax,
          @TDSAmount,
          @ESIAmount,
          @PANNumber,
          @DocumentNumber,
          @UANNumber,
          @ESINumber,
          @PermanentAddress,
          @PresentAddress,
          @SameAsPermanentAddress,
          @Address,
          @PhotoPath,
          @DocumentsJson,
          @Status,
          GETDATE()
        )
      `);

    await tx.commit();
    const employee = await loadHrmsEmployeeById(pool, employeeId);
    return res.status(201).json({ ok: true, employee });
  } catch (error) {
    await rollbackTx(tx);
    return res.status(error?.statusCode ?? 500).json({
      ok: false,
      error: error?.message ?? "Failed to create HRMS employee",
    });
  }
});

app.put("/api/hrms/employees/:id", async (req, res) => {
  let tx;
  try {
    await ensureHrmsEmployeesTable();
    const pool = await getPool();
    tx = pool.transaction();
    await tx.begin();

    const existingEmployee = await loadHrmsEmployeeById(tx, req.params.id);
    if (!existingEmployee) {
      await tx.rollback();
      return res.status(404).json({
        ok: false,
        error: "Employee not found",
      });
    }

    const payload = await buildHrmsEmployeePayload(
      { ...existingEmployee, ...req.body, employeeId: req.params.id },
      tx
    );
    if (!payload.fullName) {
      await tx.rollback();
      return res.status(400).json({
        ok: false,
        error: "Full name is required.",
      });
    }

    await createDbRequest(tx)
      .input("EmployeeID", sql.VarChar(20), req.params.id)
      .input("FullName", sql.VarChar(150), payload.fullName)
      .input("DateOfBirth", sql.Date, payload.dateOfBirth)
      .input("Gender", sql.VarChar(20), payload.gender)
      .input("DateOfJoining", sql.Date, payload.dateOfJoining)
      .input("ReportingManager", sql.VarChar(100), payload.reportingManager)
      .input("Nationality", sql.VarChar(50), payload.nationality)
      .input("MaritalStatus", sql.VarChar(20), payload.maritalStatus)
      .input("BloodGroup", sql.VarChar(10), payload.bloodGroup)
      .input("PhoneNumber", sql.VarChar(20), payload.phoneNumber)
      .input("EmergencyContactName", sql.VarChar(150), payload.emergencyContactName)
      .input("EmergencyContactNumber", sql.VarChar(20), payload.emergencyContactNumber)
      .input("EmergencyContactRelation", sql.VarChar(100), payload.emergencyContactRelation)
      .input("EmergencyContactAddress", sql.VarChar(500), payload.emergencyContactAddress)
      .input("Email", sql.VarChar(150), payload.email)
      .input("DepartmentID", sql.Int, payload.departmentId)
      .input("DesignationID", sql.Int, payload.designationId)
      .input("BasicSalary", sql.Decimal(18, 2), payload.basicSalary)
      .input("Allowances", sql.Decimal(18, 2), payload.allowances)
      .input("SalaryDeduction", sql.Decimal(18, 2), payload.salaryDeduction)
      .input("ProvidentFund", sql.Decimal(18, 2), payload.providentFund)
      .input("ProfessionalTax", sql.Decimal(18, 2), payload.professionalTax)
      .input("TDSAmount", sql.Decimal(18, 2), payload.tdsAmount)
      .input("ESIAmount", sql.Decimal(18, 2), payload.esiAmount)
      .input("PANNumber", sql.VarChar(10), payload.panNumber)
      .input("DocumentNumber", sql.VarChar(100), payload.documentNumber)
      .input("UANNumber", sql.VarChar(50), payload.uanNumber)
      .input("ESINumber", sql.VarChar(50), payload.esiNumber)
      .input("PermanentAddress", sql.VarChar(500), payload.permanentAddress)
      .input("PresentAddress", sql.VarChar(500), payload.presentAddress)
      .input("SameAsPermanentAddress", sql.Bit, payload.sameAsPermanentAddress)
      .input("Address", sql.VarChar(500), payload.address)
      .input("PhotoPath", sql.VarChar(255), payload.photoPath)
      .input("DocumentsJson", sql.NVarChar(sql.MAX), payload.documentsJson)
      .input("Status", sql.VarChar(20), payload.status)
      .query(`
        UPDATE ${hrmsTable("Employees")}
        SET
          FullName = @FullName,
          DateOfBirth = @DateOfBirth,
          Gender = @Gender,
          DateOfJoining = @DateOfJoining,
          ReportingManager = @ReportingManager,
          Nationality = @Nationality,
          MaritalStatus = @MaritalStatus,
          BloodGroup = @BloodGroup,
          PhoneNumber = @PhoneNumber,
          EmergencyContactName = @EmergencyContactName,
          EmergencyContactNumber = @EmergencyContactNumber,
          EmergencyContactRelation = @EmergencyContactRelation,
          EmergencyContactAddress = @EmergencyContactAddress,
          Email = @Email,
          DepartmentID = @DepartmentID,
          DesignationID = @DesignationID,
          BasicSalary = @BasicSalary,
          Allowances = @Allowances,
          SalaryDeduction = @SalaryDeduction,
          ProvidentFund = @ProvidentFund,
          ProfessionalTax = @ProfessionalTax,
          TDSAmount = @TDSAmount,
          ESIAmount = @ESIAmount,
          PANNumber = @PANNumber,
          DocumentNumber = @DocumentNumber,
          UANNumber = @UANNumber,
          ESINumber = @ESINumber,
          PermanentAddress = @PermanentAddress,
          PresentAddress = @PresentAddress,
          SameAsPermanentAddress = @SameAsPermanentAddress,
          Address = @Address,
          PhotoPath = @PhotoPath,
          DocumentsJson = @DocumentsJson,
          Status = @Status
        WHERE EmployeeID = @EmployeeID
      `);

    await tx.commit();
    const employee = await loadHrmsEmployeeById(pool, req.params.id);
    return res.json({ ok: true, employee });
  } catch (error) {
    await rollbackTx(tx);
    return res.status(error?.statusCode ?? 500).json({
      ok: false,
      error: error?.message ?? "Failed to update HRMS employee",
    });
  }
});

app.delete("/api/hrms/employees/:id", async (req, res) => {
  let tx;
  try {
    await ensureHrmsEmployeesTable();
    await ensureHrmsReviewsTable();
    await ensureHrmsSalaryReassessmentsTable();
    await ensureHrmsAttendanceTable();
    await ensureHrmsSalariesTable();
    await ensureHrmsRelievingTable();
    const pool = await getPool();
    tx = pool.transaction();
    await tx.begin();

    // Clear dependent HRMS records first so stale/demo employees can be fully removed.
    await createDbRequest(tx)
      .input("EmployeeID", sql.VarChar(20), req.params.id)
      .query(`
        DELETE FROM ${hrmsTable("Reviews")}
        WHERE EmployeeID = @EmployeeID;

        DELETE FROM ${hrmsTable("SalaryReassessments")}
        WHERE EmployeeID = @EmployeeID;

        DELETE FROM ${hrmsTable("Attendance")}
        WHERE EmployeeID = @EmployeeID;

        DELETE FROM ${hrmsTable("Salaries")}
        WHERE EmployeeID = @EmployeeID;

        DELETE FROM ${hrmsTable("Relieving")}
        WHERE EmployeeID = @EmployeeID;
      `);

    const result = await createDbRequest(tx)
      .input("EmployeeID", sql.VarChar(20), req.params.id)
      .query(`
        DELETE FROM ${hrmsTable("Employees")}
        WHERE EmployeeID = @EmployeeID
      `);

    if ((result.rowsAffected?.[0] ?? 0) === 0) {
      await tx.rollback();
      return res.status(404).json({
        ok: false,
        error: "Employee not found",
      });
    }

    await tx.commit();
    return res.json({ ok: true });
  } catch (error) {
    await rollbackTx(tx);
    return res.status(500).json({
      ok: false,
      error: error?.message ?? "Failed to delete HRMS employee",
    });
  }
});

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
    res.status(503).json({
      ok: false,
      api: "up",
      db: "disconnected",
      code: "DB_UNAVAILABLE",
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
        ${buildNumberCoalesceExpr(itemSchema.brandIdColumns)} AS [brandId],
        ${buildTextCoalesceExpr(itemSchema.brandColumns)} AS [brand],
        ${buildTextCoalesceExpr(itemSchema.hsnColumns)} AS [hsn],
        ${buildTextCoalesceExpr(itemSchema.unitColumns, "N'PCS'")} AS [unit],
        ${buildNumberCoalesceExpr(itemSchema.stockColumns)} AS [stock],
        ${buildNumberCoalesceExpr(itemSchema.priceColumns)} AS [price],
        ${buildNumberCoalesceExpr(itemSchema.taxColumns, "0")} AS [taxPercentage],
        ${buildTextCoalesceExpr(itemSchema.gstColumns)} AS [gst],
        ${buildNumberCoalesceExpr(itemSchema.serialRequiredColumns, "0")} AS [serialRequired],
        ${buildTextCoalesceExpr(itemSchema.serialNumberColumns)} AS [serialNumber],
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
    await ensureBrandsTable();

    const {
      name,
      category,
      brand,
      hsn,
      unit,
      stock,
      price,
      gst,
      taxPercentage,
      serialRequired,
      serialNumber,
      description,
    } = req.body ?? {};
    if (!String(name ?? "").trim()) {
      return res.status(400).json({
        ok: false,
        error: "Item name is required",
      });
    }

    const cleanStock = Number.parseInt(stock, 10);
    const cleanPrice = Number.parseFloat(price);
    const cleanTaxPercentage = parseTaxPercentageValue(taxPercentage ?? gst);
    const validStock = Number.isFinite(cleanStock) ? cleanStock : 0;
    const validPrice = Number.isFinite(cleanPrice) ? cleanPrice : 0;
    const validTaxPercentage = Number.isFinite(cleanTaxPercentage)
      ? cleanTaxPercentage
      : 0;
    const validSerialRequired = normalizeBooleanFlag(serialRequired, false);
    const normalizedGstLabel =
      normalizeOptionalString(gst) ?? formatTaxPercentageLabel(validTaxPercentage);

    const pool = await getPool();
    const itemSchema = await resolveItemsSchema();
    const resolvedBrand = await resolveOrCreateBrand(pool, brand);
    const request = pool
      .request()
      .input("Name", sql.NVarChar(255), String(name).trim())
      .input("Category", sql.NVarChar(100), String(category ?? "").trim())
      .input("BrandId", sql.Int, resolvedBrand?.id ?? null)
      .input("Brand", sql.NVarChar(255), resolvedBrand?.name ?? null)
      .input("HSN", sql.NVarChar(50), String(hsn ?? "").trim())
      .input("Unit", sql.NVarChar(50), String(unit ?? "PCS").trim() || "PCS")
      .input("Stock", sql.Int, validStock)
      .input("Price", sql.Decimal(18, 2), validPrice)
      .input("GST", sql.NVarChar(100), normalizedGstLabel)
      .input("TaxPercentage", sql.Decimal(5, 2), validTaxPercentage)
      .input("SerialRequired", sql.Bit, validSerialRequired)
      .input("SerialNumber", sql.NVarChar(255), String(serialNumber ?? "").trim())
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
    addInsertFields(itemSchema.brandIdColumns, "BrandId");
    addInsertFields(itemSchema.brandColumns, "Brand");
    addInsertFields(itemSchema.hsnColumns, "HSN");
    addInsertFields(itemSchema.unitColumns, "Unit");
    addInsertFields(itemSchema.stockColumns, "Stock");
    addInsertFields(itemSchema.priceColumns, "Price");
    addInsertFields(itemSchema.gstColumns, "GST");
    addInsertFields(itemSchema.taxColumns, "TaxPercentage");
    addInsertFields(itemSchema.serialRequiredColumns, "SerialRequired");
    addInsertFields(itemSchema.serialNumberColumns, "SerialNumber");
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

app.put("/api/items/:id", async (req, res) => {
  try {
    await ensureItemsTable();
    await ensureBrandsTable();

    const id = Number.parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ ok: false, error: "Invalid item id" });
    }

    const {
      name,
      category,
      brand,
      hsn,
      unit,
      stock,
      price,
      gst,
      taxPercentage,
      serialRequired,
      serialNumber,
      description,
    } = req.body ?? {};

    if (!String(name ?? "").trim()) {
      return res.status(400).json({ ok: false, error: "Item name is required" });
    }

    const cleanStock = Number.parseInt(stock, 10);
    const cleanPrice = Number.parseFloat(price);
    const cleanTaxPercentage = parseTaxPercentageValue(taxPercentage ?? gst);
    const validStock = Number.isFinite(cleanStock) ? cleanStock : 0;
    const validPrice = Number.isFinite(cleanPrice) ? cleanPrice : 0;
    const validTaxPercentage = Number.isFinite(cleanTaxPercentage)
      ? cleanTaxPercentage
      : 0;
    const validSerialRequired = normalizeBooleanFlag(serialRequired, false);
    const normalizedGstLabel =
      normalizeOptionalString(gst) ?? formatTaxPercentageLabel(validTaxPercentage);

    const pool = await getPool();
    const itemSchema = await resolveItemsSchema();
    const resolvedBrand = await resolveOrCreateBrand(pool, brand);
    if (!itemSchema.idColumn) {
      throw new Error("Items table is missing a primary id column");
    }

    const setClauses = [];
    const addSetClauses = (columns, paramName) => {
      for (const column of uniqueColumnNames(columns)) {
        setClauses.push(`${toIdentifier(column)} = @${paramName}`);
      }
    };

    addSetClauses(itemSchema.nameColumns, "Name");
    addSetClauses(itemSchema.categoryColumns, "Category");
    addSetClauses(itemSchema.brandIdColumns, "BrandId");
    addSetClauses(itemSchema.brandColumns, "Brand");
    addSetClauses(itemSchema.hsnColumns, "HSN");
    addSetClauses(itemSchema.unitColumns, "Unit");
    addSetClauses(itemSchema.stockColumns, "Stock");
    addSetClauses(itemSchema.priceColumns, "Price");
    addSetClauses(itemSchema.gstColumns, "GST");
    addSetClauses(itemSchema.taxColumns, "TaxPercentage");
    addSetClauses(itemSchema.serialRequiredColumns, "SerialRequired");
    addSetClauses(itemSchema.serialNumberColumns, "SerialNumber");
    addSetClauses(itemSchema.descriptionColumns, "Description");
    for (const column of uniqueColumnNames(itemSchema.updatedAtColumns)) {
      setClauses.push(`${toIdentifier(column)} = @Now`);
    }

    const result = await pool
      .request()
      .input("ItemId", sql.BigInt, id)
      .input("Name", sql.NVarChar(255), String(name ?? "").trim())
      .input("Category", sql.NVarChar(100), String(category ?? "").trim())
      .input("BrandId", sql.Int, resolvedBrand?.id ?? null)
      .input("Brand", sql.NVarChar(255), resolvedBrand?.name ?? null)
      .input("HSN", sql.NVarChar(50), String(hsn ?? "").trim())
      .input("Unit", sql.NVarChar(50), String(unit ?? "PCS").trim() || "PCS")
      .input("Stock", sql.Int, validStock)
      .input("Price", sql.Decimal(18, 2), validPrice)
      .input("GST", sql.NVarChar(100), normalizedGstLabel)
      .input("TaxPercentage", sql.Decimal(5, 2), validTaxPercentage)
      .input("SerialRequired", sql.Bit, validSerialRequired)
      .input("SerialNumber", sql.NVarChar(255), String(serialNumber ?? "").trim())
      .input("Description", sql.NVarChar(sql.MAX), String(description ?? "").trim())
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
      error: error?.message ?? "Failed to update item",
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

app.get("/api/available-inventory", async (req, res) => {
  res.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.set("Pragma", "no-cache");
  res.set("Expires", "0");
  const projectId = toNullableInt(req.query.projectId);
  const locationId = toNullableInt(req.query.locationId);
  const destinationLocationId = toNullableInt(req.query.destinationLocationId);
  const excludeDeliveryChallanId = toNullableInt(
    req.query.excludeDeliveryChallanId
  );
  const excludeConsumptionId = toNullableInt(req.query.excludeConsumptionId);
  const excludeReallocateInventoryId = toNullableInt(
    req.query.excludeReallocateInventoryId
  );
  const includeConsumptionLeftover =
    String(req.query.includeConsumptionLeftover ?? "").trim().toLowerCase() === "true";

  if (!locationId) {
    return res.status(400).json({
      ok: false,
      error: "locationId is required",
    });
  }

  try {
    const pool = await getPool();
    const items = await loadAvailableInventoryRows(pool, {
      projectId,
      locationId,
      excludeDeliveryChallanId,
      excludeConsumptionId,
      excludeReallocateInventoryId,
      includeConsumptionLeftover,
    });
    const eligibleItems = items.filter(
      (item) =>
        toAvailabilityQuantity(
          item.remainingAvailableQty ?? item.availableQty
        ) > 0
    );
    console.debug("[Consumption lookup] available-inventory API", {
      projectId,
      sourceLocationId: locationId,
      destinationLocationId,
      rowCount: eligibleItems.length,
      deliveryChallanRowsWithBalance: eligibleItems.filter(
        (item) =>
          normalizeAvailabilitySourceType(item.sourceType) === "dc" &&
          toAvailabilityQuantity(item.availableQty) > 0
      ).length,
    });
    return res.json({ ok: true, items: eligibleItems });
  } catch (error) {
    return res.status(error?.statusCode ?? 500).json({
      ok: false,
      error: error?.message ?? "Failed to fetch available inventory",
    });
  }
});

app.get("/api/brands", async (_req, res) => {
  try {
    await ensureBrandsTable();
    const pool = await getPool();
    const result = await pool.request().query(`
      SELECT *
      FROM dbo.Brands
      ORDER BY BrandName ASC
    `);
    const normalizedBrands = new Map();
    (result.recordset ?? []).map(normalizeBrand).forEach((brand) => {
      const key = String(brand.name || "").trim().toLowerCase();
      if (!key || normalizedBrands.has(key)) {
        return;
      }
      normalizedBrands.set(key, brand);
    });
    return res.json({
      ok: true,
      brands: Array.from(normalizedBrands.values()),
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error?.message ?? "Failed to fetch brands",
    });
  }
});

app.post("/api/brands", async (req, res) => {
  try {
    await ensureBrandsTable();
    const pool = await getPool();
    const brand = await resolveOrCreateBrand(pool, req.body?.name ?? req.body?.brandName);
    if (!brand?.name) {
      return res.status(400).json({
        ok: false,
        error: "Brand name is required",
      });
    }
    return res.status(201).json({ ok: true, brand });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error?.message ?? "Failed to save brand",
    });
  }
});

app.get("/api/vendors", async (_req, res) => {
  try {
    await ensureVendorsTable();
    const pool = await getPool();
    const [vendorsResult, contactsResult] = await Promise.all([
      pool.request().query(`
        SELECT *
        FROM dbo.Vendors
        ORDER BY VendorId DESC
      `),
      pool.request().query(`
        SELECT *
        FROM dbo.VendorContacts
        ORDER BY VendorContactId ASC
      `),
    ]);

    const contactsByVendor = (contactsResult.recordset ?? []).reduce((acc, row) => {
      const contact = normalizeVendorContact(row);
      const key = String(contact.vendorId ?? "");
      if (!key) {
        return acc;
      }
      if (!acc[key]) {
        acc[key] = [];
      }
      acc[key].push(contact);
      return acc;
    }, {});

    res.json(
      (vendorsResult.recordset ?? []).map((row) => {
        const vendor = normalizeVendor(row);
        return {
          ...vendor,
          contacts: contactsByVendor[String(vendor.id)] ?? [],
        };
      })
    );
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
      panNumber,
      bankAccountName,
      bankAccountNumber,
      bankName,
      ifscCode,
      bankBranch,
      documents,
      address,
      city,
      state,
      pincode,
      VendorName,
      Phone,
      Email,
      GSTNumber,
      PANNumber,
      BankAccountName,
      BankAccountNumber,
      BankName,
      IFSCCode,
      BankBranch,
      Documents,
      Address,
      City,
      State,
      Pincode,
      contacts,
    } = req.body ?? {};

    const nextName = String(name ?? VendorName ?? "").trim();
    const nextPhone = String(phone ?? Phone ?? "").trim();
    const nextEmail = String(email ?? Email ?? "").trim();
    const nextGstNumber = String(gstNumber ?? GSTNumber ?? "").trim();
    const nextPanNumber = String(panNumber ?? PANNumber ?? "").trim();
    const nextBankAccountName = String(bankAccountName ?? BankAccountName ?? "").trim();
    const nextBankAccountNumber = String(bankAccountNumber ?? BankAccountNumber ?? "").trim();
    const nextBankName = String(bankName ?? BankName ?? "").trim();
    const nextIfscCode = String(ifscCode ?? IFSCCode ?? "").trim();
    const nextBankBranch = String(bankBranch ?? BankBranch ?? "").trim();
    const nextDocuments = Array.isArray(documents)
      ? documents
      : Array.isArray(Documents)
      ? Documents
      : [];
    const nextAddress = String(address ?? Address ?? "").trim();
    const nextCity = String(city ?? City ?? "").trim();
    const nextState = String(state ?? State ?? "").trim();
    const nextPincode = String(pincode ?? Pincode ?? "").trim();
    const normalizedContacts = normalizeVendorContactsInput(contacts);
    const contactsError = getVendorContactsValidationError(normalizedContacts);

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
    if (contactsError) {
      return res.status(400).json({
        ok: false,
        error: contactsError,
        message: contactsError,
      });
    }

    const pool = await getPool();
    const tx = pool.transaction();
    await tx.begin();

    try {
      const result = await new sql.Request(tx)
        .input("VendorName", sql.NVarChar(255), nextName)
        .input("Phone", sql.NVarChar(50), nextPhone)
        .input("Email", sql.NVarChar(255), nextEmail)
        .input("GSTNumber", sql.NVarChar(30), nextGstNumber)
        .input("PANNumber", sql.NVarChar(20), nextPanNumber || null)
        .input("BankAccountName", sql.NVarChar(255), nextBankAccountName || null)
        .input("BankAccountNumber", sql.NVarChar(120), nextBankAccountNumber || null)
        .input("BankName", sql.NVarChar(255), nextBankName || null)
        .input("IFSCCode", sql.NVarChar(30), nextIfscCode || null)
        .input("BankBranch", sql.NVarChar(255), nextBankBranch || null)
        .input("DocumentsJson", sql.NVarChar(sql.MAX), serializeJson(nextDocuments))
        .input("Address", sql.NVarChar(sql.MAX), nextAddress)
        .input("City", sql.NVarChar(120), nextCity || null)
        .input("State", sql.NVarChar(120), nextState || null)
        .input("Pincode", sql.NVarChar(20), nextPincode || null)
        .query(
          `INSERT INTO dbo.Vendors (VendorName, Phone, Email, GSTNumber, PANNumber, BankAccountName, BankAccountNumber, BankName, IFSCCode, BankBranch, DocumentsJson, Address, City, State, Pincode)
           OUTPUT INSERTED.*
           VALUES (@VendorName, @Phone, @Email, @GSTNumber, @PANNumber, @BankAccountName, @BankAccountNumber, @BankName, @IFSCCode, @BankBranch, @DocumentsJson, @Address, @City, @State, @Pincode)`
        );

      const vendor = normalizeVendor(result.recordset?.[0] ?? {});
      for (const contact of normalizedContacts) {
        await new sql.Request(tx)
          .input("VendorId", sql.Int, vendor.id)
          .input("ContactName", sql.NVarChar(255), contact.contactName)
          .input("Email", sql.NVarChar(255), contact.email)
          .input("Designation", sql.NVarChar(255), contact.designation)
          .input("Phone", sql.NVarChar(50), contact.phone || null)
          .query(`
            INSERT INTO dbo.VendorContacts
              (VendorId, ContactName, Email, Designation, Phone)
            VALUES
              (@VendorId, @ContactName, @Email, @Designation, @Phone)
          `);
      }

      await tx.commit();

      return res.status(201).json({
        ok: true,
        vendor: {
          ...vendor,
          contacts: normalizedContacts,
        },
      });
    } catch (error) {
      await rollbackTx(tx);
      throw error;
    }
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
      panNumber,
      bankAccountName,
      bankAccountNumber,
      bankName,
      ifscCode,
      bankBranch,
      documents,
      address,
      city,
      state,
      pincode,
      VendorName,
      Phone,
      Email,
      GSTNumber,
      PANNumber,
      BankAccountName,
      BankAccountNumber,
      BankName,
      IFSCCode,
      BankBranch,
      Documents,
      Address,
      City,
      State,
      Pincode,
      contacts,
    } = req.body ?? {};

    const nextName = String(name ?? VendorName ?? "").trim();
    const nextPhone = String(phone ?? Phone ?? "").trim();
    const nextEmail = String(email ?? Email ?? "").trim();
    const nextGstNumber = String(gstNumber ?? GSTNumber ?? "").trim();
    const nextPanNumber = String(panNumber ?? PANNumber ?? "").trim();
    const nextBankAccountName = String(bankAccountName ?? BankAccountName ?? "").trim();
    const nextBankAccountNumber = String(bankAccountNumber ?? BankAccountNumber ?? "").trim();
    const nextBankName = String(bankName ?? BankName ?? "").trim();
    const nextIfscCode = String(ifscCode ?? IFSCCode ?? "").trim();
    const nextBankBranch = String(bankBranch ?? BankBranch ?? "").trim();
    const nextDocuments = Array.isArray(documents)
      ? documents
      : Array.isArray(Documents)
      ? Documents
      : [];
    const nextAddress = String(address ?? Address ?? "").trim();
    const nextCity = String(city ?? City ?? "").trim();
    const nextState = String(state ?? State ?? "").trim();
    const nextPincode = String(pincode ?? Pincode ?? "").trim();
    const hasContactsPayload = Array.isArray(contacts);
    const normalizedContacts = hasContactsPayload
      ? normalizeVendorContactsInput(contacts)
      : [];
    const contactsError = hasContactsPayload
      ? getVendorContactsValidationError(normalizedContacts)
      : "";

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
    if (contactsError) {
      return res.status(400).json({
        ok: false,
        error: contactsError,
        message: contactsError,
      });
    }

    const pool = await getPool();
    const tx = pool.transaction();
    await tx.begin();

    try {
      const result = await new sql.Request(tx)
        .input("VendorId", sql.Int, id)
        .input("VendorName", sql.NVarChar(255), nextName)
        .input("Phone", sql.NVarChar(50), nextPhone)
        .input("Email", sql.NVarChar(255), nextEmail)
        .input("GSTNumber", sql.NVarChar(30), nextGstNumber)
        .input("PANNumber", sql.NVarChar(20), nextPanNumber || null)
        .input("BankAccountName", sql.NVarChar(255), nextBankAccountName || null)
        .input("BankAccountNumber", sql.NVarChar(120), nextBankAccountNumber || null)
        .input("BankName", sql.NVarChar(255), nextBankName || null)
        .input("IFSCCode", sql.NVarChar(30), nextIfscCode || null)
        .input("BankBranch", sql.NVarChar(255), nextBankBranch || null)
        .input("DocumentsJson", sql.NVarChar(sql.MAX), serializeJson(nextDocuments))
        .input("Address", sql.NVarChar(sql.MAX), nextAddress)
        .input("City", sql.NVarChar(120), nextCity || null)
        .input("State", sql.NVarChar(120), nextState || null)
        .input("Pincode", sql.NVarChar(20), nextPincode || null)
        .query(`
          UPDATE dbo.Vendors
          SET VendorName = @VendorName,
              Phone = @Phone,
              Email = @Email,
              GSTNumber = @GSTNumber,
              PANNumber = @PANNumber,
              BankAccountName = @BankAccountName,
              BankAccountNumber = @BankAccountNumber,
              BankName = @BankName,
              IFSCCode = @IFSCCode,
              BankBranch = @BankBranch,
              DocumentsJson = @DocumentsJson,
              Address = @Address,
              City = @City,
              State = @State,
              Pincode = @Pincode,
              UpdatedAt = SYSUTCDATETIME()
          OUTPUT INSERTED.*
          WHERE VendorId = @VendorId
        `);

      const updated = result.recordset?.[0];
      if (!updated) {
        await tx.rollback();
        return res.status(404).json({
          ok: false,
          error: "Vendor not found",
          message: "Vendor not found",
        });
      }

      if (hasContactsPayload) {
        await new sql.Request(tx)
          .input("VendorId", sql.Int, id)
          .query(`DELETE FROM dbo.VendorContacts WHERE VendorId = @VendorId`);

        for (const contact of normalizedContacts) {
          await new sql.Request(tx)
            .input("VendorId", sql.Int, id)
            .input("ContactName", sql.NVarChar(255), contact.contactName)
            .input("Email", sql.NVarChar(255), contact.email)
            .input("Designation", sql.NVarChar(255), contact.designation)
            .input("Phone", sql.NVarChar(50), contact.phone || null)
            .query(`
              INSERT INTO dbo.VendorContacts
                (VendorId, ContactName, Email, Designation, Phone)
              VALUES
                (@VendorId, @ContactName, @Email, @Designation, @Phone)
            `);
        }
      }

      await tx.commit();

      let savedContacts = normalizedContacts;
      if (!hasContactsPayload) {
        const contactsResult = await pool
          .request()
          .input("VendorId", sql.Int, id)
          .query(`
            SELECT *
            FROM dbo.VendorContacts
            WHERE VendorId = @VendorId
            ORDER BY VendorContactId ASC
          `);
        savedContacts = (contactsResult.recordset ?? []).map(normalizeVendorContact);
      }

      return res.json({
        ok: true,
        vendor: {
          ...normalizeVendor(updated),
          contacts: savedContacts,
        },
      });
    } catch (error) {
      await rollbackTx(tx);
      throw error;
    }
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
    const tx = pool.transaction();
    await tx.begin();

    let result;
    try {
      await new sql.Request(tx)
        .input("VendorId", sql.Int, id)
        .query(`DELETE FROM dbo.VendorContacts WHERE VendorId = @VendorId`);

      result = await new sql.Request(tx)
        .input("VendorId", sql.Int, id)
        .query(`
          DELETE FROM dbo.Vendors
          OUTPUT DELETED.VendorId
          WHERE VendorId = @VendorId
        `);

      await tx.commit();
    } catch (error) {
      await rollbackTx(tx);
      throw error;
    }

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

app.get("/api/customers", async (_req, res) => {
  try {
    await ensureCustomersTable();
    const pool = await getPool();
    const [customersResult, contactsResult] = await Promise.all([
      pool.request().query(`
        SELECT
          CustomerId,
          CustomerName,
          CompanyName,
          Address,
          GSTNumber,
          GSTType,
          City,
          State,
          Pincode,
          ContactNumber,
          Email,
          ContactPerson,
          Designation,
          DocumentsJson,
          CreatedAt,
          UpdatedAt
        FROM dbo.Customers
        ORDER BY CustomerId DESC
      `),
      pool.request().query(`
        SELECT *
        FROM dbo.CustomerContacts
        ORDER BY CustomerContactId ASC
      `),
    ]);

    const contactsByCustomer = (contactsResult.recordset ?? []).reduce(
      (acc, row) => {
        const contact = normalizeCustomerContact(row);
        const key = String(contact.customerId ?? "");
        if (!key) {
          return acc;
        }
        if (!acc[key]) {
          acc[key] = [];
        }
        acc[key].push(contact);
        return acc;
      },
      {}
    );

    return res.json(
      (customersResult.recordset ?? []).map((row) => {
        const customer = normalizeCustomer(row);
        return attachCustomerContacts(
          customer,
          contactsByCustomer[String(customer.id)] ?? []
        );
      })
    );
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error?.message ?? "Failed to fetch customers",
    });
  }
});

app.post("/api/customers", async (req, res) => {
  try {
    await ensureCustomersTable();
    const {
      name,
      companyName,
      address,
      gstType,
      city,
      state,
      pincode,
      gstNumber,
      phone,
      email,
      contactPerson,
      designation,
      contacts,
      documents,
      CustomerName,
      CompanyName,
      Address,
      GSTType,
      City,
      State,
      Pincode,
      GSTNumber,
      ContactNumber,
      Email,
      ContactPerson,
      Designation,
    } = req.body ?? {};

    const nextName = normalizeOptionalString(name ?? CustomerName);
    if (!nextName) {
      return res.status(400).json({ ok: false, error: "Customer name is required" });
    }
    const nextPincode = normalizeOptionalString(pincode ?? Pincode);
    if (!nextPincode) {
      return res.status(400).json({ ok: false, error: "Customer pincode is required" });
    }
    const normalizedContacts = normalizeCustomerContactsInput(contacts);
    const normalizedDocuments = normalizeUploadedDocumentsInput(documents);
    const contactsError = getCustomerContactsValidationError(normalizedContacts);
    if (contactsError) {
      return res.status(400).json({ ok: false, error: contactsError });
    }

    const pool = await getPool();
    const tx = pool.transaction();
    await tx.begin();

    try {
      const primaryContact = normalizedContacts[0] ?? null;
      const result = await new sql.Request(tx)
        .input("CustomerName", sql.NVarChar(255), nextName)
        .input(
          "CompanyName",
          sql.NVarChar(255),
          normalizeOptionalString(companyName ?? CompanyName)
        )
        .input("Address", sql.NVarChar(sql.MAX), normalizeOptionalString(address ?? Address))
        .input(
          "GSTType",
          sql.NVarChar(20),
          String(gstType ?? GSTType ?? "intra").trim().toLowerCase() === "inter"
            ? "inter"
            : "intra"
        )
        .input("City", sql.NVarChar(120), normalizeOptionalString(city ?? City))
        .input("State", sql.NVarChar(120), normalizeOptionalString(state ?? State))
        .input("Pincode", sql.NVarChar(20), nextPincode)
        .input(
          "GSTNumber",
          sql.NVarChar(30),
          normalizeOptionalString(gstNumber ?? GSTNumber)
        )
        .input(
          "ContactNumber",
          sql.NVarChar(50),
          normalizeOptionalString(phone ?? ContactNumber)
        )
        .input("Email", sql.NVarChar(255), normalizeOptionalString(email ?? Email))
        .input(
          "ContactPerson",
          sql.NVarChar(255),
          normalizeOptionalString(
            contactPerson ?? ContactPerson ?? primaryContact?.contactName
          )
        )
        .input(
          "Designation",
          sql.NVarChar(255),
          normalizeOptionalString(
            designation ?? Designation ?? primaryContact?.designation
          )
        )
        .input(
          "DocumentsJson",
          sql.NVarChar(sql.MAX),
          serializeJson(normalizedDocuments)
        )
        .query(`
          INSERT INTO dbo.Customers
            (CustomerName, CompanyName, Address, GSTNumber, GSTType, City, State, Pincode, ContactNumber, Email, ContactPerson, Designation, DocumentsJson)
          OUTPUT INSERTED.*
          VALUES
            (@CustomerName, @CompanyName, @Address, @GSTNumber, @GSTType, @City, @State, @Pincode, @ContactNumber, @Email, @ContactPerson, @Designation, @DocumentsJson)
        `);

      const customer = normalizeCustomer(result.recordset?.[0] ?? {});
      for (const contact of normalizedContacts) {
        await new sql.Request(tx)
          .input("CustomerId", sql.Int, customer.id)
          .input("ContactName", sql.NVarChar(255), contact.contactName)
          .input("Email", sql.NVarChar(255), contact.email)
          .input("Designation", sql.NVarChar(255), contact.designation)
          .input("Phone", sql.NVarChar(50), contact.phone || null)
          .query(`
            INSERT INTO dbo.CustomerContacts
              (CustomerId, ContactName, Email, Designation, Phone)
            VALUES
              (@CustomerId, @ContactName, @Email, @Designation, @Phone)
          `);
      }

      await tx.commit();

      return res.status(201).json({
        ok: true,
        customer: attachCustomerContacts(
          {
            ...customer,
            documents: normalizedDocuments,
          },
          normalizedContacts
        ),
      });
    } catch (error) {
      await rollbackTx(tx);
      throw error;
    }
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error?.message ?? "Failed to create customer",
    });
  }
});

app.put("/api/customers/:id", async (req, res) => {
  try {
    await ensureCustomersTable();
    const id = Number.parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ ok: false, error: "Invalid customer id" });
    }

    const {
      name,
      companyName,
      address,
      gstType,
      city,
      state,
      pincode,
      gstNumber,
      phone,
      email,
      contactPerson,
      designation,
      contacts,
      documents,
      CustomerName,
      CompanyName,
      Address,
      GSTType,
      City,
      State,
      Pincode,
      GSTNumber,
      ContactNumber,
      Email,
      ContactPerson,
      Designation,
    } = req.body ?? {};

    const nextName = normalizeOptionalString(name ?? CustomerName);
    if (!nextName) {
      return res.status(400).json({ ok: false, error: "Customer name is required" });
    }
    const nextPincode = normalizeOptionalString(pincode ?? Pincode);
    if (!nextPincode) {
      return res.status(400).json({ ok: false, error: "Customer pincode is required" });
    }
    const hasContactsPayload = Array.isArray(contacts);
    const hasDocumentsPayload = Array.isArray(documents);
    const normalizedContacts = hasContactsPayload
      ? normalizeCustomerContactsInput(contacts)
      : [];
    const normalizedDocuments = hasDocumentsPayload
      ? normalizeUploadedDocumentsInput(documents)
      : [];
    const contactsError = hasContactsPayload
      ? getCustomerContactsValidationError(normalizedContacts)
      : "";
    if (contactsError) {
      return res.status(400).json({ ok: false, error: contactsError });
    }

    const pool = await getPool();
    const tx = pool.transaction();
    await tx.begin();

    try {
      const primaryContact = normalizedContacts[0] ?? null;
      const result = await new sql.Request(tx)
        .input("CustomerId", sql.Int, id)
        .input("CustomerName", sql.NVarChar(255), nextName)
        .input(
          "CompanyName",
          sql.NVarChar(255),
          normalizeOptionalString(companyName ?? CompanyName)
        )
        .input("Address", sql.NVarChar(sql.MAX), normalizeOptionalString(address ?? Address))
        .input(
          "GSTType",
          sql.NVarChar(20),
          String(gstType ?? GSTType ?? "intra").trim().toLowerCase() === "inter"
            ? "inter"
            : "intra"
        )
        .input("City", sql.NVarChar(120), normalizeOptionalString(city ?? City))
        .input("State", sql.NVarChar(120), normalizeOptionalString(state ?? State))
        .input("Pincode", sql.NVarChar(20), nextPincode)
        .input(
          "GSTNumber",
          sql.NVarChar(30),
          normalizeOptionalString(gstNumber ?? GSTNumber)
        )
        .input(
          "ContactNumber",
          sql.NVarChar(50),
          normalizeOptionalString(phone ?? ContactNumber)
        )
        .input("Email", sql.NVarChar(255), normalizeOptionalString(email ?? Email))
        .input(
          "ContactPerson",
          sql.NVarChar(255),
          normalizeOptionalString(
            contactPerson ?? ContactPerson ?? primaryContact?.contactName
          )
        )
        .input(
          "Designation",
          sql.NVarChar(255),
          normalizeOptionalString(
            designation ?? Designation ?? primaryContact?.designation
          )
        )
        .input(
          "DocumentsJson",
          sql.NVarChar(sql.MAX),
          hasDocumentsPayload ? serializeJson(normalizedDocuments) : null
        )
        .query(`
          UPDATE dbo.Customers
          SET CustomerName = @CustomerName,
              CompanyName = @CompanyName,
              Address = @Address,
              GSTNumber = @GSTNumber,
              GSTType = @GSTType,
              City = @City,
              State = @State,
              Pincode = @Pincode,
              ContactNumber = @ContactNumber,
              Email = @Email,
              ContactPerson = @ContactPerson,
              Designation = @Designation,
              DocumentsJson = COALESCE(@DocumentsJson, DocumentsJson),
              UpdatedAt = SYSUTCDATETIME()
          OUTPUT INSERTED.*
          WHERE CustomerId = @CustomerId
        `);

      const updated = result.recordset?.[0];
      if (!updated) {
        await tx.rollback();
        return res.status(404).json({ ok: false, error: "Customer not found" });
      }

      if (hasContactsPayload) {
        await new sql.Request(tx)
          .input("CustomerId", sql.Int, id)
          .query(`DELETE FROM dbo.CustomerContacts WHERE CustomerId = @CustomerId`);

        for (const contact of normalizedContacts) {
          await new sql.Request(tx)
            .input("CustomerId", sql.Int, id)
            .input("ContactName", sql.NVarChar(255), contact.contactName)
            .input("Email", sql.NVarChar(255), contact.email)
            .input("Designation", sql.NVarChar(255), contact.designation)
            .input("Phone", sql.NVarChar(50), contact.phone || null)
            .query(`
              INSERT INTO dbo.CustomerContacts
                (CustomerId, ContactName, Email, Designation, Phone)
              VALUES
                (@CustomerId, @ContactName, @Email, @Designation, @Phone)
            `);
        }
      }

      await tx.commit();

      let savedContacts = normalizedContacts;
      if (!hasContactsPayload) {
        const contactsResult = await pool
          .request()
          .input("CustomerId", sql.Int, id)
          .query(`
            SELECT *
            FROM dbo.CustomerContacts
            WHERE CustomerId = @CustomerId
            ORDER BY CustomerContactId ASC
          `);
        savedContacts = (contactsResult.recordset ?? []).map(
          normalizeCustomerContact
        );
      }

      return res.json({
        ok: true,
        customer: attachCustomerContacts(
          {
            ...normalizeCustomer(updated),
            documents: hasDocumentsPayload
              ? normalizedDocuments
              : normalizeCustomer(updated).documents,
          },
          savedContacts
        ),
      });
    } catch (error) {
      await rollbackTx(tx);
      throw error;
    }
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error?.message ?? "Failed to update customer",
    });
  }
});

app.delete("/api/customers/:id", async (req, res) => {
  try {
    await ensureCustomersTable();
    await ensureProjectsTable();
    const id = Number.parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ ok: false, error: "Invalid customer id" });
    }

    const pool = await getPool();
    const dependencyResult = await pool
      .request()
      .input("CustomerId", sql.Int, id)
      .query(`
        SELECT COUNT(1) AS count
        FROM dbo.Projects
        WHERE CustomerId = @CustomerId
      `);
    const dependencyCount = Number(dependencyResult.recordset?.[0]?.count ?? 0);
    if (dependencyCount > 0) {
      return res.status(409).json({
        ok: false,
        error: `Customer cannot be deleted because it is linked to ${dependencyCount} project${dependencyCount === 1 ? "" : "s"}.`,
      });
    }

    const result = await pool
      .request()
      .input("CustomerId", sql.Int, id)
      .query(`
        DELETE FROM dbo.Customers
        OUTPUT DELETED.CustomerId
        WHERE CustomerId = @CustomerId
      `);

    if (!result.recordset?.length) {
      return res.status(404).json({ ok: false, error: "Customer not found" });
    }

    return res.json({ ok: true });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error?.message ?? "Failed to delete customer",
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
        CustomerId,
        Client,
        ClientCompany,
        ClientAddress,
        ClientGSTNumber,
        ClientPhone,
        ClientEmail,
        ClientContactPerson,
        ClientDesignation,
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
          CustomerId,
          Client,
          ClientCompany,
          ClientAddress,
          ClientGSTNumber,
          ClientPhone,
          ClientEmail,
          ClientContactPerson,
          ClientDesignation,
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
    await ensureCustomersTable();
    const {
      name,
      code,
      customerId,
      clientId,
      client,
      companyName,
      address,
      gstNumber,
      phone,
      email,
      contactPerson,
      designation,
      status,
      startDate,
      endDate,
      notes,
      ProjectName,
      ProjectCode,
      CustomerId,
      ClientId,
      Client,
      CompanyName,
      Address,
      GSTNumber,
      Phone,
      Email,
      ContactPerson,
      Designation,
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
    const nextStatus = normalizeOptionalString(status ?? Status);
    const nextNotes = normalizeOptionalString(notes ?? Notes);
    const nextCustomerId = toNullableInt(customerId ?? CustomerId ?? clientId ?? ClientId);
    if (!nextCustomerId) {
      return res
        .status(400)
        .json({ ok: false, error: "Customer is required for project creation" });
    }

    const parsedStartDate = parseDateInput(startDate ?? StartDate);
    if (Number.isNaN(parsedStartDate)) {
      return res.status(400).json({ ok: false, error: "Invalid start date" });
    }
    const parsedEndDate = parseDateInput(endDate ?? EndDate);
    if (Number.isNaN(parsedEndDate)) {
      return res.status(400).json({ ok: false, error: "Invalid end date" });
    }

    const pool = await getPool();
    const selectedCustomer = await getCustomerById(pool, nextCustomerId);
    if (!selectedCustomer) {
      return res.status(400).json({ ok: false, error: "Selected customer was not found" });
    }
    const finalSnapshot = getProjectSnapshotFromCustomer(selectedCustomer);

    const result = await pool
      .request()
      .input("ProjectName", sql.NVarChar(255), nextName)
      .input("ProjectCode", sql.NVarChar(100), nextCode)
      .input("CustomerId", sql.Int, nextCustomerId)
      .input("Client", sql.NVarChar(255), finalSnapshot.client)
      .input("ClientCompany", sql.NVarChar(255), finalSnapshot.companyName)
      .input("ClientAddress", sql.NVarChar(sql.MAX), finalSnapshot.address)
      .input("ClientGSTNumber", sql.NVarChar(30), finalSnapshot.gstNumber)
      .input("ClientPhone", sql.NVarChar(50), finalSnapshot.phone)
      .input("ClientEmail", sql.NVarChar(255), finalSnapshot.email)
      .input(
        "ClientContactPerson",
        sql.NVarChar(255),
        finalSnapshot.contactPerson
      )
      .input("ClientDesignation", sql.NVarChar(255), finalSnapshot.designation)
      .input("Status", sql.NVarChar(50), nextStatus)
      .input("StartDate", sql.Date, parsedStartDate)
      .input("EndDate", sql.Date, parsedEndDate)
      .input("Notes", sql.NVarChar(sql.MAX), nextNotes)
      .query(`
        INSERT INTO dbo.Projects
          (
            ProjectName,
            ProjectCode,
            CustomerId,
            Client,
            ClientCompany,
            ClientAddress,
            ClientGSTNumber,
            ClientPhone,
            ClientEmail,
            ClientContactPerson,
            ClientDesignation,
            Status,
            StartDate,
            EndDate,
            Notes
          )
        OUTPUT INSERTED.*
        VALUES
          (
            @ProjectName,
            @ProjectCode,
            @CustomerId,
            @Client,
            @ClientCompany,
            @ClientAddress,
            @ClientGSTNumber,
            @ClientPhone,
            @ClientEmail,
            @ClientContactPerson,
            @ClientDesignation,
            @Status,
            @StartDate,
            @EndDate,
            @Notes
          )
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
    await ensureCustomersTable();
    const id = Number.parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ ok: false, error: "Invalid project id" });
    }

    const {
      name,
      code,
      customerId,
      clientId,
      client,
      companyName,
      address,
      gstNumber,
      phone,
      email,
      contactPerson,
      designation,
      status,
      startDate,
      endDate,
      notes,
      ProjectName,
      ProjectCode,
      CustomerId,
      ClientId,
      Client,
      CompanyName,
      Address,
      GSTNumber,
      Phone,
      Email,
      ContactPerson,
      Designation,
      Status,
      StartDate,
      EndDate,
      Notes,
    } = req.body ?? {};

    const hasName = name !== undefined || ProjectName !== undefined;
    const hasCode = code !== undefined || ProjectCode !== undefined;
    const hasCustomerId =
      customerId !== undefined ||
      CustomerId !== undefined ||
      clientId !== undefined ||
      ClientId !== undefined;
    const hasClient = client !== undefined || Client !== undefined;
    const hasCompanyName = companyName !== undefined || CompanyName !== undefined;
    const hasAddress = address !== undefined || Address !== undefined;
    const hasGstNumber = gstNumber !== undefined || GSTNumber !== undefined;
    const hasPhone = phone !== undefined || Phone !== undefined;
    const hasEmail = email !== undefined || Email !== undefined;
    const hasContactPerson =
      contactPerson !== undefined || ContactPerson !== undefined;
    const hasDesignation =
      designation !== undefined || Designation !== undefined;
    const hasStatus = status !== undefined || Status !== undefined;
    const hasStartDate = startDate !== undefined || StartDate !== undefined;
    const hasEndDate = endDate !== undefined || EndDate !== undefined;
    const hasNotes = notes !== undefined || Notes !== undefined;

    const nextName = hasName ? normalizeOptionalString(name ?? ProjectName) : undefined;
    if (hasName && !nextName) {
      return res.status(400).json({ ok: false, error: "Project name is required" });
    }

    const nextCode = hasCode ? normalizeOptionalString(code ?? ProjectCode) : undefined;
    const nextStatus = hasStatus ? normalizeOptionalString(status ?? Status) : undefined;
    const nextNotes = hasNotes ? normalizeOptionalString(notes ?? Notes) : undefined;
    const nextCustomerId = hasCustomerId
      ? toNullableInt(customerId ?? CustomerId ?? clientId ?? ClientId)
      : undefined;

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
          CustomerId,
          Client,
          ClientCompany,
          ClientAddress,
          ClientGSTNumber,
          ClientPhone,
          ClientEmail,
          ClientContactPerson,
          ClientDesignation,
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
    const resolvedCustomerId = hasCustomerId
      ? nextCustomerId
      : toNullableInt(existing.CustomerId);
    if (!resolvedCustomerId) {
      return res
        .status(400)
        .json({ ok: false, error: "Customer is required for every project" });
    }

    const selectedCustomer = await getCustomerSnapshotById(pool, resolvedCustomerId);
    if (!selectedCustomer) {
      return res.status(400).json({ ok: false, error: "Selected customer was not found" });
    }

    const finalSnapshot = getProjectSnapshotFromCustomer(selectedCustomer);
    const finalCustomerId = resolvedCustomerId;

    const finalStatus = hasStatus ? nextStatus : existing.Status;
    const finalStartDate = hasStartDate ? parsedStartDate : existing.StartDate;
    const finalEndDate = hasEndDate ? parsedEndDate : existing.EndDate;
    const finalNotes = hasNotes ? nextNotes : existing.Notes;

    const result = await pool
      .request()
      .input("ProjectId", sql.Int, id)
      .input("ProjectName", sql.NVarChar(255), finalName)
      .input("ProjectCode", sql.NVarChar(100), finalCode)
      .input("CustomerId", sql.Int, finalCustomerId)
      .input("Client", sql.NVarChar(255), finalSnapshot.client)
      .input("ClientCompany", sql.NVarChar(255), finalSnapshot.companyName)
      .input("ClientAddress", sql.NVarChar(sql.MAX), finalSnapshot.address)
      .input("ClientGSTNumber", sql.NVarChar(30), finalSnapshot.gstNumber)
      .input("ClientPhone", sql.NVarChar(50), finalSnapshot.phone)
      .input("ClientEmail", sql.NVarChar(255), finalSnapshot.email)
      .input(
        "ClientContactPerson",
        sql.NVarChar(255),
        finalSnapshot.contactPerson
      )
      .input("ClientDesignation", sql.NVarChar(255), finalSnapshot.designation)
      .input("Status", sql.NVarChar(50), finalStatus)
      .input("StartDate", sql.Date, finalStartDate)
      .input("EndDate", sql.Date, finalEndDate)
      .input("Notes", sql.NVarChar(sql.MAX), finalNotes)
      .query(`
        UPDATE dbo.Projects
        SET ProjectName = @ProjectName,
            ProjectCode = @ProjectCode,
            CustomerId = @CustomerId,
            Client = @Client,
            ClientCompany = @ClientCompany,
            ClientAddress = @ClientAddress,
            ClientGSTNumber = @ClientGSTNumber,
            ClientPhone = @ClientPhone,
            ClientEmail = @ClientEmail,
            ClientContactPerson = @ClientContactPerson,
            ClientDesignation = @ClientDesignation,
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

app.get("/api/locations", async (req, res) => {
  try {
    await ensureLocationsTable();
    const pool = await getPool();
    const requestedProjectId = toNullableInt(req.query?.projectId);
    const hasProjectFilter = requestedProjectId !== null;
    const locationsRequest = pool.request();

    if (hasProjectFilter) {
      locationsRequest.input("ProjectId", sql.Int, requestedProjectId);
    }

    const result = await locationsRequest.query(
      hasProjectFilter
        ? `
      SELECT *
      FROM dbo.Locations
      WHERE ProjectId = @ProjectId
         OR ProjectId IS NULL
      ORDER BY LocationId DESC
    `
        : `
      SELECT *
      FROM dbo.Locations
      ORDER BY LocationId DESC
    `
    );
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

app.get("/api/locations/reallocation-lookup", async (_req, res) => {
  try {
    const pool = await getPool();
    const locations = await loadReallocationLocationLookupRows(pool);
    return res.json({ ok: true, locations });
  } catch (error) {
    return res.status(error?.statusCode ?? 500).json({
      ok: false,
      error: error?.message ?? "Failed to fetch reallocation locations",
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
    const orderIds = uniquePurchaseOrderIds(
      (ordersResult.recordset ?? []).map((row) => row.Id)
    );
    const metricsByPoItem = await loadPurchaseOrderItemReceiveMetricsMap(
      pool,
      orderIds
    );
    const fallbackMetricsByPoItem =
      await loadPurchaseOrderItemReceiveMetricsFallbackMap(pool, orderIds);
    const itemsByOrder = itemsResult.recordset.reduce((acc, row) => {
      const key = row.PurchaseOrderId;
      if (!acc[key]) acc[key] = [];
      const normalizedItem = normalizePoItem(row);
      const metricKey = buildPurchaseOrderItemMetricKey(
        row.PurchaseOrderId,
        normalizedItem.poItemId ?? normalizedItem.id
      );
      const metrics = pickPurchaseOrderItemReceiveMetrics(
        metricsByPoItem.get(metricKey),
        fallbackMetricsByPoItem.get(metricKey)
      );
      acc[key].push(mergePurchaseOrderItemReceiveMetrics(normalizedItem, metrics));
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

    const metricsByPoItem = await loadPurchaseOrderItemReceiveMetricsMap(pool, [id]);
    const fallbackMetricsByPoItem =
      await loadPurchaseOrderItemReceiveMetricsFallbackMap(pool, [id]);
    const items = (itemsResult.recordset ?? []).map((row) =>
      mergePurchaseOrderItemReceiveMetrics(
        normalizePoItem(row),
        pickPurchaseOrderItemReceiveMetrics(
          metricsByPoItem.get(
            buildPurchaseOrderItemMetricKey(
              row.PurchaseOrderId,
              row.POItemId ?? row.PurchaseOrderItemId ?? row.Id ?? row.id
            )
          ),
          fallbackMetricsByPoItem.get(
            buildPurchaseOrderItemMetricKey(
              row.PurchaseOrderId,
              row.POItemId ?? row.PurchaseOrderItemId ?? row.Id ?? row.id
            )
          )
        )
      )
    );
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
    projectId = null,
    vendorId = null,
    locationId = null,
    shipToLocationId = null,
    boqId = null,
    status = "Draft",
    orderDate = null,
    expectedDate = null,
    expectedDeliveryDate = null,
    notes = null,
    termsAndConditions = undefined,
    TermsAndConditions = undefined,
    items = [],
  } = req.body ?? {};

  const normalizedItems = normalizePurchaseOrderItemsInput(items);
  if (!normalizedItems.length) {
    return res.status(400).json({ ok: false, error: "At least one line item is required" });
  }
  try {
    validatePurchaseOrderItemsInput(normalizedItems);
  } catch (validationError) {
    return res.status(validationError?.statusCode ?? 400).json({
      ok: false,
      error: validationError?.message ?? "Invalid purchase order line items",
    });
  }

  let tx;
  try {
    await ensurePurchaseTables();
    const pool = await getPool();
    tx = pool.transaction();
    await tx.begin();

    const poNumValue = await generateNextPurchaseOrderNumber(tx, orderDate);
    const parsedOrderDate = parseDateInput(orderDate);
    const parsedExpected = parseDateInput(expectedDate);
    const parsedExpectedDelivery = parseDateInput(expectedDeliveryDate ?? expectedDate);
    const safeShipToLocationId = toNullableInt(shipToLocationId ?? locationId);
    const safeLocationId = toNullableInt(locationId ?? shipToLocationId);

    await validatePurchaseOrderBoqItemsAvailable(tx, {
      projectId,
      boqId,
      items: normalizedItems,
    });

    const insertOrder = new sql.Request(tx);
    insertOrder.input("PONumber", sql.NVarChar(100), poNumValue || null);
    insertOrder.input("ProjectId", sql.Int, projectId ?? null);
    insertOrder.input("VendorId", sql.Int, vendorId ?? null);
    insertOrder.input("LocationId", sql.Int, safeLocationId);
    insertOrder.input("ShipToLocationId", sql.Int, safeShipToLocationId);
    insertOrder.input("BOQId", sql.Int, toNullableInt(boqId));
    insertOrder.input("Status", sql.NVarChar(50), status || "Draft");
    insertOrder.input("OrderDate", sql.Date, parsedOrderDate || null);
    insertOrder.input("ExpectedDate", sql.Date, parsedExpected ?? parsedExpectedDelivery ?? null);
    insertOrder.input("ExpectedDeliveryDate", sql.Date, parsedExpectedDelivery ?? null);
    insertOrder.input("Notes", sql.NVarChar(sql.MAX), notes || null);
    insertOrder.input(
      "TermsAndConditions",
      sql.NVarChar(sql.MAX),
      normalizePurchaseOrderTerms(
        termsAndConditions ?? TermsAndConditions,
        DEFAULT_PURCHASE_ORDER_TERMS
      )
    );

    const orderResult = await insertOrder.query(`
      INSERT INTO PurchaseOrders
        (PONumber, ProjectId, VendorId, LocationId, ShipToLocationId, BOQId, Status, OrderDate, ExpectedDate, ExpectedDeliveryDate, Notes, TermsAndConditions, Total)
      OUTPUT INSERTED.*
      VALUES (@PONumber, @ProjectId, @VendorId, @LocationId, @ShipToLocationId, @BOQId, @Status, @OrderDate, @ExpectedDate, @ExpectedDeliveryDate, @Notes, @TermsAndConditions, 0)
    `);

    const orderRow = orderResult.recordset?.[0];
    const orderId = orderRow?.Id;

    const total = await insertPurchaseOrderItems(tx, orderId, normalizedItems);

    const totalReq = new sql.Request(tx);
    totalReq.input("Id", sql.Int, orderId);
    totalReq.input("Total", sql.Decimal(18, 2), roundCurrencyValue(total));
    await totalReq.query(`
      UPDATE PurchaseOrders
      SET Total = @Total,
          UpdatedAt = SYSUTCDATETIME()
      WHERE Id = @Id
    `);

    const affectedBoqItemIds = await applyBoqQuantitiesFromPurchaseOrderItems(tx, {
      boqId,
      items: normalizedItems,
    });
    const syncedPurchaseOrderIds = await syncPurchaseOrderItemsFromBoq(
      tx,
      affectedBoqItemIds
    );
    await refreshPurchaseOrdersDerivedData(tx, [orderId, ...syncedPurchaseOrderIds]);

    await tx.commit();

    const refreshedOrderResult = await pool
      .request()
      .input("Id", sql.Int, orderId)
      .query(`
        SELECT *
        FROM PurchaseOrders
        WHERE Id = @Id
      `);
    const itemsResult = await pool
      .request()
      .input("PurchaseOrderId", sql.Int, orderId)
      .query(`
        SELECT * FROM PurchaseOrderItems WHERE PurchaseOrderId = @PurchaseOrderId
      `);
    const metricsByPoItem = await loadPurchaseOrderItemReceiveMetricsMap(pool, [orderId]);
    const fallbackMetricsByPoItem =
      await loadPurchaseOrderItemReceiveMetricsFallbackMap(pool, [orderId]);
    const items = (itemsResult.recordset ?? []).map((row) =>
      mergePurchaseOrderItemReceiveMetrics(
        normalizePoItem(row),
        pickPurchaseOrderItemReceiveMetrics(
          metricsByPoItem.get(
            buildPurchaseOrderItemMetricKey(
              row.PurchaseOrderId,
              row.POItemId ?? row.PurchaseOrderItemId ?? row.Id ?? row.id
            )
          ),
          fallbackMetricsByPoItem.get(
            buildPurchaseOrderItemMetricKey(
              row.PurchaseOrderId,
              row.POItemId ?? row.PurchaseOrderItemId ?? row.Id ?? row.id
            )
          )
        )
      )
    );
    const refreshedOrderRow = refreshedOrderResult.recordset?.[0] ?? orderRow;
    const refreshedTotal =
      items.reduce((sum, item) => sum + Number(item.totalPrice || 0), 0) ||
      Number(refreshedOrderRow?.Total ?? total) ||
      0;

    return res.status(201).json({
      ok: true,
      purchaseOrder: {
        ...normalizePurchaseOrder(refreshedOrderRow),
        total: refreshedTotal,
        items,
      },
    });
  } catch (error) {
    await rollbackTx(tx);
    if (error?.statusCode >= 400 && error?.statusCode < 500) {
      return res.status(error.statusCode).json({
        ok: false,
        error: error?.message ?? "Failed to create purchase order",
        ...(error?.details ? { details: error.details } : {}),
      });
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

  const allowLockedEdit =
    req.body?.allowLockedEdit === true || req.body?.allowClosedEdit === true;

  const {
    projectId = null,
    vendorId = null,
    locationId = null,
    shipToLocationId = null,
    boqId = null,
    status = "Draft",
    orderDate = null,
    expectedDate = null,
    expectedDeliveryDate = null,
    notes = null,
    termsAndConditions = undefined,
    TermsAndConditions = undefined,
    items = [],
  } = req.body ?? {};

  const normalizedItems = normalizePurchaseOrderItemsInput(items);
  if (!normalizedItems.length) {
    return res.status(400).json({ ok: false, error: "At least one line item is required" });
  }
  try {
    validatePurchaseOrderItemsInput(normalizedItems);
  } catch (validationError) {
    return res.status(validationError?.statusCode ?? 400).json({
      ok: false,
      error: validationError?.message ?? "Invalid purchase order line items",
    });
  }

  let tx;
  try {
    await ensurePurchaseTables();
    const pool = await getPool();
    tx = pool.transaction();
    await tx.begin();

    const existingOrderResult = await new sql.Request(tx)
      .input("Id", sql.Int, id)
      .query(`
        SELECT *
        FROM dbo.PurchaseOrders
        WHERE Id = @Id
      `);
    const existingOrder = existingOrderResult.recordset?.[0];
    if (!existingOrder) {
      await tx.rollback();
      return res.status(404).json({ ok: false, error: "Purchase order not found" });
    }
    if (isLockedPurchaseOrderStatus(existingOrder.Status) && !allowLockedEdit) {
      await tx.rollback();
      return res.status(409).json({
        ok: false,
        error: getLockedPurchaseOrderError(existingOrder.Status),
      });
    }

    await validatePurchaseOrderBoqItemsAvailable(tx, {
      projectId,
      boqId,
      items: normalizedItems,
      excludePurchaseOrderId: id,
    });

    const finalPONumber =
      normalizeOptionalString(existingOrder.PONumber) ??
      (await generateNextPurchaseOrderNumber(tx, orderDate, id));
    const parsedOrderDate = parseDateInput(orderDate);
    const parsedExpected = parseDateInput(expectedDate);
    const parsedExpectedDelivery = parseDateInput(expectedDeliveryDate ?? expectedDate);
    const safeShipToLocationId = toNullableInt(
      shipToLocationId ?? locationId ?? existingOrder.ShipToLocationId ?? existingOrder.LocationId
    );
    const safeLocationId = toNullableInt(
      locationId ?? shipToLocationId ?? existingOrder.LocationId ?? existingOrder.ShipToLocationId
    );

    const updateOrder = new sql.Request(tx);
    updateOrder.input("Id", sql.Int, id);
    updateOrder.input("PONumber", sql.NVarChar(100), finalPONumber);
    updateOrder.input("ProjectId", sql.Int, projectId ?? null);
    updateOrder.input("VendorId", sql.Int, vendorId ?? null);
    updateOrder.input("LocationId", sql.Int, safeLocationId);
    updateOrder.input("ShipToLocationId", sql.Int, safeShipToLocationId);
    updateOrder.input("BOQId", sql.Int, toNullableInt(boqId));
    updateOrder.input("Status", sql.NVarChar(50), status || "Draft");
    updateOrder.input("OrderDate", sql.Date, parsedOrderDate || null);
    updateOrder.input("ExpectedDate", sql.Date, parsedExpected ?? parsedExpectedDelivery ?? null);
    updateOrder.input("ExpectedDeliveryDate", sql.Date, parsedExpectedDelivery ?? null);
    updateOrder.input("Notes", sql.NVarChar(sql.MAX), notes || null);
    updateOrder.input(
      "TermsAndConditions",
      sql.NVarChar(sql.MAX),
      normalizePurchaseOrderTerms(
        termsAndConditions ?? TermsAndConditions,
        existingOrder.TermsAndConditions ?? DEFAULT_PURCHASE_ORDER_TERMS
      )
    );

    const orderResult = await updateOrder.query(`
      UPDATE PurchaseOrders
      SET PONumber = @PONumber,
          ProjectId = @ProjectId,
          VendorId = @VendorId,
          LocationId = @LocationId,
          ShipToLocationId = @ShipToLocationId,
          BOQId = @BOQId,
          Status = @Status,
          OrderDate = @OrderDate,
          ExpectedDate = @ExpectedDate,
          ExpectedDeliveryDate = @ExpectedDeliveryDate,
          Notes = @Notes,
          TermsAndConditions = @TermsAndConditions,
          UpdatedAt = SYSUTCDATETIME()
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

    const total = await insertPurchaseOrderItems(tx, id, normalizedItems);

    const totalReq = new sql.Request(tx);
    totalReq.input("Id", sql.Int, id);
    totalReq.input("Total", sql.Decimal(18, 2), roundCurrencyValue(total));
    await totalReq.query(`
      UPDATE PurchaseOrders
      SET Total = @Total,
          UpdatedAt = SYSUTCDATETIME()
      WHERE Id = @Id
    `);

    const affectedBoqItemIds = await applyBoqQuantitiesFromPurchaseOrderItems(tx, {
      boqId,
      items: normalizedItems,
    });
    const syncedPurchaseOrderIds = await syncPurchaseOrderItemsFromBoq(
      tx,
      affectedBoqItemIds
    );
    await refreshPurchaseOrdersDerivedData(tx, [id, ...syncedPurchaseOrderIds]);

    await tx.commit();

    const refreshedOrderResult = await pool
      .request()
      .input("Id", sql.Int, id)
      .query(`
        SELECT *
        FROM PurchaseOrders
        WHERE Id = @Id
      `);
    const itemsResult = await pool
      .request()
      .input("PurchaseOrderId", sql.Int, id)
      .query(`
        SELECT * FROM PurchaseOrderItems WHERE PurchaseOrderId = @PurchaseOrderId
      `);
    const metricsByPoItem = await loadPurchaseOrderItemReceiveMetricsMap(pool, [id]);
    const fallbackMetricsByPoItem =
      await loadPurchaseOrderItemReceiveMetricsFallbackMap(pool, [id]);
    const itemsResultRows = (itemsResult.recordset ?? []).map((row) =>
      mergePurchaseOrderItemReceiveMetrics(
        normalizePoItem(row),
        pickPurchaseOrderItemReceiveMetrics(
          metricsByPoItem.get(
            buildPurchaseOrderItemMetricKey(
              row.PurchaseOrderId,
              row.POItemId ?? row.PurchaseOrderItemId ?? row.Id ?? row.id
            )
          ),
          fallbackMetricsByPoItem.get(
            buildPurchaseOrderItemMetricKey(
              row.PurchaseOrderId,
              row.POItemId ?? row.PurchaseOrderItemId ?? row.Id ?? row.id
            )
          )
        )
      )
    );
    const refreshedOrderRow = refreshedOrderResult.recordset?.[0] ?? orderRow;
    const refreshedTotal =
      itemsResultRows.reduce((sum, item) => sum + Number(item.totalPrice || 0), 0) ||
      Number(refreshedOrderRow?.Total ?? total) ||
      0;

    return res.json({
      ok: true,
      purchaseOrder: {
        ...normalizePurchaseOrder(refreshedOrderRow),
        total: refreshedTotal,
        items: itemsResultRows,
      },
    });
  } catch (error) {
    await rollbackTx(tx);
    console.error("PUT /api/purchase-orders/:id failed:", error?.message ?? error);
    if (error?.statusCode >= 400 && error?.statusCode < 500) {
      return res.status(error.statusCode).json({
        ok: false,
        error: error?.message ?? "Failed to update purchase order",
        ...(error?.details ? { details: error.details } : {}),
      });
    }
    return res.status(500).json({
      ok: false,
      error: error?.message ?? "Failed to update purchase order",
    });
  }
});

app.patch("/api/purchase-orders/:id/status", async (req, res) => {
  const id = Number.parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) {
    return res.status(400).json({ ok: false, error: "Invalid purchase order id" });
  }

  const allowLockedEdit =
    req.body?.allowLockedEdit === true || req.body?.allowClosedEdit === true;
  const requestedStatus = normalizeOptionalString(req.body?.status);
  if (!requestedStatus) {
    return res.status(400).json({ ok: false, error: "Status is required" });
  }

  let tx;
  try {
    await ensurePurchaseTables();
    const pool = await getPool();
    tx = pool.transaction();
    await tx.begin();

    const existingOrderResult = await new sql.Request(tx)
      .input("Id", sql.Int, id)
      .query(`
        SELECT TOP 1 *
        FROM dbo.PurchaseOrders
        WHERE Id = @Id
      `);
    const existingOrder = existingOrderResult.recordset?.[0] ?? null;

    if (!existingOrder) {
      await tx.rollback();
      return res.status(404).json({ ok: false, error: "Purchase order not found" });
    }

    if (isLockedPurchaseOrderStatus(existingOrder.Status) && !allowLockedEdit) {
      await tx.rollback();
      return res.status(409).json({
        ok: false,
        error: getLockedPurchaseOrderError(existingOrder.Status),
      });
    }

    const updateOrderResult = await new sql.Request(tx)
      .input("Id", sql.Int, id)
      .input("Status", sql.NVarChar(50), requestedStatus)
      .query(`
        UPDATE dbo.PurchaseOrders
        SET Status = @Status,
            UpdatedAt = SYSUTCDATETIME()
        OUTPUT INSERTED.*
        WHERE Id = @Id
      `);
    const updatedOrder = updateOrderResult.recordset?.[0] ?? null;

    if (!updatedOrder) {
      await tx.rollback();
      return res.status(404).json({ ok: false, error: "Purchase order not found" });
    }

    const linkedBoqItemsResult = await new sql.Request(tx)
      .input("PurchaseOrderId", sql.Int, id)
      .query(`
        SELECT DISTINCT BoqItemId
        FROM dbo.PurchaseOrderItems
        WHERE PurchaseOrderId = @PurchaseOrderId
          AND BoqItemId IS NOT NULL
      `);
    const linkedBoqItemIds = (linkedBoqItemsResult.recordset ?? [])
      .map((row) => toNullableInt(row.BoqItemId))
      .filter((value) => value !== null);
    await refreshBoqAvailability(tx, linkedBoqItemIds);

    await tx.commit();
    tx = null;

    const itemsResult = await pool
      .request()
      .input("PurchaseOrderId", sql.Int, id)
      .query(`
        SELECT * FROM PurchaseOrderItems WHERE PurchaseOrderId = @PurchaseOrderId
      `);
    const metricsByPoItem = await loadPurchaseOrderItemReceiveMetricsMap(pool, [id]);
    const fallbackMetricsByPoItem =
      await loadPurchaseOrderItemReceiveMetricsFallbackMap(pool, [id]);
    const items = (itemsResult.recordset ?? []).map((row) =>
      mergePurchaseOrderItemReceiveMetrics(
        normalizePoItem(row),
        pickPurchaseOrderItemReceiveMetrics(
          metricsByPoItem.get(
            buildPurchaseOrderItemMetricKey(
              row.PurchaseOrderId,
              row.POItemId ?? row.PurchaseOrderItemId ?? row.Id ?? row.id
            )
          ),
          fallbackMetricsByPoItem.get(
            buildPurchaseOrderItemMetricKey(
              row.PurchaseOrderId,
              row.POItemId ?? row.PurchaseOrderItemId ?? row.Id ?? row.id
            )
          )
        )
      )
    );
    const total =
      items.reduce((sum, item) => sum + Number(item.totalPrice || 0), 0) ||
      Number(updatedOrder.Total ?? updatedOrder.total ?? 0) ||
      0;

    return res.json({
      ok: true,
      purchaseOrder: {
        ...normalizePurchaseOrder(updatedOrder),
        items,
        total,
      },
    });
  } catch (error) {
    await rollbackTx(tx);
    return res.status(500).json({
      ok: false,
      error: error?.message ?? "Failed to update purchase order status",
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

    const existingOrderResult = await new sql.Request(tx)
      .input("Id", sql.Int, id)
      .query(`
        SELECT TOP 1 Status
        FROM dbo.PurchaseOrders
        WHERE Id = @Id
      `);
    const existingOrder = existingOrderResult.recordset?.[0] ?? null;

    if (!existingOrder) {
      await tx.rollback();
      return res.status(404).json({ ok: false, error: "Purchase order not found" });
    }

    if (isLockedPurchaseOrderStatus(existingOrder.Status)) {
      await tx.rollback();
      return res.status(409).json({
        ok: false,
        error: getLockedPurchaseOrderError(existingOrder.Status),
      });
    }

    const linkedReceiptsResult = await new sql.Request(tx)
      .input("PurchaseOrderId", sql.Int, id)
      .query(`
        SELECT COUNT(1) AS Total
        FROM dbo.ReceiveGoods
        WHERE PurchaseOrderId = @PurchaseOrderId
      `);
    const linkedReceiptCount = Number(linkedReceiptsResult.recordset?.[0]?.Total ?? 0) || 0;
    if (linkedReceiptCount > 0) {
      await tx.rollback();
      return res.status(409).json({
        ok: false,
        error:
          "This purchase order cannot be deleted because receiving entries already exist for it.",
      });
    }

    const linkedBoqItemsResult = await new sql.Request(tx)
      .input("PurchaseOrderId", sql.Int, id)
      .query(`
        SELECT BoqItemId
        FROM dbo.PurchaseOrderItems
        WHERE PurchaseOrderId = @PurchaseOrderId
          AND BoqItemId IS NOT NULL
      `);
    const linkedBoqItemIds = (linkedBoqItemsResult.recordset ?? [])
      .map((row) => toNullableInt(row.BoqItemId))
      .filter((value) => value !== null);

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

    await refreshBoqAvailability(tx, linkedBoqItemIds);

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

let ensureInvoicesTablesPromise = null;

const ensureInvoicesTables = async () => {
  if (ensureInvoicesTablesPromise) {
    return ensureInvoicesTablesPromise;
  }

  ensureInvoicesTablesPromise = (async () => {
    const pool = await getPool();

    await pool.request().query(`
      IF OBJECT_ID('dbo.Invoices', 'U') IS NULL
      BEGIN
        CREATE TABLE dbo.Invoices (
          InvoiceId INT IDENTITY(1,1) PRIMARY KEY,
          InvoiceNumber NVARCHAR(100) NOT NULL,
          Status NVARCHAR(50) NOT NULL DEFAULT N'Draft',
          InvoiceDate DATE NULL,
          DueDate DATE NULL,
          POReference NVARCHAR(100) NULL,
          PaymentTerms NVARCHAR(100) NULL,
          Currency NVARCHAR(100) NULL,
          TaxMode NVARCHAR(20) NULL,
          PlaceOfSupply NVARCHAR(120) NULL,
          ReverseCharge NVARCHAR(20) NULL,
          IRN NVARCHAR(255) NULL,
          QRReference NVARCHAR(255) NULL,
          ReceiveGoodsId INT NULL,
          PurchaseOrderId INT NULL,
          VendorId INT NULL,
          ProjectId INT NULL,
          SupplierJson NVARCHAR(MAX) NULL,
          BuyerJson NVARCHAR(MAX) NULL,
          ItemsJson NVARCHAR(MAX) NULL,
          PaymentJson NVARCHAR(MAX) NULL,
          NotesJson NVARCHAR(MAX) NULL,
          DocumentsJson NVARCHAR(MAX) NULL,
          TotalsJson NVARCHAR(MAX) NULL,
          CreatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
          UpdatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
        )
      END
    `);

    await pool.request().query(`
      IF COL_LENGTH('dbo.Invoices', 'InvoiceNumber') IS NULL
      BEGIN
        ALTER TABLE dbo.Invoices ADD InvoiceNumber NVARCHAR(100) NOT NULL CONSTRAINT DF_Invoices_InvoiceNumber DEFAULT N'';
      END;
      IF COL_LENGTH('dbo.Invoices', 'Status') IS NULL
      BEGIN
        ALTER TABLE dbo.Invoices ADD Status NVARCHAR(50) NOT NULL CONSTRAINT DF_Invoices_Status DEFAULT N'Draft';
      END;
      IF COL_LENGTH('dbo.Invoices', 'InvoiceDate') IS NULL
      BEGIN
        ALTER TABLE dbo.Invoices ADD InvoiceDate DATE NULL;
      END;
      IF COL_LENGTH('dbo.Invoices', 'DueDate') IS NULL
      BEGIN
        ALTER TABLE dbo.Invoices ADD DueDate DATE NULL;
      END;
      IF COL_LENGTH('dbo.Invoices', 'POReference') IS NULL
      BEGIN
        ALTER TABLE dbo.Invoices ADD POReference NVARCHAR(100) NULL;
      END;
      IF COL_LENGTH('dbo.Invoices', 'PaymentTerms') IS NULL
      BEGIN
        ALTER TABLE dbo.Invoices ADD PaymentTerms NVARCHAR(100) NULL;
      END;
      IF COL_LENGTH('dbo.Invoices', 'Currency') IS NULL
      BEGIN
        ALTER TABLE dbo.Invoices ADD Currency NVARCHAR(100) NULL;
      END;
      IF COL_LENGTH('dbo.Invoices', 'TaxMode') IS NULL
      BEGIN
        ALTER TABLE dbo.Invoices ADD TaxMode NVARCHAR(20) NULL;
      END;
      IF COL_LENGTH('dbo.Invoices', 'PlaceOfSupply') IS NULL
      BEGIN
        ALTER TABLE dbo.Invoices ADD PlaceOfSupply NVARCHAR(120) NULL;
      END;
      IF COL_LENGTH('dbo.Invoices', 'ReverseCharge') IS NULL
      BEGIN
        ALTER TABLE dbo.Invoices ADD ReverseCharge NVARCHAR(20) NULL;
      END;
      IF COL_LENGTH('dbo.Invoices', 'IRN') IS NULL
      BEGIN
        ALTER TABLE dbo.Invoices ADD IRN NVARCHAR(255) NULL;
      END;
      IF COL_LENGTH('dbo.Invoices', 'QRReference') IS NULL
      BEGIN
        ALTER TABLE dbo.Invoices ADD QRReference NVARCHAR(255) NULL;
      END;
      IF COL_LENGTH('dbo.Invoices', 'ReceiveGoodsId') IS NULL
      BEGIN
        ALTER TABLE dbo.Invoices ADD ReceiveGoodsId INT NULL;
      END;
      IF COL_LENGTH('dbo.Invoices', 'PurchaseOrderId') IS NULL
      BEGIN
        ALTER TABLE dbo.Invoices ADD PurchaseOrderId INT NULL;
      END;
      IF COL_LENGTH('dbo.Invoices', 'VendorId') IS NULL
      BEGIN
        ALTER TABLE dbo.Invoices ADD VendorId INT NULL;
      END;
      IF COL_LENGTH('dbo.Invoices', 'ProjectId') IS NULL
      BEGIN
        ALTER TABLE dbo.Invoices ADD ProjectId INT NULL;
      END;
      IF COL_LENGTH('dbo.Invoices', 'SupplierJson') IS NULL
      BEGIN
        ALTER TABLE dbo.Invoices ADD SupplierJson NVARCHAR(MAX) NULL;
      END;
      IF COL_LENGTH('dbo.Invoices', 'BuyerJson') IS NULL
      BEGIN
        ALTER TABLE dbo.Invoices ADD BuyerJson NVARCHAR(MAX) NULL;
      END;
      IF COL_LENGTH('dbo.Invoices', 'ItemsJson') IS NULL
      BEGIN
        ALTER TABLE dbo.Invoices ADD ItemsJson NVARCHAR(MAX) NULL;
      END;
      IF COL_LENGTH('dbo.Invoices', 'PaymentJson') IS NULL
      BEGIN
        ALTER TABLE dbo.Invoices ADD PaymentJson NVARCHAR(MAX) NULL;
      END;
      IF COL_LENGTH('dbo.Invoices', 'NotesJson') IS NULL
      BEGIN
        ALTER TABLE dbo.Invoices ADD NotesJson NVARCHAR(MAX) NULL;
      END;
      IF COL_LENGTH('dbo.Invoices', 'DocumentsJson') IS NULL
      BEGIN
        ALTER TABLE dbo.Invoices ADD DocumentsJson NVARCHAR(MAX) NULL;
      END;
      IF COL_LENGTH('dbo.Invoices', 'TotalsJson') IS NULL
      BEGIN
        ALTER TABLE dbo.Invoices ADD TotalsJson NVARCHAR(MAX) NULL;
      END;
      IF COL_LENGTH('dbo.Invoices', 'CreatedAt') IS NULL
      BEGIN
        ALTER TABLE dbo.Invoices ADD CreatedAt DATETIME2 NOT NULL CONSTRAINT DF_Invoices_CreatedAt DEFAULT SYSUTCDATETIME();
      END;
      IF COL_LENGTH('dbo.Invoices', 'UpdatedAt') IS NULL
      BEGIN
        ALTER TABLE dbo.Invoices ADD UpdatedAt DATETIME2 NOT NULL CONSTRAINT DF_Invoices_UpdatedAt DEFAULT SYSUTCDATETIME();
      END;
    `);

    await pool.request().query(`
      IF NOT EXISTS (
        SELECT 1
        FROM sys.indexes
        WHERE name = 'IX_Invoices_ReceiveGoodsId'
          AND object_id = OBJECT_ID('dbo.Invoices')
      )
      BEGIN
        CREATE INDEX IX_Invoices_ReceiveGoodsId ON dbo.Invoices (ReceiveGoodsId);
      END;
      IF NOT EXISTS (
        SELECT 1
        FROM sys.indexes
        WHERE name = 'IX_Invoices_PurchaseOrderId'
          AND object_id = OBJECT_ID('dbo.Invoices')
      )
      BEGIN
        CREATE INDEX IX_Invoices_PurchaseOrderId ON dbo.Invoices (PurchaseOrderId);
      END;
      IF NOT EXISTS (
        SELECT 1
        FROM sys.indexes
        WHERE name = 'IX_Invoices_Status'
          AND object_id = OBJECT_ID('dbo.Invoices')
      )
      BEGIN
        CREATE INDEX IX_Invoices_Status ON dbo.Invoices (Status);
      END;
    `);
  })();

  try {
    await ensureInvoicesTablesPromise;
  } finally {
    ensureInvoicesTablesPromise = null;
  }
};

app.get("/api/invoices", async (req, res) => {
  try {
    if (ensureSchemaOnRequest) {
      await ensureInvoicesTables();
      await ensureReceiveTables();
    }

    const pool = await getPool();
    const receiveGoodsId = toNullableInt(req.query?.receiveGoodsId);
    const purchaseOrderId = toNullableInt(req.query?.purchaseOrderId);
    const status = normalizeOptionalString(req.query?.status);
    const request = pool.request();
    const whereClauses = [];

    if (receiveGoodsId !== null) {
      request.input("ReceiveGoodsId", sql.Int, receiveGoodsId);
      whereClauses.push("ReceiveGoodsId = @ReceiveGoodsId");
    }
    if (purchaseOrderId !== null) {
      request.input("PurchaseOrderId", sql.Int, purchaseOrderId);
      whereClauses.push("PurchaseOrderId = @PurchaseOrderId");
    }
    if (status) {
      request.input("Status", sql.NVarChar(50), normalizeInvoiceStatus(status));
      whereClauses.push("Status = @Status");
    }

    const whereSql = whereClauses.length ? `WHERE ${whereClauses.join(" AND ")}` : "";
    const result = await request.query(withSqlLockTimeout(`
      SELECT *
      FROM dbo.Invoices
      ${whereSql}
      ORDER BY InvoiceId DESC
    `));

    return res.json({
      ok: true,
      invoices: (result.recordset ?? []).map(normalizeInvoice),
    });
  } catch (error) {
    console.error("GET /api/invoices failed:", error?.message ?? error);
    return res.status(isSqlLockTimeoutError(error) ? 503 : 500).json({
      ok: false,
      error: isSqlLockTimeoutError(error)
        ? RECEIVE_GOODS_LOCK_MESSAGE
        : error?.message ?? "Failed to fetch invoices",
    });
  }
});

app.get("/api/invoices/:id", async (req, res) => {
  const invoiceId = Number.parseInt(req.params.id, 10);
  if (!Number.isFinite(invoiceId)) {
    return res.status(400).json({ ok: false, error: "Invalid invoice id" });
  }

  try {
    if (ensureSchemaOnRequest) {
      await ensureInvoicesTables();
    }
    const pool = await getPool();
    const row = await findInvoiceRow(pool, invoiceId);
    if (!row) {
      return res.status(404).json({ ok: false, error: "Invoice not found" });
    }
    return res.json({ ok: true, invoice: normalizeInvoice(row) });
  } catch (error) {
    console.error("GET /api/invoices/:id failed:", error?.message ?? error);
    return res.status(isSqlLockTimeoutError(error) ? 503 : 500).json({
      ok: false,
      error: isSqlLockTimeoutError(error)
        ? RECEIVE_GOODS_LOCK_MESSAGE
        : error?.message ?? "Failed to fetch invoice",
    });
  }
});

app.post("/api/invoices", async (req, res) => {
  const {
    invoiceNumber = null,
    status = "Draft",
    invoiceDate = null,
    dueDate = null,
    poReference = null,
    paymentTerms = "Net 30 Days",
    currency = "INR - Indian Rupee",
    taxMode = "intra",
    placeOfSupply = null,
    reverseCharge = "No",
    irn = null,
    qrReference = null,
    receiveGoodsId = null,
    purchaseOrderId = null,
    vendorId = null,
    projectId = null,
    supplier = {},
    buyer = {},
    items = [],
    payment = {},
    notes = {},
    documents = [],
  } = req.body ?? {};

  const safeInvoiceNumber = normalizeOptionalString(invoiceNumber);
  if (!safeInvoiceNumber) {
    return res.status(400).json({ ok: false, error: "invoiceNumber is required" });
  }

  const parsedInvoiceDate = parseDateInput(invoiceDate);
  const parsedDueDate = parseDateInput(dueDate);
  if (Number.isNaN(parsedInvoiceDate)) {
    return res.status(400).json({ ok: false, error: "Invalid invoiceDate" });
  }
  if (Number.isNaN(parsedDueDate)) {
    return res.status(400).json({ ok: false, error: "Invalid dueDate" });
  }

  const normalizedItems = normalizeInvoiceItemsInput(items);
  if (!normalizedItems.length) {
    return res.status(400).json({ ok: false, error: "At least one invoice item is required" });
  }

  const safeReceiveGoodsId = toNullableInt(receiveGoodsId);
  const normalizedStatus = normalizeInvoiceStatus(status);
  const normalizedTaxMode =
    String(taxMode).trim().toLowerCase() === "inter" ? "inter" : "intra";
  const normalizedSupplier = normalizeInvoicePartyInput(supplier);
  const normalizedBuyer = normalizeInvoicePartyInput(buyer);
  const normalizedPayment = normalizeInvoicePaymentInput(payment);
  const normalizedNotes = normalizeInvoiceNotesInput(notes);
  const normalizedDocuments = normalizeUploadedDocumentsInput(documents);
  const totals = buildInvoiceTotalsSnapshot(
    normalizedItems,
    normalizedPayment,
    normalizedTaxMode
  );

  try {
    if (ensureSchemaOnRequest) {
      await ensureInvoicesTables();
      await ensureReceiveTables();
    }
    const pool = await getPool();
    let receiptRow = null;
    if (safeReceiveGoodsId !== null) {
      receiptRow = await findReceiveGoodsRow(pool, safeReceiveGoodsId);
      if (!receiptRow) {
        return res.status(404).json({ ok: false, error: "Source receipt not found" });
      }
    }

    const request = pool.request();
    request.input("InvoiceNumber", sql.NVarChar(100), safeInvoiceNumber);
    request.input("Status", sql.NVarChar(50), normalizedStatus);
    request.input("InvoiceDate", sql.Date, parsedInvoiceDate ?? null);
    request.input("DueDate", sql.Date, parsedDueDate ?? null);
    request.input("POReference", sql.NVarChar(100), normalizeOptionalString(poReference) ?? null);
    request.input(
      "PaymentTerms",
      sql.NVarChar(100),
      normalizeOptionalString(paymentTerms) ?? "Net 30 Days"
    );
    request.input(
      "Currency",
      sql.NVarChar(100),
      normalizeOptionalString(currency) ?? "INR - Indian Rupee"
    );
    request.input("TaxMode", sql.NVarChar(20), normalizedTaxMode);
    request.input(
      "PlaceOfSupply",
      sql.NVarChar(120),
      normalizeOptionalString(placeOfSupply) ?? null
    );
    request.input(
      "ReverseCharge",
      sql.NVarChar(20),
      normalizeOptionalString(reverseCharge) ?? "No"
    );
    request.input("IRN", sql.NVarChar(255), normalizeOptionalString(irn) ?? null);
    request.input(
      "QRReference",
      sql.NVarChar(255),
      normalizeOptionalString(qrReference) ?? null
    );
    request.input("ReceiveGoodsId", sql.Int, safeReceiveGoodsId);
    request.input(
      "PurchaseOrderId",
      sql.Int,
      toNullableInt(purchaseOrderId) ?? toNullableInt(receiptRow?.PurchaseOrderId)
    );
    request.input(
      "VendorId",
      sql.Int,
      toNullableInt(vendorId) ?? toNullableInt(receiptRow?.VendorId)
    );
    request.input(
      "ProjectId",
      sql.Int,
      toNullableInt(projectId) ?? toNullableInt(receiptRow?.ProjectId)
    );
    request.input("SupplierJson", sql.NVarChar(sql.MAX), serializeJson(normalizedSupplier));
    request.input("BuyerJson", sql.NVarChar(sql.MAX), serializeJson(normalizedBuyer));
    request.input("ItemsJson", sql.NVarChar(sql.MAX), serializeJson(normalizedItems));
    request.input("PaymentJson", sql.NVarChar(sql.MAX), serializeJson(normalizedPayment));
    request.input("NotesJson", sql.NVarChar(sql.MAX), serializeJson(normalizedNotes));
    request.input("DocumentsJson", sql.NVarChar(sql.MAX), serializeJson(normalizedDocuments));
    request.input("TotalsJson", sql.NVarChar(sql.MAX), serializeJson(totals));

    const result = await request.query(`
      INSERT INTO dbo.Invoices
        (InvoiceNumber, Status, InvoiceDate, DueDate, POReference, PaymentTerms, Currency, TaxMode, PlaceOfSupply, ReverseCharge, IRN, QRReference, ReceiveGoodsId, PurchaseOrderId, VendorId, ProjectId, SupplierJson, BuyerJson, ItemsJson, PaymentJson, NotesJson, DocumentsJson, TotalsJson)
      OUTPUT INSERTED.*
      VALUES
        (@InvoiceNumber, @Status, @InvoiceDate, @DueDate, @POReference, @PaymentTerms, @Currency, @TaxMode, @PlaceOfSupply, @ReverseCharge, @IRN, @QRReference, @ReceiveGoodsId, @PurchaseOrderId, @VendorId, @ProjectId, @SupplierJson, @BuyerJson, @ItemsJson, @PaymentJson, @NotesJson, @DocumentsJson, @TotalsJson)
    `);

    return res.status(201).json({
      ok: true,
      invoice: normalizeInvoice(result.recordset?.[0] ?? {}),
    });
  } catch (error) {
    console.error("POST /api/invoices failed:", error?.message ?? error);
    return res.status(isSqlLockTimeoutError(error) ? 503 : 500).json({
      ok: false,
      error: isSqlLockTimeoutError(error)
        ? RECEIVE_GOODS_LOCK_MESSAGE
        : error?.message ?? "Failed to save invoice",
    });
  }
});

app.put("/api/invoices/:id", async (req, res) => {
  const invoiceId = Number.parseInt(req.params.id, 10);
  if (!Number.isFinite(invoiceId)) {
    return res.status(400).json({ ok: false, error: "Invalid invoice id" });
  }

  const {
    invoiceNumber = null,
    status = "Draft",
    invoiceDate = null,
    dueDate = null,
    poReference = null,
    paymentTerms = "Net 30 Days",
    currency = "INR - Indian Rupee",
    taxMode = "intra",
    placeOfSupply = null,
    reverseCharge = "No",
    irn = null,
    qrReference = null,
    receiveGoodsId = null,
    purchaseOrderId = null,
    vendorId = null,
    projectId = null,
    supplier = {},
    buyer = {},
    items = [],
    payment = {},
    notes = {},
    documents = [],
  } = req.body ?? {};

  const safeInvoiceNumber = normalizeOptionalString(invoiceNumber);
  if (!safeInvoiceNumber) {
    return res.status(400).json({ ok: false, error: "invoiceNumber is required" });
  }

  const parsedInvoiceDate = parseDateInput(invoiceDate);
  const parsedDueDate = parseDateInput(dueDate);
  if (Number.isNaN(parsedInvoiceDate)) {
    return res.status(400).json({ ok: false, error: "Invalid invoiceDate" });
  }
  if (Number.isNaN(parsedDueDate)) {
    return res.status(400).json({ ok: false, error: "Invalid dueDate" });
  }

  const normalizedItems = normalizeInvoiceItemsInput(items);
  if (!normalizedItems.length) {
    return res.status(400).json({ ok: false, error: "At least one invoice item is required" });
  }

  const safeReceiveGoodsId = toNullableInt(receiveGoodsId);
  const normalizedStatus = normalizeInvoiceStatus(status);
  const normalizedTaxMode =
    String(taxMode).trim().toLowerCase() === "inter" ? "inter" : "intra";
  const normalizedSupplier = normalizeInvoicePartyInput(supplier);
  const normalizedBuyer = normalizeInvoicePartyInput(buyer);
  const normalizedPayment = normalizeInvoicePaymentInput(payment);
  const normalizedNotes = normalizeInvoiceNotesInput(notes);
  const normalizedDocuments = normalizeUploadedDocumentsInput(documents);
  const totals = buildInvoiceTotalsSnapshot(
    normalizedItems,
    normalizedPayment,
    normalizedTaxMode
  );

  try {
    if (ensureSchemaOnRequest) {
      await ensureInvoicesTables();
      await ensureReceiveTables();
    }
    const pool = await getPool();
    const existing = await findInvoiceRow(pool, invoiceId);
    if (!existing) {
      return res.status(404).json({ ok: false, error: "Invoice not found" });
    }

    let receiptRow = null;
    if (safeReceiveGoodsId !== null) {
      receiptRow = await findReceiveGoodsRow(pool, safeReceiveGoodsId);
      if (!receiptRow) {
        return res.status(404).json({ ok: false, error: "Source receipt not found" });
      }
    }

    const request = pool.request();
    request.input("InvoiceId", sql.Int, invoiceId);
    request.input("InvoiceNumber", sql.NVarChar(100), safeInvoiceNumber);
    request.input("Status", sql.NVarChar(50), normalizedStatus);
    request.input("InvoiceDate", sql.Date, parsedInvoiceDate ?? null);
    request.input("DueDate", sql.Date, parsedDueDate ?? null);
    request.input("POReference", sql.NVarChar(100), normalizeOptionalString(poReference) ?? null);
    request.input(
      "PaymentTerms",
      sql.NVarChar(100),
      normalizeOptionalString(paymentTerms) ?? "Net 30 Days"
    );
    request.input(
      "Currency",
      sql.NVarChar(100),
      normalizeOptionalString(currency) ?? "INR - Indian Rupee"
    );
    request.input("TaxMode", sql.NVarChar(20), normalizedTaxMode);
    request.input(
      "PlaceOfSupply",
      sql.NVarChar(120),
      normalizeOptionalString(placeOfSupply) ?? null
    );
    request.input(
      "ReverseCharge",
      sql.NVarChar(20),
      normalizeOptionalString(reverseCharge) ?? "No"
    );
    request.input("IRN", sql.NVarChar(255), normalizeOptionalString(irn) ?? null);
    request.input(
      "QRReference",
      sql.NVarChar(255),
      normalizeOptionalString(qrReference) ?? null
    );
    request.input("ReceiveGoodsId", sql.Int, safeReceiveGoodsId);
    request.input(
      "PurchaseOrderId",
      sql.Int,
      toNullableInt(purchaseOrderId) ?? toNullableInt(receiptRow?.PurchaseOrderId)
    );
    request.input(
      "VendorId",
      sql.Int,
      toNullableInt(vendorId) ?? toNullableInt(receiptRow?.VendorId)
    );
    request.input(
      "ProjectId",
      sql.Int,
      toNullableInt(projectId) ?? toNullableInt(receiptRow?.ProjectId)
    );
    request.input("SupplierJson", sql.NVarChar(sql.MAX), serializeJson(normalizedSupplier));
    request.input("BuyerJson", sql.NVarChar(sql.MAX), serializeJson(normalizedBuyer));
    request.input("ItemsJson", sql.NVarChar(sql.MAX), serializeJson(normalizedItems));
    request.input("PaymentJson", sql.NVarChar(sql.MAX), serializeJson(normalizedPayment));
    request.input("NotesJson", sql.NVarChar(sql.MAX), serializeJson(normalizedNotes));
    request.input("DocumentsJson", sql.NVarChar(sql.MAX), serializeJson(normalizedDocuments));
    request.input("TotalsJson", sql.NVarChar(sql.MAX), serializeJson(totals));

    await request.query(`
      UPDATE dbo.Invoices
      SET InvoiceNumber = @InvoiceNumber,
          Status = @Status,
          InvoiceDate = @InvoiceDate,
          DueDate = @DueDate,
          POReference = @POReference,
          PaymentTerms = @PaymentTerms,
          Currency = @Currency,
          TaxMode = @TaxMode,
          PlaceOfSupply = @PlaceOfSupply,
          ReverseCharge = @ReverseCharge,
          IRN = @IRN,
          QRReference = @QRReference,
          ReceiveGoodsId = @ReceiveGoodsId,
          PurchaseOrderId = @PurchaseOrderId,
          VendorId = @VendorId,
          ProjectId = @ProjectId,
          SupplierJson = @SupplierJson,
          BuyerJson = @BuyerJson,
          ItemsJson = @ItemsJson,
          PaymentJson = @PaymentJson,
          NotesJson = @NotesJson,
          DocumentsJson = @DocumentsJson,
          TotalsJson = @TotalsJson,
          UpdatedAt = SYSUTCDATETIME()
      WHERE InvoiceId = @InvoiceId
    `);

    const updated = await findInvoiceRow(pool, invoiceId);
    return res.json({ ok: true, invoice: normalizeInvoice(updated ?? existing) });
  } catch (error) {
    console.error("PUT /api/invoices/:id failed:", error?.message ?? error);
    return res.status(isSqlLockTimeoutError(error) ? 503 : 500).json({
      ok: false,
      error: isSqlLockTimeoutError(error)
        ? RECEIVE_GOODS_LOCK_MESSAGE
        : error?.message ?? "Failed to update invoice",
    });
  }
});

app.put("/api/invoices/:id/status", async (req, res) => {
  const invoiceId = Number.parseInt(req.params.id, 10);
  if (!Number.isFinite(invoiceId)) {
    return res.status(400).json({ ok: false, error: "Invalid invoice id" });
  }

  const status = normalizeOptionalString(req.body?.status);
  if (!status) {
    return res.status(400).json({ ok: false, error: "status is required" });
  }

  try {
    if (ensureSchemaOnRequest) {
      await ensureInvoicesTables();
    }
    const pool = await getPool();
    const existing = await findInvoiceRow(pool, invoiceId);
    if (!existing) {
      return res.status(404).json({ ok: false, error: "Invoice not found" });
    }

    await pool
      .request()
      .input("InvoiceId", sql.Int, invoiceId)
      .input("Status", sql.NVarChar(50), normalizeInvoiceStatus(status))
      .query(`
        UPDATE dbo.Invoices
        SET Status = @Status,
            UpdatedAt = SYSUTCDATETIME()
        WHERE InvoiceId = @InvoiceId
      `);

    const updated = await findInvoiceRow(pool, invoiceId);
    return res.json({ ok: true, invoice: normalizeInvoice(updated ?? existing) });
  } catch (error) {
    console.error("PUT /api/invoices/:id/status failed:", error?.message ?? error);
    return res.status(isSqlLockTimeoutError(error) ? 503 : 500).json({
      ok: false,
      error: isSqlLockTimeoutError(error)
        ? RECEIVE_GOODS_LOCK_MESSAGE
        : error?.message ?? "Failed to update invoice status",
    });
  }
});

app.delete("/api/invoices/:id", async (req, res) => {
  const invoiceId = Number.parseInt(req.params.id, 10);
  if (!Number.isFinite(invoiceId)) {
    return res.status(400).json({ ok: false, error: "Invalid invoice id" });
  }

  try {
    if (ensureSchemaOnRequest) {
      await ensureInvoicesTables();
    }
    const pool = await getPool();
    const result = await pool
      .request()
      .input("InvoiceId", sql.Int, invoiceId)
      .query(`
        DELETE FROM dbo.Invoices
        WHERE InvoiceId = @InvoiceId
      `);

    if ((result.rowsAffected?.[0] ?? 0) === 0) {
      return res.status(404).json({ ok: false, error: "Invoice not found" });
    }

    return res.json({ ok: true });
  } catch (error) {
    console.error("DELETE /api/invoices/:id failed:", error?.message ?? error);
    return res.status(isSqlLockTimeoutError(error) ? 503 : 500).json({
      ok: false,
      error: isSqlLockTimeoutError(error)
        ? RECEIVE_GOODS_LOCK_MESSAGE
        : error?.message ?? "Failed to delete invoice",
    });
  }
});

app.get("/api/receive-goods", async (req, res) => {
  try {
    if (ensureSchemaOnRequest) {
      await ensureReceiveTables();
    }
    const receivePk = await refreshReceiveGoodsPk();
    const receiveItemsFk = await refreshReceiveGoodsItemsFk();
    const pool = await getPool();

    const poFilter = Number.parseInt(req.query.purchaseOrderId, 10);
    const projectFilter = Number.parseInt(req.query.projectId, 10);
    const hasPoFilter = Number.isFinite(poFilter);
    const hasProjectFilter = Number.isFinite(projectFilter);

    const receiptsReq = pool.request();
    if (hasPoFilter) {
      receiptsReq.input("PurchaseOrderId", sql.Int, poFilter);
    }
    if (hasProjectFilter) {
      receiptsReq.input("ProjectId", sql.Int, projectFilter);
    }
    const whereClauses = [];
    if (hasPoFilter) {
      whereClauses.push("PurchaseOrderId = @PurchaseOrderId");
    }
    if (hasProjectFilter) {
      whereClauses.push("ProjectId = @ProjectId");
    }
    const whereSql = whereClauses.length ? `WHERE ${whereClauses.join(" AND ")}` : "";

    const receiptsResult = await receiptsReq.query(
      withSqlLockTimeout(
        `SELECT * FROM dbo.ReceiveGoods ${whereSql} ORDER BY ${receivePk} DESC`
      )
    );

    const receiptIds = uniqueReceiveGoodsIds(
      (receiptsResult.recordset ?? []).map(
        (row) => row?.[receivePk] ?? row?.ReceiveGoodsId ?? row?.Id ?? null
      )
    );
    if (!receiptIds.length) {
      return res.json({ ok: true, receipts: [] });
    }
    const itemsReq = pool.request();
    const receiptInClause = buildPurchaseOrderItemInClause(
      itemsReq,
      receiptIds,
      "ReceiveGoodsId"
    );
    const itemsResult = await itemsReq.query(
      withSqlLockTimeout(`
        SELECT *
        FROM dbo.ReceiveGoodsItems
        WHERE ${toIdentifier(receiveItemsFk)} IN (${receiptInClause})
      `)
    );

    const normalizedItems = await hydrateReceiveGoodsItemsWithInventoryMetrics(
      pool,
      itemsResult.recordset ?? []
    );

    const itemsByReceipt = normalizedItems.reduce(
      (acc, row) => {
        if (!row.receiveGoodsId) {
          return acc;
        }
        if (!acc[row.receiveGoodsId]) {
          acc[row.receiveGoodsId] = [];
        }
        acc[row.receiveGoodsId].push(row);
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
    console.error("GET /api/receive-goods failed:", error?.message ?? error);
    return res.status(isSqlLockTimeoutError(error) ? 503 : 500).json({
      ok: false,
      error: isSqlLockTimeoutError(error)
        ? RECEIVE_GOODS_LOCK_MESSAGE
        : error?.message ?? "Failed to fetch receipts",
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
    const receiptRow = await findReceiveGoodsRow(pool, id);
    if (!receiptRow) {
      return res.status(404).json({ ok: false, error: "Receipt not found" });
    }

    const itemsResult = await pool
      .request()
      .input("ReceiptId", sql.Int, id)
      .query(withSqlLockTimeout(`
        SELECT * FROM dbo.ReceiveGoodsItems WHERE ${fkCol} = @ReceiptId
      `));

    const normalizedItems = await hydrateReceiveGoodsItemsWithInventoryMetrics(
      pool,
      itemsResult.recordset ?? []
    );

    return res.json({
      ok: true,
      receipt: {
        ...normalizeReceiveGoods(receiptRow),
        items: normalizedItems,
      },
    });
  } catch (error) {
    console.error("GET /api/receive-goods/:id failed:", error?.message ?? error);
    return res.status(isSqlLockTimeoutError(error) ? 503 : 500).json({
      ok: false,
      error: isSqlLockTimeoutError(error)
        ? RECEIVE_GOODS_LOCK_MESSAGE
        : error?.message ?? "Failed to fetch receipt",
    });
  }
});

app.post("/api/receive-goods", async (req, res) => {
  const {
    purchaseOrderId,
    projectId = null,
    vendorId = null,
    locationId = null,
    boqId = null,
    receivedDate = null,
    receivedBy = null,
    invoiceNumber = null,
    invoiceDate = null,
    invoiceDocumentName = null,
    invoiceDocumentType = null,
    invoiceDocumentSize = null,
    invoiceDocumentData = null,
    billFrom = null,
    billTo = null,
    shipTo = null,
    showProjectDetails = true,
    notes = null,
    items = [],
    status = null,
    taxMode = "intra",
    auditBy = null,
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
  const negativeItem = findNegativeQuantityInput(items, [
    "receivedQty",
    "ReceivedQty",
    "received",
  ]);
  if (negativeItem) {
    return res.status(400).json({
      ok: false,
      error: `Received quantity for ${
        negativeItem.name ?? negativeItem.Name ?? "item"
      } cannot be negative.`,
    });
  }
  const normalizedItems = normalizeReceiveGoodsItemsInput(items);
  const hasItems = normalizedItems.ordered.some(
    (item) => item.receivedQty > 0
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
  const parsedInvoiceDate = parseDateInput(invoiceDate);
  if (Number.isNaN(parsedInvoiceDate)) {
    return res.status(400).json({
      ok: false,
      error: "Invalid invoiceDate",
    });
  }
  const normalizedTaxMode =
    String(taxMode).trim().toLowerCase() === "inter" ? "inter" : "intra";
  const normalizedBillFrom = normalizeOptionalString(billFrom ?? billTo) ?? null;

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
      await rollbackTx(tx);
      tx = null;
      return res.status(404).json({
        ok: false,
        error: "Purchase order not found",
      });
    }
    if (isLockedPurchaseOrderStatus(poRow.Status)) {
      await rollbackTx(tx);
      tx = null;
      return res.status(409).json({
        ok: false,
        error: getLockedPurchaseOrderError(poRow.Status),
      });
    }

    await validateReceiveQuantitiesAgainstAvailability(tx, {
      purchaseOrderId: poId,
      receivePk,
      normalizedItems,
    });
    await validateReceiveSerialNumbers(tx, {
      normalizedItems,
    });
    const beforeItemTotals = await loadReceiveItemTotalsByItemId(tx, poId);

    const upsertReq = new sql.Request(tx);
    upsertReq.input("PurchaseOrderId", sql.Int, poId);
    upsertReq.input("ProjectId", sql.Int, safeProjectId ?? toNullableInt(poRow?.ProjectId));
    upsertReq.input("VendorId", sql.Int, safeVendorId ?? toNullableInt(poRow?.VendorId));
    upsertReq.input("LocationId", sql.Int, safeLocationId ?? toNullableInt(poRow?.LocationId));
    upsertReq.input("ReceivedDate", sql.Date, parsedDate ?? null);
    upsertReq.input("ReceivedBy", sql.NVarChar(100), normalizeOptionalString(receivedBy) ?? null);
    upsertReq.input(
      "InvoiceNumber",
      sql.NVarChar(100),
      normalizeOptionalString(invoiceNumber) ?? null
    );
    upsertReq.input("InvoiceDate", sql.Date, parsedInvoiceDate ?? null);
    upsertReq.input(
      "InvoiceDocumentName",
      sql.NVarChar(255),
      normalizeOptionalString(invoiceDocumentName) ?? null
    );
    upsertReq.input(
      "InvoiceDocumentType",
      sql.NVarChar(120),
      normalizeOptionalString(invoiceDocumentType) ?? null
    );
    upsertReq.input(
      "InvoiceDocumentSize",
      sql.Int,
      Number.isFinite(Number(invoiceDocumentSize))
        ? Number(invoiceDocumentSize)
        : null
    );
    upsertReq.input(
      "InvoiceDocumentData",
      sql.NVarChar(sql.MAX),
      normalizeOptionalString(invoiceDocumentData) ?? null
    );
    upsertReq.input("BillFrom", sql.NVarChar(sql.MAX), normalizedBillFrom);
    upsertReq.input("BillTo", sql.NVarChar(sql.MAX), normalizedBillFrom);
    upsertReq.input("ShipTo", sql.NVarChar(sql.MAX), normalizeOptionalString(shipTo) ?? null);
    upsertReq.input(
      "ShowProjectDetails",
      sql.Bit,
      showProjectDetails === undefined || showProjectDetails === null
        ? true
        : !["0", "false", "no"].includes(String(showProjectDetails).toLowerCase())
    );
    upsertReq.input("Notes", sql.NVarChar(sql.MAX), normalizeOptionalString(notes) ?? null);
    upsertReq.input("TaxMode", sql.NVarChar(20), normalizedTaxMode);
    upsertReq.input("Status", sql.NVarChar(50), status || "Draft");
    upsertReq.input("BOQId", sql.Int, toNullableInt(boqId));

    const insertResult = await upsertReq.query(`
      INSERT INTO dbo.ReceiveGoods
        (PurchaseOrderId, ProjectId, VendorId, LocationId, ReceivedDate, ReceivedBy, InvoiceNumber, InvoiceDate, InvoiceDocumentName, InvoiceDocumentType, InvoiceDocumentSize, InvoiceDocumentData, BillFrom, BillTo, ShipTo, ShowProjectDetails, Notes, TaxMode, Status, BOQId)
      OUTPUT INSERTED.*
      VALUES
        (@PurchaseOrderId, @ProjectId, @VendorId, @LocationId, @ReceivedDate, @ReceivedBy, @InvoiceNumber, @InvoiceDate, @InvoiceDocumentName, @InvoiceDocumentType, @InvoiceDocumentSize, @InvoiceDocumentData, @BillFrom, @BillTo, @ShipTo, @ShowProjectDetails, @Notes, @TaxMode, @Status, @BOQId)
    `);
    const receiptRow = insertResult.recordset?.[0] ?? null;

    const receiptId = receiptRow?.[receivePk] ?? receiptRow?.Id;
    const { finalStatus } = await recalculateReceiveGoodsChain(tx, {
      purchaseOrderId: poId,
      receivePk,
      fkCol,
      overrideItemsByReceiptId: {
        [String(receiptId)]: normalizedItems,
      },
    });
    const afterItemTotals = await loadReceiveItemTotalsByItemId(tx, poId);
    await applyReceiveStockDelta(tx, beforeItemTotals, afterItemTotals);

    await new sql.Request(tx)
      .input("Id", sql.Int, poId)
      .input("Status", sql.NVarChar(50), finalStatus || status || "Draft")
      .query(`
        UPDATE dbo.PurchaseOrders
        SET Status = @Status,
            UpdatedAt = SYSUTCDATETIME()
        WHERE Id = @Id
      `);

    await writeReceiveAuditLog(tx, {
      receiptId,
      purchaseOrderId: poId,
      action: "CREATE",
      performedBy: auditBy,
      details: "Receipt created",
      snapshot: {
        receipt: {
          ...normalizeReceiveGoods(receiptRow),
          taxMode: normalizedTaxMode,
        },
        items: normalizedItems.ordered,
      },
    });

    await tx.commit();
    tx = null;

    const itemsResult = await pool
      .request()
      .input("ReceiptId", sql.Int, receiptId)
      .query(withSqlLockTimeout(`
        SELECT * FROM dbo.ReceiveGoodsItems WHERE ${fkCol} = @ReceiptId
      `));

    const refreshedReceiptResult = await pool
      .request()
      .input("ReceiptId", sql.Int, receiptId)
      .query(withSqlLockTimeout(`
        SELECT * FROM dbo.ReceiveGoods WHERE ${receivePk} = @ReceiptId
      `));

    const responseItems = await hydrateReceiveGoodsItemsWithInventoryMetrics(
      pool,
      itemsResult.recordset ?? []
    );

    return res.status(201).json({
      ok: true,
      receipt: {
        ...normalizeReceiveGoods(refreshedReceiptResult.recordset?.[0] ?? receiptRow),
        items: responseItems,
      },
    });
  } catch (error) {
    await rollbackTx(tx);
    tx = null;
    console.error("POST /api/receive-goods failed:", error?.message ?? error);
    const isDuplicateSerialError =
      isSqlUniqueConstraintError(error) &&
      /UX_SerialNumbers_SerialNumber/i.test(String(error?.message || ""));
    const statusCode = isSqlLockTimeoutError(error)
      ? 503
      : isDuplicateSerialError
      ? 400
      : Number.isInteger(error?.statusCode)
      ? error.statusCode
      : 500;
    return res.status(statusCode).json({
      ok: false,
      error: isSqlLockTimeoutError(error)
        ? RECEIVE_GOODS_LOCK_MESSAGE
        : isDuplicateSerialError
        ? "Serial number already exists. Remove the duplicate serial number and try again."
        : error?.message ?? "Failed to save receipt",
    });
  } finally {
    await rollbackTx(tx);
  }
});

app.put("/api/receive-goods/:id", async (req, res) => {
  const id = Number.parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) {
    return res.status(400).json({ ok: false, error: "Invalid receive goods id" });
  }

  const {
    receivedDate = null,
    receivedBy = null,
    invoiceNumber = null,
    invoiceDate = null,
    invoiceDocumentName = null,
    invoiceDocumentType = null,
    invoiceDocumentSize = null,
    invoiceDocumentData = null,
    billFrom = null,
    billTo = null,
    shipTo = null,
    showProjectDetails = true,
    notes = null,
    items = [],
    projectId = null,
    vendorId = null,
    locationId = null,
    boqId = null,
    taxMode = "intra",
    auditBy = null,
  } = req.body ?? {};

  const allowLockedEdit =
    req.body?.allowLockedEdit === true || req.body?.allowClosedEdit === true;
  const negativeItem = findNegativeQuantityInput(items, [
    "receivedQty",
    "ReceivedQty",
    "received",
  ]);
  if (negativeItem) {
    return res.status(400).json({
      ok: false,
      error: `Received quantity for ${
        negativeItem.name ?? negativeItem.Name ?? "item"
      } cannot be negative.`,
    });
  }
  const normalizedItems = normalizeReceiveGoodsItemsInput(items);
  const hasItems = normalizedItems.ordered.some((item) => item.receivedQty > 0);
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
  const parsedInvoiceDate = parseDateInput(invoiceDate);
  if (Number.isNaN(parsedInvoiceDate)) {
    return res.status(400).json({
      ok: false,
      error: "Invalid invoiceDate",
    });
  }
  const normalizedTaxMode =
    String(taxMode).trim().toLowerCase() === "inter" ? "inter" : "intra";
  const normalizedBillFrom = normalizeOptionalString(billFrom ?? billTo) ?? null;

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

    const receiptRow = await findReceiveGoodsRow(tx, id);
    if (!receiptRow) {
      await rollbackTx(tx);
      tx = null;
      return res.status(404).json({
        ok: false,
        error: "Receipt not found",
      });
    }
    const receiptId =
      receiptRow?.[receivePk] ?? receiptRow?.ReceiveGoodsId ?? receiptRow?.Id ?? id;

    const poId = toNullableInt(receiptRow.PurchaseOrderId);
    const poResult = await new sql.Request(tx)
      .input("Id", sql.Int, poId)
      .query(`
        SELECT TOP 1 * FROM dbo.PurchaseOrders WHERE Id = @Id
      `);
    const poRow = poResult.recordset?.[0] ?? null;
    if (!poRow) {
      await rollbackTx(tx);
      tx = null;
      return res.status(404).json({
        ok: false,
        error: "Purchase order not found",
      });
    }

    if (isLockedPurchaseOrderStatus(poRow.Status) && !allowLockedEdit) {
      await rollbackTx(tx);
      tx = null;
      return res.status(409).json({
        ok: false,
        error: getLockedPurchaseOrderError(poRow.Status),
      });
    }

    const existingItemsResult = await new sql.Request(tx)
      .input("ReceiptId", sql.Int, receiptId)
      .query(withSqlLockTimeout(`
        SELECT *
        FROM dbo.ReceiveGoodsItems
        WHERE ${fkCol} = @ReceiptId
      `));

    await validateReceiveQuantitiesAgainstAvailability(tx, {
      purchaseOrderId: poId,
      receivePk,
      targetReceiptId: receiptId,
      normalizedItems,
    });
    await validateReceiveSerialNumbers(tx, {
      targetReceiptId: receiptId,
      normalizedItems,
    });
    const beforeItemTotals = await loadReceiveItemTotalsByItemId(tx, poId);

    const updateReq = new sql.Request(tx);
    updateReq.input("ReceiptId", sql.Int, receiptId);
    updateReq.input("ProjectId", sql.Int, toNullableInt(projectId) ?? toNullableInt(poRow.ProjectId));
    updateReq.input("VendorId", sql.Int, toNullableInt(vendorId) ?? toNullableInt(poRow.VendorId));
    updateReq.input("LocationId", sql.Int, toNullableInt(locationId) ?? toNullableInt(poRow.LocationId));
    updateReq.input("ReceivedDate", sql.Date, parsedDate ?? null);
    updateReq.input("ReceivedBy", sql.NVarChar(100), normalizeOptionalString(receivedBy) ?? null);
    updateReq.input(
      "InvoiceNumber",
      sql.NVarChar(100),
      normalizeOptionalString(invoiceNumber) ?? null
    );
    updateReq.input("InvoiceDate", sql.Date, parsedInvoiceDate ?? null);
    updateReq.input(
      "InvoiceDocumentName",
      sql.NVarChar(255),
      normalizeOptionalString(invoiceDocumentName) ?? null
    );
    updateReq.input(
      "InvoiceDocumentType",
      sql.NVarChar(120),
      normalizeOptionalString(invoiceDocumentType) ?? null
    );
    updateReq.input(
      "InvoiceDocumentSize",
      sql.Int,
      Number.isFinite(Number(invoiceDocumentSize))
        ? Number(invoiceDocumentSize)
        : null
    );
    updateReq.input(
      "InvoiceDocumentData",
      sql.NVarChar(sql.MAX),
      normalizeOptionalString(invoiceDocumentData) ?? null
    );
    updateReq.input("BillFrom", sql.NVarChar(sql.MAX), normalizedBillFrom);
    updateReq.input("BillTo", sql.NVarChar(sql.MAX), normalizedBillFrom);
    updateReq.input("ShipTo", sql.NVarChar(sql.MAX), normalizeOptionalString(shipTo) ?? null);
    updateReq.input(
      "ShowProjectDetails",
      sql.Bit,
      showProjectDetails === undefined || showProjectDetails === null
        ? true
        : !["0", "false", "no"].includes(String(showProjectDetails).toLowerCase())
    );
    updateReq.input("Notes", sql.NVarChar(sql.MAX), normalizeOptionalString(notes) ?? null);
    updateReq.input("TaxMode", sql.NVarChar(20), normalizedTaxMode);
    updateReq.input("BOQId", sql.Int, toNullableInt(boqId));

    await updateReq.query(`
      UPDATE dbo.ReceiveGoods
      SET ProjectId = @ProjectId,
          VendorId = @VendorId,
          LocationId = @LocationId,
          ReceivedDate = @ReceivedDate,
          ReceivedBy = @ReceivedBy,
          InvoiceNumber = @InvoiceNumber,
          InvoiceDate = @InvoiceDate,
          InvoiceDocumentName = @InvoiceDocumentName,
          InvoiceDocumentType = @InvoiceDocumentType,
          InvoiceDocumentSize = @InvoiceDocumentSize,
          InvoiceDocumentData = @InvoiceDocumentData,
          BillFrom = @BillFrom,
          BillTo = @BillTo,
          ShipTo = @ShipTo,
          ShowProjectDetails = @ShowProjectDetails,
          Notes = @Notes,
          TaxMode = @TaxMode,
          BOQId = @BOQId,
          UpdatedAt = SYSUTCDATETIME()
      WHERE ${receivePk} = @ReceiptId
    `);

    const { finalStatus } = await recalculateReceiveGoodsChain(tx, {
      purchaseOrderId: poId,
      receivePk,
      fkCol,
      overrideItemsByReceiptId: {
        [String(receiptId)]: normalizedItems,
      },
    });
    const afterItemTotals = await loadReceiveItemTotalsByItemId(tx, poId);
    await applyReceiveStockDelta(tx, beforeItemTotals, afterItemTotals);

    await new sql.Request(tx)
      .input("Id", sql.Int, poId)
      .input("Status", sql.NVarChar(50), finalStatus || poRow.Status || "Draft")
      .query(`
        UPDATE dbo.PurchaseOrders
        SET Status = @Status,
            UpdatedAt = SYSUTCDATETIME()
        WHERE Id = @Id
      `);

    await writeReceiveAuditLog(tx, {
      receiptId,
      purchaseOrderId: poId,
      action: "UPDATE",
      performedBy: auditBy,
      details: "Receipt updated",
      snapshot: {
        before: {
          receipt: normalizeReceiveGoods(receiptRow),
          items: (existingItemsResult.recordset ?? []).map(normalizeReceiveGoodsItem),
        },
        after: {
          receipt: {
            ...normalizeReceiveGoods(receiptRow),
            taxMode: normalizedTaxMode,
          },
          items: normalizedItems.ordered,
        },
      },
    });

    await tx.commit();
    tx = null;

    const updatedReceiptResult = await pool
      .request()
      .input("ReceiptId", sql.Int, receiptId)
      .query(withSqlLockTimeout(`
        SELECT TOP 1 * FROM dbo.ReceiveGoods WHERE ${receivePk} = @ReceiptId
      `));
    const itemsResult = await pool
      .request()
      .input("ReceiptId", sql.Int, receiptId)
      .query(withSqlLockTimeout(`
        SELECT * FROM dbo.ReceiveGoodsItems WHERE ${fkCol} = @ReceiptId
      `));

    const responseItems = await hydrateReceiveGoodsItemsWithInventoryMetrics(
      pool,
      itemsResult.recordset ?? []
    );

    return res.json({
      ok: true,
      receipt: {
        ...normalizeReceiveGoods(updatedReceiptResult.recordset?.[0] ?? {}),
        items: responseItems,
      },
    });
  } catch (error) {
    await rollbackTx(tx);
    tx = null;
    console.error("PUT /api/receive-goods/:id failed:", error?.message ?? error);
    const isDuplicateSerialError =
      isSqlUniqueConstraintError(error) &&
      /UX_SerialNumbers_SerialNumber/i.test(String(error?.message || ""));
    const statusCode = isSqlLockTimeoutError(error)
      ? 503
      : isDuplicateSerialError
      ? 400
      : Number.isInteger(error?.statusCode)
      ? error.statusCode
      : 500;
    return res.status(statusCode).json({
      ok: false,
      error: isSqlLockTimeoutError(error)
        ? RECEIVE_GOODS_LOCK_MESSAGE
        : isDuplicateSerialError
        ? "Serial number already exists. Remove the duplicate serial number and try again."
        : error?.message ?? "Failed to update receipt",
    });
  } finally {
    await rollbackTx(tx);
  }
});

app.delete("/api/receive-goods/:id", async (req, res) => {
  const id = Number.parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) {
    return res.status(400).json({ ok: false, error: "Invalid receive goods id" });
  }

  const allowLockedEdit =
    req.body?.allowLockedEdit === true || req.body?.allowClosedEdit === true;
  const auditBy = req.body?.auditBy ?? null;

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

    const receiptRow = await findReceiveGoodsRow(tx, id);
    if (!receiptRow) {
      await rollbackTx(tx);
      tx = null;
      return res.status(404).json({ ok: false, error: "Receipt not found" });
    }

    const receiptId =
      receiptRow?.[receivePk] ?? receiptRow?.ReceiveGoodsId ?? receiptRow?.Id ?? id;
    const poId = toNullableInt(receiptRow.PurchaseOrderId);

    const poResult = await new sql.Request(tx)
      .input("Id", sql.Int, poId)
      .query(`
        SELECT TOP 1 *
        FROM dbo.PurchaseOrders
        WHERE Id = @Id
      `);
    const poRow = poResult.recordset?.[0] ?? null;
    if (!poRow) {
      await rollbackTx(tx);
      tx = null;
      return res.status(404).json({ ok: false, error: "Purchase order not found" });
    }

    if (isLockedPurchaseOrderStatus(poRow.Status) && !allowLockedEdit) {
      await rollbackTx(tx);
      tx = null;
      return res.status(409).json({
        ok: false,
        error: getLockedPurchaseOrderError(poRow.Status),
      });
    }

    const itemsResult = await new sql.Request(tx)
      .input("ReceiptId", sql.Int, receiptId)
      .query(withSqlLockTimeout(`
        SELECT *
        FROM dbo.ReceiveGoodsItems
        WHERE ${fkCol} = @ReceiptId
      `));
    const receiptItems = (itemsResult.recordset ?? []).map(normalizeReceiveGoodsItem);
    const beforeItemTotals = await loadReceiveItemTotalsByItemId(tx, poId);

    await writeReceiveAuditLog(tx, {
      receiptId,
      purchaseOrderId: poId,
      action: "DELETE",
      performedBy: auditBy,
      details: "Receipt deleted",
      snapshot: {
        receipt: normalizeReceiveGoods(receiptRow),
        items: receiptItems,
      },
    });

    await new sql.Request(tx)
      .input("ReceiptId", sql.Int, receiptId)
      .query(`
        DELETE FROM dbo.SerialNumbers
        WHERE ReceiveGoodsId = @ReceiptId
      `);

    await new sql.Request(tx)
      .input("ReceiptId", sql.Int, receiptId)
      .query(`
        DELETE FROM dbo.ReceiveGoodsItems
        WHERE ${fkCol} = @ReceiptId
      `);

    await new sql.Request(tx)
      .input("ReceiptId", sql.Int, receiptId)
      .query(`
        DELETE FROM dbo.ReceiveGoods
        WHERE ${receivePk} = @ReceiptId
      `);

    const { finalStatus } = await recalculateReceiveGoodsChain(tx, {
      purchaseOrderId: poId,
      receivePk,
      fkCol,
    });
    const afterItemTotals = await loadReceiveItemTotalsByItemId(tx, poId);
    await applyReceiveStockDelta(tx, beforeItemTotals, afterItemTotals);

    await new sql.Request(tx)
      .input("Id", sql.Int, poId)
      .input("Status", sql.NVarChar(50), finalStatus || "Draft")
      .query(`
        UPDATE dbo.PurchaseOrders
        SET Status = @Status,
            UpdatedAt = SYSUTCDATETIME()
        WHERE Id = @Id
      `);

    await tx.commit();
    tx = null;

    return res.json({ ok: true });
  } catch (error) {
    await rollbackTx(tx);
    tx = null;
    console.error("DELETE /api/receive-goods/:id failed:", error?.message ?? error);
    return res.status(isSqlLockTimeoutError(error) ? 503 : 500).json({
      ok: false,
      error: isSqlLockTimeoutError(error)
        ? RECEIVE_GOODS_LOCK_MESSAGE
        : error?.message ?? "Failed to delete receipt",
    });
  } finally {
    await rollbackTx(tx);
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
    const hydratedItems = await hydrateBoqItemsWithInventoryStock(
      (itemsResult.recordset ?? []).map(normalizeBoqItem)
    );
    const itemsByBoq = hydratedItems.reduce((acc, item) => {
      const key = item.boqId;
      if (!acc[key]) acc[key] = [];
      acc[key].push(item);
      return acc;
    }, {});

    const data = (boqsResult.recordset ?? []).map((row) => {
      const items = itemsByBoq[row.BOQId] ?? [];
      const total = items.reduce((sum, item) => sum + Number(item.amount || 0), 0);
      return { ...normalizeBoq(row), items, total };
    });

    const hydratedBoqs = await attachLinkedPurchaseOrdersToBoqs(pool, data);

    return res.json({ ok: true, boqs: hydratedBoqs });
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

    const items = await hydrateBoqItemsWithInventoryStock(
      (itemsResult.recordset ?? []).map(normalizeBoqItem)
    );
    const total = items.reduce((sum, item) => sum + Number(item.amount || 0), 0);

    const [hydratedBoq] = await attachLinkedPurchaseOrdersToBoqs(pool, [
      { ...normalizeBoq(boqRow), items, total },
    ]);

    return res.json({
      ok: true,
      boq: hydratedBoq,
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

  const normalizedItems = normalizeBoqItemsInput(items);
  const hasValidItem = normalizedItems.length > 0;
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
    for (const item of normalizedItems) {
      const qty = Number(item.quantity ?? 0) || 0;
      const rate = Number(item.rate ?? 0) || 0;
      total += qty * rate;

      const insertItem = new sql.Request(tx);
      insertItem.input("BOQId", sql.Int, boqId);
      insertItem.input("ItemId", sql.Int, item.itemId ?? null);
      insertItem.input("ItemName", sql.NVarChar(200), item.name);
      insertItem.input("Description", sql.NVarChar(sql.MAX), item.description);
      insertItem.input("SerialNumber", sql.NVarChar(255), item.serialNumber);
      insertItem.input("Unit", sql.NVarChar(50), item.unit);
      insertItem.input("HSN", sql.NVarChar(50), item.hsn);
      insertItem.input("GST", sql.NVarChar(100), item.gst);
      insertItem.input("Quantity", sql.Decimal(18, 2), qty);
      insertItem.input("Rate", sql.Decimal(18, 2), rate);
      insertItem.input("ConsumedQty", sql.Decimal(18, 2), 0);
      insertItem.input("AvailableQty", sql.Decimal(18, 2), qty);
      insertItem.input("Notes", sql.NVarChar(sql.MAX), item.notes);
      await insertItem.query(`
        INSERT INTO dbo.BOQLineItems
          (BOQId, ItemId, ItemName, Description, SerialNumber, Unit, HSN, GST, Quantity, Rate, ConsumedQty, AvailableQty, Notes)
        VALUES
          (@BOQId, @ItemId, @ItemName, @Description, @SerialNumber, @Unit, @HSN, @GST, @Quantity, @Rate, @ConsumedQty, @AvailableQty, @Notes)
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
        items: await hydrateBoqItemsWithInventoryStock(
          (itemsResult.recordset ?? []).map(normalizeBoqItem)
        ),
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

  const normalizedItems = normalizeBoqItemsInput(items);
  const hasValidItem = normalizedItems.length > 0;
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
  let updateStage = "initializing BOQ update";
  try {
    updateStage = "ensuring BOQ schema";
    await ensureBoqTables();
    const pool = await getPool();

    updateStage = "checking BOQ number";
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

    updateStage = "updating BOQ header";
    logBoqSqlStatement(
      id,
      updateStage,
      `UPDATE dbo.BOQProjects
       SET ProjectId = @ProjectId,
           BOQNumber = @BOQNumber,
           Version = @Version,
           PreparedBy = @PreparedBy,
           Status = @Status,
           BOQDate = @BOQDate,
           Notes = @Notes,
           UpdatedAt = SYSUTCDATETIME()
       WHERE BOQId = @BOQId`
    );
    const updateBoq = new sql.Request(tx);
    updateBoq.input("BOQId", sql.Int, id);
    updateBoq.input("ProjectId", sql.Int, Number(projectId));
    updateBoq.input("BOQNumber", sql.NVarChar(50), normalizedBoqNumber);
    updateBoq.input("Version", sql.Int, Number.parseInt(version, 10) || 1);
    updateBoq.input("PreparedBy", sql.NVarChar(100), preparedBy || null);
    updateBoq.input("Status", sql.NVarChar(50), status || "Draft");
    updateBoq.input("BOQDate", sql.Date, parseDateInput(date) || null);
    updateBoq.input("Notes", sql.NVarChar(sql.MAX), notes || null);

    const updateResult = await updateBoq.query(`
      UPDATE dbo.BOQProjects
      SET ProjectId = @ProjectId,
          BOQNumber = @BOQNumber,
          Version = @Version,
          PreparedBy = @PreparedBy,
          Status = @Status,
          BOQDate = @BOQDate,
          Notes = @Notes,
          UpdatedAt = SYSUTCDATETIME()
      WHERE BOQId = @BOQId
    `);

    if (updateResult.rowsAffected?.[0] === 0) {
      await tx.rollback();
      tx = null;
      return res.status(404).json({ ok: false, error: "BOQ not found" });
    }

    const boqResult = await new sql.Request(tx)
      .input("BOQId", sql.Int, id)
      .query(`SELECT * FROM dbo.BOQProjects WHERE BOQId = @BOQId`);
    const boqRow = boqResult.recordset?.[0];

    updateStage = "loading existing BOQ line items";
    const existingItemsResult = await new sql.Request(tx)
      .input("BOQId", sql.Int, id)
      .query(`
        SELECT *
        FROM dbo.BOQLineItems
        WHERE BOQId = @BOQId
      `);
    const existingItems = existingItemsResult.recordset ?? [];
    const existingItemsById = new Map(
      existingItems
        .map((row) => [toNullableInt(row.LineItemId), row])
        .filter(([lineItemId]) => lineItemId !== null)
    );
    const submittedExistingItemIds = normalizedItems
      .map((item) => item.id)
      .filter((lineItemId) => lineItemId !== null && existingItemsById.has(lineItemId));
    if (new Set(submittedExistingItemIds).size !== submittedExistingItemIds.length) {
      const error = new Error("A BOQ line item was submitted more than once.");
      error.statusCode = 400;
      throw error;
    }
    const retainedItemIds = Array.from(
      new Set(
        normalizedItems
          .map((item) => item.id)
          .filter((lineItemId) => lineItemId !== null && existingItemsById.has(lineItemId))
      )
    );
    const removedItemRows = existingItems.filter(
      (row) => !retainedItemIds.includes(toNullableInt(row.LineItemId))
    );
    const removedItemIds = removedItemRows
      .map((row) => toNullableInt(row.LineItemId))
      .filter((lineItemId) => lineItemId !== null);
    updateStage = "validating BOQ line-item usage";
    const consumedTotals = await loadBoqConsumedTotals(tx, [
      ...retainedItemIds,
      ...removedItemIds,
    ]);
    const orderedTotals = await loadBoqOrderedTotals(tx, [
      ...retainedItemIds,
      ...removedItemIds,
    ]);

    for (const row of removedItemRows) {
      const lineItemId = toNullableInt(row.LineItemId);
      const consumedQty = consumedTotals.get(lineItemId) ?? 0;
      const orderedQty = orderedTotals.get(lineItemId) ?? 0;
      if (orderedQty > 0) {
        const error = new Error(
          `Cannot remove ${row.ItemName || "a BOQ item"} because ${orderedQty} quantity is already linked to purchase orders.`
        );
        error.statusCode = 400;
        throw error;
      }
      if (consumedQty > 0) {
        const error = new Error(
          `Cannot remove ${row.ItemName || "a BOQ item"} because ${consumedQty} quantity has already been consumed.`
        );
        error.statusCode = 400;
        throw error;
      }
    }

    let total = 0;
    const affectedBoqItemIds = [];
    for (const item of normalizedItems) {
      const qty = Number(item.quantity ?? 0) || 0;
      const rate = Number(item.rate ?? 0) || 0;
      total += qty * rate;
      const existingRow =
        item.id !== null && item.id !== undefined
          ? existingItemsById.get(item.id) ?? null
          : null;

      if (existingRow) {
        const consumedQty =
          consumedTotals.get(item.id) ?? (Number(existingRow.ConsumedQty ?? 0) || 0);
        const orderedQty = orderedTotals.get(item.id) ?? 0;
        if (qty < consumedQty) {
          const error = new Error(
            `Quantity for ${item.name || existingRow.ItemName || "a BOQ item"} cannot be lower than the consumed quantity (${consumedQty}).`
          );
          error.statusCode = 400;
          throw error;
        }
        if (qty < orderedQty) {
          const error = new Error(
            `Quantity for ${item.name || existingRow.ItemName || "a BOQ item"} cannot be lower than the linked PO quantity (${orderedQty}).`
          );
          error.statusCode = 400;
          throw error;
        }

        updateStage = `updating BOQ line item ${item.id}`;
        logBoqSqlStatement(
          id,
          updateStage,
          `UPDATE dbo.BOQLineItems
           SET ItemId = @ItemId,
               ItemName = @ItemName,
               Description = @Description,
               SerialNumber = @SerialNumber,
               Unit = @Unit,
               HSN = @HSN,
               GST = @GST,
               Quantity = @Quantity,
               Rate = @Rate,
               ConsumedQty = @ConsumedQty,
               AvailableQty = CASE
                 WHEN @Quantity - @ConsumedQty < 0 THEN 0
                 ELSE @Quantity - @ConsumedQty
               END,
               Notes = @Notes
           WHERE LineItemId = @LineItemId`
        );
        await new sql.Request(tx)
          .input("LineItemId", sql.Int, item.id)
          .input("ItemId", sql.Int, item.itemId ?? null)
          .input("ItemName", sql.NVarChar(200), item.name)
          .input("Description", sql.NVarChar(sql.MAX), item.description)
          .input("SerialNumber", sql.NVarChar(255), item.serialNumber)
          .input("Unit", sql.NVarChar(50), item.unit)
          .input("HSN", sql.NVarChar(50), item.hsn)
          .input("GST", sql.NVarChar(100), item.gst)
          .input("Quantity", sql.Decimal(18, 2), qty)
          .input("Rate", sql.Decimal(18, 2), rate)
          .input("ConsumedQty", sql.Decimal(18, 2), consumedQty)
          .input("Notes", sql.NVarChar(sql.MAX), item.notes)
          .query(`
            UPDATE dbo.BOQLineItems
            SET ItemId = @ItemId,
                ItemName = @ItemName,
                Description = @Description,
                SerialNumber = @SerialNumber,
                Unit = @Unit,
                HSN = @HSN,
                GST = @GST,
                Quantity = @Quantity,
                Rate = @Rate,
                ConsumedQty = @ConsumedQty,
                AvailableQty = CASE
                  WHEN @Quantity - @ConsumedQty < 0 THEN 0
                  ELSE @Quantity - @ConsumedQty
                END,
                Notes = @Notes
            WHERE LineItemId = @LineItemId
          `);
        affectedBoqItemIds.push(item.id);
        continue;
      }

      const insertItem = new sql.Request(tx);
      insertItem.input("BOQId", sql.Int, id);
      insertItem.input("ItemId", sql.Int, item.itemId ?? null);
      insertItem.input("ItemName", sql.NVarChar(200), item.name);
      insertItem.input("Description", sql.NVarChar(sql.MAX), item.description);
      insertItem.input("SerialNumber", sql.NVarChar(255), item.serialNumber);
      insertItem.input("Unit", sql.NVarChar(50), item.unit);
      insertItem.input("HSN", sql.NVarChar(50), item.hsn);
      insertItem.input("GST", sql.NVarChar(100), item.gst);
      insertItem.input("Quantity", sql.Decimal(18, 2), qty);
      insertItem.input("Rate", sql.Decimal(18, 2), rate);
      insertItem.input("ConsumedQty", sql.Decimal(18, 2), 0);
      insertItem.input("AvailableQty", sql.Decimal(18, 2), qty);
      insertItem.input("Notes", sql.NVarChar(sql.MAX), item.notes);
      updateStage = "inserting a new BOQ line item";
      logBoqSqlStatement(
        id,
        updateStage,
        `DECLARE @InsertedBoqLineItems TABLE (LineItemId INT NOT NULL);
         INSERT INTO dbo.BOQLineItems
           (BOQId, ItemId, ItemName, Description, SerialNumber, Unit, HSN, GST, Quantity, Rate, ConsumedQty, AvailableQty, Notes)
         OUTPUT INSERTED.LineItemId INTO @InsertedBoqLineItems (LineItemId)
         VALUES
           (@BOQId, @ItemId, @ItemName, @Description, @SerialNumber, @Unit, @HSN, @GST, @Quantity, @Rate, @ConsumedQty, @AvailableQty, @Notes);
         SELECT LineItemId FROM @InsertedBoqLineItems;`
      );
      const insertResult = await insertItem.query(`
        DECLARE @InsertedBoqLineItems TABLE (LineItemId INT NOT NULL);

        INSERT INTO dbo.BOQLineItems
          (BOQId, ItemId, ItemName, Description, SerialNumber, Unit, HSN, GST, Quantity, Rate, ConsumedQty, AvailableQty, Notes)
        OUTPUT INSERTED.LineItemId INTO @InsertedBoqLineItems (LineItemId)
        VALUES
          (@BOQId, @ItemId, @ItemName, @Description, @SerialNumber, @Unit, @HSN, @GST, @Quantity, @Rate, @ConsumedQty, @AvailableQty, @Notes);

        SELECT LineItemId FROM @InsertedBoqLineItems;
      `);
      const insertedItemId = toNullableInt(insertResult.recordset?.[0]?.LineItemId);
      if (insertedItemId !== null) {
        affectedBoqItemIds.push(insertedItemId);
      }
    }

    if (removedItemIds.length) {
      updateStage = "deleting removed BOQ line items";
      await detachPurchaseOrderItemsFromBoq(tx, removedItemIds);

      const deleteItems = new sql.Request(tx);
      const removedInClause = buildPurchaseOrderItemInClause(
        deleteItems,
        removedItemIds,
        "RemovedLineItemId"
      );
      logBoqSqlStatement(
        id,
        updateStage,
        `DELETE FROM dbo.BOQLineItems
         WHERE LineItemId IN (${removedInClause})`
      );
      await deleteItems.query(`
        DELETE FROM dbo.BOQLineItems
        WHERE LineItemId IN (${removedInClause})
      `);
    }

    updateStage = "recalculating BOQ and purchase-order balances";
    await refreshBoqAvailability(tx, affectedBoqItemIds);
    const syncedPurchaseOrderIds = await syncPurchaseOrderItemsFromBoq(
      tx,
      affectedBoqItemIds
    );
    await refreshPurchaseOrdersDerivedData(tx, syncedPurchaseOrderIds);

    updateStage = "committing BOQ update";
    await tx.commit();
    tx = null;

    updateStage = "loading updated BOQ";
    const itemsResult = await pool
      .request()
      .input("BOQId", sql.Int, id)
      .query(`SELECT * FROM dbo.BOQLineItems WHERE BOQId = @BOQId`);

    return res.json({
      ok: true,
      boq: {
        ...normalizeBoq(boqRow),
        items: await hydrateBoqItemsWithInventoryStock(
          (itemsResult.recordset ?? []).map(normalizeBoqItem)
        ),
        total,
      },
    });
  } catch (error) {
    await rollbackTx(tx);
    tx = null;
    console.error("[PUT /api/boqs/:id] BOQ update failed", {
      boqId: id,
      stage: updateStage,
      ...getSqlErrorDiagnostics(error),
    });
    const statusCode = error?.statusCode ?? 500;
    return res.status(statusCode).json({
      ok: false,
      code: "BOQ_UPDATE_FAILED",
      error:
        statusCode < 500
          ? error?.message ?? "The BOQ update is not valid."
          : error?.message ??
            "The BOQ update could not be saved. No changes were applied.",
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

    const existingItemsResult = await new sql.Request(tx)
      .input("BOQId", sql.Int, id)
      .query(`
        SELECT LineItemId
        FROM dbo.BOQLineItems
        WHERE BOQId = @BOQId
      `);
    const existingItemIds = (existingItemsResult.recordset ?? [])
      .map((row) => toNullableInt(row.LineItemId))
      .filter((lineItemId) => lineItemId !== null);
    const consumedTotals = await loadBoqConsumedTotals(tx, existingItemIds);
    const orderedTotals = await loadBoqOrderedTotals(tx, existingItemIds);
    const linkedItemsResult = await new sql.Request(tx)
      .input("BOQId", sql.Int, id)
      .query(`
        SELECT LineItemId, ItemName, Quantity
        FROM dbo.BOQLineItems
        WHERE BOQId = @BOQId
      `);

    for (const row of linkedItemsResult.recordset ?? []) {
      const lineItemId = toNullableInt(row.LineItemId);
      const orderedQty = orderedTotals.get(lineItemId) ?? 0;
      const consumedQty = consumedTotals.get(lineItemId) ?? 0;

      if (orderedQty > 0) {
        const error = new Error(
          `BOQ item ${row.ItemName || lineItemId} cannot be deleted because ${orderedQty} quantity is already linked to purchase orders.`
        );
        error.statusCode = 409;
        throw error;
      }

      if (consumedQty > 0) {
        const error = new Error(
          `BOQ item ${row.ItemName || lineItemId} cannot be deleted because ${consumedQty} quantity is already consumed.`
        );
        error.statusCode = 409;
        throw error;
      }
    }

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
    return res.status(error?.statusCode ?? 500).json({
      ok: false,
      error: error?.message ?? "Failed to delete BOQ",
    });
  }
});

app.get("/api/delivery-challans", async (_req, res) => {
  try {
    await ensureDeliveryChallanTables();
    await ensureReceiveTables();
    await ensureConsumptionTables();
    const pkCol = await refreshDeliveryChallanPk();
    await refreshDeliveryChallanItemsFk();
    const receiveItemsPk = await refreshReceiveGoodsItemsPk();
    const consumptionHeaderPk = await refreshConsumptionPk();
    await refreshConsumptionItemsFk();
    const pool = await getPool();

    const [challansResult, itemsResult, consumptionsResult, consumptionItemsResult] =
      await Promise.all([
        pool.request().query(`
          SELECT * FROM dbo.DeliveryChallan ORDER BY ${pkCol} DESC
        `),
        pool.request().query(`
          SELECT * FROM dbo.DeliveryChallanItems
        `),
        pool.request().query(`
          SELECT *
          FROM dbo.Consumption
          WHERE DeliveryChallanId IS NOT NULL
            OR (
              DeliveryChallanRef IS NOT NULL
              AND LTRIM(RTRIM(DeliveryChallanRef)) <> ''
            )
          ORDER BY ${toIdentifier(consumptionHeaderPk)} DESC
        `),
        pool.request().query(`
          SELECT * FROM dbo.ConsumptionItems
        `),
      ]);

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

    const linkedReceiveGoodsItemIds = uniqueReceiveGoodsItemIds(
      (itemsResult.recordset ?? []).map((row) =>
        toNullableInt(row.ReceiveGoodsItemId ?? row.receiveGoodsItemId)
      )
    );
    let receiveGoodsIdByItemId = new Map();
    if (linkedReceiveGoodsItemIds.length) {
      const receiveItemsRequest = pool.request();
      const inClause = buildPurchaseOrderItemInClause(
        receiveItemsRequest,
        linkedReceiveGoodsItemIds,
        "ReceiveGoodsItemId"
      );
      const receiveGoodsItemsResult = await receiveItemsRequest.query(`
        SELECT ${toIdentifier(receiveItemsPk)} AS ReceiveGoodsItemId, ReceiveGoodsId
        FROM dbo.ReceiveGoodsItems
        WHERE ${toIdentifier(receiveItemsPk)} IN (${inClause})
      `);
      receiveGoodsIdByItemId = new Map(
        (receiveGoodsItemsResult.recordset ?? []).map((row) => [
          toNullableInt(row.ReceiveGoodsItemId),
          toNullableInt(row.ReceiveGoodsId),
        ])
      );
    }

    const itemsByConsumption = (consumptionItemsResult.recordset ?? []).reduce(
      (acc, row) => {
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
      },
      {}
    );

    const consumptions = (consumptionsResult.recordset ?? []).map((row) => {
      const consumption = normalizeConsumption(row);
      return {
        ...consumption,
        items: itemsByConsumption[consumption.id] ?? [],
      };
    });

    const data = (challansResult.recordset ?? []).map((row) => {
      const challan = normalizeDeliveryChallan(row);
      const challanItems = itemsByChallan[challan.id] ?? [];
      const metrics = buildDeliveryChallanMetrics(challan, challanItems, consumptions);
      const receiveGoodsIds = deriveDeliveryChallanReceiveGoodsIds(
        challan,
        challanItems,
        receiveGoodsIdByItemId
      );
      return {
        ...challan,
        podDocumentData: "",
        receiveGoodsIds,
        receiveGoodsId:
          toNullableInt(challan.receiveGoodsId) ??
          (receiveGoodsIds.length ? receiveGoodsIds[0] : null),
        ...metrics,
        items: challanItems,
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

app.get("/api/delivery-challans/next-number", async (_req, res) => {
  console.log("Matched /api/delivery-challans/next-number");
  try {
    await ensureDeliveryChallanTables();
    const pool = await getPool();
    const nextNumber = await generateNextDeliveryChallanNumber(pool);
    return res.json({
      ok: true,
      dcNumber: nextNumber,
      nextNumber,
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error?.message ?? "Failed to generate delivery challan number",
    });
  }
});

app.get("/api/delivery-challans/:id", async (req, res) => {
  console.log("Matched /api/delivery-challans/:id with params:", req.params);
  const id = Number.parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) {
    return res.status(400).json({ ok: false, error: "Invalid delivery challan id" });
  }

  try {
    await ensureDeliveryChallanTables();
    await ensureReceiveTables();
    await ensureConsumptionTables();
    const pkCol = await refreshDeliveryChallanPk();
    const fkCol = await refreshDeliveryChallanItemsFk();
    const receiveItemsPk = await refreshReceiveGoodsItemsPk();
    const consumptionHeaderPk = await refreshConsumptionPk();
    const consumptionItemFk = await refreshConsumptionItemsFk();
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

    const normalizedChallan = normalizeDeliveryChallan(challanRow);
    const normalizedItems = (itemsResult.recordset ?? []).map(
      normalizeDeliveryChallanItem
    );
    const linkedReceiveGoodsItemIds = uniqueReceiveGoodsItemIds(
      normalizedItems.map((item) =>
        toNullableInt(item.receiveGoodsItemId ?? item.ReceiveGoodsItemId)
      )
    );
    let receiveGoodsIdByItemId = new Map();
    if (linkedReceiveGoodsItemIds.length) {
      const receiveItemsRequest = pool.request();
      const inClause = buildPurchaseOrderItemInClause(
        receiveItemsRequest,
        linkedReceiveGoodsItemIds,
        "ReceiveGoodsItemId"
      );
      const receiveItemsResult = await receiveItemsRequest.query(`
        SELECT ${toIdentifier(receiveItemsPk)} AS ReceiveGoodsItemId, ReceiveGoodsId
        FROM dbo.ReceiveGoodsItems
        WHERE ${toIdentifier(receiveItemsPk)} IN (${inClause})
      `);
      receiveGoodsIdByItemId = new Map(
        (receiveItemsResult.recordset ?? []).map((row) => [
          toNullableInt(row.ReceiveGoodsItemId),
          toNullableInt(row.ReceiveGoodsId),
        ])
      );
    }
    const linkedConsumptionsResult = await pool
      .request()
      .input("DeliveryChallanId", sql.Int, toNullableInt(normalizedChallan.id))
      .input("DeliveryChallanRef", sql.NVarChar(100), normalizedChallan.dcNumber || null)
      .query(`
        SELECT *
        FROM dbo.Consumption c
        WHERE c.DeliveryChallanId = @DeliveryChallanId
          OR EXISTS (
            SELECT 1
            FROM dbo.ConsumptionItems ci
            WHERE ci.${toIdentifier(consumptionItemFk)} = c.${toIdentifier(
              consumptionHeaderPk
            )}
              AND ci.DeliveryChallanId = @DeliveryChallanId
          )
          OR (
            @DeliveryChallanRef IS NOT NULL
            AND LTRIM(RTRIM(@DeliveryChallanRef)) <> ''
            AND LOWER(LTRIM(RTRIM(c.DeliveryChallanRef))) = LOWER(LTRIM(RTRIM(@DeliveryChallanRef)))
          )
        ORDER BY c.${toIdentifier(consumptionHeaderPk)} DESC
      `);
    const linkedConsumptionIds = (linkedConsumptionsResult.recordset ?? [])
      .map((row) => toNullableInt(row[consumptionHeaderPk] ?? row.Id ?? row.ConsumptionId))
      .filter((value) => value !== null);

    let consumptionItemsByConsumption = {};
    if (linkedConsumptionIds.length) {
      const request = pool.request();
      const inClause = buildPurchaseOrderItemInClause(
        request,
        linkedConsumptionIds,
        "LinkedConsumptionId"
      );
      const linkedItemsResult = await request.query(`
        SELECT *
        FROM dbo.ConsumptionItems
        WHERE ${toIdentifier(consumptionItemFk)} IN (${inClause})
      `);
      consumptionItemsByConsumption = (linkedItemsResult.recordset ?? []).reduce(
        (acc, row) => {
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
        },
        {}
      );
    }

    const linkedConsumptions = (linkedConsumptionsResult.recordset ?? []).map((row) => {
      const consumption = normalizeConsumption(row);
      return {
        ...consumption,
        items: consumptionItemsByConsumption[consumption.id] ?? [],
      };
    });
    const metrics = buildDeliveryChallanMetrics(
      normalizedChallan,
      normalizedItems,
      linkedConsumptions
    );
    const receiveGoodsIds = deriveDeliveryChallanReceiveGoodsIds(
      normalizedChallan,
      normalizedItems,
      receiveGoodsIdByItemId
    );

    return res.json({
      ok: true,
      deliveryChallan: {
        ...normalizedChallan,
        receiveGoodsIds,
        receiveGoodsId:
          toNullableInt(normalizedChallan.receiveGoodsId) ??
          (receiveGoodsIds.length ? receiveGoodsIds[0] : null),
        ...metrics,
        items: normalizedItems,
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
    receiveGoodsId = null,
    receiveGoodsIds = [],
    receiveGoodsReferences = [],
    receiveReceiptReferences = [],
    fromLocationId,
    toLocationId = null,
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
  const safeReceiveGoodsId = resolveReceiveGoodsSelectionId(receiveGoodsId);
  const safeReceiveGoodsIds = uniqueReceiveGoodsIdsFromSelections([
    ...(Array.isArray(receiveGoodsIds) ? receiveGoodsIds : []),
    ...(Array.isArray(receiveGoodsReferences) ? receiveGoodsReferences : []),
    ...(Array.isArray(receiveReceiptReferences) ? receiveReceiptReferences : []),
    safeReceiveGoodsId,
  ]);
  const safeFromLocationId = toNullableInt(fromLocationId);
  const safeToLocationId = toNullableInt(toLocationId);
  const safeToLocation = normalizeOptionalString(toLocation);
  const safeVehicleNumber = normalizeOptionalString(vehicleNumber) ?? null;
  const safeEWayBillNumber = normalizeOptionalString(eWayBillNumber) ?? null;
  const safeStatus = normalizeOptionalString(status) ?? "Draft";
  const safeNotes = normalizeOptionalString(notes) ?? null;
  const parsedIssueDate = parseDateInput(issueDate);

  if (!safeProjectId) {
    return res.status(400).json({ ok: false, error: "projectId is required" });
  }
  if (!safeFromLocationId) {
    return res.status(400).json({ ok: false, error: "fromLocationId is required" });
  }
  if (!safeToLocationId && !safeToLocation) {
    return res.status(400).json({
      ok: false,
      error: "toLocationId or toLocation is required",
    });
  }
  if (safeToLocationId !== null && safeFromLocationId === safeToLocationId) {
    return res.status(400).json({
      ok: false,
      error: "Source and destination locations must be different",
    });
  }
  if (Number.isNaN(parsedIssueDate)) {
    return res.status(400).json({ ok: false, error: "Invalid issueDate" });
  }
  const negativeItem = findNegativeQuantityInput(items, ["quantity", "Quantity"]);
  if (negativeItem) {
    return res.status(400).json({
      ok: false,
      error: `DC quantity for ${
        negativeItem.name ?? negativeItem.Item ?? negativeItem.ItemName ?? "item"
      } cannot be negative.`,
    });
  }
  const normalizedItems = (Array.isArray(items) ? items : [])
    .map((item) => {
      const name = String(item.name ?? item.Item ?? "").trim();
      const quantity = Number(item.quantity ?? item.Quantity ?? 0) || 0;
      const rate = Number(item.rate ?? item.Rate ?? 0) || 0;
      const receiveGoodsItemId = toNullableInt(
        item.receiveGoodsItemId ?? item.ReceiveGoodsItemId
      );
      const sourceType =
        normalizeAvailabilitySourceType(item.sourceType ?? item.SourceType) ||
        (receiveGoodsItemId !== null ? "receive" : "");
      const sourceKey =
        normalizeOptionalString(item.sourceKey ?? item.SourceKey) ??
        buildAvailabilitySourceKey({
          ...item,
          receiveGoodsItemId,
          sourceType,
        });
      return {
        deliveryChallanItemId: toNullableInt(
          item.deliveryChallanItemId ??
            item.DeliveryChallanItemId ??
            item.deliveryChallanLineItemId ??
            item.DeliveryChallanLineItemId
        ),
        receiptItemId: toNullableInt(
          item.receiptItemId ??
            item.ReceiptItemId ??
            item.receiveGoodsItemId ??
            item.ReceiveGoodsItemId
        ),
        receiveGoodsItemId,
        purchaseOrderItemId: toNullableInt(
          item.poItemId ??
            item.POItemId ??
            item.purchaseOrderItemId ??
            item.PurchaseOrderItemId
        ),
        itemId: toNullableInt(item.itemId ?? item.ItemId),
        name,
        description: normalizeOptionalString(item.description ?? item.Description) ?? null,
        unit: normalizeOptionalString(item.unit ?? item.Unit) ?? "PCS",
        hsn: normalizeOptionalString(item.hsn ?? item.HSN ?? item.hsnCode ?? item.HSNCode) ?? null,
        gst: normalizeOptionalString(item.gst ?? item.GST ?? item.gstRate ?? item.GSTRate) ?? null,
        quantity,
        rate,
        sourceType,
        sourceRowId:
          normalizeOptionalString(item.sourceRowId ?? item.SourceRowId) ?? sourceKey,
        sourceKey,
        sourceRef: normalizeOptionalString(item.sourceRef ?? item.SourceRef) ?? null,
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
    const resolvedDcNumber =
      safeDcNumber ?? (await generateNextDeliveryChallanNumber(tx));

    const destination = await resolveDeliveryChallanDestination(tx, {
      toLocationId: safeToLocationId,
      toLocation: safeToLocation,
    });
    await validateAvailableInventorySelection(tx, {
      projectId: safeProjectId,
      locationId: safeFromLocationId,
      items: normalizedItems,
    });
    const resolvedReceiveGoodsId =
      await resolvePrimaryReceiveGoodsIdForDeliveryChallan(tx, {
        receiveGoodsId: safeReceiveGoodsId,
        receiveGoodsIds: safeReceiveGoodsIds,
        items: normalizedItems,
      });

    const insertHeaderReq = new sql.Request(tx);
    insertHeaderReq.input("DCNumber", sql.NVarChar(100), resolvedDcNumber);
    insertHeaderReq.input("ProjectId", sql.Int, safeProjectId);
    insertHeaderReq.input("ReceiveGoodsId", sql.Int, resolvedReceiveGoodsId);
    insertHeaderReq.input("FromLocationId", sql.Int, safeFromLocationId);
    insertHeaderReq.input("ToLocationId", sql.Int, destination.toLocationId);
    insertHeaderReq.input("ToLocation", sql.NVarChar(200), destination.toLocation);
    insertHeaderReq.input("VehicleNumber", sql.NVarChar(50), safeVehicleNumber);
    insertHeaderReq.input("EWayBillNumber", sql.NVarChar(100), safeEWayBillNumber);
    insertHeaderReq.input("IssueDate", sql.Date, parsedIssueDate ?? null);
    insertHeaderReq.input("Status", sql.NVarChar(50), safeStatus);
    insertHeaderReq.input("PODStatus", sql.NVarChar(50), POD_STATUS.PENDING);
    insertHeaderReq.input("PODReference", sql.NVarChar(100), null);
    insertHeaderReq.input("PODDate", sql.Date, null);
    insertHeaderReq.input("Notes", sql.NVarChar(sql.MAX), safeNotes);

    const headerResult = await insertHeaderReq.query(`
      INSERT INTO dbo.DeliveryChallan
        (DCNumber, ProjectId, ReceiveGoodsId, FromLocationId, ToLocationId, ToLocation, VehicleNumber, EWayBillNumber, IssueDate, Status, PODStatus, PODReference, PODDate, Notes)
      OUTPUT INSERTED.*
      VALUES
        (@DCNumber, @ProjectId, @ReceiveGoodsId, @FromLocationId, @ToLocationId, @ToLocation, @VehicleNumber, @EWayBillNumber, @IssueDate, @Status, @PODStatus, @PODReference, @PODDate, @Notes)
    `);

    const headerRow = headerResult.recordset?.[0];
    const challanId = headerRow?.[pkCol] ?? headerRow?.Id ?? null;
    if (!challanId) {
      throw new Error("Failed to create delivery challan");
    }

    for (const item of normalizedItems) {
      const insertItemReq = new sql.Request(tx);
      insertItemReq.input("DeliveryChallanId", sql.BigInt, challanId);
      insertItemReq.input("ReceiveGoodsItemId", sql.Int, item.receiveGoodsItemId);
      insertItemReq.input("PurchaseOrderItemId", sql.Int, item.purchaseOrderItemId);
      insertItemReq.input("ItemId", sql.Int, item.itemId);
      insertItemReq.input("ItemName", sql.NVarChar(200), item.name);
      insertItemReq.input("Description", sql.NVarChar(500), item.description);
      insertItemReq.input("Unit", sql.NVarChar(50), item.unit);
      insertItemReq.input("HSN", sql.NVarChar(50), item.hsn);
      insertItemReq.input("GST", sql.NVarChar(100), item.gst);
      insertItemReq.input("Quantity", sql.Decimal(18, 2), item.quantity);
      insertItemReq.input("Rate", sql.Decimal(18, 2), item.rate);
      insertItemReq.input("SourceType", sql.NVarChar(50), item.sourceType || null);
      insertItemReq.input("SourceKey", sql.NVarChar(200), item.sourceKey || null);
      insertItemReq.input("SourceRef", sql.NVarChar(255), item.sourceRef || null);
      insertItemReq.input("Notes", sql.NVarChar(500), item.notes);
      await insertItemReq.query(`
        INSERT INTO dbo.DeliveryChallanItems
          (${fkCol}, ReceiveGoodsItemId, PurchaseOrderItemId, ItemId, ItemName, Description, Unit, HSN, GST, Quantity, Rate, SourceType, SourceKey, SourceRef, Notes)
        VALUES
          (@DeliveryChallanId, @ReceiveGoodsItemId, @PurchaseOrderItemId, @ItemId, @ItemName, @Description, @Unit, @HSN, @GST, @Quantity, @Rate, @SourceType, @SourceKey, @SourceRef, @Notes)
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
        receiveGoodsIds: safeReceiveGoodsIds.length
          ? safeReceiveGoodsIds
          : resolvedReceiveGoodsId
          ? [resolvedReceiveGoodsId]
          : [],
        items: (itemsResult.recordset ?? []).map(normalizeDeliveryChallanItem),
      },
    });
  } catch (error) {
    await rollbackTx(tx);
    const isDuplicateDcNumber =
      isSqlUniqueConstraintError(error) &&
      /UX_DeliveryChallan_DCNumber/i.test(String(error?.message || ""));
    return res.status(isDuplicateDcNumber ? 409 : error?.statusCode ?? 500).json({
      ok: false,
      error: isDuplicateDcNumber
        ? "Delivery challan number already exists. Retry to get the next auto-generated number."
        : error?.message ?? "Failed to create delivery challan",
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
    receiveGoodsId = null,
    receiveGoodsIds = [],
    receiveGoodsReferences = [],
    receiveReceiptReferences = [],
    fromLocationId,
    toLocationId = null,
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
  const safeReceiveGoodsId = resolveReceiveGoodsSelectionId(receiveGoodsId);
  const safeReceiveGoodsIds = uniqueReceiveGoodsIdsFromSelections([
    ...(Array.isArray(receiveGoodsIds) ? receiveGoodsIds : []),
    ...(Array.isArray(receiveGoodsReferences) ? receiveGoodsReferences : []),
    ...(Array.isArray(receiveReceiptReferences) ? receiveReceiptReferences : []),
    safeReceiveGoodsId,
  ]);
  const safeFromLocationId = toNullableInt(fromLocationId);
  const safeToLocationId = toNullableInt(toLocationId);
  const safeToLocation = normalizeOptionalString(toLocation);
  const safeVehicleNumber = normalizeOptionalString(vehicleNumber) ?? null;
  const safeEWayBillNumber = normalizeOptionalString(eWayBillNumber) ?? null;
  const safeStatus = normalizeOptionalString(status) ?? "Draft";
  const safeNotes = normalizeOptionalString(notes) ?? null;
  const parsedIssueDate = parseDateInput(issueDate);

  if (!safeProjectId) {
    return res.status(400).json({ ok: false, error: "projectId is required" });
  }
  if (!safeFromLocationId) {
    return res.status(400).json({ ok: false, error: "fromLocationId is required" });
  }
  if (!safeToLocationId && !safeToLocation) {
    return res.status(400).json({
      ok: false,
      error: "toLocationId or toLocation is required",
    });
  }
  if (safeToLocationId !== null && safeFromLocationId === safeToLocationId) {
    return res.status(400).json({
      ok: false,
      error: "Source and destination locations must be different",
    });
  }
  if (Number.isNaN(parsedIssueDate)) {
    return res.status(400).json({ ok: false, error: "Invalid issueDate" });
  }
  const negativeItem = findNegativeQuantityInput(items, ["quantity", "Quantity"]);
  if (negativeItem) {
    return res.status(400).json({
      ok: false,
      error: `DC quantity for ${
        negativeItem.name ?? negativeItem.Item ?? negativeItem.ItemName ?? "item"
      } cannot be negative.`,
    });
  }
  const normalizedItems = (Array.isArray(items) ? items : [])
    .map((item) => {
      const name = String(item.name ?? item.Item ?? "").trim();
      const quantity = Number(item.quantity ?? item.Quantity ?? 0) || 0;
      const rate = Number(item.rate ?? item.Rate ?? 0) || 0;
      const receiveGoodsItemId = toNullableInt(
        item.receiveGoodsItemId ?? item.ReceiveGoodsItemId
      );
      const sourceType =
        normalizeAvailabilitySourceType(item.sourceType ?? item.SourceType) ||
        (receiveGoodsItemId !== null ? "receive" : "");
      const sourceKey =
        normalizeOptionalString(item.sourceKey ?? item.SourceKey) ??
        buildAvailabilitySourceKey({
          ...item,
          receiveGoodsItemId,
          sourceType,
        });
      return {
        deliveryChallanItemId: toNullableInt(
          item.deliveryChallanItemId ??
            item.DeliveryChallanItemId ??
            item.deliveryChallanLineItemId ??
            item.DeliveryChallanLineItemId
        ),
        receiptItemId: toNullableInt(
          item.receiptItemId ??
            item.ReceiptItemId ??
            item.receiveGoodsItemId ??
            item.ReceiveGoodsItemId
        ),
        receiveGoodsItemId,
        purchaseOrderItemId: toNullableInt(
          item.poItemId ??
            item.POItemId ??
            item.purchaseOrderItemId ??
            item.PurchaseOrderItemId
        ),
        itemId: toNullableInt(item.itemId ?? item.ItemId),
        name,
        description: normalizeOptionalString(item.description ?? item.Description) ?? null,
        unit: normalizeOptionalString(item.unit ?? item.Unit) ?? "PCS",
        hsn: normalizeOptionalString(item.hsn ?? item.HSN ?? item.hsnCode ?? item.HSNCode) ?? null,
        gst: normalizeOptionalString(item.gst ?? item.GST ?? item.gstRate ?? item.GSTRate) ?? null,
        quantity,
        rate,
        sourceType,
        sourceRowId:
          normalizeOptionalString(item.sourceRowId ?? item.SourceRowId) ?? sourceKey,
        sourceKey,
        sourceRef: normalizeOptionalString(item.sourceRef ?? item.SourceRef) ?? null,
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
    const existingHeaderResult = await new sql.Request(tx)
      .input("DeliveryChallanId", sql.BigInt, id)
      .query(`
        SELECT TOP 1 *
        FROM dbo.DeliveryChallan
        WHERE ${pkCol} = @DeliveryChallanId
      `);
    const existingHeader = existingHeaderResult.recordset?.[0] ?? null;
    if (!existingHeader) {
      await tx.rollback();
      return res.status(404).json({ ok: false, error: "Delivery challan not found" });
    }
    const actor = buildPodActor(req.body ?? {});
    const existingPodStatus = normalizePodStatus(existingHeader.PODStatus);
    if (existingPodStatus === POD_STATUS.VERIFIED && !isPodReviewerRole(actor.role)) {
      const error = new Error(
        "Verified POD challans are locked from normal editing."
      );
      error.statusCode = 403;
      throw error;
    }
    const resolvedDcNumber =
      safeDcNumber ??
      normalizeOptionalString(existingHeader.DCNumber ?? existingHeader.dcNumber) ??
      (await generateNextDeliveryChallanNumber(tx));

    const destination = await resolveDeliveryChallanDestination(tx, {
      toLocationId: safeToLocationId,
      toLocation: safeToLocation,
    });
    const existingItemsResult = await new sql.Request(tx)
      .input("DeliveryChallanId", sql.BigInt, id)
      .query(`
        SELECT *
        FROM dbo.DeliveryChallanItems
        WHERE ${toIdentifier(fkCol)} = @DeliveryChallanId
      `);
    const existingItems = (existingItemsResult.recordset ?? []).map(
      normalizeDeliveryChallanItem
    );
    if (
      hasDeliveryChallanStockDefinitionChanged({
        existingChallan: normalizeDeliveryChallan(existingHeader),
        existingItems,
        projectId: safeProjectId,
        fromLocationId: safeFromLocationId,
        toLocationId: destination.toLocationId,
        items: normalizedItems,
      })
    ) {
      await assertDeliveryChallanDestinationIsReversible(tx, {
        challan: normalizeDeliveryChallan(existingHeader),
        items: existingItems,
        action: "update",
      });
    }
    await validateAvailableInventorySelection(tx, {
      projectId: safeProjectId,
      locationId: safeFromLocationId,
      items: normalizedItems,
      excludeDeliveryChallanId: id,
    });
    const resolvedReceiveGoodsId =
      await resolvePrimaryReceiveGoodsIdForDeliveryChallan(tx, {
        receiveGoodsId: safeReceiveGoodsId,
        receiveGoodsIds: safeReceiveGoodsIds,
        items: normalizedItems,
      });

    const updateHeaderReq = new sql.Request(tx);
    updateHeaderReq.input("DeliveryChallanId", sql.BigInt, id);
    updateHeaderReq.input("DCNumber", sql.NVarChar(100), resolvedDcNumber);
    updateHeaderReq.input("ProjectId", sql.Int, safeProjectId);
    updateHeaderReq.input("ReceiveGoodsId", sql.Int, resolvedReceiveGoodsId);
    updateHeaderReq.input("FromLocationId", sql.Int, safeFromLocationId);
    updateHeaderReq.input("ToLocationId", sql.Int, destination.toLocationId);
    updateHeaderReq.input("ToLocation", sql.NVarChar(200), destination.toLocation);
    updateHeaderReq.input("VehicleNumber", sql.NVarChar(50), safeVehicleNumber);
    updateHeaderReq.input("EWayBillNumber", sql.NVarChar(100), safeEWayBillNumber);
    updateHeaderReq.input("IssueDate", sql.Date, parsedIssueDate ?? null);
    updateHeaderReq.input("Status", sql.NVarChar(50), safeStatus);
    updateHeaderReq.input("PODStatus", sql.NVarChar(50), existingPodStatus);
    updateHeaderReq.input(
      "PODReference",
      sql.NVarChar(100),
      normalizeOptionalString(existingHeader.PODReference) ?? null
    );
    updateHeaderReq.input("PODDate", sql.Date, existingHeader.PODDate ?? null);
    updateHeaderReq.input("Notes", sql.NVarChar(sql.MAX), safeNotes);

    const headerResult = await updateHeaderReq.query(`
      UPDATE dbo.DeliveryChallan
      SET DCNumber = @DCNumber,
          ProjectId = @ProjectId,
          ReceiveGoodsId = @ReceiveGoodsId,
          FromLocationId = @FromLocationId,
          ToLocationId = @ToLocationId,
          ToLocation = @ToLocation,
          VehicleNumber = @VehicleNumber,
          EWayBillNumber = @EWayBillNumber,
          IssueDate = @IssueDate,
          Status = @Status,
          PODStatus = @PODStatus,
          PODReference = @PODReference,
          PODDate = @PODDate,
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

    const existingItemIds = new Set(
      existingItems
        .map((item) => toNullableInt(item.deliveryChallanItemId ?? item.id))
        .filter((itemId) => itemId !== null)
    );
    const retainedItemIds = new Set();
    for (const [itemIndex, item] of normalizedItems.entries()) {
      const deliveryChallanItemId = toNullableInt(item.deliveryChallanItemId);
      if (
        deliveryChallanItemId !== null &&
        (!existingItemIds.has(deliveryChallanItemId) ||
          retainedItemIds.has(deliveryChallanItemId))
      ) {
        const error = new Error(
          "One or more delivery challan line identifiers are invalid or duplicated."
        );
        error.statusCode = 400;
        error.details = {
          deliveryChallanId: id,
          itemIndex,
          deliveryChallanItemId,
          existingLineIds: Array.from(existingItemIds),
          retainedLineIds: Array.from(retainedItemIds),
          reason: existingItemIds.has(deliveryChallanItemId)
            ? "duplicate-line-id"
            : "line-id-does-not-belong-to-challan",
        };
        throw error;
      }

      const insertItemReq = new sql.Request(tx);
      insertItemReq.input("DeliveryChallanId", sql.BigInt, id);
      insertItemReq.input(
        "DeliveryChallanItemId",
        sql.BigInt,
        deliveryChallanItemId
      );
      insertItemReq.input("ReceiveGoodsItemId", sql.Int, item.receiveGoodsItemId);
      insertItemReq.input("PurchaseOrderItemId", sql.Int, item.purchaseOrderItemId);
      insertItemReq.input("ItemId", sql.Int, item.itemId);
      insertItemReq.input("ItemName", sql.NVarChar(200), item.name);
      insertItemReq.input("Description", sql.NVarChar(500), item.description);
      insertItemReq.input("Unit", sql.NVarChar(100), item.unit);
      insertItemReq.input("HSN", sql.NVarChar(50), item.hsn);
      insertItemReq.input("GST", sql.NVarChar(100), item.gst);
      insertItemReq.input("Quantity", sql.Decimal(18, 2), item.quantity);
      insertItemReq.input("Rate", sql.Decimal(18, 2), item.rate);
      insertItemReq.input("SourceType", sql.NVarChar(50), item.sourceType || null);
      insertItemReq.input("SourceKey", sql.NVarChar(200), item.sourceKey || null);
      insertItemReq.input("SourceRef", sql.NVarChar(255), item.sourceRef || null);
      insertItemReq.input("Notes", sql.NVarChar(500), item.notes);
      if (deliveryChallanItemId !== null) {
        await insertItemReq.query(`
          UPDATE dbo.DeliveryChallanItems
          SET ReceiveGoodsItemId = @ReceiveGoodsItemId,
              PurchaseOrderItemId = @PurchaseOrderItemId,
              ItemId = @ItemId,
              ItemName = @ItemName,
              Description = @Description,
              Unit = @Unit,
              HSN = @HSN,
              GST = @GST,
              Quantity = @Quantity,
              Rate = @Rate,
              SourceType = @SourceType,
              SourceKey = @SourceKey,
              SourceRef = @SourceRef,
              Notes = @Notes
          WHERE Id = @DeliveryChallanItemId
            AND ${toIdentifier(fkCol)} = @DeliveryChallanId
        `);
        retainedItemIds.add(deliveryChallanItemId);
      } else {
        await insertItemReq.query(`
          INSERT INTO dbo.DeliveryChallanItems
            (${toIdentifier(fkCol)}, ReceiveGoodsItemId, PurchaseOrderItemId, ItemId, ItemName, Description, Unit, HSN, GST, Quantity, Rate, SourceType, SourceKey, SourceRef, Notes)
          VALUES
            (@DeliveryChallanId, @ReceiveGoodsItemId, @PurchaseOrderItemId, @ItemId, @ItemName, @Description, @Unit, @HSN, @GST, @Quantity, @Rate, @SourceType, @SourceKey, @SourceRef, @Notes)
        `);
      }
    }

    for (const existingItemId of existingItemIds) {
      if (retainedItemIds.has(existingItemId)) {
        continue;
      }
      await new sql.Request(tx)
        .input("DeliveryChallanId", sql.BigInt, id)
        .input("DeliveryChallanItemId", sql.BigInt, existingItemId)
        .query(`
          DELETE FROM dbo.DeliveryChallanItems
          WHERE Id = @DeliveryChallanItemId
            AND ${toIdentifier(fkCol)} = @DeliveryChallanId
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
        receiveGoodsIds: safeReceiveGoodsIds.length
          ? safeReceiveGoodsIds
          : resolvedReceiveGoodsId
          ? [resolvedReceiveGoodsId]
          : [],
        items: (itemsResult.recordset ?? []).map(normalizeDeliveryChallanItem),
      },
    });
  } catch (error) {
    await rollbackTx(tx);
    const isDuplicateDcNumber =
      isSqlUniqueConstraintError(error) &&
      /UX_DeliveryChallan_DCNumber/i.test(String(error?.message || ""));
    return res.status(isDuplicateDcNumber ? 409 : error?.statusCode ?? 500).json({
      ok: false,
      error: isDuplicateDcNumber
        ? "Delivery challan number already exists. Retry to get the next auto-generated number."
        : error?.message ?? "Failed to update delivery challan",
      ...(error?.details ? { details: error.details } : {}),
    });
  }
});

app.post("/api/delivery-challans/:id/pod/upload", async (req, res) => {
  const id = Number.parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) {
    return res.status(400).json({ ok: false, error: "Invalid delivery challan id" });
  }

  const {
    podReference = null,
    podDate = null,
    remarks = null,
    fileName = null,
    fileType = null,
    fileSize = 0,
    fileData = null,
  } = req.body ?? {};

  const actor = buildPodActor(req.body ?? {});
  const safeFileName = normalizeOptionalString(fileName);
  const safeFileType = normalizeOptionalString(fileType) ?? "application/octet-stream";
  const safeFileSize = Number(fileSize) || 0;
  const safeFileData = normalizeOptionalString(fileData);
  const safeReference = normalizeOptionalString(podReference) ?? null;
  const safeRemarks = normalizeOptionalString(remarks) ?? null;
  const parsedPodDate = parseDateInput(podDate);

  if (!safeFileName || !safeFileData) {
    return res.status(400).json({ ok: false, error: "POD document is required" });
  }
  if (safeFileSize > 5 * 1024 * 1024) {
    return res.status(400).json({ ok: false, error: "POD document must be 5 MB or smaller" });
  }
  if (Number.isNaN(parsedPodDate)) {
    return res.status(400).json({ ok: false, error: "Invalid podDate" });
  }

  let tx;
  try {
    await ensureDeliveryChallanTables();
    const pkCol = await refreshDeliveryChallanPk();
    const fkCol = await refreshDeliveryChallanItemsFk();
    const pool = await getPool();
    tx = pool.transaction();
    await tx.begin();

    const existingResult = await new sql.Request(tx)
      .input("DeliveryChallanId", sql.BigInt, id)
      .query(`
        SELECT TOP 1 *
        FROM dbo.DeliveryChallan
        WHERE ${pkCol} = @DeliveryChallanId
      `);
    const existing = existingResult.recordset?.[0] ?? null;
    if (!existing) {
      await tx.rollback();
      return res.status(404).json({ ok: false, error: "Delivery challan not found" });
    }

    const fromStatus = normalizePodStatus(existing.PODStatus);
    if (![POD_STATUS.PENDING, POD_STATUS.REJECTED].includes(fromStatus)) {
      const error = new Error("POD can only be uploaded while pending or rejected.");
      error.statusCode = 400;
      throw error;
    }

    const updateResult = await new sql.Request(tx)
      .input("DeliveryChallanId", sql.BigInt, id)
      .input("PODStatus", sql.NVarChar(50), POD_STATUS.UPLOADED)
      .input("PODReference", sql.NVarChar(100), safeReference)
      .input("PODDate", sql.Date, parsedPodDate ?? null)
      .input("PODDocumentName", sql.NVarChar(255), safeFileName)
      .input("PODDocumentType", sql.NVarChar(100), safeFileType)
      .input("PODDocumentSize", sql.BigInt, Math.max(Math.trunc(safeFileSize), 0))
      .input("PODDocumentData", sql.NVarChar(sql.MAX), safeFileData)
      .input("PODUploadedBy", sql.NVarChar(255), actor.name)
      .query(`
        UPDATE dbo.DeliveryChallan
        SET PODStatus = @PODStatus,
            PODReference = @PODReference,
            PODDate = @PODDate,
            PODDocumentName = @PODDocumentName,
            PODDocumentType = @PODDocumentType,
            PODDocumentSize = @PODDocumentSize,
            PODDocumentData = @PODDocumentData,
            PODUploadedAt = SYSUTCDATETIME(),
            PODUploadedBy = @PODUploadedBy,
            PODVerifiedAt = NULL,
            PODVerifiedBy = NULL,
            PODRejectedAt = NULL,
            PODRejectedBy = NULL,
            PODRejectionRemarks = NULL,
            PODDisputedAt = NULL,
            PODDisputedBy = NULL,
            PODDisputeRemarks = NULL,
            PODResolvedAt = NULL,
            PODResolvedBy = NULL,
            PODResolutionRemarks = NULL,
            PODWaivedAt = NULL,
            PODWaivedBy = NULL,
            PODWaiverReason = NULL,
            PODWaiverApprovedBy = NULL,
            UpdatedAt = SYSUTCDATETIME()
        OUTPUT INSERTED.*
        WHERE ${pkCol} = @DeliveryChallanId
      `);

    const headerRow = updateResult.recordset?.[0];
    await writeDeliveryChallanPodAuditLog(tx, {
      deliveryChallanId: id,
      actionName: "POD_UPLOAD",
      fromStatus,
      toStatus: POD_STATUS.UPLOADED,
      performedBy: actor.name,
      performedRole: actor.role,
      remarks: safeRemarks,
      snapshot: {
        fileName: safeFileName,
        fileType: safeFileType,
        fileSize: safeFileSize,
        podReference: safeReference,
      },
    });

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
    return res.status(error?.statusCode ?? 500).json({
      ok: false,
      error: error?.message ?? "Failed to upload POD",
    });
  }
});

app.post("/api/delivery-challans/:id/pod/status", async (req, res) => {
  const id = Number.parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) {
    return res.status(400).json({ ok: false, error: "Invalid delivery challan id" });
  }

  const action = String(req.body?.action ?? "").trim().toLowerCase();
  const remarks = normalizeOptionalString(req.body?.remarks) ?? null;
  const actor = buildPodActor(req.body ?? {});
  const requiresRemarks = ["reject", "dispute", "waive", "resolve"].includes(action);

  if (!["verify", "reject", "dispute", "waive", "resolve"].includes(action)) {
    return res.status(400).json({ ok: false, error: "Invalid POD action" });
  }
  if (requiresRemarks && !remarks) {
    return res.status(400).json({ ok: false, error: "Remarks are required for this POD action" });
  }

  let tx;
  try {
    ensurePodReviewer(actor);
    await ensureDeliveryChallanTables();
    const pkCol = await refreshDeliveryChallanPk();
    const fkCol = await refreshDeliveryChallanItemsFk();
    const pool = await getPool();
    tx = pool.transaction();
    await tx.begin();

    const existingResult = await new sql.Request(tx)
      .input("DeliveryChallanId", sql.BigInt, id)
      .query(`
        SELECT TOP 1 *
        FROM dbo.DeliveryChallan
        WHERE ${pkCol} = @DeliveryChallanId
      `);
    const existing = existingResult.recordset?.[0] ?? null;
    if (!existing) {
      await tx.rollback();
      return res.status(404).json({ ok: false, error: "Delivery challan not found" });
    }

    const fromStatus = normalizePodStatus(existing.PODStatus);
    let toStatus = fromStatus;
    let actionName = "POD_UPDATE";
    let updateSql = "";

    if (["verify", "reject", "dispute"].includes(action)) {
      if (![POD_STATUS.UPLOADED, POD_STATUS.UNDER_VERIFICATION].includes(fromStatus)) {
        const error = new Error("POD must be uploaded before it can be reviewed.");
        error.statusCode = 400;
        throw error;
      }
      if (!hasPodDocument(existing)) {
        const error = new Error("POD document must be uploaded before verification.");
        error.statusCode = 400;
        throw error;
      }
    }

    if (action === "verify") {
      toStatus = POD_STATUS.VERIFIED;
      actionName = "POD_VERIFY";
      updateSql = `
        PODStatus = @ToStatus,
        PODVerifiedAt = SYSUTCDATETIME(),
        PODVerifiedBy = @ActorName,
        PODRejectedAt = NULL,
        PODRejectedBy = NULL,
        PODRejectionRemarks = NULL,
        PODDisputedAt = NULL,
        PODDisputedBy = NULL,
        PODDisputeRemarks = NULL
      `;
    } else if (action === "reject") {
      toStatus = POD_STATUS.REJECTED;
      actionName = "POD_REJECT";
      updateSql = `
        PODStatus = @ToStatus,
        PODRejectedAt = SYSUTCDATETIME(),
        PODRejectedBy = @ActorName,
        PODRejectionRemarks = @Remarks
      `;
    } else if (action === "dispute") {
      toStatus = POD_STATUS.DISPUTED;
      actionName = "POD_DISPUTE";
      updateSql = `
        PODStatus = @ToStatus,
        PODDisputedAt = SYSUTCDATETIME(),
        PODDisputedBy = @ActorName,
        PODDisputeRemarks = @Remarks
      `;
    } else if (action === "waive") {
      if (fromStatus !== POD_STATUS.PENDING) {
        const error = new Error("Only pending POD can be waived.");
        error.statusCode = 400;
        throw error;
      }
      toStatus = POD_STATUS.WAIVED;
      actionName = "POD_WAIVE";
      updateSql = `
        PODStatus = @ToStatus,
        PODWaivedAt = SYSUTCDATETIME(),
        PODWaivedBy = @ActorName,
        PODWaiverApprovedBy = @ActorName,
        PODWaiverReason = @Remarks
      `;
    } else if (action === "resolve") {
      if (fromStatus !== POD_STATUS.DISPUTED) {
        const error = new Error("Only disputed POD can be resolved.");
        error.statusCode = 400;
        throw error;
      }
      toStatus = POD_STATUS.UNDER_VERIFICATION;
      actionName = "POD_RESOLVE";
      updateSql = `
        PODStatus = @ToStatus,
        PODResolvedAt = SYSUTCDATETIME(),
        PODResolvedBy = @ActorName,
        PODResolutionRemarks = @Remarks
      `;
    }

    const updateResult = await new sql.Request(tx)
      .input("DeliveryChallanId", sql.BigInt, id)
      .input("ToStatus", sql.NVarChar(50), toStatus)
      .input("ActorName", sql.NVarChar(255), actor.name)
      .input("Remarks", sql.NVarChar(sql.MAX), remarks)
      .query(`
        UPDATE dbo.DeliveryChallan
        SET ${updateSql},
            UpdatedAt = SYSUTCDATETIME()
        OUTPUT INSERTED.*
        WHERE ${pkCol} = @DeliveryChallanId
      `);
    const headerRow = updateResult.recordset?.[0];

    await writeDeliveryChallanPodAuditLog(tx, {
      deliveryChallanId: id,
      actionName,
      fromStatus,
      toStatus,
      performedBy: actor.name,
      performedRole: actor.role,
      remarks,
      snapshot: {
        action,
        dcNumber: existing.DCNumber,
        priorStatus: fromStatus,
      },
    });

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
    return res.status(error?.statusCode ?? 500).json({
      ok: false,
      error: error?.message ?? "Failed to update POD workflow",
    });
  }
});

app.get("/api/delivery-challans/:id/pod/audit", async (req, res) => {
  const id = Number.parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) {
    return res.status(400).json({ ok: false, error: "Invalid delivery challan id" });
  }

  try {
    await ensureDeliveryChallanTables();
    const pool = await getPool();
    const result = await pool
      .request()
      .input("DeliveryChallanId", sql.BigInt, id)
      .query(`
        SELECT *
        FROM dbo.DeliveryChallanPODAuditLog
        WHERE DeliveryChallanId = @DeliveryChallanId
        ORDER BY AuditId DESC
      `);
    return res.json({
      ok: true,
      auditLog: (result.recordset ?? []).map(normalizeDeliveryChallanPodAuditEntry),
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error?.message ?? "Failed to fetch POD audit log",
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

    const existingHeaderResult = await new sql.Request(tx)
      .input("DeliveryChallanId", sql.BigInt, id)
      .query(`
        SELECT TOP 1 *
        FROM dbo.DeliveryChallan
        WHERE ${toIdentifier(pkCol)} = @DeliveryChallanId
      `);
    const existingHeader = existingHeaderResult.recordset?.[0] ?? null;
    if (!existingHeader) {
      await tx.rollback();
      return res.status(404).json({ ok: false, error: "Delivery challan not found" });
    }
    const existingItemsResult = await new sql.Request(tx)
      .input("DeliveryChallanId", sql.BigInt, id)
      .query(`
        SELECT *
        FROM dbo.DeliveryChallanItems
        WHERE ${toIdentifier(fkCol)} = @DeliveryChallanId
      `);
    await assertDeliveryChallanDestinationIsReversible(tx, {
      challan: normalizeDeliveryChallan(existingHeader),
      items: (existingItemsResult.recordset ?? []).map(normalizeDeliveryChallanItem),
      action: "delete",
    });

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
    return res.status(error?.statusCode ?? 500).json({
      ok: false,
      error: error?.message ?? "Failed to delete delivery challan",
    });
  }
});

app.get("/api/delivery-challans/:id", async (req, res) => {
  console.log("Matched /api/delivery-challans/:id with params:", req.params);
  const id = Number.parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) {
    return res.status(400).json({ ok: false, error: "Invalid delivery challan id" });
  }

  try {
    await ensureDeliveryChallanTables();
    await ensureReceiveTables();
    await ensureConsumptionTables();
    const pkCol = await refreshDeliveryChallanPk();
    const fkCol = await refreshDeliveryChallanItemsFk();
    const receiveItemsPk = await refreshReceiveGoodsItemsPk();
    const consumptionHeaderPk = await refreshConsumptionPk();
    const consumptionItemFk = await refreshConsumptionItemsFk();
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

    const normalizedChallan = normalizeDeliveryChallan(challanRow);
    const normalizedItems = (itemsResult.recordset ?? []).map(normalizeDeliveryChallanItem);

    const linkedReceiveGoodsItemIds = uniqueReceiveGoodsItemIds(
      normalizedItems.map((item) => toNullableInt(item.receiveGoodsItemId))
    );
    let receiveGoodsIdByItemId = new Map();
    if (linkedReceiveGoodsItemIds.length) {
      const receiveItemsRequest = pool.request();
      const inClause = buildPurchaseOrderItemInClause(
        receiveItemsRequest,
        linkedReceiveGoodsItemIds,
        "ReceiveGoodsItemId"
      );
      const receiveGoodsItemsResult = await receiveItemsRequest.query(`
        SELECT ${toIdentifier(receiveItemsPk)} AS ReceiveGoodsItemId, ReceiveGoodsId
        FROM dbo.ReceiveGoodsItems
        WHERE ${toIdentifier(receiveItemsPk)} IN (${inClause})
      `);
      receiveGoodsIdByItemId = new Map(
        (receiveGoodsItemsResult.recordset ?? []).map((row) => [
          toNullableInt(row.ReceiveGoodsItemId),
          toNullableInt(row.ReceiveGoodsId),
        ])
      );
    }

    const receiveGoodsIds = deriveDeliveryChallanReceiveGoodsIds(
      normalizedChallan,
      normalizedItems,
      receiveGoodsIdByItemId
    );

    const consumptionsResult = await pool.request().query(`
      SELECT *
      FROM dbo.Consumption
      WHERE DeliveryChallanId = ${id}
        OR (
          DeliveryChallanRef IS NOT NULL
          AND LTRIM(RTRIM(DeliveryChallanRef)) = '${normalizedChallan.dcNumber?.replace(/'/g, "''") ?? ""}'
        )
      ORDER BY ${toIdentifier(consumptionHeaderPk)} DESC
    `);

    const consumptionItemsResult = await pool.request().query(`
      SELECT * FROM dbo.ConsumptionItems
    `);

    const itemsByConsumption = (consumptionItemsResult.recordset ?? []).reduce(
      (acc, row) => {
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
      },
      {}
    );

    const consumptions = (consumptionsResult.recordset ?? []).map((row) => {
      const consumption = normalizeConsumption(row);
      return {
        ...consumption,
        items: itemsByConsumption[consumption.id] ?? [],
      };
    });

    const metrics = buildDeliveryChallanMetrics(normalizedChallan, normalizedItems, consumptions);

    return res.json({
      ok: true,
      deliveryChallan: {
        ...normalizedChallan,
        receiveGoodsIds,
        receiveGoodsId:
          toNullableInt(normalizedChallan.receiveGoodsId) ??
          (receiveGoodsIds.length ? receiveGoodsIds[0] : null),
        ...metrics,
        items: normalizedItems,
      },
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error?.message ?? "Failed to fetch delivery challan",
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

    const dataWithBalances = await attachPersistedConsumptionBalances(pool, data);

    return res.json({ ok: true, consumptions: dataWithBalances });
  } catch (error) {
    console.error("[GET /api/consumptions] Failed to fetch consumptions", error);
    return res.status(500).json({
      ok: false,
      code: "CONSUMPTIONS_FETCH_FAILED",
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

    const [consumptionWithBalances] = await attachPersistedConsumptionBalances(pool, [
      {
        ...normalizeConsumption(consumptionRow),
        items: (itemsResult.recordset ?? []).map(normalizeConsumptionItem),
      },
    ]);

    return res.json({
      ok: true,
      consumption: consumptionWithBalances,
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error?.message ?? "Failed to fetch consumption",
    });
  }
});

const loadDeliveryChallanSourceForConsumption = async (
  tx,
  {
    deliveryChallanId = null,
    deliveryChallanRef = null,
  } = {}
) => {
  const safeDeliveryChallanId = toNullableInt(deliveryChallanId);
  const safeDeliveryChallanRef = normalizeOptionalString(deliveryChallanRef);
  if (safeDeliveryChallanId === null && !safeDeliveryChallanRef) {
    const error = new Error("deliveryChallanId is required");
    error.statusCode = 400;
    throw error;
  }

  await ensureDeliveryChallanTables();
  const deliveryPk = await refreshDeliveryChallanPk();
  const deliveryFk = await refreshDeliveryChallanItemsFk();

  const challanRequest = new sql.Request(tx);
  challanRequest.input("DeliveryChallanId", sql.BigInt, safeDeliveryChallanId);
  challanRequest.input(
    "DeliveryChallanRef",
    sql.NVarChar(100),
    safeDeliveryChallanRef ?? null
  );
  const challanResult = await challanRequest.query(`
    SELECT TOP 1 *
    FROM dbo.DeliveryChallan
    WHERE ${toIdentifier(deliveryPk)} = @DeliveryChallanId
      OR (
        @DeliveryChallanRef IS NOT NULL
        AND LTRIM(RTRIM(@DeliveryChallanRef)) <> ''
        AND LOWER(LTRIM(RTRIM(DCNumber))) = LOWER(LTRIM(RTRIM(@DeliveryChallanRef)))
      )
    ORDER BY CASE
      WHEN ${toIdentifier(deliveryPk)} = @DeliveryChallanId THEN 0
      ELSE 1
    END,
    ${toIdentifier(deliveryPk)} DESC
  `);
  const challanRow = challanResult.recordset?.[0] ?? null;
  if (!challanRow) {
    const error = new Error("Selected delivery challan was not found.");
    error.statusCode = 400;
    throw error;
  }

  const challan = normalizeDeliveryChallan(challanRow);
  const itemsResult = await new sql.Request(tx)
    .input("DeliveryChallanId", sql.BigInt, toNullableInt(challan.id))
    .query(`
      SELECT *
      FROM dbo.DeliveryChallanItems
      WHERE ${toIdentifier(deliveryFk)} = @DeliveryChallanId
    `);
  const challanItems = (itemsResult.recordset ?? []).map(normalizeDeliveryChallanItem);
  if (!challanItems.length) {
    const error = new Error("The selected delivery challan has no line items.");
    error.statusCode = 400;
    throw error;
  }

  return { challan, challanItems };
};

const mapConsumptionItemsFromDeliveryChallan = (
  requestedItems = [],
  challanItems = []
) => {
  const bySourceKey = new Map();
  const byDeliveryChallanItemId = new Map();
  const byReceiveGoodsItemId = new Map();
  const byMaterialKey = new Map();

  (Array.isArray(challanItems) ? challanItems : []).forEach((item) => {
    const sourceKey = normalizeOptionalString(item.sourceKey ?? item.SourceKey);
    if (sourceKey) {
      bySourceKey.set(sourceKey, item);
    }
    const deliveryChallanItemId = toNullableInt(
      item.deliveryChallanItemId ??
        item.DeliveryChallanItemId ??
        item.deliveryChallanLineItemId ??
        item.DeliveryChallanLineItemId ??
        item.id ??
        item.Id
    );
    if (deliveryChallanItemId !== null) {
      byDeliveryChallanItemId.set(deliveryChallanItemId, item);
    }
    const receiveGoodsItemId = toNullableInt(
      item.receiveGoodsItemId ?? item.ReceiveGoodsItemId
    );
    if (receiveGoodsItemId !== null) {
      byReceiveGoodsItemId.set(receiveGoodsItemId, item);
    }
    const materialKey = buildInventoryMaterialKey(item);
    if (!materialKey) {
      return;
    }
    if (!byMaterialKey.has(materialKey)) {
      byMaterialKey.set(materialKey, []);
    }
    byMaterialKey.get(materialKey).push(item);
  });

  const materialKeyCursor = new Map();

  return (Array.isArray(requestedItems) ? requestedItems : []).map((item) => {
    const sourceKey = normalizeOptionalString(item.sourceKey ?? item.SourceKey);
    const deliveryChallanItemId = toNullableInt(
      item.deliveryChallanItemId ??
        item.DeliveryChallanItemId ??
        item.deliveryChallanLineItemId ??
        item.DeliveryChallanLineItemId
    );
    const receiveGoodsItemId = toNullableInt(
      item.receiveGoodsItemId ?? item.ReceiveGoodsItemId
    );
    let matchedSourceItem =
      sourceKey && bySourceKey.has(sourceKey)
        ? bySourceKey.get(sourceKey) ?? null
        : deliveryChallanItemId !== null
        ? byDeliveryChallanItemId.get(deliveryChallanItemId) ?? null
        : receiveGoodsItemId !== null
        ? byReceiveGoodsItemId.get(receiveGoodsItemId) ?? null
        : null;

    if (!matchedSourceItem) {
      const materialKey = buildInventoryMaterialKey(item);
      if (materialKey) {
        const options = byMaterialKey.get(materialKey) ?? [];
        const cursor = materialKeyCursor.get(materialKey) ?? 0;
        matchedSourceItem = options[cursor] ?? options[0] ?? null;
        materialKeyCursor.set(materialKey, cursor + 1);
      }
    }

    if (!matchedSourceItem) {
      const error = new Error(
        `${item.name || "This material"} is not present in the selected delivery challan.`
      );
      error.statusCode = 400;
      throw error;
    }

    return {
      ...item,
      itemId:
        toNullableInt(
          item.itemId ??
            item.ItemId ??
            matchedSourceItem.itemId ??
            matchedSourceItem.ItemId ??
            null
        ) ?? null,
      boqItemId:
        toNullableInt(
          item.boqItemId ??
            matchedSourceItem.itemId ??
            matchedSourceItem.ItemId ??
            null
        ) ?? null,
      receiveGoodsItemId:
        toNullableInt(
          item.receiveGoodsItemId ??
            matchedSourceItem.receiveGoodsItemId ??
            matchedSourceItem.ReceiveGoodsItemId ??
            null
        ) ?? null,
      name: normalizeOptionalString(item.name) ?? matchedSourceItem.name ?? "Item",
      description:
        normalizeOptionalString(item.description ?? item.Description) ??
        matchedSourceItem.description ??
        null,
      unit:
        normalizeOptionalString(item.unit ?? item.Unit) ??
        matchedSourceItem.unit ??
        "PCS",
      hsn:
        normalizeOptionalString(item.hsn ?? item.HSN ?? item.hsnCode ?? item.HSNCode) ??
        matchedSourceItem.hsn ??
        null,
      gst:
        normalizeOptionalString(item.gst ?? item.GST ?? item.gstRate ?? item.GSTRate) ??
        matchedSourceItem.gst ??
        null,
      notes:
        normalizeOptionalString(item.notes ?? item.Notes) ??
        matchedSourceItem.notes ??
        null,
    };
  });
};

const LEGACY_CONSUMPTION_HELPERS = [
  validateConsumptionAgainstDeliveryChallan,
  loadDeliveryChallanSourceForConsumption,
  mapConsumptionItemsFromDeliveryChallan,
];

app.post("/api/consumptions", async (req, res) => {
  const timing = createTimingLogger("POST /api/consumptions");
  const {
    consumptionNumber,
    projectId,
    fromLocationId = null,
    locationId,
    receiveGoodsId = null,
    deliveryChallanId = null,
    deliveryChallanIds = [],
    deliveryChallanRef = null,
    consumptionDate = null,
    issuedBy = null,
    status = "Logged",
    notes = null,
    companyAddress = null,
    companyGstin = null,
    companyPhone = null,
    companyEmail = null,
    items = [],
  } = req.body ?? {};

  const safeConsumptionNumber = normalizeOptionalString(consumptionNumber);
  const safeProjectId = toNullableInt(projectId);
  const safeFromLocationId = toNullableInt(fromLocationId) ?? toNullableInt(locationId);
  const safeLocationId = toNullableInt(locationId);
  const safeReceiveGoodsId = toNullableInt(receiveGoodsId);
  const safeDeliveryChallanId = toNullableInt(deliveryChallanId);
  const safeDeliveryChallanIds = Array.from(
    new Set(
      [
        ...(Array.isArray(deliveryChallanIds) ? deliveryChallanIds : []),
        safeDeliveryChallanId,
      ]
        .map((value) => toNullableInt(value))
        .filter((value) => value !== null)
    )
  );
  const safeDeliveryChallanRef = normalizeOptionalString(deliveryChallanRef) ?? null;
  const safeIssuedBy = normalizeOptionalString(issuedBy) ?? null;
  const safeStatus = normalizeOptionalString(status) ?? "Logged";
  const safeNotes = normalizeOptionalString(notes) ?? null;
  const safeCompanyAddress = normalizeOptionalString(companyAddress) ?? null;
  const safeCompanyGstin = normalizeOptionalString(companyGstin) ?? null;
  const safeCompanyPhone = normalizeOptionalString(companyPhone) ?? null;
  const safeCompanyEmail = normalizeOptionalString(companyEmail) ?? null;
  const parsedConsumptionDate = parseDateInput(consumptionDate);
  timing("input-normalized", {
    itemCount: Array.isArray(items) ? items.length : 0,
    projectId: safeProjectId,
    fromLocationId: safeFromLocationId,
    locationId: safeLocationId,
  });

  if (!safeConsumptionNumber) {
    return res.status(400).json({
      ok: false,
      error: "consumptionNumber is required",
    });
  }
  if (!safeProjectId) {
    return res.status(400).json({ ok: false, error: "projectId is required" });
  }
  if (!safeFromLocationId) {
    return res.status(400).json({ ok: false, error: "fromLocationId is required" });
  }
  if (!safeLocationId) {
    return res.status(400).json({ ok: false, error: "locationId is required" });
  }
  if (Number.isNaN(parsedConsumptionDate)) {
    return res.status(400).json({ ok: false, error: "Invalid consumptionDate" });
  }

  const negativeItem = findNegativeQuantityInput(items, [
    "consumeQty",
    "ConsumeQty",
    "quantity",
    "Quantity",
  ]);
  if (negativeItem) {
    return res.status(400).json({
      ok: false,
      error: `Consumed quantity for ${
        negativeItem.name ?? negativeItem.Item ?? "item"
      } cannot be negative.`,
    });
  }
  const normalizedItems = (Array.isArray(items) ? items : [])
    .map((item) => {
      const name = String(item.name ?? item.Item ?? "").trim();
      const quantity = Number(item.consumeQty ?? item.ConsumeQty ?? item.quantity ?? item.Quantity ?? 0) || 0;
      const rate = Number(item.rate ?? item.Rate ?? 0) || 0;
      const itemId = toNullableInt(item.itemId ?? item.ItemId);
      const boqItemId = toNullableInt(
        item.boqItemId ?? item.BoqItemId ?? item.BOQItemId ?? item.LineItemId
      );
      const receiveGoodsItemId = toNullableInt(
        item.receiveGoodsItemId ?? item.ReceiveGoodsItemId ?? item.ReceiveItemId
      );
      const deliveryChallanId = toNullableInt(
        item.deliveryChallanId ?? item.DeliveryChallanId
      );
      const deliveryChallanItemId = toNullableInt(
        item.deliveryChallanItemId ??
          item.DeliveryChallanItemId ??
          item.deliveryChallanLineItemId ??
          item.DeliveryChallanLineItemId
      );
      const sourceType =
        normalizeAvailabilitySourceType(item.sourceType ?? item.SourceType) ||
        (deliveryChallanId !== null ? "dc" : "receive");
      return {
        deliveryChallanId,
        deliveryChallanItemId,
        receiveGoodsId: toNullableInt(item.receiveGoodsId ?? item.ReceiveGoodsId),
        itemId,
        boqItemId,
        receiveGoodsItemId,
        sourceType,
        sourceKey:
          normalizeOptionalString(item.sourceKey ?? item.SourceKey) ??
          buildAvailabilitySourceKey({
            ...item,
            deliveryChallanId,
            receiveGoodsItemId,
            sourceType,
          }),
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
  timing("validation-complete", { normalizedItemCount: normalizedItems.length });

  if (!normalizedItems.length) {
    return res.status(400).json({
      ok: false,
      error: "At least one consumed item is required",
    });
  }

  let tx;
  try {
    await ensureConsumptionTables();
    await ensureReceiveTables();
    await ensureReallocateInventoryTables();
    const pkCol = await refreshConsumptionPk();
    const fkCol = await refreshConsumptionItemsFk();
    const pool = await getPool();
    timing("schema-ready");
    tx = pool.transaction();
    await tx.begin();
    timing("transaction-begin");

    const mappedItems = normalizedItems.map((item) => ({
      ...item,
      sourceKey: item.sourceKey || buildAvailabilitySourceKey(item),
    }));

    await validateAvailableInventorySelection(tx, {
      projectId: safeProjectId,
      locationId: safeFromLocationId,
      items: mappedItems,
    });
    timing("available-inventory-validation-complete", {
      itemCount: mappedItems.length,
    });

    const resolvedDeliveryChallanIds = Array.from(
      new Set(
        [
          ...safeDeliveryChallanIds,
          ...mappedItems.map((item) => toNullableInt(item.deliveryChallanId)),
        ].filter((value) => value !== null)
      )
    );
    const resolvedDeliveryChallanId =
      safeDeliveryChallanId ?? resolvedDeliveryChallanIds[0] ?? null;
    const resolvedReceiveGoodsId =
      safeReceiveGoodsId ??
      mappedItems
        .map((item) => toNullableInt(item.receiveGoodsId))
        .find((value) => value !== null) ??
      null;
    const insertHeaderReq = new sql.Request(tx);
    insertHeaderReq.input("ConsumptionNumber", sql.NVarChar(50), safeConsumptionNumber);
    insertHeaderReq.input("ProjectId", sql.Int, safeProjectId);
    insertHeaderReq.input("FromLocationId", sql.Int, safeFromLocationId);
    insertHeaderReq.input("LocationId", sql.Int, safeLocationId);
    insertHeaderReq.input("ReceiveGoodsId", sql.Int, resolvedReceiveGoodsId);
    insertHeaderReq.input(
      "DeliveryChallanId",
      sql.Int,
      resolvedDeliveryChallanId
    );
    insertHeaderReq.input(
      "DeliveryChallanIds",
      sql.NVarChar(sql.MAX),
      JSON.stringify(resolvedDeliveryChallanIds)
    );
    insertHeaderReq.input(
      "DeliveryChallanRef",
      sql.NVarChar(100),
      safeDeliveryChallanRef
    );
    insertHeaderReq.input("ConsumptionDate", sql.Date, parsedConsumptionDate ?? null);
    insertHeaderReq.input("IssuedBy", sql.NVarChar(200), safeIssuedBy);
    insertHeaderReq.input("Status", sql.NVarChar(50), safeStatus);
    insertHeaderReq.input("Notes", sql.NVarChar(sql.MAX), safeNotes);
    insertHeaderReq.input("CompanyAddress", sql.NVarChar(sql.MAX), safeCompanyAddress);
    insertHeaderReq.input("CompanyGstin", sql.NVarChar(50), safeCompanyGstin);
    insertHeaderReq.input("CompanyPhone", sql.NVarChar(50), safeCompanyPhone);
    insertHeaderReq.input("CompanyEmail", sql.NVarChar(100), safeCompanyEmail);

    const headerResult = await insertHeaderReq.query(`
      INSERT INTO dbo.Consumption
        (ConsumptionNumber, ProjectId, FromLocationId, LocationId, ReceiveGoodsId, DeliveryChallanId, DeliveryChallanIds, DeliveryChallanRef, ConsumptionDate, IssuedBy, Status, Notes, CompanyAddress, CompanyGstin, CompanyPhone, CompanyEmail)
      OUTPUT INSERTED.*
      VALUES
        (@ConsumptionNumber, @ProjectId, @FromLocationId, @LocationId, @ReceiveGoodsId, @DeliveryChallanId, @DeliveryChallanIds, @DeliveryChallanRef, @ConsumptionDate, @IssuedBy, @Status, @Notes, @CompanyAddress, @CompanyGstin, @CompanyPhone, @CompanyEmail)
    `);
    timing("header-insert-complete");

    const headerRow = headerResult.recordset?.[0];
    const consumptionId =
      headerRow?.[pkCol] ?? headerRow?.Id ?? headerRow?.ConsumptionId ?? null;
    if (!consumptionId) {
      throw new Error("Failed to create consumption entry");
    }

    for (const item of mappedItems) {
      const insertItemReq = new sql.Request(tx);
      insertItemReq.input("ConsumptionId", sql.Int, consumptionId);
      insertItemReq.input("BoqItemId", sql.Int, item.boqItemId ?? null);
      insertItemReq.input("ItemId", sql.Int, item.itemId ?? null);
      insertItemReq.input("DeliveryChallanId", sql.Int, item.deliveryChallanId ?? null);
      insertItemReq.input(
        "DeliveryChallanItemId",
        sql.BigInt,
        item.deliveryChallanItemId ?? null
      );
      insertItemReq.input(
        "ReceiveGoodsItemId",
        sql.Int,
        item.receiveGoodsItemId ?? null
      );
      insertItemReq.input("SourceType", sql.NVarChar(50), item.sourceType ?? null);
      insertItemReq.input("SourceKey", sql.NVarChar(200), item.sourceKey ?? null);
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
          (${fkCol}, BoqItemId, ItemId, DeliveryChallanId, DeliveryChallanItemId, ReceiveGoodsItemId, SourceType, SourceKey, Item, Description, Unit, HSN, GST, Quantity, Rate, Notes)
        VALUES
          (@ConsumptionId, @BoqItemId, @ItemId, @DeliveryChallanId, @DeliveryChallanItemId, @ReceiveGoodsItemId, @SourceType, @SourceKey, @Item, @Description, @Unit, @HSN, @GST, @Quantity, @Rate, @Notes)
      `);
    }
    timing("line-items-insert-complete", { itemCount: mappedItems.length });

    await applyConsumptionStockDelta(tx, [], mappedItems);
    timing("stock-delta-complete");

    await tx.commit();
    timing("transaction-commit-complete");

    const consumption = {
      ...normalizeConsumption(headerRow),
      items: mappedItems.map((item) =>
        normalizeConsumptionItem({
          ...item,
          ConsumptionId: consumptionId,
          Quantity: item.quantity,
        })
      ),
    };
    timing("response-created", { itemCount: consumption.items.length });

    return res.status(201).json({
      ok: true,
      consumption,
    });
  } catch (error) {
    await rollbackTx(tx);
    console.error("[POST /api/consumptions] Failed to create consumption", error);
    return res.status(error?.statusCode ?? 500).json({
      ok: false,
      code: "CONSUMPTION_CREATE_FAILED",
      error: error?.message ?? "Failed to create consumption",
      ...(error?.details ? { details: error.details } : {}),
    });
  }
});

app.put("/api/consumptions/:id", async (req, res) => {
  const timing = createTimingLogger("PUT /api/consumptions/:id");
  const id = Number.parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) {
    return res.status(400).json({ ok: false, error: "Invalid consumption id" });
  }

  const {
    consumptionNumber,
    projectId,
    fromLocationId = null,
    locationId,
    receiveGoodsId = null,
    deliveryChallanId = null,
    deliveryChallanIds = [],
    deliveryChallanRef = null,
    consumptionDate = null,
    issuedBy = null,
    status = "Logged",
    notes = null,
    companyAddress = null,
    companyGstin = null,
    companyPhone = null,
    companyEmail = null,
    items = [],
  } = req.body ?? {};

  const safeConsumptionNumber = normalizeOptionalString(consumptionNumber);
  const safeProjectId = toNullableInt(projectId);
  const safeFromLocationId = toNullableInt(fromLocationId) ?? toNullableInt(locationId);
  const safeLocationId = toNullableInt(locationId);
  const safeReceiveGoodsId = toNullableInt(receiveGoodsId);
  const safeDeliveryChallanId = toNullableInt(deliveryChallanId);
  const safeDeliveryChallanIds = Array.from(
    new Set(
      [
        ...(Array.isArray(deliveryChallanIds) ? deliveryChallanIds : []),
        safeDeliveryChallanId,
      ]
        .map((value) => toNullableInt(value))
        .filter((value) => value !== null)
    )
  );
  const safeDeliveryChallanRef = normalizeOptionalString(deliveryChallanRef) ?? null;
  const safeIssuedBy = normalizeOptionalString(issuedBy) ?? null;
  const safeStatus = normalizeOptionalString(status) ?? "Logged";
  const safeNotes = normalizeOptionalString(notes) ?? null;
  const safeCompanyAddress = normalizeOptionalString(companyAddress) ?? null;
  const safeCompanyGstin = normalizeOptionalString(companyGstin) ?? null;
  const safeCompanyPhone = normalizeOptionalString(companyPhone) ?? null;
  const safeCompanyEmail = normalizeOptionalString(companyEmail) ?? null;
  const parsedConsumptionDate = parseDateInput(consumptionDate);
  timing("input-normalized", {
    consumptionId: id,
    itemCount: Array.isArray(items) ? items.length : 0,
    projectId: safeProjectId,
    fromLocationId: safeFromLocationId,
    locationId: safeLocationId,
  });

  if (!safeConsumptionNumber) {
    return res.status(400).json({
      ok: false,
      error: "consumptionNumber is required",
    });
  }
  if (!safeProjectId) {
    return res.status(400).json({ ok: false, error: "projectId is required" });
  }
  if (!safeFromLocationId) {
    return res.status(400).json({ ok: false, error: "fromLocationId is required" });
  }
  if (!safeLocationId) {
    return res.status(400).json({ ok: false, error: "locationId is required" });
  }
  if (Number.isNaN(parsedConsumptionDate)) {
    return res.status(400).json({ ok: false, error: "Invalid consumptionDate" });
  }

  const negativeItem = findNegativeQuantityInput(items, [
    "consumeQty",
    "ConsumeQty",
    "quantity",
    "Quantity",
  ]);
  if (negativeItem) {
    return res.status(400).json({
      ok: false,
      error: `Consumed quantity for ${
        negativeItem.name ?? negativeItem.Item ?? "item"
      } cannot be negative.`,
    });
  }
  const normalizedItems = (Array.isArray(items) ? items : [])
    .map((item) => {
      const name = String(item.name ?? item.Item ?? "").trim();
      const quantity = Number(item.consumeQty ?? item.ConsumeQty ?? item.quantity ?? item.Quantity ?? 0) || 0;
      const rate = Number(item.rate ?? item.Rate ?? 0) || 0;
      const itemId = toNullableInt(item.itemId ?? item.ItemId);
      const boqItemId = toNullableInt(
        item.boqItemId ?? item.BoqItemId ?? item.BOQItemId ?? item.LineItemId
      );
      const receiveGoodsItemId = toNullableInt(
        item.receiveGoodsItemId ?? item.ReceiveGoodsItemId ?? item.ReceiveItemId
      );
      const deliveryChallanId = toNullableInt(
        item.deliveryChallanId ?? item.DeliveryChallanId
      );
      const deliveryChallanItemId = toNullableInt(
        item.deliveryChallanItemId ??
          item.DeliveryChallanItemId ??
          item.deliveryChallanLineItemId ??
          item.DeliveryChallanLineItemId
      );
      const sourceType =
        normalizeAvailabilitySourceType(item.sourceType ?? item.SourceType) ||
        (deliveryChallanId !== null ? "dc" : "receive");
      return {
        deliveryChallanId,
        deliveryChallanItemId,
        receiveGoodsId: toNullableInt(item.receiveGoodsId ?? item.ReceiveGoodsId),
        itemId,
        boqItemId,
        receiveGoodsItemId,
        sourceType,
        sourceKey:
          normalizeOptionalString(item.sourceKey ?? item.SourceKey) ??
          buildAvailabilitySourceKey({
            ...item,
            deliveryChallanId,
            receiveGoodsItemId,
            sourceType,
          }),
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
  timing("validation-complete", { normalizedItemCount: normalizedItems.length });

  if (!normalizedItems.length) {
    return res.status(400).json({
      ok: false,
      error: "At least one consumed item is required",
    });
  }

  let tx;
  try {
    await ensureConsumptionTables();
    await ensureReceiveTables();
    await ensureReallocateInventoryTables();
    const pkCol = await refreshConsumptionPk();
    const fkCol = await refreshConsumptionItemsFk();
    const pool = await getPool();
    timing("schema-ready");
    tx = pool.transaction();
    await tx.begin();
    timing("transaction-begin");

    const currentConsumptionResult = await new sql.Request(tx)
      .input("ConsumptionId", sql.Int, id)
      .query(`
        SELECT *
        FROM dbo.Consumption
        WHERE ${pkCol} = @ConsumptionId
      `);
    const currentConsumptionRow = currentConsumptionResult.recordset?.[0] ?? null;
    if (!currentConsumptionRow) {
      await tx.rollback();
      return res.status(404).json({ ok: false, error: "Consumption not found" });
    }

    const currentItemsResult = await new sql.Request(tx)
      .input("ConsumptionId", sql.Int, id)
      .query(`
        SELECT *
        FROM dbo.ConsumptionItems
        WHERE ${fkCol} = @ConsumptionId
      `);
    const currentItems = (currentItemsResult.recordset ?? []).map(normalizeConsumptionItem);
    const linkedTransfer = await loadLinkedConsumptionTransfer(tx, {
      consumptionId: id,
      consumptionNumber:
        safeConsumptionNumber ??
        normalizeOptionalString(currentConsumptionRow?.ConsumptionNumber) ??
        "",
    });
    timing("current-record-loaded", {
      currentItemCount: currentItems.length,
      hasLinkedTransfer: Boolean(linkedTransfer?.id),
    });

    const currentDeliveryChallanIds = parseJsonArray(
      currentConsumptionRow?.DeliveryChallanIds
    )
      .map((value) => toNullableInt(value))
      .filter((value) => value !== null);
    const mappedItems = normalizedItems.map((item) => ({
      ...item,
      sourceKey: item.sourceKey || buildAvailabilitySourceKey(item),
    }));

    await validateAvailableInventorySelection(tx, {
      projectId: safeProjectId,
      locationId: safeFromLocationId,
      items: mappedItems,
      excludeConsumptionId: id,
    });
    timing("available-inventory-validation-complete", {
      itemCount: mappedItems.length,
    });

    if (linkedTransfer?.id) {
      await deleteReallocateInventoryRecord(tx, linkedTransfer.id);
      timing("linked-transfer-delete-complete", { transferId: linkedTransfer.id });
    }

    const resolvedDeliveryChallanIds = Array.from(
      new Set(
        [
          ...(safeDeliveryChallanIds.length
            ? safeDeliveryChallanIds
            : currentDeliveryChallanIds),
          ...mappedItems.map((item) => toNullableInt(item.deliveryChallanId)),
        ].filter((value) => value !== null)
      )
    );
    const resolvedDeliveryChallanId =
      safeDeliveryChallanId ??
      resolvedDeliveryChallanIds[0] ??
      toNullableInt(currentConsumptionRow?.DeliveryChallanId);
    const resolvedReceiveGoodsId =
      safeReceiveGoodsId ??
      mappedItems
        .map((item) => toNullableInt(item.receiveGoodsId))
        .find((value) => value !== null) ??
      toNullableInt(currentConsumptionRow?.ReceiveGoodsId);
    const updateHeaderReq = new sql.Request(tx);
    updateHeaderReq.input("ConsumptionId", sql.Int, id);
    updateHeaderReq.input("ConsumptionNumber", sql.NVarChar(50), safeConsumptionNumber);
    updateHeaderReq.input("ProjectId", sql.Int, safeProjectId);
    updateHeaderReq.input("FromLocationId", sql.Int, safeFromLocationId);
    updateHeaderReq.input("LocationId", sql.Int, safeLocationId);
    updateHeaderReq.input("ReceiveGoodsId", sql.Int, resolvedReceiveGoodsId);
    updateHeaderReq.input(
      "DeliveryChallanId",
      sql.Int,
      resolvedDeliveryChallanId
    );
    updateHeaderReq.input(
      "DeliveryChallanIds",
      sql.NVarChar(sql.MAX),
      JSON.stringify(resolvedDeliveryChallanIds)
    );
    updateHeaderReq.input(
      "DeliveryChallanRef",
      sql.NVarChar(100),
      safeDeliveryChallanRef ??
        normalizeOptionalString(currentConsumptionRow?.DeliveryChallanRef) ??
        null
    );
    updateHeaderReq.input("ConsumptionDate", sql.Date, parsedConsumptionDate ?? null);
    updateHeaderReq.input("IssuedBy", sql.NVarChar(200), safeIssuedBy);
    updateHeaderReq.input("Status", sql.NVarChar(50), safeStatus);
    updateHeaderReq.input("Notes", sql.NVarChar(sql.MAX), safeNotes);
    updateHeaderReq.input("CompanyAddress", sql.NVarChar(sql.MAX), safeCompanyAddress);
    updateHeaderReq.input("CompanyGstin", sql.NVarChar(50), safeCompanyGstin);
    updateHeaderReq.input("CompanyPhone", sql.NVarChar(50), safeCompanyPhone);
    updateHeaderReq.input("CompanyEmail", sql.NVarChar(100), safeCompanyEmail);

    const headerResult = await updateHeaderReq.query(`
      UPDATE dbo.Consumption
      SET ConsumptionNumber = @ConsumptionNumber,
          ProjectId = @ProjectId,
          FromLocationId = @FromLocationId,
          LocationId = @LocationId,
          ReceiveGoodsId = @ReceiveGoodsId,
          DeliveryChallanId = @DeliveryChallanId,
          DeliveryChallanIds = @DeliveryChallanIds,
          DeliveryChallanRef = @DeliveryChallanRef,
          ConsumptionDate = @ConsumptionDate,
          IssuedBy = @IssuedBy,
          Status = @Status,
          Notes = @Notes,
          CompanyAddress = @CompanyAddress,
          CompanyGstin = @CompanyGstin,
          CompanyPhone = @CompanyPhone,
          CompanyEmail = @CompanyEmail,
          UpdatedAt = SYSUTCDATETIME()
      OUTPUT INSERTED.*
      WHERE ${pkCol} = @ConsumptionId
    `);
    timing("header-update-complete");

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
    timing("line-items-delete-complete");

    for (const item of mappedItems) {
      const insertItemReq = new sql.Request(tx);
      insertItemReq.input("ConsumptionId", sql.Int, id);
      insertItemReq.input("BoqItemId", sql.Int, item.boqItemId ?? null);
      insertItemReq.input("ItemId", sql.Int, item.itemId ?? null);
      insertItemReq.input("DeliveryChallanId", sql.Int, item.deliveryChallanId ?? null);
      insertItemReq.input(
        "DeliveryChallanItemId",
        sql.BigInt,
        item.deliveryChallanItemId ?? null
      );
      insertItemReq.input(
        "ReceiveGoodsItemId",
        sql.Int,
        item.receiveGoodsItemId ?? null
      );
      insertItemReq.input("SourceType", sql.NVarChar(50), item.sourceType ?? null);
      insertItemReq.input("SourceKey", sql.NVarChar(200), item.sourceKey ?? null);
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
          (${fkCol}, BoqItemId, ItemId, DeliveryChallanId, DeliveryChallanItemId, ReceiveGoodsItemId, SourceType, SourceKey, Item, Description, Unit, HSN, GST, Quantity, Rate, Notes)
        VALUES
          (@ConsumptionId, @BoqItemId, @ItemId, @DeliveryChallanId, @DeliveryChallanItemId, @ReceiveGoodsItemId, @SourceType, @SourceKey, @Item, @Description, @Unit, @HSN, @GST, @Quantity, @Rate, @Notes)
      `);
    }
    timing("line-items-insert-complete", { itemCount: mappedItems.length });

    await applyConsumptionStockDelta(tx, currentItems, mappedItems);
    timing("stock-delta-complete");

    await tx.commit();
    timing("transaction-commit-complete");

    const consumption = {
      ...normalizeConsumption(headerRow),
      items: mappedItems.map((item) =>
        normalizeConsumptionItem({
          ...item,
          ConsumptionId: id,
          Quantity: item.quantity,
        })
      ),
    };
    timing("response-created", { itemCount: consumption.items.length });

    return res.json({
      ok: true,
      consumption,
    });
  } catch (error) {
    await rollbackTx(tx);
    return res.status(error?.statusCode ?? 500).json({
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
    await ensureReallocateInventoryTables();
    const pkCol = await refreshConsumptionPk();
    const fkCol = await refreshConsumptionItemsFk();
    const pool = await getPool();
    tx = pool.transaction();
    await tx.begin();

    const existingItemsResult = await new sql.Request(tx)
      .input("ConsumptionId", sql.Int, id)
      .query(`
        SELECT * FROM dbo.ConsumptionItems WHERE ${fkCol} = @ConsumptionId
      `);
    const existingItems = (existingItemsResult.recordset ?? []).map(normalizeConsumptionItem);
    const existingHeaderResult = await new sql.Request(tx)
      .input("ConsumptionId", sql.Int, id)
      .query(`
        SELECT *
        FROM dbo.Consumption
        WHERE ${pkCol} = @ConsumptionId
      `);
    const existingConsumptionRow = existingHeaderResult.recordset?.[0] ?? null;
    const linkedTransfer = await loadLinkedConsumptionTransfer(tx, {
      consumptionId: id,
      consumptionNumber: existingConsumptionRow?.ConsumptionNumber ?? "",
    });
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

    if (linkedTransfer?.id) {
      await deleteReallocateInventoryRecord(tx, linkedTransfer.id);
    }

    await refreshBoqAvailability(tx, existingBoqItemIds);
    await applyConsumptionStockDelta(tx, existingItems, []);

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
    type = "Reallocate",
    referenceType = null,
    referenceId = null,
    referenceNo = "",
    consumptionId = null,
    consumptionNumber = "",
    projectId = null,
    sourceProjectId = null,
    fromLocationId,
    toLocationId = null,
    returnVendorId = null,
    requestDate = null,
    requestedBy = null,
    eWayBillNumber = null,
    status = "Pending",
    notes = null,
    items = [],
  } = req.body ?? {};

  const safeType = String(type ?? "Reallocate").trim() === "Return"
    ? "Return"
    : "Reallocate";
  const safeReferenceType = (() => {
    const normalized = String(referenceType ?? "").trim().toLowerCase();
    if (["delivery_challan", "delivery-challan", "delivery challan", "dc"].includes(normalized)) {
      return "delivery_challan";
    }
    if (["consumption", "consume"].includes(normalized)) {
      return "consumption";
    }
    return "";
  })();
  const safeReferenceId = toNullableInt(referenceId);
  const safeReferenceNo = normalizeOptionalString(referenceNo) ?? "";
  const safeConsumptionId = toNullableInt(consumptionId);
  const safeConsumptionNumber = normalizeOptionalString(consumptionNumber) ?? "";
  const safeProjectId = toNullableInt(projectId);
  const safeSourceProjectId = toNullableInt(sourceProjectId);
  const safeFromLocationId = toNullableInt(fromLocationId);
  const safeToLocationId = toNullableInt(toLocationId);
  const safeReturnVendorId = toNullableInt(returnVendorId);
  const safeRequestedBy = normalizeOptionalString(requestedBy) ?? "";
  const safeEWayBillNumber = normalizeOptionalString(eWayBillNumber) ?? "";
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

  const negativeItem = findNegativeQuantityInput(items, ["quantity", "Quantity"]);
  if (negativeItem) {
    return res.status(400).json({
      ok: false,
      error: `Reallocation quantity for ${
        negativeItem.name ?? negativeItem.item ?? negativeItem.Item ?? "item"
      } cannot be negative.`,
    });
  }
  const normalizedItems = (Array.isArray(items) ? items : [])
    .map((item) => {
      const name = String(item.name ?? item.item ?? item.Item ?? "").trim();
      const deliveryChallanId = toNullableInt(
        item.deliveryChallanId ?? item.DeliveryChallanId
      );
      const deliveryChallanItemId = toNullableInt(
        item.deliveryChallanItemId ??
          item.DeliveryChallanItemId ??
          item.deliveryChallanLineItemId ??
          item.DeliveryChallanLineItemId
      );
      const receiveGoodsItemId = toNullableInt(
        item.receiveGoodsItemId ?? item.ReceiveGoodsItemId ?? item.ReceiveItemId
      );
      const sourceType =
        normalizeAvailabilitySourceType(item.sourceType ?? item.SourceType) ||
        (deliveryChallanId !== null ? "dc" : "receive");
      const normalizedItem = {
        name,
        description:
          normalizeOptionalString(item.description ?? item.Description) ?? null,
        unit: normalizeOptionalString(item.unit ?? item.Unit) ?? "PCS",
        quantity: Number(item.quantity ?? item.Quantity ?? 0) || 0,
        receiveGoodsItemId,
        deliveryChallanId,
        deliveryChallanItemId,
        sourceType,
        sourceKey: normalizeOptionalString(item.sourceKey ?? item.SourceKey) ?? null,
        sourceRef: normalizeOptionalString(item.sourceRef ?? item.SourceRef) ?? null,
      };
      normalizedItem.sourceKey =
        normalizedItem.sourceKey || buildAvailabilitySourceKey(normalizedItem);
      return normalizedItem;
    })
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

    await ensureLocationsTable();
    const resolvedSourceContext = await new sql.Request(tx)
      .input("LocationId", sql.Int, safeFromLocationId)
      .query(`
        SELECT TOP 1 *
        FROM dbo.Locations
        WHERE LocationId = @LocationId
      `);
    const resolvedSourceLocation = normalizeLocation(
      resolvedSourceContext.recordset?.[0] ?? {}
    );
    const effectiveProjectId =
      safeProjectId ?? toNullableInt(resolvedSourceLocation.projectId);
    const effectiveSourceProjectId =
      safeSourceProjectId ??
      toNullableInt(resolvedSourceLocation.projectId) ??
      effectiveProjectId;

    await validateAvailableInventorySelection(tx, {
      projectId: effectiveSourceProjectId,
      locationId: safeFromLocationId,
      items: normalizedItems,
    });

    const now = new Date().toISOString();
    const initialNotesPayload = buildReallocateNotesPayload({
      referenceNumber: null,
      referenceType: safeReferenceType,
      referenceId: safeReferenceId,
      referenceNo: safeReferenceNo,
      type: safeType,
      consumptionId: safeConsumptionId,
      consumptionNumber: safeConsumptionNumber,
      projectId: effectiveProjectId,
      sourceProjectId: effectiveSourceProjectId,
      returnVendorId: safeReturnVendorId,
      requestDate: parsedRequestDate?.toISOString?.() ?? requestDate ?? null,
      requestedBy: safeRequestedBy,
      eWayBillNumber: safeEWayBillNumber,
      status: safeStatus,
      notes: safeNotes,
      createdAt: now,
      updatedAt: now,
    });

    const insertHeaderReq = new sql.Request(tx);
    insertHeaderReq.input("FromLocationId", sql.Int, safeFromLocationId);
    insertHeaderReq.input("ToLocationId", sql.Int, safeToLocationId);
    insertHeaderReq.input("TransferDate", sql.DateTime, parsedRequestDate ?? null);
    insertHeaderReq.input("Notes", sql.NVarChar(sql.MAX), initialNotesPayload);
    const headerResult = await insertHeaderReq.query(`
      INSERT INTO dbo.ReallocateInventory
        (FromLocationId, ToLocationId, TransferDate, Notes)
      OUTPUT INSERTED.*
      VALUES
        (@FromLocationId, @ToLocationId, @TransferDate, @Notes)
    `);

    const createdHeaderRow = headerResult.recordset?.[0];
    const transferId =
      createdHeaderRow?.[pkCol] ??
      createdHeaderRow?.Id ??
      createdHeaderRow?.TransferId ??
      null;
    if (!transferId) {
      throw new Error("Failed to create reallocation");
    }

    const generatedReferenceNumber = generateReallocateReferenceNumber(transferId);
    const finalNotesPayload = buildReallocateNotesPayload({
      referenceNumber: generatedReferenceNumber,
      referenceType: safeReferenceType,
      referenceId: safeReferenceId,
      referenceNo: safeReferenceNo,
      type: safeType,
      consumptionId: safeConsumptionId,
      consumptionNumber: safeConsumptionNumber,
      projectId: effectiveProjectId,
      sourceProjectId: effectiveSourceProjectId,
      returnVendorId: safeReturnVendorId,
      requestDate: parsedRequestDate?.toISOString?.() ?? requestDate ?? null,
      requestedBy: safeRequestedBy,
      eWayBillNumber: safeEWayBillNumber,
      status: safeStatus,
      notes: safeNotes,
      createdAt: now,
      updatedAt: now,
    });

    const updateHeaderReq = new sql.Request(tx);
    updateHeaderReq.input("TransferId", sql.Int, transferId);
    updateHeaderReq.input("Notes", sql.NVarChar(sql.MAX), finalNotesPayload);
    const updateHeaderResult = await updateHeaderReq.query(`
      UPDATE dbo.ReallocateInventory
      SET Notes = @Notes
      OUTPUT INSERTED.*
      WHERE ${toIdentifier(pkCol)} = @TransferId
    `);

    const headerRow = updateHeaderResult.recordset?.[0];
    if (!headerRow) {
      throw new Error("Failed to create reallocation");
    }

    for (const item of normalizedItems) {
      const insertItemReq = new sql.Request(tx);
      insertItemReq.input("TransferId", sql.Int, transferId);
      insertItemReq.input("ReceiveGoodsItemId", sql.Int, item.receiveGoodsItemId);
      insertItemReq.input("DeliveryChallanId", sql.Int, item.deliveryChallanId);
      insertItemReq.input("DeliveryChallanItemId", sql.BigInt, item.deliveryChallanItemId);
      insertItemReq.input("SourceType", sql.NVarChar(50), item.sourceType);
      insertItemReq.input("SourceKey", sql.NVarChar(200), item.sourceKey);
      insertItemReq.input("SourceRef", sql.NVarChar(255), item.sourceRef);
      insertItemReq.input("Item", sql.NVarChar(200), item.name);
      insertItemReq.input("Description", sql.NVarChar(500), item.description);
      insertItemReq.input("Unit", sql.NVarChar(100), item.unit);
      insertItemReq.input("Quantity", sql.Decimal(18, 2), item.quantity);
      await insertItemReq.query(`
        INSERT INTO dbo.ReallocateInventoryItems
          (${fkCol}, ReceiveGoodsItemId, DeliveryChallanId, DeliveryChallanItemId, SourceType, SourceKey, SourceRef, Item, Description, Unit, Quantity)
        VALUES
          (@TransferId, @ReceiveGoodsItemId, @DeliveryChallanId, @DeliveryChallanItemId, @SourceType, @SourceKey, @SourceRef, @Item, @Description, @Unit, @Quantity)
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
    return res.status(error?.statusCode ?? 500).json({
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
    type = "Reallocate",
    referenceType = null,
    referenceId = null,
    referenceNo = "",
    consumptionId = null,
    consumptionNumber = "",
    projectId = null,
    sourceProjectId = null,
    fromLocationId,
    toLocationId = null,
    returnVendorId = null,
    requestDate = null,
    requestedBy = null,
    eWayBillNumber = null,
    status = "Pending",
    notes = null,
    items = [],
  } = req.body ?? {};

  const safeType = String(type ?? "Reallocate").trim() === "Return"
    ? "Return"
    : "Reallocate";
  const safeReferenceType = (() => {
    const normalized = String(referenceType ?? "").trim().toLowerCase();
    if (["delivery_challan", "delivery-challan", "delivery challan", "dc"].includes(normalized)) {
      return "delivery_challan";
    }
    if (["consumption", "consume"].includes(normalized)) {
      return "consumption";
    }
    return "";
  })();
  const safeReferenceId = toNullableInt(referenceId);
  const safeReferenceNo = normalizeOptionalString(referenceNo) ?? "";
  const safeConsumptionId = toNullableInt(consumptionId);
  const safeConsumptionNumber = normalizeOptionalString(consumptionNumber) ?? "";
  const safeProjectId = toNullableInt(projectId);
  const safeSourceProjectId = toNullableInt(sourceProjectId);
  const safeFromLocationId = toNullableInt(fromLocationId);
  const safeToLocationId = toNullableInt(toLocationId);
  const safeReturnVendorId = toNullableInt(returnVendorId);
  const safeRequestedBy = normalizeOptionalString(requestedBy) ?? "";
  const safeEWayBillNumber = normalizeOptionalString(eWayBillNumber) ?? "";
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

  const negativeItem = findNegativeQuantityInput(items, ["quantity", "Quantity"]);
  if (negativeItem) {
    return res.status(400).json({
      ok: false,
      error: `Reallocation quantity for ${
        negativeItem.name ?? negativeItem.item ?? negativeItem.Item ?? "item"
      } cannot be negative.`,
    });
  }
  const normalizedItems = (Array.isArray(items) ? items : [])
    .map((item) => {
      const name = String(item.name ?? item.item ?? item.Item ?? "").trim();
      const deliveryChallanId = toNullableInt(
        item.deliveryChallanId ?? item.DeliveryChallanId
      );
      const deliveryChallanItemId = toNullableInt(
        item.deliveryChallanItemId ??
          item.DeliveryChallanItemId ??
          item.deliveryChallanLineItemId ??
          item.DeliveryChallanLineItemId
      );
      const receiveGoodsItemId = toNullableInt(
        item.receiveGoodsItemId ?? item.ReceiveGoodsItemId ?? item.ReceiveItemId
      );
      const sourceType =
        normalizeAvailabilitySourceType(item.sourceType ?? item.SourceType) ||
        (deliveryChallanId !== null ? "dc" : "receive");
      const normalizedItem = {
        name,
        description:
          normalizeOptionalString(item.description ?? item.Description) ?? null,
        unit: normalizeOptionalString(item.unit ?? item.Unit) ?? "PCS",
        quantity: Number(item.quantity ?? item.Quantity ?? 0) || 0,
        receiveGoodsItemId,
        deliveryChallanId,
        deliveryChallanItemId,
        sourceType,
        sourceKey: normalizeOptionalString(item.sourceKey ?? item.SourceKey) ?? null,
        sourceRef: normalizeOptionalString(item.sourceRef ?? item.SourceRef) ?? null,
      };
      normalizedItem.sourceKey =
        normalizedItem.sourceKey || buildAvailabilitySourceKey(normalizedItem);
      return normalizedItem;
    })
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

    await ensureLocationsTable();
    const resolvedSourceContext = await new sql.Request(tx)
      .input("LocationId", sql.Int, safeFromLocationId)
      .query(`
        SELECT TOP 1 *
        FROM dbo.Locations
        WHERE LocationId = @LocationId
      `);
    const resolvedSourceLocation = normalizeLocation(
      resolvedSourceContext.recordset?.[0] ?? {}
    );
    const effectiveProjectId =
      safeProjectId ?? toNullableInt(resolvedSourceLocation.projectId);
    const effectiveSourceProjectId =
      safeSourceProjectId ??
      toNullableInt(resolvedSourceLocation.projectId) ??
      effectiveProjectId;

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
    await validateAvailableInventorySelection(tx, {
      projectId: effectiveSourceProjectId,
      locationId: safeFromLocationId,
      items: normalizedItems,
      excludeReallocateInventoryId: id,
    });

    const notesPayload = buildReallocateNotesPayload({
      referenceNumber: previousRecord.referenceNumber || generateReallocateReferenceNumber(id),
      referenceType: safeReferenceType,
      referenceId: safeReferenceId,
      referenceNo: safeReferenceNo,
      type: safeType,
      consumptionId: safeConsumptionId,
      consumptionNumber: safeConsumptionNumber,
      projectId: effectiveProjectId,
      sourceProjectId: effectiveSourceProjectId,
      returnVendorId: safeReturnVendorId,
      requestDate: parsedRequestDate?.toISOString?.() ?? requestDate ?? null,
      requestedBy: safeRequestedBy,
      eWayBillNumber: safeEWayBillNumber,
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
    updateHeaderReq.input("Notes", sql.NVarChar(sql.MAX), notesPayload);
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
      insertItemReq.input("ReceiveGoodsItemId", sql.Int, item.receiveGoodsItemId);
      insertItemReq.input("DeliveryChallanId", sql.Int, item.deliveryChallanId);
      insertItemReq.input("DeliveryChallanItemId", sql.BigInt, item.deliveryChallanItemId);
      insertItemReq.input("SourceType", sql.NVarChar(50), item.sourceType);
      insertItemReq.input("SourceKey", sql.NVarChar(200), item.sourceKey);
      insertItemReq.input("SourceRef", sql.NVarChar(255), item.sourceRef);
      insertItemReq.input("Item", sql.NVarChar(200), item.name);
      insertItemReq.input("Description", sql.NVarChar(500), item.description);
      insertItemReq.input("Unit", sql.NVarChar(100), item.unit);
      insertItemReq.input("Quantity", sql.Decimal(18, 2), item.quantity);
      await insertItemReq.query(`
        INSERT INTO dbo.ReallocateInventoryItems
          (${fkCol}, ReceiveGoodsItemId, DeliveryChallanId, DeliveryChallanItemId, SourceType, SourceKey, SourceRef, Item, Description, Unit, Quantity)
        VALUES
          (@TransferId, @ReceiveGoodsItemId, @DeliveryChallanId, @DeliveryChallanItemId, @SourceType, @SourceKey, @SourceRef, @Item, @Description, @Unit, @Quantity)
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
    return res.status(error?.statusCode ?? 500).json({
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
      ensureBrandsTable(),
      ensureItemsTable(),
      ensureVendorsTable(),
      ensureCustomersTable(),
      ensureProjectsTable(),
      ensureLocationsTable(),
      ensurePurchaseTables(),
      ensureReceiveTables(),
      ensureInvoicesTables(),
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
