import { useEffect, useMemo, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { getSettings, hydrateSettings } from "../../services/settingsStore";
import { loadCurrentUser } from "../../services/authService";
import { isApiUnavailableError } from "../../services/api";
import AppHeader from "./AppHeader";
import Sidebar from "./Sidebar";
import { getRouteMeta } from "./navigation";
import NotificationPanel from "../notifications/NotificationPanel";

const SIDEBAR_COLLAPSE_KEY = "app-shell:sidebar-collapsed";

const readStoredCollapse = () => {
  if (typeof window === "undefined") {
    return false;
  }

  try {
    return localStorage.getItem(SIDEBAR_COLLAPSE_KEY) === "true";
  } catch {
    return false;
  }
};

const readDesktopState = () => {
  if (typeof window === "undefined") {
    return true;
  }
  return window.matchMedia("(min-width: 1024px)").matches;
};

const safeReadSettings = () => {
  try {
    return getSettings();
  } catch {
    return {
      company: {},
      preferences: {},
      profile: {},
    };
  }
};

const AppShell = ({ children }) => {
  const location = useLocation();
  const [isCollapsed, setIsCollapsed] = useState(readStoredCollapse);
  const [isDesktop, setIsDesktop] = useState(readDesktopState);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [settings, setSettings] = useState(safeReadSettings);

  useEffect(() => {
    try {
      localStorage.setItem(SIDEBAR_COLLAPSE_KEY, String(isCollapsed));
    } catch {
      // ignore storage failures
    }
  }, [isCollapsed]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return undefined;
    }

    const media = window.matchMedia("(min-width: 1024px)");
    const syncDesktop = (event) => {
      const nextDesktop = event.matches ?? media.matches;
      setIsDesktop(nextDesktop);
      if (nextDesktop) {
        setIsMobileSidebarOpen(false);
      }
    };

    syncDesktop(media);

    if (media.addEventListener) {
      media.addEventListener("change", syncDesktop);
      return () => media.removeEventListener("change", syncDesktop);
    }

    media.addListener(syncDesktop);
    return () => media.removeListener(syncDesktop);
  }, []);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setIsMobileSidebarOpen(false);
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [location.pathname]);

  useEffect(() => {
    let active = true;
    const syncSettings = () => {
      setSettings(safeReadSettings());
    };

    window.addEventListener("settings:changed", syncSettings);
<<<<<<< HEAD
    window.addEventListener("auth:expired", handleExpiredSession);
    const initializeShell = async () => {
      try {
        const user = await loadCurrentUser();
        if (!active) return;
        if (!user) {
          window.location.assign("/login");
          return;
        }
        try {
          await hydrateSettings();
        } catch (error) {
          // Settings hydration is optional for rendering the shell. Cached/default
          // settings remain available when the API or database is offline.
          console.warn("Settings hydration was skipped:", error?.message || error);
        }
      } catch (error) {
        if (!active || isApiUnavailableError(error)) {
          return;
        }
        window.location.assign("/login");
      }
    };
    void initializeShell();
=======
    loadCurrentUser()
      .then((user) => (user ? hydrateSettings() : null))
      .catch(() => {
        // Keep the dashboard open with cached data when the API is unavailable.
      });
>>>>>>> c7a04e8 (Update project management and inventory reporting)
    return () => {
      active = false;
      window.removeEventListener("settings:changed", syncSettings);
    };
  }, []);

  useEffect(() => {
    if (typeof document === "undefined") {
      return undefined;
    }

    if (!isDesktop && isMobileSidebarOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }

    return () => {
      document.body.style.overflow = "";
    };
  }, [isDesktop, isMobileSidebarOpen]);

  const routeMeta = useMemo(
    () => getRouteMeta(location.pathname),
    [location.pathname]
  );

  return (
    <div
      className={[
        "app-shell",
        isCollapsed ? "is-sidebar-collapsed" : "",
        isMobileSidebarOpen ? "is-mobile-sidebar-open" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <Sidebar
        isCollapsed={isCollapsed}
        isDesktop={isDesktop}
        isMobileOpen={isMobileSidebarOpen}
        onCloseMobile={() => setIsMobileSidebarOpen(false)}
        onToggleCollapse={() => setIsCollapsed((current) => !current)}
        settings={settings}
      />

      <div className="app-main">
        <AppHeader
          isCollapsed={isCollapsed}
          isDesktop={isDesktop}
          isMobileSidebarOpen={isMobileSidebarOpen}
          onToggleCollapse={() => setIsCollapsed((current) => !current)}
          onToggleMobileSidebar={() =>
            setIsMobileSidebarOpen((current) => !current)
          }
          routeMeta={routeMeta}
          settings={settings}
        />
        <NotificationPanel />

        <main className="app-content">
          <div className="app-content-inner">
            <div className="app-route-frame" key={location.pathname}>
              {children ?? <Outlet />}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
};

export default AppShell;
