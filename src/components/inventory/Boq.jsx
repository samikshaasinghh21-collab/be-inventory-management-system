import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import LineItemsEditor from "./LineItemsEditor";
import useSettings from "../../hooks/useSettings";
import { fetchProjects } from "../../services/projectsApi";
import {
  createBoq,
  deleteBoq,
  fetchBoqs,
  updateBoq,
} from "../../services/boqApi";
import { fetchPurchaseOrders } from "../../services/purchaseOrdersApi";
import DateInput from "../common/DateInput";
import { formatDate } from "../../utils/dateFormat";
import { printSection } from "../../utils/printUtils";
import { resolveBrandLogo } from "../../utils/branding";
import DocumentViewPanel from "./DocumentViewPanel";
import { buildGstSummary } from "../../utils/taxUtils";
import { formatInrCurrency, roundUnitPrice } from "../../utils/formatters";
import {
  getActiveProjectId,
  setActiveProjectId,
} from "../../services/projectSelectionStore";

const createLineItem = () => ({
  id: Date.now() + Math.random(),
  lineItemId: null,
  itemId: null,
  name: "",
  description: "",
  serialNumber: "",
  availableQty: null,
  inventoryQty: null,
  currentStock: null,
  stock: null,
  unit: "PCS",
  hsn: "",
  gst: "",
  quantity: "",
  rate: "",
  notes: "",
});

const createFormState = (boqNumber = "") => ({
  projectId: "",
  boqNumber,
  version: "1",
  preparedBy: "",
  status: "Draft",
  date: new Date().toISOString().slice(0, 10),
  notes: "",
});

const generateNextBoqNumber = (records = []) => {
  const year = new Date().getFullYear();
  const prefix = `BOQ-${year}-`;
  const sequencePattern = new RegExp(`^BOQ-${year}-(\\d+)$`, "i");
  const usedNumbers = new Set();
  let maxSequence = 0;

  for (const record of records) {
    const currentNumber = String(record?.boqNumber ?? "").trim();
    if (!currentNumber) {
      continue;
    }

    usedNumbers.add(currentNumber.toUpperCase());
    const match = currentNumber.match(sequencePattern);
    if (!match) {
      continue;
    }

    const parsed = Number.parseInt(match[1], 10);
    if (Number.isFinite(parsed)) {
      maxSequence = Math.max(maxSequence, parsed);
    }
  }

  let sequence = maxSequence + 1;
  let candidate = `${prefix}${String(sequence).padStart(3, "0")}`;
  while (usedNumbers.has(candidate.toUpperCase())) {
    sequence += 1;
    candidate = `${prefix}${String(sequence).padStart(3, "0")}`;
  }

  return candidate;
};

const GstSummaryBlock = ({ summary, formatCurrency, align = "left" }) => {
  const alignClass = align === "right" ? "text-right" : "text-left";
  return (
    <div className={`space-y-1 text-sm text-slate-700 ${alignClass}`}>
      <div className="font-medium">Subtotal: {formatCurrency(summary.subtotal)}</div>
      {summary.igstGroups?.map((group) => (
        <div key={`igst-${group.rate}`}>
          IGST @ {Number(group.rate)}%: {formatCurrency(group.amount)}
        </div>
      ))}
      {summary.cgstGroups.map((group) => (
        <div key={`cgst-${group.rate}`}>
          CGST @ {Number(group.rate)}%: {formatCurrency(group.amount)}
        </div>
      ))}
      {summary.sgstGroups.map((group) => (
        <div key={`sgst-${group.rate}`}>
          SGST @ {Number(group.rate)}%: {formatCurrency(group.amount)}
        </div>
      ))}
      <div className="pt-1 font-semibold text-slate-900">
        Total Value: {formatCurrency(summary.total)}
      </div>
    </div>
  );
};

const buildBoqLinePreview = (items = []) => {
  const normalizedItems = Array.isArray(items) ? items : [];
  if (!normalizedItems.length) {
    return "-";
  }

  const preview = normalizedItems.slice(0, 2).map((item) => {
    const qty = Number(item?.quantity ?? 0) || 0;
    const unit = String(item?.unit ?? "").trim() || "PCS";
    const hsn = String(item?.hsn ?? "").trim();
    const gst = String(item?.gst ?? "").trim();
    const note = String(item?.notes ?? "").trim();
    const meta = [hsn ? `HSN ${hsn}` : "", gst ? `GST ${gst}` : "", note ? note : ""]
      .filter(Boolean)
      .join(" | ");
    return `${item?.name || "Item"} - ${qty} ${unit}${meta ? ` (${meta})` : ""}`;
  });

  return normalizedItems.length > 2
    ? `${preview.join("; ")} +${normalizedItems.length - 2} more`
    : preview.join("; ");
};

