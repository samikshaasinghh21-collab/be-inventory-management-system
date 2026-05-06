import { useMemo, useRef, useState } from "react";
import DateInput from "../components/common/DateInput";
import AppIcon from "../components/layout/AppIcon";
import {
  generateNextEmployeeCode,
  getToolEmployees,
  setToolEmployees,
} from "../services/toolEmployeesStore";
import {
  getToolAssignments,
  getTools,
  setToolAssignments,
} from "../services/toolsStore";

const PAGE_SIZE = 5;

const inputClass =
  "mt-1 h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-50 disabled:text-slate-500";
const textareaClass =
  "mt-1 min-h-[72px] w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-50 disabled:text-slate-500";
const labelClass = "text-[11px] font-semibold text-slate-700";

const DEPARTMENTS = ["Operations", "Maintenance", "IT", "Projects", "Service"];
const DESIGNATIONS = [
  "Technician",
  "Supervisor",
  "System Admin",
  "Engineer",
  "Manager",
];
const LOCATIONS = ["Site A", "Site B", "Site C", "Head Office", "Warehouse 1"];
const GENDERS = ["Male", "Female", "Other"];
const ROLE_ACCESS = ["Admin", "Manager", "Employee"];

const todayIso = () => new Date().toISOString().slice(0, 10);

const nowIso = () => new Date().toISOString();

