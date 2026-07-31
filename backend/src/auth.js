/* global process */
import argon2 from "argon2";
import bcrypt from "bcryptjs";
import { Buffer } from "node:buffer";
import crypto from "node:crypto";
import express from "express";
import rateLimit from "express-rate-limit";
import nodemailer from "nodemailer";
import QRCode from "qrcode";
import { generateSecret, generateURI, verify as verifyTotp } from "otplib";
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from "@simplewebauthn/server";
import { z } from "zod";
import { getPool, sql } from "./config/db.js";

export const ROLE_PERMISSIONS = Object.freeze({
  "Super Admin": ["*"],
  Admin: [
    "users.manage", "workspace.manage", "security.manage", "audit.view",
    "documents.view", "documents.support.upload", "drawings.create", "drawings.edit",
    "drawings.delete.any", "drawings.approve", "tasks.manage", "reports.manage",
    "reports.approve", "purchase_orders.override_closed", "inventory.manage",
    "procurement.manage",
  ],
  Manager: [
    "documents.view", "drawings.create", "drawings.edit", "drawings.delete.own",
    "drawings.approve", "tasks.manage", "reports.manage", "reports.approve",
  ],
  Engineer: ["documents.view", "documents.support.upload", "tasks.update.assigned"],
  Storekeeper: ["documents.view", "inventory.manage"],
  "Purchase Executive": ["documents.view", "procurement.manage"],
  "Project User": ["documents.view", "tasks.update.assigned"],
  Viewer: ["documents.view"],
});
export const ROLE_NAMES = Object.freeze(Object.keys(ROLE_PERMISSIONS));

const env = (name, fallback = "") => String(process.env[name] || fallback);
const isProduction = () => env("NODE_ENV") === "production";
const sessionCookie = () => isProduction() ? "__Host-be_session" : "be_session";
const CSRF_COOKIE = "be_csrf";
const SESSION_DAYS = 7;
const DEFAULT_IDLE_MINUTES = 30;
const CHALLENGE_MINUTES = 5;
const unsafeMethods = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const commonPasswords = new Set([
  "password", "password123", "password1234", "admin123", "administrator",
  "qwerty123", "letmein123", "welcome123", "changeme123",
]);

const sha256 = (value) => crypto.createHash("sha256").update(String(value)).digest("hex");
const randomToken = (bytes = 32) => crypto.randomBytes(bytes).toString("base64url");
const addMinutes = (date, minutes) => new Date(date.getTime() + minutes * 60_000);
const addDays = (date, days) => new Date(date.getTime() + days * 86_400_000);
const json = (value, fallback = {}) => {
  try { return value ? JSON.parse(value) : fallback; } catch { return fallback; }
};
const clientIp = (req) => String(req.ip || "").trim();
const deviceId = (req) => sha256(`${clientIp(req)}|${req.get("user-agent") || ""}`).slice(0, 32);
const sessionCookieOptions = () => ({
  httpOnly: true,
  secure: isProduction(),
  sameSite: "lax",
  path: "/",
});
const csrfCookieOptions = () => ({
  httpOnly: false,
  secure: isProduction(),
  sameSite: "lax",
  path: "/",
});
const cleanEmail = (value) => String(value || "").trim().toLowerCase();
const requiresMfaEnrollment = () => env("REQUIRE_MFA_ENROLLMENT", "false").toLowerCase() === "true";
const authenticationDisabled = () =>
  !isProduction() && env("AUTH_DISABLED", "true").toLowerCase() === "true";

const appOrigins = () => {
  const configured = env("WEBAUTHN_ORIGINS", env("WEBAUTHN_ORIGIN", env("APP_PUBLIC_URL", env("TRUSTED_FRONTEND_ORIGIN"))))
    .split(",").map((value) => value.trim().replace(/\/$/, "")).filter(Boolean);
  if (configured.length) return configured;
  return ["http://localhost:5173", "http://localhost:5174"];
};
const rpId = () => env("WEBAUTHN_RP_ID", (() => {
  try { return new URL(appOrigins()[0]).hostname; } catch { return "localhost"; }
})());
const rpName = () => env("WEBAUTHN_RP_NAME", "Bangalore Electronics");

export const permissionsForRole = (role) => ROLE_PERMISSIONS[role] || ROLE_PERMISSIONS.Viewer;
export const hasPermission = (user, permission) => {
  const permissions = user?.permissions || permissionsForRole(user?.role);
  return permissions.includes("*") || permissions.includes(permission);
};
export const requirePermission = (permission) => (req, res, next) => {
  if (!hasPermission(req.user, permission)) {
    return res.status(403).json({ ok: false, code: "FORBIDDEN", error: "You do not have permission to perform this action" });
  }
  return next();
};
export const requireManager = requirePermission("reports.approve");

export const publicUser = (row = {}) => ({
  id: row.UserId ?? row.id,
  name: row.FullName ?? row.name ?? "",
  email: row.Email ?? row.email ?? "",
  phone: row.Phone ?? row.phone ?? "",
  department: row.Department ?? row.department ?? "",
  jobTitle: row.JobTitle ?? row.jobTitle ?? "",
  role: row.RoleName ?? row.role ?? "Project User",
  status: row.AccountStatus ?? row.status ?? (row.IsActive === false ? "Inactive" : "Active"),
  twoFactorEnabled: Boolean(row.TotpEnabled ?? row.twoFactorEnabled),
  passkeyCount: Number(row.PasskeyCount ?? row.passkeyCount ?? 0),
  enrollmentRequired: requiresMfaEnrollment() && (
    Boolean(row.EnrollmentOnly) ||
    !(row.TotpEnabled ?? row.twoFactorEnabled) ||
    Number(row.PasskeyCount ?? row.passkeyCount ?? 0) < 1
  ),
  lastLoginAt: row.LastLoginAt ?? row.lastLoginAt ?? null,
  avatar: row.AvatarData
    ? `/api/settings/profile/avatar?v=${encodeURIComponent(row.UpdatedAt || Date.now())}`
    : (row.avatar || ""),
  permissions: permissionsForRole(row.RoleName ?? row.role),
});

const baseSchemaSql = `
IF OBJECT_ID('dbo.AppUsers','U') IS NULL
  CREATE TABLE dbo.AppUsers(UserId INT IDENTITY(1,1) PRIMARY KEY,FullName NVARCHAR(200) NOT NULL,Email NVARCHAR(320) NOT NULL UNIQUE,PasswordHash NVARCHAR(255) NOT NULL,RoleName NVARCHAR(50) NOT NULL DEFAULT N'Project User',IsActive BIT NOT NULL DEFAULT 1,CreatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),UpdatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME());
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
IF OBJECT_ID('dbo.UserPreferences','U') IS NULL CREATE TABLE dbo.UserPreferences(UserId INT NOT NULL PRIMARY KEY REFERENCES dbo.AppUsers(UserId),NotificationsJson NVARCHAR(MAX) NOT NULL DEFAULT N'{}',AppearanceJson NVARCHAR(MAX) NOT NULL DEFAULT N'{}',UpdatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME());
IF OBJECT_ID('dbo.WorkspaceSettings','U') IS NULL CREATE TABLE dbo.WorkspaceSettings(SettingKey NVARCHAR(80) NOT NULL PRIMARY KEY,SettingJson NVARCHAR(MAX) NOT NULL,UpdatedBy INT NULL REFERENCES dbo.AppUsers(UserId),UpdatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME());
IF OBJECT_ID('dbo.AppSessions','U') IS NULL CREATE TABLE dbo.AppSessions(SessionId UNIQUEIDENTIFIER NOT NULL PRIMARY KEY,UserId INT NOT NULL REFERENCES dbo.AppUsers(UserId),RefreshTokenHash CHAR(64) NULL,CsrfTokenHash CHAR(64) NOT NULL,IpAddress NVARCHAR(100) NULL,UserAgent NVARCHAR(1000) NULL,CreatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),LastSeenAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),ExpiresAt DATETIME2 NOT NULL,ReauthenticatedUntil DATETIME2 NULL,RevokedAt DATETIME2 NULL,RevokeReason NVARCHAR(200) NULL);
IF OBJECT_ID('dbo.AuthTokens','U') IS NULL CREATE TABLE dbo.AuthTokens(AuthTokenId BIGINT IDENTITY(1,1) PRIMARY KEY,UserId INT NULL REFERENCES dbo.AppUsers(UserId),Email NVARCHAR(320) NOT NULL,TokenType NVARCHAR(30) NOT NULL,TokenHash CHAR(64) NOT NULL UNIQUE,ExpiresAt DATETIME2 NOT NULL,UsedAt DATETIME2 NULL,CreatedBy INT NULL REFERENCES dbo.AppUsers(UserId),CreatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME());
IF OBJECT_ID('dbo.TotpRecoveryCodes','U') IS NULL CREATE TABLE dbo.TotpRecoveryCodes(RecoveryCodeId BIGINT IDENTITY(1,1) PRIMARY KEY,UserId INT NOT NULL REFERENCES dbo.AppUsers(UserId),CodeHash CHAR(64) NOT NULL,UsedAt DATETIME2 NULL,CreatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME());
IF OBJECT_ID('dbo.LoginHistory','U') IS NULL CREATE TABLE dbo.LoginHistory(LoginHistoryId BIGINT IDENTITY(1,1) PRIMARY KEY,UserId INT NULL REFERENCES dbo.AppUsers(UserId),Email NVARCHAR(320) NULL,IpAddress NVARCHAR(100) NULL,UserAgent NVARCHAR(1000) NULL,Result NVARCHAR(30) NOT NULL,Reason NVARCHAR(200) NULL,CreatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME());
IF OBJECT_ID('dbo.AuditEvents','U') IS NULL CREATE TABLE dbo.AuditEvents(AuditEventId BIGINT IDENTITY(1,1) PRIMARY KEY,ActorUserId INT NULL REFERENCES dbo.AppUsers(UserId),ActionName NVARCHAR(150) NOT NULL,TargetType NVARCHAR(100) NULL,TargetId NVARCHAR(100) NULL,BeforeJson NVARCHAR(MAX) NULL,AfterJson NVARCHAR(MAX) NULL,IpAddress NVARCHAR(100) NULL,UserAgent NVARCHAR(1000) NULL,Result NVARCHAR(30) NOT NULL,CreatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME());
`;

