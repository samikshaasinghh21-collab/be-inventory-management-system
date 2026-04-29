const NOTIFICATION_STORAGE_KEY = "inventory_notifications";
const NOTIFICATION_META_KEY = "inventory_notification_meta";

const safeParse = (value, fallback) => {
  try {
    return JSON.parse(value);                                           
  } catch {
    return fallback; 
  }
};

const emitChange = () => {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("notifications:changed"));
  }
};

const severityRank = {
  critical: 4,
  warning: 3,
  success: 2,
  info: 1,
};

export const normalizeNotification = (notification = {}) => ({
  id: String(notification.id || ""),
  type: notification.type || "system",
  source: notification.source || "system",
  title: notification.title || "",
  message: notification.message || "",
  severity: notification.severity || "info",
  createdAt:
    notification.createdAt instanceof Date
      ? notification.createdAt.toISOString()
      : String(notification.createdAt || new Date().toISOString()),
  read: Boolean(notification.read),
  link: notification.link || "/",
  entityId: notification.entityId || "",
  data:
    notification.data && typeof notification.data === "object"
      ? notification.data
      : {},
});

export const getNotifications = () => {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const raw = localStorage.getItem(NOTIFICATION_STORAGE_KEY);
    const list = raw ? safeParse(raw, []) : [];
    return Array.isArray(list)
      ? list.map(normalizeNotification).sort((left, right) => {
          const severityDelta =
            (severityRank[right.severity] || 0) - (severityRank[left.severity] || 0);
          if (severityDelta !== 0) {
            return severityDelta;
          }
          return (
            new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()
          );
        })
      : [];
  } catch {
    return [];
  }
};

export const setNotifications = (notifications = []) => {
  if (typeof window === "undefined") {
    return [];
  }

  const normalized = notifications
    .map(normalizeNotification)
    .filter((notification) => notification.id);

  localStorage.setItem(NOTIFICATION_STORAGE_KEY, JSON.stringify(normalized));
  emitChange();
  return normalized;
};

export const upsertNotification = (notification) => {
  const next = getNotifications();
  const normalized = normalizeNotification(notification);
  if (!normalized.id) {
    return next;
  }

  const existingIndex = next.findIndex((item) => item.id === normalized.id);
  if (existingIndex >= 0) {
    const existing = next[existingIndex];
    next[existingIndex] = {
      ...existing,
      ...normalized,
      read: existing.read || normalized.read,
    };
  } else {
    next.push(normalized);
  }

  return setNotifications(next);
};

export const addNotification = (notification) => upsertNotification(notification);

export const markNotificationAsRead = (id) => {
  if (!id) {
    return getNotifications();
  }

  const next = getNotifications().map((notification) =>
    notification.id === id ? { ...notification, read: true } : notification
  );
  return setNotifications(next);
};

export const markAllNotificationsAsRead = () => {
  const next = getNotifications().map((notification) => ({
    ...notification,
    read: true,
  }));
  return setNotifications(next);
};

export const clearNotifications = () => setNotifications([]);

export const getNotificationMeta = () => {
  if (typeof window === "undefined") {
    return {
      workspaceSignature: "",
      lastRefreshAt: "",
    };
  }

  try {
    const raw = localStorage.getItem(NOTIFICATION_META_KEY);
    const meta = raw ? safeParse(raw, {}) : {};
    return {
      workspaceSignature: String(meta.workspaceSignature || ""),
      lastRefreshAt: String(meta.lastRefreshAt || ""),
    };
  } catch {
    return {
      workspaceSignature: "",
      lastRefreshAt: "",
    };
  }
};

export const setNotificationMeta = (meta = {}) => {
  if (typeof window === "undefined") {
    return getNotificationMeta();
  }

  const normalized = {
    workspaceSignature: String(meta.workspaceSignature || ""),
    lastRefreshAt: String(meta.lastRefreshAt || ""),
  };
  localStorage.setItem(NOTIFICATION_META_KEY, JSON.stringify(normalized));
  return normalized;
};
