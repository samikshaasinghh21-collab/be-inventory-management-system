-- SQL persistence for the Project Management modules that were previously
-- embedded in browser localStorage. DataJson preserves the existing UI record
-- shapes while the relational columns provide ownership, filtering and audit.

IF OBJECT_ID('dbo.ProjectModuleRecords', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.ProjectModuleRecords (
    RecordId BIGINT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    ModuleType NVARCHAR(50) NOT NULL,
    ProjectId INT NULL,
    ExternalKey NVARCHAR(200) NULL,
    DataJson NVARCHAR(MAX) NOT NULL CONSTRAINT DF_ProjectModuleRecords_DataJson DEFAULT N'{}',
    CreatedBy INT NOT NULL,
    UpdatedBy INT NOT NULL,
    CreatedAt DATETIME2 NOT NULL CONSTRAINT DF_ProjectModuleRecords_CreatedAt DEFAULT SYSUTCDATETIME(),
    UpdatedAt DATETIME2 NOT NULL CONSTRAINT DF_ProjectModuleRecords_UpdatedAt DEFAULT SYSUTCDATETIME(),
    IsDeleted BIT NOT NULL CONSTRAINT DF_ProjectModuleRecords_IsDeleted DEFAULT 0,
    CONSTRAINT FK_ProjectModuleRecords_Project
      FOREIGN KEY(ProjectId) REFERENCES dbo.Projects(ProjectId),
    CONSTRAINT FK_ProjectModuleRecords_CreatedBy
      FOREIGN KEY(CreatedBy) REFERENCES dbo.AppUsers(UserId),
    CONSTRAINT FK_ProjectModuleRecords_UpdatedBy
      FOREIGN KEY(UpdatedBy) REFERENCES dbo.AppUsers(UserId),
    CONSTRAINT CK_ProjectModuleRecords_ModuleType CHECK (
      ModuleType IN (
        N'TeamAllocation',
        N'FinancialEntry',
        N'InventoryAllocation',
        N'ProjectPurchase',
        N'PurchaseFollowUp'
      )
    )
  );

  CREATE INDEX IX_ProjectModuleRecords_ProjectModule
    ON dbo.ProjectModuleRecords(ProjectId, ModuleType, IsDeleted, UpdatedAt DESC);

  CREATE UNIQUE INDEX UX_ProjectModuleRecords_ExternalKey
    ON dbo.ProjectModuleRecords(ModuleType, ExternalKey)
    WHERE ExternalKey IS NOT NULL AND IsDeleted = 0;
END;

IF OBJECT_ID('dbo.ProjectModuleAttachments', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.ProjectModuleAttachments (
    AttachmentId BIGINT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    RecordId BIGINT NOT NULL,
    FileName NVARCHAR(255) NOT NULL,
    ContentType NVARCHAR(150) NOT NULL,
    FileSize BIGINT NOT NULL,
    FileData VARBINARY(MAX) NOT NULL,
    Caption NVARCHAR(500) NULL,
    UploadedBy INT NOT NULL,
    UploadedAt DATETIME2 NOT NULL
      CONSTRAINT DF_ProjectModuleAttachments_UploadedAt DEFAULT SYSUTCDATETIME(),
    IsDeleted BIT NOT NULL
      CONSTRAINT DF_ProjectModuleAttachments_IsDeleted DEFAULT 0,
    CONSTRAINT FK_ProjectModuleAttachments_Record
      FOREIGN KEY(RecordId) REFERENCES dbo.ProjectModuleRecords(RecordId),
    CONSTRAINT FK_ProjectModuleAttachments_User
      FOREIGN KEY(UploadedBy) REFERENCES dbo.AppUsers(UserId)
  );

  CREATE INDEX IX_ProjectModuleAttachments_Record
    ON dbo.ProjectModuleAttachments(RecordId, IsDeleted, AttachmentId);
END;
