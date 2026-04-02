import { useEffect, useMemo, useState } from "react";
import { getProjects } from "../../services/projectsStore";
import { fetchLocations } from "../../services/locationsApi";
import DateInput from "../common/DateInput";
import { fetchVendors, syncVendorsCache } from "../../services/vendorsApi";
import { fetchConsumptions } from "../../services/consumptionApi";
import { fetchItems, updateQuantityApi } from "../../services/inventoryApi";
import {
  createReallocateInventory,
  deleteReallocateInventory,
  fetchReallocateInventory,
  updateReallocateInventory,
} from "../../services/reallocateInventoryApi";
import { formatDate } from "../../utils/dateFormat";
import useSettings from "../../hooks/useSettings";
import { printSection } from "../../utils/printUtils";
import { resolveBrandLogo } from "../../utils/branding";
import DocumentViewPanel from "./DocumentViewPanel";

const createFormState = () => ({
  referenceNumber: "",
  type: "Reallocate",
  consumptionId: "",
  projectId: "",
  fromLocationId: "",
  toLocationId: "",
  returnVendorId: "",
  requestDate: new Date().toISOString().slice(0, 10),
  requestedBy: "",
  status: "Pending",
  notes: "",
});

const toQuantity = (value) => {
  const normalized =
    typeof value === "string" ? value.replace(/,/g, ".").trim() : value;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
};

const fmtQty = (value) =>
  (Number(value) || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 });

const panel =
  "rounded-xl border border-slate-200 bg-[#f8f9ff] shadow-[0_8px_24px_-18px_rgba(15,23,42,0.35)]";
const field =
  "mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100";

const sortValue = (record = {}) => {
  const raw =
    record.updatedAt ??
    record.requestDate ??
    record.transferDate ??
    record.createdAt ??
    null;
  const time = raw ? new Date(raw).getTime() : 0;
  return Number.isFinite(time) ? time : 0;
};

const statusClass = (status) => {
  const normalized = String(status || "").toLowerCase();
  if (normalized === "completed") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (normalized === "in transit") return "border-blue-200 bg-blue-50 text-blue-700";
  return "border-slate-200 bg-slate-100 text-slate-700";
};

const getMovementTypeLabel = (type) =>
  type === "Reallocate" ? "DC (Delivery Challan)" : type || "-";

