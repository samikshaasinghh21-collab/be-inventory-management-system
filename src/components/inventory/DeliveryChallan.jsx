import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  Eye,
  FileCheck2,
  History,
  RefreshCw,
  ShieldCheck,
  UploadCloud,
  XCircle,
} from "lucide-react";
import useSettings from "../../hooks/useSettings";
import { getProjects } from "../../services/projectsStore";
import { fetchLocations } from "../../services/locationsApi";
import { fetchReceiveGoods } from "../../services/receiveGoodsApi";
import { fetchPurchaseOrders } from "../../services/purchaseOrdersApi";
import {
  createDeliveryChallan,
  deleteDeliveryChallan,
  fetchDeliveryChallan,
  fetchDeliveryChallanPodAudit,
  fetchDeliveryChallans,
  fetchNextDeliveryChallanNumber,
  getPodStatusLabel,
  normalizePodStatus,
  POD_STATUS,
  updateDeliveryChallanPodStatus,
  updateDeliveryChallan,
  uploadDeliveryChallanPod,
} from "../../services/deliveryChallanApi";
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
  receiveGoodsId: "",
  fromLocationId: "",
  toLocationId: "",
  toLocation: "",
  vehicleNumber: "",
  eWayBillNumber: "",
  issueDate: new Date().toISOString().slice(0, 10),
  status: "Draft",
  podStatus: POD_STATUS.PENDING,
  podReference: "",
  podDate: "",
  notes: "",
});

const POD_UPLOAD_LIMIT_BYTES = 5 * 1024 * 1024;

const createPodFormState = () => ({
  reference: "",
  podDate: "",
  remarks: "",
  fileName: "",
  fileType: "",
  fileSize: 0,
  fileData: "",
});

const podStatusTone = (status) => {
  switch (normalizePodStatus(status)) {
    case POD_STATUS.UPLOADED:
      return "border-blue-200 bg-blue-50 text-blue-700";
    case POD_STATUS.UNDER_VERIFICATION:
      return "border-indigo-200 bg-indigo-50 text-indigo-700";
    case POD_STATUS.VERIFIED:
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    case POD_STATUS.REJECTED:
      return "border-rose-200 bg-rose-50 text-rose-700";
    case POD_STATUS.DISPUTED:
      return "border-orange-200 bg-orange-50 text-orange-700";
    case POD_STATUS.WAIVED:
      return "border-slate-300 bg-slate-100 text-slate-700";
    default:
      return "border-amber-200 bg-amber-50 text-amber-700";
  }
};

const formatDateTime = (value) => {
  if (!value) {
    return "-";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return formatDate(value);
  }
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
};

const getPodTimestamp = (record = {}) => {
  const status = normalizePodStatus(record.podStatus);
  if (status === POD_STATUS.VERIFIED) {
    return record.podVerifiedAt || record.podDate || record.updatedAt;
  }
  if (status === POD_STATUS.REJECTED) {
    return record.podRejectedAt || record.updatedAt;
  }
  if (status === POD_STATUS.DISPUTED) {
    return record.podDisputedAt || record.updatedAt;
  }
  if (status === POD_STATUS.WAIVED) {
    return record.podWaivedAt || record.updatedAt;
  }
  return record.podUploadedAt || record.podDate || null;
};

const getPodActor = (record = {}) => {
  const status = normalizePodStatus(record.podStatus);
  if (status === POD_STATUS.VERIFIED) {
    return record.podVerifiedBy;
  }
  if (status === POD_STATUS.REJECTED) {
    return record.podRejectedBy;
  }
  if (status === POD_STATUS.DISPUTED) {
    return record.podDisputedBy;
  }
  if (status === POD_STATUS.WAIVED) {
    return record.podWaiverApprovedBy || record.podWaivedBy;
  }
  return record.podUploadedBy;
};

const isPodReviewerRole = (role) =>
  ["admin", "manager"].includes(String(role ?? "").trim().toLowerCase());

const readFileAsDataUrl = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("Failed to read file."));
    reader.readAsDataURL(file);
  });

const POD_ACTION_TITLES = {
  verify: "Verify POD",
  reject: "Reject POD",
  dispute: "Dispute POD",
  waive: "Waive POD",
  resolve: "Resolve POD Issue",
};

const POD_ACTION_CONFIRM_LABELS = {
  verify: "Verify",
  reject: "Reject",
  dispute: "Mark Disputed",
  waive: "Approve Waiver",
  resolve: "Resolve",
};

const POD_DETAIL_TITLES = {
  details: "POD Details",
  reason: "Rejection Reason",
  issue: "Dispute Issue",
  approval: "Waiver Approval",
  audit: "POD Audit Log",
};

const getReceiptReference = (receipt = {}) =>
  `RG-${String(receipt.receiveGoodsId ?? receipt.id ?? "").padStart(3, "0")}`;

const resolveProjectPreferredLocation = (locations = [], projectId) => {
  const normalizedProjectId = String(projectId ?? "").trim();
  if (!normalizedProjectId) {
    return null;
  }
  return (
    locations.find(
      (location) => String(location.projectId ?? "").trim() === normalizedProjectId
    ) || null
  );
};

const buildReceiptReferenceLabel = (receipt = {}, projectName = "") => {
  const receiptNumber = getReceiptReference(receipt);
  const invoiceDateText = formatDate(receipt.invoiceDate ?? receipt.receivedDate ?? receipt.createdAt);
  return [
    receiptNumber,
    receipt.invoiceNumber ? `INV ${receipt.invoiceNumber}` : null,
    projectName ? `Project: ${projectName}` : null,
    invoiceDateText && invoiceDateText !== "-" ? invoiceDateText : null,
  ]
    .filter(Boolean)
    .join(" | ");
};

const getReceiptItemReceivedQty = (item = {}) =>
  Number(
    item.receiptReceivedQty ??
      item.ReceiptReceivedQty ??
      item.receivedQty ??
      item.ReceivedQty ??
      item.quantity ??
      item.Quantity ??
      0
  ) || 0;

const getReceiptItemAvailableQty = (item = {}) =>
  Number(
    item.receiptAvailableQty ??
      item.ReceiptAvailableQty ??
      item.availableQty ??
      item.AvailableQty ??
      item.totalAvailableQty ??
      item.TotalAvailableQty ??
      getReceiptItemReceivedQty(item)
  ) || 0;

const mapReceiptItemsToChallanItems = (
  receipt = {},
  resolveAvailableQty = getReceiptItemAvailableQty
) =>
  (receipt.items || [])
    .map((item, index) => {
      const availableQty = Math.max(Number(resolveAvailableQty(item)) || 0, 0);
      const quantity = availableQty;
      const receivedQty = getReceiptItemReceivedQty(item);
      return {
        id: item.id ?? `${Date.now()}-${index}`,
        receiveGoodsItemId: item.receiveGoodsItemId ?? item.ReceiveGoodsItemId ?? item.id ?? null,
        poItemId:
          item.poItemId ??
          item.POItemId ??
          item.purchaseOrderItemId ??
          item.PurchaseOrderItemId ??
          null,
        itemId: item.itemId ?? item.ItemId ?? null,
        name: item.name || "",
        description: item.description || "",
        unit: item.unit || "PCS",
        hsn: item.hsn || "",
        gst: item.gst || "",
        receivedQty,
        previouslyUsedQty: Math.max(receivedQty - availableQty, 0),
        availableQty,
        quantity,
        rate: Number(item.unitPrice ?? item.rate ?? 0) || 0,
        notes: item.notes || "",
      };
    })
    .filter(Boolean)
    .filter((item) => item.name && Number(item.quantity) > 0);

const fmtQty = (value) =>
  (Number(value) || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 });

const toQuantity = (value) => Number(value) || 0;

const getDeliveryChallanRegisterStatus = (record = {}) => {
  const rawStatus = String(record.status || "")
    .trim()
    .toLowerCase();
  if (rawStatus.includes("partial")) {
    return "Partially Received";
  }
  if (rawStatus === "received" || rawStatus === "delivered" || rawStatus === "closed") {
    return "Received";
  }
  const deliveredQty = toQuantity(record.deliveredQty);
  const consumedQty = toQuantity(record.consumedQty);
  const balanceQty = toQuantity(record.balanceQty);
  if (deliveredQty > 0 && consumedQty > 0 && balanceQty > 0) {
    return "Partially Received";
  }
  if (deliveredQty > 0 && balanceQty <= 0) {
    return "Received";
  }
  return "Pending";
};

const parseNumberValue = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const normalizeLookupText = (value = "") => String(value ?? "").trim().toLowerCase();
const normalizePreselectedReceiptIds = (value = []) =>
  Array.from(
    new Set(
      (Array.isArray(value) ? value : [])
        .map((entry) => String(entry ?? "").trim())
        .filter(Boolean)
    )
  );

const areReceiptSelectionsEqual = (left = [], right = []) => {
  const normalize = (value = []) =>
    normalizePreselectedReceiptIds(value).sort((a, b) => a.localeCompare(b));
  const leftIds = normalize(left);
  const rightIds = normalize(right);
  return (
    leftIds.length === rightIds.length &&
    leftIds.every((id, index) => id === rightIds[index])
  );
};