const secureSchemaSql = `
IF COL_LENGTH('dbo.AppSessions', 'SessionTokenHash') IS NULL ALTER TABLE dbo.AppSessions ADD SessionTokenHash CHAR(64) NULL;
IF COL_LENGTH('dbo.AppSessions', 'AbsoluteExpiresAt') IS NULL ALTER TABLE dbo.AppSessions ADD AbsoluteExpiresAt DATETIME2 NULL;
IF COL_LENGTH('dbo.AppSessions', 'IdleExpiresAt') IS NULL ALTER TABLE dbo.AppSessions ADD IdleExpiresAt DATETIME2 NULL;
IF COL_LENGTH('dbo.AppSessions', 'AssuranceLevel') IS NULL ALTER TABLE dbo.AppSessions ADD AssuranceLevel NVARCHAR(30) NOT NULL CONSTRAINT DF_AppSessions_AssuranceLevel DEFAULT N'mfa';
IF COL_LENGTH('dbo.AppSessions', 'AuthenticationMethod') IS NULL ALTER TABLE dbo.AppSessions ADD AuthenticationMethod NVARCHAR(30) NULL;
IF COL_LENGTH('dbo.AppSessions', 'StepUpScopesJson') IS NULL ALTER TABLE dbo.AppSessions ADD StepUpScopesJson NVARCHAR(MAX) NOT NULL CONSTRAINT DF_AppSessions_StepUpScopesJson DEFAULT N'{}';
IF COL_LENGTH('dbo.AppSessions', 'DeviceId') IS NULL ALTER TABLE dbo.AppSessions ADD DeviceId NVARCHAR(100) NULL;
IF COL_LENGTH('dbo.AppSessions', 'EnrollmentOnly') IS NULL ALTER TABLE dbo.AppSessions ADD EnrollmentOnly BIT NOT NULL CONSTRAINT DF_AppSessions_EnrollmentOnly DEFAULT 0;
UPDATE dbo.AppSessions SET AbsoluteExpiresAt=COALESCE(AbsoluteExpiresAt,ExpiresAt),IdleExpiresAt=COALESCE(IdleExpiresAt,DATEADD(MINUTE,30,LastSeenAt)) WHERE AbsoluteExpiresAt IS NULL OR IdleExpiresAt IS NULL;
IF EXISTS(SELECT 1 FROM sys.columns WHERE object_id=OBJECT_ID('dbo.AppSessions') AND name='RefreshTokenHash' AND is_nullable=0) ALTER TABLE dbo.AppSessions ALTER COLUMN RefreshTokenHash CHAR(64) NULL;
IF NOT EXISTS(SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID('dbo.AppSessions') AND name='UX_AppSessions_SessionTokenHash') CREATE UNIQUE INDEX UX_AppSessions_SessionTokenHash ON dbo.AppSessions(SessionTokenHash) WHERE SessionTokenHash IS NOT NULL;
IF OBJECT_ID('dbo.WebAuthnCredentials','U') IS NULL BEGIN
 CREATE TABLE dbo.WebAuthnCredentials(CredentialId NVARCHAR(1024) NOT NULL PRIMARY KEY,UserId INT NOT NULL REFERENCES dbo.AppUsers(UserId),PublicKey VARBINARY(MAX) NOT NULL,Counter BIGINT NOT NULL DEFAULT 0,TransportsJson NVARCHAR(MAX) NOT NULL DEFAULT N'[]',DeviceName NVARCHAR(150) NOT NULL,DeviceType NVARCHAR(40) NULL,BackedUp BIT NOT NULL DEFAULT 0,CreatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),LastUsedAt DATETIME2 NULL);
 CREATE INDEX IX_WebAuthnCredentials_UserId ON dbo.WebAuthnCredentials(UserId);
END;
IF OBJECT_ID('dbo.AuthChallenges','U') IS NULL BEGIN
 CREATE TABLE dbo.AuthChallenges(ChallengeId UNIQUEIDENTIFIER NOT NULL PRIMARY KEY,UserId INT NULL REFERENCES dbo.AppUsers(UserId),SessionId UNIQUEIDENTIFIER NULL REFERENCES dbo.AppSessions(SessionId),Operation NVARCHAR(50) NOT NULL,ChallengeValue NVARCHAR(1024) NOT NULL,ScopeName NVARCHAR(150) NULL,PayloadJson NVARCHAR(MAX) NOT NULL DEFAULT N'{}',ExpectedOrigin NVARCHAR(500) NOT NULL,RpId NVARCHAR(255) NOT NULL,ExpiresAt DATETIME2 NOT NULL,UsedAt DATETIME2 NULL,CreatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME());
 CREATE INDEX IX_AuthChallenges_Expiry ON dbo.AuthChallenges(ExpiresAt,UsedAt);
END;
IF COL_LENGTH('dbo.LoginHistory','AuthenticationMethod') IS NULL ALTER TABLE dbo.LoginHistory ADD AuthenticationMethod NVARCHAR(30) NULL;
IF COL_LENGTH('dbo.LoginHistory','AssuranceLevel') IS NULL ALTER TABLE dbo.LoginHistory ADD AssuranceLevel NVARCHAR(30) NULL;
IF COL_LENGTH('dbo.LoginHistory','DeviceId') IS NULL ALTER TABLE dbo.LoginHistory ADD DeviceId NVARCHAR(100) NULL;
IF COL_LENGTH('dbo.LoginHistory','RiskReason') IS NULL ALTER TABLE dbo.LoginHistory ADD RiskReason NVARCHAR(300) NULL;
IF COL_LENGTH('dbo.AuditEvents','AuthenticationMethod') IS NULL ALTER TABLE dbo.AuditEvents ADD AuthenticationMethod NVARCHAR(30) NULL;
IF COL_LENGTH('dbo.AuditEvents','AssuranceLevel') IS NULL ALTER TABLE dbo.AuditEvents ADD AssuranceLevel NVARCHAR(30) NULL;
`;

const validateProductionConfig = () => {
  if (!isProduction()) return;
  const required = [
    "TOTP_ENCRYPTION_KEY", "SMTP_HOST", "SMTP_FROM",
    "APP_PUBLIC_URL", "TRUSTED_FRONTEND_ORIGIN", "WEBAUTHN_RP_ID", "WEBAUTHN_ORIGIN",
  ];
  const missing = required.filter((key) => !env(key));
  if (missing.length) throw new Error(`Missing required production environment values: ${missing.join(", ")}`);
  if (!env("APP_PUBLIC_URL").startsWith("https://") || !env("WEBAUTHN_ORIGIN").startsWith("https://")) {
    throw new Error("APP_PUBLIC_URL and WEBAUTHN_ORIGIN must use HTTPS in production");
  }
};

let schemaPromise;
let retentionTimer;
export const ensureAuthSchema = async () => {
  validateProductionConfig();
  if (!schemaPromise) schemaPromise = (async () => {
    const pool = await getPool();
    await pool.request().query(baseSchemaSql);
    const secureDataStart = secureSchemaSql.indexOf("UPDATE dbo.AppSessions");
    await pool.request().query(secureSchemaSql.slice(0, secureDataStart));
    await pool.request().query(secureSchemaSql.slice(secureDataStart));
    await pool.request().query(`
      UPDATE dbo.AppUsers SET RoleName=CASE
        WHEN RoleName IN (N'Super Admin',N'Admin',N'Manager',N'Engineer',N'Storekeeper',N'Purchase Executive',N'Project User',N'Viewer') THEN RoleName
        ELSE N'Project User' END;
      DELETE FROM dbo.AuthChallenges WHERE ExpiresAt<DATEADD(DAY,-1,SYSUTCDATETIME());
      DELETE FROM dbo.LoginHistory WHERE CreatedAt<DATEADD(DAY,-365,SYSUTCDATETIME());
      DELETE FROM dbo.AuditEvents WHERE CreatedAt<DATEADD(DAY,-365,SYSUTCDATETIME());
    `);
    for (const role of ["Super Admin", "Admin", "Manager"]) {
      const prefix = role === "Super Admin" ? "SUPER_ADMIN" : role.toUpperCase().replace(" ", "_");
      const email = cleanEmail(env(`${prefix}_EMAIL`));
      const password = env(`${prefix}_PASSWORD`);
      if (!email || !password) continue;
      const existing = await pool.request().input("Email", sql.NVarChar(320), email)
        .query("SELECT UserId FROM dbo.AppUsers WHERE Email=@Email");
      if (existing.recordset[0]) {
        await pool.request().input("Email", sql.NVarChar(320), email)
          .input("Role", sql.NVarChar(50), role)
          .query("UPDATE dbo.AppUsers SET RoleName=@Role,IsActive=1,AccountStatus=N'Active',UpdatedAt=SYSUTCDATETIME() WHERE Email=@Email");
      } else {
        const hash = await argon2.hash(password, { type: argon2.argon2id });
        await pool.request().input("Name", sql.NVarChar(200), env(`${prefix}_NAME`, role))
          .input("Email", sql.NVarChar(320), email).input("Hash", sql.NVarChar(255), hash)
          .input("Role", sql.NVarChar(50), role)
          .query("INSERT dbo.AppUsers(FullName,Email,PasswordHash,RoleName) VALUES(@Name,@Email,@Hash,@Role)");
      }
    }
  })().catch((error) => { schemaPromise = null; throw error; });
  const result = await schemaPromise;
  if (!retentionTimer) {
    retentionTimer = setInterval(async () => {
      try {
        const pool = await getPool();
        await pool.request().query(`
          DELETE FROM dbo.AuthChallenges WHERE ExpiresAt<DATEADD(DAY,-1,SYSUTCDATETIME());
          DELETE FROM dbo.LoginHistory WHERE CreatedAt<DATEADD(DAY,-365,SYSUTCDATETIME());
          DELETE FROM dbo.AuditEvents WHERE CreatedAt<DATEADD(DAY,-365,SYSUTCDATETIME());
        `);
      } catch { /* the next daily run will retry */ }
    }, 24 * 60 * 60_000);
    retentionTimer.unref?.();
  }
  return result;
};

