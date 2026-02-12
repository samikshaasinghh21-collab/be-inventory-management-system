import { useEffect, useState } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";

const Icon = ({ children }) => (
  <span className="grid h-9 w-9 place-items-center rounded-md bg-slate-800/70 text-slate-200 transition group-hover:bg-slate-700">
    {children}
  </span>
);

const PROJECT_WORKFLOW = [
  { id: "projects", label: "Projects", to: "/inventory/projects" },
  { id: "create-project", label: "Create Project", to: "/inventory/create-project" },
  { id: "boq", label: "Create Bill of Quantity (BOQ)", to: "/inventory/boq" },
  { id: "locations", label: "Select / Manage Location", to: "/inventory/locations" },
  { id: "purchase-order", label: "Purchase Order", to: "/inventory/purchase-order" },
  { id: "receive-inventory", label: "Receive Inventory - Location based", to: "/inventory/receive-goods" },
  { id: "allocate-inventory", label: "Allocate Inventory to Location / Project", to: "/inventory/allocate-projects" },
  { id: "delivery-challan", label: "Allocate Items (DC)", to: "/inventory/allocate-projects" },
  { id: "goods-delivered", label: "Goods Delivered to Location (Confirmation screen)", to: "/inventory/goods-delivered" },
  { id: "consumption", label: "Consumption (Material Used)", to: "/inventory/consumption" },
  { id: "reallocate-return", label: "Reallocate / Return Inventory", to: "/inventory/reallocate-return" },
];

