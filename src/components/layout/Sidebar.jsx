import { useState } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import AppIcon from "./AppIcon";
import {
  getDefaultDestination,
  isNavigationItemActive,
  NAVIGATION_SECTIONS,
} from "./navigation";

const buildInitials = (value = "Inventory Workspace") =>
  String(value)
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || "")
    .join("") || "IW";

const collectExpandableItems = (items = []) =>
  items.flatMap((item) => [
    ...(item.children?.length ? [item] : []),
    ...collectExpandableItems(item.children || []),
  ]);

const EXPANDABLE_ITEMS = NAVIGATION_SECTIONS.flatMap((section) =>
  collectExpandableItems(section.items || [])
);

const createOpenState = (pathname) =>
  EXPANDABLE_ITEMS.reduce((state, item) => {
    state[item.id] = isNavigationItemActive(pathname, item);
    return state;
  }, {});

const Sidebar = ({
  isCollapsed,
  isDesktop,
  isMobileOpen,
  onCloseMobile,
  settings,
}) => {
  const location = useLocation();
  const navigate = useNavigate();
  const [navigationState, setNavigationState] = useState(() => ({
    pathname: location.pathname,
    openGroups: createOpenState(location.pathname),
  }));
  const openGroups =
    navigationState.pathname === location.pathname
      ? navigationState.openGroups
      : createOpenState(location.pathname);

  const profile = settings?.profile || {};
  const profileName = profile.fullName || "Demo Account";
  const profileInitials = buildInitials(profileName);

  const shouldShowOverlay = !isDesktop && isMobileOpen;

  const closeSidebarOnMobile = () => {
    if (!isDesktop) {
      onCloseMobile();
    }
  };

  const getChildStyle = (depth) =>
    depth > 0 ? { paddingLeft: `${0.85 + depth * 0.75}rem` } : undefined;

  const renderLeafItem = (item, depth = 0) => {
    const isActive = isNavigationItemActive(location.pathname, item);
    const isChild = depth > 0;

    return (
      <NavLink
        key={item.id}
        to={item.to || getDefaultDestination(item)}
        title={item.label}
        onClick={closeSidebarOnMobile}
        style={getChildStyle(depth)}
        className={() =>
          [
            "sidebar-nav-link",
            isChild ? "is-child" : "",
            isActive ? "is-active" : "",
          ]
            .filter(Boolean)
            .join(" ")
        }
      >
        <span className="sidebar-nav-icon">
          <AppIcon name={item.icon} className="h-4 w-4" />
        </span>
        {!isCollapsed && (
          <span className="sidebar-nav-copy">
            <span className="sidebar-nav-label">{item.label}</span>
            {!isChild && item.subtitle ? (
              <span className="sidebar-nav-meta">{item.subtitle}</span>
            ) : null}
          </span>
        )}
        {!isCollapsed && item.badge ? (
          <span className="app-badge">{item.badge}</span>
        ) : null}
      </NavLink>
    );
  };

  const renderSectionItem = (item, depth = 0) => {
    if (item.hidden) {
      return null;
    }

    const isActive = isNavigationItemActive(location.pathname, item);
    const isExpanded = !!openGroups[item.id];
    const destination = getDefaultDestination(item);
    const isChild = depth > 0;

    if (!item.children?.length) {
      return renderLeafItem(item, depth);
    }

    return (
      <div key={item.id} className="sidebar-group">
        <button
          type="button"
          className={[
            "sidebar-nav-link",
            "has-children",
            isChild ? "is-child" : "",
            isActive ? "is-active" : "",
          ]
            .filter(Boolean)
            .join(" ")}
          style={getChildStyle(depth)}
          onClick={() => {
            if (isCollapsed && isDesktop) {
              navigate(destination);
              closeSidebarOnMobile();
              return;
            }
            setNavigationState((current) => {
              const currentOpenGroups =
                current.pathname === location.pathname
                  ? current.openGroups
                  : createOpenState(location.pathname);
              return {
                pathname: location.pathname,
                openGroups: {
                  ...currentOpenGroups,
                  [item.id]: !currentOpenGroups[item.id],
                },
              };
            });
          }}
          title={item.label}
          aria-expanded={isExpanded}
        >
          <span className="sidebar-nav-icon">
            <AppIcon name={item.icon} className="h-4 w-4" />
          </span>
          {!isCollapsed && (
            <>
              <span className="sidebar-nav-copy">
                <span className="sidebar-nav-label">{item.label}</span>
                {item.subtitle ? (
                  <span className="sidebar-nav-meta">{item.subtitle}</span>
                ) : null}
              </span>
              <span
                className={[
                  "sidebar-nav-chevron",
                  isExpanded ? "is-expanded" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
              >
                <AppIcon name="chevron-down" className="h-4 w-4" />
              </span>
            </>
          )}
        </button>

        {!isCollapsed && isExpanded && (
          <div className="sidebar-subnav">
            {item.children.map((child) => renderSectionItem(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <>
      <aside className="app-sidebar" aria-hidden={!isDesktop && !isMobileOpen}>
        <div className="sidebar-workspace-card">
          {profile.avatar ? (
            <img
              src={profile.avatar}
              alt={profileName}
              className="sidebar-workspace-avatar"
            />
          ) : (
            <span className="sidebar-workspace-avatar initials">
              {profileInitials}
            </span>
          )}
          {!isCollapsed && (
            <div className="sidebar-workspace-copy">
              <strong>{profileName}</strong>
              <small>{profile.email || "demo@mybillbook.in"}</small>
            </div>
          )}
        </div>

        <nav className="sidebar-scroll" aria-label="Primary navigation">
          {NAVIGATION_SECTIONS.map((section) => (
            <section key={section.id} className="sidebar-section">
              {!isCollapsed && (
                <p className="sidebar-section-label">{section.label}</p>
              )}
              <div className="sidebar-nav-list">
                {(section.items || []).map((item) => renderSectionItem(item))}
              </div>
            </section>
          ))}
        </nav>

        <div className="sidebar-footer">
          <button
            type="button"
            className="sidebar-footer-card"
            onClick={() => {
              navigate("/settings");
              closeSidebarOnMobile();
            }}
            title="Open settings"
          >
            <span className="sidebar-footer-icon">
              <AppIcon name="settings" className="h-4 w-4" />
            </span>
            {!isCollapsed && (
              <span className="sidebar-footer-copy">
                <strong>Workspace settings</strong>
                <small>Manage theme, company info, and policies</small>
              </span>
            )}
          </button>
        </div>
      </aside>

      {shouldShowOverlay && (
        <button
          type="button"
          className="app-sidebar-overlay"
          onClick={onCloseMobile}
          aria-label="Close navigation"
        />
      )}
    </>
  );
};

export default Sidebar;
