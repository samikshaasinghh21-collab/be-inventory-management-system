import {
  createProjectModuleRecord,
  deleteProjectModuleRecord,
  fetchProjectModuleRecords,
  updateProjectModuleRecord,
} from "./projectManagementApi";
import { getProjectManagementProjects } from "./projectManagementProjectsStore";

const MODULE = "inventory-allocations";
const now = () => new Date().toISOString();
const numberValue = (value) => Math.max(Number(value) || 0, 0);
let cache = [];

const normalizeItem = (item = {}, index = 0) => ({
  ...item,
  id: item.id || `allocation-item-${index + 1}`,
  name: item.name || item.itemName || item.item || "Material",
  itemCode: item.itemCode || item.code || "",
  sourceKey: item.sourceKey || item.itemCode || item.id || `material-${index + 1}`,
  sourceRef: item.sourceRef || item.itemCode || "Stock",
  unit: item.unit || "PCS",
  rate: numberValue(item.rate),
  requestedQty: numberValue(item.requestedQty ?? item.requiredQty ?? item.required),
  approvedQty: numberValue(
    item.approvedQty ?? item.requiredQty ?? item.requestedQty ?? item.required
  ),
  issuedQty: numberValue(item.issuedQty ?? item.issued),
  consumedQty: numberValue(item.consumedQty ?? item.consumed),
  returnedQty: numberValue(item.returnedQty ?? item.returned),
  availableQty: numberValue(
    item.availableQty ?? item.stock ?? item.quantity ?? item.requiredQty
  ),
  reservedQty: numberValue(item.reservedQty),
  netAvailableQty: numberValue(
    item.netAvailableQty ?? item.availableQty ?? item.stock ?? item.quantity
  ),
  isUnplanned: Boolean(item.isUnplanned),
  justification: item.justification || "",
});

const normalizeAllocation = (allocation = {}) => {
  const project = getProjectManagementProjects().find(
    (item) => String(item.id) === String(allocation.projectId)
  ) || {};
  const items = (allocation.items || []).map(normalizeItem);
  const totals = items.reduce(
    (result, item) => ({
      requestedQty: result.requestedQty + item.requestedQty,
      approvedQty: result.approvedQty + item.approvedQty,
      issuedQty: result.issuedQty + item.issuedQty,
      consumedQty: result.consumedQty + item.consumedQty,
      returnedQty: result.returnedQty + item.returnedQty,
      value: result.value + item.approvedQty * item.rate,
    }),
    {
      requestedQty: 0,
      approvedQty: 0,
      issuedQty: 0,
      consumedQty: 0,
      returnedQty: 0,
      value: 0,
    }
  );
  return {
    ...allocation,
    projectName: allocation.projectName || project.name || "",
    siteLocationId: allocation.siteLocationId ?? project.locationId ?? project.id,
    allocationDate: allocation.allocationDate || allocation.createdAt || now(),
    priority: allocation.priority || project.priority || "Medium",
    status: allocation.status || "Draft",
    requestedBy: allocation.requestedBy || project.projectManager || "Project team",
    assignedTo: allocation.assignedTo || project.siteEngineer || "",
    items,
    totals,
    audit: Array.isArray(allocation.audit) ? allocation.audit : [],
    linkedDeliveryChallans: Array.isArray(allocation.linkedDeliveryChallans)
      ? allocation.linkedDeliveryChallans
      : [],
  };
};

