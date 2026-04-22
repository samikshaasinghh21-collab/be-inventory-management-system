import { useEffect, useMemo, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { getSettings } from "../../services/settingsStore";
import AppHeader from "./AppHeader";
import Sidebar from "./Sidebar";
import { getRouteMeta } from "./navigation";

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
    setIsMobileSidebarOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    const syncSettings = () => {
      setSettings(safeReadSettings());
    };

    window.addEventListener("settings:changed", syncSettings);
    return () => window.removeEventListener("settings:changed", syncSettings);
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
