<<<<<<< HEAD
import { useEffect, useMemo, useRef, useState } from "react";
=======
import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
>>>>>>> ab340f3402952da5e02c7b117ed4c40f3d1549b6
import { getProjects } from "../../services/projectsStore";
import {
  addWorkflowItem,
  getWorkflowList,
  updateWorkflowItem,
} from "../../services/workflowStore";
import LineItemsEditor from "./LineItemsEditor";
import useSettings from "../../hooks/useSettings";
import { formatDateDDMMYYYY } from "../../utils/dateFormat";
import DateInput from "../common/DateInput";
import { fetchVendors, syncVendorsCache } from "../../services/vendorsApi";

const STORAGE_KEY = "workflow_purchase_orders";
const LOCATION_KEY = "workflow_locations";
const PICK_KEY = "po_selected_products";
const EDIT_KEY = "po_edit_id";

const GST_OPTIONS = [
  "None",
  "GST @ 0%",
  "GST @ 1.5%",
  "GST @ 3%",
  "GST @ 5%",
  "GST @ 12%",
  "GST @ 18%",
  "GST @ 28%",
];

const createLineItem = () => ({
  id: Date.now() + Math.random(),
  name: "",
  description: "",
  unit: "PCS",
  quantity: "",
  rate: "",
  notes: "",
});

const createFormState = () => ({
  poNumber: "",
  projectId: "",
  vendorId: "",
  locationId: "",
  status: "Draft",
  orderDate: new Date().toISOString().slice(0, 10),
  expectedDate: "",
  gstRate: "None",
  notes: "",
<<<<<<< HEAD
  terms: "",
=======
  termsConditions: "",
>>>>>>> ab340f3402952da5e02c7b117ed4c40f3d1549b6
});