const createId = (prefix) =>
  `${prefix}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;

const formatDate = (value) => {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(parsed);
};

const normalizeText = (value) => String(value ?? "").trim();

const buildAddForm = (employees = []) => ({
  codeMode: "auto",
  employee_code: generateNextEmployeeCode(employees),
  name: "",
  gender: "",
  date_of_birth: "",
  phone: "",
  email: "",
  address: "",
  department: "",
  designation: "",
  joining_date: "",
  location: "",
  manager_id: "",
  username: "",
  password: "",
  roleAccess: "Employee",
  status: "Active",
});

const buildFormFromEmployee = (employee = {}) => ({
  employee_code: employee.employee_code || employee.id || "",
  name: employee.name || "",
  gender: employee.gender || "",
  date_of_birth: employee.date_of_birth || "",
  phone: employee.phone || "",
  email: employee.email || "",
  address: employee.address || "",
  department: employee.department || "",
  designation: employee.designation || employee.role || "",
  joining_date: employee.joining_date || "",
  location: employee.location || "",
  manager_id: employee.manager_id || "",
  username: employee.username || "",
  password: employee.password || "",
  roleAccess: employee.roleAccess || "Employee",
  status: employee.status || "Active",
});

const statusBadgeClass = (status) =>
  String(status || "").toLowerCase() === "active"
    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
    : "border-red-200 bg-red-50 text-red-700";

const getInitials = (name = "") =>
  String(name)
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || "")
    .join("") || "EM";

const getManagerName = (employee, employees) => {
  if (!employee?.manager_id) return "-";
  return (
    employees.find(
      (record) => String(record.id) === String(employee.manager_id)
    )?.name || "-"
  );
};

const uniqueOptions = (baseOptions, employees, field) =>
  Array.from(
    new Set([
      ...baseOptions,
      ...employees.map((employee) => employee[field]).filter(Boolean),
    ])
  ).sort((a, b) => String(a).localeCompare(String(b)));

const fieldError = (errors, field) =>
  errors[field] ? (
    <p className="mt-1 text-[11px] font-medium text-red-600">{errors[field]}</p>
  ) : null;

const SectionTitle = ({ color = "blue", icon = "grid", title }) => {
  const colorClass = {
    blue: "bg-blue-50 text-blue-700",
    green: "bg-emerald-50 text-emerald-700",
    orange: "bg-orange-50 text-orange-700",
    purple: "bg-violet-50 text-violet-700",
  }[color];

  return (
    <div className="mb-3 flex items-center gap-2">
      <span
        className={`inline-flex h-7 w-7 items-center justify-center rounded-md ${colorClass}`}
      >
        <AppIcon name={icon} className="h-4 w-4" />
      </span>
      <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
    </div>
  );
};

const ActionButton = ({ color = "blue", icon, label, onClick }) => {
  const colorClass = {
    blue: "text-blue-600 hover:bg-blue-50",
    red: "text-red-600 hover:bg-red-50",
    slate: "text-slate-600 hover:bg-slate-50",
  }[color];

  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className={`inline-flex h-8 w-8 items-center justify-center rounded-md transition ${colorClass}`}
    >
      <AppIcon name={icon} className="h-4 w-4" />
    </button>
  );
};

const EmployeeAvatar = ({ employee, size = "md" }) => {
  const sizeClass = size === "lg" ? "h-20 w-20 text-xl" : "h-8 w-8 text-xs";
  return (
    <span
      className={`${sizeClass} inline-flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-sky-100 to-blue-600 font-bold text-white shadow-sm`}
    >
      {getInitials(employee?.name)}
    </span>
  );
};

const StatusToggle = ({ checked, onChange }) => (
  <button
    type="button"
    onClick={() => onChange(checked ? "Inactive" : "Active")}
    className={`relative inline-flex h-6 w-11 items-center rounded-full transition ${
      checked ? "bg-emerald-500" : "bg-slate-300"
    }`}
    aria-label="Toggle employee status"
  >
    <span
      className={`inline-block h-5 w-5 rounded-full bg-white shadow transition ${
        checked ? "translate-x-5" : "translate-x-1"
      }`}
    />
  </button>
);

const ToolsEmployees = () => {
  const [employees, setEmployees] = useState(() => getToolEmployees());
  const [tools] = useState(() => getTools());
  const [assignments, setAssignmentsState] = useState(() => getToolAssignments());
  const [searchQuery, setSearchQuery] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [locationFilter, setLocationFilter] = useState("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState(
    () => getToolEmployees()[0]?.id || ""
  );
  const [detailTab, setDetailTab] = useState("profile");
  const [addForm, setAddForm] = useState(() => buildAddForm(getToolEmployees()));
  const [editForm, setEditForm] = useState(() =>
    buildFormFromEmployee(getToolEmployees()[0] || {})
  );
  const [addErrors, setAddErrors] = useState({});
  const [editErrors, setEditErrors] = useState({});
  const [message, setMessage] = useState(null);
  const [assignForm, setAssignForm] = useState({
    toolId: "",
    issueDate: todayIso(),
    expectedReturnDate: "",
    conditionCheck: "Good",
  });
  const [assignError, setAssignError] = useState("");
  const addFormRef = useRef(null);

  const selectedEmployee = useMemo(
    () =>
      employees.find(
        (employee) => String(employee.id) === String(selectedEmployeeId)
      ) ||
      employees[0] ||
      null,
    [employees, selectedEmployeeId]
  );

  const toolsById = useMemo(
    () => new Map(tools.map((tool) => [tool.id, tool])),
    [tools]
  );

  const departmentOptions = useMemo(
    () => uniqueOptions(DEPARTMENTS, employees, "department"),
    [employees]
  );
  const designationOptions = useMemo(
    () => uniqueOptions(DESIGNATIONS, employees, "designation"),
    [employees]
  );
  const locationOptions = useMemo(
    () => uniqueOptions(LOCATIONS, employees, "location"),
    [employees]
  );

  const filteredEmployees = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return employees.filter((employee) => {
      if (
        departmentFilter !== "all" &&
        employee.department !== departmentFilter
      ) {
        return false;
      }
      if (statusFilter !== "all" && employee.status !== statusFilter) {
        return false;
      }
      if (locationFilter !== "all" && employee.location !== locationFilter) {
        return false;
      }
      if (!query) return true;

      return [employee.name, employee.phone, employee.employee_code]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query));
    });
  }, [departmentFilter, employees, locationFilter, searchQuery, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredEmployees.length / PAGE_SIZE));
  const safeCurrentPage = Math.min(currentPage, totalPages);

  const pagedEmployees = useMemo(() => {
    const startIndex = (safeCurrentPage - 1) * PAGE_SIZE;
    return filteredEmployees.slice(startIndex, startIndex + PAGE_SIZE);
  }, [safeCurrentPage, filteredEmployees]);

  const employeeAssignments = useMemo(() => {
    if (!selectedEmployee) return [];
    const selectedName = String(selectedEmployee.name || "").trim().toLowerCase();
    return assignments
      .filter((assignment) => {
        const byId =
          String(assignment.employeeId || "") === String(selectedEmployee.id);
        const byName =
          String(assignment.assignedTo || "").trim().toLowerCase() ===
          selectedName;
        return byId || byName;
      })
      .map((assignment) => ({
        ...assignment,
        tool: toolsById.get(assignment.toolId) || null,
      }))
      .sort((a, b) =>
        String(b.checkoutDate || "").localeCompare(String(a.checkoutDate || ""))
      );
  }, [assignments, selectedEmployee, toolsById]);

  const activeAssignments = useMemo(
    () => employeeAssignments.filter((assignment) => !assignment.actualReturnDate),
    [employeeAssignments]
  );

  const returnedAssignments = useMemo(
    () => employeeAssignments.filter((assignment) => assignment.actualReturnDate),
    [employeeAssignments]
  );

  const unavailableToolIds = useMemo(
    () =>
      new Set(
        assignments
          .filter((assignment) => !assignment.actualReturnDate)
          .map((assignment) => assignment.toolId)
      ),
    [assignments]
  );

  const availableTools = useMemo(
    () => tools.filter((tool) => !unavailableToolIds.has(tool.id)),
    [tools, unavailableToolIds]
  );

  const effectiveAssignToolId =
    assignForm.toolId && availableTools.some((tool) => tool.id === assignForm.toolId)
      ? assignForm.toolId
      : availableTools[0]?.id || "";

  const showMessage = (type, text) => {
    setMessage({ type, text });
  };

  const persistEmployees = (nextEmployees) => {
    setEmployees(nextEmployees);
    setToolEmployees(nextEmployees);
  };

  const updateAddField = (field, value) => {
    setAddForm((current) => ({
      ...current,
      [field]: value,
      ...(field === "codeMode" && value === "auto"
        ? { employee_code: generateNextEmployeeCode(employees) }
        : {}),
    }));
  };

  const updateEditField = (field, value) => {
    setEditForm((current) => ({ ...current, [field]: value }));
  };

  const validateEmployeeForm = (form, currentEmployeeId = "") => {
    const nextErrors = {};
    const employeeCode = normalizeText(form.employee_code);
    const phone = normalizeText(form.phone);
    const email = normalizeText(form.email);

    if (!normalizeText(form.name)) nextErrors.name = "Full name is required.";
    if (!employeeCode) nextErrors.employee_code = "Employee code is required.";
    if (!normalizeText(form.gender)) nextErrors.gender = "Gender is required.";
    if (!normalizeText(form.date_of_birth)) {
      nextErrors.date_of_birth = "Date of birth is required.";
    }
    if (!phone) nextErrors.phone = "Phone number is required.";
    if (phone && !/^[+()\-\s\d]{7,18}$/.test(phone)) {
      nextErrors.phone = "Enter a valid phone number.";
    }
    if (!email) {
      nextErrors.email = "Email is required.";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      nextErrors.email = "Enter a valid email address.";
    }
    if (!normalizeText(form.address)) nextErrors.address = "Address is required.";
    if (!normalizeText(form.department)) {
      nextErrors.department = "Department is required.";
    }
    if (!normalizeText(form.designation)) {
      nextErrors.designation = "Designation is required.";
    }
    if (!normalizeText(form.joining_date)) {
      nextErrors.joining_date = "Joining date is required.";
    }
    if (!normalizeText(form.location)) {
      nextErrors.location = "Work location is required.";
    }
    if (!normalizeText(form.roleAccess)) {
      nextErrors.roleAccess = "Role access is required.";
    }

    const duplicate = employees.some((employee) => {
      const sameEmployee = String(employee.id) === String(currentEmployeeId);
      if (sameEmployee) return false;
      return (
        String(employee.employee_code || employee.id).toLowerCase() ===
        employeeCode.toLowerCase()
      );
    });
    if (duplicate) {
      nextErrors.employee_code = "Employee code must be unique.";
    }

    return nextErrors;
  };

  const sanitizeEmployeePayload = (form, existing = {}) => {
    const code = normalizeText(form.employee_code);
    const timestamp = nowIso();
    return {
      ...existing,
      id: code,
      employee_code: code,
      name: normalizeText(form.name),
      gender: normalizeText(form.gender),
      date_of_birth: normalizeText(form.date_of_birth),
      phone: normalizeText(form.phone),
      email: normalizeText(form.email),
      address: normalizeText(form.address),
      department: normalizeText(form.department),
      designation: normalizeText(form.designation),
      role: normalizeText(form.designation),
      joining_date: normalizeText(form.joining_date),
      location: normalizeText(form.location),
      manager_id: normalizeText(form.manager_id),
      username: normalizeText(form.username),
      password: form.password || "",
      roleAccess: normalizeText(form.roleAccess) || "Employee",
      status: form.status === "Inactive" ? "Inactive" : "Active",
      notes: existing.notes || "",
      created_at: existing.created_at || timestamp,
      updated_at: timestamp,
    };
  };

  const resetAddForm = (nextEmployees = employees) => {
    setAddForm(buildAddForm(nextEmployees));
    setAddErrors({});
  };

  const handleCreateEmployee = (event) => {
    event.preventDefault();
    const form =
      addForm.codeMode === "auto"
        ? { ...addForm, employee_code: generateNextEmployeeCode(employees) }
        : addForm;
    const nextErrors = validateEmployeeForm(form);
    setAddErrors(nextErrors);
    if (Object.keys(nextErrors).length) {
      showMessage("error", "Please fix the highlighted employee fields.");
      return;
    }

    const createdEmployee = sanitizeEmployeePayload(form);
    const nextEmployees = [createdEmployee, ...employees];
    persistEmployees(nextEmployees);
    setSelectedEmployeeId(createdEmployee.id);
    setEditForm(buildFormFromEmployee(createdEmployee));
    resetAddForm(nextEmployees);
    showMessage("success", "Employee created successfully.");
  };

  const handleUpdateEmployee = (event) => {
    event.preventDefault();
    if (!selectedEmployee) return;

    const nextErrors = validateEmployeeForm(editForm, selectedEmployee.id);
    setEditErrors(nextErrors);
    if (Object.keys(nextErrors).length) {
      showMessage("error", "Please fix the highlighted employee fields.");
      return;
    }

    const updatedEmployee = sanitizeEmployeePayload(editForm, selectedEmployee);
    const nextEmployees = employees.map((employee) =>
      employee.id === selectedEmployee.id ? updatedEmployee : employee
    );
    persistEmployees(nextEmployees);

    const previousName = String(selectedEmployee.name || "").trim().toLowerCase();
    const nextAssignments = assignments.map((assignment) => {
      const matchesEmployee =
        String(assignment.employeeId || "") === String(selectedEmployee.id) ||
        String(assignment.assignedTo || "").trim().toLowerCase() === previousName;
      if (!matchesEmployee) return assignment;
      return {
        ...assignment,
        employeeId: updatedEmployee.id,
        assignedTo: updatedEmployee.name,
      };
    });
    setAssignmentsState(nextAssignments);
    setToolAssignments(nextAssignments);
    setSelectedEmployeeId(updatedEmployee.id);
    setEditForm(buildFormFromEmployee(updatedEmployee));
    showMessage("success", "Employee updated successfully.");
  };

  const handleDeleteEmployee = (employee) => {
    if (!employee) return;
    const confirmed = window.confirm(
      `Delete employee ${employee.name || employee.employee_code}? Tool history will remain in the assignment log.`
    );
    if (!confirmed) return;

    const nextEmployees = employees.filter((record) => record.id !== employee.id);
    const nextSelectedEmployee = nextEmployees[0] || null;
    persistEmployees(nextEmployees);
    setSelectedEmployeeId(nextSelectedEmployee?.id || "");
    setEditForm(buildFormFromEmployee(nextSelectedEmployee || {}));
    showMessage("success", "Employee deleted successfully.");
  };

  const handleResetFilters = () => {
    setSearchQuery("");
    setDepartmentFilter("all");
    setStatusFilter("all");
    setLocationFilter("all");
    setCurrentPage(1);
  };

  const handleSelectEmployee = (employee, tab = "profile") => {
    setSelectedEmployeeId(employee.id);
    setEditForm(buildFormFromEmployee(employee));
    setEditErrors({});
    setDetailTab(tab);
  };

  const handleJumpToAdd = () => {
    addFormRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const handleAssignTool = (event) => {
    event.preventDefault();
    if (!selectedEmployee) {
      setAssignError("Select an employee first.");
      return;
    }
    if (!effectiveAssignToolId) {
      setAssignError("Please select a tool.");
      return;
    }
    if (!assignForm.issueDate) {
      setAssignError("Issue date is required.");
      return;
    }

    const tool = toolsById.get(effectiveAssignToolId);
    const createdAssignment = {
      id: createId("TA"),
      toolId: effectiveAssignToolId,
      employeeId: selectedEmployee.id,
      assignedTo: selectedEmployee.name,
      toolSerialNumber: tool?.serialNumber || "",
      checkoutDate: assignForm.issueDate,
      expectedReturnDate: assignForm.expectedReturnDate || null,
      actualReturnDate: null,
      conditionCheck: assignForm.conditionCheck,
    };

    const nextAssignments = [createdAssignment, ...assignments];
    setAssignmentsState(nextAssignments);
    setToolAssignments(nextAssignments);
    setAssignForm({
      toolId:
        availableTools.find((record) => record.id !== effectiveAssignToolId)?.id || "",
      issueDate: todayIso(),
      expectedReturnDate: "",
      conditionCheck: "Good",
    });
    setAssignError("");
    showMessage("success", "Tool assigned successfully.");
  };

  const handleReturnTool = (assignmentId) => {
    const nextAssignments = assignments.map((assignment) =>
      assignment.id === assignmentId
        ? { ...assignment, actualReturnDate: todayIso() }
        : assignment
    );
    setAssignmentsState(nextAssignments);
    setToolAssignments(nextAssignments);
    showMessage("success", "Tool return recorded successfully.");
  };

  const startCount =
    filteredEmployees.length === 0 ? 0 : (safeCurrentPage - 1) * PAGE_SIZE + 1;
  const endCount = Math.min(safeCurrentPage * PAGE_SIZE, filteredEmployees.length);

  return (
    <div className="min-h-screen bg-slate-50 p-3 text-slate-900 md:p-5">
      <div className="space-y-4">
        {message && (
          <div
            className={`flex items-center justify-between rounded-md border px-4 py-3 text-sm shadow-sm ${
              message.type === "success"
                ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                : "border-red-200 bg-red-50 text-red-800"
            }`}
          >
            <div className="flex items-center gap-2">
              <AppIcon
                name={message.type === "success" ? "activity" : "x"}
                className="h-4 w-4"
              />
              <span className="font-medium">{message.text}</span>
            </div>
            <button
              type="button"
              onClick={() => setMessage(null)}
              className="rounded-md p-1 hover:bg-white/70"
              aria-label="Dismiss message"
            >
              <AppIcon name="x" className="h-4 w-4" />
            </button>
          </div>
        )}

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(430px,0.85fr)]">
          <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
            <div className="flex flex-col gap-4 border-b border-slate-100 px-5 py-4 md:flex-row md:items-start md:justify-between">
              <div>
                <h1 className="text-2xl font-bold tracking-tight text-slate-950">
                  Employee Management
                </h1>
                <p className="mt-1 text-sm text-slate-500">
                  Manage all employees in your organization.
                </p>
              </div>
              <button
                type="button"
                onClick={handleJumpToAdd}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-blue-600 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700"
              >
                <AppIcon name="plus" className="h-4 w-4" />
                Add New Employee
              </button>
            </div>

            <div className="space-y-4 px-5 py-4">
              <div className="grid gap-3 lg:grid-cols-[minmax(220px,1.5fr)_minmax(150px,0.8fr)_minmax(150px,0.8fr)_minmax(150px,0.8fr)_auto]">
                <div className="relative">
                  <AppIcon
                    name="search"
                    className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
                  />
                  <input
                    value={searchQuery}
                    onChange={(event) => {
                      setSearchQuery(event.target.value);
                      setCurrentPage(1);
                    }}
                    placeholder="Search by name or phone number..."
                    className="h-10 w-full rounded-md border border-slate-200 bg-white pl-10 pr-3 text-sm text-slate-700 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-slate-700">
                    Department
                  </label>
                  <select
                    value={departmentFilter}
                    onChange={(event) => {
                      setDepartmentFilter(event.target.value);
                      setCurrentPage(1);
                    }}
                    className="mt-1 h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none"
                  >
                    <option value="all">All Departments</option>
                    {departmentOptions.map((department) => (
                      <option key={department} value={department}>
                        {department}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-slate-700">
                    Status
                  </label>
                  <select
                    value={statusFilter}
                    onChange={(event) => {
                      setStatusFilter(event.target.value);
                      setCurrentPage(1);
                    }}
                    className="mt-1 h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none"
                  >
                    <option value="all">All Status</option>
                    <option value="Active">Active</option>
                    <option value="Inactive">Inactive</option>
                  </select>
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-slate-700">
                    Location / Site
                  </label>
                  <select
                    value={locationFilter}
                    onChange={(event) => {
                      setLocationFilter(event.target.value);
                      setCurrentPage(1);
                    }}
                    className="mt-1 h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none"
                  >
                    <option value="all">All Locations</option>
                    {locationOptions.map((location) => (
                      <option key={location} value={location}>
                        {location}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex items-end">
                  <button
                    type="button"
                    onClick={handleResetFilters}
                    className="h-10 rounded-md border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:border-slate-300"
                  >
                    Reset
                  </button>
                </div>
              </div>

              <div className="overflow-x-auto rounded-lg border border-slate-200">
                <table className="min-w-[1080px] w-full text-left text-xs">
                  <thead className="bg-slate-50 text-slate-700">
                    <tr>
                      <th className="px-4 py-3 font-bold">ID</th>
                      <th className="px-4 py-3 font-bold">Name</th>
                      <th className="px-4 py-3 font-bold">Phone Number</th>
                      <th className="px-4 py-3 font-bold">Email</th>
                      <th className="px-4 py-3 font-bold">Department</th>
                      <th className="px-4 py-3 font-bold">Designation / Role</th>
                      <th className="px-4 py-3 font-bold">Location / Site</th>
                      <th className="px-4 py-3 font-bold">Status</th>
                      <th className="px-4 py-3 font-bold">Joining Date</th>
                      <th className="px-4 py-3 font-bold">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {pagedEmployees.length === 0 && (
                      <tr>
                        <td
                          colSpan="10"
                          className="px-4 py-10 text-center text-sm text-slate-500"
                        >
                          No employees found.
                        </td>
                      </tr>
                    )}
                    {pagedEmployees.map((employee) => (
                      <tr
                        key={employee.id}
                        className={`transition hover:bg-slate-50 ${
                          selectedEmployee?.id === employee.id ? "bg-blue-50/50" : ""
                        }`}
                      >
                        <td className="px-4 py-3 font-bold text-slate-900">
                          {employee.employee_code}
                        </td>
                        <td className="px-4 py-3">
                          <button
                            type="button"
                            onClick={() => handleSelectEmployee(employee)}
                            className="flex items-center gap-2 text-left"
                          >
                            <EmployeeAvatar employee={employee} />
                            <span className="font-semibold text-slate-900">
                              {employee.name}
                            </span>
                          </button>
                        </td>
                        <td className="px-4 py-3 text-slate-700">{employee.phone}</td>
                        <td className="px-4 py-3 text-slate-700">{employee.email}</td>
                        <td className="px-4 py-3 text-slate-700">
                          {employee.department}
                        </td>
                        <td className="px-4 py-3 text-slate-700">
                          {employee.designation}
                        </td>
                        <td className="px-4 py-3 text-slate-700">{employee.location}</td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-bold ${statusBadgeClass(
                              employee.status
                            )}`}
                          >
                            {employee.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-slate-700">
                          {formatDate(employee.joining_date)}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1">
                            <ActionButton
                              icon="search"
                              label="View employee"
                              onClick={() => handleSelectEmployee(employee, "profile")}
                            />
                            <ActionButton
                              icon="edit"
                              label="Edit employee"
                              onClick={() => handleSelectEmployee(employee, "profile")}
                            />
                            <ActionButton
                              color="red"
                              icon="x"
                              label="Delete employee"
                              onClick={() => handleDeleteEmployee(employee)}
                            />
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex flex-col gap-3 text-sm text-slate-600 md:flex-row md:items-center md:justify-between">
                <span>
                  Showing {startCount} to {endCount} of {filteredEmployees.length} entries
                </span>
                <div className="flex items-center gap-2">
                  {Array.from({ length: totalPages }, (_, index) => index + 1).map(
                    (page) => (
                      <button
                        key={page}
                        type="button"
                        onClick={() => setCurrentPage(page)}
                        className={`h-9 min-w-9 rounded-md border px-3 text-sm font-semibold transition ${
                          safeCurrentPage === page
                            ? "border-blue-600 bg-blue-600 text-white"
                            : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
                        }`}
                      >
                        {page}
                      </button>
                    )
                  )}
                  <button
                    type="button"
                    onClick={() =>
                      setCurrentPage(Math.min(totalPages, safeCurrentPage + 1))
                    }
                    disabled={safeCurrentPage === totalPages}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-700 disabled:opacity-40"
                    aria-label="Next page"
                  >
                    <AppIcon name="chevron-right" className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          </section>

          <section
            ref={addFormRef}
            className="rounded-lg border border-slate-200 bg-white shadow-sm"
          >
            <form onSubmit={handleCreateEmployee}>
              <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
                <div className="flex items-center gap-3">
                  <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-blue-50 text-blue-600">
                    <AppIcon name="user" className="h-5 w-5" />
                  </span>
                  <div>
                    <h2 className="text-lg font-bold text-slate-950">
                      Add New Employee
                    </h2>
                    <p className="text-xs text-slate-500">Create a tool user profile.</p>
                  </div>
                </div>
              </div>

              <div className="grid gap-4 p-5 lg:grid-cols-2">
                <div className="rounded-lg border border-blue-100 bg-blue-50/20 p-4">
                  <SectionTitle icon="user" title="Basic Details" />
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="sm:col-span-2">
                      <label className={labelClass}>Full Name *</label>
                      <input
                        value={addForm.name}
                        onChange={(event) => updateAddField("name", event.target.value)}
                        placeholder="Enter full name"
                        className={inputClass}
                      />
                      {fieldError(addErrors, "name")}
                    </div>
                    <div>
                      <label className={labelClass}>Employee Code</label>
                      <div className="mt-2 flex items-center gap-4 text-xs text-slate-700">
                        {["auto", "manual"].map((mode) => (
                          <label key={mode} className="flex items-center gap-2">
                            <input
                              type="radio"
                              checked={addForm.codeMode === mode}
                              onChange={() => updateAddField("codeMode", mode)}
                              className="h-4 w-4 accent-blue-600"
                            />
                            {mode === "auto" ? "Auto" : "Manual"}
                          </label>
                        ))}
                      </div>
                    </div>
                    <div>
                      <label className={labelClass}>Generated / Manual Code *</label>
                      <input
                        value={addForm.employee_code}
                        onChange={(event) =>
                          updateAddField("employee_code", event.target.value)
                        }
                        readOnly={addForm.codeMode === "auto"}
                        className={inputClass}
                      />
                      {fieldError(addErrors, "employee_code")}
                    </div>
                    <div>
                      <label className={labelClass}>Gender *</label>
                      <select
                        value={addForm.gender}
                        onChange={(event) =>
                          updateAddField("gender", event.target.value)
                        }
                        className={inputClass}
                      >
                        <option value="">Select Gender</option>
                        {GENDERS.map((gender) => (
                          <option key={gender} value={gender}>
                            {gender}
                          </option>
                        ))}
                      </select>
                      {fieldError(addErrors, "gender")}
                    </div>
                    <div>
                      <label className={labelClass}>Date of Birth *</label>
                      <DateInput
                        value={addForm.date_of_birth}
                        onChange={(value) => updateAddField("date_of_birth", value)}
                        className={inputClass}
                      />
                      {fieldError(addErrors, "date_of_birth")}
                    </div>
                  </div>
                </div>

                <div className="rounded-lg border border-violet-100 bg-violet-50/20 p-4">
                  <SectionTitle color="purple" icon="contacts" title="Contact Details" />
                  <div className="grid gap-3">
                    <div>
                      <label className={labelClass}>Phone Number *</label>
                      <input
                        value={addForm.phone}
                        onChange={(event) => updateAddField("phone", event.target.value)}
                        placeholder="Enter phone number"
                        className={inputClass}
                      />
                      {fieldError(addErrors, "phone")}
                    </div>
                    <div>
                      <label className={labelClass}>Email *</label>
                      <input
                        type="email"
                        value={addForm.email}
                        onChange={(event) => updateAddField("email", event.target.value)}
                        placeholder="Enter email"
                        className={inputClass}
                      />
                      {fieldError(addErrors, "email")}
                    </div>
                    <div>
                      <label className={labelClass}>Address *</label>
                      <textarea
                        value={addForm.address}
                        onChange={(event) =>
                          updateAddField("address", event.target.value)
                        }
                        placeholder="Enter full address"
                        className={textareaClass}
                      />
                      {fieldError(addErrors, "address")}
                    </div>
                  </div>
                </div>

                <div className="rounded-lg border border-emerald-100 bg-emerald-50/20 p-4">
                  <SectionTitle color="green" icon="clipboard" title="Work Details" />
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <label className={labelClass}>Department *</label>
                      <select
                        value={addForm.department}
                        onChange={(event) =>
                          updateAddField("department", event.target.value)
                        }
                        className={inputClass}
                      >
                        <option value="">Select Department</option>
                        {departmentOptions.map((department) => (
                          <option key={department} value={department}>
                            {department}
                          </option>
                        ))}
                      </select>
                      {fieldError(addErrors, "department")}
                    </div>
                    <div>
                      <label className={labelClass}>Work Location / Site *</label>
                      <select
                        value={addForm.location}
                        onChange={(event) =>
                          updateAddField("location", event.target.value)
                        }
                        className={inputClass}
                      >
                        <option value="">Select Location</option>
                        {locationOptions.map((location) => (
                          <option key={location} value={location}>
                            {location}
                          </option>
                        ))}
                      </select>
                      {fieldError(addErrors, "location")}
                    </div>
                    <div>
                      <label className={labelClass}>Designation / Role *</label>
                      <select
                        value={addForm.designation}
                        onChange={(event) =>
                          updateAddField("designation", event.target.value)
                        }
                        className={inputClass}
                      >
                        <option value="">Select Designation</option>
                        {designationOptions.map((designation) => (
                          <option key={designation} value={designation}>
                            {designation}
                          </option>
                        ))}
                      </select>
                      {fieldError(addErrors, "designation")}
                    </div>
                    <div>
                      <label className={labelClass}>Reporting Manager</label>
                      <select
                        value={addForm.manager_id}
                        onChange={(event) =>
                          updateAddField("manager_id", event.target.value)
                        }
                        className={inputClass}
                      >
                        <option value="">Select Manager</option>
                        {employees.map((employee) => (
                          <option key={employee.id} value={employee.id}>
                            {employee.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className={labelClass}>Joining Date *</label>
                      <DateInput
                        value={addForm.joining_date}
                        onChange={(value) => updateAddField("joining_date", value)}
                        className={inputClass}
                      />
                      {fieldError(addErrors, "joining_date")}
                    </div>
                  </div>
                </div>

                <div className="rounded-lg border border-orange-100 bg-orange-50/20 p-4">
                  <SectionTitle color="orange" icon="settings" title="System Details" />
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <label className={labelClass}>Username (optional)</label>
                      <input
                        value={addForm.username}
                        onChange={(event) =>
                          updateAddField("username", event.target.value)
                        }
                        placeholder="Enter username"
                        className={inputClass}
                      />
                    </div>
                    <div>
                      <label className={labelClass}>Password (optional)</label>
                      <input
                        type="password"
                        value={addForm.password}
                        onChange={(event) =>
                          updateAddField("password", event.target.value)
                        }
                        placeholder="Enter password"
                        className={inputClass}
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className={labelClass}>Role Access *</label>
                      <select
                        value={addForm.roleAccess}
                        onChange={(event) =>
                          updateAddField("roleAccess", event.target.value)
                        }
                        className={inputClass}
                      >
                        <option value="">Select Role</option>
                        {ROLE_ACCESS.map((role) => (
                          <option key={role} value={role}>
                            {role}
                          </option>
                        ))}
                      </select>
                      {fieldError(addErrors, "roleAccess")}
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-3 border-t border-slate-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-5">
                  <span className="text-sm font-bold text-blue-700">Other</span>
                  <div className="flex items-center gap-3 text-sm text-slate-700">
                    <span>Status</span>
                    <StatusToggle
                      checked={addForm.status === "Active"}
                      onChange={(status) => updateAddField("status", status)}
                    />
                    <span className="font-semibold">{addForm.status}</span>
                  </div>
                </div>
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => resetAddForm()}
                    className="h-10 rounded-md border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:border-slate-300"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="h-10 rounded-md bg-blue-600 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700"
                  >
                    Save Employee
                  </button>
                </div>
              </div>
            </form>
          </section>
        </div>

        <div className="grid gap-4 xl:grid-cols-2">
          <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-emerald-50 text-emerald-700">
                  <AppIcon name="contacts" className="h-4 w-4" />
                </span>
                <h2 className="text-lg font-bold text-slate-950">Employee Details</h2>
              </div>
              <button
                type="button"
                onClick={() => setDetailTab("profile")}
                className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 hover:border-slate-300"
              >
                <AppIcon name="chevron-left" className="h-4 w-4" />
                Back to List
              </button>
            </div>

            {selectedEmployee ? (
              <div className="grid gap-4 lg:grid-cols-[180px_minmax(0,1fr)_210px]">
                <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-4 text-center">
                  <EmployeeAvatar employee={selectedEmployee} size="lg" />
                  <div className="mt-3">
                    <div className="flex items-center justify-center gap-2">
                      <h3 className="font-bold text-slate-950">
                        {selectedEmployee.name}
                      </h3>
                      <span
                        className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${statusBadgeClass(
                          selectedEmployee.status
                        )}`}
                      >
                        {selectedEmployee.status}
                      </span>
                    </div>
                    <p className="text-xs font-semibold text-slate-500">
                      {selectedEmployee.designation}
                    </p>
                  </div>
                  <dl className="mt-5 space-y-3 text-left text-xs">
                    {[
                      ["Employee ID", selectedEmployee.employee_code],
                      ["Phone", selectedEmployee.phone],
                      ["Email", selectedEmployee.email],
                      ["Department", selectedEmployee.department],
                      ["Location / Site", selectedEmployee.location],
                    ].map(([label, value]) => (
                      <div key={label} className="flex justify-between gap-3">
                        <dt className="text-slate-500">{label}</dt>
                        <dd className="text-right font-semibold text-slate-800">
                          {value || "-"}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </div>

                <div className="rounded-lg border border-slate-200 p-4">
                  <div className="mb-4 flex border-b border-slate-200">
                    {[
                      ["profile", "Profile"],
                      ["tools", "Assigned Tools"],
                      ["history", "Tool History"],
                    ].map(([tab, label]) => (
                      <button
                        key={tab}
                        type="button"
                        onClick={() => setDetailTab(tab)}
                        className={`border-b-2 px-4 py-2 text-xs font-bold transition ${
                          detailTab === tab
                            ? "border-blue-600 text-blue-700"
                            : "border-transparent text-slate-500 hover:text-slate-800"
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>

                  {detailTab === "profile" && (
                    <div className="grid gap-4 text-xs sm:grid-cols-2">
                      {[
                        ["Employee Code", selectedEmployee.employee_code],
                        ["Designation / Role", selectedEmployee.designation],
                        ["Gender", selectedEmployee.gender],
                        ["Reporting Manager", getManagerName(selectedEmployee, employees)],
                        ["Date of Birth", formatDate(selectedEmployee.date_of_birth)],
                        ["Email", selectedEmployee.email],
                        ["Joining Date", formatDate(selectedEmployee.joining_date)],
                        ["Phone Number", selectedEmployee.phone],
                        ["Address", selectedEmployee.address],
                        ["Status", selectedEmployee.status],
                      ].map(([label, value]) => (
                        <div key={label}>
                          <p className="font-bold text-slate-500">{label}</p>
                          <p className="mt-1 font-semibold text-slate-900">{value || "-"}</p>
                        </div>
                      ))}
                    </div>
                  )}

                  {detailTab === "tools" && (
                    <div className="space-y-2">
                      {activeAssignments.length === 0 && (
                        <p className="py-6 text-center text-sm text-slate-500">
                          No tools are currently assigned.
                        </p>
                      )}
                      {activeAssignments.map((assignment) => (
                        <div
                          key={assignment.id}
                          className="flex items-center justify-between rounded-md border border-slate-100 bg-slate-50 px-3 py-2 text-sm"
                        >
                          <div className="flex items-center gap-2">
                            <AppIcon name="tool" className="h-4 w-4 text-slate-500" />
                            <span className="font-semibold text-slate-900">
                              {assignment.tool?.name || assignment.toolId}
                            </span>
                          </div>
                          <span className="text-xs font-bold text-blue-700">
                            {assignment.toolId}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}

                  {detailTab === "history" && (
                    <div className="overflow-x-auto">
                      <table className="min-w-full text-left text-xs">
                        <thead className="bg-slate-50 text-slate-600">
                          <tr>
                            <th className="px-3 py-2 font-bold">Tool</th>
                            <th className="px-3 py-2 font-bold">Issue Date</th>
                            <th className="px-3 py-2 font-bold">Return Date</th>
                            <th className="px-3 py-2 font-bold">Condition</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {employeeAssignments.map((assignment) => (
                            <tr key={assignment.id}>
                              <td className="px-3 py-2 font-semibold text-slate-900">
                                {assignment.tool?.name || assignment.toolId}
                              </td>
                              <td className="px-3 py-2 text-slate-600">
                                {formatDate(assignment.checkoutDate)}
                              </td>
                              <td className="px-3 py-2 text-slate-600">
                                {formatDate(assignment.actualReturnDate)}
                              </td>
                              <td className="px-3 py-2 text-slate-600">
                                {assignment.conditionCheck || "Good"}
                              </td>
                            </tr>
                          ))}
                          {employeeAssignments.length === 0 && (
                            <tr>
                              <td
                                colSpan="4"
                                className="px-3 py-6 text-center text-sm text-slate-500"
                              >
                                No tool history available.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                <div className="space-y-3">
                  <div className="rounded-lg border border-emerald-100 bg-emerald-50/30 p-4">
                    <h3 className="text-sm font-bold text-emerald-800">
                      Assigned Tools ({activeAssignments.length})
                    </h3>
                    <div className="mt-3 space-y-3">
                      {activeAssignments.slice(0, 3).map((assignment) => (
                        <div
                          key={assignment.id}
                          className="flex items-center justify-between text-xs"
                        >
                          <span className="font-semibold text-slate-800">
                            {assignment.tool?.name || assignment.toolId}
                          </span>
                          <span className="font-bold text-blue-700">
                            {assignment.toolId}
                          </span>
                        </div>
                      ))}
                      {activeAssignments.length === 0 && (
                        <p className="text-xs text-slate-500">No assigned tools.</p>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => setDetailTab("tools")}
                      className="mt-3 text-xs font-bold text-blue-700 hover:text-blue-800"
                    >
                      View All
                    </button>
                  </div>

                  <div className="rounded-lg border border-blue-100 bg-blue-50/20 p-4">
                    <h3 className="text-sm font-bold text-blue-800">Tool Summary</h3>
                    <dl className="mt-3 space-y-3 text-xs">
                      <div className="flex justify-between">
                        <dt className="text-slate-600">Total Issued</dt>
                        <dd className="font-bold text-slate-900">
                          {employeeAssignments.length}
                        </dd>
                      </div>
                      <div className="flex justify-between">
                        <dt className="text-slate-600">Currently Issued</dt>
                        <dd className="font-bold text-slate-900">
                          {activeAssignments.length}
                        </dd>
                      </div>
                      <div className="flex justify-between">
                        <dt className="text-slate-600">Returned</dt>
                        <dd className="font-bold text-slate-900">
                          {returnedAssignments.length}
                        </dd>
                      </div>
                    </dl>
                  </div>
                </div>
              </div>
            ) : (
              <p className="rounded-lg border border-slate-200 p-6 text-center text-sm text-slate-500">
                Select or create an employee to view details.
              </p>
            )}
          </section>

          <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-violet-50 text-violet-700">
                  <AppIcon name="edit" className="h-4 w-4" />
                </span>
                <h2 className="text-lg font-bold text-slate-950">Edit Employee</h2>
              </div>
              <span className="rounded-md bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700">
                Update Employee
              </span>
            </div>

            {selectedEmployee ? (
              <form onSubmit={handleUpdateEmployee} className="grid gap-4 lg:grid-cols-2">
                <div className="rounded-lg border border-blue-100 p-4">
                  <SectionTitle icon="user" title="Basic Details" />
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="sm:col-span-2">
                      <label className={labelClass}>Full Name *</label>
                      <input
                        value={editForm.name}
                        onChange={(event) => updateEditField("name", event.target.value)}
                        className={inputClass}
                      />
                      {fieldError(editErrors, "name")}
                    </div>
                    <div>
                      <label className={labelClass}>Employee Code</label>
                      <input value={editForm.employee_code} readOnly className={inputClass} />
                      {fieldError(editErrors, "employee_code")}
                    </div>
                    <div>
                      <label className={labelClass}>Date of Birth *</label>
                      <DateInput
                        value={editForm.date_of_birth}
                        onChange={(value) => updateEditField("date_of_birth", value)}
                        className={inputClass}
                      />
                      {fieldError(editErrors, "date_of_birth")}
                    </div>
                    <div>
                      <label className={labelClass}>Gender *</label>
                      <select
                        value={editForm.gender}
                        onChange={(event) =>
                          updateEditField("gender", event.target.value)
                        }
                        className={inputClass}
                      >
                        <option value="">Select Gender</option>
                        {GENDERS.map((gender) => (
                          <option key={gender} value={gender}>
                            {gender}
                          </option>
                        ))}
                      </select>
                      {fieldError(editErrors, "gender")}
                    </div>
                  </div>
                </div>

                <div className="rounded-lg border border-violet-100 p-4">
                  <SectionTitle color="purple" icon="contacts" title="Contact Details" />
                  <div className="grid gap-3">
                    <div>
                      <label className={labelClass}>Phone Number *</label>
                      <input
                        value={editForm.phone}
                        onChange={(event) => updateEditField("phone", event.target.value)}
                        className={inputClass}
                      />
                      {fieldError(editErrors, "phone")}
                    </div>
                    <div>
                      <label className={labelClass}>Email *</label>
                      <input
                        type="email"
                        value={editForm.email}
                        onChange={(event) => updateEditField("email", event.target.value)}
                        className={inputClass}
                      />
                      {fieldError(editErrors, "email")}
                    </div>
                    <div>
                      <label className={labelClass}>Address *</label>
                      <textarea
                        value={editForm.address}
                        onChange={(event) =>
                          updateEditField("address", event.target.value)
                        }
                        className={textareaClass}
                      />
                      {fieldError(editErrors, "address")}
                    </div>
                  </div>
                </div>

                <div className="rounded-lg border border-emerald-100 p-4">
                  <SectionTitle color="green" icon="clipboard" title="Work Details" />
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <label className={labelClass}>Department *</label>
                      <select
                        value={editForm.department}
                        onChange={(event) =>
                          updateEditField("department", event.target.value)
                        }
                        className={inputClass}
                      >
                        <option value="">Select Department</option>
                        {departmentOptions.map((department) => (
                          <option key={department} value={department}>
                            {department}
                          </option>
                        ))}
                      </select>
                      {fieldError(editErrors, "department")}
                    </div>
                    <div>
                      <label className={labelClass}>Work Location / Site *</label>
                      <select
                        value={editForm.location}
                        onChange={(event) => updateEditField("location", event.target.value)}
                        className={inputClass}
                      >
                        <option value="">Select Location</option>
                        {locationOptions.map((location) => (
                          <option key={location} value={location}>
                            {location}
                          </option>
                        ))}
                      </select>
                      {fieldError(editErrors, "location")}
                    </div>
                    <div>
                      <label className={labelClass}>Designation / Role *</label>
                      <select
                        value={editForm.designation}
                        onChange={(event) =>
                          updateEditField("designation", event.target.value)
                        }
                        className={inputClass}
                      >
                        <option value="">Select Designation</option>
                        {designationOptions.map((designation) => (
                          <option key={designation} value={designation}>
                            {designation}
                          </option>
                        ))}
                      </select>
                      {fieldError(editErrors, "designation")}
                    </div>
                    <div>
                      <label className={labelClass}>Reporting Manager</label>
                      <select
                        value={editForm.manager_id}
                        onChange={(event) =>
                          updateEditField("manager_id", event.target.value)
                        }
                        className={inputClass}
                      >
                        <option value="">Select Manager</option>
                        {employees
                          .filter((employee) => employee.id !== selectedEmployee.id)
                          .map((employee) => (
                            <option key={employee.id} value={employee.id}>
                              {employee.name}
                            </option>
                          ))}
                      </select>
                    </div>
                    <div>
                      <label className={labelClass}>Joining Date *</label>
                      <DateInput
                        value={editForm.joining_date}
                        onChange={(value) => updateEditField("joining_date", value)}
                        className={inputClass}
                      />
                      {fieldError(editErrors, "joining_date")}
                    </div>
                  </div>
                </div>

                <div className="rounded-lg border border-orange-100 p-4">
                  <SectionTitle color="orange" icon="settings" title="System Details" />
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <label className={labelClass}>Username (optional)</label>
                      <input
                        value={editForm.username}
                        onChange={(event) =>
                          updateEditField("username", event.target.value)
                        }
                        className={inputClass}
                      />
                    </div>
                    <div>
                      <label className={labelClass}>Password (optional)</label>
                      <input
                        type="password"
                        value={editForm.password}
                        onChange={(event) =>
                          updateEditField("password", event.target.value)
                        }
                        className={inputClass}
                      />
                    </div>
                    <div>
                      <label className={labelClass}>Role Access *</label>
                      <select
                        value={editForm.roleAccess}
                        onChange={(event) =>
                          updateEditField("roleAccess", event.target.value)
                        }
                        className={inputClass}
                      >
                        {ROLE_ACCESS.map((role) => (
                          <option key={role} value={role}>
                            {role}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className={labelClass}>Status</label>
                      <div className="mt-3 flex items-center gap-3 text-sm">
                        <StatusToggle
                          checked={editForm.status === "Active"}
                          onChange={(status) => updateEditField("status", status)}
                        />
                        <span className="font-semibold text-slate-700">
                          {editForm.status}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex justify-end gap-2 lg:col-span-2">
                  <button
                    type="button"
                    onClick={() => setEditForm(buildFormFromEmployee(selectedEmployee))}
                    className="h-10 rounded-md border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:border-slate-300"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="h-10 rounded-md bg-blue-600 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700"
                  >
                    Update Employee
                  </button>
                </div>
              </form>
            ) : (
              <p className="rounded-lg border border-slate-200 p-6 text-center text-sm text-slate-500">
                Select an employee to update details.
              </p>
            )}
          </section>
        </div>

        <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="rounded-t-lg bg-gradient-to-r from-violet-600 to-blue-600 px-5 py-3 text-white">
            <div className="flex items-center gap-2">
              <AppIcon name="tool" className="h-4 w-4" />
              <h2 className="font-bold">Tool Assignment & History</h2>
            </div>
          </div>

          <div className="grid gap-4 p-5 xl:grid-cols-2">
            <div className="space-y-4">
              <div>
                <h3 className="mb-2 text-sm font-bold text-blue-700">
                  Currently Assigned Tools
                </h3>
                <div className="overflow-x-auto rounded-lg border border-slate-200">
                  <table className="min-w-full text-left text-xs">
                    <thead className="bg-slate-50 text-slate-700">
                      <tr>
                        <th className="px-3 py-2 font-bold">Tool Name</th>
                        <th className="px-3 py-2 font-bold">Tool Code</th>
                        <th className="px-3 py-2 font-bold">Category</th>
                        <th className="px-3 py-2 font-bold">Issued Date</th>
                        <th className="px-3 py-2 font-bold">Expected Return</th>
                        <th className="px-3 py-2 font-bold">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {activeAssignments.map((assignment) => (
                        <tr key={assignment.id}>
                          <td className="px-3 py-2 font-semibold text-slate-900">
                            {assignment.tool?.name || assignment.toolId}
                          </td>
                          <td className="px-3 py-2 text-slate-700">
                            {assignment.toolId}
                          </td>
                          <td className="px-3 py-2 text-slate-700">
                            {assignment.tool?.type || "-"}
                          </td>
                          <td className="px-3 py-2 text-slate-700">
                            {formatDate(assignment.checkoutDate)}
                          </td>
                          <td className="px-3 py-2 text-slate-700">
                            {formatDate(assignment.expectedReturnDate)}
                          </td>
                          <td className="px-3 py-2">
                            <button
                              type="button"
                              onClick={() => handleReturnTool(assignment.id)}
                              className="rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-[11px] font-bold text-emerald-700"
                            >
                              Return
                            </button>
                          </td>
                        </tr>
                      ))}
                      {activeAssignments.length === 0 && (
                        <tr>
                          <td
                            colSpan="6"
                            className="px-3 py-6 text-center text-sm text-slate-500"
                          >
                            No assigned tools for the selected employee.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              <form
                onSubmit={handleAssignTool}
                className="rounded-lg border border-violet-100 bg-violet-50/20 p-4"
              >
                <h3 className="text-sm font-bold text-violet-800">Assign New Tool</h3>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <div className="sm:col-span-2">
                    <label className={labelClass}>Select Tool *</label>
                    <select
                      value={effectiveAssignToolId}
                      onChange={(event) =>
                        setAssignForm((current) => ({
                          ...current,
                          toolId: event.target.value,
                        }))
                      }
                      className={inputClass}
                    >
                      {availableTools.length === 0 && (
                        <option value="">No tools available</option>
                      )}
                      {availableTools.map((tool) => (
                        <option key={tool.id} value={tool.id}>
                          {tool.name} ({tool.id})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className={labelClass}>Issue Date *</label>
                    <DateInput
                      value={assignForm.issueDate}
                      onChange={(value) =>
                        setAssignForm((current) => ({
                          ...current,
                          issueDate: value,
                        }))
                      }
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>Expected Return Date</label>
                    <DateInput
                      value={assignForm.expectedReturnDate}
                      onChange={(value) =>
                        setAssignForm((current) => ({
                          ...current,
                          expectedReturnDate: value,
                        }))
                      }
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>Condition</label>
                    <select
                      value={assignForm.conditionCheck}
                      onChange={(event) =>
                        setAssignForm((current) => ({
                          ...current,
                          conditionCheck: event.target.value,
                        }))
                      }
                      className={inputClass}
                    >
                      <option value="Good">Good</option>
                      <option value="Fair">Fair</option>
                      <option value="Needs Inspection">Needs Inspection</option>
                    </select>
                  </div>
                  <div className="flex items-end">
                    <button
                      type="submit"
                      disabled={!selectedEmployee || !availableTools.length}
                      className="h-10 w-full rounded-md bg-violet-600 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                    >
                      Assign Tool
                    </button>
                  </div>
                </div>
                {assignError && (
                  <p className="mt-2 text-xs font-semibold text-red-600">
                    {assignError}
                  </p>
                )}
              </form>
            </div>

            <div>
              <h3 className="mb-2 text-sm font-bold text-blue-700">
                Tool Issue / Return History
              </h3>
              <div className="overflow-x-auto rounded-lg border border-slate-200">
                <table className="min-w-full text-left text-xs">
                  <thead className="bg-slate-50 text-slate-700">
                    <tr>
                      <th className="px-3 py-2 font-bold">Tool Name</th>
                      <th className="px-3 py-2 font-bold">Tool Code</th>
                      <th className="px-3 py-2 font-bold">Issue Date</th>
                      <th className="px-3 py-2 font-bold">Return Date</th>
                      <th className="px-3 py-2 font-bold">Condition</th>
                      <th className="px-3 py-2 font-bold">Issued By</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {employeeAssignments.map((assignment) => (
                      <tr key={assignment.id}>
                        <td className="px-3 py-2 font-semibold text-slate-900">
                          {assignment.tool?.name || assignment.toolId}
                        </td>
                        <td className="px-3 py-2 text-slate-700">{assignment.toolId}</td>
                        <td className="px-3 py-2 text-slate-700">
                          {formatDate(assignment.checkoutDate)}
                        </td>
                        <td className="px-3 py-2 text-slate-700">
                          {formatDate(assignment.actualReturnDate)}
                        </td>
                        <td className="px-3 py-2 text-slate-700">
                          {assignment.conditionCheck || "Good"}
                        </td>
                        <td className="px-3 py-2 text-slate-700">
                          {getManagerName(selectedEmployee, employees)}
                        </td>
                      </tr>
                    ))}
                    {employeeAssignments.length === 0 && (
                      <tr>
                        <td
                          colSpan="6"
                          className="px-3 py-6 text-center text-sm text-slate-500"
                        >
                          No issue or return history available.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </section>

      </div>
    </div>
  );
};

export default ToolsEmployees;
