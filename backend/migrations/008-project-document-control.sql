-- Additive controlled-document metadata, immutable revision workflow and links.

IF COL_LENGTH('dbo.ProjectDocuments','DocumentNumber') IS NULL ALTER TABLE dbo.ProjectDocuments ADD DocumentNumber NVARCHAR(120) NULL;
IF COL_LENGTH('dbo.ProjectDocuments','Description') IS NULL ALTER TABLE dbo.ProjectDocuments ADD Description NVARCHAR(MAX) NULL;
IF COL_LENGTH('dbo.ProjectDocuments','Discipline') IS NULL ALTER TABLE dbo.ProjectDocuments ADD Discipline NVARCHAR(100) NULL;
IF COL_LENGTH('dbo.ProjectDocuments','CustomCategory') IS NULL ALTER TABLE dbo.ProjectDocuments ADD CustomCategory NVARCHAR(100) NULL;
IF COL_LENGTH('dbo.ProjectDocuments','DocumentDate') IS NULL ALTER TABLE dbo.ProjectDocuments ADD DocumentDate DATE NULL;
IF COL_LENGTH('dbo.ProjectDocuments','ExternalReference') IS NULL ALTER TABLE dbo.ProjectDocuments ADD ExternalReference NVARCHAR(200) NULL;
IF COL_LENGTH('dbo.ProjectDocuments','IssuePurpose') IS NULL ALTER TABLE dbo.ProjectDocuments ADD IssuePurpose NVARCHAR(100) NULL;
IF COL_LENGTH('dbo.ProjectDocuments','ResponsiblePersonId') IS NULL ALTER TABLE dbo.ProjectDocuments ADD ResponsiblePersonId NVARCHAR(100) NULL;
IF COL_LENGTH('dbo.ProjectDocuments','ResponsiblePersonName') IS NULL ALTER TABLE dbo.ProjectDocuments ADD ResponsiblePersonName NVARCHAR(200) NULL;
IF COL_LENGTH('dbo.ProjectDocuments','Confidentiality') IS NULL ALTER TABLE dbo.ProjectDocuments ADD Confidentiality NVARCHAR(30) NULL;
IF COL_LENGTH('dbo.ProjectDocuments','TagsJson') IS NULL ALTER TABLE dbo.ProjectDocuments ADD TagsJson NVARCHAR(MAX) NULL;
IF COL_LENGTH('dbo.ProjectDocuments','SubmittedBy') IS NULL ALTER TABLE dbo.ProjectDocuments ADD SubmittedBy INT NULL;
IF COL_LENGTH('dbo.ProjectDocuments','SubmittedAt') IS NULL ALTER TABLE dbo.ProjectDocuments ADD SubmittedAt DATETIME2 NULL;
IF COL_LENGTH('dbo.ProjectDocuments','RejectedBy') IS NULL ALTER TABLE dbo.ProjectDocuments ADD RejectedBy INT NULL;
IF COL_LENGTH('dbo.ProjectDocuments','RejectedAt') IS NULL ALTER TABLE dbo.ProjectDocuments ADD RejectedAt DATETIME2 NULL;
IF COL_LENGTH('dbo.ProjectDocuments','RejectionReason') IS NULL ALTER TABLE dbo.ProjectDocuments ADD RejectionReason NVARCHAR(MAX) NULL;
IF COL_LENGTH('dbo.ProjectDocuments','SupersededBy') IS NULL ALTER TABLE dbo.ProjectDocuments ADD SupersededBy INT NULL;
IF COL_LENGTH('dbo.ProjectDocuments','SupersededAt') IS NULL ALTER TABLE dbo.ProjectDocuments ADD SupersededAt DATETIME2 NULL;
IF COL_LENGTH('dbo.ProjectDocuments','SupersededReason') IS NULL ALTER TABLE dbo.ProjectDocuments ADD SupersededReason NVARCHAR(MAX) NULL;
IF COL_LENGTH('dbo.ProjectDocuments','DeletedBy') IS NULL ALTER TABLE dbo.ProjectDocuments ADD DeletedBy INT NULL;
IF COL_LENGTH('dbo.ProjectDocuments','DeletedAt') IS NULL ALTER TABLE dbo.ProjectDocuments ADD DeletedAt DATETIME2 NULL;

