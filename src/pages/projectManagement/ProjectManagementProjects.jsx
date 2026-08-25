import { createElement, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Activity,
  AlertTriangle,
  Boxes,
  BriefcaseBusiness,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  CircleDollarSign,
  ClipboardCheck,
  Clock3,
  Eye,
  FileText,
  FolderOpen,
  FolderKanban,
  IndianRupee,
  ListChecks,
  MapPin,
  MoreHorizontal,
  PackageCheck,
  Pencil,
  Plus,
  Printer,
  ReceiptText,
  Search,
  Upload,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import DateInput from "../../components/common/DateInput";
import { fetchCustomers } from "../../services/customersApi";
import { fetchHrmsEmployees } from "../../services/hrmsEmployeesApi";
import { fetchLocations } from "../../services/locationsApi";
import {
  PROJECT_MANAGEMENT_PROJECTS_EVENT,
  hydrateProjectManagementProjects,
  getProjectManagementProjects as getProjects,
  saveProjectManagementProject as saveProject,
} from "../../services/projectManagementProjectsStore";
import {
  createMilestone,
  createProjectTask,
  deleteMilestone,
  updateProjectManagementProject,
  updateMilestone,
} from "../../services/projectManagementApi";
import { formatDate } from "../../utils/dateFormat";
import { formatInrCurrency, formatQuantity } from "../../utils/formatters";
import { printSection } from "../../utils/printUtils";

const STATUS_OPTIONS = [
  "Draft",
  "Planning",
  "Active",
  "On Hold",
  "Delayed",
  "Completed",
  "Cancelled",
];

const CREATE_STATUS_OPTIONS = ["Draft", "Planning", "Active"];
const FILTER_OPTIONS = [
  "All",
  "Planning",
  "Active",
  "On Hold",
  "Delayed",
  "Completed",
  "Cancelled",
];
const PRIORITY_OPTIONS = ["Critical", "High", "Medium", "Low"];
const PROJECT_STAGES = ["Design", "Procure", "Implement", "Allocate"];
const PROJECT_CATEGORIES = [
  "Electrical Installation",
  "Automation",
  "Maintenance",
  "Supply & Commissioning",
  "Infrastructure",
  "Service Contract",
];
const DEPARTMENTS = [
  "Projects",
  "Operations",
  "Electrical",
  "Maintenance",
  "Procurement",
  "Service",
];
const MILESTONE_TEMPLATES = [
  "Standard execution",
  "Installation & commissioning",
  "Maintenance contract",
  "Procurement-led project",
  "Fast-track delivery",
];

const inputClass =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100";
const selectClass = `${inputClass} appearance-none`;
const sectionClass = "rounded-xl border border-slate-200 bg-white p-5 shadow-sm";

const statusStyles = {
  Draft: "border-slate-200 bg-slate-100 text-slate-700",
  Planning: "border-blue-200 bg-blue-50 text-blue-700",
  Active: "border-emerald-200 bg-emerald-50 text-emerald-700",
  "On Hold": "border-amber-200 bg-amber-50 text-amber-700",
  Delayed: "border-rose-200 bg-rose-50 text-rose-700",
  Pending: "border-slate-200 bg-slate-50 text-slate-700",
  Partial: "border-amber-200 bg-amber-50 text-amber-700",
  Completed: "border-violet-200 bg-violet-50 text-violet-700",
  Cancelled: "border-slate-300 bg-slate-200 text-slate-700",
};

const priorityStyles = {
  Critical: "border-red-200 bg-red-50 text-red-700",
  High: "border-orange-200 bg-orange-50 text-orange-700",
  Medium: "border-indigo-200 bg-indigo-50 text-indigo-700",
  Low: "border-slate-200 bg-slate-50 text-slate-700",
};

const emptyProjectForm = {
  name: "",
  code: "",
  client: "",
  customerId: "",
  clientId: "",
  companyName: "",
  customerAddress: "",
  customerGstNumber: "",
  customerPhone: "",
  customerEmail: "",
  customerContactPerson: "",
  customerDesignation: "",
  projectCategory: "",
  description: "",
  priority: "Medium",
  status: "Draft",
  projectManager: "",
  projectManagerId: "",
  siteEngineer: "",
  siteEngineerId: "",
  teamLead: "",
  teamLeadId: "",
  department: "",
  startDate: "",
  endDate: "",
  actualEndDate: "",
  milestoneTemplate: "",
  milestones: [],
  estimatedBudget: "",
  approvedBudget: "",
  materialBudget: "",
  labourBudget: "",
  otherCostBudget: "",
  siteName: "",
  locationId: "",
  locationIds: [],
  siteAddress: "",
  city: "",
  state: "",
  siteContactPerson: "",
  siteContactNumber: "",
};

const emptyTaskForm = {
  milestoneId: "",
  title: "",
  description: "",
  parentTask: "",
  owner: "",
  assignedBy: "",
  priority: "Medium",
  startDate: "",
  dueDate: "",
  status: "Pending",
  estimatedHours: "",
  dependencies: "",
  attachments: [],
  comments: "",
};

const newMilestoneForm = () => ({
  id: makeId("milestone-draft"),
  name: "",
  stage: "Design",
  description: "",
  startDate: "",
  targetDate: "",
  responsiblePerson: "",
  responsiblePersonId: "",
  taskIds: [],
});

const TASK_STATUS_OPTIONS = [
  "Pending",
  "Partial",
  "Completed",
  "Cancelled",
];

const TEAM_AVAILABILITY_OPTIONS = [
  "Available",
  "Occupied",
  "On Leave",
  "Overallocated",
];

const TEAM_STATUS_OPTIONS = ["Active", "Planned", "Released", "On Hold"];

const MILESTONE_STATUS_OPTIONS = [
  "Pending",
  "In Progress",
  "Completed",
  "Delayed",
];

const INVENTORY_STATUS_OPTIONS = [
  "Requested",
  "Approved",
  "Issued",
  "Partial",
  "Returned",
  "Shortage",
];

const PURCHASE_STATUS_OPTIONS = [
  "Requested",
  "Approved",
  "Ordered",
  "In Transit",
  "Received",
  "Delayed",
  "Cancelled",
];

const COST_CATEGORIES = [
  "Materials",
  "Labour",
  "Transport",
  "Tools",
  "Miscellaneous",
];

const DOCUMENT_FOLDERS = [
  "Contracts",
  "Drawings",
  "BOQ",
  "Invoices",
  "Purchase Orders",
  "Site Photos",
  "Reports",
];

const detailTabs = [
  { id: "overview", label: "Overview", icon: FolderKanban },
  { id: "tasks", label: "Tasks", icon: ListChecks },
  { id: "team", label: "Team", icon: Users },
  { id: "milestones", label: "Milestones", icon: CheckCircle2 },
  { id: "inventory", label: "Inventory", icon: Boxes },
  { id: "purchases", label: "Purchases", icon: ReceiptText },
  { id: "financials", label: "Financials", icon: IndianRupee },
  { id: "documents", label: "Documents", icon: FileText },
  { id: "activity", label: "Activity", icon: Activity },
];

const getCustomerPrimaryName = (customer = {}) =>
  customer.name || customer.companyName || "";

const getCustomerOptionLabel = (customer = {}) => {
  const primaryName = getCustomerPrimaryName(customer);
  const company =
    customer.companyName && customer.companyName !== primaryName
      ? customer.companyName
      : "";
  return [primaryName, company].filter(Boolean).join(" | ") || "Unnamed customer";
};

const getEmployeeOptionLabel = (employee = {}) => {
  const name = employee.name || employee.fullName || employee.employeeId || "";
  const details = [employee.designation, employee.department].filter(Boolean).join(" | ");
  return [name, details].filter(Boolean).join(" - ") || "Unnamed employee";
};

const makeLegacySelectOption = (value, options = []) => {
  const text = String(value || "").trim();
  if (!text) return null;
  const exists = options.some(
    (option) =>
      String(option.value ?? "").trim().toLowerCase() === text.toLowerCase()
  );
  return exists ? null : { value: text, label: `${text} (saved)` };
};

const numberValue = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const percentValue = (value) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.min(100, Math.round(parsed)));
};

const todayIso = () => new Date().toISOString();

