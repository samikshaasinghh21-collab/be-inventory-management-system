import api from "./api";
import { startAuthentication, startRegistration } from "@simplewebauthn/browser";

let currentUser = null;
const emit = () => {
  if (typeof window !== "undefined") window.dispatchEvent(new Event("auth:changed"));
};

export const getCurrentUser = () => currentUser;
export const loadCurrentUser = async () => {
  try {
    const { data } = await api.get("/auth/me");
    currentUser = data.user;
  } catch {
    currentUser = null;
  }
  emit();
  return currentUser;
};
export const login = async (email, password) => {
  const { data } = await api.post("/auth/login", { email, password });
  if (data.user) currentUser = data.user;
  emit();
  return data;
};
export const completePasswordMfa = async ({ transactionId, transactionToken, code }) => {
  const { data } = await api.post("/auth/login/mfa", { transactionId, transactionToken, code });
  currentUser = data.user;
  emit();
  return data;
};
export const loginWithPasskey = async () => {
  const { data: request } = await api.post("/auth/passkeys/authentication/options", {});
  const response = await startAuthentication({ optionsJSON: request.options });
  const { data } = await api.post("/auth/passkeys/authentication/verify", {
    transactionId: request.transactionId,
    response,
  });
  currentUser = data.user;
  emit();
  return data;
};
export const registerPasskey = async (deviceName = "My passkey") => {
  const { data: request } = await api.post("/auth/passkeys/registration/options", { deviceName });
  const response = await startRegistration({ optionsJSON: request.options });
  const { data } = await api.post("/auth/passkeys/registration/verify", {
    transactionId: request.transactionId,
    response,
    deviceName,
  });
  if (data.user) currentUser = data.user;
  emit();
  return data;
};
export const logout = async () => {
  try { await api.post("/auth/logout"); } finally { currentUser = null; emit(); }
};
export const register = async ({ token, password }) => {
  const { data } = await api.post("/auth/invitations/accept", { token, password });
  return data;
};
export const requestPasswordReset = async (email) => (await api.post("/auth/password-reset/request", { email })).data;
export const confirmPasswordReset = async (token, password) => (await api.post("/auth/password-reset/confirm", { token, password })).data;
export const isManager = () =>
  ["Super Admin", "Admin", "Manager"].includes(getCurrentUser()?.role);
