import bcrypt from "bcryptjs";
import { Buffer } from "node:buffer";
import crypto from "crypto";
import express from "express";
import { getPool, sql } from "./config/db.js";
import {
  ROLE_NAMES,
  ROLE_PERMISSIONS,
  authenticate,
  hasPermission,
  permissionsForRole,
  publicUser,
  requireEnrollment,
  requirePermission,
  requireStepUp,
  sendSecurityAlert,
  sendTokenEmail,
  writeAudit,
} from "./auth.js";

const routerJson = (value, fallback = {}) => {
  try { return value ? JSON.parse(value) : fallback; } catch { return fallback; }
};
const tokenHash = (value) => crypto.createHash("sha256").update(String(value)).digest("hex");
const defaults = {
  organization: { name: "BE Inventory", email: "", phone: "", address: "", city: "", state: "", pincode: "", gstin: "" },
  inventory: { defaultUnit: "PCS", lowStockThreshold: 5, reorderLevel: 10, valuationMethod: "FIFO", allowNegativeStock: false, autoReorder: false, trackBatch: false },
  security: { inactivityTimeoutMinutes: 30, passwordExpiryDays: 90, failedLoginLimit: 5, accountLockMinutes: 15, requireStrongPassword: true },
  notifications: { email: true, sms: false, lowStock: true, weeklySummary: false, projectUpdates: true },
  appearance: { theme: "Light", language: "English", dateFormat: "DD/MM/YYYY", timeZone: "Asia/Kolkata", currency: "INR" },
};
const safeRole = (value) => ROLE_NAMES.includes(value) ? value : "Project User";

const getWorkspaceSetting = async (key) => {
  const pool = await getPool();
  const result = await pool.request().input("Key", sql.NVarChar(80), key).query("SELECT SettingJson FROM dbo.WorkspaceSettings WHERE SettingKey=@Key");
  return { ...defaults[key], ...routerJson(result.recordset[0]?.SettingJson) };
};
const setWorkspaceSetting = async (key, value, userId) => {
  const pool = await getPool();
  await pool.request().input("Key", sql.NVarChar(80), key).input("Json", sql.NVarChar(sql.MAX), JSON.stringify(value))
    .input("UserId", sql.Int, userId).query(`
      MERGE dbo.WorkspaceSettings AS target USING(SELECT @Key AS SettingKey) AS source ON target.SettingKey=source.SettingKey
      WHEN MATCHED THEN UPDATE SET SettingJson=@Json,UpdatedBy=@UserId,UpdatedAt=SYSUTCDATETIME()
      WHEN NOT MATCHED THEN INSERT(SettingKey,SettingJson,UpdatedBy) VALUES(@Key,@Json,@UserId);
    `);
  return getWorkspaceSetting(key);
};

const loadUser = async (id) => {
  const pool = await getPool();
  const result = await pool.request().input("Id", sql.Int, id).query("SELECT * FROM dbo.AppUsers WHERE UserId=@Id");
  return result.recordset[0];
};
const canManageTarget = (actor, target, nextRole = target?.RoleName) => {
  if (!target) return false;
  if (target.RoleName === "Super Admin") return actor.role === "Super Admin" && Number(actor.id) !== Number(target.UserId);
  if (nextRole === "Super Admin") return actor.role === "Super Admin";
  return hasPermission(actor, "users.manage");
};

