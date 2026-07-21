import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  Eye,
  FileCheck2,
  History,
  RefreshCw,
  ShieldCheck,
  UploadCloud,
  XCircle,
} from "lucide-react";
import useSettings from "../../hooks/useSettings";
import { getProjects } from "../../services/projectsStore";
import { fetchLocations } from "../../services/locationsApi";
import { fetchAvailableInventory } from "../../services/availableInventoryApi";
import { fetchReceiveGoods } from "../../services/receiveGoodsApi";
import { fetchPurchaseOrders } from "../../services/purchaseOrdersApi";
import {
  createDeliveryChallan,
  deleteDeliveryChallan,
  fetchDeliveryChallan,
  fetchDeliveryChallanPodAudit,
  fetchDeliveryChallans,
  fetchNextDeliveryChallanNumber,
  getPodStatusLabel,
  normalizePodStatus,
  POD_STATUS,
  updateDeliveryChallanPodStatus,
  updateDeliveryChallan,
  uploadDeliveryChallanPod,
} from "../../services/deliveryChallanApi";
import {
  createReallocateInventory,
  fetchReallocateInventory,
} from "../../services/reallocateInventoryApi";
import DateInput from "../common/DateInput";
import DocumentViewPanel from "./DocumentViewPanel";
import { formatDate } from "../../utils/dateFormat";
import { printSection } from "../../utils/printUtils";
import { resolveBrandLogo } from "../../utils/branding";
import {
  getActiveProjectId,
  setActiveProjectId,
} from "../../services/projectSelectionStore";


const createLineItem = () => ({
  id: Date.now() + Math.random(),
  name: "",
  description: "",
  unit: "PCS",
  hsn: "",
  gst: "",
  quantity: "",
  rate: "",
  notes: "",
});

const createFormState = () => ({
  dcNumber: "",
  projectId: "",
  receiveGoodsId: "",
  fromLocationId: "",
  toLocationId: "",
  toLocation: "",
  vehicleNumber: "",
  eWayBillNumber: "",
  issueDate: new Date().toISOString().slice(0, 10),
  status: "Draft",
  podStatus: POD_STATUS.PENDING,
  podReference: "",
  podDate: "",
  notes: "",
});

const POD_UPLOAD_LIMIT_BYTES = 5 * 1024 * 1024;

const createPodFormState = () => ({
  reference: "",
  podDate: "",
  remarks: "",
  fileName: "",
  fileType: "",
  fileSize: 0,
  fileData: "",
});

const podStatusTone = (status) => {
  switch (normalizePodStatus(status)) {
    case POD_STATUS.UPLOADED:
      return "border-blue-200 bg-blue-50 text-blue-700";
    case POD_STATUS.UNDER_VERIFICATION:
      return "border-indigo-200 bg-indigo-50 text-indigo-700";
    case POD_STATUS.VERIFIED:
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    case POD_STATUS.REJECTED:
      return "border-rose-200 bg-rose-50 text-rose-700";
    case POD_STATUS.DISPUTED:
      return "border-orange-200 bg-orange-50 text-orange-700";
    case POD_STATUS.WAIVED:
      return "border-slate-300 bg-slate-100 text-slate-700";
    default:
      return "border-amber-200 bg-amber-50 text-amber-700";
  }
};

const formatDateTime = (value) => {
  if (!value) {
    return "-";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return formatDate(value);
  }
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
};

const getPodTimestamp = (record = {}) => {
  const status = normalizePodStatus(record.podStatus);
  if (status === POD_STATUS.VERIFIED) {
    return record.podVerifiedAt || record.podDate || record.updatedAt;
  }
  if (status === POD_STATUS.REJECTED) {
    return record.podRejectedAt || record.updatedAt;
  }
  if (status === POD_STATUS.DISPUTED) {
    return record.podDisputedAt || record.updatedAt;
  }
  if (status === POD_STATUS.WAIVED) {
    return record.podWaivedAt || record.updatedAt;
  }
  return record.podUploadedAt || record.podDate || null;
};

const getPodActor = (record = {}) => {
  const status = normalizePodStatus(record.podStatus);
  if (status === POD_STATUS.VERIFIED) {
    return record.podVerifiedBy;
  }
  if (status === POD_STATUS.REJECTED) {
    return record.podRejectedBy;
  }
  if (status === POD_STATUS.DISPUTED) {
    return record.podDisputedBy;
  }
  if (status === POD_STATUS.WAIVED) {
    return record.podWaiverApprovedBy || record.podWaivedBy;
  }
  return record.podUploadedBy;
};

const isPodReviewerRole = (role) =>
  ["admin", "manager"].includes(String(role ?? "").trim().toLowerCase());

const readFileAsDataUrl = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("Failed to read file."));
    reader.readAsDataURL(file);
  });

const POD_ACTION_TITLES = {
  verify: "Verify POD",
  reject: "Reject POD",
  dispute: "Dispute POD",
  waive: "Waive POD",
  resolve: "Resolve POD Issue",
};

const POD_ACTION_CONFIRM_LABELS = {
  verify: "Verify",
  reject: "Reject",
  dispute: "Mark Disputed",
  waive: "Approve Waiver",
  resolve: "Resolve",
};

const POD_DETAIL_TITLES = {
  details: "POD Details",
  reason: "Rejection Reason",
  issue: "Dispute Issue",
  approval: "Waiver Approval",
  audit: "POD Audit Log",
};

const getReceiptReference = (receipt = {}) =>
  `RG-${String(receipt.receiveGoodsId ?? receipt.id ?? "").padStart(3, "0")}`;

const resolveProjectPreferredLocation = (locations = [], projectId) => {
  const normalizedProjectId = String(projectId ?? "").trim();
  if (!normalizedProjectId) {
    return null;
  }
  return (
    locations.find(
      (location) => String(location.projectId ?? "").trim() === normalizedProjectId
    ) || null
  );
};

const buildReceiptReferenceLabel = (receipt = {}, projectName = "") => {
  const receiptNumber = getReceiptReference(receipt);
  const invoiceDateText = formatDate(receipt.invoiceDate ?? receipt.receivedDate ?? receipt.createdAt);
  return [
    receiptNumber,
    receipt.invoiceNumber ? `INV ${receipt.invoiceNumber}` : null,
    projectName ? `Project: ${projectName}` : null,
    invoiceDateText && invoiceDateText !== "-" ? invoiceDateText : null,
  ]
    .filter(Boolean)
    .join(" | ");
};

const getReceiptItemReceivedQty = (item = {}) =>
  Number(
    item.receiptReceivedQty ??
      item.ReceiptReceivedQty ??
      item.receivedQty ??
      item.ReceivedQty ??
      item.quantity ??
      item.Quantity ??
      0
  ) || 0;

const getReceiptItemAvailableQty = (item = {}) =>
  Number(
    item.liveAvailableQty ??
      item.LiveAvailableQty ??
    item.receiptAvailableQty ??
      item.ReceiptAvailableQty ??
      item.availableQty ??
      item.AvailableQty ??
      item.totalAvailableQty ??
      item.TotalAvailableQty ??
      getReceiptItemReceivedQty(item)
  ) || 0;

const mergeReceiptsWithAvailableInventory = (receipts = [], availableRows = []) => {
  const availableByReceiptItemId = new Map();
  (Array.isArray(availableRows) ? availableRows : []).forEach((row) => {
    if (normalizeLookupText(row.sourceType) !== "receive") {
      return;
    }
    const receiptItemId = String(
      row.receiptItemId ?? row.receiveGoodsItemId ?? ""
    ).trim();
    if (!receiptItemId) {
      return;
    }
    availableByReceiptItemId.set(receiptItemId, row);
  });

  return (Array.isArray(receipts) ? receipts : []).map((receipt) => ({
    ...receipt,
    items: (receipt.items || [])
      .map((item) => {
        const receiptItemId = String(
          item.receiveGoodsItemId ?? item.ReceiveGoodsItemId ?? item.id ?? ""
        ).trim();
        const latestRow = receiptItemId
          ? availableByReceiptItemId.get(receiptItemId) ?? null
          : null;
        if (!latestRow) {
          return {
            ...item,
            liveAvailableQty: 0,
            receiptAvailableQty: 0,
            availableQty: 0,
            totalAvailableQty: 0,
          };
        }

        const latestAvailableQty = Math.max(Number(latestRow.availableQty ?? 0) || 0, 0);
        return {
          ...item,
          sourceKey: latestRow.sourceKey ?? item.sourceKey ?? `receive:${receiptItemId}`,
          sourceRowId: latestRow.sourceRowId ?? latestRow.sourceKey ?? `receive:${receiptItemId}`,
          sourceRef: latestRow.sourceRef ?? getReceiptReference(receipt),
          liveAvailableQty: latestAvailableQty,
          receiptAvailableQty: latestAvailableQty,
          availableQty: latestAvailableQty,
          totalAvailableQty: latestAvailableQty,
          consumedQty: Number(latestRow.consumedQty ?? item.consumedQty ?? 0) || 0,
          adjustedQty:
            Number(latestRow.reallocatedQty ?? latestRow.adjustedQty ?? item.adjustedQty ?? 0) ||
            0,
          reallocatedQty:
            Number(latestRow.reallocatedQty ?? latestRow.adjustedQty ?? item.reallocatedQty ?? 0) ||
            0,
        };
      })
      .filter((item) => getReceiptItemAvailableQty(item) > 0),
  }));
};

const mapReceiptItemsToChallanItems = (
  receipt = {},
  resolveAvailableQty = getReceiptItemAvailableQty
) =>
  Array.from(
    (receipt.items || []).reduce((map, item, index) => {
      const availableQty = Math.max(Number(resolveAvailableQty(item)) || 0, 0);
      if (availableQty <= 0) {
        return map;
      }
      const quantity = availableQty;
      const receivedQty = getReceiptItemReceivedQty(item);
      const receiveGoodsItemId =
        item.receiveGoodsItemId ?? item.ReceiveGoodsItemId ?? item.id ?? null;
      const sourceRowId = receiveGoodsItemId ? `receive:${receiveGoodsItemId}` : "";
      const nextItem = {
        id: item.id ?? `${Date.now()}-${index}`,
        sourceType: "receive",
        sourceKey: sourceRowId,
        sourceRowId,
        sourceRef: getReceiptReference(receipt),
        receiptItemId: receiveGoodsItemId,
        receiveGoodsItemId,
        poItemId:
          item.poItemId ??
          item.POItemId ??
          item.purchaseOrderItemId ??
          item.PurchaseOrderItemId ??
          null,
        itemId: item.itemId ?? item.ItemId ?? null,
        name: item.name || "",
        description: item.description || "",
        unit: item.unit || "PCS",
        hsn: item.hsn || "",
        gst: item.gst || "",
        receivedQty,
        previouslyUsedQty: Math.max(receivedQty - availableQty, 0),
        availableQty,
        quantity,
        rate: Number(item.unitPrice ?? item.rate ?? 0) || 0,
        notes: item.notes || "",
      };
      map.set(String(sourceRowId || nextItem.id), nextItem);
      return map;
    }, new Map()).values()
  )
    .filter((item) => item.name && Number(item.quantity) > 0);

const fmtQty = (value) =>
  (Number(value) || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 });

const toQuantity = (value) => Number(value) || 0;

const getDeliveryChallanRegisterStatus = (record = {}) => {
  const rawStatus = String(record.status || "")
    .trim()
    .toLowerCase();
  if (rawStatus.includes("partial")) {
    return "Partially Received";
  }
  if (rawStatus === "received" || rawStatus === "delivered" || rawStatus === "closed") {
    return "Received";
  }
  const deliveredQty = toQuantity(record.deliveredQty);
  const consumedQty = toQuantity(record.consumedQty);
  const balanceQty = toQuantity(record.balanceQty);
  if (deliveredQty > 0 && consumedQty > 0 && balanceQty > 0) {
    return "Partially Received";
  }
  if (deliveredQty > 0 && balanceQty <= 0) {
    return "Received";
  }
  return "Pending";
};

const getInventorySourceLabel = (sourceType = "") => {
  const normalized = normalizeLookupText(sourceType);
  if (normalized === "receive") {
    return "Receive Receipt Stock";
  }
  if (normalized === "consumption") {
    return "Consumption Leftover Stock";
  }
  if (normalized === "dc") {
    return "Delivery Challan Stock";
  }
  if (normalized === "reallocation") {
    return "Reallocated Stock";
  }
  return "Inventory Stock";
};

const mapAvailableInventoryRowToChallanItem = (row = {}, index = 0) => {
  const sourceType = row.sourceType || "consumption";
  const sourceKey =
    row.sourceKey ||
    `${sourceType}:${row.receiveGoodsItemId ?? row.deliveryChallanItemId ?? row.itemId ?? index}`;
  const sourceQty = Number(row.sourceQty ?? row.availableQty ?? 0) || 0;
  const availableQty = Math.max(Number(row.availableQty ?? 0) || 0, 0);
  return {
    id: sourceKey || `${Date.now()}-${index}`,
    sourceType,
    sourceKey,
    sourceRowId: row.sourceRowId ?? sourceKey,
    sourceRef: row.sourceRef || "",
    receiptItemId: row.receiptItemId ?? row.receiveGoodsItemId ?? null,
    receiveGoodsItemId: row.receiveGoodsItemId ?? null,
    deliveryChallanId: row.deliveryChallanId ?? null,
    deliveryChallanItemId: row.deliveryChallanItemId ?? null,
    itemId: row.itemId ?? null,
    name: row.name || "",
    description: row.description || "",
    unit: row.unit || "PCS",
    hsn: row.hsn || "",
    gst: row.gst || "",
    receivedQty: sourceQty,
    previouslyUsedQty: Math.max(
      sourceQty - availableQty,
      Number(row.consumedQty ?? 0) + Number(row.reallocatedQty ?? 0) || 0
    ),
    availableQty,
    quantity: availableQty,
    rate: Number(row.rate ?? 0) || 0,
    notes: row.notes || "",
  };
};

const isConsumptionLeftoverInventoryRow = (row = {}) => {
  const normalizedSourceType = normalizeLookupText(row.sourceType);
  return normalizedSourceType === "consumption" && toQuantity(row.availableQty) > 0;
};

const parseNumberValue = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const toPositiveNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
};

const buildSubmitSourceIdentity = (item = {}) =>
  String(
    item.sourceRowId ??
      item.SourceRowId ??
    item.sourceKey ??
      item.SourceKey ??
      item.receiptItemId ??
      item.ReceiptItemId ??
      item.receiveGoodsItemId ??
      item.ReceiveGoodsItemId ??
      item.deliveryChallanItemId ??
      item.DeliveryChallanItemId ??
      item.itemId ??
      item.ItemId ??
      ""
  ).trim();

const buildAvailabilityLookupKeys = (item = {}) =>
  Array.from(
    new Set(
      [
        String(item.sourceRowId ?? item.SourceRowId ?? "").trim(),
        String(item.sourceKey ?? item.SourceKey ?? "").trim(),
        toPositiveNumber(item.receiptItemId ?? item.ReceiptItemId) > 0
          ? `receive:${toPositiveNumber(item.receiptItemId ?? item.ReceiptItemId)}`
          : "",
        toPositiveNumber(item.receiveGoodsItemId ?? item.ReceiveGoodsItemId) > 0
          ? `receive:${toPositiveNumber(
              item.receiveGoodsItemId ?? item.ReceiveGoodsItemId
            )}`
          : "",
        toPositiveNumber(item.deliveryChallanId ?? item.DeliveryChallanId) > 0 &&
        toPositiveNumber(
          item.deliveryChallanItemId ??
            item.DeliveryChallanItemId ??
            item.deliveryChallanLineItemId ??
            item.DeliveryChallanLineItemId
        ) > 0
          ? `dc:${toPositiveNumber(
              item.deliveryChallanId ?? item.DeliveryChallanId
            )}:${toPositiveNumber(
              item.deliveryChallanItemId ??
                item.DeliveryChallanItemId ??
                item.deliveryChallanLineItemId ??
                item.DeliveryChallanLineItemId
            )}`
          : "",
        buildSubmitSourceIdentity(item),
      ].filter(Boolean)
    )
  );

const findUniqueAvailabilityRow = (rows = [], predicate) => {
  const matches = (Array.isArray(rows) ? rows : []).filter(predicate);
  return matches.length === 1 ? matches[0] : null;
};

const findLatestAvailabilityRow = (item = {}, rows = [], availabilityMap = new Map()) => {
  const lookupKeys = buildAvailabilityLookupKeys(item);
  const keyedMatch = lookupKeys.find((key) => availabilityMap.has(key));
  if (keyedMatch) {
    return availabilityMap.get(keyedMatch) ?? null;
  }

  const normalizedSourceType = normalizeLookupText(item.sourceType ?? item.SourceType);
  const deliveryChallanId = toPositiveNumber(
    item.deliveryChallanId ?? item.DeliveryChallanId
  );
  const deliveryChallanItemId = toPositiveNumber(
    item.deliveryChallanItemId ??
      item.DeliveryChallanItemId ??
      item.deliveryChallanLineItemId ??
      item.DeliveryChallanLineItemId
  );
  const receiveGoodsItemId = toPositiveNumber(
    item.receiveGoodsItemId ?? item.ReceiveGoodsItemId
  );
  const itemId = toPositiveNumber(item.itemId ?? item.ItemId);
  const sourceRef = String(item.sourceRef ?? item.SourceRef ?? "").trim().toLowerCase();
  const itemName = String(item.name ?? item.Name ?? item.Item ?? "").trim().toLowerCase();

  if (deliveryChallanId > 0 && deliveryChallanItemId > 0) {
    const exactDcRow = findUniqueAvailabilityRow(
      rows,
      (row) =>
        toPositiveNumber(row.deliveryChallanId) === deliveryChallanId &&
        toPositiveNumber(row.deliveryChallanItemId) === deliveryChallanItemId
    );
    if (exactDcRow) {
      return exactDcRow;
    }
  }

  if (receiveGoodsItemId > 0) {
    const exactReceiptRow = findUniqueAvailabilityRow(
      rows,
      (row) => toPositiveNumber(row.receiveGoodsItemId) === receiveGoodsItemId
    );
    if (exactReceiptRow) {
      return exactReceiptRow;
    }
  }

  if (normalizedSourceType && deliveryChallanId > 0 && itemId > 0 && sourceRef) {
    const dcItemRow = findUniqueAvailabilityRow(
      rows,
      (row) =>
        normalizeLookupText(row.sourceType) === normalizedSourceType &&
        toPositiveNumber(row.deliveryChallanId) === deliveryChallanId &&
        toPositiveNumber(row.itemId) === itemId &&
        String(row.sourceRef ?? "").trim().toLowerCase() === sourceRef
    );
    if (dcItemRow) {
      return dcItemRow;
    }
  }

  if (normalizedSourceType && itemId > 0 && sourceRef && itemName) {
    const typedItemRow = findUniqueAvailabilityRow(
      rows,
      (row) =>
        normalizeLookupText(row.sourceType) === normalizedSourceType &&
        toPositiveNumber(row.itemId) === itemId &&
        String(row.sourceRef ?? "").trim().toLowerCase() === sourceRef &&
        String(row.name ?? "").trim().toLowerCase() === itemName
    );
    if (typedItemRow) {
      return typedItemRow;
    }
  }

  if (normalizedSourceType && sourceRef && itemName) {
    return findUniqueAvailabilityRow(
      rows,
      (row) =>
        normalizeLookupText(row.sourceType) === normalizedSourceType &&
        String(row.sourceRef ?? "").trim().toLowerCase() === sourceRef &&
        String(row.name ?? "").trim().toLowerCase() === itemName
    );
  }

  return null;
};

const normalizeLookupText = (value = "") => String(value ?? "").trim().toLowerCase();
const normalizePreselectedReceiptIds = (value = []) =>
  Array.from(
    new Set(
      (Array.isArray(value) ? value : [])
        .map((entry) => String(entry ?? "").trim())
        .filter(Boolean)
    )
  );

const areReceiptSelectionsEqual = (left = [], right = []) => {
  const normalize = (value = []) =>
    normalizePreselectedReceiptIds(value).sort((a, b) => a.localeCompare(b));
  const leftIds = normalize(left);
  const rightIds = normalize(right);
  return (
    leftIds.length === rightIds.length &&
    leftIds.every((id, index) => id === rightIds[index])
  );
};

const CHALLAN_DETAIL_TABS = {
  DETAILS: "details",
  ITEMS: "items",
  HISTORY: "history",
};

const createReallocationModalState = (requestedBy = "") => ({
  open: false,
  record: null,
  targetLocationId: "",
  reallocationType: "partial",
  requestDate: new Date().toISOString().slice(0, 10),
  requestedBy,
  notes: "",
  items: [],
  loading: false,
  submitting: false,
  error: "",
});

