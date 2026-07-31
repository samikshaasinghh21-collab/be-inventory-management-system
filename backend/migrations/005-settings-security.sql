/* Settings, security administration, sessions, and audit persistence. */
IF COL_LENGTH('dbo.AppUsers', 'Department') IS NULL ALTER TABLE dbo.AppUsers ADD Department NVARCHAR(150) NULL;
IF COL_LENGTH('dbo.AppUsers', 'JobTitle') IS NULL ALTER TABLE dbo.AppUsers ADD JobTitle NVARCHAR(150) NULL;
IF COL_LENGTH('dbo.AppUsers', 'Phone') IS NULL ALTER TABLE dbo.AppUsers ADD Phone NVARCHAR(40) NULL;
IF COL_LENGTH('dbo.AppUsers', 'AvatarContentType') IS NULL ALTER TABLE dbo.AppUsers ADD AvatarContentType NVARCHAR(100) NULL;
IF COL_LENGTH('dbo.AppUsers', 'AvatarData') IS NULL ALTER TABLE dbo.AppUsers ADD AvatarData VARBINARY(MAX) NULL;
IF COL_LENGTH('dbo.AppUsers', 'AccountStatus') IS NULL ALTER TABLE dbo.AppUsers ADD AccountStatus NVARCHAR(30) NOT NULL CONSTRAINT DF_AppUsers_AccountStatus DEFAULT N'Active';
IF COL_LENGTH('dbo.AppUsers', 'LastLoginAt') IS NULL ALTER TABLE dbo.AppUsers ADD LastLoginAt DATETIME2 NULL;
IF COL_LENGTH('dbo.AppUsers', 'PasswordChangedAt') IS NULL ALTER TABLE dbo.AppUsers ADD PasswordChangedAt DATETIME2 NULL;
IF COL_LENGTH('dbo.AppUsers', 'PasswordExpiresAt') IS NULL ALTER TABLE dbo.AppUsers ADD PasswordExpiresAt DATETIME2 NULL;
IF COL_LENGTH('dbo.AppUsers', 'FailedLoginAttempts') IS NULL ALTER TABLE dbo.AppUsers ADD FailedLoginAttempts INT NOT NULL CONSTRAINT DF_AppUsers_FailedLoginAttempts DEFAULT 0;
IF COL_LENGTH('dbo.AppUsers', 'FirstFailedLoginAt') IS NULL ALTER TABLE dbo.AppUsers ADD FirstFailedLoginAt DATETIME2 NULL;
IF COL_LENGTH('dbo.AppUsers', 'LockedUntil') IS NULL ALTER TABLE dbo.AppUsers ADD LockedUntil DATETIME2 NULL;
IF COL_LENGTH('dbo.AppUsers', 'TotpSecretEncrypted') IS NULL ALTER TABLE dbo.AppUsers ADD TotpSecretEncrypted NVARCHAR(1000) NULL;
IF COL_LENGTH('dbo.AppUsers', 'TotpEnabled') IS NULL ALTER TABLE dbo.AppUsers ADD TotpEnabled BIT NOT NULL CONSTRAINT DF_AppUsers_TotpEnabled DEFAULT 0;

