import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getProjects } from "../../services/projectsStore";
import { fetchLocations } from "../../services/locationsApi";
import {
  createConsumption,
  deleteConsumption,
  fetchConsumptions,
  updateConsumption,
} from "../../services/consumptionApi";
import DateInput from "../common/DateInput";
import useSettings from "../../hooks/useSettings";
import { formatDate } from "../../utils/dateFormat";
import { printSection } from "../../utils/printUtils";
import { resolveBrandLogo } from "../../utils/branding";
import DocumentViewPanel from "./DocumentViewPanel";

const createLineItem = () => ({
  id: Date.now() + Math.random(),
  name: "",
  quantity: "",
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

const toQuantity = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const Consumption = () => {
  const navigate = useNavigate();
  const settings = useSettings();
  const company = settings?.company || {};
  const logoUrl = resolveBrandLogo(
    company.logo || settings?.profile?.avatar || ""
  );
  const brandName = company.name || "Bangalore Electronics";
  const brandDescription = company.address || "Company address";

  const [projects, setProjects] = useState([]);
  const [locations, setLocations] = useState([]);
  const [records, setRecords] = useState([]);
  const [form, setForm] = useState(createFormState);
  const [items, setItems] = useState([createLineItem()]);
  const [errors, setErrors] = useState({});
  const [editingId, setEditingId] = useState(null);
  const [locationsLoading, setLocationsLoading] = useState(false);
  const [locationsError, setLocationsError] = useState("");
  const [recordsError, setRecordsError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [viewRecord, setViewRecord] = useState(null);

  const loadRecords = async () => {
    try {
      setRecordsError("");
      const list = await fetchConsumptions();
      setRecords(Array.isArray(list) ? list : []);
    } catch (error) {
      setRecords([]);
      setRecordsError(
        error?.response?.data?.error ||
          error?.message ||
          "Failed to load consumption entries."
      );
    }
  };

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
    void loadRecords();
  }, []);

  useEffect(() => {
    const handler = () => {
      void loadRecords();
    };
    window.addEventListener("consumptions:changed", handler);
    return () => {
      window.removeEventListener("consumptions:changed", handler);
    };
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

  const totalQuantity = useMemo(() => {
    return records.reduce((sum, record) => {
      const recordQty = (record.items || []).reduce(
        (lineSum, item) => lineSum + toQuantity(item.quantity),
        0
      );
      return sum + recordQty;
    }, 0);
  }, [records]);

  const pendingReviewCount = useMemo(
    () => records.filter((record) => record.status === "Logged").length,
    [records]
  );

  const consumptionMetaRows = useMemo(
    () => [
      { label: "Total Entries", value: records.length },
      { label: "Total Quantity", value: totalQuantity },
      { label: "Pending Review", value: pendingReviewCount },
    ],
    [records.length, totalQuantity, pendingReviewCount]
  );

  const resetForm = () => {
    setForm(createFormState());
    setItems([createLineItem()]);
    setErrors({});
    setEditingId(null);
  };

  const handleAddLineItem = () => {
    setItems((prev) => [...(prev || []), createLineItem()]);
  };

  const handleRemoveLineItem = (id) => {
    setItems((prev) => {
      const next = (prev || []).filter((item) => item.id !== id);
      return next.length ? next : [createLineItem()];
    });
  };

  const handleLineItemChange = (id, field, value) => {
    setItems((prev) =>
      (prev || []).map((item) => {
        if (item.id !== id) {
          return item;
        }
        if (field === "quantity") {
          return {
            ...item,
            quantity: value === "" ? "" : Math.max(toQuantity(value), 0),
          };
        }
        return { ...item, [field]: value };
      })
    );
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
      (item) => String(item.name ?? "").trim() && toQuantity(item.quantity) > 0
    );
    if (!hasValidItem) {
      nextErrors.items = "Add at least one consumed material.";
    }

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!validate()) {
      return;
    }

    const cleanedItems = items
      .map((item) => ({
        name: String(item.name ?? "").trim(),
        quantity: toQuantity(item.quantity),
      }))
      .filter((item) => item.name && item.quantity > 0)
      .map((item) => ({
        name: item.name,
        description: null,
        unit: "PCS",
        quantity: item.quantity,
        rate: 0,
        notes: null,
      }));

    const payload = {
      ...form,
      projectId: Number(form.projectId),
      locationId: Number(form.locationId),
      items: cleanedItems,
    };

    try {
      setSubmitting(true);
      setRecordsError("");
      if (editingId) {
        await updateConsumption(editingId, payload);
      } else {
        await createConsumption(payload);
      }
      await loadRecords();
      resetForm();
    } catch (error) {
      setRecordsError(
        error?.response?.data?.error ||
          error?.message ||
          "Failed to save consumption entry."
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleEdit = (record) => {
    setEditingId(record.id);
    setForm({
      consumptionNumber: record.consumptionNumber || "",
      projectId: record.projectId ? String(record.projectId) : "",
      locationId: record.locationId ? String(record.locationId) : "",
      consumptionDate:
        record.consumptionDate || new Date().toISOString().slice(0, 10),
      issuedBy: record.issuedBy || "",
      status: record.status || "Logged",
      notes: record.notes || "",
    });

    const mappedItems = (record.items || []).map((item) => ({
      id: item.id ?? Date.now() + Math.random(),
      name: item.name ?? "",
      quantity: toQuantity(item.quantity),
    }));

    setItems(mappedItems.length ? mappedItems : [createLineItem()]);
    setErrors({});
  };

  const handleDelete = async (id) => {
    try {
      setRecordsError("");
      await deleteConsumption(id);
      await loadRecords();
      if (viewRecord?.id === id) {
        setViewRecord(null);
      }
      if (editingId === id) {
        resetForm();
      }
    } catch (error) {
      setRecordsError(
        error?.response?.data?.error ||
          error?.message ||
          "Failed to delete consumption entry."
      );
    }
  };

  const handlePrintConsumption = (record) => {
    setViewRecord(record);
    setTimeout(() => {
      printSection({
        selector: "#consumption-view-panel",
        title: "Consumption Details",
        logoUrl,
        brandName,
        brandDescription,
      });
    }, 80);
  };

  return (
    <div className="p-6">
      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-slate-400">
            Projects
          </p>
          <h1 className="text-3xl font-semibold text-slate-800">Consumption</h1>
          <p className="mt-1 text-sm text-slate-500">
            Record material usage by location.
          </p>
        </div>
        <button
          type="button"
          onClick={resetForm}
          className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700"
        >
          Clear Form
        </button>
      </div>

      <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-sm text-slate-500">Total Entries</p>
          <p className="text-2xl font-semibold text-slate-800">{records.length}</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-sm text-slate-500">Qty Consumed</p>
          <p className="text-2xl font-semibold text-slate-800">{totalQuantity}</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-sm text-slate-500">Pending Review</p>
          <p className="text-2xl font-semibold text-slate-800">{pendingReviewCount}</p>
        </div>
      </div>

      {recordsError && (
        <div className="mb-6 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {recordsError}
        </div>
      )}

      <form onSubmit={handleSubmit} className="mb-6 space-y-4">
        <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold text-slate-800">Consumption Details</h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div>
              <label className="text-sm font-medium text-slate-700">Consumption Ref *</label>
              <input
                type="text"
                value={form.consumptionNumber}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, consumptionNumber: event.target.value }))
                }
                placeholder="CON-2026-005"
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"
              />
              {errors.consumptionNumber && (
                <p className="mt-1 text-xs text-red-600">{errors.consumptionNumber}</p>
              )}
            </div>

            <div>
              <label className="text-sm font-medium text-slate-700">Project *</label>
              <select
                value={form.projectId}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, projectId: event.target.value }))
                }
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"
              >
                <option value="">Select project</option>
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </select>
              {errors.projectId && (
                <p className="mt-1 text-xs text-red-600">{errors.projectId}</p>
              )}
            </div>

            <div>
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-slate-700">Location *</label>
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
                    Manage
                  </button>
                </div>
              </div>
              <select
                value={form.locationId}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, locationId: event.target.value }))
                }
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"
              >
                <option value="">
                  {locationsLoading
                    ? "Loading locations..."
                    : locations.length
                    ? "Select location"
                    : "No locations found"}
                </option>
                {locations.map((location) => (
                  <option key={location.id} value={location.id}>
                    {location.name}
                  </option>
                ))}
              </select>
              {locationsError && <p className="mt-1 text-xs text-red-600">{locationsError}</p>}
              {errors.locationId && (
                <p className="mt-1 text-xs text-red-600">{errors.locationId}</p>
              )}
            </div>

            <div>
              <label className="text-sm font-medium text-slate-700">Consumption Date</label>
              <DateInput
                value={form.consumptionDate}
                onChange={(value) =>
                  setForm((prev) => ({
                    ...prev,
                    consumptionDate: value,
                  }))
                }
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"
              />
            </div>

            <div>
              <label className="text-sm font-medium text-slate-700">Issued By</label>
              <input
                type="text"
                value={form.issuedBy}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, issuedBy: event.target.value }))
                }
                placeholder="Store Keeper"
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"
              />
            </div>

            <div>
              <label className="text-sm font-medium text-slate-700">Status</label>
              <select
                value={form.status}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, status: event.target.value }))
                }
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"
              >
                <option value="Logged">Logged</option>
                <option value="Reviewed">Reviewed</option>
              </select>
            </div>

            <div className="md:col-span-3">
              <label className="text-sm font-medium text-slate-700">Notes</label>
              <textarea
                value={form.notes}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, notes: event.target.value }))
                }
                placeholder="Usage notes or approvals."
                className="mt-1 min-h-[90px] w-full rounded-lg border border-slate-200 px-3 py-2"
              />
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-base font-semibold text-slate-800">Materials Consumed</h3>
            <button
              type="button"
              onClick={handleAddLineItem}
              className="rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700"
            >
              + Add Item
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-100 text-slate-600">
                <tr>
                  <th className="min-w-[220px] p-3 text-left">Material</th>
                  <th className="min-w-[160px] p-3 text-left">Qty Consumed</th>
                  <th className="min-w-[90px] p-3 text-left">Action</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id} className="border-t">
                    <td className="p-3">
                      <input
                        type="text"
                        value={item.name}
                        onChange={(event) =>
                          handleLineItemChange(item.id, "name", event.target.value)
                        }
                        placeholder="Material"
                        className="w-full rounded-md border border-slate-200 px-3 py-2"
                      />
                    </td>
                    <td className="p-3">
                      <input
                        type="number"
                        min="0"
                        value={item.quantity}
                        onChange={(event) =>
                          handleLineItemChange(item.id, "quantity", event.target.value)
                        }
                        placeholder="Qty Consumed"
                        className="w-full rounded-md border border-slate-200 px-3 py-2"
                      />
                    </td>
                    <td className="p-3">
                      <button
                        type="button"
                        onClick={() => handleRemoveLineItem(item.id)}
                        className="text-xs font-semibold text-red-600"
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {errors.items && <p className="text-xs text-red-600">{errors.items}</p>}

        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={resetForm}
            className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="rounded-lg bg-indigo-600 px-5 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {submitting
              ? editingId
                ? "Updating..."
                : "Saving..."
              : editingId
              ? "Update Entry"
              : "Save Entry"}
          </button>
        </div>
      </form>

      <div
        id="consumption-register"
        className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm"
      >
        <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
          <h3 className="text-lg font-semibold text-slate-800">Consumption Register</h3>
          <button
            type="button"
            onClick={() =>
              printSection({
                selector: "#consumption-register",
                title: "Consumption Register",
                subtitle: "Material consumption ledger",
                metaRows: consumptionMetaRows,
              })
            }
            className="print-hidden rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-600"
          >
            Print register
          </button>
        </div>

        <table className="w-full text-sm">
          <thead className="bg-slate-100 text-slate-600">
            <tr>
              <th className="min-w-[150px] p-3 text-left">Ref</th>
              <th className="min-w-[180px] p-3 text-left">Project</th>
              <th className="min-w-[180px] p-3 text-left">Location</th>
              <th className="min-w-[140px] p-3 text-left">Date</th>
              <th className="min-w-[140px] p-3 text-left">Qty Consumed</th>
              <th className="min-w-[140px] p-3 text-left">Status</th>
              <th className="print-hidden min-w-[120px] p-3 text-left">Actions</th>
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
            {records.map((record) => {
              const recordQty = (record.items || []).reduce(
                (sum, item) => sum + toQuantity(item.quantity),
                0
              );
              return (
                <tr key={record.id} className="border-t hover:bg-slate-50">
                  <td className="p-3 font-medium text-slate-800">{record.consumptionNumber}</td>
                  <td className="p-3">{projectMap[String(record.projectId)]?.name || "-"}</td>
                  <td className="p-3">{locationMap[String(record.locationId)]?.name || "-"}</td>
                  <td className="p-3">{formatDate(record.consumptionDate)}</td>
                  <td className="p-3 font-medium text-slate-800">{recordQty}</td>
                  <td className="p-3">{record.status || "-"}</td>
                  <td className="print-hidden p-3 flex gap-3">
                    <button
                      type="button"
                      onClick={() => setViewRecord(record)}
                      className="text-sm text-slate-700 underline"
                    >
                      View
                    </button>
                    <button
                      type="button"
                      onClick={() => handlePrintConsumption(record)}
                      className="text-sm text-slate-600"
                    >
                      Print
                    </button>
                    <button
                      type="button"
                      onClick={() => handleEdit(record)}
                      className="text-sm text-indigo-600"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(record.id)}
                      className="text-sm text-red-600"
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

      {viewRecord && (
        <DocumentViewPanel
          id="consumption-view-panel"
          title="CONSUMPTION DETAILS"
          onClose={() => setViewRecord(null)}
          companyName={brandName}
          companyAddress={brandDescription}
          companyGstin={company.gstin}
          companyPhone={company.phone}
          companyEmail={company.email}
          logoUrl={logoUrl}
          primaryPairs={[
            { label: "Reference", value: viewRecord.consumptionNumber },
            {
              label: "Date",
              value: formatDate(viewRecord.consumptionDate || viewRecord.createdAt),
            },
            { label: "Status", value: viewRecord.status },
            { label: "Issued By", value: viewRecord.issuedBy },
          ]}
          leftBlockTitle="Project"
          leftBlockLines={[projectMap[String(viewRecord.projectId)]?.name || "-"]}
          rightBlockTitle="Location"
          rightBlockLines={[
            locationMap[String(viewRecord.locationId)]?.name || "-",
            viewRecord.notes || "-",
          ]}
          tableColumns={[
            { key: "serial", label: "Sl No", widthClass: "w-16" },
            { key: "name", label: "Material" },
            { key: "quantity", label: "Qty Consumed", align: "right", widthClass: "w-24" },
          ]}
          tableRows={(viewRecord.items || []).map((item, index) => ({
            id: item.id || index,
            serial: index + 1,
            name: item.name,
            quantity: toQuantity(item.quantity),
          }))}
          bottomLeftTitle="Total Items"
          bottomLeftValue={(viewRecord.items || []).length}
          bottomRightTitle="Total Quantity"
          bottomRightValue={(viewRecord.items || []).reduce(
            (sum, item) => sum + toQuantity(item.quantity),
            0
          )}
          footerCompanyName={brandName || "Company"}
        />
      )}
    </div>
  );
};

export default Consumption;