const makeId = (prefix) =>
  `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const normalizeProjectStatus = (status) => {
  const raw = String(status || "").trim();
  if (!raw) return "Draft";
  if (raw.toLowerCase() === "planned") return "Planning";
  if (raw.toLowerCase() === "in progress") return "Active";
  return STATUS_OPTIONS.includes(raw) ? raw : raw;
};

const isPastDate = (dateValue) => {
  if (!dateValue) return false;
  const due = new Date(dateValue);
  if (Number.isNaN(due.getTime())) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  due.setHours(0, 0, 0, 0);
  return due < today;
};

const getProjectStatus = (project) => {
  const status = normalizeProjectStatus(project.status);
  if (
    status !== "Completed" &&
    status !== "Cancelled" &&
    status !== "Delayed" &&
    isPastDate(project.endDate)
  ) {
    return "Delayed";
  }
  return status;
};

const getProgress = (project) => {
  const direct = Number(project.progress);
  if (Number.isFinite(direct) && direct > 0) return percentValue(direct);

  const status = getProjectStatus(project);
  if (status === "Completed") return 100;
  if (status === "Active") return 58;
  if (status === "On Hold") return 42;
  if (status === "Delayed") return 48;
  if (status === "Planning") return 18;
  return 0;
};

const getBudget = (project) =>
  numberValue(project.approvedBudget) ||
  numberValue(project.estimatedBudget) ||
  numberValue(project.budget);

const getExpenses = (project) => {
  const direct = numberValue(project.expenses);
  if (direct) return direct;
  const financialTotal = (project.financials || []).reduce(
    (sum, item) => sum + numberValue(item.amount),
    0
  );
  const purchaseTotal = (project.purchases || []).reduce(
    (sum, item) => sum + numberValue(item.amount),
    0
  );
  return financialTotal + purchaseTotal;
};

const getTeamSize = (project) => {
  const direct = numberValue(project.teamSize);
  if (direct) return direct;
  const allocations = Array.isArray(project.teamAllocations)
    ? project.teamAllocations.length
    : 0;
  const roles = [
    project.projectManager,
    project.siteEngineer,
    project.teamLead,
    project.department,
  ].filter(Boolean).length;
  return allocations || roles;
};

const getUtilization = (project) => {
  const direct = numberValue(project.resourceUtilization);
  if (direct) return percentValue(direct);
  const size = getTeamSize(project);
  if (!size) return 0;
  return percentValue(Math.min(92, 45 + size * 8));
};

const getTaskDueCount = (project) =>
  (project.tasks || []).filter((task) => {
    const taskStatus = String(task.status || "").toLowerCase();
    return task.dueDate && taskStatus !== "completed" && isPastDate(task.dueDate);
  }).length;

const getTaskStatus = (task = {}) => task.status || "Pending";

const getTaskName = (task = {}) => task.taskName || task.title || task.name || "";

const getTaskDescription = (task = {}) =>
  task.description || task.taskDescription || task.notes || "";

const getAssignedTo = (task = {}) => task.assignedTo || task.owner || "";

const getAssignedBy = (task = {}, project = {}) =>
  task.assignedBy || project.projectManager || "Project office";

const getTaskProgress = (task = {}) => {
  const direct = Number(task.progress);
  if (Number.isFinite(direct) && direct > 0) return percentValue(direct);
  const status = getTaskStatus(task);
  if (status === "Completed") return 100;
  if (status === "Partial") return percentValue(task.completionPercentage ?? task.progress);
  return 0;
};

const getTaskStats = (project = {}) => {
  const tasks = project.tasks || [];
  const completed = tasks.filter((task) => getTaskStatus(task) === "Completed").length;
  const overdue = tasks.filter(
    (task) => getTaskStatus(task) !== "Completed" && isPastDate(task.dueDate)
  ).length;
  return {
    total: tasks.length,
    completed,
    pending: Math.max(0, tasks.length - completed),
    overdue,
  };
};

const getDaysRemaining = (project = {}) => {
  if (!project.endDate) return "Not set";
  const end = new Date(project.endDate);
  if (Number.isNaN(end.getTime())) return "Not set";
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  end.setHours(0, 0, 0, 0);
  const diff = Math.ceil((end.getTime() - today.getTime()) / 86_400_000);
  if (diff < 0) return `${Math.abs(diff)} overdue`;
  return diff;
};

const getBudgetConsumedPercent = (project = {}) => {
  const budget = getBudget(project);
  if (!budget) return 0;
  return percentValue((getExpenses(project) / budget) * 100);
};

const getMaterialAllocatedPercent = (project = {}) => {
  const rows = project.inventoryAllocations || [];
  const required = rows.reduce(
    (sum, item) => sum + numberValue(item.requiredQty ?? item.required ?? item.reserved),
    0
  );
  const issued = rows.reduce(
    (sum, item) => sum + numberValue(item.issuedQty ?? item.issued),
    0
  );
  if (!required) return 0;
  return percentValue((issued / required) * 100);
};

const getOpenIssues = (project = {}) =>
  numberValue(project.openIssues) ||
  (project.tasks || []).filter((task) =>
    ["Blocked", "Under Review"].includes(getTaskStatus(task))
  ).length ||
  (project.inventoryAllocations || []).filter((item) => item.status === "Shortage")
    .length ||
  0;

const getProjectHealth = (project = {}) => {
  const budgetConsumed = getBudgetConsumedPercent(project);
  const overdueTasks = getTaskStats(project).overdue;
  const openIssues = getOpenIssues(project);
  const status = getProjectStatus(project);
  if (
    status === "Delayed" ||
    budgetConsumed >= 95 ||
    overdueTasks >= 3 ||
    openIssues >= 3
  ) {
    return "Critical";
  }
  if (status === "On Hold" || budgetConsumed >= 80 || overdueTasks > 0 || openIssues > 0) {
    return "Risk";
  }
  return "Healthy";
};

const getPendingInvoices = (project = {}) =>
  numberValue(project.pendingInvoices) ||
  (project.financials || []).filter((item) =>
    String(item.status || "").toLowerCase().includes("pending")
  ).length;

const getProfitMargin = (project = {}) => {
  const budget = getBudget(project);
  if (!budget) return 0;
  return percentValue(((budget - getExpenses(project)) / budget) * 100);
};

const getStatusPillClass = (status = "") => {
  const normalized = String(status);
  if (["Healthy", "Completed", "Available", "Received", "Issued", "Approved", "Active"].includes(normalized)) {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }
  if (["Risk", "Pending", "Requested", "Assigned", "In Progress", "Ordered", "Partial", "Planned"].includes(normalized)) {
    return "border-blue-200 bg-blue-50 text-blue-700";
  }
  if (["Critical", "Delayed", "Blocked", "Shortage", "Overallocated", "Cancelled"].includes(normalized)) {
    return "border-rose-200 bg-rose-50 text-rose-700";
  }
  if (["On Leave", "On Hold", "Under Review", "In Transit", "Occupied"].includes(normalized)) {
    return "border-amber-200 bg-amber-50 text-amber-700";
  }
  return "border-slate-200 bg-slate-100 text-slate-700";
};

const formatDateValue = (value) => {
  const formatted = formatDate(value);
  return formatted === "-" ? "Not set" : formatted;
};

const getInitialProjects = () => {
  return getProjects();
};

const getCostBreakdownRows = (project = {}) =>
  COST_CATEGORIES.map((category) => {
    const row = (project.financials || []).find(
      (item) => String(item.type || item.label) === category
    );
    const budget =
      numberValue(row?.budget) ||
      (category === "Materials"
        ? numberValue(project.materialBudget)
        : category === "Labour"
          ? numberValue(project.labourBudget)
          : category === "Miscellaneous"
            ? numberValue(project.otherCostBudget)
            : 0);
    const actual = numberValue(row?.actual ?? row?.amount);
    const variance = budget - actual;
    const status =
      row?.status ||
      (budget && actual > budget
        ? "Over Budget"
        : budget && actual > budget * 0.85
          ? "Risk"
          : "On Track");

    return {
      category,
      budget,
      actual,
      variance,
      status,
    };
  });

const getDocumentFolderCounts = (documents = []) =>
  DOCUMENT_FOLDERS.map((folder) => ({
    folder,
    count: documents.filter((document) => document.category === folder).length,
  }));

const getActivityDateKey = (dateValue) => {
  const date = dateValue ? new Date(dateValue) : new Date();
  if (Number.isNaN(date.getTime())) return "Not dated";
  return date.toISOString().slice(0, 10);
};

const groupActivitiesByDate = (activities = []) =>
  activities.reduce((groups, activity) => {
    const key = getActivityDateKey(activity.date);
    if (!groups[key]) groups[key] = [];
    groups[key].push(activity);
    return groups;
  }, {});

const buildTeamAllocations = (form, existing = []) => {
  return [
    {
      ...existing[0],
      id: existing[0]?.id || makeId("team"),
      employeeId: form.projectManagerId || "",
      role: "Project Manager",
      member: form.projectManager,
      employee: form.projectManager,
      department: form.department || existing[0]?.department || "Projects",
      allocation: "100%",
      allocationPercent: 100,
      startDate: form.startDate,
      endDate: form.endDate,
      availability: existing[0]?.availability || "Occupied",
      status: form.projectManager ? "Active" : existing[0]?.status || "Planned",
    },
    {
      ...existing[1],
      id: existing[1]?.id || makeId("team"),
      employeeId: form.siteEngineerId || "",
      role: "Site Engineer",
      member: form.siteEngineer,
      employee: form.siteEngineer,
      department: form.department || existing[1]?.department || "Projects",
      allocation: form.siteEngineer ? "75%" : "",
      allocationPercent: form.siteEngineer ? 75 : 0,
      startDate: form.startDate,
      endDate: form.endDate,
      availability: existing[1]?.availability || "Available",
      status: form.siteEngineer ? "Active" : "Planned",
    },
    {
      ...existing[2],
      id: existing[2]?.id || makeId("team"),
      employeeId: form.teamLeadId || "",
      role: "Team Lead",
      member: form.teamLead,
      employee: form.teamLead,
      department: form.department || existing[2]?.department || "Projects",
      allocation: form.teamLead ? "75%" : "",
      allocationPercent: form.teamLead ? 75 : 0,
      startDate: form.startDate,
      endDate: form.endDate,
      availability: existing[2]?.availability || "Available",
      status: form.teamLead ? "Active" : "Planned",
    },
  ].filter((item) => item.member);
};

const buildDefaultInventory = (form) => {
  const materialBudget = numberValue(form.materialBudget);
  if (!materialBudget) return [];
  return [
    {
      id: makeId("inventory"),
      itemCode: "MAT-BUDGET",
      itemName: "Project material budget",
      item: "Project material budget",
      category: "Material",
      requiredQty: materialBudget,
      issuedQty: 0,
      remainingQty: materialBudget,
      reserved: materialBudget,
      issued: 0,
      unit: "INR",
      storeLocation: form.siteName || "Main Store",
      issueDate: "",
      status: "Requested",
    },
  ];
};

const buildDefaultFinancials = (form) =>
  [
    {
      id: makeId("finance"),
      label: "Approved budget",
      type: "Budget",
      amount: numberValue(form.approvedBudget),
      status: numberValue(form.approvedBudget) ? "Approved" : "Pending",
    },
    {
      id: makeId("finance"),
      label: "Material budget",
      type: "Material",
      amount: numberValue(form.materialBudget),
      status: numberValue(form.materialBudget) ? "Allocated" : "Pending",
    },
    {
      id: makeId("finance"),
      label: "Labour budget",
      type: "Labour",
      amount: numberValue(form.labourBudget),
      status: numberValue(form.labourBudget) ? "Allocated" : "Pending",
    },
    {
      id: makeId("finance"),
      label: "Other cost budget",
      type: "Other",
      amount: numberValue(form.otherCostBudget),
      status: numberValue(form.otherCostBudget) ? "Allocated" : "Pending",
    },
  ].filter((item) => item.amount || item.label === "Approved budget");

const buildActivity = (form, existing = [], mode = "created") => [
  {
    id: makeId("activity"),
    title: mode === "updated" ? "Project record updated" : "Project record created",
    description: `${form.name || "Project"} moved to ${form.status}.`,
    actor: form.projectManager || "Project office",
    date: todayIso(),
  },
  ...existing,
];

const mapProjectToForm = (project = {}) => ({
  ...emptyProjectForm,
  name: project.name || "",
  code: project.code || "",
  client: project.client || project.companyName || "",
  customerId: project.customerId || project.clientId || "",
  clientId: project.clientId || project.customerId || "",
  companyName: project.companyName || "",
  customerAddress: project.address || "",
  customerGstNumber: project.gstNumber || "",
  customerPhone: project.phone || "",
  customerEmail: project.email || "",
  customerContactPerson: project.contactPerson || "",
  customerDesignation: project.designation || "",
  projectCategory: project.projectCategory || "",
  description: project.description || project.notes || "",
  priority: project.priority || "Medium",
  status: normalizeProjectStatus(project.status),
  projectManager: project.projectManager || project.manager || "",
  projectManagerId: project.projectManagerId || "",
  siteEngineer: project.siteEngineer || "",
  siteEngineerId: project.siteEngineerId || "",
  teamLead: project.teamLead || "",
  teamLeadId: project.teamLeadId || "",
  department: project.department || "",
  startDate: project.startDate || "",
  endDate: project.endDate || "",
  actualEndDate: project.actualEndDate || "",
  milestoneTemplate: project.milestoneTemplate || "",
  milestones: Array.isArray(project.milestones) ? project.milestones : [],
  estimatedBudget: project.estimatedBudget || "",
  approvedBudget: project.approvedBudget || "",
  materialBudget: project.materialBudget || "",
  labourBudget: project.labourBudget || "",
  otherCostBudget: project.otherCostBudget || "",
  siteName: project.siteName || "",
  locationId: project.locationId || "",
  locationIds: Array.isArray(project.locationIds)
    ? project.locationIds.map(String)
    : Array.isArray(project.locations)
      ? project.locations.map((location) => String(location.id || location.locationId)).filter(Boolean)
      : project.locationId ? [String(project.locationId)] : [],
  siteAddress: project.siteAddress || project.address || "",
  city: project.city || "",
  state: project.state || "",
  siteContactPerson: project.siteContactPerson || project.contactPerson || "",
  siteContactNumber: project.siteContactNumber || project.phone || "",
});

const buildProjectPayload = (form, existingProject = null) => {
  const now = todayIso();
  const teamAllocations = buildTeamAllocations(
    form,
    existingProject?.teamAllocations || []
  );
  const tasks = existingProject?.tasks || [];
  const inventoryAllocations = existingProject?.inventoryAllocations?.length
    ? existingProject.inventoryAllocations
    : buildDefaultInventory(form);
  const milestones = form.milestones || existingProject?.milestones || [];
  const financials = existingProject?.financials?.length
    ? existingProject.financials
    : buildDefaultFinancials(form);
  const progress =
    existingProject?.progress ||
    (form.status === "Completed" ? 100 : form.status === "Active" ? 35 : 0);

  return {
    ...(existingProject || {}),
    id: existingProject?.id ?? makeId("pm"),
    name: form.name.trim(),
    code: form.code.trim(),
    customerId: form.customerId || null,
    clientId: form.clientId || form.customerId || null,
    client: form.client.trim(),
    companyName: form.companyName.trim() || form.client.trim(),
    address: form.customerAddress.trim(),
    gstNumber: form.customerGstNumber.trim(),
    phone: form.customerPhone.trim(),
    email: form.customerEmail.trim(),
    contactPerson: form.customerContactPerson.trim(),
    designation: form.customerDesignation.trim(),
    projectCategory: form.projectCategory,
    description: form.description.trim(),
    notes: form.description.trim(),
    priority: form.priority,
    status: form.status,
    projectManager: form.projectManager.trim(),
    projectManagerId: form.projectManagerId || null,
    siteEngineer: form.siteEngineer.trim(),
    siteEngineerId: form.siteEngineerId || null,
    teamLead: form.teamLead.trim(),
    teamLeadId: form.teamLeadId || null,
    department: form.department,
    startDate: form.startDate || null,
    endDate: form.endDate || null,
    actualEndDate: form.actualEndDate || null,
    milestoneTemplate: form.milestoneTemplate,
    estimatedBudget: numberValue(form.estimatedBudget),
    approvedBudget: numberValue(form.approvedBudget),
    materialBudget: numberValue(form.materialBudget),
    labourBudget: numberValue(form.labourBudget),
    otherCostBudget: numberValue(form.otherCostBudget),
    expenses: existingProject?.expenses || 0,
    progress,
    teamSize: existingProject?.teamSize || teamAllocations.length,
    resourceUtilization:
      existingProject?.resourceUtilization || (teamAllocations.length ? 68 : 0),
    siteName: form.siteName.trim(),
    locationId: form.locationId || null,
    locationIds: (form.locationIds || []).map((value) => Number(value)).filter(Number.isFinite),
    locations: (form.locationIds || []).map((value, index) => ({
      id: Number(value),
      isPrimary: index === 0,
    })),
    siteAddress: form.siteAddress.trim(),
    city: form.city.trim(),
    state: form.state.trim(),
    siteContactPerson: form.siteContactPerson.trim(),
    siteContactNumber: form.siteContactNumber.trim(),
    tasks,
    teamAllocations,
    milestones,
    inventoryAllocations,
    purchases: existingProject?.purchases || [],
    financials,
    documents: existingProject?.documents || [],
    activities: buildActivity(
      form,
      existingProject?.activities || [],
      existingProject ? "updated" : "created"
    ),
    createdAt: existingProject?.createdAt || now,
    updatedAt: now,
  };
};

const KpiCard = ({ icon, label, value, helper, tone = "indigo" }) => {
  const toneClasses = {
    indigo: "bg-indigo-50 text-indigo-600",
    emerald: "bg-emerald-50 text-emerald-600",
    rose: "bg-rose-50 text-rose-600",
    violet: "bg-violet-50 text-violet-600",
    amber: "bg-amber-50 text-amber-600",
    blue: "bg-blue-50 text-blue-600",
    slate: "bg-slate-100 text-slate-600",
  };

  return (
    <article className="rounded-xl border border-slate-200 bg-white/95 p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <span
          className={`grid h-10 w-10 shrink-0 place-items-center rounded-lg ${
            toneClasses[tone] || toneClasses.indigo
          }`}
        >
          {createElement(icon, { className: "h-5 w-5" })}
        </span>
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            {label}
          </p>
          <p className="mt-1 text-xl font-bold text-slate-950">{value}</p>
          <p className="mt-1 truncate text-xs text-slate-500">{helper}</p>
        </div>
      </div>
    </article>
  );
};

const Badge = ({ label, type = "status" }) => {
  const styles = type === "priority" ? priorityStyles : statusStyles;
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${
        styles[label] || styles.Draft
      }`}
    >
      {label || "Draft"}
    </span>
  );
};

