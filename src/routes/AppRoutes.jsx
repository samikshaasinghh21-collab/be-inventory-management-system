import { Navigate, Routes, Route } from "react-router-dom";
import Layout from "../components/layout/Layout";
import MainLayout from "../layouts/MainLayout";
import Dashboard from "../pages/Dashboard";
import InventoryHome from "../pages/InventoryHome";
import ProjectsHome from "../pages/ProjectsHome";
import ToolsHome from "../pages/ToolsHome";
import ToolsAddTool from "../pages/ToolsAddTool";
import ToolsAssignTool from "../pages/ToolsAssignTool";
import ToolsAnalytics from "../pages/ToolsAnalytics";
import ToolsMaintenance from "../pages/ToolsMaintenance";
import ToolsAssignments from "../pages/ToolsAssignments";
import ToolsCategories from "../pages/ToolsCategories";
import ToolsHistory from "../pages/ToolsHistory";
import ToolsBulkImport from "../pages/ToolsBulkImport";
import ToolsHandoverTool from "../pages/ToolsHandoverTool";
import ToolsMap from "../pages/ToolsMap";
import HrmsPlaceholder from "../pages/HrmsPlaceholder";
import ProjectDashboard from "../pages/projectManagement/ProjectDashboard";
import ProjectManagementProjects from "../pages/projectManagement/ProjectManagementProjects";
import ProjectManagementTasks from "../pages/projectManagement/ProjectManagementTasks";
import ProjectManagementTeamAllocation from "../pages/projectManagement/ProjectManagementTeamAllocation";
import ProjectManagementSiteReports from "../pages/projectManagement/ProjectManagementSiteReports";
import ProjectManagementPlaceholder from "../pages/projectManagement/ProjectManagementPlaceholder";
import { projectManagementPlaceholderPages } from "../pages/projectManagement/projectManagementData";
import Settings from "../pages/Settings";
import Profile from "../pages/Profile";
import CreateAccount from "../pages/CreateAccount";
import SsoCallback from "../pages/SsoCallback";

import EditItems from "../components/inventory/EditItems";
import CreateVendors from "../components/inventory/CreateVendors";
import CreateProjects from "../components/inventory/CreateProjects";
import CreateProduct from "../components/inventory/CreateProduct";
import ReceiveGoods from "../components/inventory/ReceiveGoods";
import DeliveryChallan from "../components/inventory/DeliveryChallan";
import Product from "../components/inventory/Product";

import Cart from "../components/inventory/Cart";
import Boq from "../components/inventory/Boq";
import Vendors from "../components/inventory/Vendors";
import Customers from "../components/inventory/Customers";
import Locations from "../components/inventory/Locations";
import PurchaseOrder from "../components/inventory/PurchaseOrder";
import PurchaseOrderRegister from "../components/inventory/PurchaseOrderRegister";
import Invoice from "../components/inventory/Invoice";
import Invoices from "../components/inventory/Invoices";
import ReceiveGoodsRegister from "../components/inventory/ReceiveGoodsRegister";
import Consumption from "../components/inventory/Consumption";
import BoqDetail from "../components/inventory/BoqDetail";
import ReallocationRegister from "../components/inventory/ReallocationRegister";
import ReportsPage from "../components/inventory/ReportsPage";

const HRMS_PAGE_ROUTES = [
  { path: "/dashboard", page: "dashboard" },
  { path: "/employees", page: "employees" },
  { path: "/employees/list", page: "employees" },
  { path: "/employees/add", page: "add-employee" },
  { path: "/employees/profile", page: "employee-profile" },
  { path: "/employees/profile/:employeeId", page: "employee-profile" },
  { path: "/employees/print-profile", page: "employee-profile" },
  { path: "/employees/print-profile/:employeeId", page: "employee-profile" },
  { path: "/reviews", page: "reviews" },
  { path: "/reviews/add", page: "reviews" },
  { path: "/reviews/salary-reassessment", page: "salary-reassessment" },
  { path: "/reviews/history", page: "reviews" },
  { path: "/attendance", page: "attendance" },
  { path: "/payroll", page: "payroll" },
  { path: "/payslip", page: "payslip" },
  { path: "/relieving", page: "relieving" },
  { path: "/relieving/exit-request", page: "relieving" },
  { path: "/relieving/final-settlement", page: "relieving" },
  { path: "/relieving/letters", page: "relieving" },
  { path: "/search", page: "search" },
  { path: "/reports", page: "reports" },
  { path: "/permissions", page: "permissions" },
  { path: "/hrms", page: "dashboard" },
  { path: "/hrms/employees/add", page: "add-employee" },
  { path: "/hrms/employees/list", page: "employees" },
  { path: "/hrms/employees/profile", page: "employee-profile" },
  { path: "/hrms/employees/profile/:employeeId", page: "employee-profile" },
  { path: "/hrms/employees/print-profile", page: "employee-profile" },
  { path: "/hrms/employees/print-profile/:employeeId", page: "employee-profile" },
  { path: "/hrms/reviews/add", page: "reviews" },
  { path: "/hrms/reviews/salary-reassessment", page: "salary-reassessment" },
  { path: "/hrms/reviews/history", page: "reviews" },
  { path: "/hrms/payroll/monthly-attendance", page: "attendance" },
  { path: "/hrms/payroll/salary-processing", page: "payroll" },
  { path: "/hrms/payroll/payslip", page: "payslip" },
  { path: "/hrms/relieving/exit-request", page: "relieving" },
  { path: "/hrms/relieving/final-settlement", page: "relieving" },
  { path: "/hrms/relieving/letters", page: "relieving" },
  { path: "/hrms/search", page: "search" },
  { path: "/hrms/reports", page: "reports" },
  { path: "/hrms/permissions", page: "permissions" },
];

