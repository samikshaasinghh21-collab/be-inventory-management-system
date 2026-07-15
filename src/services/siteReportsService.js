import {
  getProjectManagementProjects,
  setProjectManagementProjects,
} from "./projectManagementProjectsStore";

const nowIso = () => new Date().toISOString();
const makeId = () => `site-report-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const numberValue = (value) => Math.max(Number(value) || 0, 0);

const reportsFromProjects = (projects) =>
  projects.flatMap((project) =>
    (project.siteReports || []).map((report) => ({
      ...report,
      projectId: project.id,
      projectName: project.name,
      projectCode: project.code,
    }))
  );

const nextReportNumber = (projects, date) => {
  const year = String(date || new Date().getFullYear()).slice(0, 4);
  const highest = reportsFromProjects(projects).reduce((max, report) => {
    const match = /^SR-(\d{4})-(\d+)$/.exec(String(report.reportNumber || ""));
    return match?.[1] === year ? Math.max(max, Number(match[2])) : max;
  }, 0);
  return `SR-${year}-${String(highest + 1).padStart(4, "0")}`;
};

const normalizeReport = (report = {}) => ({
  ...report,
  taskRows: Array.isArray(report.taskRows) ? report.taskRows : [],
  manpowerRows: Array.isArray(report.manpowerRows) ? report.manpowerRows : [],
  materialRows: Array.isArray(report.materialRows) ? report.materialRows : [],
  equipmentRows: Array.isArray(report.equipmentRows) ? report.equipmentRows : [],
  safetyRows: Array.isArray(report.safetyRows) ? report.safetyRows : [],
  qualityRows: Array.isArray(report.qualityRows) ? report.qualityRows : [],
  issueRows: Array.isArray(report.issueRows) ? report.issueRows : [],
  visitorRows: Array.isArray(report.visitorRows) ? report.visitorRows : [],
  photos: Array.isArray(report.photos) ? report.photos : [],
});

const saveProjects = (projects) => {
  try {
    return setProjectManagementProjects(projects);
  } catch (error) {
    if (error?.name === "QuotaExceededError" || error?.code === 22) {
      const storageError = new Error(
        "Site report storage is full. Remove photos or older draft reports and try again."
      );
      storageError.code = "SITE_REPORT_STORAGE_FULL";
      throw storageError;
    }
    throw error;
  }
};

const updateReport = (reportId, updater) => {
  let updatedReport = null;
  const projects = getProjectManagementProjects().map((project) => ({
    ...project,
    siteReports: (project.siteReports || []).map((report) => {
      if (report.id !== reportId) return report;
      updatedReport = normalizeReport(updater(normalizeReport(report), project));
      return updatedReport;
    }),
  }));
  if (!updatedReport) throw new Error("Site report not found.");
  saveProjects(projects);
  return updatedReport;
};

export const listSiteReports = () =>
  reportsFromProjects(getProjectManagementProjects()).sort((a, b) =>
    String(b.reportDate || b.createdAt || "").localeCompare(
      String(a.reportDate || a.createdAt || "")
    )
  );

export const createSiteReport = (input) => {
  const projects = getProjectManagementProjects();
  const project = projects.find((item) => String(item.id) === String(input.projectId));
  if (!project) throw new Error("Selected project was not found.");
  const duplicate = (project.siteReports || []).some(
    (report) =>
      report.reportDate === input.reportDate &&
      report.shift === input.shift &&
      report.status !== "Rejected"
  );
  if (duplicate && !input.additionalReport) {
    throw new Error("A report already exists for this project, date, and shift.");
  }
  const created = normalizeReport({
    ...input,
    id: makeId(),
    reportNumber: nextReportNumber(projects, input.reportDate),
    status: "Draft",
    createdAt: nowIso(),
    updatedAt: nowIso(),
  });
  saveProjects(
    projects.map((item) =>
      String(item.id) === String(input.projectId)
        ? { ...item, siteReports: [created, ...(item.siteReports || [])] }
        : item
    )
  );
  return created;
};

export const updateSiteReport = (reportId, input) =>
  updateReport(reportId, (report) => {
    if (!["Draft", "Rejected"].includes(report.status)) {
      throw new Error("Only draft or rejected reports can be edited.");
    }
    return { ...report, ...input, status: "Draft", updatedAt: nowIso() };
  });

export const submitSiteReport = (reportId) =>
  updateReport(reportId, (report) => ({
    ...report,
    status: "Submitted",
    submittedAt: nowIso(),
    rejectionReason: "",
    updatedAt: nowIso(),
  }));

export const rejectSiteReport = (reportId, { approver, reason }) =>
  updateReport(reportId, (report) => {
    if (report.status !== "Submitted") throw new Error("Only submitted reports can be rejected.");
    if (!String(reason || "").trim()) throw new Error("A rejection reason is required.");
    return {
      ...report,
      status: "Rejected",
      rejectedBy: approver,
      rejectedAt: nowIso(),
      rejectionReason: String(reason).trim(),
      updatedAt: nowIso(),
    };
  });

export const approveSiteReport = (reportId, { approver }) => {
  let approved = null;
  const projects = getProjectManagementProjects().map((project) => {
    const report = (project.siteReports || []).find((item) => item.id === reportId);
    if (!report) return project;
    if (report.status !== "Submitted") throw new Error("Only submitted reports can be approved.");

    const progressByTask = new Map(
      (report.taskRows || []).map((row) => [String(row.taskId), numberValue(row.reportedProgress)])
    );
    const tasks = (project.tasks || []).map((task) => {
      if (!progressByTask.has(String(task.id))) return task;
      const previous = numberValue(task.progress);
      const progress = Math.min(100, Math.max(previous, progressByTask.get(String(task.id))));
      return {
        ...task,
        progress,
        status: progress >= 100 ? "Completed" : progress > 0 ? "In Progress" : task.status,
        updatedAt: nowIso(),
      };
    });
    const progress = tasks.length
      ? Math.round(tasks.reduce((sum, task) => sum + numberValue(task.progress), 0) / tasks.length)
      : numberValue(project.progress);
    approved = {
      ...report,
      status: "Approved",
      approvedBy: approver || project.projectManager || "Project manager",
      approvedAt: nowIso(),
      updatedAt: nowIso(),
    };
    return {
      ...project,
      tasks,
      progress,
      openIssues: (report.issueRows || []).filter((issue) => issue.status !== "Closed").length,
      siteReports: (project.siteReports || []).map((item) =>
        item.id === reportId ? approved : item
      ),
      activities: [
        {
          id: `activity-${Date.now()}`,
          type: "Site Report",
          title: `${approved.reportNumber} approved`,
          description: approved.summary,
          actor: approved.approvedBy,
          date: approved.approvedAt,
        },
        ...(project.activities || []),
      ],
      updatedAt: nowIso(),
    };
  });
  if (!approved) throw new Error("Site report not found.");
  saveProjects(projects);
  return approved;
};

export const deleteSiteReport = (reportId) => {
  let found = false;
  const projects = getProjectManagementProjects().map((project) => ({
    ...project,
    siteReports: (project.siteReports || []).filter((report) => {
      if (report.id !== reportId) return true;
      found = true;
      if (!["Draft", "Rejected"].includes(report.status)) {
        throw new Error("Only draft or rejected reports can be deleted.");
      }
      return false;
    }),
  }));
  if (!found) throw new Error("Site report not found.");
  saveProjects(projects);
};

export const siteReportsService = {
  list: listSiteReports,
  create: createSiteReport,
  update: updateSiteReport,
  submit: submitSiteReport,
  approve: approveSiteReport,
  reject: rejectSiteReport,
  delete: deleteSiteReport,
};
