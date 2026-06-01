import api from "./api";

const emitHrmsAttendanceChange = () => {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("hrms:attendance:changed"));
  }
};

const defaultStatuses = Array.from({ length: 31 }, () => "P");
const validStatuses = new Set(["P", "A", "L", "H"]);

const normalizeStatus = (value) => {
  const status = String(value || "P").trim().toUpperCase();
  return validStatuses.has(status) ? status : "P";
};

const parseStatuses = (value) => {
  const parsed =
    typeof value === "string"
      ? (() => {
          try {
            return JSON.parse(value);
          } catch {
            return [];
          }
        })()
      : value;

  if (Array.isArray(parsed)) {
    return defaultStatuses.map((fallback, index) =>
      normalizeStatus(parsed[index] ?? fallback)
    );
  }

  if (parsed && typeof parsed === "object") {
    return defaultStatuses.map((fallback, index) =>
      normalizeStatus(parsed[String(index + 1)] ?? parsed[index + 1] ?? fallback)
    );
  }

  return [...defaultStatuses];
};

const buildCounts = (statuses = []) =>
  statuses.reduce(
    (counts, status) => {
      const key = normalizeStatus(status);
      return {
        ...counts,
        [key]: (counts[key] || 0) + 1,
      };
    },
    { A: 0, H: 0, L: 0, P: 0 }
  );

export const normalizeHrmsAttendance = (record = {}) => {
  const statuses = parseStatuses(
    record.statuses ?? record.DayStatusJson ?? record.dayStatusJson
  );
  const calculatedCounts = buildCounts(statuses);
  const counts = {
    P: Number(record.counts?.P ?? record.PresentCount ?? calculatedCounts.P ?? 0),
    A: Number(record.counts?.A ?? record.AbsentCount ?? calculatedCounts.A ?? 0),
    L: Number(record.counts?.L ?? record.LeaveCount ?? calculatedCounts.L ?? 0),
    H: Number(record.counts?.H ?? record.HolidayCount ?? calculatedCounts.H ?? 0),
  };
  const employeeId = record.employeeId ?? record.EmployeeID ?? "";

  return {
    ...record,
    id: String(record.id ?? record.Id ?? ""),
    employeeId,
    employeeName:
      record.employeeName ??
      record.EmployeeName ??
      record.FullName ??
      employeeId,
    month: record.month ?? record.AttendanceMonth ?? "",
    statuses,
    counts,
    savedAt: record.savedAt ?? record.SavedDate ?? null,
  };
};

export const fetchHrmsAttendance = async () => {
  const response = await api.get("/hrms/attendance");
  const list = Array.isArray(response.data?.attendance)
    ? response.data.attendance
    : Array.isArray(response.data)
      ? response.data
      : [];
  return list.map(normalizeHrmsAttendance);
};

export const saveHrmsAttendance = async (payload) => {
  const response = await api.post("/hrms/attendance", payload);
  const normalized = normalizeHrmsAttendance(
    response.data?.attendanceRecord ?? response.data
  );
  emitHrmsAttendanceChange();
  return normalized;
};

export const getHrmsAttendanceErrorMessage = (
  error,
  fallback = "HRMS attendance request failed."
) =>
  error?.response?.data?.error ||
  error?.response?.data?.message ||
  error?.message ||
  fallback;
