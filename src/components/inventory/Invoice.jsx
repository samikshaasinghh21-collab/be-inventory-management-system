import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  BadgeIndianRupee,
  Building2,
  CheckCircle2,
  CircleDot,
  ClipboardCheck,
  Copy,
  Download,
  FileCheck2,
  FileText,
  MapPin,
  PackageCheck,
  Paperclip,
  Plus,
  Printer,
  RefreshCw,
  Save,
  Search,
  Send,
  ShieldCheck,
  Trash2,
  UploadCloud,
  WifiOff,
  XCircle,
} from "lucide-react";
import DateInput from "../common/DateInput";
import { parseDateValue } from "../../utils/dateFormat";
import { fetchPurchaseOrders } from "../../services/purchaseOrdersApi";
import { fetchReceiveGoods } from "../../services/receiveGoodsApi";
import { fetchVendors } from "../../services/vendorsApi";
import {
  formatInrCurrency,
  roundCurrencyValue,
} from "../../utils/formatters";

const inputClass =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-50 disabled:text-slate-400";

const compactInputClass =
  "w-full rounded-md border border-slate-200 bg-white px-2.5 py-2 text-sm text-slate-800 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100";

const statuses = ["Draft", "Submitted", "Approved", "Rejected"];

const statusStyles = {
  Draft: "border-blue-200 bg-blue-50 text-blue-700",
  Submitted: "border-amber-200 bg-amber-50 text-amber-700",
  Approved: "border-green-200 bg-green-50 text-green-700",
  Rejected: "border-red-200 bg-red-50 text-red-700",
};

const paymentTerms = ["Net 30 Days", "Net 45 Days", "Due on Receipt", "Advance Paid"];
const paymentStatuses = ["Unpaid", "Partially Paid", "Paid"];
const paymentModes = ["Bank Transfer", "Cheque", "UPI", "Cash"];

const defaultBuyer = {
  companyName: "Bangalore Electronics",
  gstNumber: "29AABCB1234C1Z5",
  address: "Bengaluru, Karnataka",
  state: "Karnataka",
  stateCode: "29",
  pincode: "560001",
  contactPerson: "Accounts Team",
  email: "accounts@bangaloreelectronics.in",
};

const defaultPayment = {
  status: "Unpaid",
  mode: "Bank Transfer",
  bankName: "",
  accountNumber: "",
  ifsc: "",
  paidAmount: 0,
};

const uploadedFiles = [
  { id: "supplier-invoice", name: "Supplier Invoice.pdf", size: "1.2 MB", type: "PDF" },
  { id: "delivery-challan", name: "Delivery Challan.pdf", size: "2 MB", type: "PDF" },
];

const workflowSteps = [
  { id: "draft", title: "Draft Created", person: "Inventory Team" },
  { id: "submitted", title: "Submitted", person: "Accounts Team" },
  { id: "approved", title: "Approved", person: "Approver" },
  { id: "final", title: "Final Clearance", person: "Finance" },
];

const toNumber = (value) => {
  if (value === null || value === undefined || value === "") {
    return 0;
  }
  const parsed = Number(String(value).replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
};

const toIsoDate = (value) => {
  if (!value) {
    return "";
  }
  const direct = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value));
  if (direct) {
    return `${direct[1]}-${direct[2]}-${direct[3]}`;
  }
  const date = parseDateValue(value);
  if (!date || Number.isNaN(date.getTime())) {
    return "";
  }
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
};

