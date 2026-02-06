import Sidebar from "../components/layout/Sidebar";
import { Outlet } from "react-router-dom";

const MainLayout = () => {
  return (
    <div className="flex">
      <Sidebar />
      <main className="flex-1 ml-72 bg-slate-100 min-h-screen">
        <Outlet />
      </main>
    </div>
  );
};

export default MainLayout;