const StatusPill = ({ label }) => (
  <span
    className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${getStatusPillClass(
      label
    )}`}
  >
    {label || "-"}
  </span>
);

const TableActionButton = ({ children, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className="inline-flex items-center justify-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-600 transition hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-700"
  >
    {children}
  </button>
);

const ProgressMeter = ({ value }) => (
  <div className="flex min-w-[132px] items-center gap-3">
    <div className="h-2.5 w-20 overflow-hidden rounded-full bg-slate-200">
      <div
        className="h-full rounded-full bg-gradient-to-r from-indigo-600 to-emerald-500"
        style={{ width: `${percentValue(value)}%` }}
      />
    </div>
    <span className="text-xs font-semibold text-slate-700">
      {percentValue(value)}%
    </span>
  </div>
);

const Field = ({ label, required, error, children, className = "" }) => (
  <label className={`block ${className}`.trim()}>
    <span className="text-sm font-medium text-slate-700">
      {label}
      {required ? " *" : ""}
    </span>
    <div className="mt-1">{children}</div>
    {error && <p className="mt-1 text-xs font-medium text-red-600">{error}</p>}
  </label>
);

const SelectField = ({ value, onChange, children }) => (
  <div className="relative">
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className={selectClass}
    >
      {children}
    </select>
    <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
  </div>
);

const MetricPill = ({ label, value }) => (
  <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
    <p className="text-xs font-medium text-slate-500">{label}</p>
    <p className="mt-1 text-sm font-semibold text-slate-900">{value}</p>
  </div>
);

const SectionTitle = ({ icon, title, subtitle }) => (
  <div className="mb-4 flex items-start gap-3">
    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-indigo-50 text-indigo-600">
      {createElement(icon, { className: "h-4 w-4" })}
    </span>
    <div>
      <h3 className="text-base font-semibold text-slate-950">{title}</h3>
      {subtitle && <p className="mt-1 text-xs text-slate-500">{subtitle}</p>}
    </div>
  </div>
);

const ProjectFormModal = ({
  isOpen,
  mode,
  project,
  customers,
  employees,
  locations,
  onClose,
  onSave,
}) => {
  const [form, setForm] = useState(() =>
    project ? mapProjectToForm(project) : emptyProjectForm
  );
  const [errors, setErrors] = useState({});

  const customerSelectOptions = useMemo(
    () =>
      customers.map((customer) => ({
        value: String(customer.id),
        label: getCustomerOptionLabel(customer),
      })),
    [customers]
  );
  const employeeSelectOptions = useMemo(
    () =>
      employees.map((employee) => ({
        value: String(employee.employeeId || employee.id),
        label: getEmployeeOptionLabel(employee),
      })),
    [employees]
  );
  const locationSelectOptions = useMemo(
    () =>
      locations.map((location) => ({
        value: String(location.id),
        label:
          [location.name, location.code].filter(Boolean).join(" - ") ||
          "Unnamed location",
      })),
    [locations]
  );

  if (!isOpen) return null;

  const updateField = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    if (errors[key]) {
      setErrors((prev) => ({ ...prev, [key]: undefined }));
    }
  };

  const validate = () => {
    const nextErrors = {};
    if (!form.name.trim()) nextErrors.name = "Project name is required.";
    if (!form.code.trim()) nextErrors.code = "Project code is required.";
    if (!String(form.customerId || "").trim() && !form.client.trim()) {
      nextErrors.client = "Client is required.";
    }
    if (!form.projectManager.trim()) {
      nextErrors.projectManager = "Project manager is required.";
    }
    if (!form.startDate) nextErrors.startDate = "Start date is required.";
    if (!form.endDate) nextErrors.endDate = "Planned end date is required.";
    if (form.startDate && form.endDate && form.endDate < form.startDate) {
      nextErrors.endDate = "Planned end date must be after the start date.";
    }
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const updateCustomer = (customerId) => {
    const selectedCustomer =
      customers.find((customer) => String(customer.id) === String(customerId)) || null;
    setForm((prev) => ({
      ...prev,
      customerId: selectedCustomer ? String(selectedCustomer.id) : "",
      clientId: selectedCustomer ? String(selectedCustomer.id) : "",
      client: selectedCustomer ? getCustomerPrimaryName(selectedCustomer) : "",
      companyName: selectedCustomer?.companyName || "",
      customerAddress: selectedCustomer?.address || "",
      customerGstNumber: selectedCustomer?.gstNumber || "",
      customerPhone: selectedCustomer?.phone || "",
      customerEmail: selectedCustomer?.email || "",
      customerContactPerson: selectedCustomer?.contactPerson || "",
      customerDesignation: selectedCustomer?.designation || "",
      siteAddress: prev.siteAddress || selectedCustomer?.address || "",
      siteContactPerson:
        prev.siteContactPerson || selectedCustomer?.contactPerson || "",
      siteContactNumber: prev.siteContactNumber || selectedCustomer?.phone || "",
    }));
    if (errors.client) {
      setErrors((prev) => ({ ...prev, client: undefined }));
    }
  };

  const updateEmployee = (field, idField, employeeId) => {
    const selectedEmployee =
      employees.find(
        (employee) =>
          String(employee.employeeId || employee.id) === String(employeeId)
      ) || null;
    updateField(field, selectedEmployee?.name || "");
    updateField(idField, selectedEmployee ? String(selectedEmployee.employeeId || selectedEmployee.id) : "");
  };

  const updateMilestoneField = (index, key, value) => {
    setForm((current) => ({
      ...current,
      milestones: (current.milestones || []).map((milestone, milestoneIndex) =>
        milestoneIndex === index ? { ...milestone, [key]: value } : milestone
      ),
    }));
  };

  const addMilestone = () =>
    setForm((current) => ({
      ...current,
      milestones: [...(current.milestones || []), newMilestoneForm()],
    }));

  const removeMilestone = (index) =>
    setForm((current) => ({
      ...current,
      milestones: (current.milestones || []).filter(
        (_milestone, milestoneIndex) => milestoneIndex !== index
      ),
    }));

  const updateManualResponsibility = (field, idField, value) => {
    setForm((prev) => ({
      ...prev,
      [field]: value,
      [idField]: "",
    }));
    if (errors[field]) {
      setErrors((prev) => ({ ...prev, [field]: undefined }));
    }
  };

  const updateLocations = (locationIds) => {
    const normalizedIds = [...new Set(locationIds.map(String))];
    const selectedLocation =
      locations.find((location) => String(location.id) === normalizedIds[0]) || null;
    setForm((prev) => ({
      ...prev,
      locationIds: normalizedIds,
      locationId: selectedLocation ? String(selectedLocation.id) : "",
      siteName: selectedLocation?.name || "",
      siteAddress: selectedLocation?.address || prev.siteAddress,
      siteContactNumber: selectedLocation?.phone || prev.siteContactNumber,
    }));
  };

  const submitForm = (statusOverride) => {
    const nextForm = statusOverride ? { ...form, status: statusOverride } : form;
    if (!validate()) return;
    onSave(buildProjectPayload(nextForm, project));
  };

  const title = mode === "edit" ? "Edit Project" : "Create Project";
  const legacyCustomerOption = makeLegacySelectOption(form.client, customerSelectOptions);
  const legacyTeamLeadOption = makeLegacySelectOption(form.teamLead, employeeSelectOptions);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 px-4 py-5 backdrop-blur-sm">
      <div className="flex max-h-[94vh] w-[1180px] max-w-[98vw] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-center justify-between gap-4 border-b border-slate-200 bg-slate-50 px-6 py-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-indigo-500">
              Project Management
            </p>
            <h2 className="mt-1 text-xl font-semibold text-slate-950">{title}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid h-10 w-10 place-items-center rounded-lg border border-slate-200 bg-white text-slate-500 transition hover:border-slate-300 hover:text-slate-900"
            aria-label="Close"
            title="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-6">
          <div className="grid gap-5 xl:grid-cols-[220px_1fr]">
            <aside className="hidden rounded-xl border border-slate-200 bg-slate-50 p-4 xl:block">
              <p className="mb-3 text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
                Sections
              </p>
              {[
                "Project Information",
                "Responsibility",
                "Timeline",
                "Budget",
                "Location / Site",
              ].map((item, index) => (
                <div
                  key={item}
                  className={`mb-2 rounded-lg px-3 py-2 text-sm font-medium ${
                    index === 0
                      ? "border border-indigo-100 bg-white text-indigo-700 shadow-sm"
                      : "text-slate-600"
                  }`}
                >
                  {item}
                </div>
              ))}
            </aside>

            <form className="space-y-5" onSubmit={(event) => event.preventDefault()}>
              <section className={sectionClass}>
                <SectionTitle
                  icon={FolderKanban}
                  title="Project Information"
                  subtitle="Core project identity, customer, category, priority, and status."
                />
                <div className="grid gap-4 md:grid-cols-2">
                  <Field label="Project Name" required error={errors.name}>
                    <input
                      value={form.name}
                      onChange={(event) => updateField("name", event.target.value)}
                      className={inputClass}
                      placeholder="Ex: Metro control panel upgrade"
                    />
                  </Field>
                  <Field label="Project Code" required error={errors.code}>
                    <input
                      value={form.code}
                      onChange={(event) => updateField("code", event.target.value)}
                      className={inputClass}
                      placeholder="Ex: PRJ-2026-001"
                    />
                  </Field>
                  <Field label="Client" required error={errors.client}>
                    <SelectField
                      value={
                        form.customerId ||
                        (legacyCustomerOption ? legacyCustomerOption.value : "")
                      }
                      onChange={updateCustomer}
                    >
                      <option value="">Select customer</option>
                      {legacyCustomerOption ? (
                        <option value={legacyCustomerOption.value}>
                          {legacyCustomerOption.label}
                        </option>
                      ) : null}
                      {customerSelectOptions.map((customer) => (
                        <option key={customer.value} value={customer.value}>
                          {customer.label}
                        </option>
                      ))}
                    </SelectField>
                  </Field>
                  <Field label="Project Category">
                    <SelectField
                      value={form.projectCategory}
                      onChange={(value) => updateField("projectCategory", value)}
                    >
                      <option value="">Select category</option>
                      {PROJECT_CATEGORIES.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </SelectField>
                  </Field>
                  <Field label="Project Description" className="md:col-span-2">
                    <textarea
                      value={form.description}
                      onChange={(event) =>
                        updateField("description", event.target.value)
                      }
                      className={`${inputClass} min-h-[96px] resize-y`}
                      placeholder="Scope, deliverables, constraints, and commercial notes"
                    />
                  </Field>
                  <Field label="Priority">
                    <SelectField
                      value={form.priority}
                      onChange={(value) => updateField("priority", value)}
                    >
                      {PRIORITY_OPTIONS.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </SelectField>
                  </Field>
                  <Field label="Status">
                    <SelectField
                      value={form.status}
                      onChange={(value) => updateField("status", value)}
                    >
                      {(mode === "edit" ? STATUS_OPTIONS : CREATE_STATUS_OPTIONS).map(
                        (option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        )
                      )}
                    </SelectField>
                  </Field>
                </div>
              </section>

              {mode === "edit" && <section className={sectionClass}>
                <div className="mb-4 flex items-start justify-between gap-4">
                  <SectionTitle
                    icon={CheckCircle2}
                    title="Milestones"
                    subtitle="Add one or more delivery checkpoints. Progress is calculated from linked tasks."
                  />
                  <button
                    type="button"
                    onClick={addMilestone}
                    className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-sm font-semibold text-indigo-700"
                  >
                    <Plus className="h-4 w-4" /> Add Milestone
                  </button>
                </div>
                {!form.milestones?.length ? (
                  <p className="rounded-lg bg-slate-50 p-4 text-sm text-slate-500">
                    No milestones added. They can also be created later from the Milestones module.
                  </p>
                ) : (
                  <div className="space-y-4">
                    {form.milestones.map((milestone, index) => (
                      <div key={milestone.id || index} className="rounded-xl border border-slate-200 p-4">
                        <div className="grid gap-4 md:grid-cols-2">
                          <Field label="Milestone Name" required>
                            <input className={inputClass} value={milestone.name || ""}
                              onChange={(event) => updateMilestoneField(index, "name", event.target.value)} />
                          </Field>
                          <Field label="Project Stage" required>
                            <SelectField value={milestone.stage || "Design"}
                              onChange={(value) => updateMilestoneField(index, "stage", value)}>
                              {PROJECT_STAGES.map((stage) => <option key={stage} value={stage}>{stage}</option>)}
                            </SelectField>
                          </Field>
                          <Field label="Responsible Person">
                            <input className={inputClass} value={milestone.responsiblePerson || milestone.owner || ""}
                              onChange={(event) => updateMilestoneField(index, "responsiblePerson", event.target.value)}
                              placeholder="Employee name" />
                          </Field>
                          <Field label="Start Date">
                            <DateInput className={inputClass} value={milestone.startDate || ""}
                              onChange={(value) => updateMilestoneField(index, "startDate", value || "")} />
                          </Field>
                          <Field label="Target Date">
                            <DateInput className={inputClass} value={milestone.targetDate || ""}
                              onChange={(value) => updateMilestoneField(index, "targetDate", value || "")} />
                          </Field>
                          <Field label="Description" className="md:col-span-2">
                            <textarea className={inputClass} rows="2" value={milestone.description || ""}
                              onChange={(event) => updateMilestoneField(index, "description", event.target.value)} />
                          </Field>
                        </div>
                        <button type="button" onClick={() => removeMilestone(index)}
                          className="mt-3 text-sm font-semibold text-rose-600 hover:text-rose-700">
                          Remove milestone
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </section>}

              <section className={sectionClass}>
                <SectionTitle
                  icon={Users}
                  title="Responsibility"
                  subtitle="Ownership and accountable delivery roles."
                />
                <div className="grid gap-4 md:grid-cols-2">
                  <Field
                    label="Project Manager"
                    required
                    error={errors.projectManager}
                  >
                    <input
                      type="text"
                      value={form.projectManager}
                      onChange={(event) =>
                        updateManualResponsibility(
                          "projectManager",
                          "projectManagerId",
                          event.target.value
                        )
                      }
                      placeholder="Enter project manager name"
                      className={inputClass}
                    />
                  </Field>
                  <Field label="Site Engineer">
                    <input
                      type="text"
                      value={form.siteEngineer}
                      onChange={(event) =>
                        updateManualResponsibility(
                          "siteEngineer",
                          "siteEngineerId",
                          event.target.value
                        )
                      }
                      placeholder="Enter site engineer name"
                      className={inputClass}
                    />
                  </Field>
                  <Field label="Team Lead">
                    <SelectField
                      value={
                        form.teamLeadId ||
                        (legacyTeamLeadOption ? legacyTeamLeadOption.value : "")
                      }
                      onChange={(value) =>
                        updateEmployee("teamLead", "teamLeadId", value)
                      }
                    >
                      <option value="">Select team lead</option>
                      {legacyTeamLeadOption ? (
                        <option value={legacyTeamLeadOption.value}>
                          {legacyTeamLeadOption.label}
                        </option>
                      ) : null}
                      {employeeSelectOptions.map((employee) => (
                        <option key={employee.value} value={employee.value}>
                          {employee.label}
                        </option>
                      ))}
                    </SelectField>
                  </Field>
                  <Field label="Department">
                    <SelectField
                      value={form.department}
                      onChange={(value) => updateField("department", value)}
                    >
                      <option value="">Select department</option>
                      {DEPARTMENTS.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </SelectField>
                  </Field>
                </div>
              </section>

              <section className={sectionClass}>
                <SectionTitle
                  icon={CalendarDays}
                  title="Timeline"
                  subtitle="Planned, actual, and milestone tracking inputs."
                />
                <div className="grid gap-4 md:grid-cols-2">
                  <Field label="Start Date" required error={errors.startDate}>
                    <DateInput
                      value={form.startDate}
                      onChange={(value) => updateField("startDate", value || "")}
                      className={inputClass}
                    />
                  </Field>
                  <Field
                    label="Planned End Date"
                    required
                    error={errors.endDate}
                  >
                    <DateInput
                      value={form.endDate}
                      onChange={(value) => updateField("endDate", value || "")}
                      className={inputClass}
                    />
                  </Field>
                  <Field label="Actual End Date">
                    <DateInput
                      value={form.actualEndDate}
                      onChange={(value) =>
                        updateField("actualEndDate", value || "")
                      }
                      className={inputClass}
                    />
                  </Field>
                  <Field label="Milestone Template">
                    <SelectField
                      value={form.milestoneTemplate}
                      onChange={(value) => updateField("milestoneTemplate", value)}
                    >
                      <option value="">Select template</option>
                      {MILESTONE_TEMPLATES.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </SelectField>
                  </Field>
                </div>
              </section>

              <section className={sectionClass}>
                <SectionTitle
                  icon={IndianRupee}
                  title="Budget"
                  subtitle="Cost control fields for material, labour, and other spend."
                />
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {[
                    ["Estimated Budget", "estimatedBudget"],
                    ["Approved Budget", "approvedBudget"],
                    ["Material Budget", "materialBudget"],
                    ["Labour Budget", "labourBudget"],
                    ["Other Cost Budget", "otherCostBudget"],
                  ].map(([label, key]) => (
                    <Field key={key} label={label}>
                      <input
                        type="number"
                        min="0"
                        value={form[key]}
                        onChange={(event) => updateField(key, event.target.value)}
                        className={inputClass}
                        placeholder="0"
                      />
                    </Field>
                  ))}
                </div>
              </section>

              <section className={sectionClass}>
                <SectionTitle
                  icon={MapPin}
                  title="Location / Site"
                  subtitle="Site address, city, state, and contact ownership."
                />
                <div className="grid gap-4 md:grid-cols-2">
                  <Field label="Project Locations">
                    <select
                      multiple
                      value={(form.locationIds || []).map(String)}
                      onChange={(event) => updateLocations(Array.from(event.target.selectedOptions).map((option) => option.value))}
                      className={`${inputClass} min-h-32`}
                    >
                      {locationSelectOptions.map((location) => (
                        <option key={location.value} value={location.value}>
                          {location.label}
                        </option>
                      ))}
                    </select>
                    <p className="mt-1 text-xs text-slate-500">Use Ctrl/Command to select multiple sites. The first selected site is the primary location.</p>
                  </Field>
                  <Field label="Site Address">
                    <input
                      value={form.siteAddress}
                      onChange={(event) =>
                        updateField("siteAddress", event.target.value)
                      }
                      className={inputClass}
                      placeholder="Street address"
                    />
                  </Field>
                  <Field label="City">
                    <input
                      value={form.city}
                      onChange={(event) => updateField("city", event.target.value)}
                      className={inputClass}
                      placeholder="City"
                    />
                  </Field>
                  <Field label="State">
                    <input
                      value={form.state}
                      onChange={(event) => updateField("state", event.target.value)}
                      className={inputClass}
                      placeholder="State"
                    />
                  </Field>
                  <Field label="Contact Person">
                    <input
                      value={form.siteContactPerson}
                      onChange={(event) =>
                        updateField("siteContactPerson", event.target.value)
                      }
                      className={inputClass}
                      placeholder="Site contact"
                    />
                  </Field>
                  <Field label="Contact Number">
                    <input
                      value={form.siteContactNumber}
                      onChange={(event) =>
                        updateField("siteContactNumber", event.target.value)
                      }
                      className={inputClass}
                      placeholder="Phone number"
                    />
                  </Field>
                </div>
              </section>
            </form>
          </div>
        </div>

        <div className="flex flex-col gap-3 border-t border-slate-200 bg-slate-50 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-slate-500">
            Project records connect work, team, inventory, purchase, cost, and document tracking.
          </p>
          <div className="flex flex-wrap justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-100"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => submitForm("Draft")}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-indigo-200 bg-white px-4 py-2.5 text-sm font-semibold text-indigo-700 transition hover:bg-indigo-50"
            >
              <ClipboardCheck className="h-4 w-4" />
              Save as Draft
            </button>
            <button
              type="button"
              onClick={() => submitForm()}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700"
            >
              <Plus className="h-4 w-4" />
              {mode === "edit" ? "Save Changes" : "Create Project"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

const TaskAssignmentModal = ({ project, onClose, onSave }) => {
  const [form, setForm] = useState(() => ({
    ...emptyTaskForm,
    milestoneId: project?.milestones?.find((milestone) => !milestone.isDeleted)?.id || "",
    assignedBy: project?.projectManager || "Project office",
    owner: project?.teamLead || project?.siteEngineer || project?.projectManager || "",
    priority: project?.priority || "Medium",
  }));
  const [errors, setErrors] = useState({});

  if (!project) return null;

  const updateField = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    if (errors[key]) {
      setErrors((prev) => ({ ...prev, [key]: undefined }));
    }
  };

  const assignTask = () => {
    const nextErrors = {};
    if (!form.milestoneId) nextErrors.milestoneId = "Create and select a milestone first.";
    if (!form.title.trim()) nextErrors.title = "Task title is required.";
    if (!form.owner.trim()) nextErrors.owner = "Owner is required.";
    if (!form.dueDate) nextErrors.dueDate = "Due date is required.";
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;

    const task = {
      id: makeId("task"),
      taskId: `TSK-${String((project.tasks || []).length + 1).padStart(3, "0")}`,
      title: form.title.trim(),
      taskName: form.title.trim(),
      description: form.description.trim(),
      projectId: project.id,
      projectName: project.name,
      milestoneId: Number(form.milestoneId),
      milestoneName: project.milestones?.find((milestone) => String(milestone.id) === String(form.milestoneId))?.name || "",
      stage: project.milestones?.find((milestone) => String(milestone.id) === String(form.milestoneId))?.stage || "",
      parentTask: form.parentTask,
      owner: form.owner.trim(),
      assignedTo: form.owner.trim(),
      assignedBy: form.assignedBy.trim() || project.projectManager || "Project office",
      priority: form.priority,
      startDate: form.startDate || null,
      dueDate: form.dueDate,
      status: form.status,
      progress: form.status === "Completed" ? 100 : 0,
      estimatedHours: numberValue(form.estimatedHours),
      actualHours: 0,
      dependencies: form.dependencies.trim(),
      attachments: form.attachments || [],
      comments: form.comments.trim(),
      notes: form.comments.trim(),
      createdAt: todayIso(),
      updatedAt: todayIso(),
    };

    onSave({
      ...project,
      tasks: [task, ...(project.tasks || [])],
      activities: [
        {
          id: makeId("activity"),
          title: "Task assigned",
          description: `${task.title} assigned to ${task.owner}.`,
          actor: task.assignedBy,
          date: todayIso(),
        },
        ...(project.activities || []),
      ],
      updatedAt: todayIso(),
    });
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/45 px-4 py-5 backdrop-blur-sm">
      <div className="flex max-h-[94vh] w-[920px] max-w-[96vw] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-6 py-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-indigo-500">
              Task Assignment
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid h-10 w-10 place-items-center rounded-lg border border-slate-200 bg-white text-slate-500 hover:text-slate-900"
            aria-label="Close"
            title="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="grid min-h-0 flex-1 gap-4 overflow-y-auto p-6 md:grid-cols-2">
          <Field label="Task Name" required error={errors.title}>
            <input
              value={form.title}
              onChange={(event) => updateField("title", event.target.value)}
              className={inputClass}
              placeholder="Task name"
            />
          </Field>
          <Field label="Project" required>
            <input
              value={project.name || ""}
              readOnly
              className={`${inputClass} bg-slate-50 text-slate-500`}
            />
          </Field>
          <Field label="Task Description" className="md:col-span-2">
            <textarea
              value={form.description}
              onChange={(event) => updateField("description", event.target.value)}
              className={`${inputClass} min-h-[90px] resize-y`}
              placeholder="Task description"
            />
          </Field>
          <Field label="Assigned To" required error={errors.owner}>
            <input
              value={form.owner}
              onChange={(event) => updateField("owner", event.target.value)}
              className={inputClass}
              placeholder="Task owner"
            />
          </Field>
          <Field label="Assigned By">
            <input
              value={form.assignedBy}
              onChange={(event) => updateField("assignedBy", event.target.value)}
              className={inputClass}
              placeholder="Enter assigner's name"
            />
          </Field>
          <Field label="Milestone" required error={errors.milestoneId}>
            <SelectField value={String(form.milestoneId || "")} onChange={(value) => updateField("milestoneId", value)}>
              <option value="">Select milestone</option>
              {(project.milestones || []).map((milestone) => (
                <option key={milestone.id} value={milestone.id}>
                  {milestone.stage || "Implement"} · {milestone.name || milestone.milestoneName}
                </option>
              ))}
            </SelectField>
          </Field>
          <Field label="Start Date">
            <DateInput
              value={form.startDate}
              onChange={(value) => updateField("startDate", value || "")}
              className={inputClass}
            />
          </Field>
          <Field label="Due Date" required error={errors.dueDate}>
            <DateInput
              value={form.dueDate}
              onChange={(value) => updateField("dueDate", value || "")}
              className={inputClass}
            />
          </Field>
          <Field label="Priority">
            <SelectField
              value={form.priority}
              onChange={(value) => updateField("priority", value)}
            >
              {PRIORITY_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </SelectField>
          </Field>
          <Field label="Status">
            <SelectField
              value={form.status}
              onChange={(value) => updateField("status", value)}
            >
              {TASK_STATUS_OPTIONS.filter((option) => option !== "Partial").map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </SelectField>
          </Field>
          <Field label="Estimated Hours">
            <input
              type="number"
              min="0"
              value={form.estimatedHours}
              onChange={(event) =>
                updateField("estimatedHours", event.target.value)
              }
              className={inputClass}
              placeholder="0"
            />
          </Field>
          <Field label="Dependencies">
            <input
              value={form.dependencies}
              onChange={(event) => updateField("dependencies", event.target.value)}
              className={inputClass}
              placeholder="Task IDs or dependency notes"
            />
          </Field>
          <Field label="Attachments upload">
            <input
              type="file"
              multiple
              onChange={(event) =>
                updateField(
                  "attachments",
                  Array.from(event.target.files || []).map((file) => file.name)
                )
              }
              className={`${inputClass} file:mr-3 file:rounded-md file:border-0 file:bg-indigo-50 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-indigo-700`}
            />
          </Field>
          <Field label="Comments" className="md:col-span-2">
            <textarea
              value={form.comments}
              onChange={(event) => updateField("comments", event.target.value)}
              className={`${inputClass} min-h-[90px] resize-y`}
              placeholder="Comments"
            />
          </Field>
        </div>
        <div className="flex justify-end gap-3 border-t border-slate-200 bg-slate-50 px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-100"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={assignTask}
            className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700"
          >
            <UserPlus className="h-4 w-4" />
            Assign Task
          </button>
        </div>
      </div>
    </div>
  );
};

const EmptyState = ({ onCreate }) => (
  <div className="flex min-h-[340px] flex-col items-center justify-center px-6 py-12 text-center">
    <span className="grid h-16 w-16 place-items-center rounded-xl bg-indigo-50 text-indigo-600">
      <FolderKanban className="h-8 w-8" />
    </span>
    <h3 className="mt-5 text-lg font-semibold text-slate-950">
      No project records have been created yet
    </h3>
    <p className="mt-2 max-w-xl text-sm text-slate-500">
      Create the first project to start tracking work, team, inventory, and costs.
    </p>
    <button
      type="button"
      onClick={onCreate}
      className="mt-5 inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700"
    >
      <Plus className="h-4 w-4" />
      Create Project
    </button>
  </div>
);

const DetailRow = ({ label, value }) => (
  <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
      {label}
    </p>
    <p className="mt-1 text-sm font-medium text-slate-900">{value || "-"}</p>
  </div>
);

const DetailTabButton = ({ tab, active, onClick }) => {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex min-w-max items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition ${
        active
          ? "bg-indigo-600 text-white shadow-sm"
          : "border border-slate-200 bg-white text-slate-600 hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-700"
      }`}
    >
      {createElement(tab.icon, { className: "h-4 w-4" })}
      {tab.label}
    </button>
  );
};

