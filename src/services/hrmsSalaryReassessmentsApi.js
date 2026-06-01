import api from "./api";

const emitHrmsSalaryReassessmentsChange = () => {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("hrms:salary-reassessments:changed"));
  }
};

const toDateInputValue = (value) => {
  if (!value) return "";
  const text = String(value);
  const isoMatch = /^(\d{4})-(\d{2})-(\d{2})/.exec(text);
  if (isoMatch) {
    return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
  }
  return text;
};

const clampNumber = (value, min = 0, max = 100) =>
  Math.min(max, Math.max(min, Number(value) || 0));

const averageScore = (values = []) => {
  const scores = values.map((value) => clampNumber(value));
  if (!scores.length) return 0;
  return Math.round(scores.reduce((sum, value) => sum + value, 0) / scores.length);
};

const scoreGrade = (score) => {
  if (score >= 90) return "A+";
  if (score >= 80) return "A";
  if (score >= 70) return "B";
  if (score >= 60) return "C";
  return "D";
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

const calculatePfAmount = (grossSalary) =>
  Math.round(toNumber(grossSalary) * 0.12);

const calculateEsiAmount = (grossSalary) =>
  Math.round(toNumber(grossSalary) * 0.015);

const metricKeys = [
  ["workQuality", "WorkQuality"],
  ["communication", "Communication"],
  ["teamwork", "Teamwork"],
  ["leadership", "Leadership"],
  ["punctuality", "Punctuality"],
  ["taskCompletion", "TaskCompletion"],
  ["innovation", "Innovation"],
  ["clientFeedback", "ClientFeedback"],
  ["reporting", "Reporting"],
  ["skillDevelopment", "SkillDevelopment"],
];

const buildMetrics = (record = {}) =>
  metricKeys.reduce((metrics, [key, column]) => {
    const value = record[key] ?? record[column];
    if (value !== undefined && value !== null && value !== "") {
      metrics[key] = Number(value) || 0;
    }
    return metrics;
  }, {});

const buildCompensationRows = (revisedSalary = 0, record = {}) => {
  const grossSalary = toNumber(revisedSalary);
  const deduction = toNumber(record.salaryDeduction ?? record.deduction);
  const pfAmount =
    toOptionalNumber(record.pfAmount ?? record.providentFund) ??
    calculatePfAmount(grossSalary);
  const esiAmount =
    toOptionalNumber(record.esiAmount ?? record.esi) ??
    calculateEsiAmount(grossSalary);

  return [
    ["Gross Salary", grossSalary],
    ["Deduction", deduction],
    ["PF", pfAmount],
    ["ESI", esiAmount],
    ["Net Salary", grossSalary - deduction - pfAmount - esiAmount],
  ];
};

export const normalizeHrmsSalaryReassessment = (record = {}) => {
  const metrics = buildMetrics(record);
  const metricValues = Object.values(metrics);
  const metricAverage = metricValues.length ? averageScore(metricValues) : 0;
  const kpiScore = Number(record.kpiScore ?? record.KPIScore ?? 0) || 0;
  const attendanceScore =
    Number(record.attendanceScore ?? record.AttendanceScore ?? 0) || 0;
  const behaviorScore =
    Number(record.behaviorScore ?? record.BehaviorScore ?? 0) || 0;
  const productivityScore =
    Number(record.productivityScore ?? record.ProductivityScore ?? 0) || 0;
  const reviewScore = averageScore([
    kpiScore,
    attendanceScore,
    behaviorScore,
    productivityScore,
    metricAverage,
  ]);
  const currentSalary = Number(record.currentSalary ?? record.CurrentSalary ?? 0) || 0;
  const revisedSalary = Number(record.revisedSalary ?? record.RevisedSalary ?? 0) || 0;
  const incrementPercent =
    Number(
      record.incrementPercent ??
        record.RecommendedIncrementPercent ??
        record.recommendedIncrementPercent ??
        0
    ) || 0;
  const incrementAmount = Math.max(revisedSalary - currentSalary, 0);
  const bonus = Number(record.bonus ?? record.Bonus ?? 0) || 0;
  const salaryDeduction =
    toOptionalNumber(
      record.salaryDeduction ?? record.deduction ?? record.SalaryDeduction
    ) ?? 0;
  const pfAmount =
    toOptionalNumber(
      record.pfAmount ?? record.providentFund ?? record.ProvidentFund
    ) ?? calculatePfAmount(revisedSalary);
  const esiAmount =
    toOptionalNumber(record.esiAmount ?? record.esi ?? record.ESIAmount) ??
    calculateEsiAmount(revisedSalary);
  const totalDeductions = salaryDeduction + pfAmount + esiAmount;
  const netSalary = revisedSalary - totalDeductions;
  const status =
    record.status ??
    record.Status ??
    record.salaryStatus ??
    record.SalaryActivatedStatus ??
    "Pending";
  const promotionEffectiveDate = toDateInputValue(
    record.promotionEffectiveDate ?? record.PromotionEffectiveDate
  );

  return {
    ...record,
    id: String(record.id ?? record.Id ?? ""),
    acknowledgement:
      record.acknowledgement ??
      record.AcknowledgementStatus ??
      "Pending",
    attendanceScore,
    behaviorScore,
    bonus,
    compensationRows: buildCompensationRows(revisedSalary, {
      esiAmount,
      pfAmount,
      salaryDeduction,
    }),
    currentRole: record.currentRole ?? record.CurrentRole ?? "",
    currentSalary,
    departmentTransfer:
      record.departmentTransfer ?? record.DepartmentTransfer ?? "",
    digitalSignature:
      record.digitalSignature ?? record.DigitalSignature ?? "",
    documents: Array.isArray(record.documents) ? record.documents : [],
    effectiveDate:
      toDateInputValue(record.effectiveDate) || promotionEffectiveDate,
    employeeComment:
      record.employeeComment ?? record.EmployeeComments ?? "",
    employeeId: record.employeeId ?? record.EmployeeID ?? "",
    employeeName:
      record.employeeName ??
      record.EmployeeName ??
      record.FullName ??
      record.EmployeeID ??
      "",
    employeeSelfReview:
      record.employeeSelfReview ?? record.EmployeeSelfReview ?? "",
    grade: record.grade ?? scoreGrade(reviewScore),
    hrComments: record.hrComments ?? record.HRComments ?? "",
    incrementAmount,
    incrementPercent,
    kpiScore,
    managerComments:
      record.managerComments ?? record.ManagerComments ?? "",
    metricAverage,
    metrics,
    overallRating:
      Number(record.overallRating) || Math.max(1, Math.round(reviewScore / 20)),
    productivityScore,
    promotionEffectiveDate,
    promotionReadiness:
      reviewScore >= 88 && Number(metrics.leadership || 0) >= 80
        ? "Ready"
        : reviewScore >= 78
          ? "Developing"
          : "Not Ready",
    promotionRecommendation:
      record.promotionRecommendation ?? "No Promotion",
    proposedRole: record.proposedRole ?? record.ProposedRole ?? "",
    resignationRisk:
      attendanceScore < 70 || behaviorScore < 65
        ? "Medium"
        : reviewScore >= 85 && incrementPercent < 8
          ? "Medium"
          : "Low",
    revisedSalary,
    salaryDeduction,
    deduction: salaryDeduction,
    reviewDate: toDateInputValue(record.reviewDate ?? record.ReviewDate),
    reviewPeriod: record.reviewPeriod ?? record.ReviewPeriod ?? "",
    reviewerName: record.reviewerName ?? record.ReviewerName ?? "",
    reviewScore,
    salaryActivationStatus:
      record.salaryActivationStatus ??
      record.SalaryActivatedStatus ??
      "Pending",
    salaryStatus: status,
    totalDeductions,
    savedAt: record.savedAt ?? record.SavedDate ?? null,
    esiAmount,
    esi: esiAmount,
    netSalary,
    pfAmount,
    providentFund: pfAmount,
    strengths: record.strengths ?? record.EmployeeStrengths ?? "",
    directorStatus:
      record.directorStatus ?? record.DirectorApprovalStatus ?? "Pending",
    hrStatus: record.hrStatus ?? record.HRApprovalStatus ?? "Pending",
    improvement:
      record.improvement ?? record.AreasOfImprovement ?? "",
    managerStatus:
      record.managerStatus ?? record.ManagerReviewStatus ?? "Pending",
    notificationSettings: {
      notifyEmail: record.notificationSettings?.notifyEmail ?? true,
      notifyHr: record.notificationSettings?.notifyHr ?? true,
      notifyPromotion: record.notificationSettings?.notifyPromotion ?? false,
      reminder: record.notificationSettings?.reminder ?? true,
    },
  };
};

export const fetchHrmsSalaryReassessments = async () => {
  const response = await api.get("/hrms/salary-reassessments");
  const list = Array.isArray(response.data?.salaryReassessments)
    ? response.data.salaryReassessments
    : Array.isArray(response.data)
      ? response.data
      : [];
  return list.map(normalizeHrmsSalaryReassessment);
};

export const createHrmsSalaryReassessment = async (payload) => {
  const response = await api.post("/hrms/salary-reassessments", payload);
  const normalized = normalizeHrmsSalaryReassessment(
    response.data?.salaryReassessment ?? response.data
  );
  emitHrmsSalaryReassessmentsChange();
  return normalized;
};

export const updateHrmsSalaryReassessment = async (id, payload) => {
  const response = await api.put(`/hrms/salary-reassessments/${id}`, payload);
  const normalized = normalizeHrmsSalaryReassessment(
    response.data?.salaryReassessment ?? response.data
  );
  emitHrmsSalaryReassessmentsChange();
  return normalized;
};

export const deleteHrmsSalaryReassessment = async (id) => {
  await api.delete(`/hrms/salary-reassessments/${id}`);
  emitHrmsSalaryReassessmentsChange();
};

export const getHrmsSalaryReassessmentErrorMessage = (
  error,
  fallback = "HRMS salary reassessment request failed."
) =>
  error?.response?.data?.error ||
  error?.response?.data?.message ||
  error?.message ||
  fallback;