const ReallocateReturn = () => {
  const settings = useSettings();
  const company = settings?.company || {};
  const logoUrl = resolveBrandLogo(company.logo || settings?.profile?.avatar || "");
  const brandName = company.name || "Bangalore Electronics";
  const brandDescription = company.address || "Company address";

  const [projects, setProjects] = useState([]);
  const [locations, setLocations] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [consumptions, setConsumptions] = useState([]);
  const [inventoryItems, setInventoryItems] = useState([]);
  const [records, setRecords] = useState([]);
  const [form, setForm] = useState(createFormState);
  const [items, setItems] = useState([]);
  const [errors, setErrors] = useState({});
  const [editingId, setEditingId] = useState(null);
  const [saveError, setSaveError] = useState("");
  const [saving, setSaving] = useState(false);
  const [consumptionQuery, setConsumptionQuery] = useState("");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [viewRecord, setViewRecord] = useState(null);

  const loadRecords = async () => {
    try {
      const list = await fetchReallocateInventory();
      setRecords(Array.isArray(list) ? list : []);
    } catch (error) {
      setRecords([]);
      setSaveError(
        error?.response?.data?.error ||
          error?.message ||
          "Failed to load delivery challans."
      );
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

  const loadVendors = async () => {
    try {
      const data = await fetchVendors();
      setVendors(Array.isArray(data) ? data : []);
      syncVendorsCache(Array.isArray(data) ? data : []);
    } catch {
      setVendors([]);
    }
  };

  const loadConsumptions = async () => {
    try {
      const list = await fetchConsumptions();
      setConsumptions(Array.isArray(list) ? list : []);
    } catch {
      setConsumptions([]);
    }
  };

  const loadInventory = async () => {
    try {
      const list = await fetchItems();
      setInventoryItems(Array.isArray(list) ? list : []);
    } catch {
      setInventoryItems([]);
    }
  };

  useEffect(() => {
    setProjects(getProjects());
    void loadLocations();
    void loadVendors();
    void loadConsumptions();
    void loadInventory();
    void loadRecords();
  }, []);

  useEffect(() => {
    const handler = () => {
      void loadRecords();
    };
    window.addEventListener("reallocate-inventory:changed", handler);
    window.addEventListener("consumptions:changed", handler);
    return () => {
      window.removeEventListener("reallocate-inventory:changed", handler);
      window.removeEventListener("consumptions:changed", handler);
    };
  }, []);

  useEffect(() => {
    if (!viewRecord?.id) return;
    const updated = records.find((record) => String(record.id) === String(viewRecord.id));
    if (updated && updated !== viewRecord) {
      setViewRecord(updated);
    }
  }, [records, viewRecord?.id]);

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

  const vendorMap = useMemo(() => {
    return vendors.reduce((acc, vendor) => {
      acc[String(vendor.id)] = vendor;
      return acc;
    }, {});
  }, [vendors]);

  const consumptionMap = useMemo(() => {
    return consumptions.reduce((acc, record) => {
      acc[String(record.id)] = record;
      return acc;
    }, {});
  }, [consumptions]);

  const filteredConsumptions = useMemo(() => {
    const query = consumptionQuery.trim().toLowerCase();
    if (!query) return consumptions;
    return consumptions.filter((entry) => {
      const ref = entry.consumptionNumber || `CON-${entry.id}`;
      const dateText = formatDate(
        entry.consumptionDate || entry.date || entry.createdAt || entry.updatedAt
      );
      const safeDate = dateText === "-" ? "" : dateText;
      const itemsText = (entry.items || [])
        .map((item) => item.name || item.item || "")
        .filter(Boolean)
        .join(" ");
      const haystack = [ref, safeDate, itemsText]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(query);
    });
  }, [consumptions, consumptionQuery]);

  const inventoryByName = useMemo(() => {
    return inventoryItems.reduce((acc, item) => {
      const key = String(item.name ?? "").trim().toLowerCase();
      if (!key || acc[key]) {
        return acc;
      }
      acc[key] = item;
      return acc;
    }, {});
  }, [inventoryItems]);

  const sortedRecords = useMemo(
    () => [...records].sort((a, b) => sortValue(b) - sortValue(a)),
    [records]
  );

  const totalQty = useMemo(
    () =>
      sortedRecords.reduce(
        (sum, record) =>
          sum +
          (record.items || []).reduce((itemSum, item) => itemSum + toQuantity(item.quantity), 0),
        0
      ),
    [sortedRecords]
  );

  const visibleRecords = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return sortedRecords.filter((record) => {
      if (
        statusFilter !== "all" &&
        String(record.status || "").toLowerCase() !== statusFilter
      ) {
        return false;
      }
      if (!needle) return true;
      const destination =
        record.type === "Return"
          ? vendorMap[String(record.returnVendorId)]?.name
          : locationMap[String(record.toLocationId)]?.name;
      const itemsText = (record.items || [])
        .map((item) => item.name || item.item || "")
        .filter(Boolean)
        .join(" ");
      const dateText = formatDate(
        record.requestDate || record.transferDate || record.createdAt
      );
      const safeDate = dateText === "-" ? "" : dateText;
      const haystack = [
        record.referenceNumber,
        record.consumptionNumber,
        record.type,
        projectMap[String(record.projectId)]?.name,
        locationMap[String(record.fromLocationId)]?.name,
        destination,
        record.status,
        record.requestedBy,
        record.notes,
        itemsText,
        safeDate,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(needle);
    });
  }, [query, statusFilter, sortedRecords, projectMap, locationMap, vendorMap]);

  const returnedQtyByConsumptionMaterial = useMemo(() => {
    return records.reduce((acc, record) => {
      if (record.type !== "Return") {
        return acc;
      }
      if (editingId && record.id === editingId) {
        return acc;
      }
      const consumptionId = String(record.consumptionId || "");
      if (!consumptionId) {
        return acc;
      }
      (record.items || []).forEach((item) => {
        const material = String(item.name || "").trim().toLowerCase();
        if (!material) {
          return;
        }
        const key = `${consumptionId}::${material}`;
        acc[key] = (acc[key] || 0) + toQuantity(item.quantity);
      });
      return acc;
    }, {});
  }, [records, editingId]);

  const buildItemsFromConsumption = (consumptionId, existingItems = []) => {
    const source = consumptionMap[String(consumptionId)];
    if (!source) {
      return [];
    }

    const existingByMaterial = (existingItems || []).reduce((acc, item) => {
      const key = String(item.name || "").trim().toLowerCase();
      if (key) {
        acc[key] = toQuantity(item.quantity);
      }
      return acc;
    }, {});

    return (source.items || []).map((item, index) => {
      const name = String(item.name || "").trim();
      const key = name.toLowerCase();
      const consumedQty = toQuantity(item.quantity);
      const alreadyReturned =
        returnedQtyByConsumptionMaterial[`${String(consumptionId)}::${key}`] || 0;
      const availableQty = Math.max(consumedQty - alreadyReturned, 0);
      const presetQty =
        existingByMaterial[key] !== undefined
          ? Math.min(existingByMaterial[key], availableQty)
          : availableQty;

      return {
        id: item.id ?? `${consumptionId}-${index}`,
        name,
        unit: item.unit || "PCS",
        consumedQty,
        availableQty,
        quantity: presetQty,
      };
    });
  };

  const applyConsumptionSelection = (consumptionId, options = {}) => {
    const source = consumptionMap[String(consumptionId)] || null;
    if (!source) {
      setItems([]);
      setForm((prev) => ({
        ...prev,
        consumptionId: consumptionId ? String(consumptionId) : "",
      }));
      return;
    }

    const existingItems = options.existingItems || [];
    setItems(buildItemsFromConsumption(source.id, existingItems));
    setForm((prev) => ({
      ...prev,
      consumptionId: String(source.id),
      projectId: String(source.projectId || ""),
      fromLocationId: String(source.locationId || ""),
    }));
  };

  const resetForm = () => {
    setForm(createFormState());
    setItems([]);
    setErrors({});
    setSaveError("");
    setEditingId(null);
  };

  const validate = () => {
    const nextErrors = {};
    if (!form.referenceNumber.trim()) {
      nextErrors.referenceNumber = "Reference number is required.";
    }
    if (!form.consumptionId) {
      nextErrors.consumptionId = "Select a consumption record.";
    }
    if (!form.projectId) {
      nextErrors.projectId = "Select a project.";
    }
    if (!form.fromLocationId) {
      nextErrors.fromLocationId = "Select a source location.";
    }
    if (form.type === "Reallocate" && !form.toLocationId) {
      nextErrors.toLocationId = "Select a destination location.";
    }
    if (form.type === "Return" && vendors.length > 0 && !form.returnVendorId) {
      nextErrors.returnVendorId = "Select a vendor.";
    }

    const hasValidItem = items.some(
      (item) => String(item.name || "").trim() && toQuantity(item.quantity) > 0
    );
    if (!hasValidItem) {
      nextErrors.items = "Select at least one consumed material quantity.";
    }

    const hasOverQty = items.some(
      (item) => toQuantity(item.quantity) > toQuantity(item.availableQty)
    );
    if (hasOverQty) {
      nextErrors.items = "Request quantity cannot exceed available consumed quantity.";
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
        id: item.id,
        name: String(item.name || "").trim(),
        unit: item.unit || "PCS",
        consumedQty: toQuantity(item.consumedQty),
        availableQty: toQuantity(item.availableQty),
        quantity: toQuantity(item.quantity),
      }))
      .filter((item) => item.name && item.quantity > 0);

    const source = consumptionMap[String(form.consumptionId)] || null;
    const payload = {
      referenceNumber: form.referenceNumber.trim(),
      type: form.type,
      consumptionId: form.consumptionId ? Number(form.consumptionId) : null,
      consumptionNumber: source?.consumptionNumber || "",
      projectId: form.projectId ? Number(form.projectId) : null,
      fromLocationId: form.fromLocationId ? Number(form.fromLocationId) : null,
      toLocationId: form.toLocationId ? Number(form.toLocationId) : null,
      returnVendorId: form.returnVendorId ? Number(form.returnVendorId) : null,
      requestDate: form.requestDate,
      requestedBy: form.requestedBy.trim(),
      status: form.status,
      notes: form.notes,
      items: cleanedItems,
    };

    try {
      setSaving(true);
      setSaveError("");

      if (editingId) {
        await updateReallocateInventory(editingId, payload);
      } else {
        await createReallocateInventory(payload);
      }

      if (form.type === "Return" && !editingId) {
        const missingMaterials = [];
        for (const line of cleanedItems) {
          const key = line.name.toLowerCase();
          const inv = inventoryByName[key];
          if (!inv?.id) {
            missingMaterials.push(line.name);
            continue;
          }
          await updateQuantityApi(inv.id, toQuantity(inv.stock) + line.quantity);
        }
        await loadInventory();

        if (missingMaterials.length > 0) {
          setSaveError(
            `Saved request, but stock was not updated for: ${missingMaterials.join(", ")}`
          );
        }
      }

      await loadRecords();
      resetForm();
    } catch (error) {
      setSaveError(
        error?.response?.data?.error ||
          error?.message ||
          "Failed to save delivery challan."
      );
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (record) => {
    setEditingId(record.id);
    setForm({
      referenceNumber: record.referenceNumber || "",
      type: record.type || "Reallocate",
      consumptionId: record.consumptionId ? String(record.consumptionId) : "",
      projectId: record.projectId ? String(record.projectId) : "",
      fromLocationId: record.fromLocationId ? String(record.fromLocationId) : "",
      toLocationId: record.toLocationId ? String(record.toLocationId) : "",
      returnVendorId: record.returnVendorId ? String(record.returnVendorId) : "",
      requestDate: record.requestDate || new Date().toISOString().slice(0, 10),
      requestedBy: record.requestedBy || "",
      status: record.status || "Pending",
      notes: record.notes || "",
    });
    setItems(
      buildItemsFromConsumption(record.consumptionId, record.items || [])
    );
    setErrors({});
    setSaveError("");
  };

  const handleDelete = async (id) => {
    try {
      setSaveError("");
      await deleteReallocateInventory(id);
      await loadRecords();
      if (editingId === id) {
        resetForm();
      }
    } catch (error) {
      setSaveError(
        error?.response?.data?.error ||
          error?.message ||
          "Failed to delete delivery challan."
      );
    }
  };

  const handleQuantityChange = (id, value) => {
    setItems((prev) =>
      (prev || []).map((item) => {
        if (item.id !== id) {
          return item;
        }
        const nextQty =
          value === ""
            ? ""
            : Math.min(Math.max(toQuantity(value), 0), toQuantity(item.availableQty));
        return { ...item, quantity: nextQty };
      })
    );
  };

  const printRegister = () => {
    printSection({
      selector: "#reallocation-register",
      title: "DC Register",
      subtitle: "Inventory movement ledger",
      metaRows: [
        { label: "Total Entries", value: sortedRecords.length },
        { label: "Qty Moved", value: fmtQty(totalQty) },
      ],
      logoUrl,
      brandName,
      brandDescription,
    });
  };

  const printRecord = (record) => {
    setViewRecord(record);
    setTimeout(() => {
      printSection({
        selector: "#reallocation-view-panel",
        title: "Delivery Challan Details",
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
          <p className="text-xs uppercase tracking-[0.3em] text-slate-400">Projects</p>
          <h1 className="text-3xl font-semibold text-slate-800">
            Delivery Challan
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Create delivery challans using consumed materials and track stock movement.
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
          <p className="text-sm text-slate-500">Total Requests</p>
          <p className="text-2xl font-semibold text-slate-800">{records.length}</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-sm text-slate-500">Pending</p>
          <p className="text-2xl font-semibold text-slate-800">
            {records.filter((record) => record.status === "Pending").length}
          </p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-sm text-slate-500">Vendor Returns</p>
          <p className="text-2xl font-semibold text-slate-800">
            {records.filter((record) => record.type === "Return").length}
          </p>
        </div>
      </div>

      {saveError && (
        <div className="mb-4 rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {saveError}
        </div>
      )}

      <form onSubmit={handleSubmit} className="mb-6 space-y-4">
        <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold text-slate-800">
            Delivery Challan Details
          </h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div>
              <label className="text-sm font-medium text-slate-700">Reference *</label>
              <input
                type="text"
                value={form.referenceNumber}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, referenceNumber: event.target.value }))
                }
                placeholder="DC-2026-002"
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"
              />
              {errors.referenceNumber && (
                <p className="mt-1 text-xs text-red-600">{errors.referenceNumber}</p>
              )}
            </div>

            <div>
              <label className="text-sm font-medium text-slate-700">Type</label>
              <select
                value={form.type}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, type: event.target.value }))
                }
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"
              >
                <option value="Reallocate">DC (Delivery Challan)</option>
                <option value="Return">Return</option>
              </select>
            </div>

            <div>
              <label className="text-sm font-medium text-slate-700">Consumption Ref *</label>
              <input
                type="search"
                value={consumptionQuery}
                onChange={(event) => setConsumptionQuery(event.target.value)}
                placeholder="Search by ref, item, or date"
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              />
              <select
                value={form.consumptionId}
                onChange={(event) => applyConsumptionSelection(event.target.value)}
                className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2"
              >
                <option value="">Select consumption</option>
                {filteredConsumptions.map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {entry.consumptionNumber || `CON-${entry.id}`} | {formatDate(entry.consumptionDate)}
                  </option>
                ))}
              </select>
              {errors.consumptionId && (
                <p className="mt-1 text-xs text-red-600">{errors.consumptionId}</p>
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
              {errors.projectId && <p className="mt-1 text-xs text-red-600">{errors.projectId}</p>}
            </div>

            <div>
              <label className="text-sm font-medium text-slate-700">From Location *</label>
              <select
                value={form.fromLocationId}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, fromLocationId: event.target.value }))
                }
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"
              >
                <option value="">Select location</option>
                {locations.map((location) => (
                  <option key={location.id} value={location.id}>
                    {location.name}
                  </option>
                ))}
              </select>
              {errors.fromLocationId && (
                <p className="mt-1 text-xs text-red-600">{errors.fromLocationId}</p>
              )}
            </div>

            {form.type === "Reallocate" ? (
              <div>
                <label className="text-sm font-medium text-slate-700">To Location *</label>
                <select
                  value={form.toLocationId}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, toLocationId: event.target.value }))
                  }
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"
                >
                  <option value="">Select destination</option>
                  {locations.map((location) => (
                    <option key={location.id} value={location.id}>
                      {location.name}
                    </option>
                  ))}
                </select>
                {errors.toLocationId && (
                  <p className="mt-1 text-xs text-red-600">{errors.toLocationId}</p>
                )}
              </div>
            ) : (
              <div>
                <label className="text-sm font-medium text-slate-700">Return Vendor</label>
                <select
                  value={form.returnVendorId}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, returnVendorId: event.target.value }))
                  }
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"
                >
                  <option value="">Select vendor</option>
                  {vendors.map((vendor) => (
                    <option key={vendor.id} value={vendor.id}>
                      {vendor.name}
                    </option>
                  ))}
                </select>
                {errors.returnVendorId && (
                  <p className="mt-1 text-xs text-red-600">{errors.returnVendorId}</p>
                )}
              </div>
            )}

            <div>
              <label className="text-sm font-medium text-slate-700">Request Date</label>
              <DateInput
                value={form.requestDate}
                onChange={(value) => setForm((prev) => ({ ...prev, requestDate: value }))}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"
              />
            </div>

            <div>
              <label className="text-sm font-medium text-slate-700">Requested By</label>
              <input
                type="text"
                value={form.requestedBy}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, requestedBy: event.target.value }))
                }
                placeholder="Store Manager"
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
                <option value="Pending">Pending</option>
                <option value="In Transit">In Transit</option>
                <option value="Completed">Completed</option>
              </select>
            </div>

            <div className="md:col-span-3">
              <label className="text-sm font-medium text-slate-700">Notes</label>
              <textarea
                value={form.notes}
                onChange={(event) => setForm((prev) => ({ ...prev, notes: event.target.value }))}
                placeholder="Reason for movement or return."
                className="mt-1 min-h-[90px] w-full rounded-lg border border-slate-200 px-3 py-2"
              />
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <h3 className="mb-4 text-base font-semibold text-slate-800">
            Materials From Consumption
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-100 text-slate-600">
                <tr>
                  <th className="min-w-[200px] p-3 text-left">Material</th>
                  <th className="min-w-[120px] p-3 text-left">Consumed Qty</th>
                  <th className="min-w-[120px] p-3 text-left">Available Qty</th>
                  <th className="min-w-[160px] p-3 text-left">Request Qty</th>
                </tr>
              </thead>
              <tbody>
                {items.length === 0 && (
                  <tr>
                    <td colSpan="4" className="p-4 text-center text-slate-500">
                      Select a consumption record to load materials.
                    </td>
                  </tr>
                )}
                {items.map((item) => (
                  <tr key={item.id} className="border-t">
                    <td className="p-3 font-medium text-slate-800">{item.name || "-"}</td>
                    <td className="p-3">{toQuantity(item.consumedQty)}</td>
                    <td className="p-3">{toQuantity(item.availableQty)}</td>
                    <td className="p-3">
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        max={toQuantity(item.availableQty)}
                        value={item.quantity}
                        onChange={(event) =>
                          handleQuantityChange(item.id, event.target.value)
                        }
                        className="w-full rounded-md border border-slate-200 px-3 py-2"
                      />
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
            disabled={saving}
            className="rounded-lg bg-indigo-600 px-5 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {saving
              ? "Saving..."
              : editingId
              ? "Update Delivery Challan"
              : "Save Delivery Challan"}
          </button>
        </div>
      </form>

      <section id="reallocation-register" className={panel}>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
          <h2 className="text-3xl font-semibold text-slate-800">
            DC Register
          </h2>
          <button
            type="button"
            onClick={printRegister}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:border-slate-400"
          >
            Post register
          </button>
        </div>
        <div className="grid gap-2 border-b border-slate-200 px-4 py-3 md:grid-cols-[1fr_210px]">
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search reference, item, date, project..."
            className={field}
          />
          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
            className={field}
          >
            <option value="all">All Status</option>
            <option value="pending">Pending</option>
            <option value="in transit">In Transit</option>
            <option value="completed">Completed</option>
          </select>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-[#eceff8] text-slate-700">
              <tr>
                <th className="px-4 py-3 text-left font-semibold min-w-[140px]">Reference</th>
                <th className="px-4 py-3 text-left font-semibold min-w-[120px]">Type</th>
                <th className="px-4 py-3 text-left font-semibold min-w-[160px]">Consumption Ref</th>
                <th className="px-4 py-3 text-left font-semibold min-w-[180px]">Project</th>
                <th className="px-4 py-3 text-left font-semibold min-w-[160px]">From</th>
                <th className="px-4 py-3 text-left font-semibold min-w-[160px]">To / Vendor</th>
                <th className="px-4 py-3 text-left font-semibold min-w-[120px]">Date</th>
                <th className="px-4 py-3 text-right font-semibold min-w-[120px]">Qty</th>
                <th className="px-4 py-3 text-left font-semibold min-w-[120px]">Status</th>
                <th className="px-4 py-3 text-left font-semibold min-w-[220px]">Actions</th>
              </tr>
            </thead>
            <tbody>
              {visibleRecords.length === 0 && (
                <tr>
                  <td colSpan="10" className="px-4 py-10 text-center text-slate-500">
                    {records.length
                      ? "No matching delivery challans found."
                      : "No delivery challans created yet."}
                  </td>
                </tr>
              )}
              {visibleRecords.map((record) => {
                const destination =
                  record.type === "Return"
                    ? vendorMap[String(record.returnVendorId)]?.name || "-"
                    : locationMap[String(record.toLocationId)]?.name || "-";
                const totalLineQty = (record.items || []).reduce(
                  (sum, item) => sum + toQuantity(item.quantity),
                  0
                );
                return (
                  <tr key={record.id} className="border-b border-slate-200 bg-white">
                    <td className="px-4 py-3 text-slate-800">
                      {record.referenceNumber || `REL-${record.id}`}
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      {getMovementTypeLabel(record.type)}
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      {record.consumptionNumber || "-"}
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      {projectMap[String(record.projectId)]?.name || "-"}
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      {locationMap[String(record.fromLocationId)]?.name || "-"}
                    </td>
                    <td className="px-4 py-3 text-slate-700">{destination}</td>
                    <td className="px-4 py-3 text-slate-700">
                      {formatDate(record.requestDate || record.transferDate)}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-slate-800">
                      {fmtQty(totalLineQty)}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${statusClass(
                          record.status
                        )}`}
                      >
                        {record.status || "Pending"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-3 text-sm">
                        <button
                          type="button"
                          onClick={() => setViewRecord(record)}
                          className="text-blue-700 underline"
                        >
                          View
                        </button>
                        <button
                          type="button"
                          onClick={() => printRecord(record)}
                          className="text-slate-700 underline"
                        >
                          Print
                        </button>
                        <button
                          type="button"
                          onClick={() => handleEdit(record)}
                          className="text-blue-700 underline"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(record.id)}
                          className="text-red-600 underline"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {viewRecord && (
        <DocumentViewPanel
          id="reallocation-view-panel"
          title="DELIVERY CHALLAN DETAILS"
          onClose={() => setViewRecord(null)}
          companyName={brandName}
          companyAddress={brandDescription}
          companyGstin={company.gstin}
          companyPhone={company.phone}
          companyEmail={company.email}
          logoUrl={logoUrl}
          primaryPairs={[
            { label: "Reference", value: viewRecord.referenceNumber || `REL-${viewRecord.id}` },
            { label: "Type", value: getMovementTypeLabel(viewRecord.type) },
            {
              label: "Request Date",
              value: formatDate(viewRecord.requestDate || viewRecord.transferDate),
            },
            { label: "Status", value: viewRecord.status || "Pending" },
            { label: "Consumption Ref", value: viewRecord.consumptionNumber || "-" },
            { label: "Requested By", value: viewRecord.requestedBy || "-" },
          ]}
          leftBlockTitle="Project / From"
          leftBlockLines={[
            projectMap[String(viewRecord.projectId)]?.name || "-",
            locationMap[String(viewRecord.fromLocationId)]?.name || "-",
          ]}
          rightBlockTitle={viewRecord.type === "Return" ? "Return Vendor" : "To Location"}
          rightBlockLines={[
            viewRecord.type === "Return"
              ? vendorMap[String(viewRecord.returnVendorId)]?.name || "-"
              : locationMap[String(viewRecord.toLocationId)]?.name || "-",
          ]}
          tableColumns={[
            { key: "serial", label: "Sl No", widthClass: "w-16" },
            { key: "name", label: "Material" },
            { key: "unit", label: "Unit", widthClass: "w-20" },
            { key: "quantity", label: "Qty", align: "right", widthClass: "w-24" },
          ]}
          tableRows={(viewRecord.items || []).map((item, index) => ({
            id: item.id ?? index,
            serial: index + 1,
            name: item.name || item.item || "-",
            unit: item.unit || "PCS",
            quantity: fmtQty(item.quantity),
          }))}
          bottomLeftTitle="Notes"
          bottomLeftValue={viewRecord.notes || "-"}
          bottomRightTitle="Total Quantity"
          bottomRightValue={fmtQty(
            (viewRecord.items || []).reduce((sum, item) => sum + toQuantity(item.quantity), 0)
          )}
          footerCompanyName={brandName || "Company"}
        />
      )}
    </div>
  );
};

export default ReallocateReturn;
