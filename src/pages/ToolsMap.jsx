import { useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  BriefcaseBusiness,
  CheckCircle2,
  ChevronDown,
  Clock3,
  Drill,
  FileDown,
  Fullscreen,
  Hammer,
  History,
  Layers,
  List,
  LocateFixed,
  MapPin,
  Minus,
  Plus,
  QrCode,
  Radio,
  Route,
  Search,
  Target,
  Users,
  Wifi,
  Wrench,
  X,
  Zap,
} from "lucide-react";
import { getToolEmployees } from "../services/toolEmployeesStore";
import {
  getToolAssignments,
  getToolMaintenance,
  getTools,
} from "../services/toolsStore";

const STATUS_META = {
  available: {
    label: "Available",
    marker: "bg-emerald-500",
    badge: "border-emerald-200 bg-emerald-50 text-emerald-700",
    icon: CheckCircle2,
  },
  inUse: {
    label: "In Use",
    marker: "bg-blue-500",
    badge: "border-blue-200 bg-blue-50 text-blue-700",
    icon: Users,
  },
  overdue: {
    label: "Overdue",
    marker: "bg-amber-500",
    badge: "border-amber-200 bg-amber-50 text-amber-700",
    icon: Clock3,
  },
  maintenance: {
    label: "Maintenance",
    marker: "bg-orange-500",
    badge: "border-orange-200 bg-orange-50 text-orange-700",
    icon: Wrench,
  },
  missing: {
    label: "Missing",
    marker: "bg-red-500",
    badge: "border-red-200 bg-red-50 text-red-700",
    icon: AlertTriangle,
  },
};

const FLOOR_PLANS = {
  "Ground Floor": [
    {
      name: "Storage Bay A",
      site: "ISRO TVM/DRLM",
      capacity: 12,
      style:
        "left-[6%] top-[7%] h-[38%] w-[31%] border-emerald-400 bg-emerald-50/70",
      label: "left-[12%] top-[14%] border-emerald-300 bg-white/95",
    },
    {
      name: "Storage Bay B",
      site: "Site A",
      capacity: 10,
      style:
        "left-[48%] top-[8%] h-[35%] w-[19%] border-amber-400 bg-amber-50/70",
      label: "left-[50%] top-[17%] border-amber-300 bg-white/95",
    },
    {
      name: "Repair Area",
      site: "Site B",
      capacity: 8,
      style:
        "left-[71%] top-[9%] h-[31%] w-[17%] border-sky-400 bg-sky-50/70",
      label: "left-[73%] top-[17%] border-sky-300 bg-white/95",
    },
    {
      name: "Dispatch Zone",
      site: "Site B",
      capacity: 8,
      style:
        "left-[7%] top-[52%] h-[35%] w-[25%] border-blue-400 bg-blue-50/70",
      label: "left-[12%] top-[62%] border-blue-300 bg-white/95",
    },
    {
      name: "Maintenance Bay",
      site: "Warehouse 1",
      capacity: 8,
      style:
        "left-[48%] top-[48%] h-[27%] w-[22%] border-orange-400 bg-orange-50/75",
      label: "left-[51%] top-[55%] border-orange-300 bg-white/95",
    },
    {
      name: "Restricted Cage",
      site: "Warehouse 1",
      capacity: 4,
      style:
        "left-[76%] top-[48%] h-[31%] w-[17%] border-red-400 bg-[repeating-linear-gradient(135deg,rgba(248,113,113,0.16)_0,rgba(248,113,113,0.16)_7px,rgba(255,255,255,0.7)_7px,rgba(255,255,255,0.7)_14px)]",
      label: "left-[78%] top-[61%] border-red-300 bg-white/95",
    },
  ],
  "First Floor": [
    {
      name: "Calibration Desk",
      site: "Head Office",
      capacity: 7,
      style:
        "left-[8%] top-[9%] h-[31%] w-[26%] border-cyan-400 bg-cyan-50/70",
      label: "left-[13%] top-[18%] border-cyan-300 bg-white/95",
    },
    {
      name: "Electrical Lab",
      site: "Head Office",
      capacity: 9,
      style:
        "left-[42%] top-[10%] h-[38%] w-[29%] border-blue-400 bg-blue-50/70",
      label: "left-[49%] top-[20%] border-blue-300 bg-white/95",
    },
    {
      name: "Admin Cage",
      site: "Head Office",
      capacity: 5,
      style:
        "left-[14%] top-[58%] h-[25%] w-[23%] border-slate-400 bg-slate-50/80",
      label: "left-[18%] top-[65%] border-slate-300 bg-white/95",
    },
    {
      name: "Returns Desk",
      site: "Head Office",
      capacity: 6,
      style:
        "left-[60%] top-[58%] h-[27%] w-[27%] border-amber-400 bg-amber-50/70",
      label: "left-[65%] top-[66%] border-amber-300 bg-white/95",
    },
  ],
  Warehouse: [
    {
      name: "Warehouse 1",
      site: "Warehouse 1",
      capacity: 14,
      style:
        "left-[8%] top-[10%] h-[34%] w-[34%] border-emerald-400 bg-emerald-50/70",
      label: "left-[17%] top-[19%] border-emerald-300 bg-white/95",
    },
    {
      name: "Receiving Area",
      site: "Warehouse 1",
      capacity: 9,
      style:
        "left-[55%] top-[9%] h-[34%] w-[28%] border-cyan-400 bg-cyan-50/70",
      label: "left-[61%] top-[18%] border-cyan-300 bg-white/95",
    },
    {
      name: "Dispatch Zone",
      site: "Warehouse 1",
      capacity: 11,
      style:
        "left-[12%] top-[58%] h-[27%] w-[30%] border-blue-400 bg-blue-50/70",
      label: "left-[18%] top-[65%] border-blue-300 bg-white/95",
    },
    {
      name: "Quarantine Rack",
      site: "Warehouse 1",
      capacity: 6,
      style:
        "left-[58%] top-[56%] h-[28%] w-[24%] border-red-400 bg-red-50/70",
      label: "left-[61%] top-[64%] border-red-300 bg-white/95",
    },
  ],
  "Site Yard": [
    {
      name: "Site A",
      site: "Site A",
      capacity: 10,
      style:
        "left-[7%] top-[12%] h-[34%] w-[29%] border-emerald-400 bg-emerald-50/70",
      label: "left-[14%] top-[21%] border-emerald-300 bg-white/95",
    },
    {
      name: "Site B",
      site: "Site B",
      capacity: 10,
      style:
        "left-[42%] top-[12%] h-[34%] w-[25%] border-blue-400 bg-blue-50/70",
      label: "left-[48%] top-[21%] border-blue-300 bg-white/95",
    },
    {
      name: "Site C",
      site: "Site C",
      capacity: 8,
      style:
        "left-[72%] top-[13%] h-[31%] w-[19%] border-cyan-400 bg-cyan-50/70",
      label: "left-[75%] top-[21%] border-cyan-300 bg-white/95",
    },
    {
      name: "Yard Return",
      site: "Site A",
      capacity: 8,
      style:
        "left-[23%] top-[61%] h-[26%] w-[26%] border-amber-400 bg-amber-50/70",
      label: "left-[28%] top-[68%] border-amber-300 bg-white/95",
    },
    {
      name: "Field Repair",
      site: "Site B",
      capacity: 6,
      style:
        "left-[60%] top-[60%] h-[26%] w-[24%] border-orange-400 bg-orange-50/70",
      label: "left-[64%] top-[67%] border-orange-300 bg-white/95",
    },
  ],
};

