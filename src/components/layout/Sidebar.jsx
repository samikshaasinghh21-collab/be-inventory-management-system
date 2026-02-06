import { NavLink } from "react-router-dom";

const Sidebar = () => {
  const linkClass =
    "flex items-center gap-3 px-5 py-3 rounded-md hover:bg-slate-700 transition text-base";

  const activeClass =
    "bg-slate-700 font-semibold";

  return (
    <div className="w-72 h-screen bg-gradient-to-b from-slate-900 to-slate-800 text-white fixed">
      
      {/* Account / Logo */}
      <div className="p-5 border-b border-slate-700">
        <p className="text-base font-semibold text-slate-200">
          Demo Account
        </p>
        <p className="text-sm text-slate-400">
          demo@mybillbook.in
        </p>
      </div>

      {/* Menu */}
      <nav className="p-4 space-y-1">

        {/* Dashboard */}
        <NavLink
          to="/"
          className={({ isActive }) =>
            `${linkClass} ${isActive ? activeClass : ""}`
          }
        >
          🏠 Dashboard
        </NavLink>

        {/* Inventory Section */}
        <div className="mt-6">
          <p className="px-5 mb-3 text-sm font-semibold text-slate-400 uppercase tracking-wide">
            Inventory
          </p>

          <NavLink
            to="/inventory"
            className={({ isActive }) =>
              `${linkClass} ${isActive ? activeClass : ""}`
            }
          >
            📦 Inventory
          </NavLink>

          <NavLink
            to="/inventory/products"
            className={({ isActive }) =>
              `${linkClass} ${isActive ? activeClass : ""}`
            }
          >
            🧱 Products
          </NavLink>

          <NavLink
            to="/inventory/create-item"
            className={({ isActive }) =>
              `${linkClass} ${isActive ? activeClass : ""}`
            }
          >
            ➕ Create Items
          </NavLink>

          <NavLink
            to="/inventory/create-vendors"
            className={({ isActive }) =>
              `${linkClass} ${isActive ? activeClass : ""}`
            }
          >
            👷 Create Vendors
          </NavLink>

          <NavLink
            to="/inventory/create-product"
            className={({ isActive }) =>
              `${linkClass} ${isActive ? activeClass : ""}`
            }
          >
            🧩 Create Product
          </NavLink>

          <NavLink
            to="/inventory/receive-goods"
            className={({ isActive }) =>
              `${linkClass} ${isActive ? activeClass : ""}`
            }
          >
            📥 Receive Goods
          </NavLink>

          <NavLink
            to="/inventory/allocate-projects"
            className={({ isActive }) =>
              `${linkClass} ${isActive ? activeClass : ""}`
            }
          >
            📊 Allocate to Projects
          </NavLink>

          <NavLink
            to="/inventory/delivery-challan"
            className={({ isActive }) =>
              `${linkClass} ${isActive ? activeClass : ""}`
            }
          >
            🚚 Delivery Challan
          </NavLink>
        </div>

        {/* Footer */}
        <div className="absolute bottom-4 w-full px-5 text-sm text-slate-400">
          ⚙ Settings<br />
          ⏻ Logout
        </div>
      </nav>
    </div>
  );
};

export default Sidebar;
