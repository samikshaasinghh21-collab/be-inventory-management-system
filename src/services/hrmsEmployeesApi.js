import api from "./api";

const emitHrmsEmployeesChange = () => {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("hrms:employees:changed"));
  }
};

const toDisplayDate = (value) => {
  if (!value) return "";
  const text = String(value);
  const isoMatch = /^(\d{4})-(\d{2})-(\d{2})/.exec(text);
  if (isoMatch) {
    return `${isoMatch[3]}/${isoMatch[2]}/${isoMatch[1]}`;
  }
  return text;
};

const getInitials = (name = "") =>
  String(name)
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || "")
    .join("") || "EM";

const toOptionalNumber = (value) => {
  if (value === undefined || value === null || value === "") {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

export const normalizeHrmsEmployee = (employee = {}) => {
  const id = employee.id ?? employee.employeeId ?? employee.EmployeeID ?? "";
  const name = employee.name ?? employee.fullName ?? employee.FullName ?? "";
  const department =
    employee.department ??
    employee.departmentName ??
    employee.DepartmentName ??
    employee.Department ??
    "";
  const designation =
    employee.designation ??
    employee.designationTitle ??
    employee.DesignationTitle ??
    employee.Designation ??
    "";
  const phone =
    employee.phone ?? employee.phoneNumber ?? employee.PhoneNumber ?? "";
  const salary = Number(
    employee.salary ?? employee.basicSalary ?? employee.BasicSalary ?? 0
  );
  const salaryDeduction = toOptionalNumber(
    employee.salaryDeduction ??
      employee.deduction ??
      employee.SalaryDeduction ??
      employee.Deductions
  );
  const pfAmount = toOptionalNumber(
    employee.pfAmount ?? employee.providentFund ?? employee.ProvidentFund
  );
  const esiAmount = toOptionalNumber(
    employee.esiAmount ?? employee.esi ?? employee.ESIAmount
  );

  return {
    ...employee,
    id,
    employeeId: id,
    name,
    fullName: employee.fullName ?? name,
    department,
    departmentId: employee.departmentId ?? employee.DepartmentID ?? null,
    designation,
    designationId: employee.designationId ?? employee.DesignationID ?? null,
    email: employee.email ?? employee.Email ?? "",
    phone,
    phoneNumber: phone,
    emergencyContactNumber:
      employee.emergencyContactNumber ??
      employee.emergencyPhone ??
      employee.EmergencyContactNumber ??
      "",
    emergencyPhone:
      employee.emergencyContactNumber ??
      employee.emergencyPhone ??
      employee.EmergencyContactNumber ??
      "",
    status: employee.status ?? employee.Status ?? "Active",
    manager:
      employee.manager ??
      employee.reportingManager ??
      employee.ReportingManager ??
      "",
    joined: toDisplayDate(
      employee.joined ?? employee.dateOfJoining ?? employee.DateOfJoining
    ),
    dateOfJoining: toDisplayDate(
      employee.dateOfJoining ?? employee.joined ?? employee.DateOfJoining
    ),
    salary: Number.isFinite(salary) ? salary : 0,
    basicSalary: Number.isFinite(salary) ? salary : 0,
    salaryDeduction,
    deduction: salaryDeduction,
    pfAmount,
    providentFund: pfAmount,
    esiAmount,
    esi: esiAmount,
    avatar: employee.avatar ?? getInitials(name),
    address: employee.address ?? employee.Address ?? "",
    bloodGroup: employee.bloodGroup ?? employee.BloodGroup ?? "",
    dateOfBirth: toDisplayDate(employee.dateOfBirth ?? employee.DateOfBirth),
    gender: employee.gender ?? employee.Gender ?? "",
    maritalStatus: employee.maritalStatus ?? employee.MaritalStatus ?? "",
    nationality: employee.nationality ?? employee.Nationality ?? "",
    photo: employee.photo ?? employee.photoPath ?? employee.PhotoPath ?? "",
    photoPath: employee.photoPath ?? employee.photo ?? employee.PhotoPath ?? "",
    documents:
      employee.documents && typeof employee.documents === "object"
        ? employee.documents
        : {},
    createdAt: employee.createdAt ?? employee.CreatedAt ?? null,
  };
};

export const fetchHrmsEmployees = async () => {
  const response = await api.get("/hrms/employees");
  const list = Array.isArray(response.data?.employees)
    ? response.data.employees
    : Array.isArray(response.data)
      ? response.data
      : [];
  return list.map(normalizeHrmsEmployee);
};

export const createHrmsEmployee = async (payload) => {
  const response = await api.post("/hrms/employees", payload);
  const normalized = normalizeHrmsEmployee(
    response.data?.employee ?? response.data
  );
  emitHrmsEmployeesChange();
  return normalized;
};

export const updateHrmsEmployee = async (id, payload) => {
  const response = await api.put(`/hrms/employees/${id}`, payload);
  const normalized = normalizeHrmsEmployee(
    response.data?.employee ?? response.data
  );
  emitHrmsEmployeesChange();
  return normalized;
};

export const deleteHrmsEmployee = async (id) => {
  await api.delete(`/hrms/employees/${id}`);
  emitHrmsEmployeesChange();
};

export const getHrmsEmployeeErrorMessage = (
  error,
  fallback = "HRMS employee request failed."
) =>
  error?.response?.data?.error ||
  error?.response?.data?.message ||
  error?.message ||
  fallback;