const encryptionKeys = () => [
  env("TOTP_ENCRYPTION_KEY", "development-only-totp-key"),
  ...env("TOTP_ENCRYPTION_KEY_PREVIOUS").split(",").map((value) => value.trim()).filter(Boolean),
].map((material) => crypto.createHash("sha256").update(material).digest());
const encrypt = (plain) => {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", encryptionKeys()[0], iv);
  const encrypted = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return `${iv.toString("base64")}.${cipher.getAuthTag().toString("base64")}.${encrypted.toString("base64")}`;
};
const decrypt = (value) => {
  const [iv, tag, encrypted] = String(value).split(".").map((part) => Buffer.from(part, "base64"));
  for (const key of encryptionKeys()) {
    try {
      const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
      decipher.setAuthTag(tag);
      return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
    } catch { /* try the previous rotation key */ }
  }
  throw new Error("Unable to decrypt authenticator material");
};

const structuralPasswordError = (password) => {
  const value = String(password || "");
  if (commonPasswords.has(value.toLowerCase())) return "Choose a password that is not commonly used";
  if (value.length < 14) return "Password must contain at least 14 characters";
  if (!/[A-Za-z]/.test(value) || !/\d/.test(value)) return "Password must include letters and numbers";
  return null;
};
const breachedPasswordCount = async (password) => {
  if (env("PASSWORD_BREACH_CHECK", "true") === "false") return 0;
  const digest = crypto.createHash("sha1").update(String(password)).digest("hex").toUpperCase();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3500);
  try {
    const response = await fetch(`https://api.pwnedpasswords.com/range/${digest.slice(0, 5)}`, {
      signal: controller.signal,
      headers: { "Add-Padding": "true", "User-Agent": "BE-Inventory-Password-Validator" },
    });
    if (!response.ok) return 0;
    const suffix = digest.slice(5);
    const match = (await response.text()).split(/\r?\n/).find((line) => line.startsWith(`${suffix}:`));
    return match ? Number(match.split(":")[1]) : 0;
  } catch {
    return 0;
  } finally {
    clearTimeout(timeout);
  }
};
const validateNewPassword = async (password) => {
  const structural = structuralPasswordError(password);
  if (structural) return structural;
  if (await breachedPasswordCount(password)) return "This password appears in known data breaches. Choose a different password";
  return null;
};
const verifyPassword = async (hash, password) => {
  if (!hash) return false;
  if (String(hash).startsWith("$argon2")) return argon2.verify(hash, String(password));
  return bcrypt.compare(String(password), hash);
};
const upgradePasswordHash = async (pool, userId, hash, password) => {
  if (String(hash).startsWith("$argon2")) return;
  const upgraded = await argon2.hash(String(password), { type: argon2.argon2id });
  await pool.request().input("Id", sql.Int, userId).input("Hash", sql.NVarChar(255), upgraded)
    .query("UPDATE dbo.AppUsers SET PasswordHash=@Hash,UpdatedAt=SYSUTCDATETIME() WHERE UserId=@Id");
};

const writeLogin = async (req, {
  userId = null, email = null, result, reason = null, method = null,
  assurance = null, riskReason = null,
}) => {
  const pool = await getPool();
  await pool.request().input("UserId", sql.Int, userId).input("Email", sql.NVarChar(320), email)
    .input("Ip", sql.NVarChar(100), clientIp(req)).input("Ua", sql.NVarChar(1000), req.get("user-agent") || "")
    .input("Result", sql.NVarChar(30), result).input("Reason", sql.NVarChar(200), reason)
    .input("Method", sql.NVarChar(30), method).input("Assurance", sql.NVarChar(30), assurance)
    .input("Device", sql.NVarChar(100), deviceId(req)).input("Risk", sql.NVarChar(300), riskReason)
    .query(`INSERT dbo.LoginHistory(UserId,Email,IpAddress,UserAgent,Result,Reason,AuthenticationMethod,AssuranceLevel,DeviceId,RiskReason)
      VALUES(@UserId,@Email,@Ip,@Ua,@Result,@Reason,@Method,@Assurance,@Device,@Risk)`);
};
const isNewDevice = async (userId, req) => {
  const result = await (await getPool()).request().input("Id", sql.Int, userId)
    .input("Device", sql.NVarChar(100), deviceId(req))
    .query("SELECT TOP 1 LoginHistoryId FROM dbo.LoginHistory WHERE UserId=@Id AND DeviceId=@Device AND Result=N'Success'");
  return !result.recordset[0];
};

export const writeAudit = async (req, {
  action, targetType = null, targetId = null, before = null, after = null, result = "Success",
}) => {
  const pool = await getPool();
  await pool.request().input("Actor", sql.Int, req.user?.id || null)
    .input("Action", sql.NVarChar(150), action).input("Type", sql.NVarChar(100), targetType)
    .input("Id", sql.NVarChar(100), targetId == null ? null : String(targetId))
    .input("Before", sql.NVarChar(sql.MAX), before == null ? null : JSON.stringify(before))
    .input("After", sql.NVarChar(sql.MAX), after == null ? null : JSON.stringify(after))
    .input("Ip", sql.NVarChar(100), clientIp(req)).input("Ua", sql.NVarChar(1000), req.get("user-agent") || "")
    .input("Result", sql.NVarChar(30), result)
    .input("Method", sql.NVarChar(30), req.session?.AuthenticationMethod || null)
    .input("Assurance", sql.NVarChar(30), req.session?.AssuranceLevel || null)
    .query(`INSERT dbo.AuditEvents(ActorUserId,ActionName,TargetType,TargetId,BeforeJson,AfterJson,IpAddress,UserAgent,Result,AuthenticationMethod,AssuranceLevel)
      VALUES(@Actor,@Action,@Type,@Id,@Before,@After,@Ip,@Ua,@Result,@Method,@Assurance)`);
};

const clearSessionCookies = (res) => {
  res.clearCookie(sessionCookie(), sessionCookieOptions());
  res.clearCookie(CSRF_COOKIE, csrfCookieOptions());
  // Clear the removed legacy cookies during rollout.
  res.clearCookie("be_access", sessionCookieOptions());
  res.clearCookie("be_refresh", sessionCookieOptions());
};

const issueSession = async (req, res, row, {
  method = "password_totp", assurance = "mfa", enrollmentOnly,
  stepUpScopes = {},
} = {}) => {
  const pool = await getPool();
  const rawToken = randomToken(32);
  const csrf = randomToken(32);
  const sessionId = crypto.randomUUID();
  const now = new Date();
  const absolute = addDays(now, SESSION_DAYS);
  const idle = addMinutes(now, DEFAULT_IDLE_MINUTES);
  const needsEnrollment = requiresMfaEnrollment() &&
    (enrollmentOnly ?? (!row.TotpEnabled || Number(row.PasskeyCount || 0) < 1));
  await pool.request().input("Sid", sql.UniqueIdentifier, sessionId).input("UserId", sql.Int, row.UserId ?? row.id)
    .input("Token", sql.Char(64), sha256(rawToken)).input("Csrf", sql.Char(64), sha256(csrf))
    .input("Ip", sql.NVarChar(100), clientIp(req)).input("Ua", sql.NVarChar(1000), req.get("user-agent") || "")
    .input("Expires", sql.DateTime2, absolute).input("Absolute", sql.DateTime2, absolute)
    .input("Idle", sql.DateTime2, idle).input("Assurance", sql.NVarChar(30), assurance)
    .input("Method", sql.NVarChar(30), method).input("Scopes", sql.NVarChar(sql.MAX), JSON.stringify(stepUpScopes))
    .input("Device", sql.NVarChar(100), deviceId(req)).input("Enrollment", sql.Bit, needsEnrollment)
    .query(`INSERT dbo.AppSessions(SessionId,UserId,SessionTokenHash,CsrfTokenHash,IpAddress,UserAgent,ExpiresAt,AbsoluteExpiresAt,IdleExpiresAt,AssuranceLevel,AuthenticationMethod,StepUpScopesJson,DeviceId,EnrollmentOnly)
      VALUES(@Sid,@UserId,@Token,@Csrf,@Ip,@Ua,@Expires,@Absolute,@Idle,@Assurance,@Method,@Scopes,@Device,@Enrollment)`);
  res.cookie(sessionCookie(), rawToken, { ...sessionCookieOptions(), maxAge: SESSION_DAYS * 86_400_000 });
  res.cookie(CSRF_COOKIE, csrf, { ...csrfCookieOptions(), maxAge: SESSION_DAYS * 86_400_000 });
  return sessionId;
};

