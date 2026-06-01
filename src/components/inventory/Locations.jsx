import { useEffect, useMemo, useState } from "react";
import { getProjects } from "../../services/projectsStore";
import {
  createLocation,
  deleteLocation,
  fetchLocations,
  updateLocation,
} from "../../services/locationsApi";
import useSettings from "../../hooks/useSettings";
import { printSection } from "../../utils/printUtils";
import { resolveBrandLogo } from "../../utils/branding";
import DocumentViewPanel from "./DocumentViewPanel";

const createFormState = () => ({
  name: "",
  code: "",
  type: "Site",
  projectId: "",
  manager: "",
  phone: "",
  address: "",
  status: "Active",
});

const Locations = () => {
  const [projects, setProjects] = useState([]);
  const [records, setRecords] = useState([]);
  const [form, setForm] = useState(createFormState);
  const [errors, setErrors] = useState({});
  const [editingId, setEditingId] = useState(null);
  const [viewRecord, setViewRecord] = useState(null);
  const [loading, setLoading] = useState(false);
  const [apiError, setApiError] = useState("");
  const settings = useSettings();
  const company = settings?.company || {};
  const brandName = company.name || "Bangalore Electronics";
  const brandDescription = company.address || "Company address";
  const logoUrl = resolveBrandLogo(company.logo || "");

  const loadRecords = async () => {
    try {
      setLoading(true);
      setApiError("");
      const list = await fetchLocations();
      setRecords(list);
    } catch (error) {
      setRecords([]);
      setApiError(
        error?.response?.data?.error ||
          error?.message ||
          "Failed to load locations."
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setProjects(getProjects());
    void loadRecords();
  }, []);

  const projectMap = useMemo(() => {
    return projects.reduce((acc, project) => {
      acc[String(project.id)] = project;
      return acc;
    }, {});
  }, [projects]);

  const resetForm = () => {
    setForm(createFormState());
    setErrors({});
    setEditingId(null);
  };

  const validate = () => {
    const nextErrors = {};
    if (!form.name.trim()) {
      nextErrors.name = "Location name is required.";
    }
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!validate()) {
      return;
    }

    const payload = {
      ...form,
    };

    try {
      setApiError("");
      if (editingId) {
        await updateLocation(editingId, payload);
      } else {
        await createLocation(payload);
      }
      await loadRecords();
      resetForm();
    } catch (error) {
      setApiError(
        error?.response?.data?.error ||
          error?.message ||
          "Failed to save location."
      );
    }
  };

  const handleEdit = (record) => {
    setEditingId(record.id);
    setForm({
      name: record.name || "",
      code: record.code || "",
      type: record.type || "Site",
      projectId: record.projectId || "",
      manager: record.manager || "",
      phone: record.phone || "",
      address: record.address || "",
      status: record.status || "Active",
    });
    setErrors({});
  };

  const handleView = (record) => {
    setViewRecord(record);
  };

  const handlePrint = (record) => {
    setViewRecord(record);
    setTimeout(() => {
      printSection({
        selector: "#locations-view-panel",
        title: "Location Details",
        logoUrl,
        brandName,
        brandDescription,
      });
    }, 80);
  };

  const handleDelete = async (id) => {
    try {
      setApiError("");
      await deleteLocation(id);
      await loadRecords();
    } catch (error) {
      setApiError(
        error?.response?.data?.error ||
          error?.message ||
          "Failed to delete location."
      );
    }
  };

  return (
    <div className="p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between mb-6">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-slate-400">
            Projects
          </p>
          <h1 className="text-3xl font-semibold text-slate-800">
            Location Management
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Manage warehouses, yards, and project sites.
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

      <form onSubmit={handleSubmit} className="space-y-4 mb-6">
        <div className="bg-white p-5 rounded-lg shadow-sm border border-slate-200">
          <h2 className="text-lg font-semibold text-slate-800 mb-4">
            Location Details
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="text-sm font-medium text-slate-700">
                Location Name *
              </label>
              <input
                type="text"
                value={form.name}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, name: event.target.value }))
                }
                placeholder="Main Warehouse"
                className="w-full mt-1 border border-slate-200 rounded-lg px-3 py-2"
              />
              {errors.name && (
                <p className="text-xs text-red-600 mt-1">{errors.name}</p>
              )}
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700">
                Code
              </label>
              <input
                type="text"
                value={form.code}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, code: event.target.value }))
                }
                placeholder="LOC-01"
                className="w-full mt-1 border border-slate-200 rounded-lg px-3 py-2"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700">
                Type
              </label>
              <select
                value={form.type}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, type: event.target.value }))
                }
                className="w-full mt-1 border border-slate-200 rounded-lg px-3 py-2"
              >
                <option value="Warehouse">Warehouse</option>
                <option value="Site">Site</option>
                <option value="Yard">Yard</option>
                <option value="Office">Office</option>
              </select>
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700">
                Project
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
                <option value="">Not linked</option>
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700">
                Manager / Contact
              </label>
          
              <input
                type="text"
                value={form.manager}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, manager: event.target.value }))
                }
                placeholder="Contact person"
                className="w-full mt-1 border border-slate-200 rounded-lg px-3 py-2"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700">
                Phone
              </label>
              <input
                type="text"
                value={form.phone}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, phone: event.target.value }))
                }
                placeholder="+1 555 123 4567"
                className="w-full mt-1 border border-slate-200 rounded-lg px-3 py-2"
              />
            </div>
            <div className="md:col-span-2">
              <label className="text-sm font-medium text-slate-700">
                Address
              </label>
              <textarea
                value={form.address}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, address: event.target.value }))
                }
                placeholder="Street, city, state, ZIP"
                className="w-full mt-1 border border-slate-200 rounded-lg px-3 py-2 min-h-[90px]"
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
                <option value="Active">Active</option>
                <option value="Inactive">Inactive</option>
                <option value="Closed">Closed</option>
              </select>
            </div>
          </div>
        </div>

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
            {editingId ? "Update Location" : "Save Location"}
          </button>
        </div>
      </form>

      <div
        id="locations-register"
        className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-x-auto"
      >
        <div className="px-4 py-3 border-b flex items-center justify-between gap-3">
          <h3 className="text-lg font-semibold text-slate-800">
            Locations Register
          </h3>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={loadRecords}
              className="px-3 py-1.5 border border-slate-200 rounded-md text-xs text-slate-600 bg-white"
            >
              Refresh
            </button>
          </div>
        </div>
        {apiError && (
          <div className="px-4 py-3 text-sm text-red-700 bg-red-50 border-b border-red-100">
            {apiError}
          </div>
        )}
        <table className="w-full text-sm">
          <thead className="bg-slate-100 text-slate-600">
            <tr>
              <th className="p-3 text-left min-w-[180px]">Location</th>
              <th className="p-3 text-left min-w-[120px]">Code</th>
              <th className="p-3 text-left min-w-[140px]">Type</th>
              <th className="p-3 text-left min-w-[180px]">Project</th>
              <th className="p-3 text-left min-w-[160px]">Contact</th>
              <th className="p-3 text-left min-w-[120px]">Status</th>
              <th className="p-3 text-left min-w-[120px]">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan="7" className="p-6 text-center text-slate-500">
                  Loading locations...
                </td>
              </tr>
            )}
            {!loading && records.length === 0 && (
              <tr>
                <td colSpan="7" className="p-6 text-center text-slate-500">
                  No locations created yet.
                </td>
              </tr>
            )}
            {!loading && records.map((record) => (
              <tr key={record.id} className="border-t hover:bg-slate-50">
                <td className="p-3 font-medium text-slate-800">
                  {record.name}
                </td>
                <td className="p-3">{record.code || "-"}</td>
                <td className="p-3">{record.type || "-"}</td>
                <td className="p-3">
                  {projectMap[String(record.projectId)]?.name || "-"}
                </td>
                <td className="p-3">{record.manager || "-"}</td>
                <td className="p-3">{record.status || "-"}</td>
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
          id="locations-view-panel"
          title="LOCATION DETAILS"
          onClose={() => setViewRecord(null)}
          companyName={brandName}
          companyAddress={brandDescription}
          companyGstin={company.gstin}
          companyPhone={company.phone}
          companyEmail={company.email}
          logoUrl={logoUrl}
          primaryPairs={[
            { label: "Location", value: viewRecord.name },
            { label: "Code", value: viewRecord.code },
            { label: "Status", value: viewRecord.status },
            { label: "Type", value: viewRecord.type },
          ]}
          leftBlockTitle="Project"
          leftBlockLines={[projectMap[String(viewRecord.projectId)]?.name || "-"]}
          rightBlockTitle="Contact"
          rightBlockLines={[viewRecord.manager || "-", viewRecord.phone || "-"]}
          tableColumns={[
            { key: "field", label: "Field" },
            { key: "value", label: "Value" },
          ]}
          tableRows={[
            { id: "name", field: "Location Name", value: viewRecord.name },
            { id: "code", field: "Code", value: viewRecord.code },
            { id: "type", field: "Type", value: viewRecord.type },
            {
              id: "project",
              field: "Project",
              value: projectMap[String(viewRecord.projectId)]?.name || "-",
            },
            { id: "manager", field: "Manager", value: viewRecord.manager },
            { id: "phone", field: "Phone", value: viewRecord.phone },
            { id: "address", field: "Address", value: viewRecord.address },
            { id: "status", field: "Status", value: viewRecord.status },
          ]}
          footerCompanyName={brandName || "Company"}
        />
      )}
    </div>
  );
};

export default Locations;
