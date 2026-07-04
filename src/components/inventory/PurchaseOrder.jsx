import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { fetchProjects } from "../../services/projectsApi";
import {
  fetchPurchaseOrders,
  createPurchaseOrder,
  updatePurchaseOrder,
} from "../../services/purchaseOrdersApi";
import { fetchVendors } from "../../services/vendorsApi";
import { fetchBoqs } from "../../services/boqApi";
import { fetchLocations } from "../../services/locationsApi";
import LineItemsEditor from "./LineItemsEditor";
import useSettings from "../../hooks/useSettings";
import DateInput from "../common/DateInput";
import {
  buildGstSummary,
  formatTaxPercentage,
  parseTaxPercentage,
} from "../../utils/taxUtils";
import { getGstTaxMode } from "../../utils/gstUtils";
import { generateNextPurchaseOrderNumber } from "../../utils/purchaseOrderNumber";
import {
  getPurchaseOrderLockMessage,
  isLockedPurchaseOrder,
} from "../../utils/purchaseOrderStatus";
import PasswordPromptModal from "../common/PasswordPromptModal";
import { getClosedPoAuthError } from "../../utils/closedPoAuth";
import {
  getActiveProjectId,
  setActiveProjectId,
} from "../../services/projectSelectionStore";
import { DEFAULT_PURCHASE_ORDER_TERMS } from "../../utils/purchaseOrderTerms";
import { formatInrCurrency, roundUnitPrice } from "../../utils/formatters";
import {
  formatProjectOptionLabel,
  getProjectLinkedLocations,
} from "../../utils/projectLocationDisplay";

const createLineItem = () => ({
  id: Date.now() + Math.random(),
  boqItemId: null,
  name: "",
  description: "",
  unit: "PCS",
  hsn: "",
  gst: "",
  serialNumber: "",
  serialRequired: false,
  taxPercentage: 0,
  quantity: "",
  rate: "",
  notes: "",
  location: "",
});

const getBoqLineQuantity = (item = {}) =>
  Number(
    item.quantity ??
      item.Quantity ??
      item.unitQty ??
      item.UnitQty ??
      item.unitQuantity ??
      item.UnitQuantity ??
      item.qty ??
      item.Qty ??
      0
  ) || 0;

const createRecommendationLineItem = (recommendation = {}) => ({
  id: Date.now() + Math.random(),
  itemId: recommendation.productId ?? null,
  boqItemId: recommendation.boqItemId ?? null,
  name: recommendation.productName ?? "",
  description: recommendation.message ?? "",
  unit: recommendation.unit ?? "PCS",
  hsn: recommendation.hsn ?? "",
  gst: recommendation.gst ?? "",
  serialNumber: "",
  serialRequired: false,
  taxPercentage: recommendation.taxPercentage ?? 0,
  quantity: recommendation.recommendedOrder ?? recommendation.shortage ?? 0,
  rate: roundUnitPrice(recommendation.unitPrice ?? 0),
  notes: recommendation.notes ?? "",
  location: recommendation.locationName ?? "",
});

const createFormState = () => ({
  poNumber: "",
  projectId: "",
  vendorId: "",
  shipToLocationId: "",
  status: "Draft",
  orderDate: new Date().toISOString().slice(0, 10),
  expectedDate: "",
  notes: "",
  termsAndConditions: DEFAULT_PURCHASE_ORDER_TERMS,
});

const isClosedBoq = (status = "") =>
  String(status ?? "").trim().toLowerCase() === "closed";

const formatAddressLine = (vendor) => {
  const {
    address = "",
    city = "",
    state = "",
    pincode = "",
  } = vendor ?? {};

  return [address, [city, state, pincode].filter(Boolean).join(", ")]
    .filter(Boolean)
    .join(", ");
};