const loadSessionByToken = async (token) => {
  const pool = await getPool();
  const result = await pool.request().input("Hash", sql.Char(64), sha256(token)).query(`
    SELECT
      s.SessionId,s.SessionTokenHash,s.CsrfTokenHash,s.IpAddress,s.UserAgent,
      s.CreatedAt,s.LastSeenAt,s.ExpiresAt,s.AbsoluteExpiresAt,s.IdleExpiresAt,
      s.AssuranceLevel,s.AuthenticationMethod,s.StepUpScopesJson,s.DeviceId,
      s.EnrollmentOnly,s.ReauthenticatedUntil,s.RevokedAt,s.RevokeReason,
      u.UserId,u.FullName,u.Email,u.PasswordHash,u.Phone,u.Department,u.JobTitle,
      u.RoleName,u.AccountStatus,u.IsActive,u.TotpSecretEncrypted,u.TotpEnabled,
      u.LastLoginAt,u.PasswordChangedAt,u.PasswordExpiresAt,u.FailedLoginAttempts,
      u.FirstFailedLoginAt,u.LockedUntil,u.AvatarContentType,u.AvatarData,u.UpdatedAt,
      w.SettingJson AS SecurityPolicyJson,
      (SELECT COUNT(*) FROM dbo.WebAuthnCredentials c WHERE c.UserId=u.UserId) AS PasskeyCount
    FROM dbo.AppSessions s
    JOIN dbo.AppUsers u ON u.UserId=s.UserId
    LEFT JOIN dbo.WorkspaceSettings w ON w.SettingKey=N'security'
    WHERE s.SessionTokenHash=@Hash
  `);
  return result.recordset[0];
};

const requestOriginAllowed = (req) => {
  const origin = req.get("origin");
  if (!origin) return true;
  return appOrigins().includes(origin.replace(/\/$/, ""));
};

export const authenticate = async (req, res, next) => {
  try {
    await ensureAuthSchema();
    if (authenticationDisabled()) {
      const pool = await getPool();
      const configuredEmail = cleanEmail(env("SUPER_ADMIN_EMAIL", env("ADMIN_EMAIL")));
      const result = await pool.request().input("Email", sql.NVarChar(320), configuredEmail).query(`
        SELECT TOP 1 u.*,
          (SELECT COUNT(*) FROM dbo.WebAuthnCredentials c WHERE c.UserId=u.UserId) AS PasskeyCount
        FROM dbo.AppUsers u
        WHERE u.IsActive=1 AND u.AccountStatus=N'Active'
          AND (@Email=N'' OR u.Email=@Email)
        ORDER BY CASE WHEN u.RoleName=N'Super Admin' THEN 0 WHEN u.RoleName=N'Admin' THEN 1 ELSE 2 END,u.UserId
      `);
      const row = result.recordset[0];
      if (!row) {
        return res.status(503).json({ ok: false, code: "AUTH_BYPASS_USER_MISSING", error: "No active development user is available" });
      }
      req.session = {
        SessionId: null,
        AuthenticationMethod: "development_bypass",
        AssuranceLevel: "development_bypass",
        StepUpScopesJson: JSON.stringify({ "*": "2999-12-31T23:59:59.999Z" }),
        EnrollmentOnly: false,
      };
      req.user = publicUser({ ...row, EnrollmentOnly: false });
      return next();
    }
    const token = req.cookies?.[sessionCookie()];
    if (!token) return res.status(401).json({ ok: false, code: "AUTH_REQUIRED", error: "Authentication required" });
    const row = await loadSessionByToken(token);
    const now = new Date();
    const policy = json(row?.SecurityPolicyJson);
    const idleMinutes = Number(policy.inactivityTimeoutMinutes || env("SESSION_INACTIVITY_MINUTES", DEFAULT_IDLE_MINUTES));
    if (!row || row.RevokedAt || !row.IsActive || row.AccountStatus !== "Active" ||
      new Date(row.AbsoluteExpiresAt || row.ExpiresAt) <= now ||
      new Date(row.IdleExpiresAt || row.LastSeenAt) <= now) {
      clearSessionCookies(res);
      return res.status(401).json({ ok: false, code: "SESSION_EXPIRED", error: "Authentication required" });
    }
    if (unsafeMethods.has(req.method)) {
      const csrf = String(req.get("x-csrf-token") || "");
      const fetchSite = String(req.get("sec-fetch-site") || "").toLowerCase();
      if (!csrf || csrf !== req.cookies?.[CSRF_COOKIE] || sha256(csrf) !== row.CsrfTokenHash ||
        !requestOriginAllowed(req) || (fetchSite && !["same-origin", "same-site", "none"].includes(fetchSite))) {
        return res.status(403).json({ ok: false, code: "CSRF_INVALID", error: "Security token validation failed" });
      }
    }
    req.session = row;
    req.user = publicUser(row);
    await (await getPool()).request().input("Sid", sql.UniqueIdentifier, row.SessionId)
      .input("Idle", sql.DateTime2, addMinutes(now, idleMinutes))
      .query("UPDATE dbo.AppSessions SET LastSeenAt=SYSUTCDATETIME(),IdleExpiresAt=@Idle WHERE SessionId=@Sid");
    return next();
  } catch {
    clearSessionCookies(res);
    return res.status(401).json({ ok: false, code: "AUTH_REQUIRED", error: "Authentication required" });
  }
};

export const requireEnrollment = (req, res, next) => {
  if (req.user?.enrollmentRequired) {
    return res.status(403).json({ ok: false, code: "ENROLLMENT_REQUIRED", error: "Complete security enrollment to continue" });
  }
  return next();
};

export const hasStepUpScope = (session, scope) => {
  const scopes = json(session?.StepUpScopesJson);
  const expires = scopes[scope] || scopes["*"];
  return Boolean(expires && new Date(expires) > new Date());
};
export const requireStepUp = (scope) => (req, res, next) => {
  if (!hasStepUpScope(req.session, scope)) {
    return res.status(403).json({
      ok: false, code: "STEP_UP_REQUIRED", scope,
      error: "Verify with your passkey to continue",
    });
  }
  return next();
};
export const requireRecentReauthentication = requireStepUp("purchase_orders.override_closed");

const consumeSecondFactor = async (userId, encryptedSecret, token) => {
  const clean = String(token || "").replace(/[\s-]/g, "").toUpperCase();
  if (!clean) return false;
  if (encryptedSecret && /^\d{6,8}$/.test(clean)) {
    const result = await verifyTotp({ secret: decrypt(encryptedSecret), token: clean });
    if (result?.valid) return true;
  }
  const pool = await getPool();
  const recovery = await pool.request().input("UserId", sql.Int, userId)
    .input("Hash", sql.Char(64), sha256(clean)).query(`
      UPDATE dbo.TotpRecoveryCodes SET UsedAt=SYSUTCDATETIME()
      OUTPUT INSERTED.RecoveryCodeId
      WHERE UserId=@UserId AND CodeHash=@Hash AND UsedAt IS NULL
    `);
  return Boolean(recovery.recordset[0]);
};

const smtpTransport = () => nodemailer.createTransport({
  host: env("SMTP_HOST"), port: Number(env("SMTP_PORT", "587")),
  secure: env("SMTP_SECURE") === "true",
  auth: env("SMTP_USER") ? { user: env("SMTP_USER"), pass: env("SMTP_PASSWORD") } : undefined,
});
export const sendTokenEmail = async ({ to, subject, path, token }) => {
  if (!env("SMTP_HOST")) {
    if (isProduction()) throw new Error("SMTP is not configured");
    return;
  }
  await smtpTransport().sendMail({
    from: env("SMTP_FROM"), to, subject,
    text: `${subject}: ${env("APP_PUBLIC_URL")}${path}?token=${token}`,
  });
};
export const sendSecurityAlert = async (email, subject, req) => {
  if (!env("SMTP_HOST")) return;
  await smtpTransport().sendMail({
    from: env("SMTP_FROM"), to: email, subject,
    text: `${subject}\nIP: ${clientIp(req)}\nDevice: ${req.get("user-agent") || "Unknown"}\nIf this was not you, contact your administrator immediately.`,
  }).catch(() => {});
};