const getLinkedPurchaseOrders = (record = {}) => {
  if (Array.isArray(record?.linkedPurchaseOrders) && record.linkedPurchaseOrders.length) {
    return record.linkedPurchaseOrders;
  }
  return record?.latestPurchaseOrder ? [record.latestPurchaseOrder] : [];
};

const formatLinkedPurchaseOrderSummary = (record = {}) => {
  const linkedPurchaseOrders = getLinkedPurchaseOrders(record);
  if (!linkedPurchaseOrders.length) {
    return "Not linked";
  }

  const latestPurchaseOrder = linkedPurchaseOrders[0];
  const reference =
    latestPurchaseOrder?.poNumber ||
    (latestPurchaseOrder?.id ? `PO #${latestPurchaseOrder.id}` : "Linked PO");
  const status = latestPurchaseOrder?.status || "Draft";
  const extraCount = linkedPurchaseOrders.length - 1;

  return extraCount > 0
    ? `${reference} | ${status} +${extraCount} more`
    : `${reference} | ${status}`;
};

const getBoqRegisterItems = (record = {}) => {
  return Array.isArray(record?.items) ? record.items : [];
};

const toQuantity = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(parsed, 0) : 0;
};

const isExcludedPurchaseOrderStatus = (status) =>
  ["cancelled", "canceled", "rejected", "void"].includes(
    String(status || "").trim().toLowerCase()
  );

const getBoqLineProgress = (record = {}) => {
  const movedByBoqItemId = new Map();
  const purchaseOrdersByItemId = new Map();

  (record.linkedPurchaseOrderItems || []).forEach((item) => {
    if (isExcludedPurchaseOrderStatus(item.linkedPoStatus)) return;
    const boqItemId = String(item.boqItemId ?? "").trim();
    if (!boqItemId) return;
    movedByBoqItemId.set(
      boqItemId,
      toQuantity(movedByBoqItemId.get(boqItemId)) +
        toQuantity(item.quantity ?? item.orderedQty)
    );
    const references = purchaseOrdersByItemId.get(boqItemId) || new Set();
    if (item.linkedPoNumber || item.linkedPurchaseOrderId) {
      references.add(
        item.linkedPoNumber || `PO #${item.linkedPurchaseOrderId}`
      );
    }
    purchaseOrdersByItemId.set(boqItemId, references);
  });

  return getBoqRegisterItems(record).map((item, index) => {
    const boqQty = toQuantity(item.quantity);
    const boqItemId = String(item.id ?? item.lineItemId ?? "").trim();
    const movedQty = Math.min(
      toQuantity(movedByBoqItemId.get(boqItemId)),
      boqQty
    );
    const remainingQty = Math.max(boqQty - movedQty, 0);
    const movementStatus =
      boqQty > 0 && remainingQty <= 0
        ? "Fully Moved"
        : movedQty > 0
          ? "Partially Moved"
          : "Pending";

    return {
      ...item,
      progressKey: boqItemId || `boq-line-${index}`,
      boqQty,
      movedQty,
      remainingQty,
      movementStatus,
      linkedPoReferences: Array.from(
        purchaseOrdersByItemId.get(boqItemId) || []
      ),
    };
  });
};

const getBoqMovementSummary = (record = {}) =>
  getBoqLineProgress(record).reduce(
    (summary, item) => ({
      boqQty: summary.boqQty + item.boqQty,
      movedQty: summary.movedQty + item.movedQty,
      remainingQty: summary.remainingQty + item.remainingQty,
      pendingLines:
        summary.pendingLines + (item.movementStatus === "Pending" ? 1 : 0),
      partialLines:
        summary.partialLines +
        (item.movementStatus === "Partially Moved" ? 1 : 0),
      fullyMovedLines:
        summary.fullyMovedLines +
        (item.movementStatus === "Fully Moved" ? 1 : 0),
    }),
    {
      boqQty: 0,
      movedQty: 0,
      remainingQty: 0,
      pendingLines: 0,
      partialLines: 0,
      fullyMovedLines: 0,
    }
  );

