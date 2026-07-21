import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  createConsumption,
  deleteConsumption,
  fetchConsumptions,
  updateConsumption,
} from "../../services/consumptionApi";
import { fetchAvailableInventory } from "../../services/availableInventoryApi";
import { fetchDeliveryChallans } from "../../services/deliveryChallanApi";
import { fetchLocations } from "../../services/locationsApi";
import { fetchProjects } from "../../services/projectsApi";
import { fetchReceiveGoods } from "../../services/receiveGoodsApi";
import { getProjects as getCachedProjects } from "../../services/projectsStore";
import { fetchReallocateInventory } from "../../services/reallocateInventoryApi";
import useSettings from "../../hooks/useSettings";
import DateInput from "../common/DateInput";
import DocumentViewPanel from "./DocumentViewPanel";
import { formatDate } from "../../utils/dateFormat";
import {
  getActiveProjectId,
  setActiveProjectId,
} from "../../services/projectSelectionStore";

const panel =
  "rounded-2xl border border-slate-200 bg-white shadow-[0_10px_30px_-22px_rgba(15,23,42,0.45)]";
const field =
  "mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-violet-500 focus:ring-2 focus:ring-violet-100";
const qtyInput =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-right text-sm text-slate-700 outline-none transition focus:border-violet-500 focus:ring-2 focus:ring-violet-100";

const issuedByOptions = [
  "Store Keeper",
  "Site Engineer",
  "Supervisor",
  "Project Manager",
];
const statusOptions = ["Logged", "Reviewed", "Approved"];
const toNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const toNullableInt = (value) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
};

const normalizeText = (value = "") => String(value ?? "").trim().toLowerCase();

const formatQty = (value) =>
  (Number(value) || 0).toLocaleString("en-IN", {
    maximumFractionDigits: 2,
  });

const resolveConsumptionProjectId = (record = {}, deliveryChallanMap = {}) => {
  const directProjectId = record.projectId ?? null;
  if (directProjectId !== null && directProjectId !== undefined && directProjectId !== "") {
    return directProjectId;
  }

  const linkedIds = Array.isArray(record.deliveryChallanIds)
    ? record.deliveryChallanIds
    : record.deliveryChallanId
    ? [record.deliveryChallanId]
    : [];
  for (const challanId of linkedIds) {
    const linked = deliveryChallanMap[String(challanId)];
    if (linked?.projectId !== null && linked?.projectId !== undefined && linked?.projectId !== "") {
      return linked.projectId;
    }
  }

  return null;
};

const materialKey = (item = {}) => {
  const name = normalizeText(item.name ?? item.ItemName ?? item.Item ?? "");
  if (!name) {
    return "";
  }
  const unit =
    String(item.unit ?? item.Unit ?? "PCS")
      .trim()
      .toUpperCase() || "PCS";
  return `${name}::${unit}`;
};

const buildRecordItemSourceKey = (item = {}, fallbackDeliveryChallanId = null) => {
  const explicit = String(item.sourceKey ?? item.SourceKey ?? "").trim();
  if (explicit) {
    return explicit;
  }

  const deliveryChallanId = toNullableInt(
    item.deliveryChallanId ?? item.DeliveryChallanId ?? fallbackDeliveryChallanId
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
  const key = materialKey(item);

  if (deliveryChallanId !== null) {
    const identity =
      deliveryChallanItemId ?? receiveGoodsItemId ?? itemId ?? key;
    return identity ? `dc:${deliveryChallanId}:${identity}` : "";
  }

  if (receiveGoodsItemId !== null) {
    return `receive:${receiveGoodsItemId}`;
  }

  return key ? `material:${key}` : "";
};

const buildExactInventoryRowIdentity = (row = {}) =>
  [
    normalizeText(row.sourceType),
    String(row.sourceKey ?? "").trim(),
    String(toNullableInt(row.deliveryChallanId) ?? ""),
    String(toNullableInt(row.deliveryChallanItemId) ?? ""),
    String(toNullableInt(row.receiveGoodsItemId) ?? ""),
    String(toNullableInt(row.itemId) ?? ""),
    String(toNullableInt(row.projectId) ?? ""),
    String(toNullableInt(row.locationId) ?? ""),
  ].join("|");

const dedupeExactInventoryRows = (rows = []) => {
  const uniqueRows = new Map();

  (Array.isArray(rows) ? rows : []).forEach((row) => {
    const key = buildExactInventoryRowIdentity(row);
    if (!key.replace(/\|/g, "").trim()) {
      uniqueRows.set(`fallback:${uniqueRows.size}`, row);
      return;
    }

    const existing = uniqueRows.get(key);
    if (!existing) {
      uniqueRows.set(key, row);
      return;
    }

    const sourceQty = Math.max(toNumber(existing.sourceQty), toNumber(row.sourceQty));
    const consumedQty = Math.max(
      toNumber(existing.consumedQty),
      toNumber(row.consumedQty)
    );
    const reallocatedQty = Math.max(
      toNumber(existing.reallocatedQty ?? existing.adjustedQty),
      toNumber(row.reallocatedQty ?? row.adjustedQty)
    );
    const remainingAvailableQty = Math.max(
      sourceQty - consumedQty - reallocatedQty,
      0
    );

    uniqueRows.set(key, {
      ...existing,
      sourceQty,
      consumedQty,
      adjustedQty: reallocatedQty,
      reallocatedQty,
      availableQty: remainingAvailableQty,
      remainingAvailableQty,
    });
  });

  return Array.from(uniqueRows.values()).filter(
    (row) => Math.max(toNumber(row.remainingAvailableQty ?? row.availableQty), 0) > 0
  );
};

const buildReallocationSourceKey = (record = {}, item = {}) => {
  const transferId = toNullableInt(record.id ?? record.transferId);
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
  const sourceKey = String(item.sourceKey ?? item.SourceKey ?? "").trim();
  const key = materialKey(item);
  const identity =
    itemId ?? deliveryChallanItemId ?? receiveGoodsItemId ?? sourceKey ?? key;

  return transferId !== null && identity
    ? `reallocation:${transferId}:${identity}`
    : "";
};

const getRecordItemSourceKeyCandidates = (item = {}, fallbackDeliveryChallanId = null) => {
  const keys = new Set();
  const explicit = String(item.sourceKey ?? item.SourceKey ?? "").trim();
  if (explicit) {
    keys.add(explicit);
  }

  const canonical = buildRecordItemSourceKey(
    {
      ...item,
      sourceKey: "",
      SourceKey: "",
    },
    fallbackDeliveryChallanId
  );
  if (canonical) {
    keys.add(canonical);
  }

  return Array.from(keys);
};

const parseDateOnly = (value) => {
  if (!value) {
    return null;
  }

  const source = String(value).trim();
  const isoMatch = /^(\d{4})-(\d{2})-(\d{2})/.exec(source);
  if (isoMatch) {
    return new Date(
      Number(isoMatch[1]),
      Number(isoMatch[2]) - 1,
      Number(isoMatch[3])
    );
  }

  const parsed = new Date(source);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
};

const isSameDay = (left, right) =>
  left &&
  right &&
  left.getFullYear() === right.getFullYear() &&
  left.getMonth() === right.getMonth() &&
  left.getDate() === right.getDate();

const formatQuantityInputText = (value) =>
  Math.max(toNumber(value), 0)
    .toFixed(2)
    .replace(/\.00$/, "")
    .replace(/(\.\d*[1-9])0$/, "$1");

const clampQuantityText = (rawValue) => {
  const next = String(rawValue ?? "").trim();
  if (!next) {
    return "";
  }
  if (!/^\d*(?:\.\d{0,2})?$/.test(next)) {
    return null;
  }

  const parsed = toNumber(next);
  if (parsed < 0) {
    return "0";
  }
  return next;
};

const clampRequestedQuantity = (value, availableQty) =>
  Math.min(Math.max(toNumber(value), 0), Math.max(toNumber(availableQty), 0));

const hasQuantityValue = (value) =>
  value !== null && value !== undefined && value !== "";

const resolveBaseAvailableQty = ({
  sourceQty = null,
  consumedQty = null,
  adjustedQty = null,
  availableQty = null,
  remainingAvailableQty = null,
  remainingQty = null,
  balanceQty = null,
} = {}) => {
  const backendAvailableQty = [
    availableQty,
    remainingAvailableQty,
    remainingQty,
    balanceQty,
  ].find(hasQuantityValue);
  if (hasQuantityValue(backendAvailableQty)) {
    return Math.max(toNumber(backendAvailableQty), 0);
  }

  const normalizedSourceQty = Math.max(toNumber(sourceQty), 0);
  const normalizedConsumedQty = Math.max(toNumber(consumedQty), 0);
  const normalizedAdjustedQty = Math.max(toNumber(adjustedQty), 0);

  if (
    hasQuantityValue(sourceQty) ||
    hasQuantityValue(consumedQty) ||
    hasQuantityValue(adjustedQty)
  ) {
    return Math.max(
      normalizedSourceQty - normalizedConsumedQty - normalizedAdjustedQty,
      0
    );
  }

  return 0;
};

const resolveRowBackendAvailableQty = (row = {}) =>
  resolveBaseAvailableQty({
    availableQty: row.availableQty ?? row.AvailableQty,
    remainingAvailableQty:
      row.remainingAvailableQty ?? row.RemainingAvailableQty,
    remainingQty: row.remainingQty ?? row.RemainingQty,
    balanceQty: row.balanceQty ?? row.BalanceQty,
    sourceQty: row.sourceQty ?? row.SourceQty ?? row.dcQty,
    consumedQty:
      row.consumedQty ??
      row.ConsumedQty ??
      row.previouslyConsumed ??
      row.PreviouslyConsumed,
    adjustedQty:
      row.adjustedQty ??
      row.AdjustedQty ??
      row.reallocatedQty ??
      row.ReallocatedQty,
  });

const buildConsumptionRowState = (
  row = {},
  { requestedQty = row.consumeQty, selected = row.selected } = {}
) => {
  const sourceQty = Math.max(toNumber(row.sourceQty ?? row.dcQty), 0);
  const consumedQty = Math.max(
    toNumber(
      row.consumedQty ??
        row.ConsumedQty ??
        row.previouslyConsumed ??
        row.PreviouslyConsumed
    ),
    0
  );
  const adjustedQty = Math.max(
    toNumber(row.adjustedQty ?? row.reallocatedQty),
    0
  );
  const maxAvailableQty = resolveBaseAvailableQty({
    sourceQty: hasQuantityValue(row.sourceQty ?? row.dcQty) ? sourceQty : null,
    consumedQty:
      hasQuantityValue(row.consumedQty ?? row.previouslyConsumed) ? consumedQty : null,
    adjustedQty:
      hasQuantityValue(row.adjustedQty ?? row.reallocatedQty) ? adjustedQty : null,
    availableQty: row.availableQty,
    remainingAvailableQty: row.remainingAvailableQty,
    remainingQty: row.remainingQty ?? row.RemainingQty,
    balanceQty: row.balanceQty ?? row.BalanceQty,
  });
  const consumeQty = clampRequestedQuantity(requestedQty, maxAvailableQty);

  return {
    ...row,
    sourceQty,
    dcQty: sourceQty,
    consumedQty,
    previouslyConsumed: consumedQty,
    adjustedQty,
    reallocatedQty: adjustedQty,
    maxAvailableQty,
    availableQty: maxAvailableQty,
    // The input is only a draft until Save. Display the persisted backend
    // balance here; subtracting consumeQty makes fully-selected stock look used.
    remainingAvailableQty: maxAvailableQty,
    consumeQty: consumeQty > 0 ? formatQuantityInputText(consumeQty) : "",
    selected: Boolean(selected) && maxAvailableQty > 0,
  };
};

const buildConsumptionReference = (records = []) => {
  const year = new Date().getFullYear();
  const pattern = new RegExp(`^CON-${year}-(\\d+)$`, "i");
  const last = (Array.isArray(records) ? records : []).reduce((max, row) => {
    const match = pattern.exec(String(row?.consumptionNumber ?? "").trim());
    const sequence = match ? Number.parseInt(match[1], 10) : 0;
    return Math.max(max, Number.isFinite(sequence) ? sequence : 0);
  }, 0);
  return `CON-${year}-${String(last + 1).padStart(3, "0")}`;
};

const isConsumptionLinkedToChallan = (consumption = {}, challan = {}) => {
  const challanId = toNullableInt(challan.id);
  const consumptionChallanId = toNullableInt(
    consumption.deliveryChallanId ?? consumption.DeliveryChallanId
  );

  if (challanId !== null && consumptionChallanId === challanId) {
    return true;
  }

  const challanRef = normalizeText(challan.dcNumber ?? challan.DCNumber ?? "");
  const consumptionRef = normalizeText(
    consumption.deliveryChallanRef ?? consumption.DeliveryChallanRef ?? ""
  );

  return Boolean(challanRef && consumptionRef && challanRef === consumptionRef);
};

const buildExistingConsumptionLookup = (items = []) => {
  const bySourceKey = new Map();
  const bySourceId = new Map();
  const byMaterialKey = new Map();

  (Array.isArray(items) ? items : []).forEach((item) => {
    const sourceKey = String(item.sourceKey ?? item.SourceKey ?? "").trim();
    if (sourceKey) {
      if (!bySourceKey.has(sourceKey)) {
        bySourceKey.set(sourceKey, []);
      }
      bySourceKey.get(sourceKey).push(item);
      return;
    }

    const sourceId = toNullableInt(item.receiveGoodsItemId ?? item.ReceiveGoodsItemId);
    if (sourceId !== null) {
      if (!bySourceId.has(sourceId)) {
        bySourceId.set(sourceId, []);
      }
      bySourceId.get(sourceId).push(item);
      return;
    }

    const key = materialKey(item);
    if (!key) {
      return;
    }
    if (!byMaterialKey.has(key)) {
      byMaterialKey.set(key, []);
    }
    byMaterialKey.get(key).push(item);
  });

  return { bySourceKey, bySourceId, byMaterialKey };
};

const takeExistingItem = ({ sourceKey, sourceId, key, existingLookup }) => {
  if (!existingLookup) {
    return null;
  }

  if (sourceKey && existingLookup.bySourceKey.has(sourceKey)) {
    const queue = existingLookup.bySourceKey.get(sourceKey);
    const match = queue.shift() ?? null;
    if (!queue.length) {
      existingLookup.bySourceKey.delete(sourceKey);
    }
    return match;
  }

  if (sourceId !== null && existingLookup.bySourceId.has(sourceId)) {
    const queue = existingLookup.bySourceId.get(sourceId);
    const match = queue.shift() ?? null;
    if (!queue.length) {
      existingLookup.bySourceId.delete(sourceId);
    }
    return match;
  }

  if (key && existingLookup.byMaterialKey.has(key)) {
    const queue = existingLookup.byMaterialKey.get(key);
    const match = queue.shift() ?? null;
    if (!queue.length) {
      existingLookup.byMaterialKey.delete(key);
    }
    return match;
  }

  return null;
};

const buildRowsFromSelectedChallan = ({
  challan,
  consumptions,
  editingConsumption,
  autoSelectAvailable = false,
}) => {
  if (!challan || !Array.isArray(challan.items) || !challan.items.length) {
    return [];
  }

  const excludedConsumptionId = toNullableInt(editingConsumption?.id);

  const consumedBySourceKey = new Map();
  const consumedBySourceId = new Map();
  const consumedByMaterialKey = new Map();

  (Array.isArray(consumptions) ? consumptions : []).forEach((consumption) => {
    const consumptionId = toNullableInt(consumption?.id);
    if (excludedConsumptionId !== null && consumptionId === excludedConsumptionId) {
      return;
    }
    if (!isConsumptionLinkedToChallan(consumption, challan)) {
      return;
    }

    (consumption.items || []).forEach((item) => {
      const quantity = Math.max(toNumber(item.quantity), 0);
      if (!quantity) {
        return;
      }

      const sourceKeys = getRecordItemSourceKeyCandidates(item, challan.id);
      if (sourceKeys.length) {
        sourceKeys.forEach((sourceKey) => {
          consumedBySourceKey.set(
            sourceKey,
            (consumedBySourceKey.get(sourceKey) ?? 0) + quantity
          );
        });
        return;
      }

      const sourceId = toNullableInt(item.receiveGoodsItemId ?? item.ReceiveGoodsItemId);
      if (sourceId !== null) {
        consumedBySourceId.set(sourceId, (consumedBySourceId.get(sourceId) ?? 0) + quantity);
        return;
      }

      const key = materialKey(item);
      if (!key) {
        return;
      }
      consumedByMaterialKey.set(key, (consumedByMaterialKey.get(key) ?? 0) + quantity);
    });
  });

  const existingLookup = editingConsumption
    ? buildExistingConsumptionLookup(editingConsumption.items || [])
    : null;

  return challan.items.map((line, index) => {
    const sourceKey = buildRecordItemSourceKey(
      {
        ...line,
        deliveryChallanId: challan.id,
      },
      challan.id
    );
    const sourceId = toNullableInt(line.receiveGoodsItemId ?? line.ReceiveGoodsItemId);
    const deliveryChallanItemId = toNullableInt(
      line.deliveryChallanItemId ??
        line.DeliveryChallanItemId ??
        line.deliveryChallanLineItemId ??
        line.DeliveryChallanLineItemId ??
        line.id ??
        line.Id
    );
    const key = materialKey(line);
    const dcQuantity = Math.max(toNumber(line.quantity ?? line.Quantity), 0);

    const previouslyConsumed =
      sourceKey
        ? consumedBySourceKey.get(sourceKey) ?? 0
        : sourceId !== null
        ? consumedBySourceId.get(sourceId) ?? 0
        : consumedByMaterialKey.get(key) ?? 0;

    const availableQuantity = Math.max(dcQuantity - previouslyConsumed, 0);
    const existingItem = takeExistingItem({ sourceKey, sourceId, key, existingLookup });
    const existingQuantity = Math.max(toNumber(existingItem?.quantity), 0);
    const shouldSelect = existingQuantity > 0 || (autoSelectAvailable && availableQuantity > 0);
    const selectedQuantity =
      existingQuantity > 0
        ? Math.min(existingQuantity, availableQuantity || existingQuantity)
        : autoSelectAvailable
        ? availableQuantity
        : 0;

    return buildConsumptionRowState({
      rowId: `${sourceKey || sourceId || key || "line"}-${index}`,
      index,
      sourceType: "dc",
      sourceKey,
      sourceRef: challan.dcNumber || "",
      boqItemId:
        toNullableInt(
          line.boqItemId ??
            line.itemId ??
            line.ItemId ??
            existingItem?.boqItemId ??
            existingItem?.itemId
        ) ?? null,
      itemId: toNullableInt(line.itemId ?? line.ItemId) ?? null,
      deliveryChallanId: toNullableInt(challan.id),
      deliveryChallanItemId,
      receiveGoodsItemId: sourceId,
      name: line.name ?? line.ItemName ?? "",
      description: line.description ?? line.Description ?? "",
      unit: line.unit ?? line.Unit ?? "PCS",
      hsn: line.hsn ?? line.HSN ?? "",
      gst: line.gst ?? line.GST ?? "",
      rate: toNumber(line.rate ?? line.Rate),
      notes: line.notes ?? line.Notes ?? "",
      sourceQty: dcQuantity,
      dcQty: dcQuantity,
      consumedQty: previouslyConsumed,
      previouslyConsumed,
      adjustedQty: 0,
      availableQty: availableQuantity,
      remainingAvailableQty: availableQuantity,
      selected: shouldSelect,
      consumeQty: selectedQuantity > 0 ? formatQuantityInputText(selectedQuantity) : "",
    });
  });
};

const buildRowsFromAvailableInventory = ({
  rows,
  editingConsumption,
  autoSelectAvailable = false,
}) => {
  const existingLookup = editingConsumption
    ? buildExistingConsumptionLookup(editingConsumption.items || [])
    : null;

  return (Array.isArray(rows) ? rows : []).map((line, index) => {
    const sourceKey = String(line.sourceKey ?? "").trim();
    const sourceId = toNullableInt(line.receiveGoodsItemId);
    const key = materialKey(line);
    const availableQuantity = resolveRowBackendAvailableQty(line);
    const existingItem = takeExistingItem({
      sourceKey,
      sourceId,
      key,
      existingLookup,
    });
    const existingQuantity = Math.max(toNumber(existingItem?.quantity), 0);
    const selectedQuantity =
      existingQuantity > 0
        ? Math.min(existingQuantity, availableQuantity || existingQuantity)
        : autoSelectAvailable
        ? availableQuantity
        : 0;

    return buildConsumptionRowState({
      rowId: `${sourceKey || sourceId || key || "available"}-${index}`,
      index,
      sourceType: line.sourceType || "receive",
      sourceKey,
      sourceRef: line.sourceRef || "",
      sourceQty: Math.max(
        toNumber(line.sourceQty ?? line.SourceQty ?? line.dcQty),
        0
      ),
      boqItemId: toNullableInt(existingItem?.boqItemId ?? line.itemId) ?? null,
      itemId: toNullableInt(line.itemId ?? existingItem?.itemId) ?? null,
      receiveGoodsId: toNullableInt(line.receiveGoodsId),
      receiveGoodsItemId: sourceId,
      deliveryChallanId: toNullableInt(line.deliveryChallanId),
      deliveryChallanItemId: toNullableInt(line.deliveryChallanItemId),
      deliveryChallanRef:
        normalizeText(line.sourceType) === "dc" || isReallocationSource(line.sourceType)
          ? line.sourceRef || ""
          : "",
      name: line.name || "",
      description: line.description || "",
      unit: line.unit || "PCS",
      hsn: line.hsn || "",
      gst: line.gst || "",
      rate: toNumber(line.rate),
      notes: line.notes || "",
      dcQty: Math.max(
        toNumber(line.sourceQty ?? line.SourceQty ?? line.dcQty),
        0
      ),
      consumedQty: Math.max(
        toNumber(
          line.consumedQty ??
            line.ConsumedQty ??
            line.previouslyConsumed ??
            line.PreviouslyConsumed
        ),
        0
      ),
      previouslyConsumed: Math.max(
        toNumber(
          line.consumedQty ??
            line.ConsumedQty ??
            line.previouslyConsumed ??
            line.PreviouslyConsumed
        ),
        0
      ),
      adjustedQty: Math.max(toNumber(line.adjustedQty ?? line.reallocatedQty), 0),
      reallocatedQty: Math.max(toNumber(line.adjustedQty ?? line.reallocatedQty), 0),
      availableQty: availableQuantity,
      remainingAvailableQty: availableQuantity,
      selected: selectedQuantity > 0,
      consumeQty: selectedQuantity > 0 ? formatQuantityInputText(selectedQuantity) : "",
    });
  });
};

const createEmptyForm = ({ records = [], company = {} }) => ({
  consumptionNumber: buildConsumptionReference(records),
  projectId: "",
  fromLocationId: "",
  locationId: "",
  deliveryChallanId: "",
  deliveryChallanRef: "",
  consumptionDate: new Date().toISOString().slice(0, 10),
  issuedBy: "Store Keeper",
  status: "Logged",
  notes: "",
  companyAddress: company.address ?? "",
  companyGstin: company.gstin ?? "",
  companyPhone: company.phone ?? "",
  companyEmail: company.email ?? "",
});

const statusPillClass = (status) => {
  const value = normalizeText(status);
  if (value === "approved") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }
  if (value === "reviewed") {
    return "border-amber-200 bg-amber-50 text-amber-700";
  }
  return "border-violet-200 bg-violet-50 text-violet-700";
};