const PurchaseOrder = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const settings = useSettings();
  const currency = settings?.preferences?.currency || "INR";
  const [projects, setProjects] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [locations, setLocations] = useState([]);
  const [records, setRecords] = useState([]);
  const [form, setForm] = useState(createFormState);
  const [items, setItems] = useState([createLineItem()]);
  const [errors, setErrors] = useState({});
  const [editingId, setEditingId] = useState(null);
  const formRef = useRef(null);
  const poNumberInputRef = useRef(null);

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

  const loadRecords = () => setRecords(getWorkflowList(STORAGE_KEY));
  const loadLocations = () => setLocations(getWorkflowList(LOCATION_KEY));
  const loadVendors = async () => {
    try {
      const data = await fetchVendors();
      setVendors(data);
      syncVendorsCache(data);
    } catch {
      setVendors([]);
    }
  };

  useEffect(() => {
    setProjects(getProjects());
    loadRecords();
    loadLocations();
    loadVendors();
  }, []);

  useEffect(() => {
    const stored = localStorage.getItem(PICK_KEY);
    if (!stored) {
      return;
    }
    try {
      const selected = JSON.parse(stored);
      if (!Array.isArray(selected) || selected.length === 0) {
        return;
      }
      setItems((prev) => {
        const hasOnlyEmpty =
          prev.length === 1 &&
          !prev[0].name.trim() &&
          !prev[0].description.trim() &&
          !prev[0].quantity &&
          !prev[0].rate;
        const next = hasOnlyEmpty ? [] : [...prev];

        selected.forEach((product) => {
          const qty = Number(product.quantity) || 0;
          if (!product.name || qty <= 0) {
            return;
          }
          const existingIndex = next.findIndex(
            (item) =>
              item.name.trim().toLowerCase() ===
              product.name.trim().toLowerCase()
          );
          if (existingIndex >= 0) {
            const existing = next[existingIndex];
            const existingQty = Number(existing.quantity) || 0;
            next[existingIndex] = {
              ...existing,
              description: existing.description || product.description || "",
              unit: existing.unit || product.unit || "PCS",
              quantity: String(existingQty + qty),
              rate: existing.rate || product.rate || "",
            };
          } else {
            next.push({
              id: Date.now() + Math.random(),
              name: product.name || "",
              description: product.description || "",
              unit: product.unit || "PCS",
              quantity: String(qty),
              rate: product.rate || "",
              notes: "",
            });
          }
        });

        return next.length > 0 ? next : [createLineItem()];
      });
    } catch {
      // ignore invalid data
    } finally {
      localStorage.removeItem(PICK_KEY);
    }
  }, [location.key]);

  useEffect(() => {
    const handler = () => loadRecords();
    window.addEventListener(`${STORAGE_KEY}:changed`, handler);
    return () => window.removeEventListener(`${STORAGE_KEY}:changed`, handler);
  }, []);

  useEffect(() => {
    const handler = () => loadLocations();
    window.addEventListener(`${LOCATION_KEY}:changed`, handler);
    return () => window.removeEventListener(`${LOCATION_KEY}:changed`, handler);
  }, []);

  useEffect(() => {
    if (!records.length) {
      return;
    }
    const editId = localStorage.getItem(EDIT_KEY);
    if (!editId) {
      return;
    }
    const record = records.find((item) => String(item.id) === String(editId));
    if (record) {
      handleEdit(record);
    }
    localStorage.removeItem(EDIT_KEY);
  }, [records]);

  const totalValue = records.reduce(
    (sum, record) => sum + (Number(record.total) || 0),
    0
  );

  const resetForm = () => {
    setForm(createFormState());
    setItems([createLineItem()]);
    setErrors({});
    setEditingId(null);
  };

  const validate = () => {
    const nextErrors = {};
    if (!form.poNumber.trim()) {
      nextErrors.poNumber = "PO number is required.";
    }
    if (!form.projectId) {
      nextErrors.projectId = "Select a project.";
    }
    if (!form.vendorId) {
      nextErrors.vendorId = "Select a vendor.";
    }
    const hasValidItem = items.some(
      (item) => item.name.trim() && Number(item.quantity) > 0
    );
    if (!hasValidItem) {
      nextErrors.items = "Add at least one line item.";
    }
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    if (!validate()) {
      return;
    }

    const cleanedItems = items.filter(
      (item) => item.name.trim() || Number(item.quantity) > 0
    );
    const total = cleanedItems.reduce((sum, item) => {
      const qty = Number(item.quantity) || 0;
      const rate = Number(item.rate) || 0;
      return sum + qty * rate;
    }, 0);

    const payload = {
      id: editingId ?? Date.now(),
      ...form,
      items: cleanedItems,
      total,
      updatedAt: new Date().toISOString(),
      createdAt:
        editingId &&
        records.find((record) => record.id === editingId)?.createdAt
          ? records.find((record) => record.id === editingId)?.createdAt
          : new Date().toISOString(),
    };

    if (editingId) {
      updateWorkflowItem(STORAGE_KEY, editingId, payload);
    } else {
      addWorkflowItem(STORAGE_KEY, payload);
    }

    resetForm();
    navigate("/inventory/purchase-order-register");
  };

  const handleEdit = (record) => {
    setEditingId(record.id);
    setForm({
      poNumber: record.poNumber || "",
      projectId: record.projectId || "",
      vendorId: record.vendorId || "",
      locationId: record.locationId || "",
      status: record.status || "Draft",
      orderDate: record.orderDate || new Date().toISOString().slice(0, 10),
      expectedDate: record.expectedDate || "",
      gstRate: record.gstRate || "None",
      notes: record.notes || "",
<<<<<<< HEAD
      terms: record.terms || "",
=======
      termsConditions: record.termsConditions || "",
>>>>>>> ab340f3402952da5e02c7b117ed4c40f3d1549b6
    });
    setItems(record.items?.length ? record.items : [createLineItem()]);
    setErrors({});
  };

<<<<<<< HEAD
  const handleDelete = (id) => {
    deleteWorkflowItem(STORAGE_KEY, id);
  };

  const handleCreatePurchase = () => {
    resetForm();
    requestAnimationFrame(() => {
      formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      poNumberInputRef.current?.focus();
    });
  };

