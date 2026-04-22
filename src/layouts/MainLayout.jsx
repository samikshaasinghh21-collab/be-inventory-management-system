import AppShell from "../components/layout/AppShell";
import { Outlet } from "react-router-dom";

const MainLayout = () => {
  return <AppShell><Outlet /></AppShell>;
};

export default MainLayout;
