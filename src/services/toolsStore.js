const TOOL_STORAGE_KEY = "tools";
const ASSIGNMENT_STORAGE_KEY = "toolAssignments";
const MAINTENANCE_STORAGE_KEY = "toolMaintenance";

const seedTools = [
  {
    id: "TL-211",
    name: "Bosch Cordless Drill",
    type: "Drill",
    serialNumber: "BCD123456",
    purchaseDate: "2025-01-15",
    baseLocation: "ISRO TVM/DRLM",
    condition: "Good",
    notes: "Rechargeable cordless power drill",
    imageUrl: "drilling_mechine.png",
  },
  {
    id: "TL-202",
    name: "Angle Grinder",
    type: "Grinder",
    serialNumber: "AG-99812",
    purchaseDate: "2024-11-03",
    baseLocation: "ISRO TVM/DRLM",
    condition: "Good",
    notes: "Safety guard replaced in Nov 2025",
    imageUrl: "Angle-Grinder.png",
  },
  {
    id: "TL-203",
    name: "Laser Level",
    type: "Measurement",
    serialNumber: "LL-55221",
    purchaseDate: "2024-08-18",
    baseLocation: "Site A",
    condition: "Repair Needed",
    notes: "Calibration due",
    imageUrl: "Laser-level.png",
  },
  {
    id: "TL-204",
    name: "Digital Caliper",
    type: "Measurement",
    serialNumber: "DC-12045",
    purchaseDate: "2023-12-09",
    baseLocation: "Warehouse 1",
    condition: "Good",
    notes: "Stored in protective case",
    imageUrl: "Digital-Caliper.png",
  },
  {
    id: "TL-205",
    name: "Multi-Meter",
    type: "Electrical",
    serialNumber: "MM-77531",
    purchaseDate: "2024-02-26",
    baseLocation: "ISRO TVM/DRLM",
    condition: "Good",
    notes: "Battery replaced Feb 2026",
    imageUrl: "Multi-Meter.png",
  },
  {
    id: "TL-206",
    name: "Rotary Hammer",
    type: "Drill",
    serialNumber: "RH-44217",
    purchaseDate: "2025-07-22",
    baseLocation: "Site B",
    condition: "Damaged",
    notes: "Chuck assembly needs inspection",
    imageUrl: "Rotary-Hammer.png",
  },
];

const seedAssignments = [
  {
    id: "TA-1001",
    toolId: "TL-211",
    assignedTo: "John Smith",
    checkoutDate: "2026-03-01",
    expectedReturnDate: "2026-03-15",
    actualReturnDate: null,
  },
  {
    id: "TA-1002",
    toolId: "TL-205",
    assignedTo: "Maya Patel",
    checkoutDate: "2026-03-05",
    expectedReturnDate: "2026-03-12",
    actualReturnDate: null,
  },
  {
    id: "TA-0989",
    toolId: "TL-202",
    assignedTo: "Operations Team",
    checkoutDate: "2026-02-04",
    expectedReturnDate: "2026-02-09",
    actualReturnDate: "2026-02-08",
  },
];

const seedMaintenance = [
  {
    id: "TM-501",
    toolId: "TL-203",
    issue: "Laser calibration drift",
    reportedDate: "2026-02-20",
    resolvedDate: null,
    status: "In Progress",
    cost: 1200,
  },
  {
    id: "TM-488",
    toolId: "TL-204",
    issue: "Battery contact replacement",
    reportedDate: "2025-11-12",
    resolvedDate: "2025-11-18",
    status: "Completed",
    cost: 350,
  },
];

const readList = (key) => {
  if (typeof window === "undefined") {
    return [];
  }
  try {
    const raw = localStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const writeList = (key, list) => {
  if (typeof window === "undefined") {
    return;
  }
  localStorage.setItem(key, JSON.stringify(Array.isArray(list) ? list : []));
};

const ensureSeeded = () => {
  if (typeof window === "undefined") {
    return;
  }
  const tools = readList(TOOL_STORAGE_KEY);
  const assignments = readList(ASSIGNMENT_STORAGE_KEY);
  const maintenance = readList(MAINTENANCE_STORAGE_KEY);

  if (!tools.length) {
    writeList(TOOL_STORAGE_KEY, seedTools);
  } else {
    // Patch existing stored tools to include missing fields from seed data (e.g., imageUrl)
    const seedMap = new Map(seedTools.map((tool) => [tool.id, tool]));
    const patchedTools = tools.map((tool) => {
      if (!tool.imageUrl && seedMap.has(tool.id)) {
        return { ...tool, imageUrl: seedMap.get(tool.id).imageUrl };
      }
      return tool;
    });
    if (patchedTools.some((tool, idx) => tool !== tools[idx])) {
      writeList(TOOL_STORAGE_KEY, patchedTools);
    }
  }

  if (!assignments.length) {
    writeList(ASSIGNMENT_STORAGE_KEY, seedAssignments);
  }
  if (!maintenance.length) {
    writeList(MAINTENANCE_STORAGE_KEY, seedMaintenance);
  }
};

export const getTools = () => {
  ensureSeeded();
  return readList(TOOL_STORAGE_KEY);
};

export const setTools = (tools) => {
  writeList(TOOL_STORAGE_KEY, tools);
};

export const getToolAssignments = () => {
  ensureSeeded();
  return readList(ASSIGNMENT_STORAGE_KEY);
};

export const setToolAssignments = (assignments) => {
  writeList(ASSIGNMENT_STORAGE_KEY, assignments);
};

export const getToolMaintenance = () => {
  ensureSeeded();
  return readList(MAINTENANCE_STORAGE_KEY);
};

export const setToolMaintenance = (maintenance) => {
  writeList(MAINTENANCE_STORAGE_KEY, maintenance);
};