const PurchaseOrder = () => {
  const navigate = useNavigate();
  const settings = useSettings();
  const location = useLocation();
  const [projects, setProjects] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [locations, setLocations] = useState([]);
  const [records, setRecords] = useState([]);
  const [form, setForm] = useState(createFormState);
  const [items, setItems] = useState([createLineItem()]);
  const [errors, setErrors] = useState({});
  const [editingId, setEditingId] = useState(null);
  const [editingStatus, setEditingStatus] = useState("");
  const [apiError, setApiError] = useState("");
  const [boqs, setBoqs] = useState([]);
  const [boqsLoading, setBoqsLoading] = useState(false);
  const [boqError, setBoqError] = useState("");
  const [selectedBoqId, setSelectedBoqId] = useState("");
  const [closedPoOverrideApproved, setClosedPoOverrideApproved] = useState(false);
  const [passwordPromptOpen, setPasswordPromptOpen] = useState(false);
  const [adminPassword, setAdminPassword] = useState("");
  const [adminPasswordError, setAdminPasswordError] = useState("");
  useEffect(() => {
    const record = location.state?.purchaseOrder;
    if (record && record.id !== editingId) {
      setEditingId(record.id);
      setEditingStatus(record.status || "Draft");
      setClosedPoOverrideApproved(Boolean(location.state?.closedPoAuthorized));
      setSelectedBoqId(record.boqId ? String(record.boqId) : "");
      setForm({
        poNumber: record.poNumber || "",
        projectId: record.projectId || "",
        vendorId: record.vendorId || "",
        shipToLocationId: record.shipToLocationId || record.locationId || "",
        status: record.status || "Draft",
        orderDate: record.orderDate || new Date().toISOString().slice(0, 10),
        expectedDate: record.expectedDate || "",
        notes: record.notes || "",
        termsAndConditions:
          record.termsAndConditions ?? DEFAULT_PURCHASE_ORDER_TERMS,
      });
      const mappedItems = (record.items ?? []).map((item) => ({
        id: item.id ?? Date.now() + Math.random(),
        itemId: item.itemId ?? item.ItemId ?? null,
        boqItemId: item.boqItemId ?? null,
        name: item.name ?? "",
        description: item.description ?? "",
        unit: item.unit ?? "PCS",
        hsn: item.hsn ?? "",
        gst: item.gst ?? "",
        serialNumber: item.serialNumber ?? "",
        serialRequired: item.serialRequired ?? false,
        taxPercentage: item.taxPercentage ?? 0,
        quantity: item.quantity ?? "",
          rate:
            item.unitPrice || item.unitPrice === 0 || item.rate || item.rate === 0
              ? roundUnitPrice(item.unitPrice ?? item.rate)
              : "",
        location: item.location ?? item.notes ?? "",
        notes: item.notes ?? item.location ?? "",
      }));
      setItems(mappedItems.length ? mappedItems : [createLineItem()]);
      setErrors({});
      setAdminPassword("");
      setAdminPasswordError("");
      // Clear navigation state so we don't re-apply on re-render
      window.history.replaceState({}, document.title);
    }
  }, [location.state, editingId]);

  useEffect(() => {
    const recommendation = location.state?.mrpRecommendation;
    if (
      !recommendation ||
      editingId ||
      location.state?.purchaseOrder
    ) {
      return;
    }

    setClosedPoOverrideApproved(false);
    setEditingStatus("");
    setSelectedBoqId("");
    setForm((prev) => ({
      ...createFormState(),
      poNumber: prev.poNumber,
      orderDate: prev.orderDate,
      projectId: recommendation.projectId
        ? String(recommendation.projectId)
        : "",
      vendorId: recommendation.vendorId ? String(recommendation.vendorId) : "",
      shipToLocationId: recommendation.locationId
        ? String(recommendation.locationId)
        : "",
      expectedDate: recommendation.deadline || "",
      notes: recommendation.message || recommendation.notes || "",
      termsAndConditions: DEFAULT_PURCHASE_ORDER_TERMS,
    }));
    setItems([createRecommendationLineItem(recommendation)]);
    setErrors({});
    setApiError("");
    setAdminPassword("");
    setAdminPasswordError("");
    window.history.replaceState({}, document.title);
  }, [location.state, editingId]);

  const formatCurrency = formatInrCurrency;

  const loadLocations = async () => {
    try {
      const list = await fetchLocations();
      setLocations(Array.isArray(list) ? list : []);
    } catch {
      setLocations([]);
    }
  };
  const loadProjects = async () => {
    try {
      const list = await fetchProjects();
      setProjects(Array.isArray(list) ? list : []);
    } catch {
      setProjects([]);
    }
  };
  const loadVendors = async () => {
    try {
      const list = await fetchVendors();
      setVendors(list);
    } catch {
      setVendors([]);
    }
  };
  const loadRecords = async () => {
    try {
      const list = await fetchPurchaseOrders();
      setRecords(list);
    } catch {
      setRecords([]);
    }
  };
  const loadBoqs = async () => {
    try {
      setBoqsLoading(true);
      const list = await fetchBoqs();
      setBoqs(list);
      setBoqError("");
    } catch (error) {
      setBoqs([]);
      setBoqError(
        error?.response?.data?.error ||
          error?.message ||
          "Could not load BOQs. Refresh to retry."
      );
    } finally {
      setBoqsLoading(false);
    }
  };

  useEffect(() => {
    void loadProjects();
    void loadRecords();
    void loadLocations();
    void loadVendors();
    void loadBoqs();
  }, []);

  useEffect(() => {
    const refreshLinkedData = () => {
      void loadProjects();
      void loadLocations();
      void loadRecords();
      void loadBoqs();
    };

    window.addEventListener("projects:changed", refreshLinkedData);
    window.addEventListener("locations:changed", refreshLinkedData);
    window.addEventListener("purchase-orders:changed", refreshLinkedData);
    window.addEventListener("boqs:changed", refreshLinkedData);
    return () => {
      window.removeEventListener("projects:changed", refreshLinkedData);
      window.removeEventListener("locations:changed", refreshLinkedData);
      window.removeEventListener("purchase-orders:changed", refreshLinkedData);
      window.removeEventListener("boqs:changed", refreshLinkedData);
    };
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

  useEffect(() => {
    if (editingId) {
      return;
    }
    setForm((prev) => {
      const nextPoNumber = generateNextPurchaseOrderNumber(
        records,
        prev.orderDate
      );
      if (prev.poNumber === nextPoNumber) {
        return prev;
      }
      return {
        ...prev,
        poNumber: nextPoNumber,
      };
    });
  }, [records, editingId, form.orderDate]);

  // When returning from Products (pick=po flow), pull selected items into the PO
  useEffect(() => {
    try {
      const raw =
        localStorage.getItem("po_selected_products") ||
        localStorage.getItem("inventoryCart");
      if (!raw) return;
      const selected = JSON.parse(raw);
      if (!Array.isArray(selected) || selected.length === 0) {
        localStorage.removeItem("po_selected_products");
        localStorage.removeItem("inventoryCart");
        return;
      }
      const mapped = selected
        .filter((product) => (product.quantity ?? product.qty ?? 0) > 0)
        .map((product) => ({
          id: Date.now() + Math.random(),
          itemId: product.itemId ?? product.ItemId ?? product.id ?? null,
          name: product.name || "",
          description: product.description || "",
          unit: product.unit || "PCS",
          hsn: product.hsn || "",
          gst: product.gst || "",
          serialNumber: product.serialNumber ?? "",
          serialRequired: product.serialRequired ?? false,
          taxPercentage: product.taxPercentage ?? parseTaxPercentage(product.gst),
          quantity: product.quantity ?? product.qty ?? 1,
          rate: roundUnitPrice(product.rate ?? product.salesPrice ?? product.price ?? 0),
          location: "",
        }));
      if (mapped.length > 0) {
        setItems(mapped);
      }
      localStorage.removeItem("po_selected_products");
      localStorage.removeItem("inventoryCart");
    } catch {
      // ignore bad data; user can re-pick
    }
  }, []);

  // Keep BOQ selection aligned with the chosen project
  useEffect(() => {
    if (!form.projectId) {
      setSelectedBoqId("");
      return;
    }
    if (selectedBoqId) {
      const match = boqs.find(
        (boq) =>
          String(boq.id) === String(selectedBoqId) &&
          String(boq.projectId) === String(form.projectId) &&
          !isClosedBoq(boq.status)
      );
      if (!match) {
        setSelectedBoqId("");
      }
    }
  }, [form.projectId, selectedBoqId, boqs]);

  const boqsForProject = useMemo(() => {
    if (!form.projectId) return [];
    return boqs.filter(
      (boq) =>
        String(boq.projectId) === String(form.projectId) &&
        !isClosedBoq(boq.status)
    );
  }, [boqs, form.projectId]);

  const vendorMap = useMemo(
    () =>
      vendors.reduce((acc, vendor) => {
        acc[String(vendor.id)] = vendor;
        return acc;
      }, {}),
    [vendors]
  );
  const selectedVendor = vendorMap[String(form.vendorId)] ?? null;
  const selectedProject =
    projects.find((project) => String(project.id) === String(form.projectId)) ?? null;
  const selectedProjectLocations = useMemo(
    () => getProjectLinkedLocations(form.projectId, locations),
    [form.projectId, locations]
  );
  const selectedTaxMode = getGstTaxMode({
    vendorState: selectedVendor?.state,
    vendorGstin: selectedVendor?.gstNumber,
    companyState: settings?.company?.state,
    companyGstin: settings?.company?.gstin,
  });
  const currentSummary = buildGstSummary(items, { taxMode: selectedTaxMode });
  const getRecordTaxMode = (record) => {
    const vendor = vendorMap[String(record?.vendorId)];
    return getGstTaxMode({
      vendorState: vendor?.state,
      vendorGstin: vendor?.gstNumber,
      companyState: settings?.company?.state,
      companyGstin: settings?.company?.gstin,
    });
  };

  const isEditingLocked = Boolean(editingId) && isLockedPurchaseOrder(editingStatus);
  const isEditingLockedWithoutOverride = isEditingLocked && !closedPoOverrideApproved;

  const resetForm = () => {
    setForm(createFormState());
    setItems([createLineItem()]);
    setSelectedBoqId("");
    setErrors({});
    setEditingId(null);
    setEditingStatus("");
    setClosedPoOverrideApproved(false);
    setPasswordPromptOpen(false);
    setAdminPassword("");
    setAdminPasswordError("");
  };

  const validate = () => {
    const nextErrors = {};
    if (!form.projectId) {
      nextErrors.projectId = "Select a project.";
    }
    if (!form.vendorId) {
      nextErrors.vendorId = "Select a vendor.";
    }
    const hasValidItem = items.some(
      (item) => item.name.trim() && Number(item.quantity) > 0
    );
    if (!hasValidItem) {
      nextErrors.items = "Add at least one line item.";
    } else {
      const seen = new Set();
      for (const item of items) {
        const name = String(item.name ?? "").trim();
        const qty = Number(item.quantity) || 0;
        if (!name || qty <= 0) {
          continue;
        }
        const itemId = Number.parseInt(item.itemId ?? item.ItemId ?? "", 10);
        const normalizedName = name.toLowerCase();
        const normalizedUnit = String(item.unit || "0").trim().toUpperCase() || "0";
        const identityKey = Number.isFinite(itemId) && itemId > 0
          ? `id:${itemId}`
          : `name:${normalizedName}::${normalizedUnit}`;
        if (seen.has(identityKey)) {
          nextErrors.items = `${name} is duplicated in line items.`;
          break;
        }
        seen.add(identityKey);
      }
    }
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (isEditingLockedWithoutOverride) {
      setApiError(getPurchaseOrderLockMessage(editingStatus));
      return;
    }
    if (!validate()) {
      return;
    }

    const cleanedItems = items.filter(
      (item) => item.name.trim() || Number(item.quantity) > 0
    );
    const payload = {
      poNumber: form.poNumber.trim(),
      projectId: form.projectId || null,
      vendorId: form.vendorId || null,
      locationId: form.shipToLocationId || null,
      shipToLocationId: form.shipToLocationId || null,
      boqId: selectedBoqId || null,
      status: form.status,
      orderDate: form.orderDate || null,
      expectedDate: form.expectedDate || null,
      notes: form.notes || "",
      termsAndConditions: form.termsAndConditions,
      allowLockedEdit: isEditingLocked && closedPoOverrideApproved,
      items: cleanedItems.map((item) => {
        const qty = Number(item.quantity) || 0;
        const unitPrice = roundUnitPrice(item.rate);
        const lineLocation = String(item.location ?? item.notes ?? "").trim();
        return {
          itemId: item.itemId ?? null,
          boqItemId: item.boqItemId ?? null,
          name: item.name?.trim() || "",
          description: item.description || "",
          unit: item.unit || "0",
          hsn: String(item.hsn ?? "").trim(),
          gst:
            String(item.gst ?? "").trim() ||
            formatTaxPercentage(item.taxPercentage ?? 0),
          serialNumber: String(item.serialNumber ?? "").trim(),
          serialRequired: item.serialRequired ?? false,
          taxPercentage: parseTaxPercentage(item.gst ?? item.taxPercentage ?? 0),
          location: lineLocation,
          notes: lineLocation,
          quantity: qty,
          unitPrice,
          totalPrice: qty * unitPrice,
        };
      }),
    };

    try {
      setApiError("");
      if (editingId) {
        await updatePurchaseOrder(editingId, payload);
      } else {
        await createPurchaseOrder(payload);
      }
      const fresh = await fetchPurchaseOrders();
      setRecords(fresh);
      resetForm();
    } catch (error) {
      setApiError(
        error?.response?.data?.error || error?.message || "Failed to save purchase order."
      );
    }
  };

  const applyBoqToItems = () => {
    const boq = boqs.find((b) => String(b.id) === String(selectedBoqId));
    if (!boq) {
      setBoqError("Select a BOQ to import.");
      return;
    }
    if (isClosedBoq(boq.status)) {
      setBoqError("Closed BOQs cannot be linked to a purchase order.");
      return;
    }
    const boqItems = Array.isArray(boq.items) ? boq.items : [];

    const mapped = boqItems.map((item) => {
      const qty = getBoqLineQuantity(item);
      const directRate = Number(item.rate ?? item.Rate);
      const rate =
        Number.isFinite(directRate) && directRate >= 0
          ? roundUnitPrice(directRate)
          : qty > 0
          ? roundUnitPrice((Number(item.amount ?? 0) || 0) / qty)
          : 0;

      return {
        id: item.id ?? Date.now() + Math.random(),
        itemId: item.itemId ?? null,
        boqItemId: item.id ?? item.boqItemId ?? null,
        name: item.name || "",
        description: item.description || "",
        unit: item.unit || "PCS",
        hsn: item.hsn || "",
        gst: item.gst || "",
        serialNumber: item.serialNumber ?? "",
        serialRequired: item.serialRequired ?? false,
        taxPercentage:
          item.taxPercentage ?? parseTaxPercentage(item.gst ?? item.GST ?? 0),
        quantity: qty,
        rate,
        location: item.location || item.notes || "",
        notes: item.notes || item.location || "",
      };
    });

    if (!mapped.length) {
      setBoqError("The selected BOQ has no line items to import.");
      return;
    }

    setItems(mapped);
    setBoqError("");
  };

  const goPickProducts = () => {
    navigate("/inventory/products?pick=po");
  };

  const handleClosedPoUnlock = () => {
    const nextError = getClosedPoAuthError(settings, adminPassword);
    if (nextError) {
      setAdminPasswordError(nextError);
      return;
    }
    setClosedPoOverrideApproved(true);
    setPasswordPromptOpen(false);
    setAdminPassword("");
    setAdminPasswordError("");
    setApiError("");
  };

  return (
    <div className="po-page p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between mb-6">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-slate-400">
            Inventory Management
          </p>
          <h1 className="text-3xl font-semibold text-slate-800">
            Purchase Orders
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Issue procurement orders tied to project needs.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={loadVendors}
            className="px-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-700 bg-white"
          >
            Refresh Vendors
          </button>
          <button
            type="button"
            onClick={() => navigate("/inventory/purchase-order-register")}
            className="px-4 py-2 rounded-lg text-sm font-medium text-white bg-slate-900 hover:bg-slate-800"
          >
            Open Register
          </button>
          <button
            type="button"
            onClick={resetForm}
            className="px-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-700 bg-white"
          >
            Clear Form
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-white p-4 rounded-lg shadow-sm border border-slate-200">
          <p className="text-sm text-slate-500">Total POs</p>
          <p className="text-2xl font-semibold text-slate-800">
            {records.length}
          </p>
        </div>
        <div className="bg-white p-4 rounded-lg shadow-sm border border-slate-200">
          <p className="text-sm text-slate-500">Total Value</p>
          <p className="text-2xl font-semibold text-slate-800">
            {formatCurrency(
              records.reduce(
                (sum, record) =>
                  sum +
                  buildGstSummary(record.items || [], {
                    taxMode: getRecordTaxMode(record),
                  }).total,
                0
              )
            )}
          </p>
        </div>
        <div className="bg-white p-4 rounded-lg shadow-sm border border-slate-200">
          <p className="text-sm text-slate-500">Open Orders</p>
          <p className="text-2xl font-semibold text-slate-800">
            {records.filter((record) => !isLockedPurchaseOrder(record.status)).length}
          </p>
        </div>
      </div>

      {apiError && (
        <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {apiError}
        </div>
      )}
      {isEditingLocked && (
        <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-medium">{getPurchaseOrderLockMessage(editingStatus)}</p>
              <p className="mt-1">
                {isEditingLockedWithoutOverride
                  ? "Only Admin users can unlock and edit this PO."
                  : "Admin override is active for this locked PO."}
              </p>
            </div>
            {isEditingLockedWithoutOverride ? (
              <button
                type="button"
                onClick={() => {
                  setPasswordPromptOpen(true);
                  setAdminPassword("");
                  setAdminPasswordError("");
                }}
                className="rounded-md border border-amber-300 bg-white px-3 py-1.5 text-xs font-medium text-amber-900"
              >
                Unlock as Admin
              </button>
            ) : null}
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4 mb-6">
        <div className="bg-white p-5 rounded-lg shadow-sm border border-slate-200">
          <h2 className="text-lg font-semibold text-slate-800 mb-4">
            PO Details
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="text-sm font-medium text-slate-700">
                PO Number
              </label>
              <input
                type="text"
                value={form.poNumber}
                readOnly
                className="w-full mt-1 border border-slate-200 rounded-lg px-3 py-2 bg-slate-100 text-slate-600 cursor-not-allowed"
              />
              <p className="mt-1 text-xs text-slate-500">
                Automatically generated by the system.
              </p>
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700">
                Project *
              </label>
              <select
                value={form.projectId}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, projectId: event.target.value }))
                }
                disabled={isEditingLockedWithoutOverride}
                className="w-full mt-1 border border-slate-200 rounded-lg px-3 py-2 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"
              >
                <option value="">Select project</option>
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {formatProjectOptionLabel(project, locations)}
                  </option>
                ))}
              </select>
              {selectedProject ? (
                <div className="mt-2 flex flex-wrap gap-2 text-xs">
                  <span className="inline-flex rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5 font-medium text-slate-700">
                    {selectedProject.name}
                  </span>
                  {selectedProject.code ? (
                    <span className="inline-flex rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 font-medium text-blue-700">
                      Code: {selectedProject.code}
                    </span>
                  ) : null}
                  {selectedProjectLocations.map((projectLocation) => (
                    <span
                      key={projectLocation.id}
                      className="inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 font-medium text-emerald-700"
                    >
                      {projectLocation.name}
                    </span>
                  ))}
                </div>
              ) : null}
              {errors.projectId && (
                <p className="text-xs text-red-600 mt-1">{errors.projectId}</p>
              )}
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700">
                Vendor *
              </label>
              <select
                value={form.vendorId}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, vendorId: event.target.value }))
                }
                disabled={isEditingLockedWithoutOverride}
                className="w-full mt-1 border border-slate-200 rounded-lg px-3 py-2 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"
              >
                <option value="">Select vendor</option>
                {vendors.map((vendor) => (
                  <option key={vendor.id} value={vendor.id}>
                    {vendor.name}
                  </option>
                ))}
              </select>
              {errors.vendorId && (
                <p className="text-xs text-red-600 mt-1">{errors.vendorId}</p>
              )}
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700">
                Ship To
              </label>
              <select
                value={form.shipToLocationId}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    shipToLocationId: event.target.value,
                  }))
                }
                disabled={isEditingLockedWithoutOverride}
                className="w-full mt-1 border border-slate-200 rounded-lg px-3 py-2 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"
              >
                <option value="">Select ship-to location</option>
                {locations.map((location) => (
                  <option key={location.id} value={location.id}>
                    {location.name}
                  </option>
                ))}
              </select>
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
                disabled={isEditingLockedWithoutOverride}
                className="w-full mt-1 border border-slate-200 rounded-lg px-3 py-2 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"
              >
                <option value="Draft">Draft</option>
                <option value="Sent">Sent</option>
                <option value="Partially Received">Partially Received</option>
                <option value="Closed">Closed</option>
                <option value="Cancelled">Cancelled</option>
              </select>
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700">
                Order Date
              </label>
              <DateInput
                value={form.orderDate}
                onChange={(value) =>
                  setForm((prev) => ({ ...prev, orderDate: value }))
                }
                disabled={isEditingLockedWithoutOverride}
                showCalendarButton={!isEditingLockedWithoutOverride}
                className="w-full mt-1 border border-slate-200 rounded-lg px-3 py-2"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700">
                Date of Delivery
              </label>
              <DateInput
                value={form.expectedDate}
                onChange={(value) =>
                  setForm((prev) => ({
                    ...prev,
                    expectedDate: value,
                  }))
                }
                disabled={isEditingLockedWithoutOverride}
                showCalendarButton={!isEditingLockedWithoutOverride}
                className="w-full mt-1 border border-slate-200 rounded-lg px-3 py-2"
              />
            </div>
            <div className="md:col-span-3 grid grid-cols-1 gap-4 lg:grid-cols-[1.2fr,0.8fr]">
              <div className="rounded-lg border border-slate-200 bg-slate-50/80 p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-500">
                  Vendor Details
                </p>
                <p className="mt-2 text-base font-semibold text-slate-800">
                  {selectedVendor?.name || "Select a vendor"}
                </p>
                <p className="mt-1 text-sm text-slate-600">
                  {formatAddressLine(selectedVendor) || "Vendor address will appear here."}
                </p>
                <div className="mt-3 grid grid-cols-1 gap-2 text-sm text-slate-600 sm:grid-cols-2">
                  <p>GST No: {selectedVendor?.gstNumber || "-"}</p>
                  <p>
                    Contact:{" "}
                    {selectedVendor?.contacts?.[0]?.contactName ||
                      selectedVendor?.phone ||
                      selectedVendor?.email ||
                      "-"}
                  </p>
                </div>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50/80 p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-500">
                  GST Summary
                </p>
                <p className="mt-2 text-base font-semibold text-slate-800">
                  {selectedTaxMode === "inter"
                    ? "Inter-State (IGST)"
                    : "Intra-State (CGST + SGST)"}
                </p>
                <div className="mt-3 space-y-1 text-sm text-slate-600">
                  <p>Subtotal: {formatCurrency(currentSummary.subtotal)}</p>
                  <p>Tax: {formatCurrency(currentSummary.totalTax)}</p>
                  <p className="font-medium text-slate-800">
                    Grand Total: {formatCurrency(currentSummary.total)}
                  </p>
                </div>
              </div>
            </div>
            <div className="md:col-span-3 border border-slate-200 rounded-lg p-4 bg-slate-50/70">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-700">
                    Link a BOQ (optional)
                  </p>
                  <p className="text-xs text-slate-500">
                    Import scope and quantities from an approved BOQ for this project.
                  </p>
                </div>
                <div className="flex flex-col gap-2 md:flex-row md:items-center">
                  <select
                    value={selectedBoqId}
                    onChange={(event) => setSelectedBoqId(event.target.value)}
                    disabled={!form.projectId || boqsLoading || isEditingLockedWithoutOverride}
                    className="w-full md:w-64 border border-slate-200 rounded-lg px-3 py-2 text-sm disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"
                  >
                    <option value="">
                      {boqsLoading
                        ? "Loading BOQs..."
                        : form.projectId
                        ? boqsForProject.length
                          ? "Select BOQ"
                          : "No BOQs for this project"
                        : "Select a project first"}
                    </option>
                    {boqsForProject.map((boq) => {
                      const totalLines = Array.isArray(boq.items) ? boq.items.length : 0;
                      return (
                        <option key={boq.id} value={boq.id}>
                          {boq.boqNumber} | v{boq.version} | {boq.status || "Draft"}
                          {totalLines ? ` | ${totalLines} items` : ""}
                        </option>
                      );
                    })}
                  </select>
                  <button
                    type="button"
                    onClick={applyBoqToItems}
                    disabled={!selectedBoqId || boqsLoading || isEditingLockedWithoutOverride}
                    className="md:ml-2 px-4 py-2 rounded-lg text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60"
                  >
                    Use BOQ Items
                  </button>
                </div>
              </div>
              {(boqError || boqsLoading) && (
                <p className="mt-2 text-xs text-amber-700">
                  {boqsLoading ? "Fetching BOQs..." : boqError}
                </p>
              )}
              {selectedBoqId && (
                <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3 text-xs text-slate-600">
                  {(() => {
                    const selectedBoq = boqs.find(
                      (b) => String(b.id) === String(selectedBoqId)
                    );
                    if (!selectedBoq) return null;
                    return (
                      <>
                        <div className="rounded-md bg-white border border-slate-200 p-3">
                          <p className="text-[11px] uppercase tracking-wide text-slate-500">
                            BOQ
                          </p>
                          <p className="font-semibold text-slate-800">
                            {selectedBoq.boqNumber} (v{selectedBoq.version})
                          </p>
                          <p className="text-slate-500">{selectedBoq.status || "Draft"}</p>
                        </div>
                        <div className="rounded-md bg-white border border-slate-200 p-3">
                          <p className="text-[11px] uppercase tracking-wide text-slate-500">
                            Prepared By
                          </p>
                          <p className="font-semibold text-slate-800">
                            {selectedBoq.preparedBy || "-"}
                          </p>
                          <p className="text-slate-500">
                            {selectedBoq.date || "No date"}
                          </p>
                        </div>
                        <div className="rounded-md bg-white border border-slate-200 p-3">
                          <p className="text-[11px] uppercase tracking-wide text-slate-500">
                            Estimated Value
                          </p>
                          <p className="font-semibold text-slate-800">
                            {formatCurrency(selectedBoq.total || 0)}
                          </p>
                          <p className="text-slate-500">
                            {selectedBoq.items?.length || 0} items
                          </p>
                        </div>
                      </>
                    );
                  })()}
                </div>
              )}
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
                placeholder="Delivery terms, remarks, or approvals."
                disabled={isEditingLockedWithoutOverride}
                className="w-full mt-1 border border-slate-200 rounded-lg px-3 py-2 min-h-[90px] disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"
              />
            </div>
            <div className="md:col-span-3">
              <label className="text-sm font-medium text-slate-700">
                Terms &amp; Conditions
              </label>
              <textarea
                value={form.termsAndConditions}
                placeholder="Purchase order terms and conditions"
                readOnly
                aria-readonly="true"
                className="mt-1 min-h-[180px] w-full cursor-not-allowed rounded-lg border border-slate-200 bg-slate-100 px-3 py-3 text-left text-sm leading-6 text-slate-600 whitespace-pre-wrap"
              />
              <p className="mt-1 text-xs text-slate-500">
                Default static terms are applied to every purchase order.
              </p>
            </div>
          </div>
        </div>

        <div className="po-line-items-panel">
          <LineItemsEditor
            items={items}
            onChange={setItems}
            onPickFromProducts={goPickProducts}
            pickLabel="Pick from Products"
            showHsnGst
            showSerialNumber
            priceLabel="Unit Price"
            extraFieldKey="location"
            extraFieldLabel="Ship To"
            extraFieldPlaceholder="Ship-to note"
            hideSelectedCatalogItems
            readOnly={isEditingLockedWithoutOverride}
          />
        </div>
        {errors.items && (
          <p className="text-xs text-red-600">{errors.items}</p>
        )}

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
            disabled={isEditingLockedWithoutOverride}
            className="px-5 py-2 rounded-lg text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700"
          >
            {isEditingLockedWithoutOverride
              ? "Locked PO"
              : editingId
              ? "Update PO"
              : "Save PO"}
          </button>
        </div>
      </form>

      <PasswordPromptModal
        isOpen={passwordPromptOpen}
        title="Unlock Locked PO"
        description="Enter the admin password to edit this locked purchase order."
        password={adminPassword}
        error={adminPasswordError}
        confirmLabel="Unlock"
        onPasswordChange={(value) => {
          setAdminPassword(value);
          if (adminPasswordError) {
            setAdminPasswordError("");
          }
        }}
        onCancel={() => {
          setPasswordPromptOpen(false);
          setAdminPassword("");
          setAdminPasswordError("");
        }}
        onConfirm={handleClosedPoUnlock}
      />

    </div>
  );
};

export default PurchaseOrder;



