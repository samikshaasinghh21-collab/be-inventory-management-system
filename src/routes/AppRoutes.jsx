import HrmsReportDetails from "../pages/HrmsReportDetails";
import { Navigate, Routes, Route } from "react-router-dom";
import { lazy, Suspense } from "react";

const lazyPage = (loader) => lazy(loader);
const Layout = lazyPage(() => import("../components/layout/Layout"));
const MainLayout = lazyPage(() => import("../layouts/MainLayout"));
const ProtectedRoute = lazyPage(() => import("../components/auth/ProtectedRoute"));
const Dashboard = lazyPage(() => import("../pages/Dashboard"));
const InventoryHome = lazyPage(() => import("../pages/InventoryHome"));
const ProjectsHome = lazyPage(() => import("../pages/ProjectsHome"));
const ToolsHome = lazyPage(() => import("../pages/ToolsHome"));
const ToolsAddTool = lazyPage(() => import("../pages/ToolsAddTool"));
const ToolsAssignTool = lazyPage(() => import("../pages/ToolsAssignTool"));
const ToolsAnalytics = lazyPage(() => import("../pages/ToolsAnalytics"));
const ToolsMaintenance = lazyPage(() => import("../pages/ToolsMaintenance"));
const ToolsAssignments = lazyPage(() => import("../pages/ToolsAssignments"));
const ToolsCategories = lazyPage(() => import("../pages/ToolsCategories"));
const ToolsHistory = lazyPage(() => import("../pages/ToolsHistory"));
const ToolsBulkImport = lazyPage(() => import("../pages/ToolsBulkImport"));
const ToolsHandoverTool = lazyPage(() => import("../pages/ToolsHandoverTool"));
const ToolsMap = lazyPage(() => import("../pages/ToolsMap"));
const HrmsPlaceholder = lazyPage(() => import("../pages/HrmsPlaceholder"));
const ProjectDashboard = lazyPage(() => import("../pages/projectManagement/ProjectDashboard"));
const ProjectManagementProjects = lazyPage(() => import("../pages/projectManagement/ProjectManagementProjects"));
const ProjectManagementTasks = lazyPage(() => import("../pages/projectManagement/ProjectManagementTasks"));
const ProjectManagementTeamAllocation = lazyPage(() => import("../pages/projectManagement/ProjectManagementTeamAllocation"));
const ProjectManagementSiteReports = lazyPage(() => import("../pages/projectManagement/ProjectManagementSiteReports"));
const ProjectManagementInventoryAllocation = lazyPage(() => import("../pages/projectManagement/ProjectManagementInventoryAllocation"));
const ProjectManagementPurchaseTracking = lazyPage(() => import("../pages/projectManagement/ProjectManagementPurchaseTracking"));
const ProjectManagementFinancials = lazyPage(() => import("../pages/projectManagement/ProjectManagementFinancials"));
const ProjectManagementMilestones = lazyPage(() => import("../pages/projectManagement/ProjectManagementMilestones"));
const ProjectManagementDocuments = lazyPage(() => import("../pages/projectManagement/ProjectManagementDocuments"));
const Settings = lazyPage(() => import("../pages/Settings"));
const Profile = lazyPage(() => import("../pages/Profile"));
const Login = lazyPage(() => import("../pages/Login"));
const AuthEntry = lazyPage(() => import("../components/auth/AuthEntry"));
const CreateAccount = lazyPage(() => import("../pages/CreateAccount"));
const SsoCallback = lazyPage(() => import("../pages/SsoCallback"));
const PasswordReset = lazyPage(() => import("../pages/PasswordReset"));
const EditItems = lazyPage(() => import("../components/inventory/EditItems"));
const CreateVendors = lazyPage(() => import("../components/inventory/CreateVendors"));
const CreateProjects = lazyPage(() => import("../components/inventory/CreateProjects"));
const CreateProduct = lazyPage(() => import("../components/inventory/CreateProduct"));
const ReceiveGoods = lazyPage(() => import("../components/inventory/ReceiveGoods"));
const DeliveryChallan = lazyPage(() => import("../components/inventory/DeliveryChallan"));
const Product = lazyPage(() => import("../components/inventory/Product"));
const Cart = lazyPage(() => import("../components/inventory/Cart"));
const Boq = lazyPage(() => import("../components/inventory/Boq"));
const PartyDetails = lazyPage(() => import("../components/inventory/PartyDetails"));
const Vendors = lazyPage(() => import("../components/inventory/Vendors"));
const Customers = lazyPage(() => import("../components/inventory/Customers"));
const Locations = lazyPage(() => import("../components/inventory/Locations"));
const PurchaseOrder = lazyPage(() => import("../components/inventory/PurchaseOrder"));
const PurchaseOrderRegister = lazyPage(() => import("../components/inventory/PurchaseOrderRegister"));
const Invoice = lazyPage(() => import("../components/inventory/Invoice"));
const Invoices = lazyPage(() => import("../components/inventory/Invoices"));
const ReceiveGoodsRegister = lazyPage(() => import("../components/inventory/ReceiveGoodsRegister"));
const Consumption = lazyPage(() => import("../components/inventory/Consumption"));
const BoqDetail = lazyPage(() => import("../components/inventory/BoqDetail"));
const ReportsPage = lazyPage(() => import("../components/inventory/ReportsPage"));

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
  { path: "/relieving/letters", page: "relieving-letters" },
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
  { path: "/hrms/relieving/letters", page: "relieving-letters" },
  { path: "/hrms/search", page: "search" },
  { path: "/hrms/reports", page: "reports" },
  { path: "/hrms/permissions", page: "permissions" },
];

