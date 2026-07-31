import {
  createProjectModuleRecord,
  deleteProjectModuleRecord,
  fetchProjectModuleRecords,
  updateProjectModuleRecord,
} from "./projectManagementApi";
import { getProjectManagementProjects } from "./projectManagementProjectsStore";

const PURCHASE_MODULE = "project-purchases";
const FOLLOW_UP_MODULE = "purchase-follow-ups";
export const PURCHASE_TRACKING_EVENT =
  "project-management:purchase-tracking-changed";

const now = () => new Date().toISOString();
const numberValue = (value) => Math.max(Number(value) || 0, 0);
let purchaseCache = [];
let followUpCache = {};

const emitChange = () => {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(PURCHASE_TRACKING_EVENT));
  }
};

const normalizePurchase = (purchase = {}) => {
  const project = getProjectManagementProjects().find(
    (item) => String(item.id) === String(purchase.projectId)
  ) || {};
  return {
    ...purchase,
    projectName: purchase.projectName || project.name || "",
    poNumber: purchase.poNumber || purchase.reference || "",
    vendor: purchase.vendor || purchase.vendorName || "",
    itemSummary: purchase.itemSummary || purchase.summary || "",
    amount: numberValue(purchase.amount ?? purchase.total),
    orderDate: String(purchase.orderDate || purchase.createdAt || "").slice(0, 10),
    expectedDate: String(
      purchase.expectedDate || purchase.expectedDelivery || purchase.eta || ""
    ).slice(0, 10),
    actualDelivery: String(purchase.actualDelivery || "").slice(0, 10),
    status: purchase.status || "Requested",
    orderedQty: numberValue(purchase.orderedQty ?? purchase.quantity),
    receivedQty: numberValue(purchase.receivedQty),
    unit: purchase.unit || "PCS",
    notes: purchase.notes || "",
    items: Array.isArray(purchase.items) ? purchase.items : [],
    receipts: Array.isArray(purchase.receipts) ? purchase.receipts : [],
    createdAt: purchase.createdAt || now(),
    updatedAt: purchase.updatedAt || now(),
  };
};

const normalizeEntry = (purchaseOrderId, entry = {}) => ({
  ...entry,
  purchaseOrderId: String(purchaseOrderId),
  followUpStatus: entry.followUpStatus || "Open",
  priority: entry.priority || "Medium",
  owner: entry.owner || "",
  nextFollowUpDate: entry.nextFollowUpDate || "",
  note: "",
  history: Array.isArray(entry.history) ? entry.history : [],
  createdAt: entry.createdAt || now(),
  updatedAt: entry.updatedAt || now(),
});

export const refreshPurchaseTracking = async () => {
  const [purchases, followUps] = await Promise.all([
    fetchProjectModuleRecords(PURCHASE_MODULE),
    fetchProjectModuleRecords(FOLLOW_UP_MODULE),
  ]);
  purchaseCache = purchases.map(normalizePurchase);
  followUpCache = Object.fromEntries(
    followUps.map((entry) => [
      String(entry.externalKey || entry.purchaseOrderId),
      normalizeEntry(entry.externalKey || entry.purchaseOrderId, entry),
    ])
  );
  return { purchases: purchaseCache, followUps: followUpCache };
};

export const listLocalPurchases = () => purchaseCache;

export const createLocalPurchase = async (input = {}) => {
  const year = new Date().getFullYear();
  const sequence =
    purchaseCache.reduce((highest, purchase) => {
      const match = /LPO-\d{4}-(\d+)/.exec(String(purchase.poNumber));
      return match ? Math.max(highest, Number(match[1])) : highest;
    }, 0) + 1;
  const record = normalizePurchase({
    ...input,
    poNumber:
      input.poNumber || `LPO-${year}-${String(sequence).padStart(4, "0")}`,
    createdAt: now(),
    updatedAt: now(),
  });
  const saved = normalizePurchase(
    await createProjectModuleRecord(PURCHASE_MODULE, {
      projectId: input.projectId,
      data: record,
    })
  );
  purchaseCache = [saved, ...purchaseCache];
  emitChange();
  return saved;
};

export const updateLocalPurchase = async (purchaseId, input = {}) => {
  const current = purchaseCache.find(
    (purchase) => String(purchase.id) === String(purchaseId)
  );
  if (!current) throw new Error("Purchase record was not found.");
  const record = normalizePurchase({
    ...current,
    ...input,
    id: undefined,
    updatedAt: now(),
  });
  const saved = normalizePurchase(
    await updateProjectModuleRecord(PURCHASE_MODULE, purchaseId, {
      projectId: record.projectId,
      data: record,
    })
  );
  purchaseCache = [
    saved,
    ...purchaseCache.filter((item) => String(item.id) !== String(purchaseId)),
  ];
  emitChange();
  return saved;
};

export const deleteLocalPurchase = async (purchaseId) => {
  await deleteProjectModuleRecord(PURCHASE_MODULE, purchaseId);
  purchaseCache = purchaseCache.filter(
    (purchase) => String(purchase.id) !== String(purchaseId)
  );
  emitChange();
};

export const getPurchaseFollowUps = () => followUpCache;

export const savePurchaseFollowUp = async (purchaseOrderId, input = {}) => {
  const key = String(purchaseOrderId || "").trim();
  if (!key) throw new Error("Purchase order is required.");
  const previous = followUpCache[key] || normalizeEntry(key);
  const note = String(input.note || "").trim();
  const changedFields = [
    "followUpStatus",
    "priority",
    "owner",
    "nextFollowUpDate",
  ].filter(
    (field) => String(input[field] ?? "") !== String(previous[field] ?? "")
  );
  const historyEntry =
    note || changedFields.length
      ? {
          id: `purchase-followup-${Date.now()}-${Math.random()
            .toString(36)
            .slice(2, 7)}`,
          note,
          changedFields,
          status: input.followUpStatus || previous.followUpStatus,
          owner: input.owner || previous.owner,
          createdAt: now(),
        }
      : null;
  const record = normalizeEntry(key, {
    ...previous,
    ...input,
    id: undefined,
    externalKey: undefined,
    history: historyEntry
      ? [historyEntry, ...previous.history]
      : previous.history,
    updatedAt: now(),
  });
  const saved = previous.id
    ? await updateProjectModuleRecord(FOLLOW_UP_MODULE, previous.id, {
        externalKey: key,
        data: record,
      })
    : await createProjectModuleRecord(FOLLOW_UP_MODULE, {
        externalKey: key,
        data: record,
      });
  followUpCache = {
    ...followUpCache,
    [key]: normalizeEntry(key, saved),
  };
  emitChange();
  return followUpCache[key];
};

export const clearPurchaseFollowUp = async (purchaseOrderId) => {
  const key = String(purchaseOrderId || "").trim();
  const previous = followUpCache[key];
  if (!previous?.id) return;
  await deleteProjectModuleRecord(FOLLOW_UP_MODULE, previous.id);
  const next = { ...followUpCache };
  delete next[key];
  followUpCache = next;
  emitChange();
};
