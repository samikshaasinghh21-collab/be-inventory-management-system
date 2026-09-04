/* global Buffer, process */
import express from "express";
import fs from "fs/promises";
import multer from "multer";
import path from "path";
import { fileURLToPath } from "url";
import {
  authenticate,
  hasPermission,
  requireEnrollment,
  requireManager,
  requirePermission,
  writeAudit,
} from "./auth.js";
import { getPool, sql } from "./config/db.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadLimit = Number.parseInt(process.env.PM_FILE_MAX_BYTES || "26214400", 10);
const allowedTypes = new Set(
  String(
    process.env.PM_FILE_TYPES ||
      "application/pdf,image/jpeg,image/png,image/webp,application/dwg,application/dxf,application/octet-stream,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.openxmlformats-officedocument.presentationml.presentation,text/plain,text/csv,application/zip,application/x-zip-compressed"
  )
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
);
const allowedExtensions = new Set([
  ".pdf", ".jpg", ".jpeg", ".png", ".webp", ".dwg", ".dxf", ".docx",
  ".xlsx", ".pptx", ".txt", ".csv", ".zip",
]);
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: uploadLimit, files: 8 },
  fileFilter: (_req, file, callback) =>
    allowedTypes.has(file.mimetype) &&
    allowedExtensions.has(path.extname(file.originalname || "").toLowerCase())
      ? callback(null, true)
      : callback(new Error(`Unsupported file type: ${file.originalname}`)),
});

let schemaPromise;
export const ensureProjectManagementSchema = async () => {
  if (!schemaPromise) {
    schemaPromise = (async () => {
      const pool = await getPool();
      for (const fileName of [
        "004-project-management.sql",
        "007-project-management-modules.sql",
        "008-project-document-control.sql",
        "009-milestone-control-center.sql",
        "011-project-stage-task-location-flow.sql",
      ]) {
        const migration = await fs.readFile(
          path.resolve(__dirname, `../migrations/${fileName}`),
          "utf8"
        );
        await pool.request().batch(migration);
      }
    })().catch((error) => {
      schemaPromise = null;
      throw error;
    });
  }
  return schemaPromise;
};

const idValue = (value) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
};
const textValue = (value) => {
  const next = String(value ?? "").trim();
  return next || null;
};
export const projectIdentityValue = (value) =>
  textValue(value)?.toUpperCase() || null;
const jsonValue = (value, fallback = []) => {
  if (Array.isArray(value) || (value && typeof value === "object")) return value;
  try {
    return JSON.parse(value || "null") ?? fallback;
  } catch {
    return fallback;
  }
};
const dateValue = (value) => (value ? new Date(value) : null);
const percentValue = (value) =>
  Math.max(0, Math.min(100, Math.round(Number(value) || 0)));
const serialize = (value) => JSON.stringify(value ?? null);
export const PROJECT_STAGES = Object.freeze(["Design", "Procure", "Implement", "Allocate"]);
const projectStage = (value, fallback = "Design") =>
  PROJECT_STAGES.includes(String(value || "").trim()) ? String(value).trim() : fallback;
const fail = (statusCode, message) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  throw error;
};

const PROJECT_MODULES = Object.freeze({
  "team-allocations": {
    type: "TeamAllocation",
    collection: "teamAllocations",
    permission: "tasks.manage",
  },
  "financial-entries": {
    type: "FinancialEntry",
    collection: "financials",
    permission: "tasks.manage",
  },
  "inventory-allocations": {
    type: "InventoryAllocation",
    collection: "inventoryAllocations",
    permission: "inventory.manage",
  },
  "project-purchases": {
    type: "ProjectPurchase",
    collection: "purchases",
    permission: "procurement.manage",
  },
  "purchase-follow-ups": {
    type: "PurchaseFollowUp",
    collection: null,
    permission: "procurement.manage",
  },
});

const moduleRecordFromRow = (row = {}) => ({
  ...jsonValue(row.DataJson, {}),
  id: row.RecordId,
  projectId: row.ProjectId,
  moduleType: row.ModuleType,
  externalKey: row.ExternalKey || undefined,
  createdAt: row.CreatedAt,
  updatedAt: row.UpdatedAt,
  attachments: jsonValue(row.AttachmentsJson, []).map((attachment) => ({
    ...attachment,
    downloadUrl: `/api/project-management/module-attachments/${attachment.id}`,
  })),
});

const getModule = (value) => PROJECT_MODULES[String(value || "").trim()] || null;

const loadModuleRecords = async ({ moduleType = null, projectId = null } = {}) => {
  const pool = await getPool();
  const result = await pool.request()
    .input("ModuleType", sql.NVarChar(50), moduleType)
    .input("ProjectId", sql.Int, projectId)
    .query(`
      SELECT r.*,
        (
          SELECT a.AttachmentId AS id,a.FileName AS name,a.ContentType AS type,
            a.FileSize AS size,a.Caption AS caption,a.UploadedAt AS uploadedAt
          FROM dbo.ProjectModuleAttachments a
          WHERE a.RecordId=r.RecordId AND a.IsDeleted=0
          ORDER BY a.AttachmentId
          FOR JSON PATH
        ) AS AttachmentsJson
      FROM dbo.ProjectModuleRecords r
      WHERE r.IsDeleted=0
        AND (@ModuleType IS NULL OR r.ModuleType=@ModuleType)
        AND (@ProjectId IS NULL OR r.ProjectId=@ProjectId)
      ORDER BY r.UpdatedAt DESC,r.RecordId DESC
    `);
  return result.recordset.map(moduleRecordFromRow);
};

export const calculateAverageProgress = (tasks = []) => {
  const active = tasks.filter((task) => task.status !== "Cancelled");
  if (!active.length) return 0;
  return Math.round(
    active.reduce(
      (sum, task) =>
        sum + percentValue(task.completionPercentage ?? task.progress),
      0
    ) / active.length
  );
};

export const buildMilestoneNumber = (projectCode, projectId, sequence) => {
  const safeCode = String(projectCode || "")
    .replace(/[^a-z0-9]/gi, "")
    .toUpperCase() || String(projectId || "PROJECT");
  return `MS-${safeCode}-${String(sequence || 1).padStart(4, "0")}`;
};

export const milestoneStatus = (progress, isCancelled = false) =>
  isCancelled
    ? "Cancelled"
    : Number(progress) >= 100
      ? "Completed"
      : Number(progress) > 0
        ? "Partial"
        : "Pending";

const dateOnly = (value) => {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? null
    : Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate());
};

export const calculateMilestoneHealth = ({
  progress = 0,
  startDate,
  targetDate,
  openBlockingCount = 0,
  healthOverride,
  isCancelled = false,
  now = new Date(),
} = {}) => {
  if (isCancelled) return { health: "Cancelled", calculatedHealth: "Cancelled", reason: "Milestone is cancelled" };
  if (Number(progress) >= 100) return { health: "Completed", calculatedHealth: "Completed", reason: "All linked task progress is complete" };
  const today = dateOnly(now);
  const start = dateOnly(startDate);
  const target = dateOnly(targetDate);
  let calculatedHealth = "On Track";
  let reason = "Progress is within the planned schedule";
  if (target !== null && today > target) {
    calculatedHealth = "Overdue";
    reason = "Target date has passed";
  } else if (Number(openBlockingCount) > 0) {
    calculatedHealth = "At Risk";
    reason = "An unresolved high-severity risk or blocker exists";
  } else if (start !== null && target !== null && target > start && today > start) {
    const expected = Math.max(0, Math.min(100, ((today - start) / (target - start)) * 100));
    if (expected - Number(progress) > 10) {
      calculatedHealth = "At Risk";
      reason = `Progress is ${Math.round(expected - Number(progress))} points behind schedule`;
    }
  }
  return {
    health: healthOverride || calculatedHealth,
    calculatedHealth,
    reason: healthOverride ? "Manual health override is active" : reason,
  };
};

export const normalizeReportTaskStatus = (status) =>
  status === "Work in Progress" ? "Partial" : status;

export const normalizeTaskUpdate = (input = {}, current = {}) => {
  const status = String(input.status ?? current.status ?? "Pending").trim();
  if (!["Pending", "Partial", "Completed", "Cancelled"].includes(status)) {
    const error = new Error("Status must be Pending, Partial, Completed, or Cancelled");
    error.statusCode = 400;
    throw error;
  }
  let completionPercentage = percentValue(
    input.completionPercentage ?? input.progress ?? current.completionPercentage ?? current.progress
  );
  const remainingWorkRemarks = textValue(
    input.remainingWorkRemarks ?? current.remainingWorkRemarks
  );
  if (status === "Pending") completionPercentage = 0;
  if (status === "Completed") completionPercentage = 100;
  if (status === "Partial") {
    if (completionPercentage < 1 || completionPercentage > 99) {
      const error = new Error("Partial tasks require a completion percentage from 1 to 99");
      error.statusCode = 400;
      throw error;
    }
    if (!remainingWorkRemarks) {
      const error = new Error("Remaining-work remarks are required for Partial tasks");
      error.statusCode = 400;
      throw error;
    }
  }
  return {
    status,
    completionPercentage,
    remainingWorkRemarks,
    progressRemarks: textValue(input.progressRemarks),
    remarks: textValue(input.remarks ?? current.remarks),
    assignedEmployeeId: idValue(input.assignedEmployeeId ?? current.assignedEmployeeId),
    assignedEmployeeName: textValue(
      input.assignedEmployeeName ?? input.assignedTo ?? current.assignedEmployeeName
    ),
    dueDate: input.dueDate !== undefined ? dateValue(input.dueDate) : current.dueDate,
  };
};

const taskFromRow = (row = {}) => ({
  ...jsonValue(row.TaskDataJson, {}),
  id: row.TaskId,
  taskId: `TSK-${String(row.TaskId || 0).padStart(4, "0")}`,
  projectId: row.ProjectId,
  milestoneId: row.MilestoneId || null,
  milestoneName: row.MilestoneName || "",
  milestoneNumber: row.MilestoneNumber || "",
  stage: row.Stage || "",
  taskName: row.TaskName,
  title: row.TaskName,
  description: row.Description || "",
  status: row.Status,
  completionPercentage: Number(row.CompletionPercentage || 0),
  progress: Number(row.CompletionPercentage || 0),
  remainingWorkRemarks: row.RemainingWorkRemarks || "",
  remarks: row.Remarks || "",
  assignedEmployeeId: row.AssignedEmployeeId,
  assignedEmployeeName: row.AssignedEmployeeName || "",
  assignedTo: row.AssignedEmployeeName || "",
  startDate: row.StartDate,
  dueDate: row.DueDate,
  priority: row.Priority || "Medium",
  createdAt: row.CreatedAt,
  updatedAt: row.UpdatedAt,
});

const milestoneFromRow = (row = {}) => {
  const progress = Number(row.Progress || 0);
  const health = calculateMilestoneHealth({
    progress,
    startDate: row.StartDate,
    targetDate: row.TargetDate,
    openBlockingCount: row.OpenBlockingCount,
    healthOverride: row.HealthOverride,
    isCancelled: row.IsCancelled,
  });
  return {
    id: row.MilestoneId,
    milestoneNumber: row.MilestoneNumber || `MS-${row.MilestoneId}`,
    projectId: row.ProjectId,
    stage: projectStage(row.Stage, "Implement"),
    name: row.MilestoneName,
    description: row.Description || "",
    priority: row.Priority || "Medium",
    deliverable: row.Deliverable || "",
    acceptanceCriteria: row.AcceptanceCriteria || "",
    baselineStartDate: row.BaselineStartDate,
    baselineTargetDate: row.BaselineTargetDate,
    startDate: row.StartDate,
    targetDate: row.TargetDate,
    actualStartDate: row.ActualStartDate,
    actualCompletionDate: row.ActualCompletionDate,
    notes: row.Notes || "",
    responsiblePersonId: row.ResponsiblePersonId,
    responsiblePerson: row.ResponsiblePersonName || "",
    owner: row.ResponsiblePersonName || "",
    taskIds: jsonValue(row.TaskIdsJson, []),
    linkedTasks: jsonValue(row.TaskIdsJson, []),
    progress,
    status: milestoneStatus(progress, row.IsCancelled),
    health: health.health,
    calculatedHealth: health.calculatedHealth,
    healthReason: health.reason,
    healthOverride: row.HealthOverride || "",
    healthOverrideReason: row.HealthOverrideReason || "",
    taskCount: Number(row.TaskCount || 0),
    reportCount: Number(row.ReportCount || 0),
    documentCount: Number(row.DocumentCount || 0),
    openRiskCount: Number(row.OpenRiskCount || 0),
    isDeleted: Boolean(row.IsDeleted),
    cancellationReason: row.CancellationReason || "",
    createdAt: row.CreatedAt,
    updatedAt: row.UpdatedAt,
  };
};

const progressSummary = async (request, projectId) => {
  const result = await request
    .input("SummaryProjectId", sql.Int, projectId)
    .query(`
      SELECT CAST(COALESCE(AVG(CASE WHEN Status <> N'Cancelled'
        THEN CAST(CompletionPercentage AS DECIMAL(10,2)) END), 0) AS INT) AS ProjectProgress
      FROM dbo.ProjectTasks WHERE ProjectId = @SummaryProjectId;
      SELECT m.MilestoneId,
        CAST(COALESCE(AVG(CASE WHEN t.Status <> N'Cancelled'
          THEN CAST(t.CompletionPercentage AS DECIMAL(10,2)) END), 0) AS INT) AS Progress
      FROM dbo.ProjectMilestones m
      LEFT JOIN dbo.MilestoneTasks mt ON mt.MilestoneId = m.MilestoneId
      LEFT JOIN dbo.ProjectTasks t ON t.TaskId = mt.TaskId
      WHERE m.ProjectId = @SummaryProjectId
      GROUP BY m.MilestoneId;
    `);
  return {
    projectProgress: Number(result.recordsets?.[0]?.[0]?.ProjectProgress || 0),
    milestoneProgress: Object.fromEntries(
      (result.recordsets?.[1] || []).map((row) => [row.MilestoneId, Number(row.Progress || 0)])
    ),
  };
};

const writeTaskUpdate = async (transaction, taskId, input, files, user) => {
  const existingResult = await new sql.Request(transaction)
    .input("TaskId", sql.Int, taskId)
    .query(`SELECT * FROM dbo.ProjectTasks WITH (UPDLOCK, ROWLOCK) WHERE TaskId = @TaskId`);
  const row = existingResult.recordset?.[0];
  if (!row) {
    const error = new Error("Task not found");
    error.statusCode = 404;
    throw error;
  }
  const before = taskFromRow(row);
  const next = normalizeTaskUpdate(input, before);
  const updatedResult = await new sql.Request(transaction)
    .input("TaskId", sql.Int, taskId)
    .input("Status", sql.NVarChar(20), next.status)
    .input("CompletionPercentage", sql.Int, next.completionPercentage)
    .input("RemainingWorkRemarks", sql.NVarChar(sql.MAX), next.remainingWorkRemarks)
    .input("Remarks", sql.NVarChar(sql.MAX), next.remarks)
    .input("AssignedEmployeeId", sql.Int, next.assignedEmployeeId)
    .input("AssignedEmployeeName", sql.NVarChar(200), next.assignedEmployeeName)
    .input("DueDate", sql.Date, next.dueDate)
    .input("UpdatedBy", sql.Int, user.id)
    .query(`
      UPDATE dbo.ProjectTasks SET Status=@Status, CompletionPercentage=@CompletionPercentage,
        RemainingWorkRemarks=@RemainingWorkRemarks, Remarks=@Remarks,
        AssignedEmployeeId=@AssignedEmployeeId, AssignedEmployeeName=@AssignedEmployeeName,
        DueDate=@DueDate, UpdatedBy=@UpdatedBy, UpdatedAt=SYSUTCDATETIME()
      OUTPUT INSERTED.* WHERE TaskId=@TaskId
    `);
  const after = taskFromRow(updatedResult.recordset[0]);
  const changedFields = Object.keys(after).filter(
    (key) => serialize(before[key]) !== serialize(after[key])
  );
  const updateResult = await new sql.Request(transaction)
    .input("TaskId", sql.Int, taskId)
    .input("ChangedFieldsJson", sql.NVarChar(sql.MAX), serialize(changedFields))
    .input("BeforeJson", sql.NVarChar(sql.MAX), serialize(before))
    .input("AfterJson", sql.NVarChar(sql.MAX), serialize(after))
    .input("ProgressRemarks", sql.NVarChar(sql.MAX), next.progressRemarks)
    .input("GeneralRemarks", sql.NVarChar(sql.MAX), textValue(input.generalRemarks))
    .input("UpdatedBy", sql.Int, user.id)
    .query(`
      INSERT dbo.TaskUpdates
        (TaskId,ChangedFieldsJson,BeforeJson,AfterJson,ProgressRemarks,GeneralRemarks,UpdatedBy)
      OUTPUT INSERTED.TaskUpdateId
      VALUES
        (@TaskId,@ChangedFieldsJson,@BeforeJson,@AfterJson,@ProgressRemarks,@GeneralRemarks,@UpdatedBy)
    `);
  const taskUpdateId = updateResult.recordset[0].TaskUpdateId;
  for (const file of files || []) {
    await new sql.Request(transaction)
      .input("TaskUpdateId", sql.Int, taskUpdateId)
      .input("FileName", sql.NVarChar(255), file.originalname)
      .input("ContentType", sql.NVarChar(150), file.mimetype)
      .input("FileSize", sql.Int, file.size)
      .input("FileData", sql.VarBinary(sql.MAX), file.buffer)
      .query(`
        INSERT dbo.TaskUpdateAttachments
          (TaskUpdateId,FileName,ContentType,FileSize,FileData)
        VALUES (@TaskUpdateId,@FileName,@ContentType,@FileSize,@FileData)
      `);
  }
  await syncMilestoneCompletion(transaction, row.ProjectId);
  return { task: after, projectId: row.ProjectId, taskUpdateId };
};

const replaceMilestoneTasks = async (transaction, milestoneId, projectId, taskIds = []) => {
  const normalized = [...new Set((taskIds || []).map(idValue).filter(Boolean))];
  if (normalized.length) {
    const result = await new sql.Request(transaction)
      .input("ProjectId", sql.Int, projectId)
      .input("TaskIds", sql.NVarChar(sql.MAX), serialize(normalized))
      .query(`
        SELECT TaskId FROM dbo.ProjectTasks
        WHERE ProjectId=@ProjectId AND TaskId IN (SELECT TRY_CONVERT(INT,value) FROM OPENJSON(@TaskIds))
      `);
    if (result.recordset.length !== normalized.length) {
      const error = new Error("Every linked task must belong to the milestone project");
      error.statusCode = 400;
      throw error;
    }
  }
  const currentResult = await new sql.Request(transaction)
    .input("MilestoneId", sql.Int, milestoneId)
    .query(`SELECT TaskId FROM dbo.MilestoneTasks WHERE MilestoneId=@MilestoneId`);
  const removed = currentResult.recordset
    .map((row) => Number(row.TaskId))
    .filter((taskId) => !normalized.includes(taskId));
  if (removed.length) {
    fail(409, "Tasks cannot be left without a milestone. Move them to another milestone first");
  }
  if (normalized.length) {
    await new sql.Request(transaction)
      .input("TaskIds", sql.NVarChar(sql.MAX), serialize(normalized))
      .query(`DELETE dbo.MilestoneTasks
        WHERE TaskId IN (SELECT TRY_CONVERT(INT,value) FROM OPENJSON(@TaskIds))`);
  }
  for (const taskId of normalized) {
    await new sql.Request(transaction)
      .input("MilestoneId", sql.Int, milestoneId)
      .input("TaskId", sql.Int, taskId)
      .query(`INSERT dbo.MilestoneTasks (MilestoneId,TaskId) VALUES (@MilestoneId,@TaskId)`);
  }
};

