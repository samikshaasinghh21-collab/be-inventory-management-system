const STORAGE_KEY = "appSettings";

export const DEFAULT_SETTINGS = {
  profile: {
    fullName: "",
    email: "",
    phone: "",
    role: "Admin",
  },
  company: {
    name: "",
    email: "",
    phone: "",
    address: "",
    gstin: "",
  },
  preferences: {
    currency: "INR",
    dateFormat: "DD/MM/YYYY",
    timeZone: "Asia/Kolkata",
    language: "English",
    theme: "Light",
  },
  inventory: {
    defaultUnit: "PCS",
    lowStockThreshold: 5,
    reorderLevel: 10,
    valuationMethod: "FIFO",
    allowNegativeStock: false,
    autoReorder: false,
    trackBatch: false,
  },
  notifications: {
    email: true,
    sms: false,
    lowStock: true,
    weeklySummary: false,
    projectUpdates: true,
  },
  security: {
    twoFactor: false,
    sessionTimeout: 30,
    passwordExpiryDays: 90,
    requireStrongPassword: true,
  },
};

const cloneDefaults = () =>
  JSON.parse(JSON.stringify(DEFAULT_SETTINGS));

const isPlainObject = (value) =>
  value && typeof value === "object" && !Array.isArray(value);

const mergeDefaults = (defaults, stored) => {
  if (!isPlainObject(defaults) || !isPlainObject(stored)) {
    return stored ?? defaults;
  }

  const merged = { ...defaults };
  Object.keys(stored).forEach((key) => {
    if (key in defaults) {
      merged[key] = mergeDefaults(defaults[key], stored[key]);
    } else {
      merged[key] = stored[key];
    }
  });
  return merged;
};

const emitChange = () => {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("settings:changed"));
  }
};

export const getSettings = () => {
  if (typeof window === "undefined") {
    return cloneDefaults();
  }

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return cloneDefaults();
    }
    const stored = JSON.parse(raw);
    if (!stored || typeof stored !== "object") {
      return cloneDefaults();
    }
    return mergeDefaults(DEFAULT_SETTINGS, stored);
  } catch {
    return cloneDefaults();
  }
};

export const saveSettings = (settings) => {
  if (typeof window === "undefined") {
    return settings;
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  emitChange();
  return settings;
};

export const resetSettings = () => {
  const defaults = cloneDefaults();
  if (typeof window !== "undefined") {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(defaults));
    emitChange();
  }
  return defaults;
};
