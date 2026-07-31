SET XACT_ABORT ON;
BEGIN TRANSACTION;

IF COL_LENGTH('dbo.AppSessions', 'SessionTokenHash') IS NULL
  ALTER TABLE dbo.AppSessions ADD SessionTokenHash CHAR(64) NULL;
IF COL_LENGTH('dbo.AppSessions', 'AbsoluteExpiresAt') IS NULL
  ALTER TABLE dbo.AppSessions ADD AbsoluteExpiresAt DATETIME2 NULL;
IF COL_LENGTH('dbo.AppSessions', 'IdleExpiresAt') IS NULL
  ALTER TABLE dbo.AppSessions ADD IdleExpiresAt DATETIME2 NULL;
IF COL_LENGTH('dbo.AppSessions', 'AssuranceLevel') IS NULL
  ALTER TABLE dbo.AppSessions ADD AssuranceLevel NVARCHAR(30) NOT NULL
    CONSTRAINT DF_AppSessions_AssuranceLevel DEFAULT N'mfa';
IF COL_LENGTH('dbo.AppSessions', 'AuthenticationMethod') IS NULL
  ALTER TABLE dbo.AppSessions ADD AuthenticationMethod NVARCHAR(30) NULL;
IF COL_LENGTH('dbo.AppSessions', 'StepUpScopesJson') IS NULL
  ALTER TABLE dbo.AppSessions ADD StepUpScopesJson NVARCHAR(MAX) NOT NULL
    CONSTRAINT DF_AppSessions_StepUpScopesJson DEFAULT N'{}';
IF COL_LENGTH('dbo.AppSessions', 'DeviceId') IS NULL
  ALTER TABLE dbo.AppSessions ADD DeviceId NVARCHAR(100) NULL;
IF COL_LENGTH('dbo.AppSessions', 'EnrollmentOnly') IS NULL
  ALTER TABLE dbo.AppSessions ADD EnrollmentOnly BIT NOT NULL
    CONSTRAINT DF_AppSessions_EnrollmentOnly DEFAULT 0;

EXEC(N'
  UPDATE dbo.AppSessions
  SET AbsoluteExpiresAt = COALESCE(AbsoluteExpiresAt, ExpiresAt),
      IdleExpiresAt = COALESCE(IdleExpiresAt, DATEADD(MINUTE, 30, LastSeenAt))
  WHERE AbsoluteExpiresAt IS NULL OR IdleExpiresAt IS NULL;
');

IF EXISTS (
  SELECT 1 FROM sys.columns
  WHERE object_id = OBJECT_ID('dbo.AppSessions')
    AND name = 'RefreshTokenHash' AND is_nullable = 0
)
  ALTER TABLE dbo.AppSessions ALTER COLUMN RefreshTokenHash CHAR(64) NULL;

IF NOT EXISTS (
  SELECT 1 FROM sys.indexes
  WHERE object_id = OBJECT_ID('dbo.AppSessions')
    AND name = 'UX_AppSessions_SessionTokenHash'
)
  CREATE UNIQUE INDEX UX_AppSessions_SessionTokenHash
    ON dbo.AppSessions(SessionTokenHash)
    WHERE SessionTokenHash IS NOT NULL;

IF OBJECT_ID('dbo.WebAuthnCredentials', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.WebAuthnCredentials (
    CredentialId NVARCHAR(1024) NOT NULL PRIMARY KEY,
    UserId INT NOT NULL REFERENCES dbo.AppUsers(UserId),
    PublicKey VARBINARY(MAX) NOT NULL,
    Counter BIGINT NOT NULL DEFAULT 0,
    TransportsJson NVARCHAR(MAX) NOT NULL DEFAULT N'[]',
    DeviceName NVARCHAR(150) NOT NULL,
    DeviceType NVARCHAR(40) NULL,
    BackedUp BIT NOT NULL DEFAULT 0,
    CreatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    LastUsedAt DATETIME2 NULL
  );
  CREATE INDEX IX_WebAuthnCredentials_UserId
    ON dbo.WebAuthnCredentials(UserId);
END;

IF OBJECT_ID('dbo.AuthChallenges', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.AuthChallenges (
    ChallengeId UNIQUEIDENTIFIER NOT NULL PRIMARY KEY,
    UserId INT NULL REFERENCES dbo.AppUsers(UserId),
    SessionId UNIQUEIDENTIFIER NULL REFERENCES dbo.AppSessions(SessionId),
    Operation NVARCHAR(50) NOT NULL,
    ChallengeValue NVARCHAR(1024) NOT NULL,
    ScopeName NVARCHAR(150) NULL,
    PayloadJson NVARCHAR(MAX) NOT NULL DEFAULT N'{}',
    ExpectedOrigin NVARCHAR(500) NOT NULL,
    RpId NVARCHAR(255) NOT NULL,
    ExpiresAt DATETIME2 NOT NULL,
    UsedAt DATETIME2 NULL,
    CreatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
  );
  CREATE INDEX IX_AuthChallenges_Expiry
    ON dbo.AuthChallenges(ExpiresAt, UsedAt);
END;

IF COL_LENGTH('dbo.LoginHistory', 'AuthenticationMethod') IS NULL
  ALTER TABLE dbo.LoginHistory ADD AuthenticationMethod NVARCHAR(30) NULL;
IF COL_LENGTH('dbo.LoginHistory', 'AssuranceLevel') IS NULL
  ALTER TABLE dbo.LoginHistory ADD AssuranceLevel NVARCHAR(30) NULL;
IF COL_LENGTH('dbo.LoginHistory', 'DeviceId') IS NULL
  ALTER TABLE dbo.LoginHistory ADD DeviceId NVARCHAR(100) NULL;
IF COL_LENGTH('dbo.LoginHistory', 'RiskReason') IS NULL
  ALTER TABLE dbo.LoginHistory ADD RiskReason NVARCHAR(300) NULL;

IF COL_LENGTH('dbo.AuditEvents', 'AuthenticationMethod') IS NULL
  ALTER TABLE dbo.AuditEvents ADD AuthenticationMethod NVARCHAR(30) NULL;
IF COL_LENGTH('dbo.AuditEvents', 'AssuranceLevel') IS NULL
  ALTER TABLE dbo.AuditEvents ADD AssuranceLevel NVARCHAR(30) NULL;

COMMIT TRANSACTION;