const createChallenge = async ({ userId = null, sessionId = null, operation, challenge, scope = null, payload = {} }) => {
  const id = crypto.randomUUID();
  const pool = await getPool();
  await pool.request().input("Id", sql.UniqueIdentifier, id).input("UserId", sql.Int, userId)
    .input("Sid", sql.UniqueIdentifier, sessionId).input("Operation", sql.NVarChar(50), operation)
    .input("Challenge", sql.NVarChar(1024), challenge).input("Scope", sql.NVarChar(150), scope)
    .input("Payload", sql.NVarChar(sql.MAX), JSON.stringify(payload))
    .input("Origin", sql.NVarChar(500), appOrigins().join(",")).input("Rp", sql.NVarChar(255), rpId())
    .input("Expires", sql.DateTime2, addMinutes(new Date(), CHALLENGE_MINUTES))
    .query(`INSERT dbo.AuthChallenges(ChallengeId,UserId,SessionId,Operation,ChallengeValue,ScopeName,PayloadJson,ExpectedOrigin,RpId,ExpiresAt)
      VALUES(@Id,@UserId,@Sid,@Operation,@Challenge,@Scope,@Payload,@Origin,@Rp,@Expires)`);
  return id;
};
const consumeChallenge = async (id, operation, sessionId = null) => {
  const pool = await getPool();
  const transaction = pool.transaction();
  await transaction.begin();
  try {
    const result = await new sql.Request(transaction).input("Id", sql.UniqueIdentifier, id)
      .input("Operation", sql.NVarChar(50), operation).input("Sid", sql.UniqueIdentifier, sessionId)
      .query(`SELECT * FROM dbo.AuthChallenges WITH(UPDLOCK,HOLDLOCK)
        WHERE ChallengeId=@Id AND Operation=@Operation AND UsedAt IS NULL
          AND ExpiresAt>SYSUTCDATETIME() AND (@Sid IS NULL OR SessionId=@Sid)`);
    const challenge = result.recordset[0];
    if (!challenge) {
      await transaction.rollback();
      return null;
    }
    await new sql.Request(transaction).input("Id", sql.UniqueIdentifier, id)
      .query("UPDATE dbo.AuthChallenges SET UsedAt=SYSUTCDATETIME() WHERE ChallengeId=@Id");
    await transaction.commit();
    return challenge;
  } catch (error) {
    try { await transaction.rollback(); } catch { /* noop */ }
    throw error;
  }
};

const credentialsForUser = async (userId) => {
  const pool = await getPool();
  return (await pool.request().input("Id", sql.Int, userId)
    .query("SELECT * FROM dbo.WebAuthnCredentials WHERE UserId=@Id ORDER BY CreatedAt")).recordset;
};
const webAuthnCredential = (row) => ({
  id: row.CredentialId,
  publicKey: new Uint8Array(row.PublicKey),
  counter: Number(row.Counter),
  transports: json(row.TransportsJson, []),
});

const rotateSession = async (req, res, userRow, options = {}) => {
  const pool = await getPool();
  await pool.request().input("Sid", sql.UniqueIdentifier, req.session.SessionId)
    .query("UPDATE dbo.AppSessions SET RevokedAt=SYSUTCDATETIME(),RevokeReason=N'Rotated' WHERE SessionId=@Sid");
  const sessionId = await issueSession(req, res, userRow, options);
  return sessionId;
};

const loginSchema = z.object({
  email: z.string().email().max(320),
  password: z.string().min(1).max(500),
});
const mfaSchema = z.object({
  transactionId: z.string().uuid(),
  transactionToken: z.string().min(20).max(500),
  code: z.string().min(6).max(40),
});

