import { Fragment, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  deleteReceiveGoods,
  fetchReceiveGoods,
} from "../../services/receiveGoodsApi";
import { fetchPurchaseOrders } from "../../services/purchaseOrdersApi";
import { getProjects } from "../../services/projectsStore";
import { fetchVendors } from "../../services/vendorsApi";
import { fetchLocations } from "../../services/locationsApi";
import { formatDate, parseDateValue } from "../../utils/dateFormat";
import useSettings from "../../hooks/useSettings";
import { printSection } from "../../utils/printUtils";
import { resolveBrandLogo } from "../../utils/branding";
import { buildGstSummary } from "../../utils/taxUtils";
import {
  buildReceiveProjectDetailLines,
  buildReceiveShipToText,
  isReceiveProjectDetailsVisible,
  splitDocumentText,
} from "../../utils/receiveGoodsDocument";
import DocumentViewPanel from "./DocumentViewPanel";
import PasswordPromptModal from "../common/PasswordPromptModal";
import { getClosedPoAuthError } from "../../utils/closedPoAuth";
import { getGstTaxMode } from "../../utils/gstUtils";
import {
  isCancelledPurchaseOrder,
  isLockedPurchaseOrder,
} from "../../utils/purchaseOrderStatus";

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

const toQuantity = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const toChronologyTime = (...values) => {
  for (const value of values) {
    if (!value) {
      continue;
    }
    const date = parseDateValue(value);
    const time = date ? date.getTime() : NaN;
    if (Number.isFinite(time)) {
      return time;
    }
  }
  return 0;
};

