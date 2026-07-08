import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { getProjects } from "../../services/projectsStore";
import { fetchVendors } from "../../services/vendorsApi";
import { fetchLocations } from "../../services/locationsApi";
import { fetchPurchaseOrders } from "../../services/purchaseOrdersApi";
import {
  fetchReceiveGoods,
  saveReceiveGoods,
  updateReceiveGoods,
} from "../../services/receiveGoodsApi";
import useSettings from "../../hooks/useSettings";
import DateInput from "../common/DateInput";
import { formatDate } from "../../utils/dateFormat";
import { resolveBrandLogo } from "../../utils/branding";
import { buildGstSummary } from "../../utils/taxUtils";
import {
  buildReceiveBillFromText,
  buildReceiveProjectDetailLines,
  buildReceiveShipToText,
  buildReceiveVendorAddressText,
  isReceiveProjectDetailsVisible,
  splitDocumentText,
} from "../../utils/receiveGoodsDocument";
import DocumentViewPanel from "./DocumentViewPanel";
import {
  getPurchaseOrderLockMessage,
  isLockedPurchaseOrder,
} from "../../utils/purchaseOrderStatus";
import PasswordPromptModal from "../common/PasswordPromptModal";
import { getClosedPoAuthError } from "../../utils/closedPoAuth";
import { getGstTaxMode } from "../../utils/gstUtils";
import { formatInrCurrency, roundUnitPrice } from "../../utils/formatters";

const RECEIVE_STATUS_OPTIONS = ["Draft", "Partially Received", "Closed"];

const GstSummaryBlock = ({ summary, formatCurrency, align = "left" }) => {
  const alignClass = align === "right" ? "text-right" : "text-left";
  return (
    <div className={`space-y-1 text-sm text-slate-700 ${alignClass}`}>
      <div className="font-medium">Subtotal: {formatCurrency(summary.subtotal)}</div>
      {summary.igstGroups?.map((group) => (
        <div key={`igst-${group.rate}`}>
          IGST @ {Number(group.rate)}%: {formatCurrency(group.amount)}
        </div>
      ))}
      {summary.cgstGroups.map((group) => (
        <div key={`cgst-${group.rate}`}>
          CGST @ {Number(group.rate)}%: {formatCurrency(group.amount)}
        </div>
      ))}
      {summary.sgstGroups.map((group) => (
        <div key={`sgst-${group.rate}`}>
          SGST @ {Number(group.rate)}%: {formatCurrency(group.amount)}
        </div>
      ))}
      <div className="pt-1 font-semibold text-slate-900">
        Total Value: {formatCurrency(summary.total)}
      </div>
    </div>
  );
};

