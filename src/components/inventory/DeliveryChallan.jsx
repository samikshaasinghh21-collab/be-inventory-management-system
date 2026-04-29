import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import useSettings from "../../hooks/useSettings";
import { getProjects } from "../../services/projectsStore";
import { fetchLocations } from "../../services/locationsApi";
import { fetchReceiveGoods } from "../../services/receiveGoodsApi";
import { fetchPurchaseOrders } from "../../services/purchaseOrdersApi";
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
  receiveGoodsId: "",
  fromLocationId: "",
  toLocationId: "",
  toLocation: "",
  vehicleNumber: "",
  eWayBillNumber: "",
  issueDate: new Date().toISOString().slice(0, 10),
  status: "Draft",
  notes: "",
});

const getReceiptReference = (receipt = {}) =>
  `RG-${String(receipt.receiveGoodsId ?? receipt.id ?? "").padStart(3, "0")}`;

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
        receivedQty: getReceiptItemReceivedQty(item),
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

const normalizeLookupText = (value = "") => String(value ?? "").trim().toLowerCase();
const normalizePreselectedReceiptIds = (value = []) =>
  Array.from(
    new Set(
      (Array.isArray(value) ? value : [])
        .map((entry) => String(entry ?? "").trim())
        .filter(Boolean)
    )
  );

