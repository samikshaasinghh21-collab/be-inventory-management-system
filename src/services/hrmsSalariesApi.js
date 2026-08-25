import api from "./api";
import { parseDateValue } from "../utils/dateFormat";

const emitHrmsSalariesChange = () => {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("hrms:salaries:changed"));
  }
};

const toNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const toOptionalNumber = (value) => {
  if (value === undefined || value === null || value === "") {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const calculateMonthlySalary = (annualGrossSalary) =>
  Math.round(toNumber(annualGrossSalary) / 12);

const calculatePfAmount = (annualGrossSalary) =>
  Math.round(calculateMonthlySalary(annualGrossSalary) * 0.12);

const normalizeMonthlyPfAmount = (pfAmount, annualGrossSalary) => {
  const monthlyPfAmount = calculatePfAmount(annualGrossSalary);
  const storedPfAmount = toOptionalNumber(pfAmount);
  if (storedPfAmount === null) return monthlyPfAmount;

  const legacyAnnualPfAmount = Math.round(toNumber(annualGrossSalary) * 0.12);
  return Math.abs(storedPfAmount - legacyAnnualPfAmount) <= 1
    ? monthlyPfAmount
    : storedPfAmount;
};

const calculateEsiAmount = () => 0;

const getTime = (value) => {
  const date = parseDateValue(value);
  return !date || Number.isNaN(date.getTime()) ? 0 : date.getTime();
};

export const normalizeHrmsSalary = (record = {}) => {
  const employeeId = record.employeeId ?? record.EmployeeID ?? "";
  const salary = toNumber(
    record.salary ?? record.basicSalary ?? record.BasicSalary
  );
  const allowance = toNumber(
    record.allowance ?? record.allowances ?? record.Allowances
  );
  const deduction = toNumber(
    record.deduction ?? record.deductions ?? record.Deductions
  );
  const professionalTax = toNumber(
    record.professionalTax ?? record.pt ?? record.ProfessionalTax
  );
  const tdsAmount = toNumber(
    record.tdsAmount ?? record.tds ?? record.TDSAmount
  );
  const pfAmount = normalizeMonthlyPfAmount(
    record.pfAmount ??
      record.providentFund ??
      record.PFAmount ??
      record.ProvidentFund,
    salary
  );
  const esiAmount =
    toOptionalNumber(record.esiAmount ?? record.esi ?? record.ESIAmount) ??
    calculateEsiAmount(salary);
  const monthlySalary = calculateMonthlySalary(salary);
  const totalDeductions = deduction + pfAmount + esiAmount + professionalTax + tdsAmount;
  const totalEarnings = monthlySalary + allowance;
  return {
    ...record,
    id: String(record.id ?? record.Id ?? ""),
    employeeId,
    employeeName:
      record.employeeName ??
      record.EmployeeName ??
      record.FullName ??
      record.name ??
      employeeId,
    month: record.month ?? record.payrollMonth ?? record.PayrollMonth ?? "",
    department: record.department ?? record.Department ?? "All",
    salary,
    basicSalary: salary,
    allowance,
    allowances: allowance,
    deduction,
    deductions: deduction,
    grossSalary: salary,
    monthlySalary,
    esi: esiAmount,
    esiAmount,
    net: totalEarnings - totalDeductions,
    netSalary: totalEarnings - totalDeductions,
    pfAmount,
    providentFund: pfAmount,
    professionalTax,
    pt: professionalTax,
    tdsAmount,
    tds: tdsAmount,
    totalEarnings,
    totalDeductions,
    status: record.status ?? record.Status ?? "Processed",
    savedAt: record.savedAt ?? record.SavedDate ?? null,
  };
};

export const groupHrmsSalaryBatches = (records = []) => {
  const sortedRecords = [...records]
    .map(normalizeHrmsSalary)
    .sort((first, second) => {
      const savedDateDiff = getTime(second.savedAt) - getTime(first.savedAt);
      if (savedDateDiff) return savedDateDiff;
      return Number(second.id || 0) - Number(first.id || 0);
    });
  const groups = new Map();

  sortedRecords.forEach((record) => {
    const month = record.month || "Not provided";
    const department = record.department || "All";
    const key = `${month}-${department}`;
    const batch =
      groups.get(key) ||
      {
        id: key,
        department,
        month,
        rows: [],
        savedAt: record.savedAt,
        updatedAt: record.savedAt,
      };

    if (getTime(record.savedAt) > getTime(batch.updatedAt)) {
      batch.savedAt = record.savedAt;
      batch.updatedAt = record.savedAt;
    }

    batch.rows.push({
      ...record,
      id: record.employeeId,
      salaryRecordId: record.id,
      name: record.employeeName || record.employeeId,
    });
    groups.set(key, batch);
  });

  return Array.from(groups.values()).map((batch) => {
    const statuses = new Set(batch.rows.map((row) => row.status).filter(Boolean));
    return {
      ...batch,
      status:
        statuses.size === 1
          ? Array.from(statuses)[0]
          : statuses.has("Pending")
            ? "Pending"
            : "Processed",
    };
  });
};

export const fetchHrmsSalaries = async () => {
  const response = await api.get("/hrms/salaries");
  const list = Array.isArray(response.data?.salaries)
    ? response.data.salaries
    : Array.isArray(response.data)
      ? response.data
      : [];
  return list.map(normalizeHrmsSalary);
};

export const fetchHrmsSalaryBatches = async () =>
  groupHrmsSalaryBatches(await fetchHrmsSalaries());

export const saveHrmsSalaryBatch = async (payload) => {
  const response = await api.post("/hrms/salaries", payload);
  const rows = Array.isArray(response.data?.salaryRows)
    ? response.data.salaryRows
    : Array.isArray(response.data?.salaries)
      ? response.data.salaries
      : [];
  const batches = groupHrmsSalaryBatches(rows);
  const month = payload?.month ?? payload?.PayrollMonth ?? "";
  const department = payload?.department ?? payload?.Department ?? "All";
  const savedBatch =
    batches.find(
      (batch) => batch.month === month && batch.department === department
    ) || batches[0] || null;

  emitHrmsSalariesChange();
  return savedBatch;
};

export const deleteHrmsSalaryBatch = async (batch) => {
  await api.delete("/hrms/salaries", {
    data: {
      month: batch?.month,
      department: batch?.department,
    },
  });
  emitHrmsSalariesChange();
};

export const getHrmsSalaryErrorMessage = (
  error,
  fallback = "HRMS salaries request failed."
) =>
  error?.response?.data?.error ||
  error?.response?.data?.message ||
  error?.message ||
  fallback;
