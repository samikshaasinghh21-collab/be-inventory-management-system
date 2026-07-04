import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Download,
  LoaderCircle,
  Paperclip,
  Plus,
  Printer,
  RefreshCw,
  RotateCcw,
  Save,
  Send,
  Trash2,
  XCircle,
} from "lucide-react";
import DateInput from "../common/DateInput";
import { parseDateValue } from "../../utils/dateFormat";
import { fetchPurchaseOrders } from "../../services/purchaseOrdersApi";
import { fetchReceiveGoods } from "../../services/receiveGoodsApi";
import { fetchVendors } from "../../services/vendorsApi";
import {
  createInvoice,
  fetchInvoice,
  fetchInvoices,
  updateInvoice,
} from "../../services/invoicesApi";
import { formatInrCurrency, roundCurrencyValue } from "../../utils/formatters";

const inputClass =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100";
const inputDisabledClass =
  "disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-50 disabled:text-slate-500";
const tableInputClass = `${inputClass} ${inputDisabledClass} min-w-[88px] px-2 py-1.5 text-xs`;
const inputBaseClass = `${inputClass} ${inputDisabledClass}`;

const statusStyles = {
  Draft: "border-blue-200 bg-blue-50 text-blue-700",
  Submitted: "border-amber-200 bg-amber-50 text-amber-700",
  Approved: "border-green-200 bg-green-50 text-green-700",
  Rejected: "border-red-200 bg-red-50 text-red-700",
};

const actionButtonClass =
  "inline-flex min-h-10 items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-semibold shadow-sm transition disabled:cursor-not-allowed disabled:opacity-50";

const paymentTerms = ["Net 30 Days", "Net 45 Days", "Due on Receipt", "Advance Paid"];
const paymentModes = ["Bank Transfer", "Cheque", "UPI", "Cash"];
const defaultTermsText =
  "1. Goods once sold will not be taken back without approval.\n2. Payment is due as per agreed credit terms.\n3. Please quote the invoice number in all payment references.";

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
  referenceNumber: "",
  paymentDate: "",
  paidAmount: 0,
};

const emptyInvoiceForm = {
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
};

const emptyNotes = {
  internal: "",
  supplier: "",
  delivery: "",
  billTo: "Bangalore Electronics, Bengaluru, Karnataka",
  shipTo: "",
  terms: defaultTermsText,
  footerNote: "This is a system-generated purchase invoice workspace.",
  approvalComment: "",
  rejectionReason: "",
};

const emptySupplier = {
  id: "",
  name: "",
  contactPerson: "",
  phone: "",
  email: "",
  gstNumber: "",
  address: "",
  city: "",
  state: "",
  stateCode: "",
  pincode: "",
};

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
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate()
  ).padStart(2, "0")}`;
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
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate()
  ).padStart(2, "0")}`;
};

const formatDate = (value) => {
  const iso = toIsoDate(value);
  if (!iso) {
    return "-";
  }
  const [year, month, day] = iso.split("-");
  return `${day}/${month}/${year}`;
};

const normalizeKey = (value) => (value === null || value === undefined ? "" : String(value));

const isValidGstin = (value) =>
  /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/i.test(String(value ?? "").trim());

const stateCodeFromGstin = (value) => {
  const gstin = String(value ?? "").trim();
  return /^\d{2}/.test(gstin) ? gstin.slice(0, 2) : "";
};

const derivePaymentStatus = (paidAmount, grandTotal) => {
  const paid = toNumber(paidAmount);
  const total = toNumber(grandTotal);
  if (paid <= 0) {
    return "Unpaid";
  }
  if (total > 0 && paid < total) {
    return "Partially Paid";
  }
  return "Paid";
};

const numberToWordsUnderThousand = (value) => {
  const ones = [
    "",
    "One",
    "Two",
    "Three",
    "Four",
    "Five",
    "Six",
    "Seven",
    "Eight",
    "Nine",
    "Ten",
    "Eleven",
    "Twelve",
    "Thirteen",
    "Fourteen",
    "Fifteen",
    "Sixteen",
    "Seventeen",
    "Eighteen",
    "Nineteen",
  ];
  const tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
  const amount = Number(value) || 0;
  if (amount === 0) {
    return "";
  }
  if (amount < 20) {
    return ones[amount];
  }
  if (amount < 100) {
    return `${tens[Math.floor(amount / 10)]}${amount % 10 ? ` ${ones[amount % 10]}` : ""}`;
  }
  return `${ones[Math.floor(amount / 100)]} Hundred${
    amount % 100 ? ` ${numberToWordsUnderThousand(amount % 100)}` : ""
  }`;
};

const numberToIndianWords = (value) => {
  const amount = Math.floor(Math.abs(Number(value) || 0));
  if (!amount) {
    return "Zero";
  }
  const parts = [];
  const crore = Math.floor(amount / 10000000);
  const lakh = Math.floor((amount % 10000000) / 100000);
  const thousand = Math.floor((amount % 100000) / 1000);
  const hundred = amount % 1000;
  if (crore) parts.push(`${numberToWordsUnderThousand(crore)} Crore`);
  if (lakh) parts.push(`${numberToWordsUnderThousand(lakh)} Lakh`);
  if (thousand) parts.push(`${numberToWordsUnderThousand(thousand)} Thousand`);
  if (hundred) parts.push(numberToWordsUnderThousand(hundred));
  return parts.join(" ").trim();
};

const formatAmountInWords = (value) => {
  const absolute = Math.max(Number(value) || 0, 0);
  const rupees = Math.floor(absolute);
  const paise = Math.round((absolute - rupees) * 100);
  const rupeeWords = `${numberToIndianWords(rupees)} Rupees`;
  if (!paise) {
    return `${rupeeWords} Only`;
  }
  return `${rupeeWords} And ${numberToIndianWords(paise)} Paise Only`;
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
    stateCode: stateCodeFromGstin(vendor.gstNumber ?? vendor.gst ?? ""),
    pincode: vendor.pincode ?? "",
  };
};

const mapReceiptItemToInvoiceItem = (receiptItem = {}, index, purchaseOrder) => {
  const poItem =
    purchaseOrder?.items?.find(
      (item) =>
        normalizeKey(item.poItemId) === normalizeKey(receiptItem.poItemId) ||
        normalizeKey(item.id) === normalizeKey(receiptItem.poItemId) ||
        normalizeKey(item.itemId) === normalizeKey(receiptItem.itemId)
    ) ?? null;
  const gstRate =
    receiptItem.gst || receiptItem.taxPercentage || poItem?.gst || poItem?.taxPercentage || 18;

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

const buildReceiptLabel = (receipt, purchaseOrder) => {
  if (!receipt) {
    return "Select received goods";
  }
  const receiptId = receipt.receiveGoodsId ?? receipt.id ?? "";
  const poText = purchaseOrder?.poNumber ? ` | ${purchaseOrder.poNumber}` : "";
  const invoiceText = receipt.invoiceNumber ? ` | INV ${receipt.invoiceNumber}` : "";
  return `RG-${receiptId}${poText}${invoiceText}`;
};

const cloneValue = (value) => JSON.parse(JSON.stringify(value));

const readDocument = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Failed to read file."));
    reader.onload = () =>
      resolve({
        id: `file-${Date.now()}-${Math.random().toString(16).slice(2)}`,
        name: file.name,
        type: file.type || "application/octet-stream",
        size: file.size,
        uploadedAt: new Date().toISOString(),
        dataUrl: String(reader.result || ""),
      });
    reader.readAsDataURL(file);
  });

