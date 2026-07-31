-- Additive milestone control-center schema.

IF COL_LENGTH('dbo.ProjectMilestones','MilestoneNumber') IS NULL ALTER TABLE dbo.ProjectMilestones ADD MilestoneNumber NVARCHAR(120) NULL;
IF COL_LENGTH('dbo.ProjectMilestones','Priority') IS NULL ALTER TABLE dbo.ProjectMilestones ADD Priority NVARCHAR(20) NULL;
IF COL_LENGTH('dbo.ProjectMilestones','Deliverable') IS NULL ALTER TABLE dbo.ProjectMilestones ADD Deliverable NVARCHAR(MAX) NULL;
IF COL_LENGTH('dbo.ProjectMilestones','AcceptanceCriteria') IS NULL ALTER TABLE dbo.ProjectMilestones ADD AcceptanceCriteria NVARCHAR(MAX) NULL;
IF COL_LENGTH('dbo.ProjectMilestones','BaselineStartDate') IS NULL ALTER TABLE dbo.ProjectMilestones ADD BaselineStartDate DATE NULL;
IF COL_LENGTH('dbo.ProjectMilestones','BaselineTargetDate') IS NULL ALTER TABLE dbo.ProjectMilestones ADD BaselineTargetDate DATE NULL;
IF COL_LENGTH('dbo.ProjectMilestones','ActualStartDate') IS NULL ALTER TABLE dbo.ProjectMilestones ADD ActualStartDate DATE NULL;
IF COL_LENGTH('dbo.ProjectMilestones','ActualCompletionDate') IS NULL ALTER TABLE dbo.ProjectMilestones ADD ActualCompletionDate DATE NULL;
IF COL_LENGTH('dbo.ProjectMilestones','Notes') IS NULL ALTER TABLE dbo.ProjectMilestones ADD Notes NVARCHAR(MAX) NULL;
IF COL_LENGTH('dbo.ProjectMilestones','HealthOverride') IS NULL ALTER TABLE dbo.ProjectMilestones ADD HealthOverride NVARCHAR(20) NULL;
IF COL_LENGTH('dbo.ProjectMilestones','HealthOverrideReason') IS NULL ALTER TABLE dbo.ProjectMilestones ADD HealthOverrideReason NVARCHAR(MAX) NULL;
IF COL_LENGTH('dbo.ProjectMilestones','HealthOverriddenBy') IS NULL ALTER TABLE dbo.ProjectMilestones ADD HealthOverriddenBy INT NULL;
IF COL_LENGTH('dbo.ProjectMilestones','HealthOverriddenAt') IS NULL ALTER TABLE dbo.ProjectMilestones ADD HealthOverriddenAt DATETIME2 NULL;
IF COL_LENGTH('dbo.ProjectMilestones','CancelledBy') IS NULL ALTER TABLE dbo.ProjectMilestones ADD CancelledBy INT NULL;
IF COL_LENGTH('dbo.ProjectMilestones','CancelledAt') IS NULL ALTER TABLE dbo.ProjectMilestones ADD CancelledAt DATETIME2 NULL;
IF COL_LENGTH('dbo.ProjectMilestones','CancellationReason') IS NULL ALTER TABLE dbo.ProjectMilestones ADD CancellationReason NVARCHAR(MAX) NULL;
IF COL_LENGTH('dbo.ProjectMilestones','IsDeleted') IS NULL ALTER TABLE dbo.ProjectMilestones ADD IsDeleted BIT NOT NULL CONSTRAINT DF_ProjectMilestones_IsDeleted DEFAULT 0;
IF COL_LENGTH('dbo.ProjectMilestones','DeletedBy') IS NULL ALTER TABLE dbo.ProjectMilestones ADD DeletedBy INT NULL;
IF COL_LENGTH('dbo.ProjectMilestones','DeletedAt') IS NULL ALTER TABLE dbo.ProjectMilestones ADD DeletedAt DATETIME2 NULL;