const getTodayDate = () => new Date().toISOString().slice(0, 10);
const toNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};
const getExplicitQuantity = (...values) => {
  for (const value of values) {
    if (value === undefined || value === null || value === "") {
      continue;
    }
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return null;
};
const getReceiptLineReceivedQty = (item = {}) => {
  const source = item ?? {};
  return toNumber(
    source.receiptReceivedQty ??
      source.ReceiptReceivedQty ??
      source.receivedQty ??
      source.ReceivedQty
  );
};
const getPoLineReceivedQty = (item = {}) => {
  const source = item ?? {};
  return toNumber(
    source.totalReceivedQty ??
      source.TotalReceivedQty ??
      source.receivedQty ??
      source.ReceivedQty
  );
};
const getPoLineRemainingQty = (item = {}, orderedQty = 0) => {
  const source = item ?? {};
  const explicitBalance = getExplicitQuantity(
    source.totalPoBalanceQty,
    source.TotalPoBalanceQty,
    source.poBalanceQty,
    source.PoBalanceQty,
    source.balanceQty,
    source.BalanceQty
  );

  return Math.max(
    explicitBalance ?? orderedQty - getPoLineReceivedQty(source),
    0
  );
};
const formatAddressLine = (vendor) => {
  const {
    address = "",
    city = "",
    state = "",
    pincode = "",
  } = vendor ?? {};

  return [address, [city, state, pincode].filter(Boolean).join(", ")]
    .filter(Boolean)
    .join(", ");
};
const getItemKey = (item = {}, index = 0) =>
  String(
    item.poItemId ??
      item.POItemId ??
      item.PurchaseOrderItemId ??
      item.itemId ??
      item.ItemId ??
      item.id ??
      item.Id ??
      index
  );

const findMatchingReceiptItem = (
  purchaseOrder,
  receiptItems = [],
  poItem = {},
  index = 0
) => {
  const receiptPoItemId =
    poItem.poItemId ??
    poItem.POItemId ??
    poItem.PurchaseOrderItemId ??
    poItem.purchaseOrderItemId ??
    poItem.Id ??
    poItem.id ??
    null;
  if (Number.isFinite(Number(receiptPoItemId))) {
    const match = receiptItems.find(
      (item) =>
        Number(
          item.poItemId ??
            item.POItemId ??
            item.PurchaseOrderItemId ??
            item.purchaseOrderItemId ??
            NaN
        ) === Number(receiptPoItemId)
    );
    if (match) {
      return match;
    }
  }

  const receiptItemId = poItem.itemId ?? poItem.ItemId ?? null;
  if (Number.isFinite(Number(receiptItemId))) {
    const match = receiptItems.find(
      (item) =>
        Number(item.itemId ?? item.ItemId ?? NaN) === Number(receiptItemId)
    );
    if (match) {
      return match;
    }
  }

  return receiptItems[index] ?? null;
};

const findMatchingPoItemIndex = (purchaseOrder, receiptItem = {}, index = 0) => {
  const poItems = Array.isArray(purchaseOrder?.items) ? purchaseOrder.items : [];
  if (!poItems.length) {
    return -1;
  }

  const receiptPoItemId =
    receiptItem.poItemId ??
    receiptItem.POItemId ??
    receiptItem.PurchaseOrderItemId ??
    receiptItem.purchaseOrderItemId ??
    null;
  if (Number.isFinite(Number(receiptPoItemId))) {
    const exactIndex = poItems.findIndex(
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
    const exactIndex = poItems.findIndex(
      (poItem) => Number(poItem.itemId ?? poItem.ItemId ?? NaN) === Number(receiptItemId)
    );
    if (exactIndex >= 0) {
      return exactIndex;
    }
  }

  return index >= 0 && index < poItems.length ? index : -1;
};

const SERIAL_HEADER_PATTERN = /^(serial(\s*(no|number|#))?|s\/n|sn)$/i;
const SERIAL_SPLIT_PATTERN = /[\r\n,;]+/g;

const normalizeSerialNumbers = (values = []) => {
  const normalizedValues = Array.isArray(values) ? values : [values];
  const seen = new Set();
  const result = [];
  normalizedValues.forEach((value) => {
    const serial = String(value ?? "").trim();
    if (!serial) return;
    const key = serial.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    result.push(serial);
  });
  return result;
};

const parseSerialNumbersFromText = (value = "") =>
  normalizeSerialNumbers(String(value ?? "").split(SERIAL_SPLIT_PATTERN));

const getSerialInputText = (serialNumbers = []) =>
  normalizeSerialNumbers(serialNumbers).join("\n");

const getItemSerialNumbers = (item = {}) => {
  const serialFromText = parseSerialNumbersFromText(item.serialInput ?? "");
  if (serialFromText.length) {
    return serialFromText;
  }
  return normalizeSerialNumbers(item.serialNumbers);
};

const parseSerialNumbersFromSheetRows = (rows = []) => {
  if (!Array.isArray(rows) || !rows.length) {
    return [];
  }

  const firstRow = Array.isArray(rows[0]) ? rows[0] : [];
  const serialColumnIndex = firstRow.findIndex((cell) =>
    SERIAL_HEADER_PATTERN.test(String(cell ?? "").trim())
  );
  const fromRows =
    serialColumnIndex >= 0
      ? rows.slice(1).map((row) => (Array.isArray(row) ? row[serialColumnIndex] : ""))
      : rows.map((row) => {
          if (!Array.isArray(row)) {
            return row;
          }
          return row.find((cell) => String(cell ?? "").trim()) ?? "";
        });

  const values = fromRows.flatMap((cell) =>
    String(cell ?? "")
      .split(SERIAL_SPLIT_PATTERN)
      .map((part) => part.trim())
      .filter(Boolean)
  );
  return normalizeSerialNumbers(values);
};

const parseSerialNumbersFromExcelFile = async (file) => {
  if (!file) {
    return [];
  }
  const xlsx = await import("xlsx");
  const XLSX = xlsx?.default ?? xlsx;
  const workbook = XLSX.read(await file.arrayBuffer(), {
    type: "array",
    raw: false,
  });
  const firstSheetName = workbook?.SheetNames?.[0];
  if (!firstSheetName) {
    return [];
  }
  const firstSheet = workbook.Sheets[firstSheetName];
  const rows = XLSX.utils.sheet_to_json(firstSheet, {
    header: 1,
    raw: false,
    defval: "",
  });
  return parseSerialNumbersFromSheetRows(rows);
};

const compareReceiptChronologyAsc = (left = {}, right = {}) => {
  const leftTime = new Date(left.receivedDate ?? left.createdAt ?? 0).getTime() || 0;
  const rightTime = new Date(right.receivedDate ?? right.createdAt ?? 0).getTime() || 0;
  if (leftTime !== rightTime) {
    return leftTime - rightTime;
  }
  return toNumber(left.receiveGoodsId ?? left.id) - toNumber(right.receiveGoodsId ?? right.id);
};

const buildReceivedTotalsBeforeReceipt = (
  purchaseOrder,
  receiptHistory = [],
  targetReceiptId = ""
) => {
  const totals = {};
  const targetId = String(targetReceiptId || "");
  const poItems = Array.isArray(purchaseOrder?.items) ? purchaseOrder.items : [];

  [...(Array.isArray(receiptHistory) ? receiptHistory : [])]
    .sort(compareReceiptChronologyAsc)
    .some((receipt) => {
      if (targetId && String(receipt.id) === targetId) {
        return true;
      }
      (receipt.items || []).forEach((receiptItem, index) => {
        const matchedIndex = findMatchingPoItemIndex(purchaseOrder, receiptItem, index);
        if (matchedIndex < 0) {
          return;
        }
        const key = getItemKey(poItems[matchedIndex], matchedIndex);
        totals[key] = (totals[key] || 0) + getReceiptLineReceivedQty(receiptItem);
      });
      return false;
    });

  return totals;
};

const buildReceivedTotalsExcludingReceipt = (
  purchaseOrder,
  receiptHistory = [],
  excludeReceiptId = ""
) => {
  const totals = {};
  const excludeId = String(excludeReceiptId || "");
  const poItems = Array.isArray(purchaseOrder?.items) ? purchaseOrder.items : [];

  (Array.isArray(receiptHistory) ? receiptHistory : []).forEach((receipt) => {
    if (excludeId && String(receipt.id) === excludeId) {
      return;
    }
    (receipt.items || []).forEach((receiptItem, index) => {
      const matchedIndex = findMatchingPoItemIndex(purchaseOrder, receiptItem, index);
      if (matchedIndex < 0) {
        return;
      }
      const key = getItemKey(poItems[matchedIndex], matchedIndex);
      totals[key] = (totals[key] || 0) + getReceiptLineReceivedQty(receiptItem);
    });
  });

  return totals;
};

const computeReceiveStatus = (
  purchaseOrder,
  receiptHistory = [],
  items = [],
  editingReceiptId = null,
  fallback = "Draft"
) => {
  const poItems = Array.isArray(purchaseOrder?.items) ? purchaseOrder.items : [];
  if (!poItems.length) {
    return fallback;
  }

  const receivedTotals = buildReceivedTotalsExcludingReceipt(
    purchaseOrder,
    receiptHistory,
    editingReceiptId
  );

  (items || []).forEach((item, index) => {
    const key = getItemKey(item, index);
    receivedTotals[key] = (receivedTotals[key] || 0) + toNumber(item.receivedQty);
  });

  let anyReceived = false;
  const allReceived = poItems.every((item, index) => {
    const orderedQty = toNumber(item.quantity ?? item.orderedQty);
    const receivedQty = toNumber(receivedTotals[getItemKey(item, index)]);
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

const buildReceiveItems = (purchaseOrder, receiptHistory = [], receipt = null) => {
  const poItems = Array.isArray(purchaseOrder?.items) ? purchaseOrder.items : [];
  const receiptItems = Array.isArray(receipt?.items) ? receipt.items : [];
  const priorTotals = receipt
    ? buildReceivedTotalsBeforeReceipt(purchaseOrder, receiptHistory, receipt.id)
    : buildReceivedTotalsExcludingReceipt(purchaseOrder, receiptHistory);

  return poItems.map((item, index) => {
    const matched = findMatchingReceiptItem(purchaseOrder, receiptItems, item, index);
    const orderedQty = toNumber(item.quantity ?? item.orderedQty);
    const itemKey = getItemKey(item, index);
    const hasHistoryTotal = Object.prototype.hasOwnProperty.call(
      priorTotals,
      itemKey
    );
    const matchedReceivedQty = getReceiptLineReceivedQty(matched);
    const matchedAvailableBeforeQty = getExplicitQuantity(
      matched?.availableBalanceQty,
      matched?.AvailableBalanceQty
    );
    const fallbackPriorReceivedQty = receipt
      ? matchedAvailableBeforeQty !== null
        ? orderedQty - matchedAvailableBeforeQty
        : getPoLineReceivedQty(item) - matchedReceivedQty
      : Math.max(
          getPoLineReceivedQty(item),
          orderedQty - getPoLineRemainingQty(item, orderedQty)
        );
    const previouslyReceivedQty = Math.max(
      Math.min(
        orderedQty,
        hasHistoryTotal
          ? toNumber(priorTotals[itemKey])
          : fallbackPriorReceivedQty
      ),
      0
    );
    const pendingQty = Math.max(orderedQty - previouslyReceivedQty, 0);
    const receivedQty = Math.min(
      Math.max(matchedReceivedQty, 0),
      pendingQty
    );
    const savedSerialNumbers = normalizeSerialNumbers(matched?.serialNumbers);
    const defaultSerialNumbers =
      receipt || savedSerialNumbers.length
        ? savedSerialNumbers
        : parseSerialNumbersFromText(item.serialNumber ?? matched?.serialNumber ?? "");
    const serialNumber = String(item.serialNumber ?? matched?.serialNumber ?? "").trim();
    return {
      id: item.id ?? item.itemId ?? index,
      poItemId: item.poItemId ?? item.id ?? null,
      itemId: item.itemId ?? item.ItemId ?? null,
      name: item.name ?? matched?.name ?? "",
      description: item.description ?? matched?.description ?? "",
      unit: item.unit ?? matched?.unit ?? "PCS",
      serialRequired: Boolean(item.serialRequired ?? matched?.serialRequired),
      serialNumber,
      serialNumbers: defaultSerialNumbers,
      serialInput: getSerialInputText(defaultSerialNumbers),
      orderedQty,
      previouslyReceivedQty,
      availableBalanceQty: pendingQty,
      pendingQty,
      receivedQty,
      balanceQty: Math.max(pendingQty - receivedQty, 0),
    };
  });
};

const mergeHydratedReceiveItems = (nextItems = [], previousItems = []) => {
  if (!Array.isArray(nextItems) || !nextItems.length) {
    return [];
  }

  const previousItemsByKey = new Map(
    (Array.isArray(previousItems) ? previousItems : []).map((item, index) => [
      getItemKey(item, index),
      item,
    ])
  );

  return nextItems.map((item, index) => {
    const previousItem = previousItemsByKey.get(getItemKey(item, index));
    if (!previousItem) {
      return item;
    }

    const receivedQty = Math.max(
      0,
      Math.min(
        toNumber(previousItem.receivedQty),
        toNumber(item.availableBalanceQty ?? item.pendingQty ?? item.orderedQty)
      )
    );
    const serialNumbers = getItemSerialNumbers(previousItem);

    return {
      ...item,
      receivedQty,
      balanceQty: Math.max(
        toNumber(item.availableBalanceQty ?? item.pendingQty ?? item.orderedQty) - receivedQty,
        0
      ),
      serialNumbers,
      serialInput:
        typeof previousItem.serialInput === "string"
          ? previousItem.serialInput
          : getSerialInputText(serialNumbers),
    };
  });
};

const createReceiveForm = (
  purchaseOrder,
  receiptHistory = [],
  receipt = null,
  defaults = {}
) => {
  const items = buildReceiveItems(purchaseOrder, receiptHistory, receipt);
  return {
    receivedDate: receipt?.receivedDate || getTodayDate(),
    receivedBy: receipt?.receivedBy || "",
    invoiceNumber: receipt?.invoiceNumber || "",
    invoiceDate: receipt?.invoiceDate || "",
    invoiceDocumentName: receipt?.invoiceDocumentName || "",
    invoiceDocumentType: receipt?.invoiceDocumentType || "",
    invoiceDocumentSize: Number(receipt?.invoiceDocumentSize ?? 0) || 0,
    invoiceDocumentData: receipt?.invoiceDocumentData || "",
    billFrom:
      receipt?.billFrom ??
      receipt?.billTo ??
      defaults.billFrom ??
      defaults.billTo ??
      "",
    shipTo: receipt?.shipTo ?? defaults.shipTo ?? "",
    showProjectDetails:
      receipt?.showProjectDetails ?? defaults.showProjectDetails ?? true,
    status:
      receipt?.status ||
      computeReceiveStatus(
        purchaseOrder,
        receiptHistory,
        items,
        receipt?.id,
        purchaseOrder?.status || "Draft"
      ),
    notes: receipt?.notes || "",
    items,
  };
};

const MAX_INVOICE_DOCUMENT_SIZE = 5 * 1024 * 1024;

const readInvoiceDocument = (file) =>
  new Promise((resolve, reject) => {
    if (!file) {
      reject(new Error("Select a valid invoice file."));
      return;
    }
    if (file.size > MAX_INVOICE_DOCUMENT_SIZE) {
      reject(new Error(`${file.name} is larger than 5 MB.`));
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      resolve({
        name: file.name,
        type: file.type || "application/octet-stream",
        size: file.size,
        dataUrl: reader.result,
      });
    };
    reader.onerror = () => reject(new Error(`Could not read ${file.name}.`));
    reader.readAsDataURL(file);
  });

const findMatchingPoItem = (purchaseOrder, receiptItem, index) => {
  const poItems = Array.isArray(purchaseOrder?.items) ? purchaseOrder.items : [];
  const receiptItemKey = getItemKey(receiptItem, index);

  const matchByItemId = receiptItem.itemId ?? receiptItem.ItemId ?? receiptItem.itemID ?? receiptItem.ItemID; // VERIFIED
  if (matchByItemId !== null && matchByItemId !== undefined && matchByItemId !== "") {
    const itemMatch = poItems.find((poItem) =>
      String(poItem.itemId ?? poItem.ItemId ?? poItem.id ?? poItem.Id) === String(matchByItemId)
    );
    if (itemMatch) return itemMatch;
  }

  const matchByPoItemId =
    receiptItem.poItemId ??
    receiptItem.POItemId ??
    receiptItem.PurchaseOrderItemId ??
    receiptItem.poItemID ??
    receiptItem.PurchaseOrderItemId;
  if (matchByPoItemId !== null && matchByPoItemId !== undefined && matchByPoItemId !== "") {
    const poMatch = poItems.find((poItem) =>
      String(poItem.poItemId ?? poItem.POItemId ?? poItem.PurchaseOrderItemId ?? poItem.id ?? poItem.Id) === String(matchByPoItemId)
    );
    if (poMatch) return poMatch;
  }

  return (
    poItems.find(
      (poItem, poIndex) =>
        getItemKey(poItem, poIndex) === receiptItemKey
    ) ??
    poItems[index] ??
    null
  );
};

const buildReceiptSummaryItems = (receipt, purchaseOrder) =>
  (receipt?.items || [])
    .map((item, index) => {
      const poItem = findMatchingPoItem(purchaseOrder, item, index);
      return {
        quantity: toNumber(
          item.receiptReceivedQty ?? item.ReceiptReceivedQty ?? item.receivedQty
        ),
        unitPrice: roundUnitPrice(poItem?.unitPrice ?? poItem?.rate ?? 0),
        taxPercentage: poItem?.taxPercentage ?? poItem?.gst ?? 0,
        gst: poItem?.gst ?? poItem?.taxPercentage ?? 0,
      };
    })
    .filter((item) => item.quantity > 0);

const getReceiptDisplayQuantities = (item = {}) => {
  const originalOrdered = toNumber(item.orderedQty ?? item.quantity ?? item.OrderedQty);
  const receiptReceived = toNumber(
    item.receiptReceivedQty ??
      item.ReceiptReceivedQty ??
      item.receivedQty ??
      item.ReceivedQty
  );
  const cumulativeReceived = toNumber(
    item.totalReceivedQty ??
      item.TotalReceivedQty ??
      item.receivedQty ??
      item.ReceivedQty ??
      receiptReceived
  );
  const previouslyReceived = Math.max(
    toNumber(
      item.previouslyReceivedQty ??
        item.PreviouslyReceivedQty ??
        cumulativeReceived - receiptReceived
    ),
    0
  );
  const available = Math.max(
    toNumber(
      item.availableBalanceQty ??
        item.AvailableBalanceQty ??
        Math.max(originalOrdered - previouslyReceived, 0)
    ),
    0
  );
  const balance = Math.max(
    toNumber(
      item.totalPoBalanceQty ??
        item.TotalPoBalanceQty ??
        item.poBalanceQty ??
        item.PoBalanceQty ??
        item.balanceQty ??
        item.BalanceQty ??
        Math.max(originalOrdered - cumulativeReceived, 0)
    ),
    0
  );

  return {
    ordered: available,
    originalOrdered,
    received: receiptReceived,
    cumulativeReceived,
    available,
    balance,
  };
};

const getReceiptHistoryTotals = (receipt = {}) =>
  (receipt.items || []).reduce(
    (acc, item) => {
      const display = getReceiptDisplayQuantities(item);
      const movementQty = toNumber(
        item.receiptReceivedQty ?? item.ReceiptReceivedQty ?? item.receivedQty
      );
      return {
        movementQty: acc.movementQty + movementQty,
        received: acc.received + display.received,
        cumulativeReceived: acc.cumulativeReceived + display.cumulativeReceived,
        available: acc.available + display.available,
        balance: acc.balance + display.balance,
      };
    },
    {
      movementQty: 0,
      received: 0,
      cumulativeReceived: 0,
      available: 0,
      balance: 0,
    }
  );

const ReceiveGoods = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const settings = useSettings();
  const company = settings?.company || {};
  const logoUrl = resolveBrandLogo(company.logo || "");
  const brandName = company.name || "Bangalore Electronics";
  const brandDescription = company.address || "Company address";
  const [purchaseOrders, setPurchaseOrders] = useState([]);
  const [projects, setProjects] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [locations, setLocations] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [receiptHistory, setReceiptHistory] = useState([]);
  const [selectedReceipt, setSelectedReceipt] = useState(null);
  const [editingReceipt, setEditingReceipt] = useState(null);
  const [receiveForm, setReceiveForm] = useState(() => createReceiveForm());
  const [hasStatusOverride, setHasStatusOverride] = useState(false);
  const [purchaseOrderPreview, setPurchaseOrderPreview] = useState(null);
  const [viewReceipt, setViewReceipt] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [receiptLoading, setReceiptLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [apiError, setApiError] = useState("");
  const [saveMessage, setSaveMessage] = useState("");
  const [closedPoOverrideApproved, setClosedPoOverrideApproved] = useState(
    Boolean(location.state?.closedPoAuthorized)
  );
  const [passwordPromptOpen, setPasswordPromptOpen] = useState(false);
  const [adminPassword, setAdminPassword] = useState("");
  const [adminPasswordError, setAdminPasswordError] = useState("");
  const [invoiceUploadError, setInvoiceUploadError] = useState("");
  const serialUploadInputRefs = useRef({});
  const hydratedReceiveFormKeyRef = useRef("");

  const purchaseOrderIdFromSearch = searchParams.get("purchaseOrderId") || "";
  const receiptIdFromSearch = searchParams.get("receiptId") || "";
  const formatCurrency = formatInrCurrency;

  const loadData = async () => {
    try {
      setLoading(true);
      setApiError("");
      const [poList, vendorList, locationList] = await Promise.all([
        fetchPurchaseOrders(),
        fetchVendors(),
        fetchLocations(),
      ]);
      setPurchaseOrders(Array.isArray(poList) ? poList : []);
      setVendors(Array.isArray(vendorList) ? vendorList : []);
      setLocations(Array.isArray(locationList) ? locationList : []);
      setProjects(getProjects());
    } catch (error) {
      setApiError(
        error?.response?.data?.error ??
          error?.message ??
          "Failed to load receive-goods data."
      );
      setPurchaseOrders([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  useEffect(() => {
    const refreshPurchaseOrders = () => {
      void loadData();
    };

    window.addEventListener("purchase-orders:changed", refreshPurchaseOrders);
    return () => {
      window.removeEventListener("purchase-orders:changed", refreshPurchaseOrders);
    };
  }, []);

  useEffect(() => {
    const statePurchaseOrderId = location.state?.purchaseOrderId;
    if (!statePurchaseOrderId || purchaseOrderIdFromSearch) return;
    const nextSearchParams = new URLSearchParams(searchParams);
    nextSearchParams.set("purchaseOrderId", String(statePurchaseOrderId));
    if (location.state?.receiptId) {
      nextSearchParams.set("receiptId", String(location.state.receiptId));
    }
    setSearchParams(nextSearchParams, { replace: true });
  }, [location.state, purchaseOrderIdFromSearch, searchParams, setSearchParams]);

  useEffect(() => {
    if (location.state?.closedPoAuthorized) {
      setClosedPoOverrideApproved(true);
    }
  }, [location.state]);

  useEffect(() => {
    if (!purchaseOrders.length) {
      setSelectedId("");
      return;
    }
    if (
      purchaseOrderIdFromSearch &&
      purchaseOrders.some((record) => String(record.id) === String(purchaseOrderIdFromSearch))
    ) {
      setSelectedId(String(purchaseOrderIdFromSearch));
      return;
    }
    setSelectedId((current) =>
      purchaseOrders.some((record) => String(record.id) === String(current)) ? current : ""
    );
  }, [purchaseOrders, purchaseOrderIdFromSearch]);

  const projectMap = useMemo(
    () => projects.reduce((acc, project) => ({ ...acc, [String(project.id)]: project }), {}),
    [projects]
  );
  const vendorMap = useMemo(
    () => vendors.reduce((acc, vendor) => ({ ...acc, [String(vendor.id)]: vendor }), {}),
    [vendors]
  );
  const locationMap = useMemo(
    () => locations.reduce((acc, item) => ({ ...acc, [String(item.id)]: item }), {}),
    [locations]
  );

  const filteredPurchaseOrders = useMemo(() => {
    const visiblePurchaseOrders = purchaseOrders.filter(
      (record) => !isLockedPurchaseOrder(record.status)
    );
    const query = searchQuery.trim().toLowerCase();
    if (!query) return visiblePurchaseOrders;
    return visiblePurchaseOrders.filter((record) =>
      [
        record.poNumber,
        record.status,
        projectMap[String(record.projectId)]?.name,
        vendorMap[String(record.vendorId)]?.name,
        locationMap[String(record.locationId)]?.name,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query))
    );
  }, [locationMap, projectMap, purchaseOrders, searchQuery, vendorMap]);

  const selectedPurchaseOrder =
    purchaseOrders.find((record) => String(record.id) === String(selectedId)) || null;
  const selectedProject = selectedPurchaseOrder
    ? projectMap[String(selectedPurchaseOrder.projectId)]
    : null;
  const selectedVendor = selectedPurchaseOrder
    ? vendorMap[String(selectedPurchaseOrder.vendorId)]
    : null;
  const selectedLocation = selectedPurchaseOrder
    ? locationMap[String(selectedPurchaseOrder.locationId)]
    : null;
  const isSelectedPurchaseOrderClosed = isLockedPurchaseOrder(
    selectedPurchaseOrder?.status
  );
  const defaultBillFromText =
    buildReceiveVendorAddressText(selectedVendor) ||
    buildReceiveBillFromText(selectedProject);
  const defaultShipToText = buildReceiveShipToText(selectedLocation);

  useEffect(() => {
    let isActive = true;
    const loadSelectedReceipt = async () => {
      if (!selectedPurchaseOrder?.id) {
        hydratedReceiveFormKeyRef.current = "";
        setReceiptHistory([]);
        setSelectedReceipt(null);
        setEditingReceipt(null);
        setReceiveForm(createReceiveForm());
        setHasStatusOverride(false);
        setClosedPoOverrideApproved(false);
        return;
      }
      if (
        isLockedPurchaseOrder(selectedPurchaseOrder.status) &&
        !receiptIdFromSearch
      ) {
        hydratedReceiveFormKeyRef.current = "";
        setApiError(getPurchaseOrderLockMessage(selectedPurchaseOrder.status));
        setReceiptHistory([]);
        setSelectedReceipt(null);
        setEditingReceipt(null);
        setClosedPoOverrideApproved(false);
        setReceiveForm(createReceiveForm());
        setHasStatusOverride(false);
        return;
      }
      try {
        setReceiptLoading(true);
        setApiError("");
        const receiptList = await fetchReceiveGoods(selectedPurchaseOrder.id);
        if (!isActive) return;
        const safeReceiptList = Array.isArray(receiptList) ? receiptList : [];
        const nextReceipt = safeReceiptList[0] ?? null;
        const nextEditingReceipt = receiptIdFromSearch
          ? safeReceiptList.find(
              (receipt) => String(receipt.id) === String(receiptIdFromSearch)
            ) ?? null
          : null;
        
        // Handle stale receiptId: if receiptId was in search params but not found, clear it
        if (receiptIdFromSearch && !nextEditingReceipt) {
          const nextSearchParams = new URLSearchParams(searchParams);
          nextSearchParams.delete("receiptId");
          setSearchParams(nextSearchParams, { replace: true });
        }
        
        setReceiptHistory(safeReceiptList);
        setSelectedReceipt(nextReceipt);
        setEditingReceipt(nextEditingReceipt);
        if (!isLockedPurchaseOrder(selectedPurchaseOrder.status) || !nextEditingReceipt) {
          setClosedPoOverrideApproved(false);
        }
        const nextHydrationKey = `${selectedPurchaseOrder.id}:${
          nextEditingReceipt?.id ?? "new"
        }`;
        setReceiveForm((prev) => {
          const nextForm = createReceiveForm(
            selectedPurchaseOrder,
            safeReceiptList,
            nextEditingReceipt,
            {
              billFrom: defaultBillFromText,
              shipTo: defaultShipToText,
              showProjectDetails: true,
            }
          );
          if (hydratedReceiveFormKeyRef.current === nextHydrationKey) {
            return {
              ...nextForm,
              receivedDate: prev.receivedDate,
              receivedBy: prev.receivedBy,
              invoiceNumber: prev.invoiceNumber,
              invoiceDate: prev.invoiceDate,
              invoiceDocumentName: prev.invoiceDocumentName,
              invoiceDocumentType: prev.invoiceDocumentType,
              invoiceDocumentSize: prev.invoiceDocumentSize,
              invoiceDocumentData: prev.invoiceDocumentData,
              billFrom: prev.billFrom,
              shipTo: prev.shipTo,
              showProjectDetails: prev.showProjectDetails,
              status: prev.status,
              notes: prev.notes,
              items: mergeHydratedReceiveItems(nextForm.items, prev.items),
            };
          }
          hydratedReceiveFormKeyRef.current = nextHydrationKey;
          return nextForm;
        });
        setHasStatusOverride(false);
      } catch (error) {
        if (!isActive) return;
        setApiError(
          error?.response?.data?.error ??
            error?.message ??
            "Failed to load saved receipt details."
        );
        setReceiptHistory([]);
        setSelectedReceipt(null);
        setEditingReceipt(null);
        setClosedPoOverrideApproved(false);
        setReceiveForm(
          createReceiveForm(selectedPurchaseOrder, [], null, {
            billFrom: defaultBillFromText,
            shipTo: defaultShipToText,
            showProjectDetails: true,
          })
        );
        setHasStatusOverride(false);
      } finally {
        if (isActive) setReceiptLoading(false);
      }
    };
    void loadSelectedReceipt();
    return () => {
      isActive = false;
    };
  }, [
    defaultBillFromText,
    defaultShipToText,
    receiptIdFromSearch,
    selectedPurchaseOrder,
  ]);

  const receiveItems = useMemo(
    () =>
      (receiveForm.items || []).map((item) => {
        const serialNumbers = getItemSerialNumbers(item);
        return {
          ...item,
          serialRequired: Boolean(item.serialRequired),
          serialNumbers,
          serialInput:
            typeof item.serialInput === "string"
              ? item.serialInput
              : getSerialInputText(serialNumbers),
          orderedQty: toNumber(item.orderedQty),
          previouslyReceivedQty: toNumber(item.previouslyReceivedQty),
          availableBalanceQty: toNumber(
            item.availableBalanceQty ?? item.pendingQty ?? item.orderedQty
          ),
          pendingQty: toNumber(
            item.availableBalanceQty ?? item.pendingQty ?? item.orderedQty
          ),
          receivedQty: toNumber(item.receivedQty),
          balanceQty: Math.max(
            toNumber(item.availableBalanceQty ?? item.pendingQty ?? item.orderedQty) -
              toNumber(item.receivedQty),
            0
          ),
        };
      }),
    [receiveForm.items]
  );

  const visibleReceiveItems = useMemo(() => {
    const indexedItems = receiveItems.map((item, index) => ({
      ...item,
      receiveFormIndex: index,
    }));

    if (editingReceipt) {
      return indexedItems;
    }

    return indexedItems.filter(
      (item) => toNumber(item.pendingQty ?? item.availableBalanceQty) > 0
    );
  }, [editingReceipt, receiveItems]);

  const totals = useMemo(
    () =>
      visibleReceiveItems.reduce(
        (acc, item) => ({
          pending: acc.pending + item.availableBalanceQty,
          received: acc.received + item.receivedQty,
          balance: acc.balance + item.balanceQty,
        }),
        { pending: 0, received: 0, balance: 0 }
      ),
    [visibleReceiveItems]
  );

  const totalValue = useMemo(
    () => purchaseOrders.reduce((sum, record) => sum + toNumber(record.total), 0),
    [purchaseOrders]
  );

  const openOrdersCount = useMemo(
    () => purchaseOrders.filter((record) => !isLockedPurchaseOrder(record.status)).length,
    [purchaseOrders]
  );

  const nextStatusPreview = selectedPurchaseOrder
    ? computeReceiveStatus(
        selectedPurchaseOrder,
        receiptHistory,
        receiveItems,
        editingReceipt?.id,
        selectedPurchaseOrder.status || "Draft"
      )
    : "Draft";

  const canEditClosedReceipt = Boolean(editingReceipt) && closedPoOverrideApproved;
  const isReceiveReadOnly =
    isSelectedPurchaseOrderClosed ? !canEditClosedReceipt : false;

  const statusBadge = (status) => {
    const label = status || "Draft";
    const className =
      label.toLowerCase() === "closed"
        ? "bg-green-100 text-green-700"
        : label.toLowerCase().includes("partial")
        ? "bg-amber-100 text-amber-700"
        : "bg-slate-100 text-slate-700";
    return <span className={`rounded-full px-2 py-1 text-xs font-medium ${className}`}>{label}</span>;
  };

  const syncSelectedPurchaseOrder = (purchaseOrderId, receiptId = "") => {
    const nextId = purchaseOrderId ? String(purchaseOrderId) : "";
    setSelectedId(nextId);
    setSaveMessage("");
    const nextSearchParams = new URLSearchParams(searchParams);
    if (nextId) nextSearchParams.set("purchaseOrderId", nextId);
    else nextSearchParams.delete("purchaseOrderId");
    if (receiptId) nextSearchParams.set("receiptId", String(receiptId));
    else nextSearchParams.delete("receiptId");
    setSearchParams(nextSearchParams, { replace: true });
  };
  const getReceiveLineKey = (item = {}, index = 0) => getItemKey(item, index);

  const handleInvoiceUpload = async (event) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    try {
      const document = await readInvoiceDocument(file);
      setReceiveForm((prev) => ({
        ...prev,
        invoiceDocumentName: document.name,
        invoiceDocumentType: document.type,
        invoiceDocumentSize: document.size,
        invoiceDocumentData: document.dataUrl,
      }));
      setInvoiceUploadError("");
    } catch (error) {
      setInvoiceUploadError(error?.message || "Failed to upload invoice file.");
    } finally {
      event.target.value = "";
    }
  };

  const clearInvoiceUpload = () => {
    setReceiveForm((prev) => ({
      ...prev,
      invoiceDocumentName: "",
      invoiceDocumentType: "",
      invoiceDocumentSize: 0,
      invoiceDocumentData: "",
    }));
    setInvoiceUploadError("");
  };

  const handleReceiveFieldChange = (field, value) => {
    if (isReceiveReadOnly) {
      return;
    }
    if (field === "status") {
      setHasStatusOverride(true);
    }
    setReceiveForm((prev) => ({ ...prev, [field]: value }));
  };

  const updateReceiveItem = (itemKey, updater) => {
    setReceiveForm((prev) => {
      if (isReceiveReadOnly) {
        return prev;
      }
      const nextItems = prev.items.map((item, index) => {
        if (getReceiveLineKey(item, index) !== itemKey) {
          return item;
        }
        return updater(item, index);
      });
      return { ...prev, items: nextItems };
    });
  };

  const handleReceiveQtyChange = (itemKey, value) =>
    setReceiveForm((prev) => {
      if (isReceiveReadOnly) {
        return prev;
      }
      const nextItems = prev.items.map((item, index) => {
        if (getReceiveLineKey(item, index) !== itemKey) {
          return item;
        }

        const availableQty = toNumber(
          item.availableBalanceQty ?? item.pendingQty ?? item.orderedQty
        );
        const receivedQty = Math.max(
          0,
          Math.min(Number.parseInt(value, 10) || 0, availableQty)
        );

        return {
          ...item,
          receivedQty,
          balanceQty: Math.max(availableQty - receivedQty, 0),
        };
      });

      return {
        ...prev,
        status: hasStatusOverride
          ? prev.status
          : computeReceiveStatus(
              selectedPurchaseOrder,
              receiptHistory,
              nextItems,
              editingReceipt?.id,
              selectedPurchaseOrder?.status || "Draft"
            ),
        items: nextItems,
      };
    });

  const handleSerialTextChange = (itemKey, value) => {
    updateReceiveItem(itemKey, (item) => ({
      ...item,
      serialInput: value,
      serialNumbers: parseSerialNumbersFromText(value),
    }));
    setApiError("");
  };

  const handleSerialUploadClick = (itemKey) => {
    if (isReceiveReadOnly) {
      return;
    }
    serialUploadInputRefs.current[itemKey]?.click();
  };

  const handleSerialUploadChange = async (event, itemKey) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || isReceiveReadOnly) {
      return;
    }
    try {
      setApiError("");
      const serialNumbers = await parseSerialNumbersFromExcelFile(file);
      if (!serialNumbers.length) {
        setApiError(
          "No serial numbers found in the uploaded file. Use the first sheet with a serial number column."
        );
        return;
      }
      updateReceiveItem(itemKey, (item) => ({
        ...item,
        serialNumbers,
        serialInput: getSerialInputText(serialNumbers),
      }));
    } catch (error) {
      setApiError(
        error?.message ??
          "Failed to read serial numbers from the uploaded file."
      );
    }
  };

  const handleSerialClear = (itemKey) => {
    updateReceiveItem(itemKey, (item) => ({
      ...item,
      serialNumbers: [],
      serialInput: "",
    }));
    setApiError("");
  };

  const handleReceiveSubmit = async (event) => {
    event.preventDefault();
    if (!selectedPurchaseOrder) {
      setApiError("Select a purchase order before saving a receipt.");
      return;
    }
    if (isReceiveReadOnly) {
      setApiError(getPurchaseOrderLockMessage(selectedPurchaseOrder?.status));
      return;
    }
    if (!selectedPurchaseOrder?.id) {
      setApiError("Please select a purchase order before saving the receipt.");
      return;
    }
    const positiveItems = receiveItems.filter(
      (item) => toNumber(item.receivedQty) > 0
    );
    if (!positiveItems.length) {
      setApiError(
        "At least one line item must have a received quantity greater than zero."
      );
      return;
    }
    const invalidQtyItem = positiveItems.find(
      (item) =>
        toNumber(item.receivedQty) >
        toNumber(item.availableBalanceQty ?? item.pendingQty)
    );
    if (invalidQtyItem) {
      setApiError(
        `Received quantity for ${invalidQtyItem.name || "item"} cannot exceed available quantity (${toNumber(
          invalidQtyItem.availableBalanceQty ?? invalidQtyItem.pendingQty
        )}).`
      );
      return;
    }
    try {
      setIsSaving(true);
      setApiError("");
      setSaveMessage("");
      const payload = {
        purchaseOrderId: selectedPurchaseOrder.id,
        projectId: selectedPurchaseOrder.projectId || null,
        vendorId: selectedPurchaseOrder.vendorId || null,
        locationId: selectedPurchaseOrder.locationId || null,
        receivedDate: receiveForm.receivedDate || null,
        receivedBy: receiveForm.receivedBy.trim() || null,
        invoiceNumber: receiveForm.invoiceNumber.trim() || null,
        invoiceDate: receiveForm.invoiceDate || null,
        invoiceDocumentName: receiveForm.invoiceDocumentName || null,
        invoiceDocumentType: receiveForm.invoiceDocumentType || null,
        invoiceDocumentSize: receiveForm.invoiceDocumentSize || null,
        invoiceDocumentData: receiveForm.invoiceDocumentData || null,
        billFrom: receiveForm.billFrom?.trim() || null,
        shipTo: receiveForm.shipTo.trim() || null,
        showProjectDetails: receiveForm.showProjectDetails !== false,
        notes: receiveForm.notes.trim() || null,
        taxMode: getPurchaseOrderTaxMode(selectedPurchaseOrder),
        status: receiveForm.status || nextStatusPreview,
        items: receiveItems.map((item) => ({
          poItemId: item.poItemId ?? item.id ?? null,
          itemId: item.itemId ?? null,
          name: item.name || "",
          description: item.description || "",
          unit: item.unit || "PCS",
          orderedQty: toNumber(item.orderedQty),
          previouslyReceivedQty: toNumber(item.previouslyReceivedQty),
          availableBalanceQty: toNumber(item.availableBalanceQty),
          receivedQty: toNumber(item.receivedQty),
          balanceQty: Math.max(
            toNumber(item.availableBalanceQty ?? item.pendingQty ?? item.orderedQty) -
              toNumber(item.receivedQty),
            0
          ),
          serialRequired: false,
          serialNumbers:
            toNumber(item.receivedQty) > 0 ? getItemSerialNumbers(item) : [],
        })),
        allowLockedEdit: isSelectedPurchaseOrderClosed && canEditClosedReceipt,
        auditBy: settings?.profile?.fullName || null,
      };
      const savedReceipt = editingReceipt
        ? await updateReceiveGoods(editingReceipt.id, payload)
        : await saveReceiveGoods(payload);
      setHasStatusOverride(false);
      setSaveMessage(
        `${editingReceipt ? "Receipt updated" : "Receipt saved"} for ${
          selectedPurchaseOrder.poNumber || "selected PO"
        }.`
      );
      hydratedReceiveFormKeyRef.current = "";
      syncSelectedPurchaseOrder(
        selectedPurchaseOrder.id,
        editingReceipt ? savedReceipt.id : ""
      );
      const refreshedPurchaseOrders = await fetchPurchaseOrders();
      setPurchaseOrders(Array.isArray(refreshedPurchaseOrders) ? refreshedPurchaseOrders : []);
    } catch (error) {
      const responseError = error?.response?.data?.error;
      const rawMessage = responseError || error?.message || "Failed to save receipt.";
      setApiError(rawMessage);
    } finally {
      setIsSaving(false);
    }
  };

  const handleClosedPoUnlock = () => {
    const nextError = getClosedPoAuthError(settings, adminPassword);
    if (nextError) {
      setAdminPasswordError(nextError);
      return;
    }
    setClosedPoOverrideApproved(true);
    setPasswordPromptOpen(false);
    setAdminPassword("");
    setAdminPasswordError("");
    setApiError("");
  };

  const getPurchaseOrderTaxMode = (purchaseOrder) => {
    const vendor = vendorMap[String(purchaseOrder?.vendorId)];
    return getGstTaxMode({
      vendorState: vendor?.state,
      vendorGstin: vendor?.gstNumber,
      companyState: company.state,
      companyGstin: company.gstin,
    });
  };
  const selectedPurchaseOrderTaxMode = getPurchaseOrderTaxMode(selectedPurchaseOrder);

  const viewPurchaseOrder = viewReceipt
    ? purchaseOrders.find((record) => String(record.id) === String(viewReceipt.purchaseOrderId)) || null
    : null;
  const viewProject = viewPurchaseOrder
    ? projectMap[String(viewPurchaseOrder.projectId)]
    : null;
  const viewVendor = viewPurchaseOrder
    ? vendorMap[String(viewPurchaseOrder.vendorId)]
    : null;
  const viewLocation = viewPurchaseOrder
    ? locationMap[String(viewPurchaseOrder.locationId)]
    : null;
  const viewReceiptSummary = buildGstSummary(
    buildReceiptSummaryItems(viewReceipt, viewPurchaseOrder),
    { taxMode: viewReceipt?.taxMode || getPurchaseOrderTaxMode(viewPurchaseOrder) }
  );
  const viewBillFrom = splitDocumentText(
    viewReceipt?.billFrom ||
      viewReceipt?.billTo ||
      buildReceiveVendorAddressText(viewVendor) ||
      buildReceiveBillFromText(viewProject)
  );
  const viewShipTo = splitDocumentText(
    viewReceipt?.shipTo || buildReceiveShipToText(viewLocation)
  );
  const viewProjectDetailLines = buildReceiveProjectDetailLines(viewProject);
  const purchaseOrderPreviewProject = purchaseOrderPreview
    ? projectMap[String(purchaseOrderPreview.projectId)]
    : null;
  const purchaseOrderPreviewVendor = purchaseOrderPreview
    ? vendorMap[String(purchaseOrderPreview.vendorId)]
    : null;
  const purchaseOrderPreviewLocation = purchaseOrderPreview
    ? locationMap[String(purchaseOrderPreview.locationId)]
    : null;
  const purchaseOrderPreviewSummary = buildGstSummary(
    purchaseOrderPreview?.items || [],
    { taxMode: getPurchaseOrderTaxMode(purchaseOrderPreview) }
  );
  const purchaseOrderPreviewContact = purchaseOrderPreviewVendor?.contacts?.[0];

  return (
    <div className="p-6">
      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-slate-400">
            Inventory
          </p>
          <h1 className="text-3xl font-semibold text-slate-800">Receive Goods</h1>
          <p className="mt-1 text-sm text-slate-500">
            Open a PO, review all saved receipts, and update the receiving
            details from one workflow.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => navigate("/inventory/purchase-order-register")}
            className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700"
          >
            Open PO Register
          </button>
          <button
            type="button"
            onClick={() => navigate("/inventory/receive-goods-register")}
            className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700"
          >
            Receipts Register
          </button>
          <button
            type="button"
            onClick={loadData}
            className="rounded-lg bg-indigo-600 px-5 py-2 text-sm font-medium text-white hover:bg-indigo-700"
          >
            Refresh Data
          </button>
        </div>
      </div>

      <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-sm text-slate-500">Total POs</p>
          <p className="text-2xl font-semibold text-slate-800">{purchaseOrders.length}</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-sm text-slate-500">Open Orders</p>
          <p className="text-2xl font-semibold text-slate-800">{openOrdersCount}</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-sm text-slate-500">Total Value</p>
          <p className="text-2xl font-semibold text-slate-800">
            {formatCurrency(totalValue)}
          </p>
        </div>
      </div>

      {apiError && (
        <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {apiError}
        </div>
      )}
      {saveMessage && (
        <div className="mb-4 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {saveMessage}
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.1fr,1fr]">
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col gap-3 border-b px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h3 className="text-lg font-semibold text-slate-800">Active Purchase Orders</h3>
              <p className="text-sm text-slate-500">
                Locked purchase orders stay in the register, but are hidden from this active list.
              </p>
            </div>
            <input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search PO, vendor, project..."
              className="w-80 max-w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            />
          </div>
          <table className="min-w-[1180px] text-sm">
            <thead className="bg-slate-100 text-slate-600">
              <tr>
                <th className="p-3 text-left min-w-[140px]">PO No</th>
                <th className="p-3 text-left min-w-[170px]">Project</th>
                <th className="p-3 text-left min-w-[170px]">Vendor</th>
                <th className="p-3 text-left min-w-[130px]">Status</th>
                <th className="p-3 text-left min-w-[120px]">Items</th>
                <th className="p-3 text-left min-w-[140px]">Date of Delivery</th>
                <th className="p-3 text-left min-w-[120px]">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan="7" className="p-6 text-center text-slate-500">
                    Loading purchase orders...
                  </td>
                </tr>
              )}
              {!loading && filteredPurchaseOrders.length === 0 && (
                <tr>
                  <td colSpan="7" className="p-6 text-center text-slate-500">
                    {purchaseOrders.length === 0
                      ? "No purchase orders found."
                      : "No purchase orders match your search."}
                  </td>
                </tr>
              )}
              {!loading &&
                filteredPurchaseOrders.map((record) => (
                  <tr
                    key={`${record.id}-${record.poNumber}`}
                    onClick={() => syncSelectedPurchaseOrder(record.id)}
                    className={`cursor-pointer border-t hover:bg-slate-50 ${
                      String(selectedId) === String(record.id) ? "bg-indigo-50/70" : ""
                    }`}
                  >
                    <td className="p-3 font-medium text-slate-800">
                      {record.poNumber || record.id}
                    </td>
                    <td className="p-3">
                      {projectMap[String(record.projectId)]?.name || "-"}
                    </td>
                    <td className="p-3">
                      {vendorMap[String(record.vendorId)]?.name || "-"}
                    </td>
                    <td className="p-3">{statusBadge(record.status)}</td>
                    <td className="p-3">{record.items?.length || 0}</td>
                    <td className="p-3">
                      {formatDate(record.expectedDate || record.orderDate) || "-"}
                    </td>
                    <td className="p-3">
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          setViewReceipt(null);
                          setPurchaseOrderPreview(record);
                        }}
                        className="text-sm text-slate-700 underline"
                      >
                        View
                      </button>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>

        <div className="space-y-4">
          {!selectedPurchaseOrder ? (
            <div className="rounded-lg border border-dashed border-slate-200 bg-white p-6 text-center text-sm text-slate-500 shadow-sm">
              Select a purchase order to fetch its details and receipt.
            </div>
          ) : (
            <>
              <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
                <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-xs uppercase tracking-[0.3em] text-slate-400">
                      PO Details
                    </p>
                    <h2 className="text-xl font-semibold text-slate-800">
                      {selectedPurchaseOrder.poNumber || "Purchase Order"}
                    </h2>
                    <p className="mt-1 text-sm text-slate-500">
                      {isSelectedPurchaseOrderClosed
                        ? editingReceipt
                          ? isReceiveReadOnly
                            ? "This locked PO receipt is read-only until an Admin unlocks it."
                            : "Editing a saved receipt under admin override."
                          : getPurchaseOrderLockMessage(selectedPurchaseOrder?.status)
                        : receiptLoading
                        ? "Fetching receipt history..."
                        : editingReceipt
                        ? "Editing the selected receive entry."
                        : selectedReceipt
                        ? "Create a new receive entry from the latest cumulative balance."
                        : "No saved receipt found yet."}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setViewReceipt(null);
                        setPurchaseOrderPreview(selectedPurchaseOrder);
                      }}
                      className="rounded-md border border-slate-200 px-3 py-1.5 text-xs text-slate-700"
                    >
                      View Purchase Order
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (!selectedReceipt) return;
                        setPurchaseOrderPreview(null);
                        setViewReceipt(selectedReceipt);
                      }}
                      disabled={!selectedReceipt}
                      className="rounded-md border border-slate-200 px-3 py-1.5 text-xs text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      View Latest Receipt
                      </button>
                    {!isSelectedPurchaseOrderClosed ? (
                      <button
                        type="button"
                        onClick={() => syncSelectedPurchaseOrder(selectedPurchaseOrder.id)}
                        className="rounded-md border border-slate-200 px-3 py-1.5 text-xs text-slate-700"
                      >
                        New Entry
                      </button>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => syncSelectedPurchaseOrder("")}
                      className="rounded-md border border-slate-200 px-3 py-1.5 text-xs text-slate-500"
                    >
                      Clear
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
                  <div>
                    <span className="text-xs uppercase tracking-[0.2em] text-slate-400">
                      Project
                    </span>
                    <p className="font-medium text-slate-800">{selectedProject?.name || "-"}</p>
                  </div>
                  <div>
                    <span className="text-xs uppercase tracking-[0.2em] text-slate-400">
                      Vendor
                    </span>
                    <p className="font-medium text-slate-800">{selectedVendor?.name || "-"}</p>
                  </div>
                  <div>
                    <span className="text-xs uppercase tracking-[0.2em] text-slate-400">
                      Vendor Address
                    </span>
                    <p className="font-medium text-slate-800">
                      {formatAddressLine(selectedVendor) || "-"}
                    </p>
                  </div>
                  <div>
                    <span className="text-xs uppercase tracking-[0.2em] text-slate-400">
                      Location
                    </span>
                    <p className="font-medium text-slate-800">{selectedLocation?.name || "-"}</p>
                  </div>
                  <div>
                    <span className="text-xs uppercase tracking-[0.2em] text-slate-400">
                      Status
                    </span>
                    <p className="font-medium text-slate-800">
                      {selectedPurchaseOrder.status || "-"}
                    </p>
                  </div>
                  <div>
                    <span className="text-xs uppercase tracking-[0.2em] text-slate-400">
                      Order Date
                    </span>
                    <p className="font-medium text-slate-800">
                      {formatDate(selectedPurchaseOrder.orderDate) || "-"}
                    </p>
                  </div>
                  <div>
                    <span className="text-xs uppercase tracking-[0.2em] text-slate-400">
                      Last Receipt
                    </span>
                    <p className="font-medium text-slate-800">
                      {formatDate(selectedReceipt?.receivedDate) || "-"}
                    </p>
                  </div>
                  <div>
                    <span className="text-xs uppercase tracking-[0.2em] text-slate-400">
                      GST Mode
                    </span>
                    <p className="font-medium text-slate-800">
                      {selectedPurchaseOrderTaxMode === "inter"
                        ? "Inter-State (IGST)"
                        : "Intra-State (CGST + SGST)"}
                    </p>
                  </div>
                </div>
              </div>

              {receiptHistory.length > 0 && (
                <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <h3 className="text-base font-semibold text-slate-800">
                        Receipt History
                      </h3>
                      <p className="text-xs text-slate-500">
                        Every saved receipt for this PO is listed below with movement and cumulative quantities.
                      </p>
                    </div>
                    <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
                      {receiptHistory.length} receipt{receiptHistory.length === 1 ? "" : "s"}
                    </span>
                  </div>
                  <div className="grid gap-3 lg:grid-cols-2">
                    {receiptHistory.map((receipt) => {
                      const historyTotals = getReceiptHistoryTotals(receipt);
                      const isEditingThisReceipt =
                        editingReceipt && String(editingReceipt.id) === String(receipt.id);
                      return (
                        <div
                          key={receipt.id}
                          className={`rounded-xl border p-4 transition ${
                            isEditingThisReceipt
                              ? "border-indigo-300 bg-indigo-50/60"
                              : "border-slate-200 bg-slate-50/70"
                          }`}
                        >
                          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                            <div>
                              <p className="text-xs uppercase tracking-[0.2em] text-slate-500">
                                Receipt
                              </p>
                              <p className="mt-1 text-sm font-semibold text-slate-900">
                                {formatDate(receipt.receivedDate) || "-"}
                              </p>
                              <p className="mt-1 text-xs text-slate-500">
                                Invoice: {receipt.invoiceNumber || "-"} | Received by:{" "}
                                {receipt.receivedBy || "-"}
                              </p>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              <button
                                type="button"
                                onClick={() => {
                                  setPurchaseOrderPreview(null);
                                  setViewReceipt(receipt);
                                }}
                                className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-700"
                              >
                                View
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  syncSelectedPurchaseOrder(selectedPurchaseOrder.id, receipt.id)
                                }
                                className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-700"
                              >
                                {isEditingThisReceipt ? "Editing" : "Edit"}
                              </button>
                            </div>
                          </div>
                          <div className="mt-4 grid grid-cols-2 gap-3 text-sm text-slate-700 sm:grid-cols-4">
                            <div>
                              <p className="text-xs uppercase tracking-[0.2em] text-slate-500">
                                Receipt Qty
                              </p>
                              <p className="mt-1 font-semibold text-slate-900">
                                {historyTotals.movementQty}
                              </p>
                            </div>
                            <div>
                              <p className="text-xs uppercase tracking-[0.2em] text-slate-500">
                                Cumulative
                              </p>
                              <p className="mt-1 font-semibold text-slate-900">
                                {historyTotals.cumulativeReceived}
                              </p>
                            </div>
                            <div>
                              <p className="text-xs uppercase tracking-[0.2em] text-slate-500">
                                Pending Qty
                              </p>
                              <p className="mt-1 font-semibold text-slate-900">
                                {historyTotals.available}
                              </p>
                            </div>
                            <div>
                              <p className="text-xs uppercase tracking-[0.2em] text-slate-500">
                                PO Balance
                              </p>
                              <p className="mt-1 font-semibold text-slate-900">
                                {historyTotals.balance}
                              </p>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {isSelectedPurchaseOrderClosed && !editingReceipt ? (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-5 text-sm text-amber-800 shadow-sm">
                  <p className="font-medium">
                    {getPurchaseOrderLockMessage(selectedPurchaseOrder?.status)}
                  </p>
                  <p className="mt-1">
                    Locked purchase orders are read-only. Use the Receipts Register to open a
                    specific saved receipt if an Admin needs to correct it.
                  </p>
                  <button
                    type="button"
                    onClick={() => navigate("/inventory/purchase-order-register")}
                    className="mt-4 rounded-md border border-amber-300 bg-white px-3 py-1.5 text-xs font-medium text-amber-900"
                  >
                    Open PO Register
                  </button>
                </div>
              ) : (
                <form
                  onSubmit={handleReceiveSubmit}
                  className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm"
                >
                  <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <h3 className="text-base font-semibold text-slate-800">Receive Goods</h3>
                      <p className="text-xs text-slate-500">
                        {editingReceipt
                          ? "Update the selected receive entry."
                          : "Each save creates a new receive entry for this PO."}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setReceiveForm(
                          createReceiveForm(
                            selectedPurchaseOrder,
                            receiptHistory,
                            editingReceipt,
                            {
                              billFrom:
                                buildReceiveVendorAddressText(selectedVendor) ||
                                buildReceiveBillFromText(selectedProject),
                              shipTo: buildReceiveShipToText(selectedLocation),
                              showProjectDetails: true,
                            }
                          )
                        );
                        setHasStatusOverride(false);
                      }}
                      className="rounded-md border border-slate-200 px-3 py-1.5 text-xs text-slate-600"
                    >
                      Reset
                    </button>
                  </div>

                  {isSelectedPurchaseOrderClosed && editingReceipt ? (
                    <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <p className="font-medium">Locked PO receipt</p>
                          <p className="mt-1">
                            {isReceiveReadOnly
                              ? "Only Admin users can unlock this saved receipt for editing."
                              : "Admin override is active for this locked PO receipt."}
                          </p>
                        </div>
                        {isReceiveReadOnly ? (
                          <button
                            type="button"
                            onClick={() => {
                              setPasswordPromptOpen(true);
                              setAdminPassword("");
                              setAdminPasswordError("");
                            }}
                            className="rounded-md border border-amber-300 bg-white px-3 py-1.5 text-xs font-medium text-amber-900"
                          >
                            Unlock as Admin
                          </button>
                        ) : null}
                      </div>
                    </div>
                  ) : null}

                  <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                      <label className="text-sm font-medium text-slate-700">Received Date</label>
                      <DateInput
                        value={receiveForm.receivedDate}
                        onChange={(value) => handleReceiveFieldChange("receivedDate", value || "")}
                        disabled={isReceiveReadOnly}
                        className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium text-slate-700">Received By</label>
                      <input
                        type="text"
                        value={receiveForm.receivedBy}
                        onChange={(event) =>
                          handleReceiveFieldChange("receivedBy", event.target.value)
                        }
                        disabled={isReceiveReadOnly}
                        className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium text-slate-700">
                        Invoice Number
                      </label>
                      <input
                        type="text"
                        value={receiveForm.invoiceNumber}
                        onChange={(event) =>
                          handleReceiveFieldChange("invoiceNumber", event.target.value)
                        }
                        disabled={isReceiveReadOnly}
                        className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium text-slate-700">
                        Invoice Date
                      </label>
                      <DateInput
                        value={receiveForm.invoiceDate}
                        onChange={(value) =>
                          handleReceiveFieldChange("invoiceDate", value || "")
                        }
                        disabled={isReceiveReadOnly}
                        className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                          <div>
                            <label className="text-sm font-medium text-slate-700">
                              Invoice Upload
                            </label>
                            <p className="mt-1 text-xs text-slate-500">
                              Upload invoice copy using the existing document flow. Max 5 MB.
                            </p>
                          </div>
                          <input
                            type="file"
                            onChange={handleInvoiceUpload}
                            disabled={isReceiveReadOnly}
                            className="block text-sm text-slate-600 file:mr-4 file:rounded-lg file:border-0 file:bg-indigo-600 file:px-4 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-indigo-700 disabled:opacity-60"
                          />
                        </div>
                        {invoiceUploadError ? (
                          <p className="mt-3 text-sm text-red-600">{invoiceUploadError}</p>
                        ) : null}
                        {receiveForm.invoiceDocumentName ? (
                          <div className="mt-4 flex flex-col gap-3 rounded-lg border border-slate-200 bg-white px-3 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
                            <div className="min-w-0">
                              <p className="truncate font-medium text-slate-800">
                                {receiveForm.invoiceDocumentName}
                              </p>
                              <p className="text-xs text-slate-500">
                                {receiveForm.invoiceDocumentType || "Document"} |{" "}
                                {receiveForm.invoiceDocumentSize
                                  ? `${Math.round(receiveForm.invoiceDocumentSize / 1024)} KB`
                                  : "-"}
                              </p>
                            </div>
                            <div className="flex gap-2">
                              {receiveForm.invoiceDocumentData ? (
                                <button
                                  type="button"
                                  onClick={() =>
                                    window.open(
                                      receiveForm.invoiceDocumentData,
                                      "_blank",
                                      "noopener,noreferrer"
                                    )
                                  }
                                  className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-700"
                                >
                                  Open
                                </button>
                              ) : null}
                              <button
                                type="button"
                                onClick={clearInvoiceUpload}
                                disabled={isReceiveReadOnly}
                                className="rounded-md border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-700"
                              >
                                Remove
                              </button>
                            </div>
                          </div>
                        ) : null}
                      </div>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-slate-700">Bill From</label>
                      <textarea
                        value={receiveForm.billFrom}
                        onChange={(event) =>
                          handleReceiveFieldChange("billFrom", event.target.value)
                        }
                        disabled={isReceiveReadOnly}
                        className="mt-1 min-h-[90px] w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium text-slate-700">Ship To</label>
                      <textarea
                        value={receiveForm.shipTo}
                        onChange={(event) =>
                          handleReceiveFieldChange("shipTo", event.target.value)
                        }
                        disabled={isReceiveReadOnly}
                        className="mt-1 min-h-[90px] w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="inline-flex items-center gap-2 text-sm font-medium text-slate-700">
                        <input
                          type="checkbox"
                          checked={receiveForm.showProjectDetails !== false}
                          onChange={(event) =>
                            handleReceiveFieldChange(
                              "showProjectDetails",
                              event.target.checked
                            )
                          }
                          disabled={isReceiveReadOnly}
                          className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                        />
                        Show project details on the receipt
                      </label>
                    </div>
                    <div className="sm:col-span-2">
                      <label className="text-sm font-medium text-slate-700">Receipt Status</label>
                      <div className="mt-1 grid grid-cols-1 gap-3 lg:grid-cols-[260px,1fr]">
                        <select
                          value={receiveForm.status || nextStatusPreview}
                          onChange={(event) =>
                            handleReceiveFieldChange("status", event.target.value)
                          }
                          disabled={isReceiveReadOnly}
                          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                        >
                          {RECEIVE_STATUS_OPTIONS.map((option) => (
                            <option key={option} value={option}>
                              {option}
                            </option>
                          ))}
                        </select>
                        <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                          Suggested from received quantities: {nextStatusPreview}
                        </div>
                      </div>
                    </div>
                    <div className="sm:col-span-2">
                      <label className="text-sm font-medium text-slate-700">Receiving Notes</label>
                      <textarea
                        value={receiveForm.notes}
                        onChange={(event) =>
                          handleReceiveFieldChange("notes", event.target.value)
                        }
                        disabled={isReceiveReadOnly}
                        className="mt-1 min-h-[90px] w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                      />
                    </div>
                  </div>

                  <div className="mb-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                    Serial entry is optional reference data only. Type serial numbers
                    manually or upload an Excel file (`.xlsx`, `.xls`, `.csv`) if you want
                    to capture them, but they will not block saving the receipt. Supported
                    headers: `Serial`, `Serial No`, `Serial Number`.
                  </div>

                  <div className="overflow-x-auto">
                    <table className="min-w-[1180px] text-sm">
                      <thead className="bg-slate-100 text-slate-600">
                        <tr>
                          <th className="p-3 text-left min-w-[160px]">Item</th>
                          <th className="p-3 text-left min-w-[90px]">Unit</th>
                          <th className="p-3 text-left min-w-[100px]">Pending Qty</th>
                          <th className="p-3 text-left min-w-[110px]">Receive Qty</th>
                          <th className="p-3 text-left min-w-[100px]">PO Balance</th>
                        </tr>
                      </thead>
                      <tbody>
                        {visibleReceiveItems.length === 0 && (
                          <tr>
                            <td colSpan="5" className="p-6 text-center text-slate-500">
                              No pending items to receive.
                            </td>
                          </tr>
                        )}
                        {visibleReceiveItems.map((item, index) => {
                          const sourceIndex = item.receiveFormIndex ?? index;
                          const lineKey = getReceiveLineKey(item, sourceIndex);
                          const serialNumbers = getItemSerialNumbers(item);
                          const expectedSerialCount = Math.max(toNumber(item.receivedQty), 0);
                          const hasSerialWarning = false;
                          const uniqueItemKey = `receive-item-${sourceIndex}-${item.id ?? item.poItemId ?? item.itemId ?? sourceIndex}`;

                          return (
                            <Fragment key={uniqueItemKey}>
                              <tr className="border-t">
                                <td className="p-3">
                                  <div className="font-medium text-slate-800">{item.name || "-"}</div>
                                  <div className="text-xs text-slate-500">
                                    {item.description || "-"}
                                  </div>
                                  {item.serialNumber ? (
                                    <div className="mt-1 text-xs text-slate-500">
                                      Default serial: {item.serialNumber}
                                    </div>
                                  ) : null}
                                </td>
                                <td className="p-3">{item.unit || "-"}</td>
                                <td className="p-3">{item.availableBalanceQty}</td>
                                <td className="p-3">
                                  <input
                                    type="number"
                                    min="0"
                                    max={item.availableBalanceQty}
                                    step="1"
                                    value={item.receivedQty}
                                    onChange={(event) =>
                                      handleReceiveQtyChange(lineKey, event.target.value)
                                    }
                                    disabled={isReceiveReadOnly}
                                    className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                                  />
                                </td>
                                <td className="p-3">{item.balanceQty}</td>
                              </tr>

                              <tr className="border-t bg-slate-50/50">
                                <td colSpan="5" className="px-3 py-3">
                                  <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr),auto] lg:items-start">
                                    <div>
                                      <div className="mb-2 flex flex-wrap items-center gap-2">
                                        <label className="block text-xs font-medium uppercase tracking-[0.16em] text-slate-500">
                                          Serial Reference
                                        </label>
                                        <button
                                          type="button"
                                          disabled={isReceiveReadOnly}
                                          className="rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-600 disabled:cursor-not-allowed disabled:opacity-60"
                                        >
                                          Optional
                                        </button>
                                      </div>
                                      <p className="mb-2 text-xs text-slate-500">
                                        Write or paste serial numbers here if you want to keep them as a reference. They are optional and will not block saving.
                                      </p>
                                      <textarea
                                        value={item.serialInput ?? ""}
                                        onChange={(event) =>
                                          handleSerialTextChange(lineKey, event.target.value)
                                        }
                                        disabled={isReceiveReadOnly}
                                        placeholder={
                                          "Optional serial numbers, one per line"
                                        }
                                        className={`min-h-[92px] w-full rounded-md border px-3 py-2 text-sm ${
                                          hasSerialWarning
                                            ? "border-amber-300 bg-amber-50"
                                            : "border-slate-200"
                                        }`}
                                      />
                                      <p
                                        className={`mt-1 text-xs ${
                                          hasSerialWarning
                                            ? "text-amber-700"
                                            : "text-slate-500"
                                        }`}
                                      >
                                        Entered: {serialNumbers.length}
                                        {expectedSerialCount > 0
                                          ? ` of ${expectedSerialCount} received`
                                          : ""}
                                      </p>
                                    </div>

                                    <div className="flex flex-wrap gap-2 lg:flex-col lg:items-stretch">
                                      <input
                                        ref={(element) => {
                                          serialUploadInputRefs.current[lineKey] = element;
                                        }}
                                        type="file"
                                        accept=".xlsx,.xls,.csv"
                                        onChange={(event) =>
                                          handleSerialUploadChange(event, lineKey)
                                        }
                                        className="hidden"
                                      />
                                      <button
                                        type="button"
                                        onClick={() => handleSerialUploadClick(lineKey)}
                                        disabled={isReceiveReadOnly}
                                        className="rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
                                      >
                                        Upload Excel File
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => handleSerialClear(lineKey)}
                                        disabled={
                                          isReceiveReadOnly ||
                                          !serialNumbers.length
                                        }
                                        className="rounded-md border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600 disabled:cursor-not-allowed disabled:opacity-50"
                                      >
                                        Clear
                                      </button>
                                    </div>
                                  </div>
                                </td>
                              </tr>
                            </Fragment>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  <div className="mt-4 flex flex-col gap-3 text-sm text-slate-600 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex flex-wrap gap-4">
                      <span>Pending Qty: {totals.pending}</span>
                      <span>Received: {totals.received}</span>
                      <span>PO Balance: {totals.balance}</span>
                    </div>
                      <button
                        type="submit"
                        disabled={
                          isSaving ||
                          receiptLoading ||
                          isReceiveReadOnly
                        }
                        className="rounded-lg bg-indigo-600 px-5 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                      {isSaving
                        ? "Saving..."
                        : editingReceipt
                        ? "Update Receipt"
                        : "Save Receipt"}
                    </button>
                  </div>
                </form>
              )}
            </>
          )}
        </div>
      </div>

      {purchaseOrderPreview && (
        <DocumentViewPanel
          id="receive-goods-purchase-order-view-panel"
          title="PURCHASE ORDER"
          onClose={() => setPurchaseOrderPreview(null)}
          companyName={brandName}
          companyAddress={brandDescription}
          companyGstin={company.gstin}
          companyPhone={company.phone}
          companyEmail={company.email}
          logoUrl={logoUrl}
          primaryPairs={[
            { label: "PO No", value: purchaseOrderPreview.poNumber || purchaseOrderPreview.id },
            { label: "Date", value: formatDate(purchaseOrderPreview.orderDate) },
            { label: "Date of Delivery", value: formatDate(purchaseOrderPreview.expectedDate) },
            { label: "Status", value: purchaseOrderPreview.status },
          ]}
          leftBlockTitle="Vendor"
          leftBlockLines={[
            purchaseOrderPreviewVendor?.name || "-",
            purchaseOrderPreviewContact?.contactName ||
              purchaseOrderPreviewVendor?.email ||
              "-",
            purchaseOrderPreviewContact?.phone ||
              purchaseOrderPreviewVendor?.phone ||
              "-",
            formatAddressLine(purchaseOrderPreviewVendor) || "-",
          ]}
          rightBlockTitle="Project"
          rightBlockLines={[
            purchaseOrderPreviewProject?.name || "-",
            purchaseOrderPreviewLocation?.name || "-",
            purchaseOrderPreviewProject?.client || "-",
          ]}
          tableColumns={[
            { key: "serial", label: "Sl No", widthClass: "w-16" },
            { key: "name", label: "Item" },
            { key: "serialNumber", label: "Serial Number", widthClass: "w-28" },
            { key: "description", label: "Description" },
            { key: "unit", label: "Unit", widthClass: "w-20" },
            { key: "quantity", label: "Qty", align: "right", widthClass: "w-20" },
            { key: "rate", label: "Unit Price", align: "right", widthClass: "w-24" },
            { key: "amount", label: "Amount", align: "right", widthClass: "w-28" },
          ]}
          tableRows={(purchaseOrderPreview.items || []).map((item, index) => {
            const qty = Number(item.quantity || 0);
            const rate = roundUnitPrice(item.rate ?? item.unitPrice ?? 0);
            const amount = qty * rate;
            return {
              id: item.id || index,
              serial: index + 1,
              name: item.name,
              serialNumber: item.serialNumber || "-",
              description: item.description || "-",
              unit: item.unit,
              quantity: qty,
              rate: formatCurrency(rate),
              amount: formatCurrency(amount),
            };
          })}
          bottomRightContent={
            <GstSummaryBlock
              summary={purchaseOrderPreviewSummary}
              formatCurrency={formatCurrency}
              align="right"
            />
          }
          footerCompanyName={brandName || "Company"}
          hideFooterNote
        />
      )}

      {viewReceipt && (
        <DocumentViewPanel
          id="receive-goods-view-panel"
          title="GOODS RECEIPT"
          onClose={() => setViewReceipt(null)}
          companyName={brandName}
          companyAddress={brandDescription}
          companyGstin={company.gstin}
          companyPhone={company.phone}
          companyEmail={company.email}
          logoUrl={logoUrl}
          primaryPairs={[
            { label: "Receipt Ref", value: viewPurchaseOrder?.poNumber || viewReceipt.id },
            { label: "Received Date", value: formatDate(viewReceipt.receivedDate) || "-" },
            { label: "Invoice No", value: viewReceipt.invoiceNumber || "-" },
            { label: "Invoice Date", value: formatDate(viewReceipt.invoiceDate) || "-" },
            {
              label: "Invoice File",
              value: viewReceipt.invoiceDocumentName || "-",
            },
            { label: "Status", value: viewReceipt.status || viewPurchaseOrder?.status || "Draft" },
            { label: "Received By", value: viewReceipt.receivedBy || "-" },
          ]}
          leftBlockTitle="Bill From"
          leftBlockLines={viewBillFrom}
          rightBlockTitle="Ship To"
          rightBlockLines={viewShipTo}
          tableColumns={[
            { key: "serial", label: "Sl No", widthClass: "w-16" },
            { key: "name", label: "Item" },
            { key: "serialNumbers", label: "Serial Numbers", widthClass: "w-32" },
            { key: "unit", label: "Unit", widthClass: "w-20" },
            { key: "ordered", label: "Pending Qty", align: "right", widthClass: "w-24" },
            { key: "received", label: "Received", align: "right", widthClass: "w-24" },
            { key: "balance", label: "PO Balance", align: "right", widthClass: "w-24" },
          ]}
          tableRows={(viewReceipt.items || []).map((item, index) => {
            const receiptSerialNumbers = normalizeSerialNumbers(
              item.serialNumbers ?? item.SerialNumbers
            );
            const { ordered, received, balance } = getReceiptDisplayQuantities(item);
            return {
              id: item.id ?? item.itemId ?? index,
              serial: index + 1,
              name: item.name || "-",
              serialNumbers: receiptSerialNumbers.length
                ? receiptSerialNumbers.join(", ")
                : "-",
              unit: item.unit || "-",
              ordered,
              received,
              balance,
            };
          })}
          bottomLeftContent={
            <div className="space-y-3 text-left">
              {isReceiveProjectDetailsVisible(viewReceipt) && (
                <div>
                  <p className="font-semibold">Project Details</p>
                  {viewProjectDetailLines.length ? (
                    viewProjectDetailLines.map((line, lineIndex) => (
                      <p key={`${line}-${lineIndex}`}>{line}</p>
                    ))
                  ) : (
                    <p>-</p>
                  )}
                </div>
              )}
              <div>
                <p className="font-semibold">Notes</p>
                <p>{viewReceipt.notes || "-"}</p>
              </div>
              <div>
                <p className="font-semibold">Vendor</p>
                <p>{viewVendor?.name || "-"}</p>
                <p>{formatAddressLine(viewVendor) || "-"}</p>
              </div>
            </div>
          }
          bottomRightContent={
            <GstSummaryBlock
              summary={viewReceiptSummary}
              formatCurrency={formatCurrency}
              align="right"
            />
          }
          footerCompanyName={brandName || "Company"}
        />
      )}

      <PasswordPromptModal
        isOpen={passwordPromptOpen}
        title="Unlock Locked PO Receipt"
        description="Enter the admin password to edit this locked receipt."
        password={adminPassword}
        error={adminPasswordError}
        confirmLabel="Unlock"
        onPasswordChange={(value) => {
          setAdminPassword(value);
          if (adminPasswordError) {
            setAdminPasswordError("");
          }
        }}
        onCancel={() => {
          setPasswordPromptOpen(false);
          setAdminPassword("");
          setAdminPasswordError("");
        }}
        onConfirm={handleClosedPoUnlock}
      />
    </div>
  );
};

export default ReceiveGoods;