IF OBJECT_ID('dbo.UserPreferences', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.UserPreferences (
    UserId INT NOT NULL PRIMARY KEY REFERENCES dbo.AppUsers(UserId),
    NotificationsJson NVARCHAR(MAX) NOT NULL CONSTRAINT DF_UserPreferences_Notifications DEFAULT N'{}',
    AppearanceJson NVARCHAR(MAX) NOT NULL CONSTRAINT DF_UserPreferences_Appearance DEFAULT N'{}',
    UpdatedAt DATETIME2 NOT NULL CONSTRAINT DF_UserPreferences_UpdatedAt DEFAULT SYSUTCDATETIME()
  );
END;

IF OBJECT_ID('dbo.WorkspaceSettings', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.WorkspaceSettings (
    SettingKey NVARCHAR(80) NOT NULL PRIMARY KEY,
    SettingJson NVARCHAR(MAX) NOT NULL,
    UpdatedBy INT NULL REFERENCES dbo.AppUsers(UserId),
    UpdatedAt DATETIME2 NOT NULL CONSTRAINT DF_WorkspaceSettings_UpdatedAt DEFAULT SYSUTCDATETIME()
  );
END;

IF OBJECT_ID('dbo.AppSessions', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.AppSessions (
    SessionId UNIQUEIDENTIFIER NOT NULL PRIMARY KEY,
    UserId INT NOT NULL REFERENCES dbo.AppUsers(UserId),
    RefreshTokenHash CHAR(64) NOT NULL,
    CsrfTokenHash CHAR(64) NOT NULL,
    IpAddress NVARCHAR(100) NULL,
    UserAgent NVARCHAR(1000) NULL,
    CreatedAt DATETIME2 NOT NULL CONSTRAINT DF_AppSessions_CreatedAt DEFAULT SYSUTCDATETIME(),
    LastSeenAt DATETIME2 NOT NULL CONSTRAINT DF_AppSessions_LastSeenAt DEFAULT SYSUTCDATETIME(),
    ExpiresAt DATETIME2 NOT NULL,
    ReauthenticatedUntil DATETIME2 NULL,
    RevokedAt DATETIME2 NULL,
    RevokeReason NVARCHAR(200) NULL
  );
  CREATE INDEX IX_AppSessions_UserId ON dbo.AppSessions(UserId, RevokedAt, ExpiresAt);
END;

IF OBJECT_ID('dbo.AuthTokens', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.AuthTokens (
    AuthTokenId BIGINT IDENTITY(1,1) PRIMARY KEY,
    UserId INT NULL REFERENCES dbo.AppUsers(UserId),
    Email NVARCHAR(320) NOT NULL,
    TokenType NVARCHAR(30) NOT NULL,
    TokenHash CHAR(64) NOT NULL,
    ExpiresAt DATETIME2 NOT NULL,
    UsedAt DATETIME2 NULL,
    CreatedBy INT NULL REFERENCES dbo.AppUsers(UserId),
    CreatedAt DATETIME2 NOT NULL CONSTRAINT DF_AuthTokens_CreatedAt DEFAULT SYSUTCDATETIME()
  );
  CREATE UNIQUE INDEX UX_AuthTokens_Hash ON dbo.AuthTokens(TokenHash);
  CREATE INDEX IX_AuthTokens_EmailType ON dbo.AuthTokens(Email, TokenType, CreatedAt);
END;

IF OBJECT_ID('dbo.TotpRecoveryCodes', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.TotpRecoveryCodes (
    RecoveryCodeId BIGINT IDENTITY(1,1) PRIMARY KEY,
    UserId INT NOT NULL REFERENCES dbo.AppUsers(UserId),
    CodeHash CHAR(64) NOT NULL,
    UsedAt DATETIME2 NULL,
    CreatedAt DATETIME2 NOT NULL CONSTRAINT DF_TotpRecoveryCodes_CreatedAt DEFAULT SYSUTCDATETIME()
  );
  CREATE INDEX IX_TotpRecoveryCodes_UserId ON dbo.TotpRecoveryCodes(UserId, UsedAt);
END;

IF OBJECT_ID('dbo.LoginHistory', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.LoginHistory (
    LoginHistoryId BIGINT IDENTITY(1,1) PRIMARY KEY,
    UserId INT NULL REFERENCES dbo.AppUsers(UserId),
    Email NVARCHAR(320) NULL,
    IpAddress NVARCHAR(100) NULL,
    UserAgent NVARCHAR(1000) NULL,
    Result NVARCHAR(30) NOT NULL,
    Reason NVARCHAR(200) NULL,
    CreatedAt DATETIME2 NOT NULL CONSTRAINT DF_LoginHistory_CreatedAt DEFAULT SYSUTCDATETIME()
  );
  CREATE INDEX IX_LoginHistory_UserId ON dbo.LoginHistory(UserId, CreatedAt DESC);
END;

IF OBJECT_ID('dbo.AuditEvents', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.AuditEvents (
    AuditEventId BIGINT IDENTITY(1,1) PRIMARY KEY,
    ActorUserId INT NULL REFERENCES dbo.AppUsers(UserId),
    ActionName NVARCHAR(150) NOT NULL,
    TargetType NVARCHAR(100) NULL,
    TargetId NVARCHAR(100) NULL,
    BeforeJson NVARCHAR(MAX) NULL,
    AfterJson NVARCHAR(MAX) NULL,
    IpAddress NVARCHAR(100) NULL,
    UserAgent NVARCHAR(1000) NULL,
    Result NVARCHAR(30) NOT NULL,
    CreatedAt DATETIME2 NOT NULL CONSTRAINT DF_AuditEvents_CreatedAt DEFAULT SYSUTCDATETIME()
  );
  CREATE INDEX IX_AuditEvents_CreatedAt ON dbo.AuditEvents(CreatedAt DESC);
  CREATE INDEX IX_AuditEvents_Actor ON dbo.AuditEvents(ActorUserId, CreatedAt DESC);
END;

UPDATE dbo.AppUsers
SET RoleName = CASE
  WHEN RoleName = N'Manager' THEN N'Manager'
  WHEN RoleName IN (N'Super Admin', N'Admin', N'Engineer', N'Storekeeper', N'Purchase Executive', N'Project User', N'Viewer') THEN RoleName
  ELSE N'Project User'
END,
AccountStatus = CASE WHEN IsActive = 1 THEN N'Active' ELSE N'Inactive' END;