EXEC(N'UPDATE dbo.ProjectDocuments
SET DocumentNumber = CONCAT(N''DOC-LEGACY-'',RIGHT(CONCAT(N''000000'',CONVERT(NVARCHAR(20),DocumentId)),6))
WHERE DocumentNumber IS NULL;
UPDATE dbo.ProjectDocuments SET Status=N''Draft'' WHERE Status=N''Pending'';
UPDATE dbo.ProjectDocuments SET Confidentiality=N''Internal'' WHERE Confidentiality IS NULL;
UPDATE dbo.ProjectDocuments SET TagsJson=N''[]'' WHERE TagsJson IS NULL;');

IF NOT EXISTS(SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID('dbo.ProjectDocuments') AND name='UX_ProjectDocuments_DocumentNumber')
  EXEC(N'CREATE UNIQUE INDEX UX_ProjectDocuments_DocumentNumber ON dbo.ProjectDocuments(DocumentNumber)');

IF COL_LENGTH('dbo.DocumentRevisions','RevisionLabel') IS NULL ALTER TABLE dbo.DocumentRevisions ADD RevisionLabel NVARCHAR(30) NULL;
IF COL_LENGTH('dbo.DocumentRevisions','ClientRevisionReference') IS NULL ALTER TABLE dbo.DocumentRevisions ADD ClientRevisionReference NVARCHAR(100) NULL;
IF COL_LENGTH('dbo.DocumentRevisions','ChangeSummary') IS NULL ALTER TABLE dbo.DocumentRevisions ADD ChangeSummary NVARCHAR(MAX) NULL;
IF COL_LENGTH('dbo.DocumentRevisions','Status') IS NULL ALTER TABLE dbo.DocumentRevisions ADD Status NVARCHAR(20) NULL;
IF COL_LENGTH('dbo.DocumentRevisions','ApprovedBy') IS NULL ALTER TABLE dbo.DocumentRevisions ADD ApprovedBy INT NULL;
IF COL_LENGTH('dbo.DocumentRevisions','ApprovedAt') IS NULL ALTER TABLE dbo.DocumentRevisions ADD ApprovedAt DATETIME2 NULL;
IF COL_LENGTH('dbo.DocumentRevisions','RejectedBy') IS NULL ALTER TABLE dbo.DocumentRevisions ADD RejectedBy INT NULL;
IF COL_LENGTH('dbo.DocumentRevisions','RejectedAt') IS NULL ALTER TABLE dbo.DocumentRevisions ADD RejectedAt DATETIME2 NULL;
IF COL_LENGTH('dbo.DocumentRevisions','RejectionReason') IS NULL ALTER TABLE dbo.DocumentRevisions ADD RejectionReason NVARCHAR(MAX) NULL;

EXEC(N'UPDATE r SET
  RevisionLabel=COALESCE(r.RevisionLabel,CONCAT(N''R'',r.RevisionNumber)),
  Status=COALESCE(r.Status,CASE
    WHEN r.RevisionNumber<d.CurrentRevision THEN N''Superseded''
    WHEN d.Status=N''Approved'' THEN N''Approved''
    ELSE N''Draft'' END)
FROM dbo.DocumentRevisions r JOIN dbo.ProjectDocuments d ON d.DocumentId=r.DocumentId;');

IF OBJECT_ID('dbo.DocumentLinks','U') IS NULL
BEGIN
  CREATE TABLE dbo.DocumentLinks(
    DocumentLinkId BIGINT IDENTITY(1,1) PRIMARY KEY,
    DocumentId INT NOT NULL,
    ProjectId INT NOT NULL,
    LinkType NVARCHAR(40) NOT NULL,
    LinkId NVARCHAR(100) NOT NULL,
    LinkLabel NVARCHAR(300) NOT NULL,
    CreatedBy INT NOT NULL,
    CreatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT FK_DocumentLinks_Document FOREIGN KEY(DocumentId) REFERENCES dbo.ProjectDocuments(DocumentId),
    CONSTRAINT FK_DocumentLinks_Project FOREIGN KEY(ProjectId) REFERENCES dbo.Projects(ProjectId),
    CONSTRAINT FK_DocumentLinks_User FOREIGN KEY(CreatedBy) REFERENCES dbo.AppUsers(UserId),
    CONSTRAINT UQ_DocumentLinks UNIQUE(DocumentId,LinkType,LinkId)
  );
  CREATE INDEX IX_DocumentLinks_Project ON dbo.DocumentLinks(ProjectId,LinkType,LinkId);
END;
