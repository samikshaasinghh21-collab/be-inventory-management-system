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
    rate,
    unitPrice: rate,
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
  receiveGoodsItemId:
    row.ReceiveGoodsItemId ?? row.receiveGoodsItemId ?? null,
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
  const receiveGoodsItemIdToMaterialKey = new Map();

  (Array.isArray(items) ? items : []).forEach((item) => {
    const materialKey = buildInventoryMaterialKey(item);
    if (!materialKey) {
      return;
    }

    const deliveredQty = Number(item.quantity ?? item.Quantity ?? 0) || 0;
    if (!groups.has(materialKey)) {
      groups.set(materialKey, {
        materialKey,
        name: item.name ?? item.ItemName ?? "Item",
        unit: item.unit ?? item.Unit ?? "PCS",
        deliveredQty: 0,
        consumedQty: 0,
      });
    }

    const group = groups.get(materialKey);
    group.deliveredQty += deliveredQty;

    const receiveGoodsItemId = toNullableInt(
      item.receiveGoodsItemId ?? item.ReceiveGoodsItemId
    );
    if (receiveGoodsItemId !== null) {
      receiveGoodsItemIdToMaterialKey.set(receiveGoodsItemId, materialKey);
    }
  });

  return {
    groups,
    receiveGoodsItemIdToMaterialKey,
  };
};

