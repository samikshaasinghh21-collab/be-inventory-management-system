import { useEffect, useMemo, useState } from "react";
import useSettings from "../../hooks/useSettings";
import { getProjects } from "../../services/projectsStore";
import { fetchLocations } from "../../services/locationsApi";
import { fetchReceiveGoods } from "../../services/receiveGoodsApi";
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

const createFormState = () => ({
  dcNumber: "",
  projectId: "",
  fromLocationId: "",
  toLocationId: "",
  toLocation: "",
  vehicleNumber: "",
  eWayBillNumber: "",
  issueDate: new Date().toISOString().slice(0, 10),
  status: "Draft",
  notes: "",
});

const createLineItem = () => ({
  id: Date.now() + Math.random(),
  name: "",
  description: "",
  unit: "PCS",
  hsn: "",
  gst: "",
  receivedQty: 0,
  previouslyUsedQty: 0,
  availableQty: 0,
  quantity: "",
  rate: "",
  notes: "",
  receiveGoodsItemId: null,
  poItemId: null,
  itemId: null,
});

// Helper functions
const buildReceiptReferenceLabel = (receipt = {}) => {
  const receiptNumber = `RG-${String(receipt.receiveGoodsId ?? receipt.id ?? "").padStart(3, "0")}`;
  const poNumber = receipt.purchaseOrderId ? `PO-${String(receipt.purchaseOrderId).padStart(4, "0")}` : null;
  const invoiceDateText = formatDate(receipt.invoiceDate ?? receipt.receivedDate ?? receipt.createdAt);
  return [
    receiptNumber,
    poNumber,
    receipt.invoiceNumber ? `INV ${receipt.invoiceNumber}` : null,
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

const getReceiptItemDeliveredQty = (item = {}) =>
  Number(
    item.receiptDeliveredQty ??
      item.ReceiptDeliveredQty ??
      item.deliveredQty ??
      item.DeliveredQty ??
      0
  ) || 0;

const getReceiptItemAvailableQty = (item = {}) =>
  Number(
    item.deliveryAvailableQty ??
      item.DeliveryAvailableQty ??
      item.receiptDispatchAvailableQty ??
      item.ReceiptDispatchAvailableQty ??
      item.receiptAvailableQty ??
      item.ReceiptAvailableQty ??
      item.availableQty ??
      item.AvailableQty ??
      item.totalAvailableQty ??
      item.TotalAvailableQty ??
      getReceiptItemReceivedQty(item)
  ) || 0;

const getReceiptLocationId = (receipt = {}) =>
  String(receipt.locationId ?? receipt.LocationId ?? "").trim();

const fmtQty = (value) =>
  (Number(value) || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 });

const ReceiptSelectionTable = ({
  receipts,
  selectedReceiptIds,
  onToggleReceipt,
  onToggleAllReceipts,
  searchQuery,
  onSearchChange,
  dateFilter,
  onDateFilterChange,
  poSearchQuery,
  onPoSearchChange,
  isLoading,
}) => {
  const filteredReceipts = useMemo(() => {
    const searchNeedle = searchQuery.trim().toLowerCase();
    const poNeedle = poSearchQuery.trim().toLowerCase();

    return receipts.filter((receipt) => {
      const receivedDate = String(
        receipt.receivedDate ?? receipt.invoiceDate ?? receipt.createdAt ?? ""
      ).slice(0, 10);

      if (dateFilter && receivedDate !== dateFilter) {
        return false;
      }

      const hasAvailableItems = (receipt.items || []).some(
        (item) => getReceiptItemAvailableQty(item) > 0
      );
      if (!hasAvailableItems) {
        return false;
      }

      const receiptRef = buildReceiptReferenceLabel(receipt).toLowerCase();
      const poRef = receipt.purchaseOrderId
        ? `PO-${String(receipt.purchaseOrderId).padStart(4, "0")}`.toLowerCase()
        : "";

      if (searchNeedle && !receiptRef.includes(searchNeedle)) {
        return false;
      }

      if (poNeedle && !poRef.includes(poNeedle)) {
        return false;
      }

      return true;
    });
  }, [receipts, searchQuery, poSearchQuery, dateFilter]);

  const itemCount = useMemo(() => {
    return filteredReceipts.reduce((sum, receipt) => {
      return sum + (receipt.items?.length || 0);
    }, 0);
  }, [filteredReceipts]);

  const totalQuantity = useMemo(() => {
    return filteredReceipts.reduce((sum, receipt) => {
      return (
        sum +
        (receipt.items?.reduce((itemSum, item) => {
          return itemSum + getReceiptItemReceivedQty(item);
        }, 0) || 0)
      );
    }, 0);
  }, [filteredReceipts]);

  const areAllSelected =
    filteredReceipts.length > 0 &&
    filteredReceipts.every((receipt) => selectedReceiptIds.has(String(receipt.id)));

  return (
    <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden">
      <div className="p-4 border-b border-slate-200">
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold text-slate-800">
                Select Receive Receipts
              </h3>
              <p className="text-xs text-slate-500 mt-1">
                {filteredReceipts.length} receipt{filteredReceipts.length !== 1 ? "s" : ""} | {itemCount} items | {fmtQty(totalQuantity)} qty
              </p>
            </div>
            <button
              type="button"
              onClick={onToggleAllReceipts}
              disabled={filteredReceipts.length === 0}
              className="px-3 py-1.5 border border-slate-200 rounded-md text-xs font-medium text-slate-700 bg-white hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {areAllSelected ? "Clear All" : "Select All"}
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="text-xs font-medium text-slate-700">
                Receipt Reference
              </label>
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => onSearchChange(e.target.value)}
                placeholder="Search receipt ref..."
                className="w-full mt-1 border border-slate-200 rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-700">
                PO Number
              </label>
              <input
                type="search"
                value={poSearchQuery}
                onChange={(e) => onPoSearchChange(e.target.value)}
                placeholder="Search PO..."
                className="w-full mt-1 border border-slate-200 rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-700">
                Received Date
              </label>
              <DateInput
                value={dateFilter}
                onChange={(value) => onDateFilterChange(value || "")}
                className="w-full mt-1 border border-slate-200 rounded-lg px-3 py-2 text-sm"
                placeholder="dd/mm/yyyy"
              />
            </div>
          </div>
        </div>
      </div>

      <div className="app-scroll-region max-h-[26rem] overflow-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-100 text-slate-600 sticky top-0">
            <tr>
              <th className="p-3 text-left w-12">
                <input
                  type="checkbox"
                  checked={areAllSelected}
                  onChange={onToggleAllReceipts}
                  disabled={filteredReceipts.length === 0}
                  className="h-4 w-4 rounded border-slate-300 text-indigo-600"
                />
              </th>
              <th className="p-3 text-left min-w-[180px]">Receipt Ref</th>
              <th className="p-3 text-left min-w-[120px]">PO Number</th>
              <th className="p-3 text-left min-w-[120px]">Received Date</th>
              <th className="p-3 text-center min-w-[100px]">Item Count</th>
              <th className="p-3 text-right min-w-[100px]">Total Qty</th>
            </tr>
          </thead>
          <tbody>
            {filteredReceipts.length === 0 ? (
              <tr>
                <td colSpan="6" className="p-6 text-center text-slate-500">
                  {isLoading ? "Loading receipts..." : "No receipts available"}
                </td>
              </tr>
            ) : (
              filteredReceipts.map((receipt) => {
                const isSelected = selectedReceiptIds.has(String(receipt.id));
                const itemCount = receipt.items?.length || 0;
                const totalQty = (receipt.items || []).reduce(
                  (sum, item) => sum + getReceiptItemReceivedQty(item),
                  0
                );
                const receivedDate = formatDate(
                  receipt.receivedDate ?? receipt.invoiceDate ?? receipt.createdAt
                );
                const poRef = receipt.purchaseOrderId
                  ? `PO-${String(receipt.purchaseOrderId).padStart(4, "0")}`
                  : "-";

                return (
                  <tr
                    key={receipt.id}
                    className={`border-t hover:bg-slate-50 ${isSelected ? "bg-indigo-50" : ""}`}
                  >
                    <td className="p-3">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => onToggleReceipt(String(receipt.id))}
                        className="h-4 w-4 rounded border-slate-300 text-indigo-600"
                      />
                    </td>
                    <td className="p-3 font-medium text-slate-800">
                      {buildReceiptReferenceLabel(receipt)}
                    </td>
                    <td className="p-3 text-slate-700">{poRef}</td>
                    <td className="p-3 text-slate-700">{receivedDate}</td>
                    <td className="p-3 text-center text-slate-700">{itemCount}</td>
                    <td className="p-3 text-right font-medium text-slate-800">
                      {fmtQty(totalQty)}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const SelectionSummary = ({ selectedReceipts, items }) => {
  const totalItems = items.length;
  const totalQuantity = items.reduce(
    (sum, item) => sum + Number(item.quantity || 0),
    0
  );

  return (
    <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4 sticky top-0">
      <h3 className="font-semibold text-indigo-900 mb-4">Selection Summary</h3>
      <div className="space-y-3">
        <div className="flex justify-between items-center pb-3 border-b border-indigo-200">
          <span className="text-sm text-indigo-700">Total Receipts Selected</span>
          <span className="text-2xl font-bold text-indigo-900">
            {selectedReceipts.length}
          </span>
        </div>
        <div className="flex justify-between items-center pb-3 border-b border-indigo-200">
          <span className="text-sm text-indigo-700">Total Line Items</span>
          <span className="text-2xl font-bold text-indigo-900">{totalItems}</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-sm text-indigo-700">Total Quantity</span>
          <span className="text-2xl font-bold text-indigo-900">
            {fmtQty(totalQuantity)}
          </span>
        </div>
      </div>
    </div>
  );
};

const DeliveryChallan = () => {
  const [projects, setProjects] = useState(() => getProjects());
  const [locations, setLocations] = useState([]);
  const [allReceipts, setAllReceipts] = useState([]);
  const [records, setRecords] = useState([]);
  const [form, setForm] = useState(createFormState());
  const [items, setItems] = useState([createLineItem()]);
  const [selectedReceiptIds, setSelectedReceiptIds] = useState(new Set());
  const [errors, setErrors] = useState({});
  const [submitError, setSubmitError] = useState("");
  const [saving, setSaving] = useState(false);
  const [receiptsLoading, setReceiptsLoading] = useState(false);
  const [receiptSearchQuery, setReceiptSearchQuery] = useState("");
  const [receiptPoSearchQuery, setReceiptPoSearchQuery] = useState("");
  const [receiptDateFilter, setReceiptDateFilter] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [selectedChallan, setSelectedChallan] = useState(null);

  const settings = useSettings();
  const company = settings?.company || {};
  const companyLogo = resolveBrandLogo(company.logo || "");
  const companyName = company.name || "Bangalore Electronics";

  // Load data
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

  const loadReceipts = async () => {
    try {
      setReceiptsLoading(true);
      const list = await fetchReceiveGoods();
      setAllReceipts(Array.isArray(list) ? list : []);
    } catch (error) {
      console.error("Failed to load receipts:", error);
      setAllReceipts([]);
    } finally {
      setReceiptsLoading(false);
    }
  };

  useEffect(() => {
    void loadRecords();
    void loadLocations();
    void loadReceipts();
  }, []);

  useEffect(() => {
    const handleRefresh = () => void loadRecords();
    const handleProjectsChange = () => setProjects(getProjects());
    const handleLocationsChange = () => void loadLocations();
    const handleReceiptsChange = () => void loadReceipts();

    window.addEventListener("delivery-challans:changed", handleRefresh);
    window.addEventListener("consumptions:changed", handleRefresh);
    window.addEventListener("projects:changed", handleProjectsChange);
    window.addEventListener("locations:changed", handleLocationsChange);
    window.addEventListener("receive-goods:changed", handleReceiptsChange);

    return () => {
      window.removeEventListener("delivery-challans:changed", handleRefresh);
      window.removeEventListener("consumptions:changed", handleRefresh);
      window.removeEventListener("projects:changed", handleProjectsChange);
      window.removeEventListener("locations:changed", handleLocationsChange);
      window.removeEventListener("receive-goods:changed", handleReceiptsChange);
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

  // Compute filtered receipts for the selected project
  const projectReceipts = useMemo(() => {
    if (!form.projectId) {
      return [];
    }
    return allReceipts.filter(
      (receipt) => String(receipt.projectId) === String(form.projectId)
    );
  }, [allReceipts, form.projectId]);

  // Get selected receipts
  const selectedReceipts = useMemo(() => {
    return projectReceipts.filter((receipt) =>
      selectedReceiptIds.has(String(receipt.id))
    );
  }, [projectReceipts, selectedReceiptIds]);

  // Compute derived location options
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

  // Auto-set destination location for project
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

  // Update toLocation name when toLocationId changes
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

  const handleProjectChange = (nextProjectId) => {
    const preferredLocation = locations.find(
      (location) => String(location.projectId) === String(nextProjectId)
    );

    setForm((prev) => ({
      ...prev,
      projectId: nextProjectId,
      fromLocationId: "",
      toLocationId: preferredLocation ? String(preferredLocation.id) : "",
      toLocation: preferredLocation?.name || "",
    }));
    setItems([createLineItem()]);
    setSelectedReceiptIds(new Set());
    setSubmitError("");
    setReceiptSearchQuery("");
    setReceiptPoSearchQuery("");
    setReceiptDateFilter("");
  };

  const handleToLocationChange = (nextLocationId) => {
    const selectedLocation = locations.find(
      (location) => String(location.id) === String(nextLocationId)
    );
    setForm((prev) => ({
      ...prev,
      toLocationId: nextLocationId,
      toLocation: selectedLocation?.name || "",
    }));
  };

  const handleToggleReceipt = (receiptId) => {
    setSelectedReceiptIds((prev) => {
      const next = new Set(prev);
      if (next.has(receiptId)) {
        next.delete(receiptId);
      } else {
        next.add(receiptId);
      }
      return next;
    });
  };

  const handleToggleAllReceipts = () => {
    if (!projectReceipts.length) {
      return;
    }
    const visibleIds = new Set(
      projectReceipts.map((receipt) => String(receipt.id))
    );
    setSelectedReceiptIds((prev) => {
      const allVisibleSelected = Array.from(visibleIds).every((id) =>
        prev.has(id)
      );
      if (allVisibleSelected) {
        const next = new Set(prev);
        visibleIds.forEach((id) => next.delete(id));
        return next;
      } else {
        return new Set([...prev, ...visibleIds]);
      }
    });
  };

  const handleLoadSelectedReceipts = () => {
    if (selectedReceipts.length === 0) {
      setSubmitError("Please select at least one receipt.");
      return;
    }

    const newItems = [];
    const seenKey = new Set();

    selectedReceipts.forEach((receipt) => {
      (receipt.items || []).forEach((receiptItem) => {
        const availableQty = getReceiptItemAvailableQty(receiptItem);
        if (availableQty <= 0) {
          return; // Skip items with no available quantity
        }

        const itemKey = `${receipt.id}::${receiptItem.name || ""}::${receiptItem.unit || "PCS"}`;
        if (seenKey.has(itemKey)) {
          return; // Skip duplicates
        }
        seenKey.add(itemKey);

        newItems.push({
          id: Date.now() + Math.random(),
          receiveGoodsItemId:
            receiptItem.receiveGoodsItemId ??
            receiptItem.ReceiveGoodsItemId ??
            receiptItem.id ??
            null,
          poItemId:
            receiptItem.poItemId ??
            receiptItem.POItemId ??
            receiptItem.purchaseOrderItemId ??
            receiptItem.PurchaseOrderItemId ??
            null,
          itemId: receiptItem.itemId ?? receiptItem.ItemId ?? null,
          name: receiptItem.name || "",
          description: receiptItem.description || "",
          unit: receiptItem.unit || "PCS",
          hsn: receiptItem.hsn || "",
          gst: receiptItem.gst || "",
          receivedQty: getReceiptItemReceivedQty(receiptItem),
          previouslyUsedQty: getReceiptItemDeliveredQty(receiptItem),
          availableQty: availableQty,
          quantity: availableQty,
          rate: Number(receiptItem.unitPrice ?? receiptItem.rate ?? 0) || 0,
          notes: receiptItem.notes || "",
        });
      });
    });

    if (newItems.length === 0) {
      setSubmitError("No items with available quantity found in selected receipts.");
      return;
    }

    setItems(newItems);
    setSubmitError("");
  };

  const resetForm = () => {
    setForm(createFormState());
    setItems([createLineItem()]);
    setSelectedReceiptIds(new Set());
    setErrors({});
    setSubmitError("");
    setSaving(false);
    setReceiptSearchQuery("");
    setReceiptPoSearchQuery("");
    setReceiptDateFilter("");
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
    if (!form.toLocationId && !form.toLocation.trim()) {
      nextErrors.toLocationId = "Select destination.";
    }
    const hasValidItem = items.some(
      (item) => item.name.trim() && Number(item.quantity) > 0
    );
    if (!hasValidItem) {
      nextErrors.items = "Add at least one line item with quantity.";
    }

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSubmitError("");
    if (!validate()) {
      return;
    }

    const cleanedItems = items
      .map((item) => ({
        ...item,
        receiveGoodsItemId: item.receiveGoodsItemId
          ? Number(item.receiveGoodsItemId)
          : null,
        poItemId: item.poItemId ? Number(item.poItemId) : null,
        itemId: item.itemId ? Number(item.itemId) : null,
        name: String(item.name ?? "").trim(),
        hsn: String(item.hsn ?? "").trim(),
        gst: String(item.gst ?? "").trim(),
      }))
      .filter((item) => item.name && Number(item.quantity) > 0);

    const payload = {
      ...form,
      projectId: form.projectId ? Number(form.projectId) : null,
      toLocationId: form.toLocationId ? Number(form.toLocationId) : null,
      items: cleanedItems,
    };

    try {
      setSaving(true);
      if (editingId) {
        await updateDeliveryChallan(editingId, payload);
      } else {
        await createDeliveryChallan(payload);
      }
      await loadRecords();
      resetForm();
    } catch (error) {
      console.error("Failed to save delivery challan:", error);
      setSubmitError(
        error?.response?.data?.error ||
          error?.message ||
          "Failed to save delivery challan."
      );
    } finally {
      setSaving(false);
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
    setSelectedReceiptIds(new Set());
    setReceiptSearchQuery("");
    setReceiptPoSearchQuery("");
    setReceiptDateFilter("");
    setErrors({});
    setSubmitError("");
  };

  const handleDelete = async (id) => {
    try {
      await deleteDeliveryChallan(id);
      await loadRecords();
    } catch (error) {
      console.error("Failed to delete delivery challan:", error);
    }
  };

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
            Create and track material dispatch from receipts to project locations.
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

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        {[
          { label: "Total Challans", value: records.length },
          {
            label: "Issued",
            value: records.filter((r) => r.status === "Issued").length,
          },
          {
            label: "Draft",
            value: records.filter((r) => r.status === "Draft").length,
          },
          {
            label: "Delivered",
            value: records.filter((r) => r.status === "Delivered").length,
          },
        ].map((stat) => (
          <div
            key={stat.label}
            className="bg-white p-4 rounded-lg shadow-sm border border-slate-200"
          >
            <p className="text-sm text-slate-500">{stat.label}</p>
            <p className="text-2xl font-semibold text-slate-800">{stat.value}</p>
          </div>
        ))}
      </div>

      <form onSubmit={handleSubmit} className="space-y-4 mb-6">
        {/* Challan Details Section */}
        <div className="bg-white p-5 rounded-lg shadow-sm border border-slate-200">
          <h2 className="text-lg font-semibold text-slate-800 mb-4">
            Challan Details
          </h2>
          {submitError && (
            <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {submitError}
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="text-sm font-medium text-slate-700">
                DC Number *
              </label>
              <input
                type="text"
                value={form.dcNumber}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, dcNumber: e.target.value }))
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
                onChange={(e) => handleProjectChange(e.target.value)}
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
                Ship To *
              </label>
              <select
                value={form.toLocationId}
                onChange={(e) => handleToLocationChange(e.target.value)}
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
              {errors.toLocationId && (
                <p className="text-xs text-red-600 mt-1">{errors.toLocationId}</p>
              )}
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
                Vehicle Number
              </label>
              <input
                type="text"
                value={form.vehicleNumber}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, vehicleNumber: e.target.value }))
                }
                placeholder="MH-12-AB-1234"
                className="w-full mt-1 border border-slate-200 rounded-lg px-3 py-2"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700">
                E-Way Bill Number
              </label>
              <input
                type="text"
                value={form.eWayBillNumber}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    eWayBillNumber: e.target.value,
                  }))
                }
                placeholder="Enter EBN (optional)"
                className="w-full mt-1 border border-slate-200 rounded-lg px-3 py-2"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700">
                Status
              </label>
              <select
                value={form.status}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, status: e.target.value }))
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
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, notes: e.target.value }))
                }
                placeholder="Transport details, remarks, or approvals..."
                className="w-full mt-1 border border-slate-200 rounded-lg px-3 py-2 min-h-[80px]"
              />
            </div>
          </div>
        </div>

        {/* Receipt Selection and Line Items Section */}
        {form.projectId && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Left: Receipt Selection Table and Line Items (2 columns) */}
            <div className="lg:col-span-2 space-y-4">
              {/* Receipt Selection Table */}
              <ReceiptSelectionTable
                receipts={projectReceipts}
                selectedReceiptIds={selectedReceiptIds}
                onToggleReceipt={handleToggleReceipt}
                onToggleAllReceipts={handleToggleAllReceipts}
                searchQuery={receiptSearchQuery}
                onSearchChange={setReceiptSearchQuery}
                dateFilter={receiptDateFilter}
                onDateFilterChange={setReceiptDateFilter}
                poSearchQuery={receiptPoSearchQuery}
                onPoSearchChange={setReceiptPoSearchQuery}
                isLoading={receiptsLoading}
              />

              {/* Load Selected Receipts Button */}
              {selectedReceiptIds.size > 0 && (
                <button
                  type="button"
                  onClick={handleLoadSelectedReceipts}
                  className="w-full px-4 py-3 bg-indigo-600 text-white font-medium rounded-lg hover:bg-indigo-700 transition-colors"
                >
                  Load {selectedReceiptIds.size} Selected Receipt
                  {selectedReceiptIds.size !== 1 ? "s" : ""}
                </button>
              )}

              {/* Line Items Table */}
              {items.length > 0 && (
                <div className="bg-white rounded-lg shadow-sm border border-slate-200">
                  <div className="p-4 border-b border-slate-200">
                    <h3 className="text-lg font-semibold text-slate-800">
                      Delivery Challan Line Items
                    </h3>
                    <p className="text-xs text-slate-500 mt-1">
                      {items.length} item{items.length !== 1 ? "s" : ""} loaded
                    </p>
                  </div>
                  <LineItemsEditor
                    items={items}
                    onChange={setItems}
                    disableAdd={false}
                    disableRemove={false}
                    readOnlyFields={[]}
                    showHsnGst
                  />
                </div>
              )}
            </div>

            {/* Right: Summary Panel (1 column) */}
            <div>
              <SelectionSummary selectedReceipts={selectedReceipts} items={items} />
            </div>
          </div>
        )}

        {/* Form Actions */}
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
            disabled={saving || !form.projectId}
            className="px-5 py-2 rounded-lg text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            {saving
              ? editingId
                ? "Updating..."
                : "Saving..."
              : editingId
              ? "Update Challan"
              : "Save Challan"}
          </button>
        </div>
      </form>

      {/* Delivery Challan Register */}
      <div id="delivery-challan-register" className="app-scroll-region bg-white rounded-lg shadow-sm border border-slate-200 overflow-x-auto">
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
              <th className="p-3 text-left min-w-[180px]">Project</th>
              <th className="p-3 text-left min-w-[180px]">Ship To</th>
              <th className="p-3 text-left min-w-[120px]">Status</th>
              <th className="p-3 text-left min-w-[120px]">Items</th>
              <th className="p-3 text-right min-w-[140px]">Total Qty</th>
              <th className="p-3 text-left min-w-[120px]">Actions</th>
            </tr>
          </thead>
          <tbody>
            {records.length === 0 ? (
              <tr>
                <td colSpan="7" className="p-6 text-center text-slate-500">
                  No delivery challans created yet.
                </td>
              </tr>
            ) : (
              records.map((record) => (
                <tr key={record.id} className="border-t hover:bg-slate-50">
                  <td className="p-3 font-medium text-slate-800">
                    {record.dcNumber || "-"}
                  </td>
                  <td className="p-3">
                    {projectMap[String(record.projectId)]?.name || "-"}
                  </td>
                  <td className="p-3">
                    {locationMap[String(record.toLocationId)]?.name ||
                      record.toLocation ||
                      "-"}
                  </td>
                  <td className="p-3">{record.status || "-"}</td>
                  <td className="p-3">{record.items?.length || 0}</td>
                  <td className="p-3 text-right font-medium text-slate-800">
                    {fmtQty(
                      record.items?.reduce(
                        (sum, item) => sum + (Number(item.quantity) || 0),
                        0
                      ) || 0
                    )}
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
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Print View */}
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
                  <p className="text-slate-600">DC Number:</p>
                  <p className="font-semibold">{selectedChallan.dcNumber || "-"}</p>
                  <p className="text-slate-600">Date:</p>
                  <p className="font-semibold">
                    {formatDate(selectedChallan.issueDate)}
                  </p>
                  <p className="text-slate-600">E-Way Bill No:</p>
                  <p className="font-semibold">
                    {selectedChallan.eWayBillNumber || "-"}
                  </p>
                  <p className="text-slate-600">Project:</p>
                  <p className="font-semibold">{selectedProject.name || "-"}</p>
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
              </div>
              <div className="p-3">
                <p className="font-semibold">Ship To</p>
                <p>{selectedToLocation.name || selectedProject.name || "-"}</p>
                <p className="whitespace-pre-line mt-1">
                  {selectedToLocation.address ||
                    selectedChallan.toLocation ||
                    "-"}
                </p>
              </div>
            </div>

            <table className="w-full text-[11px] border-b border-slate-800">
              <thead>
                <tr className="border-b border-slate-800">
                  <th className="p-2 text-left w-10">Sl No</th>
                  <th className="p-2 text-left">Item</th>
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
                        <p className="text-[10px] text-slate-600">
                          {item.description}
                        </p>
                      )}
                    </td>
                    <td className="p-2">{item.hsn || "-"}</td>
                    <td className="p-2">{item.gst || "-"}</td>
                    <td className="p-2 text-right">
                      {item.quantity || "-"}
                    </td>
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