const isInactiveReallocationStatus = (status = "") =>
  ["cancelled", "canceled", "rejected", "void"].includes(
    normalizeLookupText(status)
  );

const isReallocationItemLinkedToChallan = (item = {}, challan = {}) => {
  const challanId = String(challan.id ?? "").trim();
  const challanItemIds = new Set(
    (challan.items || [])
      .map((challanItem) => String(challanItem.id ?? "").trim())
      .filter(Boolean)
  );
  const receiptItemIds = new Set(
    (challan.items || [])
      .map((challanItem) => String(challanItem.receiveGoodsItemId ?? "").trim())
      .filter(Boolean)
  );
  const itemChallanId = String(item.deliveryChallanId ?? "").trim();
  const itemChallanItemId = String(item.deliveryChallanItemId ?? "").trim();
  const itemReceiptId = String(item.receiveGoodsItemId ?? "").trim();
  const challanRef = normalizeLookupText(challan.dcNumber);
  const itemRef = normalizeLookupText(item.sourceRef);

  return Boolean(
    (challanId && itemChallanId && challanId === itemChallanId) ||
      (itemChallanItemId && challanItemIds.has(itemChallanItemId)) ||
      (itemReceiptId && receiptItemIds.has(itemReceiptId)) ||
      (challanRef && itemRef && challanRef === itemRef)
  );
};

const isReallocationLinkedToChallan = (transfer = {}, challan = {}) => {
  const challanId = String(challan.id ?? "").trim();
  const transferReferenceType = normalizeLookupText(transfer.referenceType).replace(
    /[\s-]+/g,
    "_"
  );
  const transferReferenceId = String(transfer.referenceId ?? "").trim();
  const challanRef = normalizeLookupText(challan.dcNumber);
  const transferRef = normalizeLookupText(transfer.referenceNo);

  if (
    challanId &&
    transferReferenceType === "delivery_challan" &&
    transferReferenceId &&
    transferReferenceId === challanId
  ) {
    return true;
  }
  if (challanRef && transferRef && challanRef === transferRef) {
    return true;
  }
  return (transfer.items || []).some((item) =>
    isReallocationItemLinkedToChallan(item, challan)
  );
};

const getChallanReallocationHistory = (challan = {}, reallocations = []) =>
  (Array.isArray(reallocations) ? reallocations : [])
    .filter((transfer) => !isInactiveReallocationStatus(transfer.status))
    .map((transfer) => {
      const linkedItems = (transfer.items || []).filter((item) =>
        isReallocationItemLinkedToChallan(item, challan)
      );
      return linkedItems.length || isReallocationLinkedToChallan(transfer, challan)
        ? { ...transfer, linkedItems }
        : null;
    })
    .filter(Boolean)
    .sort((left, right) => {
      const leftDate = new Date(
        left.transferDate ?? left.requestDate ?? left.updatedAt ?? left.createdAt ?? 0
      ).getTime();
      const rightDate = new Date(
        right.transferDate ?? right.requestDate ?? right.updatedAt ?? right.createdAt ?? 0
      ).getTime();
      return rightDate - leftDate;
    });

const getChallanReallocationMetrics = (challan = {}, reallocations = []) => {
  const history = getChallanReallocationHistory(challan, reallocations);
  const totalReallocatedQty = history.reduce(
    (sum, transfer) =>
      sum +
      (transfer.linkedItems || []).reduce(
        (itemSum, item) => itemSum + (Number(item.quantity) || 0),
        0
      ),
    0
  );
  const remainingBalanceQty = Math.max(
    toQuantity(challan.balanceQty) - totalReallocatedQty,
    0
  );

  if (totalReallocatedQty <= 0) {
    return {
      history,
      historyCount: 0,
      totalReallocatedQty: 0,
      remainingBalanceQty,
      reallocationStatusKey: "not_reallocated",
      reallocationStatusLabel: "Not Reallocated",
      dcTypeKey: "original",
      dcTypeLabel: "Original DC",
    };
  }

  if (remainingBalanceQty > 0) {
    return {
      history,
      historyCount: history.length,
      totalReallocatedQty,
      remainingBalanceQty,
      reallocationStatusKey: "partially_reallocated",
      reallocationStatusLabel: "Partially Reallocated",
      dcTypeKey: "partially_reallocated",
      dcTypeLabel: "Partially Reallocated DC",
    };
  }

  return {
    history,
    historyCount: history.length,
    totalReallocatedQty,
    remainingBalanceQty,
    reallocationStatusKey: "fully_reallocated",
    reallocationStatusLabel: "Fully Reallocated",
    dcTypeKey: "reallocated",
    dcTypeLabel: "Reallocated DC",
  };
};

const getReallocationStatusTone = (statusKey = "") => {
  if (statusKey === "fully_reallocated") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }
  if (statusKey === "partially_reallocated") {
    return "border-amber-200 bg-amber-50 text-amber-700";
  }
  return "border-slate-200 bg-slate-100 text-slate-700";
};

const isReallocationItemMatchChallanItem = (reallocationItem = {}, challanItem = {}) => {
  const challanItemId = String(challanItem.id ?? "").trim();
  const reallocationChallanItemId = String(
    reallocationItem.deliveryChallanItemId ?? ""
  ).trim();
  if (challanItemId && reallocationChallanItemId && challanItemId === reallocationChallanItemId) {
    return true;
  }

  const challanReceiptItemId = String(challanItem.receiveGoodsItemId ?? "").trim();
  const reallocationReceiptItemId = String(
    reallocationItem.receiveGoodsItemId ?? ""
  ).trim();
  if (
    challanReceiptItemId &&
    reallocationReceiptItemId &&
    challanReceiptItemId === reallocationReceiptItemId
  ) {
    return true;
  }

  return (
    normalizeLookupText(reallocationItem.name) === normalizeLookupText(challanItem.name) &&
    normalizeLookupText(reallocationItem.unit || "PCS") ===
      normalizeLookupText(challanItem.unit || "PCS")
  );
};

const getChallanItemReallocatedQty = (challanItem = {}, history = []) =>
  (Array.isArray(history) ? history : []).reduce(
    (sum, transfer) =>
      sum +
      (transfer.linkedItems || []).reduce((itemSum, reallocationItem) => {
        if (!isReallocationItemMatchChallanItem(reallocationItem, challanItem)) {
          return itemSum;
        }
        return itemSum + (Number(reallocationItem.quantity) || 0);
      }, 0),
    0
  );

