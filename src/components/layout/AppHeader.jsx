import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import AppIcon from "./AppIcon";
import { FLAT_NAVIGATION_ITEMS, HEADER_QUICK_ACTIONS } from "./navigation";
import NotificationBell from "../notifications/NotificationBell";

const buildInitials = (name = "Workspace") =>
  String(name)
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || "")
    .join("") || "WS";

const buildSearchableItems = () => {
  const seen = new Set();
  return FLAT_NAVIGATION_ITEMS.filter((item) => {
    if (!item?.to) {
      return false;
    }
    const key = `${item.to}::${item.label}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
};

const searchNavigation = (items, query) => {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return items.slice(0, 6);
  }

  return items
    .map((item) => {
      const haystack = [
        item.label,
        item.searchLabel,
        item.subtitle,
        item.sectionLabel,
        ...(item.searchKeywords || []),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      const exactPrefix = haystack.startsWith(normalizedQuery) ? 3 : 0;
      const exactWord = haystack.includes(` ${normalizedQuery}`) ? 2 : 0;
      const contains = haystack.includes(normalizedQuery) ? 1 : 0;
      return {
        item,
        score: exactPrefix + exactWord + contains,
      };
    })
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score)
    .map((entry) => entry.item)
    .slice(0, 7);
};

const AppHeader = ({
  isCollapsed,
  isDesktop,
  isMobileSidebarOpen,
  onToggleCollapse,
  onToggleMobileSidebar,
  routeMeta,
  settings,
}) => {
  const navigate = useNavigate();
  const location = useLocation();
  const searchRef = useRef(null);
  const profileRef = useRef(null);

  const [query, setQuery] = useState("");
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);

  const profile = settings?.profile || {};
  const company = settings?.company || {};
  const workspaceName = company.name || "Inventory Workspace";
  const searchableItems = useMemo(() => buildSearchableItems(), []);
  const searchResults = useMemo(
    () => searchNavigation(searchableItems, query),
    [query, searchableItems]
  );

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setQuery("");
      setIsSearchOpen(false);
      setIsProfileOpen(false);
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [location.pathname]);

  useEffect(() => {
    const handleClickAway = (event) => {
      const target = event.target;
      if (searchRef.current && !searchRef.current.contains(target)) {
        setIsSearchOpen(false);
      }
      if (profileRef.current && !profileRef.current.contains(target)) {
        setIsProfileOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickAway);
    return () => document.removeEventListener("mousedown", handleClickAway);
  }, []);

  const handleNavigate = (to) => {
    navigate(to);
    setIsSearchOpen(false);
    setQuery("");
  };

  const handleSearchSubmit = (event) => {
    event.preventDefault();
    if (searchResults[0]?.to) {
      handleNavigate(searchResults[0].to);
    }
  };

  const handleLogout = () => {
    const shouldLogout = window.confirm("Are you sure you want to logout?");
    if (!shouldLogout) {
      return;
    }
    navigate("/login");
  };

  const pageCategory =
    routeMeta?.sectionLabel || routeMeta?.parentLabel || "Workspace";
  const displayName = profile.fullName || "Demo Account";
  const initials = buildInitials(displayName);

  return (
    <header className="app-header">
      <div className="app-header-inner">
        <div className="app-header-main">
          <div className="app-header-leading">
            <button
              type="button"
              className="header-icon-button app-header-toggle-mobile"
              onClick={onToggleMobileSidebar}
              aria-label={
                isMobileSidebarOpen ? "Close navigation" : "Open navigation"
              }
            >
              <AppIcon name={isMobileSidebarOpen ? "x" : "menu"} />
            </button>
            <button
              type="button"
              className="header-icon-button app-header-toggle-desktop"
              onClick={onToggleCollapse}
              aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              <AppIcon
                name={isCollapsed ? "chevron-right" : "chevron-left"}
              />
            </button>

            <div className="app-header-title-block">
              <span className="app-breadcrumb">{pageCategory}</span>
              <div className="app-header-title-row">
                <h1>{routeMeta?.label || "Dashboard"}</h1>
                <span className="app-badge">{workspaceName}</span>
              </div>
              <p>{routeMeta?.subtitle || "Shared workspace view"}</p>
            </div>
          </div>

          <div className="app-header-toolbar">
            <form
              ref={searchRef}
              className="header-search"
              onSubmit={handleSearchSubmit}
            >
              <div className="header-search-input-shell">
                <span className="header-search-icon" aria-hidden="true">
                  <AppIcon name="search" className="h-4 w-4" />
                </span>
                <input
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  onFocus={() => setIsSearchOpen(true)}
                  placeholder="Search pages, modules, and quick links"
                  aria-label="Search workspace navigation"
                />
                <button type="submit" className="header-search-submit">
                  Go
                </button>
              </div>

              {isSearchOpen && (
                <div className="header-search-panel">
                  <div className="header-search-panel-label">
                    {query.trim() ? "Jump to a page" : "Quick links"}
                  </div>
                  {searchResults.length ? (
                    searchResults.map((item) => (
                      <button
                        key={`${item.id}-${item.to}`}
                        type="button"
                        className="header-search-result"
                        onClick={() => handleNavigate(item.to)}
                      >
                        <span className="header-search-result-icon">
                          <AppIcon name={item.icon} className="h-4 w-4" />
                        </span>
                        <span className="header-search-result-copy">
                          <strong>{item.label}</strong>
                          <small>{item.subtitle || item.searchLabel}</small>
                        </span>
                        <span className="header-search-result-trail">
                          {item.sectionLabel || "Workspace"}
                        </span>
                      </button>
                    ))
                  ) : (
                    <div className="header-search-empty">
                      No matching views found for this search.
                    </div>
                  )}
                </div>
              )}
            </form>

            <div className="header-quick-actions">
              {HEADER_QUICK_ACTIONS.slice(0, 2).map((action) => (
                <button
                  key={action.id}
                  type="button"
                  className="app-btn app-btn-outline header-quick-action"
                  onClick={() => handleNavigate(action.to)}
                >
                  <AppIcon name={action.icon} className="h-4 w-4" />
                  <span>{action.label}</span>
                </button>
              ))}
            </div>

            <NotificationBell />

            <div ref={profileRef} className="header-menu-container">
              <button
                type="button"
                className="header-profile-button"
                onClick={() => setIsProfileOpen((current) => !current)}
                aria-label="Open user menu"
              >
                {profile.avatar ? (
                  <img
                    src={profile.avatar}
                    alt={displayName}
                    className="header-profile-avatar"
                  />
                ) : (
                  <span className="header-profile-avatar initials">
                    {initials}
                  </span>
                )}
                <span className="header-profile-copy">
                  <strong>{displayName}</strong>
                  <small>{profile.role || "Administrator"}</small>
                </span>
                <AppIcon name="chevron-down" className="h-4 w-4" />
              </button>

              {isProfileOpen && (
                <div className="header-menu header-menu-wide">
                  <div className="header-profile-card">
                    {profile.avatar ? (
                      <img
                        src={profile.avatar}
                        alt={displayName}
                        className="header-profile-card-avatar"
                      />
                    ) : (
                      <span className="header-profile-card-avatar initials">
                        {initials}
                      </span>
                    )}
                    <div className="header-profile-card-copy">
                      <strong>{displayName}</strong>
                      <small>{profile.email || "demo@mybillbook.in"}</small>
                    </div>
                  </div>
                  <div className="header-menu-list">
                    <button
                      type="button"
                      className="header-menu-item"
                      onClick={() => navigate("/profile")}
                    >
                      <span className="header-menu-item-icon">
                        <AppIcon name="user" className="h-4 w-4" />
                      </span>
                      <span className="header-menu-item-copy">
                        <strong>Profile</strong>
                        <small>Review account information and preferences</small>
                      </span>
                    </button>
                    <button
                      type="button"
                      className="header-menu-item"
                      onClick={() => navigate("/settings")}
                    >
                      <span className="header-menu-item-icon">
                        <AppIcon name="settings" className="h-4 w-4" />
                      </span>
                      <span className="header-menu-item-copy">
                        <strong>Settings</strong>
                        <small>Open workspace configuration and policies</small>
                      </span>
                    </button>
                    <button
                      type="button"
                      className="header-menu-item"
                      onClick={handleLogout}
                    >
                      <span className="header-menu-item-icon">
                        <AppIcon name="logout" className="h-4 w-4" />
                      </span>
                      <span className="header-menu-item-copy">
                        <strong>Logout</strong>
                        <small>Exit the application and return to sign in</small>
                      </span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {!isDesktop && (
          <div className="app-header-mobile-caption">
            <span>{pageCategory}</span>
            <strong>{routeMeta?.label || "Dashboard"}</strong>
          </div>
        )}
      </div>
    </header>
  );
};

export default AppHeader;
