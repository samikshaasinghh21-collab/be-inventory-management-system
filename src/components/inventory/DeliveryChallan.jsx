import { useEffect, useMemo, useState } from "react";
import useSettings from "../../hooks/useSettings";
import { getProjects } from "../../services/projectsStore";
import { fetchLocations } from "../../services/locationsApi";
import { fetchBoqs } from "../../services/boqApi";
import {
  createDeliveryChallan,
  deleteDeliveryChallan,
  fetchDeliveryChallans,
  updateDeliveryChallan,
} from "../../services/deliveryChallanApi";
import LineItemsEditor from "./LineItemsEditor";
import DateInput from "../common/DateInput";
import { formatDate } from "../../utils/dateFormat";
import { printSection } from "../../utils/printUtils";
import { defaultBrandLogoUrl, resolveBrandLogo } from "../../utils/branding";
import {
  getActiveProjectId,
  setActiveProjectId,
} from "../../services/projectSelectionStore";

const createLineItem = () => ({
  id: Date.now() + Math.random(),
  name: "",
  description: "",
  unit: "PCS",
  hsn: "",
  gst: "",
  quantity: "",
  rate: "",
  notes: "",
});

const createFormState = () => ({
  dcNumber: "",
  projectId: "",
  fromLocationId: "",
  toLocation: "",
  vehicleNumber: "",
  eWayBillNumber: "",
  issueDate: new Date().toISOString().slice(0, 10),
  status: "Draft",
  notes: "",
});

