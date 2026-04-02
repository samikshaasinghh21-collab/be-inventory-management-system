const TOOL_EMPLOYEES_STORAGE_KEY = "toolEmployees";

const seedEmployees = [
  {
    id: "EMP-101",
    name: "Aarav Menon",
    role: "Site Engineer",
    department: "Projects",
    location: "Bengaluru",
    email: "aarav.menon@example.com",
    phone: "+91 98765 21001",
    status: "Active",
    notes: "Handles on-site tool coordination.",
  },
  {
    id: "EMP-102",
    name: "Nisha Rao",
    role: "Maintenance Lead",
    department: "Operations",
    location: "Chennai",
    email: "nisha.rao@example.com",
    phone: "+91 98765 21002",
    status: "Active",
    notes: "Supervises maintenance planning and inspections.",
  },
  {
    id: "EMP-103",
    name: "Kabir Shah",
    role: "Field Technician",
    department: "Service",
    location: "Hyderabad",
    email: "kabir.shah@example.com",
    phone: "+91 98765 21003",
    status: "Inactive",
    notes: "Currently not available for field allocation.",
  },
];

const readList = () => {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(TOOL_EMPLOYEES_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const writeList = (list) => {
  if (typeof window === "undefined") return;
  localStorage.setItem(
    TOOL_EMPLOYEES_STORAGE_KEY,
    JSON.stringify(Array.isArray(list) ? list : [])
  );
};

const normalizeEmployee = (employee = {}) => {
  const status =
    String(employee.status ?? "").trim() === "New Employee"
      ? "RTO (Return to Office)"
      : employee.status;
  return {
    ...employee,
    status,
  };
};

const ensureSeeded = () => {
  if (typeof window === "undefined") return;
  const existingEmployees = readList();
  if (!existingEmployees.length) {
    writeList(seedEmployees);
    return;
  }
  const normalizedEmployees = existingEmployees.map(normalizeEmployee);
  const hasChanges = normalizedEmployees.some(
    (employee, index) =>
      employee.status !== existingEmployees[index]?.status
  );
  if (hasChanges) {
    writeList(normalizedEmployees);
  }
};

export const getToolEmployees = () => {
  ensureSeeded();
  return readList().map(normalizeEmployee);
};

export const setToolEmployees = (employees) => {
  writeList((Array.isArray(employees) ? employees : []).map(normalizeEmployee));
};
