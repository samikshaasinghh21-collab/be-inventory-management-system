import { useEffect, useState } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { getSettings } from "../../services/settingsStore";

const Icon = ({ children }) => (
  <span className="grid h-9 w-9 place-items-center rounded-md bg-slate-800/70 text-slate-200 transition group-hover:bg-slate-700">
    {children}
  </span>
);

const INVENTORY_MANAGEMENT_WORKFLOW = [
  {
    id: "projects",
    label: "Projects",
    to: "/inventory/projects",
    matchPrefixes: ["/inventory/projects", "/inventory/create-project"],
  },
  {
    id: "boq",
    label: "BOQ",
    to: "/inventory/boq",
    matchPrefixes: ["/inventory/boq"],
  },
  {
    id: "purchase-order",
    label: "Purchase Orders",
    to: "/inventory/purchase-order",
    matchPrefixes: ["/inventory/purchase-order", "/inventory/purchase-orders"],
  },
  {
    id: "purchase-order-register",
    label: "Purchase Register",
    to: "/inventory/purchase-order-register",
    matchPrefixes: ["/inventory/purchase-order-register"],
  },
  {
    id: "products",
    label: "Products",
    to: "/inventory/products",
    matchPrefixes: [
      "/inventory/products",
      "/inventory/create-product",
      "/inventory/create-item",
      "/inventory/edit/",
    ],
  },
  {
    id: "vendors",
    label: "Vendors",
    to: "/inventory/vendors",
    matchPrefixes: ["/inventory/vendors", "/inventory/create-vendors"],
  },
  {
    id: "customers",
    label: "Customers",
    to: "/inventory/customers",
    matchPrefixes: ["/inventory/customers"],
  },
  {
    id: "locations",
    label: "Location Management",
    to: "/inventory/locations",
    matchPrefixes: ["/inventory/locations"],
  },
  {
    id: "receive-inventory",
    label: "Receive Inventory",
    to: "/inventory/receive-goods",
    matchPrefixes: ["/inventory/receive-goods"],
  },
  {
    id: "receive-register",
    label: "Receive Register",
    to: "/inventory/receive-goods-register",
    matchPrefixes: ["/inventory/receive-goods-register"],
  },
  {
    id: "consumption",
    label: "Consumption",
    to: "/inventory/consumption",
    matchPrefixes: ["/inventory/consumption"],
  },
  {
    id: "return-reallocate",
    label: "Relocation / Return",
    to: "/inventory/return-reallocate",
    matchPrefixes: ["/inventory/return-reallocate", "/inventory/reallocate-return"],
  },
];

const TOOL_EMPLOYEE_WORKFLOW = [
  {
    id: "tools-employees-list",
    label: "List of Employees",
    to: "/inventory/tools/employees",
    matchPrefixes: ["/inventory/tools/employees"],
  },
  {
    id: "tools-employees-add",
    label: "Add New Employee",
    to: "/inventory/tools/employees/new",
    matchPrefixes: ["/inventory/tools/employees/new"],
  },
];

const TOOL_WORKFLOW = [
  {
    id: "tools-list",
    label: "List of Tools",
    to: "/inventory/tools/list",
    matchPrefixes: ["/inventory/tools/list"],
  },
  {
    id: "tools-add",
    label: "Add New Tool",
    to: "/inventory/tools/new",
    matchPrefixes: ["/inventory/tools/new"],
  },
  {
    id: "tools-assign",
    label: "Assign Tool to Employee",
    to: "/inventory/tools/assign",
    matchPrefixes: ["/inventory/tools/assign"],
  },
  {
    id: "tools-handover",
    label: "Switch / Handover Tool",
    to: "/inventory/tools/handover",
    matchPrefixes: ["/inventory/tools/handover"],
  },
];