const sourceTypeLabel = (row = {}) => {
  if (normalizeText(row.sourceRef).startsWith("rel-")) {
    return "Transfer";
  }
  if (normalizeText(row.sourceType) === "dc") {
    return "DC";
  }
  if (normalizeText(row.sourceType) === "reallocation") {
    return "Transfer";
  }
  return row.sourceType || "Receive";
};

const isReallocationSource = (value = "") =>
  ["reallocate", "reallocation"].includes(normalizeText(value));

const LOOKUP_SOURCE = {
  DC: "dc",
  REALLOCATION: "reallocation",
};

const normalizeLookupSource = (value = "") =>
  isReallocationSource(value) ? LOOKUP_SOURCE.REALLOCATION : LOOKUP_SOURCE.DC;

const getReallocationReference = (record = {}) =>
  String(
    record.referenceNumber ??
      record.ReferenceNumber ??
      record.referenceNo ??
      record.ReferenceNo ??
      record.sourceRef ??
      ""
  ).trim();

const getReallocationReferenceCandidates = (record = {}) =>
  Array.from(
    new Set(
      [
        getReallocationReference(record),
        record.referenceNo,
        record.consumptionNumber,
        record.sourceRef,
      ]
        .map((value) => normalizeText(value))
        .filter(Boolean)
    )
  );

