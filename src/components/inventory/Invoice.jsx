import { useEffect, useMemo, useState } from "react";
import { getProjects } from "../../services/projectsStore";
import {
  addWorkflowItem,
  deleteWorkflowItem,
  getWorkflowList,
  updateWorkflowItem,
} from "../../services/workflowStore";
import LineItemsEditor from "./LineItemsEditor";
import useSettings from "../../hooks/useSettings";
import { formatDateDDMMYYYY } from "../../utils/dateFormat";
import DateInput from "../common/DateInput";

const STORAGE_KEY = "workflow_invoices";

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
  invoiceNumber: "",
  clientName: "",
  projectId: "",
  status: "Draft",
  issueDate: new Date().toISOString().slice(0, 10),
  dueDate: "",
  notes: "",
});

const Invoice = () => {
  const settings = useSettings();
  const currency = settings?.preferences?.currency || "INR";
  const [projects, setProjects] = useState([]);
  const [records, setRecords] = useState([]);
  const [form, setForm] = useState(createFormState);
  const [items, setItems] = useState([createLineItem()]);
  const [errors, setErrors] = useState({});
  const [editingId, setEditingId] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedId, setSelectedId] = useState(null);

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

  useEffect(() => {
    setProjects(getProjects());
    loadRecords();
  }, []);

  useEffect(() => {
    const handler = () => loadRecords();
    window.addEventListener(`${STORAGE_KEY}:changed`, handler);
    return () => window.removeEventListener(`${STORAGE_KEY}:changed`, handler);
  }, []);

  useEffect(() => {
    if (selectedId && !records.some((record) => record.id === selectedId)) {
      setSelectedId(null);
    }
  }, [records, selectedId]);

  const projectMap = useMemo(() => {
    return projects.reduce((acc, project) => {
      acc[String(project.id)] = project;
      return acc;
    }, {});
  }, [projects]);

  const totalValue = records.reduce(
    (sum, record) => sum + (Number(record.total) || 0),
    0
  );

  const filteredRecords = records.filter((record) => {
    if (!searchQuery.trim()) {
      return true;
    }
    const query = searchQuery.trim().toLowerCase();
    const projectName =
      projectMap[String(record.projectId)]?.name?.toLowerCase() || "";
    return [
      record.invoiceNumber,
      record.clientName,
      record.status,
      record.sourcePoNumber,
      record.issueDate,
      record.dueDate,
      projectName,
    ]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(query));
  });

  const selectedRecord =
    records.find((record) => record.id === selectedId) || null;
  const selectedProject = selectedRecord
    ? projectMap[String(selectedRecord.projectId)]
    : null;
  const selectedItems = Array.isArray(selectedRecord?.items)
    ? selectedRecord.items
    : [];

  const resetForm = () => {
    setForm(createFormState());
    setItems([createLineItem()]);
    setErrors({});
    setEditingId(null);
  };

  const validate = () => {
    const nextErrors = {};
    if (!form.invoiceNumber.trim()) {
      nextErrors.invoiceNumber = "Invoice number is required.";
    }
    if (!form.clientName.trim()) {
      nextErrors.clientName = "Client name is required.";
    }
    if (!form.projectId) {
      nextErrors.projectId = "Select a project.";
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
  };

  const handleEdit = (record) => {
    setEditingId(record.id);
    setForm({
      invoiceNumber: record.invoiceNumber || "",
      clientName: record.clientName || "",
      projectId: record.projectId || "",
      status: record.status || "Draft",
      issueDate: record.issueDate || new Date().toISOString().slice(0, 10),
      dueDate: record.dueDate || "",
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
            Invoices
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Issue invoices linked to project delivery milestones.
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
          <p className="text-sm text-slate-500">Total Invoices</p>
          <p className="text-2xl font-semibold text-slate-800">
            {records.length}
          </p>
        </div>
        <div className="bg-white p-4 rounded-lg shadow-sm border border-slate-200">
          <p className="text-sm text-slate-500">Invoice Value</p>
          <p className="text-2xl font-semibold text-slate-800">
            {formatCurrency(totalValue)}
          </p>
        </div>
        <div className="bg-white p-4 rounded-lg shadow-sm border border-slate-200">
          <p className="text-sm text-slate-500">Open Invoices</p>
          <p className="text-2xl font-semibold text-slate-800">
            {records.filter((record) => record.status !== "Paid").length}
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4 mb-6">
        <div className="bg-white p-5 rounded-lg shadow-sm border border-slate-200">
          <h2 className="text-lg font-semibold text-slate-800 mb-4">
            Invoice Details
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="text-sm font-medium text-slate-700">
                Invoice Number *
              </label>
              <input
                type="text"
                value={form.invoiceNumber}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    invoiceNumber: event.target.value,
                  }))
                }
                placeholder="INV-2026-014"
                className="w-full mt-1 border border-slate-200 rounded-lg px-3 py-2"
              />
              {errors.invoiceNumber && (
                <p className="text-xs text-red-600 mt-1">
                  {errors.invoiceNumber}
                </p>
              )}
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700">
                Client Name *
              </label>
              <input
                type="text"
                value={form.clientName}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    clientName: event.target.value,
                  }))
                }
                placeholder="Client / Builder"
                className="w-full mt-1 border border-slate-200 rounded-lg px-3 py-2"
              />
              {errors.clientName && (
                <p className="text-xs text-red-600 mt-1">
                  {errors.clientName}
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
                <option value="Paid">Paid</option>
                <option value="Overdue">Overdue</option>
              </select>
            </div>
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
                Due Date
              </label>
              <DateInput
                value={form.dueDate}
                onChange={(value) =>
                  setForm((prev) => ({ ...prev, dueDate: value }))
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
                placeholder="Billing terms or remarks."
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
            {editingId ? "Update Invoice" : "Save Invoice"}
          </button>
        </div>
      </form>

      <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-x-auto">
        <div className="px-4 py-3 border-b flex items-center justify-between">
          <h3 className="text-lg font-semibold text-slate-800">
            Invoice Register
          </h3>
          <input
            type="text"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Search invoices..."
            className="w-64 max-w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
          />
        </div>
        <table className="w-full text-sm">
          <thead className="bg-slate-100 text-slate-600">
            <tr>
              <th className="p-3 text-left min-w-[150px]">Invoice</th>
              <th className="p-3 text-left min-w-[180px]">Client</th>
              <th className="p-3 text-left min-w-[180px]">Project</th>
              <th className="p-3 text-left min-w-[120px]">Status</th>
              <th className="p-3 text-left min-w-[120px]">Items</th>
              <th className="p-3 text-left min-w-[140px]">Value</th>
              <th className="p-3 text-left min-w-[140px]">Due</th>
              <th className="p-3 text-left min-w-[120px]">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredRecords.length === 0 && (
              <tr>
                <td colSpan="8" className="p-6 text-center text-slate-500">
                  {records.length === 0
                    ? "No invoices created yet."
                    : "No invoices match your search."}
                </td>
              </tr>
            )}
            {filteredRecords.map((record) => {
              const isSelected = selectedId === record.id;
              return (
                <tr
                  key={record.id}
                  onClick={() => setSelectedId(record.id)}
                  className={`border-t hover:bg-slate-50 cursor-pointer ${
                    isSelected ? "bg-indigo-50/70" : ""
                  }`}
                >
                <td className="p-3 font-medium text-slate-800">
                  {record.invoiceNumber}
                </td>
                <td className="p-3">{record.clientName || "-"}</td>
                <td className="p-3">
                  {projectMap[String(record.projectId)]?.name || "-"}
                </td>
                <td className="p-3">{record.status || "-"}</td>
                <td className="p-3">{record.items?.length || 0}</td>
                <td className="p-3 font-medium">
                  {formatCurrency(record.total || 0)}
                </td>
                <td className="p-3">{formatDateDDMMYYYY(record.dueDate)}</td>
                <td className="p-3 flex gap-3">
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      handleEdit(record);
                    }}
                    className="text-indigo-600 text-sm"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      handleDelete(record.id);
                    }}
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

      <div className="mt-6 bg-white rounded-lg shadow-sm border border-slate-200 p-5">
        {!selectedRecord ? (
          <p className="text-sm text-slate-500">
            Select an invoice from the register to view full details.
          </p>
        ) : (
          <>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between mb-4">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-slate-400">
                  Invoice Details
                </p>
                <h2 className="text-xl font-semibold text-slate-800">
                  {selectedRecord.invoiceNumber || "Invoice"}
                </h2>
                <p className="text-sm text-slate-500 mt-1">
                  Status: {selectedRecord.status || "-"}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedId(null)}
                className="text-xs text-slate-500 hover:text-slate-700"
              >
                Clear
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm mb-4">
              <div className="flex flex-col">
                <span className="text-xs uppercase tracking-[0.2em] text-slate-400">
                  Client
                </span>
                <span className="font-medium text-slate-800">
                  {selectedRecord.clientName || "-"}
                </span>
              </div>
              <div className="flex flex-col">
                <span className="text-xs uppercase tracking-[0.2em] text-slate-400">
                  Project
                </span>
                <span className="font-medium text-slate-800">
                  {selectedProject?.name || "-"}
                </span>
              </div>
              <div className="flex flex-col">
                <span className="text-xs uppercase tracking-[0.2em] text-slate-400">
                  Issue Date
                </span>
                <span className="font-medium text-slate-800">
                  {formatDateDDMMYYYY(selectedRecord.issueDate)}
                </span>
              </div>
              <div className="flex flex-col">
                <span className="text-xs uppercase tracking-[0.2em] text-slate-400">
                  Due Date
                </span>
                <span className="font-medium text-slate-800">
                  {formatDateDDMMYYYY(selectedRecord.dueDate)}
                </span>
              </div>
              <div className="flex flex-col">
                <span className="text-xs uppercase tracking-[0.2em] text-slate-400">
                  Source PO
                </span>
                <span className="font-medium text-slate-800">
                  {selectedRecord.sourcePoNumber || "-"}
                </span>
              </div>
              <div className="flex flex-col">
                <span className="text-xs uppercase tracking-[0.2em] text-slate-400">
                  Total Value
                </span>
                <span className="font-medium text-slate-800">
                  {formatCurrency(selectedRecord.total || 0)}
                </span>
              </div>
            </div>
            {selectedRecord.notes && (
              <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
                <span className="font-medium text-slate-700">
                  Notes:
                </span>{" "}
                {selectedRecord.notes}
              </div>
            )}

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-100 text-slate-600">
                  <tr>
                    <th className="p-3 text-left min-w-[160px]">Item</th>
                    <th className="p-3 text-left min-w-[160px]">
                      Description
                    </th>
                    <th className="p-3 text-left min-w-[90px]">Unit</th>
                    <th className="p-3 text-left min-w-[90px]">Qty</th>
                    <th className="p-3 text-left min-w-[110px]">Rate</th>
                    <th className="p-3 text-left min-w-[120px]">
                      Amount
                    </th>
                    <th className="p-3 text-left min-w-[160px]">Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedItems.length === 0 && (
                    <tr>
                      <td
                        colSpan="7"
                        className="p-4 text-center text-slate-500"
                      >
                        No line items on this invoice.
                      </td>
                    </tr>
                  )}
                  {selectedItems.map((item) => {
                    const qty = Number(item.quantity) || 0;
                    const rate = Number(item.rate) || 0;
                    const amount = qty * rate;
                    return (
                      <tr key={item.id} className="border-t">
                        <td className="p-3 font-medium text-slate-800">
                          {item.name || "-"}
                        </td>
                        <td className="p-3 text-slate-600">
                          {item.description || "-"}
                        </td>
                        <td className="p-3">{item.unit || "-"}</td>
                        <td className="p-3">{item.quantity || "-"}</td>
                        <td className="p-3">
                          {item.rate ? formatCurrency(rate) : "-"}
                        </td>
                        <td className="p-3 font-medium">
                          {amount ? formatCurrency(amount) : "-"}
                        </td>
                        <td className="p-3 text-slate-600">
                          {item.notes || "-"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default Invoice;