const movementStatusClass = (status) =>
  ({
    Pending: "bg-slate-100 text-slate-700",
    "Partially Moved": "bg-amber-100 text-amber-800",
    "Fully Moved": "bg-emerald-100 text-emerald-800",
  })[status] || "bg-slate-100 text-slate-700";

const attachLinkedPurchaseOrderItems = (boqs = [], purchaseOrders = []) => {
  const purchaseOrdersByBoqId = (Array.isArray(purchaseOrders) ? purchaseOrders : []).reduce(
    (acc, order) => {
      const boqId = String(order?.boqId ?? "").trim();
      if (!boqId) {
        return acc;
      }
      if (!acc[boqId]) {
        acc[boqId] = [];
      }
      acc[boqId].push(order);
      return acc;
    },
    {}
  );

  return (Array.isArray(boqs) ? boqs : []).map((boq) => {
    const linkedOrders = purchaseOrdersByBoqId[String(boq?.id)] ?? [];
    const linkedPurchaseOrderItems = linkedOrders.flatMap((order) =>
      Array.isArray(order?.items)
        ? order.items.map((item) => ({
            ...item,
            linkedPurchaseOrderId: order.id,
            linkedPoNumber: order.poNumber,
            linkedPoStatus: order.status,
          }))
        : []
    );
    return {
      ...boq,
      linkedPurchaseOrders:
        linkedOrders.length > 0 ? linkedOrders : boq.linkedPurchaseOrders || [],
      linkedPurchaseOrderItems,
    };
  });
};