const DeliveryChallan = () => {
  const [projects] = useState(() => getProjects());
  const [locations, setLocations] = useState([]);
  const [records, setRecords] = useState([]);
  const [form, setForm] = useState(createFormState);
  const [items, setItems] = useState([createLineItem()]);
  const [errors, setErrors] = useState({});
  const [boqs, setBoqs] = useState([]);
  const [boqsLoading, setBoqsLoading] = useState(false);
  const [boqError, setBoqError] = useState("");
  const [selectedBoqId, setSelectedBoqId] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [selectedChallan, setSelectedChallan] = useState(null);
  const settings = useSettings();
  const company = settings?.company || {};
  const companyLogo = resolveBrandLogo(company.logo || settings?.profile?.avatar || "");
  const companyName = company.name || "Bangalore Electronics";

  const loadRecords = async () => {
    try {
      const list = await fetchDeliveryChallans();
      setRecords(Array.isArray(list) ? list : []);
    } catch (error) {
      console.error("Failed to load delivery challans:", error);
      setRecords([]);
    }
  };
  const loadLocations = async () => {
    try {
      const list = await fetchLocations();
      setLocations(Array.isArray(list) ? list : []);
    } catch {
      setLocations([]);
    }
  };
  const loadBoqs = async () => {
    try {
      setBoqsLoading(true);
      const list = await fetchBoqs();
      setBoqs(Array.isArray(list) ? list : []);
      setBoqError("");
    } catch (error) {
      setBoqs([]);
      setBoqError(
        error?.response?.data?.error ||
          error?.message ||
          "Could not load BOQs."
      );
    } finally {
      setBoqsLoading(false);
    }
  };

  useEffect(() => {
    void loadRecords();
    void loadLocations();
    void loadBoqs();
  }, []);

  useEffect(() => {
    if (editingId || form.projectId || !projects.length) {
      return;
    }
    const activeProjectId = getActiveProjectId();
    if (!activeProjectId) {
      return;
    }
    const exists = projects.some(
      (project) => String(project.id) === String(activeProjectId)
    );
    if (!exists) {
      return;
    }
    setForm((prev) => ({ ...prev, projectId: String(activeProjectId) }));
  }, [editingId, form.projectId, projects]);

  useEffect(() => {
    if (form.projectId) {
      setActiveProjectId(form.projectId);
    }
  }, [form.projectId]);

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
  const boqsForProject = useMemo(() => {
    if (!form.projectId) {
      return [];
    }
    return boqs.filter(
      (boq) => String(boq.projectId) === String(form.projectId)
    );
  }, [boqs, form.projectId]);

  const resetForm = () => {
    setForm(createFormState());
    setItems([createLineItem()]);
    setErrors({});
    setBoqError("");
    setSelectedBoqId("");
    setEditingId(null);
  };

  const validate = () => {
    const nextErrors = {};
    if (!form.dcNumber.trim()) {
      nextErrors.dcNumber = "DC number is required.";
    }
    if (!form.projectId) {
      nextErrors.projectId = "Select a project.";
    }
    if (!form.fromLocationId) {
      nextErrors.fromLocationId = "Select slip source location.";
    }
    if (!form.toLocation.trim()) {
      nextErrors.toLocation = "Enter destination location/site.";
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

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!validate()) {
      return;
    }

    const cleanedItems = items
      .map((item) => ({
        ...item,
        name: String(item.name ?? "").trim(),
        hsn: String(item.hsn ?? "").trim(),
        gst: String(item.gst ?? "").trim(),
      }))
      .filter((item) => item.name && Number(item.quantity) > 0);

    const payload = {
      ...form,
      items: cleanedItems,
    };

    try {
      if (editingId) {
        await updateDeliveryChallan(editingId, payload);
      } else {
        await createDeliveryChallan(payload);
      }
      await loadRecords();
      resetForm();
    } catch (error) {
      console.error("Failed to save delivery challan:", error);
    }
  };

  const handleEdit = (record) => {
    setEditingId(record.id);
    setForm({
      dcNumber: record.dcNumber || "",
      projectId: record.projectId || "",
      fromLocationId: record.fromLocationId || "",
      toLocation: record.toLocation || "",
      vehicleNumber: record.vehicleNumber || "",
      eWayBillNumber: record.eWayBillNumber || "",
      issueDate: record.issueDate || new Date().toISOString().slice(0, 10),
      status: record.status || "Draft",
      notes: record.notes || "",
    });
    setItems(record.items?.length ? record.items : [createLineItem()]);
    setErrors({});
  };

  const handleDelete = async (id) => {
    try {
      await deleteDeliveryChallan(id);
      await loadRecords();
    } catch (error) {
      console.error("Failed to delete delivery challan:", error);
    }
  };

  const handlePickFromBoq = () => {
    if (!form.projectId) {
      setBoqError("Select a project first.");
      return;
    }

    if (!selectedBoqId) {
      setBoqError("Select a BOQ to pick materials.");
      return;
    }

    const boq = boqs.find(
      (entry) => String(entry.id) === String(selectedBoqId)
    );

    if (!boq) {
      setBoqError("No BOQ found for this project.");
      return;
    }

    const mapped = (boq.items || []).map((item, index) => ({
      id: item.id ?? `${Date.now()}-${index}`,
      name: item.name || "",
      description: item.description || "",
      unit: item.unit || "PCS",
      hsn: item.hsn || "",
      gst: item.gst || "",
      quantity: item.quantity ?? "",
      rate: item.rate ?? 0,
      notes: item.notes || "",
    }));

    if (!mapped.length) {
      setBoqError("The selected BOQ has no line items.");
      return;
    }

    setItems(mapped);
    setSelectedBoqId(String(boq.id));
    setBoqError("");
  };

  const challanMetaRows = useMemo(() => {
    const issuedCount = records.filter((record) => record.status === "Issued").length;
    const deliveredCount = records.filter((record) => record.status === "Delivered").length;
    const draftCount = records.filter((record) => record.status === "Draft").length;
    return [
      { label: "Total Challans", value: records.length },
      { label: "Issued", value: issuedCount },
      { label: "Delivered", value: deliveredCount },
      { label: "Draft", value: draftCount },
    ];
  }, [records]);

  const handlePrint = (record) => {
    if (!record) return;
    setSelectedChallan(record);
    setTimeout(() => {
      window.print();
    }, 0);
  };

  const handleViewChallan = (record) => {
    if (!record) return;
    setSelectedChallan(record);
  };

  const selectedProject = selectedChallan
    ? projectMap[String(selectedChallan.projectId)] || {}
    : {};
  const selectedFromLocation = selectedChallan
    ? locationMap[String(selectedChallan.fromLocationId)] || {}
    : {};
  const totalQty = selectedChallan?.items?.reduce(
    (sum, item) => sum + (Number(item.quantity) || 0),
    0
  );

  return (
    <div className="p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between mb-6">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-slate-400">
            Projects
          </p>
          <h1 className="text-3xl font-semibold text-slate-800">
            Delivery Challan
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Create and track material dispatch to project locations.
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
          <p className="text-sm text-slate-500">Total Challans</p>
          <p className="text-2xl font-semibold text-slate-800">
            {records.length}
          </p>
        </div>
        <div className="bg-white p-4 rounded-lg shadow-sm border border-slate-200">
          <p className="text-sm text-slate-500">Issued Challans</p>
          <p className="text-2xl font-semibold text-slate-800">
            {records.filter((record) => record.status === "Issued").length}
          </p>
        </div>
        <div className="bg-white p-4 rounded-lg shadow-sm border border-slate-200">
          <p className="text-sm text-slate-500">Draft Challans</p>
          <p className="text-2xl font-semibold text-slate-800">
            {records.filter((record) => record.status === "Draft").length}
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4 mb-6">
        <div className="bg-white p-5 rounded-lg shadow-sm border border-slate-200">
          <h2 className="text-lg font-semibold text-slate-800 mb-4">
            Challan Details
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="text-sm font-medium text-slate-700">
                DC Number *
              </label>
              <input
                type="text"
                value={form.dcNumber}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, dcNumber: event.target.value }))
                }
                placeholder="DC-2026-001"
                className="w-full mt-1 border border-slate-200 rounded-lg px-3 py-2"
              />
              {errors.dcNumber && (
                <p className="text-xs text-red-600 mt-1">{errors.dcNumber}</p>
              )}
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700">
                Project *
              </label>
              <select
                value={form.projectId}
                onChange={(event) => {
                  const nextProjectId = event.target.value;
                  setForm((prev) => ({ ...prev, projectId: nextProjectId }));
                  setSelectedBoqId("");
                  setBoqError("");
                }}
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
                <p className="text-xs text-red-600 mt-1">{errors.projectId}</p>
              )}
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700">
                 Ship From *
              </label>
              <select
                value={form.fromLocationId}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    fromLocationId: event.target.value,
                  }))
                }
                className="w-full mt-1 border border-slate-200 rounded-lg px-3 py-2"
              >
                <option value="">Select location</option>
                {locations.map((location) => (
                  <option key={location.id} value={location.id}>
                    {location.name}
                  </option>
                ))}
              </select>
              {errors.fromLocationId && (
                <p className="text-xs text-red-600 mt-1">{errors.fromLocationId}</p>
              )}
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700">
                Ship To *
              </label>
              <input
                type="text"
                value={form.toLocation}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, toLocation: event.target.value }))
                }
                placeholder="Project site / destination"
                className="w-full mt-1 border border-slate-200 rounded-lg px-3 py-2"
              />
              {errors.toLocation && (
                <p className="text-xs text-red-600 mt-1">{errors.toLocation}</p>
              )}
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700">
                Vehicle Number
              </label>
              <input
                type="text"
                value={form.vehicleNumber}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    vehicleNumber: event.target.value,
                  }))
                }
                placeholder="MH-12-AB-1234"
                className="w-full mt-1 border border-slate-200 rounded-lg px-3 py-2"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700">
                E-Way Bill Number (EBN)
              </label>
              <input
                type="text"
                value={form.eWayBillNumber}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    eWayBillNumber: event.target.value,
                  }))
                }
                placeholder="Enter EBN (optional)"
                className="w-full mt-1 border border-slate-200 rounded-lg px-3 py-2"
              />
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
                <option value="Issued">Issued</option>
                <option value="Delivered">Delivered</option>
                <option value="Closed">Closed</option>
              </select>
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700">
                BOQ (optional)
              </label>
              <select
                value={selectedBoqId}
                onChange={(event) => {
                  setSelectedBoqId(event.target.value);
                  setBoqError("");
                }}
                disabled={!form.projectId || boqsLoading}
                className="w-full mt-1 border border-slate-200 rounded-lg px-3 py-2 disabled:bg-slate-100"
              >
                <option value="">
                  {!form.projectId
                    ? "Select project first"
                    : boqsLoading
                    ? "Loading BOQs..."
                    : boqsForProject.length
                    ? "Select BOQ for material pick"
                    : "No BOQs for project"}
                </option>
                {boqsForProject.map((boq) => (
                  <option key={boq.id} value={boq.id}>
                    {boq.boqNumber} | v{boq.version} | {boq.status || "Draft"}
                  </option>
                ))}
              </select>
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
                placeholder="Transport details, remarks, or approvals."
                className="w-full mt-1 border border-slate-200 rounded-lg px-3 py-2 min-h-[90px]"
              />
            </div>
          </div>
        </div>

        <LineItemsEditor
          items={items}
          onChange={setItems}
          onPickFromProducts={handlePickFromBoq}
          pickLabel="Pick from BOQ"
          showHsnGst
        />
        {boqError && <p className="text-xs text-red-600">{boqError}</p>}
        {errors.items && <p className="text-xs text-red-600">{errors.items}</p>}

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
            {editingId ? "Update Challan" : "Save Challan"}
          </button>
        </div>
      </form>

      <div
        id="delivery-challan-register"
        className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-x-auto"
      >
        <div className="px-4 py-3 border-b flex items-center justify-between gap-3">
          <h3 className="text-lg font-semibold text-slate-800">
            Delivery Challan Register
          </h3>
          <button
            type="button"
            onClick={() =>
              printSection({
                selector: "#delivery-challan-register",
                title: "Delivery Challan Register",
                subtitle: "Dispatch trail for the project",
                metaRows: challanMetaRows,
                logoUrl: companyLogo,
                brandName: companyName,
                brandDescription: company.address,
              })
            }
            className="px-3 py-1.5 border border-slate-200 rounded-md text-xs text-slate-600 bg-white"
          >
            Print register
          </button>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-slate-100 text-slate-600">
            <tr>
              <th className="p-3 text-left min-w-[150px]">DC No</th>
              <th className="p-3 text-left min-w-[180px]">Project</th>
              <th className="p-3 text-left min-w-[180px]"> (Pick From)</th>
              <th className="p-3 text-left min-w-[180px]">Ship To</th>
              <th className="p-3 text-left min-w-[120px]">Status</th>
              <th className="p-3 text-left min-w-[120px]">Items</th>
              <th className="p-3 text-left min-w-[120px]">Actions</th>
            </tr>
          </thead>
          <tbody>
            {records.length === 0 && (
              <tr>
                <td colSpan="7" className="p-6 text-center text-slate-500">
                  No delivery challans created yet.
                </td>
              </tr>
            )}
            {records.map((record) => (
              <tr key={record.id} className="border-t hover:bg-slate-50">
                <td className="p-3 font-medium text-slate-800">
                  {record.dcNumber || "-"}
                </td>
                <td className="p-3">
                  {projectMap[String(record.projectId)]?.name || "-"}
                </td>
                <td className="p-3">
                  {locationMap[String(record.fromLocationId)]?.name || "-"}
                </td>
                <td className="p-3">{record.toLocation || "-"}</td>
                <td className="p-3">{record.status || "-"}</td>
                <td className="p-3">{record.items?.length || 0}</td>
                <td className="p-3 flex gap-3">
                  <button
                    type="button"
                    onClick={() => handleViewChallan(record)}
                    className="text-slate-700 text-sm underline"
                  >
                    View
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
                    onClick={() => handlePrint(record)}
                    className="text-slate-600 text-sm"
                  >
                    Print
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

      <div id="delivery-challan-print-area">
        {selectedChallan && (
          <div className="border border-slate-800 text-xs text-slate-900">
          <div className="border-b border-slate-800 p-2">
            <div className="flex items-center justify-between text-[11px] font-semibold tracking-wide">
              <span>DELIVERY CHALLAN</span>
              <button
                type="button"
                onClick={() => setSelectedChallan(null)}
                className="print-hidden px-2 py-0.5 text-[10px] uppercase tracking-[0.3em] text-slate-600 border border-slate-300 rounded-full"
              >
                Close view
              </button>
            </div>
          </div>
            <div className="grid grid-cols-2 border-b border-slate-800">
              <div className="p-3 border-r border-slate-800">
                {companyLogo ? (
                  <div className="mb-2">
                    <img
                      src={companyLogo}
                      alt={`${companyName} logo`}
                      className="h-14 w-auto object-contain"
                      style={{ height: 56, width: "auto", maxWidth: 260, objectFit: "contain" }}
                      onError={(event) => {
                        event.currentTarget.onerror = null;
                        event.currentTarget.src = defaultBrandLogoUrl;
                      }}
                    />
                  </div>
                ) : (
                  <p className="font-semibold">{companyName}</p>
                )}
                <p className="text-[11px] whitespace-pre-line">
                  {company.address || "Company address"}
                </p>
                <p className="text-[11px] mt-1">
                  GST No: {company.gstin || "-"}
                </p>
                <p className="text-[11px]">Phone: {company.phone || "-"}</p>
                <p className="text-[11px]">Email: {company.email || "-"}</p>
              </div>
              <div className="p-3">
                <div className="grid grid-cols-2 gap-2 text-[11px]">
                  <p className="text-slate-600">Our Ref:</p>
                  <p className="font-semibold">{selectedChallan.dcNumber || "-"}</p>
                  <p className="text-slate-600">Date:</p>
                  <p className="font-semibold">{formatDate(selectedChallan.issueDate)}</p>
                  <p className="text-slate-600">E-Way Bill No:</p>
                  <p className="font-semibold">{selectedChallan.eWayBillNumber || "-"}</p>
                  <p className="text-slate-600">Project:</p>
                  <p className="font-semibold">{selectedProject.name || "-"}</p>
                  <p className="text-slate-600">Client:</p>
                  <p className="font-semibold">{selectedProject.client || "-"}</p>
                  <p className="text-slate-600">Deliver To:</p>
                  <p className="font-semibold">{selectedChallan.toLocation || "-"}</p>
                  <p className="text-slate-600"> ( Pick From):</p>
                  <p className="font-semibold">{selectedFromLocation.name || "-"}</p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 border-b border-slate-800 text-[11px]">
              <div className="p-3 border-r border-slate-800">
                <p className="font-semibold">Ship From</p>
                <p>{selectedFromLocation.name || "-"}</p>
                <p className="whitespace-pre-line mt-1">
                  {selectedFromLocation.address || "-"}
                </p>
                <p className="mt-1">
                  Contact: {selectedFromLocation.manager || "-"}{" "}
                  {selectedFromLocation.phone ? `(${selectedFromLocation.phone})` : ""}
                </p>
              </div>
              <div className="p-3">
                <p className="font-semibold">Ship To</p>
                <p>{selectedProject.name || "-"}</p>
                <p className="whitespace-pre-line mt-1">
                  {selectedChallan.toLocation || "-"}
                </p>
              </div>
            </div>

            <table className="w-full text-[11px] border-b border-slate-800">
              <thead>
                <tr className="border-b border-slate-800">
                  <th className="p-2 text-left w-10">Sl No</th>
                  <th className="p-2 text-left">Description</th>
                  <th className="p-2 text-left w-20">HSN</th>
                  <th className="p-2 text-left w-20">GST</th>
                  <th className="p-2 text-right w-20">Qty</th>
                  <th className="p-2 text-left w-20">Unit</th>
                </tr>
              </thead>
              <tbody>
                {(selectedChallan.items || []).map((item, index) => (
                  <tr key={item.id || index} className="border-b border-slate-200">
                    <td className="p-2">{index + 1}</td>
                    <td className="p-2">
                      <p className="font-semibold">{item.name || "-"}</p>
                      {item.description && (
                        <p className="text-[10px] text-slate-600">{item.description}</p>
                      )}
                      {item.notes && (
                        <p className="text-[10px] text-slate-500">{item.notes}</p>
                      )}
                    </td>
                    <td className="p-2">{item.hsn || "-"}</td>
                    <td className="p-2">{item.gst || "-"}</td>
                    <td className="p-2 text-right">{item.quantity || "-"}</td>
                    <td className="p-2">{item.unit || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="grid grid-cols-2 border-b border-slate-800 text-[11px]">
              <div className="p-3 border-r border-slate-800">
                <p className="font-semibold">Vehicle No</p>
                <p>{selectedChallan.vehicleNumber || "-"}</p>
              </div>
              <div className="p-3 text-right">
                <p className="font-semibold">Total Qty</p>
                <p>{Number.isFinite(totalQty) ? totalQty : "-"}</p>
              </div>
            </div>

            <div className="flex items-center justify-between p-3 text-[11px]">
              <p>Any changes in GST & taxes are acceptable to you.</p>
              <div className="text-right">
                <p className="font-semibold">For {companyName}</p>
                <div className="mt-8 border-t border-slate-700 pt-2">
                  Authorised Signatory
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default DeliveryChallan;
