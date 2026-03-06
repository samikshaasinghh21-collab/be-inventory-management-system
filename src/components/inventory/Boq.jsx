import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import LineItemsEditor from "./LineItemsEditor";
import useSettings from "../../hooks/useSettings";
import { fetchProjects } from "../../services/projectsApi";
import {
  createBoq,
  deleteBoq,
  fetchBoqs,
  updateBoq,
} from "../../services/boqApi";
import DateInput from "../common/DateInput";
import { formatDate } from "../../utils/dateFormat";
import { printSection } from "../../utils/printUtils";
import { resolveBrandLogo } from "../../utils/branding";
import DocumentViewPanel from "./DocumentViewPanel";

const createLineItem = () => ({
  id: Date.now() + Math.random(),
  name: "",
  description: "",
  unit: "PCS",
  quantity: "",
  rate: "",
  notes: "",
});

const createFormState = (boqNumber = "") => ({
  projectId: "",
  boqNumber,
  version: "1",
  preparedBy: "",
  status: "Draft",
  date: new Date().toISOString().slice(0, 10),
  notes: "",
});

const generateNextBoqNumber = (records = []) => {
  const year = new Date().getFullYear();
  const prefix = `BOQ-${year}-`;
  const sequencePattern = new RegExp(`^BOQ-${year}-(\\d+)$`, "i");
  const usedNumbers = new Set();
  let maxSequence = 0;

  for (const record of records) {
    const currentNumber = String(record?.boqNumber ?? "").trim();
    if (!currentNumber) {
      continue;
    }

    usedNumbers.add(currentNumber.toUpperCase());
    const match = currentNumber.match(sequencePattern);
    if (!match) {
      continue;
    }

    const parsed = Number.parseInt(match[1], 10);
    if (Number.isFinite(parsed)) {
      maxSequence = Math.max(maxSequence, parsed);
    }
  }

  let sequence = maxSequence + 1;
  let candidate = `${prefix}${String(sequence).padStart(3, "0")}`;
  while (usedNumbers.has(candidate.toUpperCase())) {
    sequence += 1;
    candidate = `${prefix}${String(sequence).padStart(3, "0")}`;
  }

  return candidate;
};

