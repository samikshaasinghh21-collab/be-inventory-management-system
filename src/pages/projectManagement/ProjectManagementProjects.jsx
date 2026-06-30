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
  ensureProjectManagementProjects,
  getProjectManagementProjects as getProjects,
  saveProjectManagementProject as saveProject,
  setProjectManagementProjects as setLocalProjects,
} from "../../services/projectManagementProjectsStore";
import { formatDate } from "../../utils/dateFormat";
import { formatInrCurrency } from "../../utils/formatters";

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
  estimatedBudget: "",
  approvedBudget: "",
  materialBudget: "",
  labourBudget: "",
  otherCostBudget: "",
  siteName: "",
  locationId: "",
  siteAddress: "",
  city: "",
  state: "",
  siteContactPerson: "",
  siteContactNumber: "",
};

const emptyTaskForm = {
  title: "",
  description: "",
  parentTask: "",
  owner: "",
  assignedBy: "",
  priority: "Medium",
  startDate: "",
  dueDate: "",
  status: "Assigned",
  estimatedHours: "",
  dependencies: "",
  attachments: [],
  comments: "",
};

const TASK_STATUS_OPTIONS = [
  "Not Started",
  "Assigned",
  "In Progress",
  "Under Review",
  "Completed",
  "Blocked",
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

const MOCK_PROJECTS = [
  {
    id: "pm-mall-cctv",
    name: "Mall CCTV Installation",
    code: "BE-PM-2026-001",
    client: "Orion Mall Management Pvt Ltd",
    companyName: "Orion Mall Management Pvt Ltd",
    projectCategory: "Electrical Installation",
    description:
      "Installation of IP CCTV cameras, NVR racks, PoE switches, and control room monitoring across basement, retail floors, and loading bay areas.",
    priority: "Critical",
    status: "Active",
    projectManager: "Rahul Sharma",
    siteEngineer: "Arun Kumar",
    teamLead: "Meera Nair",
    department: "Projects",
    startDate: "2026-05-18",
    endDate: "2026-07-12",
    actualEndDate: null,
    milestoneTemplate: "Installation & commissioning",
    estimatedBudget: 4850000,
    approvedBudget: 5200000,
    materialBudget: 3180000,
    labourBudget: 1120000,
    otherCostBudget: 900000,
    expenses: 3025000,
    progress: 64,
    teamSize: 8,
    resourceUtilization: 82,
    pendingInvoices: 3,
    openIssues: 1,
    siteName: "Orion Mall Rajajinagar",
    siteAddress: "Dr Rajkumar Road, Rajajinagar, Bengaluru, Karnataka",
    city: "Bengaluru",
    state: "Karnataka",
    siteContactPerson: "Kiran Desai",
    siteContactNumber: "+91 98450 11223",
    tasks: [
      {
        id: "task-cctv-001",
        taskId: "TSK-001",
        title: "Camera Installation",
        description: "Install and align 120 indoor/outdoor IP camera points.",
        assignedTo: "Arun Kumar",
        owner: "Arun Kumar",
        assignedBy: "Rahul Sharma",
        startDate: "2026-05-22",
        dueDate: "2026-06-24",
        priority: "Critical",
        status: "In Progress",
        progress: 68,
        estimatedHours: 96,
        actualHours: 62,
        dependencies: "Cabling completion",
      },
      {
        id: "task-cctv-002",
        taskId: "TSK-002",
        title: "Control room rack setup",
        description: "Install NVR rack, UPS, monitor wall, and network patching.",
        assignedTo: "Meera Nair",
        owner: "Meera Nair",
        assignedBy: "Rahul Sharma",
        startDate: "2026-06-03",
        dueDate: "2026-06-20",
        priority: "High",
        status: "Under Review",
        progress: 85,
        estimatedHours: 40,
        actualHours: 38,
        dependencies: "Power point readiness",
      },
      {
        id: "task-cctv-003",
        taskId: "TSK-003",
        title: "Client demo and handover",
        description: "Demonstrate live feeds, playback, and incident export workflow.",
        assignedTo: "Sneha Patil",
        owner: "Sneha Patil",
        assignedBy: "Rahul Sharma",
        startDate: "2026-07-05",
        dueDate: "2026-07-10",
        priority: "Medium",
        status: "Not Started",
        progress: 0,
        estimatedHours: 16,
        actualHours: 0,
        dependencies: "TSK-001, TSK-002",
      },
    ],
    teamAllocations: [
      {
        id: "team-cctv-001",
        employee: "Rahul Sharma",
        member: "Rahul Sharma",
        role: "Project Manager",
        department: "Projects",
        allocationPercent: 100,
        startDate: "2026-05-18",
        endDate: "2026-07-12",
        availability: "Occupied",
        status: "Active",
      },
      {
        id: "team-cctv-002",
        employee: "Arun Kumar",
        member: "Arun Kumar",
        role: "Site Engineer",
        department: "Electrical",
        allocationPercent: 90,
        startDate: "2026-05-20",
        endDate: "2026-07-08",
        availability: "Occupied",
        status: "Active",
      },
      {
        id: "team-cctv-003",
        employee: "Meera Nair",
        member: "Meera Nair",
        role: "Team Lead",
        department: "Projects",
        allocationPercent: 80,
        startDate: "2026-05-22",
        endDate: "2026-07-10",
        availability: "Available",
        status: "Active",
      },
    ],
    milestones: [
      {
        id: "ms-cctv-001",
        name: "Site survey complete",
        description: "Camera point marking and cable route approval completed.",
        targetDate: "2026-05-24",
        completionDate: "2026-05-23",
        owner: "Arun Kumar",
        status: "Completed",
      },
      {
        id: "ms-cctv-002",
        name: "Camera installation",
        description: "All camera points installed and labelled.",
        targetDate: "2026-06-24",
        completionDate: "",
        owner: "Arun Kumar",
        status: "In Progress",
      },
      {
        id: "ms-cctv-003",
        name: "Final handover",
        description: "Client acceptance, documentation, and training.",
        targetDate: "2026-07-12",
        completionDate: "",
        owner: "Rahul Sharma",
        status: "Pending",
      },
    ],
    inventoryAllocations: [
      {
        id: "inv-cctv-001",
        itemCode: "CAM-IP-5MP",
        itemName: "5MP IP Dome Camera",
        category: "CCTV",
        requiredQty: 120,
        issuedQty: 86,
        remainingQty: 34,
        unit: "Nos",
        storeLocation: "Bengaluru Main Store",
        issueDate: "2026-05-25",
        status: "Partial",
      },
      {
        id: "inv-cctv-002",
        itemCode: "NVR-64CH",
        itemName: "64 Channel NVR",
        category: "Recorder",
        requiredQty: 3,
        issuedQty: 3,
        remainingQty: 0,
        unit: "Nos",
        storeLocation: "Security Systems Store",
        issueDate: "2026-05-28",
        status: "Issued",
      },
    ],
    purchases: [
      {
        id: "po-cctv-001",
        poNumber: "PO-BE-2606-018",
        vendor: "SecureVision Technologies",
        itemSummary: "PoE switches and camera mounting accessories",
        amount: 685000,
        expectedDelivery: "2026-06-19",
        actualDelivery: "",
        status: "In Transit",
        linkedTask: "Camera Installation",
      },
      {
        id: "po-cctv-002",
        poNumber: "PO-BE-2605-044",
        vendor: "Bengaluru Cable House",
        itemSummary: "CAT6 cable, conduits, junction boxes",
        amount: 415000,
        expectedDelivery: "2026-05-29",
        actualDelivery: "2026-05-29",
        status: "Received",
        linkedTask: "Camera Installation",
      },
    ],
    financials: [
      { id: "fin-cctv-001", label: "Materials", type: "Materials", amount: 1985000, budget: 3180000, actual: 1985000, status: "On Track" },
      { id: "fin-cctv-002", label: "Labour", type: "Labour", amount: 720000, budget: 1120000, actual: 720000, status: "On Track" },
      { id: "fin-cctv-003", label: "Transport", type: "Transport", amount: 145000, budget: 250000, actual: 145000, status: "On Track" },
      { id: "fin-cctv-004", label: "Tools", type: "Tools", amount: 95000, budget: 180000, actual: 95000, status: "On Track" },
      { id: "fin-cctv-005", label: "Miscellaneous", type: "Miscellaneous", amount: 80000, budget: 470000, actual: 80000, status: "On Track" },
    ],
    documents: [
      { id: "doc-cctv-001", name: "Orion CCTV Work Order.pdf", category: "Contracts", uploadedBy: "Rahul Sharma", uploadedDate: "2026-05-18", size: "1.8 MB" },
      { id: "doc-cctv-002", name: "Camera Layout Rev-2.dwg", category: "Drawings", uploadedBy: "Arun Kumar", uploadedDate: "2026-05-24", size: "4.6 MB" },
      { id: "doc-cctv-003", name: "CCTV BOQ Final.xlsx", category: "BOQ", uploadedBy: "Meera Nair", uploadedDate: "2026-05-21", size: "620 KB" },
    ],
    activities: [
      { id: "act-cctv-001", title: "Task \"Camera Installation\" assigned to Arun", description: "Critical CCTV installation task assigned to Arun Kumar.", actor: "Rahul Sharma", date: "2026-06-16T10:30:00+05:30" },
      { id: "act-cctv-002", title: "Inventory allocated", description: "86 cameras and 3 NVRs issued from Bengaluru Main Store.", actor: "Meera Nair", date: "2026-06-15T16:15:00+05:30" },
      { id: "act-cctv-003", title: "Purchase order approved", description: "PO-BE-2606-018 approved for PoE switches and accessories.", actor: "Rahul Sharma", date: "2026-06-15T11:20:00+05:30" },
      { id: "act-cctv-004", title: "Project status changed to Active", description: "Mall CCTV Installation moved from Planning to Active.", actor: "Rahul Sharma", date: "2026-05-20T09:00:00+05:30" },
      { id: "act-cctv-005", title: "Budget approved", description: "Approved budget set to ₹52,00,000.", actor: "Finance Team", date: "2026-05-18T14:10:00+05:30" },
    ],
    createdAt: "2026-05-18T09:00:00+05:30",
    updatedAt: "2026-06-16T10:30:00+05:30",
  },
  {
    id: "pm-factory-wiring",
    name: "Factory Electrical Wiring",
    code: "BE-PM-2026-002",
    client: "Pragati Precision Components",
    companyName: "Pragati Precision Components",
    projectCategory: "Electrical Installation",
    description:
      "Electrical wiring, panel dressing, cable tray extension, earthing checks, and load testing for a new machining bay.",
    priority: "High",
    status: "Delayed",
    projectManager: "Vikram Rao",
    siteEngineer: "Naveen Gowda",
    teamLead: "Farah Khan",
    department: "Electrical",
    startDate: "2026-04-22",
    endDate: "2026-06-10",
    actualEndDate: null,
    milestoneTemplate: "Standard execution",
    estimatedBudget: 7200000,
    approvedBudget: 7550000,
    materialBudget: 4100000,
    labourBudget: 2200000,
    otherCostBudget: 1250000,
    expenses: 6725000,
    progress: 78,
    teamSize: 12,
    resourceUtilization: 94,
    pendingInvoices: 5,
    openIssues: 4,
    siteName: "Peenya Industrial Area Unit 3",
    siteAddress: "3rd Phase, Peenya Industrial Area, Bengaluru, Karnataka",
    city: "Bengaluru",
    state: "Karnataka",
    siteContactPerson: "Mahesh Kulkarni",
    siteContactNumber: "+91 99002 44118",
    tasks: [
      { id: "task-wire-001", taskId: "TSK-001", title: "Cable tray installation", description: "Install galvanized cable trays across machining bay.", assignedTo: "Naveen Gowda", owner: "Naveen Gowda", assignedBy: "Vikram Rao", startDate: "2026-04-24", dueDate: "2026-05-12", priority: "High", status: "Completed", progress: 100, estimatedHours: 120, actualHours: 132, dependencies: "-" },
      { id: "task-wire-002", taskId: "TSK-002", title: "Panel termination", description: "Terminate power lines and control wiring at panel DB-4.", assignedTo: "Farah Khan", owner: "Farah Khan", assignedBy: "Vikram Rao", startDate: "2026-05-18", dueDate: "2026-06-12", priority: "Critical", status: "Blocked", progress: 58, estimatedHours: 90, actualHours: 74, dependencies: "Client shutdown approval" },
      { id: "task-wire-003", taskId: "TSK-003", title: "Load testing", description: "Perform phase load balancing and insulation testing.", assignedTo: "Naveen Gowda", owner: "Naveen Gowda", assignedBy: "Vikram Rao", startDate: "2026-06-13", dueDate: "2026-06-18", priority: "High", status: "Assigned", progress: 0, estimatedHours: 24, actualHours: 0, dependencies: "TSK-002" },
    ],
    teamAllocations: [
      { id: "team-wire-001", employee: "Vikram Rao", member: "Vikram Rao", role: "Project Manager", department: "Projects", allocationPercent: 100, startDate: "2026-04-22", endDate: "2026-06-20", availability: "Occupied", status: "Active" },
      { id: "team-wire-002", employee: "Naveen Gowda", member: "Naveen Gowda", role: "Site Engineer", department: "Electrical", allocationPercent: 100, startDate: "2026-04-23", endDate: "2026-06-20", availability: "Overallocated", status: "Active" },
      { id: "team-wire-003", employee: "Farah Khan", member: "Farah Khan", role: "Team Lead", department: "Electrical", allocationPercent: 90, startDate: "2026-04-24", endDate: "2026-06-18", availability: "Occupied", status: "Active" },
    ],
    milestones: [
      { id: "ms-wire-001", name: "Cable tray completion", description: "Cable tray installation completed in machining bay.", targetDate: "2026-05-12", completionDate: "2026-05-14", owner: "Naveen Gowda", status: "Completed" },
      { id: "ms-wire-002", name: "Panel termination", description: "Power and control wiring termination.", targetDate: "2026-06-08", completionDate: "", owner: "Farah Khan", status: "Delayed" },
      { id: "ms-wire-003", name: "Load test sign-off", description: "Final load testing and acceptance.", targetDate: "2026-06-18", completionDate: "", owner: "Vikram Rao", status: "Pending" },
    ],
    inventoryAllocations: [
      { id: "inv-wire-001", itemCode: "CBL-4C-16SQ", itemName: "4 Core 16 sq mm Copper Cable", category: "Cable", requiredQty: 1800, issuedQty: 1650, remainingQty: 150, unit: "Mtr", storeLocation: "Electrical Store", issueDate: "2026-04-26", status: "Partial" },
      { id: "inv-wire-002", itemCode: "MCCB-125A", itemName: "125A MCCB", category: "Switchgear", requiredQty: 18, issuedQty: 18, remainingQty: 0, unit: "Nos", storeLocation: "Switchgear Store", issueDate: "2026-05-06", status: "Issued" },
    ],
    purchases: [
      { id: "po-wire-001", poNumber: "PO-BE-2605-031", vendor: "Karnataka Electricals", itemSummary: "Cable trays, saddles, glands", amount: 985000, expectedDelivery: "2026-05-18", actualDelivery: "2026-05-22", status: "Delayed", linkedTask: "Cable tray installation" },
      { id: "po-wire-002", poNumber: "PO-BE-2606-006", vendor: "PowerGrid Controls", itemSummary: "Panel accessories and terminal blocks", amount: 450000, expectedDelivery: "2026-06-17", actualDelivery: "", status: "Ordered", linkedTask: "Panel termination" },
    ],
    financials: [
      { id: "fin-wire-001", label: "Materials", type: "Materials", amount: 3810000, budget: 4100000, actual: 3810000, status: "Risk" },
      { id: "fin-wire-002", label: "Labour", type: "Labour", amount: 2140000, budget: 2200000, actual: 2140000, status: "Risk" },
      { id: "fin-wire-003", label: "Transport", type: "Transport", amount: 310000, budget: 250000, actual: 310000, status: "Over Budget" },
      { id: "fin-wire-004", label: "Tools", type: "Tools", amount: 175000, budget: 150000, actual: 175000, status: "Over Budget" },
      { id: "fin-wire-005", label: "Miscellaneous", type: "Miscellaneous", amount: 290000, budget: 850000, actual: 290000, status: "On Track" },
    ],
    documents: [
      { id: "doc-wire-001", name: "Factory Wiring Contract.pdf", category: "Contracts", uploadedBy: "Vikram Rao", uploadedDate: "2026-04-22", size: "2.4 MB" },
      { id: "doc-wire-002", name: "Panel Termination Report.pdf", category: "Reports", uploadedBy: "Farah Khan", uploadedDate: "2026-06-12", size: "980 KB" },
    ],
    activities: [
      { id: "act-wire-001", title: "Site report uploaded", description: "Panel termination delay report uploaded by Farah Khan.", actor: "Farah Khan", date: "2026-06-16T09:45:00+05:30" },
      { id: "act-wire-002", title: "Project status changed to Active", description: "Factory Electrical Wiring moved to Active after site mobilization.", actor: "Vikram Rao", date: "2026-04-24T10:15:00+05:30" },
      { id: "act-wire-003", title: "Team allocation completed", description: "Electrical crew assigned for machining bay wiring.", actor: "Vikram Rao", date: "2026-04-23T15:30:00+05:30" },
    ],
    createdAt: "2026-04-22T09:00:00+05:30",
    updatedAt: "2026-06-16T09:45:00+05:30",
  },
  {
    id: "pm-warehouse-access",
    name: "Warehouse Access Control Setup",
    code: "BE-PM-2026-003",
    client: "Nandi Logistics Park",
    companyName: "Nandi Logistics Park",
    projectCategory: "Automation",
    description:
      "Biometric access, RFID readers, boom barrier integration, and attendance controller setup for warehouse gates.",
    priority: "High",
    status: "Planning",
    projectManager: "Priya Iyer",
    siteEngineer: "Sandeep R",
    teamLead: "Kavya Menon",
    department: "Automation",
    startDate: "2026-06-20",
    endDate: "2026-08-05",
    actualEndDate: null,
    milestoneTemplate: "Installation & commissioning",
    estimatedBudget: 3650000,
    approvedBudget: 3900000,
    materialBudget: 2350000,
    labourBudget: 850000,
    otherCostBudget: 700000,
    expenses: 420000,
    progress: 18,
    teamSize: 6,
    resourceUtilization: 56,
    pendingInvoices: 1,
    openIssues: 0,
    siteName: "Nandi Logistics Park Gate 2",
    siteAddress: "Nelamangala Road, Bengaluru Rural, Karnataka",
    city: "Bengaluru Rural",
    state: "Karnataka",
    siteContactPerson: "Ramesh Hegde",
    siteContactNumber: "+91 98801 77821",
    tasks: [
      { id: "task-access-001", taskId: "TSK-001", title: "Gate controller design", description: "Finalize controller locations and cabling plan.", assignedTo: "Sandeep R", owner: "Sandeep R", assignedBy: "Priya Iyer", startDate: "2026-06-20", dueDate: "2026-06-28", priority: "High", status: "Assigned", progress: 10, estimatedHours: 22, actualHours: 2, dependencies: "-" },
      { id: "task-access-002", taskId: "TSK-002", title: "RFID reader installation", description: "Install RFID readers and test gate entry logs.", assignedTo: "Kavya Menon", owner: "Kavya Menon", assignedBy: "Priya Iyer", startDate: "2026-07-01", dueDate: "2026-07-20", priority: "Medium", status: "Not Started", progress: 0, estimatedHours: 52, actualHours: 0, dependencies: "TSK-001" },
    ],
    teamAllocations: [
      { id: "team-access-001", employee: "Priya Iyer", member: "Priya Iyer", role: "Project Manager", department: "Projects", allocationPercent: 70, startDate: "2026-06-20", endDate: "2026-08-05", availability: "Available", status: "Planned" },
      { id: "team-access-002", employee: "Sandeep R", member: "Sandeep R", role: "Site Engineer", department: "Automation", allocationPercent: 80, startDate: "2026-06-20", endDate: "2026-08-03", availability: "Available", status: "Planned" },
    ],
    milestones: [
      { id: "ms-access-001", name: "Design approval", description: "Gate controller and reader plan approved by client.", targetDate: "2026-06-28", completionDate: "", owner: "Priya Iyer", status: "Pending" },
      { id: "ms-access-002", name: "Device installation", description: "Biometric and RFID devices installed.", targetDate: "2026-07-20", completionDate: "", owner: "Kavya Menon", status: "Pending" },
    ],
    inventoryAllocations: [
      { id: "inv-access-001", itemCode: "BIO-AC-7IN", itemName: "Biometric Access Controller", category: "Access Control", requiredQty: 12, issuedQty: 0, remainingQty: 12, unit: "Nos", storeLocation: "Automation Store", issueDate: "", status: "Approved" },
      { id: "inv-access-002", itemCode: "RFID-UHF-RDR", itemName: "UHF RFID Reader", category: "Access Control", requiredQty: 8, issuedQty: 0, remainingQty: 8, unit: "Nos", storeLocation: "Automation Store", issueDate: "", status: "Requested" },
    ],
    purchases: [
      { id: "po-access-001", poNumber: "PO-BE-2606-026", vendor: "AccessPro Systems", itemSummary: "RFID readers and access controllers", amount: 1190000, expectedDelivery: "2026-06-27", actualDelivery: "", status: "Approved", linkedTask: "RFID reader installation" },
    ],
    financials: [
      { id: "fin-access-001", label: "Materials", type: "Materials", amount: 280000, budget: 2350000, actual: 280000, status: "On Track" },
      { id: "fin-access-002", label: "Labour", type: "Labour", amount: 90000, budget: 850000, actual: 90000, status: "On Track" },
      { id: "fin-access-003", label: "Transport", type: "Transport", amount: 25000, budget: 150000, actual: 25000, status: "On Track" },
      { id: "fin-access-004", label: "Tools", type: "Tools", amount: 10000, budget: 100000, actual: 10000, status: "On Track" },
      { id: "fin-access-005", label: "Miscellaneous", type: "Miscellaneous", amount: 15000, budget: 450000, actual: 15000, status: "On Track" },
    ],
    documents: [
      { id: "doc-access-001", name: "Access Control BOQ.xlsx", category: "BOQ", uploadedBy: "Priya Iyer", uploadedDate: "2026-06-14", size: "410 KB" },
      { id: "doc-access-002", name: "Gate Layout Markup.pdf", category: "Drawings", uploadedBy: "Sandeep R", uploadedDate: "2026-06-15", size: "1.2 MB" },
    ],
    activities: [
      { id: "act-access-001", title: "Budget approved", description: "Approved budget set to ₹39,00,000.", actor: "Finance Team", date: "2026-06-15T13:40:00+05:30" },
      { id: "act-access-002", title: "Purchase order approved", description: "AccessPro Systems PO approved for access control devices.", actor: "Priya Iyer", date: "2026-06-15T10:05:00+05:30" },
    ],
    createdAt: "2026-06-14T11:00:00+05:30",
    updatedAt: "2026-06-15T13:40:00+05:30",
  },
  {
    id: "pm-solar-backup",
    name: "Solar Backup Installation",
    code: "BE-PM-2026-004",
    client: "Sattva Tech Park",
    companyName: "Sattva Tech Park",
    projectCategory: "Infrastructure",
    description:
      "Hybrid solar backup system for security control room, server UPS backup, and emergency lighting circuits.",
    priority: "Medium",
    status: "Completed",
    projectManager: "Anil Thomas",
    siteEngineer: "Divya Bhat",
    teamLead: "Mohammed Irfan",
    department: "Operations",
    startDate: "2026-03-10",
    endDate: "2026-05-05",
    actualEndDate: "2026-05-02",
    milestoneTemplate: "Fast-track delivery",
    estimatedBudget: 6100000,
    approvedBudget: 6250000,
    materialBudget: 4250000,
    labourBudget: 1100000,
    otherCostBudget: 900000,
    expenses: 5830000,
    progress: 100,
    teamSize: 9,
    resourceUtilization: 76,
    pendingInvoices: 0,
    openIssues: 0,
    siteName: "Sattva Tech Park Tower B",
    siteAddress: "Outer Ring Road, Marathahalli, Bengaluru, Karnataka",
    city: "Bengaluru",
    state: "Karnataka",
    siteContactPerson: "Rohit Menon",
    siteContactNumber: "+91 97422 55331",
    tasks: [
      { id: "task-solar-001", taskId: "TSK-001", title: "Panel and inverter installation", description: "Install rooftop solar panels and hybrid inverter set.", assignedTo: "Divya Bhat", owner: "Divya Bhat", assignedBy: "Anil Thomas", startDate: "2026-03-15", dueDate: "2026-04-05", priority: "High", status: "Completed", progress: 100, estimatedHours: 110, actualHours: 104, dependencies: "-" },
      { id: "task-solar-002", taskId: "TSK-002", title: "Commissioning and client training", description: "Commission backup system and train facility staff.", assignedTo: "Mohammed Irfan", owner: "Mohammed Irfan", assignedBy: "Anil Thomas", startDate: "2026-04-28", dueDate: "2026-05-02", priority: "Medium", status: "Completed", progress: 100, estimatedHours: 18, actualHours: 16, dependencies: "TSK-001" },
    ],
    teamAllocations: [
      { id: "team-solar-001", employee: "Anil Thomas", member: "Anil Thomas", role: "Project Manager", department: "Projects", allocationPercent: 100, startDate: "2026-03-10", endDate: "2026-05-05", availability: "Available", status: "Released" },
      { id: "team-solar-002", employee: "Divya Bhat", member: "Divya Bhat", role: "Site Engineer", department: "Operations", allocationPercent: 80, startDate: "2026-03-12", endDate: "2026-05-02", availability: "Available", status: "Released" },
    ],
    milestones: [
      { id: "ms-solar-001", name: "Material delivery", description: "Solar panels, inverter, and batteries delivered.", targetDate: "2026-03-18", completionDate: "2026-03-17", owner: "Divya Bhat", status: "Completed" },
      { id: "ms-solar-002", name: "Commissioning", description: "System commissioned and accepted by client.", targetDate: "2026-05-05", completionDate: "2026-05-02", owner: "Anil Thomas", status: "Completed" },
    ],
    inventoryAllocations: [
      { id: "inv-solar-001", itemCode: "SOL-PNL-550W", itemName: "550W Solar Panel", category: "Solar", requiredQty: 48, issuedQty: 48, remainingQty: 0, unit: "Nos", storeLocation: "Renewables Store", issueDate: "2026-03-16", status: "Issued" },
      { id: "inv-solar-002", itemCode: "BAT-LFP-5KWH", itemName: "5kWh LFP Battery Module", category: "Battery", requiredQty: 10, issuedQty: 10, remainingQty: 0, unit: "Nos", storeLocation: "Renewables Store", issueDate: "2026-03-18", status: "Issued" },
    ],
    purchases: [
      { id: "po-solar-001", poNumber: "PO-BE-2603-012", vendor: "SunGrid Energy", itemSummary: "Solar panels and hybrid inverter", amount: 3450000, expectedDelivery: "2026-03-18", actualDelivery: "2026-03-17", status: "Received", linkedTask: "Panel and inverter installation" },
    ],
    financials: [
      { id: "fin-solar-001", label: "Materials", type: "Materials", amount: 4050000, budget: 4250000, actual: 4050000, status: "On Track" },
      { id: "fin-solar-002", label: "Labour", type: "Labour", amount: 1030000, budget: 1100000, actual: 1030000, status: "On Track" },
      { id: "fin-solar-003", label: "Transport", type: "Transport", amount: 265000, budget: 300000, actual: 265000, status: "On Track" },
      { id: "fin-solar-004", label: "Tools", type: "Tools", amount: 145000, budget: 150000, actual: 145000, status: "On Track" },
      { id: "fin-solar-005", label: "Miscellaneous", type: "Miscellaneous", amount: 340000, budget: 450000, actual: 340000, status: "On Track" },
    ],
    documents: [
      { id: "doc-solar-001", name: "Commissioning Report.pdf", category: "Reports", uploadedBy: "Anil Thomas", uploadedDate: "2026-05-02", size: "2.1 MB" },
      { id: "doc-solar-002", name: "Solar Invoice Pack.zip", category: "Invoices", uploadedBy: "Finance Team", uploadedDate: "2026-05-04", size: "6.8 MB" },
    ],
    activities: [
      { id: "act-solar-001", title: "Site report uploaded", description: "Commissioning report uploaded for client handover.", actor: "Anil Thomas", date: "2026-05-02T17:00:00+05:30" },
      { id: "act-solar-002", title: "Team allocation completed", description: "Solar installation team released after handover.", actor: "Anil Thomas", date: "2026-05-02T18:15:00+05:30" },
    ],
    createdAt: "2026-03-10T10:00:00+05:30",
    updatedAt: "2026-05-04T11:00:00+05:30",
  },
  {
    id: "pm-network-rack",
    name: "Office Network Rack Upgrade",
    code: "BE-PM-2026-005",
    client: "Apex Finserv India",
    companyName: "Apex Finserv India",
    projectCategory: "Maintenance",
    description:
      "Upgrade network rack, patch panels, UPS, cable dressing, and switch migration for a corporate office floor.",
    priority: "Low",
    status: "On Hold",
    projectManager: "Neha Reddy",
    siteEngineer: "Arvind S",
    teamLead: "Pooja Rao",
    department: "Service",
    startDate: "2026-06-05",
    endDate: "2026-06-28",
    actualEndDate: null,
    milestoneTemplate: "Maintenance contract",
    estimatedBudget: 1850000,
    approvedBudget: 1950000,
    materialBudget: 1180000,
    labourBudget: 420000,
    otherCostBudget: 350000,
    expenses: 520000,
    progress: 42,
    teamSize: 5,
    resourceUtilization: 61,
    pendingInvoices: 2,
    openIssues: 1,
    siteName: "Apex Finserv Infantry Road",
    siteAddress: "Infantry Road, Bengaluru, Karnataka",
    city: "Bengaluru",
    state: "Karnataka",
    siteContactPerson: "Nisha Kapoor",
    siteContactNumber: "+91 99725 66110",
    tasks: [
      { id: "task-rack-001", taskId: "TSK-001", title: "Rack audit", description: "Audit rack layout and migration risk.", assignedTo: "Arvind S", owner: "Arvind S", assignedBy: "Neha Reddy", startDate: "2026-06-05", dueDate: "2026-06-08", priority: "Medium", status: "Completed", progress: 100, estimatedHours: 12, actualHours: 10, dependencies: "-" },
      { id: "task-rack-002", taskId: "TSK-002", title: "Switch migration window", description: "Migrate switch links during approved downtime.", assignedTo: "Pooja Rao", owner: "Pooja Rao", assignedBy: "Neha Reddy", startDate: "2026-06-14", dueDate: "2026-06-16", priority: "High", status: "Blocked", progress: 25, estimatedHours: 18, actualHours: 4, dependencies: "Client downtime approval" },
    ],
    teamAllocations: [
      { id: "team-rack-001", employee: "Neha Reddy", member: "Neha Reddy", role: "Project Manager", department: "Service", allocationPercent: 60, startDate: "2026-06-05", endDate: "2026-06-28", availability: "Available", status: "On Hold" },
      { id: "team-rack-002", employee: "Arvind S", member: "Arvind S", role: "Site Engineer", department: "Service", allocationPercent: 50, startDate: "2026-06-05", endDate: "2026-06-28", availability: "On Leave", status: "On Hold" },
    ],
    milestones: [
      { id: "ms-rack-001", name: "Rack audit complete", description: "Existing rack and cable map documented.", targetDate: "2026-06-08", completionDate: "2026-06-08", owner: "Arvind S", status: "Completed" },
      { id: "ms-rack-002", name: "Migration window", description: "Switch migration during client-approved downtime.", targetDate: "2026-06-16", completionDate: "", owner: "Pooja Rao", status: "Delayed" },
    ],
    inventoryAllocations: [
      { id: "inv-rack-001", itemCode: "PP-CAT6-24P", itemName: "24 Port CAT6 Patch Panel", category: "Networking", requiredQty: 8, issuedQty: 4, remainingQty: 4, unit: "Nos", storeLocation: "Networking Store", issueDate: "2026-06-07", status: "Partial" },
      { id: "inv-rack-002", itemCode: "UPS-3KVA-RACK", itemName: "3KVA Rack UPS", category: "UPS", requiredQty: 2, issuedQty: 0, remainingQty: 2, unit: "Nos", storeLocation: "UPS Store", issueDate: "", status: "Shortage" },
    ],
    purchases: [
      { id: "po-rack-001", poNumber: "PO-BE-2606-019", vendor: "NetRack Solutions", itemSummary: "Rack UPS and cable managers", amount: 315000, expectedDelivery: "2026-06-18", actualDelivery: "", status: "Requested", linkedTask: "Switch migration window" },
    ],
    financials: [
      { id: "fin-rack-001", label: "Materials", type: "Materials", amount: 310000, budget: 1180000, actual: 310000, status: "On Track" },
      { id: "fin-rack-002", label: "Labour", type: "Labour", amount: 120000, budget: 420000, actual: 120000, status: "On Track" },
      { id: "fin-rack-003", label: "Transport", type: "Transport", amount: 35000, budget: 70000, actual: 35000, status: "On Track" },
      { id: "fin-rack-004", label: "Tools", type: "Tools", amount: 25000, budget: 80000, actual: 25000, status: "On Track" },
      { id: "fin-rack-005", label: "Miscellaneous", type: "Miscellaneous", amount: 30000, budget: 200000, actual: 30000, status: "On Track" },
    ],
    documents: [
      { id: "doc-rack-001", name: "Rack Audit Photos.zip", category: "Site Photos", uploadedBy: "Arvind S", uploadedDate: "2026-06-08", size: "18.2 MB" },
      { id: "doc-rack-002", name: "Network Rack BOQ.xlsx", category: "BOQ", uploadedBy: "Neha Reddy", uploadedDate: "2026-06-06", size: "290 KB" },
    ],
    activities: [
      { id: "act-rack-001", title: "Project status changed to On Hold", description: "Client downtime approval pending for switch migration.", actor: "Neha Reddy", date: "2026-06-14T18:20:00+05:30" },
      { id: "act-rack-002", title: "Inventory allocated", description: "Patch panels issued from Networking Store.", actor: "Pooja Rao", date: "2026-06-07T12:10:00+05:30" },
    ],
    createdAt: "2026-06-05T09:30:00+05:30",
    updatedAt: "2026-06-14T18:20:00+05:30",
  },
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

const getTaskStatus = (task = {}) => task.status || "Assigned";

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
  if (status === "Under Review") return 85;
  if (status === "In Progress") return 55;
  if (status === "Assigned") return 15;
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
  const existing = getProjects();
  return existing.length ? existing : MOCK_PROJECTS;
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

const buildDefaultTasks = (form) => [
  {
    id: makeId("task"),
    taskId: "TSK-001",
    title: "Project kickoff and responsibility handover",
    description: "Confirm scope, site contacts, timeline, and responsibility matrix.",
    owner: form.projectManager,
    assignedTo: form.projectManager,
    assignedBy: form.projectManager || "Project office",
    startDate: form.startDate,
    dueDate: form.startDate,
    priority: form.priority,
    status: form.status === "Active" ? "Completed" : "Assigned",
    progress: form.status === "Active" ? 100 : 15,
    estimatedHours: 4,
    actualHours: form.status === "Active" ? 4 : 0,
    dependencies: "-",
    comments: "Initial project setup activity.",
  },
  {
    id: makeId("task"),
    taskId: "TSK-002",
    title: "Material requirement and site readiness review",
    description: "Validate BOQ, inventory availability, and site prerequisites.",
    owner: form.siteEngineer || form.projectManager,
    assignedTo: form.siteEngineer || form.projectManager,
    assignedBy: form.projectManager || "Project office",
    startDate: form.startDate,
    dueDate: form.startDate,
    priority: form.priority === "Low" ? "Medium" : form.priority,
    status: "Assigned",
    progress: 0,
    estimatedHours: 6,
    actualHours: 0,
    dependencies: "TSK-001",
    comments: "",
  },
  {
    id: makeId("task"),
    taskId: "TSK-003",
    title: "Execution checkpoint",
    description: form.milestoneTemplate || "Milestone tracking checkpoint.",
    owner: form.teamLead || form.projectManager,
    assignedTo: form.teamLead || form.projectManager,
    assignedBy: form.projectManager || "Project office",
    startDate: form.startDate,
    dueDate: form.endDate,
    priority: "Medium",
    status: "Not Started",
    progress: 0,
    estimatedHours: 8,
    actualHours: 0,
    dependencies: "TSK-002",
    comments: "",
  },
];

const buildDefaultMilestones = (form) => [
  {
    id: makeId("milestone"),
    name: "Project kickoff",
    description: "Scope, client communication, and responsibility handover completed.",
    targetDate: form.startDate,
    completionDate: form.status === "Active" ? form.startDate : "",
    owner: form.projectManager,
    status: form.status === "Active" ? "Completed" : "Pending",
  },
  {
    id: makeId("milestone"),
    name: "Material readiness",
    description: "Materials allocated or purchase requests initiated.",
    targetDate: form.startDate,
    completionDate: "",
    owner: form.siteEngineer || form.projectManager,
    status: "Pending",
  },
  {
    id: makeId("milestone"),
    name: "Planned completion",
    description: form.milestoneTemplate || "Final execution and handover checkpoint.",
    targetDate: form.endDate,
    completionDate: form.actualEndDate,
    owner: form.teamLead || form.projectManager,
    status: form.actualEndDate ? "Completed" : "Pending",
  },
];

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
  estimatedBudget: project.estimatedBudget || "",
  approvedBudget: project.approvedBudget || "",
  materialBudget: project.materialBudget || "",
  labourBudget: project.labourBudget || "",
  otherCostBudget: project.otherCostBudget || "",
  siteName: project.siteName || "",
  locationId: project.locationId || "",
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
  const tasks = existingProject?.tasks?.length
    ? existingProject.tasks
    : buildDefaultTasks(form);
  const inventoryAllocations = existingProject?.inventoryAllocations?.length
    ? existingProject.inventoryAllocations
    : buildDefaultInventory(form);
  const milestones = existingProject?.milestones?.length
    ? existingProject.milestones
    : buildDefaultMilestones(form);
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
    className="rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-600 transition hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-700"
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
    if (!String(form.projectManagerId || "").trim() && !form.projectManager.trim()) {
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

  const updateLocation = (locationId) => {
    const selectedLocation =
      locations.find((location) => String(location.id) === String(locationId)) || null;
    setForm((prev) => ({
      ...prev,
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
  const legacyProjectManagerOption = makeLegacySelectOption(
    form.projectManager,
    employeeSelectOptions
  );
  const legacySiteEngineerOption = makeLegacySelectOption(
    form.siteEngineer,
    employeeSelectOptions
  );
  const legacyTeamLeadOption = makeLegacySelectOption(form.teamLead, employeeSelectOptions);
  const legacyLocationOption = makeLegacySelectOption(form.siteName, locationSelectOptions);

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
                    <SelectField
                      value={
                        form.projectManagerId ||
                        (legacyProjectManagerOption
                          ? legacyProjectManagerOption.value
                          : "")
                      }
                      onChange={(value) =>
                        updateEmployee("projectManager", "projectManagerId", value)
                      }
                    >
                      <option value="">Select project manager</option>
                      {legacyProjectManagerOption ? (
                        <option value={legacyProjectManagerOption.value}>
                          {legacyProjectManagerOption.label}
                        </option>
                      ) : null}
                      {employeeSelectOptions.map((employee) => (
                        <option key={employee.value} value={employee.value}>
                          {employee.label}
                        </option>
                      ))}
                    </SelectField>
                  </Field>
                  <Field label="Site Engineer">
                    <SelectField
                      value={
                        form.siteEngineerId ||
                        (legacySiteEngineerOption
                          ? legacySiteEngineerOption.value
                          : "")
                      }
                      onChange={(value) =>
                        updateEmployee("siteEngineer", "siteEngineerId", value)
                      }
                    >
                      <option value="">Select site engineer</option>
                      {legacySiteEngineerOption ? (
                        <option value={legacySiteEngineerOption.value}>
                          {legacySiteEngineerOption.label}
                        </option>
                      ) : null}
                      {employeeSelectOptions.map((employee) => (
                        <option key={employee.value} value={employee.value}>
                          {employee.label}
                        </option>
                      ))}
                    </SelectField>
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
                  <Field label="Site Name">
                    <SelectField
                      value={
                        form.locationId ||
                        (legacyLocationOption ? legacyLocationOption.value : "")
                      }
                      onChange={updateLocation}
                    >
                      <option value="">Select location</option>
                      {legacyLocationOption ? (
                        <option value={legacyLocationOption.value}>
                          {legacyLocationOption.label}
                        </option>
                      ) : null}
                      {locationSelectOptions.map((location) => (
                        <option key={location.value} value={location.value}>
                          {location.label}
                        </option>
                      ))}
                    </SelectField>
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
      parentTask: form.parentTask,
      owner: form.owner.trim(),
      assignedTo: form.owner.trim(),
      assignedBy: form.assignedBy || project.projectManager || "Project office",
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
          actor: project.projectManager || "Project office",
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
            <h2 className="mt-1 text-lg font-semibold text-slate-950">
              {project.name}
            </h2>
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
          <Field label="Parent Task">
            <SelectField
              value={form.parentTask}
              onChange={(value) => updateField("parentTask", value)}
            >
              <option value="">No parent task</option>
              {(project.tasks || []).map((task) => (
                <option key={task.id} value={task.id}>
                  {getTaskName(task) || task.taskId || task.id}
                </option>
              ))}
            </SelectField>
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
              readOnly
              className={`${inputClass} bg-slate-50 text-slate-500`}
            />
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
              {TASK_STATUS_OPTIONS.map((option) => (
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

const ProjectDetailDrawer = ({
  project,
  initialTab,
  onClose,
  onEdit,
  onAssignTask,
}) => {
  const [activeTab, setActiveTab] = useState(initialTab || "overview");
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
                        <td colSpan="14" className="px-4 py-10 text-center text-slate-500">
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
                              <TableActionButton>View</TableActionButton>
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
                              <TableActionButton>View</TableActionButton>
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
                              <TableActionButton>View</TableActionButton>
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
                              : numberValue(item.requiredQty ?? item.reserved).toLocaleString("en-IN")}
                          </td>
                          <td className="px-4 py-3 text-right text-slate-600">
                            {item.unit === "INR"
                              ? formatInrCurrency(item.issuedQty ?? item.issued)
                              : numberValue(item.issuedQty ?? item.issued).toLocaleString("en-IN")}
                          </td>
                          <td className="px-4 py-3 text-right font-semibold text-slate-900">
                            {item.unit === "INR"
                              ? formatInrCurrency(
                                  item.remainingQty ??
                                    numberValue(item.requiredQty ?? item.reserved) -
                                      numberValue(item.issuedQty ?? item.issued)
                                )
                              : numberValue(
                                  item.remainingQty ??
                                    numberValue(item.requiredQty ?? item.reserved) -
                                      numberValue(item.issuedQty ?? item.issued)
                                ).toLocaleString("en-IN")}
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
                              <TableActionButton>View</TableActionButton>
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
                              <TableActionButton>View</TableActionButton>
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
                              <TableActionButton>View</TableActionButton>
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
                              <p className="text-xs font-semibold text-slate-500">
                                {new Date(activity.date).toLocaleTimeString("en-IN", {
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })}
                              </p>
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
      ensureProjectManagementProjects(MOCK_PROJECTS);
    }
    void hydrateProjectManagementProjects(MOCK_PROJECTS).then(setProjects);
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

  const replaceProject = (updatedProject) => {
    const currentProjects = getProjects();
    const exists = currentProjects.some(
      (project) => String(project.id) === String(updatedProject.id)
    );
    const next = exists
      ? currentProjects.map((project) =>
          String(project.id) === String(updatedProject.id)
            ? updatedProject
            : project
        )
      : [updatedProject, ...currentProjects];
    setLocalProjects(next);
    setProjects(next);
    if (
      selectedProject &&
      String(selectedProject.id) === String(updatedProject.id)
    ) {
      setSelectedProject(updatedProject);
    }
  };

  const openCreateModal = () => {
    setEditingProject(null);
    setProjectModalOpen(true);
  };

  const openEditModal = (project) => {
    setEditingProject(project);
    setProjectModalOpen(true);
  };

  const saveProjectRecord = (project) => {
    if (editingProject) {
      replaceProject(project);
    } else {
      saveProject(project);
      setProjects(getProjects());
    }
    setProjectModalOpen(false);
    setEditingProject(null);
  };

  const openDetails = (project, tab = "overview") => {
    setSelectedProject(project);
    setSelectedDetailTab(tab);
    setOpenMenuId(null);
  };

  const saveTaskAssignment = (updatedProject) => {
    replaceProject(updatedProject);
    setTaskProject(null);
    setSelectedProject(updatedProject);
    setSelectedDetailTab("tasks");
    navigate("/project-management/tasks");
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
                              onClick={() => setTaskProject(project)}
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
          onAssignTask={(project) => setTaskProject(project)}
        />
      )}
    </div>
  );
};

export default ProjectManagementProjects;