const replaceMilestoneReports = async (transaction, milestoneId, projectId, reportIds = [], userId) => {
  const normalized = [...new Set((reportIds || []).map(idValue).filter(Boolean))];
  if (normalized.length) {
    const result = await new sql.Request(transaction)
      .input("ProjectId", sql.Int, projectId)
      .input("Ids", sql.NVarChar(sql.MAX), serialize(normalized))
      .query(`SELECT ReportId FROM dbo.DailySiteReports
        WHERE ProjectId=@ProjectId AND ReportId IN (SELECT TRY_CONVERT(INT,value) FROM OPENJSON(@Ids))`);
    if (result.recordset.length !== normalized.length) fail(400, "Every linked report must belong to the milestone project");
  }
  await new sql.Request(transaction).input("MilestoneId", sql.Int, milestoneId)
    .query(`DELETE dbo.MilestoneReportLinks WHERE MilestoneId=@MilestoneId`);
  for (const reportId of normalized) {
    await new sql.Request(transaction).input("MilestoneId", sql.Int, milestoneId)
      .input("ReportId", sql.Int, reportId).input("UserId", sql.Int, userId)
      .query(`INSERT dbo.MilestoneReportLinks(MilestoneId,ReportId,CreatedBy)
        VALUES(@MilestoneId,@ReportId,@UserId)`);
  }
};

const replaceReportMilestones = async (transaction, reportId, projectId, milestoneIds = [], userId) => {
  const normalized = [...new Set((milestoneIds || []).map(idValue).filter(Boolean))];
  if (normalized.length) {
    const result = await new sql.Request(transaction).input("ProjectId", sql.Int, projectId)
      .input("Ids", sql.NVarChar(sql.MAX), serialize(normalized)).query(`
        SELECT MilestoneId FROM dbo.ProjectMilestones
        WHERE ProjectId=@ProjectId AND IsDeleted=0
          AND MilestoneId IN (SELECT TRY_CONVERT(INT,value) FROM OPENJSON(@Ids))`);
    if (result.recordset.length !== normalized.length) fail(400, "Every selected milestone must belong to the report project");
  }
  await new sql.Request(transaction).input("ReportId", sql.Int, reportId)
    .query(`DELETE dbo.MilestoneReportLinks WHERE ReportId=@ReportId`);
  for (const milestoneId of normalized) {
    await new sql.Request(transaction).input("MilestoneId", sql.Int, milestoneId)
      .input("ReportId", sql.Int, reportId).input("UserId", sql.Int, userId)
      .query(`INSERT dbo.MilestoneReportLinks(MilestoneId,ReportId,CreatedBy)
        VALUES(@MilestoneId,@ReportId,@UserId)`);
  }
};

export const hasDependencyCycle = (edges = []) => {
  const graph = new Map();
  edges.forEach(([from, to]) => {
    if (!graph.has(from)) graph.set(from, []);
    graph.get(from).push(to);
  });
  const visiting = new Set();
  const visited = new Set();
  const visit = (node) => {
    if (visiting.has(node)) return true;
    if (visited.has(node)) return false;
    visiting.add(node);
    for (const next of graph.get(node) || []) if (visit(next)) return true;
    visiting.delete(node);
    visited.add(node);
    return false;
  };
  return [...graph.keys()].some(visit);
};

const replaceMilestoneDependencies = async (transaction, milestoneId, projectId, dependencyIds = [], userId) => {
  const normalized = [...new Set((dependencyIds || []).map(idValue).filter(Boolean))];
  if (normalized.includes(milestoneId)) fail(400, "A milestone cannot depend on itself");
  if (normalized.length) {
    const valid = await new sql.Request(transaction).input("ProjectId", sql.Int, projectId)
      .input("Ids", sql.NVarChar(sql.MAX), serialize(normalized))
      .query(`SELECT MilestoneId FROM dbo.ProjectMilestones WHERE ProjectId=@ProjectId AND IsDeleted=0
        AND MilestoneId IN (SELECT TRY_CONVERT(INT,value) FROM OPENJSON(@Ids))`);
    if (valid.recordset.length !== normalized.length) fail(400, "Every dependency must belong to the milestone project");
  }
  const existing = await new sql.Request(transaction).input("MilestoneId", sql.Int, milestoneId)
    .query(`SELECT MilestoneId,DependsOnMilestoneId FROM dbo.MilestoneDependencies WHERE MilestoneId<>@MilestoneId`);
  const edges = existing.recordset.map((row) => [row.MilestoneId, row.DependsOnMilestoneId]);
  edges.push(...normalized.map((dependencyId) => [milestoneId, dependencyId]));
  if (hasDependencyCycle(edges)) fail(409, "Milestone dependencies cannot contain a cycle");
  await new sql.Request(transaction).input("MilestoneId", sql.Int, milestoneId)
    .query(`DELETE dbo.MilestoneDependencies WHERE MilestoneId=@MilestoneId`);
  for (const dependencyId of normalized) {
    await new sql.Request(transaction).input("MilestoneId", sql.Int, milestoneId)
      .input("DependencyId", sql.Int, dependencyId).input("UserId", sql.Int, userId)
      .query(`INSERT dbo.MilestoneDependencies(MilestoneId,DependsOnMilestoneId,CreatedBy)
        VALUES(@MilestoneId,@DependencyId,@UserId)`);
  }
};

const syncMilestoneCompletion = async (transaction, projectId) => {
  await new sql.Request(transaction).input("ProjectId", sql.Int, projectId).query(`
    UPDATE m SET ActualCompletionDate=CASE
      WHEN m.IsCancelled=0 AND COALESCE(p.Progress,0)>=100
        THEN COALESCE(m.ActualCompletionDate,CONVERT(DATE,SYSUTCDATETIME()))
      ELSE NULL END,
      ActualStartDate=CASE WHEN COALESCE(p.Progress,0)>0
        THEN COALESCE(m.ActualStartDate,CONVERT(DATE,SYSUTCDATETIME()))
        ELSE m.ActualStartDate END
    FROM dbo.ProjectMilestones m
    OUTER APPLY (
      SELECT AVG(CAST(t.CompletionPercentage AS DECIMAL(10,2))) AS Progress
      FROM dbo.MilestoneTasks mt JOIN dbo.ProjectTasks t ON t.TaskId=mt.TaskId
      WHERE mt.MilestoneId=m.MilestoneId AND t.Status<>N'Cancelled'
    ) p
    WHERE m.ProjectId=@ProjectId AND m.IsDeleted=0;
  `);
};

const cleanProjectLocationIds = (payload = {}) => {
  const candidates = [
    ...(Array.isArray(payload.locationIds) ? payload.locationIds : []),
    ...(Array.isArray(payload.locations)
      ? payload.locations.map((location) => location?.id ?? location?.locationId ?? location)
      : []),
    payload.locationId,
  ];
  return [...new Set(candidates.map(idValue).filter(Boolean))];
};

const syncProjectLocations = async (transaction, projectId, payload = {}) => {
  const locationIds = cleanProjectLocationIds(payload);
  if (locationIds.length) {
    const valid = await new sql.Request(transaction)
      .input("LocationIds", sql.NVarChar(sql.MAX), serialize(locationIds))
      .query(`SELECT LocationId FROM dbo.Locations
        WHERE LocationId IN (SELECT TRY_CONVERT(INT,value) FROM OPENJSON(@LocationIds))`);
    if (valid.recordset.length !== locationIds.length) {
      fail(400, "Every location must be a valid location record");
    }
  }
  await new sql.Request(transaction)
    .input("ProjectId", sql.Int, projectId)
    .query(`DELETE dbo.ProjectLocations WHERE ProjectId=@ProjectId`);
  for (const [index, locationId] of locationIds.entries()) {
    await new sql.Request(transaction)
      .input("ProjectId", sql.Int, projectId)
      .input("LocationId", sql.Int, locationId)
      .input("IsPrimary", sql.Bit, index === 0)
      .query(`INSERT dbo.ProjectLocations(ProjectId,LocationId,IsPrimary)
        VALUES(@ProjectId,@LocationId,@IsPrimary)`);
  }
};
const loadProjectGraphs = async (projectId = null) => {
  const pool = await getPool();
  const request = pool.request().input("ProjectId", sql.Int, projectId);
  const result = await request.query(`
    SELECT p.*,
      CAST(COALESCE((SELECT AVG(CAST(t.CompletionPercentage AS DECIMAL(10,2)))
        FROM dbo.ProjectTasks t WHERE t.ProjectId=p.ProjectId AND t.Status<>N'Cancelled'),0) AS INT) AS Progress,
      COALESCE((
        SELECT l.LocationId AS id,l.Name AS name,l.Code AS code,l.Type AS type,
          l.Manager AS manager,l.Phone AS phone,l.Address AS address,l.Status AS status,
          pl.IsPrimary AS isPrimary
        FROM dbo.ProjectLocations pl JOIN dbo.Locations l ON l.LocationId=pl.LocationId
        WHERE pl.ProjectId=p.ProjectId
        ORDER BY pl.IsPrimary DESC,l.Name FOR JSON PATH
      ),N'[]') AS LocationsJson
    FROM dbo.Projects p
    WHERE @ProjectId IS NULL OR p.ProjectId=@ProjectId
    ORDER BY p.ProjectId DESC;
    SELECT t.*,mt.MilestoneId,m.MilestoneName,m.MilestoneNumber,m.Stage
    FROM dbo.ProjectTasks t
    LEFT JOIN dbo.MilestoneTasks mt ON mt.TaskId=t.TaskId
    LEFT JOIN dbo.ProjectMilestones m ON m.MilestoneId=mt.MilestoneId
    WHERE @ProjectId IS NULL OR t.ProjectId=@ProjectId ORDER BY t.TaskId DESC;
    SELECT m.*,
      CAST(COALESCE((
        SELECT AVG(CAST(t.CompletionPercentage AS DECIMAL(10,2)))
        FROM dbo.MilestoneTasks mt JOIN dbo.ProjectTasks t ON t.TaskId=mt.TaskId
        WHERE mt.MilestoneId=m.MilestoneId AND t.Status<>N'Cancelled'
      ),0) AS INT) AS Progress,
      COALESCE((
        SELECT mt.TaskId AS [value] FROM dbo.MilestoneTasks mt
        WHERE mt.MilestoneId=m.MilestoneId ORDER BY mt.TaskId FOR JSON PATH
      ),N'[]') AS TaskIdsObjectJson,
      CONCAT(N'[',COALESCE((
        SELECT STRING_AGG(CONVERT(NVARCHAR(MAX),mt.TaskId),N',')
        FROM dbo.MilestoneTasks mt WHERE mt.MilestoneId=m.MilestoneId
      ),N''),N']') AS TaskIdsJson,
      (SELECT COUNT(*) FROM dbo.MilestoneTasks mt WHERE mt.MilestoneId=m.MilestoneId) AS TaskCount,
      (SELECT COUNT(*) FROM dbo.MilestoneRisksIssues ri WHERE ri.MilestoneId=m.MilestoneId AND ri.IsDeleted=0 AND ri.Status NOT IN (N'Resolved',N'Closed')) AS OpenRiskCount,
      (SELECT COUNT(*) FROM dbo.MilestoneRisksIssues ri WHERE ri.MilestoneId=m.MilestoneId AND ri.IsDeleted=0
        AND ri.Status NOT IN (N'Resolved',N'Closed') AND ri.Severity IN (N'High',N'Critical')) AS OpenBlockingCount,
      (SELECT COUNT(*) FROM dbo.DocumentLinks dl JOIN dbo.ProjectDocuments d ON d.DocumentId=dl.DocumentId
        WHERE dl.LinkType=N'Milestone' AND dl.LinkId=CONVERT(NVARCHAR(100),m.MilestoneId) AND d.IsDeleted=0) AS DocumentCount,
      (SELECT COUNT(*) FROM (
        SELECT mrl.ReportId FROM dbo.MilestoneReportLinks mrl WHERE mrl.MilestoneId=m.MilestoneId
        UNION
        SELECT drt.ReportId FROM dbo.MilestoneTasks mt
          JOIN dbo.DailySiteReportTasks drt ON drt.TaskId=mt.TaskId
          WHERE mt.MilestoneId=m.MilestoneId
      ) linkedReports) AS ReportCount
    FROM dbo.ProjectMilestones m
    WHERE m.IsDeleted=0 AND (@ProjectId IS NULL OR m.ProjectId=@ProjectId);
  `);
  const projects = (result.recordsets?.[0] || []).map((row) => {
    const legacy = jsonValue(row.ManagementDataJson, {});
    const locations = jsonValue(row.LocationsJson, []);
    return ({
    ...legacy,
    id: row.ProjectId,
    name: row.ProjectName ?? row.projectName ?? "",
    code: row.ProjectCode || "",
    customerId: row.CustomerId,
    client: row.Client || row.ClientCompany || "",
    companyName: row.ClientCompany || "",
    department: row.Department || legacy.department || "",
    address: row.ClientAddress || "",
    status: row.Status ?? row.status ?? "Draft",
    startDate: row.StartDate ?? row.startDate ?? null,
    endDate: row.EndDate ?? row.endDate ?? null,
    notes: row.Notes || "",
    locations,
    locationIds: locations.map((location) => location.id),
    locationId: locations[0]?.id || legacy.locationId || null,
    siteName: locations[0]?.name || legacy.siteName || "",
    progress: Number(row.Progress || 0),
    tasks: [],
    milestones: [],
    siteReports: [],
    documents: [],
  });
  });
  const byId = new Map(projects.map((project) => [project.id, project]));
  (result.recordsets?.[1] || []).forEach((row) =>
    byId.get(row.ProjectId)?.tasks.push(taskFromRow(row))
  );
  (result.recordsets?.[2] || []).forEach((row) =>
    byId.get(row.ProjectId)?.milestones.push(milestoneFromRow(row))
  );
  const moduleRecords = await loadModuleRecords({ projectId });
  const collectionByType = Object.fromEntries(
    Object.values(PROJECT_MODULES)
      .filter((module) => module.collection)
      .map((module) => [module.type, module.collection])
  );
  moduleRecords.forEach((record) => {
    const collection = collectionByType[record.moduleType];
    const project = byId.get(record.projectId);
    if (project && collection) {
      if (!Array.isArray(project[collection])) project[collection] = [];
      project[collection].push(record);
    }
  });
  return projects;
};

const dataUrlFile = (photo) => {
  const match = /^data:([^;]+);base64,(.+)$/i.exec(String(photo?.dataUrl || ""));
  if (!match) return null;
  const buffer = Buffer.from(match[2], "base64");
  return {
    name: textValue(photo.name) || "attachment",
    type: match[1],
    buffer,
    category: textValue(photo.category),
    caption: textValue(photo.caption),
  };
};

const reportDataPayload = (input = {}) => {
  const {
    taskRows: _taskRows,
    manpowerRows: _manpowerRows,
    materialRows: _materialRows,
    equipmentRows: _equipmentRows,
    safetyRows: _safetyRows,
    qualityRows: _qualityRows,
    issueRows: _issueRows,
    visitorRows: _visitorRows,
    photos: _photos,
    attachments: _attachments,
    ...metadata
  } = input;
  return metadata;
};

const reportFromRow = (row = {}) => {
  const reportData = jsonValue(row.ReportDataJson, {});
  return {
    ...reportData,
    id: row.ReportId,
    reportNumber: row.ReportNumber,
    projectId: row.ProjectId,
    projectName: row.ResolvedProjectName ?? row.ProjectName ?? "",
    reportDate: row.ReportDate,
    siteName: row.SiteName || "",
    shift: row.Shift || "General",
    weather: row.Weather || "Clear",
    summary: reportData.summary || row.WorkPerformed || "",
    workCompleted: row.WorkPerformed || "",
    tomorrowPlan: row.TomorrowPlan || "",
    delays: row.IssuesDelays || "",
    status: row.Status,
    managerRemarks: row.ManagerRemarks || "",
    preparedBy: reportData.preparedBy || row.SubmittedByName || "",
    submittedAt: row.SubmittedAt,
    approvedBy: row.ApprovedByName || "",
    approvedAt: row.ApprovedAt,
    rejectionReason: row.RejectionReason || "",
    createdAt: row.CreatedAt,
    updatedAt: row.UpdatedAt,
    taskRows: [],
    manpowerRows: [],
    materialRows: [],
    equipmentRows: [],
    safetyRows: [],
    qualityRows: [],
    issueRows: [],
    visitorRows: [],
    photos: [],
    attachments: [],
  };
};

const loadReports = async (reportId = null, projectId = null) => {
  const pool = await getPool();
  const result = await pool.request()
    .input("ReportId", sql.Int, reportId)
    .input("ReportProjectId", sql.Int, projectId)
    .query(`
    SELECT r.*,p.ProjectName AS ResolvedProjectName,s.FullName AS SubmittedByName,a.FullName AS ApprovedByName
    FROM dbo.DailySiteReports r JOIN dbo.Projects p ON p.ProjectId=r.ProjectId
    JOIN dbo.AppUsers s ON s.UserId=r.SubmittedBy
    LEFT JOIN dbo.AppUsers a ON a.UserId=r.ApprovedBy
    WHERE (@ReportId IS NULL OR r.ReportId=@ReportId)
      AND (@ReportProjectId IS NULL OR r.ProjectId=@ReportProjectId)
    ORDER BY r.ReportDate DESC,r.ReportId DESC;
    SELECT rt.*,t.TaskName,t.AssignedEmployeeName FROM dbo.DailySiteReportTasks rt
    JOIN dbo.ProjectTasks t ON t.TaskId=rt.TaskId
    JOIN dbo.DailySiteReports r ON r.ReportId=rt.ReportId
    WHERE (@ReportId IS NULL OR rt.ReportId=@ReportId)
      AND (@ReportProjectId IS NULL OR r.ProjectId=@ReportProjectId);
    SELECT d.* FROM dbo.DailySiteReportDetails d
    JOIN dbo.DailySiteReports r ON r.ReportId=d.ReportId
    WHERE (@ReportId IS NULL OR d.ReportId=@ReportId)
      AND (@ReportProjectId IS NULL OR r.ProjectId=@ReportProjectId);
    SELECT AttachmentId,ReportId,FileName,ContentType,FileSize,Category,Caption,UploadedAt
    FROM dbo.DailySiteReportAttachments a
    WHERE (@ReportId IS NULL OR a.ReportId=@ReportId)
      AND (@ReportProjectId IS NULL OR EXISTS(
        SELECT 1 FROM dbo.DailySiteReports r
        WHERE r.ReportId=a.ReportId AND r.ProjectId=@ReportProjectId
      ));
    SELECT l.MilestoneReportLinkId,l.MilestoneId,l.ReportId FROM dbo.MilestoneReportLinks l
    WHERE (@ReportId IS NULL OR l.ReportId=@ReportId)
      AND (@ReportProjectId IS NULL OR EXISTS(
        SELECT 1 FROM dbo.DailySiteReports r
        WHERE r.ReportId=l.ReportId AND r.ProjectId=@ReportProjectId
      ));
  `);
  const reports = (result.recordsets[0] || []).map(reportFromRow);
  const byId = new Map(reports.map((report) => [report.id, report]));
  (result.recordsets[1] || []).forEach((row) =>
    byId.get(row.ReportId)?.taskRows.push({
      id: row.ReportTaskId,
      taskId: row.TaskId,
      taskName: row.TaskName,
      owner: row.AssignedEmployeeName || "",
      status: row.Status,
      reportedProgress: row.CompletionPercentage,
      previousProgress: row.CompletionPercentage,
      workCompleted: row.WorkPerformed || "",
      remainingWorkRemarks: row.RemainingWorkRemarks || "",
      blockers: row.RemainingWorkRemarks || "",
      hours: row.Hours,
    })
  );
  (result.recordsets[2] || []).forEach((row) => {
    const report = byId.get(row.ReportId);
    if (!report) return;
    const key = {
      Labour: "manpowerRows",
      Material: "materialRows",
      Equipment: "equipmentRows",
      Issue: "issueRows",
      Safety: "safetyRows",
      Quality: "qualityRows",
      Visitor: "visitorRows",
    }[row.DetailType];
    if (key) report[key] = jsonValue(row.DataJson, []);
  });
  (result.recordsets[3] || []).forEach((row) => {
    const report = byId.get(row.ReportId);
    if (!report) return;
    const collection = String(row.ContentType || "").startsWith("image/")
      ? report.photos
      : report.attachments;
    collection.push({
      id: row.AttachmentId,
      name: row.FileName,
      type: row.ContentType,
      size: row.FileSize,
      category: row.Category,
      caption: row.Caption,
      downloadUrl: `/api/project-management/reports/attachments/${row.AttachmentId}`,
    });
  });
  (result.recordsets[4] || []).forEach((row) => {
    const report = byId.get(row.ReportId);
    if (!report) return;
    if (!report.milestoneIds) report.milestoneIds = [];
    report.milestoneIds.push(row.MilestoneId);
  });
  reports.forEach((report) => {
    if (!report.milestoneIds) report.milestoneIds = [];
  });
  return reports;
};

