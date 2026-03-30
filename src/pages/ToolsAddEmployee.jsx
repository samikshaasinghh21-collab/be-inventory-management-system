import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { getToolEmployees, setToolEmployees } from "../services/toolEmployeesStore";

const emptyForm = {
  id: "",
  name: "",
  role: "",
  department: "",
  location: "",
  email: "",
  phone: "",
  status: "Active",
  notes: "",
};

const inputClass =
  "mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100";

const ToolsAddEmployee = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const employee = location.state?.employee || null;
  const [form, setForm] = useState(employee || emptyForm);
  const [errors, setErrors] = useState({});
  const isViewMode = Boolean(employee);

  const updateField = (field, value) =>
    setForm((current) => ({
      ...current,
      [field]: value,
    }));

  const handleDeleteEmployee = () => {
    if (!employee) return;
    const confirmed = window.confirm(
      `Delete employee ${employee.name || employee.id}?`
    );
    if (!confirmed) return;

    const updatedEmployees = getToolEmployees().filter(
      (record) => record.id !== employee.id
    );
    setToolEmployees(updatedEmployees);
    navigate("/inventory/tools/employees");
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    if (isViewMode) {
      navigate("/inventory/tools/employees");
      return;
    }

    const nextErrors = {};
    if (!form.name.trim()) nextErrors.name = "Employee name is required.";
    if (!form.id.trim()) nextErrors.id = "Employee ID is required.";
    if (!form.role.trim()) nextErrors.role = "Role is required.";
    if (!form.department.trim()) nextErrors.department = "Department is required.";

    const existingEmployees = getToolEmployees();
    const duplicate = existingEmployees.some(
      (record) =>
        String(record.id).toLowerCase() === String(form.id).trim().toLowerCase()
    );
    if (duplicate) {
      nextErrors.id = "Employee ID must be unique.";
    }

    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;

    setToolEmployees([
      {
        ...form,
        id: form.id.trim(),
        name: form.name.trim(),
        role: form.role.trim(),
        department: form.department.trim(),
        location: form.location.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
        notes: form.notes.trim(),
      },
      ...existingEmployees,
    ]);

    navigate("/inventory/tools/employees");
  };

  return (
    <div className="min-h-screen bg-slate-50/80 p-4 md:p-6 space-y-5">
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-xs uppercase tracking-[0.25em] text-slate-500">
          Tools
        </p>
        <h1 className="text-2xl md:text-3xl font-semibold text-slate-900">
          {isViewMode ? "Employee Details" : "Add New Employee"}
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          {isViewMode
            ? "View the selected employee record."
            : "Add a new employee for tool assignment and tracking."}
        </p>
      </section>

      <form
        onSubmit={handleSubmit}
        className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
      >
        <div className="grid gap-5 md:grid-cols-2">
          <div>
            <label className="text-sm font-medium text-slate-700">Employee Name</label>
            <input
              value={form.name}
              onChange={(event) => updateField("name", event.target.value)}
              disabled={isViewMode}
              className={inputClass}
            />
            {errors.name && <p className="mt-1 text-xs text-red-600">{errors.name}</p>}
          </div>
          <div>
            <label className="text-sm font-medium text-slate-700">Employee ID</label>
            <input
              value={form.id}
              onChange={(event) => updateField("id", event.target.value)}
              disabled={isViewMode}
              className={inputClass}
            />
            {errors.id && <p className="mt-1 text-xs text-red-600">{errors.id}</p>}
          </div>
          <div>
            <label className="text-sm font-medium text-slate-700">Role</label>
            <input
              value={form.role}
              onChange={(event) => updateField("role", event.target.value)}
              disabled={isViewMode}
              className={inputClass}
            />
            {errors.role && <p className="mt-1 text-xs text-red-600">{errors.role}</p>}
          </div>
          <div>
            <label className="text-sm font-medium text-slate-700">Department</label>
            <input
              value={form.department}
              onChange={(event) => updateField("department", event.target.value)}
              disabled={isViewMode}
              className={inputClass}
            />
            {errors.department && (
              <p className="mt-1 text-xs text-red-600">{errors.department}</p>
            )}
          </div>
          <div>
            <label className="text-sm font-medium text-slate-700">Location</label>
            <input
              value={form.location}
              onChange={(event) => updateField("location", event.target.value)}
              disabled={isViewMode}
              className={inputClass}
            />
          </div>
          <div>
            <label className="text-sm font-medium text-slate-700">Email</label>
            <input
              type="email"
              value={form.email}
              onChange={(event) => updateField("email", event.target.value)}
              disabled={isViewMode}
              className={inputClass}
            />
          </div>
          <div>
            <label className="text-sm font-medium text-slate-700">Phone Number</label>
            <input
              value={form.phone}
              onChange={(event) => updateField("phone", event.target.value)}
              disabled={isViewMode}
              className={inputClass}
            />
          </div>
          <div>
            <label className="text-sm font-medium text-slate-700">Status</label>
            <select
              value={form.status}
              onChange={(event) => updateField("status", event.target.value)}
              disabled={isViewMode}
              className={inputClass}
            >
              <option value="Active">Active</option>
              <option value="Inactive">Inactive</option>
            </select>
          </div>
          <div className="md:col-span-2">
            <label className="text-sm font-medium text-slate-700">Notes</label>
            <textarea
              value={form.notes}
              onChange={(event) => updateField("notes", event.target.value)}
              disabled={isViewMode}
              className={`${inputClass} min-h-[100px]`}
            />
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-3">
          {isViewMode && (
            <button
              type="button"
              onClick={handleDeleteEmployee}
              className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-medium text-red-700 transition hover:bg-red-100"
            >
              Delete
            </button>
          )}
          <button
            type="button"
            onClick={() => navigate("/inventory/tools/employees")}
            className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-300"
          >
            Cancel
          </button>
          {!isViewMode && (
            <button
              type="submit"
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700"
            >
              Save Employee
            </button>
          )}
        </div>
      </form>
    </div>
  );
};

export default ToolsAddEmployee;
