-- Database-backed project-management, auditing, milestones, drawings and daily reports.
-- The runtime schema initializer in backend/src/projectManagement.js is idempotent
-- and mirrors this migration for installations that use automatic schema warmup.

IF COL_LENGTH('dbo.Projects', 'ManagementDataJson') IS NULL
  ALTER TABLE dbo.Projects ADD ManagementDataJson NVARCHAR(MAX) NULL;

IF OBJECT_ID('dbo.ProjectTasks', 'U') IS NULL
CREATE TABLE dbo.ProjectTasks (
  TaskId INT IDENTITY(1,1) PRIMARY KEY, ProjectId INT NOT NULL,
  TaskName NVARCHAR(255) NOT NULL, Description NVARCHAR(MAX) NULL,
  Status NVARCHAR(20) NOT NULL DEFAULT N'Pending', CompletionPercentage INT NOT NULL DEFAULT 0,
  RemainingWorkRemarks NVARCHAR(MAX) NULL, Remarks NVARCHAR(MAX) NULL,
  AssignedEmployeeId INT NULL, AssignedEmployeeName NVARCHAR(200) NULL,
  StartDate DATE NULL, DueDate DATE NULL, Priority NVARCHAR(20) NULL,
  CreatedBy INT NOT NULL, UpdatedBy INT NOT NULL,
  CreatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
  UpdatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
  CONSTRAINT FK_ProjectTasks_Project FOREIGN KEY(ProjectId) REFERENCES dbo.Projects(ProjectId),
  CONSTRAINT FK_ProjectTasks_CreatedBy FOREIGN KEY(CreatedBy) REFERENCES dbo.AppUsers(UserId),
  CONSTRAINT FK_ProjectTasks_UpdatedBy FOREIGN KEY(UpdatedBy) REFERENCES dbo.AppUsers(UserId),
  CONSTRAINT CK_ProjectTasks_Status CHECK(Status IN (N'Pending',N'Partial',N'Completed',N'Cancelled')),
  CONSTRAINT CK_ProjectTasks_Percentage CHECK(CompletionPercentage BETWEEN 0 AND 100)
);

IF COL_LENGTH('dbo.ProjectTasks', 'TaskDataJson') IS NULL
  ALTER TABLE dbo.ProjectTasks ADD TaskDataJson NVARCHAR(MAX) NULL;

IF OBJECT_ID('dbo.TaskUpdates', 'U') IS NULL
CREATE TABLE dbo.TaskUpdates (
  TaskUpdateId INT IDENTITY(1,1) PRIMARY KEY, TaskId INT NOT NULL,
  ChangedFieldsJson NVARCHAR(MAX) NOT NULL, BeforeJson NVARCHAR(MAX) NOT NULL,
  AfterJson NVARCHAR(MAX) NOT NULL, ProgressRemarks NVARCHAR(MAX) NULL,
  GeneralRemarks NVARCHAR(MAX) NULL, UpdatedBy INT NOT NULL,
  UpdatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
  CONSTRAINT FK_TaskUpdates_Task FOREIGN KEY(TaskId) REFERENCES dbo.ProjectTasks(TaskId),
  CONSTRAINT FK_TaskUpdates_User FOREIGN KEY(UpdatedBy) REFERENCES dbo.AppUsers(UserId)
);

IF OBJECT_ID('dbo.TaskUpdateAttachments', 'U') IS NULL
CREATE TABLE dbo.TaskUpdateAttachments (
  AttachmentId INT IDENTITY(1,1) PRIMARY KEY, TaskUpdateId INT NOT NULL,
  FileName NVARCHAR(255) NOT NULL, ContentType NVARCHAR(150) NOT NULL,
  FileSize INT NOT NULL, FileData VARBINARY(MAX) NOT NULL,
  UploadedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
  CONSTRAINT FK_TaskUpdateAttachments_Update FOREIGN KEY(TaskUpdateId) REFERENCES dbo.TaskUpdates(TaskUpdateId)
);

IF OBJECT_ID('dbo.ProjectMilestones', 'U') IS NULL
CREATE TABLE dbo.ProjectMilestones (
  MilestoneId INT IDENTITY(1,1) PRIMARY KEY, ProjectId INT NOT NULL,
  MilestoneName NVARCHAR(255) NOT NULL, Description NVARCHAR(MAX) NULL,
  StartDate DATE NULL, TargetDate DATE NULL, ResponsiblePersonId INT NULL,
  ResponsiblePersonName NVARCHAR(200) NULL, IsCancelled BIT NOT NULL DEFAULT 0,
  CreatedBy INT NOT NULL, UpdatedBy INT NOT NULL,
  CreatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
  UpdatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
  CONSTRAINT FK_ProjectMilestones_Project FOREIGN KEY(ProjectId) REFERENCES dbo.Projects(ProjectId)
);

IF OBJECT_ID('dbo.MilestoneTasks', 'U') IS NULL
CREATE TABLE dbo.MilestoneTasks (
  MilestoneId INT NOT NULL, TaskId INT NOT NULL,
  CONSTRAINT PK_MilestoneTasks PRIMARY KEY(MilestoneId,TaskId),
  CONSTRAINT FK_MilestoneTasks_Milestone FOREIGN KEY(MilestoneId) REFERENCES dbo.ProjectMilestones(MilestoneId),
  CONSTRAINT FK_MilestoneTasks_Task FOREIGN KEY(TaskId) REFERENCES dbo.ProjectTasks(TaskId)
);

