import {
  approveDailySiteReport,
  createDailySiteReport,
  deleteDailySiteReport,
  fetchDailySiteReports,
  rejectDailySiteReport,
  submitDailySiteReport,
  updateDailySiteReport,
} from "./projectManagementApi";
import {
  getProjectManagementProjects,
  setProjectManagementProjects,
} from "./projectManagementProjectsStore";

const nowIso = () => new Date().toISOString();
const sameId = (left, right) => String(left) === String(right);
const legacyReports = () =>
  getProjectManagementProjects().flatMap((project) =>
    (project.siteReports || []).map((report) => ({
      ...report,
      projectId: project.id,
      projectName: project.name,
      projectCode: project.code,
    }))
  );

const mergeReports = (serverReports = [], storedReports = []) => {
  const merged = [...storedReports];
  serverReports.forEach((report) => {
    const index = merged.findIndex((item) => sameId(item.id, report.id));
    if (index >= 0) merged[index] = { ...merged[index], ...report };
    else merged.push(report);
  });
  return merged.sort((left, right) =>
    String(right.reportDate || right.createdAt || "").localeCompare(
      String(left.reportDate || left.createdAt || "")
    )
  );
};

const findLegacyReport = (id) =>
  legacyReports().find((report) => sameId(report.id, id));

const updateLegacyReport = (id, updater) => {
  let updated = null;
  const projects = getProjectManagementProjects().map((project) => ({
    ...project,
    siteReports: (project.siteReports || []).map((report) => {
      if (!sameId(report.id, id)) return report;
      updated = updater(report, project);
      return updated;
    }),
  }));
  if (!updated) throw new Error("Site report not found.");
  setProjectManagementProjects(projects);
  return updated;
};

const deleteLegacyReport = (id) => {
  const report = findLegacyReport(id);
  if (!report) throw new Error("Site report not found.");
  if (!["Draft", "Rejected"].includes(report.status)) {
    throw new Error("Only draft or rejected reports can be deleted.");
  }
  setProjectManagementProjects(
    getProjectManagementProjects().map((project) => ({
      ...project,
      siteReports: (project.siteReports || []).filter(
        (item) => !sameId(item.id, id)
      ),
    }))
  );
};

const approveLegacyReport = (id, input = {}) => {
  let approved = null;
  const projects = getProjectManagementProjects().map((project) => {
    const report = (project.siteReports || []).find((item) => sameId(item.id, id));
    if (!report) return project;
    if (report.status !== "Submitted") {
      throw new Error("Only submitted reports can be approved.");
    }
    const progressByTask = new Map(
      (report.taskRows || []).map((row) => [
        String(row.taskId),
        Math.max(0, Math.min(100, Number(row.reportedProgress) || 0)),
      ])
    );
    const tasks = (project.tasks || []).map((task) => {
      if (!progressByTask.has(String(task.id))) return task;
      const completionPercentage = Math.max(
        Number(task.completionPercentage ?? task.progress) || 0,
        progressByTask.get(String(task.id))
      );
      return {
        ...task,
        completionPercentage,
        progress: completionPercentage,
        status:
          completionPercentage >= 100
            ? "Completed"
            : completionPercentage > 0
              ? "Partial"
              : "Pending",
        updatedAt: nowIso(),
      };
    });
    approved = {
      ...report,
      status: "Approved",
      approvedBy: input.approver || "Manager",
      approvedAt: nowIso(),
      updatedAt: nowIso(),
    };
    return {
      ...project,
      tasks,
      siteReports: (project.siteReports || []).map((item) =>
        sameId(item.id, id) ? approved : item
      ),
      updatedAt: nowIso(),
    };
  });
  if (!approved) throw new Error("Site report not found.");
  setProjectManagementProjects(projects);
  return approved;
};

let serverReportIds = new Set();
let cache = mergeReports([], legacyReports());
const shouldUseLegacyReport = (id) =>
  !serverReportIds.has(String(id)) && Boolean(findLegacyReport(id));
const replace = (report) => {
  cache = [report, ...cache.filter((item) => !sameId(item.id, report.id))];
  return report;
};

export const siteReportsService = {
  list: () => cache,
  refresh: async () => {
    const serverReports = await fetchDailySiteReports();
    serverReportIds = new Set(serverReports.map((report) => String(report.id)));
    cache = mergeReports(serverReports, legacyReports());
    return cache;
  },
  create: async (input) => {
    const report = await createDailySiteReport(input);
    serverReportIds.add(String(report.id));
    return replace(report);
  },
  update: async (id, input) =>
    replace(
      shouldUseLegacyReport(id)
        ? updateLegacyReport(id, (report) => {
            if (!["Draft", "Rejected"].includes(report.status)) {
              throw new Error("Only draft or rejected reports can be edited.");
            }
            return { ...report, ...input, status: "Draft", updatedAt: nowIso() };
          })
        : await updateDailySiteReport(id, input)
    ),
  submit: async (id) =>
    replace(
      shouldUseLegacyReport(id)
        ? updateLegacyReport(id, (report) => ({
            ...report,
            status: "Submitted",
            submittedAt: nowIso(),
            rejectionReason: "",
            updatedAt: nowIso(),
          }))
        : await submitDailySiteReport(id)
    ),
  approve: async (id, input) =>
    replace(
      shouldUseLegacyReport(id)
        ? approveLegacyReport(id, input)
        : await approveDailySiteReport(id, input)
    ),
  reject: async (id, input) =>
    replace(
      shouldUseLegacyReport(id)
        ? updateLegacyReport(id, (report) => {
            if (report.status !== "Submitted") {
              throw new Error("Only submitted reports can be rejected.");
            }
            if (!String(input?.reason || "").trim()) {
              throw new Error("A rejection reason is required.");
            }
            return {
              ...report,
              status: "Rejected",
              rejectedBy: input?.approver || "Manager",
              rejectedAt: nowIso(),
              rejectionReason: String(input.reason).trim(),
              updatedAt: nowIso(),
            };
          })
        : await rejectDailySiteReport(id, input)
    ),
  delete: async (id) => {
    if (shouldUseLegacyReport(id)) deleteLegacyReport(id);
    else await deleteDailySiteReport(id);
    serverReportIds.delete(String(id));
    cache = cache.filter((item) => !sameId(item.id, id));
  },
};