const compareReceiptChronology = (left = {}, right = {}) => {
  const leftTime = toChronologyTime(left.receivedDate, left.createdAt);
  const rightTime = toChronologyTime(right.receivedDate, right.createdAt);
  if (leftTime !== rightTime) {
    return leftTime - rightTime;
  }
  return (
    toQuantity(left.receiveGoodsId ?? left.id) -
    toQuantity(right.receiveGoodsId ?? right.id)
  );
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

const getReceiptItemQuantities = (item = {}) => {
  const originalOrdered = toQuantity(
    item.orderedQty ?? item.quantity ?? item.OrderedQty
  );
  const receiptReceived = toQuantity(
    item.receiptReceivedQty ??
      item.ReceiptReceivedQty ??
      item.receivedQty ??
      item.ReceivedQty
  );
  const cumulativeReceived = toQuantity(
    item.totalReceivedQty ??
      item.TotalReceivedQty ??
      item.receivedQty ??
      item.ReceivedQty ??
      receiptReceived
  );
  const consumed = toQuantity(
    item.receiptConsumedQty ??
      item.ReceiptConsumedQty ??
      item.consumedQty ??
      item.ConsumedQty ??
      item.totalConsumedQty ??
      item.TotalConsumedQty ??
      0
  );
  const rawAvailable =
    item.receiptAvailableQty ??
    item.ReceiptAvailableQty ??
    item.availableQty ??
    item.AvailableQty ??
    item.totalAvailableQty ??
    item.TotalAvailableQty;
  const available =
    rawAvailable === undefined || rawAvailable === null || rawAvailable === ""
      ? Math.max(receiptReceived - consumed, 0)
      : toQuantity(rawAvailable);
  const rawPoBalance =
    item.totalPoBalanceQty ??
    item.TotalPoBalanceQty ??
    item.poBalanceQty ??
    item.PoBalanceQty ??
    item.balanceQty ??
    item.BalanceQty;
  const poBalance =
    rawPoBalance === undefined || rawPoBalance === null || rawPoBalance === ""
      ? Math.max(originalOrdered - cumulativeReceived, 0)
      : toQuantity(rawPoBalance);
  return {
    ordered: originalOrdered,
    originalOrdered,
    received: receiptReceived,
    available,
    poBalance,
  };
};

const getReceiptTotals = (receipt) => {
  const lines = Array.isArray(receipt?.items) ? receipt.items : [];
  return lines.reduce(
    (acc, item) => {
      const {
        ordered,
        received,
        available,
        poBalance,
      } =
        getReceiptItemQuantities(item);
      return {
        ordered: acc.ordered + ordered,
        received: acc.received + received,
        available: acc.available + available,
        poBalance: acc.poBalance + poBalance,
      };
    },
    {
      ordered: 0,
      received: 0,
      available: 0,
      poBalance: 0,
    }
  );
};

const findMatchingPoItem = (purchaseOrder, receiptItem, index) => {
  const poItems = Array.isArray(purchaseOrder?.items) ? purchaseOrder.items : [];
  if (!poItems.length) return null;

  const receiptPoItemId =
    receiptItem.poItemId || receiptItem.POItemId || receiptItem.PurchaseOrderItemId;
  if (receiptPoItemId) {
    const exactMatch = poItems.find(
      (poItem) =>
        poItem.id === receiptPoItemId ||
        poItem.POItemId === receiptPoItemId ||
        poItem.poItemId === receiptPoItemId ||
        poItem.PurchaseOrderItemId === receiptPoItemId
    );
    if (exactMatch) return exactMatch;
  }

  const receiptItemId = receiptItem.itemId || receiptItem.ItemId;
  if (receiptItemId) {
    const itemIdMatch = poItems.find(
      (poItem) => poItem.itemId === receiptItemId || poItem.ItemId === receiptItemId
    );
    if (itemIdMatch) return itemIdMatch;
  }

  // Index fallback after ID matching (no name matching)
  if (index >= 0 && index < poItems.length) {
    return poItems[index];
  }

  return null;

};

const buildReceiptSummaryItems = (receipt, purchaseOrder) =>
  (receipt?.items || [])
    .map((item, index) => {
      const poItem = findMatchingPoItem(purchaseOrder, item, index);
      return {
        quantity: toQuantity(
          item.receiptReceivedQty ?? item.ReceiptReceivedQty ?? item.receivedQty ?? item.ReceivedQty
        ),
        unitPrice: toQuantity(poItem?.unitPrice ?? poItem?.rate ?? 0),
        taxPercentage: poItem?.taxPercentage ?? poItem?.gst ?? 0,
        gst: poItem?.gst ?? poItem?.taxPercentage ?? 0,
      };
    })
    .filter((item) => item.quantity > 0);

const ReceiveGoodsRegister = () => {
  const navigate = useNavigate();

  const [receipts, setReceipts] = useState([]);
  const [purchaseOrders, setPurchaseOrders] = useState([]);
  const [projects, setProjects] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [locations, setLocations] = useState([]);
  const [search, setSearch] = useState("");
  const [apiError, setApiError] = useState("");
  const [loading, setLoading] = useState(false);
  const [expandedId, setExpandedId] = useState(null);
  const [viewReceipt, setViewReceipt] = useState(null);
  const [filterProject, setFilterProject] = useState("");
  const [filterVendor, setFilterVendor] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [selectedReceiptIds, setSelectedReceiptIds] = useState([]);
  const [selectionError, setSelectionError] = useState("");
  const [closedPoPromptReceipt, setClosedPoPromptReceipt] = useState(null);
  const [deleteLockedReceipt, setDeleteLockedReceipt] = useState(null);
  const [adminPassword, setAdminPassword] = useState("");
  const [adminPasswordError, setAdminPasswordError] = useState("");
  const settings = useSettings();
  const company = settings?.company || {};
  const currency = settings?.preferences?.currency || "INR";
  const logoUrl = resolveBrandLogo(company.logo || "");
  const brandName = company.name || "Bangalore Electronics";
  const brandDescription = company.address || "Company address";

  const formatCurrency = (value) => {
    const amount = toQuantity(value);
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
      const [receiptList, poList, vendorList, locationList] = await Promise.all([
        fetchReceiveGoods(),
        fetchPurchaseOrders(),
        fetchVendors(),
        fetchLocations(),
      ]);
      setReceipts(Array.isArray(receiptList) ? receiptList : []);
      setPurchaseOrders(Array.isArray(poList) ? poList : []);
      setVendors(Array.isArray(vendorList) ? vendorList : []);
      setLocations(Array.isArray(locationList) ? locationList : []);
      setProjects(getProjects());
    } catch (error) {
      setApiError(
        error?.response?.data?.error ||
          error?.message ||
          "Failed to load receipts."
      );
      setReceipts([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    const refreshData = () => {
      void loadData();
    };

    window.addEventListener("purchase-orders:changed", refreshData);
    window.addEventListener("receive-goods:changed", refreshData);
    window.addEventListener("projects:changed", refreshData);
    window.addEventListener("vendors:changed", refreshData);
    window.addEventListener("locations:changed", refreshData);
    return () => {
      window.removeEventListener("purchase-orders:changed", refreshData);
      window.removeEventListener("receive-goods:changed", refreshData);
      window.removeEventListener("projects:changed", refreshData);
      window.removeEventListener("vendors:changed", refreshData);
      window.removeEventListener("locations:changed", refreshData);
    };
  }, []);

  const poMap = useMemo(() => {
    return purchaseOrders.reduce((acc, po) => {
      acc[String(po.id)] = po;
      return acc;
    }, {});
  }, [purchaseOrders]);

  const orderedReceipts = useMemo(
    () => [...receipts].sort(compareReceiptChronology),
    [receipts]
  );

  const receiptSequenceMap = useMemo(
    () =>
      orderedReceipts.reduce((acc, receipt, index) => {
        acc[String(receipt.id)] = index + 1;
        return acc;
      }, {}),
    [orderedReceipts]
  );

  const projectMap = useMemo(() => {
    return projects.reduce((acc, project) => {
      acc[String(project.id)] = project;
      return acc;
    }, {});
  }, [projects]);

  const vendorMap = useMemo(() => {
    return vendors.reduce((acc, vendor) => {
      acc[String(vendor.id)] = vendor;
      return acc;
    }, {});
  }, [vendors]);

  const locationMap = useMemo(() => {
    return locations.reduce((acc, location) => {
      acc[String(location.id)] = location;
      return acc;
    }, {});
  }, [locations]);

  const receiptMap = useMemo(() => {
    return orderedReceipts.reduce((acc, receipt) => {
      acc[String(receipt.id)] = receipt;
      return acc;
    }, {});
  }, [orderedReceipts]);

  const filteredReceipts = orderedReceipts.filter((receipt) => {
    const query = search.trim().toLowerCase();
    if (!query) return true;
    const po = poMap[String(receipt.purchaseOrderId)];
    const poNumber = po?.poNumber ?? receipt.purchaseOrderId ?? "";
    const receivedBy = receipt.receivedBy || "";
    const projectName =
      projectMap[String(receipt.projectId)]?.name?.toLowerCase() || "";
    const vendorName =
      vendorMap[String(receipt.vendorId)]?.name?.toLowerCase() || "";
    const locationName =
      locationMap[String(receipt.locationId)]?.name?.toLowerCase() ||
      locationMap[String(po?.locationId)]?.name?.toLowerCase() ||
      "";
    return [poNumber, receivedBy, projectName, vendorName, locationName]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(query));
  });

  const filteredWithSelectors = filteredReceipts.filter((receipt) => {
    const matchesProject =
      !filterProject || String(receipt.projectId) === String(filterProject);
    const matchesVendor =
      !filterVendor || String(receipt.vendorId) === String(filterVendor);
    const matchesStatus =
      !filterStatus ||
      (receipt.status || poMap[String(receipt.purchaseOrderId)]?.status || "")
        .toLowerCase() === filterStatus.toLowerCase();
    return matchesProject && matchesVendor && matchesStatus;
  });

  const selectedReceipts = useMemo(
    () =>
      selectedReceiptIds
        .map((receiptId) => receiptMap[String(receiptId)])
        .filter(Boolean),
    [receiptMap, selectedReceiptIds]
  );

  const selectedPurchaseOrderIds = useMemo(
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

  const selectedPurchaseOrderId =
    selectedPurchaseOrderIds.length === 1 ? selectedPurchaseOrderIds[0] : "";

  const visiblePurchaseOrderIds = useMemo(
    () =>
      Array.from(
        new Set(
          filteredWithSelectors
            .map((receipt) => String(receipt.purchaseOrderId || ""))
            .filter(Boolean)
        )
      ),
    [filteredWithSelectors]
  );

  const selectableVisibleReceiptIds = useMemo(() => {
    if (selectedPurchaseOrderId) {
      return filteredWithSelectors
        .filter(
          (receipt) =>
            String(receipt.purchaseOrderId || "") === selectedPurchaseOrderId
        )
        .map((receipt) => String(receipt.id));
    }
    if (visiblePurchaseOrderIds.length === 1) {
      return filteredWithSelectors.map((receipt) => String(receipt.id));
    }
    return [];
  }, [filteredWithSelectors, selectedPurchaseOrderId, visiblePurchaseOrderIds]);

  const allSelectableVisibleSelected =
    selectableVisibleReceiptIds.length > 0 &&
    selectableVisibleReceiptIds.every((receiptId) =>
      selectedReceiptIds.includes(receiptId)
    );

  useEffect(() => {
    setSelectedReceiptIds((prev) =>
      prev.filter((receiptId) => Boolean(receiptMap[String(receiptId)]))
    );
  }, [receiptMap]);

  const totalReceivedLines = useMemo(
    () => receipts.reduce((sum, rec) => sum + (rec.items?.length || 0), 0),
    [receipts]
  );

  const openOrdersImpacted = useMemo(() => {
    const set = new Set(
      receipts
        .filter((receipt) => {
          const po = poMap[String(receipt.purchaseOrderId)];
          return !isLockedPurchaseOrder(po?.status);
        })
        .map((receipt) => receipt.purchaseOrderId)
        .filter(Boolean)
    );
    return set.size;
  }, [receipts, poMap]);

  const statusBadge = (status) => {
    const label = status || "Draft";
    const base =
      isCancelledPurchaseOrder(label)
        ? "bg-rose-100 text-rose-700"
        : label.toLowerCase() === "closed"
        ? "bg-green-100 text-green-700"
        : label.toLowerCase().includes("partial")
        ? "bg-amber-100 text-amber-700"
        : "bg-slate-100 text-slate-700";
    return (
      <span className={`px-2 py-1 rounded-full text-xs font-medium ${base}`}>
        {label}
      </span>
    );
  };

  const toggleRow = (id) => {
    setExpandedId((prev) => (prev === id ? null : id));
  };

  const handleViewReceipt = (receipt) => {
    setViewReceipt(receipt);
  };

  const handlePrintReceipt = (receipt) => {
    setViewReceipt(receipt);
    setTimeout(() => {
      printSection({
        selector: "#receipts-view-panel",
        title: "Receipt Details",
        logoUrl,
        brandName,
        brandDescription,
      });
    }, 80);
  };

  const handleEditReceipt = (receipt) => {
    const po = poMap[String(receipt.purchaseOrderId)];
    if (isLockedPurchaseOrder(po?.status)) {
      setClosedPoPromptReceipt(receipt);
      setAdminPassword("");
      setAdminPasswordError("");
      return;
    }

    navigate(
      `/inventory/receive-goods?purchaseOrderId=${receipt.purchaseOrderId}&receiptId=${receipt.id}`,
      {
        state: {
          purchaseOrderId: receipt.purchaseOrderId,
          receiptId: receipt.id,
        },
      }
    );
  };

  const confirmClosedPoReceiptEdit = () => {
    const nextError = getClosedPoAuthError(settings, adminPassword);
    if (nextError) {
      setAdminPasswordError(nextError);
      return;
    }
    if (!closedPoPromptReceipt) {
      return;
    }
    navigate(
      `/inventory/receive-goods?purchaseOrderId=${closedPoPromptReceipt.purchaseOrderId}&receiptId=${closedPoPromptReceipt.id}`,
      {
        state: {
          purchaseOrderId: closedPoPromptReceipt.purchaseOrderId,
          receiptId: closedPoPromptReceipt.id,
          closedPoAuthorized: true,
        },
      }
    );
    setClosedPoPromptReceipt(null);
    setAdminPassword("");
    setAdminPasswordError("");
  };

  const executeReceiptDelete = async (receipt, { allowLockedEdit = false } = {}) => {
    if (!receipt?.id) {
      return;
    }
    try {
      setApiError("");
      await deleteReceiveGoods(receipt.id, {
        allowLockedEdit,
        auditBy: settings?.profile?.fullName || null,
      });
      if (viewReceipt?.id === receipt.id) {
        setViewReceipt(null);
      }
      if (expandedId === receipt.id) {
        setExpandedId(null);
      }
      await loadData();
    } catch (error) {
      setApiError(
        error?.response?.data?.error ||
          error?.message ||
          "Failed to delete receipt."
      );
    }
  };

  const handleDeleteReceipt = async (receipt) => {
    const po = poMap[String(receipt.purchaseOrderId)];
    const confirmed = window.confirm(
      `Delete receipt ${receiptSequenceMap[String(receipt.id)] || receipt.id}? This will update the linked purchase order receipt totals.`
    );
    if (!confirmed) {
      return;
    }
    if (isLockedPurchaseOrder(po?.status)) {
      setDeleteLockedReceipt(receipt);
      setAdminPassword("");
      setAdminPasswordError("");
      return;
    }
    await executeReceiptDelete(receipt);
  };

  const confirmClosedPoReceiptDelete = async () => {
    const nextError = getClosedPoAuthError(settings, adminPassword);
    if (nextError) {
      setAdminPasswordError(nextError);
      return;
    }
    if (!deleteLockedReceipt) {
      return;
    }
    await executeReceiptDelete(deleteLockedReceipt, { allowLockedEdit: true });
    setDeleteLockedReceipt(null);
    setAdminPassword("");
    setAdminPasswordError("");
  };

  const toggleReceiptSelection = (receipt) => {
    if (!receipt?.id) {
      return;
    }
    const receiptId = String(receipt.id);
    const receiptPoId = String(receipt.purchaseOrderId || "");
    const alreadySelected = selectedReceiptIds.includes(receiptId);

    if (
      !alreadySelected &&
      selectedPurchaseOrderId &&
      receiptPoId !== selectedPurchaseOrderId
    ) {
      setSelectionError(
        "Only receipts from the same purchase order can be selected for one delivery challan."
      );
      return;
    }

    setSelectionError("");
    setSelectedReceiptIds((prev) =>
      prev.includes(receiptId)
        ? prev.filter((id) => id !== receiptId)
        : [...prev, receiptId]
    );
  };

  const toggleVisibleReceiptSelection = () => {
    if (!filteredWithSelectors.length) {
      return;
    }

    if (!selectedPurchaseOrderId && visiblePurchaseOrderIds.length > 1) {
      setSelectionError(
        "Select receipts from one purchase order at a time. Apply a PO filter before bulk select."
      );
      return;
    }

    if (!selectableVisibleReceiptIds.length) {
      setSelectionError(
        "No receipts are selectable. Choose receipts from a single purchase order."
      );
      return;
    }

    setSelectionError("");
    setSelectedReceiptIds((prev) => {
      const allSelected = selectableVisibleReceiptIds.every((id) =>
        prev.includes(id)
      );
      if (allSelected) {
        return prev.filter((id) => !selectableVisibleReceiptIds.includes(id));
      }
      return Array.from(new Set([...prev, ...selectableVisibleReceiptIds]));
    });
  };

  const handleFetchSelectedToDeliveryChallan = () => {
    const selected = selectedReceiptIds
      .map((receiptId) => receiptMap[String(receiptId)])
      .filter(Boolean);

    if (!selected.length) {
      setSelectionError("Select at least one receipt to fetch into delivery challan.");
      return;
    }

    const uniquePoIds = Array.from(
      new Set(selected.map((receipt) => String(receipt.purchaseOrderId || "")).filter(Boolean))
    );
    if (uniquePoIds.length !== 1) {
      setSelectionError(
        "Selected receipts must belong to the same purchase order to fetch into one delivery challan."
      );
      return;
    }

    setSelectionError("");
    navigate("/inventory/delivery-challan", {
      state: {
        preselectedReceiveGoodsIds: selected
          .map((receipt) => String(receipt.id ?? "").trim())
          .filter(Boolean),
        preselectedPurchaseOrderId: uniquePoIds[0],
      },
    });
  };

  const getReceiptTaxMode = (receipt) => {
    if (String(receipt?.taxMode || "").trim().toLowerCase() === "inter") {
      return "inter";
    }
    const po = poMap[String(receipt?.purchaseOrderId)];
    const vendor = vendorMap[String(receipt?.vendorId || po?.vendorId)];
    return getGstTaxMode({
      vendorState: vendor?.state,
      vendorGstin: vendor?.gstNumber,
      companyState: company.state,
      companyGstin: company.gstin,
    });
  };

  return (
    <div className="p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between mb-6">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-slate-400">
            Inventory
          </p>
          <h1 className="text-3xl font-semibold text-slate-800">
            Receipts Register
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            View and search all goods received against purchase orders.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => navigate("/inventory/receive-goods")}
            className="px-4 py-2 rounded-lg text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700"
          >
            New Receipt
          </button>
          <button
            type="button"
            onClick={loadData}
            className="px-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-700 bg-white"
          >
            Refresh
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-white p-4 rounded-lg shadow-sm border border-slate-200">
          <p className="text-sm text-slate-500">Total Receipts</p>
          <p className="text-2xl font-semibold text-slate-800">
            {receipts.length}
          </p>
        </div>
        <div className="bg-white p-4 rounded-lg shadow-sm border border-slate-200">
          <p className="text-sm text-slate-500">Lines Received</p>
          <p className="text-2xl font-semibold text-slate-800">
            {totalReceivedLines}
          </p>
        </div>
        <div className="bg-white p-4 rounded-lg shadow-sm border border-slate-200">
          <p className="text-sm text-slate-500">Open POs Impacted</p>
          <p className="text-2xl font-semibold text-slate-800">
            {openOrdersImpacted}
          </p>
        </div>
      </div>

      {apiError && (
        <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {apiError}
        </div>
      )}
      {selectionError && (
        <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
          {selectionError}
        </div>
      )}

      <div
        id="receipts-register"
        className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-x-auto"
      >
        <div className="px-4 py-3 border-b space-y-3">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <h3 className="text-lg font-semibold text-slate-800">Receipts</h3>
            <div className="flex flex-wrap items-center gap-2">
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search PO, project, vendor, received by..."
                className="border border-slate-200 rounded-lg px-3 py-2 text-sm w-72 max-w-full"
              />
              <button
                type="button"
                onClick={toggleVisibleReceiptSelection}
                disabled={!filteredWithSelectors.length}
                className="px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-700 bg-white disabled:cursor-not-allowed disabled:opacity-60"
              >
                {allSelectableVisibleSelected ? "Clear Visible" : "Select Visible"}
              </button>
              <button
                type="button"
                onClick={handleFetchSelectedToDeliveryChallan}
                disabled={!selectedReceiptIds.length}
                className="px-3 py-2 rounded-lg text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Fetch Selected to DC ({selectedReceiptIds.length})
              </button>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <select
              value={filterProject}
              onChange={(e) => setFilterProject(e.target.value)}
              className="border border-slate-200 rounded-lg px-3 py-2 text-sm"
            >
              <option value="">All Projects</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <select
              value={filterVendor}
              onChange={(e) => setFilterVendor(e.target.value)}
              className="border border-slate-200 rounded-lg px-3 py-2 text-sm"
            >
              <option value="">All Vendors</option>
              {vendors.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </select>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="border border-slate-200 rounded-lg px-3 py-2 text-sm"
            >
              <option value="">All Status</option>
              <option value="Closed">Closed</option>
              <option value="Partially Received">Partially Received</option>
              <option value="Draft">Draft</option>
            </select>
            <p className="self-center text-xs text-slate-500">
              Selected: {selectedReceiptIds.length}
              {selectedPurchaseOrderId
                ? ` | PO ${poMap[selectedPurchaseOrderId]?.poNumber || selectedPurchaseOrderId}`
                : ""}
            </p>
          </div>
        </div>
        <table className="min-w-[1760px] text-sm">
          <thead className="bg-slate-100 text-slate-600">
            <tr>
              <th className="p-3 text-left min-w-[80px]">Select</th>
              <th className="p-3 text-left min-w-[90px]">Seq No</th>
              <th className="p-3 text-left min-w-[140px]">PO No</th>
              <th className="p-3 text-left min-w-[160px]">Project</th>
              <th className="p-3 text-left min-w-[160px]">Vendor</th>
              <th className="p-3 text-left min-w-[140px]">Location</th>
              <th className="p-3 text-left min-w-[140px]">Received Date</th>
              <th className="p-3 text-left min-w-[180px]">Invoice No / Date</th>
              <th className="p-3 text-left min-w-[140px]">Received By</th>
              <th className="p-3 text-left min-w-[220px]">Receiving Notes</th>
              <th className="p-3 text-left min-w-[120px]">Status</th>
              <th className="p-3 text-left min-w-[110px]">Items</th>
              <th className="p-3 text-left min-w-[120px]">Received Qty</th>
              <th className="p-3 text-left min-w-[120px]">Available Qty</th>
              <th className="p-3 text-left min-w-[120px]">PO Balance Qty</th>
              <th className="p-3 text-left min-w-[120px]">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan="16" className="p-6 text-center text-slate-500">
                  Loading receipts...
                </td>
              </tr>
            )}
            {!loading && filteredWithSelectors.length === 0 && (
              <tr>
                <td colSpan="16" className="p-6 text-center text-slate-500">
                  No receipts found.
                </td>
              </tr>
            )}
            {!loading &&
              filteredWithSelectors.map((receipt, index) => {
                const po = poMap[String(receipt.purchaseOrderId)];
                const project = projectMap[String(receipt.projectId || po?.projectId)];
                const vendor = vendorMap[String(receipt.vendorId || po?.vendorId)];
                const location = locationMap[String(receipt.locationId || po?.locationId)];
                const totals = getReceiptTotals(receipt);
                const isSelected = selectedReceiptIds.includes(String(receipt.id));
                const isSelectable =
                  !selectedPurchaseOrderId ||
                  String(receipt.purchaseOrderId || "") === selectedPurchaseOrderId;
                return (
                  <Fragment key={`${receipt.id ?? "receipt"}-${index}`}>
                    <tr
                      className="border-t hover:bg-slate-50 cursor-pointer"
                      onClick={() => toggleRow(receipt.id)}
                    >
                      <td
                        className="p-3"
                        onClick={(event) => event.stopPropagation()}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          disabled={!isSelectable}
                          onChange={() => toggleReceiptSelection(receipt)}
                          className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
                        />
                      </td>
                      <td className="p-3 font-medium text-slate-700">
                        {receiptSequenceMap[String(receipt.id)] || "-"}
                      </td>
                      <td className="p-3 font-medium text-slate-800">
                        {po?.poNumber || receipt.purchaseOrderId || "-"}
                      </td>
                      <td className="p-3">{project?.name || "-"}</td>
                      <td className="p-3">{vendor?.name || "-"}</td>
                      <td className="p-3">{location?.name || "-"}</td>
                      <td className="p-3">
                        {formatDate(receipt.receivedDate) || "-"}
                      </td>
                      <td className="p-3">
                        <div className="font-medium text-slate-800">
                          {receipt.invoiceNumber || "-"}
                        </div>
                        <div className="text-xs text-slate-500">
                          {formatDate(receipt.invoiceDate) || "-"}
                        </div>
                      </td>
                      <td className="p-3">{receipt.receivedBy || "-"}</td>
                      <td className="p-3 text-sm text-slate-600">
                        {receipt.notes || "-"}
                      </td>
                      <td className="p-3">
                        {statusBadge(receipt.status || po?.status)}
                      </td>
                      <td className="p-3">{receipt.items?.length || 0}</td>
                      <td className="p-3 font-medium text-slate-800">
                        {totals.received}
                      </td>
                      <td className="p-3 font-medium text-slate-800">
                        {totals.available}
                      </td>
                      <td className="p-3 font-medium text-slate-800">
                        {totals.poBalance}
                      </td>
                      <td className="p-3 flex gap-3">
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            handleEditReceipt(receipt);
                          }}
                          className="text-emerald-600 text-sm"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            handleViewReceipt(receipt);
                          }}
                          className="text-slate-700 text-sm underline"
                        >
                          View
                        </button>
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            handlePrintReceipt(receipt);
                          }}
                          className="text-slate-600 text-sm"
                        >
                          Print
                        </button>
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            void handleDeleteReceipt(receipt);
                          }}
                          className="text-red-600 text-sm"
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                    {expandedId === receipt.id && (
                      <tr className="bg-slate-50">
                        <td colSpan="16" className="p-4">
                          <div className="space-y-4">
                            <div className="flex flex-wrap gap-4 text-sm text-slate-700">
                              <span>
                                <strong>Seq No:</strong>{" "}
                                {receiptSequenceMap[String(receipt.id)] || "-"}
                              </span>
                              <span>
                                <strong>PO:</strong>{" "}
                                {po?.poNumber || receipt.purchaseOrderId || "-"}
                              </span>
                              <span>
                                <strong>Project:</strong>{" "}
                                {project?.name || "-"}
                              </span>
                              <span>
                                <strong>Vendor:</strong> {vendor?.name || "-"}
                              </span>
                              <span>
                                <strong>Vendor Address:</strong>{" "}
                                {formatAddressLine(vendor) || "-"}
                              </span>
                              <span>
                                <strong>Location:</strong>{" "}
                                {location?.name || "-"}
                              </span>
                              <span>
                                <strong>Invoice No:</strong>{" "}
                                {receipt.invoiceNumber || "-"}
                              </span>
                              <span>
                                <strong>Invoice Date:</strong>{" "}
                                {formatDate(receipt.invoiceDate) || "-"}
                              </span>
                            </div>

                            <div>
                              <h4 className="font-semibold text-slate-700 mb-2">
                                Items Received
                              </h4>
                              <div className="overflow-x-auto border rounded-md">
                                <table className="min-w-[980px] text-sm">
                                  <thead className="bg-slate-100 text-slate-600">
                                    <tr>
                                      <th className="p-2 text-left">Item</th>
                                      <th className="p-2 text-left">Description</th>
                                      <th className="p-2 text-left">Unit</th>
                                      <th className="p-2 text-left">Ordered</th>
                                      <th className="p-2 text-left">Received</th>
                                      <th className="p-2 text-left">Available</th>
                                      <th className="p-2 text-left">PO Balance</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {(receipt.items || []).map((item, idx) => {
                                      const {
                                        ordered,
                                        received,
                                        available,
                                        poBalance,
                                      } =
                                        getReceiptItemQuantities(item);
                                      const poItem = findMatchingPoItem(po, item, idx) || {};
                                      // Display saved receipt item name first, then PO item name, then identifier fallback
                                      const displayItemName =
                                        item.name ||
                                        poItem.name ||
                                        item.itemId ||
                                        item.poItemId ||
                                        `Item ${idx + 1}` ||
                                        "-";
                                      const displayDescription =
                                        item.description || poItem.description || "-";
                                      const displayUnit = item.unit || poItem.unit || "-";

                                      return (
                                        <tr
                                          key={`${receipt.id}-${item.id ?? item.itemId ?? "item"}-${idx}`}
                                          className="border-t"
                                        >
                                          <td className="p-2">{displayItemName}</td>
                                          <td className="p-2">{displayDescription}</td>
                                          <td className="p-2">{displayUnit}</td>
                                          <td className="p-2">{ordered}</td>
                                          <td className="p-2">{received}</td>
                                          <td className="p-2">{available}</td>
                                          <td className="p-2">{poBalance}</td>
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                </table>
                              </div>
                            </div>

                            <div className="text-sm text-slate-600 space-y-1">
                              <p>
                                <strong>Notes:</strong>{" "}
                                {receipt.notes || "-"}
                              </p>
                              <p>
                                <strong>Created:</strong>{" "}
                                {formatDate(receipt.createdAt) || "-"}
                              </p>
                            </div>
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
      {viewReceipt && (
        <DocumentViewPanel
          id="receipts-view-panel"
          title="GOODS RECEIPT"
          onClose={() => setViewReceipt(null)}
          companyName={brandName}
          companyAddress={brandDescription}
          companyGstin={company.gstin}
          companyPhone={company.phone}
          companyEmail={company.email}
          logoUrl={logoUrl}
          primaryPairs={[
            {
              label: "RE No",
              value: viewReceipt.id
                ? `RE-${String(viewReceipt.id).padStart(5, "0")}`
                : "-",
              printHidden: true,
            },
            {
              label: "Receipt Ref",
              value:
                poMap[String(viewReceipt.purchaseOrderId)]?.poNumber ||
                viewReceipt.id,
              printHidden: true,
            },
            { label: "Received Date", value: formatDate(viewReceipt.receivedDate) },
            { label: "Invoice No", value: viewReceipt.invoiceNumber || "-" },
            { label: "Invoice Date", value: formatDate(viewReceipt.invoiceDate) || "-" },
            {
              label: "Status",
              value:
                viewReceipt.status ||
                poMap[String(viewReceipt.purchaseOrderId)]?.status ||
                "Draft",
            },
            { label: "Received By", value: viewReceipt.receivedBy },
          ]}
          leftBlockTitle="Receive Location"
          leftBlockLines={splitDocumentText(
            viewReceipt.shipTo ||
              buildReceiveShipToText(
                locationMap[
                  String(
                    viewReceipt.locationId ||
                      poMap[String(viewReceipt.purchaseOrderId)]?.locationId
                  )
                ]
              )
          )}
          rightBlockTitle=""
          rightBlockLines={[]}
          tableColumns={[
            { key: "serial", label: "Sl No", widthClass: "w-16" },
            { key: "name", label: "Item" },
            { key: "unit", label: "Unit", widthClass: "w-20" },
            { key: "ordered", label: "Ordered", align: "right", widthClass: "w-24" },
            { key: "received", label: "Received", align: "right", widthClass: "w-24" },
            { key: "available", label: "Available", align: "right", widthClass: "w-24" },
            { key: "balance", label: "PO Balance", align: "right", widthClass: "w-24" },
          ]}
          tableRows={(viewReceipt.items || []).map((item, index) => {
            const po = poMap[String(viewReceipt.purchaseOrderId)];
            const poItem = findMatchingPoItem(po, item, index) || {};
            const {
              ordered,
              received,
              available,
              poBalance,
            } =
              getReceiptItemQuantities(item);
            return {
              id: item.id ?? item.itemId ?? index,
              serial: index + 1,
              name:
                poItem.name ||
                item.name ||
                item.itemId ||
                item.poItemId ||
                `Item ${index + 1}` ||
                "-",

              unit: item.unit || poItem.unit || "-",
              ordered,
              received,
              available,
              balance: poBalance,
            };
          })}
          bottomLeftContent={
            <div className="space-y-3 text-left">
              {isReceiveProjectDetailsVisible(viewReceipt) && (
                <div>
                  <p className="font-semibold">Project Details</p>
                  {buildReceiveProjectDetailLines(
                    projectMap[
                      String(
                        viewReceipt.projectId ||
                          poMap[String(viewReceipt.purchaseOrderId)]?.projectId
                      )
                    ]
                  ).length ? (
                    buildReceiveProjectDetailLines(
                      projectMap[
                        String(
                          viewReceipt.projectId ||
                            poMap[String(viewReceipt.purchaseOrderId)]?.projectId
                        )
                      ]
                    ).map((line, lineIndex) => (
                      <p key={`${line}-${lineIndex}`}>{line}</p>
                    ))
                  ) : (
                    <p>-</p>
                  )}
                </div>
              )}
              <div>
                <p className="font-semibold">Notes</p>
                <p>{viewReceipt.notes || "-"}</p>
              </div>
              <div>
                <p className="font-semibold">Vendor</p>
                <p>
                  {vendorMap[
                    String(
                      viewReceipt.vendorId ||
                        poMap[String(viewReceipt.purchaseOrderId)]?.vendorId
                    )
                  ]?.name || "-"}
                </p>
                <p>
                  {formatAddressLine(
                    vendorMap[
                      String(
                        viewReceipt.vendorId ||
                          poMap[String(viewReceipt.purchaseOrderId)]?.vendorId
                      )
                    ]
                  ) || "-"}
                </p>
              </div>
            </div>
          }
          bottomRightContent={
            <GstSummaryBlock
              summary={buildGstSummary(
                buildReceiptSummaryItems(
                  viewReceipt,
                  poMap[String(viewReceipt.purchaseOrderId)]
                ),
                { taxMode: getReceiptTaxMode(viewReceipt) }
              )}
              formatCurrency={formatCurrency}
              align="right"
            />
          }
          footerCompanyName={brandName || "Company"}
        />
      )}

      <PasswordPromptModal
        isOpen={Boolean(closedPoPromptReceipt)}
        title="Unlock Locked PO Receipt"
        description="Enter the admin password to edit a receipt linked to a locked purchase order."
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
          setClosedPoPromptReceipt(null);
          setAdminPassword("");
          setAdminPasswordError("");
        }}
        onConfirm={confirmClosedPoReceiptEdit}
      /> 
      <PasswordPromptModal
        isOpen={Boolean(deleteLockedReceipt)}
        title="Delete Locked PO Receipt"
        description="Enter the admin password to delete a receipt linked to a locked purchase order."
        password={adminPassword}
        error={adminPasswordError}
        confirmLabel="Delete Receipt"
        onPasswordChange={(value) => {
          setAdminPassword(value);
          if (adminPasswordError) {
            setAdminPasswordError("");
          }
        }}
        onCancel={() => {
          setDeleteLockedReceipt(null);
          setAdminPassword("");
          setAdminPasswordError("");
        }}
        onConfirm={confirmClosedPoReceiptDelete}
      />
    </div>
  );
  
};

export default ReceiveGoodsRegister;
