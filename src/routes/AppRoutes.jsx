import { Navigate, Routes, Route } from "react-router-dom";
import Layout from "../components/layout/Layout";
import MainLayout from "../layouts/MainLayout";
import Dashboard from "../pages/Dashboard";
import InventoryHome from "../pages/InventoryHome";
import ProjectsHome from "../pages/ProjectsHome";
import ToolsHome from "../pages/ToolsHome";
import ToolsAddTool from "../pages/ToolsAddTool";
import ToolsAssignTool from "../pages/ToolsAssignTool";
import ToolsEmployees from "../pages/ToolsEmployees";
import ToolsAddEmployee from "../pages/ToolsAddEmployee";
import ToolsAnalytics from "../pages/ToolsAnalytics";
import ToolsMaintenance from "../pages/ToolsMaintenance";
import ToolsAssignments from "../pages/ToolsAssignments";
import ToolsCategories from "../pages/ToolsCategories";
import ToolsHistory from "../pages/ToolsHistory";
import ToolsBulkImport from "../pages/ToolsBulkImport";
import ToolsHandoverTool from "../pages/ToolsHandoverTool";
import ToolsMap from "../pages/ToolsMap";
import Settings from "../pages/Settings";
import Profile from "../pages/Profile";
import Login from "../pages/Login";
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
import ReceiveGoodsRegister from "../components/inventory/ReceiveGoodsRegister";
import Consumption from "../components/inventory/Consumption";
import BoqDetail from "../components/inventory/BoqDetail";
import ReportsPage from "../components/inventory/ReportsPage";

const AppRoutes = () => {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
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
        <Route path="/inventory/tools/employees" element={<ToolsEmployees />} />
        <Route
          path="/inventory/tools/employees/new"
          element={<ToolsAddEmployee />}
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
        <Route path="/inventory/consumption" element={<Consumption />} />
        <Route path="/inventory/return-dc" element={<Navigate replace to="/inventory" />} />
        <Route path="/inventory/reports" element={<ReportsPage />} />

        <Route path="/inventory/cart" element={<Cart />} />
        <Route path="/account" element={<Profile />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="/settings" element={<Settings />} />
      </Route>
    </Routes>
  );
};

export default AppRoutes;