const Consumption = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const prefillSignatureRef = useRef("");
  const settings = useSettings();
  const company = useMemo(() => settings?.company ?? {}, [settings]);

  const [projects, setProjects] = useState(() => getCachedProjects());
  const [locations, setLocations] = useState([]);
  const [deliveryChallans, setDeliveryChallans] = useState([]);
  const [receiveGoods, setReceiveGoods] = useState([]);
  const [reallocations, setReallocations] = useState([]);
  const [consumptions, setConsumptions] = useState([]);
  const [availableInventory, setAvailableInventory] = useState([]);

  const [form, setForm] = useState(() => createEmptyForm({ company }));
  const [itemRows, setItemRows] = useState([]);
  const [selectedDeliveryChallanIds, setSelectedDeliveryChallanIds] = useState([]);
  const [selectedReallocationIds, setSelectedReallocationIds] = useState([]);
  const [, setLoadedDeliveryChallanIds] = useState([]);
  const [deliveryChallanFilter, setDeliveryChallanFilter] = useState("");
  const [lookupSource, setLookupSource] = useState(LOOKUP_SOURCE.DC);
  const [editingId, setEditingId] = useState(null);
  const [editingConsumption, setEditingConsumption] = useState(null);

  const [loading, setLoading] = useState(false);
  const [inventoryLoading, setInventoryLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState({});
  const [feedback, setFeedback] = useState({ type: "", message: "" });
  const [inventoryError, setInventoryError] = useState("");

  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [viewRecord, setViewRecord] = useState(null);

  const projectMap = useMemo(
    () =>
      projects.reduce((acc, project) => {
        acc[String(project.id)] = project;
        return acc;
      }, {}),
    [projects]
  );

  const locationMap = useMemo(
    () =>
      locations.reduce((acc, location) => {
        acc[String(location.id)] = location;
        return acc;
      }, {}),
    [locations]
  );

  const deliveryChallanMap = useMemo(
    () =>
      deliveryChallans.reduce((acc, challan) => {
        acc[String(challan.id)] = challan;
        return acc;
      }, {}),
    [deliveryChallans]
  );

  const reallocationMap = useMemo(
    () =>
      reallocations.reduce((acc, record) => {
        acc[String(record.id)] = record;
        return acc;
      }, {}),
    [reallocations]
  );

  const deliveryChallanSourceQtyByKey = useMemo(() => {
    const nextMap = new Map();
    deliveryChallans.forEach((challan) => {
      (challan.items || []).forEach((item) => {
        const key = buildRecordItemSourceKey(item, challan.id);
        if (!key) {
          return;
        }
        nextMap.set(key, Math.max(toNumber(item.quantity), 0));
      });
    });
    return nextMap;
  }, [deliveryChallans]);

  const receiveSourceQtyByKey = useMemo(() => {
    const nextMap = new Map();
    receiveGoods.forEach((receipt) => {
      (receipt.items || []).forEach((item) => {
        const key = buildRecordItemSourceKey({
          ...item,
          receiveGoodsItemId: toNullableInt(item.id ?? item.receiveGoodsItemId),
          sourceType: "receive",
        });
        if (!key) {
          return;
        }
        nextMap.set(
          key,
          Math.max(toNumber(item.receiptReceivedQty ?? item.receivedQty), 0)
        );
      });
    });
    return nextMap;
  }, [receiveGoods]);

  const reallocationSourceQtyByKey = useMemo(() => {
    const nextMap = new Map();
    reallocations.forEach((record) => {
      (record.items || []).forEach((item) => {
        const key = buildReallocationSourceKey(record, item);
        if (!key) {
          return;
        }
        nextMap.set(key, Math.max(toNumber(item.quantity), 0));
      });
    });
    return nextMap;
  }, [reallocations]);

  const sourceQtyByKey = useMemo(() => {
    const nextMap = new Map();
    [deliveryChallanSourceQtyByKey, receiveSourceQtyByKey, reallocationSourceQtyByKey].forEach(
      (sourceMap) => {
        sourceMap.forEach((qty, key) => {
          nextMap.set(key, Math.max(toNumber(nextMap.get(key)), Math.max(toNumber(qty), 0)));
        });
      }
    );
    return nextMap;
  }, [
    deliveryChallanSourceQtyByKey,
    receiveSourceQtyByKey,
    reallocationSourceQtyByKey,
  ]);

  const loadAvailableInventoryForLocation = useCallback(
    async ({
      projectId,
      locationId,
      destinationLocationId = null,
      preserveRows = false,
      excludeConsumptionId = undefined,
    } = {}) => {
      const safeProjectId = String(projectId ?? "").trim();
      const safeLocationId = String(locationId ?? "").trim();

      if (!safeProjectId || !safeLocationId) {
        setAvailableInventory([]);
        setInventoryError("");
        if (!preserveRows && !editingId) {
          setItemRows([]);
        }
        return [];
      }

      setInventoryLoading(true);
      setInventoryError("");

      try {
        const list = await fetchAvailableInventory({
          projectId: safeProjectId,
          locationId: safeLocationId,
          destinationLocationId,
          excludeConsumptionId:
            excludeConsumptionId === undefined
              ? editingId || undefined
              : excludeConsumptionId,
        });
        const safeList = dedupeExactInventoryRows(Array.isArray(list) ? list : []);
        setAvailableInventory(safeList);
        if (!preserveRows) {
          setItemRows(
            buildRowsFromAvailableInventory({
              rows: safeList,
              editingConsumption,
            })
          );
        }
        setLoadedDeliveryChallanIds([]);
        return safeList;
      } catch (error) {
        setAvailableInventory([]);
        if (!preserveRows) {
          setItemRows([]);
        }
        setInventoryError(
          error?.response?.data?.error ||
            error?.message ||
            "Could not load available inventory."
        );
        return [];
      } finally {
        setInventoryLoading(false);
      }
    },
    [editingConsumption, editingId]
  );

  const linkedReallocationByConsumptionId = useMemo(
    () =>
      reallocations.reduce((acc, record) => {
        const key = String(
          record.consumptionId ?? record.referenceId ?? ""
        ).trim();
        if (key && !acc[key]) {
          acc[key] = record;
        }
        return acc;
      }, {}),
    [reallocations]
  );

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [
        projectsList,
        locationsList,
        challansList,
        receiptsList,
        reallocationsList,
        consumptionsList,
      ] = await Promise.all([
        fetchProjects().catch(() => getCachedProjects()),
        fetchLocations().catch(() => []),
        fetchDeliveryChallans().catch(() => []),
        fetchReceiveGoods().catch(() => []),
        fetchReallocateInventory().catch(() => []),
        fetchConsumptions().catch(() => []),
      ]);

      setProjects(Array.isArray(projectsList) ? projectsList : []);
      setLocations(Array.isArray(locationsList) ? locationsList : []);
      setDeliveryChallans(Array.isArray(challansList) ? challansList : []);
      setReceiveGoods(Array.isArray(receiptsList) ? receiptsList : []);
      setReallocations(Array.isArray(reallocationsList) ? reallocationsList : []);
      setConsumptions(Array.isArray(consumptionsList) ? consumptionsList : []);

      return {
        projects: Array.isArray(projectsList) ? projectsList : [],
        locations: Array.isArray(locationsList) ? locationsList : [],
        deliveryChallans: Array.isArray(challansList) ? challansList : [],
        receiveGoods: Array.isArray(receiptsList) ? receiptsList : [],
        reallocations: Array.isArray(reallocationsList) ? reallocationsList : [],
        consumptions: Array.isArray(consumptionsList) ? consumptionsList : [],
      };
    } finally {
      setLoading(false);
    }
  }, []);

  const resetForm = useCallback(
    ({ nextRecords = consumptions } = {}) => {
      setEditingId(null);
      setEditingConsumption(null);
      setErrors({});
      setFeedback({ type: "", message: "" });
      setItemRows([]);
      setAvailableInventory([]);
      setInventoryError("");
      setSelectedDeliveryChallanIds([]);
      setSelectedReallocationIds([]);
      setLoadedDeliveryChallanIds([]);
      setDeliveryChallanFilter("");
      setForm(() => createEmptyForm({ records: nextRecords, company }));
    },
    [company, consumptions]
  );

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  useEffect(() => {
    const refresh = () => {
      void loadAll();
    };

    window.addEventListener("consumptions:changed", refresh);
    window.addEventListener("delivery-challans:changed", refresh);
    window.addEventListener("receive-goods:changed", refresh);
    window.addEventListener("reallocate-inventory:changed", refresh);
    window.addEventListener("projects:changed", refresh);
    window.addEventListener("locations:changed", refresh);

    return () => {
      window.removeEventListener("consumptions:changed", refresh);
      window.removeEventListener("delivery-challans:changed", refresh);
      window.removeEventListener("receive-goods:changed", refresh);
      window.removeEventListener("reallocate-inventory:changed", refresh);
      window.removeEventListener("projects:changed", refresh);
      window.removeEventListener("locations:changed", refresh);
    };
  }, [loadAll]);

  useEffect(() => {
    const prefilledLookupSource = normalizeLookupSource(location.state?.lookupSource);
    const prefilledProjectId = String(location.state?.projectId ?? "").trim();
    const prefilledFromLocationId = String(location.state?.fromLocationId ?? "").trim();
    const prefilledLocationId = String(location.state?.locationId ?? "").trim();

    if (
      !location.state?.lookupSource &&
      !prefilledProjectId &&
      !prefilledFromLocationId &&
      !prefilledLocationId
    ) {
      return;
    }

    const signature = [
      location.key,
      prefilledLookupSource,
      prefilledProjectId,
      prefilledFromLocationId,
      prefilledLocationId,
    ].join(":");

    if (prefillSignatureRef.current === signature) {
      return;
    }
    prefillSignatureRef.current = signature;

    setEditingId(null);
    setEditingConsumption(null);
    setErrors({});
    setFeedback({ type: "", message: "" });
    setInventoryError("");
    setItemRows([]);
    setAvailableInventory([]);
    setSelectedDeliveryChallanIds([]);
    setSelectedReallocationIds([]);
    setLoadedDeliveryChallanIds([]);
    setDeliveryChallanFilter("");
    setLookupSource(prefilledLookupSource);
    setForm(() => ({
      ...createEmptyForm({ records: consumptions, company }),
      projectId: prefilledProjectId,
      fromLocationId: prefilledFromLocationId,
      locationId: prefilledLocationId,
    }));
  }, [company, consumptions, location.key, location.state]);

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
    if (!form.projectId) {
      return;
    }
    setActiveProjectId(form.projectId);
  }, [form.projectId]);

  const selectedProjectLocations = useMemo(() => {
    if (!form.projectId) {
      return locations;
    }
    const matchingLocations = locations.filter(
      (location) => String(location.projectId) === String(form.projectId)
    );
    if (matchingLocations.length) {
      return matchingLocations;
    }
    return locations;
  }, [form.projectId, locations]);

  useEffect(() => {
    let cancelled = false;
    const projectId = form.projectId;
    const sourceLocationId = form.fromLocationId || form.locationId;

    if (!projectId || !sourceLocationId) {
      setAvailableInventory([]);
      setInventoryError("");
      if (!editingId) {
        setItemRows([]);
      }
      return () => {
        cancelled = true;
      };
    }

    loadAvailableInventoryForLocation({
      projectId,
      locationId: sourceLocationId,
      destinationLocationId: form.locationId || null,
    }).then((list) => {
        if (cancelled) {
          return;
        }
        if (!Array.isArray(list)) {
          setAvailableInventory([]);
          setItemRows([]);
          return;
        }
        setItemRows(
          buildRowsFromAvailableInventory({
            rows: list,
            editingConsumption,
          })
        );
      });

    return () => {
      cancelled = true;
    };
  }, [
    editingConsumption,
    editingId,
    form.fromLocationId,
    form.locationId,
    form.projectId,
    loadAvailableInventoryForLocation,
  ]);

  const availableDcInventoryRows = useMemo(() => {
    const selectedProjectId = String(form.projectId || "").trim();
    const selectedSourceLocationId = String(
      form.fromLocationId || form.locationId || ""
    ).trim();

    return availableInventory.filter((row) => {
      if (normalizeText(row.sourceType) !== "dc") {
        return false;
      }
      if (Math.max(toNumber(row.remainingAvailableQty ?? row.availableQty), 0) <= 0) {
        return false;
      }
      if (
        selectedProjectId &&
        String(row.projectId ?? "").trim() !== selectedProjectId
      ) {
        return false;
      }
      if (
        selectedSourceLocationId &&
        String(row.locationId ?? "").trim() !== selectedSourceLocationId
      ) {
        return false;
      }
      return Boolean(
        toNullableInt(row.deliveryChallanId) !== null &&
          toNullableInt(row.deliveryChallanItemId) !== null
      );
    });
  }, [availableInventory, form.fromLocationId, form.locationId, form.projectId]);

  useEffect(() => {
    if (!import.meta.env.DEV) {
      return;
    }
    const dcRows = availableInventory.filter(
      (row) => normalizeText(row.sourceType) === "dc"
    );
    console.debug("[Consumption lookup] frontend filter/render", {
      projectId: form.projectId || null,
      sourceLocationId: form.fromLocationId || form.locationId || null,
      destinationLocationId: form.locationId || null,
      apiRows: availableInventory.length,
      apiDcRows: dcRows.length,
      positiveDcRows: dcRows.filter(
        (row) => toNumber(row.remainingAvailableQty ?? row.availableQty) > 0
      ).length,
      renderedDcRows: availableDcInventoryRows.length,
    });
  }, [
    availableDcInventoryRows.length,
    availableInventory,
    form.fromLocationId,
    form.locationId,
    form.projectId,
  ]);

  const availableChallans = useMemo(() => {
    const rowsByChallanId = new Map();
    availableDcInventoryRows.forEach((row) => {
      const challanId = String(row.deliveryChallanId ?? "").trim();
      if (!challanId) {
        return;
      }
      if (!rowsByChallanId.has(challanId)) {
        rowsByChallanId.set(challanId, []);
      }
      rowsByChallanId.get(challanId).push(row);
    });

    return Array.from(rowsByChallanId.entries()).map(([challanId, rows]) => {
      const challan = deliveryChallans.find(
        (candidate) => String(candidate.id ?? "") === challanId
      );
      if (challan) {
        return challan;
      }
      const firstRow = rows[0] ?? {};
      return {
        id: firstRow.deliveryChallanId,
        deliveryChallanId: firstRow.deliveryChallanId,
        dcNumber: firstRow.sourceRef || `DC ${firstRow.deliveryChallanId}`,
        projectId: firstRow.projectId,
        toLocationId: firstRow.locationId,
        status: "Available",
        items: rows,
      };
    });
  }, [availableDcInventoryRows, deliveryChallans]);

  const reallocationAvailableQtyByRef = useMemo(() => {
    const nextMap = new Map();
    availableInventory.forEach((row) => {
      if (!isReallocationSource(row.sourceType)) {
        return;
      }
      const reference = normalizeText(row.sourceRef);
      if (!reference) {
        return;
      }
      nextMap.set(
        reference,
        (nextMap.get(reference) ?? 0) + Math.max(toNumber(row.availableQty), 0)
      );
    });
    return nextMap;
  }, [availableInventory]);

  const getReallocationAvailableQuantity = useCallback(
    (record = {}) =>
      getReallocationReferenceCandidates(record).reduce(
        (maxQty, candidate) =>
          Math.max(maxQty, Math.max(toNumber(reallocationAvailableQtyByRef.get(candidate)), 0)),
        0
      ),
    [reallocationAvailableQtyByRef]
  );

  const availableReallocations = useMemo(() => {
    const selectedProjectId = String(form.projectId || "").trim();
    const selectedSourceLocationId = String(form.fromLocationId || form.locationId || "").trim();
    if (!selectedProjectId || !selectedSourceLocationId) {
      return [];
    }
    return reallocations.filter((record) => {
      if (String(record.type || "Reallocate") !== "Reallocate") {
        return false;
      }
      if (String(record.projectId ?? "").trim() !== selectedProjectId) {
        return false;
      }
      if (String(record.toLocationId ?? "").trim() !== selectedSourceLocationId) {
        return false;
      }
      if (getReallocationAvailableQuantity(record) <= 0) {
        return false;
      }
      return true;
    });
  }, [
    form.fromLocationId,
    form.locationId,
    form.projectId,
    getReallocationAvailableQuantity,
    reallocations,
  ]);

  const filteredDeliveryChallanInventoryRows = useMemo(() => {
    const keyword = normalizeText(deliveryChallanFilter);
    return availableDcInventoryRows.filter((row) => {
      if (!keyword) {
        return true;
      }
      const challan = deliveryChallanMap[String(row.deliveryChallanId)] ?? {};
      const fromLocation =
        locationMap[String(challan.fromLocationId)]?.name ||
        challan.fromLocation ||
        "";
      const toLocation =
        locationMap[String(challan.toLocationId)]?.name ||
        challan.toLocation ||
        "";
      return [
        row.sourceRef,
        row.name,
        row.itemCode,
        challan.dcNumber,
        fromLocation,
        toLocation,
        challan.status,
      ]
        .join(" ")
        .toLowerCase()
        .includes(keyword);
    });
  }, [
    availableDcInventoryRows,
    deliveryChallanFilter,
    deliveryChallanMap,
    locationMap,
  ]);

  const filteredDeliveryChallansForSelection = useMemo(() => {
    const visibleIds = new Set(
      filteredDeliveryChallanInventoryRows.map((row) =>
        String(row.deliveryChallanId ?? "")
      )
    );
    return availableChallans.filter((challan) =>
      visibleIds.has(String(challan.id ?? challan.deliveryChallanId ?? ""))
    );
  }, [
    availableChallans,
    filteredDeliveryChallanInventoryRows,
  ]);

  const filteredReallocationsForSelection = useMemo(() => {
    const keyword = normalizeText(deliveryChallanFilter);
    return availableReallocations.filter((record) => {
      if (!keyword) {
        return true;
      }
      const fromLocation =
        locationMap[String(record.fromLocationId)]?.name || "";
      const toLocation = locationMap[String(record.toLocationId)]?.name || "";
      const itemsText = (record.items || [])
        .map((item) => item.name || item.item || "")
        .join(" ");
      return [
        record.referenceNumber,
        record.consumptionNumber,
        fromLocation,
        toLocation,
        record.status,
        record.requestedBy,
        itemsText,
      ]
        .join(" ")
        .toLowerCase()
        .includes(keyword);
    });
  }, [availableReallocations, deliveryChallanFilter, locationMap]);

  const selectedDeliveryChallans = useMemo(
    () =>
      selectedDeliveryChallanIds
        .map((challanId) => deliveryChallanMap[String(challanId)])
        .filter(Boolean),
    [deliveryChallanMap, selectedDeliveryChallanIds]
  );

  const selectedReallocations = useMemo(
    () =>
      selectedReallocationIds
        .map((recordId) => reallocationMap[String(recordId)])
        .filter(Boolean),
    [reallocationMap, selectedReallocationIds]
  );

  const selectableFilteredDeliveryChallanIds = useMemo(
    () => filteredDeliveryChallansForSelection.map((challan) => String(challan.id)),
    [filteredDeliveryChallansForSelection]
  );

  const selectableFilteredReallocationIds = useMemo(
    () => filteredReallocationsForSelection.map((record) => String(record.id)),
    [filteredReallocationsForSelection]
  );

  const allFilteredDeliveryChallansSelected = useMemo(() => {
    if (!selectableFilteredDeliveryChallanIds.length) {
      return false;
    }
    return selectableFilteredDeliveryChallanIds.every((challanId) =>
      selectedDeliveryChallanIds.includes(challanId)
    );
  }, [selectableFilteredDeliveryChallanIds, selectedDeliveryChallanIds]);

  const allFilteredReallocationsSelected = useMemo(() => {
    if (!selectableFilteredReallocationIds.length) {
      return false;
    }
    return selectableFilteredReallocationIds.every((recordId) =>
      selectedReallocationIds.includes(recordId)
    );
  }, [selectableFilteredReallocationIds, selectedReallocationIds]);

  const allSelectableRows = useMemo(
    () => itemRows.filter((row) => row.maxAvailableQty > 0),
    [itemRows]
  );

  const isAllChecked = useMemo(() => {
    if (!allSelectableRows.length) {
      return false;
    }
    return allSelectableRows.every((row) => row.selected);
  }, [allSelectableRows]);

  const selectedRows = useMemo(
    () =>
      itemRows.filter((row) => row.selected && Math.max(toNumber(row.consumeQty), 0) > 0),
    [itemRows]
  );

  const totalToConsume = useMemo(
    () => selectedRows.reduce((sum, row) => sum + Math.max(toNumber(row.consumeQty), 0), 0),
    [selectedRows]
  );

  const getChallanItemCount = (challan = {}) =>
    Array.isArray(challan.items) ? challan.items.length : 0;

  const getChallanTotalQuantity = (challan = {}) =>
    (Array.isArray(challan.items) ? challan.items : []).reduce(
      (sum, item) => sum + Math.max(toNumber(item.quantity ?? item.Quantity), 0),
      0
    );

  const getChallanAvailableQuantity = useCallback(
    (challan = {}) => {
      const challanId = String(challan.id ?? challan.deliveryChallanId ?? "");
      if (!challanId) {
        return 0;
      }
      return availableInventory.reduce((sum, row) => {
        const isDcRow = normalizeText(row.sourceType) === "dc";
        const rowChallanId = String(row.deliveryChallanId ?? "");
        return isDcRow && rowChallanId === challanId
          ? sum + Math.max(toNumber(row.availableQty), 0)
          : sum;
      }, 0);
    },
    [availableInventory]
  );

  const getChallanLocationLabel = (challan = {}, type = "to") => {
    const id =
      type === "from"
        ? challan.fromLocationId ?? challan.FromLocationId
        : challan.toLocationId ?? challan.ToLocationId;
    const fallback =
      type === "from"
        ? challan.fromLocation ?? challan.FromLocation
        : challan.toLocation ?? challan.ToLocation;
    return locationMap[String(id)]?.name || fallback || "-";
  };

  const getReallocationItemCount = (record = {}) =>
    Array.isArray(record.items) ? record.items.length : 0;

  const getReallocationTotalQuantity = (record = {}) =>
    (Array.isArray(record.items) ? record.items : []).reduce(
      (sum, item) => sum + Math.max(toNumber(item.quantity ?? item.Quantity), 0),
      0
    );

  const getReallocationLocationLabel = (record = {}, type = "to") => {
    const id =
      type === "from"
        ? record.fromLocationId ?? record.FromLocationId
        : record.toLocationId ?? record.ToLocationId;
    return locationMap[String(id)]?.name || "-";
  };

  const selectedDeliveryChallansSummary = useMemo(
    () => ({
      challans: selectedDeliveryChallans.length,
      items: selectedDeliveryChallans.reduce(
        (sum, challan) => sum + getChallanItemCount(challan),
        0
      ),
      quantity: selectedDeliveryChallans.reduce(
        (sum, challan) => sum + getChallanTotalQuantity(challan),
        0
      ),
      availableQuantity: selectedDeliveryChallans.reduce(
        (sum, challan) => sum + getChallanAvailableQuantity(challan),
        0
      ),
    }),
    [getChallanAvailableQuantity, selectedDeliveryChallans]
  );

  const selectedReallocationsSummary = useMemo(
    () => ({
      records: selectedReallocations.length,
      items: selectedReallocations.reduce(
        (sum, record) => sum + getReallocationItemCount(record),
        0
      ),
      quantity: selectedReallocations.reduce(
        (sum, record) => sum + getReallocationTotalQuantity(record),
        0
      ),
      availableQuantity: selectedReallocations.reduce(
        (sum, record) => sum + getReallocationAvailableQuantity(record),
        0
      ),
    }),
    [getReallocationAvailableQuantity, selectedReallocations]
  );

  const totalEntries = consumptions.length;

  const totalConsumedQuantity = useMemo(
    () =>
      consumptions.reduce(
        (sum, consumption) =>
          sum +
          (consumption.items || []).reduce(
            (itemSum, item) => itemSum + Math.max(toNumber(item.quantity), 0),
            0
          ),
        0
      ),
    [consumptions]
  );

  const todayConsumedQuantity = useMemo(() => {
    const today = new Date();
    return consumptions.reduce((sum, consumption) => {
      const consumptionDate = parseDateOnly(consumption.consumptionDate ?? consumption.createdAt);
      if (!isSameDay(today, consumptionDate)) {
        return sum;
      }
      return (
        sum +
        (consumption.items || []).reduce(
          (itemSum, item) => itemSum + Math.max(toNumber(item.quantity), 0),
          0
        )
      );
    }, 0);
  }, [consumptions]);

  const monthConsumedQuantity = useMemo(() => {
    const now = new Date();
    return consumptions.reduce((sum, consumption) => {
      const date = parseDateOnly(consumption.consumptionDate ?? consumption.createdAt);
      if (!date) {
        return sum;
      }
      if (
        date.getMonth() !== now.getMonth() ||
        date.getFullYear() !== now.getFullYear()
      ) {
        return sum;
      }
      return (
        sum +
        (consumption.items || []).reduce(
          (itemSum, item) => itemSum + Math.max(toNumber(item.quantity), 0),
          0
        )
      );
    }, 0);
  }, [consumptions]);

  const sortedRecords = useMemo(() => {
    return [...consumptions].sort((left, right) => {
      const leftDate =
        parseDateOnly(left.updatedAt ?? left.consumptionDate ?? left.createdAt)?.getTime() ??
        0;
      const rightDate =
        parseDateOnly(right.updatedAt ?? right.consumptionDate ?? right.createdAt)?.getTime() ??
        0;
      return rightDate - leftDate;
    });
  }, [consumptions]);

  const visibleRecords = useMemo(() => {
    const keyword = normalizeText(query);
    return sortedRecords.filter((record) => {
      const rowStatus = normalizeText(record.status || "Logged");
      if (statusFilter !== "all" && rowStatus !== normalizeText(statusFilter)) {
        return false;
      }

      if (!keyword) {
        return true;
      }

      const resolvedProjectId = resolveConsumptionProjectId(
        record,
        deliveryChallanMap
      );
      const projectName = projectMap[String(resolvedProjectId)]?.name || "";
      const locationName = locationMap[String(record.locationId)]?.name || "";
      const challanRef =
        deliveryChallanMap[String(record.deliveryChallanId)]?.dcNumber ||
        record.deliveryChallanRef ||
        "";

      const haystack = [
        record.consumptionNumber,
        projectName,
        locationName,
        challanRef,
        record.status,
      ]
        .join(" ")
        .toLowerCase();

      return haystack.includes(keyword);
    });
  }, [
    deliveryChallanMap,
    locationMap,
    projectMap,
    query,
    sortedRecords,
    statusFilter,
  ]);

  const consumptionRegisterMetrics = useMemo(() => {
    const metricsByRecordId = new Map();

    sortedRecords.forEach((record) => {
      const itemMetrics = (record.items || []).map((item, index) => {
        const sourceKey = buildRecordItemSourceKey(item, record.deliveryChallanId);
        const consumedQty = Math.max(toNumber(item.quantity), 0);
        const persistedBalance = [
          item.remainingQty,
          item.remainingAvailableQty,
          item.availableQty,
          item.balanceQty,
        ].find(hasQuantityValue);
        const sourceQty = Math.max(
          toNumber(
            hasQuantityValue(item.sourceQty)
              ? item.sourceQty
              : sourceQtyByKey.get(sourceKey)
          ),
          consumedQty
        );
        const totalConsumedQty = Math.max(
          toNumber(
            hasQuantityValue(item.totalConsumedQty)
              ? item.totalConsumedQty
              : consumedQty
          ),
          consumedQty
        );
        const availableBalance = hasQuantityValue(persistedBalance)
          ? Math.max(toNumber(persistedBalance), 0)
          : Math.max(sourceQty - totalConsumedQty, 0);

        return {
          key: item.id ?? `${record.id ?? "record"}:${index}`,
          consumedQty,
          availableBalance,
        };
      });

      metricsByRecordId.set(String(record.id ?? record.consumptionId ?? ""), {
        totalConsumedQty: itemMetrics.reduce(
          (sum, item) => sum + item.consumedQty,
          0
        ),
        totalAvailableBalance: itemMetrics.reduce(
          (sum, item) => sum + item.availableBalance,
          0
        ),
        itemMetrics,
      });
    });

    return metricsByRecordId;
  }, [
    sortedRecords,
    sourceQtyByKey,
  ]);

  const getRecordSourceReference = useCallback(
    (record = {}) => {
      const itemReferences = (record.items || [])
        .map((item) => String(item.sourceRef || item.deliveryChallanRef || "").trim())
        .filter(Boolean);
      const references = Array.from(new Set(itemReferences));
      if (references.length) {
        return references.join(", ");
      }
      return (
        deliveryChallanMap[String(record.deliveryChallanId)]?.dcNumber ||
        record.deliveryChallanRef ||
        "-"
      );
    },
    [deliveryChallanMap]
  );

  const clearError = (name) => {
    setErrors((prev) => {
      if (!prev[name]) {
        return prev;
      }
      const next = { ...prev };
      delete next[name];
      return next;
    });
  };

  const onProjectChange = (projectId) => {
    setForm((prev) => ({
      ...prev,
      projectId,
      fromLocationId: "",
      locationId: "",
      deliveryChallanId: "",
      deliveryChallanRef: "",
    }));
    setItemRows([]);
    setSelectedDeliveryChallanIds([]);
    setSelectedReallocationIds([]);
    setLoadedDeliveryChallanIds([]);
    setDeliveryChallanFilter("");
    setAvailableInventory([]);
    setInventoryError("");
    clearError("projectId");
    clearError("fromLocationId");
    clearError("locationId");
    clearError("deliveryChallanId");
  };

  const onFromLocationChange = (fromLocationId) => {
    setForm((prev) => ({
      ...prev,
      fromLocationId,
      deliveryChallanId: "",
      deliveryChallanRef: "",
    }));
    setItemRows([]);
    setSelectedDeliveryChallanIds([]);
    setSelectedReallocationIds([]);
    setLoadedDeliveryChallanIds([]);
    clearError("fromLocationId");
    clearError("items");
  };

  const onLocationChange = (locationId) => {
    setForm((prev) => ({
      ...prev,
      fromLocationId: prev.fromLocationId || locationId,
      locationId,
      deliveryChallanId: "",
      deliveryChallanRef: "",
    }));
    setItemRows([]);
    setSelectedDeliveryChallanIds([]);
    setSelectedReallocationIds([]);
    setLoadedDeliveryChallanIds([]);
    clearError("fromLocationId");
    clearError("locationId");
    clearError("items");
  };

  const handleLookupSourceChange = (nextLookupSource) => {
    const normalizedSource = normalizeLookupSource(nextLookupSource);
    setLookupSource(normalizedSource);
    setSelectedDeliveryChallanIds([]);
    setSelectedReallocationIds([]);
    setLoadedDeliveryChallanIds([]);
    setItemRows(
      buildRowsFromAvailableInventory({
        rows: availableInventory,
        editingConsumption,
      })
    );
    setForm((prev) => ({
      ...prev,
      deliveryChallanId: "",
      deliveryChallanRef: "",
    }));
    clearError("deliveryChallanId");
    clearError("items");
  };

  const toggleDeliveryChallanSelection = (deliveryChallanId) => {
    const id = String(deliveryChallanId);
    if (!deliveryChallanMap[id]) {
      return;
    }
    setSelectedDeliveryChallanIds((prev) =>
      prev.includes(id) ? prev.filter((value) => value !== id) : [...prev, id]
    );
    clearError("deliveryChallanId");
  };

  const toggleAllFilteredDeliveryChallans = () => {
    if (!selectableFilteredDeliveryChallanIds.length) {
      return;
    }
    setSelectedDeliveryChallanIds((prev) => {
      const allSelected = selectableFilteredDeliveryChallanIds.every((id) =>
        prev.includes(id)
      );
      if (allSelected) {
        return prev.filter((id) => !selectableFilteredDeliveryChallanIds.includes(id));
      }
      return Array.from(new Set([...prev, ...selectableFilteredDeliveryChallanIds]));
    });
    clearError("deliveryChallanId");
  };

  const toggleReallocationSelection = (recordId) => {
    const id = String(recordId);
    if (!reallocationMap[id]) {
      return;
    }
    setSelectedReallocationIds((prev) =>
      prev.includes(id) ? prev.filter((value) => value !== id) : [...prev, id]
    );
    clearError("deliveryChallanId");
  };

  const toggleAllFilteredReallocations = () => {
    if (!selectableFilteredReallocationIds.length) {
      return;
    }
    setSelectedReallocationIds((prev) => {
      const allSelected = selectableFilteredReallocationIds.every((id) =>
        prev.includes(id)
      );
      if (allSelected) {
        return prev.filter((id) => !selectableFilteredReallocationIds.includes(id));
      }
      return Array.from(new Set([...prev, ...selectableFilteredReallocationIds]));
    });
    clearError("deliveryChallanId");
  };

  const clearDeliveryChallanSelection = () => {
    setSelectedDeliveryChallanIds([]);
    setSelectedReallocationIds([]);
    setLoadedDeliveryChallanIds([]);
    setItemRows(
      buildRowsFromAvailableInventory({
        rows: availableInventory,
        editingConsumption,
      })
    );
    setForm((prev) => ({
      ...prev,
      deliveryChallanId: "",
      deliveryChallanRef: "",
    }));
    clearError("deliveryChallanId");
    clearError("items");
  };

  const handleLoadSelectedDeliveryChallans = async () => {
    if (!selectedDeliveryChallans.length) {
      clearDeliveryChallanSelection();
      return;
    }

    const challanLocationIds = Array.from(
      new Set(
        selectedDeliveryChallans
          .map((challan) => String(challan.toLocationId ?? "").trim())
          .filter(Boolean)
      )
    );

    if (challanLocationIds.length !== 1) {
      setErrors((prev) => ({
        ...prev,
        items: "Select delivery challans from the same destination location.",
      }));
      return;
    }

    const challanLocationId = challanLocationIds[0];
    const selectedProjectId =
      String(
        selectedDeliveryChallans[0]?.projectId ?? form.projectId ?? ""
      ).trim();

    const inventoryRows =
      String(form.fromLocationId || form.locationId || "").trim() === challanLocationId
        ? availableInventory
        : await loadAvailableInventoryForLocation({
            projectId: selectedProjectId,
            locationId: challanLocationId,
            preserveRows: true,
          });

    const loadedIds = selectedDeliveryChallans.map((challan) => String(challan.id));
    const loadedIdSet = new Set(loadedIds);
    const filteredInventoryRows = inventoryRows.filter((row) => {
      const isDcRow = normalizeText(row.sourceType) === "dc";
      return isDcRow && loadedIdSet.has(String(row.deliveryChallanId ?? ""));
    });
    const nextRows = buildRowsFromAvailableInventory({
      rows: filteredInventoryRows,
      editingConsumption,
      autoSelectAvailable: true,
    });

    if (!nextRows.length || !nextRows.some((row) => row.maxAvailableQty > 0)) {
      setErrors((prev) => ({
        ...prev,
        items:
          "Selected delivery challans do not have remaining inventory for this location.",
      }));
      return;
    }

    const primaryChallan = selectedDeliveryChallans[0];
    setLoadedDeliveryChallanIds(loadedIds);
    setItemRows(nextRows);
    setForm((prev) => ({
      ...prev,
      projectId: primaryChallan.projectId ? String(primaryChallan.projectId) : prev.projectId,
      fromLocationId: challanLocationId || prev.fromLocationId,
      deliveryChallanId: primaryChallan.id ? String(primaryChallan.id) : "",
      deliveryChallanRef: selectedDeliveryChallans
        .map((challan) => challan.dcNumber)
        .filter(Boolean)
        .join(", "),
    }));
    clearError("locationId");
    clearError("deliveryChallanId");
    clearError("items");
  };

  const handleLoadSelectedReallocations = async () => {
    if (!selectedReallocations.length) {
      clearDeliveryChallanSelection();
      return;
    }

    const sourceLocationIds = Array.from(
      new Set(
        selectedReallocations
          .map((record) => String(record.toLocationId ?? "").trim())
          .filter(Boolean)
      )
    );

    if (sourceLocationIds.length !== 1) {
      setErrors((prev) => ({
        ...prev,
        items: "Select reallocation records from the same source location.",
      }));
      return;
    }

    const sourceLocationId = sourceLocationIds[0];
    const selectedProjectId = String(
      selectedReallocations[0]?.projectId ?? form.projectId ?? ""
    ).trim();

    const inventoryRows =
      String(form.fromLocationId || form.locationId || "").trim() === sourceLocationId
        ? availableInventory
        : await loadAvailableInventoryForLocation({
            projectId: selectedProjectId,
            locationId: sourceLocationId,
            preserveRows: true,
          });

    const loadedIds = selectedReallocations.map((record) => String(record.id));
    const selectedReferenceCandidates = new Set(
      selectedReallocations.flatMap((record) => getReallocationReferenceCandidates(record))
    );
    const filteredInventoryRows = inventoryRows.filter(
      (row) =>
        isReallocationSource(row.sourceType) &&
        selectedReferenceCandidates.has(normalizeText(row.sourceRef))
    );
    const nextRows = buildRowsFromAvailableInventory({
      rows: filteredInventoryRows,
      editingConsumption,
      autoSelectAvailable: true,
    });

    if (!nextRows.length || !nextRows.some((row) => row.maxAvailableQty > 0)) {
      setErrors((prev) => ({
        ...prev,
        items:
          "Selected reallocation records do not have remaining inventory for this source location.",
      }));
      return;
    }

    setLoadedDeliveryChallanIds(loadedIds);
    setItemRows(nextRows);
    setForm((prev) => ({
      ...prev,
      projectId: selectedProjectId || prev.projectId,
      fromLocationId: sourceLocationId || prev.fromLocationId,
      deliveryChallanId: "",
      deliveryChallanRef: selectedReallocations
        .map((record) => getReallocationReference(record))
        .filter(Boolean)
        .join(", "),
    }));
    clearError("locationId");
    clearError("deliveryChallanId");
    clearError("items");
  };

  const onToggleAllRows = (checked) => {
    setItemRows((prevRows) =>
      prevRows.map((row) => {
        if (row.maxAvailableQty <= 0) {
          return buildConsumptionRowState(row, {
            requestedQty: "",
            selected: false,
          });
        }
        if (!checked) {
          return buildConsumptionRowState(row, {
            requestedQty: "",
            selected: false,
          });
        }
        const nextQty =
          row.consumeQty && toNumber(row.consumeQty) > 0
            ? clampQuantityText(row.consumeQty)
            : formatQuantityInputText(row.maxAvailableQty);
        return buildConsumptionRowState(row, {
          requestedQty: nextQty ?? row.consumeQty,
          selected: true,
        });
      })
    );
    clearError("items");
  };

  const onToggleRow = (rowId, checked) => {
    setItemRows((prevRows) =>
      prevRows.map((row) => {
        if (row.rowId !== rowId) {
          return row;
        }

        if (!checked) {
          return buildConsumptionRowState(row, {
            requestedQty: "",
            selected: false,
          });
        }

        const fallbackQty = clampQuantityText(String(row.maxAvailableQty));
        return buildConsumptionRowState(row, {
          requestedQty:
            row.consumeQty && toNumber(row.consumeQty) > 0
              ? row.consumeQty
              : fallbackQty ?? row.consumeQty,
          selected: true,
        });
      })
    );
    clearError("items");
  };

  const onConsumeQtyChange = (rowId, rawValue) => {
    setItemRows((prevRows) =>
      prevRows.map((row) => {
        if (row.rowId !== rowId) {
          return row;
        }

        const nextValue = clampQuantityText(rawValue);
        if (nextValue === null) {
          return row;
        }

        const numeric = clampRequestedQuantity(nextValue, row.maxAvailableQty);
        return buildConsumptionRowState(row, {
          requestedQty: numeric,
          selected: numeric > 0,
        });
      })
    );
    clearError("items");
  };

  const onConsumeQtyStep = (rowId, direction) => {
    setItemRows((prevRows) =>
      prevRows.map((row) => {
        if (row.rowId !== rowId) {
          return row;
        }

        const step = 1;
        const current = Math.max(toNumber(row.consumeQty), 0);
        const next = clampRequestedQuantity(
          current + direction * step,
          row.maxAvailableQty
        );
        return buildConsumptionRowState(row, {
          requestedQty: next,
          selected: next > 0,
        });
      })
    );
    clearError("items");
  };

  const getRowConsumeQtyError = (row) => {
    if (!row.selected) {
      return "";
    }
    const requested = Math.max(toNumber(row.consumeQty), 0);
    if (!requested) {
      return "Enter consume quantity.";
    }
    if (requested > Math.max(toNumber(row.maxAvailableQty), 0)) {
      return `Cannot exceed available quantity (${formatQty(row.maxAvailableQty)}).`;
    }
    return "";
  };

  const validate = () => {
    const nextErrors = {};

    if (!String(form.consumptionNumber || "").trim()) {
      nextErrors.consumptionNumber = "Consumption reference is required.";
    }
    if (!String(form.projectId || "").trim()) {
      nextErrors.projectId = "Project is required.";
    }
    if (!String(form.fromLocationId || "").trim()) {
      nextErrors.fromLocationId = "Source location is required.";
    }
    if (!String(form.locationId || "").trim()) {
      nextErrors.locationId = "Destination location is required.";
    }
    if (!String(form.consumptionDate || "").trim()) {
      nextErrors.consumptionDate = "Consumption date is required.";
    }
    if (!String(form.issuedBy || "").trim()) {
      nextErrors.issuedBy = "Issued by is required.";
    }

    const chosen = itemRows.filter((row) => row.selected);
    if (!chosen.length) {
      nextErrors.items = "Select at least one available inventory item.";
    } else {
      const invalidRow = chosen.find((row) => {
        const requested = Math.max(toNumber(row.consumeQty), 0);
        return (
          requested <= 0 ||
          requested > Math.max(toNumber(row.maxAvailableQty), 0)
        );
      });

      if (invalidRow) {
        const requested = Math.max(toNumber(invalidRow.consumeQty), 0);
        nextErrors.items =
          requested > Math.max(toNumber(invalidRow.maxAvailableQty), 0)
            ? `Consume quantity for ${invalidRow.name || "the selected item"} cannot exceed available quantity (${formatQty(
                invalidRow.maxAvailableQty
              )}).`
            : `Enter a valid consume quantity for ${invalidRow.name || "the selected item"}.`;
      }
    }

    setErrors(nextErrors);
    return !Object.keys(nextErrors).length;
  };

  const buildPayload = () => {
    const selectedItems = itemRows
      .filter((row) => row.selected)
      .map((row) => ({
        boqItemId:
          toNullableInt(row.boqItemId) ??
          toNullableInt(row.itemId) ??
          null,
        itemId:
          toNullableInt(row.itemId) ??
          toNullableInt(row.boqItemId) ??
          toNullableInt(row.receiveGoodsItemId) ??
          null,
        receiveGoodsId: toNullableInt(row.receiveGoodsId),
        deliveryChallanId: toNullableInt(row.deliveryChallanId),
        deliveryChallanItemId: toNullableInt(row.deliveryChallanItemId),
        deliveryChallanRef: row.deliveryChallanRef || "",
        receiveGoodsItemId: toNullableInt(row.receiveGoodsItemId),
        sourceType: row.sourceType || "",
        sourceKey: row.sourceKey || "",
        name: row.name,
        description: row.description || "",
        unit: row.unit || "PCS",
        hsn: row.hsn || "",
        gst: row.gst || "",
        quantity: Math.max(toNumber(row.consumeQty), 0),
        consumeQty: Math.max(toNumber(row.consumeQty), 0),
        rate: Math.max(toNumber(row.rate), 0),
        notes: row.notes || "",
      }))
      .filter((item) => item.name && item.quantity > 0);
    const selectedDeliveryChallanIdsForPayload = Array.from(
      new Set(
        selectedItems
          .map((item) => toNullableInt(item.deliveryChallanId))
          .filter((id) => id !== null)
      )
    );
    const selectedDeliveryChallanRefsForPayload = Array.from(
      new Set(
        itemRows
          .filter((row) => row.selected && row.sourceType === "dc")
          .map((row) => row.sourceRef || row.deliveryChallanRef)
          .filter(Boolean)
      )
    );

    return {
      consumptionNumber: String(form.consumptionNumber || "").trim(),
      projectId: toNullableInt(form.projectId),
      fromLocationId: toNullableInt(form.fromLocationId) ?? toNullableInt(form.locationId),
      locationId: toNullableInt(form.locationId),
      deliveryChallanId:
        selectedDeliveryChallanIdsForPayload[0] ?? toNullableInt(form.deliveryChallanId),
      deliveryChallanIds: selectedDeliveryChallanIdsForPayload,
      deliveryChallanRef:
        selectedDeliveryChallanRefsForPayload.join(", ") ||
        String(form.deliveryChallanRef || "").trim(),
      consumptionDate: form.consumptionDate || null,
      issuedBy: String(form.issuedBy || "").trim(),
      status: String(form.status || "Logged").trim() || "Logged",
      notes: String(form.notes || "").trim(),
      companyAddress: String(form.companyAddress || "").trim(),
      companyGstin: String(form.companyGstin || "").trim(),
      companyPhone: String(form.companyPhone || "").trim(),
      companyEmail: String(form.companyEmail || "").trim(),
      items: selectedItems,
    };
  };

  const onSubmit = async (event) => {
    event.preventDefault();
    setFeedback({ type: "", message: "" });

    if (!validate()) {
      return;
    }

    const payload = buildPayload();
    const availabilityScope = {
      projectId: payload.projectId,
      locationId: payload.fromLocationId ?? payload.locationId,
      destinationLocationId: payload.locationId,
    };

    setSaving(true);
    try {
      if (editingId) {
        await updateConsumption(editingId, payload);
      } else {
        await createConsumption(payload);
      }

      const [latest] = await Promise.all([
        loadAll(),
        loadAvailableInventoryForLocation({
          ...availabilityScope,
          preserveRows: true,
          // After persistence the saved consumption must be included in the balance.
          excludeConsumptionId: null,
        }),
      ]);
      const wasEditing = Boolean(editingId);
      resetForm({ nextRecords: latest?.consumptions ?? [] });
      setFeedback({
        type: "success",
        message: wasEditing
          ? "Consumption entry updated successfully."
          : "Consumption entry saved successfully.",
      });
    } catch (error) {
      setFeedback({
        type: "error",
        message:
          error?.response?.data?.error ||
          error?.message ||
          "Failed to save consumption entry.",
      });
    } finally {
      setSaving(false);
    }
  };

  const onEdit = (record) => {
    const recordChallanIds = Array.isArray(record.deliveryChallanIds)
      ? record.deliveryChallanIds.map((id) => String(id))
      : record.deliveryChallanId
      ? [String(record.deliveryChallanId)]
      : [];
    const recordChallanRefs = String(record.deliveryChallanRef || "")
      .split(",")
      .map((value) => normalizeText(value))
      .filter(Boolean);
    const linkedChallans = deliveryChallans.filter((challan) => {
      const id = String(challan.id);
      const ref = normalizeText(challan.dcNumber);
      return recordChallanIds.includes(id) || recordChallanRefs.includes(ref);
    });
    const linkedChallan = linkedChallans[0] ?? null;
    const linkedReallocation =
      linkedReallocationByConsumptionId[String(record.id ?? record.consumptionId ?? "")] ??
      null;
    const nextLookupSource =
      linkedReallocation ||
      (record.items || []).some((item) => isReallocationSource(item.sourceType))
        ? LOOKUP_SOURCE.REALLOCATION
        : LOOKUP_SOURCE.DC;

    setEditingId(record.id);
    setEditingConsumption(record);
    setLookupSource(nextLookupSource);
    setErrors({});
    setFeedback({ type: "", message: "" });

    const nextProjectId =
      linkedChallan?.projectId ??
      resolveConsumptionProjectId(record, deliveryChallanMap) ??
      form.projectId ??
      "";
    const nextLocationId =
      record.locationId ??
      linkedChallan?.toLocationId ??
      linkedChallan?.locationId ??
      "";
    const nextFromLocationId =
      record.fromLocationId ??
      linkedReallocation?.fromLocationId ??
      linkedChallan?.toLocationId ??
      nextLocationId;

    setForm((prev) => ({
      ...prev,
      consumptionNumber: record.consumptionNumber || prev.consumptionNumber,
      projectId: nextProjectId ? String(nextProjectId) : "",
      fromLocationId: nextFromLocationId ? String(nextFromLocationId) : "",
      locationId: nextLocationId ? String(nextLocationId) : "",
      deliveryChallanId: linkedChallan ? String(linkedChallan.id) : "",
      deliveryChallanRef:
        linkedChallans.length
          ? linkedChallans.map((challan) => challan.dcNumber).filter(Boolean).join(", ")
          : record.deliveryChallanRef || prev.deliveryChallanRef,
      consumptionDate:
        String(record.consumptionDate || "").slice(0, 10) || prev.consumptionDate,
      issuedBy: record.issuedBy || prev.issuedBy,
      status: record.status || prev.status,
      notes: record.notes || "",
      companyAddress:
        record.companyAddress || prev.companyAddress || company.address || "",
      companyGstin:
        record.companyGstin || prev.companyGstin || company.gstin || "",
      companyPhone: record.companyPhone || prev.companyPhone || company.phone || "",
      companyEmail: record.companyEmail || prev.companyEmail || company.email || "",
    }));

    if (linkedChallans.length) {
      const ids = linkedChallans.map((challan) => String(challan.id));
      setSelectedDeliveryChallanIds(ids);
      setSelectedReallocationIds([]);
      setLoadedDeliveryChallanIds(ids);
      const rows = linkedChallans.flatMap((challan, challanIndex) =>
        buildRowsFromSelectedChallan({
          challan,
          consumptions,
          editingConsumption: record,
        }).map((row) => ({
          ...row,
          rowId: `${challan.id}-${row.rowId}`,
          sourceType: "dc",
          sourceKey:
            row.sourceKey ||
            buildRecordItemSourceKey(
              {
                ...row,
                deliveryChallanId: challan.id,
              },
              challan.id
            ),
          sourceRef: challan.dcNumber || "",
          deliveryChallanId: toNullableInt(challan.id),
          deliveryChallanRef: challan.dcNumber || "",
          sourceDcNumber: challan.dcNumber || `DC ${challanIndex + 1}`,
        }))
      );
      setItemRows(rows);
      return;
    }

    setSelectedDeliveryChallanIds([]);
    setSelectedReallocationIds(
      linkedReallocation?.id ? [String(linkedReallocation.id)] : []
    );
    setLoadedDeliveryChallanIds([]);

    const fallbackRows = (record.items || []).map((item, index) => {
      const consumed = Math.max(toNumber(item.quantity), 0);
      const totalConsumed = Math.max(
        toNumber(item.totalConsumedQty ?? item.consumedQty ?? consumed),
        consumed
      );
      const sourceQty = Math.max(toNumber(item.sourceQty), totalConsumed);
      const persistedRemaining = [
        item.remainingQty,
        item.remainingAvailableQty,
        item.availableQty,
        item.balanceQty,
      ].find(hasQuantityValue);
      const remainingQty = hasQuantityValue(persistedRemaining)
        ? Math.max(toNumber(persistedRemaining), 0)
        : Math.max(sourceQty - totalConsumed, 0);
      return buildConsumptionRowState({
        rowId: `edit-${index}-${item.id ?? item.name ?? "row"}`,
        index,
        boqItemId: toNullableInt(item.boqItemId),
        itemId: toNullableInt(item.itemId),
        receiveGoodsItemId: toNullableInt(item.receiveGoodsItemId),
        deliveryChallanId: toNullableInt(item.deliveryChallanId),
        deliveryChallanItemId: toNullableInt(item.deliveryChallanItemId),
        deliveryChallanRef: item.deliveryChallanRef || record.deliveryChallanRef || "",
        sourceType: item.sourceType || "",
        sourceKey: item.sourceKey || "",
        sourceRef: item.deliveryChallanRef || record.deliveryChallanRef || "",
        name: item.name || "",
        description: item.description || "",
        unit: item.unit || "PCS",
        hsn: item.hsn || "",
        gst: item.gst || "",
        rate: Math.max(toNumber(item.rate), 0),
        notes: item.notes || "",
        sourceQty,
        dcQty: sourceQty,
        consumedQty: totalConsumed,
        previouslyConsumed: totalConsumed,
        adjustedQty: Math.max(toNumber(item.adjustedQty), 0),
        availableQty: remainingQty,
        remainingAvailableQty: remainingQty,
        remainingQty,
        selected: consumed > 0,
        consumeQty: consumed > 0 ? String(consumed) : "",
      });
    });
    setItemRows(fallbackRows);
  };

  const onView = (record) => {
    setViewRecord(record || null);
  };

  const onDelete = async (record) => {
    const ok = window.confirm(
      `Delete consumption ${record.consumptionNumber || "entry"}?`
    );
    if (!ok) {
      return;
    }

    try {
      await deleteConsumption(record.id);
      const latest = await loadAll();
      if (form.projectId && (form.fromLocationId || form.locationId)) {
        await loadAvailableInventoryForLocation({
          projectId: form.projectId,
          locationId: form.fromLocationId || form.locationId,
        });
      }

      if (editingId && String(editingId) === String(record.id)) {
        resetForm({ nextRecords: latest?.consumptions ?? [] });
      }

      setFeedback({ type: "success", message: "Consumption deleted successfully." });
    } catch (error) {
      setFeedback({
        type: "error",
        message:
          error?.response?.data?.error ||
          error?.message ||
          "Failed to delete consumption entry.",
      });
    }
  };

  return (
    <div className="space-y-6">
      <section className="flex flex-wrap justify-end gap-2">
        <button
          type="button"
          onClick={() => navigate("/inventory/delivery-challan")}
          className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:border-violet-200 hover:text-violet-700"
        >
          DC Option
        </button>
      </section>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <article className={`${panel} p-5`}>
          <p className="text-sm font-medium text-slate-500">Total Entries</p>
          <p className="mt-1 text-4xl font-bold text-slate-800">{totalEntries}</p>
        </article>

        <article className={`${panel} p-5`}>
          <p className="text-sm font-medium text-slate-500">Total Consumed Qty</p>
          <p className="mt-1 text-4xl font-bold text-slate-800">
            {formatQty(totalConsumedQuantity)}
          </p>
        </article>

        <article className={`${panel} p-5`}>
          <p className="text-sm font-medium text-slate-500">This Month</p>
          <p className="mt-1 text-4xl font-bold text-slate-800">
            {formatQty(monthConsumedQuantity)}
          </p>
        </article>

        <article className={`${panel} p-5`}>
          <p className="text-sm font-medium text-slate-500">Today</p>
          <p className="mt-1 text-4xl font-bold text-slate-800">
            {formatQty(todayConsumedQuantity)}
          </p>
        </article>
      </section>

      <form onSubmit={onSubmit} className="space-y-5">
        <section className={panel}>
          <div className="border-b border-slate-200 px-6 py-4">
            <h2 className="text-2xl font-semibold text-violet-800">Consumption Details</h2>
          </div>

          <div className="grid grid-cols-1 gap-4 px-6 py-5 md:grid-cols-3">
            <label>
              <span className="text-sm font-semibold text-slate-700">
                Consumption Ref <span className="text-red-600">*</span>
              </span>
              <input
                className={field}
                value={form.consumptionNumber}
                onChange={(event) => {
                  setForm((prev) => ({
                    ...prev,
                    consumptionNumber: event.target.value,
                  }));
                  clearError("consumptionNumber");
                }}
                placeholder="CON-2026-001"
              />
              {errors.consumptionNumber && (
                <p className="mt-1 text-xs text-red-600">{errors.consumptionNumber}</p>
              )}
            </label>

            <label>
              <span className="text-sm font-semibold text-slate-700">
                Project <span className="text-red-600">*</span>
              </span>
              <select
                className={field}
                value={form.projectId}
                onChange={(event) => onProjectChange(event.target.value)}
              >
                <option value="">Select project</option>
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </select>
              {errors.projectId && (
                <p className="mt-1 text-xs text-red-600">{errors.projectId}</p>
              )}
            </label>

            <label>
              <span className="text-sm font-semibold text-slate-700">
                Consumption Date <span className="text-red-600">*</span>
              </span>
              <DateInput
                className={field}
                value={form.consumptionDate}
                onChange={(nextValue) => {
                  setForm((prev) => ({ ...prev, consumptionDate: nextValue }));
                  clearError("consumptionDate");
                }}
              />
              {errors.consumptionDate && (
                <p className="mt-1 text-xs text-red-600">{errors.consumptionDate}</p>
              )}
            </label>

            <label>
              <span className="text-sm font-semibold text-slate-700">
                Issued By <span className="text-red-600">*</span>
              </span>
              <select
                className={field}
                value={form.issuedBy}
                onChange={(event) => {
                  setForm((prev) => ({ ...prev, issuedBy: event.target.value }));
                  clearError("issuedBy");
                }}
              >
                {issuedByOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
              {errors.issuedBy && (
                <p className="mt-1 text-xs text-red-600">{errors.issuedBy}</p>
              )}
            </label>

            <label>
              <span className="text-sm font-semibold text-slate-700">Status</span>
              <select
                className={field}
                value={form.status}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, status: event.target.value }))
                }
              >
                {statusOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>

            <label>
              <span className="text-sm font-semibold text-slate-700">
                Source Location <span className="text-red-600">*</span>
              </span>
              <select
                className={field}
                value={form.fromLocationId}
                onChange={(event) => onFromLocationChange(event.target.value)}
                disabled={!form.projectId}
              >
                <option value="">
                  {form.projectId ? "Select source location" : "Select project first"}
                </option>
                {selectedProjectLocations.map((location) => (
                  <option key={location.id} value={location.id}>
                    {location.name}
                  </option>
                ))}
              </select>
              {errors.fromLocationId && (
                <p className="mt-1 text-xs text-red-600">{errors.fromLocationId}</p>
              )}
            </label>

            <label>
              <span className="text-sm font-semibold text-slate-700">
                Destination / Consumption Location <span className="text-red-600">*</span>
              </span>
              <select
                className={field}
                value={form.locationId}
                onChange={(event) => onLocationChange(event.target.value)}
                disabled={!form.projectId}
              >
                <option value="">
                  {form.projectId ? "Select destination location" : "Select project first"}
                </option>
                {selectedProjectLocations.map((location) => (
                  <option key={location.id} value={location.id}>
                    {location.name}
                  </option>
                ))}
              </select>
              {errors.locationId && (
                <p className="mt-1 text-xs text-red-600">{errors.locationId}</p>
              )}
            </label>
          </div>

          <div className="grid grid-cols-1 gap-4 border-t border-slate-200 px-6 py-5 md:grid-cols-2">
            <label className="md:col-span-2">
              <span className="text-sm font-semibold text-slate-700">Notes</span>
              <textarea
                className="mt-1 min-h-[72px] w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-violet-500 focus:ring-2 focus:ring-violet-100"
                value={form.notes}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, notes: event.target.value }))
                }
                placeholder="Usage notes or approvals"
              />
            </label>

            <label>
              <span className="text-sm font-semibold text-slate-700">Company Address</span>
              <textarea
                className="mt-1 min-h-[72px] w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-violet-500 focus:ring-2 focus:ring-violet-100"
                value={form.companyAddress}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, companyAddress: event.target.value }))
                }
                placeholder="Address"
              />
            </label>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <label>
                <span className="text-sm font-semibold text-slate-700">Phone</span>
                <input
                  className={field}
                  value={form.companyPhone}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, companyPhone: event.target.value }))
                  }
                  placeholder="Phone"
                />
              </label>

              <label>
                <span className="text-sm font-semibold text-slate-700">GSTIN</span>
                <input
                  className={field}
                  value={form.companyGstin}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, companyGstin: event.target.value }))
                  }
                  placeholder="GSTIN"
                />
              </label>

              <label className="sm:col-span-2">
                <span className="text-sm font-semibold text-slate-700">Email</span>
                <input
                  className={field}
                  value={form.companyEmail}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, companyEmail: event.target.value }))
                  }
                  placeholder="Email"
                />
              </label>
            </div>
          </div>
        </section>

        <section className={panel}>
          <div className="flex flex-col gap-3 border-b border-slate-200 px-6 py-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <h3 className="text-2xl font-semibold text-violet-800">
                Inventory Source Lookup
              </h3>
              <p className="mt-1 text-sm text-slate-500">
                Switch between project delivery challans and reallocation records. Project and location filters stay in place while you narrow the stock you want to consume from.
              </p>
            </div>
            <div className="flex flex-col gap-2 sm:items-end">
              <div className="w-full sm:w-[220px]">
                <label className="text-sm font-semibold text-slate-700">
                  Lookup Source
                </label>
                <select
                  className={`${field} mt-1`}
                  value={lookupSource}
                  onChange={(event) => handleLookupSourceChange(event.target.value)}
                >
                  <option value={LOOKUP_SOURCE.DC}>Project DCs</option>
                  <option value={LOOKUP_SOURCE.REALLOCATION}>Reallocation Records</option>
                </select>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <input
                  type="search"
                  value={deliveryChallanFilter}
                  onChange={(event) => setDeliveryChallanFilter(event.target.value)}
                  placeholder={
                    lookupSource === LOOKUP_SOURCE.REALLOCATION
                      ? "Search reallocation ref or location..."
                      : "Search DC number or location..."
                  }
                  className="w-full min-w-[260px] rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-violet-500 focus:ring-2 focus:ring-violet-100"
                />
                <button
                  type="button"
                  onClick={() => void loadAll()}
                  className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:border-slate-400"
                >
                  Refresh
                </button>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 px-4 py-4 xl:grid-cols-[1fr_260px]">
            <div className="overflow-hidden rounded-lg border border-slate-200">
              <div className="max-h-[330px] overflow-auto">
                <table className="min-w-[980px] w-full text-sm">
                  <thead className="bg-slate-100 text-xs uppercase tracking-wide text-slate-600">
                    <tr>
                      <th className="w-12 px-3 py-3 text-left">
                        <input
                          type="checkbox"
                          checked={
                            lookupSource === LOOKUP_SOURCE.REALLOCATION
                              ? allFilteredReallocationsSelected
                              : allFilteredDeliveryChallansSelected
                          }
                          onChange={
                            lookupSource === LOOKUP_SOURCE.REALLOCATION
                              ? toggleAllFilteredReallocations
                              : toggleAllFilteredDeliveryChallans
                          }
                          disabled={
                            lookupSource === LOOKUP_SOURCE.REALLOCATION
                              ? !filteredReallocationsForSelection.length
                              : !filteredDeliveryChallansForSelection.length
                          }
                        />
                      </th>
                      <th className="px-3 py-3 text-left">
                        {lookupSource === LOOKUP_SOURCE.REALLOCATION
                          ? "Reallocation Ref"
                          : "Source Reference"}
                      </th>
                      <th className="px-3 py-3 text-left">
                        {lookupSource === LOOKUP_SOURCE.REALLOCATION
                          ? "Transfer Date"
                          : "Item"}
                      </th>
                      <th className="px-3 py-3 text-left">From</th>
                      <th className="px-3 py-3 text-left">To</th>
                      <th className="px-3 py-3 text-right">
                        {lookupSource === LOOKUP_SOURCE.REALLOCATION
                          ? "Item Count"
                          : "Source Qty"}
                      </th>
                      <th className="px-3 py-3 text-right">
                        {lookupSource === LOOKUP_SOURCE.REALLOCATION
                          ? "Total Quantity"
                          : "Consumed Qty"}
                      </th>
                      <th className="px-3 py-3 text-right">
                        {lookupSource === LOOKUP_SOURCE.REALLOCATION
                          ? "Available Qty"
                          : "Remaining Available Qty"}
                      </th>
                      <th className="px-3 py-3 text-left">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {!form.projectId ? (
                      <tr>
                        <td colSpan={9} className="px-4 py-10 text-center text-slate-500">
                          Select a project to review lookup records.
                        </td>
                      </tr>
                    ) : lookupSource === LOOKUP_SOURCE.REALLOCATION ? (
                      !String(form.fromLocationId || "").trim() ? (
                        <tr>
                          <td colSpan={9} className="px-4 py-10 text-center text-slate-500">
                            Select a source location to review reallocation records with available balance.
                          </td>
                        </tr>
                      ) : (
                        filteredReallocationsForSelection.length === 0 ? (
                          <tr>
                            <td colSpan={9} className="px-4 py-10 text-center text-slate-500">
                              No reallocation records with remaining balance were found for this project and source location.
                            </td>
                          </tr>
                        ) : (
                          filteredReallocationsForSelection.map((record) => {
                            const id = String(record.id);
                            const isSelected = selectedReallocationIds.includes(id);
                            return (
                              <tr
                                key={id}
                                className="border-t border-slate-200 bg-white hover:bg-violet-50/40"
                              >
                                <td className="px-3 py-3">
                                  <input
                                    type="checkbox"
                                    checked={isSelected}
                                    onChange={() => toggleReallocationSelection(id)}
                                  />
                                </td>
                                <td className="px-3 py-3 font-semibold text-slate-800">
                                  {getReallocationReference(record) || "-"}
                                </td>
                                <td className="px-3 py-3 text-slate-700">
                                  {formatDate(record.requestDate || record.transferDate)}
                                </td>
                                <td className="px-3 py-3 text-slate-700">
                                  {getReallocationLocationLabel(record, "from")}
                                </td>
                                <td className="px-3 py-3 text-slate-700">
                                  {getReallocationLocationLabel(record, "to")}
                                </td>
                                <td className="px-3 py-3 text-right text-slate-700">
                                  {getReallocationItemCount(record)}
                                </td>
                                <td className="px-3 py-3 text-right font-semibold text-slate-800">
                                  {formatQty(getReallocationTotalQuantity(record))}
                                </td>
                                <td className="px-3 py-3 text-right font-semibold text-emerald-700">
                                  {formatQty(getReallocationAvailableQuantity(record))}
                                </td>
                                <td className="px-3 py-3 text-slate-700">
                                  <span
                                    className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${statusPillClass(
                                      record.status
                                    )}`}
                                  >
                                    {record.status || "Pending"}
                                  </span>
                                </td>
                              </tr>
                            );
                          })
                        )
                      )
                    ) : !String(form.fromLocationId || form.locationId || "").trim() ? (
                      <tr>
                        <td colSpan={9} className="px-4 py-10 text-center text-slate-500">
                          Select a source location to review delivery challan inventory with remaining balance.
                        </td>
                      </tr>
                    ) : filteredDeliveryChallanInventoryRows.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="px-4 py-10 text-center text-slate-500">
                          No delivery challan inventory with remaining balance was found for this project and source location.
                        </td>
                      </tr>
                    ) : (
                      filteredDeliveryChallanInventoryRows.map((row, index) => {
                        const challanId = String(row.deliveryChallanId ?? "");
                        const challan = deliveryChallanMap[challanId] ?? {};
                        const isSelected = selectedDeliveryChallanIds.includes(challanId);
                        return (
                          <tr
                            key={
                              row.sourceRowId ||
                              row.sourceKey ||
                              `${challanId}:${row.deliveryChallanItemId ?? index}`
                            }
                            className="border-t border-slate-200 bg-white hover:bg-violet-50/40"
                          >
                            <td className="px-3 py-3">
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => toggleDeliveryChallanSelection(challanId)}
                              />
                            </td>
                            <td className="px-3 py-3 font-semibold text-slate-800">
                              {row.sourceRef || challan.dcNumber || "-"}
                            </td>
                            <td className="px-3 py-3 text-slate-700">
                              {row.name || "-"}
                            </td>
                            <td className="px-3 py-3 text-slate-700">
                              {getChallanLocationLabel(challan, "from")}
                            </td>
                            <td className="px-3 py-3 text-slate-700">
                              {getChallanLocationLabel(challan, "to")}
                            </td>
                            <td className="px-3 py-3 text-right text-slate-700">
                              {formatQty(row.sourceQty)}
                            </td>
                            <td className="px-3 py-3 text-right font-semibold text-slate-800">
                              {formatQty(row.consumedQty)}
                            </td>
                            <td className="px-3 py-3 text-right font-semibold text-emerald-700">
                              {formatQty(row.remainingAvailableQty ?? row.availableQty)}
                            </td>
                            <td className="px-3 py-3 text-slate-700">
                              <span
                                className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${statusPillClass(
                                  challan.status
                                )}`}
                              >
                                {challan.status || "Available"}
                              </span>
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
                  {lookupSource === LOOKUP_SOURCE.REALLOCATION
                    ? `Showing ${filteredReallocationsForSelection.length} of ${availableReallocations.length} reallocation records`
                    : `Showing ${filteredDeliveryChallanInventoryRows.length} of ${availableDcInventoryRows.length} remaining DC inventory rows`}
                </p>
                <div className="flex items-center gap-4">
                  <span className="font-semibold text-violet-800">
                    {lookupSource === LOOKUP_SOURCE.REALLOCATION
                      ? selectedReallocationIds.length
                      : selectedDeliveryChallanIds.length}{" "}
                    selected
                  </span>
                  <button
                    type="button"
                    onClick={clearDeliveryChallanSelection}
                    disabled={
                      lookupSource === LOOKUP_SOURCE.REALLOCATION
                        ? !selectedReallocationIds.length
                        : !selectedDeliveryChallanIds.length
                    }
                    className="text-sm font-semibold text-violet-700 disabled:cursor-not-allowed disabled:text-slate-400"
                  >
                    Clear Selection
                  </button>
                </div>
              </div>
            </div>

            <aside className="rounded-lg border border-violet-100 bg-violet-50 p-4">
              <p className="text-sm font-semibold text-violet-900">Selection Summary</p>
              <div className="mt-4 space-y-3 text-sm">
                <div className="flex justify-between gap-3">
                  <span className="text-slate-600">
                    {lookupSource === LOOKUP_SOURCE.REALLOCATION
                      ? "Total Reallocation Records"
                      : "Total DCs Selected"}
                  </span>
                  <span className="font-semibold text-slate-900">
                    {lookupSource === LOOKUP_SOURCE.REALLOCATION
                      ? selectedReallocationsSummary.records
                      : selectedDeliveryChallansSummary.challans}
                  </span>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="text-slate-600">Total Items</span>
                  <span className="font-semibold text-slate-900">
                    {lookupSource === LOOKUP_SOURCE.REALLOCATION
                      ? selectedReallocationsSummary.items
                      : selectedDeliveryChallansSummary.items}
                  </span>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="text-slate-600">Total Quantity</span>
                  <span className="font-semibold text-slate-900">
                    {formatQty(
                      lookupSource === LOOKUP_SOURCE.REALLOCATION
                        ? selectedReallocationsSummary.quantity
                        : selectedDeliveryChallansSummary.quantity
                    )}
                  </span>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="text-slate-600">Total Available Qty</span>
                  <span className="font-semibold text-slate-900">
                    {formatQty(
                      lookupSource === LOOKUP_SOURCE.REALLOCATION
                        ? selectedReallocationsSummary.availableQuantity
                        : selectedDeliveryChallansSummary.availableQuantity
                    )}
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={
                  lookupSource === LOOKUP_SOURCE.REALLOCATION
                    ? handleLoadSelectedReallocations
                    : handleLoadSelectedDeliveryChallans
                }
                disabled={
                  lookupSource === LOOKUP_SOURCE.REALLOCATION
                    ? !selectedReallocationIds.length
                    : !selectedDeliveryChallanIds.length
                }
                className="mt-5 w-full rounded-lg bg-violet-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-violet-800 disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                {lookupSource === LOOKUP_SOURCE.REALLOCATION
                  ? "Load Selected Reallocations"
                  : "Load Selected DCs"}
              </button>
              <p className="mt-3 text-xs text-slate-500">
                Loading lookup records is optional; location inventory is already loaded below and this narrows it to the selected source references.
              </p>
            </aside>
          </div>
          {errors.deliveryChallanId && (
            <p className="px-6 pb-4 text-xs text-red-600">{errors.deliveryChallanId}</p>
          )}
          {errors.locationId && (
            <p className="px-6 pb-4 text-xs text-red-600">{errors.locationId}</p>
          )}
        </section>

        <section className={panel}>
          <div className="flex flex-col gap-3 border-b border-slate-200 px-6 py-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <h3 className="text-2xl font-semibold text-violet-800">
                Available Inventory
                {itemRows.length ? (
                  <span className="ml-3 rounded-full bg-violet-100 px-2.5 py-1 align-middle text-xs font-semibold text-violet-700">
                    {itemRows.length} Items
                  </span>
                ) : null}
              </h3>
              <p className="mt-1 text-sm text-slate-500">
                Select items and provide consumption quantity. Available quantity includes receive, DC, and reallocated stock minus prior consumption.
              </p>
              {inventoryLoading && (
                <p className="mt-2 text-xs font-semibold text-violet-700">
                  Loading available inventory...
                </p>
              )}
              {!inventoryLoading && form.projectId && (form.fromLocationId || form.locationId) && (
                  <p className="mt-2 text-xs text-slate-500">
                  Showing {availableInventory.length} available balance rows for the selected source location.
                </p>
              )}
              {inventoryError && (
                <p className="mt-2 text-xs font-semibold text-red-600">
                  {inventoryError}
                </p>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => onToggleAllRows(true)}
                disabled={!allSelectableRows.length}
                className="rounded-lg bg-violet-700 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-800 disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                Add All Available Items
              </button>
              <button
                type="button"
                onClick={() => onToggleAllRows(false)}
                disabled={!selectedRows.length}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:border-slate-400 disabled:cursor-not-allowed disabled:text-slate-400"
              >
                Clear Selection
              </button>
            </div>
          </div>

          <div className="overflow-x-auto px-2 pb-2 pt-3">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-100 text-slate-700">
                <tr>
                  <th className="px-3 py-3 text-left font-semibold w-12">
                    <input
                      type="checkbox"
                      checked={isAllChecked}
                      onChange={(event) => onToggleAllRows(event.target.checked)}
                    />
                  </th>
                  <th className="px-3 py-3 text-left font-semibold w-16">#</th>
                  <th className="px-3 py-3 text-left font-semibold min-w-[180px]">Source</th>
                  <th className="px-3 py-3 text-left font-semibold min-w-[220px]">Material</th>
                  <th className="px-3 py-3 text-left font-semibold min-w-[110px]">HSN / SAC</th>
                  <th className="px-3 py-3 text-left font-semibold min-w-[90px]">Unit</th>
                  <th className="px-3 py-3 text-right font-semibold min-w-[120px]">Source Qty</th>
                  <th className="px-3 py-3 text-right font-semibold min-w-[150px]">
                    Consumed Qty
                  </th>
                  <th className="px-3 py-3 text-right font-semibold min-w-[150px]">
                    Remaining Available Qty
                  </th>
                  <th className="px-3 py-3 text-right font-semibold min-w-[140px]">
                    Consume Qty
                  </th>
                </tr>
              </thead>
              <tbody>
                {!itemRows.length && (
                  <tr>
                    <td colSpan="10" className="px-4 py-10 text-center text-slate-500">
                      {form.projectId && (form.fromLocationId || form.locationId)
                        ? "No available inventory found for this project and source location."
                        : "Select a project and source location to load available inventory."}
                    </td>
                  </tr>
                )}

                {itemRows.map((row, index) => {
                  const rowQtyError = getRowConsumeQtyError(row);

                  return (
                    <tr key={row.rowId} className="border-b border-slate-200 bg-white">
                    <td className="px-3 py-2">
                      <input
                        type="checkbox"
                        checked={row.selected}
                        disabled={row.maxAvailableQty <= 0}
                        onChange={(event) => onToggleRow(row.rowId, event.target.checked)}
                      />
                    </td>
                    <td className="px-3 py-2 text-slate-700">{index + 1}</td>
                    <td className="px-3 py-2 text-slate-700">
                      <span className="font-semibold uppercase text-slate-600">
                        {sourceTypeLabel(row)}
                      </span>
                      {row.sourceRef ? (
                        <span className="block text-xs text-slate-500">
                          {row.sourceRef}
                        </span>
                      ) : null}
                    </td>
                    <td className="px-3 py-2 text-slate-800">{row.name || "-"}</td>
                    <td className="px-3 py-2 text-slate-700">{row.hsn || "-"}</td>
                    <td className="px-3 py-2 text-slate-700">{row.unit || "PCS"}</td>
                    <td className="px-3 py-2 text-right text-slate-800">
                      {formatQty(row.dcQty)}
                    </td>
                    <td className="px-3 py-2 text-right text-slate-700">
                      {formatQty(row.previouslyConsumed)}
                    </td>
                    <td className="px-3 py-2 text-right font-semibold text-emerald-600">
                      {formatQty(row.remainingAvailableQty)}
                    </td>
                    <td className="px-3 py-2">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            className="h-8 w-8 rounded-md border border-slate-300 bg-white text-base font-semibold text-slate-700 hover:border-slate-400"
                            onClick={() => onConsumeQtyStep(row.rowId, -1)}
                            disabled={row.maxAvailableQty <= 0}
                            aria-label={`Decrease consume quantity for ${row.name || "item"}`}
                          >
                            -
                          </button>
                          <input
                            className={qtyInput}
                            type="number"
                            inputMode="decimal"
                            min="0"
                            step="0.01"
                            max={row.maxAvailableQty}
                            value={row.consumeQty}
                            placeholder="0"
                            onChange={(event) =>
                              onConsumeQtyChange(row.rowId, event.target.value)
                            }
                            aria-invalid={Boolean(rowQtyError)}
                          />
                          <button
                            type="button"
                            className="h-8 w-8 rounded-md border border-slate-300 bg-white text-base font-semibold text-slate-700 hover:border-slate-400"
                            onClick={() => onConsumeQtyStep(row.rowId, 1)}
                            disabled={row.maxAvailableQty <= 0}
                            aria-label={`Increase consume quantity for ${row.name || "item"}`}
                          >
                            +
                          </button>
                        </div>
                        <p className="text-xs font-semibold text-emerald-700">
                          Available: {formatQty(row.remainingAvailableQty)}
                        </p>
                        {rowQtyError && (
                          <p className="text-xs text-red-600">{rowQtyError}</p>
                        )}
                      </div>
                    </td>
                    </tr>
                  );
                })}
              </tbody>
              {!!itemRows.length && (
                <tfoot>
                  <tr className="bg-violet-50">
                    <td colSpan="8" className="px-3 py-3 text-right font-semibold text-violet-800">
                      Total Quantity to Consume:
                    </td>
                    <td colSpan="2" className="px-3 py-3 text-right text-lg font-bold text-violet-900">
                      {formatQty(totalToConsume)}
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>

          {errors.items && <p className="px-6 pb-3 text-xs text-red-600">{errors.items}</p>}

          <div className="flex flex-wrap items-center justify-end gap-3 border-t border-slate-200 px-6 py-4">
            <button
              type="button"
              onClick={() => resetForm()}
              className="rounded-lg border border-slate-300 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 hover:border-slate-400"
            >
              Clear
            </button>
            <button
              type="button"
              onClick={() => resetForm()}
              className="rounded-lg border border-slate-300 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 hover:border-slate-400"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || loading}
              className="rounded-lg bg-violet-700 px-6 py-2.5 text-sm font-semibold text-white hover:bg-violet-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving
                ? editingId
                  ? "Updating..."
                  : "Saving..."
                : editingId
                ? "Update Consumption"
                : "Save Consumption"}
            </button>
          </div>
        </section>
      </form>

      {feedback.message && (
        <div
          className={`rounded-lg border px-4 py-3 text-sm ${
            feedback.type === "error"
              ? "border-red-200 bg-red-50 text-red-700"
              : "border-emerald-200 bg-emerald-50 text-emerald-700"
          }`}
        >
          {feedback.message}
        </div>
      )}

      <section className={panel}>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-6 py-4">
          <h2 className="text-2xl font-semibold text-slate-800">Consumption Register</h2>
          <div className="flex gap-2">
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search reference, project, location"
              className="w-64 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-violet-500 focus:ring-2 focus:ring-violet-100"
            />
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-violet-500 focus:ring-2 focus:ring-violet-100"
            >
              <option value="all">All Status</option>
              {statusOptions.map((option) => (
                <option key={option} value={option.toLowerCase()}>
                  {option}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-100 text-slate-700">
              <tr>
                <th className="px-4 py-3 text-left font-semibold min-w-[130px]">Ref</th>
                <th className="px-4 py-3 text-left font-semibold min-w-[180px]">Project</th>
                <th className="px-4 py-3 text-left font-semibold min-w-[170px]">Location</th>
                <th className="px-4 py-3 text-left font-semibold min-w-[130px]">Source Ref</th>
                <th className="px-4 py-3 text-left font-semibold min-w-[120px]">Date</th>
                <th className="px-4 py-3 text-right font-semibold min-w-[140px]">
                  Consumed Qty
                </th>
                <th className="px-4 py-3 text-right font-semibold min-w-[140px]">
                  Remaining Qty
                </th>
                <th className="px-4 py-3 text-right font-semibold min-w-[120px]">Qty</th>
                <th className="px-4 py-3 text-left font-semibold min-w-[120px]">Status</th>
                <th className="px-4 py-3 text-left font-semibold min-w-[180px]">Actions</th>
              </tr>
            </thead>
            <tbody>
              {!visibleRecords.length && (
                <tr>
                  <td colSpan="10" className="px-4 py-10 text-center text-slate-500">
                    {loading ? "Loading consumption records..." : "No consumption records found."}
                  </td>
                </tr>
              )}

              {visibleRecords.map((record) => {
                const totalQty = (record.items || []).reduce(
                  (sum, item) => sum + Math.max(toNumber(item.quantity), 0),
                  0
                );
                const metrics =
                  consumptionRegisterMetrics.get(
                    String(record.id ?? record.consumptionId ?? "")
                  ) ?? {};

                return (
                  <tr key={record.id} className="border-b border-slate-200 bg-white">
                    <td className="px-4 py-3 text-slate-800">
                      {record.consumptionNumber || "-"}
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      {projectMap[
                        String(resolveConsumptionProjectId(record, deliveryChallanMap))
                      ]?.name || "-"}
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      {`${
                        locationMap[String(record.fromLocationId ?? record.locationId)]?.name || "-"
                      } → ${locationMap[String(record.locationId)]?.name || "-"}`}
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      {getRecordSourceReference(record)}
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      {formatDate(record.consumptionDate || record.createdAt)}
                    </td>
                    <td className="px-4 py-3 text-right text-slate-700">
                      {formatQty(metrics.totalConsumedQty)}
                    </td>
                    <td className="px-4 py-3 text-right text-emerald-700">
                      {formatQty(metrics.totalAvailableBalance)}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-slate-800">
                      {formatQty(totalQty)}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${statusPillClass(
                          record.status || "Logged"
                        )}`}
                      >
                        {record.status || "Logged"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-3 text-sm">
                        <button
                          type="button"
                          onClick={() => onView(record)}
                          className="font-semibold text-slate-800 hover:underline"
                        >
                          View
                        </button>
                        <button
                          type="button"
                          onClick={() => onEdit(record)}
                          className="font-semibold text-violet-700 hover:underline"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            void onDelete(record);
                          }}
                          className="font-semibold text-red-600 hover:underline"
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

        {viewRecord && (
          <DocumentViewPanel
            id="consumption-view-panel"
            title="CONSUMPTION"
            onClose={() => setViewRecord(null)}
            companyName={company.name || "Bangalore Electronics"}
            companyAddress={company.address || "Company address"}
            companyGstin={company.gstin || ""}
            companyPhone={company.phone || ""}
            companyEmail={company.email || ""}
            primaryPairs={[
              { label: "Consumption No", value: viewRecord.consumptionNumber || viewRecord.id },
              { label: "Date", value: formatDate(viewRecord.consumptionDate || viewRecord.createdAt) },
              { label: "Status", value: viewRecord.status || "Logged" },
              { label: "Issued By", value: viewRecord.issuedBy || "-" },
            ]}
            leftBlockTitle="Project"
            leftBlockLines={[
              projectMap[
                String(resolveConsumptionProjectId(viewRecord, deliveryChallanMap))
              ]?.name || "-",
              `Source: ${
                locationMap[String(viewRecord.fromLocationId ?? viewRecord.locationId)]?.name || "-"
              }`,
              `Destination: ${locationMap[String(viewRecord.locationId)]?.name || "-"}`,
            ]}
            rightBlockTitle="Source Reference"
            rightBlockLines={[
              getRecordSourceReference(viewRecord),
            ]}
            tableColumns={[
              { key: "serial", label: "Sl No", widthClass: "w-16" },
              { key: "name", label: "Item" },
              { key: "unit", label: "Unit", widthClass: "w-16" },
              { key: "hsn", label: "HSN", widthClass: "w-20" },
              {
                key: "previouslyConsumed",
                label: "Consumed Qty",
                align: "right",
                widthClass: "w-24",
              },
              {
                key: "availableBalance",
                label: "Remaining Qty",
                align: "right",
                widthClass: "w-24",
              },
              { key: "qty", label: "Qty", align: "right", widthClass: "w-24" },
              { key: "rate", label: "Rate", align: "right", widthClass: "w-24" },
              { key: "amount", label: "Amount", align: "right", widthClass: "w-24" },
            ]}
            tableRows={(viewRecord.items || []).map((item, index) => {
              const registerMetrics =
                consumptionRegisterMetrics.get(
                  String(viewRecord.id ?? viewRecord.consumptionId ?? "")
                )?.itemMetrics?.[index] ?? {};
              const quantity = Math.max(toNumber(item.quantity), 0);
              const rate = Math.max(toNumber(item.rate), 0);
              return {
                id: item.id ?? index,
                serial: index + 1,
                name: item.name || "-",
                unit: item.unit || "PCS",
                hsn: item.hsn || "-",
                previouslyConsumed: formatQty(registerMetrics.consumedQty),
                availableBalance: formatQty(registerMetrics.availableBalance),
                qty: formatQty(quantity),
                rate: formatQty(rate),
                amount: formatQty(quantity * rate),
              };
            })}
            bottomLeftContent={
              <div className="space-y-2 text-xs">
                <p className="font-semibold">Notes</p>
                <p className="whitespace-pre-wrap text-slate-700">
                  {viewRecord.notes || "-"}
                </p>
              </div>
            }
            bottomRightContent={
              <div className="text-right text-xs">
                <p className="font-semibold">Total Quantity</p>
                <p>{formatQty((viewRecord.items || []).reduce((sum, item) => sum + Math.max(toNumber(item.quantity), 0), 0))}</p>
              </div>
            }
            footerCompanyName={company.name || "Bangalore Electronics"}
            hideFooterNote
          />
        )}
      </section>
    </div>
  );
};

export default Consumption;
