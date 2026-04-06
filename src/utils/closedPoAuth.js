const normalizeRole = (value) => String(value ?? "").trim().toLowerCase();

export const isAdminRole = (settings) =>
  normalizeRole(settings?.profile?.role) === "admin";

export const hasClosedPoAdminPassword = (settings) =>
  Boolean(String(settings?.security?.closedPoAdminPassword ?? "").trim());

export const verifyClosedPoAdminPassword = (settings, password) =>
  isAdminRole(settings) &&
  String(settings?.security?.closedPoAdminPassword ?? "") ===
    String(password ?? "");

export const getClosedPoAuthError = (settings, password) => {
  if (!isAdminRole(settings)) {
    return "Only Admin users can unlock a closed purchase order.";
  }
  if (!hasClosedPoAdminPassword(settings)) {
    return "Set the closed PO admin password in Settings before unlocking closed orders.";
  }
  if (!verifyClosedPoAdminPassword(settings, password)) {
    return "Incorrect admin password.";
  }
  return "";
};
