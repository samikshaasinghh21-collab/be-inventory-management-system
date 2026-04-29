import { useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import AppIcon from "../layout/AppIcon";
import { useNotifications } from "../../context/NotificationContext";

const severityStyles = {
  critical: {
    dot: "bg-red-500",
    label: "Critical",
  },
  warning: {
    dot: "bg-amber-500",
    label: "Warning",
  },
  success: {
    dot: "bg-emerald-500",
    label: "Success",
  },
  info: {
    dot: "bg-blue-500",
    label: "Info",
  },
};

const formatTime = (value) => {
  try {
    return new Intl.DateTimeFormat("en-IN", {
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(value));
  } catch {
    return "";
  }
};

const formatShortDate = (value) => {
  try {
    return new Intl.DateTimeFormat("en-IN", {
      day: "numeric",
      month: "short",
    }).format(new Date(value));
  } catch {
    return "-";
  }
};

const startOfDay = (date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());

const sameDay = (left, right) => startOfDay(left).getTime() === startOfDay(right).getTime();

const groupNotifications = (notifications = []) => {
  const current = new Date();
  const today = startOfDay(current);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  const groups = {
    critical: [],
    today: [],
    yesterday: [],
    earlier: [],
  };

  notifications.forEach((notification) => {
    const createdAt = new Date(notification.createdAt);
    if (notification.severity === "critical") {
      groups.critical.push(notification);
      return;
    }

    if (sameDay(createdAt, current)) {
      groups.today.push(notification);
      return;
    }

    if (sameDay(createdAt, yesterday)) {
      groups.yesterday.push(notification);
      return;
    }

    groups.earlier.push(notification);
  });

  return groups;
};

const sortFeed = (notifications = []) =>
  [...notifications].sort((left, right) => {
    const leftTime = new Date(left.createdAt).getTime();
    const rightTime = new Date(right.createdAt).getTime();
    const leftRank = left.severity === "critical" ? 4 : left.severity === "warning" ? 3 : left.severity === "success" ? 2 : 1;
    const rightRank = right.severity === "critical" ? 4 : right.severity === "warning" ? 3 : right.severity === "success" ? 2 : 1;
    if (rightRank !== leftRank) {
      return rightRank - leftRank;
    }
    return rightTime - leftTime;
  });

const sortForecastItems = (notifications = []) =>
  [...notifications]
    .filter(
      (notification) =>
        notification.type === "forecast" &&
        notification.data &&
        notification.data.daysRemaining !== null &&
        notification.data.daysRemaining !== undefined
    )
    .sort(
      (left, right) =>
        Number(left.data?.daysRemaining ?? Number.MAX_SAFE_INTEGER) -
        Number(right.data?.daysRemaining ?? Number.MAX_SAFE_INTEGER)
    );

const ForecastPanel = ({
  forecastItems,
  shortageCount,
  onSelect,
}) => {
  if (!forecastItems.length && shortageCount === 0) {
    return null;
  }

  const closestRisk = forecastItems[0] || null;

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-950 via-slate-900 to-blue-950 text-white shadow-sm">
      <div className="border-b border-white/10 px-4 py-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-blue-100/70">
              Forecasting
            </p>
            <h3 className="mt-1 text-lg font-semibold">Material Outlook</h3>
            <p className="mt-1 text-sm text-blue-50/80">
              Depletion-date alerts and procurement pressure from current demand.
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3 px-4 py-4 text-sm">
        <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-3">
          <p className="text-[11px] uppercase tracking-[0.18em] text-blue-100/70">
            At Risk
          </p>
          <p className="mt-2 text-2xl font-semibold">{forecastItems.length}</p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-3">
          <p className="text-[11px] uppercase tracking-[0.18em] text-blue-100/70">
            Shortages
          </p>
          <p className="mt-2 text-2xl font-semibold">{shortageCount}</p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-3">
          <p className="text-[11px] uppercase tracking-[0.18em] text-blue-100/70">
            Earliest Runout
          </p>
          <p className="mt-2 text-base font-semibold">
            {closestRisk?.data?.depletionDate
              ? formatShortDate(closestRisk.data.depletionDate)
              : "-"}
          </p>
        </div>
      </div>

      {forecastItems.length > 0 && (
        <div className="space-y-2 px-4 pb-4">
          {forecastItems.slice(0, 3).map((notification) => {
            const data = notification.data || {};
            const daysRemaining = Math.max(
              1,
              Math.ceil(Number(data.daysRemaining ?? 0))
            );
            return (
              <button
                key={notification.id}
                type="button"
                onClick={() => onSelect(notification)}
                className="flex w-full items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/5 px-3 py-3 text-left transition hover:bg-white/10"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-white">
                    {data.productName || notification.title}
                  </p>
                  <p className="mt-1 text-xs text-blue-50/75">
                    Depletion around {formatShortDate(data.depletionDate)} |{" "}
                    {Number(data.currentStock ?? 0).toLocaleString("en-IN")} in stock
                  </p>
                </div>
                <span
                  className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${
                    notification.severity === "critical"
                      ? "bg-red-500/20 text-red-100"
                      : "bg-amber-400/20 text-amber-100"
                  }`}
                >
                  {daysRemaining}d
                </span>
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
};

const NotificationItem = ({ notification, onSelect }) => {
  const severity = severityStyles[notification.severity] || severityStyles.info;

  return (
    <button
      type="button"
      onClick={() => onSelect(notification)}
      className={`group flex w-full gap-3 rounded-xl p-3 text-left transition hover:bg-slate-50 ${
        notification.read ? "bg-white" : "bg-slate-50/70"
      }`}
    >
      <span
        className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${severity.dot}`}
        aria-hidden="true"
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate font-semibold text-slate-900">{notification.title}</p>
            <p className="mt-1 text-sm leading-6 text-slate-500">{notification.message}</p>
          </div>
          {!notification.read && (
            <span
              className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-blue-500"
              aria-label="Unread notification"
              title="Unread"
            />
          )}
        </div>
        <div className="mt-2 flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-slate-400">
          <span>{severity.label}</span>
          <span>-</span>
          <span>{formatTime(notification.createdAt)}</span>
        </div>
      </div>
    </button>
  );
};

const Section = ({ title, items, onSelect, emptyLabel = "" }) => {
  if (!items.length) {
    return null;
  }

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-400">
          {title}
        </h3>
        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
          {items.length}
        </span>
      </div>
      <div className="space-y-3">
        {items.map((notification) => (
          <NotificationItem
            key={notification.id}
            notification={notification}
            onSelect={onSelect}
          />
        ))}
      </div>
      {emptyLabel ? <p className="text-sm text-slate-500">{emptyLabel}</p> : null}
    </section>
  );
};

const NotificationPanel = () => {
  const navigate = useNavigate();
  const {
    notifications,
    isPanelOpen,
    closePanel,
    markAsRead,
    markAllAsRead,
    unreadCount,
  } = useNotifications();

  useEffect(() => {
    const handleEscape = (event) => {
      if (event.key === "Escape") {
        closePanel();
      }
    };

    if (isPanelOpen) {
      window.addEventListener("keydown", handleEscape);
    }

    return () => window.removeEventListener("keydown", handleEscape);
  }, [closePanel, isPanelOpen]);

  const grouped = useMemo(
    () => groupNotifications(sortFeed(notifications)),
    [notifications]
  );
  const forecastItems = useMemo(
    () => sortForecastItems(notifications),
    [notifications]
  );
  const shortageCount = useMemo(
    () => notifications.filter((notification) => notification.type === "mrp").length,
    [notifications]
  );

  const handleSelect = (notification) => {
    markAsRead(notification.id);
    closePanel();
    if (notification.link) {
      navigate(notification.link);
    }
  };

  return (
    <>
      <div
        className={`fixed inset-0 z-40 bg-slate-950/30 backdrop-blur-[1px] transition-opacity duration-300 ${
          isPanelOpen ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0"
        }`}
        onClick={closePanel}
        aria-hidden="true"
      />

      <aside
        className={`fixed right-0 top-0 z-50 flex h-screen w-[410px] max-w-[92vw] flex-col border-l border-slate-200 bg-white shadow-2xl transition-transform duration-300 ease-out ${
          isPanelOpen ? "translate-x-0" : "translate-x-full"
        }`}
        aria-hidden={!isPanelOpen}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-400">
              Activity Feed
            </p>
            <h2 className="mt-1 text-xl font-semibold tracking-tight text-slate-950">
              Notifications
            </h2>
          </div>
          <div className="flex items-center gap-2">
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={markAllAsRead}
                className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-950"
              >
                Mark all read
              </button>
            )}
            <button
              type="button"
              onClick={closePanel}
              className="grid h-9 w-9 place-items-center rounded-full border border-slate-200 text-slate-500 transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-950"
              aria-label="Close notifications"
            >
              <AppIcon name="x" className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-5">
          <div className="space-y-5">
            <ForecastPanel
              forecastItems={forecastItems}
              shortageCount={shortageCount}
              onSelect={handleSelect}
            />

            <Section
              title="Critical Alerts"
              items={grouped.critical}
              onSelect={handleSelect}
            />

            <Section title="Today" items={grouped.today} onSelect={handleSelect} />
            <Section
              title="Yesterday"
              items={grouped.yesterday}
              onSelect={handleSelect}
            />
            <Section
              title="Earlier"
              items={grouped.earlier}
              onSelect={handleSelect}
            />

            {!notifications.length && (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-center">
                <p className="text-sm font-medium text-slate-900">
                  No notifications yet
                </p>
                <p className="mt-2 text-sm leading-6 text-slate-500">
                  System events, inventory alerts, and project updates will appear here.
                </p>
              </div>
            )}
          </div>
        </div>
      </aside>
    </>
  );
};

export default NotificationPanel;
