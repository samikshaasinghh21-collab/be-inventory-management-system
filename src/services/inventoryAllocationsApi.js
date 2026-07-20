import {
  getProjectManagementProjects,
  setProjectManagementProjects,
} from "./projectManagementProjectsStore";

const now = () => new Date().toISOString();
const makeId = (prefix) =>
  `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const numberValue = (value) => Math.max(Number(value) || 0, 0);

const emitChange = () => {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("inventory-allocations:changed"));
    window.dispatchEvent(new Event("projects:changed"));
  }
};

const normalizeItem = (item = {}, index = 0) => ({
  ...item,
  id: item.id || makeId(`allocation-item-${index + 1}`),
  name: item.name || item.itemName || item.item || "Material",
  itemCode: item.itemCode || item.code || "",
  sourceKey: item.sourceKey || item.itemCode || item.id || `material-${index + 1}`,
  sourceRef: item.sourceRef || item.itemCode || "Local stock",
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
    item.netAvailableQty ?? item.availableQty ?? item.stock ?? item.quantity ?? item.requiredQty
  ),
  isUnplanned: Boolean(item.isUnplanned),
  justification: item.justification || "",
});

const normalizeAllocation = (allocation = {}, project = {}) => {
  const items = Array.isArray(allocation.items) && allocation.items.length
    ? allocation.items.map(normalizeItem)
    : [normalizeItem(allocation)];
  const totals = items.reduce(
    (summary, item) => ({
      requestedQty: summary.requestedQty + item.requestedQty,
      approvedQty: summary.approvedQty + item.approvedQty,
      issuedQty: summary.issuedQty + item.issuedQty,
      consumedQty: summary.consumedQty + item.consumedQty,
      returnedQty: summary.returnedQty + item.returnedQty,
      value: summary.value + item.approvedQty * item.rate,
    }),
    { requestedQty: 0, approvedQty: 0, issuedQty: 0, consumedQty: 0, returnedQty: 0, value: 0 }
  );
  const legacyStatus = allocation.status === "Partial"
    ? "Partially Issued"
    : allocation.status === "Allocated"
    ? "Approved/Reserved"
    : allocation.status || "Draft";
  return {
    ...allocation,
    id: allocation.id || makeId("allocation"),
    allocationNumber:
      allocation.allocationNumber ||
      allocation.referenceNumber ||
      `LOCAL-${String(allocation.id || Date.now()).replace(/\W/g, "").slice(-8)}`,
    projectId: allocation.projectId ?? project.id,
    projectName: project.name || allocation.projectName || "",
    siteLocationId: allocation.siteLocationId ?? project.locationId ?? project.id,
    warehouseLocationId:
      allocation.warehouseLocationId || allocation.storeLocation || "local-store",
    allocationDate: allocation.allocationDate || allocation.issueDate || allocation.createdAt || now(),
    priority: allocation.priority || project.priority || "Medium",
    status: legacyStatus,
    requestedBy: allocation.requestedBy || project.projectManager || "Project team",
    assignedTo: allocation.assignedTo || project.siteEngineer || "",
    remarks: allocation.remarks || "",
    items,
    totals,
    audit: Array.isArray(allocation.audit) ? allocation.audit : [],
    linkedDeliveryChallans: Array.isArray(allocation.linkedDeliveryChallans)
      ? allocation.linkedDeliveryChallans
      : [],
  };
};

const listFromProjects = (projects = getProjectManagementProjects()) =>
  projects
    .flatMap((project) =>
      (project.inventoryAllocations || []).map((allocation) =>
        normalizeAllocation(allocation, project)
      )
    )
    .sort((left, right) =>
      String(right.updatedAt || right.allocationDate).localeCompare(
        String(left.updatedAt || left.allocationDate)
      )
    );

const saveProjects = (projects) => {
  try {
    setProjectManagementProjects(projects);
    emitChange();
  } catch (error) {
    if (error?.name === "QuotaExceededError" || error?.code === 22) {
      throw new Error("Local project storage is full. Remove older records and try again.");
    }
    throw error;
  }
};

const updateAllocation = (allocationId, updater) => {
  let updated = null;
  const projects = getProjectManagementProjects().map((project) => ({
    ...project,
    inventoryAllocations: (project.inventoryAllocations || []).map((allocation) => {
      if (String(allocation.id) !== String(allocationId)) return allocation;
      updated = normalizeAllocation(
        updater(normalizeAllocation(allocation, project), project),
        project
      );
      return updated;
    }),
    updatedAt: now(),
  }));
  if (!updated) throw new Error("Allocation not found in local project storage.");
  saveProjects(projects);
  return updated;
};

const auditEntry = (action, fromStatus, toStatus, actor = {}) => ({
  id: makeId("allocation-audit"),
  action,
  fromStatus,
  toStatus,
  performedBy: actor.performedBy || "Current user",
  performedRole: actor.performedRole || "Project team",
  remarks: actor.remarks || "",
  createdAt: now(),
});

export const fetchInventoryAllocations = () => listFromProjects();

export const fetchInventoryAllocation = (id) =>
  listFromProjects().find((allocation) => String(allocation.id) === String(id)) || null;

export const fetchInventoryAllocationSummary = () =>
  listFromProjects().reduce(
    (summary, allocation) => ({
      ...summary,
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
    { totalAllocations: 0, pendingApprovals: 0, allocatedValue: 0, reservedQty: 0, issuedQty: 0 }
  );

export const createInventoryAllocation = (input) => {
  const projects = getProjectManagementProjects();
  const project = projects.find((item) => String(item.id) === String(input.projectId));
  if (!project) throw new Error("Selected project was not found in local storage.");
  const sequence = listFromProjects(projects).reduce((max, item) => {
    const match = /ALC-(\d+)/.exec(String(item.allocationNumber));
    return match ? Math.max(max, Number(match[1])) : max;
  }, 0) + 1;
  const created = normalizeAllocation(
    {
      ...input,
      id: makeId("allocation"),
      allocationNumber: `ALC-${String(sequence).padStart(5, "0")}`,
      status: "Draft",
      createdAt: now(),
      updatedAt: now(),
      audit: [auditEntry("CREATE", "", "Draft", input)],
      linkedDeliveryChallans: [],
    },
    project
  );
  saveProjects(
    projects.map((item) =>
      String(item.id) === String(project.id)
        ? { ...item, inventoryAllocations: [created, ...(item.inventoryAllocations || [])], updatedAt: now() }
        : item
    )
  );
  return created;
};

export const updateInventoryAllocation = (id, input) =>
  updateAllocation(id, (allocation) => {
    if (allocation.status !== "Draft") throw new Error("Only draft allocations can be edited.");
    return {
      ...allocation,
      ...input,
      id: allocation.id,
      allocationNumber: allocation.allocationNumber,
      status: "Draft",
      updatedAt: now(),
      audit: [auditEntry("UPDATE", "Draft", "Draft", input), ...allocation.audit],
    };
  });

export const deleteInventoryAllocation = (id) => {
  let removed = false;
  const projects = getProjectManagementProjects().map((project) => ({
    ...project,
    inventoryAllocations: (project.inventoryAllocations || []).filter((allocation) => {
      if (String(allocation.id) !== String(id)) return true;
      if (normalizeAllocation(allocation, project).status !== "Draft") {
        throw new Error("Only draft allocations can be deleted.");
      }
      removed = true;
      return false;
    }),
  }));
  if (!removed) throw new Error("Allocation not found.");
  saveProjects(projects);
};

const transition = (id, allowed, nextStatus, action, actor) =>
  updateAllocation(id, (allocation) => {
    if (!allowed.includes(allocation.status)) {
      throw new Error(`Cannot ${action.toLowerCase()} an allocation in ${allocation.status} status.`);
    }
    const next = typeof nextStatus === "function" ? nextStatus(allocation) : nextStatus;
    return {
      ...allocation,
      status: next,
      items:
        next === "Approved/Reserved"
          ? allocation.items.map((item) => ({ ...item, approvedQty: item.requestedQty }))
          : allocation.items,
      projectManagerApprovedBy:
        allocation.status === "Pending Project Manager"
          ? actor?.performedBy
          : allocation.projectManagerApprovedBy,
      projectManagerApprovedAt:
        allocation.status === "Pending Project Manager" ? now() : allocation.projectManagerApprovedAt,
      inventoryManagerApprovedBy:
        allocation.status === "Pending Inventory Manager"
          ? actor?.performedBy
          : allocation.inventoryManagerApprovedBy,
      inventoryManagerApprovedAt:
        allocation.status === "Pending Inventory Manager" ? now() : allocation.inventoryManagerApprovedAt,
      updatedAt: now(),
      audit: [auditEntry(action, allocation.status, next, actor), ...allocation.audit],
    };
  });

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
  transition(id, ["Pending Project Manager", "Pending Inventory Manager"], "Rejected", "REJECT", actor);
export const cancelInventoryAllocation = (id, actor) =>
  transition(
    id,
    ["Draft", "Pending Project Manager", "Pending Inventory Manager", "Approved/Reserved", "Partially Issued"],
    "Cancelled",
    "CANCEL",
    actor
  );

export const issueInventoryAllocation = (id, input = {}) =>
  updateAllocation(id, (allocation) => {
    if (!["Approved/Reserved", "Partially Issued"].includes(allocation.status)) {
      throw new Error("Only approved reservations can be issued.");
    }
    const requested = new Map(
      (input.items || []).map((item) => [String(item.allocationItemId), numberValue(item.quantity)])
    );
    const items = allocation.items.map((item) => {
      const balance = Math.max(item.approvedQty - item.issuedQty, 0);
      const issueQty = requested.has(String(item.id)) ? requested.get(String(item.id)) : balance;
      if (issueQty > balance) throw new Error(`${item.name} exceeds its reserved balance.`);
      return { ...item, issuedQty: item.issuedQty + issueQty };
    });
    const issuedAny = items.some((item, index) => item.issuedQty > allocation.items[index].issuedQty);
    if (!issuedAny) throw new Error("Enter at least one issue quantity.");
    const fullyIssued = items.every((item) => item.issuedQty >= item.approvedQty);
    const dcNumber = `LDC-${String((allocation.linkedDeliveryChallans || []).length + 1).padStart(3, "0")}`;
    const next = fullyIssued ? "Issued" : "Partially Issued";
    return {
      ...allocation,
      items,
      status: next,
      linkedDeliveryChallans: [
        {
          id: makeId("local-dc"),
          dcNumber,
          status: "Issued",
          issueDate: input.issueDate || now(),
          localOnly: true,
        },
        ...(allocation.linkedDeliveryChallans || []),
      ],
      updatedAt: now(),
      audit: [
        auditEntry("ISSUE", allocation.status, next, {
          ...input,
          remarks: `${dcNumber} created in local storage. ${input.remarks || ""}`.trim(),
        }),
        ...allocation.audit,
      ],
    };
  });
