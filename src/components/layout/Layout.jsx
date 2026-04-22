import AppShell from "./AppShell";
import { Outlet } from "react-router-dom";

const Layout = ({ children }) => {
  return <AppShell>{children ?? <Outlet />}</AppShell>;
};

export default Layout;