const DeliveryChallan = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const prefillSignatureRef = useRef("");
  const openChallanSignatureRef = useRef("");
  const [projects, setProjects] = useState(() => getProjects());
  const [locations, setLocations] = useState([]);
  const [purchaseOrders, setPurchaseOrders] = useState([]);
  const [receipts, setReceipts] = useState([]);
  const [records, setRecords] = useState([]);
  const [form, setForm] = useState(createFormState);
  const [items, setItems] = useState([]);
  const [loadedReceiptIds, setLoadedReceiptIds] = useState([]);
  const [receiptFilters, setReceiptFilters] = useState({
    search: "",
  });
  const [stockSources, setStockSources] = useState({
    receipts: true,
    consumptionLeftover: false,
  });
  const [selectedReceiptIds, setSelectedReceiptIds] = useState([]);
  const [errors, setErrors] = useState({});
  const [receiptsLoading, setReceiptsLoading] = useState(false);
  const [leftoverLoading, setLeftoverLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [receiptError, setReceiptError] = useState("");
  const [updateProof, setUpdateProof] = useState("");
  const [dcStatusFilter, setDcStatusFilter] = useState("all");
  const [dcTypeFilter, setDcTypeFilter] = useState("all");
  const [reallocationStatusFilter, setReallocationStatusFilter] = useState("all");
  const [editingId, setEditingId] = useState(null);
  const [viewChallanRecord, setViewChallanRecord] = useState(null);
  const [selectedChallan, setSelectedChallan] = useState(null);
  const [challanDetailTab, setChallanDetailTab] = useState(
    CHALLAN_DETAIL_TABS.DETAILS
  );
  const [printChallan, setPrintChallan] = useState(null);
  const [reallocations, setReallocations] = useState([]);
  const [reallocationModal, setReallocationModal] = useState(
    createReallocationModalState()
  );
  const [podModal, setPodModal] = useState({ type: "", record: null });
  const [podForm, setPodForm] = useState(createPodFormState);
  const [podAuditEntries, setPodAuditEntries] = useState([]);
  const [podAuditLoading, setPodAuditLoading] = useState(false);
  const [podActionLoading, setPodActionLoading] = useState(false);
  const [podActionError, setPodActionError] = useState("");
  const settings = useSettings();
  const company = settings?.company || {};
  const companyLogo = resolveBrandLogo(company.logo || "");
  const companyName = company.name || "Bangalore Electronics";
  const profileName = settings?.profile?.fullName || "Current user";
  const profileRole = settings?.profile?.role || "Viewer";
  const isPodReviewer = isPodReviewerRole(profileRole);

  const loadRecords = async () => {
    try {
      const list = await fetchDeliveryChallans();
      setRecords(Array.isArray(list) ? list : []);
    } catch (error) {
      console.error("Failed to load delivery challans:", error);
      setRecords([]);
    }
  };
  const loadLocations = async () => {
    try {
      const list = await fetchLocations();
      setLocations(Array.isArray(list) ? list : []);
    } catch {
      setLocations([]);
    }
  };
  const loadPurchaseOrders = async () => {
    try {
      const list = await fetchPurchaseOrders();
      setPurchaseOrders(Array.isArray(list) ? list : []);
    } catch {
      setPurchaseOrders([]);
    }
  };
  const loadReallocations = async () => {
    try {
      const list = await fetchReallocateInventory();
      setReallocations(Array.isArray(list) ? list : []);
    } catch (error) {
      console.error("Failed to load reallocation history:", error);
      setReallocations([]);
    }
  };
  const loadReceipts = async (
    projectId = null,
    { excludeDeliveryChallanId = null } = {}
  ) => {
    if (!projectId) {
      setReceipts([]);
      setReceiptError("");
      setReceiptsLoading(false);
      return [];
    }
    try {
      setReceiptsLoading(true);
      const list = await fetchReceiveGoods({ projectId: Number(projectId) });
      const normalizedList = Array.isArray(list) ? list : [];
      const distinctLocationIds = Array.from(
        new Set(
          normalizedList
            .map((receipt) => parseNumberValue(receipt.locationId))
            .filter((locationId) => locationId !== null && locationId > 0)
        )
      );
      const availableInventoryGroups = await Promise.all(
        distinctLocationIds.map((locationId) =>
          fetchAvailableInventory({
            projectId: Number(projectId),
            locationId,
            excludeDeliveryChallanId: excludeDeliveryChallanId || undefined,
          }).catch((error) => {
            console.error(
              `Failed to load available inventory for location ${locationId}:`,
              error
            );
            return [];
          })
        )
      );
      const latestAvailableRows = availableInventoryGroups.flat();
      const receiptsWithLiveAvailability = mergeReceiptsWithAvailableInventory(
        normalizedList,
        latestAvailableRows
      );
      console.debug("Delivery Challan receipt stock refresh", {
        projectId: Number(projectId),
        receiptCount: receiptsWithLiveAvailability.length,
        availableRowCount: latestAvailableRows.length,
        sampleReceiptItems: receiptsWithLiveAvailability
          .flatMap((receipt) =>
            (receipt.items || []).slice(0, 3).map((item) => ({
              receiptRef: getReceiptReference(receipt),
              item: item.name,
              receiptItemId:
                item.receiveGoodsItemId ?? item.ReceiveGoodsItemId ?? item.id ?? null,
              displayedAvailableQty: getReceiptItemAvailableQty(item),
            }))
          )
          .slice(0, 10),
      });
      setReceipts(receiptsWithLiveAvailability);
      setReceiptError("");
      return receiptsWithLiveAvailability;
    } catch (error) {
      setReceipts([]);
      setReceiptError(
        error?.response?.data?.error ||
          error?.message ||
          "Could not load receive receipts."
      );
      return [];
    } finally {
      setReceiptsLoading(false);
    }
  };

  const loadNextDcNumber = async () => {
    try {
      const nextNumber = await fetchNextDeliveryChallanNumber();
      if (nextNumber) {
        setForm((prev) =>
          editingId || String(prev.dcNumber).trim()
            ? prev
            : { ...prev, dcNumber: nextNumber }
        );
      }
    } catch {
      // Keep manual input fallback if auto-number API fails.
    }
  };

  useEffect(() => {
    void loadRecords();
    void loadLocations();
    void loadPurchaseOrders();
    void loadReallocations();
    void loadNextDcNumber();
  }, []);

  useEffect(() => {
    void loadReceipts(form.projectId || null);
  }, [form.projectId]);

  useEffect(() => {
    const refreshRecords = () => {
      void loadRecords();
    };
    const refreshLocations = () => {
      void loadLocations();
    };
    const refreshProjects = () => {
      setProjects(getProjects());
    };
    const refreshPurchaseOrders = () => {
      void loadPurchaseOrders();
    };
    const refreshReceipts = () => {
      void loadReceipts(form.projectId || null);
    };
    const refreshNumber = () => {
      void loadNextDcNumber();
    };
    const refreshReallocations = () => {
      void loadReallocations();
    };

    window.addEventListener("delivery-challans:changed", refreshRecords);
    window.addEventListener("consumptions:changed", refreshRecords);
    window.addEventListener("reallocate-inventory:changed", refreshRecords);
    window.addEventListener("locations:changed", refreshLocations);
    window.addEventListener("projects:changed", refreshProjects);
    window.addEventListener("purchase-orders:changed", refreshPurchaseOrders);
    window.addEventListener("receive-goods:changed", refreshReceipts);
    window.addEventListener("delivery-challans:changed", refreshReceipts);
    window.addEventListener("consumptions:changed", refreshReceipts);
    window.addEventListener("reallocate-inventory:changed", refreshReceipts);
    window.addEventListener("delivery-challans:changed", refreshNumber);
    window.addEventListener("reallocate-inventory:changed", refreshReallocations);
    return () => {
      window.removeEventListener("delivery-challans:changed", refreshRecords);
      window.removeEventListener("consumptions:changed", refreshRecords);
      window.removeEventListener("reallocate-inventory:changed", refreshRecords);
      window.removeEventListener("locations:changed", refreshLocations);
      window.removeEventListener("projects:changed", refreshProjects);
      window.removeEventListener("purchase-orders:changed", refreshPurchaseOrders);
      window.removeEventListener("receive-goods:changed", refreshReceipts);
      window.removeEventListener("delivery-challans:changed", refreshReceipts);
      window.removeEventListener("consumptions:changed", refreshReceipts);
      window.removeEventListener("reallocate-inventory:changed", refreshReceipts);
      window.removeEventListener("delivery-challans:changed", refreshNumber);
      window.removeEventListener(
        "reallocate-inventory:changed",
        refreshReallocations
      );
    };
  }, [form.projectId]);

  useEffect(() => {
    if (!viewChallanRecord?.id) {
      return;
    }
    const matchedRecord = records.find(
      (record) => String(record.id) === String(viewChallanRecord.id)
    );
    if (matchedRecord) {
      setViewChallanRecord(matchedRecord);
    }
  }, [records, viewChallanRecord?.id]);

  useEffect(() => {
    if (!selectedChallan?.id) {
      return;
    }
    const matchedRecord = records.find(
      (record) => String(record.id) === String(selectedChallan.id)
    );
    if (matchedRecord) {
      setSelectedChallan(matchedRecord);
    }
  }, [records, selectedChallan?.id]);

  useEffect(() => {
    if (!printChallan?.id) {
      return;
    }
    const matchedRecord = records.find(
      (record) => String(record.id) === String(printChallan.id)
    );
    if (matchedRecord) {
      setPrintChallan(matchedRecord);
    }
  }, [printChallan?.id, records]);

  useEffect(() => {
    if (editingId || form.projectId || !projects.length) {
      return;
    }
    const activeProjectId = getActiveProjectId();
    if (!activeProjectId) {
      return;
    }
    const exists = projects.some(
      (project) => String(project.id) === String(activeProjectId)
    );
    if (!exists) {
      return;
    }
    setForm((prev) => ({ ...prev, projectId: String(activeProjectId) }));
  }, [editingId, form.projectId, projects]);

  useEffect(() => {
    if (form.projectId) {
      setActiveProjectId(form.projectId);
    }
  }, [form.projectId]);

  useEffect(() => {
    if (editingId || !form.projectId || form.toLocationId || form.toLocation) {
      return;
    }
    const preferredLocation = locations.find(
      (location) => String(location.projectId) === String(form.projectId)
    );
    if (!preferredLocation) {
      return;
    }
    setForm((prev) => ({
      ...prev,
      toLocationId: String(preferredLocation.id),
      toLocation: preferredLocation.name || prev.toLocation,
    }));
  }, [editingId, form.projectId, form.toLocation, form.toLocationId, locations]);

  useEffect(() => {
    if (!form.toLocationId) {
      return;
    }
    const selectedLocation = locations.find(
      (location) => String(location.id) === String(form.toLocationId)
    );
    if (!selectedLocation) {
      return;
    }
    setForm((prev) =>
      prev.toLocation === selectedLocation.name
        ? prev
        : {
            ...prev,
            toLocation: selectedLocation.name || prev.toLocation,
          }
    );
  }, [form.toLocationId, locations]);

  const projectMap = useMemo(() => {
    return projects.reduce((acc, project) => {
      acc[String(project.id)] = project;
      return acc;
    }, {});
  }, [projects]);

  const locationMap = useMemo(() => {
    return locations.reduce((acc, location) => {
      acc[String(location.id)] = location;
      return acc;
    }, {});
  }, [locations]);

  const purchaseOrderMap = useMemo(
    () =>
      purchaseOrders.reduce((acc, purchaseOrder) => {
        acc[String(purchaseOrder.id)] = purchaseOrder;
        return acc;
      }, {}),
    [purchaseOrders]
  );

  const receiptMap = useMemo(() => {
    return receipts.reduce((acc, receipt) => {
      acc[String(receipt.id)] = receipt;
      return acc;
    }, {});
  }, [receipts]);

  const receiptItemToReceiptIdMap = useMemo(() => {
    return receipts.reduce((acc, receipt) => {
      (receipt.items || []).forEach((item) => {
        const itemId = String(
          item.receiveGoodsItemId ?? item.ReceiveGoodsItemId ?? item.id ?? ""
        );
        if (!itemId) {
          return;
        }
        acc[itemId] = String(receipt.id);
      });
      return acc;
    }, {});
  }, [receipts]);

  const destinationLocations = useMemo(() => {
    if (!form.projectId) {
      return locations;
    }
    const linkedLocations = locations.filter(
      (location) => String(location.projectId) === String(form.projectId)
    );
    if (!linkedLocations.length) {
      return locations;
    }
    const linkedIds = new Set(linkedLocations.map((location) => String(location.id)));
    return [
      ...linkedLocations,
      ...locations.filter((location) => !linkedIds.has(String(location.id))),
    ];
  }, [locations, form.projectId]);

  const receiptsForSelection = useMemo(() => {
    const scopedReceipts = !form.projectId
      ? receipts
      : receipts.filter(
          (receipt) => String(receipt.projectId) === String(form.projectId)
        );
    return scopedReceipts.filter((receipt) => (receipt.items || []).length > 0);
  }, [receipts, form.projectId]);

  const filteredReceiptsForSelection = useMemo(() => {
    const searchText = normalizeLookupText(receiptFilters.search);
    if (!searchText) {
      return receiptsForSelection;
    }
    return receiptsForSelection.filter((receipt) => {
      const reference = normalizeLookupText(getReceiptReference(receipt));
      const poNumber = normalizeLookupText(
        purchaseOrderMap[String(receipt.purchaseOrderId)]?.poNumber ||
          `PO-${receipt.purchaseOrderId || ""}`
      );
      return reference.includes(searchText) || poNumber.includes(searchText);
    });
  }, [purchaseOrderMap, receiptFilters, receiptsForSelection]);

  const getReceiptPurchaseOrderNumber = useCallback(
    (receipt = {}) =>
      purchaseOrderMap[String(receipt.purchaseOrderId)]?.poNumber ||
      receipt.poNumber ||
      receipt.PONumber ||
      (receipt.purchaseOrderId ? `PO-${receipt.purchaseOrderId}` : "-"),
    [purchaseOrderMap]
  );

  const getReceiptItemCount = useCallback(
    (receipt = {}) => (Array.isArray(receipt.items) ? receipt.items.length : 0),
    []
  );

  const getReceiptTotalQuantity = useCallback(
    (receipt = {}) =>
      (receipt.items || []).reduce(
        (sum, item) => sum + getReceiptItemReceivedQty(item),
        0
      ),
    []
  );

  const selectedReceipts = useMemo(
    () =>
      selectedReceiptIds
        .map((receiptId) => receiptMap[String(receiptId)])
        .filter(Boolean),
    [receiptMap, selectedReceiptIds]
  );

  const selectableFilteredReceiptIds = useMemo(() => {
    return filteredReceiptsForSelection.map((receipt) => String(receipt.id));
  }, [filteredReceiptsForSelection]);

  const deliveredQtyByReceiptItem = useMemo(() => {
    return records.reduce((acc, record) => {
      if (editingId && String(record.id) === String(editingId)) {
        return acc;
      }
      (record.items || []).forEach((item) => {
        const receiptItemId = Number.parseInt(
          item.receiveGoodsItemId ?? item.ReceiveGoodsItemId ?? "",
          10
        );
        if (!Number.isFinite(receiptItemId) || receiptItemId <= 0) {
          return;
        }
        const deliveredQty = Number(item.quantity ?? item.Quantity ?? 0) || 0;
        if (deliveredQty <= 0) {
          return;
        }
        acc.set(receiptItemId, (acc.get(receiptItemId) ?? 0) + deliveredQty);
      });
      return acc;
    }, new Map());
  }, [editingId, records]);

  const getRemainingReceiptItemQty = useCallback((item = {}) => {
    const liveAvailableQty = Number(
      item.liveAvailableQty ?? item.LiveAvailableQty
    );
    if (Number.isFinite(liveAvailableQty)) {
      return Math.max(liveAvailableQty, 0);
    }
    const receiptQty = getReceiptItemReceivedQty(item);
    const hintedAvailableQty = getReceiptItemAvailableQty(item);
    const receiptItemId = Number.parseInt(
      item.receiveGoodsItemId ?? item.ReceiveGoodsItemId ?? item.id ?? "",
      10
    );
    const alreadyDelivered =
      Number.isFinite(receiptItemId) && receiptItemId > 0
        ? deliveredQtyByReceiptItem.get(receiptItemId) ?? 0
        : 0;
    const remainingFromHistory = Math.max(receiptQty - alreadyDelivered, 0);
    return Math.max(0, Math.min(hintedAvailableQty, remainingFromHistory));
  }, [deliveredQtyByReceiptItem]);

  const receiptItemAvailabilityMap = useMemo(() => {
    return receipts.reduce((acc, receipt) => {
      (receipt.items || []).forEach((item) => {
        const receiptItemId = String(
          item.receiveGoodsItemId ?? item.ReceiveGoodsItemId ?? item.id ?? ""
        ).trim();
        if (!receiptItemId) {
          return;
        }
        acc[receiptItemId] = {
          receipt,
          item,
          availableQty: getRemainingReceiptItemQty(item),
        };
      });
      return acc;
    }, {});
  }, [getRemainingReceiptItemQty, receipts]);

  const selectedReceiptItems = useMemo(() => {
    return selectedReceipts.flatMap((receipt) =>
      mapReceiptItemsToChallanItems(receipt, (item) => getRemainingReceiptItemQty(item))
    );
  }, [getRemainingReceiptItemQty, selectedReceipts]);

  const receiptItemDetailsMap = useMemo(() => {
    return receipts.reduce((acc, receipt) => {
      (receipt.items || []).forEach((item) => {
        const itemId = String(
          item.receiveGoodsItemId ?? item.ReceiveGoodsItemId ?? item.id ?? ""
        ).trim();
        if (!itemId) {
          return;
        }
        acc[itemId] = {
          receipt,
          item,
        };
      });
      return acc;
    }, {});
  }, [receipts]);

  const hydrateEditableChallanItems = useCallback(
    (challanItems = []) =>
      (Array.isArray(challanItems) ? challanItems : []).map((challanItem) => {
        const normalizedSourceType = normalizeLookupText(challanItem.sourceType);
        const receiptItemId = String(
          challanItem.receiveGoodsItemId ?? challanItem.ReceiveGoodsItemId ?? ""
        ).trim();
        if (normalizedSourceType !== "receive" || !receiptItemId) {
          return challanItem;
        }

        const receiptDetail = receiptItemDetailsMap[receiptItemId];
        if (!receiptDetail?.item) {
          return challanItem;
        }

        const { receipt, item } = receiptDetail;
        const receivedQty = getReceiptItemReceivedQty(item);
        const availableQty = getRemainingReceiptItemQty(item);

        return {
          ...challanItem,
          sourceType: challanItem.sourceType || "receive",
          sourceKey: challanItem.sourceKey || `receive:${receiptItemId}`,
          sourceRowId: challanItem.sourceRowId || `receive:${receiptItemId}`,
          sourceRef: challanItem.sourceRef || getReceiptReference(receipt),
          receiptItemId:
            challanItem.receiptItemId ??
            challanItem.ReceiptItemId ??
            challanItem.receiveGoodsItemId ??
            challanItem.ReceiveGoodsItemId ??
            item.id ??
            null,
          receiveGoodsItemId:
            challanItem.receiveGoodsItemId ?? challanItem.ReceiveGoodsItemId ?? item.id ?? null,
          poItemId:
            challanItem.poItemId ??
            challanItem.POItemId ??
            item.poItemId ??
            item.POItemId ??
            item.purchaseOrderItemId ??
            item.PurchaseOrderItemId ??
            null,
          itemId: challanItem.itemId ?? challanItem.ItemId ?? item.itemId ?? item.ItemId ?? null,
          name: challanItem.name || item.name || item.ItemName || "",
          description: challanItem.description || item.description || item.Description || "",
          unit: challanItem.unit || item.unit || item.Unit || "PCS",
          hsn: challanItem.hsn || item.hsn || item.HSN || "",
          gst: challanItem.gst || item.gst || item.GST || "",
          receivedQty,
          previouslyUsedQty: Math.max(receivedQty - availableQty, 0),
          availableQty,
        };
      }),
    [getRemainingReceiptItemQty, receiptItemDetailsMap]
  );

  const buildLatestReceiptStockMap = useCallback(
    (receiptList = []) => {
      const nextMap = new Map();
      (Array.isArray(receiptList) ? receiptList : []).forEach((receipt) => {
        (receipt.items || []).forEach((item) => {
          const receiptItemId = parseNumberValue(
            item.receiveGoodsItemId ?? item.ReceiveGoodsItemId ?? item.id
          );
          if (!receiptItemId) {
            return;
          }
          nextMap.set(String(receiptItemId), {
            receipt,
            item,
            availableQty: getRemainingReceiptItemQty(item),
          });
        });
      });
      return nextMap;
    },
    [getRemainingReceiptItemQty]
  );

  const buildReceiptItemToReceiptIdMap = useCallback((receiptList = []) => {
    const nextMap = new Map();
    (Array.isArray(receiptList) ? receiptList : []).forEach((receipt) => {
      const receiptId = parseNumberValue(receipt.id ?? receipt.receiveGoodsId);
      if (!receiptId) {
        return;
      }
      (receipt.items || []).forEach((item) => {
        const receiptItemId = parseNumberValue(
          item.receiveGoodsItemId ?? item.ReceiveGoodsItemId ?? item.id
        );
        if (!receiptItemId) {
          return;
        }
        nextMap.set(String(receiptItemId), receiptId);
      });
    });
    return nextMap;
  }, []);

  const selectedReceiptsSummary = useMemo(
    () => ({
      receipts: selectedReceipts.length,
      items: selectedReceipts.reduce(
        (sum, receipt) => sum + getReceiptItemCount(receipt),
        0
      ),
      quantity: selectedReceipts.reduce(
        (sum, receipt) => sum + getReceiptTotalQuantity(receipt),
        0
      ),
    }),
    [getReceiptItemCount, getReceiptTotalQuantity, selectedReceipts]
  );

  const loadedReceiptsSummary = useMemo(() => {
    const loadedIds = new Set(loadedReceiptIds.map((id) => String(id)));
    const loadedReceipts = receipts.filter((receipt) =>
      loadedIds.has(String(receipt.id))
    );
    return {
      receipts: loadedReceipts.length,
      items: items.length,
      quantity: items.reduce((sum, item) => sum + toQuantity(item.quantity), 0),
    };
  }, [items, loadedReceiptIds, receipts]);

  const formatReceiptReference = (value) => {
    if (Array.isArray(value)) {
      const refs = value
        .map((entry) => formatReceiptReference(entry))
        .filter((entry) => entry && entry !== "-");
      if (!refs.length) {
        return "-";
      }
      if (refs.length <= 2) {
        return refs.join(", ");
      }
      return `${refs.slice(0, 2).join(", ")} +${refs.length - 2} more`;
    }
    if (value === null || value === undefined || value === "") {
      return "-";
    }
    const receipt = receiptMap[String(value)] ?? null;
    if (receipt) {
      return buildReceiptReferenceLabel(
        receipt,
        projectMap[String(receipt.projectId)]?.name || ""
      );
    }
    const numeric = Number(value);
    return Number.isFinite(numeric)
      ? `RG-${String(numeric).padStart(3, "0")}`
      : String(value);
  };

  useEffect(() => {
    if (!receipts.length) {
      return;
    }
    setSelectedReceiptIds((prev) =>
      prev.filter((receiptId) => Boolean(receiptMap[String(receiptId)]))
    );
  }, [receiptMap, receipts.length]);

  useEffect(() => {
    if (editingId) {
      return;
    }
    setLoadedReceiptIds((prev) =>
      prev.filter((receiptId) => selectedReceiptIds.includes(String(receiptId)))
    );
  }, [editingId, selectedReceiptIds]);

  useEffect(() => {
    if (!items.length) {
      return;
    }

    const seenReceiptRowIds = new Set();
    const unavailableLabels = [];
    let hasChanges = false;

    const nextItems = items.reduce((acc, item) => {
      const normalizedSourceType = normalizeLookupText(item.sourceType);
      if (normalizedSourceType !== "receive") {
        acc.push(item);
        return acc;
      }

      const receiptItemId = String(
        item.receiptItemId ??
          item.ReceiptItemId ??
          item.receiveGoodsItemId ??
          item.ReceiveGoodsItemId ??
          ""
      ).trim();
      const latestReceiptItem = receiptItemId
        ? receiptItemAvailabilityMap[receiptItemId]
        : null;

      if (!receiptItemId || seenReceiptRowIds.has(receiptItemId)) {
        hasChanges = true;
        return acc;
      }
      seenReceiptRowIds.add(receiptItemId);

      if (!latestReceiptItem || latestReceiptItem.availableQty <= 0) {
        hasChanges = true;
        unavailableLabels.push(
          `${item.sourceRef || "Receipt"} | ${item.name || "Item"}`
        );
        return acc;
      }

      const latestAvailableQty = Math.max(Number(latestReceiptItem.availableQty) || 0, 0);
      const sourceRef = getReceiptReference(latestReceiptItem.receipt);
      const nextQuantity = Math.min(
        Math.max(Number(item.quantity) || 0, 0),
        latestAvailableQty
      );
      const nextItem = {
        ...item,
        id: item.id ?? `receive:${receiptItemId}`,
        sourceType: "receive",
        sourceKey: `receive:${receiptItemId}`,
        sourceRowId: `receive:${receiptItemId}`,
        sourceRef,
        receiptItemId: Number(receiptItemId),
        receiveGoodsItemId: Number(receiptItemId),
        availableQty: latestAvailableQty,
        receivedQty: getReceiptItemReceivedQty(latestReceiptItem.item),
        previouslyUsedQty: Math.max(
          getReceiptItemReceivedQty(latestReceiptItem.item) - latestAvailableQty,
          0
        ),
        quantity: nextQuantity,
      };

      if (
        nextItem.sourceKey !== item.sourceKey ||
        nextItem.sourceRef !== item.sourceRef ||
        nextItem.availableQty !== item.availableQty ||
        nextItem.quantity !== item.quantity ||
        nextItem.receiveGoodsItemId !== item.receiveGoodsItemId
      ) {
        hasChanges = true;
      }

      acc.push(nextItem);
      return acc;
    }, []);

    if (hasChanges) {
      setItems(nextItems);
      if (unavailableLabels.length) {
        setReceiptError(
          `Unavailable receipt rows removed: ${unavailableLabels.join(", ")}.`
        );
      }
    }
  }, [items, receiptItemAvailabilityMap]);

  const resetForm = () => {
    setForm(createFormState());
    setItems([]);
    setLoadedReceiptIds([]);
    setStockSources({
      receipts: true,
      consumptionLeftover: false,
    });
    setReceiptFilters({
      search: "",
    });
    setSelectedReceiptIds([]);
    setErrors({});
    setReceiptError("");
    setEditingId(null);
    void loadNextDcNumber();
  };

  useEffect(() => {
    const preselectedIds = normalizePreselectedReceiptIds(
      location.state?.preselectedReceiveGoodsIds
    );
    const preselectedProjectId = String(
      location.state?.preselectedProjectId ?? ""
    ).trim();
    const preselectedFromLocationId = String(
      location.state?.preselectedFromLocationId ?? ""
    ).trim();
    if (!preselectedIds.length) {
      return;
    }

    const signature = `${location.key}:${preselectedIds.join(",")}`;
    if (prefillSignatureRef.current === signature) {
      return;
    }
    prefillSignatureRef.current = signature;

    setEditingId(null);
    setErrors({});
    setReceiptError("");
    setReceiptFilters({
      search: "",
    });
    setForm((prev) => ({
      ...prev,
      projectId: preselectedProjectId || prev.projectId,
      fromLocationId: preselectedFromLocationId || prev.fromLocationId,
    }));
    setSelectedReceiptIds(preselectedIds);
  }, [location.key, location.state]);

  useEffect(() => {
    const openChallanId = String(location.state?.openChallanId ?? "").trim();
    const requestedTab = String(location.state?.openChallanTab ?? "").trim();
    if (!openChallanId || !records.length) {
      return;
    }

    const nextTab = Object.values(CHALLAN_DETAIL_TABS).includes(requestedTab)
      ? requestedTab
      : CHALLAN_DETAIL_TABS.DETAILS;
    const matchedRecord = records.find(
      (record) => String(record.id) === openChallanId
    );
    if (!matchedRecord) {
      return;
    }

    const signature = `${location.key}:${openChallanId}:${nextTab}`;
    if (openChallanSignatureRef.current === signature) {
      return;
    }
    openChallanSignatureRef.current = signature;

    setSelectedChallan(matchedRecord);
    setChallanDetailTab(nextTab);
  }, [location.key, location.state, records]);

  const validate = (candidateItems = items) => {
    const nextErrors = {};
    if (!form.dcNumber.trim()) {
      nextErrors.dcNumber = "DC number is required.";
    }
    if (!form.projectId) {
      nextErrors.projectId = "Select a project.";
    }
    if (!form.fromLocationId) {
      nextErrors.fromLocationId = "Select source.";
    }
    if (!form.toLocationId && !form.toLocation.trim()) {
      nextErrors.toLocationId = "Select destination.";
    }

    const validItems = candidateItems.filter(
      (item) => item.name.trim() && Number(item.quantity) > 0
    );
    if (!validItems.length) {
      nextErrors.items = "Add at least one line item.";
    }

    const invalidIdentityItem = validItems.find((item) => {
      const normalizedSourceType = normalizeLookupText(item.sourceType);
      const hasSourceIdentity = Boolean(buildSubmitSourceIdentity(item));
      const hasItemId = toPositiveNumber(item.itemId ?? item.ItemId) > 0;
      if (normalizedSourceType === "receive") {
        return !hasSourceIdentity || !hasItemId || toPositiveNumber(item.receiveGoodsItemId) <= 0;
      }
      return !hasSourceIdentity || !hasItemId;
    });
    if (invalidIdentityItem) {
      nextErrors.items = `Source mapping is missing for ${invalidIdentityItem.name || "an item"}. Reload the source rows and try again.`;
    }

    const zeroOrNegativeItem = validItems.find(
      (item) => !Number.isFinite(Number(item.quantity)) || Number(item.quantity) <= 0
    );
    if (zeroOrNegativeItem) {
      nextErrors.items = `Quantity for ${zeroOrNegativeItem.name || "an item"} must be greater than zero.`;
    }

    const invalidQuantityItem = validItems.find((item) => {
      const itemAvailableQty = getReceiptItemAvailableQty(item);
      const quantity = Number(item.quantity) || 0;
      return quantity > itemAvailableQty;
    });
    if (invalidQuantityItem) {
      nextErrors.items = `DC quantity for ${invalidQuantityItem.name || "an item"} cannot exceed available quantity (${getReceiptItemAvailableQty(invalidQuantityItem)}).`;
    }

    const duplicateSourceRows = new Set();
    const aggregatedItems = validItems.reduce((map, item) => {
      const normalizedName = String(item.name ?? item.ItemName ?? item.item ?? item.Item ?? "")
        .trim()
        .toLowerCase();
      const normalizedUnit = String(item.unit ?? item.Unit ?? "PCS")
        .trim()
        .toLowerCase() || "pcs";
      const materialKey = `${normalizedName}::${normalizedUnit}`;
      const key = buildSubmitSourceIdentity(item) || materialKey;
      const quantity = Number(item.quantity) || 0;
      const availableQty = getReceiptItemAvailableQty(item);
      if (map.has(key)) {
        duplicateSourceRows.add(item.name || "an item");
      }
      const existing = map.get(key) || {
        name: item.name || "an item",
        quantity: 0,
        availableQty,
      };
      existing.quantity += quantity;
      existing.availableQty = Math.max(existing.availableQty, availableQty);
      map.set(key, existing);
      return map;
    }, new Map());

    if (!nextErrors.items && duplicateSourceRows.size) {
      nextErrors.items = `Duplicate source rows selected for ${Array.from(duplicateSourceRows).join(", ")}. Remove duplicate rows before saving.`;
    }

    const duplicateExceeded = Array.from(aggregatedItems.values()).find(
      (group) => group.quantity > group.availableQty
    );
    if (duplicateExceeded) {
      nextErrors.items = `Total DC quantity for ${duplicateExceeded.name || "an item"} cannot exceed available quantity (${duplicateExceeded.availableQty}).`;
    }
    if (!nextErrors.items && selectedReceiptIds.length && !loadedReceiptIds.length) {
      nextErrors.items = "Please load selected receipts before saving the delivery challan.";
    }
    if (
      !nextErrors.items &&
      loadedReceiptIds.length &&
      !areReceiptSelectionsEqual(selectedReceiptIds, loadedReceiptIds)
    ) {
      nextErrors.items =
        "Receipt selection changed after loading. Load selected receipts again before saving.";
    }

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const buildNormalizedItemsForSubmit = useCallback(
    (sourceItems = []) =>
      (Array.isArray(sourceItems) ? sourceItems : [])
        .map((item) => {
          const quantity = Number(item.quantity) || 0;
          const rate = Number(item.rate) || 0;
          return {
            ...item,
            id: item.id ?? buildSubmitSourceIdentity(item),
            sourceType: String(item.sourceType ?? item.SourceType ?? "").trim(),
            sourceKey: String(item.sourceKey ?? item.SourceKey ?? "").trim(),
            sourceRowId: String(
              item.sourceRowId ?? item.SourceRowId ?? item.sourceKey ?? item.SourceKey ?? ""
            ).trim(),
            sourceRef: String(item.sourceRef ?? item.SourceRef ?? "").trim(),
            name: String(item.name ?? item.Name ?? item.Item ?? "").trim(),
            description: String(item.description ?? item.Description ?? "").trim(),
            unit: String(item.unit ?? item.Unit ?? "PCS").trim() || "PCS",
            hsn: String(item.hsn ?? item.HSN ?? "").trim(),
            gst: String(item.gst ?? item.GST ?? "").trim(),
            quantity,
            rate,
            availableQty: Math.max(Number(item.availableQty ?? 0) || 0, 0),
            receiptItemId: parseNumberValue(
              item.receiptItemId ??
                item.ReceiptItemId ??
                item.receiveGoodsItemId ??
                item.ReceiveGoodsItemId
            ),
            receiveGoodsItemId: parseNumberValue(
              item.receiveGoodsItemId ?? item.ReceiveGoodsItemId
            ),
            poItemId: parseNumberValue(item.poItemId ?? item.POItemId),
            itemId: parseNumberValue(item.itemId ?? item.ItemId),
            deliveryChallanId: parseNumberValue(
              item.deliveryChallanId ?? item.DeliveryChallanId
            ),
            deliveryChallanItemId: parseNumberValue(
              item.deliveryChallanItemId ??
                item.DeliveryChallanItemId ??
                item.deliveryChallanLineItemId ??
                item.DeliveryChallanLineItemId
            ),
          };
        })
        .filter((item) => item.name && item.quantity > 0),
    []
  );

  const buildFreshAvailabilityMap = useCallback((rows = []) => {
    const nextMap = new Map();
    (Array.isArray(rows) ? rows : []).forEach((row) => {
      buildAvailabilityLookupKeys(row).forEach((key) => {
        if (!nextMap.has(key)) {
          nextMap.set(key, row);
        }
      });
    });
    return nextMap;
  }, []);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setReceiptError("");
    if (isSubmitting) {
      return;
    }

    const normalizedItems = buildNormalizedItemsForSubmit(items);
    if (!validate(normalizedItems)) {
      console.debug("Delivery challan validation failed", {
        items: normalizedItems,
        selectedReceiptIds,
        loadedReceiptIds,
      });
      return;
    }

    const receiptIdsForPayload = loadedReceiptIds.length
      ? loadedReceiptIds
      : selectedReceiptIds;

    const projectId = parseNumberValue(form.projectId);
    const fromLocationId = parseNumberValue(form.fromLocationId);
    const toLocationId = parseNumberValue(form.toLocationId);

    if (!projectId || !fromLocationId || !toLocationId) {
      setReceiptError(
        "Project, source location, and destination location are required before saving."
      );
      return;
    }

    setIsSubmitting(true);

    try {
      const latestReceipts = await loadReceipts(projectId, {
        excludeDeliveryChallanId: editingId || null,
      });
      const latestReceiptStockMap = buildLatestReceiptStockMap(latestReceipts);
      const latestReceiptItemToReceiptIdMap = buildReceiptItemToReceiptIdMap(latestReceipts);
      const latestAvailableRows = await fetchAvailableInventory({
        projectId,
        locationId: fromLocationId,
        excludeDeliveryChallanId: editingId || undefined,
        includeConsumptionLeftover: true,
      });
      const freshAvailabilityMap = buildFreshAvailabilityMap(latestAvailableRows);
      const requestedBySource = new Map();
      const remappedItems = normalizedItems.map((item) => {
        const normalizedSourceType = normalizeLookupText(item.sourceType);
        let latestRow = null;
        let latestAvailableQty = 0;
        let sourceKey = "";
        let sourceRowId = "";
        let sourceRef = String(item.sourceRef ?? "").trim();
        let resolvedReceiptItemId = parseNumberValue(
          item.receiptItemId ?? item.receiveGoodsItemId
        );
        let resolvedReceiveGoodsItemId = parseNumberValue(item.receiveGoodsItemId);

        if (normalizedSourceType === "receive") {
          const receiptItemId = parseNumberValue(
            item.receiptItemId ?? item.receiveGoodsItemId
          );
          const latestReceiptRow = receiptItemId
            ? latestReceiptStockMap.get(String(receiptItemId))
            : null;
          const rowLabel = `${item.sourceRef || "Receipt"} | ${item.name || "Item"}`;

          if (!latestReceiptRow) {
            throw new Error(
              `Receipt row ${rowLabel} is no longer available. Reload the latest receipt stock and try again.`
            );
          }

          latestAvailableQty = Math.max(Number(latestReceiptRow.availableQty ?? 0) || 0, 0);
          sourceRef = getReceiptReference(latestReceiptRow.receipt);
          resolvedReceiptItemId = receiptItemId;
          resolvedReceiveGoodsItemId = receiptItemId;
          sourceKey = `receive:${receiptItemId}`;
          sourceRowId = sourceKey;

          if (latestAvailableQty <= 0) {
            throw new Error(
              `Receipt row ${sourceRef} | ${item.name || "Item"} is fully used and cannot be dispatched again.`
            );
          }

          console.debug("Delivery Challan receipt balance check", {
            receiptRef: sourceRef,
            item: item.name,
            receiptItemId,
            displayedAvailableQty: item.availableQty,
            latestFrontendAvailableQty: latestAvailableQty,
          });
        } else {
          latestRow = findLatestAvailabilityRow(
            item,
            latestAvailableRows,
            freshAvailabilityMap
          );
          if (!latestRow) {
            throw new Error(
              `Source row ${item.sourceRef || "-"} | ${item.name || "an item"} is no longer available. Reload the latest stock and try again.`
            );
          }

          latestAvailableQty = Math.max(Number(latestRow.availableQty ?? 0) || 0, 0);
          sourceKey = String(
            latestRow.sourceKey ?? item.sourceKey ?? buildAvailabilityLookupKeys(item)[0] ?? ""
          ).trim();
          sourceRowId = String(
            latestRow.sourceRowId ?? latestRow.sourceKey ?? item.sourceRowId ?? sourceKey
          ).trim();
          sourceRef = String(latestRow.sourceRef ?? item.sourceRef ?? "").trim();
          resolvedReceiptItemId =
            parseNumberValue(
              latestRow.receiptItemId ??
                latestRow.receiveGoodsItemId ??
                item.receiptItemId ??
                item.receiveGoodsItemId
            ) ?? null;
          resolvedReceiveGoodsItemId =
            parseNumberValue(latestRow.receiveGoodsItemId ?? item.receiveGoodsItemId) ?? null;

          if (latestAvailableQty <= 0) {
            throw new Error(
              `${item.sourceRef || "This source row"} | ${item.name || "This item"} is already fully used and cannot be dispatched again.`
            );
          }

          console.debug("Delivery Challan inventory balance check", {
            sourceRef,
            item: item.name,
            sourceRowId,
            displayedAvailableQty: item.availableQty,
            latestFrontendAvailableQty: latestAvailableQty,
          });
        }

        requestedBySource.set(
          sourceRowId || sourceKey,
          (requestedBySource.get(sourceRowId || sourceKey) ?? 0) +
            Math.max(Number(item.quantity) || 0, 0)
        );

        return {
          ...item,
          sourceType:
            normalizedSourceType === "receive"
              ? "receive"
              : String(latestRow?.sourceType ?? item.sourceType ?? "").trim(),
          sourceKey,
          sourceRowId: sourceRowId || sourceKey,
          sourceRef,
          receiptItemId: resolvedReceiptItemId ?? null,
          receiveGoodsItemId: resolvedReceiveGoodsItemId ?? null,
          poItemId: parseNumberValue(item.poItemId) ?? null,
          itemId: parseNumberValue(latestRow?.itemId ?? item.itemId) ?? null,
          deliveryChallanId:
            parseNumberValue(latestRow?.deliveryChallanId ?? item.deliveryChallanId) ?? null,
          deliveryChallanItemId:
            parseNumberValue(
              latestRow?.deliveryChallanItemId ?? item.deliveryChallanItemId
            ) ?? null,
          availableQty: latestAvailableQty,
        };
      });

      const duplicateRequested = remappedItems.find((item) => {
        const sourceIdentity = String(item.sourceRowId ?? item.sourceKey ?? "").trim();
        return !sourceIdentity || (requestedBySource.get(sourceIdentity) ?? 0) > item.availableQty;
      });
      if (duplicateRequested) {
        throw new Error(
          `DC quantity for ${duplicateRequested.name || "an item"} cannot exceed the latest available quantity (${duplicateRequested.availableQty}).`
        );
      }

      const invalidMappedItem = remappedItems.find(
        (item) =>
          !item.itemId ||
          (!item.receiveGoodsItemId && normalizeLookupText(item.sourceType) === "receive") ||
          (!item.sourceRowId && !item.sourceKey) ||
          item.quantity <= 0
      );
      if (invalidMappedItem) {
        throw new Error(
          `Required source identifiers are missing for ${invalidMappedItem.name || "an item"}. Reload the source rows and try again.`
        );
      }

      const exactReceiptIdsForPayload = Array.from(
        new Set(
          remappedItems
            .map((item) => {
              if (normalizeLookupText(item.sourceType) !== "receive") {
                return null;
              }
              const receiptItemId = parseNumberValue(
                item.receiptItemId ?? item.receiveGoodsItemId
              );
              return receiptItemId
                ? latestReceiptItemToReceiptIdMap.get(String(receiptItemId)) ?? null
                : null;
            })
            .filter((receiptId) => receiptId !== null && receiptId > 0)
        )
      );

      const payload = {
        dcNumber: String(form.dcNumber ?? "").trim(),
        projectId,
        receiveGoodsId:
          exactReceiptIdsForPayload[0] ??
          parseNumberValue(form.receiveGoodsId),
        receiveGoodsIds: exactReceiptIdsForPayload.length
          ? exactReceiptIdsForPayload
          : receiptIdsForPayload
              .map((receiptId) => parseNumberValue(receiptId))
              .filter((receiptId) => receiptId !== null && receiptId > 0),
        fromLocationId,
        toLocationId,
        toLocation: String(form.toLocation ?? "").trim(),
        vehicleNumber: String(form.vehicleNumber ?? "").trim() || null,
        eWayBillNumber: String(form.eWayBillNumber ?? "").trim() || null,
        issueDate: String(form.issueDate ?? "").trim() || null,
        status: String(form.status ?? "Draft").trim(),
        podStatus: POD_STATUS.PENDING,
        podReference: null,
        podDate: null,
        notes: String(form.notes ?? "").trim() || null,
        auditBy: profileName,
        auditRole: profileRole,
        items: remappedItems.map((item) => ({
          receiptItemId: item.receiptItemId,
          receiveGoodsItemId: item.receiveGoodsItemId,
          poItemId: item.poItemId,
          itemId: item.itemId,
          deliveryChallanId: item.deliveryChallanId,
          deliveryChallanItemId: item.deliveryChallanItemId,
          sourceType: item.sourceType || null,
          sourceKey: item.sourceKey || null,
          sourceRowId: item.sourceRowId || item.sourceKey || null,
          sourceRef: item.sourceRef || null,
          name: item.name,
          description: item.description || null,
          unit: item.unit || "PCS",
          hsn: item.hsn || null,
          gst: item.gst || null,
          quantity: Number(item.quantity) || 0,
          rate: Number(item.rate) || 0,
          notes: item.notes || null,
        })),
      };

      console.debug("Delivery challan submit payload", payload);
      console.debug("Delivery challan receipt linkage", {
        selectedReceiptIds: receiptIdsForPayload,
        exactReceiptIdsForPayload,
        remappedReceiveItems: remappedItems
          .filter((item) => normalizeLookupText(item.sourceType) === "receive")
          .map((item) => ({
            item: item.name,
            receiptItemId: item.receiptItemId ?? item.receiveGoodsItemId ?? null,
            receiveGoodsItemId: item.receiveGoodsItemId ?? null,
            sourceRowId: item.sourceRowId ?? null,
            sourceRef: item.sourceRef ?? null,
          })),
      });
      payload.items.forEach((item, index) => {
        console.debug(`Item ${index + 1}:`, item);
      });

      let savedChallan;
      if (editingId) {
        savedChallan = await updateDeliveryChallan(editingId, payload);
      } else {
        savedChallan = await createDeliveryChallan(payload);
      }
      await loadRecords();
      await loadReceipts(projectId);
      resetForm();
      setUpdateProof(
        `${editingId ? "Delivery challan updated" : "Delivery challan saved"}: ${
          savedChallan?.dcNumber || payload.dcNumber || "-"
        } | Status: ${savedChallan?.podStatus || savedChallan?.status || payload.podStatus || "Pending"}`
      );
    } catch (error) {
      const apiErrorMessage =
        error?.response?.data?.error ||
        error?.response?.data?.message ||
        error?.message ||
        "Failed to save delivery challan.";
      setReceiptError(apiErrorMessage);
      console.error("Failed to save delivery challan:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEdit = (record) => {
    if (
      normalizePodStatus(record?.podStatus) === POD_STATUS.VERIFIED &&
      !isPodReviewer
    ) {
      setReceiptError("POD verified challans are locked for non-manager edits.");
      return;
    }
    const matchedToLocation =
      (record.toLocationId && locationMap[String(record.toLocationId)]) ||
      locations.find(
        (location) =>
          String(location.name || "").trim().toLowerCase() ===
          String(record.toLocation || "").trim().toLowerCase()
      ) ||
      null;
    setEditingId(record.id);
    setForm({
      dcNumber: record.dcNumber || "",
      projectId: record.projectId || "",
      receiveGoodsId: record.receiveGoodsId ? String(record.receiveGoodsId) : "",
      fromLocationId: record.fromLocationId || "",
      toLocationId: matchedToLocation ? String(matchedToLocation.id) : "",
      toLocation: matchedToLocation?.name || record.toLocation || "",
      vehicleNumber: record.vehicleNumber || "",
      eWayBillNumber: record.eWayBillNumber || "",
      issueDate: record.issueDate || new Date().toISOString().slice(0, 10),
      status: record.status || "Draft",
      podStatus: normalizePodStatus(record.podStatus),
      podReference: record.podReference || "",
      podDate: record.podDate || "",
      notes: record.notes || "",
    });
    setItems(
      record.items?.length ? hydrateEditableChallanItems(record.items) : [createLineItem()]
    );
    const recordReceiptIds = Array.from(
      new Set([
        ...(Array.isArray(record.receiveGoodsIds) ? record.receiveGoodsIds : []),
        ...(record.receiveGoodsId ? [record.receiveGoodsId] : []),
        ...(record.items || [])
          .map((item) => {
            const linkedItemId = String(
              item.receiveGoodsItemId ?? item.ReceiveGoodsItemId ?? ""
            );
            return linkedItemId ? receiptItemToReceiptIdMap[linkedItemId] : null;
          })
          .filter(Boolean),
      ])
    ).map((value) => String(value));
    setSelectedReceiptIds(recordReceiptIds);
    setLoadedReceiptIds(recordReceiptIds);
    setErrors({});
    setReceiptFilters((prev) => ({
      ...prev,
      search: "",
    }));
  };

  useEffect(() => {
    if (!editingId || !receipts.length) {
      return;
    }
    setItems((prev) => hydrateEditableChallanItems(prev));
  }, [editingId, hydrateEditableChallanItems, receipts.length]);

  const handleDelete = async (id) => {
    try {
      await deleteDeliveryChallan(id);
      await loadRecords();
      await loadReceipts(form.projectId || null);
    } catch (error) {
      console.error("Failed to delete delivery challan:", error);
    }
  };

  const challanMetaRows = useMemo(() => {
    const issuedCount = records.filter((record) => record.status === "Issued").length;
    const deliveredCount = records.filter((record) => record.status === "Delivered").length;
    const draftCount = records.filter((record) => record.status === "Draft").length;
    return [
      { label: "Total Challans", value: records.length },
      { label: "Issued", value: issuedCount },
      { label: "Delivered", value: deliveredCount },
      { label: "Draft", value: draftCount },
    ];
  }, [records]);

  const filteredRecords = useMemo(() => {
    return records.filter((record) => {
      const registerStatus = getDeliveryChallanRegisterStatus(record).toLowerCase();
      const reallocationMetrics = getChallanReallocationMetrics(record, reallocations);
      if (dcStatusFilter !== "all" && registerStatus !== dcStatusFilter) {
        return false;
      }
      if (
        dcTypeFilter !== "all" &&
        reallocationMetrics.dcTypeKey !== dcTypeFilter
      ) {
        return false;
      }
      if (
        reallocationStatusFilter !== "all" &&
        reallocationMetrics.reallocationStatusKey !== reallocationStatusFilter
      ) {
        return false;
      }
      return true;
    });
  }, [dcStatusFilter, dcTypeFilter, reallocationStatusFilter, records, reallocations]);

  const handlePrint = async (record) => {
    if (!record) return;
    setPrintChallan(record);
    window.setTimeout(() => {
      void printSection({
        selector: "#delivery-challan-print-area",
        title: "Delivery Challan",
        subtitle: record.dcNumber || "Dispatch copy",
        logoUrl: company.logo || "",
        brandName: companyName,
        brandDescription: company.address || "Company address",
      });
    }, 80);
  };

  const handleViewChallan = (
    record
  ) => {
    if (!record) return;
    setViewChallanRecord(record);
  };

  const handleOpenChallanDetail = (
    record,
    tab = CHALLAN_DETAIL_TABS.DETAILS
  ) => {
    if (!record) return;
    setSelectedChallan(record);
    setChallanDetailTab(tab);
  };

  const closeChallanDetail = () => {
    setSelectedChallan(null);
    setChallanDetailTab(CHALLAN_DETAIL_TABS.DETAILS);
  };

  const closeReallocationModal = () => {
    setReallocationModal(createReallocationModalState(profileName));
  };

  const handleOpenReallocation = async (record) => {
    if (!record?.id) {
      return;
    }
    if (!record.toLocationId) {
      setUpdateProof("Reallocation requires a valid DC destination location.");
      return;
    }

    setReallocationModal({
      ...createReallocationModalState(profileName),
      open: true,
      record,
      loading: true,
    });

    try {
      const availableRows = await fetchAvailableInventory({
        projectId: parseNumberValue(record.projectId),
        locationId: parseNumberValue(record.toLocationId),
      });
      const linkedRows = availableRows
        .filter((row) => {
          const sourceType = normalizeLookupText(row.sourceType);
          return (
            sourceType === "dc" &&
            String(row.deliveryChallanId ?? "").trim() === String(record.id)
          );
        })
        .map((row, index) => ({
          id:
            row.sourceKey ||
            row.deliveryChallanItemId ||
            row.receiveGoodsItemId ||
            `${record.id}-${index}`,
          name: row.name || `Item ${index + 1}`,
          description: row.description || "",
          unit: row.unit || "PCS",
          quantity: "",
          availableQty: Math.max(Number(row.availableQty) || 0, 0),
          sourceQty: Math.max(Number(row.sourceQty) || 0, 0),
          sourceKey: row.sourceKey || "",
          sourceRef: row.sourceRef || record.dcNumber || "",
          receiveGoodsItemId: row.receiveGoodsItemId ?? null,
          deliveryChallanId: row.deliveryChallanId ?? record.id,
          deliveryChallanItemId: row.deliveryChallanItemId ?? null,
          itemId: row.itemId ?? null,
        }))
        .filter((item) => item.availableQty > 0);

      setReallocationModal((prev) => ({
        ...prev,
        loading: false,
        items: linkedRows,
        error: linkedRows.length
          ? ""
          : "No remaining DC balance is available for reallocation.",
      }));
    } catch (error) {
      setReallocationModal((prev) => ({
        ...prev,
        loading: false,
        error:
          error?.response?.data?.error ||
          error?.message ||
          "Failed to load DC balance for reallocation.",
      }));
    }
  };

  const handleReallocationItemChange = (itemId, value) => {
    setReallocationModal((prev) => ({
      ...prev,
      reallocationType: "partial",
      items: prev.items.map((item) =>
        String(item.id) === String(itemId)
          ? { ...item, quantity: value }
          : item
      ),
    }));
  };

  const handleReallocationTypeChange = (nextType) => {
    setReallocationModal((prev) => ({
      ...prev,
      reallocationType: nextType,
      items: prev.items.map((item) => ({
        ...item,
        quantity:
          nextType === "full"
            ? String(Math.max(Number(item.availableQty) || 0, 0))
            : item.quantity,
      })),
    }));
  };

  const handleReallocationSubmit = async (event) => {
    event.preventDefault();
    const challan = reallocationModal.record;
    if (!challan?.id) {
      return;
    }

    const targetLocation = locations.find(
      (locationItem) =>
        String(locationItem.id) === String(reallocationModal.targetLocationId)
    );
    if (!targetLocation) {
      setReallocationModal((prev) => ({
        ...prev,
        error: "Select a destination location for this reallocation.",
      }));
      return;
    }
    if (String(targetLocation.id) === String(challan.toLocationId)) {
      setReallocationModal((prev) => ({
        ...prev,
        error: "Destination location must be different from the current DC location.",
      }));
      return;
    }

    const positiveItems = reallocationModal.items
      .map((item) => ({
        ...item,
        quantity: Number(item.quantity) || 0,
      }))
      .filter((item) => item.quantity > 0);

    if (!positiveItems.length) {
      setReallocationModal((prev) => ({
        ...prev,
        error: "Enter at least one reallocation quantity.",
      }));
      return;
    }

    const invalidItem = positiveItems.find(
      (item) => item.quantity > (Number(item.availableQty) || 0)
    );
    if (invalidItem) {
      setReallocationModal((prev) => ({
        ...prev,
        error: `${invalidItem.name} cannot exceed the available balance (${fmtQty(
          invalidItem.availableQty
        )}).`,
      }));
      return;
    }

    setReallocationModal((prev) => ({
      ...prev,
      submitting: true,
      error: "",
    }));

    try {
      const savedReallocation = await createReallocateInventory({
        type: "Reallocate",
        referenceType: "delivery_challan",
        referenceId: parseNumberValue(challan.id),
        referenceNo: challan.dcNumber || "",
        projectId:
          parseNumberValue(targetLocation.projectId) ??
          parseNumberValue(challan.projectId),
        sourceProjectId: parseNumberValue(challan.projectId),
        fromLocationId: parseNumberValue(challan.toLocationId),
        toLocationId: parseNumberValue(targetLocation.id),
        requestDate: reallocationModal.requestDate || null,
        requestedBy:
          String(reallocationModal.requestedBy || "").trim() || profileName,
        status: "Completed",
        notes: String(reallocationModal.notes || "").trim() || null,
        items: positiveItems.map((item) => ({
          itemId: item.itemId,
          name: item.name,
          description: item.description || null,
          unit: item.unit || "PCS",
          quantity: item.quantity,
          receiveGoodsItemId: item.receiveGoodsItemId,
          deliveryChallanId: parseNumberValue(challan.id),
          deliveryChallanItemId: item.deliveryChallanItemId,
          sourceType: "dc",
          sourceKey: item.sourceKey || null,
          sourceRef: item.sourceRef || challan.dcNumber || null,
        })),
      });
      closeReallocationModal();
      navigate("/inventory/reallocation-register", {
        state: {
          highlightReallocationId: String(
            savedReallocation?.id ?? savedReallocation?.transferId ?? ""
          ),
          successMessage: `Reallocation saved for ${
            challan.dcNumber || "the delivery challan"
          } to ${targetLocation.name || "the selected location"}.`,
        },
      });
    } catch (error) {
      setReallocationModal((prev) => ({
        ...prev,
        submitting: false,
        error:
          error?.response?.data?.error ||
          error?.message ||
          "Failed to save reallocation.",
      }));
    }
  };

  const closePodModal = () => {
    setPodModal({ type: "", record: null });
    setPodForm(createPodFormState());
    setPodAuditEntries([]);
    setPodAuditLoading(false);
    setPodActionError("");
  };

  const openPodUploadModal = (record) => {
    setPodModal({ type: "upload", record });
    setPodForm({
      ...createPodFormState(),
      reference: record?.podReference || "",
      podDate: record?.podDate ? String(record.podDate).slice(0, 16) : "",
    });
    setPodActionError("");
  };

  const openPodDetailsModal = async (record, type = "details") => {
    setPodModal({ type, record });
    setPodForm(createPodFormState());
    setPodActionError("");
    if (
      type === "details" &&
      record?.id &&
      record.podDocumentName &&
      !record.podDocumentData
    ) {
      try {
        setPodActionLoading(true);
        const freshRecord = await fetchDeliveryChallan(record.id);
        setPodModal((prev) =>
          prev.type === type && String(prev.record?.id) === String(record.id)
            ? { ...prev, record: { ...record, ...freshRecord } }
            : prev
        );
      } catch (error) {
        setPodActionError(
          error?.response?.data?.error ||
            error?.message ||
            "Failed to load POD document."
        );
      } finally {
        setPodActionLoading(false);
      }
    }
  };

  const openPodActionModal = (record, type) => {
    if (!isPodReviewer) {
      setReceiptError("Only Admin or Manager users can approve POD workflow actions.");
      return;
    }
    setPodModal({ type, record });
    setPodForm(createPodFormState());
    setPodActionError("");
  };

  const openPodAuditModal = async (record) => {
    setPodModal({ type: "audit", record });
    setPodForm(createPodFormState());
    setPodActionError("");
    setPodAuditEntries([]);
    if (!record?.id) {
      return;
    }
    try {
      setPodAuditLoading(true);
      const entries = await fetchDeliveryChallanPodAudit(record.id);
      setPodAuditEntries(Array.isArray(entries) ? entries : []);
    } catch (error) {
      setPodActionError(
        error?.response?.data?.error ||
          error?.message ||
          "Failed to load POD audit log."
      );
    } finally {
      setPodAuditLoading(false);
    }
  };

  const handlePodFileChange = async (event) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    if (file.size > POD_UPLOAD_LIMIT_BYTES) {
      setPodActionError("POD file must be 5 MB or smaller.");
      event.target.value = "";
      return;
    }
    try {
      setPodActionError("");
      const fileData = await readFileAsDataUrl(file);
      setPodForm((prev) => ({
        ...prev,
        fileName: file.name,
        fileType: file.type || "application/octet-stream",
        fileSize: file.size,
        fileData,
      }));
    } catch (error) {
      setPodActionError(error?.message || "Failed to read POD file.");
    }
  };

  const syncPodRecord = (updatedChallan) => {
    if (!updatedChallan?.id) {
      return;
    }
    if (viewChallanRecord && String(viewChallanRecord.id) === String(updatedChallan.id)) {
      setViewChallanRecord(updatedChallan);
    }
    if (selectedChallan && String(selectedChallan.id) === String(updatedChallan.id)) {
      setSelectedChallan(updatedChallan);
    }
    if (printChallan && String(printChallan.id) === String(updatedChallan.id)) {
      setPrintChallan(updatedChallan);
    }
  };

  const handlePodUploadSubmit = async (event) => {
    event.preventDefault();
    const record = podModal.record;
    if (!record?.id) {
      return;
    }
    if (!podForm.fileData || !podForm.fileName) {
      setPodActionError("Upload a POD document before saving.");
      return;
    }
    try {
      setPodActionLoading(true);
      setPodActionError("");
      const updatedChallan = await uploadDeliveryChallanPod(record.id, {
        podReference: podForm.reference.trim() || null,
        podDate: podForm.podDate || null,
        remarks: podForm.remarks.trim() || null,
        fileName: podForm.fileName,
        fileType: podForm.fileType,
        fileSize: podForm.fileSize,
        fileData: podForm.fileData,
        auditBy: profileName,
        auditRole: profileRole,
      });
      await loadRecords();
      syncPodRecord(updatedChallan);
      setUpdateProof(
        `POD uploaded: ${updatedChallan?.dcNumber || record.dcNumber || "-"}`
      );
      closePodModal();
    } catch (error) {
      setPodActionError(
        error?.response?.data?.error || error?.message || "Failed to upload POD."
      );
    } finally {
      setPodActionLoading(false);
    }
  };

  const handlePodActionSubmit = async (event) => {
    event.preventDefault();
    const record = podModal.record;
    const action = podModal.type;
    if (!record?.id || !action) {
      return;
    }
    const remarks = podForm.remarks.trim();
    const needsRemarks = ["reject", "dispute", "waive", "resolve"].includes(action);
    if (needsRemarks && !remarks) {
      setPodActionError("Remarks are required for this POD action.");
      return;
    }
    try {
      setPodActionLoading(true);
      setPodActionError("");
      const updatedChallan = await updateDeliveryChallanPodStatus(record.id, {
        action,
        remarks: remarks || null,
        auditBy: profileName,
        auditRole: profileRole,
      });
      await loadRecords();
      syncPodRecord(updatedChallan);
      setUpdateProof(
        `POD updated: ${updatedChallan?.dcNumber || record.dcNumber || "-"} | ${getPodStatusLabel(updatedChallan?.podStatus)}`
      );
      closePodModal();
    } catch (error) {
      setPodActionError(
        error?.response?.data?.error ||
          error?.message ||
          "Failed to update POD workflow."
      );
    } finally {
      setPodActionLoading(false);
    }
  };

  const handleProjectChange = (nextProjectId) => {
    const preferredLocation =
      locations.find(
        (location) => String(location.projectId) === String(nextProjectId)
      ) || null;

    setForm((prev) => ({
      ...prev,
      projectId: nextProjectId,
      receiveGoodsId: "",
      toLocationId: preferredLocation ? String(preferredLocation.id) : "",
      toLocation: preferredLocation?.name || "",
    }));
    setReceiptFilters((prev) => ({
      ...prev,
      search: "",
    }));
    setSelectedReceiptIds([]);
    setLoadedReceiptIds([]);
    setItems([]);
    setReceiptError("");
  };

  const handleStockSourceToggle = (key) => {
    setStockSources((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      return next.receipts || next.consumptionLeftover
        ? next
        : { ...next, [key]: true };
    });
  };

  const handleToLocationChange = (nextLocationId) => {
    const selectedLocation =
      locations.find((location) => String(location.id) === String(nextLocationId)) || null;

    setForm((prev) => ({
      ...prev,
      toLocationId: nextLocationId,
      toLocation: selectedLocation?.name || "",
    }));
  };

  const handleReceiptFilterChange = (value) => {
    setReceiptFilters((prev) => ({
      ...prev,
      search: value,
    }));
  };

  const toggleReceiptSelection = (receiptId) => {
    const receipt = receiptMap[String(receiptId)];
    if (!receipt) {
      return;
    }
    setReceiptError("");
    setSelectedReceiptIds((prev) =>
      prev.includes(String(receiptId))
        ? prev.filter((id) => id !== String(receiptId))
        : [...prev, String(receiptId)]
    );
  };

  const toggleAllFilteredReceipts = () => {
    const selectableReceiptIds = selectableFilteredReceiptIds;
    if (!selectableReceiptIds.length) {
      return;
    }
    setReceiptError("");
    setSelectedReceiptIds((prev) => {
      const allSelected = selectableReceiptIds.every((id) => prev.includes(id));
      if (allSelected) {
        return prev.filter((id) => !selectableReceiptIds.includes(id));
      }
      return Array.from(new Set([...prev, ...selectableReceiptIds]));
    });
  };

  const handleLoadSelectedReceipts = () => {
    if (!selectedReceipts.length) {
      setItems([]);
      setLoadedReceiptIds([]);
      setForm((prev) => ({
        ...prev,
        receiveGoodsId: "",
        fromLocationId: "",
      }));
      return;
    }
    const selectedLocationIds = Array.from(
      new Set(
        selectedReceipts
          .map((receipt) => {
            const linkedPurchaseOrder =
              purchaseOrderMap[String(receipt.purchaseOrderId)] || null;
            return String(
              receipt.locationId ?? linkedPurchaseOrder?.locationId ?? ""
            ).trim();
          })
          .filter(Boolean)
      )
    );
    if (selectedLocationIds.length > 1) {
      setReceiptError("Selected receipts must come from the same source location.");
      return;
    }
    const nextItems = selectedReceiptItems.length ? selectedReceiptItems : [];
    if (!nextItems.length) {
      setReceiptError("Selected receipts do not have items with available quantity.");
      return;
    }
    const primaryReceipt = selectedReceipts[0];
    const primaryPurchaseOrder =
      purchaseOrderMap[String(primaryReceipt?.purchaseOrderId)] || null;
    const nextProjectId =
      primaryReceipt?.projectId
        ? String(primaryReceipt.projectId)
        : primaryPurchaseOrder?.projectId
        ? String(primaryPurchaseOrder.projectId)
        : "";
    const nextFromLocationId =
      primaryReceipt?.locationId
        ? String(primaryReceipt.locationId)
        : primaryPurchaseOrder?.locationId
        ? String(primaryPurchaseOrder.locationId)
        : "";
    setItems(
      nextItems.map((item) => ({
        ...item,
        quantity: Number(item.quantity ?? item.availableQty ?? 0) || 0,
      }))
    );
    setLoadedReceiptIds([...selectedReceiptIds]);
    setForm((prev) => {
      const currentDestination = locations.find(
        (location) => String(location.id) === String(prev.toLocationId)
      );
      const projectPreferredLocation =
        resolveProjectPreferredLocation(locations, nextProjectId) ||
        resolveProjectPreferredLocation(locations, prev.projectId);
      const resolvedToLocation =
        currentDestination &&
        (!nextProjectId ||
          String(currentDestination.projectId ?? "") === String(nextProjectId))
          ? currentDestination
          : projectPreferredLocation;

      return {
        ...prev,
        receiveGoodsId: primaryReceipt?.id ? String(primaryReceipt.id) : "",
        projectId: nextProjectId || prev.projectId,
        fromLocationId: nextFromLocationId,
        toLocationId: resolvedToLocation ? String(resolvedToLocation.id) : "",
        toLocation: resolvedToLocation?.name || "",
      };
    });
    setReceiptError("");
  };

  const handleLoadConsumptionLeftover = async () => {
    if (!form.projectId || !form.fromLocationId) {
      setReceiptError(
        "Select project and source location before loading consumption leftover stock."
      );
      return;
    }

    try {
      setLeftoverLoading(true);
      setReceiptError("");
      const availableRows = await fetchAvailableInventory({
        projectId: parseNumberValue(form.projectId),
        locationId: parseNumberValue(form.fromLocationId),
        includeConsumptionLeftover: true,
      });
      const leftoverItems = (Array.isArray(availableRows) ? availableRows : [])
        .filter(isConsumptionLeftoverInventoryRow)
        .map((row, index) =>
          mapAvailableInventoryRowToChallanItem(
            {
              ...row,
              sourceType: "consumption",
            },
            index
          )
        );

      if (!leftoverItems.length) {
        setReceiptError(
          "No consumption leftover stock is available for the selected project and source location."
        );
        return;
      }

      setItems((prev) => {
        const existingKeys = new Set(
          prev.map((item) => String(item.sourceKey || item.id || "")).filter(Boolean)
        );
        const nextItems = leftoverItems.filter(
          (item) => !existingKeys.has(String(item.sourceKey || item.id || ""))
        );
        return [...prev, ...nextItems];
      });
      if (!items.some((item) => normalizeLookupText(item.sourceType) === "receive")) {
        setSelectedReceiptIds([]);
        setLoadedReceiptIds([]);
        setForm((prev) => ({ ...prev, receiveGoodsId: "" }));
      }
      setReceiptError("");
    } catch (error) {
      setReceiptError(
        error?.response?.data?.error ||
          error?.message ||
          "Could not load consumption leftover stock."
      );
    } finally {
      setLeftoverLoading(false);
    }
  };

  const handleLineItemQuantityChange = (itemId, nextValue) => {
    const parsed = Number(nextValue);
    const safeValue = Number.isFinite(parsed) ? parsed : 0;
    setItems((prev) =>
      prev.map((item) => {
        if (String(item.id) !== String(itemId)) {
          return item;
        }
        const availableQty = Number(item.availableQty ?? 0) || 0;
        const clamped = Math.max(0, Math.min(safeValue, availableQty));
        return {
          ...item,
          quantity: clamped,
        };
      })
    );
  };

  const handleRemoveLineItem = (itemId) => {
    setItems((prev) => prev.filter((item) => String(item.id) !== String(itemId)));
  };

  const allFilteredReceiptsSelected =
    selectableFilteredReceiptIds.length > 0 &&
    selectableFilteredReceiptIds.every((receiptId) =>
      selectedReceiptIds.includes(receiptId)
    );

  const podButtonClass =
    "inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-700 hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60";
  const podDangerButtonClass =
    "inline-flex items-center gap-1 rounded-md border border-rose-200 bg-rose-50 px-2 py-1 text-[11px] font-medium text-rose-700 hover:border-rose-300 hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60";
  const podSuccessButtonClass =
    "inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-[11px] font-medium text-emerald-700 hover:border-emerald-300 hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-60";

  const renderPodWorkflowCell = (record) => {
    const status = normalizePodStatus(record.podStatus);
    const timestamp = getPodTimestamp(record);
    const actor = getPodActor(record);
    const canUpload = [POD_STATUS.PENDING, POD_STATUS.REJECTED].includes(status);
    const canReview = isPodReviewer && [
      POD_STATUS.UPLOADED,
      POD_STATUS.UNDER_VERIFICATION,
    ].includes(status);
    const hasDocument = Boolean(record.podDocumentData || record.podDocumentName);

    return (
      <div className="min-w-[240px] space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${podStatusTone(
              status
            )}`}
          >
            {getPodStatusLabel(status)}
          </span>
        </div>
        {timestamp && timestamp !== "-" ? (
          <p className="text-[11px] text-slate-500">{formatDateTime(timestamp)}</p>
        ) : null}
        {status === POD_STATUS.VERIFIED && actor ? (
          <p className="text-[11px] text-slate-500">Verified by {actor}</p>
        ) : null}
        {status === POD_STATUS.WAIVED ? (
          <p className="text-[11px] text-slate-500">
            {[record.podWaiverApprovedBy || record.podWaivedBy, record.podWaiverReason]
              .filter(Boolean)
              .join(" | ")}
          </p>
        ) : null}
        <div className="flex flex-wrap gap-1.5">
          {canUpload ? (
            <button
              type="button"
              onClick={() => openPodUploadModal(record)}
              className={podButtonClass}
              title={status === POD_STATUS.REJECTED ? "Re-upload POD" : "Upload POD"}
            >
              {status === POD_STATUS.REJECTED ? (
                <RefreshCw className="h-3.5 w-3.5" />
              ) : (
                <UploadCloud className="h-3.5 w-3.5" />
              )}
              {status === POD_STATUS.REJECTED ? "Re-upload POD" : "Upload POD"}
            </button>
          ) : null}
          {status === POD_STATUS.PENDING && isPodReviewer ? (
            <button
              type="button"
              onClick={() => openPodActionModal(record, "waive")}
              className={podButtonClass}
              title="Waive POD"
            >
              <Ban className="h-3.5 w-3.5" />
              Waive
            </button>
          ) : null}
          {hasDocument &&
          [
            POD_STATUS.UPLOADED,
            POD_STATUS.UNDER_VERIFICATION,
            POD_STATUS.VERIFIED,
          ].includes(status) ? (
            <button
              type="button"
              onClick={() => openPodDetailsModal(record, "details")}
              className={podButtonClass}
              title="View POD"
            >
              <Eye className="h-3.5 w-3.5" />
              View POD
            </button>
          ) : null}
          {canReview ? (
            <>
              <button
                type="button"
                onClick={() => openPodActionModal(record, "verify")}
                className={podSuccessButtonClass}
                title="Verify POD"
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
                Verify
              </button>
              <button
                type="button"
                onClick={() => openPodActionModal(record, "reject")}
                className={podDangerButtonClass}
                title="Reject POD"
              >
                <XCircle className="h-3.5 w-3.5" />
                Reject
              </button>
              <button
                type="button"
                onClick={() => openPodActionModal(record, "dispute")}
                className={podButtonClass}
                title="Dispute POD"
              >
                <AlertTriangle className="h-3.5 w-3.5" />
                Dispute
              </button>
            </>
          ) : null}
          {status === POD_STATUS.REJECTED ? (
            <button
              type="button"
              onClick={() => openPodDetailsModal(record, "reason")}
              className={podDangerButtonClass}
              title="View rejection reason"
            >
              <FileCheck2 className="h-3.5 w-3.5" />
              View Reason
            </button>
          ) : null}
          {status === POD_STATUS.DISPUTED ? (
            <>
              <button
                type="button"
                onClick={() => openPodDetailsModal(record, "issue")}
                className={podButtonClass}
                title="View dispute issue"
              >
                <AlertTriangle className="h-3.5 w-3.5" />
                View Issue
              </button>
              {isPodReviewer ? (
                <button
                  type="button"
                  onClick={() => openPodActionModal(record, "resolve")}
                  className={podSuccessButtonClass}
                  title="Resolve POD dispute"
                >
                  <ShieldCheck className="h-3.5 w-3.5" />
                  Resolve
                </button>
              ) : null}
            </>
          ) : null}
          {status === POD_STATUS.WAIVED ? (
            <button
              type="button"
              onClick={() => openPodDetailsModal(record, "approval")}
              className={podButtonClass}
              title="View waiver approval"
            >
              <ShieldCheck className="h-3.5 w-3.5" />
              View Approval
            </button>
          ) : null}
          {[POD_STATUS.VERIFIED, POD_STATUS.WAIVED].includes(status) ? (
            <button
              type="button"
              onClick={() => openPodAuditModal(record)}
              className={podButtonClass}
              title="View POD audit log"
            >
              <History className="h-3.5 w-3.5" />
              Audit Log
            </button>
          ) : null}
        </div>
      </div>
    );
  };

  const selectedChallanReallocationMetrics = useMemo(
    () => getChallanReallocationMetrics(selectedChallan || {}, reallocations),
    [reallocations, selectedChallan]
  );
  const selectedChallanHistory = selectedChallanReallocationMetrics.history || [];
  const viewProject = viewChallanRecord
    ? projectMap[String(viewChallanRecord.projectId)] || {}
    : {};
  const viewFromLocation = viewChallanRecord
    ? locationMap[String(viewChallanRecord.fromLocationId)] || {}
    : {};
  const viewToLocation = viewChallanRecord
    ? locationMap[String(viewChallanRecord.toLocationId)] || {}
    : {};
  const viewTotalQty = viewChallanRecord?.items?.reduce(
    (sum, item) => sum + (Number(item.quantity) || 0),
    0
  );
  const selectedProject = selectedChallan
    ? projectMap[String(selectedChallan.projectId)] || {}
    : {};
  const selectedFromLocation = selectedChallan
    ? locationMap[String(selectedChallan.fromLocationId)] || {}
    : {};
  const selectedToLocation = selectedChallan
    ? locationMap[String(selectedChallan.toLocationId)] || {}
    : {};
  const totalQty = selectedChallan?.items?.reduce(
    (sum, item) => sum + (Number(item.quantity) || 0),
    0
  );
  const reallocationTargetLocations = useMemo(() => {
    if (!reallocationModal.record?.toLocationId) {
      return locations;
    }
    return locations.filter(
      (locationItem) =>
        String(locationItem.id) !== String(reallocationModal.record.toLocationId)
    );
  }, [locations, reallocationModal.record]);
  const selectedReallocationTargetLocation = reallocationTargetLocations.find(
    (locationItem) =>
      String(locationItem.id) === String(reallocationModal.targetLocationId)
  );
  const selectedReallocationTargetProject = selectedReallocationTargetLocation
    ? projectMap[String(selectedReallocationTargetLocation.projectId)] || {}
    : {};
  const printProject = printChallan
    ? projectMap[String(printChallan.projectId)] || {}
    : {};
  const printFromLocation = printChallan
    ? locationMap[String(printChallan.fromLocationId)] || {}
    : {};
  const printToLocation = printChallan
    ? locationMap[String(printChallan.toLocationId)] || {}
    : {};
  const printTotalQty = printChallan?.items?.reduce(
    (sum, item) => sum + (Number(item.quantity) || 0),
    0
  );

  return (
    <div className="p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between mb-6">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-slate-400">
            Projects
          </p>
          <h1 className="text-3xl font-semibold text-slate-800">
            Delivery Challan
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Create and track material dispatch to project locations.
          </p>
        </div>
        <button
          type="button"
          onClick={resetForm}
          className="px-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-700 bg-white"
        >
          Clear Form
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-white p-4 rounded-lg shadow-sm border border-slate-200">
          <p className="text-sm text-slate-500">Total Challans</p>
          <p className="text-2xl font-semibold text-slate-800">
            {records.length}
          </p>
        </div>
        <div className="bg-white p-4 rounded-lg shadow-sm border border-slate-200">
          <p className="text-sm text-slate-500">Issued Challans</p>
          <p className="text-2xl font-semibold text-slate-800">
            {records.filter((record) => record.status === "Issued").length}
          </p>
        </div>
        <div className="bg-white p-4 rounded-lg shadow-sm border border-slate-200">
          <p className="text-sm text-slate-500">Draft Challans</p>
          <p className="text-2xl font-semibold text-slate-800">
            {records.filter((record) => record.status === "Draft").length}
          </p>
        </div>
      </div>

      {updateProof && (
        <div className="mb-4 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {updateProof}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4 mb-6">
        <div className="bg-white p-5 rounded-lg shadow-sm border border-slate-200">
          <h2 className="text-lg font-semibold text-slate-800 mb-4">
            Challan Details
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="text-sm font-medium text-slate-700">
                DC Number *
              </label>
              <input
                type="text"
                value={form.dcNumber}
                readOnly
                placeholder="Auto-generated by system"
                className="w-full mt-1 border border-slate-200 rounded-lg bg-slate-100 px-3 py-2"
              />
              <p className="text-xs text-slate-500 mt-1">
                The system assigns a DC number automatically and it cannot be edited.
              </p>
              {errors.dcNumber && (
                <p className="text-xs text-red-600 mt-1">{errors.dcNumber}</p>
              )}
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700">
                Project *
              </label>
              <select
                value={form.projectId}
                onChange={(event) => {
                  handleProjectChange(event.target.value);
                }}
                className="w-full mt-1 border border-slate-200 rounded-lg px-3 py-2"
              >
                <option value="">Select project</option>
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </select>
              {errors.projectId && (
                <p className="text-xs text-red-600 mt-1">{errors.projectId}</p>
              )}
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700">
                From *
              </label>
              <select
                value={form.fromLocationId}
                onChange={(event) =>
                  {
                    const nextFromLocationId = event.target.value;
                    setForm((prev) => ({
                      ...prev,
                      fromLocationId: nextFromLocationId,
                      receiveGoodsId: "",
                    }));
                    setSelectedReceiptIds([]);
                    setLoadedReceiptIds([]);
                    setItems([]);
                    setReceiptError("");
                  }
                }
                className="w-full mt-1 border border-slate-200 rounded-lg px-3 py-2"
              >
                <option value="">Select source</option>
                {locations.map((location) => (
                  <option key={location.id} value={location.id}>
                    {location.name}
                  </option>
                ))}
              </select>
              {errors.fromLocationId && (
                <p className="text-xs text-red-600 mt-1">{errors.fromLocationId}</p>
              )}
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700">
                To *
              </label>
              <select
                value={form.toLocationId}
                onChange={(event) => {
                  handleToLocationChange(event.target.value);
                }}
                className="w-full mt-1 border border-slate-200 rounded-lg px-3 py-2"
              >
                <option value="">
                  {destinationLocations.length
                    ? "Select destination"
                    : "No destinations available"}
                </option>
                {destinationLocations.map((location) => (
                  <option key={location.id} value={location.id}>
                    {location.name}
                    {location.projectId &&
                    String(location.projectId) === String(form.projectId)
                      ? " | Project site"
                      : ""}
                  </option>
                ))}
              </select>
              {form.toLocation ? (
                <p className="mt-1 text-xs text-slate-500">
                  To site: {form.toLocation}
                </p>
              ) : null}
              {errors.toLocationId && (
                <p className="text-xs text-red-600 mt-1">{errors.toLocationId}</p>
              )}
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700">
                Vehicle Number
              </label>
              <input
                type="text"
                value={form.vehicleNumber}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    vehicleNumber: event.target.value,
                  }))
                }
                placeholder="MH-12-AB-1234"
                className="w-full mt-1 border border-slate-200 rounded-lg px-3 py-2"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700">
                E-Way Bill Number (EBN)
              </label>
              <input
                type="text"
                value={form.eWayBillNumber}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    eWayBillNumber: event.target.value,
                  }))
                }
                placeholder="Enter EBN (optional)"
                className="w-full mt-1 border border-slate-200 rounded-lg px-3 py-2"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700">
                Issue Date
              </label>
              <DateInput
                value={form.issueDate}
                onChange={(value) =>
                  setForm((prev) => ({ ...prev, issueDate: value }))
                }
                className="w-full mt-1 border border-slate-200 rounded-lg px-3 py-2"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700">
                Status
              </label>
              <select
                value={form.status}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, status: event.target.value }))
                }
                className="w-full mt-1 border border-slate-200 rounded-lg px-3 py-2"
              >
                <option value="Draft">Draft</option>
                <option value="Issued">Issued</option>
                <option value="Delivered">Delivered</option>
                <option value="Closed">Closed</option>
              </select>
            </div>
            <div className="md:col-span-3">
              <label className="text-sm font-medium text-slate-700">
                Notes
              </label>
              <textarea
                value={form.notes}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, notes: event.target.value }))
                }
                placeholder="Transport details, remarks, or approvals."
                className="w-full mt-1 border border-slate-200 rounded-lg px-3 py-2 min-h-[90px]"
              />
            </div>
          </div>
        </div>

        <div className="bg-white p-5 rounded-lg shadow-sm border border-slate-200">
          <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-indigo-800">
                Select Receive Receipts (All under selected Project)
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                All receive receipts from purchase orders under the selected project are listed below.
              </p>
              <div className="mt-4 rounded-lg bg-slate-50 p-3">
                <p className="text-xs font-semibold text-slate-700">Stock Source</p>
                <div className="mt-2 flex flex-wrap gap-4 text-sm text-slate-700">
                  <label className="inline-flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={stockSources.receipts}
                      onChange={() => handleStockSourceToggle("receipts")}
                      className="h-4 w-4 rounded border-slate-300 text-indigo-700 focus:ring-indigo-500"
                    />
                    Receive Receipt Stock
                  </label>
                  <label className="inline-flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={stockSources.consumptionLeftover}
                      onChange={() => handleStockSourceToggle("consumptionLeftover")}
                      className="h-4 w-4 rounded border-slate-300 text-indigo-700 focus:ring-indigo-500"
                    />
                    Consumption Leftover Stock
                  </label>
                </div>
                <p className="mt-2 text-xs text-slate-500">
                  Receipt Stock is fresh received inventory. Consumption Leftover is balance quantity from already consumed DC.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                void loadReceipts(form.projectId || null);
              }}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:border-indigo-300"
            >
              Refresh
            </button>
          </div>

          {stockSources.receipts ? (
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_260px]">
              <div className="overflow-hidden rounded-lg border border-slate-200">
                <div className="flex flex-col gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm font-semibold text-indigo-900">
                      Receive Receipt Stock
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      Select one or more receive receipts, then load their available quantities into the DC line items.
                    </p>
                  </div>
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <input
                      type="search"
                      value={receiptFilters.search}
                      onChange={(event) => handleReceiptFilterChange(event.target.value)}
                      placeholder="Search receipts or PO..."
                      className="w-full min-w-[260px] rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                    />
                    <button
                      type="button"
                      onClick={() => loadReceipts(form.projectId || null)}
                      className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:border-indigo-300"
                    >
                      Refresh
                    </button>
                  </div>
                </div>
                <div className="max-h-[330px] overflow-auto">
                  <table className="min-w-[980px] w-full text-sm">
                    <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                      <tr>
                        <th className="w-12 px-3 py-3 text-left">
                          <input
                            type="checkbox"
                            checked={allFilteredReceiptsSelected}
                            onChange={toggleAllFilteredReceipts}
                            disabled={!filteredReceiptsForSelection.length}
                            className="h-4 w-4 rounded border-slate-300 text-indigo-700 focus:ring-indigo-500"
                          />
                        </th>
                        <th className="px-3 py-3 text-left">Receive Receipt Reference</th>
                        <th className="px-3 py-3 text-left">Purchase Order Number</th>
                        <th className="px-3 py-3 text-left">Received Date</th>
                        <th className="px-3 py-3 text-right">Item Count</th>
                        <th className="px-3 py-3 text-right">Total Quantity</th>
                      </tr>
                    </thead>
                    <tbody>
                      {receiptsLoading ? (
                        <tr>
                          <td colSpan={6} className="px-4 py-10 text-center text-slate-500">
                            Loading receipts for the selected project...
                          </td>
                        </tr>
                      ) : !form.projectId ? (
                        <tr>
                          <td colSpan={6} className="px-4 py-10 text-center text-slate-500">
                            Select a project to load receive receipts.
                          </td>
                        </tr>
                      ) : filteredReceiptsForSelection.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="px-4 py-10 text-center text-slate-500">
                            No receive receipts found for this project.
                          </td>
                        </tr>
                      ) : (
                        filteredReceiptsForSelection.map((receipt) => {
                          const isSelected = selectedReceiptIds.includes(String(receipt.id));
                          return (
                            <tr key={receipt.id} className="border-t border-slate-200 bg-white hover:bg-indigo-50/30">
                              <td className="px-3 py-3">
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  onChange={() => toggleReceiptSelection(receipt.id)}
                                  className="h-4 w-4 rounded border-slate-300 text-indigo-700 focus:ring-indigo-500"
                                />
                              </td>
                              <td className="px-3 py-3 font-semibold text-slate-800">
                                {getReceiptReference(receipt)}
                              </td>
                              <td className="px-3 py-3 text-slate-700">
                                {getReceiptPurchaseOrderNumber(receipt)}
                              </td>
                              <td className="px-3 py-3 text-slate-700">
                                {formatDate(receipt.receivedDate || receipt.invoiceDate || receipt.createdAt)}
                              </td>
                              <td className="px-3 py-3 text-right text-slate-700">
                                {getReceiptItemCount(receipt)}
                              </td>
                              <td className="px-3 py-3 text-right font-semibold text-slate-800">
                                {fmtQty(getReceiptTotalQuantity(receipt))}
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
                <div className="flex flex-col gap-3 border-t border-slate-200 bg-slate-50 px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-slate-500">
                    Showing {filteredReceiptsForSelection.length} of {receiptsForSelection.length} receipts
                  </p>
                  <div className="flex items-center gap-4">
                    <span className="font-medium text-indigo-800">
                      {selectedReceiptIds.length} selected
                    </span>
                    <button
                      type="button"
                      onClick={() => setSelectedReceiptIds([])}
                      disabled={!selectedReceiptIds.length}
                      className="text-sm font-semibold text-indigo-700 disabled:cursor-not-allowed disabled:text-slate-400"
                    >
                      Clear Selection
                    </button>
                  </div>
                </div>
              </div>

              <aside className="rounded-lg border border-indigo-100 bg-indigo-50 p-4">
                <p className="text-sm font-semibold text-indigo-900">Selection Summary</p>
                <div className="mt-4 space-y-3 text-sm">
                  <div className="flex justify-between">
                    <span className="text-slate-600">Total Receipts Selected</span>
                    <span className="font-semibold text-slate-900">{selectedReceiptsSummary.receipts}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600">Total Items</span>
                    <span className="font-semibold text-slate-900">{selectedReceiptsSummary.items}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600">Total Quantity</span>
                    <span className="font-semibold text-slate-900">{fmtQty(selectedReceiptsSummary.quantity)}</span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleLoadSelectedReceipts}
                  disabled={!selectedReceiptIds.length}
                  className="mt-5 w-full rounded-lg bg-indigo-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-800 disabled:cursor-not-allowed disabled:bg-slate-300"
                >
                  Load Selected Receipts
                </button>
                {stockSources.consumptionLeftover ? (
                  <>
                    <button
                      type="button"
                      onClick={() => void handleLoadConsumptionLeftover()}
                      disabled={!form.projectId || !form.fromLocationId || leftoverLoading}
                      className="mt-3 w-full rounded-lg border border-indigo-200 bg-white px-4 py-2.5 text-sm font-semibold text-indigo-700 hover:border-indigo-300 disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-400"
                    >
                      {leftoverLoading ? "Loading Leftover..." : "Load Consumption Leftover"}
                    </button>
                    <p className="mt-2 text-xs text-slate-500">
                      Loads leftover quantity from previous DC consumption for the selected project and source location.
                    </p>
                  </>
                ) : null}
              </aside>
            </div>
          ) : null}
          {!stockSources.receipts && stockSources.consumptionLeftover ? (
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
              <button
                type="button"
                onClick={() => void handleLoadConsumptionLeftover()}
                disabled={!form.projectId || !form.fromLocationId || leftoverLoading}
                className="rounded-lg border border-indigo-200 bg-white px-4 py-2.5 text-sm font-semibold text-indigo-700 hover:border-indigo-300 disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-400"
              >
                {leftoverLoading ? "Loading Leftover..." : "Load Consumption Leftover"}
              </button>
              <p className="mt-2 text-xs text-slate-500">
                Loads leftover quantity from previous DC consumption for the selected project and source location.
              </p>
            </div>
          ) : null}
        </div>

        <div className="bg-white p-5 rounded-lg shadow-sm border border-slate-200">
            <div className="mb-3 flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
              <h2 className="text-lg font-semibold text-indigo-800">Line Items</h2>
              <div className="flex flex-wrap gap-4 text-sm">
                <span className="font-semibold text-indigo-700">
                  {loadedReceiptsSummary.receipts} Receipts Selected
                </span>
                <span className="text-slate-600">
                  Total Items: <strong className="text-slate-900">{items.length}</strong>
                </span>
                <span className="text-slate-600">
                  Total Available Qty:{" "}
                  <strong className="text-slate-900">
                    {fmtQty(items.reduce((sum, item) => sum + toQuantity(item.availableQty), 0))}
                  </strong>
                </span>
                <span className="text-slate-600">
                  Total DC Qty Selected:{" "}
                  <strong className="text-slate-900">
                    {fmtQty(items.reduce((sum, item) => sum + toQuantity(item.quantity), 0))}
                  </strong>
                </span>
              </div>
            </div>
            <div className="overflow-hidden rounded-lg border border-slate-200">
              <div className="overflow-x-auto">
                <table className="min-w-[1360px] w-full text-sm">
                  <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-3 py-3 text-left w-12">#</th>
                      <th className="px-3 py-3 text-left min-w-[130px]">Source Type</th>
                      <th className="px-3 py-3 text-left min-w-[150px]">Source Ref</th>
                      <th className="px-3 py-3 text-left min-w-[210px]">Item Name</th>
                      <th className="px-3 py-3 text-left min-w-[110px]">HSN / SAC</th>
                      <th className="px-3 py-3 text-left min-w-[90px]">Unit</th>
                      <th className="px-3 py-3 text-right min-w-[140px]">Original Qty</th>
                      <th className="px-3 py-3 text-right min-w-[150px]">Used / Consumed Qty</th>
                      <th className="px-3 py-3 text-right min-w-[130px]">Available Quantity</th>
                      <th className="px-3 py-3 text-right min-w-[140px]">DC Quantity</th>
                      <th className="px-3 py-3 text-right w-16">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {!items.length ? (
                      <tr>
                        <td colSpan={11} className="px-4 py-10 text-center text-slate-500">
                          Load receipt stock or consumption leftover stock to populate delivery challan line items.
                        </td>
                      </tr>
                    ) : (
                      items.map((item, index) => {
                        const quantity = toQuantity(item.quantity);
                        const availableQty = toQuantity(item.availableQty);
                        const hasError = quantity > availableQty;
                        return (
                          <tr key={item.id} className="border-t border-slate-200 bg-white">
                            <td className="px-3 py-3 text-slate-600">{index + 1}</td>
                            <td className="px-3 py-3 text-slate-700">
                              {getInventorySourceLabel(item.sourceType)}
                            </td>
                            <td className="px-3 py-3 text-slate-700">
                              {item.sourceRef || item.sourceKey || "-"}
                            </td>
                            <td className="px-3 py-3 font-medium text-slate-800">{item.name || "-"}</td>
                            <td className="px-3 py-3 text-slate-700">{item.hsn || "-"}</td>
                            <td className="px-3 py-3 text-slate-700">{item.unit || "PCS"}</td>
                            <td className="px-3 py-3 text-right text-slate-800">{fmtQty(item.receivedQty)}</td>
                            <td className="px-3 py-3 text-right text-slate-700">{fmtQty(item.previouslyUsedQty)}</td>
                            <td className="px-3 py-3 text-right font-semibold text-emerald-600">{fmtQty(item.availableQty)}</td>
                            <td className="px-3 py-3">
                              <input
                                type="number"
                                min="0"
                                max={availableQty}
                                step="0.01"
                                value={item.quantity}
                                onChange={(event) =>
                                  handleLineItemQuantityChange(item.id, event.target.value)
                                }
                                className={`ml-auto block w-32 rounded-lg border px-3 py-2 text-right text-sm outline-none transition focus:ring-2 ${
                                  hasError
                                    ? "border-red-300 focus:border-red-500 focus:ring-red-100"
                                    : "border-slate-200 focus:border-indigo-500 focus:ring-indigo-100"
                                }`}
                              />
                            </td>
                            <td className="px-3 py-3 text-right">
                              <button
                                type="button"
                                onClick={() => handleRemoveLineItem(item.id)}
                                className="rounded-md border border-slate-200 px-2 py-1 text-xs font-medium text-slate-600 hover:border-red-200 hover:text-red-600"
                              >
                                Delete
                              </button>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        {receiptError && <p className="text-xs text-red-600">{receiptError}</p>}
        {errors.items && <p className="text-xs text-red-600">{errors.items}</p>}

        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={resetForm}
            className="px-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-700 bg-white"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isSubmitting}
            className="px-5 py-2 rounded-lg text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting
              ? editingId
                ? "Updating..."
                : "Saving..."
              : editingId
              ? "Update Challan"
              : "Save Challan"}
          </button>
        </div>
      </form>

      <div
        id="delivery-challan-register"
        className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-x-auto"
      >
        <div className="px-4 py-3 border-b flex items-center justify-between gap-3">
          <h3 className="text-lg font-semibold text-slate-800">
            Delivery Challan Register
          </h3>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={dcStatusFilter}
              onChange={(event) => setDcStatusFilter(event.target.value)}
              className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-700"
            >
              <option value="all">All Status</option>
              <option value="received">Received</option>
              <option value="pending">Pending</option>
              <option value="partially received">Partially Received</option>
            </select>
            <select
              value={dcTypeFilter}
              onChange={(event) => setDcTypeFilter(event.target.value)}
              className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-700"
            >
              <option value="all">All DC Types</option>
              <option value="original">Original DC</option>
              <option value="reallocated">Reallocated DC</option>
              <option value="partially_reallocated">Partially Reallocated DC</option>
            </select>
            <select
              value={reallocationStatusFilter}
              onChange={(event) => setReallocationStatusFilter(event.target.value)}
              className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-700"
            >
              <option value="all">All Reallocation Status</option>
              <option value="not_reallocated">Not Reallocated</option>
              <option value="partially_reallocated">Partially Reallocated</option>
              <option value="fully_reallocated">Fully Reallocated</option>
            </select>
            <button
              type="button"
              onClick={() =>
                printSection({
                  selector: "#delivery-challan-register",
                  title: "Delivery Challan Register",
                  subtitle: "Dispatch trail for the project",
                  metaRows: challanMetaRows,
                  logoUrl: companyLogo,
                  brandName: companyName,
                  brandDescription: company.address,
                })
              }
              className="px-3 py-1.5 border border-slate-200 rounded-md text-xs text-slate-600 bg-white"
            >
              Print register
            </button>
          </div>
        </div>
        <table className="min-w-[1920px] text-sm">
          <thead className="bg-slate-100 text-slate-600">
            <tr>
              <th className="p-3 text-left min-w-[150px]">DC No</th>
              <th className="p-3 text-left min-w-[220px]">Receipt Ref</th>
              <th className="p-3 text-left min-w-[180px]">Project</th>
              <th className="p-3 text-left min-w-[180px]">From</th>
              <th className="p-3 text-left min-w-[180px]">To</th>
              <th className="p-3 text-left min-w-[180px]">DC Type</th>
              <th className="p-3 text-left min-w-[120px]">Status</th>
              <th className="p-3 text-left min-w-[180px]">Reallocation Status</th>
              <th className="p-3 text-left min-w-[120px]">Items</th>
              <th className="p-3 text-right min-w-[140px]">Reallocated Qty</th>
              <th className="p-3 text-right min-w-[140px]">Remaining Balance</th>
              <th className="p-3 text-left min-w-[220px]">History</th>
              <th className="p-3 text-left min-w-[260px]">POD</th>
              <th className="p-3 text-left min-w-[260px]">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredRecords.length === 0 && (
              <tr>
                <td colSpan="14" className="p-6 text-center text-slate-500">
                  {records.length === 0
                    ? "No delivery challans created yet."
                    : "No delivery challans match the selected filters."}
                </td>
              </tr>
            )}
            {filteredRecords.map((record) => {
              const reallocationMetrics = getChallanReallocationMetrics(
                record,
                reallocations
              );
              const latestHistory = reallocationMetrics.history[0] || null;
              const latestLocation = latestHistory
                ? locationMap[String(latestHistory.toLocationId)] || {}
                : {};
              return (
                <tr key={record.id} className="border-t hover:bg-slate-50">
                  <td className="p-3 font-medium text-slate-800">
                    {record.dcNumber || "-"}
                  </td>
                  <td className="p-3 text-slate-700">
                    {formatReceiptReference(
                      Array.isArray(record.receiveGoodsIds) && record.receiveGoodsIds.length
                        ? record.receiveGoodsIds
                        : record.receiveGoodsId
                    )}
                  </td>
                  <td className="p-3">
                    {projectMap[String(record.projectId)]?.name || "-"}
                  </td>
                  <td className="p-3">
                    {locationMap[String(record.fromLocationId)]?.name || "-"}
                  </td>
                  <td className="p-3">
                    {locationMap[String(record.toLocationId)]?.name ||
                      record.toLocation ||
                      "-"}
                  </td>
                  <td className="p-3">
                    <span className="inline-flex rounded-full border border-slate-200 bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
                      {reallocationMetrics.dcTypeLabel}
                    </span>
                  </td>
                  <td className="p-3">{getDeliveryChallanRegisterStatus(record)}</td>
                  <td className="p-3">
                    <span
                      className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${getReallocationStatusTone(
                        reallocationMetrics.reallocationStatusKey
                      )}`}
                    >
                      {reallocationMetrics.reallocationStatusLabel}
                    </span>
                  </td>
                  <td className="p-3">{record.items?.length || 0}</td>
                  <td className="p-3 text-right font-medium text-slate-800">
                    {fmtQty(reallocationMetrics.totalReallocatedQty)}
                  </td>
                  <td className="p-3 text-right font-medium text-slate-800">
                    {fmtQty(reallocationMetrics.remainingBalanceQty)}
                  </td>
                  <td className="p-3 text-xs text-slate-600">
                    {reallocationMetrics.historyCount > 0 ? (
                      <div className="space-y-1">
                        <p className="font-medium text-slate-700">
                          {reallocationMetrics.historyCount} movement
                          {reallocationMetrics.historyCount > 1 ? "s" : ""}
                        </p>
                        <p>
                          Latest:{" "}
                          {latestLocation.name || latestHistory?.referenceNumber || "-"}
                        </p>
                        <p>{formatDate(latestHistory?.requestDate || latestHistory?.transferDate)}</p>
                      </div>
                    ) : (
                      "-"
                    )}
                  </td>
                  <td className="p-3">{renderPodWorkflowCell(record)}</td>
                  <td className="p-3">
                    <div className="flex flex-wrap gap-3">
                      <button
                        type="button"
                        onClick={() => handleViewChallan(record)}
                        className="text-slate-700 text-sm underline"
                      >
                        View
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleOpenReallocation(record)}
                        className="text-emerald-700 text-sm"
                      >
                        Reallocate
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          handleOpenChallanDetail(record, CHALLAN_DETAIL_TABS.HISTORY)
                        }
                        className="text-amber-700 text-sm"
                      >
                        History
                      </button>
                      <button
                        type="button"
                        onClick={() => handleEdit(record)}
                        disabled={
                          normalizePodStatus(record.podStatus) === POD_STATUS.VERIFIED &&
                          !isPodReviewer
                        }
                        className="text-indigo-600 text-sm disabled:cursor-not-allowed disabled:text-slate-400"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => handlePrint(record)}
                        className="text-slate-600 text-sm"
                      >
                        Print
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(record.id)}
                        className="text-red-600 text-sm"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {viewChallanRecord ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/40 px-4 py-6">
          <div className="max-h-[92vh] w-full max-w-6xl overflow-y-auto">
            <DocumentViewPanel
              id="delivery-challan-view-panel"
              title="DELIVERY CHALLAN"
              onClose={() => setViewChallanRecord(null)}
              companyName={companyName}
              companyAddress={company.address || "Company address"}
              companyGstin={company.gstin}
              companyPhone={company.phone}
              companyEmail={company.email}
              logoUrl={companyLogo}
              primaryPairs={[
                {
                  label: "RE No",
                  value: viewChallanRecord.id
                    ? `RE-${String(viewChallanRecord.id).padStart(5, "0")}`
                    : "-",
                },
                { label: "Our Ref", value: viewChallanRecord.dcNumber || "-" },
                {
                  label: "Receipt Ref",
                  value: formatReceiptReference(
                    Array.isArray(viewChallanRecord.receiveGoodsIds) &&
                      viewChallanRecord.receiveGoodsIds.length
                      ? viewChallanRecord.receiveGoodsIds
                      : viewChallanRecord.receiveGoodsId
                  ),
                },
                { label: "Date", value: formatDate(viewChallanRecord.issueDate) },
                {
                  label: "E-Way Bill No",
                  value: viewChallanRecord.eWayBillNumber || "-",
                },
                {
                  label: "POD",
                  value:
                    [
                      getPodStatusLabel(viewChallanRecord.podStatus),
                      viewChallanRecord.podReference,
                      formatDateTime(getPodTimestamp(viewChallanRecord)),
                    ]
                      .filter((value) => value && value !== "-")
                      .join(" | ") || "-",
                },
                { label: "Project", value: viewProject.name || "-" },
                { label: "Client", value: viewProject.client || "-" },
              ]}
              leftBlockTitle="From"
              leftBlockLines={[
                viewFromLocation.name || "-",
                viewFromLocation.address || "-",
                `Contact: ${viewFromLocation.manager || "-"}${
                  viewFromLocation.phone ? ` (${viewFromLocation.phone})` : ""
                }`,
              ]}
              rightBlockTitle="To"
              rightBlockLines={[
                viewToLocation.name || viewProject.name || "-",
                viewToLocation.address || viewChallanRecord.toLocation || "-",
                `Status: ${getDeliveryChallanRegisterStatus(viewChallanRecord)}`,
              ]}
              tableColumns={[
                { key: "serial", label: "Sl No", widthClass: "w-16" },
                { key: "description", label: "Description" },
                { key: "hsn", label: "HSN", widthClass: "w-20" },
                { key: "gst", label: "GST", widthClass: "w-20" },
                { key: "quantity", label: "Qty", align: "right", widthClass: "w-20" },
                { key: "unit", label: "Unit", widthClass: "w-20" },
              ]}
              tableRows={(viewChallanRecord.items || []).map((item, index) => ({
                id: item.id || index,
                serial: index + 1,
                description: [item.name || "-", item.description, item.notes]
                  .filter(Boolean)
                  .join(" | "),
                hsn: item.hsn || "-",
                gst: item.gst || "-",
                quantity: item.quantity || "-",
                unit: item.unit || "-",
              }))}
              bottomLeftContent={
                <div className="space-y-3 text-left">
                  <div>
                    <p className="font-semibold">Vehicle No</p>
                    <p>{viewChallanRecord.vehicleNumber || "-"}</p>
                  </div>
                  <div>
                    <p className="font-semibold">Notes</p>
                    <p className="whitespace-pre-wrap text-slate-700">
                      {viewChallanRecord.notes || "-"}
                    </p>
                  </div>
                </div>
              }
              bottomRightContent={
                <div className="space-y-3 text-right">
                  <div>
                    <p className="font-semibold">Total Qty</p>
                    <p>{Number.isFinite(viewTotalQty) ? viewTotalQty : "-"}</p>
                  </div>
                  <div>
                    <p className="font-semibold">Reallocation Status</p>
                    <p>
                      {getChallanReallocationMetrics(
                        viewChallanRecord,
                        reallocations
                      ).reallocationStatusLabel}
                    </p>
                  </div>
                </div>
              }
              footerCompanyName={companyName}
            />
          </div>
        </div>
      ) : null}

      {selectedChallan ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/40 px-4 py-6">
          <div className="max-h-[90vh] w-full max-w-6xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
            <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 px-6 py-4">
              <div>
                <p className="text-xs uppercase tracking-[0.25em] text-slate-400">
                  Delivery Challan
                </p>
                <h3 className="text-xl font-semibold text-slate-800">
                  {selectedChallan.dcNumber || "DC Details"}
                </h3>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <span className="inline-flex rounded-full border border-slate-200 bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
                    {selectedChallanReallocationMetrics.dcTypeLabel}
                  </span>
                  <span
                    className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${getReallocationStatusTone(
                      selectedChallanReallocationMetrics.reallocationStatusKey
                    )}`}
                  >
                    {selectedChallanReallocationMetrics.reallocationStatusLabel}
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={closeChallanDetail}
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700"
              >
                Close
              </button>
            </div>

            <div className="border-b border-slate-200 px-6 py-3">
              <div className="flex flex-wrap gap-2">
                {[
                  {
                    key: CHALLAN_DETAIL_TABS.DETAILS,
                    label: "DC Details",
                  },
                  {
                    key: CHALLAN_DETAIL_TABS.ITEMS,
                    label: "Items",
                  },
                  {
                    key: CHALLAN_DETAIL_TABS.HISTORY,
                    label: "Reallocation History",
                  },
                ].map((tab) => (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => setChallanDetailTab(tab.key)}
                    className={`rounded-full px-3 py-1.5 text-sm font-medium ${
                      challanDetailTab === tab.key
                        ? "bg-slate-800 text-white"
                        : "bg-slate-100 text-slate-700"
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="max-h-[calc(90vh-148px)] overflow-y-auto px-6 py-5">
              {challanDetailTab === CHALLAN_DETAIL_TABS.DETAILS ? (
                <div className="space-y-5">
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                      <p className="text-xs uppercase tracking-[0.18em] text-slate-400">
                        Project
                      </p>
                      <p className="mt-2 text-sm font-semibold text-slate-800">
                        {selectedProject.name || "-"}
                      </p>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                      <p className="text-xs uppercase tracking-[0.18em] text-slate-400">
                        Current DC Location
                      </p>
                      <p className="mt-2 text-sm font-semibold text-slate-800">
                        {selectedToLocation.name || selectedChallan.toLocation || "-"}
                      </p>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                      <p className="text-xs uppercase tracking-[0.18em] text-slate-400">
                        Reallocated Qty
                      </p>
                      <p className="mt-2 text-sm font-semibold text-slate-800">
                        {fmtQty(selectedChallanReallocationMetrics.totalReallocatedQty)}
                      </p>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                      <p className="text-xs uppercase tracking-[0.18em] text-slate-400">
                        Remaining Balance
                      </p>
                      <p className="mt-2 text-sm font-semibold text-slate-800">
                        {fmtQty(selectedChallanReallocationMetrics.remainingBalanceQty)}
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <div className="rounded-xl border border-slate-200 p-4">
                      <h4 className="text-sm font-semibold text-slate-800">
                        Dispatch Details
                      </h4>
                      <dl className="mt-3 space-y-2 text-sm text-slate-600">
                        <div className="flex justify-between gap-4">
                          <dt>Receipt Ref</dt>
                          <dd className="text-right text-slate-800">
                            {formatReceiptReference(
                              Array.isArray(selectedChallan.receiveGoodsIds) &&
                                selectedChallan.receiveGoodsIds.length
                                ? selectedChallan.receiveGoodsIds
                                : selectedChallan.receiveGoodsId
                            )}
                          </dd>
                        </div>
                        <div className="flex justify-between gap-4">
                          <dt>Issue Date</dt>
                          <dd className="text-right text-slate-800">
                            {formatDate(selectedChallan.issueDate)}
                          </dd>
                        </div>
                        <div className="flex justify-between gap-4">
                          <dt>Status</dt>
                          <dd className="text-right text-slate-800">
                            {getDeliveryChallanRegisterStatus(selectedChallan)}
                          </dd>
                        </div>
                        <div className="flex justify-between gap-4">
                          <dt>Vehicle No</dt>
                          <dd className="text-right text-slate-800">
                            {selectedChallan.vehicleNumber || "-"}
                          </dd>
                        </div>
                        <div className="flex justify-between gap-4">
                          <dt>E-Way Bill</dt>
                          <dd className="text-right text-slate-800">
                            {selectedChallan.eWayBillNumber || "-"}
                          </dd>
                        </div>
                      </dl>
                    </div>

                    <div className="rounded-xl border border-slate-200 p-4">
                      <h4 className="text-sm font-semibold text-slate-800">
                        Route Details
                      </h4>
                      <dl className="mt-3 space-y-2 text-sm text-slate-600">
                        <div className="flex justify-between gap-4">
                          <dt>From</dt>
                          <dd className="text-right text-slate-800">
                            {selectedFromLocation.name || "-"}
                          </dd>
                        </div>
                        <div className="flex justify-between gap-4">
                          <dt>To</dt>
                          <dd className="text-right text-slate-800">
                            {selectedToLocation.name || selectedProject.name || "-"}
                          </dd>
                        </div>
                        <div className="flex justify-between gap-4">
                          <dt>Total Qty</dt>
                          <dd className="text-right text-slate-800">
                            {fmtQty(totalQty)}
                          </dd>
                        </div>
                        <div className="flex justify-between gap-4">
                          <dt>Reallocation Movements</dt>
                          <dd className="text-right text-slate-800">
                            {selectedChallanReallocationMetrics.historyCount}
                          </dd>
                        </div>
                        <div className="flex justify-between gap-4">
                          <dt>POD Status</dt>
                          <dd className="text-right text-slate-800">
                            {getPodStatusLabel(selectedChallan.podStatus)}
                          </dd>
                        </div>
                      </dl>
                    </div>
                  </div>

                  {selectedChallan.notes ? (
                    <div className="rounded-xl border border-slate-200 p-4">
                      <h4 className="text-sm font-semibold text-slate-800">Notes</h4>
                      <p className="mt-2 text-sm text-slate-600">
                        {selectedChallan.notes}
                      </p>
                    </div>
                  ) : null}
                </div>
              ) : null}

              {challanDetailTab === CHALLAN_DETAIL_TABS.ITEMS ? (
                <div className="overflow-x-auto rounded-xl border border-slate-200">
                  <table className="min-w-full text-sm">
                    <thead className="bg-slate-50 text-slate-600">
                      <tr>
                        <th className="p-3 text-left">Item</th>
                        <th className="p-3 text-left">Unit</th>
                        <th className="p-3 text-right">Issued Qty</th>
                        <th className="p-3 text-right">Consumed Qty</th>
                        <th className="p-3 text-right">Reallocated Qty</th>
                        <th className="p-3 text-right">Remaining Qty</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(selectedChallan.items || []).map((item, index) => {
                        const itemReallocatedQty = getChallanItemReallocatedQty(
                          item,
                          selectedChallanHistory
                        );
                        const itemRemainingQty = Math.max(
                          toQuantity(item.balanceQty) - itemReallocatedQty,
                          0
                        );
                        return (
                          <tr key={item.id || index} className="border-t border-slate-200">
                            <td className="p-3">
                              <p className="font-medium text-slate-800">
                                {item.name || "-"}
                              </p>
                              {item.description ? (
                                <p className="text-xs text-slate-500">
                                  {item.description}
                                </p>
                              ) : null}
                            </td>
                            <td className="p-3 text-slate-700">{item.unit || "PCS"}</td>
                            <td className="p-3 text-right text-slate-800">
                              {fmtQty(item.quantity)}
                            </td>
                            <td className="p-3 text-right text-slate-800">
                              {fmtQty(item.consumedQty)}
                            </td>
                            <td className="p-3 text-right text-slate-800">
                              {fmtQty(itemReallocatedQty)}
                            </td>
                            <td className="p-3 text-right font-medium text-slate-800">
                              {fmtQty(itemRemainingQty)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : null}

              {challanDetailTab === CHALLAN_DETAIL_TABS.HISTORY ? (
                <div className="space-y-4">
                  <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                    <span>
                      Reallocation movements:{" "}
                      <strong className="text-slate-800">
                        {selectedChallanReallocationMetrics.historyCount}
                      </strong>
                    </span>
                    <span>
                      Remaining balance:{" "}
                      <strong className="text-slate-800">
                        {fmtQty(selectedChallanReallocationMetrics.remainingBalanceQty)}
                      </strong>
                    </span>
                  </div>

                  {selectedChallanHistory.length ? (
                    <div className="overflow-x-auto rounded-xl border border-slate-200">
                      <table className="min-w-full text-sm">
                        <thead className="bg-slate-50 text-slate-600">
                          <tr>
                            <th className="p-3 text-left">Reference</th>
                            <th className="p-3 text-left">Date</th>
                            <th className="p-3 text-left">To Location</th>
                            <th className="p-3 text-left">Project</th>
                            <th className="p-3 text-left">Status</th>
                            <th className="p-3 text-right">Qty</th>
                            <th className="p-3 text-left">Items</th>
                          </tr>
                        </thead>
                        <tbody>
                          {selectedChallanHistory.map((transfer) => (
                            <tr
                              key={transfer.id || transfer.referenceNumber}
                              className="border-t border-slate-200"
                            >
                              <td className="p-3 font-medium text-slate-800">
                                {transfer.referenceNumber || "-"}
                              </td>
                              <td className="p-3 text-slate-700">
                                {formatDate(transfer.requestDate || transfer.transferDate)}
                              </td>
                              <td className="p-3 text-slate-700">
                                {locationMap[String(transfer.toLocationId)]?.name || "-"}
                              </td>
                              <td className="p-3 text-slate-700">
                                {projectMap[String(transfer.projectId)]?.name || "-"}
                              </td>
                              <td className="p-3 text-slate-700">
                                {transfer.status || "-"}
                              </td>
                              <td className="p-3 text-right font-medium text-slate-800">
                                {fmtQty(
                                  (transfer.linkedItems || []).reduce(
                                    (sum, item) => sum + (Number(item.quantity) || 0),
                                    0
                                  )
                                )}
                              </td>
                              <td className="p-3 text-xs text-slate-600">
                                {(transfer.linkedItems || []).map((item) => (
                                  <p key={item.id || item.sourceKey || item.name}>
                                    {item.name || "-"}: {fmtQty(item.quantity)} {item.unit || "PCS"}
                                  </p>
                                ))}
                                {transfer.notes ? (
                                  <p className="mt-1 text-slate-500">{transfer.notes}</p>
                                ) : null}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="rounded-xl border border-dashed border-slate-300 px-6 py-10 text-center text-sm text-slate-500">
                      No reallocation history exists for this delivery challan yet.
                    </div>
                  )}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {reallocationModal.open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 px-4 py-6">
          <form
            onSubmit={handleReallocationSubmit}
            className="max-h-[92vh] w-full max-w-5xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
          >
            <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 px-6 py-4">
              <div>
                <p className="text-xs uppercase tracking-[0.25em] text-slate-400">
                  Reallocate Delivery Challan
                </p>
                <h3 className="text-xl font-semibold text-slate-800">
                  {reallocationModal.record?.dcNumber || "DC Reallocation"}
                </h3>
                <p className="mt-1 text-sm text-slate-500">
                  Move full or partial DC balance to another site without creating a new DC.
                </p>
              </div>
              <button
                type="button"
                onClick={closeReallocationModal}
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700"
              >
                Close
              </button>
            </div>

            <div className="max-h-[calc(92vh-84px)] overflow-y-auto px-6 py-5">
              <div className="mb-5 rounded-xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Original DC Details
                </p>
                <div className="mt-3 grid grid-cols-1 gap-3 text-sm md:grid-cols-4">
                  <div>
                    <p className="text-xs text-slate-500">DC Number</p>
                    <p className="font-semibold text-slate-800">
                      {reallocationModal.record?.dcNumber || "-"}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Receipt Ref</p>
                    <p className="font-semibold text-slate-800">
                      {formatReceiptReference(
                        Array.isArray(reallocationModal.record?.receiveGoodsIds) &&
                          reallocationModal.record.receiveGoodsIds.length
                          ? reallocationModal.record.receiveGoodsIds
                          : reallocationModal.record?.receiveGoodsId
                      )}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Current Project</p>
                    <p className="font-semibold text-slate-800">
                      {projectMap[String(reallocationModal.record?.projectId)]?.name || "-"}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">DC Status</p>
                    <p className="font-semibold text-slate-800">
                      {getDeliveryChallanRegisterStatus(reallocationModal.record || {})}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Current From</p>
                    <p className="font-semibold text-slate-800">
                      {locationMap[String(reallocationModal.record?.fromLocationId)]?.name ||
                        "-"}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Current To</p>
                    <p className="font-semibold text-slate-800">
                      {locationMap[String(reallocationModal.record?.toLocationId)]?.name ||
                        reallocationModal.record?.toLocation ||
                        "-"}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Balance Qty</p>
                    <p className="font-semibold text-slate-800">
                      {fmtQty(
                        getChallanReallocationMetrics(
                          reallocationModal.record || {},
                          reallocations
                        ).remainingBalanceQty
                      )}
                    </p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-5">
                <div>
                  <label className="text-sm font-medium text-slate-700">
                    Source Location
                  </label>
                  <input
                    type="text"
                    readOnly
                    value={
                      locationMap[String(reallocationModal.record?.toLocationId)]?.name ||
                      reallocationModal.record?.toLocation ||
                      ""
                    }
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-100 px-3 py-2"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-slate-700">
                    Destination Location *
                  </label>
                  <select
                    value={reallocationModal.targetLocationId}
                    onChange={(event) =>
                      setReallocationModal((prev) => ({
                        ...prev,
                        targetLocationId: event.target.value,
                      }))
                    }
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"
                  >
                    <option value="">Select location</option>
                    {reallocationTargetLocations.map((locationItem) => (
                      <option key={locationItem.id} value={locationItem.id}>
                        {locationItem.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-sm font-medium text-slate-700">
                    Destination Project
                  </label>
                  <input
                    type="text"
                    readOnly
                    value={selectedReallocationTargetProject.name || ""}
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-100 px-3 py-2"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-slate-700">
                    Reallocation Type
                  </label>
                  <select
                    value={reallocationModal.reallocationType}
                    onChange={(event) => handleReallocationTypeChange(event.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"
                  >
                    <option value="partial">Partial</option>
                    <option value="full">Full</option>
                  </select>
                </div>
                <div>
                  <label className="text-sm font-medium text-slate-700">
                    Reallocation Date *
                  </label>
                  <input
                    type="date"
                    value={reallocationModal.requestDate}
                    onChange={(event) =>
                      setReallocationModal((prev) => ({
                        ...prev,
                        requestDate: event.target.value,
                      }))
                    }
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"
                  />
                </div>
              </div>

              <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <label className="text-sm font-medium text-slate-700">
                    Requested By
                  </label>
                  <input
                    type="text"
                    value={reallocationModal.requestedBy}
                    onChange={(event) =>
                      setReallocationModal((prev) => ({
                        ...prev,
                        requestedBy: event.target.value,
                      }))
                    }
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-slate-700">
                    Notes
                  </label>
                  <input
                    type="text"
                    value={reallocationModal.notes}
                    onChange={(event) =>
                      setReallocationModal((prev) => ({
                        ...prev,
                        notes: event.target.value,
                      }))
                    }
                    placeholder="Optional remarks for this movement"
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"
                  />
                </div>
              </div>

              {reallocationModal.error ? (
                <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                  {reallocationModal.error}
                </div>
              ) : null}

              <div className="mt-5 overflow-x-auto rounded-xl border border-slate-200">
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-50 text-slate-600">
                    <tr>
                      <th className="p-3 text-left">Item</th>
                      <th className="p-3 text-left">Unit</th>
                      <th className="p-3 text-right">Source Qty</th>
                      <th className="p-3 text-right">Available Qty</th>
                      <th className="p-3 text-right">Reallocate Qty</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reallocationModal.loading ? (
                      <tr>
                        <td colSpan="5" className="p-6 text-center text-slate-500">
                          Loading current DC balance...
                        </td>
                      </tr>
                    ) : reallocationModal.items.length ? (
                      reallocationModal.items.map((item) => (
                        <tr key={item.id} className="border-t border-slate-200">
                          <td className="p-3">
                            <p className="font-medium text-slate-800">{item.name}</p>
                            {item.description ? (
                              <p className="text-xs text-slate-500">
                                {item.description}
                              </p>
                            ) : null}
                          </td>
                          <td className="p-3 text-slate-700">{item.unit || "PCS"}</td>
                          <td className="p-3 text-right text-slate-800">
                            {fmtQty(item.sourceQty)}
                          </td>
                          <td className="p-3 text-right font-medium text-slate-800">
                            {fmtQty(item.availableQty)}
                          </td>
                          <td className="p-3">
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={item.quantity}
                              onChange={(event) =>
                                handleReallocationItemChange(item.id, event.target.value)
                              }
                              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-right"
                            />
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan="5" className="p-6 text-center text-slate-500">
                          No reallocation-ready DC balance found.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              <div className="mt-5 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={closeReallocationModal}
                  className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={reallocationModal.loading || reallocationModal.submitting}
                  className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-slate-300"
                >
                  {reallocationModal.submitting ? "Saving..." : "Confirm Reallocation"}
                </button>
              </div>
            </div>
          </form>
        </div>
      ) : null}

      {podModal.type === "upload" && podModal.record ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <form
            onSubmit={handlePodUploadSubmit}
            className="w-full max-w-xl rounded-lg border border-slate-200 bg-white shadow-2xl"
          >
            <div className="flex items-start justify-between border-b border-slate-200 px-6 py-4">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Upload POD</h2>
                <p className="mt-1 text-sm text-slate-500">
                  {podModal.record.dcNumber || "-"} | {getPodStatusLabel(podModal.record.podStatus)}
                </p>
              </div>
              <button
                type="button"
                onClick={closePodModal}
                className="grid h-9 w-9 place-items-center rounded-full border border-slate-200 text-slate-500 hover:border-slate-300 hover:text-slate-900"
              >
                x
              </button>
            </div>
            <div className="space-y-4 px-6 py-5">
              <div>
                <label className="text-sm font-medium text-slate-700">
                  POD Document
                </label>
                <label className="mt-1 flex cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center hover:border-slate-400">
                  <UploadCloud className="mb-2 h-7 w-7 text-slate-500" />
                  <span className="text-sm font-medium text-slate-700">
                    {podForm.fileName || "Upload signed POD"}
                  </span>
                  <span className="mt-1 text-xs text-slate-500">
                    PDF, JPG, or PNG | Max 5 MB
                  </span>
                  <input
                    type="file"
                    accept="application/pdf,image/*"
                    onChange={handlePodFileChange}
                    className="sr-only"
                  />
                </label>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="text-sm font-medium text-slate-700">
                    POD Reference
                  </label>
                  <input
                    type="text"
                    value={podForm.reference}
                    onChange={(event) =>
                      setPodForm((prev) => ({
                        ...prev,
                        reference: event.target.value,
                      }))
                    }
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                    placeholder="POD reference"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-slate-700">
                    POD Date / Time
                  </label>
                  <input
                    type="datetime-local"
                    value={podForm.podDate}
                    onChange={(event) =>
                      setPodForm((prev) => ({ ...prev, podDate: event.target.value }))
                    }
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  />
                </div>
              </div>
              <div>
                <label className="text-sm font-medium text-slate-700">
                  Upload Remarks
                </label>
                <textarea
                  value={podForm.remarks}
                  onChange={(event) =>
                    setPodForm((prev) => ({ ...prev, remarks: event.target.value }))
                  }
                  rows={3}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  placeholder="Delivery handover remarks"
                />
              </div>
              {podActionError ? (
                <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                  {podActionError}
                </p>
              ) : null}
            </div>
            <div className="flex justify-end gap-3 border-t border-slate-200 bg-slate-50 px-6 py-4">
              <button
                type="button"
                onClick={closePodModal}
                className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700"
                disabled={podActionLoading}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={podActionLoading}
              >
                {podActionLoading ? "Uploading..." : "Upload POD"}
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {["verify", "reject", "dispute", "waive", "resolve"].includes(podModal.type) &&
      podModal.record ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <form
            onSubmit={handlePodActionSubmit}
            className="w-full max-w-lg rounded-lg border border-slate-200 bg-white shadow-2xl"
          >
            <div className="border-b border-slate-200 px-6 py-4">
              <h2 className="text-lg font-semibold text-slate-900">
                {POD_ACTION_TITLES[podModal.type] || "POD Action"}
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                {podModal.record.dcNumber || "-"} | {getPodStatusLabel(podModal.record.podStatus)}
              </p>
            </div>
            <div className="space-y-4 px-6 py-5">
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                <p className="font-medium">
                  {podModal.record.podDocumentName || "No document name available"}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  Uploaded {formatDateTime(podModal.record.podUploadedAt)} by{" "}
                  {podModal.record.podUploadedBy || "-"}
                </p>
              </div>
              <div>
                <label className="text-sm font-medium text-slate-700">
                  {podModal.type === "waive"
                    ? "Waiver Reason"
                    : podModal.type === "dispute"
                    ? "Dispute Remarks"
                    : podModal.type === "reject"
                    ? "Rejection Remarks"
                    : podModal.type === "resolve"
                    ? "Resolution Remarks"
                    : "Verification Remarks"}
                </label>
                <textarea
                  value={podForm.remarks}
                  onChange={(event) =>
                    setPodForm((prev) => ({ ...prev, remarks: event.target.value }))
                  }
                  rows={4}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  required={["reject", "dispute", "waive", "resolve"].includes(
                    podModal.type
                  )}
                />
              </div>
              {podActionError ? (
                <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                  {podActionError}
                </p>
              ) : null}
            </div>
            <div className="flex justify-end gap-3 border-t border-slate-200 bg-slate-50 px-6 py-4">
              <button
                type="button"
                onClick={closePodModal}
                className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700"
                disabled={podActionLoading}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={podActionLoading}
              >
                {podActionLoading
                  ? "Saving..."
                  : POD_ACTION_CONFIRM_LABELS[podModal.type] || "Save"}
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {["details", "reason", "issue", "approval", "audit"].includes(podModal.type) &&
      podModal.record
        ? (() => {
            const record = podModal.record;
            const documentIsImage = String(record.podDocumentType || "").startsWith("image/");
            return (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
                <div className="max-h-[86vh] w-full max-w-2xl overflow-hidden rounded-lg border border-slate-200 bg-white shadow-2xl">
                  <div className="flex items-start justify-between border-b border-slate-200 px-6 py-4">
                    <div>
                      <h2 className="text-lg font-semibold text-slate-900">
                        {POD_DETAIL_TITLES[podModal.type] || "POD Details"}
                      </h2>
                      <p className="mt-1 text-sm text-slate-500">
                        {record.dcNumber || "-"} | {getPodStatusLabel(record.podStatus)}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={closePodModal}
                      className="grid h-9 w-9 place-items-center rounded-full border border-slate-200 text-slate-500 hover:border-slate-300 hover:text-slate-900"
                    >
                      x
                    </button>
                  </div>
                  <div className="max-h-[68vh] space-y-4 overflow-y-auto px-6 py-5">
                    {podModal.type === "audit" ? (
                      <div className="space-y-3">
                        {podAuditLoading ? (
                          <p className="text-sm text-slate-500">Loading audit log...</p>
                        ) : podAuditEntries.length ? (
                          podAuditEntries.map((entry) => (
                            <div
                              key={entry.id || `${entry.action}-${entry.createdAt}`}
                              className="rounded-lg border border-slate-200 px-4 py-3"
                            >
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <p className="text-sm font-semibold text-slate-900">
                                  {entry.action || "POD Update"}
                                </p>
                                <p className="text-xs text-slate-500">
                                  {formatDateTime(entry.createdAt)}
                                </p>
                              </div>
                              <p className="mt-1 text-xs text-slate-500">
                                {getPodStatusLabel(entry.fromStatus)} -&gt;{" "}
                                {getPodStatusLabel(entry.toStatus)}
                              </p>
                              <p className="mt-1 text-sm text-slate-700">
                                {entry.performedBy || "-"}{" "}
                                {entry.performedRole ? `(${entry.performedRole})` : ""}
                              </p>
                              {entry.remarks ? (
                                <p className="mt-2 text-sm text-slate-600">
                                  {entry.remarks}
                                </p>
                              ) : null}
                            </div>
                          ))
                        ) : (
                          <p className="text-sm text-slate-500">No POD audit entries.</p>
                        )}
                      </div>
                    ) : (
                      <>
                        <div className="grid gap-3 text-sm md:grid-cols-2">
                          <div className="rounded-lg border border-slate-200 px-4 py-3">
                            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                              Status
                            </p>
                            <p className="mt-1 font-medium text-slate-900">
                              {getPodStatusLabel(record.podStatus)}
                            </p>
                          </div>
                          <div className="rounded-lg border border-slate-200 px-4 py-3">
                            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                              Last Updated
                            </p>
                            <p className="mt-1 font-medium text-slate-900">
                              {formatDateTime(getPodTimestamp(record))}
                            </p>
                          </div>
                          <div className="rounded-lg border border-slate-200 px-4 py-3">
                            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                              Reference
                            </p>
                            <p className="mt-1 font-medium text-slate-900">
                              {record.podReference || "-"}
                            </p>
                          </div>
                          <div className="rounded-lg border border-slate-200 px-4 py-3">
                            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                              Actor
                            </p>
                            <p className="mt-1 font-medium text-slate-900">
                              {getPodActor(record) || "-"}
                            </p>
                          </div>
                        </div>
                        {podModal.type === "reason" ? (
                          <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                            {record.podRejectionRemarks || "No rejection remarks recorded."}
                          </div>
                        ) : null}
                        {podModal.type === "issue" ? (
                          <div className="rounded-lg border border-orange-200 bg-orange-50 px-4 py-3 text-sm text-orange-700">
                            {record.podDisputeRemarks || "No dispute remarks recorded."}
                          </div>
                        ) : null}
                        {podModal.type === "approval" ? (
                          <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                            <p>
                              Approved by {record.podWaiverApprovedBy || record.podWaivedBy || "-"}
                            </p>
                            <p className="mt-1">{record.podWaiverReason || "-"}</p>
                          </div>
                        ) : null}
                        {podModal.type === "details" &&
                        podActionLoading &&
                        !record.podDocumentData ? (
                          <p className="text-sm text-slate-500">
                            Loading POD document...
                          </p>
                        ) : null}
                        {record.podDocumentData ? (
                          <div className="rounded-lg border border-slate-200 px-4 py-3">
                            <div className="flex flex-wrap items-center justify-between gap-3">
                              <div>
                                <p className="text-sm font-semibold text-slate-900">
                                  {record.podDocumentName || "POD document"}
                                </p>
                                <p className="mt-1 text-xs text-slate-500">
                                  {record.podDocumentType || "Document"} |{" "}
                                  {record.podDocumentSize
                                    ? `${Math.round(record.podDocumentSize / 1024)} KB`
                                    : "-"}
                                </p>
                              </div>
                              <button
                                type="button"
                                onClick={() =>
                                  window.open(
                                    record.podDocumentData,
                                    "_blank",
                                    "noopener,noreferrer"
                                  )
                                }
                                className={podButtonClass}
                              >
                                <Eye className="h-3.5 w-3.5" />
                                Open
                              </button>
                            </div>
                            {documentIsImage ? (
                              <img
                                src={record.podDocumentData}
                                alt="POD preview"
                                className="mt-3 max-h-72 w-full rounded-lg border border-slate-200 object-contain"
                              />
                            ) : null}
                          </div>
                        ) : null}
                      </>
                    )}
                    {podActionError ? (
                      <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                        {podActionError}
                      </p>
                    ) : null}
                  </div>
                </div>
              </div>
            );
          })()
        : null}

      <div id="delivery-challan-print-area">
        {printChallan && (
          <DocumentViewPanel
            id="delivery-challan-print-panel"
            title="DELIVERY CHALLAN"
            onClose={() => setPrintChallan(null)}
            companyName={companyName}
            companyAddress={company.address || "Company address"}
            companyGstin={company.gstin}
            companyPhone={company.phone}
            companyEmail={company.email}
            logoUrl={companyLogo}
            primaryPairs={[
              {
                label: "RE No",
                value: printChallan.id
                  ? `RE-${String(printChallan.id).padStart(5, "0")}`
                  : "-",
              },
              { label: "Our Ref", value: printChallan.dcNumber || "-" },
              {
                label: "Receipt Ref",
                value: formatReceiptReference(
                  Array.isArray(printChallan.receiveGoodsIds) &&
                    printChallan.receiveGoodsIds.length
                    ? printChallan.receiveGoodsIds
                    : printChallan.receiveGoodsId
                ),
              },
              { label: "Date", value: formatDate(printChallan.issueDate) },
              { label: "E-Way Bill No", value: printChallan.eWayBillNumber || "-" },
              {
                label: "POD",
                value:
                  [
                    getPodStatusLabel(printChallan.podStatus),
                    printChallan.podReference,
                    formatDateTime(getPodTimestamp(printChallan)),
                  ]
                    .filter((value) => value && value !== "-")
                    .join(" | ") || "-",
              },
              { label: "Project", value: printProject.name || "-" },
              { label: "Client", value: printProject.client || "-" },
            ]}
            leftBlockTitle="From"
            leftBlockLines={[
              printFromLocation.name || "-",
              printFromLocation.address || "-",
              `Contact: ${printFromLocation.manager || "-"}${
                printFromLocation.phone ? ` (${printFromLocation.phone})` : ""
              }`,
            ]}
            rightBlockTitle="To"
            rightBlockLines={[
              printToLocation.name || printProject.name || "-",
              printToLocation.address || printChallan.toLocation || "-",
              `Status: ${getDeliveryChallanRegisterStatus(printChallan)}`,
            ]}
            tableColumns={[
              { key: "serial", label: "Sl No", widthClass: "w-16" },
              { key: "description", label: "Description" },
              { key: "hsn", label: "HSN", widthClass: "w-20" },
              { key: "gst", label: "GST", widthClass: "w-20" },
              { key: "quantity", label: "Qty", align: "right", widthClass: "w-20" },
              { key: "unit", label: "Unit", widthClass: "w-20" },
            ]}
            tableRows={(printChallan.items || []).map((item, index) => ({
              id: item.id || index,
              serial: index + 1,
              description: [item.name || "-", item.description, item.notes]
                .filter(Boolean)
                .join(" | "),
              hsn: item.hsn || "-",
              gst: item.gst || "-",
              quantity: item.quantity || "-",
              unit: item.unit || "-",
            }))}
            bottomLeftContent={
              <div className="space-y-3 text-left">
                <div>
                  <p className="font-semibold">Vehicle No</p>
                  <p>{printChallan.vehicleNumber || "-"}</p>
                </div>
                <div>
                  <p className="font-semibold">Notes</p>
                  <p className="whitespace-pre-wrap text-slate-700">
                    {printChallan.notes || "-"}
                  </p>
                </div>
              </div>
            }
            bottomRightContent={
              <div className="space-y-3 text-right">
                <div>
                  <p className="font-semibold">Total Qty</p>
                  <p>{Number.isFinite(printTotalQty) ? printTotalQty : "-"}</p>
                </div>
                <div>
                  <p className="font-semibold">POD Status</p>
                  <p>{getPodStatusLabel(printChallan.podStatus)}</p>
                </div>
              </div>
            }
            footerCompanyName={companyName}
          />
        )}
      </div>
    </div>
  );
};

export default DeliveryChallan;