=======
>>>>>>> ab340f3402952da5e02c7b117ed4c40f3d1549b6
  return (
    <div className="p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between mb-6">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-slate-400">
            Projects
          </p>
          <h1 className="text-3xl font-semibold text-slate-800">Purchase Order</h1>
          <p className="text-sm text-slate-500 mt-1">
            Issue procurement orders tied to project needs.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => navigate("/inventory/purchase-order-register")}
            className="px-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-700 bg-white"
          >
            View Register
          </button>
          <button
            type="button"
            onClick={loadVendors}
            className="px-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-700 bg-white"
          >
            Refresh Vendors
          </button>
          <button
            type="button"
            onClick={handleCreatePurchase}
            className="bg-indigo-600 text-white px-6 py-3 rounded-md text-base font-medium hover:bg-indigo-700"
          >
            + Create Purchase 
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

      <form ref={formRef} onSubmit={handleSubmit} className="space-y-4 mb-6">
        <div className="bg-white p-5 rounded-lg shadow-sm border border-slate-200">
          <h2 className="text-lg font-semibold text-slate-800 mb-4">
            PO Details
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="text-sm font-medium text-slate-700">
                PO Number *
              </label>
              <input
                ref={poNumberInputRef}
                type="text"
                value={form.poNumber}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, poNumber: event.target.value }))
                }
                placeholder="PO-2026-002"
                className="w-full mt-1 border border-slate-200 rounded-lg px-3 py-2"
              />
              {errors.poNumber && (
                <p className="text-xs text-red-600 mt-1">{errors.poNumber}</p>
              )}
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700">
                Project *
              </label>
              <select
                value={form.projectId}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, projectId: event.target.value }))
                }
                className="w-full mt-1 border border-slate-200 rounded-lg px-3 py-2"
              >
                <option value="">Select project</option>
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </select>
              {errors.projectId && (
                <p className="text-xs text-red-600 mt-1">{errors.projectId}</p>
              )}
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700">
                Vendor *
              </label>
              <select
                value={form.vendorId}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, vendorId: event.target.value }))
                }
                className="w-full mt-1 border border-slate-200 rounded-lg px-3 py-2"
              >
                <option value="">Select vendor</option>
                {vendors.map((vendor) => (
                  <option key={vendor.id} value={vendor.id}>
                    {vendor.name}
                  </option>
                ))}
              </select>
              {errors.vendorId && (
                <p className="text-xs text-red-600 mt-1">{errors.vendorId}</p>
              )}
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700">
                Location
              </label>
              <select
                value={form.locationId}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    locationId: event.target.value,
                  }))
                }
                className="w-full mt-1 border border-slate-200 rounded-lg px-3 py-2"
              >
                <option value="">Select location</option>
                {locations.map((location) => (
                  <option key={location.id} value={location.id}>
                    {location.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700">
                Status
              </label>
              <select
                value={form.status}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, status: event.target.value }))
                }
                className="w-full mt-1 border border-slate-200 rounded-lg px-3 py-2"
              >
                <option value="Draft">Draft</option>
                <option value="Sent">Sent</option>
                <option value="Partially Received">Partially Received</option>
                <option value="Closed">Closed</option>
              </select>
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700">
                GST Rate
              </label>
              <select
                value={form.gstRate}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, gstRate: event.target.value }))
                }
                className="w-full mt-1 border border-slate-200 rounded-lg px-3 py-2"
              >
                {GST_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700">
                Order Date
              </label>
              <DateInput
                value={form.orderDate}
                onChange={(value) =>
                  setForm((prev) => ({ ...prev, orderDate: value }))
                }
                className="w-full mt-1 border border-slate-200 rounded-lg px-3 py-2"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700">
                Expected Date
              </label>
              <DateInput
                value={form.expectedDate}
                onChange={(value) =>
                  setForm((prev) => ({
                    ...prev,
                    expectedDate: value,
                  }))
                }
                className="w-full mt-1 border border-slate-200 rounded-lg px-3 py-2"
              />
            </div>
            <div className="md:col-span-3">
              <label className="text-sm font-medium text-slate-700">
                Notes
              </label>
              <textarea
                value={form.notes}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, notes: event.target.value }))
                }
                placeholder="Delivery terms, remarks, or approvals."
                className="w-full mt-1 border border-slate-200 rounded-lg px-3 py-2 min-h-[90px]"
              />
            </div>
            <div className="md:col-span-3">
              <label className="text-sm font-medium text-slate-700">
                Terms &amp; Conditions
              </label>
              <textarea
                value={form.termsConditions}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    termsConditions: event.target.value,
                  }))
                }
                placeholder="Payment terms, penalties, or special clauses."
                className="w-full mt-1 border border-slate-200 rounded-lg px-3 py-2 min-h-[90px]"
              />
            </div>
          </div>
        </div>

        <LineItemsEditor
          items={items}
          onChange={setItems}
          onPickFromProducts={() =>
            navigate("/inventory/products?pick=po")
          }
          pickLabel="Pick from Products"
        />
        {errors.items && (
          <p className="text-xs text-red-600">{errors.items}</p>
        )}

        <div className="bg-white p-5 rounded-lg shadow-sm border border-slate-200">
          <h2 className="text-lg font-semibold text-slate-800 mb-4">
            Terms & Conditions
          </h2>
          <textarea
            value={form.terms}
            onChange={(event) =>
              setForm((prev) => ({ ...prev, terms: event.target.value }))
            }
            placeholder="Payment terms, delivery conditions, warranty, penalties, or legal clauses."
            className="w-full border border-slate-200 rounded-lg px-3 py-2 min-h-[120px]"
          />
        </div>

        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={handleCreatePurchase}
            className="px-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-700 bg-white"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="px-5 py-2 rounded-lg text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700"
          >
            {editingId ? "Update PO" : "Save PO"}
          </button>
        </div>
      </form>