const auditEntry = (action, fromStatus, toStatus, actor = {}) => ({
  id: `allocation-audit-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
  action,
  fromStatus,
  toStatus,
  performedBy: actor.performedBy || "Current user",
  performedRole: actor.performedRole || "Project team",
  remarks: actor.remarks || "",
  createdAt: now(),
});

const replace = (record) => {
  const normalized = normalizeAllocation(record);
  cache = [normalized, ...cache.filter((item) => String(item.id) !== String(record.id))];
  return normalized;
};

const getRecord = async (id) => {
  const cached = cache.find((item) => String(item.id) === String(id));
  if (cached) return cached;
  await fetchInventoryAllocations();
  return cache.find((item) => String(item.id) === String(id));
};

export const fetchInventoryAllocations = async () => {
  cache = (await fetchProjectModuleRecords(MODULE)).map(normalizeAllocation);
  return cache;
};

export const fetchInventoryAllocation = async (id) =>
  (await getRecord(id)) || null;

export const fetchInventoryAllocationSummary = async () => {
  const rows = await fetchInventoryAllocations();
  return rows.reduce(
    (summary, allocation) => ({
      totalAllocations: summary.totalAllocations + 1,
      pendingApprovals:
        summary.pendingApprovals +
        (String(allocation.status).startsWith("Pending") ? 1 : 0),
      allocatedValue: summary.allocatedValue + allocation.totals.value,
      reservedQty:
        summary.reservedQty +
        Math.max(allocation.totals.approvedQty - allocation.totals.issuedQty, 0),
      issuedQty: summary.issuedQty + allocation.totals.issuedQty,
    }),
    {
      totalAllocations: 0,
      pendingApprovals: 0,
      allocatedValue: 0,
      reservedQty: 0,
      issuedQty: 0,
    }
  );
};

export const createInventoryAllocation = async (input) => {
  const sequence =
    cache.reduce((maximum, item) => {
      const match = /ALC-(\d+)/.exec(String(item.allocationNumber || ""));
      return match ? Math.max(maximum, Number(match[1])) : maximum;
    }, 0) + 1;
  const data = normalizeAllocation({
    ...input,
    allocationNumber: `ALC-${String(sequence).padStart(5, "0")}`,
    status: "Draft",
    createdAt: now(),
    updatedAt: now(),
    audit: [auditEntry("CREATE", "", "Draft", input)],
  });
  return replace(
    await createProjectModuleRecord(MODULE, {
      projectId: input.projectId,
      data,
    })
  );
};

export const updateInventoryAllocation = async (id, input) => {
  const current = await getRecord(id);
  if (!current) throw new Error("Allocation not found.");
  if (current.status !== "Draft") throw new Error("Only draft allocations can be edited.");
  const data = normalizeAllocation({
    ...current,
    ...input,
    id: undefined,
    status: "Draft",
    updatedAt: now(),
    audit: [auditEntry("UPDATE", "Draft", "Draft", input), ...current.audit],
  });
  return replace(
    await updateProjectModuleRecord(MODULE, id, {
      projectId: input.projectId || current.projectId,
      data,
    })
  );
};

export const deleteInventoryAllocation = async (id) => {
  const current = await getRecord(id);
  if (!current) throw new Error("Allocation not found.");
  if (current.status !== "Draft") throw new Error("Only draft allocations can be deleted.");
  await deleteProjectModuleRecord(MODULE, id);
  cache = cache.filter((item) => String(item.id) !== String(id));
};

const transition = async (id, allowed, nextStatus, action, actor = {}) => {
  const current = await getRecord(id);
  if (!current) throw new Error("Allocation not found.");
  if (!allowed.includes(current.status)) {
    throw new Error(`Cannot ${action.toLowerCase()} an allocation in ${current.status} status.`);
  }
  const status =
    typeof nextStatus === "function" ? nextStatus(current) : nextStatus;
  const data = {
    ...current,
    id: undefined,
    status,
    items:
      status === "Approved/Reserved"
        ? current.items.map((item) => ({ ...item, approvedQty: item.requestedQty }))
        : current.items,
    updatedAt: now(),
    audit: [auditEntry(action, current.status, status, actor), ...current.audit],
  };
  return replace(
    await updateProjectModuleRecord(MODULE, id, {
      projectId: current.projectId,
      data,
    })
  );
};

export const submitInventoryAllocation = (id, actor) =>
  transition(id, ["Draft"], "Pending Project Manager", "SUBMIT", actor);

export const approveInventoryAllocation = (id, actor) =>
  transition(
    id,
    ["Pending Project Manager", "Pending Inventory Manager"],
    (allocation) =>
      allocation.status === "Pending Project Manager"
        ? "Pending Inventory Manager"
        : "Approved/Reserved",
    "APPROVE",
    actor
  );

export const rejectInventoryAllocation = (id, actor) =>
  transition(
    id,
    ["Pending Project Manager", "Pending Inventory Manager"],
    "Rejected",
    "REJECT",
    actor
  );

export const cancelInventoryAllocation = (id, actor) =>
  transition(
    id,
    [
      "Draft",
      "Pending Project Manager",
      "Pending Inventory Manager",
      "Approved/Reserved",
      "Partially Issued",
    ],
    "Cancelled",
    "CANCEL",
    actor
  );

export const issueInventoryAllocation = async (id, input = {}) => {
  const current = await getRecord(id);
  if (!current) throw new Error("Allocation not found.");
  if (!["Approved/Reserved", "Partially Issued"].includes(current.status)) {
    throw new Error("Only approved reservations can be issued.");
  }
  const requested = new Map(
    (input.items || []).map((item) => [
      String(item.allocationItemId),
      numberValue(item.quantity),
    ])
  );
  const items = current.items.map((item) => {
    const balance = Math.max(item.approvedQty - item.issuedQty, 0);
    const quantity = requested.has(String(item.id))
      ? requested.get(String(item.id))
      : balance;
    if (quantity > balance) throw new Error(`${item.name} exceeds its reserved balance.`);
    return { ...item, issuedQty: item.issuedQty + quantity };
  });
  if (!items.some((item, index) => item.issuedQty > current.items[index].issuedQty)) {
    throw new Error("Enter at least one issue quantity.");
  }
  const status = items.every((item) => item.issuedQty >= item.approvedQty)
    ? "Issued"
    : "Partially Issued";
  const dcNumber = `LDC-${String(current.linkedDeliveryChallans.length + 1).padStart(3, "0")}`;
  const data = {
    ...current,
    id: undefined,
    items,
    status,
    linkedDeliveryChallans: [
      {
        id: `delivery-${Date.now()}`,
        dcNumber,
        status: "Issued",
        issueDate: input.issueDate || now(),
      },
      ...current.linkedDeliveryChallans,
    ],
    updatedAt: now(),
    audit: [
      auditEntry("ISSUE", current.status, status, {
        ...input,
        remarks: `${dcNumber}. ${input.remarks || ""}`.trim(),
      }),
      ...current.audit,
    ],
  };
  return replace(
    await updateProjectModuleRecord(MODULE, id, {
      projectId: current.projectId,
      data,
    })
  );
};