IF OBJECT_ID('dbo.ProjectDocuments', 'U') IS NULL
CREATE TABLE dbo.ProjectDocuments (
  DocumentId INT IDENTITY(1,1) PRIMARY KEY, ProjectId INT NOT NULL,
  DocumentName NVARCHAR(255) NOT NULL, Category NVARCHAR(100) NOT NULL DEFAULT N'Drawing',
  Status NVARCHAR(20) NOT NULL DEFAULT N'Pending', CurrentRevision INT NOT NULL DEFAULT 1,
  UploadedBy INT NOT NULL, UploadedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
  UpdatedBy INT NOT NULL, UpdatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
  ApprovedBy INT NULL, ApprovedAt DATETIME2 NULL, IsDeleted BIT NOT NULL DEFAULT 0,
  CONSTRAINT FK_ProjectDocuments_Project FOREIGN KEY(ProjectId) REFERENCES dbo.Projects(ProjectId)
);

IF OBJECT_ID('dbo.DocumentRevisions', 'U') IS NULL
CREATE TABLE dbo.DocumentRevisions (
  DocumentRevisionId INT IDENTITY(1,1) PRIMARY KEY, DocumentId INT NOT NULL,
  RevisionNumber INT NOT NULL, FileName NVARCHAR(255) NOT NULL,
  ContentType NVARCHAR(150) NOT NULL, FileSize INT NOT NULL, FileData VARBINARY(MAX) NOT NULL,
  Remarks NVARCHAR(MAX) NULL, UploadedBy INT NOT NULL,
  UploadedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
  CONSTRAINT UQ_DocumentRevisions UNIQUE(DocumentId,RevisionNumber),
  CONSTRAINT FK_DocumentRevisions_Document FOREIGN KEY(DocumentId) REFERENCES dbo.ProjectDocuments(DocumentId)
);

IF OBJECT_ID('dbo.DailySiteReports', 'U') IS NULL
CREATE TABLE dbo.DailySiteReports (
  ReportId INT IDENTITY(1,1) PRIMARY KEY, ReportNumber NVARCHAR(40) NOT NULL UNIQUE,
  ProjectId INT NOT NULL, ReportDate DATE NOT NULL, SiteName NVARCHAR(255) NULL,
  Shift NVARCHAR(50) NULL, Weather NVARCHAR(50) NULL, WorkPerformed NVARCHAR(MAX) NOT NULL,
  TomorrowPlan NVARCHAR(MAX) NULL, IssuesDelays NVARCHAR(MAX) NULL,
  Status NVARCHAR(20) NOT NULL DEFAULT N'Draft', ManagerRemarks NVARCHAR(MAX) NULL,
  SubmittedBy INT NOT NULL, SubmittedAt DATETIME2 NULL, ApprovedBy INT NULL,
  ApprovedAt DATETIME2 NULL, RejectedBy INT NULL, RejectedAt DATETIME2 NULL,
  RejectionReason NVARCHAR(MAX) NULL, CreatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
  UpdatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
  CONSTRAINT FK_DailySiteReports_Project FOREIGN KEY(ProjectId) REFERENCES dbo.Projects(ProjectId)
);

IF COL_LENGTH('dbo.DailySiteReports', 'ReportDataJson') IS NULL
  ALTER TABLE dbo.DailySiteReports ADD ReportDataJson NVARCHAR(MAX) NULL;

IF OBJECT_ID('dbo.DailySiteReportDetails', 'U') IS NULL
CREATE TABLE dbo.DailySiteReportDetails (
  DetailId INT IDENTITY(1,1) PRIMARY KEY, ReportId INT NOT NULL,
  DetailType NVARCHAR(30) NOT NULL, DataJson NVARCHAR(MAX) NOT NULL,
  CONSTRAINT FK_DailySiteReportDetails_Report FOREIGN KEY(ReportId) REFERENCES dbo.DailySiteReports(ReportId)
);

IF OBJECT_ID('dbo.DailySiteReportTasks', 'U') IS NULL
CREATE TABLE dbo.DailySiteReportTasks (
  ReportTaskId INT IDENTITY(1,1) PRIMARY KEY, ReportId INT NOT NULL, TaskId INT NOT NULL,
  Status NVARCHAR(20) NOT NULL, CompletionPercentage INT NOT NULL,
  WorkPerformed NVARCHAR(MAX) NULL, RemainingWorkRemarks NVARCHAR(MAX) NULL, Hours DECIMAL(8,2) NULL,
  CONSTRAINT FK_DailySiteReportTasks_Report FOREIGN KEY(ReportId) REFERENCES dbo.DailySiteReports(ReportId),
  CONSTRAINT FK_DailySiteReportTasks_Task FOREIGN KEY(TaskId) REFERENCES dbo.ProjectTasks(TaskId)
);

IF OBJECT_ID('dbo.DailySiteReportAttachments', 'U') IS NULL
CREATE TABLE dbo.DailySiteReportAttachments (
  AttachmentId INT IDENTITY(1,1) PRIMARY KEY, ReportId INT NOT NULL,
  FileName NVARCHAR(255) NOT NULL, ContentType NVARCHAR(150) NOT NULL,
  FileSize INT NOT NULL, FileData VARBINARY(MAX) NOT NULL, Category NVARCHAR(50) NULL,
  Caption NVARCHAR(500) NULL, UploadedBy INT NOT NULL,
  UploadedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
  CONSTRAINT FK_DailySiteReportAttachments_Report FOREIGN KEY(ReportId) REFERENCES dbo.DailySiteReports(ReportId)
);
