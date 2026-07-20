import {
  getProjectManagementProjects,
  setProjectManagementProjects,
} from "./projectManagementProjectsStore";

const STORAGE_KEY = "project_management_purchase_followups";
export const PURCHASE_TRACKING_EVENT = "project-management:purchase-tracking-changed";

const canUseStorage = () =>
  typeof window !== "undefined" && typeof window.localStorage !== "undefined";

const now = () => new Date().toISOString();
const makeId = () => `local-purchase-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const numberValue = (value) => Math.max(Number(value) || 0, 0);

const normalizePurchase = (purchase = {}, project = {}) => ({
  ...purchase,
  id: purchase.id || makeId(),
  projectId: purchase.projectId ?? project.id,
  projectName: purchase.projectName || project.name || "",
  poNumber: purchase.poNumber || purchase.reference || "",
  vendor: purchase.vendor || purchase.vendorName || "",
  itemSummary: purchase.itemSummary || purchase.summary || "",
  amount: numberValue(purchase.amount ?? purchase.total),
  orderDate: String(purchase.orderDate || purchase.createdAt || "").slice(0, 10),
  expectedDate: String(purchase.expectedDate || purchase.expectedDelivery || purchase.eta || "").slice(0, 10),
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
});

const saveProjects = (projects) => {
  try {
    setProjectManagementProjects(projects);
  } catch (error) {
    if (error?.name === "QuotaExceededError" || error?.code === 22) {
      throw new Error("Purchase tracking local storage is full. Remove older records and try again.");
    }
    throw error;
  }
  emitChange();
};

export const listLocalPurchases = () =>
  getProjectManagementProjects()
    .flatMap((project) =>
      (project.purchases || []).map((purchase) => normalizePurchase(purchase, project))
    )
    .sort((left, right) =>
      String(right.updatedAt || right.orderDate).localeCompare(
        String(left.updatedAt || left.orderDate)
      )
    );

export const createLocalPurchase = (input = {}) => {
  const projects = getProjectManagementProjects();
  const project = projects.find((item) => String(item.id) === String(input.projectId));
  if (!project) throw new Error("Select a valid project.");
  const year = new Date().getFullYear();
  const sequence = listLocalPurchases().reduce((highest, purchase) => {
    const match = /LPO-\d{4}-(\d+)/.exec(String(purchase.poNumber));
    return match ? Math.max(highest, Number(match[1])) : highest;
  }, 0) + 1;
  const created = normalizePurchase({
    ...input,
    id: makeId(),
    poNumber: input.poNumber || `LPO-${year}-${String(sequence).padStart(4, "0")}`,
    createdAt: now(),
    updatedAt: now(),
  }, project);
  saveProjects(projects.map((item) =>
    String(item.id) === String(project.id)
      ? { ...item, purchases: [created, ...(item.purchases || [])], updatedAt: now() }
      : item
  ));
  return created;
};

export const updateLocalPurchase = (purchaseId, input = {}) => {
  let updated = null;
  const projects = getProjectManagementProjects().map((project) => ({
    ...project,
    purchases: (project.purchases || []).map((purchase) => {
      if (String(purchase.id) !== String(purchaseId)) return purchase;
      updated = normalizePurchase({
        ...purchase,
        ...input,
        id: purchase.id,
        projectId: project.id,
        updatedAt: now(),
      }, project);
      return updated;
    }),
  }));
  if (!updated) throw new Error("Purchase record was not found in local storage.");
  saveProjects(projects);
  return updated;
};

export const deleteLocalPurchase = (purchaseId) => {
  let removed = false;
  const projects = getProjectManagementProjects().map((project) => ({
    ...project,
    purchases: (project.purchases || []).filter((purchase) => {
      if (String(purchase.id) !== String(purchaseId)) return true;
      removed = true;
      return false;
    }),
  }));
  if (!removed) throw new Error("Purchase record was not found in local storage.");
  saveProjects(projects);
};

const normalizeEntry = (purchaseOrderId, entry = {}) => ({
  purchaseOrderId: String(purchaseOrderId),
  followUpStatus: entry.followUpStatus || "Open",
  priority: entry.priority || "Medium",
  owner: entry.owner || "",
  nextFollowUpDate: entry.nextFollowUpDate || "",
  note: entry.note || "",
  history: Array.isArray(entry.history) ? entry.history : [],
  createdAt: entry.createdAt || now(),
  updatedAt: entry.updatedAt || now(),
});

const emitChange = () => {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(PURCHASE_TRACKING_EVENT));
  }
};

export const getPurchaseFollowUps = () => {
  if (!canUseStorage()) return {};
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return Object.fromEntries(
      Object.entries(parsed).map(([id, entry]) => [id, normalizeEntry(id, entry)])
    );
  } catch {
    return {};
  }
};

export const savePurchaseFollowUp = (purchaseOrderId, input = {}) => {
  if (!canUseStorage()) throw new Error("Local storage is not available.");
  const key = String(purchaseOrderId || "").trim();
  if (!key) throw new Error("Purchase order is required.");

  const currentEntries = getPurchaseFollowUps();
  const previous = currentEntries[key] || normalizeEntry(key);
  const note = String(input.note || "").trim();
  const changedFields = ["followUpStatus", "priority", "owner", "nextFollowUpDate"]
    .filter((field) => String(input[field] ?? "") !== String(previous[field] ?? ""));
  const historyEntry = note || changedFields.length
    ? {
        id: `purchase-followup-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        note,
        changedFields,
        status: input.followUpStatus || previous.followUpStatus,
        owner: input.owner || previous.owner,
        createdAt: now(),
      }
    : null;
  const next = normalizeEntry(key, {
    ...previous,
    ...input,
    note: "",
    history: historyEntry ? [historyEntry, ...previous.history] : previous.history,
    updatedAt: now(),
  });

  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ ...currentEntries, [key]: next })
    );
  } catch (error) {
    if (error?.name === "QuotaExceededError" || error?.code === 22) {
      throw new Error("Purchase tracking local storage is full. Remove older notes and try again.");
    }
    throw error;
  }
  emitChange();
  return next;
};

export const clearPurchaseFollowUp = (purchaseOrderId) => {
  if (!canUseStorage()) return;
  const key = String(purchaseOrderId || "").trim();
  const currentEntries = getPurchaseFollowUps();
  if (!currentEntries[key]) return;
  const nextEntries = { ...currentEntries };
  delete nextEntries[key];
  localStorage.setItem(STORAGE_KEY, JSON.stringify(nextEntries));
  emitChange();
};