const ZONE_POSITIONS = {
  "Storage Bay A": [
    ["15%", "19%"],
    ["24%", "28%"],
    ["31%", "36%"],
    ["14%", "37%"],
  ],
  "Storage Bay B": [
    ["53%", "20%"],
    ["59%", "35%"],
    ["63%", "24%"],
  ],
  "Repair Area": [
    ["76%", "24%"],
    ["84%", "34%"],
    ["79%", "33%"],
  ],
  "Dispatch Zone": [
    ["18%", "64%"],
    ["26%", "56%"],
    ["24%", "79%"],
  ],
  "Maintenance Bay": [
    ["53%", "56%"],
    ["63%", "65%"],
    ["58%", "70%"],
  ],
  "Restricted Cage": [
    ["82%", "63%"],
    ["88%", "73%"],
  ],
  "Calibration Desk": [
    ["17%", "22%"],
    ["28%", "31%"],
  ],
  "Electrical Lab": [
    ["52%", "25%"],
    ["62%", "36%"],
  ],
  "Admin Cage": [
    ["24%", "68%"],
    ["32%", "75%"],
  ],
  "Returns Desk": [
    ["68%", "67%"],
    ["78%", "76%"],
  ],
  "Warehouse 1": [
    ["18%", "22%"],
    ["31%", "34%"],
    ["25%", "68%"],
  ],
  "Receiving Area": [
    ["66%", "25%"],
    ["74%", "34%"],
  ],
  "Quarantine Rack": [
    ["66%", "64%"],
    ["75%", "72%"],
  ],
  "Site A": [
    ["18%", "25%"],
    ["34%", "72%"],
  ],
  "Site B": [
    ["52%", "25%"],
    ["70%", "70%"],
  ],
  "Site C": [["82%", "28%"]],
  "Yard Return": [["36%", "72%"]],
  "Field Repair": [["71%", "72%"]],
};

const DEFAULT_FILTERS = {
  search: "",
  site: "all",
  zone: "all",
  category: "all",
  employee: "all",
  statuses: [],
  dateFrom: "",
  dateTo: "",
};

const DEFAULT_LAYERS = {
  zones: true,
  markers: true,
  heatmap: false,
  maintenance: true,
  employees: false,
  cctv: false,
};

const VIEW_OPTIONS = [
  { id: "map", label: "Map View", icon: MapPin },
  { id: "list", label: "List View", icon: List },
  { id: "heatmap", label: "Heatmap", icon: Activity },
  { id: "layers", label: "Layers", icon: Layers },
];

const FEATURE_CARDS = [
  [MapPin, "Zone Management", "Interactive zones and capacity tracking"],
  [QrCode, "QR / RFID Scan", "Find tools by ID or serial number"],
  [Radio, "Real-time Ready", "Client refresh pattern prepared for live feeds"],
  [Route, "Route Replay", "Assignment and movement history drawers"],
  [FileDown, "Reports & Export", "CSV export for filtered map results"],
  [Wifi, "Layer Controls", "Toggle overlays without leaving the map"],
];

const formatNumber = (value) =>
  new Intl.NumberFormat("en-IN").format(Number(value || 0));

const normalizeText = (value) => String(value ?? "").trim().toLowerCase();

const getInitials = (value = "") =>
  String(value)
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "TL";

const getDateValue = (value) => {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const formatDate = (value) => {
  const parsed = getDateValue(value);
  if (!parsed) return "-";
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(parsed);
};

const formatShortDateTime = (value) => {
  const parsed = getDateValue(value);
  if (!parsed) return "-";
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  }).format(parsed);
};

const formatLastSeen = (hours) => {
  if (hours < 1) return "Just now";
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
};

const getFloorZones = (floor) => FLOOR_PLANS[floor] || FLOOR_PLANS["Ground Floor"];

const getAllZones = () =>
  Object.values(FLOOR_PLANS)
    .flat()
    .map((zone) => zone.name);

const getZoneByName = (zoneName) =>
  Object.values(FLOOR_PLANS)
    .flat()
    .find((zone) => zone.name === zoneName) || FLOOR_PLANS["Ground Floor"][0];

const getPlacementForTool = (tool, index, hasOpenMaintenance) => {
  const location = normalizeText(tool.baseLocation);
  const condition = normalizeText(tool.condition);
  if (hasOpenMaintenance || condition.includes("repair") || condition.includes("damaged")) {
    return { floor: "Ground Floor", zone: "Maintenance Bay" };
  }
  if (location.includes("warehouse")) return { floor: "Warehouse", zone: "Warehouse 1" };
  if (location.includes("site a")) return { floor: "Site Yard", zone: "Site A" };
  if (location.includes("site b")) return { floor: "Site Yard", zone: "Site B" };
  if (location.includes("site c")) return { floor: "Site Yard", zone: "Site C" };
  if (location.includes("head office")) return { floor: "First Floor", zone: "Electrical Lab" };
  if (index % 5 === 1) return { floor: "Ground Floor", zone: "Dispatch Zone" };
  if (index % 5 === 2) return { floor: "Ground Floor", zone: "Storage Bay B" };
  if (index % 5 === 3) return { floor: "Warehouse", zone: "Receiving Area" };
  return { floor: "Ground Floor", zone: "Storage Bay A" };
};

const getPositionForTool = (zoneName, index) => {
  const positions = ZONE_POSITIONS[zoneName] || [["50%", "50%"]];
  const [left, top] = positions[index % positions.length];
  return { left, top };
};

