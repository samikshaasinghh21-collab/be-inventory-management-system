import { useEffect, useMemo, useState } from "react";
import { getProjects } from "../../services/projectsStore";
import {
  addWorkflowItem,
  deleteWorkflowItem,
  getWorkflowList,
  updateWorkflowItem,
} from "../../services/workflowStore";
import { fetchLocations } from "../../services/locationsApi";
import LineItemsEditor from "./LineItemsEditor";
import DateInput from "../common/DateInput";
import { fetchVendors, syncVendorsCache } from "../../services/vendorsApi";

const STORAGE_KEY = "workflow_return_dc";

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
  dcNumber: "",
  mode: "Return",
  projectId: "",
  fromLocationId: "",
  toLocationId: "",
  vendorId: "",
  issueDate: new Date().toISOString().slice(0, 10),
  status: "Draft",
  notes: "",
});

const ReturnDc = () => {
  const [projects, setProjects] = useState([]);
  const [locations, setLocations] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [records, setRecords] = useState([]);
  const [form, setForm] = useState(createFormState);
  const [items, setItems] = useState([createLineItem()]);
  const [errors, setErrors] = useState({});
  const [editingId, setEditingId] = useState(null);

  const loadRecords = () => setRecords(getWorkflowList(STORAGE_KEY));
  const loadLocations = async () => {
    try {
      const list = await fetchLocations();
      setLocations(Array.isArray(list) ? list : []);
    } catch {
      setLocations([]);
    }
  };
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
    void loadLocations();
    void loadVendors();
    loadRecords();
  }, []);

  useEffect(() => {
    const handler = () => loadRecords();
    window.addEventListener(`${STORAGE_KEY}:changed`, handler);
    return () => window.removeEventListener(`${STORAGE_KEY}:changed`, handler);
  }, []);

  const projectMap = useMemo(() => {
    return projects.reduce((acc, project) => {
      acc[String(project.id)] = project;
      return acc;
    }, {});
  }, [projects]);

  const locationMap = useMemo(() => {
    return locations.reduce((acc, location) => {
      acc[String(location.id)] = location;
      return acc;
    }, {});
  }, [locations]);

  const vendorMap = useMemo(() => {
    return vendors.reduce((acc, vendor) => {
      acc[String(vendor.id)] = vendor;
      return acc;
    }, {});
  }, [vendors]);

  const resetForm = () => {
    setForm(createFormState());
    setItems([createLineItem()]);
    setErrors({});
    setEditingId(null);
  };

  const validate = () => {
    const nextErrors = {};
    if (!form.dcNumber.trim()) {
      nextErrors.dcNumber = "DC number is required.";
    }
    if (!form.projectId) {
      nextErrors.projectId = "Select a project.";
    }
    if (!form.fromLocationId) {
      nextErrors.fromLocationId = "Select a source location.";
    }
    if (form.mode === "Reallocation" && !form.toLocationId) {
      nextErrors.toLocationId = "Select a destination location.";
    }
    if (form.mode === "Return" && vendors.length > 0 && !form.vendorId) {
      nextErrors.vendorId = "Select a vendor.";
    }
    const hasValidItem = items.some(
      (item) => item.name.trim() && Number(item.quantity) > 0
    );
    if (!hasValidItem) {
      nextErrors.items = "Add at least one item.";
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

    const payload = {
      id: editingId ?? Date.now(),
      ...form,
      items: cleanedItems,
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
  };

  const handleEdit = (record) => {
    setEditingId(record.id);
    setForm({
      dcNumber: record.dcNumber || "",
      mode: record.mode || "Return",
      projectId: record.projectId || "",
      fromLocationId: record.fromLocationId || "",
      toLocationId: record.toLocationId || "",
      vendorId: record.vendorId || "",
      issueDate: record.issueDate || new Date().toISOString().slice(0, 10),
      status: record.status || "Draft",
      notes: record.notes || "",
    });
    setItems(record.items?.length ? record.items : [createLineItem()]);
    setErrors({});
  };

  const handleDelete = (id) => {
    deleteWorkflowItem(STORAGE_KEY, id);
  };

  return (
    <div className="p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between mb-6">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-slate-400">
            Projects
          </p>
          <h1 className="text-3xl font-semibold text-slate-800">
            Return / Reallocation DC
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Issue delivery challans for stock returns or reallocations.
          </p>
        </div>
        <button
          type="button"
          onClick={resetForm}
          className="px-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-700 bg-white"
        >
          Clear Form
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-white p-4 rounded-lg shadow-sm border border-slate-200">
          <p className="text-sm text-slate-500">Total DCs</p>
          <p className="text-2xl font-semibold text-slate-800">
            {records.length}
          </p>
        </div>
        <div className="bg-white p-4 rounded-lg shadow-sm border border-slate-200">
          <p className="text-sm text-slate-500">Draft DCs</p>
          <p className="text-2xl font-semibold text-slate-800">
            {records.filter((record) => record.status === "Draft").length}
          </p>
        </div>
        <div className="bg-white p-4 rounded-lg shadow-sm border border-slate-200">
          <p className="text-sm text-slate-500">Return DCs</p>
          <p className="text-2xl font-semibold text-slate-800">
            {records.filter((record) => record.mode === "Return").length}
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4 mb-6">
        <div className="bg-white p-5 rounded-lg shadow-sm border border-slate-200">
          <h2 className="text-lg font-semibold text-slate-800 mb-4">
            DC Details
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="text-sm font-medium text-slate-700">
                DC Number *
              </label>
              <input
                type="text"
                value={form.dcNumber}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, dcNumber: event.target.value }))
                }
                placeholder="RDC-2026-003"
                className="w-full mt-1 border border-slate-200 rounded-lg px-3 py-2"
              />
              {errors.dcNumber && (
                <p className="text-xs text-red-600 mt-1">{errors.dcNumber}</p>
              )}
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700">
                Mode
              </label>
              <select
                value={form.mode}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, mode: event.target.value }))
                }
                className="w-full mt-1 border border-slate-200 rounded-lg px-3 py-2"
              >
                <option value="Return">Return to Vendor</option>
                <option value="Reallocation">Reallocate</option>
              </select>
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
                From Location *
              </label>
              <select
                value={form.fromLocationId}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    fromLocationId: event.target.value,
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
              {errors.fromLocationId && (
                <p className="text-xs text-red-600 mt-1">
                  {errors.fromLocationId}
                </p>
              )}
            </div>
            {form.mode === "Reallocation" ? (
              <div>
                <label className="text-sm font-medium text-slate-700">
                  To Location *
                </label>
                <select
                  value={form.toLocationId}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      toLocationId: event.target.value,
                    }))
                  }
                  className="w-full mt-1 border border-slate-200 rounded-lg px-3 py-2"
                >
                  <option value="">Select destination</option>
                  {locations.map((location) => (
                    <option key={location.id} value={location.id}>
                      {location.name}
                    </option>
                  ))}
                </select>
                {errors.toLocationId && (
                  <p className="text-xs text-red-600 mt-1">
                    {errors.toLocationId}
                  </p>
                )}
              </div>
            ) : (
              <div>
                <label className="text-sm font-medium text-slate-700">
                  Vendor
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
            )}
            <div>
              <label className="text-sm font-medium text-slate-700">
                Issue Date
              </label>
              <DateInput
                value={form.issueDate}
                onChange={(value) =>
                  setForm((prev) => ({ ...prev, issueDate: value }))
                }
                className="w-full mt-1 border border-slate-200 rounded-lg px-3 py-2"
              />
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
                <option value="Issued">Issued</option>
                <option value="Closed">Closed</option>
              </select>
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
                placeholder="Return reason or transport details."
                className="w-full mt-1 border border-slate-200 rounded-lg px-3 py-2 min-h-[90px]"
              />
            </div>
          </div>
        </div>

        <LineItemsEditor items={items} onChange={setItems} />
        {errors.items && (
          <p className="text-xs text-red-600">{errors.items}</p>
        )}

        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={resetForm}
            className="px-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-700 bg-white"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="px-5 py-2 rounded-lg text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700"
          >
            {editingId ? "Update DC" : "Save DC"}
          </button>
        </div>
      </form>

      <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-x-auto">
        <div className="px-4 py-3 border-b flex items-center justify-between">
          <h3 className="text-lg font-semibold text-slate-800">
            Return / Reallocation DC Register
          </h3>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-slate-100 text-slate-600">
            <tr>
              <th className="p-3 text-left min-w-[150px]">DC No</th>
              <th className="p-3 text-left min-w-[140px]">Mode</th>
              <th className="p-3 text-left min-w-[180px]">Project</th>
              <th className="p-3 text-left min-w-[180px]">From</th>
              <th className="p-3 text-left min-w-[180px]">To / Vendor</th>
              <th className="p-3 text-left min-w-[120px]">Status</th>
              <th className="p-3 text-left min-w-[120px]">Items</th>
              <th className="p-3 text-left min-w-[120px]">Actions</th>
            </tr>
          </thead>
          <tbody>
            {records.length === 0 && (
              <tr>
                <td colSpan="8" className="p-6 text-center text-slate-500">
                  No return or reallocation DCs yet.
                </td>
              </tr>
            )}
            {records.map((record) => {
              const destination =
                record.mode === "Reallocation"
                  ? locationMap[String(record.toLocationId)]?.name || "-"
                  : vendorMap[String(record.vendorId)]?.name || "-";
              return (
                <tr key={record.id} className="border-t hover:bg-slate-50">
                  <td className="p-3 font-medium text-slate-800">
                    {record.dcNumber}
                  </td>
                  <td className="p-3">{record.mode}</td>
                  <td className="p-3">
                    {projectMap[String(record.projectId)]?.name || "-"}
                  </td>
                  <td className="p-3">
                    {locationMap[String(record.fromLocationId)]?.name || "-"}
                  </td>
                  <td className="p-3">{destination}</td>
                  <td className="p-3">{record.status || "-"}</td>
                  <td className="p-3">{record.items?.length || 0}</td>
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
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default ReturnDc;
