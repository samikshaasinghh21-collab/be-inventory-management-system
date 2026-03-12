import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  deleteProject as deleteProjectLocal,
  getProjects,
  setProjects as setLocalProjects,
  updateProject as updateProjectLocal,
} from "../services/projectsStore";
import {
  deleteProjectApi,
  fetchProjects,
  updateProjectApi,
} from "../services/projectsApi";
import DateInput from "../components/common/DateInput";
import { formatTimelineRange } from "../utils/dateFormat";

const normalizeText = (value) => String(value ?? "").trim();

const normalizeOptional = (value) => {
  const trimmed = normalizeText(value);
  return trimmed.length ? trimmed : null;
};

const normalizeDateValue = (value) => {
  const trimmed = normalizeText(value);
  return trimmed.length ? trimmed : null;
};

const ProjectsHome = () => {
  const navigate = useNavigate();
  const [projects, setProjects] = useState(() => getProjects());
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState(null);
  const [apiError, setApiError] = useState("");
  const [form, setForm] = useState({
    name: "",
    code: "",
    client: "",
    status: "Planned",
    startDate: "",
    endDate: "",
    notes: "",
  });
  const [errors, setErrors] = useState({});
  const [deleteTarget, setDeleteTarget] = useState(null);

  const loadProjects = async () => {
    try {
      const list = await fetchProjects();
      setLocalProjects(list);
      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent("projects:load-status", { detail: "" })
        );
      }
    } catch (error) {
      console.error("Failed to load projects from API", error);
      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent("projects:load-status", {
            detail: "Unable to load latest projects. Showing cached list.",
          })
        );
      }
    }
  };

  useEffect(() => {
    const handleProjectsChange = () => {
      setProjects(getProjects());
    };
    const handleLoadStatus = (event) => {
      setApiError(event?.detail || "");
    };
    if (typeof window !== "undefined") {
      window.addEventListener("projects:changed", handleProjectsChange);
      window.addEventListener("projects:load-status", handleLoadStatus);
    }
    void loadProjects();
    return () => {
      if (typeof window !== "undefined") {
        window.removeEventListener("projects:changed", handleProjectsChange);
        window.removeEventListener("projects:load-status", handleLoadStatus);
      }
    };
  }, []);

  const filteredProjects = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return projects;
    return projects.filter(
      (project) =>
        project.name?.toLowerCase().includes(term) ||
        project.client?.toLowerCase().includes(term) ||
        project.status?.toLowerCase().includes(term)
    );
  }, [projects, search]);

  const beginEdit = (project) => {
    setEditing(project);
    setForm({
      name: project.name ?? "",
      code: project.code ?? "",
      client: project.client ?? "",
      status: project.status ?? "Planned",
      startDate: project.startDate ?? "",
      endDate: project.endDate ?? "",
      notes: project.notes ?? "",
    });
    setErrors({});
  };

  const buildNormalizedProject = (source, fallbackStatus = "Planned") => ({
    name: normalizeText(source?.name),
    code: normalizeOptional(source?.code),
    client: normalizeOptional(source?.client),
    status: normalizeText(source?.status) || fallbackStatus,
    startDate: normalizeDateValue(source?.startDate),
    endDate: normalizeDateValue(source?.endDate),
    notes: normalizeOptional(source?.notes),
  });

  const pickFinalValue = (currentValue, baselineValue) =>
    currentValue === baselineValue ? baselineValue : currentValue;

  const validate = (baseline, current) => {
    const nextErrors = {};
    if (!current.name) nextErrors.name = "Project name is required.";
    const finalStart = pickFinalValue(current.startDate, baseline.startDate);
    const finalEnd = pickFinalValue(current.endDate, baseline.endDate);
    if (finalStart && finalEnd && finalEnd < finalStart) {
      nextErrors.endDate = "End date must be after the start date.";
    }
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const saveEdit = async () => {
    if (!editing) return;

    const baseline = buildNormalizedProject(editing, "Planned");
    const current = buildNormalizedProject(form, baseline.status || "Planned");
    if (!validate(baseline, current)) return;

    const payload = {};
    if (current.name !== baseline.name) payload.name = current.name;
    if (current.code !== baseline.code) payload.code = current.code;
    if (current.client !== baseline.client) payload.client = current.client;
    if (current.status !== baseline.status) payload.status = current.status;
    if (current.startDate !== baseline.startDate)
      payload.startDate = current.startDate;
    if (current.endDate !== baseline.endDate) payload.endDate = current.endDate;
    if (current.notes !== baseline.notes) payload.notes = current.notes;

    if (Object.keys(payload).length === 0) {
      setEditing(null);
      setErrors({});
      return;
    }

    try {
      const updated = await updateProjectApi(editing.id, payload);
      setProjects((prev) =>
        prev.map((project) => (project.id === editing.id ? updated : project))
      );
      updateProjectLocal(editing.id, updated);
      setEditing(null);
      setErrors({});
      setApiError("");
    } catch (error) {
      console.error("Failed to update project", error);
      setApiError(
        error?.response?.data?.error ??
          error?.message ??
          "Failed to update project."
      );
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteProjectApi(deleteTarget.id);
      setProjects((prev) =>
        prev.filter((project) => project.id !== deleteTarget.id)
      );
      deleteProjectLocal(deleteTarget.id);
      setDeleteTarget(null);
      setApiError("");
    } catch (error) {
      console.error("Failed to delete project", error);
      setApiError(
        error?.response?.data?.error ??
          error?.message ??
          "Failed to delete project."
      );
    }
  };

  return (
    <>
      <div className="p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-slate-400">
              Projects
            </p>
            <h1 className="text-3xl font-semibold text-slate-800">Projects</h1>
          </div>
          <div className="flex gap-3">
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search by name, client, status"
              className="hidden md:block px-3 py-2 rounded-lg border border-slate-200 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none"
            />
            <button
              type="button"
              onClick={() => navigate("/inventory/create-project")}
              className="px-5 py-2 rounded-lg text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700"
            >
              + Create Project
            </button>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-x-auto">
          {apiError && (
            <div className="mx-3 mb-4 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              {apiError}
            </div>
          )}
          <table className="w-full text-sm">
            <thead className="bg-slate-100 text-slate-600">
              <tr>
                <th className="p-3 text-left">Project</th>
                <th className="p-3 text-left">Client</th>
                <th className="p-3 text-left">Status</th>
                <th className="p-3 text-left">Timeline</th>
                <th className="p-3 text-left">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredProjects.length === 0 && (
                <tr>
                  <td colSpan="5" className="p-6 text-center text-slate-500">
                    No projects found.
                  </td>
                </tr>
              )}
              {filteredProjects.map((project) => (
                <tr key={project.id} className="border-t hover:bg-slate-50">
                  <td className="p-3">
                    <div className="font-semibold text-slate-800">
                      {project.name || "-"}
                    </div>
                    <div className="text-xs text-slate-500">
                      {project.code || "No code"}
                    </div>
                  </td>
                  <td className="p-3">{project.client || "-"}</td>
                  <td className="p-3">
                    <span className="inline-flex items-center rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
                      {project.status || "Planned"}
                    </span>
                  </td>
                  <td className="p-3 text-sm text-slate-600">
                  {formatTimelineRange(project.startDate, project.endDate)}
                </td>
                  <td className="p-3">
                    <div className="flex gap-3 text-sm">
                      <button
                        type="button"
                        onClick={() => beginEdit(project)}
                        className="text-indigo-600 hover:text-indigo-800"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteTarget(project)}
                        className="text-red-600 hover:text-red-800"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {editing && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-[1px] flex items-center justify-center z-50">
          <div className="bg-white w-[900px] max-w-[96vw] rounded-2xl shadow-2xl overflow-hidden border border-slate-200 max-h-[92vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b bg-slate-50">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-slate-500">
                  Projects
                </p>
                <h2 className="text-xl font-semibold text-slate-900">
                  Edit Project
                </h2>
              </div>
              <button
                onClick={() => setEditing(null)}
                className="h-9 w-9 grid place-items-center rounded-full border border-slate-200 text-slate-500 hover:text-slate-900 hover:border-slate-300 transition"
                aria-label="Close"
                type="button"
              >
                X
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div>
                  <label className="text-sm font-medium text-slate-700">
                    Project Name *
                  </label>
                  <input
                    value={form.name}
                    onChange={(event) =>
                      setForm((prev) => ({ ...prev, name: event.target.value }))
                    }
                    className="w-full mt-1 border border-slate-200 rounded-lg px-4 py-3 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none"
                    aria-invalid={Boolean(errors.name)}
                  />
                  {errors.name && (
                    <p className="mt-1 text-sm text-red-600">{errors.name}</p>
                  )}
                </div>

                <div>
                  <label className="text-sm font-medium text-slate-700">
                    Project Code
                  </label>
                  <input
                    value={form.code}
                    onChange={(event) =>
                      setForm((prev) => ({ ...prev, code: event.target.value }))
                    }
                    className="w-full mt-1 border border-slate-200 rounded-lg px-4 py-3 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none"
                    placeholder="PRJ-2026-001"
                  />
                </div>

                <div>
                  <label className="text-sm font-medium text-slate-700">
                    Client
                  </label>
                  <input
                    value={form.client}
                    onChange={(event) =>
                      setForm((prev) => ({
                        ...prev,
                        client: event.target.value,
                      }))
                    }
                    className="w-full mt-1 border border-slate-200 rounded-lg px-4 py-3 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none"
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
                    className="w-full mt-1 border border-slate-200 rounded-lg px-4 py-3 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none"
                  >
                    <option value="Planned">Planned</option>
                    <option value="Active">Active</option>
                    <option value="On Hold">On Hold</option>
                    <option value="Completed">Completed</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div>
                  <label className="text-sm font-medium text-slate-700">
                    Start Date
                  </label>
                  <DateInput
                    value={form.startDate}
                    onChange={(value) =>
                      setForm((prev) => ({ ...prev, startDate: value || "" }))
                    }
                    className="w-full mt-1 border border-slate-200 rounded-lg px-4 py-3 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-slate-700">
                    End Date
                  </label>
                  <DateInput
                    value={form.endDate}
                    onChange={(value) =>
                      setForm((prev) => ({ ...prev, endDate: value || "" }))
                    }
                    className="w-full mt-1 border border-slate-200 rounded-lg px-4 py-3 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none"
                    aria-invalid={Boolean(errors.endDate)}
                  />
                  {errors.endDate && (
                    <p className="mt-1 text-sm text-red-600">{errors.endDate}</p>
                  )}
                </div>
              </div>

              <div>
                <label className="text-sm font-medium text-slate-700">
                  Notes
                </label>
                <textarea
                  value={form.notes}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, notes: event.target.value }))
                  }
                  className="w-full mt-1 border border-slate-200 rounded-lg px-4 py-3 text-sm min-h-[120px] focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none"
                  placeholder="Project notes or special requirements"
                />
              </div>
            </div>

            <div className="flex items-center justify-between px-6 py-4 border-t bg-slate-50">
              <p className="text-xs text-slate-500">
                Keep project details accurate for downstream workflows.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setEditing(null)}
                  className="px-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-700 hover:border-slate-300 hover:text-slate-900"
                  type="button"
                >
                  Cancel
                </button>
                <button
                  onClick={saveEdit}
                  className="px-5 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700"
                  type="button"
                >
                  Save Changes
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {deleteTarget && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
          <div className="bg-white w-[440px] max-w-[90vw] rounded-xl shadow-2xl border border-slate-200 p-6 space-y-4">
            <h3 className="text-lg font-semibold text-slate-900">
              Delete project?
            </h3>
            <p className="text-sm text-slate-600">
              {deleteTarget.name || "This project"} will be removed from local
              storage. This cannot be undone.
            </p>
            <div className="flex justify-end gap-3">
              <button
                className="px-4 py-2 rounded-lg border border-slate-200 text-sm text-slate-700 hover:border-slate-300"
                onClick={() => setDeleteTarget(null)}
                type="button"
              >
                Cancel
              </button>
              <button
                className="px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-700"
                onClick={confirmDelete}
                type="button"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default ProjectsHome;