const renderInvoiceDocument = ({
  status,
  supplierForm,
  buyerForm,
  invoiceForm,
  items,
  payment,
  notes,
  totals,
}) => {
  const escapeHtml = (value) =>
    String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");

  const rowsHtml = items
    .map((item, index) => {
      const line = calculateLine(item, invoiceForm.taxMode);
      return `
        <tr>
          <td>${index + 1}</td>
          <td>${escapeHtml(item.productName || item.productCode)}</td>
          <td>${escapeHtml(item.hsn)}</td>
          <td>${escapeHtml(item.uom)}</td>
          <td>${toNumber(item.receivedQty)}</td>
          <td>${formatInrCurrency(toNumber(item.unitPrice))}</td>
          <td>${formatInrCurrency(line.taxable)}</td>
          <td>${toNumber(item.tax)}%</td>
          <td>${formatInrCurrency(line.lineTotal)}</td>
        </tr>
      `;
    })
    .join("");

  return `
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>${escapeHtml(invoiceForm.invoiceNumber || "Invoice")}</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 24px; color: #0f172a; }
          h1, h2, h3, p { margin: 0; }
          .meta, .cards { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; margin-top: 16px; }
          .card { border: 1px solid #cbd5e1; border-radius: 10px; padding: 16px; }
          table { width: 100%; border-collapse: collapse; margin-top: 20px; }
          th, td { border: 1px solid #cbd5e1; padding: 8px; text-align: left; font-size: 12px; }
          th { background: #e2e8f0; }
          .hero { display: flex; justify-content: space-between; align-items: flex-start; gap: 24px; }
          .totals { margin-top: 20px; margin-left: auto; width: 320px; }
          .totals div { display: flex; justify-content: space-between; padding: 6px 0; }
          .status { display: inline-block; margin-top: 8px; padding: 4px 10px; border-radius: 999px; background: #e0f2fe; }
          .terms { margin-top: 20px; border: 1px solid #cbd5e1; border-radius: 10px; padding: 16px; white-space: pre-line; }
          .muted { color: #475569; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="hero">
          <div>
            <h1>Purchase Invoice</h1>
            <p>${escapeHtml(invoiceForm.invoiceNumber || "-")}</p>
            <div class="status">${escapeHtml(status)}</div>
          </div>
          <div class="card">
            <h3>Invoice Summary</h3>
            <p>Date: ${escapeHtml(formatDate(invoiceForm.invoiceDate))}</p>
            <p>Due Date: ${escapeHtml(formatDate(invoiceForm.dueDate))}</p>
            <p>PO Ref: ${escapeHtml(invoiceForm.poReference)}</p>
            <p>Payment Terms: ${escapeHtml(invoiceForm.paymentTerms)}</p>
            <p>Amount In Words: ${escapeHtml(formatAmountInWords(totals.grandTotal))}</p>
          </div>
        </div>
        <div class="meta">
          <div class="card">
            <h3>Supplier</h3>
            <p>${escapeHtml(supplierForm.name)}</p>
            <p>${escapeHtml(supplierForm.address)}</p>
            <p>${escapeHtml(supplierForm.gstNumber)}</p>
          </div>
          <div class="card">
            <h3>Buyer</h3>
            <p>${escapeHtml(buyerForm.companyName)}</p>
            <p>${escapeHtml(buyerForm.address)}</p>
            <p>${escapeHtml(buyerForm.gstNumber)}</p>
          </div>
        </div>
        <div class="cards">
          <div class="card">
            <h3>Bill To</h3>
            <p>${escapeHtml(notes.billTo || buyerForm.address || "-")}</p>
          </div>
          <div class="card">
            <h3>Ship To</h3>
            <p>${escapeHtml(notes.shipTo || notes.delivery || "-")}</p>
          </div>
        </div>
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Item</th>
              <th>HSN</th>
              <th>UOM</th>
              <th>Qty</th>
              <th>Rate</th>
              <th>Taxable</th>
              <th>GST</th>
              <th>Total</th>
            </tr>
          </thead>
          <tbody>${rowsHtml}</tbody>
        </table>
        <div class="totals">
          <div><span>Taxable</span><strong>${formatInrCurrency(totals.taxable)}</strong></div>
          <div><span>CGST</span><strong>${formatInrCurrency(totals.cgst)}</strong></div>
          <div><span>SGST</span><strong>${formatInrCurrency(totals.sgst)}</strong></div>
          <div><span>IGST</span><strong>${formatInrCurrency(totals.igst)}</strong></div>
          <div><span>Subtotal</span><strong>${formatInrCurrency(totals.subtotal)}</strong></div>
          <div><span>Discount</span><strong>${formatInrCurrency(totals.discount)}</strong></div>
          <div><span>Tax</span><strong>${formatInrCurrency(totals.taxAmount)}</strong></div>
          <div><span>Round Off</span><strong>${formatInrCurrency(totals.roundOff)}</strong></div>
          <div><span>Grand Total</span><strong>${formatInrCurrency(totals.grandTotal)}</strong></div>
        </div>
        <div class="cards">
          <div class="card">
            <h3>Payment</h3>
            <p>Status: ${escapeHtml(derivePaymentStatus(payment.paidAmount, totals.grandTotal))}</p>
            <p>Mode: ${escapeHtml(payment.mode || "-")}</p>
            <p>Reference: ${escapeHtml(payment.referenceNumber || "-")}</p>
            <p>Paid Amount: ${escapeHtml(formatInrCurrency(payment.paidAmount || 0))}</p>
          </div>
          <div class="card">
            <h3>Notes</h3>
            <p>${escapeHtml(notes.supplier || "-")}</p>
            <p class="muted">Approval: ${escapeHtml(notes.approvalComment || "-")}</p>
            <p class="muted">Rejection: ${escapeHtml(notes.rejectionReason || "-")}</p>
          </div>
        </div>
        <div class="terms">
          <h3>Terms & Conditions</h3>
          <p>${escapeHtml(notes.terms || defaultTermsText)}</p>
          <p style="margin-top:12px;">${escapeHtml(notes.footerNote || "")}</p>
        </div>
      </body>
    </html>
  `;
};

const Field = ({ label, required = false, children }) => (
  <label className="block">
    <span className="mb-1.5 block text-xs font-semibold text-slate-600">
      {label}
      {required ? <span className="text-red-500"> *</span> : null}
    </span>
    {children}
  </label>
);

const Card = ({ title, action = null, children }) => (
  <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm md:p-5">
    <div className="mb-4 flex items-center justify-between gap-3">
      <h2 className="text-base font-semibold text-slate-900">{title}</h2>
      {action}
    </div>
    {children}
  </section>
);

const SummaryStat = ({ label, value, tone = "default" }) => (
  <div
    className={`rounded-xl border px-4 py-3 shadow-sm ${
      tone === "accent"
        ? "border-blue-200 bg-blue-50"
        : tone === "success"
        ? "border-green-200 bg-green-50"
        : "border-slate-200 bg-white"
    }`}
  >
    <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">{label}</div>
    <div className="mt-2 text-lg font-semibold text-slate-900">{value}</div>
  </div>
);

const PreviewBlock = ({ title, children }) => (
  <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
    <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
    <div className="mt-3 space-y-2 text-sm text-slate-700">{children}</div>
  </div>
);