const addDays = (isoDate, days) => {
  if (!isoDate) {
    return "";
  }
  const date = new Date(`${isoDate}T00:00:00`);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  date.setDate(date.getDate() + days);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const formatDate = (value) => {
  const iso = toIsoDate(value);
  if (!iso) {
    return "-";
  }
  const [year, month, day] = iso.split("-");
  return `${day}/${month}/${year}`;
};

const normalizeKey = (value) =>
  value === null || value === undefined ? "" : String(value);

const isValidGstin = (value) =>
  /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/i.test(
    String(value ?? "").trim()
  );

const stateCodeFromGstin = (value) => {
  const gstin = String(value ?? "").trim();
  return /^\d{2}/.test(gstin) ? gstin.slice(0, 2) : "";
};

const createBlankItem = (overrides = {}) => ({
  id: `item-${Date.now()}-${Math.random().toString(16).slice(2)}`,
  sourceItemId: null,
  poItemId: null,
  productCode: "",
  productName: "",
  description: "",
  hsn: "",
  uom: "PCS",
  orderedQty: 0,
  receivedQty: 0,
  unitPrice: 0,
  discount: 0,
  tax: 18,
  batchNo: "",
  expiryDate: "",
  ...overrides,
});

const findPoItem = (receiptItem, purchaseOrder) => {
  if (!purchaseOrder?.items?.length) {
    return null;
  }

  return (
    purchaseOrder.items.find(
      (item) =>
        normalizeKey(item.poItemId) === normalizeKey(receiptItem.poItemId) ||
        normalizeKey(item.id) === normalizeKey(receiptItem.poItemId) ||
        normalizeKey(item.itemId) === normalizeKey(receiptItem.itemId)
    ) ?? null
  );
};

const mapReceiptItemToInvoiceItem = (receiptItem = {}, index, purchaseOrder) => {
  const poItem = findPoItem(receiptItem, purchaseOrder);
  const gstRate =
    receiptItem.gst ||
    receiptItem.taxPercentage ||
    poItem?.gst ||
    poItem?.taxPercentage ||
    18;

  return createBlankItem({
    id: `receipt-${receiptItem.id ?? receiptItem.receiveGoodsItemId ?? index}`,
    sourceItemId: receiptItem.id ?? receiptItem.receiveGoodsItemId ?? null,
    poItemId: receiptItem.poItemId ?? poItem?.poItemId ?? null,
    productCode:
      receiptItem.itemId || poItem?.itemId ? String(receiptItem.itemId ?? poItem?.itemId) : "",
    productName: receiptItem.name || poItem?.name || "",
    description: receiptItem.description || poItem?.description || "",
    hsn: receiptItem.hsn || poItem?.hsn || "",
    uom: receiptItem.unit || poItem?.unit || "PCS",
    orderedQty: toNumber(receiptItem.orderedQty || poItem?.orderedQty),
    receivedQty: toNumber(
      receiptItem.receiptReceivedQty ||
        receiptItem.receivedQty ||
        receiptItem.totalReceivedQty ||
        poItem?.receivedQty
    ),
    unitPrice: toNumber(receiptItem.unitPrice || poItem?.unitPrice),
    tax: toNumber(gstRate),
    batchNo: receiptItem.batchNo || receiptItem.batchName || "",
    expiryDate: toIsoDate(receiptItem.expiryDate || receiptItem.ExpDt),
  });
};

const calculateLine = (item, taxMode) => {
  const qty = toNumber(item.receivedQty);
  const unitPrice = toNumber(item.unitPrice);
  const discountPercent = toNumber(item.discount);
  const taxPercent = toNumber(item.tax);
  const gross = qty * unitPrice;
  const discountAmount = (gross * discountPercent) / 100;
  const taxable = Math.max(gross - discountAmount, 0);
  const taxAmount = (taxable * taxPercent) / 100;
  const isInterState = taxMode === "inter";
  const cgstAmount = isInterState ? 0 : taxAmount / 2;
  const sgstAmount = isInterState ? 0 : taxAmount / 2;
  const igstAmount = isInterState ? taxAmount : 0;

  return {
    gross: roundCurrencyValue(gross),
    discountAmount: roundCurrencyValue(discountAmount),
    taxable: roundCurrencyValue(taxable),
    cgstAmount: roundCurrencyValue(cgstAmount),
    sgstAmount: roundCurrencyValue(sgstAmount),
    igstAmount: roundCurrencyValue(igstAmount),
    taxAmount: roundCurrencyValue(taxAmount),
    lineTotal: roundCurrencyValue(taxable + taxAmount),
  };
};

const mapVendorToSupplier = (vendor = {}) => {
  const primaryContact = Array.isArray(vendor.contacts) ? vendor.contacts[0] : null;
  return {
    id: vendor.id ?? "",
    name: vendor.name ?? "",
    contactPerson: primaryContact?.contactName ?? vendor.contactPerson ?? "",
    phone: primaryContact?.phone ?? vendor.phone ?? "",
    email: primaryContact?.email ?? vendor.email ?? "",
    gstNumber: vendor.gstNumber ?? vendor.gst ?? "",
    address: vendor.address ?? "",
    city: vendor.city ?? "",
    state: vendor.state ?? "",
    pincode: vendor.pincode ?? "",
  };
};

const emptySupplier = mapVendorToSupplier();

const buildReceiptLabel = (receipt, purchaseOrder) => {
  if (!receipt) {
    return "Select received goods";
  }
  const receiptId = receipt.receiveGoodsId ?? receipt.id ?? "";
  const poText = purchaseOrder?.poNumber ? ` | ${purchaseOrder.poNumber}` : "";
  const invoiceText = receipt.invoiceNumber ? ` | INV ${receipt.invoiceNumber}` : "";
  return `RG-${receiptId}${poText}${invoiceText}`;
};

const Card = ({ children, className = "" }) => (
  <section className={`rounded-lg border border-slate-200 bg-white shadow-sm ${className}`}>
    {children}
  </section>
);

const SectionTitle = ({ icon, title, children, tone = "blue", action = null }) => {
  const IconComponent = icon;
  const toneClass =
    tone === "green"
      ? "bg-green-50 text-green-700"
      : tone === "amber"
      ? "bg-amber-50 text-amber-700"
      : tone === "red"
      ? "bg-red-50 text-red-700"
      : "bg-blue-50 text-blue-700";

  return (
    <div className="mb-4 flex items-start justify-between gap-3">
      <div className="flex min-w-0 items-center gap-3">
        <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${toneClass}`}>
          <IconComponent className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-slate-950">{title}</h2>
          {children ? <p className="mt-1 text-xs text-slate-500">{children}</p> : null}
        </div>
      </div>
      {action}
    </div>
  );
};

const Field = ({ label, required = false, hint = "", children }) => (
  <label className="block">
    <span className="mb-1.5 block text-xs font-semibold text-slate-600">
      {label}
      {required ? <span className="text-red-500"> *</span> : null}
    </span>
    {children}
    {hint ? <span className="mt-1 block text-xs text-slate-400">{hint}</span> : null}
  </label>
);

const TextInput = ({ label, required = false, hint = "", ...props }) => (
  <Field label={label} required={required} hint={hint}>
    <input className={inputClass} {...props} />
  </Field>
);

const SelectInput = ({ label, required = false, hint = "", children, ...props }) => (
  <Field label={label} required={required} hint={hint}>
    <select className={inputClass} {...props}>
      {children}
    </select>
  </Field>
);

const ActionButton = ({
  children,
  icon: Icon,
  variant = "secondary",
  className = "",
  ...props
}) => {
  const variants = {
    primary: "border-blue-600 bg-blue-600 text-white hover:bg-blue-700",
    success: "border-green-600 bg-green-600 text-white hover:bg-green-700",
    danger: "border-red-200 bg-red-50 text-red-700 hover:bg-red-100",
    secondary: "border-slate-200 bg-white text-slate-700 hover:bg-slate-50",
    ghost: "border-transparent bg-transparent text-slate-600 hover:bg-slate-100 shadow-none",
  };

  return (
    <button
      type="button"
      className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border px-3.5 py-2 text-sm font-semibold shadow-sm transition disabled:cursor-not-allowed disabled:opacity-50 ${variants[variant]} ${className}`}
      {...props}
    >
      {Icon ? <Icon className="h-4 w-4" /> : null}
      <span>{children}</span>
    </button>
  );
};

