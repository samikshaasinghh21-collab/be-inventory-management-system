import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { getProjects } from "../../services/projectsStore";
import { fetchVendors } from "../../services/vendorsApi";
import { fetchLocations } from "../../services/locationsApi";
import { fetchPurchaseOrders } from "../../services/purchaseOrdersApi";
import { fetchReceiveGoods, saveReceiveGoods } from "../../services/receiveGoodsApi";
import useSettings from "../../hooks/useSettings";
import { formatDate } from "../../utils/dateFormat";
import { resolveBrandLogo } from "../../utils/branding";
import { buildGstSummary } from "../../utils/taxUtils";
import DocumentViewPanel from "./DocumentViewPanel";

const RECEIVE_STATUS_OPTIONS = ["Draft", "Partially Received", "Closed"];

const GstSummaryBlock = ({ summary, formatCurrency, align = "left" }) => {
  const alignClass = align === "right" ? "text-right" : "text-left";
  return (
    <div className={`space-y-1 text-sm text-slate-700 ${alignClass}`}>
      <div className="font-medium">Subtotal: {formatCurrency(summary.subtotal)}</div>
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

const getTodayDate = () => new Date().toISOString().slice(0, 10);
const toNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};
const getItemKey = (item = {}, index = 0) =>
  String(item.itemId ?? item.ItemId ?? item.id ?? item.Id ?? index);
const computeReceiveStatus = (items, fallback = "Draft") => {
  const normalized = Array.isArray(items) ? items : [];
  if (!normalized.length) return fallback;
  const anyReceived = normalized.some((item) => toNumber(item.receivedQty) > 0);
  const allReceived = normalized.every((item) => {
    const ordered = toNumber(item.orderedQty);
    return ordered === 0 || toNumber(item.receivedQty) >= ordered;
  });
  if (allReceived) return "Closed";
  if (anyReceived) return "Partially Received";
  return fallback;
};
const buildReceiveItems = (purchaseOrder, receipt) => {
  const poItems = Array.isArray(purchaseOrder?.items) ? purchaseOrder.items : [];
  const receiptItems = Array.isArray(receipt?.items) ? receipt.items : [];
  const receiptMap = receiptItems.reduce((acc, item, index) => {
    acc[getItemKey(item, index)] = item;
    return acc;
  }, {});
  return poItems.map((item, index) => {
    const matched = receiptMap[getItemKey(item, index)] ?? receiptItems[index] ?? null;
    const orderedQty = toNumber(item.quantity ?? item.orderedQty);
    const receivedQty =
      orderedQty > 0
        ? Math.min(toNumber(matched?.receivedQty), orderedQty)
        : toNumber(matched?.receivedQty);
    return {
      id: item.id ?? item.itemId ?? index,
      itemId: item.itemId ?? item.id ?? null,
      name: item.name ?? matched?.name ?? "",
      description: item.description ?? matched?.description ?? "",
      unit: item.unit ?? matched?.unit ?? "PCS",
      orderedQty,
      receivedQty,
      balanceQty: Math.max(orderedQty - receivedQty, 0),
    };
  });
};
const createReceiveForm = (purchaseOrder, receipt) => {
  const items = buildReceiveItems(purchaseOrder, receipt);
  return {
    receivedDate: receipt?.receivedDate || getTodayDate(),
    receivedBy: receipt?.receivedBy || "",
    status:
      receipt?.status ||
      computeReceiveStatus(items, purchaseOrder?.status || "Draft"),
    notes: receipt?.notes || "",
    items,
  };
};

const findMatchingPoItem = (purchaseOrder, receiptItem, index) => {
  const poItems = Array.isArray(purchaseOrder?.items) ? purchaseOrder.items : [];
  return (
    poItems.find(
      (poItem, poIndex) =>
        getItemKey(poItem, poIndex) === getItemKey(receiptItem, index)
    ) ??
    poItems[index] ??
    null
  );
};

const buildReceiptSummaryItems = (receipt, purchaseOrder) =>
  (receipt?.items || [])
    .map((item, index) => {
      const poItem = findMatchingPoItem(purchaseOrder, item, index);
      return {
        quantity: toNumber(item.receivedQty),
        unitPrice: toNumber(poItem?.unitPrice ?? poItem?.rate ?? 0),
        taxPercentage: poItem?.taxPercentage ?? poItem?.gst ?? 0,
        gst: poItem?.gst ?? poItem?.taxPercentage ?? 0,
      };
    })
    .filter((item) => item.quantity > 0);

const ReceiveGoods = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const settings = useSettings();
  const company = settings?.company || {};
  const logoUrl = resolveBrandLogo(company.logo || settings?.profile?.avatar || "");
  const brandName = company.name || "Bangalore Electronics";
  const brandDescription = company.address || "Company address";
  const currency = settings?.preferences?.currency || "INR";
  const [purchaseOrders, setPurchaseOrders] = useState([]);
  const [projects, setProjects] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [locations, setLocations] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [selectedReceipt, setSelectedReceipt] = useState(null);
  const [receiveForm, setReceiveForm] = useState(() => createReceiveForm());
  const [hasStatusOverride, setHasStatusOverride] = useState(false);
  const [purchaseOrderPreview, setPurchaseOrderPreview] = useState(null);
  const [viewReceipt, setViewReceipt] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [receiptLoading, setReceiptLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [apiError, setApiError] = useState("");
  const [saveMessage, setSaveMessage] = useState("");

  const purchaseOrderIdFromSearch = searchParams.get("purchaseOrderId") || "";
  const formatCurrency = (value) => {
    const amount = toNumber(value);
    try {
      return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency,
        maximumFractionDigits: 2,
      }).format(amount);
    } catch {
      return `${currency} ${amount.toLocaleString()}`;
    }
  };

  const loadData = async () => {
    try {
      setLoading(true);
      setApiError("");
      const [poList, vendorList, locationList] = await Promise.all([
        fetchPurchaseOrders(),
        fetchVendors(),
        fetchLocations(),
      ]);
      setPurchaseOrders(Array.isArray(poList) ? poList : []);
      setVendors(Array.isArray(vendorList) ? vendorList : []);
      setLocations(Array.isArray(locationList) ? locationList : []);
      setProjects(getProjects());
    } catch (error) {
      setApiError(
        error?.response?.data?.error ??
          error?.message ??
          "Failed to load receive-goods data."
      );
      setPurchaseOrders([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  useEffect(() => {
    const statePurchaseOrderId = location.state?.purchaseOrderId;
    if (!statePurchaseOrderId || purchaseOrderIdFromSearch) return;
    const nextSearchParams = new URLSearchParams(searchParams);
    nextSearchParams.set("purchaseOrderId", String(statePurchaseOrderId));
    setSearchParams(nextSearchParams, { replace: true });
  }, [location.state, purchaseOrderIdFromSearch, searchParams, setSearchParams]);

  useEffect(() => {
    if (!purchaseOrders.length) {
      setSelectedId("");
      return;
    }
    if (
      purchaseOrderIdFromSearch &&
      purchaseOrders.some((record) => String(record.id) === String(purchaseOrderIdFromSearch))
    ) {
      setSelectedId(String(purchaseOrderIdFromSearch));
      return;
    }
    setSelectedId((current) =>
      purchaseOrders.some((record) => String(record.id) === String(current)) ? current : ""
    );
  }, [purchaseOrders, purchaseOrderIdFromSearch]);

  const projectMap = useMemo(
    () => projects.reduce((acc, project) => ({ ...acc, [String(project.id)]: project }), {}),
    [projects]
  );
  const vendorMap = useMemo(
    () => vendors.reduce((acc, vendor) => ({ ...acc, [String(vendor.id)]: vendor }), {}),
    [vendors]
  );
  const locationMap = useMemo(
    () => locations.reduce((acc, item) => ({ ...acc, [String(item.id)]: item }), {}),
    [locations]
  );

  const filteredPurchaseOrders = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return purchaseOrders;
    return purchaseOrders.filter((record) =>
      [
        record.poNumber,
        record.status,
        projectMap[String(record.projectId)]?.name,
        vendorMap[String(record.vendorId)]?.name,
        locationMap[String(record.locationId)]?.name,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query))
    );
  }, [locationMap, projectMap, purchaseOrders, searchQuery, vendorMap]);

  const selectedPurchaseOrder =
    purchaseOrders.find((record) => String(record.id) === String(selectedId)) || null;
  const selectedProject = selectedPurchaseOrder
    ? projectMap[String(selectedPurchaseOrder.projectId)]
    : null;
  const selectedVendor = selectedPurchaseOrder
    ? vendorMap[String(selectedPurchaseOrder.vendorId)]
    : null;
  const selectedLocation = selectedPurchaseOrder
    ? locationMap[String(selectedPurchaseOrder.locationId)]
    : null;

  useEffect(() => {
    let isActive = true;
    const loadSelectedReceipt = async () => {
      if (!selectedPurchaseOrder?.id) {
        setSelectedReceipt(null);
        setReceiveForm(createReceiveForm());
        setHasStatusOverride(false);
        return;
      }
      try {
        setReceiptLoading(true);
        const receiptList = await fetchReceiveGoods(selectedPurchaseOrder.id);
        if (!isActive) return;
        const nextReceipt = Array.isArray(receiptList) ? receiptList[0] ?? null : null;
        setSelectedReceipt(nextReceipt);
        setReceiveForm(createReceiveForm(selectedPurchaseOrder, nextReceipt));
        setHasStatusOverride(false);
      } catch (error) {
        if (!isActive) return;
        setApiError(
          error?.response?.data?.error ??
            error?.message ??
            "Failed to load saved receipt details."
        );
        setSelectedReceipt(null);
        setReceiveForm(createReceiveForm(selectedPurchaseOrder));
        setHasStatusOverride(false);
      } finally {
        if (isActive) setReceiptLoading(false);
      }
    };
    void loadSelectedReceipt();
    return () => {
      isActive = false;
    };
  }, [selectedPurchaseOrder]);

  const receiveItems = useMemo(
    () =>
      (receiveForm.items || []).map((item) => ({
        ...item,
        orderedQty: toNumber(item.orderedQty),
        receivedQty: toNumber(item.receivedQty),
        balanceQty: Math.max(toNumber(item.orderedQty) - toNumber(item.receivedQty), 0),
      })),
    [receiveForm.items]
  );

  const totals = useMemo(
    () =>
      receiveItems.reduce(
        (acc, item) => ({
          ordered: acc.ordered + item.orderedQty,
          received: acc.received + item.receivedQty,
          balance: acc.balance + item.balanceQty,
        }),
        { ordered: 0, received: 0, balance: 0 }
      ),
    [receiveItems]
  );

  const totalValue = useMemo(
    () => purchaseOrders.reduce((sum, record) => sum + toNumber(record.total), 0),
    [purchaseOrders]
  );

  const openOrdersCount = useMemo(
    () => purchaseOrders.filter((record) => String(record.status || "").toLowerCase() !== "closed").length,
    [purchaseOrders]
  );

  const nextStatusPreview = selectedPurchaseOrder
    ? computeReceiveStatus(receiveItems, selectedPurchaseOrder.status || "Draft")
    : "Draft";

  const statusBadge = (status) => {
    const label = status || "Draft";
    const className =
      label.toLowerCase() === "closed"
        ? "bg-green-100 text-green-700"
        : label.toLowerCase().includes("partial")
        ? "bg-amber-100 text-amber-700"
        : "bg-slate-100 text-slate-700";
    return <span className={`rounded-full px-2 py-1 text-xs font-medium ${className}`}>{label}</span>;
  };

  const syncSelectedPurchaseOrder = (purchaseOrderId) => {
    const nextId = purchaseOrderId ? String(purchaseOrderId) : "";
    setSelectedId(nextId);
    setSaveMessage("");
    const nextSearchParams = new URLSearchParams(searchParams);
    if (nextId) nextSearchParams.set("purchaseOrderId", nextId);
    else nextSearchParams.delete("purchaseOrderId");
    setSearchParams(nextSearchParams, { replace: true });
  };

  const handleReceiveFieldChange = (field, value) => {
    if (field === "status") {
      setHasStatusOverride(true);
    }
    setReceiveForm((prev) => ({ ...prev, [field]: value }));
  };
  const handleReceiveQtyChange = (id, value) =>
    setReceiveForm((prev) => {
      const nextItems = prev.items.map((item) =>
        item.id === id
          ? {
              ...item,
              receivedQty: Math.max(
                0,
                Math.min(
                  Number.parseInt(value, 10) || 0,
                  toNumber(item.orderedQty)
                )
              ),
            }
          : item
      );

      return {
        ...prev,
        status: hasStatusOverride
          ? prev.status
          : computeReceiveStatus(
              nextItems,
              selectedPurchaseOrder?.status || "Draft"
            ),
        items: nextItems,
      };
    });

  const handleReceiveSubmit = async (event) => {
    event.preventDefault();
    if (!selectedPurchaseOrder) {
      setApiError("Select a purchase order before saving a receipt.");
      return;
    }
    try {
      setIsSaving(true);
      setApiError("");
      setSaveMessage("");
      const payload = {
        purchaseOrderId: selectedPurchaseOrder.id,
        projectId: selectedPurchaseOrder.projectId || null,
        vendorId: selectedPurchaseOrder.vendorId || null,
        locationId: selectedPurchaseOrder.locationId || null,
        receivedDate: receiveForm.receivedDate || null,
        receivedBy: receiveForm.receivedBy.trim() || null,
        notes: receiveForm.notes.trim() || null,
        status: receiveForm.status || nextStatusPreview,
        items: receiveItems.map((item) => ({
          itemId: item.itemId ?? item.id ?? null,
          name: item.name || "",
          description: item.description || "",
          unit: item.unit || "PCS",
          orderedQty: item.orderedQty,
          receivedQty: item.receivedQty,
        })),
      };
      const savedReceipt = await saveReceiveGoods(payload);
      setSelectedReceipt(savedReceipt);
      setReceiveForm(createReceiveForm(selectedPurchaseOrder, savedReceipt));
      setHasStatusOverride(false);
      setSaveMessage(`Receipt saved for ${selectedPurchaseOrder.poNumber || "selected PO"}.`);
      const refreshedPurchaseOrders = await fetchPurchaseOrders();
      setPurchaseOrders(Array.isArray(refreshedPurchaseOrders) ? refreshedPurchaseOrders : []);
    } catch (error) {
      setApiError(
        error?.response?.data?.error ?? error?.message ?? "Failed to save receipt."
      );
    } finally {
      setIsSaving(false);
    }
  };

  const viewPurchaseOrder = viewReceipt
    ? purchaseOrders.find((record) => String(record.id) === String(viewReceipt.purchaseOrderId)) || null
    : null;
  const viewProject = viewPurchaseOrder
    ? projectMap[String(viewPurchaseOrder.projectId)]
    : null;
  const viewVendor = viewPurchaseOrder
    ? vendorMap[String(viewPurchaseOrder.vendorId)]
    : null;
  const viewLocation = viewPurchaseOrder
    ? locationMap[String(viewPurchaseOrder.locationId)]
    : null;
  const viewReceiptSummary = buildGstSummary(
    buildReceiptSummaryItems(viewReceipt, viewPurchaseOrder)
  );
  const purchaseOrderPreviewProject = purchaseOrderPreview
    ? projectMap[String(purchaseOrderPreview.projectId)]
    : null;
  const purchaseOrderPreviewVendor = purchaseOrderPreview
    ? vendorMap[String(purchaseOrderPreview.vendorId)]
    : null;
  const purchaseOrderPreviewLocation = purchaseOrderPreview
    ? locationMap[String(purchaseOrderPreview.locationId)]
    : null;
  const purchaseOrderPreviewSummary = buildGstSummary(
    purchaseOrderPreview?.items || []
  );
  const purchaseOrderPreviewContact = purchaseOrderPreviewVendor?.contacts?.[0];

  return (
    <div className="p-6">
      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-slate-400">
            Inventory
          </p>
          <h1 className="text-3xl font-semibold text-slate-800">Receive Goods</h1>
          <p className="mt-1 text-sm text-slate-500">
            Open a PO, fetch its saved receipt if one exists, and update the receiving
            details from one workflow.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => navigate("/inventory/purchase-order-register")}
            className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700"
          >
            Open PO Register
          </button>
          <button
            type="button"
            onClick={() => navigate("/inventory/receive-goods-register")}
            className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700"
          >
            Receipts Register
          </button>
          <button
            type="button"
            onClick={loadData}
            className="rounded-lg bg-indigo-600 px-5 py-2 text-sm font-medium text-white hover:bg-indigo-700"
          >
            Refresh Data
          </button>
        </div>
      </div>

      <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-sm text-slate-500">Total POs</p>
          <p className="text-2xl font-semibold text-slate-800">{purchaseOrders.length}</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-sm text-slate-500">Open Orders</p>
          <p className="text-2xl font-semibold text-slate-800">{openOrdersCount}</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-sm text-slate-500">Total Value</p>
          <p className="text-2xl font-semibold text-slate-800">
            {formatCurrency(totalValue)}
          </p>
        </div>
      </div>

      {apiError && (
        <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {apiError}
        </div>
      )}
      {saveMessage && (
        <div className="mb-4 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {saveMessage}
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.1fr,1fr]">
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col gap-3 border-b px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h3 className="text-lg font-semibold text-slate-800">Purchase Orders</h3>
              <p className="text-sm text-slate-500">
                Select a PO to fetch it into the receive form.
              </p>
            </div>
            <input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search PO, vendor, project..."
              className="w-80 max-w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            />
          </div>
          <table className="w-full text-sm">
            <thead className="bg-slate-100 text-slate-600">
              <tr>
                <th className="p-3 text-left min-w-[140px]">PO No</th>
                <th className="p-3 text-left min-w-[170px]">Project</th>
                <th className="p-3 text-left min-w-[170px]">Vendor</th>
                <th className="p-3 text-left min-w-[130px]">Status</th>
                <th className="p-3 text-left min-w-[120px]">Items</th>
                <th className="p-3 text-left min-w-[140px]">Expected</th>
                <th className="p-3 text-left min-w-[120px]">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan="7" className="p-6 text-center text-slate-500">
                    Loading purchase orders...
                  </td>
                </tr>
              )}
              {!loading && filteredPurchaseOrders.length === 0 && (
                <tr>
                  <td colSpan="7" className="p-6 text-center text-slate-500">
                    {purchaseOrders.length === 0
                      ? "No purchase orders found."
                      : "No purchase orders match your search."}
                  </td>
                </tr>
              )}
              {!loading &&
                filteredPurchaseOrders.map((record) => (
                  <tr
                    key={record.id}
                    onClick={() => syncSelectedPurchaseOrder(record.id)}
                    className={`cursor-pointer border-t hover:bg-slate-50 ${
                      String(selectedId) === String(record.id) ? "bg-indigo-50/70" : ""
                    }`}
                  >
                    <td className="p-3 font-medium text-slate-800">
                      {record.poNumber || record.id}
                    </td>
                    <td className="p-3">
                      {projectMap[String(record.projectId)]?.name || "-"}
                    </td>
                    <td className="p-3">
                      {vendorMap[String(record.vendorId)]?.name || "-"}
                    </td>
                    <td className="p-3">{statusBadge(record.status)}</td>
                    <td className="p-3">{record.items?.length || 0}</td>
                    <td className="p-3">
                      {formatDate(record.expectedDate || record.orderDate) || "-"}
                    </td>
                    <td className="p-3">
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          setViewReceipt(null);
                          setPurchaseOrderPreview(record);
                        }}
                        className="text-sm text-slate-700 underline"
                      >
                        View
                      </button>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>

        <div className="space-y-4">
          {!selectedPurchaseOrder ? (
            <div className="rounded-lg border border-dashed border-slate-200 bg-white p-6 text-center text-sm text-slate-500 shadow-sm">
              Select a purchase order to fetch its details and receipt.
            </div>
          ) : (
            <>
              <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
                <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-xs uppercase tracking-[0.3em] text-slate-400">
                      PO Details
                    </p>
                    <h2 className="text-xl font-semibold text-slate-800">
                      {selectedPurchaseOrder.poNumber || "Purchase Order"}
                    </h2>
                    <p className="mt-1 text-sm text-slate-500">
                      {receiptLoading
                        ? "Fetching saved receipt..."
                        : selectedReceipt
                        ? "Existing receipt loaded."
                        : "No saved receipt found yet."}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setViewReceipt(null);
                        setPurchaseOrderPreview(selectedPurchaseOrder);
                      }}
                      className="rounded-md border border-slate-200 px-3 py-1.5 text-xs text-slate-700"
                    >
                      View Purchase Order
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (!selectedReceipt) return;
                        setPurchaseOrderPreview(null);
                        setViewReceipt(selectedReceipt);
                      }}
                      disabled={!selectedReceipt}
                      className="rounded-md border border-slate-200 px-3 py-1.5 text-xs text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      View Saved Receipt
                    </button>
                    <button
                      type="button"
                      onClick={() => syncSelectedPurchaseOrder("")}
                      className="rounded-md border border-slate-200 px-3 py-1.5 text-xs text-slate-500"
                    >
                      Clear
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
                  <div>
                    <span className="text-xs uppercase tracking-[0.2em] text-slate-400">
                      Project
                    </span>
                    <p className="font-medium text-slate-800">{selectedProject?.name || "-"}</p>
                  </div>
                  <div>
                    <span className="text-xs uppercase tracking-[0.2em] text-slate-400">
                      Vendor
                    </span>
                    <p className="font-medium text-slate-800">{selectedVendor?.name || "-"}</p>
                  </div>
                  <div>
                    <span className="text-xs uppercase tracking-[0.2em] text-slate-400">
                      Location
                    </span>
                    <p className="font-medium text-slate-800">{selectedLocation?.name || "-"}</p>
                  </div>
                  <div>
                    <span className="text-xs uppercase tracking-[0.2em] text-slate-400">
                      Status
                    </span>
                    <p className="font-medium text-slate-800">
                      {selectedPurchaseOrder.status || "-"}
                    </p>
                  </div>
                  <div>
                    <span className="text-xs uppercase tracking-[0.2em] text-slate-400">
                      Order Date
                    </span>
                    <p className="font-medium text-slate-800">
                      {formatDate(selectedPurchaseOrder.orderDate) || "-"}
                    </p>
                  </div>
                  <div>
                    <span className="text-xs uppercase tracking-[0.2em] text-slate-400">
                      Last Receipt
                    </span>
                    <p className="font-medium text-slate-800">
                      {formatDate(selectedReceipt?.receivedDate) || "-"}
                    </p>
                  </div>
                </div>
              </div>

              <form
                onSubmit={handleReceiveSubmit}
                className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm"
              >
                <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h3 className="text-base font-semibold text-slate-800">Receive Goods</h3>
                    <p className="text-xs text-slate-500">
                      Saving updates the latest receipt for this PO.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setReceiveForm(
                        createReceiveForm(selectedPurchaseOrder, selectedReceipt)
                      );
                      setHasStatusOverride(false);
                    }}
                    className="rounded-md border border-slate-200 px-3 py-1.5 text-xs text-slate-600"
                  >
                    Reset
                  </button>
                </div>

                <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className="text-sm font-medium text-slate-700">Received Date</label>
                    <input
                      type="date"
                      value={receiveForm.receivedDate}
                      onChange={(event) =>
                        handleReceiveFieldChange("receivedDate", event.target.value)
                      }
                      className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-slate-700">Received By</label>
                    <input
                      type="text"
                      value={receiveForm.receivedBy}
                      onChange={(event) =>
                        handleReceiveFieldChange("receivedBy", event.target.value)
                      }
                      className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="text-sm font-medium text-slate-700">Receipt Status</label>
                    <div className="mt-1 grid grid-cols-1 gap-3 lg:grid-cols-[260px,1fr]">
                      <select
                        value={receiveForm.status || nextStatusPreview}
                        onChange={(event) =>
                          handleReceiveFieldChange("status", event.target.value)
                        }
                        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                      >
                        {RECEIVE_STATUS_OPTIONS.map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                      <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                        Suggested from received quantities: {nextStatusPreview}
                      </div>
                    </div>
                  </div>
                  <div className="sm:col-span-2">
                    <label className="text-sm font-medium text-slate-700">Receiving Notes</label>
                    <textarea
                      value={receiveForm.notes}
                      onChange={(event) =>
                        handleReceiveFieldChange("notes", event.target.value)
                      }
                      className="mt-1 min-h-[90px] w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                    />
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-100 text-slate-600">
                      <tr>
                        <th className="p-3 text-left min-w-[160px]">Item</th>
                        <th className="p-3 text-left min-w-[90px]">Unit</th>
                        <th className="p-3 text-left min-w-[100px]">Ordered</th>
                        <th className="p-3 text-left min-w-[110px]">Received</th>
                        <th className="p-3 text-left min-w-[100px]">Balance</th>
                      </tr>
                    </thead>
                    <tbody>
                      {receiveItems.map((item, index) => (
                        <tr key={item.id ?? item.itemId ?? index} className="border-t">
                          <td className="p-3">
                            <div className="font-medium text-slate-800">{item.name || "-"}</div>
                            <div className="text-xs text-slate-500">
                              {item.description || "-"}
                            </div>
                          </td>
                          <td className="p-3">{item.unit || "-"}</td>
                          <td className="p-3">{item.orderedQty}</td>
                          <td className="p-3">
                            <input
                              type="number"
                              min="0"
                              max={item.orderedQty}
                              step="1"
                              value={item.receivedQty}
                              onChange={(event) =>
                                handleReceiveQtyChange(item.id, event.target.value)
                              }
                              className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                            />
                          </td>
                          <td className="p-3">{item.balanceQty}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="mt-4 flex flex-col gap-3 text-sm text-slate-600 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex flex-wrap gap-4">
                    <span>Ordered: {totals.ordered}</span>
                    <span>Received: {totals.received}</span>
                    <span>Balance: {totals.balance}</span>
                  </div>
                  <button
                    type="submit"
                    disabled={isSaving || receiptLoading}
                    className="rounded-lg bg-indigo-600 px-5 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isSaving ? "Saving..." : selectedReceipt ? "Update Receipt" : "Save Receipt"}
                  </button>
                </div>
              </form>
            </>
          )}
        </div>
      </div>

      {purchaseOrderPreview && (
        <DocumentViewPanel
          id="receive-goods-purchase-order-view-panel"
          title="PURCHASE ORDER"
          onClose={() => setPurchaseOrderPreview(null)}
          companyName={brandName}
          companyAddress={brandDescription}
          companyGstin={company.gstin}
          companyPhone={company.phone}
          companyEmail={company.email}
          logoUrl={logoUrl}
          primaryPairs={[
            { label: "PO No", value: purchaseOrderPreview.poNumber || purchaseOrderPreview.id },
            { label: "Date", value: formatDate(purchaseOrderPreview.orderDate) },
            { label: "Expected", value: formatDate(purchaseOrderPreview.expectedDate) },
            { label: "Status", value: purchaseOrderPreview.status },
          ]}
          leftBlockTitle="Vendor"
          leftBlockLines={[
            purchaseOrderPreviewVendor?.name || "-",
            purchaseOrderPreviewContact?.contactName ||
              purchaseOrderPreviewVendor?.email ||
              "-",
            purchaseOrderPreviewContact?.phone ||
              purchaseOrderPreviewVendor?.phone ||
              "-",
          ]}
          rightBlockTitle="Project"
          rightBlockLines={[
            purchaseOrderPreviewProject?.name || "-",
            purchaseOrderPreviewLocation?.name || "-",
            purchaseOrderPreviewProject?.client || "-",
          ]}
          tableColumns={[
            { key: "serial", label: "Sl No", widthClass: "w-16" },
            { key: "name", label: "Item" },
            { key: "description", label: "Description" },
            { key: "unit", label: "Unit", widthClass: "w-20" },
            { key: "quantity", label: "Qty", align: "right", widthClass: "w-20" },
            { key: "rate", label: "Unit Price", align: "right", widthClass: "w-24" },
            { key: "amount", label: "Amount", align: "right", widthClass: "w-28" },
          ]}
          tableRows={(purchaseOrderPreview.items || []).map((item, index) => {
            const qty = Number(item.quantity || 0);
            const rate = Number(item.rate ?? item.unitPrice ?? 0);
            const amount = Number(item.totalPrice ?? qty * rate);
            return {
              id: item.id || index,
              serial: index + 1,
              name: item.name,
              description: item.description || "-",
              unit: item.unit,
              quantity: qty,
              rate: formatCurrency(rate),
              amount: formatCurrency(amount),
            };
          })}
          bottomRightContent={
            <GstSummaryBlock
              summary={purchaseOrderPreviewSummary}
              formatCurrency={formatCurrency}
              align="right"
            />
          }
          footerCompanyName={brandName || "Company"}
          hideFooterNote
        />
      )}

      {viewReceipt && (
        <DocumentViewPanel
          id="receive-goods-view-panel"
          title="GOODS RECEIPT"
          onClose={() => setViewReceipt(null)}
          companyName={brandName}
          companyAddress={brandDescription}
          companyGstin={company.gstin}
          companyPhone={company.phone}
          companyEmail={company.email}
          logoUrl={logoUrl}
          primaryPairs={[
            { label: "Receipt Ref", value: viewPurchaseOrder?.poNumber || viewReceipt.id },
            { label: "Received Date", value: formatDate(viewReceipt.receivedDate) || "-" },
            { label: "Status", value: viewReceipt.status || viewPurchaseOrder?.status || "Draft" },
            { label: "Received By", value: viewReceipt.receivedBy || "-" },
          ]}
          leftBlockTitle="Project"
          leftBlockLines={[viewProject?.name || "-"]}
          rightBlockTitle="Vendor / Location"
          rightBlockLines={[viewVendor?.name || "-", viewLocation?.name || "-"]}
          tableColumns={[
            { key: "serial", label: "Sl No", widthClass: "w-16" },
            { key: "name", label: "Item" },
            { key: "unit", label: "Unit", widthClass: "w-20" },
            { key: "ordered", label: "Ordered", align: "right", widthClass: "w-24" },
            { key: "received", label: "Received", align: "right", widthClass: "w-24" },
            { key: "balance", label: "Balance", align: "right", widthClass: "w-24" },
          ]}
          tableRows={(viewReceipt.items || []).map((item, index) => {
            const ordered = toNumber(item.orderedQty);
            const received = toNumber(item.receivedQty);
            return {
              id: item.id ?? item.itemId ?? index,
              serial: index + 1,
              name: item.name || "-",
              unit: item.unit || "-",
              ordered,
              received,
              balance: Math.max(ordered - received, 0),
            };
          })}
          bottomLeftTitle="Notes"
          bottomLeftValue={viewReceipt.notes || "-"}
          bottomRightContent={
            <GstSummaryBlock
              summary={viewReceiptSummary}
              formatCurrency={formatCurrency}
              align="right"
            />
          }
          footerCompanyName={brandName || "Company"}
        />
      )}
    </div>
  );
};

export default ReceiveGoods;
