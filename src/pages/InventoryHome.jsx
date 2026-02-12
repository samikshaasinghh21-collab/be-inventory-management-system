import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  fetchItems,
  deleteItemApi,
  updateQuantityApi
} from "../services/inventoryApi";
import { fetchVendors, syncVendorsCache } from "../services/vendorsApi";
import useSettings from "../hooks/useSettings";

const InventoryHome = () => {
  const navigate = useNavigate();
  const settings = useSettings();
  const [items, setItems] = useState([]);
  const [vendors, setVendors] = useState([]);

  const loadItems = async () => {
    const data = await fetchItems();
    setItems(data);
  };

  const loadVendors = async () => {
    try {
      const data = await fetchVendors();
      setVendors(data);
      syncVendorsCache(data);
    } catch (error) {
      console.error("Failed to load vendors:", error);
      setVendors([]);
    }
  };

  useEffect(() => {
    loadItems();
    loadVendors();
  }, []);

  const handleDelete = async (id) => {
    await deleteItemApi(id);
    loadItems();
  };

  const handleQtyUpdate = async (id, stock) => {
    await updateQuantityApi(id, stock);
    loadItems();
  };

  const currency = settings?.preferences?.currency || "INR";
  const lowStockThreshold =
    settings?.inventory?.lowStockThreshold ?? 0;
  const unitLabel = settings?.inventory?.defaultUnit || "PCS";

  const stockValue = items.reduce((total, item) => {
    const price = Number(item.price) || 0;
    const qty = Number(item.stock) || 0;
    return total + price * qty;
  }, 0);

  const lowStockCount = items.filter((item) => {
    const qty = Number(item.stock) || 0;
    return qty <= lowStockThreshold;
  }).length;

  const formatCurrency = (value) => {
    try {
      return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency,
        maximumFractionDigits: 2,
      }).format(value);
    } catch {
      return `${currency} ${value.toLocaleString()}`;
    }
  };

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-semibold text-slate-800">
          Items
        </h1>

        <div className="flex gap-2">
          <button className="px-4 py-2 border rounded-md bg-white">
            📊 Reports
          </button>
          <button className="px-4 py-2 border rounded-md bg-white">
            ⚙
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="bg-white p-4 rounded-lg shadow-sm">
          <p className="text-sm text-slate-500">Stock Value</p>
          <p className="text-2xl font-semibold">
            {formatCurrency(stockValue)}
          </p>
        </div>

        <div className="bg-white p-4 rounded-lg shadow-sm">
          <p className="text-sm text-orange-500">Low Stock</p>
          <p className="text-2xl font-semibold">{lowStockCount}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white p-4 rounded-lg shadow-sm flex items-center gap-3 mb-4">
        <input
          className="border px-4 py-3 rounded-md w-72 text-base"
          placeholder="Search items"
        />

        <select className="border px-4 py-3 rounded-md text-base">
          <option>Search Categories</option>
        </select>

        <button className="border px-4 py-3 rounded-md text-base">
          Show Low Stock
        </button>

        <button className="border px-4 py-3 rounded-md text-base">
          Bulk Actions
        </button>

        <button
          onClick={() => navigate("/inventory/create-item")}
          className="ml-auto bg-indigo-600 text-white px-6 py-3 rounded-md text-base font-medium hover:bg-indigo-700"
        >
          + Create Item
        </button>
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg shadow-sm overflow-x-auto">
        <table className="w-full text-base">
          <thead className="bg-slate-100">
            <tr className="text-slate-700">
              <th className="p-4"><input type="checkbox" /></th>
              <th className="p-4 text-left min-w-[180px]">Item Name</th>
              <th className="p-4 text-left min-w-[140px]">Category</th>
              <th className="p-4 text-left min-w-[120px]">HSN Code</th>
              <th className="p-4 text-left min-w-[120px]">Stock Qty</th>
              <th className="p-4 text-left min-w-[150px]">Selling Price</th>
              <th className="p-4 text-left min-w-[150px]">GST</th>
              <th className="p-4 text-left min-w-[220px]">Description</th>
              <th className="p-4 text-left min-w-[160px]">Actions</th>
            </tr>
          </thead>

          <tbody>
            {items.length === 0 && (
              <tr>
                <td
                  colSpan="9"
                  className="text-center p-6 text-slate-500"
                >
                  No items added yet
                </td>
              </tr>
            )}

            {items.map((item) => (
              <tr key={item.id} className="border-t hover:bg-slate-50">
                <td className="p-4">
                  <input type="checkbox" />
                </td>

                <td className="p-4 font-medium text-slate-800">
                  {item.name}
                </td>

                <td className="p-4">
                  {item.category || "-"}
                </td>

                <td className="p-4">
                  {item.hsn || "-"}
                </td>

                <td className="p-4">
                  {item.stock} {unitLabel}
                </td>

                <td className="p-4 font-medium">
                  {formatCurrency(Number(item.price) || 0)}
                </td>

                <td className="p-4">
                  {item.gst}
                </td>

                <td className="p-4 text-slate-600">
                  {item.description || "-"}
                </td>

                <td className="p-4 flex gap-3">
                  <button
                    onClick={() =>
                      handleQtyUpdate(item.id, item.stock + 1)
                    }
                    className="px-3 py-1 border rounded text-lg"
                    title="Increase Qty"
                  >
                    +
                  </button>

                  <button
                    onClick={() => handleDelete(item.id)}
                    className="text-red-600 text-lg"
                    title="Delete"
                  >
                    🗑
                  </button>

                  <button
                    onClick={() =>
                      navigate(`/inventory/edit/${item.id}`)
                    }
                    className="text-indigo-600 text-lg"
                    title="Edit"
                  >
                    ✏️
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Vendors */}
      <div className="mt-6 bg-white rounded-lg shadow-sm overflow-x-auto">
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <h3 className="text-lg font-semibold text-slate-800">
            Vendors
          </h3>
          <button
            onClick={() => navigate("/inventory/create-vendors")}
            className="bg-indigo-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-indigo-700"
          >
            + Create Vendor
          </button>
        </div>

        <table className="w-full text-base">
          <thead className="bg-slate-100">
            <tr className="text-slate-700">
              <th className="p-4 text-left min-w-[200px]">Vendor Name</th>
              <th className="p-4 text-left min-w-[160px]">Phone</th>
              <th className="p-4 text-left min-w-[220px]">Email</th>
              <th className="p-4 text-left min-w-[200px]">GST</th>
              <th className="p-4 text-left min-w-[260px]">Address</th>
            </tr>
          </thead>

          <tbody>
            {vendors.length === 0 && (
              <tr>
                <td
                  colSpan="5"
                  className="text-center p-6 text-slate-500"
                >
                  No vendors added yet
                </td>
              </tr>
            )}

            {vendors.map((vendor) => (
              <tr key={vendor.id ?? vendor.VendorId} className="border-t hover:bg-slate-50">
                <td className="p-4 font-medium text-slate-800">
                  {vendor.name || vendor.VendorName || "-"}
                </td>
                <td className="p-4">
                  {vendor.phone || vendor.Phone || "-"}
                </td>
                <td className="p-4">
                  {vendor.email || vendor.Email || "-"}
                </td>
                <td className="p-4">
                  {vendor.gstNumber || vendor.GSTNumber || "-"}
                </td>
                <td className="p-4 text-slate-600">
                  {vendor.address || vendor.Address || "-"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Import Section */}
      <div className="mt-6 bg-blue-50 p-6 rounded-lg flex justify-between">
        <div>
          <h3 className="font-semibold">
            Add Multiple items at once
          </h3>
          <p className="text-sm text-slate-600">
            Bulk upload items from product library or Excel
          </p>
        </div>

        <div className="flex gap-3">
          <button className="border px-4 py-2 rounded-md bg-white">
            Import Items
          </button>
          <button className="border px-4 py-2 rounded-md bg-white">
            Product Library
          </button>
          <button className="bg-green-600 text-white px-4 py-2 rounded-md">
            Upload Excel
          </button>
        </div>
      </div>
    </div>
  );
};

export default InventoryHome;
