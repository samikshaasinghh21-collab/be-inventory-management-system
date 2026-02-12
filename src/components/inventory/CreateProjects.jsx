import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { saveProject } from "../../services/projectsStore";
import DateInput from "../common/DateInput";

const STATUS_OPTIONS = ["Planned", "Active", "On Hold", "Completed"];

const CreateProjects = () => {
  const navigate = useNavigate();
  const [projectName, setProjectName] = useState("");
  const [projectCode, setProjectCode] = useState("");
  const [client, setClient] = useState("");
  const [status, setStatus] = useState("Planned");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [notes, setNotes] = useState("");
  const [errors, setErrors] = useState({});

  const validate = () => {
    const nextErrors = {};
    if (!projectName.trim()) {
      nextErrors.projectName = "Project name is required.";
    }
    if (startDate && endDate && endDate < startDate) {
      nextErrors.endDate = "End date must be after the start date.";
    }
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    if (!validate()) {
      return;
    }

    const payload = {
      id: Date.now(),
      name: projectName.trim(),
      code: projectCode.trim(),
      client: client.trim(),
      status,
      startDate,
      endDate,
      notes: notes.trim(),
      createdAt: new Date().toISOString(),
    };

    saveProject(payload);
    navigate("/inventory/projects");
  };

  const clearError = (key) => {
    if (errors[key]) {
      setErrors((prev) => ({ ...prev, [key]: undefined }));
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-[1px] flex items-center justify-center z-50">
      <div className="bg-white w-[1000px] max-w-[96vw] rounded-2xl shadow-2xl overflow-hidden border border-slate-200 max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b bg-slate-50">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-slate-500">
              Projects
            </p>
            <h2 className="text-xl font-semibold text-slate-900">
              Create Project
            </h2>
          </div>
          <button
            onClick={() => navigate(-1)}
            className="h-9 w-9 grid place-items-center rounded-full border border-slate-200 text-slate-500 hover:text-slate-900 hover:border-slate-300 transition"
            aria-label="Close"
            type="button"
          >
            X
          </button>
        </div>

        {/* Body */}
        <div className="flex flex-1 min-h-0">
          {/* Left Sidebar */}
          <aside className="w-64 border-r bg-slate-50 p-5 shrink-0">
            <p className="text-xs uppercase tracking-[0.3em] text-slate-400 mb-4">
              Sections
            </p>
            <div className="space-y-2 text-sm">
              <div className="px-3 py-2 rounded-lg bg-white border border-slate-200 text-slate-900 shadow-sm">
                Basic Details
              </div>
              <div className="px-3 py-2 rounded-lg text-slate-600">
                Timeline
              </div>
              <div className="px-3 py-2 rounded-lg text-slate-600">
                Notes
              </div>
            </div>
            <p className="text-xs text-slate-500 mt-6">
              Fields marked with * are required.
            </p>
          </aside>

          {/* Form */}
          <div className="flex-1 min-h-0 overflow-y-auto p-6">
            <form
              id="create-project-form"
              className="space-y-6"
              onSubmit={handleSubmit}
              noValidate
            >
              {/* Basic Details */}
              <section className="border border-slate-200 rounded-xl p-5 shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-base font-semibold text-slate-800">
                    Basic Details
                  </h3>
                  <span className="text-xs text-slate-500">Required</span>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                  <div>
                    <label className="text-sm font-medium text-slate-700">
                      Project Name *
                    </label>
                    <input
                      value={projectName}
                      onChange={(event) => {
                        setProjectName(event.target.value);
                        clearError("projectName");
                      }}
                      type="text"
                      placeholder="Ex: Mall Renovation"
                      className="w-full mt-1 border border-slate-200 rounded-lg px-4 py-3 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none"
                      aria-invalid={Boolean(errors.projectName)}
                    />
                    {errors.projectName && (
                      <p className="mt-1 text-sm text-red-600">
                        {errors.projectName}
                      </p>
                    )}
                  </div>

                  <div>
                    <label className="text-sm font-medium text-slate-700">
                      Project Code
                    </label>
                    <input
                      value={projectCode}
                      onChange={(event) => setProjectCode(event.target.value)}
                      type="text"
                      placeholder="Ex: PRJ-2026-001"
                      className="w-full mt-1 border border-slate-200 rounded-lg px-4 py-3 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none"
                    />
                  </div>

                  <div>
                    <label className="text-sm font-medium text-slate-700">
                      Client
                    </label>
                    <input
                      value={client}
                      onChange={(event) => setClient(event.target.value)}
                      type="text"
                      placeholder="Ex: Sunrise Developers"
                      className="w-full mt-1 border border-slate-200 rounded-lg px-4 py-3 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none"
                    />
                  </div>

                  <div>
                    <label className="text-sm font-medium text-slate-700">
                      Status
                    </label>
                    <select
                      value={status}
                      onChange={(event) => setStatus(event.target.value)}
                      className="w-full mt-1 border border-slate-200 rounded-lg px-4 py-3 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none"
                    >
                      {STATUS_OPTIONS.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </section>

              {/* Timeline */}
              <section className="border border-slate-200 rounded-xl p-5 shadow-sm">
                <h3 className="text-base font-semibold text-slate-800 mb-4">
                  Timeline
                </h3>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                  <div>
                    <label className="text-sm font-medium text-slate-700">
                      Start Date
                    </label>
                    <DateInput
                      value={startDate}
                      onChange={(value) => setStartDate(value)}
                      className="w-full mt-1 border border-slate-200 rounded-lg px-4 py-3 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none"
                    />
                  </div>

                  <div>
                    <label className="text-sm font-medium text-slate-700">
                      End Date
                    </label>
                    <DateInput
                      value={endDate}
                      onChange={(value) => {
                        setEndDate(value);
                        clearError("endDate");
                      }}
                      className="w-full mt-1 border border-slate-200 rounded-lg px-4 py-3 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none"
                      aria-invalid={Boolean(errors.endDate)}
                    />
                    {errors.endDate && (
                      <p className="mt-1 text-sm text-red-600">
                        {errors.endDate}
                      </p>
                    )}
                  </div>
                </div>
              </section>

              {/* Notes */}
              <section className="border border-slate-200 rounded-xl p-5 shadow-sm">
                <h3 className="text-base font-semibold text-slate-800 mb-4">
                  Notes
                </h3>
                <textarea
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  placeholder="Project notes or special requirements"
                  className="w-full mt-1 border border-slate-200 rounded-lg px-4 py-3 text-sm min-h-[140px] focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none"
                />
              </section>
            </form>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t bg-slate-50">
          <p className="text-xs text-slate-500">
            Projects will be available for allocation once created.
          </p>
          <div className="flex gap-3">
            <button
              onClick={() => navigate(-1)}
              className="px-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-700 hover:border-slate-300 hover:text-slate-900"
              type="button"
            >
              Cancel
            </button>
            <button
              form="create-project-form"
              type="submit"
              className="px-5 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700"
            >
              Save Project
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CreateProjects;
