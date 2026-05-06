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
  fetchNextDeliveryChallanNumber,
  updateDeliveryChallan,
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
  const [items, setItems] = useState([]);
  const [loadedReceiptIds, setLoadedReceiptIds] = useState([]);
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
          editingId ? prev : { ...prev, dcNumber: nextNumber }
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
    const invalidQuantityItem = items.find(
      (item) => Number(item.quantity) > Number(item.availableQty ?? item.quantity)
    );
    if (invalidQuantityItem) {
      nextErrors.items = `DC quantity for ${invalidQuantityItem.name || "an item"} cannot exceed available quantity.`;
    }

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setReceiptError("");
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
      setForm((prev) => ({ ...prev, receiveGoodsId: "" }));
      return;
    }
    const nextItems = selectedReceiptItems.length ? selectedReceiptItems : [];
    if (!nextItems.length) {
      setReceiptError("Selected receipts do not have items with available quantity.");
      return;
    }
    const primaryReceipt = selectedReceipts[0];
    setItems(
      nextItems.map((item) => ({
        ...item,
        quantity: Number(item.quantity ?? item.availableQty ?? 0) || 0,
      }))
    );
    setLoadedReceiptIds(selectedReceiptIds);
    setForm((prev) => ({
      ...prev,
      receiveGoodsId: primaryReceipt?.id ? String(primaryReceipt.id) : "",
      fromLocationId: primaryReceipt?.locationId
        ? String(primaryReceipt.locationId)
        : prev.fromLocationId,
    }));
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