export const createSettingsAdminRouter = () => {
  const router = express.Router();
  router.use(authenticate);
  router.use(requireEnrollment);

  router.get("/migration-state", requirePermission("workspace.manage"), async (req, res, next) => {
    try {
      const pool = await getPool();
      const pref = await pool.request().input("Id", sql.Int, req.user.id).query("SELECT NotificationsJson,AppearanceJson FROM dbo.UserPreferences WHERE UserId=@Id");
      const settingKeys = await pool.request().query("SELECT SettingKey FROM dbo.WorkspaceSettings WHERE SettingKey IN (N'organization',N'inventory',N'security')");
      const existingKeys = new Set(settingKeys.recordset.map((row) => row.SettingKey));
      return res.json({
        ok: true,
        persistence: {
          organization: existingKeys.has("organization"),
          inventory: existingKeys.has("inventory"),
          security: existingKeys.has("security"),
          preferences: Boolean(pref.recordset[0]),
        },
      });
    } catch (error) { return next(error); }
  });

  router.get("/profile", async (req, res, next) => {
    try { return res.json({ ok: true, profile: publicUser(await loadUser(req.user.id)) }); }
    catch (error) { return next(error); }
  });
  router.put("/profile", async (req, res, next) => {
    try {
      const before = await loadUser(req.user.id);
      const name = String(req.body?.name || "").trim(), phone = String(req.body?.phone || "").trim();
      const jobTitle = String(req.body?.jobTitle || "").trim(), department = String(req.body?.department || "").trim();
      const avatarMatch = String(req.body?.avatar || "").match(/^data:(image\/(?:png|jpeg|webp));base64,(.+)$/);
      const avatarData = avatarMatch ? Buffer.from(avatarMatch[2], "base64") : null;
      if (avatarData?.length > 2 * 1024 * 1024) return res.status(413).json({ ok: false, error: "Avatar must be 2 MB or smaller" });
      if (!name) return res.status(400).json({ ok: false, error: "Name is required", field: "name" });
      const pool = await getPool();
      const result = await pool.request().input("Id", sql.Int, req.user.id).input("Name", sql.NVarChar(200), name)
        .input("Phone", sql.NVarChar(40), phone).input("Job", sql.NVarChar(150), jobTitle).input("Department", sql.NVarChar(150), department)
        .input("AvatarType", sql.NVarChar(100), avatarMatch?.[1] || null).input("AvatarData", sql.VarBinary(sql.MAX), avatarData)
        .query("UPDATE dbo.AppUsers SET FullName=@Name,Phone=@Phone,JobTitle=@Job,Department=@Department,AvatarContentType=CASE WHEN @AvatarData IS NULL THEN AvatarContentType ELSE @AvatarType END,AvatarData=COALESCE(@AvatarData,AvatarData),UpdatedAt=SYSUTCDATETIME() OUTPUT INSERTED.* WHERE UserId=@Id");
      const profile = publicUser(result.recordset[0]); await writeAudit(req, { action: "profile.update", targetType: "user", targetId: req.user.id, before: publicUser(before), after: profile });
      return res.json({ ok: true, profile });
    } catch (error) { return next(error); }
  });

  router.get("/profile/avatar", async (req, res, next) => {
    try {
      const pool = await getPool(); const result = await pool.request().input("Id", sql.Int, req.user.id).query("SELECT AvatarContentType,AvatarData FROM dbo.AppUsers WHERE UserId=@Id");
      const avatar = result.recordset[0]; if (!avatar?.AvatarData) return res.status(404).end();
      return res.type(avatar.AvatarContentType || "image/png").set("Cache-Control", "private, max-age=300").send(avatar.AvatarData);
    } catch (error) { return next(error); }
  });

  for (const key of ["notifications", "appearance"]) {
    router.get(`/${key}`, async (req, res, next) => {
      try {
        const pool = await getPool(); const column = key === "notifications" ? "NotificationsJson" : "AppearanceJson";
        const result = await pool.request().input("Id", sql.Int, req.user.id).query(`SELECT ${column} AS ValueJson FROM dbo.UserPreferences WHERE UserId=@Id`);
        return res.json({ ok: true, [key]: { ...defaults[key], ...routerJson(result.recordset[0]?.ValueJson) } });
      } catch (error) { return next(error); }
    });
    router.put(`/${key}`, async (req, res, next) => {
      try {
        const pool = await getPool(), value = { ...defaults[key], ...(req.body || {}) };
        const column = key === "notifications" ? "NotificationsJson" : "AppearanceJson";
        const other = key === "notifications" ? "AppearanceJson" : "NotificationsJson";
        await pool.request().input("Id", sql.Int, req.user.id).input("Json", sql.NVarChar(sql.MAX), JSON.stringify(value)).query(`
          MERGE dbo.UserPreferences AS target USING(SELECT @Id AS UserId) AS source ON target.UserId=source.UserId
          WHEN MATCHED THEN UPDATE SET ${column}=@Json,UpdatedAt=SYSUTCDATETIME()
          WHEN NOT MATCHED THEN INSERT(UserId,${column},${other}) VALUES(@Id,@Json,N'{}');
        `);
        await writeAudit(req, { action: `${key}.update`, targetType: "user", targetId: req.user.id, after: value });
        return res.json({ ok: true, [key]: value });
      } catch (error) { return next(error); }
    });
  }

  for (const key of ["organization", "inventory", "security"]) {
    const readPermission = key === "organization"
      ? (_req, _res, next) => next()
      : requirePermission("workspace.manage");
    router.get(`/workspace/${key}`, readPermission, async (_req, res, next) => {
      try { return res.json({ ok: true, [key]: await getWorkspaceSetting(key) }); } catch (error) { return next(error); }
    });
    const writeMiddleware = [
      requirePermission(key === "security" ? "security.manage" : "workspace.manage"),
      requireStepUp(key === "security" ? "settings.security" : `settings.${key}`),
    ];
    router.put(`/workspace/${key}`, ...writeMiddleware, async (req, res, next) => {
      try {
        const before = await getWorkspaceSetting(key), nextValue = { ...defaults[key], ...(req.body || {}) };
        if (key === "security") {
          nextValue.inactivityTimeoutMinutes = Math.min(480, Math.max(5, Number(nextValue.inactivityTimeoutMinutes) || 30));
          nextValue.failedLoginLimit = Math.min(10, Math.max(3, Number(nextValue.failedLoginLimit) || 5));
        }
        const saved = await setWorkspaceSetting(key, nextValue, req.user.id);
        await writeAudit(req, { action: `workspace.${key}.update`, targetType: "workspace-setting", targetId: key, before, after: saved });
        return res.json({ ok: true, [key]: saved });
      } catch (error) { return next(error); }
    });
  }

  router.get("/roles", async (_req, res) => res.json({ ok: true, roles: ROLE_NAMES.map((name) => ({ name, permissions: permissionsForRole(name) })) }));

  router.get("/users", requirePermission("users.manage"), async (req, res, next) => {
    try {
      const pool = await getPool(), search = String(req.query.search || "").trim(), status = String(req.query.status || "").trim();
      const result = await pool.request().input("Search", sql.NVarChar(200), search).input("Status", sql.NVarChar(30), status).query(`
        SELECT UserId,FullName,Email,Phone,Department,JobTitle,RoleName,AccountStatus,IsActive,TotpEnabled,LastLoginAt,CreatedAt
        FROM dbo.AppUsers WHERE (@Search=N'' OR FullName LIKE N'%'+@Search+N'%' OR Email LIKE N'%'+@Search+N'%')
          AND (@Status=N'' OR AccountStatus=@Status) ORDER BY FullName
      `);
      const users = result.recordset.filter((row) => req.user.role === "Super Admin" || row.RoleName !== "Super Admin").map(publicUser);
      return res.json({ ok: true, users });
    } catch (error) { return next(error); }
  });

  router.post("/users/invite", requirePermission("users.manage"), requireStepUp("users.manage"), async (req, res, next) => {
    try {
      const email = String(req.body?.email || "").trim().toLowerCase(), name = String(req.body?.name || "").trim();
      const role = safeRole(req.body?.role);
      if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ ok: false, error: "Name and a valid email are required" });
      if (role === "Super Admin" && req.user.role !== "Super Admin") return res.status(403).json({ ok: false, error: "Only a Super Admin may assign this role" });
      const pool = await getPool(), temporaryHash = await bcrypt.hash(crypto.randomBytes(32).toString("hex"), 12);
      const inserted = await pool.request().input("Name", sql.NVarChar(200), name).input("Email", sql.NVarChar(320), email)
        .input("Hash", sql.NVarChar(255), temporaryHash).input("Role", sql.NVarChar(50), role)
        .input("Department", sql.NVarChar(150), String(req.body?.department || "")).input("Job", sql.NVarChar(150), String(req.body?.jobTitle || ""))
        .query("INSERT dbo.AppUsers(FullName,Email,PasswordHash,RoleName,Department,JobTitle,IsActive,AccountStatus) OUTPUT INSERTED.* VALUES(@Name,@Email,@Hash,@Role,@Department,@Job,0,N'Invited')");
      const user = inserted.recordset[0], token = crypto.randomBytes(32).toString("base64url");
      await pool.request().input("Id", sql.Int, user.UserId).input("Email", sql.NVarChar(320), email).input("Hash", sql.Char(64), tokenHash(token))
        .input("By", sql.Int, req.user.id).query("INSERT dbo.AuthTokens(UserId,Email,TokenType,TokenHash,ExpiresAt,CreatedBy) VALUES(@Id,@Email,N'Invite',@Hash,DATEADD(HOUR,1,SYSUTCDATETIME()),@By)");
      await sendTokenEmail({ to: email, subject: "Accept your BE Inventory invitation", path: "/create-account", token });
      await writeAudit(req, { action: "user.invite", targetType: "user", targetId: user.UserId, after: publicUser(user) });
      return res.status(201).json({ ok: true, user: publicUser(user) });
    } catch (error) {
      if ([2601, 2627].includes(error?.number)) return res.status(409).json({ ok: false, error: "An account already exists for this email" });
      return next(error);
    }
  });

  router.patch("/users/:id", requirePermission("users.manage"), requireStepUp("users.manage"), async (req, res, next) => {
    try {
      const target = await loadUser(Number(req.params.id)); if (!target) return res.status(404).json({ ok: false, error: "User not found" });
      const role = safeRole(req.body?.role || target.RoleName);
      if (!canManageTarget(req.user, target, role)) return res.status(403).json({ ok: false, error: "Only another Super Admin may manage this account or role" });
      const status = ["Active", "Inactive"].includes(req.body?.status) ? req.body.status : target.AccountStatus;
      const pool = await getPool();
      const result = await pool.request().input("Id", sql.Int, target.UserId).input("Name", sql.NVarChar(200), String(req.body?.name || target.FullName).trim())
        .input("Role", sql.NVarChar(50), role).input("Status", sql.NVarChar(30), status).input("Department", sql.NVarChar(150), String(req.body?.department ?? target.Department ?? ""))
        .input("Job", sql.NVarChar(150), String(req.body?.jobTitle ?? target.JobTitle ?? ""))
        .query("UPDATE dbo.AppUsers SET FullName=@Name,RoleName=@Role,AccountStatus=@Status,IsActive=CASE WHEN @Status=N'Active' THEN 1 ELSE 0 END,Department=@Department,JobTitle=@Job,UpdatedAt=SYSUTCDATETIME() OUTPUT INSERTED.* WHERE UserId=@Id");
      if (status !== "Active" || role !== target.RoleName) {
        await pool.request().input("Id", sql.Int, target.UserId)
          .input("Reason", sql.NVarChar(200), status !== "Active" ? "Account deactivated" : "Role changed")
          .query("UPDATE dbo.AppSessions SET RevokedAt=SYSUTCDATETIME(),RevokeReason=@Reason WHERE UserId=@Id AND RevokedAt IS NULL");
      }
      const user = publicUser(result.recordset[0]); await writeAudit(req, { action: "user.update", targetType: "user", targetId: target.UserId, before: publicUser(target), after: user });
      if (role !== target.RoleName || status !== target.AccountStatus) {
        await sendSecurityAlert(target.Email, "An administrator changed your BE Inventory account", req);
      }
      return res.json({ ok: true, user });
    } catch (error) { return next(error); }
  });

  router.post("/users/:id/revoke-sessions", requirePermission("users.manage"), requireStepUp("users.manage"), async (req, res, next) => {
    try {
      const target = await loadUser(Number(req.params.id)); if (!canManageTarget(req.user, target)) return res.status(403).json({ ok: false, error: "You cannot manage this account" });
      const pool = await getPool(); await pool.request().input("Id", sql.Int, target.UserId).query("UPDATE dbo.AppSessions SET RevokedAt=SYSUTCDATETIME(),RevokeReason=N'Administrator revoked' WHERE UserId=@Id AND RevokedAt IS NULL");
      await writeAudit(req, { action: "user.sessions.revoke", targetType: "user", targetId: target.UserId }); return res.json({ ok: true });
    } catch (error) { return next(error); }
  });

  router.post("/users/:id/password-reset", requirePermission("users.manage"), requireStepUp("users.manage"), async (req, res, next) => {
    try {
      const target = await loadUser(Number(req.params.id));
      if (!canManageTarget(req.user, target)) return res.status(403).json({ ok: false, error: "You cannot manage this account" });
      const reason = String(req.body?.reason || "").trim();
      if (reason.length < 10 || reason.length > 500) {
        return res.status(400).json({ ok: false, code: "RECOVERY_REASON_REQUIRED", error: "Enter a recovery reason of at least 10 characters" });
      }
      const token = crypto.randomBytes(32).toString("base64url"), pool = await getPool();
      await pool.request().input("Id", sql.Int, target.UserId).input("Email", sql.NVarChar(320), target.Email)
        .input("Hash", sql.Char(64), tokenHash(token)).input("By", sql.Int, req.user.id)
        .query("INSERT dbo.AuthTokens(UserId,Email,TokenType,TokenHash,ExpiresAt,CreatedBy) VALUES(@Id,@Email,N'Reset',@Hash,DATEADD(HOUR,1,SYSUTCDATETIME()),@By); UPDATE dbo.AppSessions SET RevokedAt=SYSUTCDATETIME(),RevokeReason=N'Administrative password reset' WHERE UserId=@Id AND RevokedAt IS NULL");
      await sendTokenEmail({ to: target.Email, subject: "Reset your BE Inventory password", path: "/reset-password", token });
      await writeAudit(req, { action: "user.password_reset", targetType: "user", targetId: target.UserId, after: { reason } });
      return res.json({ ok: true });
    } catch (error) { return next(error); }
  });

  router.get("/audit", requirePermission("audit.view"), async (req, res, next) => {
    try {
      const page = Math.max(1, Number(req.query.page) || 1), pageSize = Math.min(100, Math.max(10, Number(req.query.pageSize) || 25));
      const action = String(req.query.action || "");
      const pool = await getPool(); const result = await pool.request().input("Action", sql.NVarChar(150), action)
        .input("Offset", sql.Int, (page - 1) * pageSize).input("Size", sql.Int, pageSize).query(`
          SELECT a.AuditEventId AS id,a.ActionName AS action,a.TargetType AS targetType,a.TargetId AS targetId,
            a.BeforeJson AS beforeJson,a.AfterJson AS afterJson,a.IpAddress AS ipAddress,a.UserAgent AS userAgent,a.Result AS result,a.CreatedAt AS createdAt,
            u.FullName AS actorName,u.Email AS actorEmail,COUNT(*) OVER() AS total
          FROM dbo.AuditEvents a LEFT JOIN dbo.AppUsers u ON u.UserId=a.ActorUserId
          WHERE (@Action=N'' OR a.ActionName=@Action) ORDER BY a.CreatedAt DESC OFFSET @Offset ROWS FETCH NEXT @Size ROWS ONLY
        `);
      const events = result.recordset.map((row) => ({ ...row, before: routerJson(row.beforeJson, null), after: routerJson(row.afterJson, null), beforeJson: undefined, afterJson: undefined, total: undefined }));
      return res.json({ ok: true, events, page, pageSize, total: result.recordset[0]?.total || 0 });
    } catch (error) { return next(error); }
  });

  router.get("/login-history", async (req, res, next) => {
    try {
      const pool = await getPool();
      const result = await pool.request().input("Id", sql.Int, req.user.id).query("SELECT TOP 50 LoginHistoryId AS id,IpAddress AS ipAddress,UserAgent AS userAgent,Result AS result,Reason AS reason,CreatedAt AS createdAt FROM dbo.LoginHistory WHERE UserId=@Id ORDER BY CreatedAt DESC");
      return res.json({ ok: true, history: result.recordset });
    } catch (error) { return next(error); }
  });

  return router;
};
