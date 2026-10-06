IF OBJECT_ID('dbo.WorkspaceData','U') IS NULL
BEGIN
  CREATE TABLE dbo.WorkspaceData (
    DataKey NVARCHAR(100) NOT NULL PRIMARY KEY,
    DataJson NVARCHAR(MAX) NOT NULL,
    UpdatedBy INT NULL,
    UpdatedAt DATETIME2 NOT NULL CONSTRAINT DF_WorkspaceData_UpdatedAt DEFAULT SYSUTCDATETIME(),
    CONSTRAINT FK_WorkspaceData_UpdatedBy FOREIGN KEY (UpdatedBy) REFERENCES dbo.AppUsers(UserId)
  );
END;