const Sidebar = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [isCollapsed, setIsCollapsed] = useState(() => {
    try {
      return localStorage.getItem("sidebarCollapsed") === "true";
    } catch {
      return false;
    }
  });
  const [inventoryManagementOpen, setInventoryManagementOpen] = useState(false);
  const [toolEmployeesOpen, setToolEmployeesOpen] = useState(false);
  const [toolWorkflowOpen, setToolWorkflowOpen] = useState(false);
  const [profile, setProfile] = useState(() => {
    try {
      return getSettings().profile || {};
    } catch {
      return {};
    }
  });

  const isInventoryManagementRoute = INVENTORY_MANAGEMENT_WORKFLOW.some(
    (step) =>
      (step.matchPrefixes || [step.to]).some(
        (prefix) => prefix && location.pathname.startsWith(prefix)
      )
  );
  const isToolEmployeesRoute = TOOL_EMPLOYEE_WORKFLOW.some((step) =>
    (step.matchPrefixes || [step.to]).some(
      (prefix) => prefix && location.pathname.startsWith(prefix)
    )
  );
  const isToolWorkflowRoute =
    location.pathname === "/inventory/tools" ||
    TOOL_WORKFLOW.some((step) =>
      (step.matchPrefixes || [step.to]).some(
        (prefix) => prefix && location.pathname.startsWith(prefix)
      )
    );

  useEffect(() => {
    const width = isCollapsed ? "5rem" : "18rem";
    document.documentElement.style.setProperty("--sidebar-width", width);
    try {
      localStorage.setItem("sidebarCollapsed", String(isCollapsed));
    } catch {
      // ignore storage errors
    }
  }, [isCollapsed]);

  useEffect(() => {
    if (isInventoryManagementRoute && !isCollapsed) {
      setInventoryManagementOpen(true);
    }
  }, [isInventoryManagementRoute, isCollapsed]);

  useEffect(() => {
    if (isToolEmployeesRoute && !isCollapsed) {
      setToolEmployeesOpen(true);
    }
  }, [isToolEmployeesRoute, isCollapsed]);

  useEffect(() => {
    if (isToolWorkflowRoute && !isCollapsed) {
      setToolWorkflowOpen(true);
    }
  }, [isToolWorkflowRoute, isCollapsed]);

  useEffect(() => {
    const syncProfile = () => {
      try {
        setProfile(getSettings().profile || {});
      } catch {
        // ignore storage errors
      }
    };
    window.addEventListener("settings:changed", syncProfile);
    return () => window.removeEventListener("settings:changed", syncProfile);
  }, []);

  const linkClass = [
    "group flex items-center rounded-lg transition text-[15px] text-slate-200 hover:bg-slate-800/80",
    isCollapsed ? "justify-center px-2 py-3" : "gap-4 px-4 py-3",
  ].join(" ");

  const activeClass =
    "bg-slate-800/90 text-white font-semibold shadow-[inset_0_0_0_1px_rgba(148,163,184,0.2)]";

  const labelClass = isCollapsed
    ? "opacity-0 w-0 overflow-hidden"
    : "opacity-100";

  const initials =
    (profile.fullName || "ERP")
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0].toUpperCase())
      .join("") || "ERP";

  const handleLogout = () => {
    // If later we add auth tokens, clear them here.
    navigate("/login");
  };

  return (
    <aside
      className={`${
        isCollapsed ? "w-20" : "w-72"
      } h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-900 text-white fixed transition-[width] duration-200 flex flex-col`}
    >
      {/* Account / Logo */}
      <div className="p-5 border-b border-slate-800">
        <button
          type="button"
          onClick={() => navigate("/account")}
          className={`w-full ${isCollapsed ? "grid place-items-center" : "flex items-center gap-3"} rounded-xl border border-slate-800 bg-slate-900/40 hover:bg-slate-800/60 transition text-left`}
        >
          <div className="relative h-11 w-11 rounded-xl border border-slate-700/70 overflow-hidden bg-slate-800/80 text-slate-200 text-sm font-semibold grid place-items-center">
            {profile.avatar ? (
              <img
                src={profile.avatar}
                alt="Profile avatar"
                className="h-full w-full object-cover"
              />
            ) : (
              initials
            )}
          </div>
          {!isCollapsed && (
            <div className="py-3 pr-2">
              <p className="text-sm uppercase tracking-[0.2em] text-slate-400">
                Workspace
              </p>
              <p className="text-base font-semibold text-slate-100">
                {profile.fullName || "Demo Account"}
              </p>
              <p className="text-xs text-indigo-200">View profile</p>
              <p className="text-sm text-slate-400 mt-1">
                {profile.email || "demo@mybillbook.in"}
              </p>
            </div>
          )}
        </button>
        <button
          type="button"
          onClick={() => setIsCollapsed((prev) => !prev)}
          className={`mt-4 w-full flex items-center ${
            isCollapsed ? "justify-center" : "justify-between"
          } text-xs text-slate-400 hover:text-slate-200 transition`}
        >
          {!isCollapsed && <span>Collapse</span>}
          <span className="grid h-7 w-7 place-items-center rounded-md bg-slate-800/70">
            <svg
              viewBox="0 0 24 24"
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
            >
              {isCollapsed ? (
                <path d="M9 6l6 6l-6 6" />
              ) : (
                <path d="M15 6l-6 6l6 6" />
              )}
            </svg>
          </span>
        </button>
      </div>

      {/* Menu */}
      <nav className="flex-1 overflow-y-auto p-4 space-y-1">
        {/* Dashboard */}
        <NavLink
          to="/"
          className={({ isActive }) =>
            `${linkClass} ${isActive ? activeClass : ""}`
          }
        >
          <Icon>
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M3 11.5L12 4l9 7.5" />
              <path d="M5 10.5V20h5v-5h4v5h5v-9.5" />
            </svg>
          </Icon>
          <span className={labelClass}>Dashboard</span>
        </NavLink>

        {/* Inventory Section */}
        <div className="mt-6">
          {!isCollapsed && (
            <p className="px-4 mb-3 text-xs font-semibold text-slate-500 uppercase tracking-[0.25em]">
              Inventory
            </p>
          )}

          <NavLink
            to="/inventory"
            className={({ isActive }) =>
              `${linkClass} ${isActive ? activeClass : ""}`
            }
          >
            <Icon>
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M4 7h16v12H4z" />
                <path d="M4 7l4-3h8l4 3" />
                <path d="M4 12h16" />
              </svg>
            </Icon>
            <span className={labelClass}>Inventory</span>
          </NavLink>

          <NavLink
            to="/inventory/tools"
            className={({ isActive }) =>
              `${linkClass} ${isActive ? activeClass : ""}`
            }
          >
            <Icon>
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M4 6h5l3 3h8v5h-4v4h-4l-2-2H6l-2-2z" />
                <path d="M9 6V4h4v2" />
              </svg>
            </Icon>
            <span className={labelClass}>Tools</span>
          </NavLink>

          {!isCollapsed && (
            <div className="mt-1 pl-16 pr-3">
              <button
                type="button"
                onClick={() => setToolWorkflowOpen((prev) => !prev)}
                className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-sm transition ${
                  isToolWorkflowRoute
                    ? "bg-slate-800/70 text-white"
                    : "text-slate-300 hover:bg-slate-800/60 hover:text-white"
                }`}
                aria-expanded={toolWorkflowOpen}
                aria-controls="tool-workflow"
              >
                <span>Tools</span>
                <span
                  className={`grid h-6 w-6 place-items-center rounded-md bg-slate-800/70 transition ${
                    toolWorkflowOpen ? "rotate-180" : ""
                  }`}
                >
                  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
                    <path d="M6 9l6 6l6-6" />
                  </svg>
                </span>
              </button>
              {toolWorkflowOpen && (
                <div id="tool-workflow" className="mt-1 space-y-1 pl-3">
                  {TOOL_WORKFLOW.map((step) => (
                    <NavLink
                      key={step.id}
                      to={step.to}
                      className={() => {
                        const isStepActive = (step.matchPrefixes || [step.to]).some(
                          (prefix) => prefix && location.pathname.startsWith(prefix)
                        );
                        return [
                          "block rounded-md px-3 py-2 text-sm transition",
                          isStepActive
                            ? "bg-slate-800/80 text-white"
                            : "text-slate-300 hover:bg-slate-800/60 hover:text-white",
                        ].join(" ");
                      }}
                    >
                      {step.label}
                    </NavLink>
                  ))}
                </div>
              )}

              <button
                type="button"
                onClick={() => setToolEmployeesOpen((prev) => !prev)}
                className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-sm transition ${
                  isToolEmployeesRoute
                    ? "bg-slate-800/70 text-white"
                    : "text-slate-300 hover:bg-slate-800/60 hover:text-white"
                }`}
                aria-expanded={toolEmployeesOpen}
                aria-controls="tool-employee-workflow"
              >
                <span>Employee Details</span>
                <span
                  className={`grid h-6 w-6 place-items-center rounded-md bg-slate-800/70 transition ${
                    toolEmployeesOpen ? "rotate-180" : ""
                  }`}
                >
                  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
                    <path d="M6 9l6 6l6-6" />
                  </svg>
                </span>
              </button>
              {toolEmployeesOpen && (
                <div id="tool-employee-workflow" className="mt-1 space-y-1 pl-3">
                  {TOOL_EMPLOYEE_WORKFLOW.map((step) => (
                    <NavLink
                      key={step.id}
                      to={step.to}
                      className={() => {
                        const isStepActive = (step.matchPrefixes || [step.to]).some(
                          (prefix) => prefix && location.pathname.startsWith(prefix)
                        );
                        return [
                          "block rounded-md px-3 py-2 text-sm transition",
                          isStepActive
                            ? "bg-slate-800/80 text-white"
                            : "text-slate-300 hover:bg-slate-800/60 hover:text-white",
                        ].join(" ");
                      }}
                    >
                      {step.label}
                    </NavLink>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="px-0">
            <button
              type="button"
              onClick={() => {
                if (isCollapsed) {
                  navigate("/inventory/projects");
                  return;
                }
                setInventoryManagementOpen((prev) => !prev);
              }}
              className={`${linkClass} ${
                isInventoryManagementRoute ? activeClass : ""
              } w-full ${isCollapsed ? "" : "justify-between"}`}
              aria-expanded={inventoryManagementOpen}
              aria-controls="inventory-management-workflow"
            >
              <span className={`flex items-center ${isCollapsed ? "justify-center" : "gap-4"}`}>
                <Icon>
                  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
                    <path d="M4 7h16v12H4z" />
                    <path d="M8 7V5h8v2" />
                    <path d="M4 11h16" />
                  </svg>
                </Icon>
                <span className={labelClass}>Inventory Management</span>
              </span>
              {!isCollapsed && (
                <span
                  className={`ml-2 grid h-7 w-7 place-items-center rounded-md bg-slate-800/70 text-slate-300 transition ${
                    inventoryManagementOpen ? "rotate-180" : ""
                  }`}
                >
                  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
                    <path d="M6 9l6 6l6-6" />
                  </svg>
                </span>
              )}
            </button>
            {!isCollapsed && inventoryManagementOpen && (
              <div
                id="inventory-management-workflow"
                className="mt-2 space-y-1 pl-16 pr-3"
              >
                {INVENTORY_MANAGEMENT_WORKFLOW.map((step) => (
                  <NavLink
                    key={step.id}
                    to={step.to}
                    className={() => {
                      const isStepActive = (step.matchPrefixes || [step.to]).some(
                        (prefix) => prefix && location.pathname.startsWith(prefix)
                      );
                      return [
                        "block rounded-md px-3 py-2 text-sm transition",
                        isStepActive
                          ? "bg-slate-800/80 text-white"
                          : "text-slate-300 hover:bg-slate-800/60 hover:text-white",
                      ].join(" ");
                    }}
                  >
                    {step.label}
                  </NavLink>
                ))}
              </div>
            )}
          </div>

        </div>
      </nav>

      {/* Footer */}
      <div className="mt-auto px-4 pb-4">
        <NavLink
          to="/settings"
          className={({ isActive }) =>
            `${linkClass} ${isActive ? activeClass : "text-slate-300"}`
          }
        >
          <Icon>
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M12 8.5a3.5 3.5 0 1 0 0 7a3.5 3.5 0 0 0 0-7Z" />
              <path d="M19.4 15a7.9 7.9 0 0 0 .1-2l2.1-1.3l-2-3.5l-2.4.7a7.6 7.6 0 0 0-1.7-1l-.3-2.5H9l-.3 2.5a7.6 7.6 0 0 0-1.7 1l-2.4-.7l-2 3.5L4.6 13a7.9 7.9 0 0 0 .1 2l-2.1 1.3l2 3.5l2.4-.7a7.6 7.6 0 0 0 1.7 1l.3 2.5h6l.3-2.5a7.6 7.6 0 0 0 1.7-1l2.4.7l2-3.5L19.4 15Z" />
            </svg>
          </Icon>
          <span className={labelClass}>Settings</span>
        </NavLink>
        <button
          type="button"
          onClick={handleLogout}
          className="w-full mt-2 flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm text-slate-300 hover:bg-slate-800/80 transition"
        >
          <span className="grid h-8 w-8 place-items-center rounded-md bg-slate-800/70">
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M12 3v10" />
              <path d="M6 7a7 7 0 1 0 12 0" />
            </svg>
          </span>
          <span className={labelClass}>Logout</span>
        </button>
      </div>
    </aside>
  );
};

export default Sidebar;
