import api from "./api";

export const fetchProjectManagementProjects = async () => {
  const { data } = await api.get("/project-management/projects");
  return data.projects || [];
};

export const createProjectManagementProject = async (payload) => {
  const { data } = await api.post("/project-management/projects", payload);
  return data.project;
};

export const updateProjectManagementProject = async (projectId, payload) => {
  const { data } = await api.put(`/project-management/projects/${projectId}`, payload);
  return data.project;
};

export const createProjectTask = async (projectId, payload) => {
  const { data } = await api.post(`/project-management/projects/${projectId}/tasks`, payload);
  return data;
};

export const updateProjectTask = async (taskId, payload, attachments = []) => {
  const form = new FormData();
  Object.entries(payload || {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null) form.append(key, value);
  });
  attachments.forEach((file) => form.append("attachments", file));
  const { data } = await api.post(`/project-management/tasks/${taskId}/updates`, form);
  return data;
};

export const fetchTaskHistory = async (taskId, page = 1) => {
  const { data } = await api.get(`/project-management/tasks/${taskId}/history`, {
    params: { page },
  });
  return data;
};

export const fetchMilestones = async (projectId) => {
  const { data } = await api.get("/project-management/milestones", {
    params: typeof projectId === "object" ? projectId : projectId ? { projectId } : {},
  });
  return typeof projectId === "object" ? data : data.milestones || [];
};

export const fetchMilestoneDetails = async (milestoneId, activityPage = 1) =>
  (await api.get(`/project-management/milestones/${milestoneId}`, {
    params: { activityPage },
  })).data.milestone;
export const fetchArchivedMilestones = async () =>
  (await api.get("/project-management/milestones-archive")).data.milestones || [];

export const createMilestone = async (projectId, payload) => {
  const { data } = await api.post(
    `/project-management/projects/${projectId}/milestones`,
    payload
  );
  return data;
};

export const updateMilestone = async (milestoneId, payload) => {
  const { data } = await api.patch(`/project-management/milestones/${milestoneId}`, payload);
  return data;
};

export const deleteMilestone = async (milestoneId) => {
  await api.delete(`/project-management/milestones/${milestoneId}`);
};

export const replaceMilestoneTasks = async (milestoneId, taskIds) =>
  (await api.put(`/project-management/milestones/${milestoneId}/tasks`, { taskIds })).data.milestone;
export const replaceMilestoneReports = async (milestoneId, reportIds) =>
  (await api.put(`/project-management/milestones/${milestoneId}/reports`, { reportIds })).data.milestone;
export const replaceMilestoneDependencies = async (milestoneId, dependencyIds) =>
  (await api.put(`/project-management/milestones/${milestoneId}/dependencies`, { dependencyIds })).data.milestone;
export const setMilestoneHealthOverride = async (milestoneId, health, reason) =>
  (await api.post(`/project-management/milestones/${milestoneId}/health-override`, { health, reason })).data.milestone;
export const cancelMilestone = async (milestoneId, reason) =>
  (await api.post(`/project-management/milestones/${milestoneId}/cancel`, { reason })).data.milestone;
export const restoreMilestone = async (milestoneId) =>
  (await api.post(`/project-management/milestones/${milestoneId}/restore`)).data.milestone;
export const createMilestoneRisk = async (milestoneId, payload) =>
  (await api.post(`/project-management/milestones/${milestoneId}/risks`, payload)).data.milestone;
export const updateMilestoneRisk = async (milestoneId, riskId, payload) =>
  (await api.patch(`/project-management/milestones/${milestoneId}/risks/${riskId}`, payload)).data.milestone;
export const deleteMilestoneRisk = async (milestoneId, riskId) =>
  (await api.delete(`/project-management/milestones/${milestoneId}/risks/${riskId}`)).data.milestone;

export const fetchDocuments = async (params = {}) => {
  const normalizedParams =
    typeof params === "string" || typeof params === "number"
      ? { projectId: params }
      : params;
  const { data } = await api.get("/project-management/documents", {
    params: normalizedParams,
  });
  return data;
};

export const fetchDocumentReport = async (params = {}) =>
  (await api.get("/project-management/documents/report", { params })).data;

export const uploadDocument = async (projectId, payload) => {
  const form = new FormData();
  form.append("file", payload.file);
  [
    "name", "description", "category", "customCategory", "discipline",
    "documentDate", "externalReference", "issuePurpose", "responsiblePersonId",
    "responsiblePersonName", "confidentiality", "clientRevisionReference",
    "changeSummary", "remarks",
  ].forEach((key) => {
    if (payload[key] !== undefined && payload[key] !== null) {
      form.append(key, payload[key]);
    }
  });
  form.append("tags", JSON.stringify(payload.tags || []));
  form.append("links", JSON.stringify(payload.links || []));
  const { data } = await api.post(
    `/project-management/projects/${projectId}/documents`,
    form
  );
  return data;
};

