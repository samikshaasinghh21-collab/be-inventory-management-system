import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getProjects } from "../../services/projectsStore";
import { fetchVendors } from "../../services/vendorsApi";
import {
  fetchPurchaseOrders,
  deletePurchaseOrder,
} from "../../services/purchaseOrdersApi";
import useSettings from "../../hooks/useSettings";
import { formatDate } from "../../utils/dateFormat";

const PurchaseOrderRegister = () => {
  const navigate = useNavigate();
  const settings = useSettings();
  const currency = settings?.preferences?.currency || "INR";
  const [projects, setProjects] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [records, setRecords] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [apiError, setApiError] = useState("");

  const formatCurrency = (value) => {
    const amount = Number(value) || 0;
    try {
      return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency,
        maximumFractionDigits: 2,
      }).format(amount);
    } catch {
      return `${currency} ${amount.toLocaleString()}`;
    }
  };

  const loadRecords = async () => {
    try {
      setApiError("");
      const list = await fetchPurchaseOrders();
      setRecords(list);
    } catch (error) {
      setApiError(
        error?.response?.data?.error || error?.message || "Failed to load purchase orders."
      );
      setRecords([]);
    }
  };

  const loadVendors = async () => {
    try {
      const list = await fetchVendors();
      setVendors(list);
    } catch {
      setVendors([]);
    }
  };

  useEffect(() => {
    setProjects(getProjects());
    void loadVendors();
    void loadRecords();
  }, []);

  const projectMap = useMemo(() => {
    return projects.reduce((acc, project) => {
      acc[String(project.id)] = project;
      return acc;
    }, {});
  }, [projects]);

  const vendorMap = useMemo(() => {
    return vendors.reduce((acc, vendor) => {
      acc[String(vendor.id)] = vendor;
      return acc;
    }, {});
  }, [vendors]);

  const totalValue = records.reduce(
    (sum, record) => sum + (Number(record.total) || 0),
    0
  );

  const filteredRecords = records.filter((record) => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) {
      return true;
    }
    const poNumber = record.poNumber ?? record.id;
    const projectName =
      projectMap[String(record.projectId)]?.name?.toLowerCase() || "";
    const vendorName =
      vendorMap[String(record.vendorId)]?.name?.toLowerCase() || "";
    return [
      poNumber,
      record.status,
      record.expectedDate,
      record.gstRate,
      projectName,
      vendorName,
    ]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(query));
  });

  const handleEdit = (record) => {
    navigate("/inventory/purchase-order", { state: { purchaseOrder: record } });
  };

  const handleDelete = async (id) => {
    try {
      setApiError("");
      await deletePurchaseOrder(id);
      await loadRecords();
    } catch (error) {
      setApiError(
        error?.response?.data?.error || error?.message || "Failed to delete purchase order."
      );
    }
  };

  return (
    <div className="p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between mb-6">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-slate-400">
            Projects
          </p>
          <h1 className="text-3xl font-semibold text-slate-800">
            Purchase Order Register
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Review all purchase orders and their current status.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={loadRecords}
            className="px-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-700 bg-white"
          >
            Refresh
          </button>
          <button
            type="button"
            onClick={() => navigate("/inventory/purchase-order")}
            className="px-5 py-2 rounded-lg text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700"
          >
            + Create PO
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-white p-4 rounded-lg shadow-sm border border-slate-200">
          <p className="text-sm text-slate-500">Total POs</p>
          <p className="text-2xl font-semibold text-slate-800">
            {records.length}
          </p>
        </div>
        <div className="bg-white p-4 rounded-lg shadow-sm border border-slate-200">
          <p className="text-sm text-slate-500">Total Value</p>
          <p className="text-2xl font-semibold text-slate-800">
            {formatCurrency(totalValue)}
          </p>
        </div>
        <div className="bg-white p-4 rounded-lg shadow-sm border border-slate-200">
          <p className="text-sm text-slate-500">Open Orders</p>
          <p className="text-2xl font-semibold text-slate-800">
            {records.filter((record) => record.status !== "Closed").length}
          </p>
        </div>
      </div>

      {apiError && (
        <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {apiError}
        </div>
      )}

      <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-x-auto">
        <div className="px-4 py-3 border-b flex items-center justify-between gap-4">
          <h3 className="text-lg font-semibold text-slate-800">
            Purchase Orders
          </h3>
          <input
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Search PO number, vendor, project..."
            className="border border-slate-200 rounded-lg px-3 py-2 text-sm w-72 max-w-full"
          />
        </div>
        <table className="w-full text-sm">
          <thead className="bg-slate-100 text-slate-600">
            <tr>
              <th className="p-3 text-left min-w-[150px]">PO No</th>
              <th className="p-3 text-left min-w-[180px]">Vendor</th>
              <th className="p-3 text-left min-w-[180px]">Project</th>
              <th className="p-3 text-left min-w-[140px]">Status</th>
              <th className="p-3 text-left min-w-[120px]">GST</th>
              <th className="p-3 text-left min-w-[120px]">Items</th>
              <th className="p-3 text-left min-w-[140px]">Value</th>
              <th className="p-3 text-left min-w-[140px]">Expected</th>
              <th className="p-3 text-left min-w-[220px]">
                Terms &amp; Conditions
              </th>
              <th className="p-3 text-left min-w-[120px]">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredRecords.length === 0 && (
              <tr>
                <td colSpan="10" className="p-6 text-center text-slate-500">
                  {records.length === 0
                    ? "No purchase orders created yet."
                    : "No purchase orders match your search."}
                </td>
              </tr>
            )}
            {filteredRecords.map((record) => (
              <tr key={record.id} className="border-t hover:bg-slate-50">
                <td className="p-3 font-medium text-slate-800">
                  {record.poNumber || record.id}
                </td>
                <td className="p-3">
                  {vendorMap[String(record.vendorId)]?.name || "-"}
                </td>
                <td className="p-3">
                  {projectMap[String(record.projectId)]?.name || "-"}
                </td>
                <td className="p-3">{record.status || "-"}</td>
                <td className="p-3">{record.gstRate || record.gst || "None"}</td>
                <td className="p-3">{record.items?.length || 0}</td>
                <td className="p-3 font-medium">
                  {formatCurrency(record.total || 0)}
                </td>
                <td className="p-3">{formatDate(record.expectedDate || record.orderDate)}</td>
                <td className="p-3 text-slate-600">
                  {record.termsConditions || record.notes || "-"}
                </td>
                <td className="p-3 flex gap-3">
                  <button
                    type="button"
                    onClick={() => handleEdit(record)}
                    className="text-indigo-600 text-sm"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(record.id)}
                    className="text-red-600 text-sm"
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default PurchaseOrderRegister;
