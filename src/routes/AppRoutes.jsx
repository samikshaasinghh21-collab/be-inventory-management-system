import { Routes, Route } from "react-router-dom";
import Layout from "../components/layout/Layout";
import MainLayout from "../layouts/MainLayout";
import Dashboard from "../pages/Dashboard";
import InventoryHome from "../pages/InventoryHome";

import CreateItems from "../components/inventory/CreateItems";
import EditItems from "../components/inventory/EditItems";
import CreateVendors from "../components/inventory/CreateVendors";
import CreateProduct from "../components/inventory/CreateProduct";
import ReceiveGoods from "../components/inventory/ReceiveGoods";
import AllocateToProjects from "../components/inventory/AllocateToProjects";
import DeliveryChallan from "../components/inventory/DeliveryChallan";
import Product from "../components/inventory/Product";

const AppRoutes = () => {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Dashboard />} />
      </Route>
      <Route element={<MainLayout />}>
        <Route path="/inventory" element={<InventoryHome />} />
        <Route path="/inventory/products" element={<Product />} />
        <Route path="/inventory/create-item" element={<CreateItems />} />
        <Route path="/inventory/edit/:id" element={<EditItems />} />
        <Route path="/inventory/create-vendors" element={<CreateVendors />} />
        <Route path="/inventory/create-product" element={<CreateProduct />} />
        <Route path="/inventory/receive-goods" element={<ReceiveGoods />} />
        <Route path="/inventory/allocate-projects" element={<AllocateToProjects />} />
        <Route path="/inventory/delivery-challan" element={<DeliveryChallan />} />
      </Route>
    </Routes>
  );
};

export default AppRoutes;
