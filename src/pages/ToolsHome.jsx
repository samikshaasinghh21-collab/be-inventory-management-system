import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import DateInput from "../components/common/DateInput";
import toolDrillImage from "../assets/images/drilling_mechine.png";
import toolGrinderImage from "../assets/images/Angle-Grinder.png";
import toolLaserImage from "../assets/images/Laser-Level.png";
import toolCaliperImage from "../assets/images/Digital-Caliper.png";
import toolMeterImage from "../assets/images/Multi-Meter.png";
import {
  generateNextToolId,
  getToolAssignments,
  getToolMaintenance,
  getTools,
  setToolAssignments,
  setToolMaintenance,
  setTools,
} from "../services/toolsStore";
import { formatDate } from "../utils/dateFormat";

const PAGE_SIZE = 6;

// Map image filenames to imported assets
const TOOL_IMAGE_MAP = {
  "drilling_mechine.png": toolDrillImage,
  "Angle-Grinder.png": toolGrinderImage,
  "Laser-level.png": toolLaserImage,
  "Laser-Level.png": toolLaserImage,
  "Digital-Caliper.png": toolCaliperImage,
  "Multi-Meter.png": toolMeterImage,
};

const getToolImage = (imageUrl) => {
  if (!imageUrl) return toolDrillImage;

  const normalized = String(imageUrl).trim();
  if (!normalized) return toolDrillImage;

  // Exact match
  if (TOOL_IMAGE_MAP[normalized]) return TOOL_IMAGE_MAP[normalized];

  // Try basename for values like "/tool-images/drill.png"
  const basename = normalized.split("/").pop();
  if (basename && TOOL_IMAGE_MAP[basename]) return TOOL_IMAGE_MAP[basename];

  // If it's a URL or absolute path, use it directly
  if (
    normalized.startsWith("http") ||
    normalized.startsWith("/") ||
    normalized.startsWith("data:")
  ) {
    return normalized;
  }

  // Fallback to default
  return toolDrillImage;
};

const STATUS_META = {
  available: {
    label: "Available",
    badgeClass: "bg-emerald-100 text-emerald-800 border-emerald-200",
    dotClass: "bg-emerald-500",
  },
  inUse: {
    label: "In Use",
    badgeClass: "bg-blue-100 text-blue-800 border-blue-200",
    dotClass: "bg-blue-500",
  },
  maintenance: {
    label: "Maintenance",
    badgeClass: "bg-amber-100 text-amber-800 border-amber-200",
    dotClass: "bg-amber-500",
  },
  overdue: {
    label: "Overdue",
    badgeClass: "bg-red-100 text-red-800 border-red-200",
    dotClass: "bg-red-500",
  },
};

const ACTION_BUTTON_BASE =
  "inline-flex h-9 w-9 items-center justify-center rounded-lg border text-sm transition focus:outline-none focus:ring-2 focus:ring-blue-100";

const ACTION_BUTTONS = {
  neutral:
    `${ACTION_BUTTON_BASE} border-slate-200 bg-white text-slate-500 hover:border-slate-300 hover:text-slate-700`,
  primary:
    `${ACTION_BUTTON_BASE} border-blue-200 bg-blue-50 text-blue-600 hover:bg-blue-100`,
  warning:
    `${ACTION_BUTTON_BASE} border-amber-200 bg-amber-50 text-amber-600 hover:bg-amber-100`,
  danger:
    `${ACTION_BUTTON_BASE} border-red-200 bg-red-50 text-red-600 hover:bg-red-100`,
};

const formatNumber = (value) => new Intl.NumberFormat("en-US").format(value);

const clampText = (value, max = 18) => {
  if (!value) return "-";
  const text = String(value);
  if (text.length <= max) return text;
  const slicePoint = Math.max(0, max - 3);
  return `${text.slice(0, slicePoint)}...`;
};

const todayIso = () => new Date().toISOString().slice(0, 10);