<<<<<<< HEAD

      <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-x-auto">
        <div className="px-4 py-3 border-b flex items-center justify-between">
          <h3 className="text-lg font-semibold text-slate-800">
            Purchase Order Register
          </h3>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-slate-100 text-slate-600">
            <tr>
              <th className="p-3 text-left min-w-[150px]">PO No</th>
              <th className="p-3 text-left min-w-[180px]">Vendor</th>
              <th className="p-3 text-left min-w-[180px]">Project</th>
              <th className="p-3 text-left min-w-[140px]">Status</th>
              <th className="p-3 text-left min-w-[130px]">Items</th>
              <th className="p-3 text-left min-w-[140px]">Value</th>
              <th className="p-3 text-left min-w-[140px]">Expected</th>
              <th className="p-3 text-left min-w-[120px]">Actions</th>
            </tr>
          </thead>
          <tbody>
            {records.length === 0 && (
              <tr>
                <td colSpan="8" className="p-6 text-center text-slate-500">
                  No purchase orders created yet.
                </td>
              </tr>
            )}
            {records.map((record) => (
              <tr key={record.id} className="border-t hover:bg-slate-50">
                <td className="p-3 font-medium text-slate-800">
                  {record.poNumber}
                </td>
                <td className="p-3">
                  {vendorMap[String(record.vendorId)]?.name || "-"}
                </td>
                <td className="p-3">
                  {projectMap[String(record.projectId)]?.name || "-"}
                </td>
                <td className="p-3">{record.status || "-"}</td>
                <td className="p-3">{record.items?.length || 0}</td>
                <td className="p-3 font-medium">
                  {formatCurrency(record.total || 0)}
                </td>
                <td className="p-3">{formatDateDDMMYYYY(record.expectedDate)}</td>
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
=======
>>>>>>> ab340f3402952da5e02c7b117ed4c40f3d1549b6
    </div>
  );
};

export default PurchaseOrder;