const csvEscape = (value) => {
  const text = String(value ?? "");
  if (/[",\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
};

const createToolActivity = (tools, assignments, maintenance) => {
  const toolMap = new Map(tools.map((tool) => [tool.id, tool]));
  const assignmentRows = assignments.map((assignment, index) => {
    const tool = toolMap.get(assignment.toolId);
    return {
      id: assignment.id || `assignment-${index}`,
      time: assignment.actualReturnDate || assignment.checkoutDate,
      title: assignment.actualReturnDate ? "Tool returned" : "Tool checked out",
      toolName: tool?.name || assignment.toolId,
      from: tool?.baseLocation || "Store",
      to: assignment.actualReturnDate ? tool?.baseLocation || "Store" : assignment.assignedTo || "Assigned user",
      by: assignment.assignedTo || "-",
      icon: assignment.actualReturnDate ? CheckCircle2 : Hammer,
      type: "assignment",
    };
  });

  const maintenanceRows = maintenance.map((record, index) => {
    const tool = toolMap.get(record.toolId);
    return {
      id: record.id || `maintenance-${index}`,
      time: record.reportedDate,
      title: record.resolvedDate ? "Maintenance completed" : "Maintenance opened",
      toolName: tool?.name || record.toolId,
      from: tool?.baseLocation || "Store",
      to: "Maintenance Bay",
      by: record.status || "Open",
      icon: Wrench,
      type: "maintenance",
    };
  });

  return [...assignmentRows, ...maintenanceRows]
    .filter((row) => row.time)
    .sort((left, right) => new Date(right.time) - new Date(left.time));
};

const ButtonIcon = ({ icon: Icon, className = "h-4 w-4" }) => (
  <Icon className={className} aria-hidden="true" />
);

const StatusBadge = ({ statusKey }) => {
  const meta = STATUS_META[statusKey] || STATUS_META.available;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${meta.badge}`}
    >
      <span className={`h-2 w-2 rounded-full ${meta.marker}`} />
      {meta.label}
    </span>
  );
};

const Modal = ({ children, title, onClose }) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-4 py-6 backdrop-blur-sm">
    <section className="max-h-[92vh] w-full max-w-2xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
      <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
        <h2 className="text-lg font-semibold text-slate-950">{title}</h2>
        <button
          type="button"
          onClick={onClose}
          className="grid h-9 w-9 place-items-center rounded-full border border-slate-200 text-slate-500 transition hover:bg-slate-50 hover:text-slate-900"
          aria-label="Close modal"
        >
          <X size={16} />
        </button>
      </div>
      <div className="max-h-[calc(92vh-72px)] overflow-y-auto p-5">{children}</div>
    </section>
  </div>
);

const Drawer = ({ children, title, onClose }) => (
  <div className="fixed inset-0 z-50 bg-slate-950/30 backdrop-blur-sm">
    <button
      type="button"
      onClick={onClose}
      className="absolute inset-0 h-full w-full cursor-default"
      aria-label="Close drawer overlay"
    />
    <aside className="absolute right-0 top-0 flex h-full w-[520px] max-w-[94vw] flex-col border-l border-slate-200 bg-white shadow-2xl">
      <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
        <h2 className="text-lg font-semibold text-slate-950">{title}</h2>
        <button
          type="button"
          onClick={onClose}
          className="grid h-9 w-9 place-items-center rounded-full border border-slate-200 text-slate-500 transition hover:bg-slate-50 hover:text-slate-900"
          aria-label="Close drawer"
        >
          <X size={16} />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-5">{children}</div>
    </aside>
  </div>
);

export default function ToolsMap() {
  const navigate = useNavigate();
  const mapRef = useRef(null);
  const [tools] = useState(() => getTools());
  const [assignments] = useState(() => getToolAssignments());
  const [maintenance] = useState(() => getToolMaintenance());
  const [employees] = useState(() => getToolEmployees());
  const [draftFilters, setDraftFilters] = useState(DEFAULT_FILTERS);
  const [appliedFilters, setAppliedFilters] = useState(DEFAULT_FILTERS);
  const [viewMode, setViewMode] = useState("map");
  const [activeFloor, setActiveFloor] = useState("Ground Floor");
  const [layers, setLayers] = useState(DEFAULT_LAYERS);
  const [zoom, setZoom] = useState(1);
  const [selectedToolId, setSelectedToolId] = useState(() => getTools()[0]?.id || "");
  const [scanOpen, setScanOpen] = useState(false);
  const [scanValue, setScanValue] = useState("");
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [drawer, setDrawer] = useState(null);
  const [message, setMessage] = useState("");
  const [highlightedToolId, setHighlightedToolId] = useState("");
  const [heatmapRange, setHeatmapRange] = useState("Last 24 hours");

  const activeAssignmentsByTool = useMemo(() => {
    const map = new Map();
    assignments.forEach((assignment) => {
      if (!assignment.actualReturnDate) {
        map.set(assignment.toolId, assignment);
      }
    });
    return map;
  }, [assignments]);

  const openMaintenanceByTool = useMemo(() => {
    const map = new Map();
    maintenance.forEach((record) => {
      if (String(record.status || "").toLowerCase() !== "completed") {
        map.set(record.toolId, record);
      }
    });
    return map;
  }, [maintenance]);

  const employeesById = useMemo(
    () => new Map(employees.map((employee) => [employee.id, employee])),
    [employees]
  );

  const enrichedTools = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return tools.map((tool, index) => {
      const activeAssignment = activeAssignmentsByTool.get(tool.id) || null;
      const maintenanceRecord = openMaintenanceByTool.get(tool.id) || null;
      const hasMaintenanceCondition = /repair|damaged/i.test(tool.condition || "");
      const placement = getPlacementForTool(
        tool,
        index,
        Boolean(maintenanceRecord || hasMaintenanceCondition)
      );
      const position = getPositionForTool(placement.zone, index);
      const expectedReturnDate = getDateValue(activeAssignment?.expectedReturnDate);
      const isOverdue =
        Boolean(activeAssignment && expectedReturnDate) && expectedReturnDate < today;
      const mockLastSeenHours = [2, 9, 18, 52, 6, 30, 74][index % 7];
      let statusKey = "available";
      if (maintenanceRecord || hasMaintenanceCondition) statusKey = "maintenance";
      else if (activeAssignment) statusKey = isOverdue ? "overdue" : "inUse";
      else if (mockLastSeenHours > 48) statusKey = "missing";

      const employee =
        employeesById.get(activeAssignment?.employeeId) ||
        employees.find(
          (record) =>
            normalizeText(record.name) === normalizeText(activeAssignment?.assignedTo)
        ) ||
        null;
      const zone = getZoneByName(placement.zone);

      return {
        ...tool,
        activeAssignment,
        maintenanceRecord,
        assignedEmployee: employee,
        assignedTo: activeAssignment?.assignedTo || employee?.name || "",
        battery: Math.max(12, 92 - index * 11),
        floor: placement.floor,
        lastSeenHours: mockLastSeenHours,
        left: position.left,
        site: zone.site || tool.baseLocation || "Main store",
        statusKey,
        top: position.top,
        zone: placement.zone,
        activityDate:
          activeAssignment?.checkoutDate ||
          maintenanceRecord?.reportedDate ||
          tool.purchaseDate ||
          "",
      };
    });
  }, [activeAssignmentsByTool, employees, employeesById, openMaintenanceByTool, tools]);

  const selectedTool = useMemo(
    () => enrichedTools.find((tool) => tool.id === selectedToolId) || enrichedTools[0] || null,
    [enrichedTools, selectedToolId]
  );

  const filterOptions = useMemo(() => {
    const unique = (values) =>
      Array.from(new Set(values.filter(Boolean))).sort((a, b) =>
        String(a).localeCompare(String(b))
      );
    return {
      sites: unique(enrichedTools.map((tool) => tool.site)),
      zones: unique(getAllZones()),
      categories: unique(enrichedTools.map((tool) => tool.type)),
      employees: unique(enrichedTools.map((tool) => tool.assignedTo)),
    };
  }, [enrichedTools]);

  const filteredTools = useMemo(() => {
    const query = normalizeText(appliedFilters.search);
    const fromDate = getDateValue(appliedFilters.dateFrom);
    const toDate = getDateValue(appliedFilters.dateTo);
    if (toDate) {
      toDate.setHours(23, 59, 59, 999);
    }

    return enrichedTools.filter((tool) => {
      if (query) {
        const haystack = [
          tool.id,
          tool.name,
          tool.type,
          tool.serialNumber,
          tool.site,
          tool.zone,
          tool.assignedTo,
        ]
          .map(normalizeText)
          .join(" ");
        if (!haystack.includes(query)) return false;
      }

      if (appliedFilters.site !== "all" && tool.site !== appliedFilters.site) {
        return false;
      }
      if (appliedFilters.zone !== "all" && tool.zone !== appliedFilters.zone) {
        return false;
      }
      if (
        appliedFilters.category !== "all" &&
        tool.type !== appliedFilters.category
      ) {
        return false;
      }
      if (
        appliedFilters.employee !== "all" &&
        tool.assignedTo !== appliedFilters.employee
      ) {
        return false;
      }
      if (
        appliedFilters.statuses.length > 0 &&
        !appliedFilters.statuses.includes(tool.statusKey)
      ) {
        return false;
      }

      const activityDate = getDateValue(tool.activityDate);
      if (fromDate && (!activityDate || activityDate < fromDate)) return false;
      if (toDate && (!activityDate || activityDate > toDate)) return false;

      return true;
    });
  }, [appliedFilters, enrichedTools]);

  const floorTools = useMemo(
    () => filteredTools.filter((tool) => tool.floor === activeFloor),
    [activeFloor, filteredTools]
  );

  const activityRows = useMemo(
    () => createToolActivity(enrichedTools, assignments, maintenance),
    [assignments, enrichedTools, maintenance]
  );

  const visibleActivityRows = useMemo(() => {
    const visibleIds = new Set(filteredTools.map((tool) => tool.id));
    return activityRows.filter((row) => {
      const matchedTool = enrichedTools.find((tool) => tool.name === row.toolName);
      return !matchedTool || visibleIds.has(matchedTool.id);
    });
  }, [activityRows, enrichedTools, filteredTools]);

  const alerts = useMemo(() => {
    const rows = [];
    enrichedTools.forEach((tool) => {
      if (tool.statusKey === "missing") {
        rows.push({
          id: `missing-${tool.id}`,
          title: `Missing signal: ${tool.name}`,
          message: `Last seen ${formatLastSeen(tool.lastSeenHours)} in ${tool.zone}`,
          time: tool.lastSeenHours,
          severity: "critical",
          icon: AlertTriangle,
          toolId: tool.id,
        });
      }
      if (tool.statusKey === "overdue") {
        rows.push({
          id: `overdue-${tool.id}`,
          title: `Return overdue: ${tool.name}`,
          message: `${tool.assignedTo || "Assigned user"} missed the expected return date`,
          time: 12,
          severity: "warning",
          icon: Clock3,
          toolId: tool.id,
        });
      }
      if (tool.statusKey === "maintenance") {
        rows.push({
          id: `maintenance-${tool.id}`,
          title: `Maintenance required: ${tool.name}`,
          message: tool.maintenanceRecord?.issue || tool.condition || "Inspection required",
          time: 24,
          severity: "warning",
          icon: Wrench,
          toolId: tool.id,
        });
      }
      if (tool.battery <= 20) {
        rows.push({
          id: `battery-${tool.id}`,
          title: `Low battery: ${tool.name}`,
          message: `Battery at ${tool.battery}%`,
          time: 2,
          severity: "info",
          icon: Zap,
          toolId: tool.id,
        });
      }
    });
    return rows.slice(0, 12);
  }, [enrichedTools]);

  const zoneSummaries = useMemo(() => {
    const counts = new Map();
    enrichedTools.forEach((tool) => {
      const current = counts.get(tool.zone) || {
        name: tool.zone,
        capacity: getZoneByName(tool.zone).capacity || 0,
        count: 0,
        maintenance: 0,
        missing: 0,
      };
      current.count += 1;
      if (tool.statusKey === "maintenance") current.maintenance += 1;
      if (tool.statusKey === "missing") current.missing += 1;
      counts.set(tool.zone, current);
    });
    return Array.from(counts.values()).sort((left, right) =>
      left.name.localeCompare(right.name)
    );
  }, [enrichedTools]);

  const kpis = useMemo(() => {
    const total = filteredTools.length;
    const inUse = filteredTools.filter((tool) =>
      ["inUse", "overdue"].includes(tool.statusKey)
    ).length;
    const missing = filteredTools.filter((tool) => tool.statusKey === "missing").length;
    const maintenanceCount = filteredTools.filter(
      (tool) => tool.statusKey === "maintenance"
    ).length;
    const activeToday = filteredTools.filter((tool) => tool.lastSeenHours <= 24).length;
    const activeZones = new Set(filteredTools.map((tool) => tool.zone)).size;
    return [
      {
        label: "Total Tools",
        value: formatNumber(total),
        helper: `${formatNumber(floorTools.length)} on ${activeFloor}`,
        icon: BriefcaseBusiness,
        tone: "bg-blue-50 text-blue-700",
      },
      {
        label: "Active Today",
        value: formatNumber(activeToday),
        helper: `${total ? Math.round((activeToday / total) * 100) : 0}% seen recently`,
        icon: Activity,
        tone: "bg-emerald-50 text-emerald-700",
      },
      {
        label: "In Use",
        value: formatNumber(inUse),
        helper: "Checked out or overdue",
        icon: Users,
        tone: "bg-sky-50 text-sky-700",
      },
      {
        label: "Missing",
        value: formatNumber(missing),
        helper: "Offline tracking signal",
        icon: AlertTriangle,
        tone: "bg-red-50 text-red-700",
      },
      {
        label: "Maintenance",
        value: formatNumber(maintenanceCount),
        helper: `${activeZones} active zones`,
        icon: Wrench,
        tone: "bg-orange-50 text-orange-700",
      },
    ];
  }, [activeFloor, filteredTools, floorTools.length]);

  const updateDraftFilter = (field, value) => {
    setDraftFilters((current) => ({ ...current, [field]: value }));
  };

  const toggleStatusFilter = (statusKey) => {
    setDraftFilters((current) => {
      if (statusKey === "all") {
        return { ...current, statuses: [] };
      }
      const exists = current.statuses.includes(statusKey);
      return {
        ...current,
        statuses: exists
          ? current.statuses.filter((status) => status !== statusKey)
          : [...current.statuses, statusKey],
      };
    });
  };

  const applyFilters = () => {
    setAppliedFilters(draftFilters);
    setMessage("Filters applied to map, list, timeline, and export.");
  };

  const clearFilters = () => {
    setDraftFilters(DEFAULT_FILTERS);
    setAppliedFilters(DEFAULT_FILTERS);
    setMessage("Filters cleared.");
  };

  const selectTool = (tool, nextMessage = "") => {
    if (!tool) return;
    setSelectedToolId(tool.id);
    setHighlightedToolId(tool.id);
    setActiveFloor(tool.floor);
    if (nextMessage) setMessage(nextMessage);
  };

  const handleLocate = () => {
    const target =
      filteredTools.find((tool) => tool.activeAssignment) ||
      filteredTools[0] ||
      enrichedTools[0];
    if (!target) {
      setMessage("No tools available to locate.");
      return;
    }
    selectTool(target, `${target.name} located in ${target.zone}.`);
  };

  const handleFullscreen = async () => {
    if (!mapRef.current || typeof document === "undefined") return;
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
        setMessage("Exited fullscreen map view.");
      } else {
        await mapRef.current.requestFullscreen();
        setMessage("Map opened in fullscreen.");
      }
    } catch {
      setMessage("Fullscreen is not available in this browser.");
    }
  };

  const handleExport = () => {
    const headers = [
      "Tool ID",
      "Tool Name",
      "Serial Number",
      "Category",
      "Status",
      "Floor",
      "Zone",
      "Site",
      "Assigned To",
      "Last Seen",
    ];
    const rows = filteredTools.map((tool) => [
      tool.id,
      tool.name,
      tool.serialNumber,
      tool.type,
      STATUS_META[tool.statusKey]?.label || tool.statusKey,
      tool.floor,
      tool.zone,
      tool.site,
      tool.assignedTo || "-",
      formatLastSeen(tool.lastSeenHours),
    ]);
    const csv = [headers, ...rows]
      .map((row) => row.map(csvEscape).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "tools-map-export.csv";
    anchor.click();
    URL.revokeObjectURL(url);
    setMessage(`Exported ${filteredTools.length} tools to CSV.`);
  };

  const handleScanSubmit = (event) => {
    event.preventDefault();
    const needle = normalizeText(scanValue);
    const match = enrichedTools.find((tool) =>
      [tool.id, tool.serialNumber, tool.name].some((value) =>
        normalizeText(value).includes(needle)
      )
    );
    if (!needle) {
      setMessage("Enter a tool ID, serial number, or name to scan.");
      return;
    }
    if (!match) {
      setMessage("No matching tool found for that scan value.");
      return;
    }
    selectTool(match, `${match.name} selected from scan.`);
    setDraftFilters(DEFAULT_FILTERS);
    setAppliedFilters(DEFAULT_FILTERS);
    setScanOpen(false);
    setScanValue("");
  };

  const handleHeatmapRange = () => {
    const ranges = ["Last 24 hours", "Last 7 days", "Last 30 days"];
    const index = ranges.indexOf(heatmapRange);
    setHeatmapRange(ranges[(index + 1) % ranges.length]);
  };

  const floorZones = getFloorZones(activeFloor);
  const activeFloorZoneNames = new Set(floorZones.map((zone) => zone.name));
  const selectedHistory = selectedTool
    ? activityRows.filter((row) => row.toolName === selectedTool.name)
    : [];

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
              Tools & Assets
            </p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-950">
              Tool Map Control Center
            </h1>
            <p className="mt-1 max-w-3xl text-sm text-slate-600">
              Track tools by floor, zone, employee, status, and movement history
              using the existing local tool records.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => navigate("/inventory/tools/new")}
              className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
            >
              <Plus size={16} />
              Add Tool
            </button>
            <button
              type="button"
              onClick={() => navigate("/inventory/tools/assign")}
              className="inline-flex h-10 items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 text-sm font-semibold text-blue-700 transition hover:bg-blue-100"
            >
              <Users size={16} />
              Assign Tool
            </button>
            <button
              type="button"
              onClick={() => setScanOpen(true)}
              className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
            >
              <QrCode size={16} />
              Scan QR / RFID
            </button>
            <button
              type="button"
              onClick={handleExport}
              className="inline-flex h-10 items-center gap-2 rounded-lg bg-slate-900 px-3 text-sm font-semibold text-white transition hover:bg-slate-800"
            >
              <FileDown size={16} />
              Export CSV
            </button>
          </div>
        </div>
      </section>

      {message && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
          <span>{message}</span>
          <button
            type="button"
            onClick={() => setMessage("")}
            className="grid h-7 w-7 place-items-center rounded-full text-blue-700 transition hover:bg-blue-100"
            aria-label="Dismiss message"
          >
            <X size={14} />
          </button>
        </div>
      )}

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        {kpis.map(({ label, value, helper, icon: Icon, tone }) => (
          <div
            key={label}
            className="flex min-h-[112px] items-center justify-between rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
          >
            <div>
              <p className="text-xs font-medium text-slate-500">{label}</p>
              <p className="mt-2 text-2xl font-semibold text-slate-950">{value}</p>
              <p className="mt-1 text-xs text-slate-500">{helper}</p>
            </div>
            <span className={`grid h-11 w-11 place-items-center rounded-xl ${tone}`}>
              <Icon size={21} />
            </span>
          </div>
        ))}
      </section>

      <section className="grid gap-4 xl:grid-cols-[280px_minmax(0,1fr)_330px]">
        <aside className="space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                Filters
              </h2>
              <button
                type="button"
                onClick={clearFilters}
                className="text-xs font-semibold text-blue-700 transition hover:text-blue-900"
              >
                Clear all
              </button>
            </div>
            <div className="space-y-3">
              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-slate-700">
                  Search Tools
                </span>
                <span className="flex h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3">
                  <Search size={15} className="text-slate-400" />
                  <input
                    value={draftFilters.search}
                    onChange={(event) => updateDraftFilter("search", event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") applyFilters();
                    }}
                    className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-slate-400"
                    placeholder="ID, name, serial, zone..."
                  />
                </span>
              </label>

              {[
                ["site", "Site", "All Sites", filterOptions.sites],
                ["zone", "Zone", "All Zones", filterOptions.zones],
                ["category", "Category", "All Categories", filterOptions.categories],
                ["employee", "Employee", "All Employees", filterOptions.employees],
              ].map(([field, label, emptyLabel, options]) => (
                <label key={field} className="block">
                  <span className="mb-1 block text-xs font-semibold text-slate-700">
                    {label}
                  </span>
                  <select
                    value={draftFilters[field]}
                    onChange={(event) => updateDraftFilter(field, event.target.value)}
                    className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                  >
                    <option value="all">{emptyLabel}</option>
                    {options.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </label>
              ))}

              <div>
                <span className="mb-2 block text-xs font-semibold text-slate-700">
                  Status
                </span>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => toggleStatusFilter("all")}
                    className={`h-9 rounded-lg border px-2 text-xs font-semibold transition ${
                      draftFilters.statuses.length === 0
                        ? "border-blue-500 bg-blue-600 text-white"
                        : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                    }`}
                  >
                    All Status
                  </button>
                  {Object.entries(STATUS_META).map(([statusKey, meta]) => (
                    <button
                      type="button"
                      key={statusKey}
                      onClick={() => toggleStatusFilter(statusKey)}
                      className={`flex h-9 items-center justify-center gap-1.5 rounded-lg border px-2 text-xs font-semibold transition ${
                        draftFilters.statuses.includes(statusKey)
                          ? "border-blue-500 bg-blue-50 text-blue-700"
                          : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                      }`}
                    >
                      <span className={`h-2 w-2 rounded-full ${meta.marker}`} />
                      {meta.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <label className="block">
                  <span className="mb-1 block text-xs font-semibold text-slate-700">
                    From
                  </span>
                  <input
                    type="date"
                    value={draftFilters.dateFrom}
                    onChange={(event) => updateDraftFilter("dateFrom", event.target.value)}
                    className="h-10 w-full rounded-lg border border-slate-200 px-2 text-xs text-slate-700 outline-none"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-semibold text-slate-700">
                    To
                  </span>
                  <input
                    type="date"
                    value={draftFilters.dateTo}
                    onChange={(event) => updateDraftFilter("dateTo", event.target.value)}
                    className="h-10 w-full rounded-lg border border-slate-200 px-2 text-xs text-slate-700 outline-none"
                  />
                </label>
              </div>

              <button
                type="button"
                onClick={applyFilters}
                className="h-10 w-full rounded-lg bg-blue-600 text-sm font-semibold text-white transition hover:bg-blue-700"
              >
                Apply Filters ({filteredTools.length})
              </button>
              <button
                type="button"
                onClick={() => setScanOpen(true)}
                className="flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                <QrCode size={16} />
                Scan QR / RFID
              </button>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
              Capabilities
            </h2>
            <div className="mt-3 space-y-3">
              {FEATURE_CARDS.map(([Icon, title, subtitle]) => (
                <div key={title} className="flex items-start gap-3">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-700">
                    <Icon size={17} />
                  </span>
                  <span>
                    <span className="block text-sm font-semibold text-slate-900">
                      {title}
                    </span>
                    <span className="text-xs leading-5 text-slate-500">{subtitle}</span>
                  </span>
                </div>
              ))}
            </div>
          </div>
        </aside>

        <section
          ref={mapRef}
          className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
        >
          <div className="mb-4 flex flex-col gap-3 2xl:flex-row 2xl:items-center 2xl:justify-between">
            <div className="flex flex-wrap gap-2">
              {VIEW_OPTIONS.map(({ id, label, icon: Icon }) => (
                <button
                  type="button"
                  key={id}
                  onClick={() => setViewMode(id)}
                  className={`inline-flex h-9 items-center gap-2 rounded-lg border px-3 text-xs font-semibold transition ${
                    viewMode === id
                      ? "border-blue-600 bg-blue-600 text-white"
                      : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  <Icon size={15} />
                  {label}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <label className="flex items-center gap-2">
                <span className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                  Floor
                </span>
                <select
                  value={activeFloor}
                  onChange={(event) => setActiveFloor(event.target.value)}
                  className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 outline-none"
                >
                  {Object.keys(FLOOR_PLANS).map((floor) => (
                    <option key={floor} value={floor}>
                      {floor}
                    </option>
                  ))}
                </select>
              </label>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
                Zoom {Math.round(zoom * 100)}%
              </span>
            </div>
          </div>

          {viewMode === "list" ? (
            <div className="overflow-hidden rounded-xl border border-slate-200">
              <div className="max-h-[570px] overflow-auto">
                <table className="min-w-full text-left text-sm">
                  <thead className="sticky top-0 bg-slate-50 text-xs uppercase tracking-[0.16em] text-slate-500">
                    <tr>
                      {["Tool", "Status", "Zone", "Assigned To", "Last Seen", "Action"].map(
                        (heading) => (
                          <th key={heading} className="px-4 py-3 font-semibold">
                            {heading}
                          </th>
                        )
                      )}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredTools.map((tool) => (
                      <tr key={tool.id} className="bg-white">
                        <td className="px-4 py-3">
                          <p className="font-semibold text-slate-900">{tool.name}</p>
                          <p className="text-xs text-slate-500">
                            {tool.id} | {tool.serialNumber || "No serial"}
                          </p>
                        </td>
                        <td className="px-4 py-3">
                          <StatusBadge statusKey={tool.statusKey} />
                        </td>
                        <td className="px-4 py-3 text-slate-700">
                          {tool.floor} / {tool.zone}
                        </td>
                        <td className="px-4 py-3 text-slate-700">
                          {tool.assignedTo || "-"}
                        </td>
                        <td className="px-4 py-3 text-slate-700">
                          {formatLastSeen(tool.lastSeenHours)}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => selectTool(tool, `${tool.name} selected.`)}
                              className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                            >
                              Open
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                selectTool(tool);
                                setDrawer("history");
                              }}
                              className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-slate-800"
                            >
                              Track
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {!filteredTools.length && (
                      <tr>
                        <td colSpan="6" className="px-4 py-12 text-center text-slate-500">
                          No tools match the current filters.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="relative h-[590px] overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
              <div
                className="absolute inset-0 transition-transform duration-200"
                style={{ transform: `scale(${zoom})`, transformOrigin: "center" }}
              >
                <div className="absolute inset-0 opacity-70 [background-image:linear-gradient(rgba(15,23,42,0.08)_1px,transparent_1px),linear-gradient(90deg,rgba(15,23,42,0.08)_1px,transparent_1px)] [background-size:28px_28px]" />
                <svg
                  className="absolute inset-0 h-full w-full opacity-20"
                  viewBox="0 0 900 590"
                  preserveAspectRatio="none"
                >
                  <path
                    d="M28 32H835v48h35v116h-22v76h28v118h-42v154H43V438H17V284h54V34"
                    fill="none"
                    stroke="#0f172a"
                    strokeWidth="3"
                  />
                  {Array.from({ length: 16 }).map((_, index) => (
                    <path
                      key={`v-${index}`}
                      d={`M${60 + index * 50} 36v500`}
                      stroke="#334155"
                      strokeWidth="1"
                    />
                  ))}
                  {Array.from({ length: 10 }).map((_, index) => (
                    <path
                      key={`h-${index}`}
                      d={`M32 ${80 + index * 46}h830`}
                      stroke="#64748b"
                      strokeWidth="1"
                    />
                  ))}
                  <path
                    d="M42 238h120v64H42zm0 80h120v70H42m505-250v340M692 43v140m0 215v138M112 48v166m0 222v98"
                    fill="none"
                    stroke="#0f172a"
                    strokeWidth="2"
                  />
                </svg>

                {layers.zones &&
                  floorZones.map((zone) => {
                    const count = floorTools.filter((tool) => tool.zone === zone.name).length;
                    return (
                      <div key={zone.name}>
                        <div className={`absolute rounded-md border-2 ${zone.style}`} />
                        <div
                          className={`absolute rounded-lg border px-3 py-2 text-xs shadow-sm ${zone.label}`}
                        >
                          <p className="font-semibold text-slate-950">{zone.name}</p>
                          <p className="text-slate-600">
                            {count} / {zone.capacity} tools
                          </p>
                        </div>
                      </div>
                    );
                  })}

                {(viewMode === "heatmap" || layers.heatmap) && (
                  <>
                    {floorZones.map((zone, index) => {
                      const count = floorTools.filter((tool) => tool.zone === zone.name).length;
                      if (!count) return null;
                      const sizes = ["h-28 w-28", "h-24 w-24", "h-20 w-20", "h-16 w-16"];
                      const colors = [
                        "bg-red-400",
                        "bg-amber-300",
                        "bg-emerald-300",
                        "bg-blue-300",
                      ];
                      const position = getPositionForTool(zone.name, index);
                      return (
                        <div
                          key={`heat-${zone.name}`}
                          className={`absolute -translate-x-1/2 -translate-y-1/2 rounded-full opacity-60 blur-xl ${
                            sizes[Math.min(count, sizes.length) - 1] || "h-16 w-16"
                          } ${colors[index % colors.length]}`}
                          style={position}
                        />
                      );
                    })}
                    <div className="absolute bottom-4 left-4 rounded-xl border border-slate-200 bg-white/95 px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm">
                      Heatmap range: {heatmapRange}
                    </div>
                  </>
                )}

                {layers.maintenance &&
                  floorTools
                    .filter((tool) => tool.statusKey === "maintenance")
                    .map((tool) => (
                      <span
                        key={`maint-${tool.id}`}
                        className="absolute h-12 w-12 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-orange-400 bg-orange-300/20"
                        style={{ left: tool.left, top: tool.top }}
                      />
                    ))}

                {layers.cctv &&
                  floorZones.slice(0, 4).map((zone, index) => {
                    const position = getPositionForTool(zone.name, index + 2);
                    return (
                      <div
                        key={`cctv-${zone.name}`}
                        className="absolute flex -translate-x-1/2 -translate-y-1/2 items-center gap-1 rounded-full border border-slate-200 bg-white px-2 py-1 text-[10px] font-semibold text-slate-600 shadow-sm"
                        style={position}
                      >
                        <Radio size={11} />
                        CCTV
                      </div>
                    );
                  })}

                {layers.markers &&
                  floorTools.map((tool) => {
                    const isSelected = selectedTool?.id === tool.id;
                    const isHighlighted = highlightedToolId === tool.id;
                    return (
                      <button
                        type="button"
                        key={tool.id}
                        onClick={() => selectTool(tool, `${tool.name} selected.`)}
                        className={`absolute grid h-8 w-8 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-xl border-2 border-white text-[10px] font-black text-white shadow-lg transition hover:scale-110 focus:outline-none focus:ring-4 focus:ring-blue-200 ${
                          STATUS_META[tool.statusKey]?.marker || STATUS_META.available.marker
                        } ${isSelected || isHighlighted ? "ring-4 ring-blue-300" : ""}`}
                        style={{ left: tool.left, top: tool.top }}
                        title={`${tool.name} - ${tool.zone}`}
                      >
                        {getInitials(tool.name).slice(0, 2)}
                      </button>
                    );
                  })}

                {layers.employees &&
                  floorTools
                    .filter((tool) => tool.assignedTo)
                    .map((tool) => (
                      <span
                        key={`employee-${tool.id}`}
                        className="absolute ml-5 mt-2 max-w-[130px] truncate rounded-full border border-slate-200 bg-white px-2 py-1 text-[10px] font-semibold text-slate-700 shadow-sm"
                        style={{ left: tool.left, top: tool.top }}
                      >
                        {tool.assignedTo}
                      </span>
                    ))}
              </div>

              {!floorTools.length && (
                <div className="absolute inset-0 flex items-center justify-center bg-white/70">
                  <div className="max-w-sm rounded-2xl border border-dashed border-slate-300 bg-white px-5 py-6 text-center shadow-sm">
                    <MapPin className="mx-auto h-8 w-8 text-slate-400" />
                    <p className="mt-3 font-semibold text-slate-900">
                      No tools on this floor
                    </p>
                    <p className="mt-1 text-sm text-slate-500">
                      Change the floor or clear filters to see more map markers.
                    </p>
                  </div>
                </div>
              )}

              <div className="absolute left-4 top-4 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
                <button
                  type="button"
                  onClick={() => setZoom((current) => Math.min(1.45, current + 0.1))}
                  className="grid h-11 w-11 place-items-center border-b border-slate-100 text-slate-700 transition hover:bg-slate-50"
                  aria-label="Zoom in"
                >
                  <Plus size={18} />
                </button>
                <button
                  type="button"
                  onClick={() => setZoom((current) => Math.max(0.75, current - 0.1))}
                  className="grid h-11 w-11 place-items-center border-b border-slate-100 text-slate-700 transition hover:bg-slate-50"
                  aria-label="Zoom out"
                >
                  <Minus size={18} />
                </button>
                <button
                  type="button"
                  onClick={handleFullscreen}
                  className="grid h-11 w-11 place-items-center border-b border-slate-100 text-slate-700 transition hover:bg-slate-50"
                  aria-label="Toggle fullscreen"
                >
                  <Fullscreen size={18} />
                </button>
                <button
                  type="button"
                  onClick={handleLocate}
                  className="grid h-11 w-11 place-items-center text-slate-700 transition hover:bg-slate-50"
                  aria-label="Locate active tool"
                >
                  <Target size={18} />
                </button>
              </div>

              <div className="absolute right-4 top-4 w-44 rounded-xl border border-slate-200 bg-white/95 p-3 shadow-lg">
                <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                  Tool Status
                </p>
                {Object.entries(STATUS_META).map(([statusKey, meta]) => (
                  <div
                    key={statusKey}
                    className="mb-2 flex items-center justify-between gap-2 text-xs text-slate-700 last:mb-0"
                  >
                    <span className="flex items-center gap-2">
                      <span className={`h-2.5 w-2.5 rounded-full ${meta.marker}`} />
                      {meta.label}
                    </span>
                    <span className="font-semibold">
                      {floorTools.filter((tool) => tool.statusKey === statusKey).length}
                    </span>
                  </div>
                ))}
              </div>

              <div className="absolute bottom-16 right-4 w-48 rounded-xl border border-slate-200 bg-white/95 p-3 shadow-lg">
                <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                  Layers
                </p>
                {Object.entries(layers).map(([key, enabled]) => (
                  <button
                    type="button"
                    key={key}
                    onClick={() =>
                      setLayers((current) => ({ ...current, [key]: !current[key] }))
                    }
                    className="mb-2 flex w-full items-center justify-between gap-2 text-left text-xs font-semibold capitalize text-slate-700 last:mb-0"
                  >
                    {key === "cctv" ? "CCTV Feeds" : key}
                    <span
                      className={`flex h-5 w-9 items-center rounded-full p-0.5 transition ${
                        enabled ? "bg-blue-600" : "bg-slate-200"
                      }`}
                    >
                      <span
                        className={`h-4 w-4 rounded-full bg-white shadow transition ${
                          enabled ? "translate-x-4" : ""
                        }`}
                      />
                    </span>
                  </button>
                ))}
              </div>

              <button
                type="button"
                onClick={handleLocate}
                className="absolute bottom-4 right-4 flex h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-800 shadow-lg transition hover:bg-slate-50"
              >
                <LocateFixed size={17} />
                Locate Me
                <ChevronDown size={15} />
              </button>
            </div>
          )}

          {viewMode === "layers" && (
            <div className="mt-4 grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
              {Object.entries(layers).map(([key, enabled]) => (
                <button
                  type="button"
                  key={`layer-card-${key}`}
                  onClick={() =>
                    setLayers((current) => ({ ...current, [key]: !current[key] }))
                  }
                  className={`rounded-xl border p-4 text-left transition ${
                    enabled
                      ? "border-blue-200 bg-blue-50"
                      : "border-slate-200 bg-white hover:bg-slate-50"
                  }`}
                >
                  <p className="text-sm font-semibold capitalize text-slate-950">
                    {key === "cctv" ? "CCTV Feeds" : key}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    {enabled ? "Visible on map" : "Hidden from map"}
                  </p>
                </button>
              ))}
            </div>
          )}
        </section>

        <aside className="space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                Tool Details
              </h2>
              <button
                type="button"
                onClick={() => setSelectedToolId("")}
                className="grid h-8 w-8 place-items-center rounded-full text-slate-400 transition hover:bg-slate-50 hover:text-slate-700"
                aria-label="Clear selected tool"
              >
                <X size={15} />
              </button>
            </div>
            {selectedTool ? (
              <>
                <div className="flex gap-4">
                  <div className="grid h-20 w-20 place-items-center rounded-2xl bg-slate-100 text-slate-800">
                    <Drill size={50} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <StatusBadge statusKey={selectedTool.statusKey} />
                    <h3 className="mt-2 truncate text-lg font-semibold text-slate-950">
                      {selectedTool.name}
                    </h3>
                    <p className="text-xs text-slate-500">
                      {selectedTool.id} | {selectedTool.serialNumber || "No serial"}
                    </p>
                  </div>
                </div>
                <dl className="mt-4 grid grid-cols-2 gap-y-2 text-xs">
                  {[
                    ["Category", selectedTool.type || "-"],
                    ["Floor", selectedTool.floor],
                    ["Zone", selectedTool.zone],
                    ["Site", selectedTool.site],
                    ["Last Seen", formatLastSeen(selectedTool.lastSeenHours)],
                    ["Assigned To", selectedTool.assignedTo || "-"],
                    ["Condition", selectedTool.condition || "-"],
                    ["Purchase", formatDate(selectedTool.purchaseDate)],
                  ].map(([label, value]) => (
                    <div key={label}>
                      <dt className="text-slate-500">{label}</dt>
                      <dd className="mt-1 font-semibold text-slate-800">{value}</dd>
                    </div>
                  ))}
                </dl>
                <div className="mt-4 flex items-center gap-3 text-xs">
                  <span className="font-semibold text-slate-500">
                    Battery: {selectedTool.battery}%
                  </span>
                  <div className="h-2 flex-1 rounded-full bg-slate-100">
                    <div
                      className={`h-2 rounded-full ${
                        selectedTool.battery <= 20 ? "bg-red-500" : "bg-emerald-500"
                      }`}
                      style={{ width: `${selectedTool.battery}%` }}
                    />
                  </div>
                </div>
                <div className="mt-5 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setDetailsOpen(true)}
                    className="h-10 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                  >
                    View Details
                  </button>
                  <button
                    type="button"
                    onClick={() => setDrawer("history")}
                    className="h-10 rounded-lg bg-slate-900 text-xs font-semibold text-white transition hover:bg-slate-800"
                  >
                    Track History
                  </button>
                </div>
              </>
            ) : (
              <div className="rounded-xl border border-dashed border-slate-300 px-4 py-8 text-center">
                <MapPin className="mx-auto h-8 w-8 text-slate-400" />
                <p className="mt-3 text-sm font-semibold text-slate-900">
                  No tool selected
                </p>
                <p className="mt-1 text-sm text-slate-500">
                  Click a marker or list row to inspect a tool.
                </p>
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                Alerts
              </h2>
              <button
                type="button"
                onClick={() => setDrawer("alerts")}
                className="text-xs font-semibold text-blue-700 hover:text-blue-900"
              >
                View all
              </button>
            </div>
            <div className="space-y-3">
              {alerts.slice(0, 4).map((alert) => (
                <button
                  type="button"
                  key={alert.id}
                  onClick={() => {
                    const tool = enrichedTools.find((item) => item.id === alert.toolId);
                    if (tool) selectTool(tool, `${tool.name} selected from alert.`);
                  }}
                  className="flex w-full items-start gap-3 rounded-xl p-2 text-left transition hover:bg-slate-50"
                >
                  <span
                    className={`grid h-8 w-8 shrink-0 place-items-center rounded-full ${
                      alert.severity === "critical"
                        ? "bg-red-50 text-red-600"
                        : alert.severity === "warning"
                          ? "bg-amber-50 text-amber-600"
                          : "bg-blue-50 text-blue-600"
                    }`}
                  >
                    <alert.icon size={15} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-xs font-semibold text-slate-900">
                      {alert.title}
                    </span>
                    <span className="text-xs leading-5 text-slate-500">
                      {alert.message}
                    </span>
                  </span>
                </button>
              ))}
              {!alerts.length && (
                <p className="rounded-xl border border-dashed border-slate-200 p-4 text-center text-sm text-slate-500">
                  No map alerts right now.
                </p>
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                Zone Overview
              </h2>
              <button
                type="button"
                onClick={() => setDrawer("zones")}
                className="text-xs font-semibold text-blue-700 hover:text-blue-900"
              >
                View all
              </button>
            </div>
            <div className="space-y-4">
              {zoneSummaries.slice(0, 5).map((zone) => {
                const pct = Math.min(100, Math.round((zone.count / zone.capacity) * 100));
                return (
                  <button
                    type="button"
                    key={zone.name}
                    onClick={() => {
                      updateDraftFilter("zone", zone.name);
                      setAppliedFilters((current) => ({ ...current, zone: zone.name }));
                      const floor = getPlacementForTool({ baseLocation: getZoneByName(zone.name).site }, 0, false).floor;
                      if (activeFloorZoneNames.has(zone.name)) {
                        setActiveFloor(activeFloor);
                      } else {
                        const actualFloor =
                          Object.entries(FLOOR_PLANS).find(([, zones]) =>
                            zones.some((item) => item.name === zone.name)
                          )?.[0] || floor;
                        setActiveFloor(actualFloor);
                      }
                      setMessage(`${zone.name} filter applied.`);
                    }}
                    className="w-full text-left"
                  >
                    <div className="mb-2 flex items-center gap-3 text-xs">
                      <span className="h-2.5 w-2.5 rounded-full bg-blue-500" />
                      <span className="min-w-0 flex-1 truncate font-semibold text-slate-800">
                        {zone.name}
                      </span>
                      <span className="font-semibold text-slate-700">
                        {zone.count} / {zone.capacity}
                      </span>
                      <span className="text-slate-500">{pct}%</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-slate-200">
                      <div
                        className="h-1.5 rounded-full bg-blue-500"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </aside>
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.15fr_0.9fr_0.95fr]">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
              Movement Timeline
            </h2>
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              Live local data
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-xs">
              <thead className="text-slate-500">
                <tr>
                  {["Time", "Tool", "From", "To", "By"].map((heading) => (
                    <th key={heading} className="pb-3 font-semibold">
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {visibleActivityRows.slice(0, 5).map((row) => (
                  <tr key={row.id} className="text-slate-800">
                    <td className="py-2 pr-3">{formatShortDateTime(row.time)}</td>
                    <td className="py-2 pr-3 font-semibold">{row.toolName}</td>
                    <td className="py-2 pr-3">{row.from}</td>
                    <td className="py-2 pr-3">{row.to}</td>
                    <td className="py-2">{row.by}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button
            type="button"
            onClick={() => setDrawer("timeline")}
            className="mt-4 flex items-center gap-2 text-sm font-semibold text-blue-700 transition hover:text-blue-900"
          >
            View full timeline <Route size={14} />
          </button>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
              Tool Heatmap
            </h2>
            <button
              type="button"
              onClick={handleHeatmapRange}
              className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              {heatmapRange}
            </button>
          </div>
          <div className="relative h-52 overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
            <div className="absolute inset-0 opacity-45 [background-image:linear-gradient(rgba(15,23,42,0.12)_1px,transparent_1px),linear-gradient(90deg,rgba(15,23,42,0.12)_1px,transparent_1px)] [background-size:24px_24px]" />
            {zoneSummaries.slice(0, 6).map((zone, index) => (
              <span
                key={`mini-${zone.name}`}
                className={`absolute rounded-full opacity-70 blur-xl ${
                  ["h-28 w-28 bg-red-400", "h-24 w-24 bg-amber-300", "h-20 w-20 bg-emerald-300", "h-16 w-16 bg-blue-300"][index % 4]
                }`}
                style={{
                  left: `${12 + (index % 3) * 28}%`,
                  top: `${18 + Math.floor(index / 3) * 38}%`,
                }}
              />
            ))}
            <div className="absolute bottom-4 right-4 flex items-center gap-2 text-[10px] font-semibold text-slate-600">
              <span>Low</span>
              <span className="h-20 w-2 rounded-full bg-gradient-to-t from-blue-500 via-green-400 via-yellow-300 to-red-500" />
              <span>High</span>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="mb-4 text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
            Recent Activity
          </h2>
          <div className="space-y-3">
            {visibleActivityRows.slice(0, 4).map((row) => (
              <button
                type="button"
                key={`recent-${row.id}`}
                onClick={() => {
                  const tool = enrichedTools.find((item) => item.name === row.toolName);
                  if (tool) selectTool(tool, `${tool.name} selected from activity.`);
                }}
                className="flex w-full gap-3 rounded-xl p-2 text-left transition hover:bg-slate-50"
              >
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-emerald-50 text-emerald-700">
                  <row.icon size={15} />
                </span>
                <span className="min-w-0 flex-1 text-xs">
                  <span className="font-semibold text-slate-900">{row.title}</span>
                  <span className="block truncate text-slate-500">
                    {row.toolName} | {row.from} to {row.to}
                  </span>
                </span>
                <span className="text-[10px] text-slate-500">
                  {formatDate(row.time)}
                </span>
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setDrawer("activity")}
            className="mt-4 flex items-center gap-2 text-sm font-semibold text-blue-700 transition hover:text-blue-900"
          >
            View all activity <Route size={14} />
          </button>
        </div>
      </section>

      {scanOpen && (
        <Modal title="Scan QR / RFID" onClose={() => setScanOpen(false)}>
          <form onSubmit={handleScanSubmit} className="space-y-4">
            <p className="text-sm leading-6 text-slate-600">
              Enter a tool ID, serial number, or tool name. This simulates a QR/RFID
              scan against the local tool register.
            </p>
            <label className="block">
              <span className="mb-1 block text-sm font-semibold text-slate-700">
                Scan Value
              </span>
              <input
                value={scanValue}
                onChange={(event) => setScanValue(event.target.value)}
                autoFocus
                className="h-11 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                placeholder="Example: TL-211 or BCD123456"
              />
            </label>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setScanOpen(false)}
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700"
              >
                Find Tool
              </button>
            </div>
          </form>
        </Modal>
      )}

      {detailsOpen && selectedTool && (
        <Modal title="Tool Details" onClose={() => setDetailsOpen(false)}>
          <div className="space-y-5">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
              <div className="grid h-20 w-20 place-items-center rounded-2xl bg-slate-100 text-slate-800">
                <Drill size={52} />
              </div>
              <div>
                <StatusBadge statusKey={selectedTool.statusKey} />
                <h3 className="mt-2 text-xl font-semibold text-slate-950">
                  {selectedTool.name}
                </h3>
                <p className="text-sm text-slate-500">
                  {selectedTool.id} | {selectedTool.serialNumber || "No serial"}
                </p>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {[
                ["Category", selectedTool.type || "-"],
                ["Condition", selectedTool.condition || "-"],
                ["Base Location", selectedTool.baseLocation || "-"],
                ["Current Zone", `${selectedTool.floor} / ${selectedTool.zone}`],
                ["Assigned To", selectedTool.assignedTo || "-"],
                ["Expected Return", formatDate(selectedTool.activeAssignment?.expectedReturnDate)],
                ["Maintenance Issue", selectedTool.maintenanceRecord?.issue || "-"],
                ["Notes", selectedTool.notes || "-"],
              ].map(([label, value]) => (
                <div key={label} className="rounded-xl border border-slate-200 p-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                    {label}
                  </p>
                  <p className="mt-1 text-sm font-semibold text-slate-900">{value}</p>
                </div>
              ))}
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={() => navigate("/inventory/tools/assign")}
                className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-700 transition hover:bg-blue-100"
              >
                Assign / Reassign
              </button>
              <button
                type="button"
                onClick={() => {
                  setDetailsOpen(false);
                  setDrawer("history");
                }}
                className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
              >
                Track History
              </button>
            </div>
          </div>
        </Modal>
      )}

      {drawer && (
        <Drawer
          title={
            {
              alerts: "All Map Alerts",
              zones: "Zone Overview",
              timeline: "Movement Timeline",
              activity: "Recent Activity",
              history: selectedTool ? `${selectedTool.name} History` : "Tool History",
            }[drawer]
          }
          onClose={() => setDrawer(null)}
        >
          {drawer === "alerts" && (
            <div className="space-y-3">
              {alerts.map((alert) => (
                <button
                  type="button"
                  key={`drawer-${alert.id}`}
                  onClick={() => {
                    const tool = enrichedTools.find((item) => item.id === alert.toolId);
                    if (tool) selectTool(tool, `${tool.name} selected from alert.`);
                    setDrawer(null);
                  }}
                  className="flex w-full items-start gap-3 rounded-xl border border-slate-200 p-3 text-left transition hover:bg-slate-50"
                >
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-red-50 text-red-600">
                    <alert.icon size={16} />
                  </span>
                  <span>
                    <span className="block font-semibold text-slate-900">
                      {alert.title}
                    </span>
                    <span className="text-sm leading-6 text-slate-500">
                      {alert.message}
                    </span>
                  </span>
                </button>
              ))}
              {!alerts.length && <p className="text-sm text-slate-500">No alerts found.</p>}
            </div>
          )}

          {drawer === "zones" && (
            <div className="space-y-3">
              {zoneSummaries.map((zone) => (
                <div key={`drawer-${zone.name}`} className="rounded-xl border border-slate-200 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="font-semibold text-slate-950">{zone.name}</p>
                      <p className="text-sm text-slate-500">
                        {zone.count} tools, {zone.maintenance} in maintenance, {zone.missing} missing
                      </p>
                    </div>
                    <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                      Capacity {zone.capacity}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {["timeline", "activity"].includes(drawer) && (
            <div className="space-y-3">
              {visibleActivityRows.map((row) => (
                <button
                  type="button"
                  key={`drawer-${row.id}`}
                  onClick={() => {
                    const tool = enrichedTools.find((item) => item.name === row.toolName);
                    if (tool) selectTool(tool, `${tool.name} selected from timeline.`);
                    setDrawer(null);
                  }}
                  className="flex w-full items-start gap-3 rounded-xl border border-slate-200 p-3 text-left transition hover:bg-slate-50"
                >
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-blue-50 text-blue-700">
                    <row.icon size={16} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold text-slate-950">{row.title}</span>
                    <span className="block text-sm text-slate-500">
                      {row.toolName} | {row.from} to {row.to}
                    </span>
                    <span className="mt-1 block text-xs text-slate-400">
                      {formatShortDateTime(row.time)} | {row.by}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          )}

          {drawer === "history" && (
            <div className="space-y-3">
              {selectedHistory.map((row) => (
                <div key={`history-${row.id}`} className="rounded-xl border border-slate-200 p-4">
                  <div className="flex items-start gap-3">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-slate-100 text-slate-700">
                      <row.icon size={16} />
                    </span>
                    <span>
                      <span className="block font-semibold text-slate-950">{row.title}</span>
                      <span className="text-sm text-slate-500">
                        {row.from} to {row.to}
                      </span>
                      <span className="mt-1 block text-xs text-slate-400">
                        {formatShortDateTime(row.time)} | {row.by}
                      </span>
                    </span>
                  </div>
                </div>
              ))}
              {!selectedHistory.length && (
                <p className="rounded-xl border border-dashed border-slate-200 p-5 text-center text-sm text-slate-500">
                  No movement history found for this tool.
                </p>
              )}
            </div>
          )}
        </Drawer>
      )}
    </div>
  );
}