const SummaryTile = ({ label, value, icon, tone = "blue" }) => {
  const IconComponent = icon;
  const toneClass =
    tone === "green"
      ? "bg-green-50 text-green-700"
      : tone === "amber"
      ? "bg-amber-50 text-amber-700"
      : "bg-blue-50 text-blue-700";

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium text-slate-500">{label}</p>
          <p className="mt-1 truncate text-lg font-bold text-slate-950">{value}</p>
        </div>
        <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-lg ${toneClass}`}>
          <IconComponent className="h-5 w-5" />
        </span>
      </div>
    </div>
  );
};

const TaxRow = ({ label, value, strong = false, danger = false }) => (
  <div
    className={`flex items-center justify-between gap-4 text-sm ${
      strong ? "font-bold text-slate-950" : "text-slate-600"
    }`}
  >
    <span>{label}</span>
    <span className={danger ? "font-semibold text-red-600" : "text-right text-slate-900"}>
      {value}
    </span>
  </div>
);

const StatusBadge = ({ status }) => (
  <span
    className={`inline-flex rounded-full border px-3 py-1 text-xs font-bold ${
      statusStyles[status] ?? statusStyles.Draft
    }`}
  >
    {status}
  </span>
);

const ValidationPanel = ({ issues, showValidation }) => {
  const visibleIssues = showValidation ? issues : issues.filter((issue) => issue.severity === "error");
  const errorCount = issues.filter((issue) => issue.severity === "error").length;

  return (
    <Card className="p-5">
      <SectionTitle
        icon={errorCount ? AlertTriangle : CheckCircle2}
        title="Validation"
        tone={errorCount ? "red" : "green"}
      >
        {errorCount ? `${errorCount} item needs attention` : "Invoice data is ready"}
      </SectionTitle>
      {visibleIssues.length ? (
        <div className="space-y-2">
          {visibleIssues.map((issue) => (
            <div
              key={issue.id}
              className={`rounded-lg border px-3 py-2 text-sm ${
                issue.severity === "error"
                  ? "border-red-100 bg-red-50 text-red-700"
                  : "border-amber-100 bg-amber-50 text-amber-700"
              }`}
            >
              {issue.message}
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-lg border border-green-100 bg-green-50 px-3 py-2 text-sm text-green-700">
          Required invoice, GST, quantity, and tax details look complete.
        </div>
      )}
    </Card>
  );
};

const Invoice = () => {
  const [status, setStatus] = useState("Draft");
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [receipts, setReceipts] = useState([]);
  const [purchaseOrders, setPurchaseOrders] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [selectedReceiptId, setSelectedReceiptId] = useState("");
  const [supplierForm, setSupplierForm] = useState(emptySupplier);
  const [buyerForm, setBuyerForm] = useState(defaultBuyer);
  const [invoiceForm, setInvoiceForm] = useState({
    invoiceNumber: "",
    invoiceDate: "",
    dueDate: "",
    poReference: "",
    paymentTerms: "Net 30 Days",
    currency: "INR - Indian Rupee",
    taxMode: "intra",
    placeOfSupply: "Karnataka",
    reverseCharge: "No",
    irn: "",
    qrReference: "",
  });
  const [items, setItems] = useState([]);
  const [productSearch, setProductSearch] = useState("");
  const [files, setFiles] = useState(uploadedFiles);
  const [notes, setNotes] = useState({
    internal: "",
    supplier: "",
    delivery: "",
  });
  const [payment, setPayment] = useState(defaultPayment);
  const [showValidation, setShowValidation] = useState(false);
  const [actionNotice, setActionNotice] = useState("");

  const loadRecords = async () => {
    setIsLoading(true);
    setLoadError("");
    try {
      const [receiptList, purchaseOrderList, vendorList] = await Promise.all([
        fetchReceiveGoods(),
        fetchPurchaseOrders(),
        fetchVendors(),
      ]);
      setReceipts(receiptList);
      setPurchaseOrders(purchaseOrderList);
      setVendors(vendorList);
      setSelectedReceiptId((current) => current || normalizeKey(receiptList[0]?.receiveGoodsId ?? receiptList[0]?.id));
    } catch (error) {
      setLoadError(
        error?.response?.data?.error ||
          error?.message ||
          "Failed to load invoice source data."
      );
      setReceipts([]);
      setPurchaseOrders([]);
      setVendors([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadRecords();
  }, []);

  const purchaseOrderMap = useMemo(
    () =>
      purchaseOrders.reduce((acc, order) => {
        acc.set(normalizeKey(order.id), order);
        return acc;
      }, new Map()),
    [purchaseOrders]
  );

  const vendorMap = useMemo(
    () =>
      vendors.reduce((acc, vendor) => {
        acc.set(normalizeKey(vendor.id), vendor);
        return acc;
      }, new Map()),
    [vendors]
  );

  const selectedReceipt = useMemo(
    () =>
      receipts.find(
        (receipt) =>
          normalizeKey(receipt.receiveGoodsId ?? receipt.id) === normalizeKey(selectedReceiptId)
      ) ?? null,
    [receipts, selectedReceiptId]
  );

  const selectedPurchaseOrder = useMemo(
    () => purchaseOrderMap.get(normalizeKey(selectedReceipt?.purchaseOrderId)) ?? null,
    [purchaseOrderMap, selectedReceipt]
  );

  const selectedVendor = useMemo(
    () => vendorMap.get(normalizeKey(selectedReceipt?.vendorId)) ?? null,
    [vendorMap, selectedReceipt]
  );

  useEffect(() => {
    if (!selectedReceipt) {
      setSupplierForm(emptySupplier);
      setItems([]);
      setInvoiceForm((current) => ({
        ...current,
        invoiceNumber: "",
        invoiceDate: "",
        dueDate: "",
        poReference: "",
      }));
      return;
    }

    const invoiceDate = toIsoDate(selectedReceipt.invoiceDate || selectedReceipt.receivedDate);
    const poReference =
      selectedPurchaseOrder?.poNumber ||
      (selectedReceipt.purchaseOrderId ? `PO-${selectedReceipt.purchaseOrderId}` : "");
    const supplier = selectedVendor ? mapVendorToSupplier(selectedVendor) : emptySupplier;
    const taxMode = selectedReceipt.taxMode === "inter" ? "inter" : "intra";
    const mappedItems = Array.isArray(selectedReceipt.items)
      ? selectedReceipt.items.map((item, index) =>
          mapReceiptItemToInvoiceItem(item, index, selectedPurchaseOrder)
        )
      : [];

    setSupplierForm(supplier);
    setInvoiceForm((current) => ({
      ...current,
      invoiceNumber: selectedReceipt.invoiceNumber || current.invoiceNumber || "",
      invoiceDate,
      dueDate: invoiceDate ? addDays(invoiceDate, 30) : "",
      poReference,
      taxMode,
      placeOfSupply: supplier.state || current.placeOfSupply || defaultBuyer.state,
      irn: "",
      qrReference: "",
    }));
    setBuyerForm((current) => ({
      ...current,
      stateCode: stateCodeFromGstin(current.gstNumber) || current.stateCode,
    }));
    setItems(mappedItems);
    setNotes((current) => ({
      ...current,
      delivery: selectedReceipt.shipTo || selectedReceipt.billTo || current.delivery,
      internal: selectedReceipt.notes || current.internal,
    }));
    setStatus("Draft");
    setShowValidation(false);
    setActionNotice("");
  }, [selectedReceipt, selectedPurchaseOrder, selectedVendor]);

  const filteredItems = useMemo(() => {
    const query = productSearch.trim().toLowerCase();
    if (!query) {
      return items;
    }
    return items.filter((item) =>
      [
        item.productCode,
        item.productName,
        item.description,
        item.hsn,
        item.batchNo,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(query)
    );
  }, [items, productSearch]);

  const itemIssuesById = useMemo(() => {
    const map = new Map();
    items.forEach((item, index) => {
      const issues = [];
      const label = item.productName || item.productCode || `Row ${index + 1}`;
      const orderedQty = toNumber(item.orderedQty);
      const receivedQty = toNumber(item.receivedQty);
      const unitPrice = toNumber(item.unitPrice);
      const tax = toNumber(item.tax);

      if (!String(item.hsn || "").trim()) {
        issues.push(`${label}: HSN is required.`);
      }
      if (receivedQty <= 0) {
        issues.push(`${label}: received quantity must be greater than zero.`);
      }
      if (orderedQty > 0 && receivedQty > orderedQty) {
        issues.push(`${label}: received quantity cannot exceed ordered quantity.`);
      }
      if (unitPrice < 0) {
        issues.push(`${label}: unit price cannot be negative.`);
      }
      if (tax < 0) {
        issues.push(`${label}: GST rate cannot be negative.`);
      }

      if (issues.length) {
        map.set(item.id, issues);
      }
    });
    return map;
  }, [items]);

  const totals = useMemo(() => {
    const summary = items.reduce(
      (acc, item) => {
        const line = calculateLine(item, invoiceForm.taxMode);
        acc.totalItems += item.productName || item.productCode ? 1 : 0;
        acc.totalQuantity += toNumber(item.receivedQty);
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
    return {
      ...summary,
      roundOff: roundCurrencyValue(roundedGrandTotal - summary.grandTotal),
      grandTotal: roundedGrandTotal,
      dueAmount: Math.max(roundedGrandTotal - toNumber(payment.paidAmount), 0),
    };
  }, [items, invoiceForm.taxMode, payment.paidAmount]);

  const validationIssues = useMemo(() => {
    const issues = [];

    if (!selectedReceipt) {
      issues.push({
        id: "receipt",
        severity: "error",
        message: "Select a received-goods record before submitting the invoice.",
      });
    }
    if (!invoiceForm.invoiceNumber.trim()) {
      issues.push({
        id: "invoice-number",
        severity: "error",
        message: "Invoice number is required.",
      });
    }
    if (!invoiceForm.invoiceDate) {
      issues.push({
        id: "invoice-date",
        severity: "error",
        message: "Invoice date is required.",
      });
    }
    if (!invoiceForm.poReference.trim()) {
      issues.push({
        id: "po-reference",
        severity: "error",
        message: "PO reference is required for invoice acceptance.",
      });
    }
    if (!isValidGstin(supplierForm.gstNumber)) {
      issues.push({
        id: "supplier-gstin",
        severity: "error",
        message: "Supplier GSTIN must be a valid 15-character GST number.",
      });
    }
    if (!isValidGstin(buyerForm.gstNumber)) {
      issues.push({
        id: "buyer-gstin",
        severity: "error",
        message: "Buyer GSTIN must be a valid 15-character GST number.",
      });
    }
    if (
      invoiceForm.invoiceDate &&
      invoiceForm.dueDate &&
      new Date(invoiceForm.dueDate) < new Date(invoiceForm.invoiceDate)
    ) {
      issues.push({
        id: "due-date",
        severity: "error",
        message: "Due date cannot be earlier than invoice date.",
      });
    }
    if (!items.length) {
      issues.push({
        id: "items",
        severity: "error",
        message: "At least one invoice item is required.",
      });
    }

    itemIssuesById.forEach((rowIssues, itemId) => {
      rowIssues.forEach((message, index) => {
        issues.push({
          id: `${itemId}-${index}`,
          severity: "error",
          message,
        });
      });
    });

    if (!invoiceForm.irn.trim()) {
      issues.push({
        id: "irn",
        severity: "warning",
        message: "IRN is empty. Keep this as a placeholder until IRP integration is added.",
      });
    }
    if (!invoiceForm.qrReference.trim()) {
      issues.push({
        id: "qr",
        severity: "warning",
        message: "QR reference is empty. Keep this as a placeholder until PDF/IRP output is added.",
      });
    }

    return issues;
  }, [
    buyerForm.gstNumber,
    invoiceForm,
    itemIssuesById,
    items.length,
    selectedReceipt,
    supplierForm.gstNumber,
  ]);

  const criticalIssueCount = validationIssues.filter(
    (issue) => issue.severity === "error"
  ).length;

  const inventoryImpactItems = items
    .filter((item) => item.productName || item.productCode)
    .slice(0, 5);

  const updateSupplier = (field, value) => {
    setSupplierForm((current) => ({ ...current, [field]: value }));
  };

  const updateBuyer = (field, value) => {
    setBuyerForm((current) => ({
      ...current,
      [field]: value,
      ...(field === "gstNumber"
        ? { stateCode: stateCodeFromGstin(value) || current.stateCode }
        : {}),
    }));
  };

  const updateInvoiceForm = (field, value) => {
    setInvoiceForm((current) => ({ ...current, [field]: value }));
  };

  const updatePayment = (field, value) => {
    setPayment((current) => ({ ...current, [field]: value }));
  };

  const updateItem = (id, field, value) => {
    setItems((current) =>
      current.map((item) => (item.id === id ? { ...item, [field]: value } : item))
    );
  };

  const addRow = () => {
    setItems((current) => [...current, createBlankItem()]);
  };

  const duplicateRow = (id) => {
    const source = items.find((item) => item.id === id) || items[0];
    if (!source) {
      addRow();
      return;
    }
    setItems((current) => [
      ...current,
      createBlankItem({
        ...source,
        id: `item-${Date.now()}-${Math.random().toString(16).slice(2)}`,
        productCode: source.productCode ? `${source.productCode}-COPY` : "",
      }),
    ]);
  };

  const deleteRow = (id) => {
    setItems((current) => current.filter((item) => item.id !== id));
  };

  const reloadReceiptItems = () => {
    if (!selectedReceipt) {
      return;
    }
    setItems(
      (selectedReceipt.items ?? []).map((item, index) =>
        mapReceiptItemToInvoiceItem(item, index, selectedPurchaseOrder)
      )
    );
  };

  const removeFile = (id) => {
    setFiles((current) => current.filter((file) => file.id !== id));
  };

  const addDummyFile = () => {
    setFiles((current) => [
      ...current,
      {
        id: `file-${Date.now()}`,
        name: "Material Test Certificate.pdf",
        size: "420 KB",
        type: "PDF",
      },
    ]);
  };

  const changeStatus = (nextStatus) => {
    setShowValidation(true);
    if (["Submitted", "Approved"].includes(nextStatus) && criticalIssueCount > 0) {
      setActionNotice("Fix validation errors before moving this invoice forward.");
      return;
    }
    setStatus(nextStatus);
    setActionNotice(
      nextStatus === "Draft"
        ? "Draft saved in this page only."
        : `${nextStatus} status applied in this page only.`
    );
  };

  const receiptOptions = receipts.map((receipt) => {
    const po = purchaseOrderMap.get(normalizeKey(receipt.purchaseOrderId));
    return {
      id: normalizeKey(receipt.receiveGoodsId ?? receipt.id),
      label: buildReceiptLabel(receipt, po),
    };
  });

  const activityTimeline = [
    {
      id: "loaded",
      title: selectedReceipt ? "Receipt selected" : "Waiting for receipt",
      by: "System",
      time: selectedReceipt ? formatDate(selectedReceipt.receivedDate) : "-",
    },
    {
      id: "items",
      title: `${items.length} invoice item${items.length === 1 ? "" : "s"} prepared`,
      by: "Invoice page",
      time: formatDate(invoiceForm.invoiceDate),
    },
    {
      id: "status",
      title: `Status: ${status}`,
      by: "Current session",
      time: "UI only",
    },
  ];

  return (
    <div id="invoice-print-area" className="min-h-screen bg-slate-50 pb-28 text-slate-900">
      <div className="space-y-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <nav className="flex flex-wrap items-center gap-2 text-sm font-medium text-slate-500">
            <span>Inventory</span>
            <span>/</span>
            <span>Invoice</span>
            <span>/</span>
            <span className="text-slate-950">Receipt-first invoice</span>
          </nav>
          <div className="flex flex-wrap items-center gap-2">
            {actionNotice ? (
              <span className="inline-flex items-center gap-2 rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-sm font-semibold text-blue-700">
                <CircleDot className="h-4 w-4" />
                {actionNotice}
              </span>
            ) : null}
            <select
              value={status}
              onChange={(event) => changeStatus(event.target.value)}
              className={`${inputClass} w-40`}
              aria-label="Invoice status"
            >
              {statuses.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_21rem]">
          <Card className="p-5">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-3">
                  <input
                    value={invoiceForm.invoiceNumber}
                    onChange={(event) => updateInvoiceForm("invoiceNumber", event.target.value)}
                    className="min-w-0 max-w-full rounded-lg border border-transparent bg-transparent px-0 text-2xl font-bold text-slate-950 outline-none transition focus:border-blue-200 focus:bg-blue-50 focus:px-3"
                    placeholder="Invoice number"
                    aria-label="Invoice number"
                  />
                  <StatusBadge status={status} />
                </div>
                <div className="mt-3 grid gap-2 text-sm text-slate-500 sm:grid-cols-2 xl:grid-cols-4">
                  <span className="inline-flex items-center gap-2">
                    <FileText className="h-4 w-4" />
                    Invoice: {formatDate(invoiceForm.invoiceDate)}
                  </span>
                  <span className="inline-flex items-center gap-2">
                    <ClipboardCheck className="h-4 w-4" />
                    Due: {formatDate(invoiceForm.dueDate)}
                  </span>
                  <span className="inline-flex items-center gap-2">
                    <MapPin className="h-4 w-4" />
                    POS: {invoiceForm.placeOfSupply || "-"}
                  </span>
                  <span className="inline-flex items-center gap-2">
                    <ShieldCheck className="h-4 w-4" />
                    {invoiceForm.taxMode === "inter" ? "IGST" : "CGST + SGST"}
                  </span>
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-3 lg:min-w-[30rem]">
                <SummaryTile
                  label="Items"
                  value={totals.totalItems}
                  icon={PackageCheck}
                />
                <SummaryTile
                  label="Quantity"
                  value={totals.totalQuantity.toLocaleString("en-IN")}
                  icon={ClipboardCheck}
                  tone="green"
                />
                <SummaryTile
                  label="Grand Total"
                  value={formatInrCurrency(totals.grandTotal)}
                  icon={BadgeIndianRupee}
                  tone="amber"
                />
              </div>
            </div>
          </Card>

          <Card className="p-5">
            <SectionTitle
              icon={FileCheck2}
              title="Source Receipt"
              action={
                <button
                  type="button"
                  onClick={loadRecords}
                  className="grid h-9 w-9 place-items-center rounded-lg text-slate-500 hover:bg-slate-100"
                  aria-label="Refresh invoice source data"
                >
                  <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
                </button>
              }
            >
              Received goods drives this invoice
            </SectionTitle>
            {loadError ? (
              <div className="rounded-lg border border-red-100 bg-red-50 p-3 text-sm text-red-700">
                <div className="flex items-start gap-2">
                  <WifiOff className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{loadError}</span>
                </div>
              </div>
            ) : (
              <SelectInput
                label="Received Goods"
                value={selectedReceiptId}
                onChange={(event) => setSelectedReceiptId(event.target.value)}
                disabled={isLoading || receipts.length === 0}
              >
                {isLoading ? <option value="">Loading receipts...</option> : null}
                {!isLoading && receipts.length === 0 ? (
                  <option value="">No received goods found</option>
                ) : null}
                {receiptOptions.map((receipt) => (
                  <option key={receipt.id} value={receipt.id}>
                    {receipt.label}
                  </option>
                ))}
              </SelectInput>
            )}
            <div className="mt-4 grid gap-3 text-sm text-slate-600">
              <div className="rounded-lg bg-slate-50 p-3">
                <p className="text-xs font-bold uppercase tracking-wide text-slate-400">
                  PO Reference
                </p>
                <p className="mt-1 font-semibold text-slate-800">
                  {invoiceForm.poReference || "-"}
                </p>
              </div>
              <div className="rounded-lg bg-slate-50 p-3">
                <p className="text-xs font-bold uppercase tracking-wide text-slate-400">
                  Receipt Date
                </p>
                <p className="mt-1 font-semibold text-slate-800">
                  {formatDate(selectedReceipt?.receivedDate)}
                </p>
              </div>
            </div>
          </Card>
        </div>

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]">
          <div className="space-y-5">
            <Card className="p-5">
              <div className="grid gap-5 2xl:grid-cols-3">
                <div>
                  <SectionTitle icon={Building2} title="Supplier" tone="blue">
                    Vendor billing and GST details
                  </SectionTitle>
                  <div className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-1">
                    <TextInput
                      label="Supplier Name"
                      required
                      value={supplierForm.name}
                      onChange={(event) => updateSupplier("name", event.target.value)}
                    />
                    <TextInput
                      label="GSTIN"
                      required
                      value={supplierForm.gstNumber}
                      onChange={(event) =>
                        updateSupplier("gstNumber", event.target.value.toUpperCase())
                      }
                      hint={`State code: ${stateCodeFromGstin(supplierForm.gstNumber) || "-"}`}
                    />
                    <TextInput
                      label="Contact"
                      value={supplierForm.contactPerson}
                      onChange={(event) => updateSupplier("contactPerson", event.target.value)}
                    />
                    <TextInput
                      label="Phone"
                      value={supplierForm.phone}
                      onChange={(event) => updateSupplier("phone", event.target.value)}
                    />
                    <Field label="Address">
                      <textarea
                        value={supplierForm.address}
                        onChange={(event) => updateSupplier("address", event.target.value)}
                        className={`${inputClass} min-h-20 resize-none`}
                      />
                    </Field>
                  </div>
                </div>

                <div>
                  <SectionTitle icon={Building2} title="Buyer" tone="green">
                    Company details for invoice print
                  </SectionTitle>
                  <div className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-1">
                    <TextInput
                      label="Company Name"
                      required
                      value={buyerForm.companyName}
                      onChange={(event) => updateBuyer("companyName", event.target.value)}
                    />
                    <TextInput
                      label="GSTIN"
                      required
                      value={buyerForm.gstNumber}
                      onChange={(event) => updateBuyer("gstNumber", event.target.value.toUpperCase())}
                      hint={`State code: ${buyerForm.stateCode || "-"}`}
                    />
                    <TextInput
                      label="State"
                      value={buyerForm.state}
                      onChange={(event) => updateBuyer("state", event.target.value)}
                    />
                    <TextInput
                      label="Pincode"
                      value={buyerForm.pincode}
                      onChange={(event) => updateBuyer("pincode", event.target.value)}
                    />
                    <Field label="Billing Address">
                      <textarea
                        value={buyerForm.address}
                        onChange={(event) => updateBuyer("address", event.target.value)}
                        className={`${inputClass} min-h-20 resize-none`}
                      />
                    </Field>
                  </div>
                </div>

                <div>
                  <SectionTitle icon={FileText} title="Invoice Details" tone="amber">
                    Commercial terms and e-invoice placeholders
                  </SectionTitle>
                  <div className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-1">
                    <TextInput
                      label="PO Reference"
                      required
                      value={invoiceForm.poReference}
                      onChange={(event) => updateInvoiceForm("poReference", event.target.value)}
                    />
                    <Field label="Invoice Date" required>
                      <DateInput
                        value={invoiceForm.invoiceDate}
                        onChange={(value) => updateInvoiceForm("invoiceDate", value)}
                        className={inputClass}
                      />
                    </Field>
                    <Field label="Due Date">
                      <DateInput
                        value={invoiceForm.dueDate}
                        onChange={(value) => updateInvoiceForm("dueDate", value)}
                        className={inputClass}
                      />
                    </Field>
                    <SelectInput
                      label="Payment Terms"
                      value={invoiceForm.paymentTerms}
                      onChange={(event) => updateInvoiceForm("paymentTerms", event.target.value)}
                    >
                      {paymentTerms.map((term) => (
                        <option key={term} value={term}>
                          {term}
                        </option>
                      ))}
                    </SelectInput>
                    <SelectInput
                      label="Tax Mode"
                      value={invoiceForm.taxMode}
                      onChange={(event) => updateInvoiceForm("taxMode", event.target.value)}
                    >
                      <option value="intra">Intra-state - CGST + SGST</option>
                      <option value="inter">Inter-state - IGST</option>
                    </SelectInput>
                    <TextInput
                      label="Place of Supply"
                      value={invoiceForm.placeOfSupply}
                      onChange={(event) => updateInvoiceForm("placeOfSupply", event.target.value)}
                    />
                    <SelectInput
                      label="Reverse Charge"
                      value={invoiceForm.reverseCharge}
                      onChange={(event) => updateInvoiceForm("reverseCharge", event.target.value)}
                    >
                      <option value="No">No</option>
                      <option value="Yes">Yes</option>
                    </SelectInput>
                    <TextInput
                      label="IRN"
                      value={invoiceForm.irn}
                      onChange={(event) => updateInvoiceForm("irn", event.target.value)}
                      placeholder="Placeholder until IRP integration"
                    />
                    <TextInput
                      label="QR Reference"
                      value={invoiceForm.qrReference}
                      onChange={(event) => updateInvoiceForm("qrReference", event.target.value)}
                      placeholder="Signed QR payload reference"
                    />
                  </div>
                </div>
              </div>
            </Card>

            <Card className="overflow-hidden">
              <div className="flex flex-col gap-4 border-b border-slate-200 p-5 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <h2 className="text-base font-bold text-slate-950">Invoice Items</h2>
                  <p className="mt-1 text-sm text-slate-500">
                    Received quantities, HSN, GST rate, and tax values.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <ActionButton icon={Plus} variant="primary" onClick={addRow}>
                    Add Row
                  </ActionButton>
                  <ActionButton
                    icon={RefreshCw}
                    onClick={reloadReceiptItems}
                    disabled={!selectedReceipt}
                  >
                    Reload Receipt Items
                  </ActionButton>
                </div>
              </div>

              <div className="flex flex-col gap-3 border-b border-slate-200 p-5 lg:flex-row lg:items-center lg:justify-between">
                <div className="relative w-full max-w-xl">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    value={productSearch}
                    onChange={(event) => setProductSearch(event.target.value)}
                    className={`${inputClass} pl-10`}
                    placeholder="Search by item, HSN, code, or batch"
                  />
                </div>
                <div className="text-sm text-slate-500">
                  Showing {filteredItems.length} of {items.length} rows
                </div>
              </div>

              <div className="hidden overflow-x-auto lg:block">
                <table className="min-w-[1320px] w-full border-separate border-spacing-0 text-left text-sm">
                  <thead className="sticky top-0 z-10 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      {[
                        "#",
                        "Item",
                        "HSN",
                        "UOM",
                        "Ordered",
                        "Received",
                        "Unit Price",
                        "Disc %",
                        "GST %",
                        "Taxable",
                        "CGST",
                        "SGST",
                        "IGST",
                        "Total",
                        "Actions",
                      ].map((heading) => (
                        <th
                          key={heading}
                          className={`border-b border-slate-200 px-3 py-3 font-semibold ${
                            [
                              "Ordered",
                              "Received",
                              "Unit Price",
                              "Disc %",
                              "GST %",
                              "Taxable",
                              "CGST",
                              "SGST",
                              "IGST",
                              "Total",
                            ].includes(heading)
                              ? "text-right"
                              : ""
                          }`}
                        >
                          {heading}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredItems.map((item, index) => {
                      const line = calculateLine(item, invoiceForm.taxMode);
                      const rowIssues = itemIssuesById.get(item.id) ?? [];
                      return (
                        <tr key={item.id} className="bg-white hover:bg-slate-50">
                          <td className="border-b border-slate-100 px-3 py-3 align-top text-slate-500">
                            {index + 1}
                          </td>
                          <td className="border-b border-slate-100 px-3 py-3 align-top">
                            <div className="space-y-2">
                              <input
                                value={item.productName}
                                onChange={(event) =>
                                  updateItem(item.id, "productName", event.target.value)
                                }
                                className={`${compactInputClass} min-w-[15rem] font-semibold`}
                                placeholder="Product name"
                              />
                              <input
                                value={item.description}
                                onChange={(event) =>
                                  updateItem(item.id, "description", event.target.value)
                                }
                                className={`${compactInputClass} min-w-[15rem] text-xs`}
                                placeholder="Description"
                              />
                              {rowIssues.length ? (
                                <div className="space-y-1">
                                  {rowIssues.map((issue) => (
                                    <p key={issue} className="text-xs font-medium text-red-600">
                                      {issue}
                                    </p>
                                  ))}
                                </div>
                              ) : null}
                            </div>
                          </td>
                          <td className="border-b border-slate-100 px-3 py-3 align-top">
                            <input
                              value={item.hsn}
                              onChange={(event) =>
                                updateItem(item.id, "hsn", event.target.value)
                              }
                              className="w-28 rounded-md border border-slate-200 bg-white px-2.5 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                            />
                          </td>
                          <td className="border-b border-slate-100 px-3 py-3 align-top">
                            <input
                              value={item.uom}
                              onChange={(event) =>
                                updateItem(item.id, "uom", event.target.value)
                              }
                              className="w-20 rounded-md border border-slate-200 bg-white px-2.5 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                            />
                          </td>
                          <td className="border-b border-slate-100 px-3 py-3 align-top">
                            <input
                              type="number"
                              min="0"
                              value={item.orderedQty}
                              onChange={(event) =>
                                updateItem(item.id, "orderedQty", event.target.value)
                              }
                              className="w-24 rounded-md border border-slate-200 bg-white px-2.5 py-2 text-right text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                            />
                          </td>
                          <td className="border-b border-slate-100 px-3 py-3 align-top">
                            <input
                              type="number"
                              min="0"
                              value={item.receivedQty}
                              onChange={(event) =>
                                updateItem(item.id, "receivedQty", event.target.value)
                              }
                              className="w-24 rounded-md border border-slate-200 bg-white px-2.5 py-2 text-right text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                            />
                          </td>
                          <td className="border-b border-slate-100 px-3 py-3 align-top">
                            <input
                              type="number"
                              min="0"
                              value={item.unitPrice}
                              onChange={(event) =>
                                updateItem(item.id, "unitPrice", event.target.value)
                              }
                              className="w-28 rounded-md border border-slate-200 bg-white px-2.5 py-2 text-right text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                            />
                          </td>
                          <td className="border-b border-slate-100 px-3 py-3 align-top">
                            <input
                              type="number"
                              min="0"
                              value={item.discount}
                              onChange={(event) =>
                                updateItem(item.id, "discount", event.target.value)
                              }
                              className="w-20 rounded-md border border-slate-200 bg-white px-2.5 py-2 text-right text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                            />
                          </td>
                          <td className="border-b border-slate-100 px-3 py-3 align-top">
                            <input
                              type="number"
                              min="0"
                              value={item.tax}
                              onChange={(event) =>
                                updateItem(item.id, "tax", event.target.value)
                              }
                              className="w-20 rounded-md border border-slate-200 bg-white px-2.5 py-2 text-right text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                            />
                          </td>
                          <td className="border-b border-slate-100 px-3 py-3 text-right align-top font-semibold text-slate-800">
                            {formatInrCurrency(line.taxable)}
                          </td>
                          <td className="border-b border-slate-100 px-3 py-3 text-right align-top text-slate-700">
                            {formatInrCurrency(line.cgstAmount)}
                          </td>
                          <td className="border-b border-slate-100 px-3 py-3 text-right align-top text-slate-700">
                            {formatInrCurrency(line.sgstAmount)}
                          </td>
                          <td className="border-b border-slate-100 px-3 py-3 text-right align-top text-slate-700">
                            {formatInrCurrency(line.igstAmount)}
                          </td>
                          <td className="border-b border-slate-100 px-3 py-3 text-right align-top font-bold text-slate-950">
                            {formatInrCurrency(line.lineTotal)}
                          </td>
                          <td className="border-b border-slate-100 px-3 py-3 align-top">
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => duplicateRow(item.id)}
                                className="grid h-9 w-9 place-items-center rounded-lg text-blue-600 hover:bg-blue-50"
                                aria-label="Duplicate row"
                              >
                                <Copy className="h-4 w-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => deleteRow(item.id)}
                                className="grid h-9 w-9 place-items-center rounded-lg text-red-600 hover:bg-red-50"
                                aria-label="Delete row"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot className="bg-slate-50 font-bold text-slate-950">
                    <tr>
                      <td className="px-3 py-3" colSpan={4}>
                        Total
                      </td>
                      <td className="px-3 py-3 text-right">
                        {items
                          .reduce((sum, item) => sum + toNumber(item.orderedQty), 0)
                          .toLocaleString("en-IN")}
                      </td>
                      <td className="px-3 py-3 text-right">
                        {totals.totalQuantity.toLocaleString("en-IN")}
                      </td>
                      <td className="px-3 py-3" colSpan={3} />
                      <td className="px-3 py-3 text-right">
                        {formatInrCurrency(totals.taxable)}
                      </td>
                      <td className="px-3 py-3 text-right">
                        {formatInrCurrency(totals.cgst)}
                      </td>
                      <td className="px-3 py-3 text-right">
                        {formatInrCurrency(totals.sgst)}
                      </td>
                      <td className="px-3 py-3 text-right">
                        {formatInrCurrency(totals.igst)}
                      </td>
                      <td className="px-3 py-3 text-right">
                        {formatInrCurrency(totals.grandTotal)}
                      </td>
                      <td className="px-3 py-3" />
                    </tr>
                  </tfoot>
                </table>
              </div>

              <div className="grid gap-3 p-4 lg:hidden">
                {filteredItems.map((item, index) => {
                  const line = calculateLine(item, invoiceForm.taxMode);
                  const rowIssues = itemIssuesById.get(item.id) ?? [];
                  return (
                    <div key={item.id} className="rounded-lg border border-slate-200 bg-white p-3">
                      <div className="mb-3 flex items-start justify-between gap-3">
                        <div>
                          <p className="text-xs font-semibold text-slate-400">Row {index + 1}</p>
                          <p className="font-semibold text-slate-900">
                            {item.productName || "New item"}
                          </p>
                        </div>
                        <div className="flex gap-1">
                          <button
                            type="button"
                            onClick={() => duplicateRow(item.id)}
                            className="grid h-8 w-8 place-items-center rounded-lg text-blue-600 hover:bg-blue-50"
                            aria-label="Duplicate row"
                          >
                            <Copy className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => deleteRow(item.id)}
                            className="grid h-8 w-8 place-items-center rounded-lg text-red-600 hover:bg-red-50"
                            aria-label="Delete row"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <TextInput
                          label="Item"
                          value={item.productName}
                          onChange={(event) =>
                            updateItem(item.id, "productName", event.target.value)
                          }
                        />
                        <TextInput
                          label="HSN"
                          value={item.hsn}
                          onChange={(event) => updateItem(item.id, "hsn", event.target.value)}
                        />
                        <TextInput
                          label="UOM"
                          value={item.uom}
                          onChange={(event) => updateItem(item.id, "uom", event.target.value)}
                        />
                        <TextInput
                          label="Received Qty"
                          type="number"
                          value={item.receivedQty}
                          onChange={(event) =>
                            updateItem(item.id, "receivedQty", event.target.value)
                          }
                        />
                        <TextInput
                          label="Unit Price"
                          type="number"
                          value={item.unitPrice}
                          onChange={(event) =>
                            updateItem(item.id, "unitPrice", event.target.value)
                          }
                        />
                        <TextInput
                          label="GST %"
                          type="number"
                          value={item.tax}
                          onChange={(event) => updateItem(item.id, "tax", event.target.value)}
                        />
                      </div>
                      {rowIssues.length ? (
                        <div className="mt-3 space-y-1">
                          {rowIssues.map((issue) => (
                            <p key={issue} className="text-xs font-medium text-red-600">
                              {issue}
                            </p>
                          ))}
                        </div>
                      ) : null}
                      <div className="mt-3 rounded-lg bg-slate-50 p-3 text-sm">
                        <TaxRow label="Taxable" value={formatInrCurrency(line.taxable)} />
                        <TaxRow label="Tax" value={formatInrCurrency(line.taxAmount)} />
                        <TaxRow label="Total" value={formatInrCurrency(line.lineTotal)} strong />
                      </div>
                    </div>
                  );
                })}
              </div>

              {filteredItems.length === 0 ? (
                <div className="p-8 text-center text-sm text-slate-500">
                  No invoice items match the current search.
                </div>
              ) : null}
            </Card>

            <div className="grid gap-5 lg:grid-cols-2">
              <Card className="p-5">
                <SectionTitle icon={Paperclip} title="Attachments">
                  Supplier invoice, challan, and support documents
                </SectionTitle>
                <button
                  type="button"
                  onClick={addDummyFile}
                  className="grid w-full place-items-center rounded-lg border border-dashed border-blue-300 bg-blue-50/60 px-4 py-7 text-center text-sm text-slate-600 transition hover:bg-blue-50"
                >
                  <UploadCloud className="mb-3 h-8 w-8 text-blue-600" />
                  <span className="font-semibold text-slate-800">Add supporting file</span>
                  <span className="mt-1 text-blue-600">UI placeholder upload</span>
                </button>
                <div className="mt-5 space-y-3">
                  {files.map((file) => (
                    <div
                      key={file.id}
                      className="flex items-center justify-between gap-3 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2.5"
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <FileText className="h-4 w-4 shrink-0 text-red-500" />
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-slate-800">
                            {file.name}
                          </p>
                          <p className="text-xs text-slate-500">
                            {file.type} - {file.size}
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeFile(file.id)}
                        className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-red-600 hover:bg-red-50"
                        aria-label={`Remove ${file.name}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </Card>

              <Card className="p-5">
                <SectionTitle icon={FileText} title="Notes">
                  Internal, supplier, and delivery instructions
                </SectionTitle>
                <div className="grid gap-4">
                  <Field label="Internal Notes">
                    <textarea
                      value={notes.internal}
                      onChange={(event) =>
                        setNotes((current) => ({ ...current, internal: event.target.value }))
                      }
                      className={`${inputClass} min-h-20 resize-none`}
                    />
                  </Field>
                  <Field label="Supplier Notes">
                    <textarea
                      value={notes.supplier}
                      onChange={(event) =>
                        setNotes((current) => ({ ...current, supplier: event.target.value }))
                      }
                      className={`${inputClass} min-h-20 resize-none`}
                    />
                  </Field>
                  <Field label="Delivery Instructions">
                    <textarea
                      value={notes.delivery}
                      onChange={(event) =>
                        setNotes((current) => ({ ...current, delivery: event.target.value }))
                      }
                      className={`${inputClass} min-h-20 resize-none`}
                    />
                  </Field>
                </div>
              </Card>
            </div>
          </div>

          <aside className="space-y-5 xl:sticky xl:top-4 xl:self-start">
            <ValidationPanel issues={validationIssues} showValidation={showValidation} />

            <Card className="p-5">
              <SectionTitle icon={BadgeIndianRupee} title="Tax Breakdown">
                Invoice value summary
              </SectionTitle>
              <div className="space-y-4">
                <TaxRow label="Subtotal" value={formatInrCurrency(totals.subtotal)} />
                <TaxRow label="Discount" value={`-${formatInrCurrency(totals.discount)}`} danger />
                <TaxRow label="Taxable Value" value={formatInrCurrency(totals.taxable)} />
                <TaxRow label="CGST" value={formatInrCurrency(totals.cgst)} />
                <TaxRow label="SGST" value={formatInrCurrency(totals.sgst)} />
                <TaxRow label="IGST" value={formatInrCurrency(totals.igst)} />
                <TaxRow label="Round Off" value={formatInrCurrency(totals.roundOff)} />
                <div className="border-t border-slate-200 pt-4">
                  <TaxRow label="Grand Total" value={formatInrCurrency(totals.grandTotal)} strong />
                </div>
              </div>
            </Card>

            <Card className="p-5">
              <SectionTitle icon={BadgeIndianRupee} tone="green" title="Payment">
                Settlement method and due amount
              </SectionTitle>
              <div className="grid gap-4">
                <SelectInput
                  label="Payment Status"
                  value={payment.status}
                  onChange={(event) => updatePayment("status", event.target.value)}
                >
                  {paymentStatuses.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </SelectInput>
                <TextInput
                  label="Payment Method"
                  list="payment-method-options"
                  value={payment.mode}
                  onChange={(event) => updatePayment("mode", event.target.value)}
                  placeholder="Enter payment method"
                />
                <datalist id="payment-method-options">
                  {paymentModes.map((option) => (
                    <option key={option} value={option} />
                  ))}
                </datalist>
                <TextInput
                  label="Paid Amount"
                  type="number"
                  min="0"
                  value={payment.paidAmount}
                  onChange={(event) => updatePayment("paidAmount", event.target.value)}
                />
                <div className="rounded-lg border border-slate-100 bg-slate-50 p-3">
                  <TaxRow label="Due Amount" value={formatInrCurrency(totals.dueAmount)} strong />
                </div>
              </div>
            </Card>

            <Card className="p-5">
              <SectionTitle icon={PackageCheck} tone="green" title="Inventory Impact">
                Approval stock preview
              </SectionTitle>
              <div className="space-y-3">
                {inventoryImpactItems.length ? (
                  inventoryImpactItems.map((item) => (
                    <div key={item.id} className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-slate-800">
                          {item.productName || item.productCode}
                        </p>
                        <p className="text-xs text-slate-500">HSN {item.hsn || "-"}</p>
                      </div>
                      <span className="shrink-0 rounded-full bg-green-50 px-2.5 py-1 text-xs font-bold text-green-700">
                        +{toNumber(item.receivedQty).toLocaleString("en-IN")} {item.uom}
                      </span>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-slate-500">No item impact yet.</p>
                )}
              </div>
            </Card>

            <Card className="p-5">
              <SectionTitle icon={ShieldCheck} tone="green" title="Approval Workflow">
                UI-only status trail
              </SectionTitle>
              <div className="space-y-4">
                {workflowSteps.map((step, index) => {
                  const done =
                    status === "Approved" ||
                    index === 0 ||
                    (status === "Submitted" && index <= 1) ||
                    (status === "Rejected" && index <= 1);
                  return (
                    <div key={step.id} className="flex gap-3">
                      <div className="flex flex-col items-center">
                        <span
                          className={`grid h-6 w-6 place-items-center rounded-full border ${
                            done
                              ? "border-green-200 bg-green-50 text-green-700"
                              : "border-slate-200 bg-white text-slate-400"
                          }`}
                        >
                          {done ? (
                            <CheckCircle2 className="h-4 w-4" />
                          ) : (
                            <CircleDot className="h-3 w-3" />
                          )}
                        </span>
                        {index < workflowSteps.length - 1 ? (
                          <span className="mt-1 h-8 w-px bg-slate-200" />
                        ) : null}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-800">{step.title}</p>
                        <p className="text-xs text-slate-500">{done ? step.person : "Pending"}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>

            <Card className="p-5">
              <SectionTitle icon={ClipboardCheck} title="Activity Timeline">
                Recent invoice events
              </SectionTitle>
              <div className="space-y-4">
                {activityTimeline.map((entry, index) => (
                  <div key={entry.id} className="flex gap-3">
                    <div className="flex flex-col items-center">
                      <span className="grid h-5 w-5 place-items-center rounded-full bg-blue-50 text-blue-600">
                        <CircleDot className="h-3 w-3" />
                      </span>
                      {index < activityTimeline.length - 1 ? (
                        <span className="mt-1 h-8 w-px bg-slate-200" />
                      ) : null}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-3">
                        <p className="text-sm font-semibold text-slate-800">{entry.title}</p>
                        <span className="shrink-0 text-right text-xs text-slate-500">
                          {entry.time}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-slate-500">by {entry.by}</p>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          </aside>
        </div>
      </div>

      <div className="sticky bottom-3 z-30 mt-6 rounded-lg border border-slate-200 bg-white/95 p-3 shadow-lg backdrop-blur">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <ActionButton icon={ArrowLeft} onClick={() => window.history.back()}>
            Back
          </ActionButton>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <ActionButton onClick={() => setActionNotice("No changes were sent to the server.")}>
              Cancel
            </ActionButton>
            <ActionButton icon={Save} onClick={() => changeStatus("Draft")}>
              Save Draft
            </ActionButton>
            <ActionButton icon={Send} variant="primary" onClick={() => changeStatus("Submitted")}>
              Submit
            </ActionButton>
            <ActionButton
              icon={CheckCircle2}
              variant="success"
              onClick={() => changeStatus("Approved")}
            >
              Approve
            </ActionButton>
            <ActionButton icon={XCircle} variant="danger" onClick={() => changeStatus("Rejected")}>
              Reject
            </ActionButton>
            <ActionButton icon={Printer} onClick={() => window.print()}>
              Print
            </ActionButton>
            <ActionButton
              icon={Download}
              onClick={() => setActionNotice("PDF export is a placeholder for this pass.")}
            >
              Download PDF
            </ActionButton>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Invoice;