const presentRecordValue = (value) => {
  if (value === 0) return "0";
  if (Array.isArray(value)) return value.filter(Boolean).join(", ") || "-";
  return value || "-";
};

const recordQuantity = (record, value) =>
  record.unit === "INR"
    ? formatInrCurrency(value)
    : `${formatQuantity(value)}${record.unit ? ` ${record.unit}` : ""}`;

const getRecordDetailConfig = ({ type, record }, project) => {
  const base = {
    eyebrow: "Project record",
    icon: Eye,
    title: "Record details",
    subtitle: project.name || "Project",
    status: "",
    secondaryStatus: "",
    highlights: [],
    fields: [],
  };

  if (type === "task") {
    return {
      ...base,
      eyebrow: "Task record",
      icon: ListChecks,
      title: getTaskName(record) || "Task details",
      subtitle: record.taskId || record.id || project.code,
      status: getTaskStatus(record),
      secondaryStatus: record.priority || "Medium",
      highlights: [
        { label: "Progress", value: `${getTaskProgress(record)}%` },
        { label: "Estimated", value: `${numberValue(record.estimatedHours)} hrs` },
        { label: "Actual", value: `${numberValue(record.actualHours)} hrs` },
      ],
      fields: [
        { label: "Assigned To", value: getAssignedTo(record) },
        { label: "Assigned By", value: getAssignedBy(record, project) },
        { label: "Start Date", value: formatDateValue(record.startDate) },
        { label: "Due Date", value: formatDateValue(record.dueDate) },
        { label: "Dependencies", value: record.dependencies },
        { label: "Parent Task", value: record.parentTask },
        { label: "Attachments", value: record.attachments },
        { label: "Comments", value: record.comments, wide: true },
        {
          label: "Description",
          value: getTaskDescription(record) || "No task description recorded.",
          wide: true,
        },
      ],
    };
  }

  if (type === "team") {
    const allocation = numberValue(
      record.allocationPercent ?? String(record.allocation || "").replace("%", "")
    );
    return {
      ...base,
      eyebrow: "Team allocation",
      icon: Users,
      title: record.employee || record.member || "Team member",
      subtitle: record.role || "Project resource",
      status: TEAM_STATUS_OPTIONS.includes(record.status) ? record.status : "Active",
      secondaryStatus: TEAM_AVAILABILITY_OPTIONS.includes(record.availability)
        ? record.availability
        : "Available",
      highlights: [
        { label: "Allocation", value: `${allocation}%` },
        { label: "Department", value: record.department || project.department || "-" },
        { label: "Role", value: record.role || "-" },
      ],
      fields: [
        { label: "Employee ID", value: record.employeeId || record.id },
        { label: "Department", value: record.department || project.department },
        { label: "Allocation Start", value: formatDateValue(record.startDate || project.startDate) },
        { label: "Allocation End", value: formatDateValue(record.endDate || project.endDate) },
        { label: "Availability", value: record.availability || "Available" },
        { label: "Resource Status", value: record.status || "Active" },
      ],
    };
  }

  if (type === "milestone") {
    return {
      ...base,
      eyebrow: "Milestone record",
      icon: CheckCircle2,
      title: record.name || record.milestoneName || "Milestone details",
      subtitle: record.milestoneNumber || record.id || project.code,
      status: MILESTONE_STATUS_OPTIONS.includes(record.status) ? record.status : "Pending",
      highlights: [
        { label: "Progress", value: `${percentValue(record.progress)}%` },
        { label: "Owner", value: record.owner || record.responsiblePerson || "-" },
        { label: "Target", value: formatDateValue(record.targetDate) },
      ],
      fields: [
        { label: "Owner", value: record.owner || record.responsiblePerson },
        { label: "Start Date", value: formatDateValue(record.startDate) },
        { label: "Target Date", value: formatDateValue(record.targetDate) },
        { label: "Completion Date", value: formatDateValue(record.completionDate) },
        { label: "Linked Tasks", value: record.taskIds || record.linkedTasks },
        {
          label: "Description",
          value: record.description || "No milestone description recorded.",
          wide: true,
        },
      ],
    };
  }

  if (type === "inventory") {
    const required = record.requiredQty ?? record.reserved;
    const issued = record.issuedQty ?? record.issued;
    const remaining =
      record.remainingQty ?? numberValue(required) - numberValue(issued);
    return {
      ...base,
      eyebrow: "Inventory allocation",
      icon: Boxes,
      title: record.itemName || record.item || "Inventory item",
      subtitle: record.itemCode || record.id || project.code,
      status: INVENTORY_STATUS_OPTIONS.includes(record.status)
        ? record.status
        : "Requested",
      highlights: [
        { label: "Required", value: recordQuantity(record, required) },
        { label: "Issued", value: recordQuantity(record, issued) },
        { label: "Remaining", value: recordQuantity(record, remaining) },
      ],
      fields: [
        { label: "Item Code", value: record.itemCode },
        { label: "Category", value: record.category },
        { label: "Unit", value: record.unit },
        { label: "Store Location", value: record.storeLocation },
        { label: "Issue Date", value: formatDateValue(record.issueDate) },
        { label: "Allocation Status", value: record.status || "Requested" },
      ],
    };
  }

  if (type === "purchase") {
    return {
      ...base,
      eyebrow: "Purchase record",
      icon: ReceiptText,
      title: record.poNumber || record.reference || "Purchase details",
      subtitle: record.vendor || project.name,
      status: PURCHASE_STATUS_OPTIONS.includes(record.status) ? record.status : "Requested",
      highlights: [
        { label: "Amount", value: formatInrCurrency(record.amount) },
        { label: "Expected", value: formatDateValue(record.expectedDelivery || record.eta) },
        { label: "Delivered", value: formatDateValue(record.actualDelivery) },
      ],
      fields: [
        { label: "Vendor", value: record.vendor },
        { label: "Linked Task", value: record.linkedTask },
        { label: "Expected Delivery", value: formatDateValue(record.expectedDelivery || record.eta) },
        { label: "Actual Delivery", value: formatDateValue(record.actualDelivery) },
        {
          label: "Item Summary",
          value: record.itemSummary || record.summary || "No item summary recorded.",
          wide: true,
        },
      ],
    };
  }

  if (type === "financial") {
    return {
      ...base,
      eyebrow: "Financial record",
      icon: CircleDollarSign,
      title: record.category || record.label || record.type || "Cost details",
      subtitle: `${project.code || "Project"} cost ledger`,
      status: record.status || "On Track",
      highlights: [
        { label: "Budget", value: formatInrCurrency(record.budget) },
        { label: "Actual", value: formatInrCurrency(record.actual) },
        { label: "Variance", value: formatInrCurrency(record.variance) },
      ],
      fields: [
        { label: "Cost Category", value: record.category || record.label || record.type },
        { label: "Budget", value: formatInrCurrency(record.budget) },
        { label: "Actual Spend", value: formatInrCurrency(record.actual) },
        { label: "Variance", value: formatInrCurrency(record.variance) },
        { label: "Ledger Status", value: record.status || "On Track" },
      ],
    };
  }

  if (type === "document") {
    return {
      ...base,
      eyebrow: "Document record",
      icon: FileText,
      title: record.name || record.fileName || "Document details",
      subtitle: record.category || "Project document",
      status: record.status || record.category || "Available",
      highlights: [
        { label: "File Size", value: record.size || "-" },
        { label: "Uploaded", value: formatDateValue(record.uploadedDate || record.date) },
        { label: "Version", value: record.version || record.revision || "Current" },
      ],
      fields: [
        { label: "Category", value: record.category || "Reports" },
        { label: "Uploaded By", value: record.uploadedBy },
        { label: "Uploaded Date", value: formatDateValue(record.uploadedDate || record.date) },
        { label: "File Size", value: record.size },
        { label: "Version", value: record.version || record.revision || "Current" },
        { label: "File Type", value: record.fileType || record.type },
        { label: "Description", value: record.description, wide: true },
      ],
    };
  }

  if (type === "activity") {
    return {
      ...base,
      eyebrow: "Activity record",
      icon: Activity,
      title: record.title || "Activity details",
      subtitle: formatDateValue(record.date),
      status: "Recorded",
      highlights: [
        { label: "Actor", value: record.actor || "Project office" },
        {
          label: "Time",
          value: record.date
            ? new Date(record.date).toLocaleTimeString("en-IN", {
                hour: "2-digit",
                minute: "2-digit",
              })
            : "-",
        },
        { label: "Project", value: project.code || project.name || "-" },
      ],
      fields: [
        { label: "Recorded By", value: record.actor || "Project office" },
        { label: "Activity Date", value: formatDateValue(record.date) },
        {
          label: "Description",
          value: record.description || "No additional activity details recorded.",
          wide: true,
        },
      ],
    };
  }

  return base;
};