const Invoice = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const fileInputRef = useRef(null);
  const baselineRef = useRef(null);
  const [receipts, setReceipts] = useState([]);
  const [purchaseOrders, setPurchaseOrders] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [savedInvoices, setSavedInvoices] = useState([]);
  const [selectedReceiptId, setSelectedReceiptId] = useState("");
  const [invoiceId, setInvoiceId] = useState("");
  const [status, setStatus] = useState("Draft");
  const [supplierForm, setSupplierForm] = useState(emptySupplier);
  const [buyerForm, setBuyerForm] = useState(defaultBuyer);
  const [invoiceForm, setInvoiceForm] = useState(emptyInvoiceForm);
  const [items, setItems] = useState([]);
  const [payment, setPayment] = useState(defaultPayment);
  const [notes, setNotes] = useState(emptyNotes);
  const [files, setFiles] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [saveMessage, setSaveMessage] = useState("");
  const [showValidation, setShowValidation] = useState(false);

  const invoiceIdFromSearch = searchParams.get("invoiceId") || "";
  const receiptIdFromSearch = searchParams.get("receiptId") || "";

  const purchaseOrderMap = useMemo(
    () =>
      purchaseOrders.reduce((acc, order) => {
        acc.set(normalizeKey(order.id), order);
        return acc;
      }, new Map()),
    [purchaseOrders]
  );

  const selectedReceipt = useMemo(
    () =>
      receipts.find(
        (receipt) =>
          normalizeKey(receipt.receiveGoodsId ?? receipt.id) === normalizeKey(selectedReceiptId)
      ) ?? null,
    [receipts, selectedReceiptId]
  );

  const snapshotState = () => ({
    invoiceId,
    selectedReceiptId,
    status,
    supplierForm: cloneValue(supplierForm),
    buyerForm: cloneValue(buyerForm),
    invoiceForm: cloneValue(invoiceForm),
    items: cloneValue(items),
    payment: cloneValue(payment),
    notes: cloneValue(notes),
    files: cloneValue(files),
  });

  const applySnapshot = (snapshot) => {
    if (!snapshot) {
      return;
    }
    setInvoiceId(String(snapshot.invoiceId || ""));
    setSelectedReceiptId(String(snapshot.selectedReceiptId || ""));
    setStatus(snapshot.status || "Draft");
    setSupplierForm(snapshot.supplierForm || emptySupplier);
    setBuyerForm(snapshot.buyerForm || defaultBuyer);
    setInvoiceForm(snapshot.invoiceForm || emptyInvoiceForm);
    setItems(Array.isArray(snapshot.items) ? snapshot.items : []);
    setPayment(snapshot.payment || defaultPayment);
    setNotes(snapshot.notes || emptyNotes);
    setFiles(Array.isArray(snapshot.files) ? snapshot.files : []);
  };

  const setBaseline = () => {
    baselineRef.current = snapshotState();
  };

  const hydrateFromReceipt = useCallback((receipt, sourcePurchaseOrders = purchaseOrders, sourceVendors = vendors) => {
    const purchaseOrder =
      sourcePurchaseOrders.find((record) => normalizeKey(record.id) === normalizeKey(receipt?.purchaseOrderId)) ??
      null;
    const vendor =
      sourceVendors.find((record) => normalizeKey(record.id) === normalizeKey(receipt?.vendorId)) ??
      null;
    const supplier = vendor ? mapVendorToSupplier(vendor) : emptySupplier;
    const invoiceDate = toIsoDate(receipt?.invoiceDate || receipt?.receivedDate);

    setInvoiceId("");
    setStatus("Draft");
    setSupplierForm(supplier);
    setBuyerForm((current) => ({
      ...current,
      stateCode: stateCodeFromGstin(current.gstNumber) || current.stateCode,
    }));
    setInvoiceForm({
      ...emptyInvoiceForm,
      invoiceNumber: receipt?.invoiceNumber || "",
      invoiceDate,
      dueDate: invoiceDate ? addDays(invoiceDate, 30) : "",
      poReference:
        purchaseOrder?.poNumber ||
        (receipt?.purchaseOrderId ? `PO-${receipt.purchaseOrderId}` : ""),
      taxMode: receipt?.taxMode === "inter" ? "inter" : "intra",
      placeOfSupply: supplier.state || defaultBuyer.state,
    });
    setItems(
      Array.isArray(receipt?.items)
        ? receipt.items.map((item, index) => mapReceiptItemToInvoiceItem(item, index, purchaseOrder))
        : []
    );
    setPayment(defaultPayment);
    setNotes({
      internal: receipt?.notes || "",
      supplier: "",
      delivery: receipt?.shipTo || receipt?.billTo || "",
      billTo: receipt?.billTo || defaultBuyer.address,
      shipTo: receipt?.shipTo || receipt?.billTo || "",
      terms: defaultTermsText,
      footerNote: emptyNotes.footerNote,
      approvalComment: "",
      rejectionReason: "",
    });
    setFiles([]);
    setShowValidation(false);
    setSaveMessage("");
  }, [purchaseOrders, vendors]);

  const hydrateFromInvoice = (invoice) => {
    setInvoiceId(String(invoice.invoiceId || ""));
    setSelectedReceiptId(normalizeKey(invoice.receiveGoodsId));
    setStatus(invoice.status || "Draft");
    setSupplierForm(invoice.supplier || emptySupplier);
    setBuyerForm({
      ...defaultBuyer,
      ...(invoice.buyer || {}),
      stateCode:
        stateCodeFromGstin(invoice?.buyer?.gstNumber) ||
        invoice?.buyer?.stateCode ||
        defaultBuyer.stateCode,
    });
    setInvoiceForm({
      ...emptyInvoiceForm,
      invoiceNumber: invoice.invoiceNumber || "",
      invoiceDate: toIsoDate(invoice.invoiceDate),
      dueDate: toIsoDate(invoice.dueDate),
      poReference: invoice.poReference || "",
      paymentTerms: invoice.paymentTerms || emptyInvoiceForm.paymentTerms,
      currency: invoice.currency || emptyInvoiceForm.currency,
      taxMode: invoice.taxMode === "inter" ? "inter" : "intra",
      placeOfSupply: invoice.placeOfSupply || "",
      reverseCharge: invoice.reverseCharge || "No",
      irn: invoice.irn || "",
      qrReference: invoice.qrReference || "",
    });
    setItems(Array.isArray(invoice.items) ? invoice.items : []);
    setPayment({ ...defaultPayment, ...(invoice.payment || {}) });
    setNotes({ ...emptyNotes, ...(invoice.notes || {}) });
    setFiles(Array.isArray(invoice.documents) ? invoice.documents : []);
    setShowValidation(false);
    setSaveMessage("");
  };

  const loadSources = async () => {
    setIsLoading(true);
    setLoadError("");
    try {
      const [receiptList, purchaseOrderList, vendorList, invoiceList] = await Promise.all([
        fetchReceiveGoods(),
        fetchPurchaseOrders(),
        fetchVendors(),
        fetchInvoices(),
      ]);
      setReceipts(receiptList);
      setPurchaseOrders(purchaseOrderList);
      setVendors(vendorList);
      setSavedInvoices(invoiceList);

      const fallbackReceiptId = receiptIdFromSearch || normalizeKey(receiptList[0]?.receiveGoodsId);
      if (!invoiceIdFromSearch) {
        setSelectedReceiptId((current) => current || fallbackReceiptId);
        const seedReceipt =
          receiptList.find(
            (receipt) =>
              normalizeKey(receipt.receiveGoodsId ?? receipt.id) === normalizeKey(fallbackReceiptId)
          ) ?? receiptList[0] ?? null;
        if (seedReceipt) {
          hydrateFromReceipt(seedReceipt, purchaseOrderList, vendorList);
          setTimeout(setBaseline, 0);
        }
      }
    } catch (error) {
      setLoadError(error?.response?.data?.error || error?.message || "Failed to load invoice data.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    const timerId = window.setTimeout(() => {
      void loadSources();
    }, 0);
    return () => window.clearTimeout(timerId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const refresh = () => {
      void loadSources();
    };
    window.addEventListener("receive-goods:changed", refresh);
    window.addEventListener("purchase-orders:changed", refresh);
    return () => {
      window.removeEventListener("receive-goods:changed", refresh);
      window.removeEventListener("purchase-orders:changed", refresh);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!invoiceIdFromSearch) {
      return;
    }

    let cancelled = false;
    const loadSavedInvoice = async () => {
      try {
        setIsLoading(true);
        const savedInvoice = await fetchInvoice(invoiceIdFromSearch);
        if (cancelled) {
          return;
        }
        hydrateFromInvoice(savedInvoice);
        setTimeout(setBaseline, 0);
      } catch (error) {
        if (!cancelled) {
          setLoadError(
            error?.response?.data?.error || error?.message || "Failed to load saved invoice."
          );
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    void loadSavedInvoice();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invoiceIdFromSearch]);

  useEffect(() => {
    if (invoiceIdFromSearch || !selectedReceipt) {
      return;
    }
    const timerId = window.setTimeout(() => {
      hydrateFromReceipt(selectedReceipt);
      setTimeout(setBaseline, 0);
    }, 0);
    return () => window.clearTimeout(timerId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrateFromReceipt, invoiceIdFromSearch, selectedReceipt]);

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
    if (!selectedReceiptId) {
      issues.push("Select a received-goods record.");
    }
    if (!invoiceForm.invoiceNumber.trim()) {
      issues.push("Invoice number is required.");
    }
    if (!invoiceForm.invoiceDate) {
      issues.push("Invoice date is required.");
    }
    if (!invoiceForm.poReference.trim()) {
      issues.push("PO reference is required.");
    }
    const duplicateInvoice = savedInvoices.find(
      (entry) =>
        String(entry.invoiceId ?? "") !== String(invoiceId || "") &&
        String(entry.invoiceNumber ?? "").trim().toLowerCase() ===
          String(invoiceForm.invoiceNumber ?? "").trim().toLowerCase()
    );
    if (duplicateInvoice) {
      issues.push("Invoice number already exists in the register.");
    }
    if (!isValidGstin(supplierForm.gstNumber)) {
      issues.push("Supplier GSTIN must be a valid 15-character GST number.");
    }
    if (!isValidGstin(buyerForm.gstNumber)) {
      issues.push("Buyer GSTIN must be a valid 15-character GST number.");
    }
    if (
      invoiceForm.invoiceDate &&
      invoiceForm.dueDate &&
      new Date(invoiceForm.dueDate) < new Date(invoiceForm.invoiceDate)
    ) {
      issues.push("Due date cannot be earlier than invoice date.");
    }
    if (!items.length) {
      issues.push("At least one invoice item is required.");
    }
    if (!String(notes.billTo || "").trim()) {
      issues.push("Bill-to address is required.");
    }
    if (!String(notes.shipTo || "").trim()) {
      issues.push("Ship-to address is required.");
    }
    items.forEach((item, index) => {
      const label = item.productName || item.productCode || `Row ${index + 1}`;
      if (!String(item.hsn || "").trim()) {
        issues.push(`${label}: HSN is required.`);
      }
      if (toNumber(item.receivedQty) <= 0) {
        issues.push(`${label}: quantity must be greater than zero.`);
      }
      if (toNumber(item.orderedQty) > 0 && toNumber(item.receivedQty) > toNumber(item.orderedQty)) {
        issues.push(`${label}: quantity cannot exceed ordered quantity.`);
      }
    });
    return issues;
  }, [
    buyerForm.gstNumber,
    invoiceForm,
    invoiceId,
    items,
    notes.billTo,
    notes.shipTo,
    savedInvoices,
    selectedReceiptId,
    supplierForm.gstNumber,
  ]);

  const updateItem = (id, field, value) => {
    setItems((current) => current.map((item) => (item.id === id ? { ...item, [field]: value } : item)));
  };

  const updateParty = (setter, field, value) => {
    setter((current) => ({
      ...current,
      [field]: value,
      ...(field === "gstNumber" ? { stateCode: stateCodeFromGstin(value) || current.stateCode } : {}),
    }));
  };

  const upsertSearchParams = (nextInvoiceId, nextReceiptId) => {
    const nextParams = new URLSearchParams(searchParams);
    if (nextInvoiceId) {
      nextParams.set("invoiceId", String(nextInvoiceId));
    } else {
      nextParams.delete("invoiceId");
    }
    if (nextReceiptId) {
      nextParams.set("receiptId", String(nextReceiptId));
    } else {
      nextParams.delete("receiptId");
    }
    setSearchParams(nextParams, { replace: true });
  };

  const buildPayload = (nextStatus = status) => ({
    invoiceNumber: invoiceForm.invoiceNumber.trim(),
    status: nextStatus,
    invoiceDate: invoiceForm.invoiceDate || null,
    dueDate: invoiceForm.dueDate || null,
    poReference: invoiceForm.poReference.trim(),
    paymentTerms: invoiceForm.paymentTerms,
    currency: invoiceForm.currency,
    taxMode: invoiceForm.taxMode,
    placeOfSupply: invoiceForm.placeOfSupply.trim(),
    reverseCharge: invoiceForm.reverseCharge,
    irn: invoiceForm.irn.trim(),
    qrReference: invoiceForm.qrReference.trim(),
    receiveGoodsId: selectedReceipt?.receiveGoodsId ?? selectedReceipt?.id ?? null,
    purchaseOrderId: selectedReceipt?.purchaseOrderId ?? null,
    vendorId: selectedReceipt?.vendorId ?? null,
    projectId: selectedReceipt?.projectId ?? null,
    supplier: supplierForm,
    buyer: buyerForm,
    items,
    payment: {
      ...payment,
      status: derivePaymentStatus(payment.paidAmount, totals.grandTotal),
    },
    notes,
    documents: files,
    totals,
  });

  const persistInvoice = async (nextStatus) => {
    setShowValidation(true);
    if (["Submitted", "Approved"].includes(nextStatus) && validationIssues.length) {
      setSaveMessage("Fix validation issues before moving the invoice forward.");
      return;
    }
    if (nextStatus === "Rejected" && !String(notes.rejectionReason || "").trim()) {
      setSaveMessage("Add a rejection reason before rejecting the invoice.");
      return;
    }

    try {
      setIsSaving(true);
      setSaveMessage("");
      const payload = buildPayload(nextStatus);
      const savedInvoice = invoiceId
        ? await updateInvoice(invoiceId, payload)
        : await createInvoice(payload);

      hydrateFromInvoice(savedInvoice);
      upsertSearchParams(savedInvoice.invoiceId, savedInvoice.receiveGoodsId);
      setSaveMessage(`Invoice ${savedInvoice.invoiceNumber} saved as ${savedInvoice.status}.`);
      setTimeout(setBaseline, 0);
    } catch (error) {
      setSaveMessage(error?.response?.data?.error || error?.message || "Failed to save invoice.");
    } finally {
      setIsSaving(false);
    }
  };

  const markPayment = async (nextPaymentStatus) => {
    if (!invoiceId) {
      setSaveMessage("Save the invoice before updating payment status.");
      return;
    }
    const nextPaidAmount =
      nextPaymentStatus === "Paid"
        ? totals.grandTotal
        : nextPaymentStatus === "Partially Paid" && toNumber(payment.paidAmount) <= 0
        ? Math.max(Math.round(totals.grandTotal / 2), 0)
        : nextPaymentStatus === "Unpaid"
        ? 0
        : payment.paidAmount;

    const nextPayment = {
      ...payment,
      status: nextPaymentStatus,
      paidAmount: nextPaidAmount,
      paymentDate:
        nextPaymentStatus === "Unpaid"
          ? ""
          : payment.paymentDate || new Date().toISOString().slice(0, 10),
    };

    setPayment(nextPayment);

    try {
      setIsSaving(true);
      setSaveMessage("");
      const payload = {
        ...buildPayload(status),
        payment: nextPayment,
      };
      const savedInvoice = await updateInvoice(invoiceId, payload);
      hydrateFromInvoice(savedInvoice);
      upsertSearchParams(savedInvoice.invoiceId, savedInvoice.receiveGoodsId);
      setSaveMessage(`Payment updated: ${derivePaymentStatus(nextPaidAmount, totals.grandTotal)}.`);
      setTimeout(setBaseline, 0);
    } catch (error) {
      setSaveMessage(error?.response?.data?.error || error?.message || "Failed to update payment.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    if (invoiceId) {
      navigate("/inventory/invoices");
      return;
    }
    applySnapshot(baselineRef.current);
    setSaveMessage("Unsaved changes were cleared.");
    setShowValidation(false);
  };

  const handleReceiptChange = (value) => {
    if (invoiceId || !["Draft", "Rejected"].includes(status)) {
      return;
    }
    setSelectedReceiptId(value);
    setSaveMessage("");
    if (invoiceId) {
      setInvoiceId("");
      upsertSearchParams("", value);
    } else {
      upsertSearchParams("", value);
    }
  };

  const handleAddRow = () => {
    setItems((current) => [...current, createBlankItem()]);
  };

  const handleDuplicateRow = (id) => {
    const source = items.find((item) => item.id === id);
    if (!source) {
      return;
    }
    setItems((current) => [...current, createBlankItem({ ...source, id: undefined })]);
  };

  const handleDeleteRow = (id) => {
    setItems((current) => current.filter((item) => item.id !== id));
  };

  const handleUpload = async (event) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    try {
      const document = await readDocument(file);
      setFiles((current) => [...current, document]);
    } catch (error) {
      setSaveMessage(error?.message || "Failed to upload attachment.");
    } finally {
      event.target.value = "";
    }
  };

  const openPrintableWindow = (autoPrint) => {
    const popup = window.open("", "_blank", "noopener,noreferrer");
    if (!popup) {
      setSaveMessage("Allow pop-ups in the browser to print or export this invoice.");
      return;
    }
    popup.document.open();
    popup.document.write(
      renderInvoiceDocument({
        status,
        supplierForm,
        buyerForm,
        invoiceForm,
        items,
        payment,
        notes,
        totals,
      })
    );
    popup.document.close();
    if (autoPrint) {
      popup.focus();
      popup.print();
    }
  };

  const canSaveDraft = !isSaving && Boolean(selectedReceiptId);
  const canSubmit = !isSaving && ["Draft", "Rejected"].includes(status) && !validationIssues.length;
  const canApprove = !isSaving && status === "Submitted" && !validationIssues.length;
  const canReject = !isSaving && status === "Submitted";
  const canReopen = !isSaving && ["Submitted", "Approved", "Rejected"].includes(status);
  const paymentStatus = derivePaymentStatus(payment.paidAmount, totals.grandTotal);
  const isDraftStage = ["Draft", "Rejected"].includes(status);
  const isInvoiceLocked = !isDraftStage;
  const isSourceLocked = Boolean(invoiceId) || !isDraftStage;
  const canMarkPartiallyPaid = !isSaving && status === "Approved" && paymentStatus === "Unpaid";
  const canMarkPaid = !isSaving && status === "Approved" && paymentStatus !== "Paid";
  const canMarkUnpaid = !isSaving && status === "Approved" && paymentStatus !== "Unpaid";
  const amountInWords = formatAmountInWords(totals.grandTotal);

  const workflowSteps = [
    { key: "Draft", label: "1. Draft", active: status === "Draft", complete: status !== "Draft" },
    {
      key: "Submitted",
      label: "2. Submitted",
      active: status === "Submitted",
      complete: ["Approved", "Rejected"].includes(status),
    },
    {
      key: "Approved",
      label: "3. Approved",
      active: status === "Approved" && paymentStatus !== "Paid",
      complete: status === "Approved" && paymentStatus === "Paid",
    },
    {
      key: "Paid",
      label: "4. Paid",
      active: status === "Approved" && paymentStatus === "Paid",
      complete: false,
    },
  ];

  let actionHint = "Save your draft anytime, then submit once the invoice is complete.";
  if (!selectedReceiptId) {
    actionHint = "Select a received-goods record to start the invoice.";
  } else if (status === "Draft" && validationIssues.length) {
    actionHint = `Complete ${validationIssues.length} validation item${
      validationIssues.length === 1 ? "" : "s"
    } before submitting.`;
  } else if (status === "Submitted") {
    actionHint = "This invoice is awaiting review. Approve it or send it back as rejected.";
  } else if (status === "Approved") {
    actionHint =
      paymentStatus === "Paid"
        ? "This invoice is approved and fully paid."
        : "This invoice is approved. Record payment progress or reopen only if corrections are needed.";
  } else if (status === "Rejected") {
    actionHint = "This invoice was rejected. Reopen or resubmit it after corrections.";
  }

  const receiptOptions = receipts.map((receipt) => {
    const po = purchaseOrderMap.get(normalizeKey(receipt.purchaseOrderId));
    return {
      id: normalizeKey(receipt.receiveGoodsId ?? receipt.id),
      label: buildReceiptLabel(receipt, po),
    };
  });

  const timelineLabel =
    paymentStatus === "Paid" && status === "Approved" ? "Approved & Paid" : status;

  if (isLoading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center text-slate-600">
        <LoaderCircle className="mr-2 h-5 w-5 animate-spin" />
        Loading invoice workspace...
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1560px] space-y-6 p-4 pb-32 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">Inventory</p>
          <h1 className="mt-1 text-2xl font-semibold text-slate-900">Invoice Workspace</h1>
          <p className="mt-1 text-sm text-slate-500">
            Create, review, approve, and track invoice payment in one place.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            to="/inventory/invoices"
            className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
          >
            <ArrowLeft className="h-4 w-4" />
            Invoice Register
          </Link>
          <span
            className={`inline-flex rounded-full border px-3 py-1 text-xs font-bold ${
              statusStyles[status] ?? statusStyles.Draft
            }`}
          >
            {timelineLabel}
          </span>
        </div>
      </div>

      {loadError ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {loadError}
        </div>
      ) : null}
      {saveMessage ? (
        <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-700">
          {saveMessage}
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryStat label="Invoice No" value={invoiceForm.invoiceNumber || "Pending"} />
        <SummaryStat label="Vendor" value={supplierForm.name || "Not selected"} />
        <SummaryStat label="Invoice Date" value={formatDate(invoiceForm.invoiceDate)} />
        <SummaryStat label="Grand Total" value={formatInrCurrency(totals.grandTotal)} tone="accent" />
      </div>

      <div className="grid gap-6 2xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-6">
          <Card
            title="Source Receipt"
            action={
              <button
                type="button"
                onClick={() => void loadSources()}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700"
              >
                <RefreshCw className="h-4 w-4" />
                Refresh
              </button>
            }
          >
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Received Goods" required>
                <select
                  className={inputBaseClass}
                  disabled={isSourceLocked}
                  value={selectedReceiptId}
                  onChange={(event) => handleReceiptChange(event.target.value)}
                >
                  <option value="">Select received goods</option>
                  {receiptOptions.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </Field>
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                <div>Receipt Date: {formatDate(selectedReceipt?.receivedDate)}</div>
                <div className="mt-1">
                  Purchase Order: {selectedReceipt?.purchaseOrderId ? `PO-${selectedReceipt.purchaseOrderId}` : "-"}
                </div>
                <div className="mt-1">
                  Existing receipt invoice: {selectedReceipt?.invoiceNumber || "-"}
                </div>
                <div className="mt-1">
                  Source Lock: {isSourceLocked ? "Locked after save/submission" : "Editable"}
                </div>
              </div>
            </div>
          </Card>

          <Card title="Invoice Details">
            <fieldset disabled={isInvoiceLocked} className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              <Field label="Invoice Number" required>
                <input
                  className={inputBaseClass}
                  value={invoiceForm.invoiceNumber}
                  onChange={(event) =>
                    setInvoiceForm((current) => ({ ...current, invoiceNumber: event.target.value }))
                  }
                />
              </Field>
              <Field label="Invoice Date" required>
                <DateInput
                  disabled={isInvoiceLocked}
                  showCalendarButton={!isInvoiceLocked}
                  value={invoiceForm.invoiceDate}
                  onChange={(value) => setInvoiceForm((current) => ({ ...current, invoiceDate: value }))}
                />
              </Field>
              <Field label="Due Date">
                <DateInput
                  disabled={isInvoiceLocked}
                  showCalendarButton={!isInvoiceLocked}
                  value={invoiceForm.dueDate}
                  onChange={(value) => setInvoiceForm((current) => ({ ...current, dueDate: value }))}
                />
              </Field>
              <Field label="PO Reference" required>
                <input
                  className={inputBaseClass}
                  value={invoiceForm.poReference}
                  onChange={(event) =>
                    setInvoiceForm((current) => ({ ...current, poReference: event.target.value }))
                  }
                />
              </Field>
              <Field label="Payment Terms">
                <select
                  className={inputBaseClass}
                  value={invoiceForm.paymentTerms}
                  onChange={(event) =>
                    setInvoiceForm((current) => ({ ...current, paymentTerms: event.target.value }))
                  }
                >
                  {paymentTerms.map((term) => (
                    <option key={term} value={term}>
                      {term}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Tax Mode">
                <select
                  className={inputBaseClass}
                  value={invoiceForm.taxMode}
                  onChange={(event) =>
                    setInvoiceForm((current) => ({ ...current, taxMode: event.target.value }))
                  }
                >
                  <option value="intra">Intra State</option>
                  <option value="inter">Inter State</option>
                </select>
              </Field>
              <Field label="Place Of Supply">
                <input
                  className={inputBaseClass}
                  value={invoiceForm.placeOfSupply}
                  onChange={(event) =>
                    setInvoiceForm((current) => ({ ...current, placeOfSupply: event.target.value }))
                  }
                />
              </Field>
              <Field label="Reverse Charge">
                <select
                  className={inputBaseClass}
                  value={invoiceForm.reverseCharge}
                  onChange={(event) =>
                    setInvoiceForm((current) => ({ ...current, reverseCharge: event.target.value }))
                  }
                >
                  <option value="No">No</option>
                  <option value="Yes">Yes</option>
                </select>
              </Field>
              <Field label="IRN">
                <input
                  className={inputBaseClass}
                  value={invoiceForm.irn}
                  onChange={(event) =>
                    setInvoiceForm((current) => ({ ...current, irn: event.target.value }))
                  }
                />
              </Field>
              <Field label="QR Reference">
                <input
                  className={inputBaseClass}
                  value={invoiceForm.qrReference}
                  onChange={(event) =>
                    setInvoiceForm((current) => ({ ...current, qrReference: event.target.value }))
                  }
                />
              </Field>
            </fieldset>
          </Card>

          <Card title="Supplier And Buyer">
            <fieldset disabled={isInvoiceLocked} className="grid gap-6 lg:grid-cols-2">
              <div className="space-y-4">
                <h3 className="text-sm font-semibold text-slate-900">Supplier</h3>
                <div className="grid gap-4 md:grid-cols-2">
                  <Field label="Vendor Name" required>
                    <input
                      className={inputBaseClass}
                      value={supplierForm.name}
                      onChange={(event) => updateParty(setSupplierForm, "name", event.target.value)}
                    />
                  </Field>
                  <Field label="Contact Person">
                    <input
                      className={inputBaseClass}
                      value={supplierForm.contactPerson}
                      onChange={(event) =>
                        updateParty(setSupplierForm, "contactPerson", event.target.value)
                      }
                    />
                  </Field>
                  <Field label="Phone">
                    <input
                      className={inputBaseClass}
                      value={supplierForm.phone}
                      onChange={(event) => updateParty(setSupplierForm, "phone", event.target.value)}
                    />
                  </Field>
                  <Field label="Email">
                    <input
                      className={inputBaseClass}
                      value={supplierForm.email}
                      onChange={(event) => updateParty(setSupplierForm, "email", event.target.value)}
                    />
                  </Field>
                  <Field label="GSTIN" required>
                    <input
                      className={inputBaseClass}
                      value={supplierForm.gstNumber}
                      onChange={(event) =>
                        updateParty(setSupplierForm, "gstNumber", event.target.value.toUpperCase())
                      }
                    />
                  </Field>
                  <Field label="State">
                    <input
                      className={inputBaseClass}
                      value={supplierForm.state}
                      onChange={(event) => updateParty(setSupplierForm, "state", event.target.value)}
                    />
                  </Field>
                  <Field label="Address">
                    <textarea
                      className={inputBaseClass}
                      rows={3}
                      value={supplierForm.address}
                      onChange={(event) =>
                        updateParty(setSupplierForm, "address", event.target.value)
                      }
                    />
                  </Field>
                </div>
              </div>

              <div className="space-y-4">
                <h3 className="text-sm font-semibold text-slate-900">Buyer</h3>
                <div className="grid gap-4 md:grid-cols-2">
                  <Field label="Company Name" required>
                    <input
                      className={inputBaseClass}
                      value={buyerForm.companyName}
                      onChange={(event) => updateParty(setBuyerForm, "companyName", event.target.value)}
                    />
                  </Field>
                  <Field label="Contact Person">
                    <input
                      className={inputBaseClass}
                      value={buyerForm.contactPerson}
                      onChange={(event) =>
                        updateParty(setBuyerForm, "contactPerson", event.target.value)
                      }
                    />
                  </Field>
                  <Field label="Email">
                    <input
                      className={inputBaseClass}
                      value={buyerForm.email}
                      onChange={(event) => updateParty(setBuyerForm, "email", event.target.value)}
                    />
                  </Field>
                  <Field label="GSTIN" required>
                    <input
                      className={inputBaseClass}
                      value={buyerForm.gstNumber}
                      onChange={(event) =>
                        updateParty(setBuyerForm, "gstNumber", event.target.value.toUpperCase())
                      }
                    />
                  </Field>
                  <Field label="State">
                    <input
                      className={inputBaseClass}
                      value={buyerForm.state}
                      onChange={(event) => updateParty(setBuyerForm, "state", event.target.value)}
                    />
                  </Field>
                  <Field label="Address">
                    <textarea
                      className={inputBaseClass}
                      rows={3}
                      value={buyerForm.address}
                      onChange={(event) => updateParty(setBuyerForm, "address", event.target.value)}
                    />
                  </Field>
                </div>
              </div>
            </fieldset>
          </Card>

          <Card
            title="Invoice Items"
            action={
              <button
                type="button"
                onClick={handleAddRow}
                disabled={isInvoiceLocked}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700"
              >
                <Plus className="h-4 w-4" />
                Add Row
              </button>
            }
          >
            <div className="app-table-shell overflow-x-auto">
              <table className="min-w-[980px] w-full border-collapse text-sm">
                <thead className="bg-slate-100 text-slate-600">
                  <tr>
                    <th className="border-b border-slate-200 px-3 py-3 text-left font-semibold">Item</th>
                    <th className="border-b border-slate-200 px-3 py-3 text-left font-semibold">HSN</th>
                    <th className="border-b border-slate-200 px-3 py-3 text-left font-semibold">UOM</th>
                    <th className="border-b border-slate-200 px-3 py-3 text-left font-semibold">Ordered</th>
                    <th className="border-b border-slate-200 px-3 py-3 text-left font-semibold">Invoice Qty</th>
                    <th className="border-b border-slate-200 px-3 py-3 text-left font-semibold">Rate</th>
                    <th className="border-b border-slate-200 px-3 py-3 text-left font-semibold">Disc %</th>
                    <th className="border-b border-slate-200 px-3 py-3 text-left font-semibold">GST %</th>
                    <th className="border-b border-slate-200 px-3 py-3 text-left font-semibold">Taxable</th>
                    <th className="border-b border-slate-200 px-3 py-3 text-left font-semibold">Line Total</th>
                    <th className="border-b border-slate-200 px-3 py-3 text-left font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody className="bg-white align-top">
                  {items.map((item) => {
                    const line = calculateLine(item, invoiceForm.taxMode);
                    return [
                        <tr key={`${item.id}-main`} className="border-b border-slate-200">
                          <td className="px-3 py-3">
                            <div className="space-y-2">
                              <input
                                className={tableInputClass}
                                disabled={isInvoiceLocked}
                                value={item.productName}
                                onChange={(event) => updateItem(item.id, "productName", event.target.value)}
                                placeholder="Item name"
                              />
                              <input
                                className={tableInputClass}
                                disabled={isInvoiceLocked}
                                value={item.productCode}
                                onChange={(event) => updateItem(item.id, "productCode", event.target.value)}
                                placeholder="Item code"
                              />
                            </div>
                          </td>
                          <td className="px-3 py-3">
                            <input
                              className={tableInputClass}
                              disabled={isInvoiceLocked}
                              value={item.hsn}
                              onChange={(event) => updateItem(item.id, "hsn", event.target.value)}
                            />
                          </td>
                          <td className="px-3 py-3">
                            <input
                              className={tableInputClass}
                              disabled={isInvoiceLocked}
                              value={item.uom}
                              onChange={(event) => updateItem(item.id, "uom", event.target.value)}
                            />
                          </td>
                          <td className="px-3 py-3">
                            <input
                              className={tableInputClass}
                              disabled={isInvoiceLocked}
                              value={item.orderedQty}
                              onChange={(event) => updateItem(item.id, "orderedQty", event.target.value)}
                            />
                          </td>
                          <td className="px-3 py-3">
                            <input
                              className={tableInputClass}
                              disabled={isInvoiceLocked}
                              value={item.receivedQty}
                              onChange={(event) => updateItem(item.id, "receivedQty", event.target.value)}
                            />
                          </td>
                          <td className="px-3 py-3">
                            <input
                              className={tableInputClass}
                              disabled={isInvoiceLocked}
                              value={item.unitPrice}
                              onChange={(event) => updateItem(item.id, "unitPrice", event.target.value)}
                            />
                          </td>
                          <td className="px-3 py-3">
                            <input
                              className={tableInputClass}
                              disabled={isInvoiceLocked}
                              value={item.discount}
                              onChange={(event) => updateItem(item.id, "discount", event.target.value)}
                            />
                          </td>
                          <td className="px-3 py-3">
                            <input
                              className={tableInputClass}
                              disabled={isInvoiceLocked}
                              value={item.tax}
                              onChange={(event) => updateItem(item.id, "tax", event.target.value)}
                            />
                          </td>
                          <td className="px-3 py-3 text-slate-700">{formatInrCurrency(line.taxable)}</td>
                          <td className="px-3 py-3 font-semibold text-slate-900">
                            {formatInrCurrency(line.lineTotal)}
                          </td>
                          <td className="px-3 py-3">
                            <div className="flex flex-col gap-2">
                              <button
                                type="button"
                                disabled={isInvoiceLocked}
                                onClick={() => handleDuplicateRow(item.id)}
                                className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs font-medium text-slate-700"
                              >
                                <Plus className="h-3.5 w-3.5" />
                                Duplicate
                              </button>
                              <button
                                type="button"
                                disabled={isInvoiceLocked}
                                onClick={() => handleDeleteRow(item.id)}
                                className="inline-flex items-center justify-center gap-2 rounded-lg border border-red-200 bg-red-50 px-2.5 py-2 text-xs font-medium text-red-700"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                                Delete
                              </button>
                            </div>
                          </td>
                        </tr>,
                        <tr key={`${item.id}-meta`} className="border-b border-slate-200 bg-slate-50/60">
                          <td className="px-3 py-3" colSpan={11}>
                            <div className="grid gap-3 md:grid-cols-[2fr,1fr,1fr]">
                              <input
                                className={tableInputClass}
                                disabled={isInvoiceLocked}
                                value={item.description}
                                onChange={(event) => updateItem(item.id, "description", event.target.value)}
                                placeholder="Description"
                              />
                              <input
                                className={tableInputClass}
                                disabled={isInvoiceLocked}
                                value={item.batchNo}
                                onChange={(event) => updateItem(item.id, "batchNo", event.target.value)}
                                placeholder="Batch no"
                              />
                              <DateInput
                                showCalendarButton={!isInvoiceLocked}
                                disabled={isInvoiceLocked}
                                value={item.expiryDate}
                                onChange={(value) => updateItem(item.id, "expiryDate", value)}
                              />
                            </div>
                          </td>
                        </tr>,
                      ];
                  })}
                </tbody>
              </table>
            </div>
          </Card>

          <Card title="Attachments">
            <input ref={fileInputRef} type="file" className="hidden" onChange={handleUpload} />
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                disabled={isInvoiceLocked}
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700"
              >
                <Paperclip className="h-4 w-4" />
                Upload Attachment
              </button>
            </div>
            <div className="mt-4 space-y-3">
              {files.length ? (
                files.map((file) => (
                  <div
                    key={file.id || file.name}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 px-4 py-3"
                  >
                    <div>
                      <div className="text-sm font-medium text-slate-900">{file.name}</div>
                      <div className="text-xs text-slate-500">
                        {file.type || "File"} • {Math.max(1, Math.round((Number(file.size) || 0) / 1024))} KB
                      </div>
                    </div>
                    <button
                      type="button"
                      disabled={isInvoiceLocked}
                      onClick={() => setFiles((current) => current.filter((entry) => entry !== file))}
                      className="inline-flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700"
                    >
                      <Trash2 className="h-4 w-4" />
                      Remove
                    </button>
                  </div>
                ))
              ) : (
                <div className="rounded-lg border border-dashed border-slate-300 px-4 py-8 text-center text-sm text-slate-500">
                  No attachments uploaded yet.
                </div>
              )}
            </div>
          </Card>

          <Card title="Addresses, Notes And Payment">
            <div className="grid gap-6">
              <fieldset disabled={isInvoiceLocked} className="grid gap-4 md:grid-cols-2">
                <Field label="Bill To" required>
                  <textarea
                    className={inputBaseClass}
                    rows={4}
                    value={notes.billTo}
                    onChange={(event) => setNotes((current) => ({ ...current, billTo: event.target.value }))}
                  />
                </Field>
                <Field label="Ship To" required>
                  <textarea
                    className={inputBaseClass}
                    rows={4}
                    value={notes.shipTo}
                    onChange={(event) => setNotes((current) => ({ ...current, shipTo: event.target.value }))}
                  />
                </Field>
                <Field label="Internal Notes">
                  <textarea
                    className={inputBaseClass}
                    rows={3}
                    value={notes.internal}
                    onChange={(event) => setNotes((current) => ({ ...current, internal: event.target.value }))}
                  />
                </Field>
                <Field label="Supplier Notes">
                  <textarea
                    className={inputBaseClass}
                    rows={3}
                    value={notes.supplier}
                    onChange={(event) => setNotes((current) => ({ ...current, supplier: event.target.value }))}
                  />
                </Field>
                <Field label="Delivery Notes">
                  <textarea
                    className={inputBaseClass}
                    rows={3}
                    value={notes.delivery}
                    onChange={(event) => setNotes((current) => ({ ...current, delivery: event.target.value }))}
                  />
                </Field>
                <Field label="Terms & Conditions">
                  <textarea
                    className={inputBaseClass}
                    rows={5}
                    value={notes.terms}
                    onChange={(event) => setNotes((current) => ({ ...current, terms: event.target.value }))}
                  />
                </Field>
                <Field label="Footer Note">
                  <textarea
                    className={inputBaseClass}
                    rows={3}
                    value={notes.footerNote}
                    onChange={(event) => setNotes((current) => ({ ...current, footerNote: event.target.value }))}
                  />
                </Field>
              </fieldset>

              <div className="grid gap-6 lg:grid-cols-[2fr,1fr]">
                <div className="grid gap-4 md:grid-cols-2">
                  <Field label="Payment Mode">
                    <select
                      className={inputBaseClass}
                      disabled={status !== "Approved"}
                      value={payment.mode}
                      onChange={(event) => setPayment((current) => ({ ...current, mode: event.target.value }))}
                    >
                      {paymentModes.map((entry) => (
                        <option key={entry} value={entry}>
                          {entry}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Payment Status">
                    <input className={inputBaseClass} disabled value={paymentStatus} />
                  </Field>
                  <Field label="Bank Name">
                    <input
                      className={inputBaseClass}
                      disabled={status !== "Approved"}
                      value={payment.bankName}
                      onChange={(event) => setPayment((current) => ({ ...current, bankName: event.target.value }))}
                    />
                  </Field>
                  <Field label="Account Number">
                    <input
                      className={inputBaseClass}
                      disabled={status !== "Approved"}
                      value={payment.accountNumber}
                      onChange={(event) =>
                        setPayment((current) => ({ ...current, accountNumber: event.target.value }))
                      }
                    />
                  </Field>
                  <Field label="IFSC">
                    <input
                      className={inputBaseClass}
                      disabled={status !== "Approved"}
                      value={payment.ifsc}
                      onChange={(event) => setPayment((current) => ({ ...current, ifsc: event.target.value }))}
                    />
                  </Field>
                  <Field label="Reference Number">
                    <input
                      className={inputBaseClass}
                      disabled={status !== "Approved"}
                      value={payment.referenceNumber}
                      onChange={(event) =>
                        setPayment((current) => ({ ...current, referenceNumber: event.target.value }))
                      }
                    />
                  </Field>
                  <Field label="Payment Date">
                    <DateInput
                      disabled={status !== "Approved"}
                      showCalendarButton={status === "Approved"}
                      value={payment.paymentDate}
                      onChange={(value) => setPayment((current) => ({ ...current, paymentDate: value }))}
                    />
                  </Field>
                  <Field label="Paid Amount">
                    <input
                      className={inputBaseClass}
                      disabled={status !== "Approved"}
                      value={payment.paidAmount}
                      onChange={(event) => setPayment((current) => ({ ...current, paidAmount: event.target.value }))}
                    />
                  </Field>
                </div>

                <div className="space-y-4">
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                      Payment Workflow
                    </div>
                    <div className="mt-2 text-sm text-slate-600">
                      Payment can be recorded after approval. The due amount updates automatically.
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={!canMarkPartiallyPaid}
                        onClick={() => void markPayment("Partially Paid")}
                        className={`${actionButtonClass} border border-amber-200 bg-amber-50 text-amber-700`}
                      >
                        Mark Partially Paid
                      </button>
                      <button
                        type="button"
                        disabled={!canMarkPaid}
                        onClick={() => void markPayment("Paid")}
                        className={`${actionButtonClass} border border-green-600 bg-green-600 text-white`}
                      >
                        Mark Paid
                      </button>
                      <button
                        type="button"
                        disabled={!canMarkUnpaid}
                        onClick={() => void markPayment("Unpaid")}
                        className={`${actionButtonClass} border border-slate-200 bg-white text-slate-700`}
                      >
                        Reset Unpaid
                      </button>
                    </div>
                  </div>
                  <Field label="Approval Comment">
                    <textarea
                      className={inputBaseClass}
                      rows={3}
                      disabled={status !== "Submitted" && status !== "Approved"}
                      value={notes.approvalComment}
                      onChange={(event) =>
                        setNotes((current) => ({ ...current, approvalComment: event.target.value }))
                      }
                    />
                  </Field>
                  <Field label="Rejection Reason">
                    <textarea
                      className={inputBaseClass}
                      rows={3}
                      disabled={status !== "Submitted" && status !== "Rejected"}
                      value={notes.rejectionReason}
                      onChange={(event) =>
                        setNotes((current) => ({ ...current, rejectionReason: event.target.value }))
                      }
                    />
                  </Field>
                </div>
              </div>
            </div>
          </Card>
        </div>

        <div className="grid gap-6 md:grid-cols-2 2xl:grid-cols-1 2xl:self-start">
          <Card title="Workflow">
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                {workflowSteps.map((step) => (
                  <div
                    key={step.key}
                    className={`rounded-lg border px-4 py-3 text-sm ${
                      step.active
                        ? "border-blue-300 bg-blue-50 text-blue-700"
                        : step.complete
                        ? "border-green-200 bg-green-50 text-green-700"
                        : "border-slate-200 bg-slate-50 text-slate-500"
                    }`}
                  >
                    <div className="font-semibold">{step.label}</div>
                    <div className="mt-1 text-xs uppercase tracking-[0.2em]">
                      {step.active ? "Current" : step.complete ? "Done" : "Next"}
                    </div>
                  </div>
                ))}
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                {actionHint}
              </div>
            </div>
          </Card>

          <Card title="Validation">
            {showValidation && validationIssues.length ? (
              <div className="space-y-2">
                {validationIssues.map((issue) => (
                  <div
                    key={issue}
                    className="rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-700"
                  >
                    {issue}
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-lg border border-green-100 bg-green-50 px-3 py-2 text-sm text-green-700">
                <CheckCircle2 className="mr-2 inline h-4 w-4" />
                {validationIssues.length
                  ? "Validation will appear when you try to submit or approve."
                  : "Invoice is ready to save and move forward."}
              </div>
            )}
          </Card>

          <Card title="Totals">
            <div className="space-y-3 text-sm text-slate-700">
              <div className="flex items-center justify-between">
                <span>Total Items</span>
                <strong>{totals.totalItems}</strong>
              </div>
              <div className="flex items-center justify-between">
                <span>Total Quantity</span>
                <strong>{totals.totalQuantity.toLocaleString("en-IN")}</strong>
              </div>
              <div className="flex items-center justify-between">
                <span>Subtotal</span>
                <strong>{formatInrCurrency(totals.subtotal)}</strong>
              </div>
              <div className="flex items-center justify-between">
                <span>Discount</span>
                <strong>{formatInrCurrency(totals.discount)}</strong>
              </div>
              <div className="flex items-center justify-between">
                <span>Taxable</span>
                <strong>{formatInrCurrency(totals.taxable)}</strong>
              </div>
              <div className="flex items-center justify-between">
                <span>CGST / SGST</span>
                <strong>
                  {formatInrCurrency(totals.cgst)} / {formatInrCurrency(totals.sgst)}
                </strong>
              </div>
              <div className="flex items-center justify-between">
                <span>IGST</span>
                <strong>{formatInrCurrency(totals.igst)}</strong>
              </div>
              <div className="flex items-center justify-between">
                <span>Tax</span>
                <strong>{formatInrCurrency(totals.taxAmount)}</strong>
              </div>
              <div className="flex items-center justify-between">
                <span>Round Off</span>
                <strong>{formatInrCurrency(totals.roundOff)}</strong>
              </div>
              <div className="flex items-center justify-between text-base font-semibold text-slate-950">
                <span>Grand Total</span>
                <span>{formatInrCurrency(totals.grandTotal)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Due Amount</span>
                <strong>{formatInrCurrency(totals.dueAmount)}</strong>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 text-xs leading-6 text-slate-600">
                Amount in words: <span className="font-semibold text-slate-900">{amountInWords}</span>
              </div>
            </div>
          </Card>

          <Card title="Live Preview">
            <div className="space-y-4">
              <PreviewBlock title="Header">
                <div className="flex items-center justify-between gap-3">
                  <span>{invoiceForm.invoiceNumber || "Pending Invoice No"}</span>
                  <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${statusStyles[status]}`}>
                    {timelineLabel}
                  </span>
                </div>
                <div>Date: {formatDate(invoiceForm.invoiceDate)}</div>
                <div>Due: {formatDate(invoiceForm.dueDate)}</div>
                <div>PO Ref: {invoiceForm.poReference || "-"}</div>
              </PreviewBlock>

              <PreviewBlock title="Parties">
                <div className="font-medium text-slate-900">{supplierForm.name || "Supplier"}</div>
                <div>{supplierForm.address || "-"}</div>
                <div>GSTIN: {supplierForm.gstNumber || "-"}</div>
                <div className="pt-2 font-medium text-slate-900">{buyerForm.companyName || "Buyer"}</div>
                <div>{notes.billTo || buyerForm.address || "-"}</div>
                <div>Ship To: {notes.shipTo || "-"}</div>
              </PreviewBlock>

              <PreviewBlock title="Line Snapshot">
                {items.length ? (
                  items.slice(0, 5).map((item) => {
                    const line = calculateLine(item, invoiceForm.taxMode);
                    return (
                      <div key={`preview-${item.id}`} className="flex items-start justify-between gap-3">
                        <div>
                          <div className="font-medium text-slate-900">{item.productName || item.productCode || "-"}</div>
                          <div className="text-xs text-slate-500">
                            {item.receivedQty || 0} {item.uom || "PCS"} x {formatInrCurrency(item.unitPrice || 0)}
                          </div>
                        </div>
                        <div className="text-right font-medium text-slate-900">
                          {formatInrCurrency(line.lineTotal)}
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div>No items added yet.</div>
                )}
              </PreviewBlock>

              <PreviewBlock title="Terms">
                <div className="whitespace-pre-line">{notes.terms || defaultTermsText}</div>
              </PreviewBlock>
            </div>
          </Card>
        </div>
      </div>

      <div className="sticky bottom-3 z-30 rounded-xl border border-slate-200 bg-white/95 p-3 shadow-lg backdrop-blur">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            onClick={handleCancel}
            className={`${actionButtonClass} border border-slate-200 bg-white text-slate-700`}
          >
            <XCircle className="h-4 w-4" />
            {invoiceId ? "Back To Register" : "Reset Draft"}
          </button>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <button
              type="button"
              disabled={!canSaveDraft}
              onClick={() => void persistInvoice("Draft")}
              className={`${actionButtonClass} border border-slate-200 bg-white text-slate-700`}
              title={selectedReceiptId ? "Save current work as draft." : "Select a receipt before saving."}
            >
              <Save className="h-4 w-4" />
              {status === "Draft" ? "Save Draft" : "Save Changes"}
            </button>
            <button
              type="button"
              disabled={!canSubmit}
              onClick={() => void persistInvoice("Submitted")}
              className={`${actionButtonClass} border border-blue-600 bg-blue-600 text-white`}
              title={canSubmit ? "Submit this invoice for review." : actionHint}
            >
              {isSaving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Submit
            </button>
            <button
              type="button"
              disabled={!canApprove}
              onClick={() => void persistInvoice("Approved")}
              className={`${actionButtonClass} border border-green-600 bg-green-600 text-white`}
              title={canApprove ? "Approve this submitted invoice." : actionHint}
            >
              <CheckCircle2 className="h-4 w-4" />
              Approve
            </button>
            <button
              type="button"
              disabled={!canReject}
              onClick={() => void persistInvoice("Rejected")}
              className={`${actionButtonClass} border border-red-200 bg-red-50 text-red-700`}
              title={canReject ? "Reject this submitted invoice." : actionHint}
            >
              <AlertTriangle className="h-4 w-4" />
              Reject
            </button>
            <button
              type="button"
              disabled={!canReopen}
              onClick={() => void persistInvoice("Draft")}
              className={`${actionButtonClass} border border-amber-200 bg-amber-50 text-amber-700`}
              title={canReopen ? "Move this invoice back to draft for edits." : actionHint}
            >
              <RotateCcw className="h-4 w-4" />
              Reopen Draft
            </button>
            <button
              type="button"
              onClick={() => openPrintableWindow(true)}
              className={`${actionButtonClass} border border-slate-200 bg-white text-slate-700`}
            >
              <Printer className="h-4 w-4" />
              Print
            </button>
            <button
              type="button"
              onClick={() => openPrintableWindow(false)}
              className={`${actionButtonClass} border border-slate-200 bg-white text-slate-700`}
              title="Open a clean invoice view, then use the browser's Save as PDF option."
            >
              <Download className="h-4 w-4" />
              Open For PDF
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Invoice;