const Boq = () => {
  const settings = useSettings();
  const skipAutoProjectRef = useRef(false);
  const savingRef = useRef(false);
  const [projects, setProjects] = useState([]);
  const [records, setRecords] = useState([]);
  const [form, setForm] = useState(createFormState);
  const [items, setItems] = useState([createLineItem()]);
  const [errors, setErrors] = useState({});
  const [editingId, setEditingId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [viewRecord, setViewRecord] = useState(null);
  const [expandedId, setExpandedId] = useState(null);
  const navigate = useNavigate();
  const company = settings?.company || {};
  const logoUrl = resolveBrandLogo(company.logo || "");
  const brandName = company.name || "Bangalore Electronics";
  const brandDescription = company.address || "Company address";
  const formatCurrency = formatInrCurrency;

  const loadData = async () => {
    try {
      setLoading(true);
      const [projectList, boqList, purchaseOrderList] = await Promise.all([
        fetchProjects(),
        fetchBoqs(),
        fetchPurchaseOrders(),
      ]);
      setProjects(projectList);
      setRecords(attachLinkedPurchaseOrderItems(boqList, purchaseOrderList));
    } catch (error) {
      console.error("Failed to load BOQ data", error);
      setErrorMessage("Unable to load BOQ data. Please refresh.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    const handleBoqChange = () => {
      void loadData();
    };

    window.addEventListener("boqs:changed", handleBoqChange);
    return () => {
      window.removeEventListener("boqs:changed", handleBoqChange);
    };
  }, []);

  useEffect(() => {
    if (editingId || form.projectId || !projects.length) {
      return;
    }
    if (skipAutoProjectRef.current) {
      skipAutoProjectRef.current = false;
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

    const nextBoqNumber = generateNextBoqNumber(records);
    setForm((prev) => {
      if (prev.boqNumber === nextBoqNumber) {
        return prev;
      }
      return { ...prev, boqNumber: nextBoqNumber };
    });
  }, [records, editingId]);

  // Import selected products from product picker (pick=boq flow)
  useEffect(() => {
    try {
      const raw = localStorage.getItem("boq_selected_products");
      if (!raw) return;
      const selected = JSON.parse(raw);
      if (Array.isArray(selected) && selected.length > 0) {
        setItems((prev) => {
          const base =
            prev.length === 1 &&
            !prev[0].name &&
            !prev[0].quantity &&
            !prev[0].rate
              ? []
              : prev;
          const mapped = selected.map((item) => ({
            id: Date.now() + Math.random(),
            lineItemId: null,
            itemId: item.itemId ?? item.ItemId ?? item.id ?? null,
            name: item.name ?? "",
            description: item.description ?? "",
            serialNumber: item.serialNumber ?? "",
            unit: item.unit ?? "PCS",
            hsn: item.hsn ?? item.HSN ?? item.hsnCode ?? item.HSNCode ?? "",
            gst: item.gst ?? item.GST ?? item.gstRate ?? item.GSTRate ?? "",
            availableQty:
              item.availableQty ??
              item.currentStock ??
              item.stock ??
              item.quantity ??
              item.qty ??
              null,
            inventoryQty: item.inventoryQty ?? item.currentStock ?? item.stock ?? null,
            currentStock: item.currentStock ?? item.stock ?? null,
            stock: item.stock ?? item.currentStock ?? null,
            quantity:
              item.availableQty ??
              item.currentStock ??
              item.stock ??
              item.quantity ??
              item.qty ??
              1,
            rate: roundUnitPrice(item.rate ?? 0),
            notes: item.notes ?? "",
          }));
          return [...base, ...mapped];
        });
      }
    } catch (err) {
      console.error("Failed to import BOQ selections", err);
    } finally {
      localStorage.removeItem("boq_selected_products");
    }
  }, []);

  const projectMap = useMemo(() => {
    return projects.reduce((acc, project) => {
      acc[String(project.id)] = project;
      return acc;
    }, {});
  }, [projects]);

  const totalValue = records.reduce((sum, record) => {
    const summary = buildGstSummary(record.items || []);
    return sum + summary.total;
  }, 0);

  const draftCount = records.filter((record) => record.status === "Draft").length;

  const boqRegisterMeta = useMemo(
    () => [
      { label: "Total BOQs", value: records.length },
      { label: "Draft BOQs", value: draftCount },
      { label: "Estimated Value", value: formatCurrency(totalValue) },
    ],
    [records.length, draftCount, totalValue, formatCurrency]
  );

  const resetForm = (nextRecords = records) => {
    skipAutoProjectRef.current = true;
    setForm(createFormState(generateNextBoqNumber(nextRecords)));
    setItems([createLineItem()]);
    setErrors({});
    setEditingId(null);
  };

  const validate = () => {
    const nextErrors = {};
    if (!form.projectId) {
      nextErrors.projectId = "Select a project.";
    }
    if (!form.boqNumber.trim()) {
      nextErrors.boqNumber = "BOQ number is required.";
    }
    const hasValidItem = items.some(
      (item) => item.name.trim() && Number(item.quantity) > 0
    );
    if (!hasValidItem) {
      nextErrors.items = "Add at least one item with quantity.";
    }
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (savingRef.current || !validate()) {
      return;
    }

    const cleanedItems = items.filter(
      (item) => item.name.trim() || Number(item.quantity) > 0
    );
    const total = cleanedItems.reduce((sum, item) => {
      const qty = Number(item.quantity) || 0;
      const rate = roundUnitPrice(item.rate);
      return sum + qty * rate;
    }, 0);

    const payload = {
      projectId: Number(form.projectId),
      boqNumber: form.boqNumber.trim(),
      version: form.version,
      preparedBy: form.preparedBy,
      status: form.status,
      date: form.date,
      notes: form.notes,
      items: cleanedItems.map((item) => ({
        id: item.lineItemId ?? null,
        itemId: item.itemId ?? null,
        name: item.name,
        description: item.description,
        serialNumber: item.serialNumber,
        unit: item.unit,
        hsn: item.hsn,
        gst: item.gst,
        quantity: Number(item.quantity) || 0,
        availableQty:
          Number(item.availableQty ?? item.inventoryQty ?? item.currentStock ?? item.stock ?? 0) ||
          0,
        rate: roundUnitPrice(item.rate),
        notes: item.notes,
      })),
      total,
    };

    try {
      savingRef.current = true;
      setSaving(true);
      setErrorMessage("");
      if (editingId) {
        await updateBoq(editingId, payload);
      } else {
        await createBoq(payload);
      }
      const [freshBoqs, freshPurchaseOrders] = await Promise.all([
        fetchBoqs(),
        fetchPurchaseOrders(),
      ]);
      const fresh = attachLinkedPurchaseOrderItems(freshBoqs, freshPurchaseOrders);
      setRecords(fresh);
      resetForm(fresh);
    } catch (error) {
      console.error("Failed to save BOQ", error);
      setErrorMessage(error?.response?.data?.error ?? "Failed to save BOQ");
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  const handleEdit = (record) => {
    setEditingId(record.id);
    setForm({
      projectId: record.projectId || "",
      boqNumber: record.boqNumber || "",
      version: record.version || "1",
      preparedBy: record.preparedBy || "",
      status: record.status || "Draft",
      date: record.date || new Date().toISOString().slice(0, 10),
      notes: record.notes || "",
    });
    setItems(
      record.items?.length
        ? record.items.map((item) => ({
            id: item.id ?? Date.now() + Math.random(),
            lineItemId: item.id ?? null,
            itemId: item.itemId ?? null,
            name: item.name ?? "",
            description: item.description ?? "",
            serialNumber: item.serialNumber ?? "",
            unit: item.unit ?? "PCS",
            hsn: item.hsn ?? item.HSN ?? "",
            gst: item.gst ?? item.GST ?? "",
            availableQty: item.availableQty ?? item.inventoryQty ?? item.currentStock ?? item.stock ?? null,
            inventoryQty: item.inventoryQty ?? item.currentStock ?? item.stock ?? null,
            currentStock: item.currentStock ?? item.stock ?? null,
            stock: item.stock ?? item.currentStock ?? null,
            quantity: item.quantity ?? "",
            rate: item.rate || item.rate === 0 ? roundUnitPrice(item.rate) : "",
            notes: item.notes ?? "",
          }))
        : [createLineItem()]
    );
    setErrors({});
  };

  const handleDelete = async (id) => {
    try {
      setSaving(true);
      await deleteBoq(id);
      setRecords((prev) => prev.filter((record) => record.id !== id));
      if (viewRecord?.id === id) {
        setViewRecord(null);
      }
    } catch (error) {
      console.error("Failed to delete BOQ", error);
      setErrorMessage(error?.response?.data?.error ?? "Failed to delete BOQ");
    } finally {
      setSaving(false);
    }
  };

  const handlePickFromProducts = () => {
    navigate("/inventory/products?pick=boq");
  };

  const handleView = (record) => {
    setViewRecord(record);
  };

  const handlePrint = (record) => {
    setViewRecord(record);
    setTimeout(() => {
      printSection({
        selector: "#boq-view-panel",
        title: "BOQ Details",
        logoUrl,
        brandName,
                    brandDescription,
                    pageOrientation: "landscape",
      });
    }, 80);
  };

  return (
    <div className="p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between mb-6">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-slate-400">
            Inventory Management
          </p>
          <h1 className="text-3xl font-semibold text-slate-800">
            Bill of Quantity (BOQ)
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Define baseline materials and quantities for each project.
          </p>
          {errorMessage && (
            <p className="text-sm text-red-600 mt-2">{errorMessage}</p>
          )}
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={resetForm}
            className="px-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-700 bg-white hover:border-slate-300"
          >
            Clear Form
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-white p-4 rounded-lg shadow-sm border border-slate-200">
          <p className="text-sm text-slate-500">Total BOQs</p>
          <p className="text-2xl font-semibold text-slate-800">
            {records.length}
          </p>
        </div>
        <div className="bg-white p-4 rounded-lg shadow-sm border border-slate-200">
          <p className="text-sm text-slate-500">Draft BOQs</p>
          <p className="text-2xl font-semibold text-slate-800">
            {draftCount}
          </p>
        </div>
        <div className="bg-white p-4 rounded-lg shadow-sm border border-slate-200">
          <p className="text-sm text-slate-500">Estimated Value</p>
          <p className="text-2xl font-semibold text-slate-800">
            {formatCurrency(totalValue)}
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4 mb-6">
        <div className="bg-white p-5 rounded-lg shadow-sm border border-slate-200">
          <h2 className="text-lg font-semibold text-slate-800 mb-4">
            BOQ Details
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="text-sm font-medium text-slate-700">
                Project *
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
                <option value="">Select project</option>
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </select>
              {errors.projectId && (
                <p className="text-xs text-red-600 mt-1">
                  {errors.projectId}
                </p>
              )}
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700">
                BOQ Number *
              </label>
              <input
                type="text"
                value={form.boqNumber}
                readOnly
                className="w-full mt-1 border border-slate-200 rounded-lg px-3 py-2 bg-slate-100 text-slate-600 cursor-not-allowed"
              />
              <p className="text-xs text-slate-500 mt-1">
                Auto-generated by system.
              </p>
              {errors.boqNumber && (
                <p className="text-xs text-red-600 mt-1">
                  {errors.boqNumber}
                </p>
              )}
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700">
                Version
              </label>
              <input
                type="text"
                value={form.version}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    version: event.target.value,
                  }))
                }
                className="w-full mt-1 border border-slate-200 rounded-lg px-3 py-2"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700">
                Prepared By
              </label>
              <input
                type="text"
                value={form.preparedBy}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    preparedBy: event.target.value,
                  }))
                }
                placeholder="Site Engineer"
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
                  setForm((prev) => ({
                    ...prev,
                    status: event.target.value,
                  }))
                }
                className="w-full mt-1 border border-slate-200 rounded-lg px-3 py-2"
              >
                <option value="Draft">Draft</option>
                <option value="Approved">Approved</option>
                <option value="Closed">Closed</option>
              </select>
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700">
                Date
              </label>
              <DateInput
                value={form.date}
                onChange={(value) =>
                  setForm((prev) => ({
                    ...prev,
                    date: value,
                  }))
                }
                className="w-full mt-1 border border-slate-200 rounded-lg px-3 py-2"
              />
            </div>
            <div className="md:col-span-3">
              <label className="text-sm font-medium text-slate-700">
                Notes
              </label>
              <textarea
                value={form.notes}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    notes: event.target.value,
                  }))
                }
                placeholder="Scope assumptions, approvals, or remarks."
                className="w-full mt-1 border border-slate-200 rounded-lg px-3 py-2 min-h-[90px]"
              />
            </div>
          </div>
        </div>

        <LineItemsEditor
          items={items}
          onChange={setItems}
          onPickFromProducts={handlePickFromProducts}
          pickLabel="Pick from Products"
          showHsnGst
          useInventoryQuantityForQuantity
          priceLabel="Unit Price"
        />
        {errors.items && (
          <p className="text-xs text-red-600">{errors.items}</p>
        )}

        <div className="flex items-center justify-end gap-3">
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
            disabled={saving}
          >
            {saving ? "Saving..." : editingId ? "Update BOQ" : "Save BOQ"}
          </button>
        </div>
      </form>

      <div
        id="boq-register"
        className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-x-auto"
      >
        <div className="px-4 py-3 border-b flex items-center justify-between gap-3">
          <h3 className="text-lg font-semibold text-slate-800">
            BOQ Register
          </h3>
          <div className="flex gap-2 ml-auto">
                <button
                  type="button"
                  onClick={() =>
                    printSection({
                      selector: "#boq-register",
                      title: "BOQ Register",
                      subtitle: "Approved bill of quantities log",
                      metaRows: boqRegisterMeta,
                      logoUrl,
                      brandName,
                      brandDescription,
                    })
                  }
                  className="px-3 py-1 rounded-full border border-slate-300 text-xs text-slate-600 hover:border-slate-400 hover:text-slate-800"
                >
              Print register
            </button>
          </div>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-slate-100 text-slate-600">
            <tr>
              <th className="p-3 text-left min-w-[160px]">BOQ No</th>
              <th className="p-3 text-left min-w-[180px]">Project</th>
              <th className="p-3 text-left min-w-[90px]">Version</th>
              <th className="p-3 text-left min-w-[120px]">Status</th>
              <th className="p-3 text-left min-w-[200px]">PO Sync</th>
              <th className="p-3 text-left min-w-[110px]">Items</th>
              <th className="p-3 text-left min-w-[260px]">Line Item Preview</th>
              <th className="p-3 text-left min-w-[220px]">Tax Details</th>
              <th className="p-3 text-left min-w-[140px]">Total Value</th>
              <th className="p-3 text-left min-w-[140px]">Date</th>
              <th className="p-3 text-left min-w-[160px]">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan="11" className="p-6 text-center text-slate-500">
                  Loading BOQs...
                </td>
              </tr>
            )}
            {!loading && records.length === 0 && (
              <tr>
                <td colSpan="11" className="p-6 text-center text-slate-500">
                  No BOQs created yet.
                </td>
              </tr>
            )}
            {records.map((record) => {
              const registerItems = getBoqRegisterItems(record);
              const summary = buildGstSummary(registerItems);
              const lineProgress = getBoqLineProgress(record);
              const movementSummary = getBoqMovementSummary(record);
              const isExpanded = String(expandedId) === String(record.id);
              return (
                <Fragment key={record.id}>
                  <tr
                    className={`cursor-pointer border-t transition hover:bg-slate-50 ${
                      isExpanded ? "bg-indigo-50/60" : ""
                    }`}
                    onClick={() =>
                      setExpandedId((current) =>
                        String(current) === String(record.id) ? null : record.id
                      )
                    }
                    aria-expanded={isExpanded}
                  >
                    <td className="p-3 font-medium text-slate-800">
                      <span className="mr-2 inline-block text-xs text-slate-400">
                        {isExpanded ? "▼" : "▶"}
                      </span>
                      {record.boqNumber || "-"}
                    </td>
                    <td className="p-3">
                      {projectMap[String(record.projectId)]?.name || "-"}
                    </td>
                    <td className="p-3">{record.version || "-"}</td>
                    <td className="p-3">{record.status || "-"}</td>
                    <td className="p-3 text-xs text-slate-600">
                      {formatLinkedPurchaseOrderSummary(record)}
                    </td>
                    <td className="p-3">{registerItems.length || 0}</td>
                    <td className="p-3 text-xs text-slate-600">
                      {buildBoqLinePreview(registerItems)}
                    </td>
                    <td className="p-3">
                      <GstSummaryBlock summary={summary} formatCurrency={formatCurrency} />
                    </td>
                    <td className="p-3 font-medium">
                      {formatCurrency(summary.total)}
                    </td>
                    <td className="p-3">{formatDate(record.date) || "-"}</td>
                    <td className="p-3">
                      <div className="flex gap-3">
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            handleView(record);
                          }}
                          className="text-slate-700 text-sm underline"
                        >
                          View
                        </button>
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            handlePrint(record);
                          }}
                          className="text-slate-600 text-sm"
                        >
                          Print
                        </button>
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            handleEdit(record);
                          }}
                          className="text-indigo-600 text-sm"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            handleDelete(record.id);
                          }}
                          className="text-red-600 text-sm"
                          disabled={saving}
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>

                  {isExpanded && (
                    <tr className="print-hidden border-t bg-slate-50/80">
                      <td colSpan="11" className="p-5">
                        <div className="space-y-5">
                          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                            <div className="rounded-xl border border-slate-200 bg-white p-4">
                              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                                BOQ Quantity
                              </p>
                              <p className="mt-2 text-xl font-bold text-slate-950">
                                {movementSummary.boqQty}
                              </p>
                            </div>
                            <div className="rounded-xl border border-blue-200 bg-blue-50 p-4">
                              <p className="text-xs font-semibold uppercase tracking-wide text-blue-600">
                                Moved to PO
                              </p>
                              <p className="mt-2 text-xl font-bold text-blue-800">
                                {movementSummary.movedQty}
                              </p>
                            </div>
                            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                              <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">
                                Remaining BOQ
                              </p>
                              <p className="mt-2 text-xl font-bold text-amber-800">
                                {movementSummary.remainingQty}
                              </p>
                            </div>
                            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                              <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
                                Line Progress
                              </p>
                              <p className="mt-2 text-sm font-semibold text-emerald-900">
                                {movementSummary.fullyMovedLines} fully moved ·{" "}
                                {movementSummary.partialLines} partial ·{" "}
                                {movementSummary.pendingLines} pending
                              </p>
                            </div>
                          </div>

                          <div className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
                            <p><strong>BOQ No:</strong> {record.boqNumber || record.id}</p>
                            <p><strong>Project:</strong> {projectMap[String(record.projectId)]?.name || "-"}</p>
                            <p><strong>Prepared By:</strong> {record.preparedBy || "-"}</p>
                            <p><strong>Date:</strong> {formatDate(record.date) || "-"}</p>
                            <p><strong>Version:</strong> {record.version || "-"}</p>
                            <p><strong>Status:</strong> {record.status || "-"}</p>
                            <p><strong>Linked POs:</strong> {getLinkedPurchaseOrders(record).length}</p>
                            <p><strong>Total Value:</strong> {formatCurrency(summary.total)}</p>
                          </div>

                          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
                            <div className="border-b border-slate-200 px-4 py-3">
                              <h4 className="font-semibold text-slate-800">BOQ Line Movement</h4>
                              <p className="mt-1 text-xs text-slate-500">
                                BOQ Qty − quantity moved to active purchase orders = remaining BOQ quantity.
                              </p>
                            </div>
                            <table className="min-w-[1350px] w-full text-sm">
                              <thead className="bg-slate-100 text-xs uppercase tracking-wide text-slate-500">
                                <tr>
                                  <th className="p-3 text-left">Item</th>
                                  <th className="p-3 text-left">HSN / GST</th>
                                  <th className="p-3 text-left">Unit</th>
                                  <th className="p-3 text-right">BOQ Qty</th>
                                  <th className="p-3 text-right">Moved to PO</th>
                                  <th className="p-3 text-right">Remaining Qty</th>
                                  <th className="p-3 text-right">Unit Price</th>
                                  <th className="p-3 text-right">BOQ Value</th>
                                  <th className="p-3 text-left">Linked PO</th>
                                  <th className="p-3 text-left">Movement Status</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100">
                                {lineProgress.map((item) => (
                                  <tr key={item.progressKey}>
                                    <td className="p-3">
                                      <p className="font-medium text-slate-900">{item.name || "-"}</p>
                                      <p className="mt-1 max-w-xs text-xs text-slate-500">
                                        {item.description || item.notes || "-"}
                                      </p>
                                    </td>
                                    <td className="p-3 text-xs text-slate-600">
                                      <p>HSN: {item.hsn || "-"}</p>
                                      <p className="mt-1">GST: {item.gst || "-"}</p>
                                    </td>
                                    <td className="p-3">{item.unit || "-"}</td>
                                    <td className="p-3 text-right font-semibold">{item.boqQty}</td>
                                    <td className="p-3 text-right font-semibold text-blue-700">{item.movedQty}</td>
                                    <td className="p-3 text-right font-semibold text-amber-700">{item.remainingQty}</td>
                                    <td className="p-3 text-right">{formatCurrency(item.rate)}</td>
                                    <td className="p-3 text-right font-medium">
                                      {formatCurrency(item.boqQty * roundUnitPrice(item.rate))}
                                    </td>
                                    <td className="p-3 text-xs text-slate-600">
                                      {item.linkedPoReferences.length
                                        ? item.linkedPoReferences.join(", ")
                                        : "Not linked"}
                                    </td>
                                    <td className="p-3">
                                      <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${movementStatusClass(item.movementStatus)}`}>
                                        {item.movementStatus}
                                      </span>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>

                          {record.notes && (
                            <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm">
                              <p className="font-semibold text-slate-800">Notes</p>
                              <p className="mt-2 whitespace-pre-wrap text-slate-600">{record.notes}</p>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      {viewRecord && (
        (() => {
          const registerItems = getBoqRegisterItems(viewRecord);
          const summary = buildGstSummary(registerItems);
          return (
        <DocumentViewPanel
          id="boq-view-panel"
          title="BILL OF QUANTITY"
          onClose={() => setViewRecord(null)}
          companyName={brandName}
          companyAddress={brandDescription}
          companyGstin={company.gstin}
          companyPhone={company.phone}
          companyEmail={company.email}
          logoUrl={logoUrl}
          primaryPairs={[
            { label: "BOQ No", value: viewRecord.boqNumber || viewRecord.id },
            { label: "Date", value: formatDate(viewRecord.date) },
            { label: "Version", value: viewRecord.version },
            { label: "Status", value: viewRecord.status },
          ]}
          leftBlockTitle="Project"
          leftBlockLines={[projectMap[String(viewRecord.projectId)]?.name || "-"]}
          rightBlockTitle="Prepared By"
          rightBlockLines={[viewRecord.preparedBy || "-"]}
          tableColumns={[
            { key: "name", label: "Item" },
            { key: "description", label: "Description" },
            { key: "hsn", label: "HSN", widthClass: "w-20" },
            { key: "gst", label: "GST", widthClass: "w-20" },
            { key: "unit", label: "Unit", widthClass: "w-20" },
            { key: "quantity", label: "Planned", align: "right", widthClass: "w-20" },
            {
              key: "rate",
              label: "Unit Price",
              align: "right",
              widthClass: "w-24",
            },
            { key: "amount", label: "Amount", align: "right", widthClass: "w-28" },
          ]}
          tableRows={registerItems.map((item, index) => {
            const qty = Number(item.quantity || 0);
            const rate = roundUnitPrice(item.rate);
            return {
              id: item.id || index,
              name: item.name || "-",
              description: item.description || item.notes || "-",
              hsn: item.hsn || "-",
              gst: item.gst || "-",
              unit: item.unit || "-",
              quantity: qty,
              rate: formatCurrency(rate),
              amount: formatCurrency(qty * rate),
            };
          })}
          bottomLeftTitle="Notes"
          bottomLeftValue={viewRecord.notes || "-"}
          bottomRightContent={
            <GstSummaryBlock
              summary={summary}
              formatCurrency={formatCurrency}
              align="right"
            />
          }
          footerCompanyName={brandName}
        />
          );
        })()
      )}
    </div>
  );
};

export default Boq;
