const TOOL_EMPLOYEES_STORAGE_KEY = "toolEmployees";

const nowIso = () => new Date().toISOString();

const seedEmployees = [
  {
    id: "EMP001",
    employee_code: "EMP001",
    name: "John Doe",
    gender: "Male",
    date_of_birth: "1990-05-12",
    phone: "9876543210",
    email: "john.doe@email.com",
    address: "123, Green Street, New York, USA - 10001",
    department: "Operations",
    designation: "Technician",
    role: "Technician",
    joining_date: "2024-01-15",
    location: "Site A",
    manager_id: "EMP002",
    username: "john.doe",
    password: "",
    roleAccess: "Employee",
    status: "Active",
    notes: "Primary technician for Site A tool coordination.",
    created_at: "2024-01-15T09:00:00.000Z",
    updated_at: "2024-01-15T09:00:00.000Z",
  },
  {
    id: "EMP002",
    employee_code: "EMP002",
    name: "Jane Smith",
    gender: "Female",
    date_of_birth: "1988-09-21",
    phone: "9123456780",
    email: "jane.smith@email.com",
    address: "48, Park Avenue, Bengaluru, India - 560001",
    department: "Maintenance",
    designation: "Supervisor",
    role: "Supervisor",
    joining_date: "2024-02-10",
    location: "Site B",
    manager_id: "",
    username: "jane.smith",
    password: "",
    roleAccess: "Manager",
    status: "Active",
    notes: "Supervises maintenance planning and tool condition checks.",
    created_at: "2024-02-10T09:00:00.000Z",
    updated_at: "2024-02-10T09:00:00.000Z",
  },
  {
    id: "EMP003",
    employee_code: "EMP003",
    name: "Mike Johnson",
    gender: "Male",
    date_of_birth: "1992-03-08",
    phone: "9988776655",
    email: "mike.j@email.com",
    address: "77, Tech Park Road, Hyderabad, India - 500081",
    department: "IT",
    designation: "System Admin",
    role: "System Admin",
    joining_date: "2024-03-05",
    location: "Head Office",
    manager_id: "EMP002",
    username: "mike.johnson",
    password: "",
    roleAccess: "Admin",
    status: "Active",
    notes: "Owns admin access and asset system support.",
    created_at: "2024-03-05T09:00:00.000Z",
    updated_at: "2024-03-05T09:00:00.000Z",
  },
  {
    id: "EMP004",
    employee_code: "EMP004",
    name: "Sarah Wilson",
    gender: "Female",
    date_of_birth: "1991-07-17",
    phone: "8899776655",
    email: "sarah.w@email.com",
    address: "22, Industrial Area, Chennai, India - 600032",
    department: "Operations",
    designation: "Engineer",
    role: "Engineer",
    joining_date: "2024-03-18",
    location: "Site C",
    manager_id: "EMP002",
    username: "sarah.wilson",
    password: "",
    roleAccess: "Employee",
    status: "Inactive",
    notes: "Inactive for current field assignment cycle.",
    created_at: "2024-03-18T09:00:00.000Z",
    updated_at: "2024-03-18T09:00:00.000Z",
  },
  {
    id: "EMP005",
    employee_code: "EMP005",
    name: "David Brown",
    gender: "Male",
    date_of_birth: "1989-11-02",
    phone: "7766554433",
    email: "david.b@email.com",
    address: "9, Warehouse Lane, Pune, India - 411001",
    department: "Maintenance",
    designation: "Technician",
    role: "Technician",
    joining_date: "2024-04-22",
    location: "Site A",
    manager_id: "EMP002",
    username: "david.brown",
    password: "",
    roleAccess: "Employee",
    status: "Active",
    notes: "Supports returned tool inspection and storage.",
    created_at: "2024-04-22T09:00:00.000Z",
    updated_at: "2024-04-22T09:00:00.000Z",
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

export const generateNextEmployeeCode = (employees = []) => {
  const maxNumber = (Array.isArray(employees) ? employees : []).reduce(
    (max, employee) => {
      const candidate =
        employee?.employee_code ?? employee?.employeeCode ?? employee?.id ?? "";
      const match = /^EMP-?(\d+)$/i.exec(String(candidate).trim());
      if (!match) return max;
      return Math.max(max, Number(match[1]));
    },
    0
  );
  return `EMP${String(maxNumber + 1).padStart(3, "0")}`;
};

const normalizeStatus = (status) => {
  const value = String(status ?? "").trim();
  if (!value || value === "RTO (Return to Office)" || value === "New Employee") {
    return "Active";
  }
  return value;
};

const normalizeEmployee = (employee = {}, index = 0) => {
  const code =
    String(
      employee.employee_code ??
        employee.employeeCode ??
        employee.id ??
        `EMP${String(index + 1).padStart(3, "0")}`
    ).trim() || `EMP${String(index + 1).padStart(3, "0")}`;
  const createdAt = employee.created_at ?? employee.createdAt ?? nowIso();
  const updatedAt = employee.updated_at ?? employee.updatedAt ?? createdAt;
  const designation = employee.designation ?? employee.role ?? "";

  return {
    ...employee,
    id: code,
    employee_code: code,
    name: String(employee.name ?? employee.fullName ?? "").trim(),
    gender: employee.gender ?? "",
    date_of_birth: employee.date_of_birth ?? employee.dateOfBirth ?? "",
    phone: employee.phone ?? "",
    email: employee.email ?? "",
    address: employee.address ?? "",
    department: employee.department ?? "",
    designation,
    role: designation,
    joining_date: employee.joining_date ?? employee.joiningDate ?? "",
    location: employee.location ?? employee.workLocation ?? "",
    manager_id: employee.manager_id ?? employee.managerId ?? "",
    username: employee.username ?? "",
    password: employee.password ?? "",
    roleAccess: employee.roleAccess ?? employee.role_access ?? "Employee",
    status: normalizeStatus(employee.status),
    notes: employee.notes ?? "",
    created_at: createdAt,
    updated_at: updatedAt,
  };
};

const ensureSeeded = () => {
  if (typeof window === "undefined") return;
  const existingEmployees = readList();
  if (!existingEmployees.length) {
    writeList(seedEmployees.map(normalizeEmployee));
    return;
  }

  const normalizedEmployees = existingEmployees.map(normalizeEmployee);
  const hasChanges =
    JSON.stringify(normalizedEmployees) !== JSON.stringify(existingEmployees);
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
