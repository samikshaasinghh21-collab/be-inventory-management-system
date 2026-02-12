import { Routes, Route } from "react-router-dom";
import Layout from "../components/layout/Layout";
import MainLayout from "../layouts/MainLayout";
import Dashboard from "../pages/Dashboard";
import InventoryHome from "../pages/InventoryHome";
import ProjectsHome from "../pages/ProjectsHome";
import Settings from "../pages/Settings";

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
<<<<<<< HEAD
import DeliveryConfirmation from "../components/inventory/DeliveryConfirmation";
=======
import PurchaseOrderRegister from "../components/inventory/PurchaseOrderRegister";
import Invoice from "../components/inventory/Invoice";
import GoodsDelivered from "../components/inventory/GoodsDelivered";
>>>>>>> ab340f3402952da5e02c7b117ed4c40f3d1549b6
import Consumption from "../components/inventory/Consumption";
import ReturnReallocate from "../components/inventory/ReturnReallocate";
import ReturnDc from "../components/inventory/ReturnDc";

const AppRoutes = () => {
  return (
    <Routes>
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
        <Route path="/inventory/locations" element={<Locations />} />
        <Route path="/inventory/purchase-order" element={<PurchaseOrder />} />
<<<<<<< HEAD
        <Route path="/inventory/purchase-orders" element={<PurchaseOrder />} />

        <Route path="/inventory/receive-goods" element={<ReceiveGoods />} />
        <Route path="/inventory/allocate-projects" element={<AllocateToProjects />} />
        <Route path="/inventory/delivery-challan" element={<DeliveryChallan />} />
        <Route path="/inventory/delivery-confirmation" element={<DeliveryConfirmation />} />
        <Route path="/inventory/goods-delivered" element={<DeliveryConfirmation />} />

=======
        <Route
          path="/inventory/purchase-order-register"
          element={<PurchaseOrderRegister />}
        />
        <Route path="/inventory/invoice" element={<Invoice />} />
        <Route path="/inventory/goods-delivered" element={<GoodsDelivered />} />
>>>>>>> ab340f3402952da5e02c7b117ed4c40f3d1549b6
        <Route path="/inventory/consumption" element={<Consumption />} />
        <Route path="/inventory/return-reallocate" element={<ReturnReallocate />} />
        <Route path="/inventory/reallocate-return" element={<ReturnReallocate />} />
        <Route path="/inventory/return-dc" element={<ReturnDc />} />

        <Route path="/inventory/cart" element={<Cart />} />
        <Route path="/settings" element={<Settings />} />
      </Route>
    </Routes>
  );
};

export default AppRoutes;