const AppRoutes = () => {
  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-50 p-8 text-sm text-slate-600" role="status">Loading workspace…</div>}>
      <Routes>
      <Route path="/login" element={<AuthEntry><Login /></AuthEntry>} />
      <Route path="/create-account" element={<AuthEntry><CreateAccount /></AuthEntry>} />
      <Route path="/forgot-password" element={<AuthEntry><PasswordReset requestOnly /></AuthEntry>} />
      <Route path="/reset-password" element={<AuthEntry><PasswordReset /></AuthEntry>} />
      <Route path="/auth/sso/callback" element={<AuthEntry><SsoCallback /></AuthEntry>} />
      <Route element={<ProtectedRoute />}>
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
        <Route path="/inventory/vendors/:id" element={<PartyDetails kind="vendors" />} />
        <Route path="/inventory/customers/:id" element={<PartyDetails kind="customers" />} />
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
        <Route path="/inventory/reallocation-register" element={<Navigate replace to="/inventory/delivery-challan" />} />
        <Route path="/inventory/reports" element={<ReportsPage />} />
        <Route path="/hrms/reports/:reportType" element={<HrmsReportDetails />} />
        <Route path="/reports/:reportType" element={<HrmsReportDetails />} />
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
        <Route
          path="/project-management/inventory-allocation"
          element={<ProjectManagementInventoryAllocation />}
        />
        <Route
          path="/project-management/purchase-tracking"
          element={<ProjectManagementPurchaseTracking />}
        />
        <Route
          path="/project-management/financials"
          element={<ProjectManagementFinancials />}
        />
        <Route
          path="/project-management/milestones"
          element={<ProjectManagementMilestones />}
        />
        <Route
          path="/project-management/timeline"
          element={<Navigate replace to="/project-management/milestones" />}
        />
        <Route
          path="/project-management/project-attendance"
          element={<Navigate replace to="/project-management/site-reports" />}
        />
        <Route
          path="/project-management/documents"
          element={<ProjectManagementDocuments />}
        />
        <Route path="/inventory/cart" element={<Cart />} />
        <Route path="/account" element={<Profile />} />
        <Route path="/profile" element={<Profile />} />
          <Route path="/settings" element={<Settings />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate replace to="/" />} />
      </Routes>
    </Suspense>
  );
};

export default AppRoutes;
