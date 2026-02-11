import { Routes, Route } from "react-router-dom";
import Layout from "../components/layout/Layout";
import MainLayout from "../layouts/MainLayout";
import Dashboard from "../pages/Dashboard";
import InventoryHome from "../pages/InventoryHome";
import ProjectsHome from "../pages/ProjectsHome";

import CreateItems from "../components/inventory/CreateItems";
import EditItems from "../components/inventory/EditItems";
import CreateVendors from "../components/inventory/CreateVendors";
import CreateProjects from "../components/inventory/CreateProjects";
import CreateProduct from "../components/inventory/CreateProduct";
import ReceiveGoods from "../components/inventory/ReceiveGoods";
import AllocateToProjects from "../components/inventory/AllocateToProjects";
import DeliveryChallan from "../components/inventory/DeliveryChallan";
import Product from "../components/inventory/Product";
import Cart  from "../components/inventory/Cart";
import Boq from "../components/inventory/Boq";
import Locations from "../components/inventory/Locations";
import PurchaseOrders from "../components/inventory/PurchaseOrders";
import Invoices from "../components/inventory/Invoices";
import DeliveryConfirmation from "../components/inventory/DeliveryConfirmation";
import Consumption from "../components/inventory/Consumption";
import ReturnReallocate from "../components/inventory/ReturnReallocate";
import ReturnDeliveryChallan from "../components/inventory/ReturnDeliveryChallan";
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
        <Route path="/inventory/create-vendors" element={<CreateVendors />} />
        <Route path="/inventory/create-project" element={<CreateProjects />} />
        <Route path="/inventory/boq" element={<Boq />} />
        <Route path="/inventory/locations" element={<Locations />} />
        <Route path="/inventory/purchase-orders" element={<PurchaseOrders />} />
        <Route path="/inventory/create-product" element={<CreateProduct />} />
        <Route path="/inventory/receive-goods" element={<ReceiveGoods />} />
        <Route path="/inventory/invoices" element={<Invoices />} />
        <Route path="/inventory/allocate-projects" element={<AllocateToProjects />} />
        <Route path="/inventory/delivery-challan" element={<DeliveryChallan />} />
        <Route path="/inventory/delivery-confirmation" element={<DeliveryConfirmation />} />
        <Route path="/inventory/consumption" element={<Consumption />} />
        <Route path="/inventory/return-reallocate" element={<ReturnReallocate />} />
        <Route path="/inventory/return-dc" element={<ReturnDeliveryChallan />} />
        <Route path="/inventory/cart" element={<Cart />} />
      </Route>
    </Routes>
  );
};

export default AppRoutes;
