import Sidebar from "../components/layout/Sidebar";
import { Outlet } from "react-router-dom";

const MainLayout = () => {
  return (
    <div className="flex">
      <Sidebar />
      <main
        className="flex-1 bg-slate-100 min-h-screen transition-[margin] duration-200"
        style={{ marginLeft: "var(--sidebar-width, 18rem)" }}
      >
        <Outlet />
      </main>
    </div>
  );
};

export default MainLayout;
