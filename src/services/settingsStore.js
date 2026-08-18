import {
  getMigrationState,
  loadSettingsFromApis,
  saveAppearance,
  saveNotifications,
  saveWorkspaceSetting,
} from "./settingsApi";

export const DEFAULT_SETTINGS = {
  profile: { fullName: "", email: "", phone: "", role: "", avatar: "", jobTitle: "", department: "" },
  company: { name: "BANGALORE ELECTRONICS", email: "", phone: "", address: "", city: "", state: "", pincode: "", gstin: "" },
  preferences: { currency: "INR", dateFormat: "DD/MM/YYYY", timeZone: "Asia/Kolkata", language: "English", theme: "Light" },
  inventory: { defaultUnit: "PCS", lowStockThreshold: 5, reorderLevel: 10, valuationMethod: "FIFO", allowNegativeStock: false, autoReorder: false, trackBatch: false },
  notifications: { email: true, sms: false, lowStock: true, weeklySummary: false, projectUpdates: true },
  security: { inactivityTimeoutMinutes: 30, passwordExpiryDays: 90, failedLoginLimit: 5, accountLockMinutes: 15, requireStrongPassword: true },
};

let memorySettings = structuredClone(DEFAULT_SETTINGS);
const emit = () => {
  if (typeof window !== "undefined") window.dispatchEvent(new Event("settings:changed"));
};
export const getSettings = () => structuredClone(memorySettings);
export const hydrateSettings = async () => {
  const data = await loadSettingsFromApis();
  if (typeof window !== "undefined" && data.capabilities?.manageWorkspace) {
    const legacyRaw = window.localStorage.getItem("appSettings");
    if (legacyRaw) {
      try {
        const legacy = JSON.parse(legacyRaw);
        const persistence = await getMigrationState();
        if (!persistence.organization && legacy.company) data.workspace.organization = await saveWorkspaceSetting("organization", legacy.company);
        if (!persistence.inventory && legacy.inventory) data.workspace.inventory = await saveWorkspaceSetting("inventory", legacy.inventory);
        if (!persistence.preferences && legacy.preferences) data.appearance = await saveAppearance(legacy.preferences);
        if (!persistence.preferences && legacy.notifications) data.notifications = await saveNotifications(legacy.notifications);
        window.localStorage.removeItem("appSettings");
      } catch {
        // Leave the legacy record intact so a later authenticated load can retry safely.
      }
    }
  }
  memorySettings = {
    profile: { ...DEFAULT_SETTINGS.profile, ...data.profile, fullName: data.profile?.name || "" },
    company: { ...DEFAULT_SETTINGS.company, ...(data.workspace?.organization || {}) },
    preferences: { ...DEFAULT_SETTINGS.preferences, ...(data.appearance || {}) },
    inventory: { ...DEFAULT_SETTINGS.inventory, ...(data.workspace?.inventory || {}) },
    notifications: { ...DEFAULT_SETTINGS.notifications, ...(data.notifications || {}) },
    security: { ...DEFAULT_SETTINGS.security, ...(data.workspace?.security || {}) },
  };
  emit();
  return getSettings();
};
export const saveSettings = (settings) => { memorySettings = structuredClone(settings); emit(); return getSettings(); };
export const resetSettings = () => { memorySettings = structuredClone(DEFAULT_SETTINGS); emit(); return getSettings(); };