const RecordDetailModal = ({ detail, project, onClose }) => {
  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const config = getRecordDetailConfig(detail, project);

  return (
    <div
      className="fixed inset-0 z-[70] grid place-items-center overflow-y-auto bg-slate-950/50 p-4 sm:p-6"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-label={config.title}
        className="my-auto w-full max-w-3xl overflow-hidden rounded-xl border border-slate-200 bg-white shadow-[0_24px_70px_rgba(15,23,42,0.24)]"
      >
        <div className="h-1 bg-indigo-600" />
        <header className="border-b border-slate-200 bg-white px-6 py-5 sm:px-7">
          <div className="flex items-start justify-between gap-5">
            <div className="flex min-w-0 items-start gap-3.5">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-indigo-50 text-indigo-600 ring-1 ring-inset ring-indigo-100">
                {createElement(config.icon, { className: "h-5 w-5" })}
              </span>
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-indigo-600">
                  {config.eyebrow}
                </p>
                <h2 className="mt-1 break-words text-xl font-semibold text-slate-950">
                  {config.title}
                </h2>
                <p className="mt-1 text-sm text-slate-500">{config.subtitle}</p>
              </div>
            </div>
            <div className="flex shrink-0 items-start gap-3">
              <div className="hidden flex-wrap justify-end gap-2 sm:flex">
                {config.status ? <StatusPill label={config.status} /> : null}
                {config.secondaryStatus ? (
                  <Badge label={config.secondaryStatus} type="priority" />
                ) : null}
              </div>
              <button
                type="button"
                onClick={onClose}
                className="grid h-9 w-9 place-items-center rounded-lg border border-slate-200 bg-white text-slate-500 transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900"
                aria-label="Close record details"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2 sm:hidden">
            {config.status ? <StatusPill label={config.status} /> : null}
            {config.secondaryStatus ? (
              <Badge label={config.secondaryStatus} type="priority" />
            ) : null}
          </div>
        </header>

        <div className="max-h-[68vh] overflow-y-auto bg-white">
          {config.highlights.length ? (
            <div className="grid border-b border-slate-200 bg-slate-50 sm:grid-cols-3 sm:divide-x sm:divide-slate-200">
              {config.highlights.map((item) => (
                <div
                  key={item.label}
                  className="border-b border-slate-200 px-6 py-4 last:border-b-0 sm:border-b-0"
                >
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    {item.label}
                  </p>
                  <p className="mt-1.5 break-words text-base font-semibold text-slate-900">
                    {presentRecordValue(item.value)}
                  </p>
                </div>
              ))}
            </div>
          ) : null}

          <div className="px-6 py-6 sm:px-7">
            <div className="mb-4 flex items-end justify-between gap-4">
              <div>
                <h3 className="text-sm font-semibold text-slate-950">Details</h3>
                <p className="mt-1 text-xs text-slate-500">
                  Information recorded for this item.
                </p>
              </div>
              <span className="text-xs font-medium text-slate-400">
                {config.fields.length} fields
              </span>
            </div>
            <dl className="grid overflow-hidden rounded-lg border border-slate-200 sm:grid-cols-2">
              {config.fields.map((field) => (
                <div
                  key={field.label}
                  className={`border-b border-slate-200 px-4 py-3.5 last:border-b-0 sm:px-5 ${
                    field.wide
                      ? "sm:col-span-2"
                      : "sm:border-r sm:even:border-r-0"
                  }`}
                >
                  <dt className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
                    {field.label}
                  </dt>
                  <dd className="mt-1.5 whitespace-pre-wrap break-words text-sm font-medium leading-5 text-slate-900">
                    {presentRecordValue(field.value)}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        </div>

        <footer className="flex items-center justify-between gap-4 border-t border-slate-200 bg-slate-50 px-6 py-3.5 sm:px-7">
          <p className="hidden text-xs text-slate-500 sm:block">
            {project.code || project.name} · Project Management
          </p>
          <button
            type="button"
            onClick={onClose}
            className="ml-auto rounded-lg bg-indigo-600 px-5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700"
          >
            Close
          </button>
        </footer>
      </section>
    </div>
  );
};

const ProjectPrintTable = ({ title, columns, rows, emptyMessage }) => (
  <section className="details-section">
    <h3>{title}</h3>
    {rows.length ? (
      <table>
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column.label}>{column.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={row.id || `${title}-${rowIndex}`}>
              {columns.map((column) => (
                <td key={column.label}>
                  {column.render ? column.render(row) : row[column.key] || "-"}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    ) : (
      <p>{emptyMessage || `No ${title.toLowerCase()} available.`}</p>
    )}
  </section>
);

const ProjectCompleteFilePrint = ({ project }) => {
  const budget = getBudget(project);
  const expenses = getExpenses(project);
  const tasks = project.tasks || [];
  const team = project.teamAllocations || [];
  const milestones = project.milestones || [];
  const inventory = project.inventoryAllocations || [];
  const purchases = project.purchases || [];
  const financials = getCostBreakdownRows(project);
  const documents = project.documents || [];
  const activities = project.activities || [];

  return (
    <div
      id="project-complete-file-print"
      className="fixed left-[-10000px] top-0 w-[1000px] bg-white p-6 text-slate-900"
      aria-hidden="true"
    >
      <section className="details-section">
        <h3>Project Overview</h3>
        {[
          ["Project Name", project.name],
          ["Project Code", project.code],
          ["Client", project.client || project.companyName],
          ["Category", project.projectCategory],
          ["Status", getProjectStatus(project)],
          ["Priority", project.priority],
          ["Project Manager", project.projectManager],
          ["Site Engineer", project.siteEngineer],
          ["Team Lead", project.teamLead],
          ["Department", project.department],
          ["Start Date", formatDateValue(project.startDate)],
          ["Planned End Date", formatDateValue(project.endDate)],
          ["Actual End Date", formatDateValue(project.actualEndDate)],
          ["Progress", `${getProgress(project)}%`],
          ["Approved Budget", formatInrCurrency(budget)],
          ["Recorded Spend", formatInrCurrency(expenses)],
          ["Remaining Budget", formatInrCurrency(Math.max(budget - expenses, 0))],
        ].map(([label, value]) => (
          <div className="details-row" key={label}>
            <span className="details-label">{label}</span>
            <span className="details-value">{value || "-"}</span>
          </div>
        ))}
      </section>

      <section className="details-section">
        <h3>Scope and Site Details</h3>
        {[
          ["Description", project.description || project.notes],
          ["Locations", (project.locations || []).map((location) => location.name).filter(Boolean).join(", ") || project.siteName],
          ["Site Address", project.siteAddress || project.address],
          ["City / State", [project.city, project.state].filter(Boolean).join(", ")],
          ["Site Contact", project.siteContactPerson],
          ["Site Contact Number", project.siteContactNumber],
        ].map(([label, value]) => (
          <div className="details-row" key={label}>
            <span className="details-label">{label}</span>
            <span className="details-value">{value || "-"}</span>
          </div>
        ))}
      </section>

      <ProjectPrintTable
        title="Tasks"
        rows={tasks}
        columns={[
          { label: "Task", render: (row) => getTaskName(row) },
          { label: "Assigned To", render: (row) => getAssignedTo(row) },
          { label: "Due Date", render: (row) => formatDateValue(row.dueDate) },
          { label: "Priority", key: "priority" },
          { label: "Status", render: (row) => getTaskStatus(row) },
          { label: "Progress", render: (row) => `${getTaskProgress(row)}%` },
        ]}
      />
      <ProjectPrintTable
        title="Team Allocation"
        rows={team}
        columns={[
          { label: "Team Member", render: (row) => row.employee || row.member },
          { label: "Role", key: "role" },
          { label: "Department", key: "department" },
          {
            label: "Allocation",
            render: (row) => row.allocation || `${row.allocationPercent || 0}%`,
          },
          { label: "Availability", key: "availability" },
          { label: "Status", key: "status" },
        ]}
      />
      <ProjectPrintTable
        title="Milestones"
        rows={milestones}
        columns={[
          { label: "Milestone", key: "name" },
          { label: "Owner", key: "owner" },
          { label: "Target Date", render: (row) => formatDateValue(row.targetDate) },
          {
            label: "Completion Date",
            render: (row) => formatDateValue(row.completionDate),
          },
          { label: "Status", key: "status" },
        ]}
      />
      <ProjectPrintTable
        title="Inventory Allocation"
        rows={inventory}
        columns={[
          { label: "Item", render: (row) => row.itemName || row.item || row.name },
          { label: "Code", render: (row) => row.itemCode || row.code },
          { label: "Required", render: (row) => `${row.requiredQty || 0} ${row.unit || ""}` },
          { label: "Issued", render: (row) => `${row.issuedQty || 0} ${row.unit || ""}` },
          { label: "Store", key: "storeLocation" },
          { label: "Status", key: "status" },
        ]}
      />
      <ProjectPrintTable
        title="Purchases"
        rows={purchases}
        columns={[
          { label: "PO Number", render: (row) => row.poNumber || row.reference },
          { label: "Vendor", render: (row) => row.vendor || row.vendorName },
          { label: "Items", render: (row) => row.itemSummary || row.summary },
          {
            label: "Amount",
            render: (row) => formatInrCurrency(row.amount || row.total),
          },
          {
            label: "Expected",
            render: (row) =>
              formatDateValue(row.expectedDelivery || row.expectedDate),
          },
          { label: "Status", key: "status" },
        ]}
      />
      <ProjectPrintTable
        title="Financial Summary"
        rows={financials}
        columns={[
          { label: "Category", key: "category" },
          { label: "Budget", render: (row) => formatInrCurrency(row.budget) },
          { label: "Actual", render: (row) => formatInrCurrency(row.actual) },
          { label: "Variance", render: (row) => formatInrCurrency(row.variance) },
          { label: "Status", key: "status" },
        ]}
      />
      <ProjectPrintTable
        title="Documents"
        rows={documents}
        columns={[
          { label: "Document", render: (row) => row.name || row.fileName },
          { label: "Category", key: "category" },
          { label: "Uploaded By", key: "uploadedBy" },
          {
            label: "Uploaded Date",
            render: (row) => formatDateValue(row.uploadedDate || row.createdAt),
          },
          { label: "Size", key: "size" },
        ]}
      />
      <ProjectPrintTable
        title="Activity History"
        rows={activities}
        columns={[
          { label: "Activity", key: "title" },
          { label: "Description", key: "description" },
          { label: "Actor", key: "actor" },
          { label: "Date", render: (row) => formatDateValue(row.date) },
        ]}
      />
    </div>
  );
};

const ProjectDetailDrawer = ({
  project,
  initialTab,
  onClose,
  onEdit,
  onAssignTask,
}) => {
  const [activeTab, setActiveTab] = useState(initialTab || "overview");
  const [recordDetail, setRecordDetail] = useState(null);
  const [taskSearch, setTaskSearch] = useState("");
  const [taskStatusFilter, setTaskStatusFilter] = useState("All");
  const [taskPriorityFilter, setTaskPriorityFilter] = useState("All");
  const [taskAssignedToFilter, setTaskAssignedToFilter] = useState("All");
  const [taskDueDateFilter, setTaskDueDateFilter] = useState("All");

  if (!project) return null;

  const status = getProjectStatus(project);
  const progress = getProgress(project);
  const budget = getBudget(project);
  const expenses = getExpenses(project);
  const remaining = Math.max(0, budget - expenses);
  const taskStats = getTaskStats(project);
  const projectHealth = getProjectHealth(project);
  const budgetConsumed = getBudgetConsumedPercent(project);
  const materialAllocated = getMaterialAllocatedPercent(project);
  const resourceUtilization = getUtilization(project);
  const daysRemaining = getDaysRemaining(project);
  const openIssues = getOpenIssues(project);

  const taskRows = project.tasks || [];
  const teamRows = project.teamAllocations || [];
  const milestoneRows = project.milestones || [];
  const inventoryRows = project.inventoryAllocations || [];
  const purchaseRows = project.purchases || [];
  const documentRows = project.documents || [];
  const activityRows = project.activities || [];
  const costBreakdownRows = getCostBreakdownRows(project);
  const documentFolderCounts = getDocumentFolderCounts(documentRows);
  const activityGroups = groupActivitiesByDate(activityRows);
  const activityDates = Object.keys(activityGroups).sort((a, b) =>
    String(b).localeCompare(String(a))
  );
  const assignedToOptions = Array.from(
    new Set(taskRows.map((task) => getAssignedTo(task)).filter(Boolean))
  );
  const filteredTaskRows = taskRows.filter((task) => {
    const term = taskSearch.trim().toLowerCase();
    const taskStatus = getTaskStatus(task);
    const assignedTo = getAssignedTo(task);
    const dueDate = task.dueDate || "";
    if (taskStatusFilter !== "All" && taskStatus !== taskStatusFilter) return false;
    if (taskPriorityFilter !== "All" && task.priority !== taskPriorityFilter) return false;
    if (taskAssignedToFilter !== "All" && assignedTo !== taskAssignedToFilter) return false;
    if (taskDueDateFilter === "Overdue" && !isPastDate(dueDate)) return false;
    if (taskDueDateFilter === "Upcoming" && (isPastDate(dueDate) || !dueDate)) {
      return false;
    }
    if (!term) return true;
    return [
      task.taskId,
      getTaskName(task),
      getTaskDescription(task),
      assignedTo,
      getAssignedBy(task, project),
      task.priority,
      taskStatus,
      task.dependencies,
    ]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(term));
  });

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/45 backdrop-blur-sm">
      <div className="ml-auto flex h-full w-[1180px] max-w-full flex-col bg-white shadow-2xl">
        <div className="border-b border-slate-200 bg-slate-50 px-6 py-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <Badge label={status} />
                <Badge label={project.priority || "Medium"} type="priority" />
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <DetailRow
                  label="Project Name"
                  value={project.name || "Untitled project"}
                />
                <DetailRow label="Project Code" value={project.code || "No code"} />
                <DetailRow
                  label="Client"
                  value={project.client || project.companyName || "No client"}
                />
                <DetailRow
                  label="Project Manager"
                  value={project.projectManager || "Not assigned"}
                />
              </div>
              <div className="mt-4 grid gap-3 xl:grid-cols-[1fr_1fr_1fr]">
                <div className="rounded-lg border border-slate-200 bg-white p-3">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Progress
                    </span>
                    <span className="text-sm font-bold text-slate-950">
                      {progress}%
                    </span>
                  </div>
                  <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-slate-200">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-indigo-600 to-emerald-500"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                </div>
                <DetailRow
                  label="Budget Used vs Approved"
                  value={`${formatInrCurrency(expenses)} / ${formatInrCurrency(budget)}`}
                />
                <DetailRow
                  label="Timeline"
                  value={`${formatDateValue(project.startDate)} to ${formatDateValue(
                    project.endDate
                  )}`}
                />
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() =>
                  void printSection({
                    selector: "#project-complete-file-print",
                    title: "Complete Project File",
                    subtitle: [project.code, project.name]
                      .filter(Boolean)
                      .join(" - "),
                    metaRows: [
                      { label: "Status", value: status },
                      { label: "Project Manager", value: project.projectManager || "-" },
                      {
                        label: "Timeline",
                        value: `${formatDateValue(project.startDate)} to ${formatDateValue(
                          project.endDate
                        )}`,
                      },
                      { label: "Budget", value: formatInrCurrency(budget) },
                    ],
                  })
                }
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-700"
              >
                <Printer className="h-4 w-4" />
                Print Complete File
              </button>
              <button
                type="button"
                onClick={() => onAssignTask(project)}
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-indigo-200 bg-white px-4 py-2.5 text-sm font-semibold text-indigo-700 transition hover:bg-indigo-50"
              >
                <UserPlus className="h-4 w-4" />
                Assign Task
              </button>
              <button
                type="button"
                onClick={() => onEdit(project)}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-700"
              >
                <Pencil className="h-4 w-4" />
                Edit
              </button>
              <button
                type="button"
                onClick={onClose}
                className="grid h-10 w-10 place-items-center rounded-lg border border-slate-200 bg-white text-slate-500 transition hover:border-slate-300 hover:text-slate-900"
                aria-label="Close"
                title="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <MetricPill label="Start Date" value={formatDateValue(project.startDate)} />
            <MetricPill
              label="Planned End Date"
              value={formatDateValue(project.endDate)}
            />
            <MetricPill label="Budget Consumed" value={`${budgetConsumed}%`} />
            <MetricPill label="Resource Utilization" value={`${resourceUtilization}%`} />
          </div>
        </div>

        <div className="border-b border-slate-200 px-6 py-3">
          <div className="flex gap-2 overflow-x-auto pb-1">
            {detailTabs.map((tab) => (
              <DetailTabButton
                key={tab.id}
                tab={tab}
                active={activeTab === tab.id}
                onClick={() => setActiveTab(tab.id)}
              />
            ))}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto bg-slate-50/70 p-6">
          {activeTab === "overview" && (
            <div className="space-y-5">
              <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                {[
                  ["Project Health", projectHealth, projectHealth],
                  ["Completed Tasks", taskStats.completed, "Completed"],
                  ["Pending Tasks", taskStats.pending, "Assigned"],
                  ["Overdue Tasks", taskStats.overdue, taskStats.overdue ? "Critical" : "Healthy"],
                  ["Budget Consumed %", `${budgetConsumed}%`, budgetConsumed > 90 ? "Critical" : "Healthy"],
                  ["Materials Allocated %", `${materialAllocated}%`, "Approved"],
                  ["Resource Utilization %", `${resourceUtilization}%`, resourceUtilization > 90 ? "Critical" : "Healthy"],
                  ["Days Remaining", daysRemaining, typeof daysRemaining === "string" ? "Critical" : "Healthy"],
                  ["Open Issues", openIssues, openIssues ? "Risk" : "Healthy"],
                ].map(([label, value, tone]) => (
                  <article
                    key={label}
                    className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
                  >
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      {label}
                    </p>
                    <div className="mt-3">
                      {label === "Project Health" ? (
                        <StatusPill label={value} />
                      ) : (
                        <p
                          className={`text-2xl font-bold ${
                            getStatusPillClass(tone).includes("rose")
                              ? "text-rose-700"
                              : "text-slate-950"
                          }`}
                        >
                          {value}
                        </p>
                      )}
                    </div>
                  </article>
                ))}
              </section>

              <section className={sectionClass}>
                <SectionTitle
                  icon={FolderKanban}
                  title="Project Summary"
                  subtitle="Client, site, responsibility, timeline, and scope."
                />
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  <DetailRow label="Client" value={project.client || project.companyName} />
                  <DetailRow label="Department" value={project.department} />
                  <DetailRow label="Locations" value={(project.locations || []).map((location) => location.name).filter(Boolean).join(", ") || project.siteName} />
                  <DetailRow
                    label="Site Address"
                    value={project.siteAddress || project.address}
                  />
                  <DetailRow label="Project Manager" value={project.projectManager} />
                  <DetailRow label="Site Engineer" value={project.siteEngineer} />
                  <DetailRow label="Team Lead" value={project.teamLead} />
                  <DetailRow label="Start Date" value={formatDateValue(project.startDate)} />
                  <DetailRow
                    label="Planned End Date"
                    value={formatDateValue(project.endDate)}
                  />
                  <DetailRow
                    label="Actual End Date"
                    value={formatDateValue(project.actualEndDate)}
                  />
                </div>
                <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm leading-6 text-slate-600">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Description
                  </p>
                  <p className="mt-2">
                    {project.description || project.notes || "No project description recorded."}
                  </p>
                </div>
              </section>
            </div>
          )}

          {activeTab === "tasks" && (
            <section className={sectionClass}>
              <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <SectionTitle
                  icon={ListChecks}
                  title="Tasks"
                  subtitle="Assigned tasks, owners, status, hours, dependencies, and progress."
                />
                <button
                  type="button"
                  onClick={() => onAssignTask(project)}
                  className="inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700"
                >
                  <UserPlus className="h-4 w-4" />
                  Assign Task
                </button>
              </div>
              <div className="mb-4 grid gap-3 lg:grid-cols-[1fr_repeat(4,170px)]">
                <label className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    value={taskSearch}
                    onChange={(event) => setTaskSearch(event.target.value)}
                    placeholder="Search tasks..."
                    className={`${inputClass} pl-9`}
                  />
                </label>
                <SelectField value={taskStatusFilter} onChange={setTaskStatusFilter}>
                  <option value="All">All Status</option>
                  {TASK_STATUS_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </SelectField>
                <SelectField value={taskPriorityFilter} onChange={setTaskPriorityFilter}>
                  <option value="All">All Priority</option>
                  {PRIORITY_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </SelectField>
                <SelectField
                  value={taskAssignedToFilter}
                  onChange={setTaskAssignedToFilter}
                >
                  <option value="All">All Assigned To</option>
                  {assignedToOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </SelectField>
                <SelectField value={taskDueDateFilter} onChange={setTaskDueDateFilter}>
                  <option value="All">All Due Dates</option>
                  <option value="Upcoming">Upcoming</option>
                  <option value="Overdue">Overdue</option>
                </SelectField>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-[1600px] w-full text-sm">
                  <thead className="bg-slate-100 text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-4 py-3 text-left font-semibold">Task ID</th>
                      <th className="px-4 py-3 text-left font-semibold">Task Name</th>
                      <th className="px-4 py-3 text-left font-semibold">Description</th>
                      <th className="px-4 py-3 text-left font-semibold">Stage</th>
                      <th className="px-4 py-3 text-left font-semibold">Milestone</th>
                      <th className="px-4 py-3 text-left font-semibold">Assigned To</th>
                      <th className="px-4 py-3 text-left font-semibold">Assigned By</th>
                      <th className="px-4 py-3 text-left font-semibold">Start Date</th>
                      <th className="px-4 py-3 text-left font-semibold">Due Date</th>
                      <th className="px-4 py-3 text-left font-semibold">Priority</th>
                      <th className="px-4 py-3 text-left font-semibold">Status</th>
                      <th className="px-4 py-3 text-left font-semibold">Progress</th>
                      <th className="px-4 py-3 text-right font-semibold">
                        Estimated Hours
                      </th>
                      <th className="px-4 py-3 text-right font-semibold">
                        Actual Hours
                      </th>
                      <th className="px-4 py-3 text-left font-semibold">
                        Dependencies
                      </th>
                      <th className="px-4 py-3 text-left font-semibold">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {filteredTaskRows.length === 0 ? (
                      <tr>
                        <td colSpan="16" className="px-4 py-10 text-center text-slate-500">
                          No tasks assigned yet.
                        </td>
                      </tr>
                    ) : (
                      filteredTaskRows.map((task, index) => (
                        <tr key={task.id}>
                          <td className="px-4 py-3 font-semibold text-slate-700">
                            {task.taskId || `TSK-${String(index + 1).padStart(3, "0")}`}
                          </td>
                          <td className="px-4 py-3 font-semibold text-slate-900">
                            {getTaskName(task) || "-"}
                          </td>
                          <td className="px-4 py-3 text-slate-600">
                            <span className="line-clamp-2">
                              {getTaskDescription(task) || "-"}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-slate-600">{task.stage || "Implement"}</td>
                          <td className="px-4 py-3 text-slate-600">{task.milestoneName || "-"}</td>
                          <td className="px-4 py-3 text-slate-600">
                            {getAssignedTo(task) || "-"}
                          </td>
                          <td className="px-4 py-3 text-slate-600">
                            {getAssignedBy(task, project)}
                          </td>
                          <td className="px-4 py-3 text-slate-600">
                            {formatDateValue(task.startDate)}
                          </td>
                          <td className="px-4 py-3 text-slate-600">
                            {formatDateValue(task.dueDate)}
                          </td>
                          <td className="px-4 py-3">
                            <Badge label={task.priority || "Medium"} type="priority" />
                          </td>
                          <td className="px-4 py-3">
                            <StatusPill label={getTaskStatus(task)} />
                          </td>
                          <td className="px-4 py-3">
                            <ProgressMeter value={getTaskProgress(task)} />
                          </td>
                          <td className="px-4 py-3 text-right font-semibold text-slate-900">
                            {numberValue(task.estimatedHours).toLocaleString("en-IN")}
                          </td>
                          <td className="px-4 py-3 text-right text-slate-600">
                            {numberValue(task.actualHours).toLocaleString("en-IN")}
                          </td>
                          <td className="px-4 py-3 text-slate-600">
                            {task.dependencies || "-"}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex gap-2">
                              <TableActionButton
                                onClick={() => setRecordDetail({ type: "task", record: task })}
                              >
                                <Eye className="h-3.5 w-3.5" />
                                View
                              </TableActionButton>
                              <TableActionButton>Edit</TableActionButton>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {activeTab === "team" && (
            <section className={sectionClass}>
              <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <SectionTitle
                  icon={Users}
                  title="Team"
                  subtitle="Team allocation, availability, and active resource status."
                />
                <button
                  type="button"
                  className="inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700"
                >
                  <Plus className="h-4 w-4" />
                  Add Resource
                </button>
              </div>
              <div className="grid gap-3 md:grid-cols-3">
                <MetricPill label="Team Size" value={getTeamSize(project)} />
                <MetricPill
                  label="Resource Utilization"
                  value={`${getUtilization(project)}%`}
                />
                <MetricPill
                  label="Responsible Department"
                  value={project.department || "Not assigned"}
                />
              </div>
              <div className="mt-5 overflow-x-auto">
                <table className="min-w-[980px] w-full text-sm">
                  <thead className="bg-slate-100 text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-4 py-3 text-left font-semibold">Employee</th>
                      <th className="px-4 py-3 text-left font-semibold">Role</th>
                      <th className="px-4 py-3 text-left font-semibold">Department</th>
                      <th className="px-4 py-3 text-right font-semibold">Allocation %</th>
                      <th className="px-4 py-3 text-left font-semibold">Start Date</th>
                      <th className="px-4 py-3 text-left font-semibold">End Date</th>
                      <th className="px-4 py-3 text-left font-semibold">Availability</th>
                      <th className="px-4 py-3 text-left font-semibold">Status</th>
                      <th className="px-4 py-3 text-left font-semibold">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {teamRows.length === 0 ? (
                      <tr>
                        <td colSpan="9" className="px-4 py-10 text-center text-slate-500">
                          No team members allocated yet.
                        </td>
                      </tr>
                    ) : (
                      teamRows.map((member) => (
                        <tr key={member.id}>
                          <td className="px-4 py-3 font-semibold text-slate-900">
                            {member.employee || member.member || "-"}
                          </td>
                          <td className="px-4 py-3 text-slate-600">
                            {member.role || "-"}
                          </td>
                          <td className="px-4 py-3 text-slate-600">
                            {member.department || project.department || "-"}
                          </td>
                          <td className="px-4 py-3 text-right font-semibold text-slate-900">
                            {numberValue(
                              member.allocationPercent ??
                                String(member.allocation || "").replace("%", "")
                            )}
                            %
                          </td>
                          <td className="px-4 py-3 text-slate-600">
                            {formatDateValue(member.startDate || project.startDate)}
                          </td>
                          <td className="px-4 py-3 text-slate-600">
                            {formatDateValue(member.endDate || project.endDate)}
                          </td>
                          <td className="px-4 py-3">
                            <StatusPill
                              label={
                                TEAM_AVAILABILITY_OPTIONS.includes(member.availability)
                                  ? member.availability
                                  : "Available"
                              }
                            />
                          </td>
                          <td className="px-4 py-3">
                            <StatusPill
                              label={
                                TEAM_STATUS_OPTIONS.includes(member.status)
                                  ? member.status
                                  : "Active"
                              }
                            />
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex gap-2">
                              <TableActionButton
                                onClick={() => setRecordDetail({ type: "team", record: member })}
                              >
                                <Eye className="h-3.5 w-3.5" />
                                View
                              </TableActionButton>
                              <TableActionButton>Edit</TableActionButton>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {activeTab === "milestones" && (
            <section className={sectionClass}>
              <SectionTitle
                icon={CheckCircle2}
                title="Milestones"
                subtitle="Target dates, completion dates, owners, and milestone status."
              />
              <div className="overflow-x-auto">
                <table className="min-w-[940px] w-full text-sm">
                  <thead className="bg-slate-100 text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-4 py-3 text-left font-semibold">Milestone Name</th>
                      <th className="px-4 py-3 text-left font-semibold">Description</th>
                      <th className="px-4 py-3 text-left font-semibold">Target Date</th>
                      <th className="px-4 py-3 text-left font-semibold">Completion Date</th>
                      <th className="px-4 py-3 text-left font-semibold">Owner</th>
                      <th className="px-4 py-3 text-left font-semibold">Status</th>
                      <th className="px-4 py-3 text-left font-semibold">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {milestoneRows.length === 0 ? (
                      <tr>
                        <td colSpan="7" className="px-4 py-10 text-center text-slate-500">
                          No milestones available yet.
                        </td>
                      </tr>
                    ) : (
                      milestoneRows.map((milestone) => (
                        <tr key={milestone.id}>
                          <td className="px-4 py-3 font-semibold text-slate-900">
                            {milestone.name || milestone.milestoneName || "-"}
                          </td>
                          <td className="px-4 py-3 text-slate-600">
                            {milestone.description || "-"}
                          </td>
                          <td className="px-4 py-3 text-slate-600">
                            {formatDateValue(milestone.targetDate)}
                          </td>
                          <td className="px-4 py-3 text-slate-600">
                            {formatDateValue(milestone.completionDate)}
                          </td>
                          <td className="px-4 py-3 text-slate-600">
                            {milestone.owner || "-"}
                          </td>
                          <td className="px-4 py-3">
                            <StatusPill
                              label={
                                MILESTONE_STATUS_OPTIONS.includes(milestone.status)
                                  ? milestone.status
                                  : "Pending"
                              }
                            />
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex gap-2">
                              <TableActionButton
                                onClick={() =>
                                  setRecordDetail({ type: "milestone", record: milestone })
                                }
                              >
                                <Eye className="h-3.5 w-3.5" />
                                View
                              </TableActionButton>
                              <TableActionButton>Edit</TableActionButton>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {activeTab === "inventory" && (
            <section className={sectionClass}>
              <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <SectionTitle
                  icon={Boxes}
                  title="Inventory"
                  subtitle="Required, issued, and remaining material allocation by store location."
                />
                <button
                  type="button"
                  className="inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700"
                >
                  <PackageCheck className="h-4 w-4" />
                  Allocate Material
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-[1280px] w-full text-sm">
                  <thead className="bg-slate-100 text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-4 py-3 text-left font-semibold">Item Code</th>
                      <th className="px-4 py-3 text-left font-semibold">Item Name</th>
                      <th className="px-4 py-3 text-left font-semibold">Category</th>
                      <th className="px-4 py-3 text-right font-semibold">Required Qty</th>
                      <th className="px-4 py-3 text-right font-semibold">Issued Qty</th>
                      <th className="px-4 py-3 text-right font-semibold">Remaining Qty</th>
                      <th className="px-4 py-3 text-left font-semibold">Unit</th>
                      <th className="px-4 py-3 text-left font-semibold">Store Location</th>
                      <th className="px-4 py-3 text-left font-semibold">Issue Date</th>
                      <th className="px-4 py-3 text-left font-semibold">Status</th>
                      <th className="px-4 py-3 text-left font-semibold">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {inventoryRows.length === 0 ? (
                      <tr>
                        <td colSpan="11" className="px-4 py-10 text-center text-slate-500">
                          No inventory allocations linked yet.
                        </td>
                      </tr>
                    ) : (
                      inventoryRows.map((item) => (
                        <tr key={item.id}>
                          <td className="px-4 py-3 font-semibold text-slate-700">
                            {item.itemCode || "-"}
                          </td>
                          <td className="px-4 py-3 font-semibold text-slate-900">
                            {item.itemName || item.item || "-"}
                          </td>
                          <td className="px-4 py-3 text-slate-600">{item.category || "-"}</td>
                          <td className="px-4 py-3 text-right font-semibold text-slate-900">
                            {item.unit === "INR"
                              ? formatInrCurrency(item.requiredQty ?? item.reserved)
                              : formatQuantity(item.requiredQty ?? item.reserved)}
                          </td>
                          <td className="px-4 py-3 text-right text-slate-600">
                            {item.unit === "INR"
                              ? formatInrCurrency(item.issuedQty ?? item.issued)
                              : formatQuantity(item.issuedQty ?? item.issued)}
                          </td>
                          <td className="px-4 py-3 text-right font-semibold text-slate-900">
                            {item.unit === "INR"
                              ? formatInrCurrency(
                                  item.remainingQty ??
                                    numberValue(item.requiredQty ?? item.reserved) -
                                      numberValue(item.issuedQty ?? item.issued)
                                )
                              : formatQuantity(
                                  item.remainingQty ??
                                    numberValue(item.requiredQty ?? item.reserved) -
                                      numberValue(item.issuedQty ?? item.issued)
                                )}
                          </td>
                          <td className="px-4 py-3 text-slate-600">
                            {item.unit || "-"}
                          </td>
                          <td className="px-4 py-3 text-slate-600">
                            {item.storeLocation || "-"}
                          </td>
                          <td className="px-4 py-3 text-slate-600">
                            {formatDateValue(item.issueDate)}
                          </td>
                          <td className="px-4 py-3">
                            <StatusPill
                              label={
                                INVENTORY_STATUS_OPTIONS.includes(item.status)
                                  ? item.status
                                  : "Requested"
                              }
                            />
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex gap-2">
                              <TableActionButton
                                onClick={() =>
                                  setRecordDetail({ type: "inventory", record: item })
                                }
                              >
                                <Eye className="h-3.5 w-3.5" />
                                View
                              </TableActionButton>
                              <TableActionButton>Edit</TableActionButton>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {activeTab === "purchases" && (
            <section className={sectionClass}>
              <SectionTitle
                icon={ReceiptText}
                title="Purchases"
                subtitle="Purchase order tracking, delivery dates, and linked tasks."
              />
              <div className="overflow-x-auto">
                <table className="min-w-[1180px] w-full text-sm">
                  <thead className="bg-slate-100 text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-4 py-3 text-left font-semibold">PO Number</th>
                      <th className="px-4 py-3 text-left font-semibold">Vendor</th>
                      <th className="px-4 py-3 text-left font-semibold">Item Summary</th>
                      <th className="px-4 py-3 text-right font-semibold">Amount</th>
                      <th className="px-4 py-3 text-left font-semibold">Expected Delivery</th>
                      <th className="px-4 py-3 text-left font-semibold">Actual Delivery</th>
                      <th className="px-4 py-3 text-left font-semibold">Status</th>
                      <th className="px-4 py-3 text-left font-semibold">Linked Task</th>
                      <th className="px-4 py-3 text-left font-semibold">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {purchaseRows.length === 0 ? (
                      <tr>
                        <td colSpan="9" className="px-4 py-10 text-center text-slate-500">
                          No purchase records linked yet.
                        </td>
                      </tr>
                    ) : (
                      purchaseRows.map((purchase) => (
                        <tr key={purchase.id}>
                          <td className="px-4 py-3 font-semibold text-slate-900">
                            {purchase.poNumber || purchase.reference || "-"}
                          </td>
                          <td className="px-4 py-3 text-slate-600">
                            {purchase.vendor || "-"}
                          </td>
                          <td className="px-4 py-3 text-slate-600">
                            {purchase.itemSummary || purchase.summary || "-"}
                          </td>
                          <td className="px-4 py-3 text-right font-semibold text-slate-900">
                            {formatInrCurrency(purchase.amount)}
                          </td>
                          <td className="px-4 py-3 text-slate-600">
                            {formatDateValue(
                              purchase.expectedDelivery || purchase.eta
                            )}
                          </td>
                          <td className="px-4 py-3 text-slate-600">
                            {formatDateValue(purchase.actualDelivery)}
                          </td>
                          <td className="px-4 py-3">
                            <StatusPill
                              label={
                                PURCHASE_STATUS_OPTIONS.includes(purchase.status)
                                  ? purchase.status
                                  : "Requested"
                              }
                            />
                          </td>
                          <td className="px-4 py-3 text-slate-600">
                            {purchase.linkedTask || "-"}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex gap-2">
                              <TableActionButton
                                onClick={() =>
                                  setRecordDetail({ type: "purchase", record: purchase })
                                }
                              >
                                <Eye className="h-3.5 w-3.5" />
                                View
                              </TableActionButton>
                              <TableActionButton>Edit</TableActionButton>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {activeTab === "financials" && (
            <section className={sectionClass}>
              <SectionTitle
                icon={CircleDollarSign}
                title="Financials"
                subtitle="Budget, expenses, remaining funds, and cost ledger."
              />
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
                <MetricPill label="Approved Budget" value={formatInrCurrency(budget)} />
                <MetricPill label="Total Spent" value={formatInrCurrency(expenses)} />
                <MetricPill
                  label="Remaining Budget"
                  value={formatInrCurrency(remaining)}
                />
                <MetricPill
                  label="Pending Invoices"
                  value={getPendingInvoices(project)}
                />
                <MetricPill
                  label="Budget Utilization %"
                  value={`${budgetConsumed}%`}
                />
                <MetricPill
                  label="Profit Margin"
                  value={`${getProfitMargin(project)}%`}
                />
              </div>
              <div className="mt-5 overflow-x-auto">
                <table className="min-w-[760px] w-full text-sm">
                  <thead className="bg-slate-100 text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-4 py-3 text-left font-semibold">Category</th>
                      <th className="px-4 py-3 text-right font-semibold">Budget</th>
                      <th className="px-4 py-3 text-right font-semibold">Actual</th>
                      <th className="px-4 py-3 text-right font-semibold">Variance</th>
                      <th className="px-4 py-3 text-left font-semibold">Status</th>
                      <th className="px-4 py-3 text-left font-semibold">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {costBreakdownRows.map((item) => (
                        <tr key={item.category} className="transition hover:bg-slate-50">
                          <td className="px-4 py-3 font-semibold text-slate-900">
                            {item.category}
                          </td>
                          <td className="px-4 py-3 text-right font-semibold text-slate-900">
                            {formatInrCurrency(item.budget)}
                          </td>
                          <td className="px-4 py-3 text-right text-slate-700">
                            {formatInrCurrency(item.actual)}
                          </td>
                          <td
                            className={`px-4 py-3 text-right font-semibold ${
                              item.variance < 0 ? "text-rose-700" : "text-emerald-700"
                            }`}
                          >
                            {formatInrCurrency(item.variance)}
                          </td>
                          <td className="px-4 py-3">
                            <StatusPill label={item.status} />
                          </td>
                          <td className="px-4 py-3">
                            <TableActionButton
                              onClick={() =>
                                setRecordDetail({ type: "financial", record: item })
                              }
                            >
                              <Eye className="h-3.5 w-3.5" />
                              View
                            </TableActionButton>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {activeTab === "documents" && (
            <section className={sectionClass}>
              <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <SectionTitle
                  icon={FileText}
                  title="Documents"
                  subtitle="Contracts, drawings, BOQ, invoices, purchase orders, site photos, and reports."
                />
                <button
                  type="button"
                  className="inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700"
                >
                  <Upload className="h-4 w-4" />
                  Upload Document
                </button>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {documentFolderCounts.map((folder) => (
                  <article
                    key={folder.folder}
                    className="rounded-xl border border-slate-200 bg-slate-50 p-4 transition hover:border-indigo-200 hover:bg-indigo-50"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <span className="grid h-10 w-10 place-items-center rounded-lg bg-white text-indigo-600 shadow-sm">
                        <FolderOpen className="h-5 w-5" />
                      </span>
                      <span className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-slate-600">
                        {folder.count}
                      </span>
                    </div>
                    <p className="mt-4 text-sm font-semibold text-slate-950">
                      {folder.folder}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      {folder.count === 1 ? "1 file" : `${folder.count} files`}
                    </p>
                  </article>
                ))}
              </div>

              <div className="mt-5 overflow-x-auto">
                <table className="min-w-[860px] w-full text-sm">
                  <thead className="bg-slate-100 text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-4 py-3 text-left font-semibold">File Name</th>
                      <th className="px-4 py-3 text-left font-semibold">Category</th>
                      <th className="px-4 py-3 text-left font-semibold">Uploaded By</th>
                      <th className="px-4 py-3 text-left font-semibold">Uploaded Date</th>
                      <th className="px-4 py-3 text-left font-semibold">Size</th>
                      <th className="px-4 py-3 text-left font-semibold">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {documentRows.length === 0 ? (
                      <tr>
                        <td colSpan="6" className="px-4 py-10 text-center text-slate-500">
                          No documents uploaded yet.
                        </td>
                      </tr>
                    ) : (
                      documentRows.map((document) => (
                        <tr key={document.id} className="transition hover:bg-slate-50">
                          <td className="px-4 py-3 font-semibold text-slate-900">
                            {document.name || document.fileName || "-"}
                          </td>
                          <td className="px-4 py-3">
                            <span className="rounded-full border border-indigo-100 bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-700">
                              {document.category || "Reports"}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-slate-600">
                            {document.uploadedBy || "-"}
                          </td>
                          <td className="px-4 py-3 text-slate-600">
                            {formatDateValue(document.uploadedDate || document.date)}
                          </td>
                          <td className="px-4 py-3 text-slate-600">
                            {document.size || "-"}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex gap-2">
                              <TableActionButton
                                onClick={() =>
                                  setRecordDetail({ type: "document", record: document })
                                }
                              >
                                <Eye className="h-3.5 w-3.5" />
                                View
                              </TableActionButton>
                              <TableActionButton>Download</TableActionButton>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {activeTab === "activity" && (
            <section className={sectionClass}>
              <SectionTitle
                icon={Activity}
                title="Activity Timeline"
                subtitle="Audit trail for project updates, task assignment, and workflow actions."
              />
              <div className="space-y-5">
                {activityRows.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-5 text-sm text-slate-500">
                    No activity recorded yet.
                  </div>
                ) : (
                  activityDates.map((dateKey) => (
                    <div key={dateKey}>
                      <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                        {formatDateValue(dateKey)}
                      </p>
                      <div className="space-y-3 border-l-2 border-indigo-100 pl-4">
                        {activityGroups[dateKey].map((activity) => (
                          <div
                            key={activity.id}
                            className="relative rounded-lg border border-slate-200 bg-slate-50 p-4 shadow-sm"
                          >
                            <span className="absolute -left-[25px] top-5 grid h-5 w-5 place-items-center rounded-full border-4 border-white bg-indigo-600" />
                            <div className="grid gap-3 md:grid-cols-[1fr_auto]">
                              <div>
                                <p className="text-sm font-semibold text-slate-950">
                                  {activity.title}
                                </p>
                                <p className="mt-1 text-sm text-slate-600">
                                  {activity.description}
                                </p>
                                <p className="mt-2 text-xs font-medium text-slate-500">
                                  {activity.actor || "Project office"}
                                </p>
                              </div>
                              <div className="flex items-center gap-2 md:flex-col md:items-end">
                                <p className="text-xs font-semibold text-slate-500">
                                  {new Date(activity.date).toLocaleTimeString("en-IN", {
                                    hour: "2-digit",
                                    minute: "2-digit",
                                  })}
                                </p>
                                <TableActionButton
                                  onClick={() =>
                                    setRecordDetail({ type: "activity", record: activity })
                                  }
                                >
                                  <Eye className="h-3.5 w-3.5" />
                                  View details
                                </TableActionButton>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </section>
          )}
        </div>
        {recordDetail ? (
          <RecordDetailModal
            detail={recordDetail}
            project={project}
            onClose={() => setRecordDetail(null)}
          />
        ) : null}
        <ProjectCompleteFilePrint project={project} />
      </div>
    </div>
  );
};

const ProjectManagementProjects = () => {
  const navigate = useNavigate();
  const [projects, setProjects] = useState(() => getInitialProjects());
  const [customers, setCustomers] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [locations, setLocations] = useState([]);
  const [search, setSearch] = useState("");
  const [activeFilter, setActiveFilter] = useState("All");
  const [projectModalOpen, setProjectModalOpen] = useState(false);
  const [editingProject, setEditingProject] = useState(null);
  const [selectedProject, setSelectedProject] = useState(null);
  const [selectedDetailTab, setSelectedDetailTab] = useState("overview");
  const [taskProject, setTaskProject] = useState(null);
  const [openMenuId, setOpenMenuId] = useState(null);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    const handleProjectsChange = () => setProjects(getProjects());
    const loadMasterData = async () => {
      try {
        const [customerList, employeeResponse, locationList] = await Promise.all([
          fetchCustomers(),
          fetchHrmsEmployees(1, 200),
          fetchLocations(),
        ]);
        setCustomers(Array.isArray(customerList) ? customerList : []);
        setEmployees(Array.isArray(employeeResponse?.employees) ? employeeResponse.employees : []);
        setLocations(Array.isArray(locationList) ? locationList : []);
      } catch (error) {
        console.error("Failed to load project management master data", error);
        setCustomers([]);
        setEmployees([]);
        setLocations([]);
      }
    };

    if (typeof window !== "undefined") {
      window.addEventListener(
        PROJECT_MANAGEMENT_PROJECTS_EVENT,
        handleProjectsChange
      );
      window.addEventListener("projects:changed", handleProjectsChange);
    }
    void hydrateProjectManagementProjects()
      .then((rows) => {
        setProjects(rows);
        setLoadError("");
      })
      .catch((error) => {
        console.error("Failed to load project management projects", error);
        setProjects([]);
        setLoadError(
          error?.response?.data?.error ||
            error?.message ||
            "Projects could not be loaded from the database."
        );
      });
    void loadMasterData();

    return () => {
      if (typeof window !== "undefined") {
        window.removeEventListener(
          PROJECT_MANAGEMENT_PROJECTS_EVENT,
          handleProjectsChange
        );
        window.removeEventListener("projects:changed", handleProjectsChange);
      }
    };
  }, []);

  const metrics = useMemo(() => {
    const total = projects.length;
    const statuses = projects.map(getProjectStatus);
    const active = statuses.filter((status) => status === "Active").length;
    const delayed = statuses.filter((status) => status === "Delayed").length;
    const completed = statuses.filter((status) => status === "Completed").length;
    const totalBudget = projects.reduce((sum, project) => sum + getBudget(project), 0);
    const expenses = projects.reduce((sum, project) => sum + getExpenses(project), 0);
    const utilization =
      total > 0
        ? Math.round(
            projects.reduce((sum, project) => sum + getUtilization(project), 0) /
              total
          )
        : 0;
    const tasksDue = projects.reduce(
      (sum, project) => sum + getTaskDueCount(project),
      0
    );

    return {
      total,
      active,
      delayed,
      completed,
      totalBudget,
      expenses,
      utilization,
      tasksDue,
    };
  }, [projects]);

  const visibleProjects = useMemo(() => {
    const term = search.trim().toLowerCase();
    return projects.filter((project) => {
      const status = getProjectStatus(project);
      if (activeFilter !== "All" && status !== activeFilter) return false;
      if (!term) return true;
      return [
        project.code,
        project.name,
        project.client,
        project.companyName,
        project.projectManager,
        project.siteEngineer,
        project.teamLead,
        project.priority,
        status,
        project.projectCategory,
        project.siteName,
        project.city,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(term));
    });
  }, [activeFilter, projects, search]);

  const openCreateModal = () => {
    setEditingProject(null);
    setProjectModalOpen(true);
  };

  const openEditModal = (project) => {
    setEditingProject(project);
    setProjectModalOpen(true);
  };

  const openTaskAssignment = (project) => {
    if (!(project.milestones || []).length) {
      window.alert("Create a milestone under Design, Procure, Implement, or Allocate before creating tasks.");
      navigate("/project-management/milestones");
      return;
    }
    setTaskProject(project);
  };

  const saveProjectRecord = async (project) => {
    try {
      if (editingProject) {
        await updateProjectManagementProject(editingProject.id, project);
        const nextMilestoneIds = new Set(
          (project.milestones || [])
            .map((milestone) => Number(milestone.id))
            .filter(Number.isFinite)
        );
        for (const milestone of editingProject.milestones || []) {
          if (Number.isFinite(Number(milestone.id)) && !nextMilestoneIds.has(Number(milestone.id))) {
            await deleteMilestone(milestone.id);
          }
        }
        for (const milestone of project.milestones || []) {
          if (Number.isFinite(Number(milestone.id))) {
            await updateMilestone(milestone.id, milestone);
          } else {
            await createMilestone(editingProject.id, milestone);
          }
        }
      } else {
        await saveProject(project);
      }
      const latest = await hydrateProjectManagementProjects();
      setProjects(latest);
      setProjectModalOpen(false);
      setEditingProject(null);
    } catch (error) {
      window.alert(error?.response?.data?.error || error?.message || "Project could not be saved.");
    }
  };

  const openDetails = (project, tab = "overview") => {
    setSelectedProject(project);
    setSelectedDetailTab(tab);
    setOpenMenuId(null);
  };

  const saveTaskAssignment = async (updatedProject) => {
    try {
      const task = updatedProject.tasks?.[0];
      await createProjectTask(updatedProject.id, {
        ...task,
        status: task.status === "Completed" ? "Completed" : "Pending",
        completionPercentage: task.status === "Completed" ? 100 : 0,
        assignedEmployeeName: task.assignedTo,
      });
      const latest = await hydrateProjectManagementProjects();
      setProjects(latest);
      setTaskProject(null);
      setSelectedProject(latest.find((project) => project.id === updatedProject.id) || null);
      setSelectedDetailTab("tasks");
      navigate("/project-management/tasks");
    } catch (error) {
      window.alert(error?.response?.data?.error || error?.message || "Task could not be assigned.");
    }
  };

  const kpis = [
    {
      label: "Total Projects",
      value: metrics.total.toLocaleString("en-IN"),
      helper: "All records",
      icon: FolderKanban,
      tone: "indigo",
    },
    {
      label: "Active Projects",
      value: metrics.active.toLocaleString("en-IN"),
      helper: "Currently executing",
      icon: Activity,
      tone: "emerald",
    },
    {
      label: "Delayed Projects",
      value: metrics.delayed.toLocaleString("en-IN"),
      helper: "Past planned end date",
      icon: AlertTriangle,
      tone: "rose",
    },
    {
      label: "Completed Projects",
      value: metrics.completed.toLocaleString("en-IN"),
      helper: "Closed records",
      icon: CheckCircle2,
      tone: "violet",
    },
    {
      label: "Total Budget",
      value: formatInrCurrency(metrics.totalBudget),
      helper: "Approved or estimated",
      icon: IndianRupee,
      tone: "blue",
    },
    {
      label: "Expenses",
      value: formatInrCurrency(metrics.expenses),
      helper: "Linked costs",
      icon: CircleDollarSign,
      tone: "amber",
    },
    {
      label: "Resource Utilization",
      value: `${metrics.utilization}%`,
      helper: "Average allocation",
      icon: Users,
      tone: "slate",
    },
    {
      label: "Tasks Due",
      value: metrics.tasksDue.toLocaleString("en-IN"),
      helper: "Overdue open tasks",
      icon: Clock3,
      tone: "rose",
    },
  ];

  return (
    <div className="space-y-5">
      <section className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-indigo-500">
            Project Management
          </p>
          <h1 className="mt-2 text-2xl font-bold text-slate-950 md:text-3xl">
            Projects
          </h1>
          <p className="mt-1 max-w-3xl text-sm text-slate-500">
            Manage project records, tasks, team allocation, inventory, purchases, costs, documents, and activity.
          </p>
        </div>
        <button
          type="button"
          onClick={openCreateModal}
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700"
        >
          <Plus className="h-4 w-4" />
          Create Project
        </button>
      </section>

      {loadError ? (
        <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {loadError}
        </p>
      ) : null}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {kpis.map((item) => (
          <KpiCard key={item.label} {...item} />
        ))}
      </section>

      <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 p-4">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex gap-2 overflow-x-auto pb-1">
              {FILTER_OPTIONS.map((filter) => (
                <button
                  key={filter}
                  type="button"
                  onClick={() => setActiveFilter(filter)}
                  className={`min-w-max rounded-lg px-3 py-2 text-sm font-semibold transition ${
                    activeFilter === filter
                      ? "bg-indigo-600 text-white shadow-sm"
                      : "border border-slate-200 bg-white text-slate-600 hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-700"
                  }`}
                >
                  {filter}
                </button>
              ))}
            </div>
            <label className="relative w-full xl:max-w-md">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search projects..."
                className="w-full rounded-lg border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100"
              />
            </label>
          </div>
        </div>

        {projects.length === 0 ? (
          <EmptyState onCreate={openCreateModal} />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-[1320px] w-full text-sm">
              <thead className="bg-slate-100 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold">
                    Project Code
                  </th>
                  <th className="px-4 py-3 text-left font-semibold">
                    Project Name
                  </th>
                  <th className="px-4 py-3 text-left font-semibold">Client</th>
                  <th className="px-4 py-3 text-left font-semibold">
                    Project Manager
                  </th>
                  <th className="px-4 py-3 text-left font-semibold">Start Date</th>
                  <th className="px-4 py-3 text-left font-semibold">End Date</th>
                  <th className="px-4 py-3 text-left font-semibold">Priority</th>
                  <th className="px-4 py-3 text-left font-semibold">Status</th>
                  <th className="px-4 py-3 text-left font-semibold">Progress</th>
                  <th className="px-4 py-3 text-right font-semibold">Budget</th>
                  <th className="px-4 py-3 text-right font-semibold">Team Size</th>
                  <th className="px-4 py-3 text-left font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {visibleProjects.length === 0 ? (
                  <tr>
                    <td colSpan="12" className="px-4 py-12 text-center text-slate-500">
                      No matching projects found.
                    </td>
                  </tr>
                ) : (
                  visibleProjects.map((project) => {
                    const status = getProjectStatus(project);
                    const progress = getProgress(project);
                    const menuOpen = String(openMenuId) === String(project.id);

                    return (
                      <tr key={project.id} className="transition hover:bg-slate-50">
                        <td className="px-4 py-4 font-semibold text-slate-700">
                          {project.code || "-"}
                        </td>
                        <td className="px-4 py-4">
                          <p className="font-semibold text-slate-950">
                            {project.name || "-"}
                          </p>
                          <p className="mt-1 text-xs text-slate-500">
                            {project.projectCategory || "General project"}
                          </p>
                        </td>
                        <td className="px-4 py-4 text-slate-600">
                          {project.client || project.companyName || "-"}
                        </td>
                        <td className="px-4 py-4 text-slate-600">
                          {project.projectManager || "-"}
                        </td>
                        <td className="px-4 py-4 text-slate-600">
                          {formatDateValue(project.startDate)}
                        </td>
                        <td className="px-4 py-4 text-slate-600">
                          {formatDateValue(project.endDate)}
                        </td>
                        <td className="px-4 py-4">
                          <Badge label={project.priority || "Medium"} type="priority" />
                        </td>
                        <td className="px-4 py-4">
                          <Badge label={status} />
                        </td>
                        <td className="px-4 py-4">
                          <ProgressMeter value={progress} />
                        </td>
                        <td className="px-4 py-4 text-right font-semibold text-slate-900">
                          {formatInrCurrency(getBudget(project))}
                        </td>
                        <td className="px-4 py-4 text-right font-semibold text-slate-900">
                          {getTeamSize(project)}
                        </td>
                        <td className="px-4 py-4">
                          <div className="relative flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => openDetails(project)}
                              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-500 transition hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-700"
                              aria-label={`View ${project.name}`}
                              title="View"
                            >
                              <Eye className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => openEditModal(project)}
                              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-500 transition hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-700"
                              aria-label={`Edit ${project.name}`}
                              title="Edit"
                            >
                              <Pencil className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => openTaskAssignment(project)}
                              className="inline-flex items-center justify-center gap-2 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs font-semibold text-indigo-700 transition hover:bg-indigo-100"
                            >
                              <UserPlus className="h-4 w-4" />
                              Assign Task
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                setOpenMenuId((current) =>
                                  String(current) === String(project.id)
                                    ? null
                                    : project.id
                                )
                              }
                              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-500 transition hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-700"
                              aria-label={`More actions for ${project.name}`}
                              title="More"
                            >
                              <MoreHorizontal className="h-4 w-4" />
                            </button>
                            {menuOpen && (
                              <div className="absolute right-0 top-11 z-20 w-56 overflow-hidden rounded-xl border border-slate-200 bg-white py-2 shadow-xl">
                                {[
                                  ["milestones", "Milestones", CheckCircle2],
                                  ["inventory", "Inventory Allocation", PackageCheck],
                                  ["purchases", "Purchase Tracking", ReceiptText],
                                  ["financials", "Financials", BriefcaseBusiness],
                                  ["documents", "Documents", FileText],
                                  ["activity", "Activity Timeline", Activity],
                                ].map(([tab, label, IconComponent]) => (
                                  <button
                                    key={tab}
                                    type="button"
                                    onClick={() => openDetails(project, tab)}
                                    className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm font-medium text-slate-600 hover:bg-slate-50 hover:text-indigo-700"
                                  >
                                    {createElement(IconComponent, {
                                      className: "h-4 w-4",
                                    })}
                                    {label}
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {projectModalOpen && (
        <ProjectFormModal
          key={editingProject?.id || "create-project"}
          isOpen={projectModalOpen}
          mode={editingProject ? "edit" : "create"}
          project={editingProject}
          customers={customers}
          employees={employees}
          locations={locations}
          onClose={() => {
            setProjectModalOpen(false);
            setEditingProject(null);
          }}
          onSave={saveProjectRecord}
        />
      )}

      {taskProject && (
        <TaskAssignmentModal
          key={taskProject.id}
          project={taskProject}
          onClose={() => setTaskProject(null)}
          onSave={saveTaskAssignment}
        />
      )}

      {selectedProject && (
        <ProjectDetailDrawer
          key={`${selectedProject.id}-${selectedDetailTab}`}
          project={selectedProject}
          initialTab={selectedDetailTab}
          onClose={() => setSelectedProject(null)}
          onEdit={(project) => {
            setSelectedProject(null);
            openEditModal(project);
          }}
          onAssignTask={openTaskAssignment}
        />
      )}
    </div>
  );
};

export default ProjectManagementProjects;