const VENDOR_WORKFLOW = [
  { id: "vendors", label: "Vendors", to: "/inventory/vendors" },
  { id: "create-vendor", label: "Create Vendor", to: "/inventory/create-vendors" },
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
  const [projectsOpen, setProjectsOpen] = useState(false);
  const [vendorsOpen, setVendorsOpen] = useState(false);

  const isProjectRoute = PROJECT_WORKFLOW.some(
    (step) => step.to && location.pathname.startsWith(step.to)
  );
  const isVendorRoute = VENDOR_WORKFLOW.some(
    (step) => step.to && location.pathname.startsWith(step.to)
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
    if (isProjectRoute && !isCollapsed) {
      setProjectsOpen(true);
    }
  }, [isProjectRoute, isCollapsed]);

  useEffect(() => {
    if (isVendorRoute && !isCollapsed) {
      setVendorsOpen(true);
    }
  }, [isVendorRoute, isCollapsed]);

  const linkClass = [
    "group flex items-center rounded-lg transition text-[15px] text-slate-200 hover:bg-slate-800/80",
    isCollapsed ? "justify-center px-2 py-3" : "gap-4 px-4 py-3",
  ].join(" ");

  const activeClass =
    "bg-slate-800/90 text-white font-semibold shadow-[inset_0_0_0_1px_rgba(148,163,184,0.2)]";

  const labelClass = isCollapsed
    ? "opacity-0 w-0 overflow-hidden"
    : "opacity-100";

  return (
    <aside
      className={`${
        isCollapsed ? "w-20" : "w-72"
      } h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-900 text-white fixed transition-[width] duration-200 flex flex-col`}
    >
      {/* Account / Logo */}
      <div className="p-5 border-b border-slate-800">
        <div className={`flex items-center ${isCollapsed ? "justify-center" : "gap-3"}`}>
          <div className="h-11 w-11 rounded-xl bg-slate-800/80 border border-slate-700/70 grid place-items-center text-slate-200 text-sm font-semibold">
            ERP
          </div>
          {!isCollapsed && (
            <div>
              <p className="text-sm uppercase tracking-[0.2em] text-slate-400">
                Workspace
              </p>
              <p className="text-base font-semibold text-slate-100">
                Demo Account
              </p>
            </div>
          )}
        </div>
        {!isCollapsed && (
          <p className="text-sm text-slate-400 mt-2">
            demo@mybillbook.in
          </p>
        )}
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
            to="/inventory/products"
            className={({ isActive }) =>
              `${linkClass} ${isActive ? activeClass : ""}`
            }
          >
            <Icon>
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
                <rect x="4" y="4" width="7" height="7" />
                <rect x="13" y="4" width="7" height="7" />
                <rect x="4" y="13" width="7" height="7" />
                <rect x="13" y="13" width="7" height="7" />
              </svg>
            </Icon>
            <span className={labelClass}>Products</span>
          </NavLink>

          <div className="px-0">
            <button
              type="button"
              onClick={() => {
                if (isCollapsed) {
                  navigate("/inventory/projects");
                  return;
                }
                setProjectsOpen((prev) => !prev);
              }}
              className={`${linkClass} ${
                isProjectRoute ? activeClass : ""
              } w-full ${isCollapsed ? "" : "justify-between"}`}
              aria-expanded={projectsOpen}
              aria-controls="projects-workflow"
            >
              <span className={`flex items-center ${isCollapsed ? "justify-center" : "gap-4"}`}>
                <Icon>
                  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
                    <path d="M4 7h16v12H4z" />
                    <path d="M8 7V5h8v2" />
                    <path d="M4 11h16" />
                  </svg>
                </Icon>
                <span className={labelClass}>Projects</span>
              </span>
              {!isCollapsed && (
                <span
                  className={`ml-2 grid h-7 w-7 place-items-center rounded-md bg-slate-800/70 text-slate-300 transition ${
                    projectsOpen ? "rotate-180" : ""
                  }`}
                >
                  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
                    <path d="M6 9l6 6l6-6" />
                  </svg>
                </span>
              )}
            </button>
            {!isCollapsed && projectsOpen && (
              <div id="projects-workflow" className="mt-2 space-y-1 pl-16 pr-3">
                {PROJECT_WORKFLOW.map((step) => (
                  <NavLink
                    key={step.id}
                    to={step.to}
                    className={({ isActive }) =>
                      [
                        "block rounded-md px-3 py-2 text-sm transition",
                        isActive
                          ? "bg-slate-800/80 text-white"
                          : "text-slate-300 hover:bg-slate-800/60 hover:text-white",
                      ].join(" ")
                    }
                  >
                    {step.label}
                  </NavLink>
                ))}
              </div>
            )}
          </div>

          <div className="px-0">
            <button
              type="button"
              onClick={() => {
                if (isCollapsed) {
                  navigate("/inventory/vendors");
                  return;
                }
                setVendorsOpen((prev) => !prev);
              }}
              className={`${linkClass} ${
                isVendorRoute ? activeClass : ""
              } w-full ${isCollapsed ? "" : "justify-between"}`}
              aria-expanded={vendorsOpen}
              aria-controls="vendors-workflow"
            >
              <span className={`flex items-center ${isCollapsed ? "justify-center" : "gap-4"}`}>
                <Icon>
                  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
                    <path d="M7 8a3 3 0 1 0 6 0a3 3 0 0 0-6 0Z" />
                    <path d="M3.5 18a5.5 5.5 0 0 1 11 0" />
                    <path d="M14.5 8h6" />
                  </svg>
                </Icon>
                <span className={labelClass}>Vendors</span>
              </span>
              {!isCollapsed && (
                <span
                  className={`ml-2 grid h-7 w-7 place-items-center rounded-md bg-slate-800/70 text-slate-300 transition ${
                    vendorsOpen ? "rotate-180" : ""
                  }`}
                >
                  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
                    <path d="M6 9l6 6l6-6" />
                  </svg>
                </span>
              )}
            </button>
            {!isCollapsed && vendorsOpen && (
              <div id="vendors-workflow" className="mt-2 space-y-1 pl-16 pr-3">
                {VENDOR_WORKFLOW.map((step) => (
                  <NavLink
                    key={step.id}
                    to={step.to}
                    className={({ isActive }) =>
                      [
                        "block rounded-md px-3 py-2 text-sm transition",
                        isActive
                          ? "bg-slate-800/80 text-white"
                          : "text-slate-300 hover:bg-slate-800/60 hover:text-white",
                      ].join(" ")
                    }
                  >
                    {step.label}
                  </NavLink>
                ))}
              </div>
            )}
          </div>

          <NavLink
            to="/inventory/create-product"
            className={({ isActive }) =>
              `${linkClass} ${isActive ? activeClass : ""}`
            }
          >
            <Icon>
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M5 7h14v10H5z" />
                <path d="M9 7V5h6v2" />
                <path d="M7 10h10" />
              </svg>
            </Icon>
            <span className={labelClass}>Create Product</span>
          </NavLink>

          <NavLink
            to="/inventory/receive-goods"
            className={({ isActive }) =>
              `${linkClass} ${isActive ? activeClass : ""}`
            }
          >
            <Icon>
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M4 6h13v12H4z" />
                <path d="M17 9h3l1 3v6h-4" />
                <path d="M9 12h4" />
              </svg>
            </Icon>
            <span className={labelClass}>Receive Goods</span>
          </NavLink>

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
        <button className="w-full mt-2 flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm text-slate-300 hover:bg-slate-800/80 transition">
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