EXEC(N'
UPDATE dbo.ProjectMilestones SET Priority=N''Medium'' WHERE Priority IS NULL;
UPDATE dbo.ProjectMilestones SET BaselineStartDate=StartDate WHERE BaselineStartDate IS NULL;
UPDATE dbo.ProjectMilestones SET BaselineTargetDate=TargetDate WHERE BaselineTargetDate IS NULL;

;WITH Numbered AS (
  SELECT m.MilestoneId,p.ProjectCode,
    ROW_NUMBER() OVER(PARTITION BY m.ProjectId ORDER BY m.MilestoneId) AS SequenceNumber
  FROM dbo.ProjectMilestones m
  JOIN dbo.Projects p ON p.ProjectId=m.ProjectId
  WHERE m.MilestoneNumber IS NULL
)
UPDATE m SET MilestoneNumber=CONCAT(
  N''MS-'',
  CASE WHEN NULLIF(REPLACE(REPLACE(REPLACE(n.ProjectCode,N''/'',N''''),N''-'',N''''),N'' '',N''''),N'''') IS NULL
    THEN CONVERT(NVARCHAR(20),m.ProjectId)
    ELSE REPLACE(REPLACE(REPLACE(n.ProjectCode,N''/'',N''''),N''-'',N''''),N'' '',N'''') END,
  N''-'',RIGHT(CONCAT(N''0000'',CONVERT(NVARCHAR(20),n.SequenceNumber)),4))
FROM dbo.ProjectMilestones m JOIN Numbered n ON n.MilestoneId=m.MilestoneId;
');

IF NOT EXISTS(SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID('dbo.ProjectMilestones') AND name='UX_ProjectMilestones_Number')
  EXEC(N'CREATE UNIQUE INDEX UX_ProjectMilestones_Number ON dbo.ProjectMilestones(MilestoneNumber) WHERE MilestoneNumber IS NOT NULL');

IF OBJECT_ID('dbo.MilestoneReportLinks','U') IS NULL
BEGIN
  CREATE TABLE dbo.MilestoneReportLinks(
    MilestoneReportLinkId BIGINT IDENTITY(1,1) PRIMARY KEY,
    MilestoneId INT NOT NULL,
    ReportId INT NOT NULL,
    CreatedBy INT NOT NULL,
    CreatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT FK_MilestoneReportLinks_Milestone FOREIGN KEY(MilestoneId) REFERENCES dbo.ProjectMilestones(MilestoneId),
    CONSTRAINT FK_MilestoneReportLinks_Report FOREIGN KEY(ReportId) REFERENCES dbo.DailySiteReports(ReportId),
    CONSTRAINT FK_MilestoneReportLinks_User FOREIGN KEY(CreatedBy) REFERENCES dbo.AppUsers(UserId),
    CONSTRAINT UQ_MilestoneReportLinks UNIQUE(MilestoneId,ReportId)
  );
  CREATE INDEX IX_MilestoneReportLinks_Report ON dbo.MilestoneReportLinks(ReportId,MilestoneId);
END;

IF OBJECT_ID('dbo.MilestoneDependencies','U') IS NULL
BEGIN
  CREATE TABLE dbo.MilestoneDependencies(
    MilestoneId INT NOT NULL,
    DependsOnMilestoneId INT NOT NULL,
    CreatedBy INT NOT NULL,
    CreatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT PK_MilestoneDependencies PRIMARY KEY(MilestoneId,DependsOnMilestoneId),
    CONSTRAINT CK_MilestoneDependencies_NoSelf CHECK(MilestoneId<>DependsOnMilestoneId),
    CONSTRAINT FK_MilestoneDependencies_Milestone FOREIGN KEY(MilestoneId) REFERENCES dbo.ProjectMilestones(MilestoneId),
    CONSTRAINT FK_MilestoneDependencies_DependsOn FOREIGN KEY(DependsOnMilestoneId) REFERENCES dbo.ProjectMilestones(MilestoneId),
    CONSTRAINT FK_MilestoneDependencies_User FOREIGN KEY(CreatedBy) REFERENCES dbo.AppUsers(UserId)
  );
END;

IF OBJECT_ID('dbo.MilestoneRisksIssues','U') IS NULL
BEGIN
  CREATE TABLE dbo.MilestoneRisksIssues(
    RiskIssueId BIGINT IDENTITY(1,1) PRIMARY KEY,
    MilestoneId INT NOT NULL,
    ItemType NVARCHAR(20) NOT NULL,
    Severity NVARCHAR(20) NOT NULL,
    Title NVARCHAR(255) NOT NULL,
    Description NVARCHAR(MAX) NULL,
    OwnerId INT NULL,
    OwnerName NVARCHAR(200) NULL,
    DueDate DATE NULL,
    Status NVARCHAR(20) NOT NULL DEFAULT N'Open',
    MitigationResolution NVARCHAR(MAX) NULL,
    CreatedBy INT NOT NULL,
    UpdatedBy INT NOT NULL,
    CreatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    UpdatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    IsDeleted BIT NOT NULL DEFAULT 0,
    CONSTRAINT FK_MilestoneRisksIssues_Milestone FOREIGN KEY(MilestoneId) REFERENCES dbo.ProjectMilestones(MilestoneId),
    CONSTRAINT FK_MilestoneRisksIssues_Creator FOREIGN KEY(CreatedBy) REFERENCES dbo.AppUsers(UserId)
  );
  CREATE INDEX IX_MilestoneRisksIssues_Milestone ON dbo.MilestoneRisksIssues(MilestoneId,IsDeleted,Status);
END;
