import { useState } from "react";
import { useNavigate } from "react-router-dom";
import DateInput from "../components/common/DateInput";
import { generateNextToolId, getTools, setTools } from "../services/toolsStore";

const emptyForm = {
  id: "",
  name: "",
  type: "",
  serialNumber: "",
  purchaseDate: "",
  baseLocation: "",
  condition: "Good",
  status: "Available",
  imageUrl: "",
  notes: "",
};

const inputClass =
  "mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100";

const ToolsAddTool = () => {
  const navigate = useNavigate();
  const [form, setForm] = useState(() => ({
    ...emptyForm,
    id: generateNextToolId(getTools()),
  }));
  const [errors, setErrors] = useState({});

  const updateField = (field, value) =>
    setForm((current) => ({
      ...current,
      [field]: value,
    }));

  const handleImageChange = (event) => {
    const file = event.target.files?.[0];
    if (!file) {
      updateField("imageUrl", "");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      updateField(
        "imageUrl",
        typeof reader.result === "string" ? reader.result : ""
      );
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = (event) => {
    event.preventDefault();

    const nextErrors = {};
    if (!form.name.trim()) nextErrors.name = "Tool name is required.";
    if (!form.type.trim()) nextErrors.type = "Tool type is required.";
    if (!form.serialNumber.trim()) {
      nextErrors.serialNumber = "Serial number is required.";
    }

    const existingTools = getTools();
    const duplicateSerial = existingTools.some(
      (tool) =>
        String(tool.serialNumber).toLowerCase() ===
        String(form.serialNumber).trim().toLowerCase()
    );

    if (duplicateSerial) nextErrors.serialNumber = "Serial number must be unique.";

    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;

    const nextToolId = generateNextToolId(existingTools);

    setTools([
      {
        id: nextToolId,
        name: form.name.trim(),
        type: form.type.trim(),
        serialNumber: form.serialNumber.trim(),
        purchaseDate: form.purchaseDate,
        baseLocation: form.baseLocation.trim(),
        condition: form.condition,
        status: form.status,
        imageUrl: form.imageUrl,
        notes: form.notes.trim(),
      },
      ...existingTools,
    ]);

    navigate("/inventory/tools/list");
  };

  return (
    <div className="min-h-screen bg-slate-50/80 p-4 md:p-6 space-y-5">
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-xs uppercase tracking-[0.25em] text-slate-500">
          Tools
        </p>
        <h1 className="text-2xl md:text-3xl font-semibold text-slate-900">
          Add New Tool
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          Register a new tool for assignment, tracking, and maintenance.
        </p>
      </section>

      <form
        onSubmit={handleSubmit}
        className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
      >
        <div className="grid gap-5 md:grid-cols-2">
          <div>
            <label className="text-sm font-medium text-slate-700">Tool Name</label>
            <input
              value={form.name}
              onChange={(event) => updateField("name", event.target.value)}
              className={inputClass}
            />
            {errors.name && <p className="mt-1 text-xs text-red-600">{errors.name}</p>}
          </div>
          <div>
            <label className="text-sm font-medium text-slate-700">Tool ID</label>
            <input
              value={form.id}
              readOnly
              className={`${inputClass} bg-slate-50`}
            />
            <p className="mt-1 text-xs text-slate-500">
              Tool ID is auto-generated when the tool is created.
            </p>
          </div>
          <div>
            <label className="text-sm font-medium text-slate-700">Tool Type</label>
            <input
              value={form.type}
              onChange={(event) => updateField("type", event.target.value)}
              className={inputClass}
            />
            {errors.type && <p className="mt-1 text-xs text-red-600">{errors.type}</p>}
          </div>
          <div>
            <label className="text-sm font-medium text-slate-700">Serial Number</label>
            <input
              value={form.serialNumber}
              onChange={(event) => updateField("serialNumber", event.target.value)}
              className={inputClass}
            />
            {errors.serialNumber && (
              <p className="mt-1 text-xs text-red-600">{errors.serialNumber}</p>
            )}
          </div>
          <div>
            <label className="text-sm font-medium text-slate-700">Purchase Date</label>
            <DateInput
              value={form.purchaseDate}
              onChange={(value) => updateField("purchaseDate", value || "")}
              className={inputClass}
            />
          </div>
          <div>
            <label className="text-sm font-medium text-slate-700">Tool Location</label>
            <input
              value={form.baseLocation}
              onChange={(event) => updateField("baseLocation", event.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label className="text-sm font-medium text-slate-700">Condition</label>
            <select
              value={form.condition}
              onChange={(event) => updateField("condition", event.target.value)}
              className={inputClass}
            >
              <option value="Good">Good</option>
              <option value="Fair">Fair</option>
              <option value="Damaged">Damaged</option>
              <option value="Repair Needed">Repair Needed</option>
            </select>
          </div>
          <div>
            <label className="text-sm font-medium text-slate-700">Status</label>
            <select
              value={form.status}
              onChange={(event) => updateField("status", event.target.value)}
              className={inputClass}
            >
              <option value="Available">Available</option>
              <option value="In Use">In Use</option>
              <option value="Maintenance">Maintenance</option>
              <option value="Overdue">Overdue</option>
            </select>
          </div>
          <div className="md:col-span-2">
            <label className="text-sm font-medium text-slate-700">Upload Tool Image</label>
            <input
              type="file"
              accept="image/*"
              onChange={handleImageChange}
              className={`${inputClass} file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-sm file:font-medium file:text-slate-700`}
            />
            {form.imageUrl && (
              <img
                src={form.imageUrl}
                alt="Tool preview"
                className="mt-3 h-28 w-28 rounded-xl border border-slate-200 object-cover"
              />
            )}
          </div>
          <div className="md:col-span-2">
            <label className="text-sm font-medium text-slate-700">Notes</label>
            <textarea
              value={form.notes}
              onChange={(event) => updateField("notes", event.target.value)}
              className={`${inputClass} min-h-[100px]`}
            />
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={() => navigate("/inventory/tools/list")}
            className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-300"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700"
          >
            Save Tool
          </button>
        </div>
      </form>
    </div>
  );
};

export default ToolsAddTool;
