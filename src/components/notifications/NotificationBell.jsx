import AppIcon from "../layout/AppIcon";
import { useNotifications } from "../../context/NotificationContext";

const NotificationBell = () => {
  const { unreadCount, togglePanel } = useNotifications();

  return (
    <button
      type="button"
      onClick={togglePanel}
      className="relative inline-flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-950"
      aria-label={`Open notifications${unreadCount > 0 ? `, ${unreadCount} unread` : ""}`}
    >
      <AppIcon name="bell" className="h-5 w-5" />
      {unreadCount > 0 && (
        <span className="absolute -right-1 -top-1 inline-flex min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-semibold leading-none text-white shadow-md">
          {unreadCount > 99 ? "99+" : unreadCount}
        </span>
      )}
    </button>
  );
};

export default NotificationBell;

