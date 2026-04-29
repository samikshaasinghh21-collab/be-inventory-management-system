import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useLocation } from "react-router-dom";
import { fetchBoqs } from "../services/boqApi";
import { fetchConsumptions } from "../services/consumptionApi";
import { getProjects } from "../services/projectsStore";
import { fetchProjects } from "../services/projectsApi";
import { fetchPurchaseOrders } from "../services/purchaseOrdersApi";
import { fetchReceiveGoods } from "../services/receiveGoodsApi";
import { fetchItems } from "../services/inventoryApi";
import { getSettings } from "../services/settingsStore";
import {
  addNotification,
  getNotificationMeta,
  getNotifications,
  markAllNotificationsAsRead,
  markNotificationAsRead,
  setNotificationMeta,
  setNotifications,
} from "../services/notificationStore";
import { buildNotificationsFromState } from "../services/notificationEngine";

const NotificationContext = createContext(null);

const refreshOnEvents = [
  "projects:changed",
  "products:changed",
  "receive-goods:changed",
  "purchase-orders:changed",
  "boqs:changed",
  "delivery-challans:changed",
  "consumptions:changed",
  "settings:changed",
];

const sortNotifications = (items = []) =>
  [...items].sort((left, right) => {
    const leftRank = left.severity === "critical" ? 4 : left.severity === "warning" ? 3 : left.severity === "success" ? 2 : 1;
    const rightRank = right.severity === "critical" ? 4 : right.severity === "warning" ? 3 : right.severity === "success" ? 2 : 1;
    if (rightRank !== leftRank) {
      return rightRank - leftRank;
    }
    return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
  });

const mergeNotifications = (existing = [], generated = []) => {
  const existingById = new Map(
    existing
      .filter((notification) => notification?.id)
      .map((notification) => [notification.id, notification])
  );
  const manualNotifications = existing.filter(
    (notification) => notification?.source === "manual"
  );
  const nextGenerated = generated.map((notification) => {
    const previous = existingById.get(notification.id);
    return previous
      ? {
          ...notification,
          read: Boolean(previous.read || notification.read),
        }
      : notification;
  });

  return sortNotifications([...manualNotifications, ...nextGenerated]);
};

export const NotificationProvider = ({ children }) => {
  const location = useLocation();
  const [notifications, setNotificationsState] = useState(() => getNotifications());
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const unreadCount = useMemo(
    () => notifications.filter((notification) => !notification.read).length,
    [notifications]
  );
  const openPanel = useCallback(() => {
    setIsPanelOpen(true);
  }, []);
  const closePanel = useCallback(() => {
    setIsPanelOpen(false);
  }, []);
  const togglePanel = useCallback(() => {
    setIsPanelOpen((current) => !current);
  }, []);
  const markAsRead = useCallback((id) => {
    const next = markNotificationAsRead(id);
    setNotificationsState(next);
  }, []);
  const markAllAsRead = useCallback(() => {
    const next = markAllNotificationsAsRead();
    setNotificationsState(next);
  }, []);
  const addNotificationItem = useCallback((notification) => {
    const next = addNotification({
      ...notification,
      source: notification?.source || "manual",
    });
    setNotificationsState(next);
  }, []);

  const refreshNotifications = useCallback(async () => {
    const previousMeta = getNotificationMeta();

    const [
      projectsResult,
      purchaseOrdersResult,
      receiveGoodsResult,
      itemsResult,
      boqsResult,
      consumptionsResult,
    ] =
      await Promise.allSettled([
        fetchProjects(),
        fetchPurchaseOrders(),
        fetchReceiveGoods(),
        fetchItems(),
        fetchBoqs(),
        fetchConsumptions(),
      ]);

    const projects =
      projectsResult.status === "fulfilled" && Array.isArray(projectsResult.value)
        ? projectsResult.value
        : getProjects();
    const purchaseOrders =
      purchaseOrdersResult.status === "fulfilled" && Array.isArray(purchaseOrdersResult.value)
        ? purchaseOrdersResult.value
        : [];
    const receiveGoods =
      receiveGoodsResult.status === "fulfilled" && Array.isArray(receiveGoodsResult.value)
        ? receiveGoodsResult.value
        : [];
    const items =
      itemsResult.status === "fulfilled" && Array.isArray(itemsResult.value)
        ? itemsResult.value
        : [];
    const boqs =
      boqsResult.status === "fulfilled" && Array.isArray(boqsResult.value)
        ? boqsResult.value
        : [];
    const consumptions =
      consumptionsResult.status === "fulfilled" &&
      Array.isArray(consumptionsResult.value)
        ? consumptionsResult.value
        : [];
    const settings = getSettings();
    const generated = buildNotificationsFromState({
      projects,
      purchaseOrders,
      receiveGoods,
      items,
      boqs,
      consumptions,
      settings,
      previousMeta,
      now: new Date(),
    });

    const hasStoredWorkspaceSignature = Boolean(previousMeta.workspaceSignature);
    const nextNotifications = hasStoredWorkspaceSignature
      ? generated.notifications
      : generated.notifications.filter(
          (notification) => !notification.id.startsWith("workspace-sync-")
        );

    const merged = mergeNotifications(getNotifications(), nextNotifications);
    const sorted = sortNotifications(merged);
    setNotifications(sorted);
    setNotificationsState(sorted);
    setNotificationMeta(generated.meta);
  }, []);

  useEffect(() => {
    let active = true;

    const runRefresh = async () => {
      try {
        await refreshNotifications();
      } catch {
        if (active) {
          setNotificationsState(getNotifications());
        }
      }
    };

    const handleChange = () => {
      void runRefresh();
    };

    const handleStorage = (event) => {
      if (
        event.key === "inventory_notifications" ||
        event.key === "inventory_notification_meta"
      ) {
        setNotificationsState(getNotifications());
      }
    };

    const handleNotificationsChanged = () => {
      setNotificationsState(getNotifications());
    };

    const handleVisibility = () => {
      if (typeof document !== "undefined" && document.visibilityState === "visible") {
        void runRefresh();
      }
    };

    void runRefresh();

    refreshOnEvents.forEach((eventName) =>
      window.addEventListener(eventName, handleChange)
    );
    window.addEventListener("notifications:changed", handleNotificationsChanged);
    window.addEventListener("storage", handleStorage);
    window.addEventListener("focus", handleChange);
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      active = false;
      refreshOnEvents.forEach((eventName) =>
        window.removeEventListener(eventName, handleChange)
      );
      window.removeEventListener(
        "notifications:changed",
        handleNotificationsChanged
      );
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener("focus", handleChange);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [refreshNotifications]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setIsPanelOpen(false);
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [location.pathname]);

  const value = {
    notifications,
    unreadCount,
    isPanelOpen,
    openPanel,
    closePanel,
    togglePanel,
    refreshNotifications,
    markAsRead,
    markAllAsRead,
    addNotification: addNotificationItem,
  };

  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
  );
};

// eslint-disable-next-line react-refresh/only-export-components
export const useNotifications = () => {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error("useNotifications must be used within a NotificationProvider");
  }
  return context;
};