const DeliveryChallan = () => {
  const location = useLocation();
  const prefillSignatureRef = useRef("");
  const [projects, setProjects] = useState(() => getProjects());
  const [locations, setLocations] = useState([]);
  const [purchaseOrders, setPurchaseOrders] = useState([]);
  const [receipts, setReceipts] = useState([]);
  const [records, setRecords] = useState([]);
  const [form, setForm] = useState(createFormState);
  const [items, setItems] = useState([createLineItem()]);
  const [receiptFilters, setReceiptFilters] = useState({
    search: "",
  });
  const [selectedReceiptIds, setSelectedReceiptIds] = useState([]);
  const [errors, setErrors] = useState({});
  const [receiptsLoading, setReceiptsLoading] = useState(false);
  const [receiptError, setReceiptError] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [selectedChallan, setSelectedChallan] = useState(null);
  const settings = useSettings();
  const company = settings?.company || {};
  const companyLogo = resolveBrandLogo(company.logo || "");
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
      // Fetch all POs for the project, then fetch receipts for each
      const projectPOs = purchaseOrders.filter(
        (po) => String(po.projectId) === String(projectId)
      );
      const allReceipts = [];
      for (const po of projectPOs) {
        const list = await fetchReceiveGoods(po.id);
        allReceipts.push(...(Array.isArray(list) ? list : []));
      }
      setReceipts(allReceipts);
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

  useEffect(() => {
    void loadRecords();
    void loadLocations();
    void loadPurchaseOrders();
  }, []);

  useEffect(() => {
    void loadReceipts(form.projectId || null);
  }, [form.projectId, purchaseOrders]);

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

    window.addEventListener("delivery-challans:changed", refreshRecords);
    window.addEventListener("consumptions:changed", refreshRecords);
    window.addEventListener("locations:changed", refreshLocations);
    window.addEventListener("projects:changed", refreshProjects);
    window.addEventListener("purchase-orders:changed", refreshPurchaseOrders);
    window.addEventListener("receive-goods:changed", refreshReceipts);
    return () => {
      window.removeEventListener("delivery-challans:changed", refreshRecords);
      window.removeEventListener("consumptions:changed", refreshRecords);
      window.removeEventListener("locations:changed", refreshLocations);
      window.removeEventListener("projects:changed", refreshProjects);
      window.removeEventListener("purchase-orders:changed", refreshPurchaseOrders);
      window.removeEventListener("receive-goods:changed", refreshReceipts);
    };
  }, [form.projectId, purchaseOrders]);

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
    const filterPoId = String(receiptFilters.purchaseOrderId || "");
    const searchText = normalizeLookupText(receiptFilters.search);

    return receiptsForSelection.filter((receipt) => {
      if (filterPoId && String(receipt.purchaseOrderId) !== filterPoId) {
        return false;
      }
      if (searchText) {
        const reference = normalizeLookupText(getReceiptReference(receipt));
        if (!reference.includes(searchText)) {
          return false;
        }
      }
      return true;
    });
  }, [receiptFilters, receiptsForSelection]);

  const selectedReceipts = useMemo(
    () =>
      selectedReceiptIds
        .map((receiptId) => receiptMap[String(receiptId)])
        .filter(Boolean),
    [receiptMap, selectedReceiptIds]
  );

  const selectedReceiptPurchaseOrderIds = useMemo(
    () =>
      Array.from(
        new Set(
          selectedReceipts
            .map((receipt) => String(receipt.purchaseOrderId || ""))
            .filter(Boolean)
        )
      ),
    [selectedReceipts]
  );

  const selectedReceiptPurchaseOrderId =
    selectedReceiptPurchaseOrderIds.length === 1
      ? selectedReceiptPurchaseOrderIds[0]
      : "";

  const selectableFilteredReceiptIds = useMemo(() => {
    if (selectedReceiptPurchaseOrderId) {
      return filteredReceiptsForSelection
        .filter(
          (receipt) =>
            String(receipt.purchaseOrderId || "") === selectedReceiptPurchaseOrderId
        )
        .map((receipt) => String(receipt.id));
    }
    const visiblePurchaseOrderIds = Array.from(
      new Set(
        filteredReceiptsForSelection
          .map((receipt) => String(receipt.purchaseOrderId || ""))
          .filter(Boolean)
      )
    );
    if (visiblePurchaseOrderIds.length === 1) {
      return filteredReceiptsForSelection.map((receipt) => String(receipt.id));
    }
    return [];
  }, [filteredReceiptsForSelection, selectedReceiptPurchaseOrderId]);

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
    if (!selectedReceipts.length) {
      setItems([createLineItem()]);
      setForm((prev) => ({ ...prev, receiveGoodsId: "" }));
      return;
    }
    const nextItems = selectedReceiptItems.length
      ? selectedReceiptItems
      : [createLineItem()];
    const primaryReceipt = selectedReceipts[0];
    setItems(nextItems);
    setForm((prev) => ({
      ...prev,
      receiveGoodsId: primaryReceipt?.id ? String(primaryReceipt.id) : "",
      projectId: primaryReceipt?.projectId
        ? String(primaryReceipt.projectId)
        : prev.projectId,
      fromLocationId: primaryReceipt?.locationId
        ? String(primaryReceipt.locationId)
        : prev.fromLocationId,
    }));
    setReceiptError(
      selectedReceiptItems.length
        ? ""
        : "Selected receipts do not have items with available quantity."
    );
  }, [editingId, selectedReceiptItems, selectedReceipts]);

  const resetForm = () => {
    setForm(createFormState());
    setItems([createLineItem()]);
    setReceiptFilters({
      purchaseOrderId: "",
      search: "",
    });
    setSelectedReceiptIds([]);
    setErrors({});
    setReceiptError("");
    setEditingId(null);
  };

  useEffect(() => {
    const preselectedIds = normalizePreselectedReceiptIds(
      location.state?.preselectedReceiveGoodsIds
    );
    const preselectedPurchaseOrderId = String(
      location.state?.preselectedPurchaseOrderId ?? ""
    ).trim();

    if (!preselectedIds.length || !preselectedPurchaseOrderId) {
      return;
    }

    const signature = `${location.key}:${preselectedPurchaseOrderId}:${preselectedIds.join(",")}`;
    if (prefillSignatureRef.current === signature) {
      return;
    }
    prefillSignatureRef.current = signature;

    setEditingId(null);
    setErrors({});
    setReceiptError("");
    setReceiptFilters({
      purchaseOrderId: preselectedPurchaseOrderId,
      search: "",
    });
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
    setReceiptError("");
    if (selectedReceiptPurchaseOrderIds.length > 1) {
      setReceiptError(
        "Only receipts from the same purchase order can be fetched into one delivery challan."
      );
      return;
    }
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
      receiveGoodsId: form.receiveGoodsId ? Number(form.receiveGoodsId) : null,
      receiveGoodsIds: selectedReceiptIds
        .map((receiptId) => Number(receiptId))
        .filter((receiptId) => Number.isFinite(receiptId) && receiptId > 0),
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
    setErrors({});
    setReceiptFilters((prev) => ({
      ...prev,
      purchaseOrderId:
        recordReceiptIds.length > 0
          ? String(receiptMap[recordReceiptIds[0]]?.purchaseOrderId || "")
          : "",
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
      purchaseOrderId: "",
      search: "",
    }));
    setSelectedReceiptIds([]);
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

  const handleReceiptFilterChange = (field, value) => {
    setReceiptFilters((prev) => ({
      ...prev,
      [field]: value,
    }));
    if (field === "purchaseOrderId") {
      setSelectedReceiptIds([]);
      setReceiptError("");
    }
  };

  const toggleReceiptSelection = (receiptId) => {
    const receipt = receiptMap[String(receiptId)];
    if (!receipt) {
      return;
    }
    if (
      receiptFilters.purchaseOrderId &&
      String(receipt.purchaseOrderId) !== String(receiptFilters.purchaseOrderId)
    ) {
      return;
    }
    if (
      selectedReceiptPurchaseOrderId &&
      String(receipt.purchaseOrderId || "") !== selectedReceiptPurchaseOrderId &&
      !selectedReceiptIds.includes(String(receiptId))
    ) {
      setReceiptError(
        "Only receipts from the same purchase order can be selected for one delivery challan."
      );
      return;
    }
    if (selectedReceiptPurchaseOrderIds.length > 1) {
      setReceiptError(
        "Only receipts from the same purchase order can be selected for one delivery challan."
      );
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
    if (selectedReceiptPurchaseOrderIds.length > 1) {
      setReceiptError(
        "Only receipts from the same purchase order can be selected for one delivery challan."
      );
      return;
    }
    const visiblePurchaseOrderIds = Array.from(
      new Set(
        filteredReceiptsForSelection
          .map((receipt) => String(receipt.purchaseOrderId || ""))
          .filter(Boolean)
      )
    );
    if (!selectedReceiptPurchaseOrderId && visiblePurchaseOrderIds.length > 1) {
      setReceiptError(
        "Select receipts from one purchase order at a time. Apply a purchase order filter before bulk select."
      );
      return;
    }
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

  const allFilteredReceiptsSelected =
    selectableFilteredReceiptIds.length > 0 &&
    selectableFilteredReceiptIds.every((receiptId) =>
      selectedReceiptIds.includes(receiptId)
    );

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
            <div>
              <label className="text-sm font-medium text-slate-700">
                Receive Receipt Reference (optional)
              </label>
              <div className="mt-1 rounded-lg border border-slate-200 bg-slate-50 p-3">
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <div>
                    <label className="text-xs font-medium uppercase tracking-wide text-slate-500">
                      Purchase Order
                    </label>
                    <select
                      value={receiptFilters.purchaseOrderId}
                      onChange={(event) =>
                        handleReceiptFilterChange("purchaseOrderId", event.target.value)
                      }
                      className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
                    >
                      <option value="">Select purchase order</option>
                      {purchaseOrders.map((po) => (
                        <option key={po.id} value={po.id}>
                          {po.poNumber || `PO-${po.id}`}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-medium uppercase tracking-wide text-slate-500">
                      Receive Receipt Reference
                    </label>
                    <input
                      type="text"
                      value={receiptFilters.search}
                      onChange={(event) =>
                        handleReceiptFilterChange("search", event.target.value)
                      }
                      placeholder="Search reference (e.g. RG-001)"
                      className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
                    />
                  </div>
                </div>
                <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-xs text-slate-500">
                    Showing {filteredReceiptsForSelection.length} of {receiptsForSelection.length}{" "}
                    receipts | Selected {selectedReceiptIds.length}
                  </p>
                  <button
                    type="button"
                    onClick={toggleAllFilteredReceipts}
                    disabled={!filteredReceiptsForSelection.length}
                    className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {allFilteredReceiptsSelected ? "Clear Visible" : "Select Visible"}
                  </button>
                </div>
              </div>
              <div className="mt-3 max-h-[320px] overflow-auto rounded-lg border border-slate-200 bg-white">
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-100 text-slate-600">
                    <tr>
                      <th className="p-3 text-left min-w-[80px]">Select</th>
                      <th className="p-3 text-left min-w-[220px]">
                        Receive Receipt Reference (optional)
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {receiptsLoading ? (
                      <tr className="border-t">
                        <td colSpan={2} className="p-4 text-center text-sm text-slate-500">
                          Loading receipts...
                        </td>
                      </tr>
                    ) : !receiptFilters.purchaseOrderId ? (
                      <tr className="border-t">
                        <td colSpan={2} className="p-4 text-center text-sm text-slate-500">
                          Select a purchase order to load related receipts.
                        </td>
                      </tr>
                    ) : filteredReceiptsForSelection.length === 0 ? (
                      <tr className="border-t">
                        <td colSpan={2} className="p-4 text-center text-sm text-slate-500">
                          No receipts match the current filters.
                        </td>
                      </tr>
                    ) : (
                      filteredReceiptsForSelection.map((receipt) => {
                        const isSelected = selectedReceiptIds.includes(String(receipt.id));
                        const isSelectable =
                          selectedReceiptPurchaseOrderIds.length <= 1 &&
                          (!selectedReceiptPurchaseOrderId ||
                            isSelected ||
                            String(receipt.purchaseOrderId || "") ===
                              selectedReceiptPurchaseOrderId);
                        return (
                          <tr key={receipt.id} className="border-t">
                            <td className="p-3">
                              <input
                                type="checkbox"
                                checked={isSelected}
                                disabled={!isSelectable}
                                onChange={() => toggleReceiptSelection(receipt.id)}
                                className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
                              />
                            </td>
                            <td className="p-3 font-medium text-slate-800">
                              {getReceiptReference(receipt)}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
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
          showHsnGst
        />
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
        <table className="min-w-[1300px] text-sm">
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
              <th className="p-3 text-left min-w-[120px]">Actions</th>
            </tr>
          </thead>
          <tbody>
            {records.length === 0 && (
              <tr>
                <td colSpan="9" className="p-6 text-center text-slate-500">
                  No delivery challans created yet.
                </td>
              </tr>
            )}
            {records.map((record) => (
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
                <td className="p-3">{record.status || "-"}</td>
                <td className="p-3">{record.items?.length || 0}</td>
                <td className="p-3 text-right font-medium text-slate-800">
                  {fmtQty(record.balanceQty)}
                </td>
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