export const DOCUMENT_CATEGORIES = Object.freeze([
  "Drawing", "Contract", "BOQ", "Specification", "Method Statement", "Report",
  "Site Photo", "Invoice", "Certificate", "Manual", "Correspondence", "Other",
]);
const DOCUMENT_LINK_TYPES = new Set([
  "Site", "Task", "Milestone", "DailySiteReport", "BOQ", "PurchaseOrder",
  "InventoryAllocation",
]);
export const documentCategory = (value) => {
  const category = textValue(value) || "Other";
  if (!DOCUMENT_CATEGORIES.includes(category)) {
    const error = new Error("Select a valid document category");
    error.statusCode = 400;
    throw error;
  }
  return category;
};
export const canCreateDocumentCategory = (user, category) =>
  category === "Drawing"
    ? hasPermission(user, "drawings.create")
    : hasPermission(user, "drawings.create") ||
      hasPermission(user, "documents.support.upload");
export const canEditDocument = (user, document) =>
  hasPermission(user, "drawings.edit") ||
  (
    hasPermission(user, "documents.support.upload") &&
    document.Category !== "Drawing" &&
    Number(document.UploadedBy) === Number(user.id)
  );
const canDeleteDocument = (user, document) =>
  hasPermission(user, "drawings.delete.any") ||
  (
    hasPermission(user, "drawings.delete.own") &&
    Number(document.UploadedBy) === Number(user.id)
  );
export const buildDocumentNumber = (projectCode, projectId, sequence) => {
  const code = String(projectCode || projectId)
    .toUpperCase()
    .replace(/[^A-Z0-9-]/g, "")
    .slice(0, 40) || String(projectId);
  return `DOC-${code}-${String(Math.max(Number(sequence) || 1, 1)).padStart(4, "0")}`;
};
export const nextDocumentRevision = (currentRevision) =>
  Math.max(Number(currentRevision) || 0, 0) + 1;
