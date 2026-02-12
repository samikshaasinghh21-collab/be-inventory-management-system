import { useEffect, useMemo, useState } from "react";
import { getProjects } from "../../services/projectsStore";
import {
  addWorkflowItem,
  deleteWorkflowItem,
  getWorkflowList,
  updateWorkflowItem,
} from "../../services/workflowStore";
import LineItemsEditor from "./LineItemsEditor";

const STORAGE_KEY = "workflow_consumption";
const LOCATION_KEY = "workflow_locations";

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
  const [projects, setProjects] = useState([]);
  const [locations, setLocations] = useState([]);
  const [records, setRecords] = useState([]);
  const [form, setForm] = useState(createFormState());
  const [items, setItems] = useState([createLineItem()]);
  const [errors, setErrors] = useState({});
  const [editingId, setEditingId] = useState(null);

  const loadRecords = () => setRecords(getWorkflowList(STORAGE_KEY));
  const loadLocations = () => setLocations(getWorkflowList(LOCATION_KEY));

  useEffect(() => {
    setProjects(getProjects());
    loadLocations();
    loadRecords();
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
    if (!form.consumptionNumber.trim())
      nextErrors.consumptionNumber = "Required";
    if (!form.projectId) nextErrors.projectId = "Required";
    if (!form.locationId) nextErrors.locationId = "Required";

    const hasValidItem = items.some(
      (item) => item.name.trim() && Number(item.quantity) > 0
    );

    if (!hasValidItem) nextErrors.items = "Add at least one item";

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!validate()) return;

    const payload = {
      id: editingId ?? Date.now(),
      ...form,
      items,
      createdAt: new Date().toISOString(),
    };

    if (editingId) {
      updateWorkflowItem(STORAGE_KEY, editingId, payload);
    } else {
      addWorkflowItem(STORAGE_KEY, payload);
    }

    resetForm();
    loadRecords();
  };

  const handleDelete = (id) => {
    deleteWorkflowItem(STORAGE_KEY, id);
    loadRecords();
  };

  return (
    <div className="p-6">
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-white p-4 rounded border">
          <p>Total Entries</p>
          <p className="text-xl font-semibold">{records.length}</p>
        </div>
        <div className="bg-white p-4 rounded border">
          <p>Total Quantity</p>
          <p className="text-xl font-semibold">{totalQuantity}</p>
        </div>
        <div className="bg-white p-4 rounded border">
          <p>Pending</p>
          <p className="text-xl font-semibold">
            {records.filter((r) => r.status === "Logged").length}
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4 mb-6">
        <input
          type="text"
          placeholder="Consumption Ref"
          value={form.consumptionNumber}
          onChange={(e) =>
            setForm({ ...form, consumptionNumber: e.target.value })
          }
          className="border p-2 w-full"
        />

        <button
          type="submit"
          className="bg-indigo-600 text-white px-4 py-2 rounded"
        >
          {editingId ? "Update" : "Save"}
        </button>
      </form>

      <div className="bg-white border rounded">
        <table className="w-full text-sm">
          <thead className="bg-gray-100">
            <tr>
              <th className="p-2 text-left">Ref</th>
              <th className="p-2 text-left">Project</th>
              <th className="p-2 text-left">Location</th>
              <th className="p-2 text-left">Qty</th>
              <th className="p-2 text-left">Actions</th>
            </tr>
          </thead>
          <tbody>
            {records.map((record) => (
              <tr key={record.id} className="border-t">
                <td className="p-2">{record.consumptionNumber}</td>
                <td className="p-2">
                  {projectMap[String(record.projectId)]?.name || "-"}
                </td>
                <td className="p-2">
                  {locationMap[String(record.locationId)]?.name || "-"}
                </td>
                <td className="p-2">
                  {(record.items || []).length}
                </td>
                <td className="p-2">
                  <button
                    onClick={() => handleDelete(record.id)}
                    className="text-red-600"
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
