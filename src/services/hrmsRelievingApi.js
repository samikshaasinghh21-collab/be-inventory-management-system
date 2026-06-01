import api from "./api";

const emitHrmsRelievingChange = () => {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("hrms:relieving:changed"));
  }
};

const checklistFields = [
  ["Handover Documents", "handoverDocuments", "HandoverDocuments"],
  ["Clear Pending Tasks", "clearPendingTasks", "ClearPendingTasks"],
  ["Return Company Assets", "returnCompanyAssets", "ReturnCompanyAssets"],
  ["Exit Interview", "exitInterview", "ExitInterview"],
  ["Final Settlement", "finalSettlement", "FinalSettlement"],
];

const toBoolean = (value) => value === true || value === 1 || value === "1";

const toDisplayDate = (value) => {
  if (!value) return "";
  const text = String(value);
  const isoMatch = /^(\d{4})-(\d{2})-(\d{2})/.exec(text);
  if (isoMatch) {
    return `${isoMatch[3]}/${isoMatch[2]}/${isoMatch[1]}`;
  }
  const dmyMatch = /^(\d{2})[-/](\d{2})[-/](\d{2,4})$/.exec(text);
  if (dmyMatch) {
    const year = dmyMatch[3].length === 2 ? `20${dmyMatch[3]}` : dmyMatch[3];
    return `${dmyMatch[1]}/${dmyMatch[2]}/${year}`;
  }
  return text;
};

const normalizeChecklist = (record = {}) => {
  if (Array.isArray(record.checklist)) {
    return record.checklist.map((item) => ({
      label: item.label,
      checked: Boolean(item.checked),
    }));
  }

  return checklistFields.map(([label, camelKey, sqlKey]) => ({
    label,
    checked: toBoolean(record[camelKey] ?? record[sqlKey]),
  }));
};

export const normalizeHrmsRelieving = (record = {}) => {
  const referenceNo =
    record.referenceNo ?? record.ReferenceNo ?? record.id ?? "";
  const employeeId = record.employeeId ?? record.EmployeeID ?? "";

  return {
    ...record,
    id: String(referenceNo || record.Id || ""),
    relievingId: String(record.relievingId ?? record.Id ?? ""),
    employeeId,
    employeeName:
      record.employeeName ??
      record.EmployeeName ??
      record.FullName ??
      record.name ??
      employeeId,
    referenceNo,
    resignationDate: toDisplayDate(
      record.resignationDate ?? record.ResignationDate
    ),
    lastWorkingDate: toDisplayDate(
      record.lastWorkingDate ?? record.LastWorkingDate
    ),
    noticePeriod: record.noticePeriod ?? record.NoticePeriod ?? "",
    checklist: normalizeChecklist(record),
    status:
      record.status ??
      record.relievingStatus ??
      record.RelievingStatus ??
      "Relieved",
    letterGenerated: toBoolean(
      record.letterGenerated ?? record.LetterGenerated
    ),
    pdfPath: record.pdfPath ?? record.PdfPath ?? "",
    savedAt: record.savedAt ?? record.CreatedAt ?? null,
  };
};

export const fetchHrmsRelieving = async () => {
  const response = await api.get("/hrms/relieving");
  const list = Array.isArray(response.data?.relieving)
    ? response.data.relieving
    : Array.isArray(response.data)
      ? response.data
      : [];
  return list.map(normalizeHrmsRelieving);
};

export const createHrmsRelieving = async (payload) => {
  const response = await api.post("/hrms/relieving", payload);
  const normalized = normalizeHrmsRelieving(
    response.data?.relievingRecord ?? response.data
  );
  emitHrmsRelievingChange();
  return normalized;
};

export const getHrmsRelievingErrorMessage = (
  error,
  fallback = "HRMS relieving request failed."
) =>
  error?.response?.data?.error ||
  error?.response?.data?.message ||
  error?.message ||
  fallback;