const resolveDeliveryChallanMaterialKey = (
  item = {},
  groups = new Map(),
  receiveGoodsItemIdToMaterialKey = new Map()
) => {
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

const buildDeliveryChallanMetrics = (
  challan = {},
  challanItems = [],
  consumptions = []
) => {
  const { groups, receiveGoodsItemIdToMaterialKey } =
    buildDeliveryChallanMaterialGroups(challanItems);

  (Array.isArray(consumptions) ? consumptions : []).forEach((consumption) => {
    if (!isConsumptionLinkedToDeliveryChallan(consumption, challan)) {
      return;
    }

    (consumption.items || []).forEach((item) => {
      const materialKey = resolveDeliveryChallanMaterialKey(
        item,
        groups,
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
  return {
    id,
    consumptionId: id,
    consumptionNumber: row.ConsumptionNumber ?? row.consumptionNumber ?? "",
    projectId: row.ProjectId ?? row.projectId ?? null,
    locationId: row.LocationId ?? row.locationId ?? null,
    receiveGoodsId: row.ReceiveGoodsId ?? row.receiveGoodsId ?? null,
    deliveryChallanId:
      row.DeliveryChallanId ?? row.deliveryChallanId ?? row.DeliverychallanId ?? null,
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
  receiveGoodsItemId:
    row.ReceiveGoodsItemId ?? row.receiveGoodsItemId ?? null,
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
    : "This Purchase Order is Closed.";

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
    billTo: row.BillTo ?? row.billTo ?? "",
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
    row.Id ??
    row.id ??
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
    const key = buildReceivePoItemKey(item, index);
    if (!source.byKey.has(key)) {
      source.byKey.set(key, item);
    }
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
    receiptItem.Id ??
    receiptItem.id ??
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
  return;
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
        Phone NVARCHAR(20) NOT NULL,
        Email NVARCHAR(255) NULL,
        GSTNumber NVARCHAR(30) NULL,
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
      ALTER TABLE dbo.Vendors ADD Phone NVARCHAR(20) NULL;
    END;
    IF COL_LENGTH('dbo.Vendors', 'Email') IS NULL
    BEGIN
      ALTER TABLE dbo.Vendors ADD Email NVARCHAR(255) NULL;
    END;
    IF COL_LENGTH('dbo.Vendors', 'GSTNumber') IS NULL
    BEGIN
      ALTER TABLE dbo.Vendors ADD GSTNumber NVARCHAR(30) NULL;
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
        Phone NVARCHAR(30) NULL,
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
      ALTER TABLE dbo.VendorContacts ADD Phone NVARCHAR(30) NULL;
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
  `);
};

const ensureCustomersTable = async () => {
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
        ContactNumber NVARCHAR(30) NULL,
        Email NVARCHAR(255) NULL,
        ContactPerson NVARCHAR(255) NULL,
        Designation NVARCHAR(255) NULL,
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
      ALTER TABLE dbo.Customers ADD ContactNumber NVARCHAR(30) NULL;
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
        Phone NVARCHAR(30) NULL,
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
      ALTER TABLE dbo.CustomerContacts ADD Phone NVARCHAR(30) NULL;
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
        CustomerId INT NULL,
        Client NVARCHAR(255) NULL,
        ClientCompany NVARCHAR(255) NULL,
        ClientAddress NVARCHAR(MAX) NULL,
        ClientGSTNumber NVARCHAR(30) NULL,
        ClientPhone NVARCHAR(30) NULL,
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
      ALTER TABLE dbo.Projects ADD ClientPhone NVARCHAR(30) NULL;
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

const normalizeBoqItemsInput = (items = []) =>
  (Array.isArray(items) ? items : [])
    .map((item) => ({
      id: toNullableInt(item.id ?? item.Id ?? item.LineItemId ?? item.lineItemId),
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
      quantity: Number(item.quantity ?? item.qty ?? item.Quantity ?? 0) || 0,
      rate: Number(item.rate ?? item.Rate ?? item.unitPrice ?? item.UnitPrice ?? 0) || 0,
      notes: normalizeOptionalString(item.notes ?? item.Notes) ?? "",
    }))
    .filter((item) => item.quantity > 0 && item.name);

const resolvePurchaseOrderItemColumns = (cols = new Set()) => {
  const hasPoId = cols.has("PurchaseOrderId");
  return {
    hasPoId,
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
    if (quantityByBoqItemId.has(boqItemId)) {
      const previousQuantity = quantityByBoqItemId.get(boqItemId);
      if (previousQuantity !== nextQuantity) {
        const error = new Error(
          "The same BOQ item cannot be linked to multiple purchase-order rows with different quantities."
        );
        error.statusCode = 400;
        throw error;
      }
      continue;
    }
    quantityByBoqItemId.set(boqItemId, nextQuantity);
  }

  const boqItemIds = Array.from(quantityByBoqItemId.keys());
  if (!boqItemIds.length) {
    return [];
  }

  const request = new sql.Request(tx);
  const inClause = buildPurchaseOrderItemInClause(request, boqItemIds, "BoqItemId");
  const result = await request.query(`
    SELECT LineItemId, BOQId, ItemName
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
  for (const row of existingRows) {
    const boqItemId = toNullableInt(row.LineItemId);
    const nextQuantity = quantityByBoqItemId.get(boqItemId) ?? 0;
    const consumedQty = consumedTotals.get(boqItemId) ?? 0;
    if (nextQuantity < consumedQty) {
      const error = new Error(
        `Quantity for ${row.ItemName || "the linked BOQ item"} cannot be lower than the consumed quantity (${consumedQty}).`
      );
      error.statusCode = 400;
      throw error;
    }
  }

  for (const row of existingRows) {
    const boqItemId = toNullableInt(row.LineItemId);
    const nextQuantity = quantityByBoqItemId.get(boqItemId) ?? 0;
    const consumedQty = consumedTotals.get(boqItemId) ?? 0;

    await new sql.Request(tx)
      .input("BoqItemId", sql.Int, boqItemId)
      .input("Quantity", sql.Decimal(18, 2), nextQuantity)
      .input("ConsumedQty", sql.Decimal(18, 2), consumedQty)
      .query(`
        UPDATE dbo.BOQLineItems
        SET Quantity = @Quantity,
            ConsumedQty = @ConsumedQty,
            AvailableQty = CASE
              WHEN @Quantity - @ConsumedQty < 0 THEN 0
              ELSE @Quantity - @ConsumedQty
            END
        WHERE LineItemId = @BoqItemId
      `);
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

  const unitPriceExpr = buildPurchaseOrderUnitPriceExpression(config, "poi");
  const setClauses = [`poi.${toIdentifier(config.qtyCol)} = bi.Quantity`];
  if (config.totalCol) {
    setClauses.push(
      `poi.${toIdentifier(config.totalCol)} = ROUND(bi.Quantity * ${unitPriceExpr}, 2)`
    );
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

const buildRequestedReceiveTotalsBeforeReceipt = (
  purchaseOrderItems = [],
  headers = [],
  groupedItems = {},
  targetReceiptId = null
) => {
  const totals = new Map();
  const stopAtId = targetReceiptId === null ? null : String(targetReceiptId);

  for (const header of headers) {
    const receiptId = String(
      header?.ReceiveGoodsId ?? header?.receiveGoodsId ?? header?.Id ?? header?.id ?? ""
    );
    if (stopAtId && receiptId === stopAtId) {
      break;
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

  if (!stopAtId) {
    return totals;
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
  const priorTotals = buildRequestedReceiveTotalsBeforeReceipt(
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
      orderedQty - toReceiveQuantity(priorTotals.get(itemKey)),
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
  return;
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
        BillTo NVARCHAR(MAX) NULL,
        ShipTo NVARCHAR(MAX) NULL,
        ShowProjectDetails BIT NOT NULL DEFAULT 1,
        Notes NVARCHAR(MAX) NULL,
      TaxMode NVARCHAR(20) NULL,
        InvoiceNumber NVARCHAR(100) NULL,
        InvoiceDate DATE NULL,
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

  const tableCheck = await new sql.Request(tx).query(`
    SELECT OBJECT_ID('dbo.ConsumptionItems', 'U') AS TableId,
           COL_LENGTH('dbo.ConsumptionItems', 'BoqItemId') AS BoqItemIdLength
  `);
  if (!tableCheck.recordset?.[0]?.TableId || !tableCheck.recordset?.[0]?.BoqItemIdLength) {
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

const loadPurchaseOrderItemReceiveMetricsMap = async (db, purchaseOrderIds = []) => {
  const ids = uniquePurchaseOrderIds(purchaseOrderIds);
  if (!ids.length) {
    return new Map();
  }

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

  const poiPurchaseOrderIdExpr = `poi.${toIdentifier("PurchaseOrderId")}`;
  const poiPoItemIdExpr = `poi.${toIdentifier(poItemPkCol)}`;
  const poiItemIdExpr = poConfig.itemIdCol
    ? `poi.${toIdentifier(poConfig.itemIdCol)}`
    : "CAST(NULL AS INT)";
  const poiOrderedQtyExpr = `COALESCE(poi.${toIdentifier(poConfig.qtyCol)}, 0)`;
  const rgiPurchaseOrderIdExpr = `rgi.${toIdentifier(receivePurchaseOrderIdCol)}`;
  const rgiPoItemIdExpr = receivePoItemIdCol
    ? `rgi.${toIdentifier(receivePoItemIdCol)}`
    : "CAST(NULL AS INT)";
  const rgiItemIdExpr = receiveItemIdCol
    ? `rgi.${toIdentifier(receiveItemIdCol)}`
    : "CAST(NULL AS INT)";
  const rgiReceivedQtyExpr = `rgi.${toIdentifier(receiveQtyCol)}`;
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

  const request = new sql.Request(db);
  const purchaseOrderIdInClause = buildPurchaseOrderItemInClause(
    request,
    ids,
    "PurchaseOrderId"
  );
  const uniquePoItemIdsCte = canFallbackByItem
    ? `
      UniquePoItemIds AS (
        SELECT PurchaseOrderId, ${toIdentifier(poConfig.itemIdCol)} AS ItemId
        FROM dbo.PurchaseOrderItems
        WHERE PurchaseOrderId IN (${purchaseOrderIdInClause})
          AND ${toIdentifier(poConfig.itemIdCol)} IS NOT NULL
        GROUP BY PurchaseOrderId, ${toIdentifier(poConfig.itemIdCol)}
        HAVING COUNT(*) = 1
      )`
    : `
      UniquePoItemIds AS (
        SELECT
          CAST(NULL AS INT) AS PurchaseOrderId,
          CAST(NULL AS INT) AS ItemId
        WHERE 1 = 0
      )`;
  const receiveTotalsGroupBy = [
    rgiPurchaseOrderIdExpr,
    receivePoItemIdCol ? rgiPoItemIdExpr : null,
    receiveItemIdCol ? rgiItemIdExpr : null,
  ]
    .filter(Boolean)
    .join(", ");
  const consumedTotalsCte = hasConsumptionItems && canJoinConsumptionByReceiveItemId
    ? `
      ConsumedTotals AS (
        SELECT
          ${rgiPurchaseOrderIdExpr} AS PurchaseOrderId,
          ${receivePoItemIdCol ? rgiPoItemIdExpr : "CAST(NULL AS INT)"} AS PurchaseOrderItemId,
          ${receiveItemIdCol ? rgiItemIdExpr : "CAST(NULL AS INT)"} AS ItemId,
          SUM(COALESCE(ci.Quantity, 0)) AS TotalConsumed
        FROM dbo.ReceiveGoodsItems rgi
        INNER JOIN dbo.ConsumptionItems ci
          ON ci.ReceiveGoodsItemId = rgi.${toIdentifier(receiveGoodsItemPkCol)}
        WHERE ${rgiPurchaseOrderIdExpr} IN (${purchaseOrderIdInClause})
        GROUP BY ${receiveTotalsGroupBy}
      )`
    : `
      ConsumedTotals AS (
        SELECT
          CAST(NULL AS INT) AS PurchaseOrderId,
          CAST(NULL AS INT) AS PurchaseOrderItemId,
          CAST(NULL AS INT) AS ItemId,
          CAST(0 AS DECIMAL(18, 2)) AS TotalConsumed
        WHERE 1 = 0
      )`;

  const result = await request.query(
    withSqlLockTimeout(`
      WITH ${uniquePoItemIdsCte},
      ReceiveTotals AS (
        SELECT
          ${rgiPurchaseOrderIdExpr} AS PurchaseOrderId,
          ${receivePoItemIdCol ? rgiPoItemIdExpr : "CAST(NULL AS INT)"} AS PurchaseOrderItemId,
          ${receiveItemIdCol ? rgiItemIdExpr : "CAST(NULL AS INT)"} AS ItemId,
          SUM(COALESCE(${rgiReceivedQtyExpr}, 0)) AS TotalReceived
        FROM dbo.ReceiveGoodsItems rgi
        WHERE ${rgiPurchaseOrderIdExpr} IN (${purchaseOrderIdInClause})
        GROUP BY ${receiveTotalsGroupBy}
      ),
      ${consumedTotalsCte}
      SELECT
        ${poiPurchaseOrderIdExpr} AS PurchaseOrderId,
        ${poiPoItemIdExpr} AS PurchaseOrderItemId,
        ${poiItemIdExpr} AS ItemId,
        ${poiOrderedQtyExpr} AS OrderedQty,
        ISNULL(
          CASE
            WHEN rtByPo.TotalReceived IS NOT NULL THEN rtByPo.TotalReceived
            WHEN uniqueItemIds.ItemId IS NOT NULL THEN rtByItem.TotalReceived
            ELSE NULL
          END,
          0
        ) AS TotalReceivedQty,
        ISNULL(
          CASE
            WHEN ctByPo.TotalConsumed IS NOT NULL THEN ctByPo.TotalConsumed
            WHEN uniqueItemIds.ItemId IS NOT NULL THEN ctByItem.TotalConsumed
            ELSE NULL
          END,
          0
        ) AS TotalConsumedQty
      FROM dbo.PurchaseOrderItems poi
      LEFT JOIN ReceiveTotals rtByPo
        ON ${receivePoItemIdCol ? `rtByPo.PurchaseOrderId = ${poiPurchaseOrderIdExpr}
       AND rtByPo.PurchaseOrderItemId = ${poiPoItemIdExpr}` : "1 = 0"}
      LEFT JOIN UniquePoItemIds uniqueItemIds
        ON ${canFallbackByItem ? `uniqueItemIds.PurchaseOrderId = ${poiPurchaseOrderIdExpr}
       AND uniqueItemIds.ItemId = ${poiItemIdExpr}` : "1 = 0"}
      LEFT JOIN ReceiveTotals rtByItem
        ON ${
          canFallbackByItem
            ? `rtByPo.PurchaseOrderItemId IS NULL
       AND uniqueItemIds.ItemId IS NOT NULL
       AND rtByItem.PurchaseOrderId = ${poiPurchaseOrderIdExpr}
       AND rtByItem.PurchaseOrderItemId IS NULL
       AND rtByItem.ItemId = ${poiItemIdExpr}`
            : "1 = 0"
        }
      LEFT JOIN ConsumedTotals ctByPo
        ON ${receivePoItemIdCol ? `ctByPo.PurchaseOrderId = ${poiPurchaseOrderIdExpr}
       AND ctByPo.PurchaseOrderItemId = ${poiPoItemIdExpr}` : "1 = 0"}
      LEFT JOIN ConsumedTotals ctByItem
        ON ${
          canFallbackByItem
            ? `ctByPo.PurchaseOrderItemId IS NULL
       AND uniqueItemIds.ItemId IS NOT NULL
       AND ctByItem.PurchaseOrderId = ${poiPurchaseOrderIdExpr}
       AND ctByItem.PurchaseOrderItemId IS NULL
       AND ctByItem.ItemId = ${poiItemIdExpr}`
            : "1 = 0"
        }
      WHERE ${poiPurchaseOrderIdExpr} IN (${purchaseOrderIdInClause})
    `)
  );

  return (result.recordset ?? []).reduce((acc, row) => {
    const key = buildPurchaseOrderItemMetricKey(
      row.PurchaseOrderId,
      row.PurchaseOrderItemId
    );
    if (!key) {
      return acc;
    }

    const orderedQty = Number(row.OrderedQty ?? 0) || 0;
    const totalReceivedQty = Number(row.TotalReceivedQty ?? 0) || 0;
    const totalConsumedQty = Number(row.TotalConsumedQty ?? 0) || 0;
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
  const metricsByPoItem = await loadPurchaseOrderItemReceiveMetricsMap(
    db,
    normalizedItems.map((item) => item.purchaseOrderId)
  );

  return normalizedItems.map((item) => {
    const itemId = toNullableInt(item.id);
    const receiptReceivedQty = toReceiveQuantity(item.receivedQty);
    const receiptConsumedQty =
      itemId === null
        ? toReceiveQuantity(item.consumedQty)
        : toReceiveQuantity(consumedTotals.get(itemId));
    const receiptAvailableQty = Math.max(receiptReceivedQty - receiptConsumedQty, 0);
    const receiptBalanceQty = toReceiveQuantity(item.poBalanceQty ?? item.balanceQty);
    const metrics = metricsByPoItem.get(
      buildPurchaseOrderItemMetricKey(item.purchaseOrderId, item.poItemId)
    );
    const orderedQty =
      Number(metrics?.orderedQty ?? item.orderedQty ?? item.OrderedQty ?? 0) || 0;
    const totalReceivedQty =
      Number(metrics?.totalReceivedQty ?? item.totalReceivedQty ?? receiptReceivedQty) || 0;
    const totalAvailableQty =
      Number(metrics?.totalAvailableQty ?? item.totalAvailableQty ?? receiptAvailableQty) || 0;
    const totalPoBalanceQty =
      Number(
        metrics?.poBalanceQty ??
          item.totalPoBalanceQty ??
          Math.max(orderedQty - totalReceivedQty, 0)
      ) || 0;

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
      totalReceivedQty,
      totalConsumedQty: Number(metrics?.totalConsumedQty ?? 0) || 0,
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
    SELECT ${toIdentifier(receiveItemsPk)} AS Id, ReceiveGoodsId, ItemId, ItemName, ReceivedQty, BalanceQty
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

  return rows.map((row) => ({
    id: row.Id ?? null,
    receiveGoodsId: row.ReceiveGoodsId ?? null,
    itemId: row.ItemId ?? null,
    name: row.ItemName ?? "",
    receivedQty: Number(row.ReceivedQty ?? 0) || 0,
    balanceQty: Number(row.BalanceQty ?? 0) || 0,
  }));
};

let deliveryChallanPk = "DeliveryChallanId";
let deliveryChallanItemsFk = "DeliveryChallanId";
let ensureDeliveryChallanTablesPromise = null;

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
          LocationId INT NULL,
          ReceiveGoodsId INT NULL,
          DeliveryChallanId INT NULL,
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
      IF COL_LENGTH('dbo.ConsumptionItems', 'ReceiveGoodsItemId') IS NULL
      BEGIN
        ALTER TABLE dbo.ConsumptionItems ADD ReceiveGoodsItemId INT NULL;
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
  const { groups, receiveGoodsItemIdToMaterialKey } =
    buildDeliveryChallanMaterialGroups(challanItems);

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
    return null;
  }

  await ensureReceiveTables();
  await ensureDeliveryChallanTables();
  const receivePk = await refreshReceiveGoodsPk();
  const receiveItemsPk = await refreshReceiveGoodsItemsPk();
  const deliveryPk = await refreshDeliveryChallanPk();
  const deliveryFk = await refreshDeliveryChallanItemsFk();

  let receiptItems = [];

  if (requestedReceiveGoodsItemIds.length) {
    receiptItems = await loadReceiveGoodsItemsForConsumption(tx, {
      receiveGoodsId: safeReceiveGoodsId,
      receiveGoodsIds: safeReceiveGoodsIds,
      receiveGoodsItemIds: requestedReceiveGoodsItemIds,
    });
  } else if (safeReceiveGoodsIds.length) {
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

  const receiptPurchaseOrderIds = uniquePurchaseOrderIds(
    receiptHeaders.map((row) => row.PurchaseOrderId ?? row.purchaseOrderId)
  );
  if (receiptPurchaseOrderIds.length > 1) {
    const error = new Error(
      "The selected receipts must belong to the same purchase order."
    );
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
    if (itemId !== null && !itemIdToMaterialKey.has(itemId)) {
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
    if (itemId !== null && itemIdToMaterialKey.has(itemId)) {
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
      const hasLinkedReceiptIdentity =
        toNullableInt(item.receiveGoodsItemId ?? item.ReceiveGoodsItemId) !== null ||
        toNullableInt(
          item.poItemId ??
            item.POItemId ??
            item.purchaseOrderItemId ??
            item.PurchaseOrderItemId
        ) !== null;
      if (!hasLinkedReceiptIdentity) {
        // Allow manually added non-receipt lines; receipt validations apply
        // only to lines linked back to selected receipt items/PO items.
        return;
      }
      const error = new Error(
        `${item.name || "This material"} is not present in the selected receipt.`
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
      address,
      city,
      state,
      pincode,
      VendorName,
      Phone,
      Email,
      GSTNumber,
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
        .input("Phone", sql.NVarChar(20), nextPhone)
        .input("Email", sql.NVarChar(255), nextEmail)
        .input("GSTNumber", sql.NVarChar(30), nextGstNumber)
        .input("Address", sql.NVarChar(sql.MAX), nextAddress)
        .input("City", sql.NVarChar(120), nextCity || null)
        .input("State", sql.NVarChar(120), nextState || null)
        .input("Pincode", sql.NVarChar(20), nextPincode || null)
        .query(
          `INSERT INTO dbo.Vendors (VendorName, Phone, Email, GSTNumber, Address, City, State, Pincode)
           OUTPUT INSERTED.*
           VALUES (@VendorName, @Phone, @Email, @GSTNumber, @Address, @City, @State, @Pincode)`
        );

      const vendor = normalizeVendor(result.recordset?.[0] ?? {});
      for (const contact of normalizedContacts) {
        await new sql.Request(tx)
          .input("VendorId", sql.Int, vendor.id)
          .input("ContactName", sql.NVarChar(255), contact.contactName)
          .input("Email", sql.NVarChar(255), contact.email)
          .input("Designation", sql.NVarChar(255), contact.designation)
          .input("Phone", sql.NVarChar(30), contact.phone || null)
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
      address,
      city,
      state,
      pincode,
      VendorName,
      Phone,
      Email,
      GSTNumber,
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
        .input("Phone", sql.NVarChar(20), nextPhone)
        .input("Email", sql.NVarChar(255), nextEmail)
        .input("GSTNumber", sql.NVarChar(30), nextGstNumber)
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
            .input("Phone", sql.NVarChar(30), contact.phone || null)
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
          sql.NVarChar(30),
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
        .query(`
          INSERT INTO dbo.Customers
            (CustomerName, CompanyName, Address, GSTNumber, GSTType, City, State, Pincode, ContactNumber, Email, ContactPerson, Designation)
          OUTPUT INSERTED.*
          VALUES
            (@CustomerName, @CompanyName, @Address, @GSTNumber, @GSTType, @City, @State, @Pincode, @ContactNumber, @Email, @ContactPerson, @Designation)
        `);

      const customer = normalizeCustomer(result.recordset?.[0] ?? {});
      for (const contact of normalizedContacts) {
        await new sql.Request(tx)
          .input("CustomerId", sql.Int, customer.id)
          .input("ContactName", sql.NVarChar(255), contact.contactName)
          .input("Email", sql.NVarChar(255), contact.email)
          .input("Designation", sql.NVarChar(255), contact.designation)
          .input("Phone", sql.NVarChar(30), contact.phone || null)
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
        customer: attachCustomerContacts(customer, normalizedContacts),
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
    const normalizedContacts = hasContactsPayload
      ? normalizeCustomerContactsInput(contacts)
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
          sql.NVarChar(30),
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
            .input("Phone", sql.NVarChar(30), contact.phone || null)
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
        customer: attachCustomerContacts(normalizeCustomer(updated), savedContacts),
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
      .input("ClientPhone", sql.NVarChar(30), finalSnapshot.phone)
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

    const selectedCustomer = await getCustomerById(pool, resolvedCustomerId);
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
      .input("ClientPhone", sql.NVarChar(30), finalSnapshot.phone)
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
    const itemsByOrder = itemsResult.recordset.reduce((acc, row) => {
      const key = row.PurchaseOrderId;
      if (!acc[key]) acc[key] = [];
      const normalizedItem = normalizePoItem(row);
      const metrics = metricsByPoItem.get(
        buildPurchaseOrderItemMetricKey(
          row.PurchaseOrderId,
          normalizedItem.poItemId ?? normalizedItem.id
        )
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
    const items = (itemsResult.recordset ?? []).map((row) =>
      mergePurchaseOrderItemReceiveMetrics(
        normalizePoItem(row),
        metricsByPoItem.get(
          buildPurchaseOrderItemMetricKey(
            row.PurchaseOrderId,
            row.POItemId ?? row.PurchaseOrderItemId ?? row.Id ?? row.id
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

    const insertOrder = new sql.Request(tx);
    insertOrder.input("PONumber", sql.NVarChar(100), poNumValue || null);
    insertOrder.input("ProjectId", sql.Int, projectId ?? null);
    insertOrder.input("VendorId", sql.Int, vendorId ?? null);
    insertOrder.input("LocationId", sql.Int, locationId ?? null);
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
        (PONumber, ProjectId, VendorId, LocationId, BOQId, Status, OrderDate, ExpectedDate, ExpectedDeliveryDate, Notes, TermsAndConditions, Total)
      OUTPUT INSERTED.*
      VALUES (@PONumber, @ProjectId, @VendorId, @LocationId, @BOQId, @Status, @OrderDate, @ExpectedDate, @ExpectedDeliveryDate, @Notes, @TermsAndConditions, 0)
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
    const items = (itemsResult.recordset ?? []).map((row) =>
      mergePurchaseOrderItemReceiveMetrics(
        normalizePoItem(row),
        metricsByPoItem.get(
          buildPurchaseOrderItemMetricKey(
            row.PurchaseOrderId,
            row.POItemId ?? row.PurchaseOrderItemId ?? row.Id ?? row.id
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

    const finalPONumber =
      normalizeOptionalString(existingOrder.PONumber) ??
      (await generateNextPurchaseOrderNumber(tx, orderDate, id));
    const parsedOrderDate = parseDateInput(orderDate);
    const parsedExpected = parseDateInput(expectedDate);
    const parsedExpectedDelivery = parseDateInput(expectedDeliveryDate ?? expectedDate);

    const updateOrder = new sql.Request(tx);
    updateOrder.input("Id", sql.Int, id);
    updateOrder.input("PONumber", sql.NVarChar(100), finalPONumber);
    updateOrder.input("ProjectId", sql.Int, projectId ?? null);
    updateOrder.input("VendorId", sql.Int, vendorId ?? null);
    updateOrder.input("LocationId", sql.Int, locationId ?? null);
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
    const itemsResultRows = (itemsResult.recordset ?? []).map((row) =>
      mergePurchaseOrderItemReceiveMetrics(
        normalizePoItem(row),
        metricsByPoItem.get(
          buildPurchaseOrderItemMetricKey(
            row.PurchaseOrderId,
            row.POItemId ?? row.PurchaseOrderItemId ?? row.Id ?? row.id
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

    await tx.commit();
    tx = null;

    const itemsResult = await pool
      .request()
      .input("PurchaseOrderId", sql.Int, id)
      .query(`
        SELECT * FROM PurchaseOrderItems WHERE PurchaseOrderId = @PurchaseOrderId
      `);
    const metricsByPoItem = await loadPurchaseOrderItemReceiveMetricsMap(pool, [id]);
    const items = (itemsResult.recordset ?? []).map((row) =>
      mergePurchaseOrderItemReceiveMetrics(
        normalizePoItem(row),
        metricsByPoItem.get(
          buildPurchaseOrderItemMetricKey(
            row.PurchaseOrderId,
            row.POItemId ?? row.PurchaseOrderItemId ?? row.Id ?? row.id
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
      withSqlLockTimeout(
        hasPoFilter
          ? `SELECT * FROM dbo.ReceiveGoods WHERE PurchaseOrderId = @PurchaseOrderId ORDER BY ${receivePk} DESC`
          : `SELECT * FROM dbo.ReceiveGoods ORDER BY ${receivePk} DESC`
      )
    );

    const itemsResult = await itemsReq.query(
      withSqlLockTimeout(
        hasPoFilter
          ? `SELECT * FROM dbo.ReceiveGoodsItems WHERE PurchaseOrderId = @PurchaseOrderId`
          : `SELECT * FROM dbo.ReceiveGoodsItems`
      )
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
    upsertReq.input("BillTo", sql.NVarChar(sql.MAX), normalizeOptionalString(billTo) ?? null);
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
        (PurchaseOrderId, ProjectId, VendorId, LocationId, ReceivedDate, ReceivedBy, InvoiceNumber, InvoiceDate, BillTo, ShipTo, ShowProjectDetails, Notes, TaxMode, Status, BOQId)
      OUTPUT INSERTED.*
      VALUES
        (@PurchaseOrderId, @ProjectId, @VendorId, @LocationId, @ReceivedDate, @ReceivedBy, @InvoiceNumber, @InvoiceDate, @BillTo, @ShipTo, @ShowProjectDetails, @Notes, @TaxMode, @Status, @BOQId)
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
    updateReq.input("BillTo", sql.NVarChar(sql.MAX), normalizeOptionalString(billTo) ?? null);
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
          (BOQId, ItemName, Description, SerialNumber, Unit, HSN, GST, Quantity, Rate, ConsumedQty, AvailableQty, Notes)
        VALUES
          (@BOQId, @ItemName, @Description, @SerialNumber, @Unit, @HSN, @GST, @Quantity, @Rate, @ConsumedQty, @AvailableQty, @Notes)
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
    const consumedTotals = await loadBoqConsumedTotals(tx, [
      ...retainedItemIds,
      ...removedItemIds,
    ]);

    for (const row of removedItemRows) {
      const lineItemId = toNullableInt(row.LineItemId);
      const consumedQty = consumedTotals.get(lineItemId) ?? 0;
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
        if (qty < consumedQty) {
          const error = new Error(
            `Quantity for ${item.name || existingRow.ItemName || "a BOQ item"} cannot be lower than the consumed quantity (${consumedQty}).`
          );
          error.statusCode = 400;
          throw error;
        }

        await new sql.Request(tx)
          .input("LineItemId", sql.Int, item.id)
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
            SET ItemName = @ItemName,
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
      const insertResult = await insertItem.query(`
        INSERT INTO dbo.BOQLineItems
          (BOQId, ItemName, Description, SerialNumber, Unit, HSN, GST, Quantity, Rate, ConsumedQty, AvailableQty, Notes)
        OUTPUT INSERTED.LineItemId
        VALUES
          (@BOQId, @ItemName, @Description, @SerialNumber, @Unit, @HSN, @GST, @Quantity, @Rate, @ConsumedQty, @AvailableQty, @Notes)
      `);
      const insertedItemId = toNullableInt(insertResult.recordset?.[0]?.LineItemId);
      if (insertedItemId !== null) {
        affectedBoqItemIds.push(insertedItemId);
      }
    }

    if (removedItemIds.length) {
      await detachPurchaseOrderItemsFromBoq(tx, removedItemIds);

      const deleteItems = new sql.Request(tx);
      const removedInClause = buildPurchaseOrderItemInClause(
        deleteItems,
        removedItemIds,
        "RemovedLineItemId"
      );
      await deleteItems.query(`
        DELETE FROM dbo.BOQLineItems
        WHERE LineItemId IN (${removedInClause})
      `);
    }

    await refreshBoqAvailability(tx, affectedBoqItemIds);
    const syncedPurchaseOrderIds = await syncPurchaseOrderItemsFromBoq(
      tx,
      affectedBoqItemIds
    );
    await refreshPurchaseOrdersDerivedData(tx, syncedPurchaseOrderIds);

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
    await detachPurchaseOrderItemsFromBoq(tx, existingItemIds);

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

app.get("/api/delivery-challans/:id", async (req, res) => {
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
        FROM dbo.Consumption
        WHERE DeliveryChallanId = @DeliveryChallanId
          OR (
            @DeliveryChallanRef IS NOT NULL
            AND LTRIM(RTRIM(@DeliveryChallanRef)) <> ''
            AND LOWER(LTRIM(RTRIM(DeliveryChallanRef))) = LOWER(LTRIM(RTRIM(@DeliveryChallanRef)))
          )
        ORDER BY ${toIdentifier(consumptionHeaderPk)} DESC
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

  if (!safeDcNumber) {
    return res.status(400).json({ ok: false, error: "dcNumber is required" });
  }
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
  if (Number.isNaN(parsedIssueDate)) {
    return res.status(400).json({ ok: false, error: "Invalid issueDate" });
  }

  const normalizedItems = (Array.isArray(items) ? items : [])
    .map((item) => {
      const name = String(item.name ?? item.Item ?? "").trim();
      const quantity = Number(item.quantity ?? item.Quantity ?? 0) || 0;
      const rate = Number(item.rate ?? item.Rate ?? 0) || 0;
      return {
        receiveGoodsItemId: toNullableInt(
          item.receiveGoodsItemId ?? item.ReceiveGoodsItemId
        ),
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

    const destination = await resolveDeliveryChallanDestination(tx, {
      toLocationId: safeToLocationId,
      toLocation: safeToLocation,
    });
    const resolvedReceiveGoodsId = await validateDeliveryChallanAgainstReceivedGoods(tx, {
      deliveryChallanId: null,
      receiveGoodsId: safeReceiveGoodsId,
      receiveGoodsIds: safeReceiveGoodsIds,
      projectId: safeProjectId,
      items: normalizedItems,
    });

    const insertHeaderReq = new sql.Request(tx);
    insertHeaderReq.input("DCNumber", sql.NVarChar(100), safeDcNumber);
    insertHeaderReq.input("ProjectId", sql.Int, safeProjectId);
    insertHeaderReq.input("ReceiveGoodsId", sql.Int, resolvedReceiveGoodsId);
    insertHeaderReq.input("FromLocationId", sql.Int, safeFromLocationId);
    insertHeaderReq.input("ToLocationId", sql.Int, destination.toLocationId);
    insertHeaderReq.input("ToLocation", sql.NVarChar(200), destination.toLocation);
    insertHeaderReq.input("VehicleNumber", sql.NVarChar(50), safeVehicleNumber);
    insertHeaderReq.input("EWayBillNumber", sql.NVarChar(100), safeEWayBillNumber);
    insertHeaderReq.input("IssueDate", sql.Date, parsedIssueDate ?? null);
    insertHeaderReq.input("Status", sql.NVarChar(50), safeStatus);
    insertHeaderReq.input("Notes", sql.NVarChar(sql.MAX), safeNotes);

    const headerResult = await insertHeaderReq.query(`
      INSERT INTO dbo.DeliveryChallan
        (DCNumber, ProjectId, ReceiveGoodsId, FromLocationId, ToLocationId, ToLocation, VehicleNumber, EWayBillNumber, IssueDate, Status, Notes)
      OUTPUT INSERTED.*
      VALUES
        (@DCNumber, @ProjectId, @ReceiveGoodsId, @FromLocationId, @ToLocationId, @ToLocation, @VehicleNumber, @EWayBillNumber, @IssueDate, @Status, @Notes)
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
      insertItemReq.input("Notes", sql.NVarChar(500), item.notes);
      await insertItemReq.query(`
        INSERT INTO dbo.DeliveryChallanItems
          (${fkCol}, ReceiveGoodsItemId, PurchaseOrderItemId, ItemId, ItemName, Description, Unit, HSN, GST, Quantity, Rate, Notes)
        VALUES
          (@DeliveryChallanId, @ReceiveGoodsItemId, @PurchaseOrderItemId, @ItemId, @ItemName, @Description, @Unit, @HSN, @GST, @Quantity, @Rate, @Notes)
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
    return res.status(error?.statusCode ?? 500).json({
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

  if (!safeDcNumber) {
    return res.status(400).json({ ok: false, error: "dcNumber is required" });
  }
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
  if (Number.isNaN(parsedIssueDate)) {
    return res.status(400).json({ ok: false, error: "Invalid issueDate" });
  }

  const normalizedItems = (Array.isArray(items) ? items : [])
    .map((item) => {
      const name = String(item.name ?? item.Item ?? "").trim();
      const quantity = Number(item.quantity ?? item.Quantity ?? 0) || 0;
      const rate = Number(item.rate ?? item.Rate ?? 0) || 0;
      return {
        receiveGoodsItemId: toNullableInt(
          item.receiveGoodsItemId ?? item.ReceiveGoodsItemId
        ),
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

    const destination = await resolveDeliveryChallanDestination(tx, {
      toLocationId: safeToLocationId,
      toLocation: safeToLocation,
    });
    const resolvedReceiveGoodsId = await validateDeliveryChallanAgainstReceivedGoods(tx, {
      deliveryChallanId: id,
      receiveGoodsId: safeReceiveGoodsId,
      receiveGoodsIds: safeReceiveGoodsIds,
      projectId: safeProjectId,
      items: normalizedItems,
    });

    const updateHeaderReq = new sql.Request(tx);
    updateHeaderReq.input("DeliveryChallanId", sql.BigInt, id);
    updateHeaderReq.input("DCNumber", sql.NVarChar(100), safeDcNumber);
    updateHeaderReq.input("ProjectId", sql.Int, safeProjectId);
    updateHeaderReq.input("ReceiveGoodsId", sql.Int, resolvedReceiveGoodsId);
    updateHeaderReq.input("FromLocationId", sql.Int, safeFromLocationId);
    updateHeaderReq.input("ToLocationId", sql.Int, destination.toLocationId);
    updateHeaderReq.input("ToLocation", sql.NVarChar(200), destination.toLocation);
    updateHeaderReq.input("VehicleNumber", sql.NVarChar(50), safeVehicleNumber);
    updateHeaderReq.input("EWayBillNumber", sql.NVarChar(100), safeEWayBillNumber);
    updateHeaderReq.input("IssueDate", sql.Date, parsedIssueDate ?? null);
    updateHeaderReq.input("Status", sql.NVarChar(50), safeStatus);
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
      insertItemReq.input("Notes", sql.NVarChar(500), item.notes);
      await insertItemReq.query(`
        INSERT INTO dbo.DeliveryChallanItems
          (${fkCol}, ReceiveGoodsItemId, PurchaseOrderItemId, ItemId, ItemName, Description, Unit, HSN, GST, Quantity, Rate, Notes)
        VALUES
          (@DeliveryChallanId, @ReceiveGoodsItemId, @PurchaseOrderItemId, @ItemId, @ItemName, @Description, @Unit, @HSN, @GST, @Quantity, @Rate, @Notes)
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
    return res.status(error?.statusCode ?? 500).json({
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
  const byReceiveGoodsItemId = new Map();
  const byMaterialKey = new Map();

  (Array.isArray(challanItems) ? challanItems : []).forEach((item) => {
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
    const receiveGoodsItemId = toNullableInt(
      item.receiveGoodsItemId ?? item.ReceiveGoodsItemId
    );
    let matchedSourceItem =
      receiveGoodsItemId !== null
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

app.post("/api/consumptions", async (req, res) => {
  const {
    consumptionNumber,
    projectId,
    locationId,
    receiveGoodsId = null,
    deliveryChallanId = null,
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
  const safeLocationId = toNullableInt(locationId);
  const safeReceiveGoodsId = toNullableInt(receiveGoodsId);
  const safeDeliveryChallanId = toNullableInt(deliveryChallanId);
  const safeDeliveryChallanRef = normalizeOptionalString(deliveryChallanRef) ?? null;
  const safeIssuedBy = normalizeOptionalString(issuedBy) ?? null;
  const safeStatus = normalizeOptionalString(status) ?? "Logged";
  const safeNotes = normalizeOptionalString(notes) ?? null;
  const safeCompanyAddress = normalizeOptionalString(companyAddress) ?? null;
  const safeCompanyGstin = normalizeOptionalString(companyGstin) ?? null;
  const safeCompanyPhone = normalizeOptionalString(companyPhone) ?? null;
  const safeCompanyEmail = normalizeOptionalString(companyEmail) ?? null;
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
  if (safeDeliveryChallanId === null && !safeDeliveryChallanRef) {
    return res.status(400).json({
      ok: false,
      error: "deliveryChallanId is required",
    });
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
      const receiveGoodsItemId = toNullableInt(
        item.receiveGoodsItemId ?? item.ReceiveGoodsItemId ?? item.ReceiveItemId
      );
      return {
        boqItemId,
        receiveGoodsItemId,
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
    await ensureReceiveTables();
    const pkCol = await refreshConsumptionPk();
    const fkCol = await refreshConsumptionItemsFk();
    const pool = await getPool();
    tx = pool.transaction();
    await tx.begin();

    const { challan: resolvedDeliveryChallan, challanItems } =
      await loadDeliveryChallanSourceForConsumption(tx, {
        deliveryChallanId: safeDeliveryChallanId,
        deliveryChallanRef: safeDeliveryChallanRef,
      });
    const mappedItems = mapConsumptionItemsFromDeliveryChallan(
      normalizedItems,
      challanItems
    );

    const sourceItemIds = uniqueReceiveGoodsItemIds(
      mappedItems.map((item) => item.receiveGoodsItemId ?? null)
    );
    if (sourceItemIds.length) {
      const sourceItems = await loadReceiveGoodsItemsForConsumption(tx, {
        receiveGoodsId: null,
        receiveGoodsItemIds: sourceItemIds,
      });
      const consumedTotals = await loadReceiveConsumedTotals(tx, sourceItemIds);
      const requestedQtyBySourceId = mappedItems.reduce((acc, item) => {
        const sourceId = toNullableInt(item.receiveGoodsItemId ?? null);
        if (sourceId === null) {
          return acc;
        }
        acc.set(sourceId, (acc.get(sourceId) ?? 0) + (Number(item.quantity) || 0));
        return acc;
      }, new Map());
      for (const row of sourceItems) {
        const sourceId = toNullableInt(row.id);
        const sourceQty = Number(row.receivedQty ?? 0) || 0;
        const alreadyConsumed = consumedTotals.get(sourceId) ?? 0;
        const requestedQty = requestedQtyBySourceId.get(sourceId) ?? 0;
        if (requestedQty > sourceQty - alreadyConsumed) {
          const error = new Error(
            `Quantity for ${row.name || "the linked receipt item"} cannot be greater than the available quantity (${Math.max(
              sourceQty - alreadyConsumed,
              0
            )}).`
          );
          error.statusCode = 400;
          throw error;
        }
      }
    }

    await validateConsumptionAgainstDeliveryChallan(tx, {
      deliveryChallanId: resolvedDeliveryChallan.id,
      deliveryChallanRef: resolvedDeliveryChallan.dcNumber,
      items: mappedItems,
    });

    const resolvedReceiveGoodsId =
      toNullableInt(resolvedDeliveryChallan.receiveGoodsId) ?? safeReceiveGoodsId;
    const insertHeaderReq = new sql.Request(tx);
    insertHeaderReq.input("ConsumptionNumber", sql.NVarChar(50), safeConsumptionNumber);
    insertHeaderReq.input("ProjectId", sql.Int, safeProjectId);
    insertHeaderReq.input("LocationId", sql.Int, safeLocationId);
    insertHeaderReq.input("ReceiveGoodsId", sql.Int, resolvedReceiveGoodsId);
    insertHeaderReq.input(
      "DeliveryChallanId",
      sql.Int,
      toNullableInt(resolvedDeliveryChallan.id)
    );
    insertHeaderReq.input(
      "DeliveryChallanRef",
      sql.NVarChar(100),
      normalizeOptionalString(resolvedDeliveryChallan.dcNumber) ?? null
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
        (ConsumptionNumber, ProjectId, LocationId, ReceiveGoodsId, DeliveryChallanId, DeliveryChallanRef, ConsumptionDate, IssuedBy, Status, Notes, CompanyAddress, CompanyGstin, CompanyPhone, CompanyEmail)
      OUTPUT INSERTED.*
      VALUES
        (@ConsumptionNumber, @ProjectId, @LocationId, @ReceiveGoodsId, @DeliveryChallanId, @DeliveryChallanRef, @ConsumptionDate, @IssuedBy, @Status, @Notes, @CompanyAddress, @CompanyGstin, @CompanyPhone, @CompanyEmail)
    `);

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
      insertItemReq.input(
        "ReceiveGoodsItemId",
        sql.Int,
        item.receiveGoodsItemId ?? null
      );
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
          (${fkCol}, BoqItemId, ReceiveGoodsItemId, Item, Description, Unit, HSN, GST, Quantity, Rate, Notes)
        VALUES
          (@ConsumptionId, @BoqItemId, @ReceiveGoodsItemId, @Item, @Description, @Unit, @HSN, @GST, @Quantity, @Rate, @Notes)
      `);
    }

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
    return res.status(error?.statusCode ?? 500).json({
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
    receiveGoodsId = null,
    deliveryChallanId = null,
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
  const safeLocationId = toNullableInt(locationId);
  const safeReceiveGoodsId = toNullableInt(receiveGoodsId);
  const safeDeliveryChallanId = toNullableInt(deliveryChallanId);
  const safeDeliveryChallanRef = normalizeOptionalString(deliveryChallanRef) ?? null;
  const safeIssuedBy = normalizeOptionalString(issuedBy) ?? null;
  const safeStatus = normalizeOptionalString(status) ?? "Logged";
  const safeNotes = normalizeOptionalString(notes) ?? null;
  const safeCompanyAddress = normalizeOptionalString(companyAddress) ?? null;
  const safeCompanyGstin = normalizeOptionalString(companyGstin) ?? null;
  const safeCompanyPhone = normalizeOptionalString(companyPhone) ?? null;
  const safeCompanyEmail = normalizeOptionalString(companyEmail) ?? null;
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
      const receiveGoodsItemId = toNullableInt(
        item.receiveGoodsItemId ?? item.ReceiveGoodsItemId ?? item.ReceiveItemId
      );
      return {
        boqItemId,
        receiveGoodsItemId,
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
    await ensureReceiveTables();
    const pkCol = await refreshConsumptionPk();
    const fkCol = await refreshConsumptionItemsFk();
    const pool = await getPool();
    tx = pool.transaction();
    await tx.begin();

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

    const existingItemsResult = await new sql.Request(tx)
      .input("ConsumptionId", sql.Int, id)
      .query(`
        SELECT BoqItemId, ReceiveGoodsItemId, Quantity
        FROM dbo.ConsumptionItems
        WHERE ${fkCol} = @ConsumptionId
      `);
    const existingItems = existingItemsResult.recordset ?? [];

    const requestedDeliveryChallanId =
      safeDeliveryChallanId ?? toNullableInt(currentConsumptionRow?.DeliveryChallanId);
    const requestedDeliveryChallanRef =
      safeDeliveryChallanRef ??
      normalizeOptionalString(currentConsumptionRow?.DeliveryChallanRef) ??
      null;
    if (requestedDeliveryChallanId === null && !requestedDeliveryChallanRef) {
      const error = new Error("deliveryChallanId is required");
      error.statusCode = 400;
      throw error;
    }

    const { challan: resolvedDeliveryChallan, challanItems } =
      await loadDeliveryChallanSourceForConsumption(tx, {
        deliveryChallanId: requestedDeliveryChallanId,
        deliveryChallanRef: requestedDeliveryChallanRef,
      });
    const mappedItems = mapConsumptionItemsFromDeliveryChallan(
      normalizedItems,
      challanItems
    );

    const sourceItemIds = uniqueReceiveGoodsItemIds(
      mappedItems.map((item) => item.receiveGoodsItemId ?? null)
    );
    if (sourceItemIds.length) {
      const sourceItems = await loadReceiveGoodsItemsForConsumption(tx, {
        receiveGoodsId: null,
        receiveGoodsItemIds: sourceItemIds,
      });
      const consumedTotals = await loadReceiveConsumedTotals(tx, sourceItemIds);
      const existingQtyById = existingItems.reduce((acc, row) => {
        const sourceId = toNullableInt(
          row.ReceiveGoodsItemId ?? row.receiveGoodsItemId ?? row.ReceiveItemId ?? row.BoqItemId
        );
        if (sourceId !== null) {
          acc.set(sourceId, (acc.get(sourceId) ?? 0) + (Number(row.Quantity ?? 0) || 0));
        }
        return acc;
      }, new Map());
      const requestedQtyBySourceId = mappedItems.reduce((acc, item) => {
        const sourceId = toNullableInt(item.receiveGoodsItemId ?? null);
        if (sourceId === null) {
          return acc;
        }
        acc.set(sourceId, (acc.get(sourceId) ?? 0) + (Number(item.quantity) || 0));
        return acc;
      }, new Map());

      for (const row of sourceItems) {
        const sourceId = toNullableInt(row.id);
        const sourceQty = Number(row.receivedQty ?? 0) || 0;
        const existingQty = existingQtyById.get(sourceId) ?? 0;
        const consumedOtherThanCurrent = Math.max(
          (consumedTotals.get(sourceId) ?? 0) - existingQty,
          0
        );
        const requestedQty = requestedQtyBySourceId.get(sourceId) ?? 0;
        const availableQty = Math.max(sourceQty - consumedOtherThanCurrent, 0);
        if (requestedQty > availableQty) {
          const error = new Error(
            `Quantity for ${row.name || "the linked receipt item"} cannot be greater than the available quantity (${availableQty}).`
          );
          error.statusCode = 400;
          throw error;
        }
      }
    }

    await validateConsumptionAgainstDeliveryChallan(tx, {
      deliveryChallanId: resolvedDeliveryChallan.id,
      deliveryChallanRef: resolvedDeliveryChallan.dcNumber,
      consumptionId: id,
      items: mappedItems,
    });

    const resolvedReceiveGoodsId =
      toNullableInt(resolvedDeliveryChallan.receiveGoodsId) ??
      safeReceiveGoodsId ??
      toNullableInt(currentConsumptionRow?.ReceiveGoodsId);
    const updateHeaderReq = new sql.Request(tx);
    updateHeaderReq.input("ConsumptionId", sql.Int, id);
    updateHeaderReq.input("ConsumptionNumber", sql.NVarChar(50), safeConsumptionNumber);
    updateHeaderReq.input("ProjectId", sql.Int, safeProjectId);
    updateHeaderReq.input("LocationId", sql.Int, safeLocationId);
    updateHeaderReq.input("ReceiveGoodsId", sql.Int, resolvedReceiveGoodsId);
    updateHeaderReq.input(
      "DeliveryChallanId",
      sql.Int,
      toNullableInt(resolvedDeliveryChallan.id)
    );
    updateHeaderReq.input(
      "DeliveryChallanRef",
      sql.NVarChar(100),
      normalizeOptionalString(resolvedDeliveryChallan.dcNumber) ?? null
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
          LocationId = @LocationId,
          ReceiveGoodsId = @ReceiveGoodsId,
          DeliveryChallanId = @DeliveryChallanId,
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

    for (const item of mappedItems) {
      const insertItemReq = new sql.Request(tx);
      insertItemReq.input("ConsumptionId", sql.Int, id);
      insertItemReq.input("BoqItemId", sql.Int, item.boqItemId ?? null);
      insertItemReq.input(
        "ReceiveGoodsItemId",
        sql.Int,
        item.receiveGoodsItemId ?? null
      );
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
          (${fkCol}, BoqItemId, ReceiveGoodsItemId, Item, Description, Unit, HSN, GST, Quantity, Rate, Notes)
        VALUES
          (@ConsumptionId, @BoqItemId, @ReceiveGoodsItemId, @Item, @Description, @Unit, @HSN, @GST, @Quantity, @Rate, @Notes)
      `);
    }

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
    insertHeaderReq.input("Notes", sql.NVarChar(sql.MAX), notesPayload);
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
      ensureBrandsTable(),
      ensureItemsTable(),
      ensureVendorsTable(),
      ensureCustomersTable(),
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