export const createAuthRouter = () => {
  const router = express.Router();
  const loginLimiter = rateLimit({
    windowMs: 15 * 60_000,
    limit: 30,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    handler: (_req, res) => res.status(429).json({
      ok: false, code: "RATE_LIMITED", error: "Unable to sign in. Try again later",
    }),
  });
  const resetLimiter = rateLimit({
    windowMs: 60 * 60_000,
    limit: 3,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    handler: (_req, res) => res.status(429).json({
      ok: true, message: "If the account exists, reset instructions have been sent",
    }),
  });

  router.post("/register", (_req, res) => res.status(404).json({ ok: false, error: "Public registration is disabled" }));
  router.post("/refresh", (_req, res) => res.status(404).json({ ok: false, code: "ROUTE_REMOVED", error: "This endpoint is not available" }));

  router.post("/login", loginLimiter, async (req, res, next) => {
    try {
      await ensureAuthSchema();
      const parsed = loginSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ ok: false, code: "VALIDATION_ERROR", error: "Invalid sign-in request" });
      const { password } = parsed.data;
      const email = cleanEmail(parsed.data.email);
      const pool = await getPool();
      const found = await pool.request().input("Email", sql.NVarChar(320), email)
        .query(`SELECT u.*,(SELECT COUNT(*) FROM dbo.WebAuthnCredentials c WHERE c.UserId=u.UserId) AS PasskeyCount
          FROM dbo.AppUsers u WHERE u.Email=@Email`);
      const row = found.recordset[0];
      const now = new Date();
      const locked = row?.LockedUntil && new Date(row.LockedUntil) > now;
      const valid = row && row.IsActive && row.AccountStatus === "Active" && !locked &&
        await verifyPassword(row.PasswordHash, password);
      if (!valid) {
        let attempts = Number(row?.FailedLoginAttempts || 0);
        if (row && !locked) {
          const within = row.FirstFailedLoginAt && new Date(row.FirstFailedLoginAt) > addMinutes(now, -15);
          attempts = within ? Number(row.FailedLoginAttempts) + 1 : 1;
          await pool.request().input("Id", sql.Int, row.UserId).input("Attempts", sql.Int, attempts)
            .input("First", sql.DateTime2, within ? row.FirstFailedLoginAt : now)
            .input("Lock", sql.DateTime2, attempts >= 5 ? addMinutes(now, 15) : null)
            .query("UPDATE dbo.AppUsers SET FailedLoginAttempts=@Attempts,FirstFailedLoginAt=@First,LockedUntil=@Lock WHERE UserId=@Id");
        }
        await writeLogin(req, { userId: row?.UserId, email, result: "Failed", reason: "Invalid credentials", method: "password" });
        if (row && attempts >= 3) await sendSecurityAlert(row.Email, "Suspicious sign-in attempts were detected", req);
        return res.status(401).json({ ok: false, code: locked ? "ACCOUNT_LOCKED" : "INVALID_CREDENTIALS", error: "Invalid email or password" });
      }
      await upgradePasswordHash(pool, row.UserId, row.PasswordHash, password);
      await pool.request().input("Id", sql.Int, row.UserId)
        .query("UPDATE dbo.AppUsers SET FailedLoginAttempts=0,FirstFailedLoginAt=NULL,LockedUntil=NULL WHERE UserId=@Id");
      if (!row.TotpEnabled && requiresMfaEnrollment()) {
        const user = publicUser({ ...row, EnrollmentOnly: true });
        await issueSession(req, res, row, { method: "password", assurance: "password", enrollmentOnly: true });
        await writeLogin(req, { userId: row.UserId, email, result: "Enrollment", method: "password", assurance: "password" });
        return res.status(202).json({ ok: true, code: "ENROLLMENT_REQUIRED", enrollmentRequired: true, user });
      }
      if (!row.TotpEnabled) {
        await pool.request().input("Id", sql.Int, row.UserId)
          .query("UPDATE dbo.AppUsers SET LastLoginAt=SYSUTCDATETIME() WHERE UserId=@Id");
        const user = publicUser({ ...row, LastLoginAt: now, EnrollmentOnly: false });
        await issueSession(req, res, row, {
          method: "password",
          assurance: "password",
          enrollmentOnly: false,
        });
        await writeLogin(req, {
          userId: row.UserId, email, result: "Success",
          method: "password", assurance: "password",
        });
        return res.json({ ok: true, user });
      }
      const transactionToken = randomToken(32);
      const transactionId = await createChallenge({
        userId: row.UserId, operation: "password_mfa", challenge: sha256(transactionToken),
      });
      return res.status(202).json({
        ok: false, code: "MFA_REQUIRED", error: "Enter your authenticator or recovery code",
        transactionId, transactionToken,
      });
    } catch (error) { return next(error); }
  });

  router.post("/login/mfa", loginLimiter, async (req, res, next) => {
    try {
      const parsed = mfaSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ ok: false, code: "VALIDATION_ERROR", error: "Invalid verification request" });
      const challenge = await consumeChallenge(parsed.data.transactionId, "password_mfa");
      if (!challenge || !crypto.timingSafeEqual(Buffer.from(challenge.ChallengeValue), Buffer.from(sha256(parsed.data.transactionToken)))) {
        return res.status(401).json({ ok: false, code: "INVALID_CREDENTIALS", error: "Unable to verify sign-in" });
      }
      const pool = await getPool();
      const result = await pool.request().input("Id", sql.Int, challenge.UserId)
        .query(`SELECT u.*,(SELECT COUNT(*) FROM dbo.WebAuthnCredentials c WHERE c.UserId=u.UserId) AS PasskeyCount FROM dbo.AppUsers u WHERE u.UserId=@Id`);
      const row = result.recordset[0];
      if (!row || !await consumeSecondFactor(row.UserId, row.TotpSecretEncrypted, parsed.data.code)) {
        await writeLogin(req, { userId: row?.UserId, email: row?.Email, result: "Failed", reason: "Invalid second factor", method: "password_totp" });
        return res.status(401).json({ ok: false, code: "INVALID_CREDENTIALS", error: "Unable to verify sign-in" });
      }
      await pool.request().input("Id", sql.Int, row.UserId)
        .query("UPDATE dbo.AppUsers SET LastLoginAt=SYSUTCDATETIME() WHERE UserId=@Id");
      const enrollmentOnly = requiresMfaEnrollment() && Number(row.PasskeyCount) < 1;
      const newDevice = await isNewDevice(row.UserId, req);
      await issueSession(req, res, row, { method: "password_totp", assurance: "mfa", enrollmentOnly });
      await writeLogin(req, { userId: row.UserId, email: row.Email, result: "Success", method: "password_totp", assurance: "mfa" });
      if (newDevice) await sendSecurityAlert(row.Email, "New device signed in to your BE Inventory account", req);
      return res.json({ ok: true, user: publicUser({ ...row, EnrollmentOnly: enrollmentOnly }) });
    } catch (error) { return next(error); }
  });

  router.post("/passkeys/authentication/options", loginLimiter, async (_req, res, next) => {
    try {
      await ensureAuthSchema();
      const options = await generateAuthenticationOptions({
        rpID: rpId(), userVerification: "required",
        allowCredentials: [],
      });
      const transactionId = await createChallenge({
        operation: "passkey_authentication", challenge: options.challenge,
      });
      return res.json({ ok: true, transactionId, options });
    } catch (error) { return next(error); }
  });

  router.post("/passkeys/authentication/verify", loginLimiter, async (req, res) => {
    try {
      const parsed = z.object({ transactionId: z.string().uuid(), response: z.any() }).safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ ok: false, code: "VALIDATION_ERROR", error: "Invalid passkey response" });
      const challenge = await consumeChallenge(parsed.data.transactionId, "passkey_authentication");
      if (!challenge) return res.status(400).json({ ok: false, code: "CHALLENGE_INVALID", error: "Passkey request expired" });
      const pool = await getPool();
      const found = await pool.request().input("Credential", sql.NVarChar(1024), parsed.data.response?.id)
        .query(`SELECT
          c.CredentialId,c.PublicKey,c.Counter,c.TransportsJson,c.DeviceName,c.DeviceType,
          c.BackedUp,c.CreatedAt,c.LastUsedAt,
          u.*,(SELECT COUNT(*) FROM dbo.WebAuthnCredentials x WHERE x.UserId=u.UserId) AS PasskeyCount
          FROM dbo.WebAuthnCredentials c JOIN dbo.AppUsers u ON u.UserId=c.UserId WHERE c.CredentialId=@Credential`);
      const row = found.recordset[0];
      if (!row || !row.IsActive || row.AccountStatus !== "Active") throw new Error("credential");
      const verification = await verifyAuthenticationResponse({
        response: parsed.data.response, expectedChallenge: challenge.ChallengeValue,
        expectedOrigin: appOrigins(), expectedRPID: rpId(),
        credential: webAuthnCredential(row), requireUserVerification: true,
      });
      if (!verification.verified || !verification.authenticationInfo.userVerified) throw new Error("credential");
      await pool.request().input("Credential", sql.NVarChar(1024), row.CredentialId)
        .input("Counter", sql.BigInt, verification.authenticationInfo.newCounter)
        .query("UPDATE dbo.WebAuthnCredentials SET Counter=@Counter,LastUsedAt=SYSUTCDATETIME() WHERE CredentialId=@Credential");
      await pool.request().input("Id", sql.Int, row.UserId)
        .query("UPDATE dbo.AppUsers SET LastLoginAt=SYSUTCDATETIME(),FailedLoginAttempts=0,LockedUntil=NULL WHERE UserId=@Id");
      const enrollmentOnly = requiresMfaEnrollment() && !row.TotpEnabled;
      const newDevice = await isNewDevice(row.UserId, req);
      await issueSession(req, res, row, { method: "passkey", assurance: "phishing_resistant", enrollmentOnly });
      await writeLogin(req, { userId: row.UserId, email: row.Email, result: "Success", method: "passkey", assurance: "phishing_resistant" });
      if (newDevice) await sendSecurityAlert(row.Email, "New device signed in with a passkey", req);
      return res.json({ ok: true, user: publicUser({ ...row, EnrollmentOnly: enrollmentOnly }) });
    } catch {
      return res.status(401).json({ ok: false, code: "INVALID_CREDENTIALS", error: "Unable to verify passkey" });
    }
  });

  router.get("/session", authenticate, (req, res) => res.json({
    ok: true, user: req.user,
    session: {
      id: req.session.SessionId, authenticationMethod: req.session.AuthenticationMethod,
      assuranceLevel: req.session.AssuranceLevel, absoluteExpiresAt: req.session.AbsoluteExpiresAt,
      idleExpiresAt: req.session.IdleExpiresAt,
    },
  }));
  router.get("/me", authenticate, (req, res) => res.json({ ok: true, user: req.user }));

  router.post("/logout", authenticate, async (req, res, next) => {
    try {
      await (await getPool()).request().input("Sid", sql.UniqueIdentifier, req.session.SessionId)
        .query("UPDATE dbo.AppSessions SET RevokedAt=SYSUTCDATETIME(),RevokeReason=N'Logout' WHERE SessionId=@Sid");
      clearSessionCookies(res);
      return res.json({ ok: true });
    } catch (error) { return next(error); }
  });

  router.get("/passkeys", authenticate, async (req, res, next) => {
    try {
      const credentials = await credentialsForUser(req.user.id);
      return res.json({ ok: true, passkeys: credentials.map((item) => ({
        credentialId: item.CredentialId, deviceName: item.DeviceName,
        deviceType: item.DeviceType, backedUp: Boolean(item.BackedUp),
        createdAt: item.CreatedAt, lastUsedAt: item.LastUsedAt,
      })) });
    } catch (error) { return next(error); }
  });

  router.post("/passkeys/registration/options", authenticate, async (req, res, next) => {
    try {
      const existing = await credentialsForUser(req.user.id);
      const options = await generateRegistrationOptions({
        rpName: rpName(), rpID: rpId(), userName: req.user.email,
        userDisplayName: req.user.name, userID: new Uint8Array(Buffer.from(String(req.user.id))),
        attestationType: "none",
        excludeCredentials: existing.map((item) => ({ id: item.CredentialId, transports: json(item.TransportsJson, []) })),
        authenticatorSelection: { residentKey: "required", userVerification: "required" },
      });
      const transactionId = await createChallenge({
        userId: req.user.id, sessionId: req.session.SessionId,
        operation: "passkey_registration", challenge: options.challenge,
        payload: { deviceName: String(req.body?.deviceName || "My passkey").slice(0, 150) },
      });
      return res.json({ ok: true, transactionId, options });
    } catch (error) { return next(error); }
  });

  router.post("/passkeys/registration/verify", authenticate, async (req, res, next) => {
    try {
      const parsed = z.object({ transactionId: z.string().uuid(), response: z.any(), deviceName: z.string().max(150).optional() }).safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ ok: false, code: "VALIDATION_ERROR", error: "Invalid passkey response" });
      const challenge = await consumeChallenge(parsed.data.transactionId, "passkey_registration", req.session.SessionId);
      if (!challenge || Number(challenge.UserId) !== Number(req.user.id)) {
        return res.status(400).json({ ok: false, code: "CHALLENGE_INVALID", error: "Passkey request expired" });
      }
      const verification = await verifyRegistrationResponse({
        response: parsed.data.response, expectedChallenge: challenge.ChallengeValue,
        expectedOrigin: appOrigins(), expectedRPID: rpId(), requireUserVerification: true,
      });
      if (!verification.verified || !verification.registrationInfo.userVerified) {
        return res.status(400).json({ ok: false, code: "PASSKEY_REQUIRED", error: "Passkey could not be verified" });
      }
      const info = verification.registrationInfo;
      const pool = await getPool();
      await pool.request().input("Credential", sql.NVarChar(1024), info.credential.id)
        .input("UserId", sql.Int, req.user.id).input("Key", sql.VarBinary(sql.MAX), Buffer.from(info.credential.publicKey))
        .input("Counter", sql.BigInt, info.credential.counter)
        .input("Transports", sql.NVarChar(sql.MAX), JSON.stringify(info.credential.transports || []))
        .input("Name", sql.NVarChar(150), parsed.data.deviceName || json(challenge.PayloadJson).deviceName || "My passkey")
        .input("Type", sql.NVarChar(40), info.credentialDeviceType).input("BackedUp", sql.Bit, info.credentialBackedUp)
        .query(`INSERT dbo.WebAuthnCredentials(CredentialId,UserId,PublicKey,Counter,TransportsJson,DeviceName,DeviceType,BackedUp)
          VALUES(@Credential,@UserId,@Key,@Counter,@Transports,@Name,@Type,@BackedUp)`);
      await writeAudit(req, { action: "passkey.add", targetType: "user", targetId: req.user.id, after: { deviceName: parsed.data.deviceName || "My passkey" } });
      await sendSecurityAlert(req.user.email, "A passkey was added to your BE Inventory account", req);
      const updated = await pool.request().input("Id", sql.Int, req.user.id)
        .query(`SELECT u.*,(SELECT COUNT(*) FROM dbo.WebAuthnCredentials c WHERE c.UserId=u.UserId) AS PasskeyCount FROM dbo.AppUsers u WHERE u.UserId=@Id`);
      if (updated.recordset[0].TotpEnabled) {
        await rotateSession(req, res, updated.recordset[0], { method: req.session.AuthenticationMethod, assurance: req.session.AssuranceLevel, enrollmentOnly: false });
      }
      return res.json({ ok: true, user: publicUser(updated.recordset[0]) });
    } catch (error) {
      if (String(error?.number) === "2627") return res.status(409).json({ ok: false, code: "PASSKEY_EXISTS", error: "This passkey is already registered" });
      return next(error);
    }
  });

  router.delete("/passkeys/:credentialId", authenticate, requireEnrollment, requireStepUp("security.passkeys"), async (req, res, next) => {
    try {
      const pool = await getPool();
      const count = await pool.request().input("Id", sql.Int, req.user.id)
        .query("SELECT COUNT(*) AS count FROM dbo.WebAuthnCredentials WHERE UserId=@Id");
      if (Number(count.recordset[0].count) <= 1) {
        return res.status(409).json({ ok: false, code: "PASSKEY_REQUIRED", error: "At least one passkey is required" });
      }
      const removed = await pool.request().input("Id", sql.Int, req.user.id)
        .input("Credential", sql.NVarChar(1024), req.params.credentialId)
        .query("DELETE dbo.WebAuthnCredentials OUTPUT DELETED.DeviceName WHERE UserId=@Id AND CredentialId=@Credential");
      if (!removed.recordset[0]) return res.status(404).json({ ok: false, error: "Passkey not found" });
      await writeAudit(req, { action: "passkey.remove", targetType: "user", targetId: req.user.id, before: removed.recordset[0] });
      await sendSecurityAlert(req.user.email, "A passkey was removed from your BE Inventory account", req);
      return res.json({ ok: true });
    } catch (error) { return next(error); }
  });

  router.post("/step-up/options", authenticate, requireEnrollment, async (req, res, next) => {
    try {
      const parsed = z.object({ scope: z.string().min(3).max(150) }).safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ ok: false, code: "VALIDATION_ERROR", error: "A valid action scope is required" });
      const credentials = await credentialsForUser(req.user.id);
      if (!credentials.length) return res.status(403).json({ ok: false, code: "PASSKEY_REQUIRED", error: "Register a passkey first" });
      const options = await generateAuthenticationOptions({
        rpID: rpId(), userVerification: "required",
        allowCredentials: credentials.map((item) => ({ id: item.CredentialId, transports: json(item.TransportsJson, []) })),
      });
      const transactionId = await createChallenge({
        userId: req.user.id, sessionId: req.session.SessionId, operation: "step_up",
        challenge: options.challenge, scope: parsed.data.scope,
      });
      return res.json({ ok: true, transactionId, scope: parsed.data.scope, options, fallbackAllowed: true });
    } catch (error) { return next(error); }
  });

  router.post("/step-up/verify", authenticate, requireEnrollment, async (req, res) => {
    try {
      const method = String(req.body?.method || "passkey");
      const scope = String(req.body?.scope || "");
      let assurance = "mfa";
      if (method === "passkey") {
        const challenge = await consumeChallenge(req.body?.transactionId, "step_up", req.session.SessionId);
        if (!challenge || challenge.ScopeName !== scope || Number(challenge.UserId) !== Number(req.user.id)) {
          return res.status(400).json({ ok: false, code: "CHALLENGE_INVALID", error: "Verification request expired" });
        }
        const pool = await getPool();
        const found = await pool.request().input("Id", sql.Int, req.user.id)
          .input("Credential", sql.NVarChar(1024), req.body?.response?.id)
          .query("SELECT * FROM dbo.WebAuthnCredentials WHERE UserId=@Id AND CredentialId=@Credential");
        const credential = found.recordset[0];
        if (!credential) throw new Error("passkey");
        const verification = await verifyAuthenticationResponse({
          response: req.body.response, expectedChallenge: challenge.ChallengeValue,
          expectedOrigin: appOrigins(), expectedRPID: rpId(),
          credential: webAuthnCredential(credential), requireUserVerification: true,
        });
        if (!verification.verified || !verification.authenticationInfo.userVerified) throw new Error("passkey");
        await pool.request().input("Credential", sql.NVarChar(1024), credential.CredentialId)
          .input("Counter", sql.BigInt, verification.authenticationInfo.newCounter)
          .query("UPDATE dbo.WebAuthnCredentials SET Counter=@Counter,LastUsedAt=SYSUTCDATETIME() WHERE CredentialId=@Credential");
        assurance = "phishing_resistant";
      } else if (method === "password_totp") {
        const pool = await getPool();
        const result = await pool.request().input("Id", sql.Int, req.user.id)
          .query("SELECT * FROM dbo.AppUsers WHERE UserId=@Id");
        const row = result.recordset[0];
        if (!await verifyPassword(row.PasswordHash, req.body?.password) ||
          !await consumeSecondFactor(row.UserId, row.TotpSecretEncrypted, req.body?.code)) {
          throw new Error("fallback");
        }
      } else {
        return res.status(400).json({ ok: false, code: "VALIDATION_ERROR", error: "Unsupported verification method" });
      }
      if (!scope || scope.length > 150) return res.status(400).json({ ok: false, code: "VALIDATION_ERROR", error: "Invalid action scope" });
      const pool = await getPool();
      const userRow = (await pool.request().input("Id", sql.Int, req.user.id)
        .query(`SELECT u.*,(SELECT COUNT(*) FROM dbo.WebAuthnCredentials c WHERE c.UserId=u.UserId) AS PasskeyCount FROM dbo.AppUsers u WHERE u.UserId=@Id`)).recordset[0];
      const scopes = { ...json(req.session.StepUpScopesJson), [scope]: addMinutes(new Date(), 5).toISOString() };
      await rotateSession(req, res, userRow, {
        method: assurance === "phishing_resistant" ? "passkey_step_up" : "password_totp_step_up",
        assurance, enrollmentOnly: false, stepUpScopes: scopes,
      });
      await writeAudit(req, { action: "session.step_up", targetType: "session", targetId: req.session.SessionId, after: { scope, assurance } });
      return res.json({ ok: true, scope, assuranceLevel: assurance, expiresInSeconds: 300 });
    } catch {
      return res.status(401).json({ ok: false, code: "INVALID_CREDENTIALS", error: "Unable to verify your identity" });
    }
  });

  router.get("/sessions", authenticate, requireEnrollment, async (req, res, next) => {
    try {
      const result = await (await getPool()).request().input("Id", sql.Int, req.user.id).query(`
        SELECT SessionId AS id,IpAddress AS ipAddress,UserAgent AS userAgent,DeviceId AS deviceId,
          AuthenticationMethod AS authenticationMethod,AssuranceLevel AS assuranceLevel,
          CreatedAt AS createdAt,LastSeenAt AS lastSeenAt,AbsoluteExpiresAt AS expiresAt
        FROM dbo.AppSessions WHERE UserId=@Id AND RevokedAt IS NULL AND AbsoluteExpiresAt>SYSUTCDATETIME()
        ORDER BY LastSeenAt DESC`);
      return res.json({ ok: true, sessions: result.recordset.map((item) => ({
        ...item, currentSession: String(item.id) === String(req.session.SessionId),
      })) });
    } catch (error) { return next(error); }
  });
  router.delete("/sessions/:id", authenticate, requireEnrollment, requireStepUp("security.sessions"), async (req, res, next) => {
    try {
      await (await getPool()).request().input("Sid", sql.UniqueIdentifier, req.params.id)
        .input("Id", sql.Int, req.user.id)
        .query("UPDATE dbo.AppSessions SET RevokedAt=SYSUTCDATETIME(),RevokeReason=N'User revoked' WHERE SessionId=@Sid AND UserId=@Id");
      if (String(req.params.id) === String(req.session.SessionId)) clearSessionCookies(res);
      await writeAudit(req, { action: "session.revoke", targetType: "session", targetId: req.params.id });
      return res.json({ ok: true });
    } catch (error) { return next(error); }
  });
  router.post("/sessions/revoke-all", authenticate, requireEnrollment, requireStepUp("security.sessions"), async (req, res, next) => {
    try {
      await (await getPool()).request().input("Id", sql.Int, req.user.id)
        .query("UPDATE dbo.AppSessions SET RevokedAt=SYSUTCDATETIME(),RevokeReason=N'User revoked all' WHERE UserId=@Id AND RevokedAt IS NULL");
      clearSessionCookies(res);
      await writeAudit(req, { action: "session.revoke_all", targetType: "user", targetId: req.user.id });
      return res.json({ ok: true });
    } catch (error) { return next(error); }
  });

  router.post("/totp/setup", authenticate, async (req, res, next) => {
    try {
      if (req.user.twoFactorEnabled && !hasStepUpScope(req.session, "security.mfa")) {
        return res.status(403).json({ ok: false, code: "STEP_UP_REQUIRED", scope: "security.mfa", error: "Verify with your passkey to continue" });
      }
      const secret = generateSecret();
      const uri = generateURI({ issuer: rpName(), label: req.user.email, secret });
      await (await getPool()).request().input("Id", sql.Int, req.user.id)
        .input("Secret", sql.NVarChar(1000), encrypt(secret))
        .query("UPDATE dbo.AppUsers SET TotpSecretEncrypted=@Secret,TotpEnabled=0 WHERE UserId=@Id");
      return res.json({ ok: true, secret, qrCode: await QRCode.toDataURL(uri) });
    } catch (error) { return next(error); }
  });
  router.post("/totp/confirm", authenticate, async (req, res, next) => {
    const pool = await getPool();
    try {
      const row = (await pool.request().input("Id", sql.Int, req.user.id)
        .query(`SELECT u.*,(SELECT COUNT(*) FROM dbo.WebAuthnCredentials c WHERE c.UserId=u.UserId) AS PasskeyCount FROM dbo.AppUsers u WHERE u.UserId=@Id`)).recordset[0];
      const result = row?.TotpSecretEncrypted &&
        await verifyTotp({ secret: decrypt(row.TotpSecretEncrypted), token: String(req.body?.code || "") });
      if (!result?.valid) return res.status(400).json({ ok: false, code: "INVALID_TOTP", error: "Authenticator code is invalid" });
      const codes = Array.from({ length: 10 }, () => randomToken(9).toUpperCase());
      const transaction = pool.transaction();
      await transaction.begin();
      try {
        await new sql.Request(transaction).input("Id", sql.Int, req.user.id)
          .query("UPDATE dbo.AppUsers SET TotpEnabled=1,UpdatedAt=SYSUTCDATETIME() WHERE UserId=@Id; DELETE dbo.TotpRecoveryCodes WHERE UserId=@Id");
        for (const code of codes) {
          await new sql.Request(transaction).input("Id", sql.Int, req.user.id).input("Hash", sql.Char(64), sha256(code.replace(/-/g, "")))
            .query("INSERT dbo.TotpRecoveryCodes(UserId,CodeHash) VALUES(@Id,@Hash)");
        }
        await transaction.commit();
      } catch (error) { await transaction.rollback(); throw error; }
      const completed = Number(row.PasskeyCount) > 0;
      await rotateSession(req, res, { ...row, TotpEnabled: true }, {
        method: req.session.AuthenticationMethod, assurance: completed ? "mfa" : req.session.AssuranceLevel,
        enrollmentOnly: !completed,
      });
      await writeAudit(req, { action: "totp.enable", targetType: "user", targetId: req.user.id });
      return res.json({ ok: true, enrollmentComplete: completed, recoveryCodes: codes });
    } catch (error) { return next(error); }
  });

  router.post("/recovery-codes/regenerate", authenticate, requireEnrollment, requireStepUp("security.recovery"), async (req, res, next) => {
    const pool = await getPool();
    const transaction = pool.transaction();
    try {
      const codes = Array.from({ length: 10 }, () => randomToken(9).toUpperCase());
      await transaction.begin();
      await new sql.Request(transaction).input("Id", sql.Int, req.user.id)
        .query("DELETE dbo.TotpRecoveryCodes WHERE UserId=@Id");
      for (const code of codes) {
        await new sql.Request(transaction).input("Id", sql.Int, req.user.id)
          .input("Hash", sql.Char(64), sha256(code.replace(/-/g, "")))
          .query("INSERT dbo.TotpRecoveryCodes(UserId,CodeHash) VALUES(@Id,@Hash)");
      }
      await transaction.commit();
      await writeAudit(req, { action: "recovery_codes.regenerate", targetType: "user", targetId: req.user.id });
      await sendSecurityAlert(req.user.email, "Your recovery codes were regenerated", req);
      return res.json({ ok: true, recoveryCodes: codes });
    } catch (error) {
      try { await transaction.rollback(); } catch { /* noop */ }
      return next(error);
    }
  });

  router.post("/password", authenticate, requireEnrollment, requireStepUp("security.password"), async (req, res, next) => {
    try {
      const error = await validateNewPassword(req.body?.newPassword);
      if (error) return res.status(400).json({ ok: false, code: "PASSWORD_POLICY", error });
      const pool = await getPool();
      const row = (await pool.request().input("Id", sql.Int, req.user.id)
        .query("SELECT PasswordHash FROM dbo.AppUsers WHERE UserId=@Id")).recordset[0];
      if (!await verifyPassword(row?.PasswordHash, req.body?.currentPassword)) {
        return res.status(400).json({ ok: false, error: "Unable to change password" });
      }
      const hash = await argon2.hash(String(req.body.newPassword), { type: argon2.argon2id });
      await pool.request().input("Id", sql.Int, req.user.id).input("Hash", sql.NVarChar(255), hash)
        .query(`UPDATE dbo.AppUsers SET PasswordHash=@Hash,PasswordChangedAt=SYSUTCDATETIME(),UpdatedAt=SYSUTCDATETIME() WHERE UserId=@Id;
          UPDATE dbo.AppSessions SET RevokedAt=SYSUTCDATETIME(),RevokeReason=N'Password changed' WHERE UserId=@Id`);
      clearSessionCookies(res);
      await writeAudit(req, { action: "password.change", targetType: "user", targetId: req.user.id });
      await sendSecurityAlert(req.user.email, "Your BE Inventory password was changed", req);
      return res.json({ ok: true });
    } catch (error) { return next(error); }
  });

  router.post("/password-reset/request", resetLimiter, async (req, res, next) => {
    try {
      const email = cleanEmail(req.body?.email);
      const pool = await getPool();
      const recent = await pool.request().input("Email", sql.NVarChar(320), email)
        .query("SELECT COUNT(*) AS count FROM dbo.AuthTokens WHERE Email=@Email AND TokenType=N'Reset' AND CreatedAt>DATEADD(HOUR,-1,SYSUTCDATETIME())");
      const user = await pool.request().input("Email", sql.NVarChar(320), email)
        .query("SELECT UserId FROM dbo.AppUsers WHERE Email=@Email AND IsActive=1");
      if (user.recordset[0] && Number(recent.recordset[0].count) < 3) {
        const token = randomToken(32);
        await pool.request().input("Id", sql.Int, user.recordset[0].UserId)
          .input("Email", sql.NVarChar(320), email).input("Hash", sql.Char(64), sha256(token))
          .input("Expires", sql.DateTime2, addMinutes(new Date(), 60))
          .query("INSERT dbo.AuthTokens(UserId,Email,TokenType,TokenHash,ExpiresAt) VALUES(@Id,@Email,N'Reset',@Hash,@Expires)");
        await sendTokenEmail({ to: email, subject: "Reset your password", path: "/reset-password", token });
      }
      return res.json({ ok: true, message: "If the account exists, reset instructions have been sent" });
    } catch (error) { return next(error); }
  });

  router.post("/password-reset/confirm", async (req, res, next) => {
    const pool = await getPool();
    const transaction = pool.transaction();
    try {
      const error = await validateNewPassword(req.body?.password);
      if (error) return res.status(400).json({ ok: false, code: "PASSWORD_POLICY", error });
      await transaction.begin();
      const found = await new sql.Request(transaction).input("Hash", sql.Char(64), sha256(req.body?.token))
        .query("SELECT TOP 1 * FROM dbo.AuthTokens WITH(UPDLOCK,HOLDLOCK) WHERE TokenHash=@Hash AND TokenType=N'Reset' AND UsedAt IS NULL AND ExpiresAt>SYSUTCDATETIME()");
      const token = found.recordset[0];
      if (!token) { await transaction.rollback(); return res.status(400).json({ ok: false, error: "Reset link is invalid or expired" }); }
      const hash = await argon2.hash(String(req.body.password), { type: argon2.argon2id });
      await new sql.Request(transaction).input("Id", sql.Int, token.UserId).input("Hash", sql.NVarChar(255), hash)
        .input("TokenId", sql.BigInt, token.AuthTokenId).query(`
          UPDATE dbo.AppUsers SET PasswordHash=@Hash,PasswordChangedAt=SYSUTCDATETIME() WHERE UserId=@Id;
          UPDATE dbo.AuthTokens SET UsedAt=SYSUTCDATETIME() WHERE AuthTokenId=@TokenId;
          UPDATE dbo.AppSessions SET RevokedAt=SYSUTCDATETIME(),RevokeReason=N'Password reset' WHERE UserId=@Id`);
      await transaction.commit();
      return res.json({ ok: true, code: "RECOVERY_REQUIRED" });
    } catch (error) {
      try { await transaction.rollback(); } catch { /* noop */ }
      return next(error);
    }
  });

  router.post("/invitations/accept", async (req, res, next) => {
    const pool = await getPool();
    const transaction = pool.transaction();
    try {
      const error = await validateNewPassword(req.body?.password);
      if (error) return res.status(400).json({ ok: false, code: "PASSWORD_POLICY", error });
      await transaction.begin();
      const found = await new sql.Request(transaction).input("Hash", sql.Char(64), sha256(req.body?.token))
        .query("SELECT TOP 1 * FROM dbo.AuthTokens WITH(UPDLOCK,HOLDLOCK) WHERE TokenHash=@Hash AND TokenType=N'Invite' AND UsedAt IS NULL AND ExpiresAt>SYSUTCDATETIME()");
      const token = found.recordset[0];
      if (!token) { await transaction.rollback(); return res.status(400).json({ ok: false, error: "Invitation is invalid or expired" }); }
      const hash = await argon2.hash(String(req.body.password), { type: argon2.argon2id });
      await new sql.Request(transaction).input("Id", sql.Int, token.UserId)
        .input("Hash", sql.NVarChar(255), hash).input("TokenId", sql.BigInt, token.AuthTokenId)
        .query(`UPDATE dbo.AppUsers SET PasswordHash=@Hash,IsActive=1,AccountStatus=N'Active',PasswordChangedAt=SYSUTCDATETIME(),UpdatedAt=SYSUTCDATETIME() WHERE UserId=@Id;
          UPDATE dbo.AuthTokens SET UsedAt=SYSUTCDATETIME() WHERE AuthTokenId=@TokenId`);
      await transaction.commit();
      return res.json({ ok: true, code: "ENROLLMENT_REQUIRED" });
    } catch (error) {
      try { await transaction.rollback(); } catch { /* noop */ }
      return next(error);
    }
  });

  return router;
};

export const parseStoredJson = json;
export const passwordPolicyError = structuralPasswordError;
