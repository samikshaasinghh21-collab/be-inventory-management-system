import api from "./api";
import { startAuthentication } from "@simplewebauthn/browser";
import { registerPasskey } from "./authService";

let stepUpFallbackHandler = null;
export const setStepUpFallbackHandler = (handler) => {
  stepUpFallbackHandler = handler;
  return () => {
    if (stepUpFallbackHandler === handler) stepUpFallbackHandler = null;
  };
};

export const getProfile = async () => (await api.get("/settings/profile")).data.profile;
export const getNotifications = async () => (await api.get("/settings/notifications")).data.notifications;
export const getAppearance = async () => (await api.get("/settings/appearance")).data.appearance;
export const getWorkspaceSetting = async (key) => (await api.get(`/settings/workspace/${key}`)).data[key];
export const getMigrationState = async () => (await api.get("/settings/migration-state")).data.persistence;

const can = (user, permission) =>
  user?.permissions?.includes("*") || user?.permissions?.includes(permission);
const withPasskeyStepUp = async (scope, operation) => {
  try {
    return await operation();
  } catch (error) {
    if (error?.response?.data?.code !== "STEP_UP_REQUIRED") throw error;
    try {
      await stepUpWithPasskey(scope);
    } catch (passkeyError) {
      if (!stepUpFallbackHandler) throw passkeyError;
      await stepUpFallbackHandler(scope);
    }
    return operation();
  }
};

export const loadSettingsFromApis = async () => {
  const [profile, notifications, appearance, organization] = await Promise.all([
    getProfile(),
    getNotifications(),
    getAppearance(),
    getWorkspaceSetting("organization"),
  ]);
  const capabilities = {
    manageWorkspace: can(profile, "workspace.manage"),
    manageUsers: can(profile, "users.manage"),
    viewAudit: can(profile, "audit.view"),
  };
  const [inventory, security] = capabilities.manageWorkspace
    ? await Promise.all([
        getWorkspaceSetting("inventory"),
        getWorkspaceSetting("security"),
      ])
    : [null, null];
  return {
    profile,
    notifications,
    appearance,
    workspace: { organization, inventory, security },
    capabilities,
  };
};
export const saveProfile = async (value) => (await api.put("/settings/profile", value)).data.profile;
export const saveNotifications = async (value) => (await api.put("/settings/notifications", value)).data.notifications;
export const saveAppearance = async (value) => (await api.put("/settings/appearance", value)).data.appearance;
export const saveWorkspaceSetting = async (key, value) =>
  withPasskeyStepUp(key === "security" ? "settings.security" : `settings.${key}`,
    async () => (await api.put(`/settings/workspace/${key}`, value)).data[key]);
export const getUsers = async (params = {}) => (await api.get("/settings/users", { params })).data.users;
export const inviteUser = async (value) => withPasskeyStepUp("users.manage",
  async () => (await api.post("/settings/users/invite", value)).data.user);
export const updateUser = async (id, value) => withPasskeyStepUp("users.manage",
  async () => (await api.patch(`/settings/users/${id}`, value)).data.user);
export const revokeUserSessions = async (id) => withPasskeyStepUp("users.manage",
  () => api.post(`/settings/users/${id}/revoke-sessions`));
export const sendUserPasswordReset = async (id, reason) => withPasskeyStepUp("users.manage",
  () => api.post(`/settings/users/${id}/password-reset`, { reason }));
export const getRoles = async () => (await api.get("/settings/roles")).data.roles;
export const getAuditEvents = async (params = {}) => (await api.get("/settings/audit", { params })).data;
export const getLoginHistory = async () => (await api.get("/settings/login-history")).data.history;
export const getSessions = async () => (await api.get("/auth/sessions")).data.sessions;
export const revokeSession = async (id) => withPasskeyStepUp("security.sessions", () => api.delete(`/auth/sessions/${id}`));
export const revokeAllSessions = async () => withPasskeyStepUp("security.sessions", () => api.post("/auth/sessions/revoke-all"));
export const changePassword = async (value) => withPasskeyStepUp("security.password", () => api.post("/auth/password", value));
export const setupTotp = async () => (await api.post("/auth/totp/setup")).data;
export const confirmTotp = async (code) => (await api.post("/auth/totp/confirm", { code })).data;
export const regenerateRecoveryCodes = async () => withPasskeyStepUp("security.recovery",
  async () => (await api.post("/auth/recovery-codes/regenerate")).data);
export const getPasskeys = async () => (await api.get("/auth/passkeys")).data.passkeys;
export const addPasskey = registerPasskey;
export const removePasskey = async (credentialId) => withPasskeyStepUp("security.passkeys",
  async () => (await api.delete(`/auth/passkeys/${encodeURIComponent(credentialId)}`)).data);
export const stepUpWithPasskey = async (scope) => {
  const { data: request } = await api.post("/auth/step-up/options", { scope });
  const response = await startAuthentication({ optionsJSON: request.options });
  return (await api.post("/auth/step-up/verify", {
    method: "passkey",
    scope,
    transactionId: request.transactionId,
    response,
  })).data;
};
export const stepUpWithPassword = async (scope, password, code) =>
  (await api.post("/auth/step-up/verify", { method: "password_totp", scope, password, code })).data;
export const reauthenticate = async (password, totpCode = "") =>
  stepUpWithPassword("purchase_orders.override_closed", password, totpCode);
