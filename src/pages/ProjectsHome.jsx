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
import { fetchCustomers } from "../services/customersApi";
import DateInput from "../components/common/DateInput";
import { formatTimelineRange } from "../utils/dateFormat";

const STATUS_OPTIONS = ["Planned", "Active", "On Hold", "Completed"];

const emptyForm = {
  name: "",
  code: "",
  customerId: "",
  status: "Planned",
  startDate: "",
  endDate: "",
  notes: "",
};

const getCustomerPrimaryName = (customer = {}) =>
  customer.name || customer.companyName || "";

const getCustomerSecondaryCompany = (customer = {}) => {
  const primaryName = getCustomerPrimaryName(customer);
  return customer.companyName && customer.companyName !== primaryName
    ? customer.companyName
    : "";
};

const getCustomerOptionLabel = (customer = {}) => {
  const primaryName = getCustomerPrimaryName(customer);
  const secondaryCompany = getCustomerSecondaryCompany(customer);
  if (secondaryCompany) {
    return `${primaryName} | ${secondaryCompany}`;
  }
  return primaryName || "Unnamed customer";
};

const ProjectsHome = () => {
  const navigate = useNavigate();
  const [projects, setProjects] = useState(() => getProjects());
  const [customers, setCustomers] = useState([]);
  const [customerError, setCustomerError] = useState("");
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [errors, setErrors] = useState({});
  const [apiError, setApiError] = useState("");
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [isSaving, setIsSaving] = useState(false);

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

  const loadCustomers = async () => {
    try {
      setCustomerError("");
      const list = await fetchCustomers();
      setCustomers(list);
    } catch (error) {
      setCustomerError(
        error?.response?.data?.error ??
          error?.message ??
          "Unable to load customers."
      );
      setCustomers([]);
    }
  };

  useEffect(() => {
    const handleProjectsChange = () => setProjects(getProjects());
    const handleLoadStatus = (event) => setApiError(event?.detail || "");

    if (typeof window !== "undefined") {
      window.addEventListener("projects:changed", handleProjectsChange);
      window.addEventListener("projects:load-status", handleLoadStatus);
    }

    void loadProjects();
    void loadCustomers();

    return () => {
      if (typeof window !== "undefined") {
        window.removeEventListener("projects:changed", handleProjectsChange);
        window.removeEventListener("projects:load-status", handleLoadStatus);
      }
    };
  }, []);

  const filteredProjects = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) {
      return projects;
    }
    return projects.filter((project) =>
      [
        project.name,
        project.code,
        project.client,
        project.companyName,
        project.contactPerson,
        project.email,
        project.phone,
        project.status,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(term))
    );
  }, [projects, search]);

  const selectedCustomer =
    customers.find((customer) => String(customer.id) === String(form.customerId)) ||
    null;

  const beginEdit = (project) => {
    setEditing(project);
    setForm({
      name: project.name ?? "",
      code: project.code ?? "",
      customerId: project.customerId ? String(project.customerId) : "",
      status: project.status ?? "Planned",
      startDate: project.startDate ?? "",
      endDate: project.endDate ?? "",
      notes: project.notes ?? "",
    });
    setErrors({});
    setApiError("");
  };

  const closeEdit = () => {
    setEditing(null);
    setForm(emptyForm);
    setErrors({});
  };

  const updateField = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    if (errors[key]) {
      setErrors((prev) => ({ ...prev, [key]: undefined }));
    }
  };

  const validate = () => {
    const nextErrors = {};
    if (!form.name.trim()) {
      nextErrors.name = "Project name is required.";
    }
    if (!form.customerId) {
      nextErrors.customerId = "Select a client.";
    }
    if (form.startDate && form.endDate && form.endDate < form.startDate) {
      nextErrors.endDate = "End date must be after the start date.";
    }
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const saveEdit = async () => {
    if (!editing || !validate() || isSaving) {
      return;
    }

    setIsSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        code: form.code.trim() || undefined,
        customerId: form.customerId || null,
        clientId: form.customerId || null,
        client: getCustomerPrimaryName(selectedCustomer) || undefined,
        companyName: selectedCustomer?.companyName || undefined,
        address: selectedCustomer?.address || undefined,
        gstNumber: selectedCustomer?.gstNumber || undefined,
        phone: selectedCustomer?.phone || undefined,
        email: selectedCustomer?.email || undefined,
        contactPerson: selectedCustomer?.contactPerson || undefined,
        designation: selectedCustomer?.designation || undefined,
        status: form.status || undefined,
        startDate: form.startDate || null,
        endDate: form.endDate || null,
        notes: form.notes.trim() || undefined,
      };

      const updated = await updateProjectApi(editing.id, payload);
      setProjects((prev) =>
        prev.map((project) => (project.id === editing.id ? updated : project))
      );
      updateProjectLocal(editing.id, updated);
      closeEdit();
      setApiError("");
    } catch (error) {
      console.error("Failed to update project", error);
      setApiError(
        error?.response?.data?.error ??
          error?.message ??
          "Failed to update project."
      );
    } finally {
      setIsSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) {
      return;
    }
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
        <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-slate-400">
              Inventory Management
            </p>
            <h1 className="text-3xl font-semibold text-slate-800">Projects</h1>
            <p className="mt-1 text-sm text-slate-500">
              Create projects with client details fetched from the customer
              register.
            </p>
          </div>
          <div className="flex gap-3">
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search by project, client, contact, status"
              className="hidden rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none md:block"
            />
            <button
              type="button"
              onClick={() => navigate("/inventory/create-project")}
              className="rounded-lg bg-indigo-600 px-5 py-2 text-sm font-medium text-white hover:bg-indigo-700"
            >
              + Create Project
            </button>
          </div>
        </div>

        {apiError && (
          <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            {apiError}
          </div>
        )}

        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col gap-2 border-b px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h3 className="text-lg font-semibold text-slate-800">
                Project Register
              </h3>
              {customerError && (
                <p className="mt-1 text-xs text-amber-700">{customerError}</p>
              )}
            </div>
          </div>
          <table className="min-w-[900px] text-sm">
            <thead className="bg-slate-100 text-slate-600">
              <tr>
                <th className="p-3 text-left">Project</th>
                <th className="p-3 text-left">Client Name</th>
                <th className="p-3 text-left">Contact</th>
                <th className="p-3 text-left">Status</th>
                <th className="p-3 text-left">Timeline</th>
                <th className="p-3 text-left">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredProjects.length === 0 && (
                <tr>
                  <td colSpan="6" className="p-6 text-center text-slate-500">
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
                  <td className="p-3">
                    <div className="font-medium text-slate-700">
                      {project.client || "-"}
                    </div>
                    <div className="text-xs text-slate-500">
                      {project.companyName || "No company"}
                    </div>
                  </td>
                  <td className="p-3">
                    <div className="font-medium text-slate-700">
                      {project.contactPerson || "-"}
                    </div>
                    <div className="text-xs text-slate-500">
                      {project.email || project.phone || "No contact details"}
                    </div>
                  </td>
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-[1px]">
          <div className="flex max-h-[92vh] w-[960px] max-w-[96vw] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b bg-slate-50 px-6 py-4">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-slate-500">
                  Projects
                </p>
                <h2 className="text-xl font-semibold text-slate-900">
                  Edit Project
                </h2>
              </div>
              <button
                type="button"
                onClick={closeEdit}
                className="grid h-9 w-9 place-items-center rounded-full border border-slate-200 text-slate-500 hover:border-slate-300 hover:text-slate-900"
              >
                X
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
                <div>
                  <label className="text-sm font-medium text-slate-700">
                    Project Name *
                  </label>
                  <input
                    value={form.name}
                    onChange={(event) => updateField("name", event.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-200 px-4 py-3 text-sm"
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
                    onChange={(event) => updateField("code", event.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-200 px-4 py-3 text-sm"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-slate-700">
                    Client Name *
                  </label>
                  <select
                    value={form.customerId}
                    onChange={(event) =>
                      updateField("customerId", event.target.value)
                    }
                    className="mt-1 w-full rounded-lg border border-slate-200 px-4 py-3 text-sm"
                  >
                    <option value="">
                      {customers.length
                        ? "Select client"
                        : "Add a customer first"}
                    </option>
                    {customers.map((customer) => (
                      <option key={customer.id} value={customer.id}>
                        {getCustomerOptionLabel(customer)}
                      </option>
                    ))}
                  </select>
                  {errors.customerId && (
                    <p className="mt-1 text-sm text-red-600">
                      {errors.customerId}
                    </p>
                  )}
                  {customerError && (
                    <p className="mt-1 text-xs text-amber-700">
                      {customerError}
                    </p>
                  )}
                  {!customerError && customers.length === 0 && (
                    <p className="mt-1 text-xs text-amber-700">
                      Add a customer in the customer register before updating this
                      project.
                    </p>
                  )}
                </div>
                <div>
                  <label className="text-sm font-medium text-slate-700">
                    Status
                  </label>
                  <select
                    value={form.status}
                    onChange={(event) => updateField("status", event.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-200 px-4 py-3 text-sm"
                  >
                    {STATUS_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <section className="rounded-xl border border-slate-200 p-5 shadow-sm">
                <div className="mb-4 flex items-center justify-between">
                  <h3 className="text-base font-semibold text-slate-800">
                    Client Details
                  </h3>
                  <span className="text-xs text-slate-500">
                    Auto-filled from customer record
                  </span>
                </div>
                {!selectedCustomer ? (
                  <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-5 text-sm text-slate-500">
                    Select a client to update the linked client details.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
                    <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
                      <span className="text-xs uppercase tracking-wide text-slate-500">
                        Client Name
                      </span>
                      <p className="mt-1 font-medium text-slate-700">
                        {getCustomerPrimaryName(selectedCustomer) || "-"}
                      </p>
                    </div>
                    <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
                      <span className="text-xs uppercase tracking-wide text-slate-500">
                        Company Name
                      </span>
                      <p className="mt-1 font-medium text-slate-700">
                        {getCustomerSecondaryCompany(selectedCustomer) || "-"}
                      </p>
                    </div>
                    <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
                      <span className="text-xs uppercase tracking-wide text-slate-500">
                        GST Number
                      </span>
                      <p className="mt-1 font-medium text-slate-700">
                        {selectedCustomer.gstNumber || "-"}
                      </p>
                    </div>
                    <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
                      <span className="text-xs uppercase tracking-wide text-slate-500">
                        Contact Person
                      </span>
                      <p className="mt-1 font-medium text-slate-700">
                        {selectedCustomer.contactPerson || "-"}
                      </p>
                    </div>
                    <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
                      <span className="text-xs uppercase tracking-wide text-slate-500">
                        Email
                      </span>
                      <p className="mt-1 font-medium text-slate-700">
                        {selectedCustomer.email || "-"}
                      </p>
                    </div>
                    <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
                      <span className="text-xs uppercase tracking-wide text-slate-500">
                        Phone
                      </span>
                      <p className="mt-1 font-medium text-slate-700">
                        {selectedCustomer.phone || "-"}
                      </p>
                    </div>
                    <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
                      <span className="text-xs uppercase tracking-wide text-slate-500">
                        Designation
                      </span>
                      <p className="mt-1 font-medium text-slate-700">
                        {selectedCustomer.designation || "-"}
                      </p>
                    </div>
                    <div className="lg:col-span-2 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
                      <span className="text-xs uppercase tracking-wide text-slate-500">
                        Address
                      </span>
                      <p className="mt-1 font-medium text-slate-700">
                        {selectedCustomer.address || "-"}
                      </p>
                    </div>
                  </div>
                )}
              </section>

              <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
                <div>
                  <label className="text-sm font-medium text-slate-700">
                    Start Date
                  </label>
                  <DateInput
                    value={form.startDate}
                    onChange={(value) => updateField("startDate", value || "")}
                    className="mt-1 w-full rounded-lg border border-slate-200 px-4 py-3 text-sm"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-slate-700">
                    End Date
                  </label>
                  <DateInput
                    value={form.endDate}
                    onChange={(value) => updateField("endDate", value || "")}
                    className="mt-1 w-full rounded-lg border border-slate-200 px-4 py-3 text-sm"
                  />
                  {errors.endDate && (
                    <p className="mt-1 text-sm text-red-600">
                      {errors.endDate}
                    </p>
                  )}
                </div>
              </div>

              <div>
                <label className="text-sm font-medium text-slate-700">
                  Notes
                </label>
                <textarea
                  value={form.notes}
                  onChange={(event) => updateField("notes", event.target.value)}
                  className="mt-1 min-h-[120px] w-full rounded-lg border border-slate-200 px-4 py-3 text-sm"
                />
              </div>
            </div>

            <div className="flex items-center justify-between border-t bg-slate-50 px-6 py-4">
              <p className="text-xs text-slate-500">
                Customer-linked projects keep downstream documents aligned.
              </p>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={closeEdit}
                  className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={saveEdit}
                  className="rounded-lg bg-indigo-600 px-5 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
                  disabled={isSaving}
                >
                  {isSaving ? "Saving..." : "Save Changes"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
          <div className="w-[440px] max-w-[90vw] rounded-xl border border-slate-200 bg-white p-6 shadow-2xl">
            <h3 className="text-lg font-semibold text-slate-900">
              Delete project?
            </h3>
            <p className="mt-2 text-sm text-slate-600">
              {deleteTarget.name || "This project"} will be removed. This cannot
              be undone.
            </p>
            <div className="mt-5 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-700"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDelete}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
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