export const uploadDocumentRevision = async (documentId, payload) => {
  const form = new FormData();
  form.append("file", payload.file);
  if (payload.name) form.append("name", payload.name);
  if (payload.clientRevisionReference) {
    form.append("clientRevisionReference", payload.clientRevisionReference);
  }
  if (payload.changeSummary) form.append("changeSummary", payload.changeSummary);
  if (payload.remarks) form.append("remarks", payload.remarks);
  const { data } = await api.post(
    `/project-management/documents/${documentId}/revisions`,
    form
  );
  return data;
};

export const approveDocument = (documentId) =>
  api.post(`/project-management/documents/${documentId}/approve`);
export const deleteDocument = (documentId) =>
  api.delete(`/project-management/documents/${documentId}`);
export const fetchDocumentDetails = async (documentId) =>
  (await api.get(`/project-management/documents/${documentId}`)).data.document;
export const updateDocumentDetails = async (documentId, payload) =>
  (await api.patch(`/project-management/documents/${documentId}`, payload)).data.document;
export const replaceDocumentLinks = async (documentId, links) =>
  (await api.put(`/project-management/documents/${documentId}/links`, { links })).data.document;
export const fetchDocumentLinkOptions = async (projectId) =>
  (await api.get("/project-management/documents/link-options", { params: { projectId } })).data.options;
export const submitDocument = async (documentId) =>
  (await api.post(`/project-management/documents/${documentId}/submit`)).data.document;
export const rejectDocument = async (documentId, reason) =>
  (await api.post(`/project-management/documents/${documentId}/reject`, { reason })).data.document;
export const supersedeDocument = async (documentId, reason) =>
  (await api.post(`/project-management/documents/${documentId}/supersede`, { reason })).data.document;
export const restoreDocument = async (documentId) =>
  (await api.post(`/project-management/documents/${documentId}/restore`)).data.document;
export const fetchDocumentRevisions = async (documentId) =>
  (await api.get(`/project-management/documents/${documentId}/revisions`)).data.revisions;
export const fetchDocumentRevisionBlob = async (revisionId) =>
  (await api.get(`/project-management/document-revisions/${revisionId}/download`, {
    responseType: "blob",
  })).data;

export const downloadAuthenticatedFile = async (url, fileName) => {
  const { data } = await api.get(url.replace(/^\/api/, ""), { responseType: "blob" });
  const href = URL.createObjectURL(data);
  const link = document.createElement("a");
  link.href = href;
  link.download = fileName || "download";
  link.click();
  URL.revokeObjectURL(href);
};

export const openAuthenticatedFile = async (url) => {
  const { data } = await api.get(url.replace(/^\/api/, ""), { responseType: "blob" });
  const href = URL.createObjectURL(data);
  window.open(href, "_blank", "noopener,noreferrer");
  window.setTimeout(() => URL.revokeObjectURL(href), 60000);
};

export const fetchDailySiteReports = async () => {
  const { data } = await api.get("/project-management/reports");
  return data.reports || [];
};
export const createDailySiteReport = async (payload) => {
  const { data } = await api.post("/project-management/reports", payload);
  return data.report;
};
export const updateDailySiteReport = async (id, payload) => {
  const { data } = await api.put(`/project-management/reports/${id}`, payload);
  return data.report;
};
export const submitDailySiteReport = async (id) => {
  const { data } = await api.post(`/project-management/reports/${id}/submit`);
  return data.report;
};
export const approveDailySiteReport = async (id, payload) => {
  const { data } = await api.post(`/project-management/reports/${id}/approve`, payload);
  return data.report;
};
export const rejectDailySiteReport = async (id, payload) => {
  const { data } = await api.post(`/project-management/reports/${id}/reject`, payload);
  return data.report;
};
export const deleteDailySiteReport = (id) =>
  api.delete(`/project-management/reports/${id}`);

export const fetchProjectModuleRecords = async (moduleName, params = {}) => {
  const { data } = await api.get(`/project-management/modules/${moduleName}`, {
    params,
  });
  return data.records || [];
};

export const createProjectModuleRecord = async (
  moduleName,
  { projectId = null, externalKey = null, data: record = {} } = {}
) => {
  const { data } = await api.post(`/project-management/modules/${moduleName}`, {
    projectId,
    externalKey,
    data: record,
  });
  return data.record;
};

export const updateProjectModuleRecord = async (
  moduleName,
  recordId,
  { projectId, externalKey, data: record = {} } = {}
) => {
  const { data } = await api.put(
    `/project-management/modules/${moduleName}/${recordId}`,
    { projectId, externalKey, data: record }
  );
  return data.record;
};

export const deleteProjectModuleRecord = (moduleName, recordId) =>
  api.delete(`/project-management/modules/${moduleName}/${recordId}`);

export const uploadProjectModuleAttachments = async (
  moduleName,
  recordId,
  files = [],
  caption = ""
) => {
  const form = new FormData();
  files.forEach((file) => form.append("attachments", file));
  if (caption) form.append("caption", caption);
  const { data } = await api.post(
    `/project-management/modules/${moduleName}/${recordId}/attachments`,
    form
  );
  return data;
};
