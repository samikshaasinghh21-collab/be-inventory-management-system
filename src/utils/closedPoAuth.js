import { getCurrentUser } from "../services/authService";
import { reauthenticate } from "../services/settingsApi";

export const isAdminRole = () =>
  getCurrentUser()?.permissions?.includes("*") ||
  getCurrentUser()?.permissions?.includes("purchase_orders.override_closed");

export const hasClosedPoAdminPassword = () => false;
export const verifyClosedPoAdminPassword = async (_settings, password, totpCode = "") => {
  try { await reauthenticate(password, totpCode); return true; } catch { return false; }
};
export const getClosedPoAuthError = async (_settings, password, totpCode = "") => {
  if (!isAdminRole()) return "You do not have permission to unlock a locked purchase order.";
  try { await reauthenticate(password, totpCode); return ""; }
  catch (error) { return error.response?.data?.error || "Re-authentication failed."; }
};
