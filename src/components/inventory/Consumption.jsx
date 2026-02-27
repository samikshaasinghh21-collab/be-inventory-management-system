import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
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
import { formatDate } from "../../utils/dateFormat";

const STORAGE_KEY = "workflow_consumption";

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
  consumptionNumber: "",
  projectId: "",
  locationId: "",
  consumptionDate: new Date().toISOString().slice(0, 10),
  issuedBy: "",
  status: "Logged",
  notes: "",
});

const Consumption = () => {
  const navigate = useNavigate();
  const [projects, setProjects] = useState([]);
  const [locations, setLocations] = useState([]);
  const [records, setRecords] = useState([]);
  const [form, setForm] = useState(createFormState);
  const [items, setItems] = useState([createLineItem()]);
  const [errors, setErrors] = useState({});
  const [editingId, setEditingId] = useState(null);
  const [locationsLoading, setLocationsLoading] = useState(false);
  const [locationsError, setLocationsError] = useState("");

  const loadRecords = () => setRecords(getWorkflowList(STORAGE_KEY));
  const loadLocations = async () => {
    try {
      setLocationsLoading(true);
      setLocationsError("");
      const list = await fetchLocations();
      setLocations(Array.isArray(list) ? list : []);
    } catch (error) {
      setLocations([]);
      setLocationsError(
        error?.response?.data?.error ||
          error?.message ||
          "Failed to load locations."
      );
    } finally {
      setLocationsLoading(false);
    }
  };

  useEffect(() => {
    setProjects(getProjects());
    void loadLocations();
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

  const totalQuantity = records.reduce((sum, record) => {
    const qty = (record.items || []).reduce(
      (lineSum, item) => lineSum + (Number(item.quantity) || 0),
      0
    );
    return sum + qty;
  }, 0);

  const resetForm = () => {
    setForm(createFormState());
    setItems([createLineItem()]);
    setErrors({});
    setEditingId(null);
  };

  const validate = () => {
    const nextErrors = {};
    if (!form.consumptionNumber.trim()) {
      nextErrors.consumptionNumber = "Consumption ref is required.";
    }
    if (!form.projectId) {
      nextErrors.projectId = "Select a project.";
    }
    if (!form.locationId) {
      nextErrors.locationId = "Select a location.";
    }
    const hasValidItem = items.some(
      (item) => item.name.trim() && Number(item.quantity) > 0
    );
    if (!hasValidItem) {
      nextErrors.items = "Add at least one consumed item.";
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
      consumptionNumber: record.consumptionNumber || "",
      projectId: record.projectId || "",
      locationId: record.locationId || "",
      consumptionDate: record.consumptionDate || new Date().toISOString().slice(0, 10),
      issuedBy: record.issuedBy || "",
      status: record.status || "Logged",
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
            Consumption
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Record material usage and issue quantities.
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
          <p className="text-sm text-slate-500">Total Entries</p>
          <p className="text-2xl font-semibold text-slate-800">
            {records.length}
          </p>
        </div>
        <div className="bg-white p-4 rounded-lg shadow-sm border border-slate-200">
          <p className="text-sm text-slate-500">Total Quantity</p>
          <p className="text-2xl font-semibold text-slate-800">
            {totalQuantity}
          </p>
        </div>
        <div className="bg-white p-4 rounded-lg shadow-sm border border-slate-200">
          <p className="text-sm text-slate-500">Pending Review</p>
          <p className="text-2xl font-semibold text-slate-800">
            {records.filter((record) => record.status === "Logged").length}
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4 mb-6">
        <div className="bg-white p-5 rounded-lg shadow-sm border border-slate-200">
          <h2 className="text-lg font-semibold text-slate-800 mb-4">
            Consumption Details
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="text-sm font-medium text-slate-700">
                Consumption Ref *
              </label>
              <input
                type="text"
                value={form.consumptionNumber}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    consumptionNumber: event.target.value,
                  }))
                }
                placeholder="CON-2026-005"
                className="w-full mt-1 border border-slate-200 rounded-lg px-3 py-2"
              />
              {errors.consumptionNumber && (
                <p className="text-xs text-red-600 mt-1">
                  {errors.consumptionNumber}
                </p>
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
                <p className="text-xs text-red-600 mt-1">
                  {errors.projectId}
                </p>
              )}
            </div>
            <div>
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-slate-700">
                  Location *
                </label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={loadLocations}
                    className="text-xs text-slate-600 underline"
                  >
                    Refresh
                  </button>
                  <button
                    type="button"
                    onClick={() => navigate("/inventory/locations")}
                    className="text-xs text-indigo-600 underline"
                  >
                    Manage Locations
                  </button>
                </div>
              </div>
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
                <option value="">
                  {locationsLoading
                    ? "Loading locations..."
                    : locations.length > 0
                    ? "Select location"
                    : "No locations found"}
                </option>
                {locations.map((location) => (
                  <option key={location.id} value={location.id}>
                    {location.name}
                  </option>
                ))}
              </select>
              {!locationsLoading && locations.length === 0 && (
                <p className="text-xs text-amber-700 mt-1">
                  No locations available. Create one in Location Management.
                </p>
              )}
              {locationsError && (
                <p className="text-xs text-red-600 mt-1">
                  {locationsError}
                </p>
              )}
              {errors.locationId && (
                <p className="text-xs text-red-600 mt-1">
                  {errors.locationId}
                </p>
              )}
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700">
                Consumption Date
              </label>
              <DateInput
                value={form.consumptionDate}
                onChange={(value) =>
                  setForm((prev) => ({
                    ...prev,
                    consumptionDate: value,
                  }))
                }
                className="w-full mt-1 border border-slate-200 rounded-lg px-3 py-2"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700">
                Issued By
              </label>
              <input
                type="text"
                value={form.issuedBy}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, issuedBy: event.target.value }))
                }
                placeholder="Store Keeper"
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
                <option value="Logged">Logged</option>
                <option value="Reviewed">Reviewed</option>
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
                placeholder="Usage notes or approvals."
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
            {editingId ? "Update Entry" : "Save Entry"}
          </button>
        </div>
      </form>

      <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-x-auto">
        <div className="px-4 py-3 border-b flex items-center justify-between">
          <h3 className="text-lg font-semibold text-slate-800">
            Consumption Register
          </h3>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-slate-100 text-slate-600">
            <tr>
              <th className="p-3 text-left min-w-[150px]">Ref</th>
              <th className="p-3 text-left min-w-[180px]">Project</th>
              <th className="p-3 text-left min-w-[180px]">Location</th>
              <th className="p-3 text-left min-w-[140px]">Date</th>
              <th className="p-3 text-left min-w-[120px]">Items</th>
              <th className="p-3 text-left min-w-[140px]">Status</th>
              <th className="p-3 text-left min-w-[120px]">Actions</th>
            </tr>
          </thead>
          <tbody>
            {records.length === 0 && (
              <tr>
                <td colSpan="7" className="p-6 text-center text-slate-500">
                  No consumption entries yet.
                </td>
              </tr>
            )}
            {records.map((record) => (
              <tr key={record.id} className="border-t hover:bg-slate-50">
                <td className="p-3 font-medium text-slate-800">
                  {record.consumptionNumber}
                </td>
                <td className="p-3">
                  {projectMap[String(record.projectId)]?.name || "-"}
                </td>
                <td className="p-3">
                  {locationMap[String(record.locationId)]?.name || "-"}
                </td>
                <td className="p-3">{formatDate(record.consumptionDate)}</td>
                <td className="p-3">{record.items?.length || 0}</td>
                <td className="p-3">{record.status || "-"}</td>
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

export default Consumption;