const AppRoutes = () => {
  return (
    <Routes>
      <Route
        path="/login"
        element={<HrmsPlaceholder page="login" />}
      />
      <Route path="/create-account" element={<CreateAccount />} />
      <Route path="/auth/sso/callback" element={<SsoCallback />} />
      <Route element={<Layout />}>
        <Route path="/" element={<Dashboard />} />
      </Route>
      <Route element={<MainLayout />}>
        <Route path="/inventory" element={<InventoryHome />} />
        <Route
          path="/inventory/material-planning"
          element={<Navigate replace to="/inventory" />}
        />
        <Route path="/inventory/tools" element={<ToolsHome />} />
        <Route path="/inventory/tools/list" element={<ToolsHome />} />
        <Route path="/inventory/tools/new" element={<ToolsAddTool />} />
        <Route path="/inventory/tools/assign" element={<ToolsAssignTool />} />
        <Route
          path="/inventory/tools/handover"
          element={<ToolsHandoverTool />}
        />
        <Route
          path="/inventory/tools/employees"
          element={<Navigate replace to="/inventory/tools" />}
        />
        <Route
          path="/inventory/tools/employees/new"
          element={<Navigate replace to="/inventory/tools" />}
        />
        <Route path="/inventory/tools/analytics" element={<ToolsAnalytics />} />
        <Route
          path="/inventory/tools/maintenance"
          element={<ToolsMaintenance />}
        />
        <Route
          path="/inventory/tools/assignments"
          element={<ToolsAssignments />}
        />
        <Route
          path="/inventory/tools/categories"
          element={<ToolsCategories />}
        />
        <Route path="/inventory/tools/history" element={<ToolsHistory />} />
        <Route
          path="/inventory/tools/bulk-import"
          element={<ToolsBulkImport />}
        />
        <Route path="/inventory/tools/map" element={<ToolsMap />} />
        <Route path="/inventory/projects" element={<ProjectsHome />} />
        <Route path="/inventory/products" element={<Product />} />

        <Route path="/inventory/create-item" element={<CreateProduct />} />
        <Route path="/inventory/edit/:id" element={<EditItems />} />
        <Route path="/inventory/vendors" element={<Vendors />} />
        <Route path="/inventory/customers" element={<Customers />} />
        <Route path="/inventory/create-vendors" element={<CreateVendors />} />
        <Route path="/inventory/create-project" element={<CreateProjects />} />
        <Route path="/inventory/create-product" element={<CreateProduct />} />

        <Route path="/inventory/boq" element={<Boq />} />
        <Route path="/inventory/boq/:id" element={<BoqDetail />} />
        <Route path="/inventory/locations" element={<Locations />} />
        <Route path="/inventory/purchase-order" element={<PurchaseOrder />} />
        <Route path="/inventory/purchase-orders" element={<PurchaseOrder />} />
        <Route path="/inventory/receive-goods" element={<ReceiveGoods />} />
        <Route path="/inventory/receive-goods-register" element={<ReceiveGoodsRegister />} />
        <Route path="/inventory/allocate-projects" element={<DeliveryChallan />} />
        <Route path="/inventory/delivery-challan" element={<DeliveryChallan />} />
        <Route
          path="/inventory/purchase-order-register"
          element={<PurchaseOrderRegister />}
        />
        <Route path="/inventory/invoice" element={<Invoice />} />
        <Route path="/inventory/invoices" element={<Invoices />} />
        <Route path="/inventory/consumption" element={<Consumption />} />
        <Route path="/inventory/return-dc" element={<Navigate replace to="/inventory/delivery-challan" />} />
        <Route path="/inventory/reallocate-return" element={<Navigate replace to="/inventory/delivery-challan" />} />
        <Route path="/inventory/reallocation-register" element={<ReallocationRegister />} />
        <Route path="/inventory/reports" element={<ReportsPage />} />
        {HRMS_PAGE_ROUTES.map((screen) => (
          <Route
            key={screen.path}
            path={screen.path}
            element={<HrmsPlaceholder page={screen.page} />}
          />
        ))}
        <Route
          path="/project-management"
          element={<Navigate replace to="/project-management/dashboard" />}
        />
        <Route
          path="/project-management/dashboard"
          element={<ProjectDashboard />}
        />
        <Route
          path="/project-management/projects"
          element={<ProjectManagementProjects />}
        />
        <Route
          path="/project-management/tasks"
          element={<ProjectManagementTasks />}
        />
        <Route
          path="/project-management/team-allocation"
          element={<ProjectManagementTeamAllocation />}
        />
        <Route
          path="/project-management/site-reports"
          element={<ProjectManagementSiteReports />}
        />
        {projectManagementPlaceholderPages
          .filter((screen) => !["projects", "tasks", "team-allocation", "site-reports"].includes(screen.key))
          .map((screen) => (
          <Route
            key={screen.path}
            path={screen.path}
            element={<ProjectManagementPlaceholder page={screen.key} />}
          />
        ))}

        <Route path="/inventory/cart" element={<Cart />} />
        <Route path="/account" element={<Profile />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="/settings" element={<Settings />} />
      </Route>
    </Routes>
  );
};

export default AppRoutes;