const Boq = () => {
  const settings = useSettings();
  const currency = settings?.preferences?.currency || "INR";
  const [projects, setProjects] = useState([]);
  const [records, setRecords] = useState([]);
  const [form, setForm] = useState(createFormState);
  const [items, setItems] = useState([createLineItem()]);
  const [errors, setErrors] = useState({});
  const [editingId, setEditingId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [viewRecord, setViewRecord] = useState(null);
  const navigate = useNavigate();
  const company = settings?.company || {};
  const logoUrl = resolveBrandLogo(company.logo || settings?.profile?.avatar || "");
  const brandName = company.name || "Bangalore Electronics";
  const brandDescription = company.address || "Company address";

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

  const loadData = async () => {
    try {
      setLoading(true);
      const [projectList, boqList] = await Promise.all([
        fetchProjects(),
        fetchBoqs(),
      ]);
      setProjects(projectList);
      setRecords(boqList);
    } catch (error) {
      console.error("Failed to load BOQ data", error);
      setErrorMessage("Unable to load BOQ data. Please refresh.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (editingId) {
      return;
    }

    const nextBoqNumber = generateNextBoqNumber(records);
    setForm((prev) => {
      if (prev.boqNumber === nextBoqNumber) {
        return prev;
      }
      return { ...prev, boqNumber: nextBoqNumber };
    });
  }, [records, editingId]);

  // Import selected products from product picker (pick=boq flow)
  useEffect(() => {
    try {
      const raw = localStorage.getItem("boq_selected_products");
      if (!raw) return;
      const selected = JSON.parse(raw);
      if (Array.isArray(selected) && selected.length > 0) {
        setItems((prev) => {
          const base =
            prev.length === 1 &&
            !prev[0].name &&
            !prev[0].quantity &&
            !prev[0].rate
              ? []
              : prev;
          const mapped = selected.map((item) => ({
            id: item.id ?? Date.now() + Math.random(),
            name: item.name ?? "",
            description: item.description ?? "",
            unit: item.unit ?? "PCS",
            quantity: item.quantity ?? item.qty ?? 1,
            rate: item.rate ?? 0,
            notes: item.notes ?? "",
          }));
          return [...base, ...mapped];
        });
      }
    } catch (err) {
      console.error("Failed to import BOQ selections", err);
    } finally {
      localStorage.removeItem("boq_selected_products");
    }
  }, []);

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

  const draftCount = records.filter((record) => record.status === "Draft").length;

  const boqRegisterMeta = useMemo(
    () => [
      { label: "Total BOQs", value: records.length },
      { label: "Draft BOQs", value: draftCount },
      { label: "Estimated Value", value: formatCurrency(totalValue) },
    ],
    [records.length, draftCount, totalValue, currency]
  );

  const resetForm = (nextRecords = records) => {
    setForm(createFormState(generateNextBoqNumber(nextRecords)));
    setItems([createLineItem()]);
    setErrors({});
    setEditingId(null);
  };

  const validate = () => {
    const nextErrors = {};
    if (!form.projectId) {
      nextErrors.projectId = "Select a project.";
    }
    if (!form.boqNumber.trim()) {
      nextErrors.boqNumber = "BOQ number is required.";
    }
    const hasValidItem = items.some(
      (item) => item.name.trim() && Number(item.quantity) > 0
    );
    if (!hasValidItem) {
      nextErrors.items = "Add at least one item with quantity.";
    }
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleSubmit = async (event) => {
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
      projectId: Number(form.projectId),
      boqNumber: form.boqNumber.trim(),
      version: form.version,
      preparedBy: form.preparedBy,
      status: form.status,
      date: form.date,
      notes: form.notes,
      items: cleanedItems.map((item) => ({
        name: item.name,
        description: item.description,
        unit: item.unit,
        quantity: Number(item.quantity) || 0,
        rate: Number(item.rate) || 0,
        notes: item.notes,
      })),
      total,
    };

    try {
      setSaving(true);
      setErrorMessage("");
      if (editingId) {
        await updateBoq(editingId, payload);
      } else {
        await createBoq(payload);
      }
      const fresh = await fetchBoqs();
      setRecords(fresh);
      resetForm(fresh);
    } catch (error) {
      console.error("Failed to save BOQ", error);
      setErrorMessage(error?.response?.data?.error ?? "Failed to save BOQ");
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (record) => {
    setEditingId(record.id);
    setForm({
      projectId: record.projectId || "",
      boqNumber: record.boqNumber || "",
      version: record.version || "1",
      preparedBy: record.preparedBy || "",
      status: record.status || "Draft",
      date: record.date || new Date().toISOString().slice(0, 10),
      notes: record.notes || "",
    });
    setItems(
      record.items?.length
        ? record.items.map((item) => ({
            id: item.id ?? Date.now() + Math.random(),
            name: item.name ?? "",
            description: item.description ?? "",
            unit: item.unit ?? "PCS",
            quantity: item.quantity ?? "",
            rate: item.rate ?? "",
            notes: item.notes ?? "",
          }))
        : [createLineItem()]
    );
    setErrors({});
  };

  const handleDelete = async (id) => {
    try {
      setSaving(true);
      await deleteBoq(id);
      setRecords((prev) => prev.filter((record) => record.id !== id));
      if (viewRecord?.id === id) {
        setViewRecord(null);
      }
    } catch (error) {
      console.error("Failed to delete BOQ", error);
      setErrorMessage(error?.response?.data?.error ?? "Failed to delete BOQ");
    } finally {
      setSaving(false);
    }
  };

  const handlePickFromProducts = () => {
    navigate("/inventory/products?pick=boq");
  };

  const handleView = (record) => {
    setViewRecord(record);
  };

  const handlePrint = (record) => {
    setViewRecord(record);
    setTimeout(() => {
      printSection({
        selector: "#boq-view-panel",
        title: "BOQ Details",
        logoUrl,
        brandName,
        brandDescription,
      });
    }, 80);
  };

  return (
    <div className="p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between mb-6">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-slate-400">
            Projects
          </p>
          <h1 className="text-3xl font-semibold text-slate-800">
            Bill of Quantity (BOQ)
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Define baseline materials and quantities for each project.
          </p>
          {errorMessage && (
            <p className="text-sm text-red-600 mt-2">{errorMessage}</p>
          )}
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={resetForm}
            className="px-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-700 bg-white hover:border-slate-300"
          >
            Clear Form
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-white p-4 rounded-lg shadow-sm border border-slate-200">
          <p className="text-sm text-slate-500">Total BOQs</p>
          <p className="text-2xl font-semibold text-slate-800">
            {records.length}
          </p>
        </div>
        <div className="bg-white p-4 rounded-lg shadow-sm border border-slate-200">
          <p className="text-sm text-slate-500">Draft BOQs</p>
          <p className="text-2xl font-semibold text-slate-800">
            {draftCount}
          </p>
        </div>
        <div className="bg-white p-4 rounded-lg shadow-sm border border-slate-200">
          <p className="text-sm text-slate-500">Estimated Value</p>
          <p className="text-2xl font-semibold text-slate-800">
            {formatCurrency(totalValue)}
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4 mb-6">
        <div className="bg-white p-5 rounded-lg shadow-sm border border-slate-200">
          <h2 className="text-lg font-semibold text-slate-800 mb-4">
            BOQ Details
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="text-sm font-medium text-slate-700">
                Project *
              </label>
              <select
                value={form.projectId}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    projectId: event.target.value,
                  }))
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
                BOQ Number *
              </label>
              <input
                type="text"
                value={form.boqNumber}
                readOnly
                className="w-full mt-1 border border-slate-200 rounded-lg px-3 py-2 bg-slate-100 text-slate-600 cursor-not-allowed"
              />
              <p className="text-xs text-slate-500 mt-1">
                Auto-generated by system.
              </p>
              {errors.boqNumber && (
                <p className="text-xs text-red-600 mt-1">
                  {errors.boqNumber}
                </p>
              )}
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700">
                Version
              </label>
              <input
                type="text"
                value={form.version}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    version: event.target.value,
                  }))
                }
                className="w-full mt-1 border border-slate-200 rounded-lg px-3 py-2"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700">
                Prepared By
              </label>
              <input
                type="text"
                value={form.preparedBy}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    preparedBy: event.target.value,
                  }))
                }
                placeholder="Site Engineer"
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
                  setForm((prev) => ({
                    ...prev,
                    status: event.target.value,
                  }))
                }
                className="w-full mt-1 border border-slate-200 rounded-lg px-3 py-2"
              >
                <option value="Draft">Draft</option>
                <option value="Approved">Approved</option>
                <option value="Closed">Closed</option>
              </select>
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700">
                Date
              </label>
              <DateInput
                value={form.date}
                onChange={(value) =>
                  setForm((prev) => ({
                    ...prev,
                    date: value,
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
                  setForm((prev) => ({
                    ...prev,
                    notes: event.target.value,
                  }))
                }
                placeholder="Scope assumptions, approvals, or remarks."
                className="w-full mt-1 border border-slate-200 rounded-lg px-3 py-2 min-h-[90px]"
              />
            </div>
          </div>
        </div>

        <LineItemsEditor
          items={items}
          onChange={setItems}
          onPickFromProducts={handlePickFromProducts}
          pickLabel="Pick from Products"
        />
        {errors.items && (
          <p className="text-xs text-red-600">{errors.items}</p>
        )}

        <div className="flex items-center justify-end gap-3">
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
            disabled={saving}
          >
            {saving ? "Saving..." : editingId ? "Update BOQ" : "Save BOQ"}
          </button>
        </div>
      </form>

      <div
        id="boq-register"
        className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-x-auto"
      >
        <div className="px-4 py-3 border-b flex items-center justify-between gap-3">
          <h3 className="text-lg font-semibold text-slate-800">
            BOQ Register
          </h3>
          <div className="flex gap-2 ml-auto">
                <button
                  type="button"
                  onClick={() =>
                    printSection({
                      selector: "#boq-register",
                      title: "BOQ Register",
                      subtitle: "Approved bill of quantities log",
                      metaRows: boqRegisterMeta,
                      logoUrl,
                      brandName,
                      brandDescription,
                    })
                  }
                  className="px-3 py-1 rounded-full border border-slate-300 text-xs text-slate-600 hover:border-slate-400 hover:text-slate-800"
                >
              Print register
            </button>
          </div>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-slate-100 text-slate-600">
            <tr>
              <th className="p-3 text-left min-w-[160px]">BOQ No</th>
              <th className="p-3 text-left min-w-[180px]">Project</th>
              <th className="p-3 text-left min-w-[90px]">Version</th>
              <th className="p-3 text-left min-w-[120px]">Status</th>
              <th className="p-3 text-left min-w-[110px]">Items</th>
              <th className="p-3 text-left min-w-[140px]">Value</th>
              <th className="p-3 text-left min-w-[140px]">Date</th>
              <th className="p-3 text-left min-w-[160px]">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan="8" className="p-6 text-center text-slate-500">
                  Loading BOQs...
                </td>
              </tr>
            )}
            {!loading && records.length === 0 && (
              <tr>
                <td colSpan="8" className="p-6 text-center text-slate-500">
                  No BOQs created yet.
                </td>
              </tr>
            )}
            {records.map((record) => (
              <tr key={record.id} className="border-t hover:bg-slate-50">
                <td className="p-3 font-medium text-slate-800">
                  {record.boqNumber || "-"}
                </td>
                <td className="p-3">
                  {projectMap[String(record.projectId)]?.name || "-"}
                </td>
                <td className="p-3">{record.version || "-"}</td>
                <td className="p-3">{record.status || "-"}</td>
                <td className="p-3">{record.items?.length || 0}</td>
                <td className="p-3 font-medium">
                  {formatCurrency(record.total || 0)}
                </td>
                <td className="p-3">{formatDate(record.date) || "-"}</td>
                <td className="p-3 flex gap-3">
                  <button
                    type="button"
                    onClick={() => handleView(record)}
                    className="text-slate-700 text-sm underline"
                  >
                    View
                  </button>
                  <button
                    type="button"
                    onClick={() => handlePrint(record)}
                    className="text-slate-600 text-sm"
                  >
                    Print
                  </button>
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
                    disabled={saving}
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {viewRecord && (
        <DocumentViewPanel
          id="boq-view-panel"
          title="BILL OF QUANTITY"
          onClose={() => setViewRecord(null)}
          companyName={brandName}
          companyAddress={brandDescription}
          companyGstin={company.gstin}
          companyPhone={company.phone}
          companyEmail={company.email}
          logoUrl={logoUrl}
          primaryPairs={[
            { label: "BOQ No", value: viewRecord.boqNumber || viewRecord.id },
            { label: "Date", value: formatDate(viewRecord.date) },
            { label: "Version", value: viewRecord.version },
            { label: "Status", value: viewRecord.status },
          ]}
          leftBlockTitle="Project"
          leftBlockLines={[projectMap[String(viewRecord.projectId)]?.name || "-"]}
          rightBlockTitle="Prepared By / Notes"
          rightBlockLines={[viewRecord.preparedBy || "-", viewRecord.notes || "-"]}
          tableColumns={[
            { key: "serial", label: "Sl No", widthClass: "w-16" },
            { key: "name", label: "Item" },
            { key: "unit", label: "Unit", widthClass: "w-20" },
            { key: "quantity", label: "Qty", align: "right", widthClass: "w-20" },
            { key: "rate", label: "Rate", align: "right", widthClass: "w-24" },
            { key: "amount", label: "Amount", align: "right", widthClass: "w-28" },
          ]}
          tableRows={(viewRecord.items || []).map((item, index) => {
            const qty = Number(item.quantity || 0);
            const rate = Number(item.rate || 0);
            return {
              id: item.id || index,
              serial: index + 1,
              name: item.name || "-",
              unit: item.unit || "-",
              quantity: qty,
              rate: formatCurrency(rate),
              amount: formatCurrency(qty * rate),
            };
          })}
          bottomLeftTitle="Notes"
          bottomLeftValue={viewRecord.notes || "-"}
          bottomRightTitle="Total Value"
          bottomRightValue={formatCurrency(viewRecord.total || 0)}
          footerCompanyName={brandName}
        />
      )}
    </div>
  );
};

export default Boq;