const DeliveryChallan = () => {
  const location = useLocation();
  const prefillSignatureRef = useRef("");
  const [projects, setProjects] = useState(() => getProjects());
  const [locations, setLocations] = useState([]);
  const [purchaseOrders, setPurchaseOrders] = useState([]);
  const [receipts, setReceipts] = useState([]);
  const [records, setRecords] = useState([]);
  const [form, setForm] = useState(createFormState);
  const [items, setItems] = useState([]);
  const [loadedReceiptIds, setLoadedReceiptIds] = useState([]);
  const [receiptFilters, setReceiptFilters] = useState({
    search: "",
  });
  const [selectedReceiptIds, setSelectedReceiptIds] = useState([]);
  const [errors, setErrors] = useState({});
  const [receiptsLoading, setReceiptsLoading] = useState(false);
  const [receiptError, setReceiptError] = useState("");
  const [updateProof, setUpdateProof] = useState("");
  const [dcStatusFilter, setDcStatusFilter] = useState("all");
  const [editingId, setEditingId] = useState(null);
  const [selectedChallan, setSelectedChallan] = useState(null);
  const [podModal, setPodModal] = useState({ type: "", record: null });
  const [podForm, setPodForm] = useState(createPodFormState);
  const [podAuditEntries, setPodAuditEntries] = useState([]);
  const [podAuditLoading, setPodAuditLoading] = useState(false);
  const [podActionLoading, setPodActionLoading] = useState(false);
  const [podActionError, setPodActionError] = useState("");
  const settings = useSettings();
  const company = settings?.company || {};
  const companyLogo = resolveBrandLogo(company.logo || "");
  const companyName = company.name || "Bangalore Electronics";
  const profileName = settings?.profile?.fullName || "Current user";
  const profileRole = settings?.profile?.role || "Viewer";
  const isPodReviewer = isPodReviewerRole(profileRole);

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
  const loadPurchaseOrders = async () => {
    try {
      const list = await fetchPurchaseOrders();
      setPurchaseOrders(Array.isArray(list) ? list : []);
    } catch {
      setPurchaseOrders([]);
    }
  };
  const loadReceipts = async (projectId = null) => {
    if (!projectId) {
      setReceipts([]);
      setReceiptError("");
      setReceiptsLoading(false);
      return;
    }
    try {
      setReceiptsLoading(true);
      const list = await fetchReceiveGoods({ projectId: Number(projectId) });
      setReceipts(Array.isArray(list) ? list : []);
      setReceiptError("");
    } catch (error) {
      setReceipts([]);
      setReceiptError(
        error?.response?.data?.error ||
          error?.message ||
          "Could not load receive receipts."
      );
    } finally {
      setReceiptsLoading(false);
    }
  };

  const loadNextDcNumber = async () => {
    try {
      const nextNumber = await fetchNextDeliveryChallanNumber();
      if (nextNumber) {
        setForm((prev) =>
          editingId || String(prev.dcNumber).trim()
            ? prev
            : { ...prev, dcNumber: nextNumber }
        );
      }
    } catch {
      // Keep manual input fallback if auto-number API fails.
    }
  };

  useEffect(() => {
    void loadRecords();
    void loadLocations();
    void loadPurchaseOrders();
    void loadNextDcNumber();
  }, []);

  useEffect(() => {
    void loadReceipts(form.projectId || null);
  }, [form.projectId]);

  useEffect(() => {
    const refreshRecords = () => {
      void loadRecords();
    };
    const refreshLocations = () => {
      void loadLocations();
    };
    const refreshProjects = () => {
      setProjects(getProjects());
    };
    const refreshPurchaseOrders = () => {
      void loadPurchaseOrders();
    };
    const refreshReceipts = () => {
      void loadReceipts(form.projectId || null);
    };
    const refreshNumber = () => {
      void loadNextDcNumber();
    };

    window.addEventListener("delivery-challans:changed", refreshRecords);
    window.addEventListener("consumptions:changed", refreshRecords);
    window.addEventListener("locations:changed", refreshLocations);
    window.addEventListener("projects:changed", refreshProjects);
    window.addEventListener("purchase-orders:changed", refreshPurchaseOrders);
    window.addEventListener("receive-goods:changed", refreshReceipts);
    window.addEventListener("delivery-challans:changed", refreshNumber);
    return () => {
      window.removeEventListener("delivery-challans:changed", refreshRecords);
      window.removeEventListener("consumptions:changed", refreshRecords);
      window.removeEventListener("locations:changed", refreshLocations);
      window.removeEventListener("projects:changed", refreshProjects);
      window.removeEventListener("purchase-orders:changed", refreshPurchaseOrders);
      window.removeEventListener("receive-goods:changed", refreshReceipts);
      window.removeEventListener("delivery-challans:changed", refreshNumber);
    };
  }, [form.projectId]);

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
    if (editingId || !form.projectId || form.toLocationId || form.toLocation) {
      return;
    }
    const preferredLocation = locations.find(
      (location) => String(location.projectId) === String(form.projectId)
    );
    if (!preferredLocation) {
      return;
    }
    setForm((prev) => ({
      ...prev,
      toLocationId: String(preferredLocation.id),
      toLocation: preferredLocation.name || prev.toLocation,
    }));
  }, [editingId, form.projectId, form.toLocation, form.toLocationId, locations]);

  useEffect(() => {
    if (!form.toLocationId) {
      return;
    }
    const selectedLocation = locations.find(
      (location) => String(location.id) === String(form.toLocationId)
    );
    if (!selectedLocation) {
      return;
    }
    setForm((prev) =>
      prev.toLocation === selectedLocation.name
        ? prev
        : {
            ...prev,
            toLocation: selectedLocation.name || prev.toLocation,
          }
    );
  }, [form.toLocationId, locations]);

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

  const purchaseOrderMap = useMemo(
    () =>
      purchaseOrders.reduce((acc, purchaseOrder) => {
        acc[String(purchaseOrder.id)] = purchaseOrder;
        return acc;
      }, {}),
    [purchaseOrders]
  );

  const receiptMap = useMemo(() => {
    return receipts.reduce((acc, receipt) => {
      acc[String(receipt.id)] = receipt;
      return acc;
    }, {});
  }, [receipts]);

  const receiptItemToReceiptIdMap = useMemo(() => {
    return receipts.reduce((acc, receipt) => {
      (receipt.items || []).forEach((item) => {
        const itemId = String(
          item.receiveGoodsItemId ?? item.ReceiveGoodsItemId ?? item.id ?? ""
        );
        if (!itemId) {
          return;
        }
        acc[itemId] = String(receipt.id);
      });
      return acc;
    }, {});
  }, [receipts]);

  const destinationLocations = useMemo(() => {
    if (!form.projectId) {
      return locations;
    }
    const linkedLocations = locations.filter(
      (location) => String(location.projectId) === String(form.projectId)
    );
    if (!linkedLocations.length) {
      return locations;
    }
    const linkedIds = new Set(linkedLocations.map((location) => String(location.id)));
    return [
      ...linkedLocations,
      ...locations.filter((location) => !linkedIds.has(String(location.id))),
    ];
  }, [locations, form.projectId]);

  const receiptsForSelection = useMemo(() => {
    if (!form.projectId) {
      return receipts;
    }
    return receipts.filter(
      (receipt) => String(receipt.projectId) === String(form.projectId)
    );
  }, [receipts, form.projectId]);

  const filteredReceiptsForSelection = useMemo(() => {
    const searchText = normalizeLookupText(receiptFilters.search);
    if (!searchText) {
      return receiptsForSelection;
    }
    return receiptsForSelection.filter((receipt) => {
      const reference = normalizeLookupText(getReceiptReference(receipt));
      const poNumber = normalizeLookupText(
        purchaseOrderMap[String(receipt.purchaseOrderId)]?.poNumber ||
          `PO-${receipt.purchaseOrderId || ""}`
      );
      return reference.includes(searchText) || poNumber.includes(searchText);
    });
  }, [purchaseOrderMap, receiptFilters, receiptsForSelection]);

  const getReceiptPurchaseOrderNumber = useCallback(
    (receipt = {}) =>
      purchaseOrderMap[String(receipt.purchaseOrderId)]?.poNumber ||
      receipt.poNumber ||
      receipt.PONumber ||
      (receipt.purchaseOrderId ? `PO-${receipt.purchaseOrderId}` : "-"),
    [purchaseOrderMap]
  );

  const getReceiptItemCount = useCallback(
    (receipt = {}) => (Array.isArray(receipt.items) ? receipt.items.length : 0),
    []
  );

  const getReceiptTotalQuantity = useCallback(
    (receipt = {}) =>
      (receipt.items || []).reduce(
        (sum, item) => sum + getReceiptItemReceivedQty(item),
        0
      ),
    []
  );

  const selectedReceipts = useMemo(
    () =>
      selectedReceiptIds
        .map((receiptId) => receiptMap[String(receiptId)])
        .filter(Boolean),
    [receiptMap, selectedReceiptIds]
  );

  const selectableFilteredReceiptIds = useMemo(() => {
    return filteredReceiptsForSelection.map((receipt) => String(receipt.id));
  }, [filteredReceiptsForSelection]);

  const deliveredQtyByReceiptItem = useMemo(() => {
    return records.reduce((acc, record) => {
      if (editingId && String(record.id) === String(editingId)) {
        return acc;
      }
      (record.items || []).forEach((item) => {
        const receiptItemId = Number.parseInt(
          item.receiveGoodsItemId ?? item.ReceiveGoodsItemId ?? "",
          10
        );
        if (!Number.isFinite(receiptItemId) || receiptItemId <= 0) {
          return;
        }
        const deliveredQty = Number(item.quantity ?? item.Quantity ?? 0) || 0;
        if (deliveredQty <= 0) {
          return;
        }
        acc.set(receiptItemId, (acc.get(receiptItemId) ?? 0) + deliveredQty);
      });
      return acc;
    }, new Map());
  }, [editingId, records]);

  const getRemainingReceiptItemQty = useCallback((item = {}) => {
    const receiptQty = getReceiptItemReceivedQty(item);
    const hintedAvailableQty = getReceiptItemAvailableQty(item);
    const receiptItemId = Number.parseInt(
      item.receiveGoodsItemId ?? item.ReceiveGoodsItemId ?? item.id ?? "",
      10
    );
    const alreadyDelivered =
      Number.isFinite(receiptItemId) && receiptItemId > 0
        ? deliveredQtyByReceiptItem.get(receiptItemId) ?? 0
        : 0;
    const remainingFromHistory = Math.max(receiptQty - alreadyDelivered, 0);
    return Math.max(0, Math.min(hintedAvailableQty, remainingFromHistory));
  }, [deliveredQtyByReceiptItem]);

  const selectedReceiptItems = useMemo(() => {
    return selectedReceipts.flatMap((receipt) =>
      mapReceiptItemsToChallanItems(receipt, (item) => getRemainingReceiptItemQty(item))
    );
  }, [getRemainingReceiptItemQty, selectedReceipts]);

  const selectedReceiptsSummary = useMemo(
    () => ({
      receipts: selectedReceipts.length,
      items: selectedReceipts.reduce(
        (sum, receipt) => sum + getReceiptItemCount(receipt),
        0
      ),
      quantity: selectedReceipts.reduce(
        (sum, receipt) => sum + getReceiptTotalQuantity(receipt),
        0
      ),
    }),
    [getReceiptItemCount, getReceiptTotalQuantity, selectedReceipts]
  );

  const loadedReceiptsSummary = useMemo(() => {
    const loadedIds = new Set(loadedReceiptIds.map((id) => String(id)));
    const loadedReceipts = receipts.filter((receipt) =>
      loadedIds.has(String(receipt.id))
    );
    return {
      receipts: loadedReceipts.length,
      items: items.length,
      quantity: items.reduce((sum, item) => sum + toQuantity(item.quantity), 0),
    };
  }, [items, loadedReceiptIds, receipts]);

  const formatReceiptReference = (value) => {
    if (Array.isArray(value)) {
      const refs = value
        .map((entry) => formatReceiptReference(entry))
        .filter((entry) => entry && entry !== "-");
      if (!refs.length) {
        return "-";
      }
      if (refs.length <= 2) {
        return refs.join(", ");
      }
      return `${refs.slice(0, 2).join(", ")} +${refs.length - 2} more`;
    }
    if (value === null || value === undefined || value === "") {
      return "-";
    }
    const receipt = receiptMap[String(value)] ?? null;
    if (receipt) {
      return buildReceiptReferenceLabel(
        receipt,
        projectMap[String(receipt.projectId)]?.name || ""
      );
    }
    const numeric = Number(value);
    return Number.isFinite(numeric)
      ? `RG-${String(numeric).padStart(3, "0")}`
      : String(value);
  };

  useEffect(() => {
    if (!receipts.length) {
      return;
    }
    setSelectedReceiptIds((prev) =>
      prev.filter((receiptId) => Boolean(receiptMap[String(receiptId)]))
    );
  }, [receiptMap, receipts.length]);

  useEffect(() => {
    if (editingId) {
      return;
    }
    setLoadedReceiptIds((prev) =>
      prev.filter((receiptId) => selectedReceiptIds.includes(String(receiptId)))
    );
  }, [editingId, selectedReceiptIds]);

  const resetForm = () => {
    setForm(createFormState());
    setItems([]);
    setLoadedReceiptIds([]);
    setReceiptFilters({
      search: "",
    });
    setSelectedReceiptIds([]);
    setErrors({});
    setReceiptError("");
    setEditingId(null);
    void loadNextDcNumber();
  };

  useEffect(() => {
    const preselectedIds = normalizePreselectedReceiptIds(
      location.state?.preselectedReceiveGoodsIds
    );
    const preselectedProjectId = String(
      location.state?.preselectedProjectId ?? ""
    ).trim();
    const preselectedFromLocationId = String(
      location.state?.preselectedFromLocationId ?? ""
    ).trim();
    if (!preselectedIds.length) {
      return;
    }

    const signature = `${location.key}:${preselectedIds.join(",")}`;
    if (prefillSignatureRef.current === signature) {
      return;
    }
    prefillSignatureRef.current = signature;

    setEditingId(null);
    setErrors({});
    setReceiptError("");
    setReceiptFilters({
      search: "",
    });
    setForm((prev) => ({
      ...prev,
      projectId: preselectedProjectId || prev.projectId,
      fromLocationId: preselectedFromLocationId || prev.fromLocationId,
    }));
    setSelectedReceiptIds(preselectedIds);
  }, [location.key, location.state]);

  const validate = () => {
    const nextErrors = {};
    if (!form.dcNumber.trim()) {
      nextErrors.dcNumber = "DC number is required.";
    }
    if (!form.projectId) {
      nextErrors.projectId = "Select a project.";
    }
    if (!form.fromLocationId) {
      nextErrors.fromLocationId = "Select source.";
    }
    if (!form.toLocationId && !form.toLocation.trim()) {
      nextErrors.toLocationId = "Select destination.";
    }

    const validItems = items.filter(
      (item) => item.name.trim() && Number(item.quantity) > 0
    );
    if (!validItems.length) {
      nextErrors.items = "Add at least one line item.";
    }

    const invalidQuantityItem = validItems.find((item) => {
      const itemAvailableQty = getReceiptItemAvailableQty(item);
      const quantity = Number(item.quantity) || 0;
      return quantity > itemAvailableQty;
    });
    if (invalidQuantityItem) {
      nextErrors.items = `DC quantity for ${invalidQuantityItem.name || "an item"} cannot exceed available quantity (${getReceiptItemAvailableQty(invalidQuantityItem)}).`;
    }

    const aggregatedItems = validItems.reduce((map, item) => {
      const normalizedName = String(item.name ?? item.ItemName ?? item.item ?? item.Item ?? "")
        .trim()
        .toLowerCase();
      const normalizedUnit = String(item.unit ?? item.Unit ?? "PCS")
        .trim()
        .toLowerCase() || "pcs";
      const materialKey = `${normalizedName}::${normalizedUnit}`;
      const key =
        item.receiveGoodsItemId ??
        item.poItemId ??
        item.itemId ??
        materialKey;
      const quantity = Number(item.quantity) || 0;
      const availableQty = getReceiptItemAvailableQty(item);
      const existing = map.get(key) || {
        name: item.name || "an item",
        quantity: 0,
        availableQty,
      };
      existing.quantity += quantity;
      existing.availableQty = Math.max(existing.availableQty, availableQty);
      map.set(key, existing);
      return map;
    }, new Map());

    const duplicateExceeded = Array.from(aggregatedItems.values()).find(
      (group) => group.quantity > group.availableQty
    );
    if (duplicateExceeded) {
      nextErrors.items = `Total DC quantity for ${duplicateExceeded.name || "an item"} cannot exceed available quantity (${duplicateExceeded.availableQty}).`;
    }
    if (!nextErrors.items && selectedReceiptIds.length && !loadedReceiptIds.length) {
      nextErrors.items = "Please load selected receipts before saving the delivery challan.";
    }
    if (
      !nextErrors.items &&
      loadedReceiptIds.length &&
      !areReceiptSelectionsEqual(selectedReceiptIds, loadedReceiptIds)
    ) {
      nextErrors.items =
        "Receipt selection changed after loading. Load selected receipts again before saving.";
    }

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setReceiptError("");
    if (!validate()) {
      console.debug("Delivery challan validation failed", {
        items,
        selectedReceiptIds,
        loadedReceiptIds,
      });
      return;
    }

    const cleanedItems = items
      .map((item) => ({
        ...item,
        name: String(item.name ?? "").trim(),
        hsn: String(item.hsn ?? "").trim(),
        gst: String(item.gst ?? "").trim(),
        quantity: Number(item.quantity) || 0,
        rate: Number(item.rate) || 0,
      }))
      .filter((item) => item.name && Number(item.quantity) > 0);

    const receiptIdsForPayload = loadedReceiptIds.length
      ? loadedReceiptIds
      : selectedReceiptIds;

    const payload = {
      dcNumber: String(form.dcNumber ?? "").trim(),
      projectId: parseNumberValue(form.projectId),
      receiveGoodsId: parseNumberValue(form.receiveGoodsId),
      receiveGoodsIds: receiptIdsForPayload
        .map((receiptId) => parseNumberValue(receiptId))
        .filter((receiptId) => receiptId !== null && receiptId > 0),
      fromLocationId: parseNumberValue(form.fromLocationId),
      toLocationId: parseNumberValue(form.toLocationId),
      toLocation: String(form.toLocation ?? "").trim(),
      vehicleNumber: String(form.vehicleNumber ?? "").trim() || null,
      eWayBillNumber: String(form.eWayBillNumber ?? "").trim() || null,
      issueDate: String(form.issueDate ?? "").trim() || null,
      status: String(form.status ?? "Draft").trim(),
      podStatus: POD_STATUS.PENDING,
      podReference: null,
      podDate: null,
      notes: String(form.notes ?? "").trim() || null,
      auditBy: profileName,
      auditRole: profileRole,
      items: cleanedItems,
    };

    console.debug("Delivery challan submit payload", payload);
    cleanedItems.forEach((item, index) => {
      console.debug(`Item ${index + 1}:`, {
        name: item.name,
        receiveGoodsItemId: item.receiveGoodsItemId,
        poItemId: item.poItemId,
        itemId: item.itemId,
        availableQty: item.availableQty,
        enteredQuantity: item.quantity,
        rate: item.rate,
      });
    });

    try {
      let savedChallan;
      if (editingId) {
        savedChallan = await updateDeliveryChallan(editingId, payload);
      } else {
        savedChallan = await createDeliveryChallan(payload);
      }
      await loadRecords();
      resetForm();
      setUpdateProof(
        `${editingId ? "Delivery challan updated" : "Delivery challan saved"}: ${
          savedChallan?.dcNumber || payload.dcNumber || "-"
        } | Status: ${savedChallan?.podStatus || savedChallan?.status || payload.podStatus || "Pending"}`
      );
    } catch (error) {
      const apiErrorMessage =
        error?.response?.data?.error ||
        error?.response?.data?.message ||
        error?.message ||
        "Failed to save delivery challan.";
      setReceiptError(apiErrorMessage);
      console.error("Failed to save delivery challan:", error);
    }
  };

  const handleEdit = (record) => {
    if (
      normalizePodStatus(record?.podStatus) === POD_STATUS.VERIFIED &&
      !isPodReviewer
    ) {
      setReceiptError("POD verified challans are locked for non-manager edits.");
      return;
    }
    const matchedToLocation =
      (record.toLocationId && locationMap[String(record.toLocationId)]) ||
      locations.find(
        (location) =>
          String(location.name || "").trim().toLowerCase() ===
          String(record.toLocation || "").trim().toLowerCase()
      ) ||
      null;
    setEditingId(record.id);
    setForm({
      dcNumber: record.dcNumber || "",
      projectId: record.projectId || "",
      receiveGoodsId: record.receiveGoodsId ? String(record.receiveGoodsId) : "",
      fromLocationId: record.fromLocationId || "",
      toLocationId: matchedToLocation ? String(matchedToLocation.id) : "",
      toLocation: matchedToLocation?.name || record.toLocation || "",
      vehicleNumber: record.vehicleNumber || "",
      eWayBillNumber: record.eWayBillNumber || "",
      issueDate: record.issueDate || new Date().toISOString().slice(0, 10),
      status: record.status || "Draft",
      podStatus: normalizePodStatus(record.podStatus),
      podReference: record.podReference || "",
      podDate: record.podDate || "",
      notes: record.notes || "",
    });
    setItems(record.items?.length ? record.items : [createLineItem()]);
    const recordReceiptIds = Array.from(
      new Set([
        ...(Array.isArray(record.receiveGoodsIds) ? record.receiveGoodsIds : []),
        ...(record.receiveGoodsId ? [record.receiveGoodsId] : []),
        ...(record.items || [])
          .map((item) => {
            const linkedItemId = String(
              item.receiveGoodsItemId ?? item.ReceiveGoodsItemId ?? ""
            );
            return linkedItemId ? receiptItemToReceiptIdMap[linkedItemId] : null;
          })
          .filter(Boolean),
      ])
    ).map((value) => String(value));
    setSelectedReceiptIds(recordReceiptIds);
    setLoadedReceiptIds(recordReceiptIds);
    setErrors({});
    setReceiptFilters((prev) => ({
      ...prev,
      search: "",
    }));
  };

  const handleDelete = async (id) => {
    try {
      await deleteDeliveryChallan(id);
      await loadRecords();
    } catch (error) {
      console.error("Failed to delete delivery challan:", error);
    }
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

  const filteredRecords = useMemo(() => {
    if (dcStatusFilter === "all") {
      return records;
    }
    return records.filter(
      (record) =>
        getDeliveryChallanRegisterStatus(record).toLowerCase() === dcStatusFilter
    );
  }, [dcStatusFilter, records]);

  const handlePrint = async (record) => {
    if (!record) return;
    setSelectedChallan(record);
    window.setTimeout(() => {
      void printSection({
        selector: "#delivery-challan-print-area",
        title: "Delivery Challan",
        subtitle: record.dcNumber || "Dispatch copy",
        logoUrl: company.logo || "",
        brandName: companyName,
        brandDescription: company.address || "Company address",
      });
    }, 80);
  };

  const handleViewChallan = (record) => {
    if (!record) return;
    setSelectedChallan(record);
  };

  const closePodModal = () => {
    setPodModal({ type: "", record: null });
    setPodForm(createPodFormState());
    setPodAuditEntries([]);
    setPodAuditLoading(false);
    setPodActionError("");
  };

  const openPodUploadModal = (record) => {
    setPodModal({ type: "upload", record });
    setPodForm({
      ...createPodFormState(),
      reference: record?.podReference || "",
      podDate: record?.podDate ? String(record.podDate).slice(0, 16) : "",
    });
    setPodActionError("");
  };

  const openPodDetailsModal = async (record, type = "details") => {
    setPodModal({ type, record });
    setPodForm(createPodFormState());
    setPodActionError("");
    if (
      type === "details" &&
      record?.id &&
      record.podDocumentName &&
      !record.podDocumentData
    ) {
      try {
        setPodActionLoading(true);
        const freshRecord = await fetchDeliveryChallan(record.id);
        setPodModal((prev) =>
          prev.type === type && String(prev.record?.id) === String(record.id)
            ? { ...prev, record: { ...record, ...freshRecord } }
            : prev
        );
      } catch (error) {
        setPodActionError(
          error?.response?.data?.error ||
            error?.message ||
            "Failed to load POD document."
        );
      } finally {
        setPodActionLoading(false);
      }
    }
  };

  const openPodActionModal = (record, type) => {
    if (!isPodReviewer) {
      setReceiptError("Only Admin or Manager users can approve POD workflow actions.");
      return;
    }
    setPodModal({ type, record });
    setPodForm(createPodFormState());
    setPodActionError("");
  };

  const openPodAuditModal = async (record) => {
    setPodModal({ type: "audit", record });
    setPodForm(createPodFormState());
    setPodActionError("");
    setPodAuditEntries([]);
    if (!record?.id) {
      return;
    }
    try {
      setPodAuditLoading(true);
      const entries = await fetchDeliveryChallanPodAudit(record.id);
      setPodAuditEntries(Array.isArray(entries) ? entries : []);
    } catch (error) {
      setPodActionError(
        error?.response?.data?.error ||
          error?.message ||
          "Failed to load POD audit log."
      );
    } finally {
      setPodAuditLoading(false);
    }
  };

  const handlePodFileChange = async (event) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    if (file.size > POD_UPLOAD_LIMIT_BYTES) {
      setPodActionError("POD file must be 5 MB or smaller.");
      event.target.value = "";
      return;
    }
    try {
      setPodActionError("");
      const fileData = await readFileAsDataUrl(file);
      setPodForm((prev) => ({
        ...prev,
        fileName: file.name,
        fileType: file.type || "application/octet-stream",
        fileSize: file.size,
        fileData,
      }));
    } catch (error) {
      setPodActionError(error?.message || "Failed to read POD file.");
    }
  };

  const syncPodRecord = (updatedChallan) => {
    if (!updatedChallan?.id) {
      return;
    }
    if (selectedChallan && String(selectedChallan.id) === String(updatedChallan.id)) {
      setSelectedChallan(updatedChallan);
    }
  };

  const handlePodUploadSubmit = async (event) => {
    event.preventDefault();
    const record = podModal.record;
    if (!record?.id) {
      return;
    }
    if (!podForm.fileData || !podForm.fileName) {
      setPodActionError("Upload a POD document before saving.");
      return;
    }
    try {
      setPodActionLoading(true);
      setPodActionError("");
      const updatedChallan = await uploadDeliveryChallanPod(record.id, {
        podReference: podForm.reference.trim() || null,
        podDate: podForm.podDate || null,
        remarks: podForm.remarks.trim() || null,
        fileName: podForm.fileName,
        fileType: podForm.fileType,
        fileSize: podForm.fileSize,
        fileData: podForm.fileData,
        auditBy: profileName,
        auditRole: profileRole,
      });
      await loadRecords();
      syncPodRecord(updatedChallan);
      setUpdateProof(
        `POD uploaded: ${updatedChallan?.dcNumber || record.dcNumber || "-"}`
      );
      closePodModal();
    } catch (error) {
      setPodActionError(
        error?.response?.data?.error || error?.message || "Failed to upload POD."
      );
    } finally {
      setPodActionLoading(false);
    }
  };

  const handlePodActionSubmit = async (event) => {
    event.preventDefault();
    const record = podModal.record;
    const action = podModal.type;
    if (!record?.id || !action) {
      return;
    }
    const remarks = podForm.remarks.trim();
    const needsRemarks = ["reject", "dispute", "waive", "resolve"].includes(action);
    if (needsRemarks && !remarks) {
      setPodActionError("Remarks are required for this POD action.");
      return;
    }
    try {
      setPodActionLoading(true);
      setPodActionError("");
      const updatedChallan = await updateDeliveryChallanPodStatus(record.id, {
        action,
        remarks: remarks || null,
        auditBy: profileName,
        auditRole: profileRole,
      });
      await loadRecords();
      syncPodRecord(updatedChallan);
      setUpdateProof(
        `POD updated: ${updatedChallan?.dcNumber || record.dcNumber || "-"} | ${getPodStatusLabel(updatedChallan?.podStatus)}`
      );
      closePodModal();
    } catch (error) {
      setPodActionError(
        error?.response?.data?.error ||
          error?.message ||
          "Failed to update POD workflow."
      );
    } finally {
      setPodActionLoading(false);
    }
  };

  const handleProjectChange = (nextProjectId) => {
    const preferredLocation =
      locations.find(
        (location) => String(location.projectId) === String(nextProjectId)
      ) || null;

    setForm((prev) => ({
      ...prev,
      projectId: nextProjectId,
      receiveGoodsId: "",
      toLocationId: preferredLocation ? String(preferredLocation.id) : "",
      toLocation: preferredLocation?.name || "",
    }));
    setReceiptFilters((prev) => ({
      ...prev,
      search: "",
    }));
    setSelectedReceiptIds([]);
    setLoadedReceiptIds([]);
    setItems([]);
    setReceiptError("");
  };

  const handleToLocationChange = (nextLocationId) => {
    const selectedLocation =
      locations.find((location) => String(location.id) === String(nextLocationId)) || null;

    setForm((prev) => ({
      ...prev,
      toLocationId: nextLocationId,
      toLocation: selectedLocation?.name || "",
    }));
  };

  const handleReceiptFilterChange = (value) => {
    setReceiptFilters((prev) => ({
      ...prev,
      search: value,
    }));
  };

  const toggleReceiptSelection = (receiptId) => {
    const receipt = receiptMap[String(receiptId)];
    if (!receipt) {
      return;
    }
    setReceiptError("");
    setSelectedReceiptIds((prev) =>
      prev.includes(String(receiptId))
        ? prev.filter((id) => id !== String(receiptId))
        : [...prev, String(receiptId)]
    );
  };

  const toggleAllFilteredReceipts = () => {
    const selectableReceiptIds = selectableFilteredReceiptIds;
    if (!selectableReceiptIds.length) {
      return;
    }
    setReceiptError("");
    setSelectedReceiptIds((prev) => {
      const allSelected = selectableReceiptIds.every((id) => prev.includes(id));
      if (allSelected) {
        return prev.filter((id) => !selectableReceiptIds.includes(id));
      }
      return Array.from(new Set([...prev, ...selectableReceiptIds]));
    });
  };

  const handleLoadSelectedReceipts = () => {
    if (!selectedReceipts.length) {
      setItems([]);
      setLoadedReceiptIds([]);
      setForm((prev) => ({
        ...prev,
        receiveGoodsId: "",
        fromLocationId: "",
      }));
      return;
    }
    const selectedLocationIds = Array.from(
      new Set(
        selectedReceipts
          .map((receipt) => {
            const linkedPurchaseOrder =
              purchaseOrderMap[String(receipt.purchaseOrderId)] || null;
            return String(
              receipt.locationId ?? linkedPurchaseOrder?.locationId ?? ""
            ).trim();
          })
          .filter(Boolean)
      )
    );
    if (selectedLocationIds.length > 1) {
      setReceiptError("Selected receipts must come from the same source location.");
      return;
    }
    const nextItems = selectedReceiptItems.length ? selectedReceiptItems : [];
    if (!nextItems.length) {
      setReceiptError("Selected receipts do not have items with available quantity.");
      return;
    }
    const primaryReceipt = selectedReceipts[0];
    const primaryPurchaseOrder =
      purchaseOrderMap[String(primaryReceipt?.purchaseOrderId)] || null;
    const nextProjectId =
      primaryReceipt?.projectId
        ? String(primaryReceipt.projectId)
        : primaryPurchaseOrder?.projectId
        ? String(primaryPurchaseOrder.projectId)
        : "";
    const nextFromLocationId =
      primaryReceipt?.locationId
        ? String(primaryReceipt.locationId)
        : primaryPurchaseOrder?.locationId
        ? String(primaryPurchaseOrder.locationId)
        : "";
    setItems(
      nextItems.map((item) => ({
        ...item,
        quantity: Number(item.quantity ?? item.availableQty ?? 0) || 0,
      }))
    );
    setLoadedReceiptIds([...selectedReceiptIds]);
    setForm((prev) => {
      const currentDestination = locations.find(
        (location) => String(location.id) === String(prev.toLocationId)
      );
      const projectPreferredLocation =
        resolveProjectPreferredLocation(locations, nextProjectId) ||
        resolveProjectPreferredLocation(locations, prev.projectId);
      const resolvedToLocation =
        currentDestination &&
        (!nextProjectId ||
          String(currentDestination.projectId ?? "") === String(nextProjectId))
          ? currentDestination
          : projectPreferredLocation;

      return {
        ...prev,
        receiveGoodsId: primaryReceipt?.id ? String(primaryReceipt.id) : "",
        projectId: nextProjectId || prev.projectId,
        fromLocationId: nextFromLocationId,
        toLocationId: resolvedToLocation ? String(resolvedToLocation.id) : "",
        toLocation: resolvedToLocation?.name || "",
      };
    });
    setReceiptError("");
  };

  const handleLineItemQuantityChange = (itemId, nextValue) => {
    const parsed = Number(nextValue);
    const safeValue = Number.isFinite(parsed) ? parsed : 0;
    setItems((prev) =>
      prev.map((item) => {
        if (String(item.id) !== String(itemId)) {
          return item;
        }
        const availableQty = Number(item.availableQty ?? 0) || 0;
        const clamped = Math.max(0, Math.min(safeValue, availableQty));
        return {
          ...item,
          quantity: clamped,
        };
      })
    );
  };

  const handleRemoveLineItem = (itemId) => {
    setItems((prev) => prev.filter((item) => String(item.id) !== String(itemId)));
  };

  const allFilteredReceiptsSelected =
    selectableFilteredReceiptIds.length > 0 &&
    selectableFilteredReceiptIds.every((receiptId) =>
      selectedReceiptIds.includes(receiptId)
    );

  const podButtonClass =
    "inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-700 hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60";
  const podDangerButtonClass =
    "inline-flex items-center gap-1 rounded-md border border-rose-200 bg-rose-50 px-2 py-1 text-[11px] font-medium text-rose-700 hover:border-rose-300 hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60";
  const podSuccessButtonClass =
    "inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-[11px] font-medium text-emerald-700 hover:border-emerald-300 hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-60";

  const renderPodWorkflowCell = (record) => {
    const status = normalizePodStatus(record.podStatus);
    const timestamp = getPodTimestamp(record);
    const actor = getPodActor(record);
    const canUpload = [POD_STATUS.PENDING, POD_STATUS.REJECTED].includes(status);
    const canReview = isPodReviewer && [
      POD_STATUS.UPLOADED,
      POD_STATUS.UNDER_VERIFICATION,
    ].includes(status);
    const hasDocument = Boolean(record.podDocumentData || record.podDocumentName);

    return (
      <div className="min-w-[240px] space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${podStatusTone(
              status
            )}`}
          >
            {getPodStatusLabel(status)}
          </span>
        </div>
        {timestamp && timestamp !== "-" ? (
          <p className="text-[11px] text-slate-500">{formatDateTime(timestamp)}</p>
        ) : null}
        {status === POD_STATUS.VERIFIED && actor ? (
          <p className="text-[11px] text-slate-500">Verified by {actor}</p>
        ) : null}
        {status === POD_STATUS.WAIVED ? (
          <p className="text-[11px] text-slate-500">
            {[record.podWaiverApprovedBy || record.podWaivedBy, record.podWaiverReason]
              .filter(Boolean)
              .join(" | ")}
          </p>
        ) : null}
        <div className="flex flex-wrap gap-1.5">
          {canUpload ? (
            <button
              type="button"
              onClick={() => openPodUploadModal(record)}
              className={podButtonClass}
              title={status === POD_STATUS.REJECTED ? "Re-upload POD" : "Upload POD"}
            >
              {status === POD_STATUS.REJECTED ? (
                <RefreshCw className="h-3.5 w-3.5" />
              ) : (
                <UploadCloud className="h-3.5 w-3.5" />
              )}
              {status === POD_STATUS.REJECTED ? "Re-upload POD" : "Upload POD"}
            </button>
          ) : null}
          {status === POD_STATUS.PENDING && isPodReviewer ? (
            <button
              type="button"
              onClick={() => openPodActionModal(record, "waive")}
              className={podButtonClass}
              title="Waive POD"
            >
              <Ban className="h-3.5 w-3.5" />
              Waive
            </button>
          ) : null}
          {hasDocument &&
          [
            POD_STATUS.UPLOADED,
            POD_STATUS.UNDER_VERIFICATION,
            POD_STATUS.VERIFIED,
          ].includes(status) ? (
            <button
              type="button"
              onClick={() => openPodDetailsModal(record, "details")}
              className={podButtonClass}
              title="View POD"
            >
              <Eye className="h-3.5 w-3.5" />
              View POD
            </button>
          ) : null}
          {canReview ? (
            <>
              <button
                type="button"
                onClick={() => openPodActionModal(record, "verify")}
                className={podSuccessButtonClass}
                title="Verify POD"
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
                Verify
              </button>
              <button
                type="button"
                onClick={() => openPodActionModal(record, "reject")}
                className={podDangerButtonClass}
                title="Reject POD"
              >
                <XCircle className="h-3.5 w-3.5" />
                Reject
              </button>
              <button
                type="button"
                onClick={() => openPodActionModal(record, "dispute")}
                className={podButtonClass}
                title="Dispute POD"
              >
                <AlertTriangle className="h-3.5 w-3.5" />
                Dispute
              </button>
            </>
          ) : null}
          {status === POD_STATUS.REJECTED ? (
            <button
              type="button"
              onClick={() => openPodDetailsModal(record, "reason")}
              className={podDangerButtonClass}
              title="View rejection reason"
            >
              <FileCheck2 className="h-3.5 w-3.5" />
              View Reason
            </button>
          ) : null}
          {status === POD_STATUS.DISPUTED ? (
            <>
              <button
                type="button"
                onClick={() => openPodDetailsModal(record, "issue")}
                className={podButtonClass}
                title="View dispute issue"
              >
                <AlertTriangle className="h-3.5 w-3.5" />
                View Issue
              </button>
              {isPodReviewer ? (
                <button
                  type="button"
                  onClick={() => openPodActionModal(record, "resolve")}
                  className={podSuccessButtonClass}
                  title="Resolve POD dispute"
                >
                  <ShieldCheck className="h-3.5 w-3.5" />
                  Resolve
                </button>
              ) : null}
            </>
          ) : null}
          {status === POD_STATUS.WAIVED ? (
            <button
              type="button"
              onClick={() => openPodDetailsModal(record, "approval")}
              className={podButtonClass}
              title="View waiver approval"
            >
              <ShieldCheck className="h-3.5 w-3.5" />
              View Approval
            </button>
          ) : null}
          {[POD_STATUS.VERIFIED, POD_STATUS.WAIVED].includes(status) ? (
            <button
              type="button"
              onClick={() => openPodAuditModal(record)}
              className={podButtonClass}
              title="View POD audit log"
            >
              <History className="h-3.5 w-3.5" />
              Audit Log
            </button>
          ) : null}
        </div>
      </div>
    );
  };

  const selectedProject = selectedChallan
    ? projectMap[String(selectedChallan.projectId)] || {}
    : {};
  const selectedFromLocation = selectedChallan
    ? locationMap[String(selectedChallan.fromLocationId)] || {}
    : {};
  const selectedToLocation = selectedChallan
    ? locationMap[String(selectedChallan.toLocationId)] || {}
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

      {updateProof && (
        <div className="mb-4 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {updateProof}
        </div>
      )}

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
                readOnly
                placeholder="Auto-generated by system"
                className="w-full mt-1 border border-slate-200 rounded-lg bg-slate-100 px-3 py-2"
              />
              <p className="text-xs text-slate-500 mt-1">
                The system assigns a DC number automatically and it cannot be edited.
              </p>
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
                  handleProjectChange(event.target.value);
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
                From *
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
                <option value="">Select source</option>
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
                To *
              </label>
              <select
                value={form.toLocationId}
                onChange={(event) => {
                  handleToLocationChange(event.target.value);
                }}
                className="w-full mt-1 border border-slate-200 rounded-lg px-3 py-2"
              >
                <option value="">
                  {destinationLocations.length
                    ? "Select destination"
                    : "No destinations available"}
                </option>
                {destinationLocations.map((location) => (
                  <option key={location.id} value={location.id}>
                    {location.name}
                    {location.projectId &&
                    String(location.projectId) === String(form.projectId)
                      ? " | Project site"
                      : ""}
                  </option>
                ))}
              </select>
              {form.toLocation ? (
                <p className="mt-1 text-xs text-slate-500">
                  To site: {form.toLocation}
                </p>
              ) : null}
              {errors.toLocationId && (
                <p className="text-xs text-red-600 mt-1">{errors.toLocationId}</p>
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

        <div className="bg-white p-5 rounded-lg shadow-sm border border-slate-200">
          <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-indigo-800">
                Select Receive Receipts (All under selected Project)
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                All receive receipts from purchase orders under the selected project are listed below.
              </p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <input
                type="search"
                value={receiptFilters.search}
                onChange={(event) => handleReceiptFilterChange(event.target.value)}
                placeholder="Search receipts or PO..."
                className="w-full min-w-[260px] rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
              />
              <button
                type="button"
                onClick={() => loadReceipts(form.projectId || null)}
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:border-indigo-300"
              >
                Refresh
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_260px]">
            <div className="overflow-hidden rounded-lg border border-slate-200">
              <div className="max-h-[330px] overflow-auto">
                <table className="min-w-[980px] w-full text-sm">
                  <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="w-12 px-3 py-3 text-left">
                        <input
                          type="checkbox"
                          checked={allFilteredReceiptsSelected}
                          onChange={toggleAllFilteredReceipts}
                          disabled={!filteredReceiptsForSelection.length}
                          className="h-4 w-4 rounded border-slate-300 text-indigo-700 focus:ring-indigo-500"
                        />
                      </th>
                      <th className="px-3 py-3 text-left">Receive Receipt Reference</th>
                      <th className="px-3 py-3 text-left">Purchase Order Number</th>
                      <th className="px-3 py-3 text-left">Received Date</th>
                      <th className="px-3 py-3 text-right">Item Count</th>
                      <th className="px-3 py-3 text-right">Total Quantity</th>
                    </tr>
                  </thead>
                  <tbody>
                    {receiptsLoading ? (
                      <tr>
                        <td colSpan={6} className="px-4 py-10 text-center text-slate-500">
                          Loading receipts for the selected project...
                        </td>
                      </tr>
                    ) : !form.projectId ? (
                      <tr>
                        <td colSpan={6} className="px-4 py-10 text-center text-slate-500">
                          Select a project to load receive receipts.
                        </td>
                      </tr>
                    ) : filteredReceiptsForSelection.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-4 py-10 text-center text-slate-500">
                          No receive receipts found for this project.
                        </td>
                      </tr>
                    ) : (
                      filteredReceiptsForSelection.map((receipt) => {
                        const isSelected = selectedReceiptIds.includes(String(receipt.id));
                        return (
                          <tr key={receipt.id} className="border-t border-slate-200 bg-white hover:bg-indigo-50/30">
                            <td className="px-3 py-3">
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => toggleReceiptSelection(receipt.id)}
                                className="h-4 w-4 rounded border-slate-300 text-indigo-700 focus:ring-indigo-500"
                              />
                            </td>
                            <td className="px-3 py-3 font-semibold text-slate-800">
                              {getReceiptReference(receipt)}
                            </td>
                            <td className="px-3 py-3 text-slate-700">
                              {getReceiptPurchaseOrderNumber(receipt)}
                            </td>
                            <td className="px-3 py-3 text-slate-700">
                              {formatDate(receipt.receivedDate || receipt.invoiceDate || receipt.createdAt)}
                            </td>
                            <td className="px-3 py-3 text-right text-slate-700">
                              {getReceiptItemCount(receipt)}
                            </td>
                            <td className="px-3 py-3 text-right font-semibold text-slate-800">
                              {fmtQty(getReceiptTotalQuantity(receipt))}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
              <div className="flex flex-col gap-3 border-t border-slate-200 bg-slate-50 px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
                <p className="text-slate-500">
                  Showing {filteredReceiptsForSelection.length} of {receiptsForSelection.length} receipts
                </p>
                <div className="flex items-center gap-4">
                  <span className="font-medium text-indigo-800">
                    {selectedReceiptIds.length} selected
                  </span>
                  <button
                    type="button"
                    onClick={() => setSelectedReceiptIds([])}
                    disabled={!selectedReceiptIds.length}
                    className="text-sm font-semibold text-indigo-700 disabled:cursor-not-allowed disabled:text-slate-400"
                  >
                    Clear Selection
                  </button>
                </div>
              </div>
            </div>

            <aside className="rounded-lg border border-indigo-100 bg-indigo-50 p-4">
              <p className="text-sm font-semibold text-indigo-900">Selection Summary</p>
              <div className="mt-4 space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-600">Total Receipts Selected</span>
                  <span className="font-semibold text-slate-900">{selectedReceiptsSummary.receipts}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">Total Items</span>
                  <span className="font-semibold text-slate-900">{selectedReceiptsSummary.items}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">Total Quantity</span>
                  <span className="font-semibold text-slate-900">{fmtQty(selectedReceiptsSummary.quantity)}</span>
                </div>
              </div>
              <button
                type="button"
                onClick={handleLoadSelectedReceipts}
                disabled={!selectedReceiptIds.length}
                className="mt-5 w-full rounded-lg bg-indigo-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-800 disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                Load Selected Receipts
              </button>
            </aside>
          </div>
        </div>

        <div className="bg-white p-5 rounded-lg shadow-sm border border-slate-200">
          <div className="mb-3 flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
            <h2 className="text-lg font-semibold text-indigo-800">Line Items</h2>
            <div className="flex flex-wrap gap-4 text-sm">
              <span className="font-semibold text-indigo-700">
                {loadedReceiptsSummary.receipts} Receipts Selected
              </span>
              <span className="text-slate-600">
                Total Items: <strong className="text-slate-900">{loadedReceiptsSummary.items}</strong>
              </span>
              <span className="text-slate-600">
                Total Quantity: <strong className="text-slate-900">{fmtQty(loadedReceiptsSummary.quantity)}</strong>
              </span>
            </div>
          </div>
          <div className="overflow-hidden rounded-lg border border-slate-200">
            <div className="overflow-x-auto">
              <table className="min-w-[1180px] w-full text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-3 py-3 text-left w-12">#</th>
                    <th className="px-3 py-3 text-left min-w-[210px]">Item Name</th>
                    <th className="px-3 py-3 text-left min-w-[110px]">HSN / SAC</th>
                    <th className="px-3 py-3 text-left min-w-[90px]">Unit</th>
                    <th className="px-3 py-3 text-right min-w-[140px]">Received Quantity</th>
                    <th className="px-3 py-3 text-right min-w-[150px]">Previously Used Quantity</th>
                    <th className="px-3 py-3 text-right min-w-[130px]">Available Quantity</th>
                    <th className="px-3 py-3 text-right min-w-[140px]">DC Quantity</th>
                    <th className="px-3 py-3 text-right w-16">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {!items.length ? (
                    <tr>
                      <td colSpan={9} className="px-4 py-10 text-center text-slate-500">
                        Select receipts and load them to populate delivery challan line items.
                      </td>
                    </tr>
                  ) : (
                    items.map((item, index) => {
                      const quantity = toQuantity(item.quantity);
                      const availableQty = toQuantity(item.availableQty);
                      const hasError = quantity > availableQty;
                      return (
                        <tr key={item.id} className="border-t border-slate-200 bg-white">
                          <td className="px-3 py-3 text-slate-600">{index + 1}</td>
                          <td className="px-3 py-3 font-medium text-slate-800">{item.name || "-"}</td>
                          <td className="px-3 py-3 text-slate-700">{item.hsn || "-"}</td>
                          <td className="px-3 py-3 text-slate-700">{item.unit || "PCS"}</td>
                          <td className="px-3 py-3 text-right text-slate-800">{fmtQty(item.receivedQty)}</td>
                          <td className="px-3 py-3 text-right text-slate-700">{fmtQty(item.previouslyUsedQty)}</td>
                          <td className="px-3 py-3 text-right font-semibold text-emerald-600">{fmtQty(item.availableQty)}</td>
                          <td className="px-3 py-3">
                            <input
                              type="number"
                              min="0"
                              max={availableQty}
                              step="0.01"
                              value={item.quantity}
                              onChange={(event) =>
                                handleLineItemQuantityChange(item.id, event.target.value)
                              }
                              className={`ml-auto block w-32 rounded-lg border px-3 py-2 text-right text-sm outline-none transition focus:ring-2 ${
                                hasError
                                  ? "border-red-300 focus:border-red-500 focus:ring-red-100"
                                  : "border-slate-200 focus:border-indigo-500 focus:ring-indigo-100"
                              }`}
                            />
                          </td>
                          <td className="px-3 py-3 text-right">
                            <button
                              type="button"
                              onClick={() => handleRemoveLineItem(item.id)}
                              className="rounded-md border border-slate-200 px-2 py-1 text-xs font-medium text-slate-600 hover:border-red-200 hover:text-red-600"
                            >
                              Delete
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
        {receiptError && <p className="text-xs text-red-600">{receiptError}</p>}
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
          <div className="flex items-center gap-2">
            <select
              value={dcStatusFilter}
              onChange={(event) => setDcStatusFilter(event.target.value)}
              className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-700"
            >
              <option value="all">All Status</option>
              <option value="received">Received</option>
              <option value="pending">Pending</option>
              <option value="partially received">Partially Received</option>
            </select>
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
        </div>
        <table className="min-w-[1580px] text-sm">
          <thead className="bg-slate-100 text-slate-600">
            <tr>
              <th className="p-3 text-left min-w-[150px]">DC No</th>
              <th className="p-3 text-left min-w-[220px]">Receipt Ref</th>
              <th className="p-3 text-left min-w-[180px]">Project</th>
              <th className="p-3 text-left min-w-[180px]">From</th>
              <th className="p-3 text-left min-w-[180px]">To</th>
              <th className="p-3 text-left min-w-[120px]">Status</th>
              <th className="p-3 text-left min-w-[120px]">Items</th>
              <th className="p-3 text-right min-w-[140px]">Balance Qty</th>
              <th className="p-3 text-left min-w-[260px]">POD</th>
              <th className="p-3 text-left min-w-[120px]">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredRecords.length === 0 && (
              <tr>
                <td colSpan="10" className="p-6 text-center text-slate-500">
                  {records.length === 0
                    ? "No delivery challans created yet."
                    : "No delivery challans match the selected status."}
                </td>
              </tr>
            )}
            {filteredRecords.map((record) => (
              <tr key={record.id} className="border-t hover:bg-slate-50">
                <td className="p-3 font-medium text-slate-800">
                  {record.dcNumber || "-"}
                </td>
                <td className="p-3 text-slate-700">
                  {formatReceiptReference(
                    Array.isArray(record.receiveGoodsIds) && record.receiveGoodsIds.length
                      ? record.receiveGoodsIds
                      : record.receiveGoodsId
                  )}
                </td>
                <td className="p-3">
                  {projectMap[String(record.projectId)]?.name || "-"}
                </td>
                <td className="p-3">
                  {locationMap[String(record.fromLocationId)]?.name || "-"}
                </td>
                <td className="p-3">
                  {locationMap[String(record.toLocationId)]?.name || record.toLocation || "-"}
                </td>
                <td className="p-3">{getDeliveryChallanRegisterStatus(record)}</td>
                <td className="p-3">{record.items?.length || 0}</td>
                <td className="p-3 text-right font-medium text-slate-800">
                  {fmtQty(record.balanceQty)}
                </td>
                <td className="p-3">{renderPodWorkflowCell(record)}</td>
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
                    disabled={
                      normalizePodStatus(record.podStatus) === POD_STATUS.VERIFIED &&
                      !isPodReviewer
                    }
                    className="text-indigo-600 text-sm disabled:cursor-not-allowed disabled:text-slate-400"
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

      {podModal.type === "upload" && podModal.record ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <form
            onSubmit={handlePodUploadSubmit}
            className="w-full max-w-xl rounded-lg border border-slate-200 bg-white shadow-2xl"
          >
            <div className="flex items-start justify-between border-b border-slate-200 px-6 py-4">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Upload POD</h2>
                <p className="mt-1 text-sm text-slate-500">
                  {podModal.record.dcNumber || "-"} | {getPodStatusLabel(podModal.record.podStatus)}
                </p>
              </div>
              <button
                type="button"
                onClick={closePodModal}
                className="grid h-9 w-9 place-items-center rounded-full border border-slate-200 text-slate-500 hover:border-slate-300 hover:text-slate-900"
              >
                x
              </button>
            </div>
            <div className="space-y-4 px-6 py-5">
              <div>
                <label className="text-sm font-medium text-slate-700">
                  POD Document
                </label>
                <label className="mt-1 flex cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center hover:border-slate-400">
                  <UploadCloud className="mb-2 h-7 w-7 text-slate-500" />
                  <span className="text-sm font-medium text-slate-700">
                    {podForm.fileName || "Upload signed POD"}
                  </span>
                  <span className="mt-1 text-xs text-slate-500">
                    PDF, JPG, or PNG | Max 5 MB
                  </span>
                  <input
                    type="file"
                    accept="application/pdf,image/*"
                    onChange={handlePodFileChange}
                    className="sr-only"
                  />
                </label>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="text-sm font-medium text-slate-700">
                    POD Reference
                  </label>
                  <input
                    type="text"
                    value={podForm.reference}
                    onChange={(event) =>
                      setPodForm((prev) => ({
                        ...prev,
                        reference: event.target.value,
                      }))
                    }
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                    placeholder="POD reference"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-slate-700">
                    POD Date / Time
                  </label>
                  <input
                    type="datetime-local"
                    value={podForm.podDate}
                    onChange={(event) =>
                      setPodForm((prev) => ({ ...prev, podDate: event.target.value }))
                    }
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  />
                </div>
              </div>
              <div>
                <label className="text-sm font-medium text-slate-700">
                  Upload Remarks
                </label>
                <textarea
                  value={podForm.remarks}
                  onChange={(event) =>
                    setPodForm((prev) => ({ ...prev, remarks: event.target.value }))
                  }
                  rows={3}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  placeholder="Delivery handover remarks"
                />
              </div>
              {podActionError ? (
                <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                  {podActionError}
                </p>
              ) : null}
            </div>
            <div className="flex justify-end gap-3 border-t border-slate-200 bg-slate-50 px-6 py-4">
              <button
                type="button"
                onClick={closePodModal}
                className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700"
                disabled={podActionLoading}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={podActionLoading}
              >
                {podActionLoading ? "Uploading..." : "Upload POD"}
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {["verify", "reject", "dispute", "waive", "resolve"].includes(podModal.type) &&
      podModal.record ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <form
            onSubmit={handlePodActionSubmit}
            className="w-full max-w-lg rounded-lg border border-slate-200 bg-white shadow-2xl"
          >
            <div className="border-b border-slate-200 px-6 py-4">
              <h2 className="text-lg font-semibold text-slate-900">
                {POD_ACTION_TITLES[podModal.type] || "POD Action"}
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                {podModal.record.dcNumber || "-"} | {getPodStatusLabel(podModal.record.podStatus)}
              </p>
            </div>
            <div className="space-y-4 px-6 py-5">
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                <p className="font-medium">
                  {podModal.record.podDocumentName || "No document name available"}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  Uploaded {formatDateTime(podModal.record.podUploadedAt)} by{" "}
                  {podModal.record.podUploadedBy || "-"}
                </p>
              </div>
              <div>
                <label className="text-sm font-medium text-slate-700">
                  {podModal.type === "waive"
                    ? "Waiver Reason"
                    : podModal.type === "dispute"
                    ? "Dispute Remarks"
                    : podModal.type === "reject"
                    ? "Rejection Remarks"
                    : podModal.type === "resolve"
                    ? "Resolution Remarks"
                    : "Verification Remarks"}
                </label>
                <textarea
                  value={podForm.remarks}
                  onChange={(event) =>
                    setPodForm((prev) => ({ ...prev, remarks: event.target.value }))
                  }
                  rows={4}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  required={["reject", "dispute", "waive", "resolve"].includes(
                    podModal.type
                  )}
                />
              </div>
              {podActionError ? (
                <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                  {podActionError}
                </p>
              ) : null}
            </div>
            <div className="flex justify-end gap-3 border-t border-slate-200 bg-slate-50 px-6 py-4">
              <button
                type="button"
                onClick={closePodModal}
                className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700"
                disabled={podActionLoading}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={podActionLoading}
              >
                {podActionLoading
                  ? "Saving..."
                  : POD_ACTION_CONFIRM_LABELS[podModal.type] || "Save"}
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {["details", "reason", "issue", "approval", "audit"].includes(podModal.type) &&
      podModal.record
        ? (() => {
            const record = podModal.record;
            const documentIsImage = String(record.podDocumentType || "").startsWith("image/");
            return (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
                <div className="max-h-[86vh] w-full max-w-2xl overflow-hidden rounded-lg border border-slate-200 bg-white shadow-2xl">
                  <div className="flex items-start justify-between border-b border-slate-200 px-6 py-4">
                    <div>
                      <h2 className="text-lg font-semibold text-slate-900">
                        {POD_DETAIL_TITLES[podModal.type] || "POD Details"}
                      </h2>
                      <p className="mt-1 text-sm text-slate-500">
                        {record.dcNumber || "-"} | {getPodStatusLabel(record.podStatus)}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={closePodModal}
                      className="grid h-9 w-9 place-items-center rounded-full border border-slate-200 text-slate-500 hover:border-slate-300 hover:text-slate-900"
                    >
                      x
                    </button>
                  </div>
                  <div className="max-h-[68vh] space-y-4 overflow-y-auto px-6 py-5">
                    {podModal.type === "audit" ? (
                      <div className="space-y-3">
                        {podAuditLoading ? (
                          <p className="text-sm text-slate-500">Loading audit log...</p>
                        ) : podAuditEntries.length ? (
                          podAuditEntries.map((entry) => (
                            <div
                              key={entry.id || `${entry.action}-${entry.createdAt}`}
                              className="rounded-lg border border-slate-200 px-4 py-3"
                            >
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <p className="text-sm font-semibold text-slate-900">
                                  {entry.action || "POD Update"}
                                </p>
                                <p className="text-xs text-slate-500">
                                  {formatDateTime(entry.createdAt)}
                                </p>
                              </div>
                              <p className="mt-1 text-xs text-slate-500">
                                {getPodStatusLabel(entry.fromStatus)} -&gt;{" "}
                                {getPodStatusLabel(entry.toStatus)}
                              </p>
                              <p className="mt-1 text-sm text-slate-700">
                                {entry.performedBy || "-"}{" "}
                                {entry.performedRole ? `(${entry.performedRole})` : ""}
                              </p>
                              {entry.remarks ? (
                                <p className="mt-2 text-sm text-slate-600">
                                  {entry.remarks}
                                </p>
                              ) : null}
                            </div>
                          ))
                        ) : (
                          <p className="text-sm text-slate-500">No POD audit entries.</p>
                        )}
                      </div>
                    ) : (
                      <>
                        <div className="grid gap-3 text-sm md:grid-cols-2">
                          <div className="rounded-lg border border-slate-200 px-4 py-3">
                            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                              Status
                            </p>
                            <p className="mt-1 font-medium text-slate-900">
                              {getPodStatusLabel(record.podStatus)}
                            </p>
                          </div>
                          <div className="rounded-lg border border-slate-200 px-4 py-3">
                            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                              Last Updated
                            </p>
                            <p className="mt-1 font-medium text-slate-900">
                              {formatDateTime(getPodTimestamp(record))}
                            </p>
                          </div>
                          <div className="rounded-lg border border-slate-200 px-4 py-3">
                            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                              Reference
                            </p>
                            <p className="mt-1 font-medium text-slate-900">
                              {record.podReference || "-"}
                            </p>
                          </div>
                          <div className="rounded-lg border border-slate-200 px-4 py-3">
                            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                              Actor
                            </p>
                            <p className="mt-1 font-medium text-slate-900">
                              {getPodActor(record) || "-"}
                            </p>
                          </div>
                        </div>
                        {podModal.type === "reason" ? (
                          <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                            {record.podRejectionRemarks || "No rejection remarks recorded."}
                          </div>
                        ) : null}
                        {podModal.type === "issue" ? (
                          <div className="rounded-lg border border-orange-200 bg-orange-50 px-4 py-3 text-sm text-orange-700">
                            {record.podDisputeRemarks || "No dispute remarks recorded."}
                          </div>
                        ) : null}
                        {podModal.type === "approval" ? (
                          <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                            <p>
                              Approved by {record.podWaiverApprovedBy || record.podWaivedBy || "-"}
                            </p>
                            <p className="mt-1">{record.podWaiverReason || "-"}</p>
                          </div>
                        ) : null}
                        {podModal.type === "details" &&
                        podActionLoading &&
                        !record.podDocumentData ? (
                          <p className="text-sm text-slate-500">
                            Loading POD document...
                          </p>
                        ) : null}
                        {record.podDocumentData ? (
                          <div className="rounded-lg border border-slate-200 px-4 py-3">
                            <div className="flex flex-wrap items-center justify-between gap-3">
                              <div>
                                <p className="text-sm font-semibold text-slate-900">
                                  {record.podDocumentName || "POD document"}
                                </p>
                                <p className="mt-1 text-xs text-slate-500">
                                  {record.podDocumentType || "Document"} |{" "}
                                  {record.podDocumentSize
                                    ? `${Math.round(record.podDocumentSize / 1024)} KB`
                                    : "-"}
                                </p>
                              </div>
                              <button
                                type="button"
                                onClick={() =>
                                  window.open(
                                    record.podDocumentData,
                                    "_blank",
                                    "noopener,noreferrer"
                                  )
                                }
                                className={podButtonClass}
                              >
                                <Eye className="h-3.5 w-3.5" />
                                Open
                              </button>
                            </div>
                            {documentIsImage ? (
                              <img
                                src={record.podDocumentData}
                                alt="POD preview"
                                className="mt-3 max-h-72 w-full rounded-lg border border-slate-200 object-contain"
                              />
                            ) : null}
                          </div>
                        ) : null}
                      </>
                    )}
                    {podActionError ? (
                      <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                        {podActionError}
                      </p>
                    ) : null}
                  </div>
                </div>
              </div>
            );
          })()
        : null}

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
                  <p className="text-slate-600">RE No.:</p>
                  <p className="font-semibold">
                    {selectedChallan.id
                      ? `RE-${String(selectedChallan.id).padStart(5, "0")}`
                      : "-"}
                  </p>
                  <p className="text-slate-600">Our Ref:</p>
                  <p className="font-semibold">{selectedChallan.dcNumber || "-"}</p>
                  <p className="text-slate-600">Receipt Ref:</p>
                  <p className="font-semibold">
                    {formatReceiptReference(
                      Array.isArray(selectedChallan.receiveGoodsIds) &&
                        selectedChallan.receiveGoodsIds.length
                        ? selectedChallan.receiveGoodsIds
                        : selectedChallan.receiveGoodsId
                    )}
                  </p>
                  <p className="text-slate-600">Date:</p>
                  <p className="font-semibold">{formatDate(selectedChallan.issueDate)}</p>
                  <p className="text-slate-600">E-Way Bill No:</p>
                  <p className="font-semibold">{selectedChallan.eWayBillNumber || "-"}</p>
                  <p className="text-slate-600">POD:</p>
                  <p className="font-semibold">
                    {[
                      getPodStatusLabel(selectedChallan.podStatus),
                      selectedChallan.podReference,
                      formatDateTime(getPodTimestamp(selectedChallan)),
                    ]
                      .filter((value) => value && value !== "-")
                      .join(" | ") || "-"}
                  </p>
                  <p className="text-slate-600">Project:</p>
                  <p className="font-semibold">{selectedProject.name || "-"}</p>
                  <p className="text-slate-600">Client:</p>
                  <p className="font-semibold">{selectedProject.client || "-"}</p>
                  <p className="text-slate-600">To:</p>
                  <p className="font-semibold">
                    {selectedToLocation.name || selectedChallan.toLocation || "-"}
                  </p>
                  <p className="text-slate-600">From:</p>
                  <p className="font-semibold">{selectedFromLocation.name || "-"}</p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 border-b border-slate-800 text-[11px]">
              <div className="p-3 border-r border-slate-800">
                <p className="font-semibold">From</p>
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
                <p className="font-semibold">To</p>
                <p>{selectedToLocation.name || selectedProject.name || "-"}</p>
                <p className="whitespace-pre-line mt-1">
                  {selectedToLocation.address || selectedChallan.toLocation || "-"}
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
