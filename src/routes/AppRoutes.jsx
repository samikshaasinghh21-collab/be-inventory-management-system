import { Routes, Route } from "react-router-dom";
import Layout from "../components/layout/Layout";
import MainLayout from "../layouts/MainLayout";
import Dashboard from "../pages/Dashboard";
import InventoryHome from "../pages/InventoryHome";
import ProjectsHome from "../pages/ProjectsHome";
import Settings from "../pages/Settings";
import Profile from "../pages/Profile";
import Login from "../pages/Login";
import CreateAccount from "../pages/CreateAccount";
import SsoCallback from "../pages/SsoCallback";

import CreateItems from "../components/inventory/CreateItems";
import EditItems from "../components/inventory/EditItems";
import CreateVendors from "../components/inventory/CreateVendors";
import CreateProjects from "../components/inventory/CreateProjects";
import CreateProduct from "../components/inventory/CreateProduct";
import ReceiveGoods from "../components/inventory/ReceiveGoods";
import AllocateToProjects from "../components/inventory/AllocateToProjects";
import DeliveryChallan from "../components/inventory/DeliveryChallan";
import Product from "../components/inventory/Product";

import Cart from "../components/inventory/Cart";
import Boq from "../components/inventory/Boq";
import Vendors from "../components/inventory/Vendors";
import Locations from "../components/inventory/Locations";
import PurchaseOrder from "../components/inventory/PurchaseOrder";
import DeliveryConfirmation from "../components/inventory/DeliveryConfirmation";
import PurchaseOrderRegister from "../components/inventory/PurchaseOrderRegister";
import Invoice from "../components/inventory/Invoice";
import GoodsDelivered from "../components/inventory/GoodsDelivered";
import ReceiveGoodsRegister from "../components/inventory/ReceiveGoodsRegister";
import Consumption from "../components/inventory/Consumption";
import ReturnReallocate from "../components/inventory/ReturnReallocate";
import ReturnDc from "../components/inventory/ReturnDc";
import BoqDetail from "../components/inventory/BoqDetail";

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
        <Route path="/inventory/projects" element={<ProjectsHome />} />
        <Route path="/inventory/products" element={<Product />} />

        <Route path="/inventory/create-item" element={<CreateItems />} />
        <Route path="/inventory/edit/:id" element={<EditItems />} />
        <Route path="/inventory/vendors" element={<Vendors />} />
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
        <Route path="/inventory/allocate-projects" element={<AllocateToProjects />} />
        <Route path="/inventory/delivery-challan" element={<DeliveryChallan />} />
        <Route path="/inventory/delivery-confirmation" element={<DeliveryConfirmation />} />
        <Route
          path="/inventory/purchase-order-register"
          element={<PurchaseOrderRegister />}
        />
        <Route path="/inventory/invoice" element={<Invoice />} />
        <Route path="/inventory/goods-delivered" element={<GoodsDelivered />} />
        <Route path="/inventory/consumption" element={<Consumption />} />
        <Route path="/inventory/return-reallocate" element={<ReturnReallocate />} />
        <Route path="/inventory/reallocate-return" element={<ReturnReallocate />} />
        <Route path="/inventory/return-dc" element={<ReturnDc />} />

        <Route path="/inventory/cart" element={<Cart />} />
        <Route path="/account" element={<Profile />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="/settings" element={<Settings />} />
      </Route>
    </Routes>
  );
};

export default AppRoutes;
