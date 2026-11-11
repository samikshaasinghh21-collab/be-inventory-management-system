IF OBJECT_ID('dbo.BankGuarantees','U') IS NULL
BEGIN
  CREATE TABLE dbo.BankGuarantees (
    Id INT IDENTITY PRIMARY KEY,
    ProjectId INT NOT NULL REFERENCES dbo.Projects(ProjectId),
    BankKey NVARCHAR(200) NOT NULL,
    GuaranteeKey NVARCHAR(120) NOT NULL,
    DataJson NVARCHAR(MAX) NOT NULL CHECK (ISJSON(DataJson)=1),
    Revision INT NOT NULL DEFAULT 1,
    Closed BIT NOT NULL DEFAULT 0,
    CreatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    UpdatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT UQ_BankGuarantees_Number UNIQUE(BankKey,GuaranteeKey)
  );
  CREATE INDEX IX_BankGuarantees_Project ON dbo.BankGuarantees(ProjectId);
END;
IF OBJECT_ID('dbo.BankGuaranteeHistory','U') IS NULL
BEGIN
  CREATE TABLE dbo.BankGuaranteeHistory (
    Id INT IDENTITY PRIMARY KEY,
    GuaranteeId INT NOT NULL REFERENCES dbo.BankGuarantees(Id),
    Revision INT NOT NULL,
    Action NVARCHAR(20) NOT NULL,
    Reason NVARCHAR(2000) NOT NULL,
    DataJson NVARCHAR(MAX) NOT NULL CHECK (ISJSON(DataJson)=1),
    ActorId INT NOT NULL,
    CreatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT UQ_BankGuaranteeHistory_Revision UNIQUE(GuaranteeId,Revision)
  );
END;
IF OBJECT_ID('dbo.BankGuaranteeDocuments','U') IS NULL
BEGIN
  CREATE TABLE dbo.BankGuaranteeDocuments (
    Id INT IDENTITY PRIMARY KEY,
    GuaranteeId INT NOT NULL REFERENCES dbo.BankGuarantees(Id),
    Revision INT NOT NULL,
    Purpose NVARCHAR(20) NOT NULL,
    FileName NVARCHAR(255) NOT NULL,
    MimeType NVARCHAR(100) NOT NULL,
    Contents VARBINARY(MAX) NOT NULL,
    CreatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
  );
END;