const cleanTags = (value) => {
  const parsed = jsonValue(value, Array.isArray(value) ? value : []);
  return [
  ...new Set(
    (Array.isArray(parsed) ? parsed : [])
      .map((tag) => String(tag || "").trim())
      .filter(Boolean)
      .slice(0, 20)
  ),
  ];
};
const cleanDocumentLinks = (value) => {
  const parsed = jsonValue(value, Array.isArray(value) ? value : []);
  const links = Array.isArray(parsed) ? parsed : [];
  const seen = new Set();
  return links.map((link) => ({
    type: textValue(link.type),
    id: textValue(link.id),
    label: textValue(link.label),
  })).filter((link) => {
    if (!DOCUMENT_LINK_TYPES.has(link.type) || !link.id || !link.label) return false;
    const key = `${link.type}:${link.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const documentFromRow = (row = {}, user = {}) => ({
  id: row.DocumentId,
  documentNumber: row.DocumentNumber || "",
  projectId: row.ProjectId,
  projectName: row.ProjectName || "",
  projectCode: row.ProjectCode || "",
  name: row.DocumentName,
  description: row.Description || "",
  category: row.Category,
  customCategory: row.CustomCategory || "",
  discipline: row.Discipline || "",
  documentDate: row.DocumentDate,
  externalReference: row.ExternalReference || "",
  issuePurpose: row.IssuePurpose || "",
  responsiblePersonId: row.ResponsiblePersonId || "",
  responsiblePersonName: row.ResponsiblePersonName || "",
  confidentiality: row.Confidentiality || "Internal",
  tags: jsonValue(row.TagsJson, []),
  status: row.Status,
  revision: Number(row.CurrentRevision || 0),
  revisionLabel: `R${Number(row.CurrentRevision || 0)}`,
  milestones: jsonValue(row.MilestonesJson, []),
  uploadedBy: row.UploadedByName || "",
  uploadedById: row.UploadedBy,
  uploadedAt: row.UploadedAt,
  updatedBy: row.UpdatedByName || "",
  updatedAt: row.UpdatedAt,
  submittedBy: row.SubmittedByName || "",
  submittedAt: row.SubmittedAt,
  approvedBy: row.ApprovedByName || "",
  approvedAt: row.ApprovedAt,
  rejectedBy: row.RejectedByName || "",
  rejectedAt: row.RejectedAt,
  rejectionReason: row.RejectionReason || "",
  supersededBy: row.SupersededByName || "",
  supersededAt: row.SupersededAt,
  supersededReason: row.SupersededReason || "",
  canEdit: canEditDocument(user, row),
  canDelete: canDeleteDocument(user, row),
  canApprove: hasPermission(user, "drawings.approve"),
});

const documentSelectSql = `
  SELECT d.*,p.projectName AS ProjectName,p.ProjectCode,
    u.FullName AS UploadedByName,uu.FullName AS UpdatedByName,
    s.FullName AS SubmittedByName,a.FullName AS ApprovedByName,
    rj.FullName AS RejectedByName,sp.FullName AS SupersededByName,
    COALESCE((SELECT dl.LinkId AS id,dl.LinkLabel AS label
      FROM dbo.DocumentLinks dl
      WHERE dl.DocumentId=d.DocumentId AND dl.LinkType=N'Milestone'
      ORDER BY dl.LinkLabel FOR JSON PATH),N'[]') AS MilestonesJson
  FROM dbo.ProjectDocuments d
  JOIN dbo.Projects p ON p.ProjectId=d.ProjectId
  JOIN dbo.AppUsers u ON u.UserId=d.UploadedBy
  JOIN dbo.AppUsers uu ON uu.UserId=d.UpdatedBy
  LEFT JOIN dbo.AppUsers s ON s.UserId=d.SubmittedBy
  LEFT JOIN dbo.AppUsers a ON a.UserId=d.ApprovedBy
  LEFT JOIN dbo.AppUsers rj ON rj.UserId=d.RejectedBy
  LEFT JOIN dbo.AppUsers sp ON sp.UserId=d.SupersededBy
`;

const loadDocumentDetail = async (documentId, user) => {
  const pool = await getPool();
  const result = await pool.request().input("DocumentId", sql.Int, documentId).query(`
    ${documentSelectSql}
    WHERE d.DocumentId=@DocumentId AND d.IsDeleted=0;
    SELECT l.DocumentLinkId AS id,l.LinkType AS type,l.LinkId AS linkId,
      l.LinkLabel AS label,l.CreatedAt
    FROM dbo.DocumentLinks l WHERE l.DocumentId=@DocumentId
    ORDER BY l.LinkType,l.LinkLabel;
    SELECT rv.DocumentRevisionId AS id,rv.RevisionNumber AS revision,
      rv.RevisionLabel AS revisionLabel,rv.FileName AS fileName,
      rv.ContentType AS contentType,rv.FileSize AS fileSize,
      rv.ClientRevisionReference AS clientRevisionReference,
      rv.ChangeSummary AS changeSummary,rv.Remarks AS remarks,rv.Status AS status,
      u.FullName AS uploadedBy,rv.UploadedAt AS uploadedAt,
      a.FullName AS approvedBy,rv.ApprovedAt AS approvedAt,
      r.FullName AS rejectedBy,rv.RejectedAt AS rejectedAt,
      rv.RejectionReason AS rejectionReason
    FROM dbo.DocumentRevisions rv
    JOIN dbo.AppUsers u ON u.UserId=rv.UploadedBy
    LEFT JOIN dbo.AppUsers a ON a.UserId=rv.ApprovedBy
    LEFT JOIN dbo.AppUsers r ON r.UserId=rv.RejectedBy
    WHERE rv.DocumentId=@DocumentId ORDER BY rv.RevisionNumber DESC;
    SELECT TOP 100 ae.AuditEventId AS id,ae.ActionName AS action,
      ae.BeforeJson AS beforeJson,ae.AfterJson AS afterJson,
      ae.Result AS result,ae.CreatedAt AS createdAt,u.FullName AS actor
    FROM dbo.AuditEvents ae
    LEFT JOIN dbo.AppUsers u ON u.UserId=ae.ActorUserId
    WHERE ae.TargetType=N'project-document'
      AND ae.TargetId=CONVERT(NVARCHAR(100),@DocumentId)
    ORDER BY ae.CreatedAt DESC;
  `);
  const row = result.recordsets[0]?.[0];
  if (!row) return null;
  return {
    ...documentFromRow(row, user),
    links: result.recordsets[1] || [],
    revisions: (result.recordsets[2] || []).map((revision) => ({
      ...revision,
      downloadUrl: `/api/project-management/document-revisions/${revision.id}/download`,
    })),
    activity: (result.recordsets[3] || []).map((event) => ({
      ...event,
      before: jsonValue(event.beforeJson, null),
      after: jsonValue(event.afterJson, null),
    })),
  };
};

const loadMilestoneDetail = async (milestoneId, user, activityPage = 1) => {
  const pool = await getPool();
  const milestoneProject = await pool.request()
    .input("MilestoneLookupId", sql.Int, milestoneId)
    .query(`SELECT ProjectId FROM dbo.ProjectMilestones
      WHERE MilestoneId=@MilestoneLookupId AND IsDeleted=0`);
  const projectId = milestoneProject.recordset[0]?.ProjectId;
  if (!projectId) return null;
  const [project] = await loadProjectGraphs(projectId);
  const milestone = project?.milestones.find((item) => Number(item.id) === Number(milestoneId));
  if (!project || !milestone) return null;
  const page = Math.max(idValue(activityPage) || 1, 1);
  const result = await pool.request()
    .input("MilestoneId", sql.Int, milestoneId)
    .input("Offset", sql.Int, (page - 1) * 25)
    .query(`
      SELECT md.DependsOnMilestoneId AS id,m.MilestoneNumber AS milestoneNumber,
        m.MilestoneName AS name,m.TargetDate AS targetDate
      FROM dbo.MilestoneDependencies md
      JOIN dbo.ProjectMilestones m ON m.MilestoneId=md.DependsOnMilestoneId
      WHERE md.MilestoneId=@MilestoneId AND m.IsDeleted=0
      ORDER BY m.TargetDate,m.MilestoneName;

      SELECT ri.RiskIssueId AS id,ri.ItemType AS type,ri.Severity AS severity,
        ri.Title AS title,ri.Description AS description,ri.OwnerId AS ownerId,
        ri.OwnerName AS owner,ri.DueDate AS dueDate,ri.Status AS status,
        ri.MitigationResolution AS mitigationResolution,
        c.FullName AS createdBy,ri.CreatedAt AS createdAt,ri.UpdatedAt AS updatedAt
      FROM dbo.MilestoneRisksIssues ri
      LEFT JOIN dbo.AppUsers c ON c.UserId=ri.CreatedBy
      WHERE ri.MilestoneId=@MilestoneId AND ri.IsDeleted=0
      ORDER BY CASE ri.Status WHEN N'Open' THEN 0 WHEN N'In Progress' THEN 1 ELSE 2 END,
        CASE ri.Severity WHEN N'Critical' THEN 0 WHEN N'High' THEN 1 WHEN N'Medium' THEN 2 ELSE 3 END,
        ri.UpdatedAt DESC;

      SELECT linked.ReportId,MAX(linked.IsExplicit) AS IsExplicit,
        MAX(linked.IsTaskDerived) AS IsTaskDerived
      FROM (
        SELECT mrl.ReportId,1 AS IsExplicit,0 AS IsTaskDerived
        FROM dbo.MilestoneReportLinks mrl WHERE mrl.MilestoneId=@MilestoneId
        UNION ALL
        SELECT drt.ReportId,0,1
        FROM dbo.MilestoneTasks mt JOIN dbo.DailySiteReportTasks drt ON drt.TaskId=mt.TaskId
        WHERE mt.MilestoneId=@MilestoneId
      ) linked
      GROUP BY linked.ReportId;

      SELECT d.DocumentId AS id,d.DocumentNumber AS documentNumber,d.DocumentName AS name,
        d.Category AS category,d.Status AS status,d.CurrentRevision AS revision,
        d.UpdatedAt AS updatedAt
      FROM dbo.DocumentLinks dl JOIN dbo.ProjectDocuments d ON d.DocumentId=dl.DocumentId
      WHERE dl.LinkType=N'Milestone' AND dl.LinkId=CONVERT(NVARCHAR(100),@MilestoneId)
        AND d.IsDeleted=0 ORDER BY d.UpdatedAt DESC;

      SELECT ae.AuditEventId AS id,ae.ActionName AS action,ae.BeforeJson AS beforeJson,
        ae.AfterJson AS afterJson,ae.Result AS result,ae.CreatedAt AS createdAt,
        u.FullName AS actor
      FROM dbo.AuditEvents ae LEFT JOIN dbo.AppUsers u ON u.UserId=ae.ActorUserId
      WHERE ae.TargetType=N'project-milestone'
        AND ae.TargetId=CONVERT(NVARCHAR(100),@MilestoneId)
      ORDER BY ae.CreatedAt DESC
      OFFSET @Offset ROWS FETCH NEXT 25 ROWS ONLY;

      SELECT COUNT(*) AS Total FROM dbo.AuditEvents ae
      WHERE ae.TargetType=N'project-milestone'
        AND ae.TargetId=CONVERT(NVARCHAR(100),@MilestoneId);
    `);
  const reportLinks = new Map((result.recordsets[2] || []).map((row) => [row.ReportId, row]));
  const reports = (await loadReports(null, projectId)).filter((report) => reportLinks.has(report.id)).map((report) => {
    const link = reportLinks.get(report.id);
    const associationSources = [
      link.IsTaskDerived ? "Task derived" : null,
      link.IsExplicit ? "Explicit" : null,
    ].filter(Boolean);
    return { ...report, associationSources, officialEvidence: report.status === "Approved" };
  });
  return {
    ...milestone,
    projectName: project.name,
    projectCode: project.code,
    projectProgress: project.progress,
    tasks: project.tasks.filter((task) => milestone.taskIds.map(Number).includes(Number(task.id))),
    reports,
    dependencies: result.recordsets[0] || [],
    risks: result.recordsets[1] || [],
    documents: (result.recordsets[3] || []).map((document) => ({
      ...document,
      revisionLabel: `R${Number(document.revision || 0)}`,
      downloadUrl: `/api/project-management/documents/${document.id}/download`,
    })),
    activity: (result.recordsets[4] || []).map((event) => ({
      ...event,
      before: jsonValue(event.beforeJson, null),
      after: jsonValue(event.afterJson, null),
    })),
    activityPagination: {
      page,
      pageSize: 25,
      total: Number(result.recordsets[5]?.[0]?.Total || 0),
    },
    permissions: {
      canManage: hasPermission(user, "tasks.manage"),
      canManageReports: hasPermission(user, "reports.manage"),
      canApproveReports: hasPermission(user, "reports.approve"),
    },
  };
};

const validateDocumentLinks = async (transaction, projectId, inputLinks) => {
  const links = cleanDocumentLinks(inputLinks);
  const validated = [];
  for (const link of links) {
    const request = new sql.Request(transaction)
      .input("ProjectId", sql.Int, projectId)
      .input("LinkId", sql.NVarChar(100), link.id);
    let query;
    if (link.type === "Site") {
      query = `SELECT CONVERT(NVARCHAR(100),l.LocationId) AS Id,l.Name AS Label
        FROM dbo.Locations l WHERE CONVERT(NVARCHAR(100),l.LocationId)=@LinkId
          AND (l.ProjectId=@ProjectId OR EXISTS(
            SELECT 1 FROM dbo.ProjectLocations pl
            WHERE pl.ProjectId=@ProjectId AND pl.LocationId=l.LocationId
          ))`;
    } else if (link.type === "Task") {
      query = `SELECT CONVERT(NVARCHAR(100),TaskId) AS Id,TaskName AS Label
        FROM dbo.ProjectTasks WHERE ProjectId=@ProjectId AND CONVERT(NVARCHAR(100),TaskId)=@LinkId`;
    } else if (link.type === "Milestone") {
      query = `SELECT CONVERT(NVARCHAR(100),MilestoneId) AS Id,MilestoneName AS Label
        FROM dbo.ProjectMilestones WHERE ProjectId=@ProjectId AND CONVERT(NVARCHAR(100),MilestoneId)=@LinkId`;
    } else if (link.type === "DailySiteReport") {
      query = `SELECT CONVERT(NVARCHAR(100),ReportId) AS Id,ReportNumber AS Label
        FROM dbo.DailySiteReports WHERE ProjectId=@ProjectId AND CONVERT(NVARCHAR(100),ReportId)=@LinkId`;
    } else if (link.type === "BOQ") {
      query = `SELECT CONVERT(NVARCHAR(100),BOQId) AS Id,BOQNumber AS Label
        FROM dbo.BOQProjects WHERE ProjectId=@ProjectId AND CONVERT(NVARCHAR(100),BOQId)=@LinkId`;
    } else if (link.type === "PurchaseOrder") {
      query = `SELECT CONVERT(NVARCHAR(100),Id) AS Id,PONumber AS Label
        FROM dbo.PurchaseOrders WHERE ProjectId=@ProjectId AND CONVERT(NVARCHAR(100),Id)=@LinkId`;
    } else {
      query = `SELECT CONVERT(NVARCHAR(100),RecordId) AS Id,
          COALESCE(JSON_VALUE(DataJson,'$.allocationNumber'),CONCAT(N'Allocation ',RecordId)) AS Label
        FROM dbo.ProjectModuleRecords
        WHERE ProjectId=@ProjectId AND ModuleType=N'InventoryAllocation' AND IsDeleted=0
          AND CONVERT(NVARCHAR(100),RecordId)=@LinkId`;
    }
    const result = await request.query(query);
    if (!result.recordset[0]) {
      const error = new Error(`${link.type} link does not belong to the selected project`);
      error.statusCode = 400;
      throw error;
    }
    validated.push({
      type: link.type,
      id: result.recordset[0].Id,
      label: result.recordset[0].Label || link.label,
    });
  }
  return validated;
};

const replaceDocumentLinks = async (transaction, documentId, projectId, links, userId) => {
  const validated = await validateDocumentLinks(transaction, projectId, links);
  await new sql.Request(transaction)
    .input("DocumentId", sql.Int, documentId)
    .query("DELETE dbo.DocumentLinks WHERE DocumentId=@DocumentId");
  for (const link of validated) {
    await new sql.Request(transaction)
      .input("DocumentId", sql.Int, documentId)
      .input("ProjectId", sql.Int, projectId)
      .input("Type", sql.NVarChar(40), link.type)
      .input("LinkId", sql.NVarChar(100), link.id)
      .input("Label", sql.NVarChar(300), link.label)
      .input("UserId", sql.Int, userId)
      .query(`INSERT dbo.DocumentLinks(DocumentId,ProjectId,LinkType,LinkId,LinkLabel,CreatedBy)
        VALUES(@DocumentId,@ProjectId,@Type,@LinkId,@Label,@UserId)`);
  }
  return validated;
};

export const createProjectManagementRouter = () => {
  const router = express.Router();
  router.use(authenticate);
  router.use(requireEnrollment);
  router.use(async (_req, _res, next) => {
    try {
      await ensureProjectManagementSchema();
      next();
    } catch (error) {
      next(error);
    }
  });

  router.get("/projects", async (_req, res, next) => {
    try {
      res.json({ ok: true, projects: await loadProjectGraphs() });
    } catch (error) { next(error); }
  });

  router.get("/projects/:projectId", async (req, res, next) => {
    try {
      const projects = await loadProjectGraphs(idValue(req.params.projectId));
      if (!projects[0]) return res.status(404).json({ ok: false, error: "Project not found" });
      return res.json({ ok: true, project: projects[0] });
    } catch (error) { return next(error); }
  });

  const requireModulePermission = (req, res, next) => {
    const module = getModule(req.params.moduleName);
    if (!module) {
      return res.status(404).json({
        ok: false,
        code: "MODULE_NOT_FOUND",
        error: "Project Management module was not found",
      });
    }
    if (!hasPermission(req.user, module.permission)) {
      return res.status(403).json({
        ok: false,
        code: "FORBIDDEN",
        error: "You do not have permission to modify this module",
      });
    }
    req.projectModule = module;
    return next();
  };

  router.get("/modules/:moduleName", async (req, res, next) => {
    try {
      const module = getModule(req.params.moduleName);
      if (!module) {
        return res.status(404).json({ ok: false, error: "Project Management module was not found" });
      }
      const records = await loadModuleRecords({
        moduleType: module.type,
        projectId: idValue(req.query.projectId),
      });
      const externalKey = textValue(req.query.externalKey);
      return res.json({
        ok: true,
        records: externalKey
          ? records.filter((record) => record.externalKey === externalKey)
          : records,
      });
    } catch (error) {
      return next(error);
    }
  });

  router.post("/modules/:moduleName", requireModulePermission, async (req, res, next) => {
    try {
      const module = req.projectModule;
      const projectId = idValue(req.body?.projectId);
      const externalKey = textValue(req.body?.externalKey);
      if (module.collection && !projectId) {
        return res.status(400).json({ ok: false, error: "A project is required" });
      }
      if (module.type === "PurchaseFollowUp" && !externalKey) {
        return res.status(400).json({ ok: false, error: "A purchase-order key is required" });
      }
      const data =
        req.body?.data && typeof req.body.data === "object" && !Array.isArray(req.body.data)
          ? req.body.data
          : req.body || {};
      const pool = await getPool();
      const result = await pool.request()
        .input("ModuleType", sql.NVarChar(50), module.type)
        .input("ProjectId", sql.Int, projectId)
        .input("ExternalKey", sql.NVarChar(200), externalKey)
        .input("DataJson", sql.NVarChar(sql.MAX), serialize(data))
        .input("UserId", sql.Int, req.user.id)
        .query(`
          INSERT dbo.ProjectModuleRecords
            (ModuleType,ProjectId,ExternalKey,DataJson,CreatedBy,UpdatedBy)
          OUTPUT INSERTED.*
          VALUES (@ModuleType,@ProjectId,@ExternalKey,@DataJson,@UserId,@UserId)
        `);
      return res.status(201).json({
        ok: true,
        record: moduleRecordFromRow(result.recordset[0]),
      });
    } catch (error) {
      if (error?.number === 2601 || error?.number === 2627) {
        error.statusCode = 409;
        error.message = "A record already exists for this external key";
      }
      return next(error);
    }
  });

  router.put("/modules/:moduleName/:recordId", requireModulePermission, async (req, res, next) => {
    try {
      const module = req.projectModule;
      const recordId = idValue(req.params.recordId);
      const projectId =
        req.body?.projectId === undefined ? null : idValue(req.body.projectId);
      const externalKey =
        req.body?.externalKey === undefined ? null : textValue(req.body.externalKey);
      const data =
        req.body?.data && typeof req.body.data === "object" && !Array.isArray(req.body.data)
          ? req.body.data
          : req.body || {};
      const pool = await getPool();
      const result = await pool.request()
        .input("RecordId", sql.BigInt, recordId)
        .input("ModuleType", sql.NVarChar(50), module.type)
        .input("ProjectId", sql.Int, projectId)
        .input("ExternalKey", sql.NVarChar(200), externalKey)
        .input("DataJson", sql.NVarChar(sql.MAX), serialize(data))
        .input("UserId", sql.Int, req.user.id)
        .query(`
          UPDATE dbo.ProjectModuleRecords
          SET ProjectId=COALESCE(@ProjectId,ProjectId),
            ExternalKey=COALESCE(@ExternalKey,ExternalKey),
            DataJson=@DataJson,UpdatedBy=@UserId,UpdatedAt=SYSUTCDATETIME()
          OUTPUT INSERTED.*
          WHERE RecordId=@RecordId AND ModuleType=@ModuleType AND IsDeleted=0
        `);
      if (!result.recordset[0]) {
        return res.status(404).json({ ok: false, error: "Record not found" });
      }
      return res.json({ ok: true, record: moduleRecordFromRow(result.recordset[0]) });
    } catch (error) {
      return next(error);
    }
  });

  router.delete("/modules/:moduleName/:recordId", requireModulePermission, async (req, res, next) => {
    try {
      const pool = await getPool();
      const result = await pool.request()
        .input("RecordId", sql.BigInt, idValue(req.params.recordId))
        .input("ModuleType", sql.NVarChar(50), req.projectModule.type)
        .input("UserId", sql.Int, req.user.id)
        .query(`
          UPDATE dbo.ProjectModuleRecords
          SET IsDeleted=1,UpdatedBy=@UserId,UpdatedAt=SYSUTCDATETIME()
          WHERE RecordId=@RecordId AND ModuleType=@ModuleType AND IsDeleted=0
        `);
      if (!result.rowsAffected[0]) {
        return res.status(404).json({ ok: false, error: "Record not found" });
      }
      return res.json({ ok: true });
    } catch (error) {
      return next(error);
    }
  });

  router.post(
    "/modules/:moduleName/:recordId/attachments",
    requireModulePermission,
    upload.array("attachments", 8),
    async (req, res, next) => {
      let transaction;
      try {
        if (!req.files?.length) {
          return res.status(400).json({ ok: false, error: "At least one file is required" });
        }
        const pool = await getPool();
        transaction = pool.transaction();
        await transaction.begin();
        const recordId = idValue(req.params.recordId);
        const existing = await new sql.Request(transaction)
          .input("RecordId", sql.BigInt, recordId)
          .input("ModuleType", sql.NVarChar(50), req.projectModule.type)
          .query(`
            SELECT RecordId FROM dbo.ProjectModuleRecords WITH (UPDLOCK)
            WHERE RecordId=@RecordId AND ModuleType=@ModuleType AND IsDeleted=0
          `);
        if (!existing.recordset[0]) {
          const error = new Error("Record not found");
          error.statusCode = 404;
          throw error;
        }
        const attachmentIds = [];
        for (const file of req.files) {
          const inserted = await new sql.Request(transaction)
            .input("RecordId", sql.BigInt, recordId)
            .input("FileName", sql.NVarChar(255), file.originalname)
            .input("ContentType", sql.NVarChar(150), file.mimetype)
            .input("FileSize", sql.BigInt, file.size)
            .input("FileData", sql.VarBinary(sql.MAX), file.buffer)
            .input("Caption", sql.NVarChar(500), textValue(req.body?.caption))
            .input("UserId", sql.Int, req.user.id)
            .query(`
              INSERT dbo.ProjectModuleAttachments
                (RecordId,FileName,ContentType,FileSize,FileData,Caption,UploadedBy)
              OUTPUT INSERTED.AttachmentId
              VALUES (@RecordId,@FileName,@ContentType,@FileSize,@FileData,@Caption,@UserId)
            `);
          attachmentIds.push(inserted.recordset[0].AttachmentId);
        }
        await transaction.commit();
        return res.status(201).json({ ok: true, attachmentIds });
      } catch (error) {
        if (transaction) {
          try { await transaction.rollback(); } catch { /* noop */ }
        }
        return next(error);
      }
    }
  );

  router.get("/module-attachments/:attachmentId", async (req, res, next) => {
    try {
      const pool = await getPool();
      const result = await pool.request()
        .input("AttachmentId", sql.BigInt, idValue(req.params.attachmentId))
        .query(`
          SELECT a.FileName,a.ContentType,a.FileData
          FROM dbo.ProjectModuleAttachments a
          JOIN dbo.ProjectModuleRecords r ON r.RecordId=a.RecordId
          WHERE a.AttachmentId=@AttachmentId AND a.IsDeleted=0 AND r.IsDeleted=0
        `);
      const file = result.recordset[0];
      if (!file) return res.status(404).json({ ok: false, error: "Attachment not found" });
      return res.type(file.ContentType).attachment(file.FileName).send(file.FileData);
    } catch (error) {
      return next(error);
    }
  });

  router.post("/projects", requirePermission("tasks.manage"), async (req, res, next) => {
    let transaction;
    try {
      const name = projectIdentityValue(req.body?.name);
      const code = projectIdentityValue(req.body?.code);
      const customerId = idValue(req.body?.customerId ?? req.body?.clientId);
      if (!name || !customerId) return res.status(400).json({ ok: false, error: "Project name and customer are required" });
      const pool = await getPool();
      transaction = pool.transaction();
      await transaction.begin();
      const created = await new sql.Request(transaction)
        .input("ProjectName", sql.NVarChar(255), name)
        .input("ProjectCode", sql.NVarChar(100), code)
        .input("CustomerId", sql.Int, customerId)
        .input("Client", sql.NVarChar(255), textValue(req.body?.client))
        .input("ClientCompany", sql.NVarChar(255), textValue(req.body?.companyName ?? req.body?.client))
        .input("Department", sql.NVarChar(150), textValue(req.body?.department))
        .input("Status", sql.NVarChar(50), textValue(req.body?.status) || "Draft")
        .input("StartDate", sql.Date, dateValue(req.body?.startDate))
        .input("EndDate", sql.Date, dateValue(req.body?.endDate))
        .input("Notes", sql.NVarChar(sql.MAX), textValue(req.body?.notes ?? req.body?.description))
        .input("ManagementDataJson", sql.NVarChar(sql.MAX), serialize({ ...req.body, name, code }))
        .query(`
          INSERT dbo.Projects (ProjectName,ProjectCode,CustomerId,Client,ClientCompany,Department,Status,StartDate,EndDate,Notes,ManagementDataJson)
          OUTPUT INSERTED.ProjectId VALUES (@ProjectName,@ProjectCode,@CustomerId,@Client,@ClientCompany,@Department,@Status,@StartDate,@EndDate,@Notes,@ManagementDataJson)
        `);
      const projectId = created.recordset[0].ProjectId;
      await syncProjectLocations(transaction, projectId, req.body || {});
      let milestoneSequence = 0;
      for (const milestone of req.body?.milestones || []) {
        milestoneSequence += 1;
        const inserted = await new sql.Request(transaction)
          .input("ProjectId", sql.Int, projectId)
          .input("Number", sql.NVarChar(120), buildMilestoneNumber(code, projectId, milestoneSequence))
          .input("Name", sql.NVarChar(255), textValue(milestone.name))
          .input("Stage", sql.NVarChar(20), projectStage(milestone.stage))
          .input("Description", sql.NVarChar(sql.MAX), textValue(milestone.description))
          .input("Priority", sql.NVarChar(20), ["Low", "Medium", "High", "Critical"].includes(milestone.priority) ? milestone.priority : "Medium")
          .input("Deliverable", sql.NVarChar(sql.MAX), textValue(milestone.deliverable))
          .input("Acceptance", sql.NVarChar(sql.MAX), textValue(milestone.acceptanceCriteria))
          .input("StartDate", sql.Date, dateValue(milestone.startDate))
          .input("TargetDate", sql.Date, dateValue(milestone.targetDate))
          .input("ResponsiblePersonId", sql.Int, idValue(milestone.responsiblePersonId))
          .input("ResponsiblePersonName", sql.NVarChar(200), textValue(milestone.responsiblePerson ?? milestone.owner))
          .input("UserId", sql.Int, req.user.id)
          .query(`
            INSERT dbo.ProjectMilestones
              (ProjectId,MilestoneNumber,MilestoneName,Description,Stage,Priority,Deliverable,AcceptanceCriteria,
               BaselineStartDate,BaselineTargetDate,StartDate,TargetDate,
               ResponsiblePersonId,ResponsiblePersonName,CreatedBy,UpdatedBy)
            OUTPUT INSERTED.MilestoneId
            VALUES (@ProjectId,@Number,@Name,@Description,@Stage,@Priority,@Deliverable,@Acceptance,
              @StartDate,@TargetDate,@StartDate,@TargetDate,@ResponsiblePersonId,@ResponsiblePersonName,@UserId,@UserId)
          `);
        await replaceMilestoneTasks(transaction, inserted.recordset[0].MilestoneId, projectId, milestone.taskIds || []);
      }
      await transaction.commit();
      return res.status(201).json({ ok: true, project: (await loadProjectGraphs(projectId))[0] });
    } catch (error) {
      if (transaction) try { await transaction.rollback(); } catch { /* noop */ }
      return next(error);
    }
  });

  router.put("/projects/:projectId", requirePermission("tasks.manage"), async (req, res, next) => {
    let transaction;
    try {
      const projectId = idValue(req.params.projectId);
      const pool = await getPool();
      transaction = pool.transaction();
      await transaction.begin();
      const existing = await new sql.Request(transaction).input("ProjectId", sql.Int, projectId)
        .query(`SELECT * FROM dbo.Projects WHERE ProjectId=@ProjectId`);
      const row = existing.recordset[0];
      if (!row) fail(404, "Project not found");
      const customerId =
        req.body?.customerId === undefined && req.body?.clientId === undefined
          ? row.CustomerId
          : idValue(req.body?.customerId ?? req.body?.clientId);
      if (!customerId) {
        fail(400, "A customer is required");
      }
      const name =
        projectIdentityValue(req.body?.name) ||
        projectIdentityValue(row.ProjectName ?? row.projectName);
      const code =
        req.body?.code === undefined
          ? projectIdentityValue(row.ProjectCode)
          : projectIdentityValue(req.body.code);
      const result = await new sql.Request(transaction)
        .input("ProjectId", sql.Int, projectId)
        .input("ProjectName", sql.NVarChar(255), name)
        .input("ProjectCode", sql.NVarChar(100), code)
        .input(
          "CustomerId",
          sql.Int,
          customerId
        )
        .input(
          "Client",
          sql.NVarChar(255),
          req.body?.client === undefined ? row.Client : textValue(req.body.client)
        )
        .input(
          "ClientCompany",
          sql.NVarChar(255),
          req.body?.companyName === undefined
            ? row.ClientCompany
            : textValue(req.body.companyName)
        )
        .input(
          "Department",
          sql.NVarChar(150),
          req.body?.department === undefined ? row.Department : textValue(req.body.department)
        )
        .input("Status", sql.NVarChar(50), textValue(req.body?.status) || row.Status || row.status)
        .input("StartDate", sql.Date, req.body?.startDate === undefined ? (row.StartDate ?? row.startDate) : dateValue(req.body.startDate))
        .input("EndDate", sql.Date, req.body?.endDate === undefined ? (row.EndDate ?? row.endDate) : dateValue(req.body.endDate))
        .input(
          "Notes",
          sql.NVarChar(sql.MAX),
          req.body?.notes === undefined && req.body?.description === undefined
            ? row.Notes
            : textValue(req.body?.notes ?? req.body?.description)
        )
        .input("ManagementDataJson", sql.NVarChar(sql.MAX), serialize({ ...req.body, name, code }))
        .query(`
          UPDATE dbo.Projects SET ProjectName=@ProjectName,ProjectCode=@ProjectCode,
            CustomerId=@CustomerId,Client=@Client,ClientCompany=@ClientCompany,Department=@Department,Status=@Status,
            StartDate=@StartDate,EndDate=@EndDate,Notes=@Notes,ManagementDataJson=@ManagementDataJson,
            UpdatedAt=SYSUTCDATETIME()
          WHERE ProjectId=@ProjectId
        `);
      if (!result.rowsAffected[0]) fail(404, "Project not found");
      if (req.body?.locations !== undefined || req.body?.locationIds !== undefined || req.body?.locationId !== undefined) {
        await syncProjectLocations(transaction, projectId, req.body || {});
      }
      await transaction.commit();
      return res.json({ ok: true, project: (await loadProjectGraphs(projectId))[0] });
    } catch (error) {
      if (transaction) try { await transaction.rollback(); } catch { /* noop */ }
      return next(error);
    }
  });

  router.get("/projects/:projectId/tasks", async (req, res, next) => {
    try {
      const pool = await getPool();
      const result = await pool.request().input("ProjectId", sql.Int, idValue(req.params.projectId))
        .query(`SELECT t.*,mt.MilestoneId,m.MilestoneName,m.MilestoneNumber,m.Stage
          FROM dbo.ProjectTasks t
          JOIN dbo.MilestoneTasks mt ON mt.TaskId=t.TaskId
          JOIN dbo.ProjectMilestones m ON m.MilestoneId=mt.MilestoneId
          WHERE t.ProjectId=@ProjectId ORDER BY m.Stage,m.TargetDate,t.TaskId DESC`);
      return res.json({ ok: true, tasks: result.recordset.map(taskFromRow) });
    } catch (error) { return next(error); }
  });

  router.post("/projects/:projectId/tasks", requirePermission("tasks.manage"), async (req, res, next) => {
    let transaction;
    try {
      const projectId = idValue(req.params.projectId);
      const milestoneId = idValue(req.body?.milestoneId);
      const name = textValue(req.body?.taskName ?? req.body?.title ?? req.body?.name);
      if (!name) return res.status(400).json({ ok: false, error: "Task name is required" });
      if (!milestoneId) return res.status(400).json({ ok: false, error: "A milestone is required before a task can be created" });
      const normalized = normalizeTaskUpdate(req.body, {});
      const pool = await getPool();
      transaction = pool.transaction();
      await transaction.begin();
      const milestoneResult = await new sql.Request(transaction)
        .input("MilestoneId", sql.Int, milestoneId)
        .input("ProjectId", sql.Int, projectId)
        .query(`SELECT MilestoneId FROM dbo.ProjectMilestones
          WHERE MilestoneId=@MilestoneId AND ProjectId=@ProjectId AND IsDeleted=0 AND IsCancelled=0`);
      if (!milestoneResult.recordset[0]) fail(400, "Select an active milestone from this project");
      const result = await new sql.Request(transaction)
        .input("ProjectId", sql.Int, projectId).input("TaskName", sql.NVarChar(255), name)
        .input("Description", sql.NVarChar(sql.MAX), textValue(req.body?.description))
        .input("Status", sql.NVarChar(20), normalized.status)
        .input("Percentage", sql.Int, normalized.completionPercentage)
        .input("Remaining", sql.NVarChar(sql.MAX), normalized.remainingWorkRemarks)
        .input("Remarks", sql.NVarChar(sql.MAX), normalized.remarks)
        .input("EmployeeId", sql.Int, normalized.assignedEmployeeId)
        .input("EmployeeName", sql.NVarChar(200), normalized.assignedEmployeeName)
        .input("StartDate", sql.Date, dateValue(req.body?.startDate))
        .input("DueDate", sql.Date, normalized.dueDate)
        .input("Priority", sql.NVarChar(20), textValue(req.body?.priority) || "Medium")
        .input("TaskDataJson", sql.NVarChar(sql.MAX), serialize(req.body))
        .input("UserId", sql.Int, req.user.id)
        .query(`
          INSERT dbo.ProjectTasks
            (ProjectId,TaskName,Description,Status,CompletionPercentage,RemainingWorkRemarks,Remarks,
             AssignedEmployeeId,AssignedEmployeeName,StartDate,DueDate,Priority,TaskDataJson,CreatedBy,UpdatedBy)
          OUTPUT INSERTED.*
          VALUES (@ProjectId,@TaskName,@Description,@Status,@Percentage,@Remaining,@Remarks,
             @EmployeeId,@EmployeeName,@StartDate,@DueDate,@Priority,@TaskDataJson,@UserId,@UserId)
        `);
      const taskId = result.recordset[0].TaskId;
      await new sql.Request(transaction)
        .input("MilestoneId", sql.Int, milestoneId)
        .input("TaskId", sql.Int, taskId)
        .query(`INSERT dbo.MilestoneTasks(MilestoneId,TaskId) VALUES(@MilestoneId,@TaskId)`);
      await syncMilestoneCompletion(transaction, projectId);
      await transaction.commit();
      const [project] = await loadProjectGraphs(projectId);
      return res.status(201).json({
        ok: true,
        task: project.tasks.find((task) => Number(task.id) === Number(taskId)),
        summary: await progressSummary(pool.request(), projectId),
      });
    } catch (error) {
      if (transaction) try { await transaction.rollback(); } catch { /* noop */ }
      return next(error);
    }
  });

  const requireTaskUpdateAccess = async (req, res, next) => {
    try {
      if (hasPermission(req.user, "tasks.manage")) return next();
      if (!hasPermission(req.user, "tasks.update.assigned")) return res.status(403).json({ ok: false, error: "You do not have permission to update tasks" });
      const pool = await getPool();
      const result = await pool.request().input("Id", sql.Int, idValue(req.params.taskId)).input("Name", sql.NVarChar(200), req.user.name)
        .input("UserId", sql.Int, req.user.id).query("SELECT TaskId FROM dbo.ProjectTasks WHERE TaskId=@Id AND (AssignedEmployeeId=@UserId OR AssignedEmployeeName=@Name)");
      if (!result.recordset[0]) return res.status(403).json({ ok: false, error: "You may update only tasks assigned to you" });
      return next();
    } catch (error) { return next(error); }
  };

  router.post("/tasks/:taskId/updates", requireTaskUpdateAccess, upload.array("attachments", 8), async (req, res, next) => {
    let transaction;
    try {
      const pool = await getPool();
      transaction = pool.transaction();
      await transaction.begin();
      const result = await writeTaskUpdate(transaction, idValue(req.params.taskId), req.body || {}, req.files || [], req.user);
      await transaction.commit();
      return res.json({ ok: true, task: result.task, taskUpdateId: result.taskUpdateId, summary: await progressSummary(pool.request(), result.projectId) });
    } catch (error) {
      if (transaction) try { await transaction.rollback(); } catch { /* noop */ }
      return next(error);
    }
  });

  router.get("/tasks/:taskId/history", async (req, res, next) => {
    try {
      const page = Math.max(1, idValue(req.query.page) || 1);
      const pageSize = Math.min(100, Math.max(1, idValue(req.query.pageSize) || 20));
      const pool = await getPool();
      const result = await pool.request()
        .input("TaskId", sql.Int, idValue(req.params.taskId))
        .input("Offset", sql.Int, (page - 1) * pageSize)
        .input("PageSize", sql.Int, pageSize)
        .query(`
          SELECT u.*,a.FullName AS UpdatedByName,
            (SELECT AttachmentId,FileName,ContentType,FileSize,UploadedAt
             FROM dbo.TaskUpdateAttachments f WHERE f.TaskUpdateId=u.TaskUpdateId FOR JSON PATH) AS AttachmentsJson
          FROM dbo.TaskUpdates u JOIN dbo.AppUsers a ON a.UserId=u.UpdatedBy
          WHERE u.TaskId=@TaskId ORDER BY u.UpdatedAt DESC
          OFFSET @Offset ROWS FETCH NEXT @PageSize ROWS ONLY;
          SELECT COUNT(1) AS Total FROM dbo.TaskUpdates WHERE TaskId=@TaskId;
        `);
      return res.json({
        ok: true, page, pageSize, total: Number(result.recordsets[1]?.[0]?.Total || 0),
        history: result.recordsets[0].map((row) => ({
          id: row.TaskUpdateId, changedFields: jsonValue(row.ChangedFieldsJson, []),
          before: jsonValue(row.BeforeJson, {}), after: jsonValue(row.AfterJson, {}),
          progressRemarks: row.ProgressRemarks || "", remarks: row.GeneralRemarks || "",
          updatedBy: row.UpdatedByName, updatedAt: row.UpdatedAt,
          attachments: jsonValue(row.AttachmentsJson, []).map((file) => ({
            id: file.AttachmentId,
            name: file.FileName,
            contentType: file.ContentType,
            size: file.FileSize,
            uploadedAt: file.UploadedAt,
            downloadUrl: `/api/project-management/task-attachments/${file.AttachmentId}`,
          })),
        })),
      });
    } catch (error) { return next(error); }
  });

  router.get("/task-attachments/:attachmentId", async (req, res, next) => {
    try {
      const pool = await getPool();
      const result = await pool.request().input("Id", sql.Int, idValue(req.params.attachmentId))
        .query(`SELECT FileName,ContentType,FileData FROM dbo.TaskUpdateAttachments WHERE AttachmentId=@Id`);
      const file = result.recordset[0];
      if (!file) return res.status(404).json({ ok: false, error: "Attachment not found" });
      res.type(file.ContentType).attachment(file.FileName).send(file.FileData);
    } catch (error) { next(error); }
  });

  router.get("/milestones", async (req, res, next) => {
    try {
      const projects = await loadProjectGraphs(idValue(req.query.projectId));
      const term = String(req.query.search || "").trim().toLowerCase();
      const matches = (value, filter) => !filter || filter === "All" || String(value || "") === String(filter);
      const fromDate = dateOnly(req.query.fromDate);
      const toDate = dateOnly(req.query.toDate);
      let rows = projects.flatMap((project) => project.milestones.map((milestone) => ({
        ...milestone, projectName: project.name, projectCode: project.code, projectProgress: project.progress,
      }))).filter((milestone) => {
        if (term && ![
          milestone.milestoneNumber, milestone.name, milestone.projectName,
          milestone.responsiblePerson, milestone.deliverable,
        ].some((value) => String(value || "").toLowerCase().includes(term))) return false;
        if (!matches(milestone.status, req.query.status)) return false;
        if (!matches(milestone.health, req.query.health)) return false;
        if (!matches(milestone.priority, req.query.priority)) return false;
        if (!matches(milestone.stage, req.query.stage)) return false;
        if (req.query.owner && !String(milestone.responsiblePerson || "").toLowerCase().includes(String(req.query.owner).toLowerCase())) return false;
        const target = dateOnly(milestone.targetDate);
        if (fromDate !== null && target !== null && target < fromDate) return false;
        if (toDate !== null && target !== null && target > toDate) return false;
        return true;
      });
      const sortBy = ["name", "targetDate", "progress", "status", "health", "priority"].includes(req.query.sortBy)
        ? req.query.sortBy : "targetDate";
      const direction = req.query.sortDirection === "desc" ? -1 : 1;
      rows = rows.sort((a, b) => String(a[sortBy] ?? "").localeCompare(String(b[sortBy] ?? ""), undefined, { numeric: true }) * direction);
      const total = rows.length;
      const page = Math.max(idValue(req.query.page) || 1, 1);
      const pageSize = Math.min(Math.max(idValue(req.query.pageSize) || 50, 1), 100);
      rows = rows.slice((page - 1) * pageSize, page * pageSize);
      const all = projects.flatMap((project) => project.milestones);
      return res.json({
        ok: true,
        milestones: rows,
        pagination: { page, pageSize, total, pages: Math.ceil(total / pageSize) },
        summary: {
          total: all.length,
          completed: all.filter((item) => item.status === "Completed").length,
          atRisk: all.filter((item) => item.health === "At Risk").length,
          overdue: all.filter((item) => item.health === "Overdue").length,
          averageProjectProgress: projects.length
            ? Math.round(projects.reduce((sum, project) => sum + project.progress, 0) / projects.length)
            : 0,
        },
      });
    } catch (error) { return next(error); }
  });

  router.get("/milestones-archive", requirePermission("tasks.manage"), async (_req, res, next) => {
    try {
      const pool = await getPool();
      const result = await pool.request().query(`
        SELECT m.*,p.ProjectName AS projectName,p.ProjectCode AS projectCode,
          0 AS Progress,N'[]' AS TaskIdsJson,
          (SELECT COUNT(*) FROM dbo.MilestoneTasks mt WHERE mt.MilestoneId=m.MilestoneId) AS TaskCount,
          0 AS ReportCount,0 AS DocumentCount,0 AS OpenRiskCount,0 AS OpenBlockingCount
        FROM dbo.ProjectMilestones m JOIN dbo.Projects p ON p.ProjectId=m.ProjectId
        WHERE m.IsDeleted=1 ORDER BY m.DeletedAt DESC`);
      return res.json({
        ok: true,
        milestones: result.recordset.map((row) => ({ ...milestoneFromRow(row), projectName: row.projectName, projectCode: row.projectCode })),
      });
    } catch (error) { return next(error); }
  });

  router.get("/milestones/:milestoneId", async (req, res, next) => {
    try {
      const milestone = await loadMilestoneDetail(idValue(req.params.milestoneId), req.user, req.query.activityPage);
      if (!milestone) return res.status(404).json({ ok: false, error: "Milestone not found" });
      return res.json({ ok: true, milestone });
    } catch (error) { return next(error); }
  });

  router.get("/milestones/:milestoneId/activity", async (req, res, next) => {
    try {
      const milestone = await loadMilestoneDetail(idValue(req.params.milestoneId), req.user, req.query.page);
      if (!milestone) return res.status(404).json({ ok: false, error: "Milestone not found" });
      return res.json({ ok: true, activity: milestone.activity, pagination: milestone.activityPagination });
    } catch (error) { return next(error); }
  });

  router.post("/projects/:projectId/milestones", requirePermission("tasks.manage"), async (req, res, next) => {
    let transaction;
    try {
      const projectId = idValue(req.params.projectId);
      if (!textValue(req.body?.name)) return res.status(400).json({ ok: false, error: "Milestone name is required" });
      if (req.body?.startDate && req.body?.targetDate && dateOnly(req.body.targetDate) < dateOnly(req.body.startDate)) {
        return res.status(400).json({ ok: false, error: "Target date cannot be before the start date" });
      }
      const priority = ["Low", "Medium", "High", "Critical"].includes(req.body?.priority) ? req.body.priority : "Medium";
      const pool = await getPool(); transaction = pool.transaction(); await transaction.begin();
      const projectResult = await new sql.Request(transaction).input("ProjectId", sql.Int, projectId).query(`
        SELECT ProjectCode FROM dbo.Projects WITH(UPDLOCK,HOLDLOCK) WHERE ProjectId=@ProjectId;
        SELECT COALESCE(MAX(TRY_CONVERT(INT,RIGHT(MilestoneNumber,4))),0)+1 AS NextSequence
        FROM dbo.ProjectMilestones WITH(UPDLOCK,HOLDLOCK) WHERE ProjectId=@ProjectId;`);
      if (!projectResult.recordsets[0]?.[0]) fail(404, "Project not found");
      const milestoneNumber = buildMilestoneNumber(
        projectResult.recordsets[0][0].ProjectCode,
        projectId,
        projectResult.recordsets[1][0].NextSequence
      );
      const result = await new sql.Request(transaction)
        .input("ProjectId", sql.Int, projectId).input("Number", sql.NVarChar(120), milestoneNumber)
        .input("Name", sql.NVarChar(255), textValue(req.body.name))
        .input("Stage", sql.NVarChar(20), projectStage(req.body.stage))
        .input("Description", sql.NVarChar(sql.MAX), textValue(req.body.description))
        .input("Priority", sql.NVarChar(20), priority)
        .input("Deliverable", sql.NVarChar(sql.MAX), textValue(req.body.deliverable))
        .input("Acceptance", sql.NVarChar(sql.MAX), textValue(req.body.acceptanceCriteria))
        .input("StartDate", sql.Date, dateValue(req.body.startDate)).input("TargetDate", sql.Date, dateValue(req.body.targetDate))
        .input("BaselineStart", sql.Date, dateValue(req.body.baselineStartDate ?? req.body.startDate))
        .input("BaselineTarget", sql.Date, dateValue(req.body.baselineTargetDate ?? req.body.targetDate))
        .input("ActualStart", sql.Date, dateValue(req.body.actualStartDate))
        .input("Notes", sql.NVarChar(sql.MAX), textValue(req.body.notes))
        .input("PersonId", sql.Int, idValue(req.body.responsiblePersonId))
        .input("PersonName", sql.NVarChar(200), textValue(req.body.responsiblePerson ?? req.body.owner))
        .input("UserId", sql.Int, req.user.id)
        .query(`
          INSERT dbo.ProjectMilestones
            (ProjectId,MilestoneNumber,MilestoneName,Description,Stage,Priority,Deliverable,AcceptanceCriteria,
             BaselineStartDate,BaselineTargetDate,StartDate,TargetDate,ActualStartDate,Notes,
             ResponsiblePersonId,ResponsiblePersonName,IsCancelled,CreatedBy,UpdatedBy)
          OUTPUT INSERTED.MilestoneId VALUES
            (@ProjectId,@Number,@Name,@Description,@Stage,@Priority,@Deliverable,@Acceptance,
             @BaselineStart,@BaselineTarget,@StartDate,@TargetDate,@ActualStart,@Notes,
             @PersonId,@PersonName,0,@UserId,@UserId)
        `);
      const milestoneId = result.recordset[0].MilestoneId;
      await replaceMilestoneTasks(transaction, milestoneId, projectId, req.body.taskIds || req.body.linkedTasks || []);
      await replaceMilestoneDependencies(transaction, milestoneId, projectId, req.body.dependencyIds || [], req.user.id);
      await replaceMilestoneReports(transaction, milestoneId, projectId, req.body.reportIds || [], req.user.id);
      await syncMilestoneCompletion(transaction, projectId);
      await transaction.commit();
      await writeAudit(req, { action: "milestone.create", targetType: "project-milestone", targetId: milestoneId, after: { milestoneNumber, ...req.body } });
      return res.status(201).json({ ok: true, milestone: await loadMilestoneDetail(milestoneId, req.user) });
    } catch (error) {
      if (transaction) try { await transaction.rollback(); } catch { /* noop */ }
      return next(error);
    }
  });

  const updateMilestoneHandler = async (req, res, next) => {
    let transaction;
    try {
      const milestoneId = idValue(req.params.milestoneId);
      const pool = await getPool(); transaction = pool.transaction(); await transaction.begin();
      const existing = await new sql.Request(transaction).input("Id", sql.Int, milestoneId)
        .query(`SELECT * FROM dbo.ProjectMilestones WHERE MilestoneId=@Id AND IsDeleted=0`);
      const row = existing.recordset[0];
      if (!row) fail(404, "Milestone not found");
      const startDate = req.body.startDate === undefined ? row.StartDate : dateValue(req.body.startDate);
      const targetDate = req.body.targetDate === undefined ? row.TargetDate : dateValue(req.body.targetDate);
      if (startDate && targetDate && dateOnly(targetDate) < dateOnly(startDate)) fail(400, "Target date cannot be before the start date");
      const priority = req.body.priority === undefined ? row.Priority : req.body.priority;
      if (!["Low", "Medium", "High", "Critical"].includes(priority)) fail(400, "Select a valid milestone priority");
      const stage = req.body.stage === undefined ? projectStage(row.Stage, "Implement") : projectStage(req.body.stage, null);
      if (!stage) fail(400, "Select a valid project stage");
      await new sql.Request(transaction)
        .input("Id", sql.Int, milestoneId)
        .input("Name", sql.NVarChar(255), textValue(req.body.name) || row.MilestoneName)
        .input("Description", sql.NVarChar(sql.MAX), req.body.description === undefined ? row.Description : textValue(req.body.description))
        .input("Priority", sql.NVarChar(20), priority)
        .input("Stage", sql.NVarChar(20), stage)
        .input("Deliverable", sql.NVarChar(sql.MAX), req.body.deliverable === undefined ? row.Deliverable : textValue(req.body.deliverable))
        .input("Acceptance", sql.NVarChar(sql.MAX), req.body.acceptanceCriteria === undefined ? row.AcceptanceCriteria : textValue(req.body.acceptanceCriteria))
        .input("BaselineStart", sql.Date, req.body.baselineStartDate === undefined ? row.BaselineStartDate : dateValue(req.body.baselineStartDate))
        .input("BaselineTarget", sql.Date, req.body.baselineTargetDate === undefined ? row.BaselineTargetDate : dateValue(req.body.baselineTargetDate))
        .input("StartDate", sql.Date, startDate).input("TargetDate", sql.Date, targetDate)
        .input("ActualStart", sql.Date, req.body.actualStartDate === undefined ? row.ActualStartDate : dateValue(req.body.actualStartDate))
        .input("Notes", sql.NVarChar(sql.MAX), req.body.notes === undefined ? row.Notes : textValue(req.body.notes))
        .input("PersonId", sql.Int, req.body.responsiblePersonId === undefined ? row.ResponsiblePersonId : idValue(req.body.responsiblePersonId))
        .input("PersonName", sql.NVarChar(200), req.body.responsiblePerson === undefined && req.body.owner === undefined
          ? row.ResponsiblePersonName : textValue(req.body.responsiblePerson ?? req.body.owner))
        .input("UserId", sql.Int, req.user.id)
        .query(`UPDATE dbo.ProjectMilestones SET MilestoneName=@Name,Description=@Description,Stage=@Stage,StartDate=@StartDate,
          TargetDate=@TargetDate,Priority=@Priority,Deliverable=@Deliverable,AcceptanceCriteria=@Acceptance,
          BaselineStartDate=@BaselineStart,BaselineTargetDate=@BaselineTarget,ActualStartDate=@ActualStart,
          Notes=@Notes,ResponsiblePersonId=@PersonId,ResponsiblePersonName=@PersonName,
          UpdatedBy=@UserId,UpdatedAt=SYSUTCDATETIME() WHERE MilestoneId=@Id`);
      if (req.body.taskIds !== undefined || req.body.linkedTasks !== undefined) {
        await replaceMilestoneTasks(transaction, milestoneId, row.ProjectId, req.body.taskIds || req.body.linkedTasks || []);
      }
      if (req.body.dependencyIds !== undefined) await replaceMilestoneDependencies(transaction, milestoneId, row.ProjectId, req.body.dependencyIds, req.user.id);
      if (req.body.reportIds !== undefined) await replaceMilestoneReports(transaction, milestoneId, row.ProjectId, req.body.reportIds, req.user.id);
      await syncMilestoneCompletion(transaction, row.ProjectId);
      await transaction.commit();
      await writeAudit(req, { action: "milestone.update", targetType: "project-milestone", targetId: milestoneId, before: row, after: req.body });
      return res.json({ ok: true, milestone: await loadMilestoneDetail(milestoneId, req.user) });
    } catch (error) {
      if (transaction) try { await transaction.rollback(); } catch { /* noop */ }
      return next(error);
    }
  };
  router.put("/milestones/:milestoneId", requirePermission("tasks.manage"), updateMilestoneHandler);
  router.patch("/milestones/:milestoneId", requirePermission("tasks.manage"), updateMilestoneHandler);

  const replaceRelation = (type) => async (req, res, next) => {
    let transaction;
    try {
      const pool = await getPool(); transaction = pool.transaction(); await transaction.begin();
      const milestoneId = idValue(req.params.milestoneId);
      const current = await new sql.Request(transaction).input("Id", sql.Int, milestoneId)
        .query(`SELECT ProjectId FROM dbo.ProjectMilestones WHERE MilestoneId=@Id AND IsDeleted=0`);
      if (!current.recordset[0]) fail(404, "Milestone not found");
      if (type === "tasks") {
        await replaceMilestoneTasks(transaction, milestoneId, current.recordset[0].ProjectId, req.body.taskIds || []);
        await syncMilestoneCompletion(transaction, current.recordset[0].ProjectId);
      } else if (type === "reports") {
        await replaceMilestoneReports(transaction, milestoneId, current.recordset[0].ProjectId, req.body.reportIds || [], req.user.id);
      } else {
        await replaceMilestoneDependencies(transaction, milestoneId, current.recordset[0].ProjectId, req.body.dependencyIds || [], req.user.id);
      }
      await transaction.commit();
      await writeAudit(req, { action: `milestone.${type}.update`, targetType: "project-milestone", targetId: milestoneId, after: req.body });
      return res.json({ ok: true, milestone: await loadMilestoneDetail(milestoneId, req.user) });
    } catch (error) {
      if (transaction) try { await transaction.rollback(); } catch { /* noop */ }
      return next(error);
    }
  };
  router.put("/milestones/:milestoneId/tasks", requirePermission("tasks.manage"), replaceRelation("tasks"));
  router.put("/milestones/:milestoneId/reports", requirePermission("tasks.manage"), replaceRelation("reports"));
  router.put("/milestones/:milestoneId/dependencies", requirePermission("tasks.manage"), replaceRelation("dependencies"));

  router.post("/milestones/:milestoneId/health-override", requirePermission("tasks.manage"), async (req, res, next) => {
    try {
      const override = textValue(req.body?.health);
      const reason = textValue(req.body?.reason);
      if (override && !["On Track", "At Risk", "Overdue"].includes(override)) fail(400, "Select a valid health value");
      if (override && !reason) fail(400, "A reason is required for a health override");
      const pool = await getPool();
      const before = await pool.request().input("Id", sql.Int, idValue(req.params.milestoneId))
        .query(`SELECT HealthOverride,HealthOverrideReason FROM dbo.ProjectMilestones WHERE MilestoneId=@Id AND IsDeleted=0`);
      if (!before.recordset[0]) fail(404, "Milestone not found");
      await pool.request().input("Id", sql.Int, idValue(req.params.milestoneId))
        .input("Health", sql.NVarChar(20), override).input("Reason", sql.NVarChar(sql.MAX), reason)
        .input("UserId", sql.Int, req.user.id).query(`UPDATE dbo.ProjectMilestones SET
          HealthOverride=@Health,HealthOverrideReason=@Reason,
          HealthOverriddenBy=CASE WHEN @Health IS NULL THEN NULL ELSE @UserId END,
          HealthOverriddenAt=CASE WHEN @Health IS NULL THEN NULL ELSE SYSUTCDATETIME() END,
          UpdatedBy=@UserId,UpdatedAt=SYSUTCDATETIME() WHERE MilestoneId=@Id`);
      await writeAudit(req, { action: override ? "milestone.health.override" : "milestone.health.clear", targetType: "project-milestone", targetId: req.params.milestoneId, before: before.recordset[0], after: { override, reason } });
      return res.json({ ok: true, milestone: await loadMilestoneDetail(idValue(req.params.milestoneId), req.user) });
    } catch (error) { return next(error); }
  });

  const milestoneStateAction = (action) => async (req, res, next) => {
    try {
      const id = idValue(req.params.milestoneId);
      const reason = textValue(req.body?.reason);
      if (action === "cancel" && !reason) fail(400, "A cancellation reason is required");
      const pool = await getPool();
      const current = await pool.request().input("Id", sql.Int, id)
        .query(`SELECT * FROM dbo.ProjectMilestones WHERE MilestoneId=@Id`);
      if (!current.recordset[0]) fail(404, "Milestone not found");
      if (action === "delete") {
        const links = await pool.request().input("Id", sql.Int, id)
          .query(`SELECT COUNT(*) AS Total FROM dbo.MilestoneTasks WHERE MilestoneId=@Id`);
        if (Number(links.recordset[0]?.Total || 0) > 0) {
          fail(409, "A milestone containing tasks cannot be archived");
        }
      }
      const query = action === "cancel"
        ? `UPDATE dbo.ProjectMilestones SET IsCancelled=1,CancelledBy=@UserId,CancelledAt=SYSUTCDATETIME(),
            CancellationReason=@Reason,UpdatedBy=@UserId,UpdatedAt=SYSUTCDATETIME() WHERE MilestoneId=@Id AND IsDeleted=0`
        : action === "restore"
          ? `UPDATE dbo.ProjectMilestones SET IsDeleted=0,DeletedBy=NULL,DeletedAt=NULL,IsCancelled=0,
              CancelledBy=NULL,CancelledAt=NULL,CancellationReason=NULL,UpdatedBy=@UserId,UpdatedAt=SYSUTCDATETIME() WHERE MilestoneId=@Id`
          : `UPDATE dbo.ProjectMilestones SET IsDeleted=1,DeletedBy=@UserId,DeletedAt=SYSUTCDATETIME(),
              UpdatedBy=@UserId,UpdatedAt=SYSUTCDATETIME() WHERE MilestoneId=@Id AND IsDeleted=0`;
      await pool.request().input("Id", sql.Int, id).input("UserId", sql.Int, req.user.id)
        .input("Reason", sql.NVarChar(sql.MAX), reason).query(query);
      await writeAudit(req, { action: `milestone.${action}`, targetType: "project-milestone", targetId: id, before: current.recordset[0], after: { reason } });
      return res.json({ ok: true, milestone: action === "delete" ? null : await loadMilestoneDetail(id, req.user) });
    } catch (error) { return next(error); }
  };
  router.post("/milestones/:milestoneId/cancel", requirePermission("tasks.manage"), milestoneStateAction("cancel"));
  router.post("/milestones/:milestoneId/restore", requirePermission("tasks.manage"), milestoneStateAction("restore"));
  router.delete("/milestones/:milestoneId", requirePermission("tasks.manage"), milestoneStateAction("delete"));

  router.post("/milestones/:milestoneId/risks", requirePermission("tasks.manage"), async (req, res, next) => {
    try {
      const type = ["Risk", "Issue", "Blocker"].includes(req.body?.type) ? req.body.type : "Risk";
      const severity = ["Low", "Medium", "High", "Critical"].includes(req.body?.severity) ? req.body.severity : "Medium";
      const title = textValue(req.body?.title);
      if (!title) fail(400, "Risk or issue title is required");
      const pool = await getPool();
      const valid = await pool.request().input("Id", sql.Int, idValue(req.params.milestoneId))
        .query(`SELECT MilestoneId FROM dbo.ProjectMilestones WHERE MilestoneId=@Id AND IsDeleted=0`);
      if (!valid.recordset[0]) fail(404, "Milestone not found");
      const inserted = await pool.request().input("MilestoneId", sql.Int, idValue(req.params.milestoneId))
        .input("Type", sql.NVarChar(20), type).input("Severity", sql.NVarChar(20), severity)
        .input("Title", sql.NVarChar(255), title).input("Description", sql.NVarChar(sql.MAX), textValue(req.body.description))
        .input("OwnerId", sql.Int, idValue(req.body.ownerId)).input("Owner", sql.NVarChar(200), textValue(req.body.owner))
        .input("DueDate", sql.Date, dateValue(req.body.dueDate)).input("Status", sql.NVarChar(20), textValue(req.body.status) || "Open")
        .input("Mitigation", sql.NVarChar(sql.MAX), textValue(req.body.mitigationResolution))
        .input("UserId", sql.Int, req.user.id).query(`INSERT dbo.MilestoneRisksIssues
          (MilestoneId,ItemType,Severity,Title,Description,OwnerId,OwnerName,DueDate,Status,MitigationResolution,CreatedBy,UpdatedBy)
          OUTPUT INSERTED.RiskIssueId VALUES(@MilestoneId,@Type,@Severity,@Title,@Description,@OwnerId,@Owner,@DueDate,@Status,@Mitigation,@UserId,@UserId)`);
      const riskId = inserted.recordset[0].RiskIssueId;
      await writeAudit(req, { action: "milestone.risk.create", targetType: "project-milestone", targetId: req.params.milestoneId, after: { riskId, ...req.body } });
      return res.status(201).json({ ok: true, milestone: await loadMilestoneDetail(idValue(req.params.milestoneId), req.user) });
    } catch (error) { return next(error); }
  });

  router.patch("/milestones/:milestoneId/risks/:riskId", requirePermission("tasks.manage"), async (req, res, next) => {
    try {
      const pool = await getPool();
      const existing = await pool.request().input("MilestoneId", sql.Int, idValue(req.params.milestoneId))
        .input("RiskId", sql.BigInt, req.params.riskId).query(`SELECT * FROM dbo.MilestoneRisksIssues
          WHERE RiskIssueId=@RiskId AND MilestoneId=@MilestoneId AND IsDeleted=0`);
      const row = existing.recordset[0]; if (!row) fail(404, "Risk or issue not found");
      const type = req.body.type === undefined ? row.ItemType : req.body.type;
      const severity = req.body.severity === undefined ? row.Severity : req.body.severity;
      const status = req.body.status === undefined ? row.Status : req.body.status;
      if (!["Risk", "Issue", "Blocker"].includes(type)) fail(400, "Select a valid item type");
      if (!["Low", "Medium", "High", "Critical"].includes(severity)) fail(400, "Select a valid severity");
      if (!["Open", "In Progress", "Resolved", "Closed"].includes(status)) fail(400, "Select a valid risk status");
      await pool.request().input("RiskId", sql.BigInt, req.params.riskId).input("Type", sql.NVarChar(20), type)
        .input("Severity", sql.NVarChar(20), severity).input("Title", sql.NVarChar(255), textValue(req.body.title) || row.Title)
        .input("Description", sql.NVarChar(sql.MAX), req.body.description === undefined ? row.Description : textValue(req.body.description))
        .input("OwnerId", sql.Int, req.body.ownerId === undefined ? row.OwnerId : idValue(req.body.ownerId))
        .input("Owner", sql.NVarChar(200), req.body.owner === undefined ? row.OwnerName : textValue(req.body.owner))
        .input("DueDate", sql.Date, req.body.dueDate === undefined ? row.DueDate : dateValue(req.body.dueDate))
        .input("Status", sql.NVarChar(20), status)
        .input("Mitigation", sql.NVarChar(sql.MAX), req.body.mitigationResolution === undefined ? row.MitigationResolution : textValue(req.body.mitigationResolution))
        .input("UserId", sql.Int, req.user.id).query(`UPDATE dbo.MilestoneRisksIssues SET ItemType=@Type,Severity=@Severity,
          Title=@Title,Description=@Description,OwnerId=@OwnerId,OwnerName=@Owner,DueDate=@DueDate,Status=@Status,
          MitigationResolution=@Mitigation,UpdatedBy=@UserId,UpdatedAt=SYSUTCDATETIME() WHERE RiskIssueId=@RiskId`);
      await writeAudit(req, { action: "milestone.risk.update", targetType: "project-milestone", targetId: req.params.milestoneId, before: row, after: req.body });
      return res.json({ ok: true, milestone: await loadMilestoneDetail(idValue(req.params.milestoneId), req.user) });
    } catch (error) { return next(error); }
  });

  router.delete("/milestones/:milestoneId/risks/:riskId", requirePermission("tasks.manage"), async (req, res, next) => {
    try {
      const pool = await getPool();
      const result = await pool.request().input("MilestoneId", sql.Int, idValue(req.params.milestoneId))
        .input("RiskId", sql.BigInt, req.params.riskId).input("UserId", sql.Int, req.user.id)
        .query(`UPDATE dbo.MilestoneRisksIssues SET IsDeleted=1,UpdatedBy=@UserId,UpdatedAt=SYSUTCDATETIME()
          WHERE RiskIssueId=@RiskId AND MilestoneId=@MilestoneId AND IsDeleted=0`);
      if (!result.rowsAffected[0]) fail(404, "Risk or issue not found");
      await writeAudit(req, { action: "milestone.risk.delete", targetType: "project-milestone", targetId: req.params.milestoneId, after: { riskId: req.params.riskId } });
      return res.json({ ok: true, milestone: await loadMilestoneDetail(idValue(req.params.milestoneId), req.user) });
    } catch (error) { return next(error); }
  });

  router.get("/documents/link-options", async (req, res, next) => {
    try {
      const projectId = idValue(req.query.projectId);
      if (!projectId) return res.status(400).json({ ok: false, error: "Project is required" });
      const pool = await getPool();
      const result = await pool.request().input("ProjectId", sql.Int, projectId).query(`
        SELECT CONVERT(NVARCHAR(100),l.LocationId) AS id,l.Name AS label
        FROM dbo.Locations l
        WHERE l.ProjectId=@ProjectId OR EXISTS(
          SELECT 1 FROM dbo.ProjectLocations pl
          WHERE pl.ProjectId=@ProjectId AND pl.LocationId=l.LocationId
        ) ORDER BY l.Name;
        SELECT CONVERT(NVARCHAR(100),TaskId) AS id,TaskName AS label FROM dbo.ProjectTasks WHERE ProjectId=@ProjectId ORDER BY TaskName;
        SELECT CONVERT(NVARCHAR(100),MilestoneId) AS id,MilestoneName AS label FROM dbo.ProjectMilestones WHERE ProjectId=@ProjectId ORDER BY MilestoneName;
        SELECT CONVERT(NVARCHAR(100),ReportId) AS id,ReportNumber AS label FROM dbo.DailySiteReports WHERE ProjectId=@ProjectId ORDER BY ReportDate DESC;
        SELECT CONVERT(NVARCHAR(100),BOQId) AS id,BOQNumber AS label FROM dbo.BOQProjects WHERE ProjectId=@ProjectId ORDER BY BOQId DESC;
        SELECT CONVERT(NVARCHAR(100),Id) AS id,PONumber AS label FROM dbo.PurchaseOrders WHERE ProjectId=@ProjectId ORDER BY Id DESC;
        SELECT CONVERT(NVARCHAR(100),RecordId) AS id,
          COALESCE(JSON_VALUE(DataJson,'$.allocationNumber'),CONCAT(N'Allocation ',RecordId)) AS label
        FROM dbo.ProjectModuleRecords WHERE ProjectId=@ProjectId AND ModuleType=N'InventoryAllocation' AND IsDeleted=0 ORDER BY RecordId DESC;
      `);
      const keys = ["Site", "Task", "Milestone", "DailySiteReport", "BOQ", "PurchaseOrder", "InventoryAllocation"];
      return res.json({
        ok: true,
        options: Object.fromEntries(keys.map((key, index) => [key, result.recordsets[index] || []])),
      });
    } catch (error) { return next(error); }
  });

  router.get("/documents", async (req, res, next) => {
    try {
      const page = Math.max(idValue(req.query.page) || 1, 1);
      const pageSize = Math.min(Math.max(idValue(req.query.pageSize) || 50, 1), 100);
      const pool = await getPool();
      const request = pool.request()
        .input("ProjectId", sql.Int, idValue(req.query.projectId))
        .input("Category", sql.NVarChar(100), textValue(req.query.category))
        .input("Status", sql.NVarChar(20), textValue(req.query.status))
        .input("Discipline", sql.NVarChar(100), textValue(req.query.discipline))
        .input("DateFrom", sql.Date, dateValue(req.query.dateFrom))
        .input("DateTo", sql.Date, dateValue(req.query.dateTo))
        .input("Search", sql.NVarChar(300), textValue(req.query.search))
        .input("Offset", sql.Int, (page - 1) * pageSize)
        .input("PageSize", sql.Int, pageSize);
      const where = `
        d.IsDeleted=0
        AND (@ProjectId IS NULL OR d.ProjectId=@ProjectId)
        AND (@Category IS NULL OR d.Category=@Category)
        AND (@Status IS NULL OR d.Status=@Status)
        AND (@Discipline IS NULL OR d.Discipline=@Discipline)
        AND (@DateFrom IS NULL OR d.DocumentDate>=@DateFrom)
        AND (@DateTo IS NULL OR d.DocumentDate<=@DateTo)
        AND (@Search IS NULL OR d.DocumentName LIKE N'%'+@Search+N'%'
          OR d.DocumentNumber LIKE N'%'+@Search+N'%'
          OR d.ExternalReference LIKE N'%'+@Search+N'%'
          OR EXISTS(SELECT 1 FROM dbo.DocumentLinks dl
            WHERE dl.DocumentId=d.DocumentId AND dl.LinkType=N'Milestone'
              AND dl.LinkLabel LIKE N'%'+@Search+N'%'))`;
      const result = await request.query(`
        ${documentSelectSql} WHERE ${where}
        ORDER BY d.UpdatedAt DESC,d.DocumentId DESC
        OFFSET @Offset ROWS FETCH NEXT @PageSize ROWS ONLY;
        SELECT COUNT(*) AS Total FROM dbo.ProjectDocuments d WHERE ${where};
        SELECT d.Status,COUNT(*) AS Total FROM dbo.ProjectDocuments d
        WHERE ${where} GROUP BY d.Status;
        SELECT d.Category,d.CustomCategory,COUNT(*) AS Total
        FROM dbo.ProjectDocuments d WHERE ${where}
        GROUP BY d.Category,d.CustomCategory ORDER BY Total DESC,d.Category;
        SELECT d.ProjectId AS id,p.projectName AS name,p.ProjectCode AS code,COUNT(*) AS Total
        FROM dbo.ProjectDocuments d JOIN dbo.Projects p ON p.ProjectId=d.ProjectId
        WHERE ${where} GROUP BY d.ProjectId,p.projectName,p.ProjectCode
        ORDER BY Total DESC,p.projectName;
      `);
      return res.json({
        ok: true,
        categories: DOCUMENT_CATEGORIES,
        permissions: {
          canCreateDrawing: hasPermission(req.user, "drawings.create"),
          canCreateSupporting:
            hasPermission(req.user, "drawings.create") ||
            hasPermission(req.user, "documents.support.upload"),
          canApprove: hasPermission(req.user, "drawings.approve"),
        },
        documents: (result.recordsets[0] || []).map((row) => documentFromRow(row, req.user)),
        pagination: { page, pageSize, total: Number(result.recordsets[1]?.[0]?.Total || 0) },
        statusCounts: Object.fromEntries((result.recordsets[2] || []).map((row) => [row.Status, Number(row.Total)])),
        overview: {
          categories: (result.recordsets[3] || []).map((row) => ({
            name: row.Category === "Other" ? row.CustomCategory || "Other" : row.Category,
            total: Number(row.Total || 0),
          })),
          projects: (result.recordsets[4] || []).map((row) => ({
            id: row.id,
            name: row.name,
            code: row.code || "",
            total: Number(row.Total || 0),
          })),
        },
      });
    } catch (error) { return next(error); }
  });

  router.get("/documents/report", async (req, res, next) => {
    try {
      const pool = await getPool();
      const request = pool.request()
        .input("ProjectId", sql.Int, idValue(req.query.projectId))
        .input("Category", sql.NVarChar(100), textValue(req.query.category))
        .input("Status", sql.NVarChar(20), textValue(req.query.status))
        .input("Discipline", sql.NVarChar(100), textValue(req.query.discipline))
        .input("DateFrom", sql.Date, dateValue(req.query.dateFrom))
        .input("DateTo", sql.Date, dateValue(req.query.dateTo))
        .input("Search", sql.NVarChar(300), textValue(req.query.search));
      const where = `
        d.IsDeleted=0
        AND (@ProjectId IS NULL OR d.ProjectId=@ProjectId)
        AND (@Category IS NULL OR d.Category=@Category)
        AND (@Status IS NULL OR d.Status=@Status)
        AND (@Discipline IS NULL OR d.Discipline=@Discipline)
        AND (@DateFrom IS NULL OR d.DocumentDate>=@DateFrom)
        AND (@DateTo IS NULL OR d.DocumentDate<=@DateTo)
        AND (@Search IS NULL OR d.DocumentName LIKE N'%'+@Search+N'%'
          OR d.DocumentNumber LIKE N'%'+@Search+N'%'
          OR d.ExternalReference LIKE N'%'+@Search+N'%'
          OR EXISTS(SELECT 1 FROM dbo.DocumentLinks dl
            WHERE dl.DocumentId=d.DocumentId AND dl.LinkType=N'Milestone'
              AND dl.LinkLabel LIKE N'%'+@Search+N'%'))`;
      const result = await request.query(`
        ${documentSelectSql} WHERE ${where}
        ORDER BY d.ProjectId,d.DocumentNumber;

        SELECT l.DocumentId,l.DocumentLinkId AS id,l.LinkType AS type,
          l.LinkId AS linkId,l.LinkLabel AS label,l.CreatedAt AS createdAt,
          u.FullName AS createdBy
        FROM dbo.DocumentLinks l
        JOIN dbo.ProjectDocuments d ON d.DocumentId=l.DocumentId
        LEFT JOIN dbo.AppUsers u ON u.UserId=l.CreatedBy
        WHERE ${where} ORDER BY l.DocumentId,l.LinkType,l.LinkLabel;

        SELECT rv.DocumentId,rv.DocumentRevisionId AS id,
          rv.RevisionNumber AS revision,rv.RevisionLabel AS revisionLabel,
          rv.FileName AS fileName,rv.ContentType AS contentType,
          rv.FileSize AS fileSize,rv.ClientRevisionReference AS clientRevisionReference,
          rv.ChangeSummary AS changeSummary,rv.Remarks AS remarks,rv.Status AS status,
          u.FullName AS uploadedBy,rv.UploadedAt AS uploadedAt,
          a.FullName AS approvedBy,rv.ApprovedAt AS approvedAt,
          r.FullName AS rejectedBy,rv.RejectedAt AS rejectedAt,
          rv.RejectionReason AS rejectionReason
        FROM dbo.DocumentRevisions rv
        JOIN dbo.ProjectDocuments d ON d.DocumentId=rv.DocumentId
        JOIN dbo.AppUsers u ON u.UserId=rv.UploadedBy
        LEFT JOIN dbo.AppUsers a ON a.UserId=rv.ApprovedBy
        LEFT JOIN dbo.AppUsers r ON r.UserId=rv.RejectedBy
        WHERE ${where} ORDER BY rv.DocumentId,rv.RevisionNumber DESC;
      `);
      const linksByDocument = new Map();
      for (const link of result.recordsets[1] || []) {
        const links = linksByDocument.get(link.DocumentId) || [];
        links.push(link);
        linksByDocument.set(link.DocumentId, links);
      }
      const revisionsByDocument = new Map();
      for (const revision of result.recordsets[2] || []) {
        const revisions = revisionsByDocument.get(revision.DocumentId) || [];
        revisions.push(revision);
        revisionsByDocument.set(revision.DocumentId, revisions);
      }
      const documents = (result.recordsets[0] || []).map((row) => ({
        ...documentFromRow(row, req.user),
        links: linksByDocument.get(row.DocumentId) || [],
        revisions: revisionsByDocument.get(row.DocumentId) || [],
      }));
      return res.json({
        ok: true,
        generatedAt: new Date().toISOString(),
        documents,
      });
    } catch (error) { return next(error); }
  });

  router.get("/documents/:documentId", async (req, res, next) => {
    try {
      const document = await loadDocumentDetail(idValue(req.params.documentId), req.user);
      if (!document) return res.status(404).json({ ok: false, error: "Document not found" });
      return res.json({ ok: true, document });
    } catch (error) { return next(error); }
  });

  router.post("/projects/:projectId/documents", upload.single("file"), async (req, res, next) => {
    let transaction;
    try {
      if (!req.file) fail(400, "An initial document file is required");
      const projectId = idValue(req.params.projectId);
      const category = documentCategory(req.body.category);
      if (!canCreateDocumentCategory(req.user, category)) fail(403, "You cannot upload this document category");
      const customCategory = textValue(req.body.customCategory);
      if (category === "Other" && !customCategory) fail(400, "A custom category is required");
      const name = textValue(req.body.name) || req.file.originalname;
      const pool = await getPool(); transaction = pool.transaction(); await transaction.begin();
      const projectResult = await new sql.Request(transaction).input("ProjectId", sql.Int, projectId)
        .query("SELECT ProjectId,ProjectCode FROM dbo.Projects WITH (UPDLOCK) WHERE ProjectId=@ProjectId");
      const project = projectResult.recordset[0];
      if (!project) fail(404, "Project not found");
      const code = String(project.ProjectCode || project.ProjectId).toUpperCase().replace(/[^A-Z0-9-]/g, "").slice(0, 40) || String(project.ProjectId);
      const numberResult = await new sql.Request(transaction).input("Prefix", sql.NVarChar(100), `DOC-${code}-%`)
        .query(`SELECT COALESCE(MAX(TRY_CONVERT(INT,RIGHT(DocumentNumber,4))),0)+1 AS NextNumber
          FROM dbo.ProjectDocuments WITH (UPDLOCK) WHERE DocumentNumber LIKE @Prefix`);
      const documentNumber = buildDocumentNumber(code, project.ProjectId, numberResult.recordset[0].NextNumber);
      const inserted = await new sql.Request(transaction)
        .input("ProjectId", sql.Int, projectId).input("Number", sql.NVarChar(120), documentNumber)
        .input("Name", sql.NVarChar(255), name).input("Description", sql.NVarChar(sql.MAX), textValue(req.body.description))
        .input("Category", sql.NVarChar(100), category).input("CustomCategory", sql.NVarChar(100), customCategory)
        .input("Discipline", sql.NVarChar(100), textValue(req.body.discipline))
        .input("DocumentDate", sql.Date, dateValue(req.body.documentDate))
        .input("ExternalReference", sql.NVarChar(200), textValue(req.body.externalReference))
        .input("IssuePurpose", sql.NVarChar(100), textValue(req.body.issuePurpose))
        .input("ResponsiblePersonId", sql.NVarChar(100), textValue(req.body.responsiblePersonId))
        .input("ResponsiblePersonName", sql.NVarChar(200), textValue(req.body.responsiblePersonName))
        .input("Confidentiality", sql.NVarChar(30), textValue(req.body.confidentiality) || "Internal")
        .input("TagsJson", sql.NVarChar(sql.MAX), serialize(cleanTags(req.body.tags)))
        .input("UserId", sql.Int, req.user.id)
        .query(`INSERT dbo.ProjectDocuments
          (ProjectId,DocumentNumber,DocumentName,Description,Category,CustomCategory,Discipline,
           DocumentDate,ExternalReference,IssuePurpose,ResponsiblePersonId,ResponsiblePersonName,
           Confidentiality,TagsJson,Status,CurrentRevision,UploadedBy,UpdatedBy)
          OUTPUT INSERTED.DocumentId
          VALUES(@ProjectId,@Number,@Name,@Description,@Category,@CustomCategory,@Discipline,
           @DocumentDate,@ExternalReference,@IssuePurpose,@ResponsiblePersonId,@ResponsiblePersonName,
           @Confidentiality,@TagsJson,N'Draft',0,@UserId,@UserId)`);
      const documentId = inserted.recordset[0].DocumentId;
      await new sql.Request(transaction)
        .input("DocumentId", sql.Int, documentId).input("FileName", sql.NVarChar(255), req.file.originalname)
        .input("ContentType", sql.NVarChar(150), req.file.mimetype).input("FileSize", sql.Int, req.file.size)
        .input("FileData", sql.VarBinary(sql.MAX), req.file.buffer)
        .input("ClientRef", sql.NVarChar(100), textValue(req.body.clientRevisionReference))
        .input("Summary", sql.NVarChar(sql.MAX), textValue(req.body.changeSummary) || "Initial issue")
        .input("Remarks", sql.NVarChar(sql.MAX), textValue(req.body.remarks)).input("UserId", sql.Int, req.user.id)
        .query(`INSERT dbo.DocumentRevisions
          (DocumentId,RevisionNumber,RevisionLabel,FileName,ContentType,FileSize,FileData,
           ClientRevisionReference,ChangeSummary,Remarks,Status,UploadedBy)
          VALUES(@DocumentId,0,N'R0',@FileName,@ContentType,@FileSize,@FileData,
           @ClientRef,@Summary,@Remarks,N'Draft',@UserId)`);
      await replaceDocumentLinks(transaction, documentId, projectId, req.body.links, req.user.id);
      await transaction.commit();
      await writeAudit(req, { action: "document.create", targetType: "project-document", targetId: documentId, after: { documentNumber, name, category } });
      return res.status(201).json({ ok: true, document: await loadDocumentDetail(documentId, req.user) });
    } catch (error) {
      if (transaction) try { await transaction.rollback(); } catch { /* noop */ }
      return next(error);
    }
  });

  router.patch("/documents/:documentId", async (req, res, next) => {
    let transaction;
    try {
      const id = idValue(req.params.documentId);
      const pool = await getPool(); transaction = pool.transaction(); await transaction.begin();
      const existing = await new sql.Request(transaction).input("Id", sql.Int, id)
        .query("SELECT * FROM dbo.ProjectDocuments WITH (UPDLOCK) WHERE DocumentId=@Id AND IsDeleted=0");
      const document = existing.recordset[0];
      if (!document) fail(404, "Document not found");
      if (!canEditDocument(req.user, document)) fail(403, "You cannot edit this document");
      if (!["Draft", "Rejected"].includes(document.Status)) fail(409, "Only draft or rejected documents can be edited");
      const category = documentCategory(req.body.category ?? document.Category);
      if (!canCreateDocumentCategory(req.user, category)) fail(403, "You cannot change to this category");
      const customCategory = req.body.customCategory === undefined ? document.CustomCategory : textValue(req.body.customCategory);
      if (category === "Other" && !customCategory) fail(400, "A custom category is required");
      await new sql.Request(transaction)
        .input("Id", sql.Int, id).input("Name", sql.NVarChar(255), textValue(req.body.name) || document.DocumentName)
        .input("Description", sql.NVarChar(sql.MAX), req.body.description === undefined ? document.Description : textValue(req.body.description))
        .input("Category", sql.NVarChar(100), category).input("CustomCategory", sql.NVarChar(100), customCategory)
        .input("Discipline", sql.NVarChar(100), req.body.discipline === undefined ? document.Discipline : textValue(req.body.discipline))
        .input("DocumentDate", sql.Date, req.body.documentDate === undefined ? document.DocumentDate : dateValue(req.body.documentDate))
        .input("ExternalReference", sql.NVarChar(200), req.body.externalReference === undefined ? document.ExternalReference : textValue(req.body.externalReference))
        .input("IssuePurpose", sql.NVarChar(100), req.body.issuePurpose === undefined ? document.IssuePurpose : textValue(req.body.issuePurpose))
        .input("ResponsiblePersonId", sql.NVarChar(100), req.body.responsiblePersonId === undefined ? document.ResponsiblePersonId : textValue(req.body.responsiblePersonId))
        .input("ResponsiblePersonName", sql.NVarChar(200), req.body.responsiblePersonName === undefined ? document.ResponsiblePersonName : textValue(req.body.responsiblePersonName))
        .input("Confidentiality", sql.NVarChar(30), textValue(req.body.confidentiality) || document.Confidentiality || "Internal")
        .input("TagsJson", sql.NVarChar(sql.MAX), req.body.tags === undefined ? document.TagsJson : serialize(cleanTags(req.body.tags)))
        .input("UserId", sql.Int, req.user.id)
        .query(`UPDATE dbo.ProjectDocuments SET DocumentName=@Name,Description=@Description,
          Category=@Category,CustomCategory=@CustomCategory,Discipline=@Discipline,DocumentDate=@DocumentDate,
          ExternalReference=@ExternalReference,IssuePurpose=@IssuePurpose,ResponsiblePersonId=@ResponsiblePersonId,
          ResponsiblePersonName=@ResponsiblePersonName,Confidentiality=@Confidentiality,TagsJson=@TagsJson,
          Status=N'Draft',RejectedBy=NULL,RejectedAt=NULL,RejectionReason=NULL,
          UpdatedBy=@UserId,UpdatedAt=SYSUTCDATETIME() WHERE DocumentId=@Id`);
      if (req.body.links !== undefined) {
        await replaceDocumentLinks(transaction, id, document.ProjectId, req.body.links, req.user.id);
      }
      await transaction.commit();
      await writeAudit(req, { action: "document.update", targetType: "project-document", targetId: id, before: document, after: req.body });
      return res.json({ ok: true, document: await loadDocumentDetail(id, req.user) });
    } catch (error) {
      if (transaction) try { await transaction.rollback(); } catch { /* noop */ }
      return next(error);
    }
  });

  router.put("/documents/:documentId/links", async (req, res, next) => {
    let transaction;
    try {
      const id = idValue(req.params.documentId);
      const pool = await getPool(); transaction = pool.transaction(); await transaction.begin();
      const existing = await new sql.Request(transaction).input("Id", sql.Int, id)
        .query("SELECT * FROM dbo.ProjectDocuments WITH (UPDLOCK) WHERE DocumentId=@Id AND IsDeleted=0");
      const document = existing.recordset[0];
      if (!document) fail(404, "Document not found");
      if (!canEditDocument(req.user, document)) fail(403, "You cannot edit this document");
      if (!["Draft", "Rejected"].includes(document.Status)) fail(409, "Only draft or rejected document links can be edited");
      const links = await replaceDocumentLinks(transaction, id, document.ProjectId, req.body.links, req.user.id);
      await new sql.Request(transaction).input("Id", sql.Int, id).input("UserId", sql.Int, req.user.id)
        .query("UPDATE dbo.ProjectDocuments SET Status=N'Draft',UpdatedBy=@UserId,UpdatedAt=SYSUTCDATETIME() WHERE DocumentId=@Id");
      await transaction.commit();
      await writeAudit(req, { action: "document.links.update", targetType: "project-document", targetId: id, after: links });
      return res.json({ ok: true, document: await loadDocumentDetail(id, req.user) });
    } catch (error) {
      if (transaction) try { await transaction.rollback(); } catch { /* noop */ }
      return next(error);
    }
  });

  router.post("/documents/:documentId/revisions", upload.single("file"), async (req, res, next) => {
    let transaction;
    try {
      if (!req.file) fail(400, "A revision file is required");
      const id = idValue(req.params.documentId);
      const pool = await getPool(); transaction = pool.transaction(); await transaction.begin();
      const existing = await new sql.Request(transaction).input("Id", sql.Int, id)
        .query("SELECT * FROM dbo.ProjectDocuments WITH (UPDLOCK) WHERE DocumentId=@Id AND IsDeleted=0");
      const document = existing.recordset[0];
      if (!document) fail(404, "Document not found");
      if (!canEditDocument(req.user, document)) fail(403, "You cannot revise this document");
      if (document.Status === "Superseded") fail(409, "Restore the document before uploading a revision");
      const revision = nextDocumentRevision(document.CurrentRevision);
      await new sql.Request(transaction).input("Id", sql.Int, id).input("Revision", sql.Int, revision)
        .input("Name", sql.NVarChar(255), textValue(req.body.name) || document.DocumentName)
        .input("UserId", sql.Int, req.user.id)
        .query(`UPDATE dbo.ProjectDocuments SET DocumentName=@Name,CurrentRevision=@Revision,Status=N'Draft',
          SubmittedBy=NULL,SubmittedAt=NULL,ApprovedBy=NULL,ApprovedAt=NULL,RejectedBy=NULL,
          RejectedAt=NULL,RejectionReason=NULL,UpdatedBy=@UserId,UpdatedAt=SYSUTCDATETIME()
          WHERE DocumentId=@Id;
          UPDATE dbo.DocumentRevisions SET Status=N'Superseded'
          WHERE DocumentId=@Id AND RevisionNumber<@Revision AND Status<>N'Rejected';`);
      const inserted = await new sql.Request(transaction)
        .input("DocumentId", sql.Int, id).input("Revision", sql.Int, revision)
        .input("Label", sql.NVarChar(30), `R${revision}`)
        .input("FileName", sql.NVarChar(255), req.file.originalname)
        .input("ContentType", sql.NVarChar(150), req.file.mimetype)
        .input("FileSize", sql.Int, req.file.size).input("FileData", sql.VarBinary(sql.MAX), req.file.buffer)
        .input("ClientRef", sql.NVarChar(100), textValue(req.body.clientRevisionReference))
        .input("Summary", sql.NVarChar(sql.MAX), textValue(req.body.changeSummary))
        .input("Remarks", sql.NVarChar(sql.MAX), textValue(req.body.remarks))
        .input("UserId", sql.Int, req.user.id)
        .query(`INSERT dbo.DocumentRevisions
          (DocumentId,RevisionNumber,RevisionLabel,FileName,ContentType,FileSize,FileData,
           ClientRevisionReference,ChangeSummary,Remarks,Status,UploadedBy)
          OUTPUT INSERTED.DocumentRevisionId
          VALUES(@DocumentId,@Revision,@Label,@FileName,@ContentType,@FileSize,@FileData,
           @ClientRef,@Summary,@Remarks,N'Draft',@UserId)`);
      await transaction.commit();
      await writeAudit(req, { action: "document.revision.create", targetType: "project-document", targetId: id, after: { revision, revisionId: inserted.recordset[0].DocumentRevisionId } });
      return res.status(201).json({ ok: true, document: await loadDocumentDetail(id, req.user) });
    } catch (error) {
      if (transaction) try { await transaction.rollback(); } catch { /* noop */ }
      return next(error);
    }
  });

  const changeDocumentStatus = (action, allowed, status, permission = null) => async (req, res, next) => {
    try {
      const id = idValue(req.params.documentId);
      const pool = await getPool();
      const current = await pool.request().input("Id", sql.Int, id)
        .query("SELECT * FROM dbo.ProjectDocuments WHERE DocumentId=@Id AND IsDeleted=0");
      const document = current.recordset[0];
      if (!document) fail(404, "Document not found");
      if (permission && !hasPermission(req.user, permission)) fail(403, "You cannot perform this workflow action");
      if (!permission && !canEditDocument(req.user, document)) fail(403, "You cannot submit this document");
      if (!allowed.includes(document.Status)) fail(409, `A ${document.Status} document cannot be ${action}`);
      const reason = textValue(req.body?.reason ?? req.body?.remarks);
      if (["rejected", "superseded"].includes(action) && !reason) fail(400, `A ${action} reason is required`);
      const fields = {
        submitted: "SubmittedBy=@UserId,SubmittedAt=SYSUTCDATETIME()",
        approved: "ApprovedBy=@UserId,ApprovedAt=SYSUTCDATETIME()",
        rejected: "RejectedBy=@UserId,RejectedAt=SYSUTCDATETIME(),RejectionReason=@Reason",
        superseded: "SupersededBy=@UserId,SupersededAt=SYSUTCDATETIME(),SupersededReason=@Reason",
        restored: "RejectedBy=NULL,RejectedAt=NULL,RejectionReason=NULL,SupersededBy=NULL,SupersededAt=NULL,SupersededReason=NULL",
      }[action];
      await pool.request().input("Id", sql.Int, id).input("UserId", sql.Int, req.user.id)
        .input("Reason", sql.NVarChar(sql.MAX), reason)
        .input("Status", sql.NVarChar(20), status)
        .query(`UPDATE dbo.ProjectDocuments SET Status=@Status,${fields},
          UpdatedBy=@UserId,UpdatedAt=SYSUTCDATETIME() WHERE DocumentId=@Id;
          UPDATE dbo.DocumentRevisions SET Status=@Status,
            ApprovedBy=CASE WHEN @Status=N'Approved' THEN @UserId ELSE ApprovedBy END,
            ApprovedAt=CASE WHEN @Status=N'Approved' THEN SYSUTCDATETIME() ELSE ApprovedAt END,
            RejectedBy=CASE WHEN @Status=N'Rejected' THEN @UserId ELSE RejectedBy END,
            RejectedAt=CASE WHEN @Status=N'Rejected' THEN SYSUTCDATETIME() ELSE RejectedAt END,
            RejectionReason=CASE WHEN @Status=N'Rejected' THEN @Reason ELSE RejectionReason END
          WHERE DocumentId=@Id AND RevisionNumber=(SELECT CurrentRevision FROM dbo.ProjectDocuments WHERE DocumentId=@Id)`);
      await writeAudit(req, { action: `document.${action}`, targetType: "project-document", targetId: id, before: { status: document.Status }, after: { status, reason } });
      return res.json({ ok: true, document: await loadDocumentDetail(id, req.user) });
    } catch (error) { return next(error); }
  };
  router.post("/documents/:documentId/submit", changeDocumentStatus("submitted", ["Draft", "Rejected"], "Submitted"));
  router.post("/documents/:documentId/approve", changeDocumentStatus("approved", ["Submitted"], "Approved", "drawings.approve"));
  router.post("/documents/:documentId/reject", changeDocumentStatus("rejected", ["Submitted"], "Rejected", "drawings.approve"));
  router.post("/documents/:documentId/supersede", changeDocumentStatus("superseded", ["Approved"], "Superseded", "drawings.approve"));
  router.post("/documents/:documentId/restore", changeDocumentStatus("restored", ["Rejected", "Superseded"], "Draft", "drawings.approve"));

  router.delete("/documents/:documentId", async (req, res, next) => {
    try {
      const id = idValue(req.params.documentId);
      const pool = await getPool();
      const existing = await pool.request().input("Id", sql.Int, id)
        .query("SELECT * FROM dbo.ProjectDocuments WHERE DocumentId=@Id AND IsDeleted=0");
      const document = existing.recordset[0];
      if (!document) return res.status(404).json({ ok: false, error: "Document not found" });
      if (!canDeleteDocument(req.user, document)) return res.status(403).json({ ok: false, error: "You may delete only documents you are permitted to remove" });
      await pool.request().input("Id", sql.Int, id).input("UserId", sql.Int, req.user.id)
        .query(`UPDATE dbo.ProjectDocuments SET IsDeleted=1,DeletedBy=@UserId,DeletedAt=SYSUTCDATETIME(),
          UpdatedBy=@UserId,UpdatedAt=SYSUTCDATETIME() WHERE DocumentId=@Id`);
      await writeAudit(req, { action: "document.delete", targetType: "project-document", targetId: id, before: document });
      return res.json({ ok: true });
    } catch (error) { return next(error); }
  });

  router.get("/documents/:documentId/download", async (req, res, next) => {
    try {
      const pool = await getPool();
      const result = await pool.request().input("Id", sql.Int, idValue(req.params.documentId)).query(`
        SELECT TOP 1 r.DocumentRevisionId,r.FileName,r.ContentType,r.FileData FROM dbo.DocumentRevisions r
        JOIN dbo.ProjectDocuments d ON d.DocumentId=r.DocumentId
        WHERE r.DocumentId=@Id AND d.IsDeleted=0 ORDER BY r.RevisionNumber DESC`);
      const file = result.recordset[0];
      if (!file) return res.status(404).json({ ok: false, error: "Document not found" });
      await writeAudit(req, { action: "document.download", targetType: "project-document", targetId: req.params.documentId, after: { revisionId: file.DocumentRevisionId } });
      return res.type(file.ContentType).attachment(file.FileName).send(file.FileData);
    } catch (error) { return next(error); }
  });

  router.get("/document-revisions/:revisionId/download", async (req, res, next) => {
    try {
      const pool = await getPool();
      const result = await pool.request().input("Id", sql.Int, idValue(req.params.revisionId)).query(`
        SELECT r.DocumentId,r.FileName,r.ContentType,r.FileData FROM dbo.DocumentRevisions r
        JOIN dbo.ProjectDocuments d ON d.DocumentId=r.DocumentId
        WHERE r.DocumentRevisionId=@Id AND d.IsDeleted=0`);
      const file = result.recordset[0];
      if (!file) return res.status(404).json({ ok: false, error: "Revision not found" });
      await writeAudit(req, { action: "document.revision.download", targetType: "project-document", targetId: file.DocumentId, after: { revisionId: req.params.revisionId } });
      return res.type(file.ContentType).attachment(file.FileName).send(file.FileData);
    } catch (error) { return next(error); }
  });

  router.get("/documents/:documentId/revisions", async (req, res, next) => {
    try {
      const document = await loadDocumentDetail(idValue(req.params.documentId), req.user);
      if (!document) return res.status(404).json({ ok: false, error: "Document not found" });
      return res.json({ ok: true, revisions: document.revisions });
    } catch (error) { return next(error); }
  });
  router.get("/documents/:documentId/history", async (req, res, next) => {
    try {
      const document = await loadDocumentDetail(idValue(req.params.documentId), req.user);
      if (!document) return res.status(404).json({ ok: false, error: "Document not found" });
      return res.json({ ok: true, history: document.revisions, activity: document.activity });
    } catch (error) { return next(error); }
  });

  router.get("/reports", async (_req, res, next) => {
    try { return res.json({ ok: true, reports: await loadReports() }); }
    catch (error) { return next(error); }
  });

  const saveReport = async (req, res, next) => {
    let transaction;
    try {
      const input = req.body || {};
      const projectId = idValue(input.projectId);
      const work = textValue(input.workCompleted) || textValue(input.summary);
      if (!projectId || !input.reportDate) {
        return res.status(400).json({ ok: false, error: "Project and report date are required" });
      }
      const pool = await getPool(); transaction = pool.transaction(); await transaction.begin();
      let reportId = idValue(req.params.reportId);
      const isUpdate = Boolean(reportId);
      const reportTaskIds = [...new Set((input.taskRows || []).map((row) => idValue(row.taskId)).filter(Boolean))];
      if (reportTaskIds.length) {
        const validTasks = await new sql.Request(transaction).input("ProjectId", sql.Int, projectId)
          .input("TaskIds", sql.NVarChar(sql.MAX), serialize(reportTaskIds)).query(`
            SELECT TaskId FROM dbo.ProjectTasks WHERE ProjectId=@ProjectId
              AND TaskId IN (SELECT TRY_CONVERT(INT,value) FROM OPENJSON(@TaskIds))`);
        if (validTasks.recordset.length !== reportTaskIds.length) {
          fail(400, "Every report task must belong to the selected project");
        }
      }
      if (reportId) {
        const existing = await new sql.Request(transaction).input("Id", sql.Int, reportId)
          .query(`SELECT Status FROM dbo.DailySiteReports WHERE ReportId=@Id`);
        if (!existing.recordset[0]) fail(404, "Report not found");
        if (!["Draft", "Rejected"].includes(existing.recordset[0].Status)) {
          fail(409, "Only draft or rejected reports can be edited");
        }
        await new sql.Request(transaction).input("Id", sql.Int, reportId).input("ProjectId", sql.Int, projectId)
          .input("ReportDate", sql.Date, dateValue(input.reportDate)).input("SiteName", sql.NVarChar(255), textValue(input.siteName))
          .input("Shift", sql.NVarChar(50), textValue(input.shift)).input("Weather", sql.NVarChar(50), textValue(input.weather))
          .input("Work", sql.NVarChar(sql.MAX), work).input("Tomorrow", sql.NVarChar(sql.MAX), textValue(input.tomorrowPlan))
          .input("Issues", sql.NVarChar(sql.MAX), textValue(input.delays ?? input.issuesDelays))
          .input("ReportDataJson", sql.NVarChar(sql.MAX), serialize(reportDataPayload(input)))
          .query(`UPDATE dbo.DailySiteReports SET ProjectId=@ProjectId,ReportDate=@ReportDate,SiteName=@SiteName,
            Shift=@Shift,Weather=@Weather,WorkPerformed=@Work,TomorrowPlan=@Tomorrow,IssuesDelays=@Issues,
            ReportDataJson=@ReportDataJson,Status=N'Draft',UpdatedAt=SYSUTCDATETIME() WHERE ReportId=@Id`);
        await new sql.Request(transaction).input("Id", sql.Int, reportId).query(`
          DELETE dbo.DailySiteReportTasks WHERE ReportId=@Id;
          DELETE dbo.DailySiteReportDetails WHERE ReportId=@Id;
        `);
      } else {
        const reportNumber = `DSR-${new Date(input.reportDate).getUTCFullYear()}-${Date.now().toString().slice(-8)}`;
        const result = await new sql.Request(transaction).input("Number", sql.NVarChar(40), reportNumber)
          .input("ProjectId", sql.Int, projectId).input("ReportDate", sql.Date, dateValue(input.reportDate))
          .input("SiteName", sql.NVarChar(255), textValue(input.siteName)).input("Shift", sql.NVarChar(50), textValue(input.shift))
          .input("Weather", sql.NVarChar(50), textValue(input.weather)).input("Work", sql.NVarChar(sql.MAX), work)
          .input("Tomorrow", sql.NVarChar(sql.MAX), textValue(input.tomorrowPlan))
          .input("Issues", sql.NVarChar(sql.MAX), textValue(input.delays ?? input.issuesDelays))
          .input("ReportDataJson", sql.NVarChar(sql.MAX), serialize(reportDataPayload(input))).input("UserId", sql.Int, req.user.id)
          .query(`INSERT dbo.DailySiteReports
            (ReportNumber,ProjectId,ReportDate,SiteName,Shift,Weather,WorkPerformed,TomorrowPlan,IssuesDelays,ReportDataJson,SubmittedBy)
            OUTPUT INSERTED.ReportId VALUES (@Number,@ProjectId,@ReportDate,@SiteName,@Shift,@Weather,@Work,@Tomorrow,@Issues,@ReportDataJson,@UserId)`);
        reportId = result.recordset[0].ReportId;
      }
      const detailGroups = [
        ["Labour", input.manpowerRows],["Material",input.materialRows],["Equipment",input.equipmentRows],
        ["Issue",input.issueRows],["Safety",input.safetyRows],["Quality",input.qualityRows],["Visitor",input.visitorRows],
      ];
      for (const [type, rows] of detailGroups) {
        await new sql.Request(transaction).input("Id", sql.Int, reportId).input("Type", sql.NVarChar(30), type)
          .input("Json", sql.NVarChar(sql.MAX), serialize(Array.isArray(rows) ? rows : []))
          .query(`INSERT dbo.DailySiteReportDetails (ReportId,DetailType,DataJson) VALUES (@Id,@Type,@Json)`);
      }
      for (const row of input.taskRows || []) {
        const status = normalizeReportTaskStatus(row.status) || (Number(row.reportedProgress) >= 100 ? "Completed" : Number(row.reportedProgress) > 0 ? "Partial" : "Pending");
        const taskInput = {
          status, completionPercentage: row.reportedProgress,
          remainingWorkRemarks: row.remainingWorkRemarks || row.blockers,
          progressRemarks: row.workCompleted, generalRemarks: `Updated from Daily Site Report ${reportId}`,
        };
        const normalized = normalizeTaskUpdate(taskInput);
        await new sql.Request(transaction).input("ReportId", sql.Int, reportId).input("TaskId", sql.Int, idValue(row.taskId))
          .input("Status", sql.NVarChar(20), normalized.status).input("Percentage", sql.Int, normalized.completionPercentage)
          .input("Work", sql.NVarChar(sql.MAX), textValue(row.workCompleted))
          .input("Remaining", sql.NVarChar(sql.MAX), normalized.remainingWorkRemarks)
          .input("Hours", sql.Decimal(8,2), Number(row.hours) || null)
          .query(`INSERT dbo.DailySiteReportTasks (ReportId,TaskId,Status,CompletionPercentage,WorkPerformed,RemainingWorkRemarks,Hours)
            VALUES (@ReportId,@TaskId,@Status,@Percentage,@Work,@Remaining,@Hours)`);
      }
      await replaceReportMilestones(transaction, reportId, projectId, input.milestoneIds || [], req.user.id);
      for (const photo of [...(input.photos || []), ...(input.attachments || [])]) {
        const file = dataUrlFile(photo); if (!file) continue;
        if (file.buffer.length > uploadLimit) {
          const error = new Error(`${file.name} exceeds the configured file-size limit`);
          error.statusCode = 400;
          throw error;
        }
        if (!allowedTypes.has(file.type)) {
          const error = new Error(`Unsupported file type: ${file.type}`);
          error.statusCode = 400;
          throw error;
        }
        await new sql.Request(transaction).input("ReportId", sql.Int, reportId).input("Name", sql.NVarChar(255), file.name)
          .input("Type", sql.NVarChar(150), file.type).input("Size", sql.Int, file.buffer.length)
          .input("Data", sql.VarBinary(sql.MAX), file.buffer).input("Category", sql.NVarChar(50), file.category)
          .input("Caption", sql.NVarChar(500), file.caption).input("UserId", sql.Int, req.user.id)
          .query(`INSERT dbo.DailySiteReportAttachments
            (ReportId,FileName,ContentType,FileSize,FileData,Category,Caption,UploadedBy)
            VALUES (@ReportId,@Name,@Type,@Size,@Data,@Category,@Caption,@UserId)`);
      }
      await transaction.commit();
      await writeAudit(req, { action: isUpdate ? "site-report.update" : "site-report.create", targetType: "daily-site-report", targetId: reportId, after: { projectId, milestoneIds: input.milestoneIds || [] } });
      const project = (await loadProjectGraphs(projectId))[0];
      return res.status(isUpdate ? 200 : 201).json({
        ok: true,
        report: (await loadReports(reportId))[0],
        project,
        summary: {
          projectProgress: project?.progress || 0,
          milestoneProgress: Object.fromEntries((project?.milestones || []).map((milestone) => [milestone.id, milestone.progress])),
        },
      });
    } catch (error) {
      if (transaction) try { await transaction.rollback(); } catch { /* noop */ }
      return next(error);
    }
  };
  router.post("/reports", requirePermission("reports.manage"), saveReport);
  router.put("/reports/:reportId", requirePermission("reports.manage"), saveReport);

  router.post("/reports/:reportId/submit", requirePermission("reports.manage"), async (req, res, next) => {
    try {
      const pool = await getPool();
      const result = await pool.request().input("Id", sql.Int, idValue(req.params.reportId)).input("UserId", sql.Int, req.user.id)
        .query(`UPDATE dbo.DailySiteReports SET Status=N'Submitted',SubmittedBy=@UserId,SubmittedAt=SYSUTCDATETIME(),
          RejectionReason=NULL,UpdatedAt=SYSUTCDATETIME() WHERE ReportId=@Id AND Status IN (N'Draft',N'Rejected')`);
      if (!result.rowsAffected[0]) return res.status(409).json({ ok: false, error: "Only draft or rejected reports can be submitted" });
      await writeAudit(req, { action: "site-report.submit", targetType: "daily-site-report", targetId: req.params.reportId });
      return res.json({ ok: true, report: (await loadReports(idValue(req.params.reportId)))[0] });
    } catch (error) { return next(error); }
  });

  router.post("/reports/:reportId/approve", requireManager, async (req, res, next) => {
    let transaction;
    try {
      const reportId = idValue(req.params.reportId);
      const pool = await getPool();
      transaction = pool.transaction();
      await transaction.begin();
      const existing = await new sql.Request(transaction)
        .input("Id", sql.Int, reportId)
        .query(`SELECT ProjectId FROM dbo.DailySiteReports WITH (UPDLOCK,ROWLOCK)
          WHERE ReportId=@Id AND Status=N'Submitted'`);
      const projectId = existing.recordset[0]?.ProjectId;
      if (!projectId) fail(409, "Only submitted reports can be approved");
      await new sql.Request(transaction)
        .input("Id", sql.Int, reportId)
        .input("UserId", sql.Int, req.user.id)
        .input("Remarks", sql.NVarChar(sql.MAX), textValue(req.body?.managerRemarks))
        .query(`UPDATE dbo.DailySiteReports SET Status=N'Approved',ManagerRemarks=@Remarks,ApprovedBy=@UserId,
          ApprovedAt=SYSUTCDATETIME(),UpdatedAt=SYSUTCDATETIME() WHERE ReportId=@Id`);
      const taskRows = await new sql.Request(transaction)
        .input("Id", sql.Int, reportId)
        .query(`SELECT TaskId,Status,CompletionPercentage,WorkPerformed,RemainingWorkRemarks
          FROM dbo.DailySiteReportTasks WHERE ReportId=@Id ORDER BY ReportTaskId`);
      for (const row of taskRows.recordset) {
        await writeTaskUpdate(
          transaction,
          row.TaskId,
          {
            status: row.Status,
            completionPercentage: row.CompletionPercentage,
            remainingWorkRemarks: row.RemainingWorkRemarks,
            progressRemarks: row.WorkPerformed,
            generalRemarks: `Approved from Daily Site Report ${reportId}`,
          },
          [],
          req.user
        );
      }
      await syncMilestoneCompletion(transaction, projectId);
      await transaction.commit();
      await writeAudit(req, { action: "site-report.approve", targetType: "daily-site-report", targetId: req.params.reportId, after: { managerRemarks: req.body?.managerRemarks } });
      return res.json({ ok: true, report: (await loadReports(reportId))[0] });
    } catch (error) {
      if (transaction) try { await transaction.rollback(); } catch { /* noop */ }
      return next(error);
    }
  });

  router.post("/reports/:reportId/reject", requireManager, async (req, res, next) => {
    try {
      const reason = textValue(req.body?.reason);
      if (!reason) return res.status(400).json({ ok: false, error: "A rejection reason is required" });
      const pool = await getPool();
      const result = await pool.request().input("Id", sql.Int, idValue(req.params.reportId)).input("UserId", sql.Int, req.user.id)
        .input("Reason", sql.NVarChar(sql.MAX), reason).input("Remarks", sql.NVarChar(sql.MAX), textValue(req.body?.managerRemarks))
        .query(`UPDATE dbo.DailySiteReports SET Status=N'Rejected',ManagerRemarks=@Remarks,RejectedBy=@UserId,
          RejectedAt=SYSUTCDATETIME(),RejectionReason=@Reason,UpdatedAt=SYSUTCDATETIME() WHERE ReportId=@Id AND Status=N'Submitted'`);
      if (!result.rowsAffected[0]) return res.status(409).json({ ok: false, error: "Only submitted reports can be rejected" });
      await writeAudit(req, { action: "site-report.reject", targetType: "daily-site-report", targetId: req.params.reportId, after: { reason } });
      return res.json({ ok: true, report: (await loadReports(idValue(req.params.reportId)))[0] });
    } catch (error) { return next(error); }
  });

  router.delete("/reports/:reportId", requirePermission("reports.manage"), async (req, res, next) => {
    let transaction;
    try {
      const pool = await getPool(); transaction = pool.transaction(); await transaction.begin();
      const id = idValue(req.params.reportId);
      const existing = await new sql.Request(transaction).input("Id", sql.Int, id)
        .query(`SELECT Status FROM dbo.DailySiteReports WHERE ReportId=@Id`);
      if (!existing.recordset[0]) fail(404, "Report not found");
      if (!["Draft", "Rejected"].includes(existing.recordset[0].Status)) {
        fail(409, "Only draft or rejected reports can be deleted");
      }
      await new sql.Request(transaction).input("Id", sql.Int, id).query(`
        DELETE dbo.MilestoneReportLinks WHERE ReportId=@Id;
        DELETE dbo.DailySiteReportAttachments WHERE ReportId=@Id;
        DELETE dbo.DailySiteReportTasks WHERE ReportId=@Id;
        DELETE dbo.DailySiteReportDetails WHERE ReportId=@Id;
        DELETE dbo.DailySiteReports WHERE ReportId=@Id;
      `);
      await transaction.commit();
      await writeAudit(req, { action: "site-report.delete", targetType: "daily-site-report", targetId: id });
      return res.json({ ok: true });
    } catch (error) {
      if (transaction) try { await transaction.rollback(); } catch { /* noop */ }
      return next(error);
    }
  });

  router.get("/reports/attachments/:attachmentId", async (req, res, next) => {
    try {
      const pool = await getPool();
      const result = await pool.request().input("Id", sql.Int, idValue(req.params.attachmentId))
        .query(`SELECT FileName,ContentType,FileData FROM dbo.DailySiteReportAttachments WHERE AttachmentId=@Id`);
      const file = result.recordset[0];
      if (!file) return res.status(404).json({ ok: false, error: "Attachment not found" });
      return res.type(file.ContentType).attachment(file.FileName).send(file.FileData);
    } catch (error) { return next(error); }
  });

  router.use((error, _req, res, _next) => {
    void _next;
    const status = error?.statusCode || (error instanceof multer.MulterError ? 400 : 500);
    res.status(status).json({ ok: false, error: error?.message || "Project-management request failed" });
  });
  return router;
};