const createId = (prefix) =>
  `${prefix}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;

const buildToolForm = (tool) => ({
  name: tool?.name ?? "",
  type: tool?.type ?? "",
  serialNumber: tool?.serialNumber ?? "",
  purchaseDate: tool?.purchaseDate ?? "",
  baseLocation: tool?.baseLocation ?? "",
  condition: tool?.condition ?? "Good",
  imageUrl: tool?.imageUrl ?? "",
  notes: tool?.notes ?? "",
});

const ToolsHome = () => {
  const [tools, setToolsState] = useState(() => getTools());
  const [assignments, setAssignmentsState] = useState(() =>
    getToolAssignments()
  );
  const [maintenance, setMaintenanceState] = useState(() =>
    getToolMaintenance()
  );
  const [isLoading, setIsLoading] = useState(true);
  const [selectedToolId, setSelectedToolId] = useState(
    () => getTools()[0]?.id ?? null
  );
  const [form, setForm] = useState(() =>
    buildToolForm(getTools()[0] ?? null)
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [locationFilter, setLocationFilter] = useState("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [error] = useState("");

  const [showAddModal, setShowAddModal] = useState(false);
  const [newTool, setNewTool] = useState(buildToolForm(null));
  const [newToolErrors, setNewToolErrors] = useState({});

  const [showAssignModal, setShowAssignModal] = useState(false);
  const [assignForm, setAssignForm] = useState({
    assignedTo: "",
    expectedReturnDate: "",
  });
  const [assignError, setAssignError] = useState("");

  const [showMaintenanceModal, setShowMaintenanceModal] = useState(false);
  const [maintenanceForm, setMaintenanceForm] = useState({
    issue: "",
    cost: "",
  });
  const [maintenanceError, setMaintenanceError] = useState("");

  useEffect(() => {
    setIsLoading(true);
    setToolsState(getTools());
    setAssignmentsState(getToolAssignments());
    setMaintenanceState(getToolMaintenance());
    setIsLoading(false);
  }, []);

  const activeAssignmentMap = useMemo(() => {
    const map = new Map();
    assignments.forEach((assignment) => {
      if (!assignment.actualReturnDate) {
        map.set(assignment.toolId, assignment);
      }
    });
    return map;
  }, [assignments]);

  const openMaintenanceMap = useMemo(() => {
    const map = new Map();
    maintenance.forEach((record) => {
      if (String(record.status || "").toLowerCase() !== "completed") {
        map.set(record.toolId, record);
      }
    });
    return map;
  }, [maintenance]);

  const derivedTools = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return tools.map((tool) => {
      const activeAssignment = activeAssignmentMap.get(tool.id);
      const openMaintenance = openMaintenanceMap.get(tool.id);
      const expected = activeAssignment?.expectedReturnDate
        ? new Date(activeAssignment.expectedReturnDate)
        : null;
      const isOverdue =
        Boolean(activeAssignment && expected) &&
        !Number.isNaN(expected.getTime()) &&
        expected < today;

      let statusKey = "available";
      if (activeAssignment) statusKey = isOverdue ? "overdue" : "inUse";
      else if (openMaintenance) statusKey = "maintenance";

      return {
        ...tool,
        assignedTo: activeAssignment?.assignedTo ?? "-",
        statusKey,
        activeAssignment,
        openMaintenance,
      };
    });
  }, [tools, activeAssignmentMap, openMaintenanceMap]);

  const toolTypes = useMemo(() => {
    return Array.from(
      new Set(derivedTools.map((tool) => tool.type).filter(Boolean))
    ).sort((a, b) => a.localeCompare(b));
  }, [derivedTools]);

  const locations = useMemo(() => {
    return Array.from(
      new Set(derivedTools.map((tool) => tool.baseLocation).filter(Boolean))
    ).sort((a, b) => a.localeCompare(b));
  }, [derivedTools]);

  const inUseCount = useMemo(() => {
    return derivedTools.filter((tool) =>
      ["inUse", "overdue"].includes(tool.statusKey)
    ).length;
  }, [derivedTools]);

  const availableCount = useMemo(() => {
    return derivedTools.filter((tool) => tool.statusKey === "available").length;
  }, [derivedTools]);

  const maintenanceCount = useMemo(() => {
    return derivedTools.filter((tool) => tool.statusKey === "maintenance")
      .length;
  }, [derivedTools]);

  const overdueCount = useMemo(() => {
    return derivedTools.filter((tool) => tool.statusKey === "overdue").length;
  }, [derivedTools]);

  const filteredTools = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return derivedTools.filter((tool) => {
      if (query) {
        const haystack = [
          tool.name,
          tool.type,
          tool.serialNumber,
          tool.baseLocation,
          tool.assignedTo,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(query)) return false;
      }

      if (typeFilter !== "all" && tool.type !== typeFilter) return false;

      if (locationFilter !== "all" && tool.baseLocation !== locationFilter)
        return false;

      if (statusFilter !== "all") {
        if (statusFilter === "inUse") {
          return ["inUse", "overdue"].includes(tool.statusKey);
        }
        return tool.statusKey === statusFilter;
      }

      return true;
    });
  }, [derivedTools, searchQuery, typeFilter, statusFilter, locationFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredTools.length / PAGE_SIZE));

  useEffect(() => {
    setCurrentPage((page) => Math.min(page, totalPages));
  }, [totalPages]);

  const pagedTools = useMemo(() => {
    const startIndex = (currentPage - 1) * PAGE_SIZE;
    return filteredTools.slice(startIndex, startIndex + PAGE_SIZE);
  }, [filteredTools, currentPage]);

  useEffect(() => {
    if (!derivedTools.length) {
      setSelectedToolId(null);
      return;
    }
    if (!derivedTools.some((tool) => tool.id === selectedToolId)) {
      setSelectedToolId(derivedTools[0].id);
    }
  }, [derivedTools, selectedToolId]);

  const selectedTool = useMemo(() => {
    return derivedTools.find((tool) => tool.id === selectedToolId) ?? null;
  }, [derivedTools, selectedToolId]);

  useEffect(() => {
    if (selectedTool) {
      setForm(buildToolForm(selectedTool));
    }
  }, [selectedTool?.id]);

  const topCards = [
    {
      id: "total",
      label: "Total Tools",
      value: formatNumber(derivedTools.length),
      hint: `${formatNumber(toolTypes.length)} tool types`,
      icon: (
        <svg
          viewBox="0 0 24 24"
          className="h-4 w-4"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M3 7l9-4 9 4-9 4-9-4z" />
          <path d="M3 7v10l9 4 9-4V7" />
          <path d="M12 11v10" />
        </svg>
      ),
      iconClass: "bg-blue-50 text-blue-600",
      filterValue: "all",
    },
    {
      id: "in-use",
      label: "Tools In Use",
      value: formatNumber(inUseCount),
      hint: "Active checkouts",
      icon: (
        <svg
          viewBox="0 0 24 24"
          className="h-4 w-4"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="12" cy="12" r="7" />
          <path d="M12 8v4l3 2" />
        </svg>
      ),
      iconClass: "bg-blue-100 text-blue-700",
      filterValue: "inUse",
    },
    {
      id: "available",
      label: "Tools Available",
      value: formatNumber(availableCount),
      hint: "Ready to assign",
      icon: (
        <svg
          viewBox="0 0 24 24"
          className="h-4 w-4"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="12" cy="12" r="7" />
          <path d="M9 12l2 2 4-4" />
        </svg>
      ),
      iconClass: "bg-emerald-100 text-emerald-700",
      filterValue: "available",
    },
    {
      id: "maintenance",
      label: "Maintenance",
      value: formatNumber(maintenanceCount),
      hint: "Open work orders",
      icon: (
        <svg
          viewBox="0 0 24 24"
          className="h-4 w-4"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M14.7 6.3a1 1 0 010 1.4l-1.1 1.1a4 4 0 01-5.7 5.7l-3.3 3.3a1 1 0 01-1.4-1.4l3.3-3.3a4 4 0 015.7-5.7l1.1-1.1a1 1 0 011.4 0z" />
        </svg>
      ),
      iconClass: "bg-amber-100 text-amber-700",
      filterValue: "maintenance",
    },
  ];

  const statusChips = [
    {
      value: "all",
      label: "All",
      count: derivedTools.length,
    },
    {
      value: "available",
      label: "Available",
      count: availableCount,
    },
    {
      value: "inUse",
      label: "In Use",
      count: inUseCount,
    },
    {
      value: "overdue",
      label: "Overdue",
      count: overdueCount,
    },
    {
      value: "maintenance",
      label: "Maintenance",
      count: maintenanceCount,
    },
  ];

  const toolModules = [
    {
      id: "analytics",
      title: "Tool Analytics",
      description: "Usage trends, idle time, and maintenance frequency.",
      href: "/inventory/tools/analytics",
      tag: "New",
    },
    {
      id: "maintenance",
      title: "Maintenance Manager",
      description: "Requests, schedules, and technician assignments.",
      href: "/inventory/tools/maintenance",
      tag: "New",
    },
    {
      id: "assignments",
      title: "Assignments & Checkout",
      description: "Assign tools, track due dates, and returns.",
      href: "/inventory/tools/assignments",
      tag: "New",
    },
    {
      id: "categories",
      title: "Tool Categories",
      description: "Manage types, defaults, and maintenance cycles.",
      href: "/inventory/tools/categories",
      tag: "Planned",
    },
    {
      id: "history",
      title: "Tool History",
      description: "Assignment history and maintenance timeline.",
      href: "/inventory/tools/history",
      tag: "Planned",
    },
    {
      id: "bulk",
      title: "Bulk Upload",
      description: "CSV import and bulk edits in minutes.",
      href: "/inventory/tools/bulk-import",
      tag: "Planned",
    },
    {
      id: "map",
      title: "Inventory Map",
      description: "Visualize tools by site and warehouse zones.",
      href: "/inventory/tools/map",
      tag: "Planned",
    },
  ];

  const smartFeatures = [
    {
      id: "qr",
      title: "QR Code Checkout",
      description: "Scan codes to check out tools in seconds.",
      tag: "Planned",
    },
    {
      id: "alerts",
      title: "Auto Overdue Alerts",
      description: "Notify teams when tools pass due dates.",
      tag: "Planned",
    },
    {
      id: "reminders",
      title: "Maintenance Reminders",
      description: "Prompt service based on schedules and usage.",
      tag: "Planned",
    },
    {
      id: "condition",
      title: "Condition-Based Alerts",
      description: "Flag damaged tools before assignments.",
      tag: "Planned",
    },
  ];

  const startCount =
    filteredTools.length === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1;
  const endCount = Math.min(currentPage * PAGE_SIZE, filteredTools.length);

  const filtersActive = useMemo(() => {
    return (
      Boolean(searchQuery.trim()) ||
      typeFilter !== "all" ||
      statusFilter !== "all" ||
      locationFilter !== "all"
    );
  }, [searchQuery, typeFilter, statusFilter, locationFilter]);

  const resetFilters = () => {
    setSearchQuery("");
    setTypeFilter("all");
    setStatusFilter("all");
    setLocationFilter("all");
    setCurrentPage(1);
  };

  const handleCardFilter = (value) => {
    setStatusFilter(value);
    setCurrentPage(1);
  };

  const handleCardKeyDown = (event, value) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      handleCardFilter(value);
    }
  };

  const handleSaveTool = () => {
    if (!selectedTool) return;
    const updated = tools.map((tool) =>
      tool.id === selectedTool.id
        ? {
            ...tool,
            name: form.name.trim(),
            type: form.type.trim(),
            serialNumber: form.serialNumber.trim(),
            purchaseDate: form.purchaseDate,
            baseLocation: form.baseLocation.trim(),
            condition: form.condition,
            imageUrl: form.imageUrl?.trim() || "",
            notes: form.notes.trim(),
          }
        : tool
    );
    setToolsState(updated);
    setTools(updated);
  };

  const handleOpenAdd = () => {
    setNewTool(buildToolForm(null));
    setNewToolErrors({});
    setShowAddModal(true);
  };

  const handleCreateTool = (event) => {
    event.preventDefault();
    const nextErrors = {};
    if (!newTool.name.trim()) nextErrors.name = "Tool name is required.";
    if (!newTool.type.trim()) nextErrors.type = "Tool type is required.";
    if (!newTool.serialNumber.trim())
      nextErrors.serialNumber = "Serial number is required.";
    const serialExists = tools.some(
      (tool) =>
        String(tool.serialNumber || "").toLowerCase() ===
        newTool.serialNumber.trim().toLowerCase()
    );
    if (serialExists) {
      nextErrors.serialNumber = "Serial number must be unique.";
    }
    setNewToolErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;

    const created = {
      id: generateNextToolId(tools),
      name: newTool.name.trim(),
      type: newTool.type.trim(),
      serialNumber: newTool.serialNumber.trim(),
      purchaseDate: newTool.purchaseDate,
      baseLocation: newTool.baseLocation.trim(),
      condition: newTool.condition || "Good",
      imageUrl: newTool.imageUrl?.trim() || "",
      notes: newTool.notes.trim(),
    };
    const updated = [created, ...tools];
    setToolsState(updated);
    setTools(updated);
    setSelectedToolId(created.id);
    setShowAddModal(false);
  };

  const handleOpenAssign = (tool = selectedTool) => {
    if (!tool) return;
    setSelectedToolId(tool.id);
    setAssignForm({ assignedTo: "", expectedReturnDate: "" });
    setAssignError("");
    setShowAssignModal(true);
  };

  const handleAssignTool = (event) => {
    event.preventDefault();
    if (!selectedTool) return;
    if (!assignForm.assignedTo.trim()) {
      setAssignError("Please select a borrower.");
      return;
    }
    if (!String(selectedTool?.serialNumber || "").trim()) {
      setAssignError("Serial number is required before issuing this tool.");
      return;
    }

    const created = {
      id: createId("TA"),
      toolId: selectedTool.id,
      assignedTo: assignForm.assignedTo.trim(),
      toolSerialNumber: selectedTool.serialNumber,
      checkoutDate: todayIso(),
      expectedReturnDate: assignForm.expectedReturnDate || null,
      actualReturnDate: null,
    };
    const updated = [created, ...assignments];
    setAssignmentsState(updated);
    setToolAssignments(updated);
    setShowAssignModal(false);
  };

  const handleCheckin = () => {
    if (!selectedTool?.activeAssignment) return;
    const updated = assignments.map((assignment) =>
      assignment.id === selectedTool.activeAssignment.id
        ? { ...assignment, actualReturnDate: todayIso() }
        : assignment
    );
    setAssignmentsState(updated);
    setToolAssignments(updated);
  };

  const handleOpenMaintenance = (tool = selectedTool) => {
    if (!tool) return;
    setSelectedToolId(tool.id);
    setMaintenanceForm({ issue: "", cost: "" });
    setMaintenanceError("");
    setShowMaintenanceModal(true);
  };

  const handleStartMaintenance = (event) => {
    event.preventDefault();
    if (!selectedTool) return;
    if (!maintenanceForm.issue.trim()) {
      setMaintenanceError("Please enter the maintenance issue.");
      return;
    }
    const created = {
      id: createId("TM"),
      toolId: selectedTool.id,
      issue: maintenanceForm.issue.trim(),
      reportedDate: todayIso(),
      resolvedDate: null,
      status: "Open",
      cost: maintenanceForm.cost ? Number(maintenanceForm.cost) : null,
    };
    const updated = [created, ...maintenance];
    setMaintenanceState(updated);
    setToolMaintenance(updated);
    setShowMaintenanceModal(false);
  };

  const handleResolveMaintenance = () => {
    if (!selectedTool?.openMaintenance) return;
    const updated = maintenance.map((record) =>
      record.id === selectedTool.openMaintenance.id
        ? { ...record, status: "Completed", resolvedDate: todayIso() }
        : record
    );
    setMaintenanceState(updated);
    setToolMaintenance(updated);
  };

  const handleDeleteTool = (tool = selectedTool) => {
    if (!tool) return;
    const confirmed = window.confirm(`Delete tool ${tool.name || tool.id}?`);
    if (!confirmed) return;

    const updatedTools = tools.filter((record) => record.id !== tool.id);
    const updatedAssignments = assignments.filter(
      (record) => record.toolId !== tool.id
    );
    const updatedMaintenance = maintenance.filter(
      (record) => record.toolId !== tool.id
    );

    setToolsState(updatedTools);
    setTools(updatedTools);
    setAssignmentsState(updatedAssignments);
    setToolAssignments(updatedAssignments);
    setMaintenanceState(updatedMaintenance);
    setToolMaintenance(updatedMaintenance);
    setShowAssignModal(false);
    setShowMaintenanceModal(false);
  };

  const checkoutHistory = useMemo(() => {
    if (!selectedTool) return [];
    return assignments
      .filter((assignment) => assignment.toolId === selectedTool.id)
      .sort((a, b) => String(b.checkoutDate).localeCompare(a.checkoutDate));
  }, [assignments, selectedTool]);

  const maintenanceHistory = useMemo(() => {
    if (!selectedTool) return [];
    return maintenance
      .filter((record) => record.toolId === selectedTool.id)
      .sort((a, b) => String(b.reportedDate).localeCompare(a.reportedDate));
  }, [maintenance, selectedTool]);

  const isDirty = useMemo(() => {
    if (!selectedTool) return false;
    const baseline = buildToolForm(selectedTool);
    return Object.keys(baseline).some(
      (key) => String(baseline[key] ?? "") !== String(form[key] ?? "")
    );
  }, [form, selectedTool]);

  const showEmptyState = !isLoading && derivedTools.length === 0;

  return (
    <div className="min-h-screen bg-slate-50/80 p-4 md:p-6 space-y-5">
      <section className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.25em] text-slate-500">
            Tools
          </p>
          <h1 className="text-2xl md:text-3xl font-semibold text-slate-900">
            Tool Management
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Track tools across sites, assignments, and maintenance cycles.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={handleOpenAdd}
            className="inline-flex items-center rounded-lg bg-blue-500 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-blue-600"
          >
            + Add Tool
          </button>
        </div>
      </section>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-5">
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {isLoading &&
              Array.from({ length: 4 }).map((_, index) => (
                <div
                  key={`summary-skeleton-${index}`}
                  className="rounded-2xl border border-slate-200 bg-white px-5 py-5 shadow-sm"
                >
                  <div className="flex items-start justify-between gap-3 animate-pulse">
                    <div className="space-y-2">
                      <div className="h-3 w-24 rounded bg-slate-200" />
                      <div className="h-7 w-16 rounded bg-slate-200" />
                      <div className="h-3 w-28 rounded bg-slate-200" />
                    </div>
                    <div className="h-10 w-10 rounded-lg bg-slate-200" />
                  </div>
                </div>
              ))}
            {!isLoading &&
              topCards.map((card) => {
                const isActive = statusFilter === card.filterValue;
                return (
                  <article
                    key={card.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => handleCardFilter(card.filterValue)}
                    onKeyDown={(event) =>
                      handleCardKeyDown(event, card.filterValue)
                    }
                    className={`cursor-pointer rounded-2xl border bg-white px-5 py-5 shadow-sm transition hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-md ${
                      isActive
                        ? "border-blue-200 ring-1 ring-blue-100"
                        : "border-slate-200"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-xs uppercase tracking-[0.18em] text-slate-500">
                          {card.label}
                        </p>
                        <p className="mt-2 text-2xl font-semibold text-slate-900">
                          {card.value}
                        </p>
                        <p className="mt-1 text-sm text-slate-500">
                          {card.hint}
                        </p>
                      </div>
                      <span
                        className={`grid h-11 w-11 place-items-center rounded-xl ${card.iconClass}`}
                      >
                        {card.icon}
                      </span>
                    </div>
                  </article>
                );
              })}
          </section>
          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">
                  Tools Workspace
                </h2>
                <p className="text-sm text-slate-500">
                  Jump into specialized workflows for tools operations.
                </p>
              </div>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {toolModules.map((module) => {
                const tagClass =
                  module.tag === "New"
                    ? "border-blue-100 bg-blue-50 text-blue-600"
                    : "border-slate-200 bg-slate-100 text-slate-600";
                return (
                  <Link
                    key={module.id}
                    to={module.href}
                    className="group rounded-xl border border-slate-200 bg-slate-50/40 p-4 transition hover:border-blue-200 hover:bg-blue-50/40"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-slate-900">
                          {module.title}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          {module.description}
                        </p>
                      </div>
                      <span
                        className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] ${tagClass}`}
                      >
                        {module.tag}
                      </span>
                    </div>
                  </Link>
                );
              })}
            </div>
          </section>
          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">
                  Smart Features
                </h2>
                <p className="text-sm text-slate-500">
                  Standout ideas to make tool workflows faster and safer.
                </p>
              </div>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {smartFeatures.map((feature) => (
                <div
                  key={feature.id}
                  className="rounded-xl border border-slate-200 bg-slate-50/40 p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">
                        {feature.title}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        {feature.description}
                      </p>
                    </div>
                    <span className="rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-600">
                      {feature.tag}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </section>
          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-[minmax(240px,1fr)_200px_200px_200px]">
              <label className="relative block">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                  <svg
                    viewBox="0 0 24 24"
                    className="h-4 w-4"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                  >
                    <circle cx="11" cy="11" r="7" />
                    <path d="M20 20l-3.5-3.5" />
                  </svg>
                </span>
                <input
                  type="search"
                  value={searchQuery}
                  onChange={(event) => {
                    setSearchQuery(event.target.value);
                    setCurrentPage(1);
                  }}
                  placeholder="Search tool, serial, location..."
                  className="w-full rounded-lg border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm text-slate-700 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                />
              </label>

              <select
                value={typeFilter}
                onChange={(event) => {
                  setTypeFilter(event.target.value);
                  setCurrentPage(1);
                }}
                className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
              >
                <option value="all">All Types</option>
                {toolTypes.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>

              <select
                value={statusFilter}
                onChange={(event) => {
                  setStatusFilter(event.target.value);
                  setCurrentPage(1);
                }}
                className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
              >
                <option value="all">All Status</option>
                <option value="available">Available</option>
                <option value="inUse">In Use</option>
                <option value="maintenance">Maintenance</option>
                <option value="overdue">Overdue</option>
              </select>

              <select
                value={locationFilter}
                onChange={(event) => {
                  setLocationFilter(event.target.value);
                  setCurrentPage(1);
                }}
                className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
              >
                <option value="all">All Locations</option>
                {locations.map((location) => (
                  <option key={location} value={location}>
                    {location}
                  </option>
                ))}
              </select>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                Quick Filters
              </span>
              {statusChips.map((chip) => {
                const isActive = statusFilter === chip.value;
                const activeClass =
                  chip.value === "all"
                    ? "border-blue-600 bg-blue-600 text-white"
                    : STATUS_META[chip.value]?.badgeClass;
                const countClass =
                  isActive && chip.value === "all"
                    ? "text-white/80"
                    : "text-slate-500";
                return (
                  <button
                    key={chip.value}
                    type="button"
                    onClick={() => {
                      setStatusFilter(chip.value);
                      setCurrentPage(1);
                    }}
                    className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                      isActive
                        ? activeClass
                        : "border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50"
                    }`}
                  >
                    {chip.value !== "all" && (
                      <span
                        className={`h-2 w-2 rounded-full ${STATUS_META[chip.value]?.dotClass}`}
                      />
                    )}
                    {chip.label}
                    <span className={`text-[10px] font-semibold ${countClass}`}>
                      {formatNumber(chip.count)}
                    </span>
                  </button>
                );
              })}
              <button
                type="button"
                onClick={resetFilters}
                disabled={!filtersActive}
                className="ml-auto rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:border-slate-300 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Clear filters
              </button>
            </div>
          </section>
          {showEmptyState ? (
            <section className="rounded-2xl border border-dashed border-slate-300 bg-white/80 p-8 text-center shadow-sm">
              <p className="text-sm font-semibold text-slate-800">
                No tools yet
              </p>
              <p className="mt-1 text-sm text-slate-500">
                Add your first tool to start tracking assignments and
                maintenance.
              </p>
              <button
                type="button"
                onClick={handleOpenAdd}
                className="mt-4 rounded-lg bg-blue-500 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-blue-600"
              >
                Add First Tool
              </button>
            </section>
          ) : (
            <>
              <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-4">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">
                  Tool Inventory
                </h2>
                <p className="text-sm text-slate-500">
                  {filteredTools.length === derivedTools.length
                    ? `${formatNumber(derivedTools.length)} total tools`
                    : `${formatNumber(filteredTools.length)} filtered from ${formatNumber(
                        derivedTools.length
                      )} tools`}
                </p>
              </div>
              <button
                type="button"
                onClick={handleOpenAdd}
                className="rounded-lg bg-blue-500 px-3 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-blue-600"
              >
                + Add Tool
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-slate-700">
                  <tr>
                    <th className="px-4 py-3 text-left font-semibold min-w-[100px]">
                      ID
                    </th>
                    <th className="px-4 py-3 text-left font-semibold min-w-[200px]">
                      <span className="inline-flex items-center gap-2">
                        <svg
                          viewBox="0 0 24 24"
                          className="h-4 w-4 text-slate-400"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.6"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="M3 7l9-4 9 4-9 4-9-4z" />
                          <path d="M3 7v10l9 4 9-4V7" />
                          <path d="M12 11v10" />
                        </svg>
                        Tool Name
                      </span>
                    </th>
                    <th className="px-4 py-3 text-left font-semibold min-w-[140px]">
                      Type
                    </th>
                    <th className="px-4 py-3 text-left font-semibold min-w-[170px]">
                      <span className="inline-flex items-center gap-2">
                        <svg
                          viewBox="0 0 24 24"
                          className="h-4 w-4 text-slate-400"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.6"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <circle cx="12" cy="8" r="3" />
                          <path d="M4 20c2.5-4 13.5-4 16 0" />
                        </svg>
                        Assigned To
                      </span>
                    </th>
                    <th className="px-4 py-3 text-left font-semibold min-w-[160px]">
                      <span className="inline-flex items-center gap-2">
                        <svg
                          viewBox="0 0 24 24"
                          className="h-4 w-4 text-slate-400"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.6"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="M12 22s7-5.5 7-12a7 7 0 1 0-14 0c0 6.5 7 12 7 12z" />
                          <circle cx="12" cy="10" r="2.5" />
                        </svg>
                        Location
                      </span>
                    </th>
                    <th className="px-4 py-3 text-left font-semibold min-w-[140px]">
                      Status
                    </th>
                    <th className="px-4 py-3 text-left font-semibold min-w-[160px]">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {isLoading &&
                    Array.from({ length: PAGE_SIZE }).map((_, index) => (
                      <tr key={`row-skeleton-${index}`} className="animate-pulse">
                        <td className="px-4 py-4">
                          <div className="h-3 w-12 rounded bg-slate-200" />
                        </td>
                        <td className="px-4 py-4">
                          <div className="flex items-center gap-3">
                            <div className="h-11 w-11 rounded-xl bg-slate-200" />
                            <div className="space-y-2">
                              <div className="h-3 w-32 rounded bg-slate-200" />
                              <div className="h-3 w-24 rounded bg-slate-200" />
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-4">
                          <div className="h-3 w-20 rounded bg-slate-200" />
                        </td>
                        <td className="px-4 py-4">
                          <div className="h-3 w-24 rounded bg-slate-200" />
                        </td>
                        <td className="px-4 py-4">
                          <div className="h-3 w-24 rounded bg-slate-200" />
                        </td>
                        <td className="px-4 py-4">
                          <div className="h-6 w-20 rounded-full bg-slate-200" />
                        </td>
                        <td className="px-4 py-4">
                          <div className="flex gap-2">
                            <div className="h-9 w-9 rounded-lg bg-slate-200" />
                            <div className="h-9 w-9 rounded-lg bg-slate-200" />
                            <div className="h-9 w-9 rounded-lg bg-slate-200" />
                            <div className="h-9 w-9 rounded-lg bg-slate-200" />
                          </div>
                        </td>
                      </tr>
                    ))}
                  {!isLoading && pagedTools.length === 0 && (
                    <tr>
                      <td colSpan="7" className="px-4 py-12 text-center">
                        <div className="mx-auto max-w-sm space-y-2">
                          <p className="text-sm font-semibold text-slate-700">
                            No tools found
                          </p>
                          <p className="text-xs text-slate-500">
                            Try adjusting filters or add a new tool.
                          </p>
                          {filtersActive && (
                            <button
                              type="button"
                              onClick={resetFilters}
                              className="inline-flex items-center justify-center rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:border-slate-300 hover:text-slate-900"
                            >
                              Clear filters
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}

                  {!isLoading &&
                    pagedTools.map((tool) => {
                      const meta = STATUS_META[tool.statusKey];
                      const isSelected = tool.id === selectedToolId;
                      const assignDisabled = ["inUse", "overdue"].includes(
                        tool.statusKey
                      );
                      const maintenanceDisabled = tool.statusKey === "maintenance";
                      return (
                        <tr
                          key={tool.id}
                          className={`cursor-pointer transition-colors hover:bg-slate-50/80 ${
                            isSelected ? "bg-blue-50/50" : ""
                          }`}
                          onClick={() => setSelectedToolId(tool.id)}
                        >
                          <td
                            className="px-4 py-4 text-xs font-medium text-slate-500"
                            title={tool.id}
                          >
                            {tool.id}
                          </td>
                          <td className="px-4 py-4">
                            <div className="flex items-center gap-3">
                              <div className="h-11 w-11 rounded-xl border border-slate-200 bg-white p-1">
                                <img
                                  src={getToolImage(tool.imageUrl)}
                                  alt={tool.name ? `${tool.name} tool` : "Tool"}
                                  className="h-full w-full object-contain"
                                />
                              </div>
                              <div>
                                <p className="text-[15px] font-semibold text-slate-900">
                                  {tool.name || "-"}
                                </p>
                                <p className="mt-0.5 text-xs text-slate-500">
                                  {tool.serialNumber || "No serial"}
                                </p>
                              </div>
                            </div>
                          </td>
                          <td
                            className="px-4 py-4 text-xs text-slate-500"
                            title={tool.type || "-"}
                          >
                            {clampText(tool.type, 16)}
                          </td>
                          <td
                            className="px-4 py-4 text-sm text-slate-700"
                            title={tool.assignedTo}
                          >
                            {clampText(tool.assignedTo, 20)}
                          </td>
                          <td
                            className="px-4 py-4 text-sm text-slate-700"
                            title={tool.baseLocation || "-"}
                          >
                            {clampText(tool.baseLocation, 18)}
                          </td>
                          <td className="px-4 py-4">
                            <span
                              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${meta.badgeClass}`}
                            >
                              <span
                                className={`h-2 w-2 rounded-full ${meta.dotClass}`}
                              />
                              {meta.label}
                            </span>
                          </td>
                          <td className="px-4 py-4">
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  setSelectedToolId(tool.id);
                                }}
                                className={ACTION_BUTTONS.neutral}
                                title="View details"
                                aria-label="View tool"
                              >
                                <svg
                                  viewBox="0 0 24 24"
                                  className="h-4 w-4"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="1.6"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                >
                                  <path d="M2 12s4-6 10-6 10 6 10 6-4 6-10 6-10-6-10-6z" />
                                  <circle cx="12" cy="12" r="2.5" />
                                </svg>
                              </button>
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  setSelectedToolId(tool.id);
                                }}
                                className={ACTION_BUTTONS.neutral}
                                title="Edit details"
                                aria-label="Edit tool"
                              >
                                <svg
                                  viewBox="0 0 24 24"
                                  className="h-4 w-4"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="1.6"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                >
                                  <path d="M4 20l4.5-1 10-10-3.5-3.5-10 10L4 20z" />
                                  <path d="M14.5 5.5l3.5 3.5" />
                                </svg>
                              </button>
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  handleOpenAssign(tool);
                                }}
                                disabled={assignDisabled}
                                className={`${ACTION_BUTTONS.primary} disabled:cursor-not-allowed disabled:opacity-40`}
                                title={
                                  assignDisabled
                                    ? "Tool already checked out"
                                    : "Assign / Checkout"
                                }
                                aria-label="Assign tool"
                              >
                                <svg
                                  viewBox="0 0 24 24"
                                  className="h-4 w-4"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="1.6"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                >
                                  <path d="M5 12h9" />
                                  <path d="M12 7l5 5-5 5" />
                                </svg>
                              </button>
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  handleOpenMaintenance(tool);
                                }}
                                disabled={maintenanceDisabled}
                                className={`${ACTION_BUTTONS.warning} disabled:cursor-not-allowed disabled:opacity-40`}
                                title={
                                  maintenanceDisabled
                                    ? "Already in maintenance"
                                    : "Send to maintenance"
                                }
                                aria-label="Send to maintenance"
                                >
                                  <svg
                                    viewBox="0 0 24 24"
                                    className="h-4 w-4"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="1.6"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                >
                                  <path d="M14.7 6.3a1 1 0 010 1.4l-1.1 1.1a4 4 0 01-5.7 5.7l-3.3 3.3a1 1 0 01-1.4-1.4l3.3-3.3a4 4 0 015.7-5.7l1.1-1.1a1 1 0 011.4 0z" />
                                  </svg>
                                </button>
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  handleDeleteTool(tool);
                                }}
                                className={ACTION_BUTTONS.danger}
                                title="Delete tool"
                                aria-label="Delete tool"
                              >
                                <svg
                                  viewBox="0 0 24 24"
                                  className="h-4 w-4"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="1.6"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                >
                                  <path d="M4 7h16" />
                                  <path d="M9 7V4h6v3" />
                                  <path d="M7 7l1 13h8l1-13" />
                                  <path d="M10 11v5M14 11v5" />
                                </svg>
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-4 py-3 text-sm">
              <p className="text-slate-500">
                Showing {startCount} to {endCount} of{" "}
                {formatNumber(filteredTools.length)} entries
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() =>
                    setCurrentPage((page) => Math.max(1, page - 1))
                  }
                  disabled={currentPage === 1}
                  className="rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-slate-700 hover:border-slate-300 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Prev
                </button>
                <span className="text-slate-600">
                  Page {currentPage} of {totalPages}
                </span>
                <button
                  type="button"
                  onClick={() =>
                    setCurrentPage((page) => Math.min(totalPages, page + 1))
                  }
                  disabled={currentPage >= totalPages}
                  className="rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-slate-700 hover:border-slate-300 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            </div>
          </section>
          {selectedTool && (
            <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                <div className="grid h-24 w-24 shrink-0 place-items-center rounded-2xl border border-slate-200 bg-gradient-to-br from-blue-50 via-white to-emerald-50">
                  <img
                    src={getToolImage(selectedTool?.imageUrl)}
                    alt={selectedTool?.name ? `${selectedTool.name} tool` : "Tool"}
                    className="h-20 w-20 object-contain"
                  />
                </div>
                <div className="flex-1">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-lg font-semibold text-slate-900">
                        {selectedTool.name}
                      </p>
                      <p className="text-sm text-slate-500">
                        {selectedTool.serialNumber}
                      </p>
                    </div>
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${STATUS_META[selectedTool.statusKey].badgeClass}`}
                    >
                      <span
                        className={`h-2 w-2 rounded-full ${STATUS_META[selectedTool.statusKey].dotClass}`}
                      />
                      {STATUS_META[selectedTool.statusKey].label}
                    </span>
                  </div>
                  <div className="mt-3 grid gap-2 text-sm text-slate-600 sm:grid-cols-2">
                    <p>
                      <span className="text-slate-400">Type:</span>{" "}
                      {selectedTool.type || "-"}
                    </p>
                    <p>
                      <span className="text-slate-400">Location:</span>{" "}
                      {selectedTool.baseLocation || "-"}
                    </p>
                    <p>
                      <span className="text-slate-400">Purchase:</span>{" "}
                      {formatDate(selectedTool.purchaseDate)}
                    </p>
                    <p>
                      <span className="text-slate-400">Condition:</span>{" "}
                      {selectedTool.condition || "-"}
                    </p>
                  </div>
                </div>
              </div>
            </section>
          )}
            </>
          )}
        </div>

        <aside className="space-y-5">
          {showEmptyState ? (
            <section className="rounded-2xl border border-dashed border-slate-300 bg-white/80 p-6 text-center shadow-sm">
              <p className="text-sm font-semibold text-slate-800">
                Add your first tool
              </p>
              <p className="mt-1 text-sm text-slate-500">
                Details, assignments, and maintenance history will show here.
              </p>
              <button
                type="button"
                onClick={handleOpenAdd}
                className="mt-4 rounded-lg bg-blue-500 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-blue-600"
              >
                Add Tool
              </button>
            </section>
          ) : (
            <>
          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">
                  Tool Details
                </h2>
                <p className="text-xs text-slate-500">
                  Update metadata, location, and condition for the selected
                  tool.
                </p>
              </div>
              <button
                type="button"
                onClick={handleOpenAdd}
                className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:border-slate-300 hover:text-slate-900"
              >
                + Add Tool
              </button>
            </div>

            <div className="mt-4 space-y-5">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                  Basic Info
                </p>
                <div className="mt-3 grid grid-cols-1 gap-4">
                  <div>
                    <label className="text-sm font-medium text-slate-700">
                      Tool Name
                    </label>
                    <input
                      value={form.name}
                      onChange={(event) =>
                        setForm((prev) => ({
                          ...prev,
                          name: event.target.value,
                        }))
                      }
                      className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                    />
                  </div>

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                      <label className="text-sm font-medium text-slate-700">
                        Type
                      </label>
                      <input
                        value={form.type}
                        onChange={(event) =>
                          setForm((prev) => ({
                            ...prev,
                            type: event.target.value,
                          }))
                        }
                        className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium text-slate-700">
                        Serial No
                      </label>
                      <input
                        value={form.serialNumber}
                        onChange={(event) =>
                          setForm((prev) => ({
                            ...prev,
                            serialNumber: event.target.value,
                          }))
                        }
                        className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="border-t border-slate-200 pt-4">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                  Location & Status
                </p>
                <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className="text-sm font-medium text-slate-700">
                      Base Location
                    </label>
                    <input
                      value={form.baseLocation}
                      onChange={(event) =>
                        setForm((prev) => ({
                          ...prev,
                          baseLocation: event.target.value,
                        }))
                      }
                      className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-slate-700">
                      Purchase Date
                    </label>
                    <DateInput
                      value={form.purchaseDate}
                      onChange={(value) =>
                        setForm((prev) => ({
                          ...prev,
                          purchaseDate: value || "",
                        }))
                      }
                      className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-slate-700">
                      Status
                    </label>
                    <input
                      value={
                        selectedTool
                          ? STATUS_META[selectedTool.statusKey].label
                          : "-"
                      }
                      readOnly
                      className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-slate-700">
                      Condition
                    </label>
                    <select
                      value={form.condition}
                      onChange={(event) =>
                        setForm((prev) => ({
                          ...prev,
                          condition: event.target.value,
                        }))
                      }
                      className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                    >
                      <option value="Good">Good</option>
                      <option value="Damaged">Damaged</option>
                      <option value="Repair Needed">Repair Needed</option>
                    </select>
                  </div>
                </div>
              </div>

              <div className="border-t border-slate-200 pt-4">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                  Additional
                </p>
                <div className="mt-3 grid grid-cols-1 gap-4">
                  <div>
                    <label className="text-sm font-medium text-slate-700">
                      Image Path or URL
                    </label>
                    <input
                      value={form.imageUrl}
                      onChange={(event) =>
                        setForm((prev) => ({
                          ...prev,
                          imageUrl: event.target.value,
                        }))
                      }
                      placeholder="drilling_mechine.png or /tool-images/drill.png"
                      className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-slate-700">
                      Notes
                    </label>
                    <textarea
                      value={form.notes}
                      onChange={(event) =>
                        setForm((prev) => ({
                          ...prev,
                          notes: event.target.value,
                        }))
                      }
                      className="mt-1 min-h-[90px] w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                    />
                  </div>
                </div>
              </div>

              <div className="border-t border-slate-200 pt-4">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                  Actions
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {selectedTool &&
                    ["inUse", "overdue"].includes(selectedTool.statusKey) && (
                      <button
                        type="button"
                        onClick={handleCheckin}
                        className="rounded-lg bg-blue-500 px-3 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-blue-600"
                      >
                        Checkin Tool
                      </button>
                    )}

                  {selectedTool &&
                    !["inUse", "overdue"].includes(selectedTool.statusKey) && (
                      <button
                        type="button"
                        onClick={handleOpenAssign}
                        className="rounded-lg bg-blue-500 px-3 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-blue-600"
                      >
                        Assign / Checkout
                      </button>
                    )}

                  <button
                    type="button"
                    onClick={handleSaveTool}
                    disabled={!selectedTool || !isDirty}
                    className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Save Changes
                  </button>

                  {selectedTool && selectedTool.statusKey !== "maintenance" && (
                    <button
                      type="button"
                      onClick={handleOpenMaintenance}
                      className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-700 transition hover:bg-amber-100"
                    >
                      Send to Maintenance
                    </button>
                  )}

                  {selectedTool && selectedTool.statusKey === "maintenance" && (
                    <button
                      type="button"
                      onClick={handleResolveMaintenance}
                      className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700 transition hover:bg-emerald-100"
                    >
                      Resolve Maintenance
                    </button>
                  )}

                  {selectedTool && (
                    <button
                      type="button"
                      onClick={() => handleDeleteTool(selectedTool)}
                      className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700 transition hover:bg-red-100"
                    >
                      Delete Tool
                    </button>
                  )}
                </div>
              </div>
            </div>
          </section>
          <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 px-4 py-3">
              <h3 className="text-base font-semibold text-slate-900">
                Tool Checkout History
              </h3>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-slate-600">
                  <tr>
                    <th className="px-4 py-3 text-left font-semibold">
                      Borrower
                    </th>
                    <th className="px-4 py-3 text-left font-semibold">
                      Checkout Date
                    </th>
                    <th className="px-4 py-3 text-left font-semibold">
                      Expected Return
                    </th>
                    <th className="px-4 py-3 text-left font-semibold">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {checkoutHistory.length === 0 && (
                    <tr>
                      <td
                        colSpan="4"
                        className="px-4 py-6 text-center text-slate-500"
                      >
                        No checkout history yet.
                      </td>
                    </tr>
                  )}
                  {checkoutHistory.map((record) => {
                    const expected = record.expectedReturnDate
                      ? new Date(record.expectedReturnDate)
                      : null;
                    const isOverdue =
                      expected &&
                      !Number.isNaN(expected.getTime()) &&
                      !record.actualReturnDate &&
                      expected < new Date();
                    const statusKey = record.actualReturnDate
                      ? "available"
                      : isOverdue
                        ? "overdue"
                        : "inUse";
                    return (
                      <tr key={record.id}>
                        <td className="px-4 py-3 text-slate-700">
                          {record.assignedTo}
                        </td>
                        <td className="px-4 py-3 text-slate-600">
                          {formatDate(record.checkoutDate)}
                        </td>
                        <td className="px-4 py-3 text-slate-600">
                          {formatDate(record.expectedReturnDate)}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${
                              STATUS_META[statusKey].badgeClass
                            }`}
                          >
                            <span
                              className={`h-2 w-2 rounded-full ${STATUS_META[statusKey].dotClass}`}
                            />
                            {record.actualReturnDate
                              ? "Returned"
                              : STATUS_META[statusKey].label}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
          <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 px-4 py-3">
              <h3 className="text-base font-semibold text-slate-900">
                Maintenance History
              </h3>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-slate-600">
                  <tr>
                    <th className="px-4 py-3 text-left font-semibold">Issue</th>
                    <th className="px-4 py-3 text-left font-semibold">
                      Reported
                    </th>
                    <th className="px-4 py-3 text-left font-semibold">
                      Resolved
                    </th>
                    <th className="px-4 py-3 text-left font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {maintenanceHistory.length === 0 && (
                    <tr>
                      <td
                        colSpan="4"
                        className="px-4 py-6 text-center text-slate-500"
                      >
                        No maintenance records yet.
                      </td>
                    </tr>
                  )}
                  {maintenanceHistory.map((record) => (
                    <tr key={record.id}>
                      <td className="px-4 py-3 text-slate-700">
                        {record.issue}
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {formatDate(record.reportedDate)}
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {record.resolvedDate
                          ? formatDate(record.resolvedDate)
                          : "-"}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${
                            String(record.status || "").toLowerCase() ===
                            "completed"
                              ? STATUS_META.available.badgeClass
                              : STATUS_META.maintenance.badgeClass
                          }`}
                        >
                          <span
                            className={`h-2 w-2 rounded-full ${
                              String(record.status || "").toLowerCase() ===
                              "completed"
                                ? STATUS_META.available.dotClass
                                : STATUS_META.maintenance.dotClass
                            }`}
                          />
                          {record.status || "Open"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
            </>
          )}
        </aside>
      </div>
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-[1px]">
          <div className="w-[520px] max-w-[94vw] rounded-2xl border border-slate-200 bg-white shadow-2xl">
            <form onSubmit={handleCreateTool} className="flex flex-col">
              <div className="border-b border-slate-200 bg-slate-50 px-6 py-4">
                <h3 className="text-lg font-semibold text-slate-900">
                  Add Tool
                </h3>
                <p className="text-sm text-slate-500">
                  Capture tool metadata before assigning it.
                </p>
              </div>
              <div className="space-y-4 px-6 py-5">
                <div>
                  <label className="text-sm font-medium text-slate-700">
                    Tool Name *
                  </label>
                  <input
                    value={newTool.name}
                    onChange={(event) =>
                      setNewTool((prev) => ({
                        ...prev,
                        name: event.target.value,
                      }))
                    }
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                  />
                  {newToolErrors.name && (
                    <p className="mt-1 text-xs text-red-600">
                      {newToolErrors.name}
                    </p>
                  )}
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className="text-sm font-medium text-slate-700">
                      Type *
                    </label>
                    <input
                      value={newTool.type}
                      onChange={(event) =>
                        setNewTool((prev) => ({
                          ...prev,
                          type: event.target.value,
                        }))
                      }
                      className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                    />
                    {newToolErrors.type && (
                      <p className="mt-1 text-xs text-red-600">
                        {newToolErrors.type}
                      </p>
                    )}
                  </div>
                  <div>
                    <label className="text-sm font-medium text-slate-700">
                      Serial No *
                    </label>
                    <input
                      value={newTool.serialNumber}
                      onChange={(event) =>
                        setNewTool((prev) => ({
                          ...prev,
                          serialNumber: event.target.value,
                        }))
                      }
                      className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                    />
                    {newToolErrors.serialNumber && (
                      <p className="mt-1 text-xs text-red-600">
                        {newToolErrors.serialNumber}
                      </p>
                    )}
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className="text-sm font-medium text-slate-700">
                      Purchase Date
                    </label>
                    <DateInput
                      value={newTool.purchaseDate}
                      onChange={(value) =>
                        setNewTool((prev) => ({
                          ...prev,
                          purchaseDate: value || "",
                        }))
                      }
                      className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-slate-700">
                      Base Location
                    </label>
                    <input
                      value={newTool.baseLocation}
                      onChange={(event) =>
                        setNewTool((prev) => ({
                          ...prev,
                          baseLocation: event.target.value,
                        }))
                      }
                      className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium text-slate-700">
                    Image Path or URL
                  </label>
                  <input
                    value={newTool.imageUrl}
                    onChange={(event) =>
                      setNewTool((prev) => ({
                        ...prev,
                        imageUrl: event.target.value,
                      }))
                    }
                    placeholder="drilling_mechine.png or /tool-images/drill.png"
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-slate-700">
                    Notes
                  </label>
                  <textarea
                    value={newTool.notes}
                    onChange={(event) =>
                      setNewTool((prev) => ({
                        ...prev,
                        notes: event.target.value,
                      }))
                    }
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100 min-h-[90px]"
                  />
                </div>
              </div>
              <div className="flex items-center justify-end gap-2 border-t border-slate-200 bg-slate-50 px-6 py-4">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:border-slate-300 hover:text-slate-900"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-lg bg-blue-500 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-blue-600"
                >
                  Add Tool
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {showAssignModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-[1px]">
          <div className="w-[460px] max-w-[92vw] rounded-2xl border border-slate-200 bg-white shadow-2xl">
            <form onSubmit={handleAssignTool} className="flex flex-col">
              <div className="border-b border-slate-200 bg-slate-50 px-6 py-4">
                <h3 className="text-lg font-semibold text-slate-900">
                  Assign Tool
                </h3>
                <p className="text-sm text-slate-500">
                  Checkout {selectedTool?.name || "tool"} to a user.
                </p>
              </div>
              <div className="space-y-4 px-6 py-5">
                <div>
                  <label className="text-sm font-medium text-slate-700">
                    Assigned To
                  </label>
                  <input
                    value={assignForm.assignedTo}
                    onChange={(event) =>
                      setAssignForm((prev) => ({
                        ...prev,
                        assignedTo: event.target.value,
                      }))
                    }
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                    placeholder="Select user or team"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-slate-700">
                    Serial Number
                  </label>
                  <input
                    value={selectedTool?.serialNumber || ""}
                    readOnly
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-slate-700">
                    Expected Return Date
                  </label>
                  <DateInput
                    value={assignForm.expectedReturnDate}
                    onChange={(value) =>
                      setAssignForm((prev) => ({
                        ...prev,
                        expectedReturnDate: value || "",
                      }))
                    }
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                  />
                  <p className="mt-1 text-xs text-slate-500">
                    Optional for open-ended laptop or tool issue records.
                  </p>
                </div>
                {assignError && (
                  <p className="text-sm text-red-600">{assignError}</p>
                )}
              </div>
              <div className="flex items-center justify-end gap-2 border-t border-slate-200 bg-slate-50 px-6 py-4">
                <button
                  type="button"
                  onClick={() => setShowAssignModal(false)}
                  className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:border-slate-300 hover:text-slate-900"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-lg bg-blue-500 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-blue-600"
                >
                  Assign Tool
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {showMaintenanceModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-[1px]">
          <div className="w-[460px] max-w-[92vw] rounded-2xl border border-slate-200 bg-white shadow-2xl">
            <form onSubmit={handleStartMaintenance} className="flex flex-col">
              <div className="border-b border-slate-200 bg-slate-50 px-6 py-4">
                <h3 className="text-lg font-semibold text-slate-900">
                  Log Maintenance
                </h3>
                <p className="text-sm text-slate-500">
                  Record an issue for {selectedTool?.name || "tool"}.
                </p>
              </div>
              <div className="space-y-4 px-6 py-5">
                <div>
                  <label className="text-sm font-medium text-slate-700">
                    Issue
                  </label>
                  <input
                    value={maintenanceForm.issue}
                    onChange={(event) =>
                      setMaintenanceForm((prev) => ({
                        ...prev,
                        issue: event.target.value,
                      }))
                    }
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-slate-700">
                    Estimated Cost
                  </label>
                  <input
                    value={maintenanceForm.cost}
                    onChange={(event) =>
                      setMaintenanceForm((prev) => ({
                        ...prev,
                        cost: event.target.value,
                      }))
                    }
                    type="number"
                    min="0"
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                  />
                </div>
                {maintenanceError && (
                  <p className="text-sm text-red-600">{maintenanceError}</p>
                )}
              </div>
              <div className="flex items-center justify-end gap-2 border-t border-slate-200 bg-slate-50 px-6 py-4">
                <button
                  type="button"
                  onClick={() => setShowMaintenanceModal(false)}
                  className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:border-slate-300 hover:text-slate-900"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-amber-600"
                >
                  Log Maintenance
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default ToolsHome;
