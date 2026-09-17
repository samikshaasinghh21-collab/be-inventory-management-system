import { AlertTriangle, ArrowUpRight, Boxes, Building2, IndianRupee, PackageCheck } from "lucide-react";
import { MetricCard, EmptyState, Skeleton } from "../components/ui";
import StatusBadge from "../components/common/StatusBadge";
import InventoryPageHeader from "../components/inventory/InventoryPageHeader";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useNotifications } from "../context/NotificationContext";
import {
  deleteItemApi,
  fetchItems,
  updateQuantityApi,
} from "../services/inventoryApi";
import { fetchVendors, syncVendorsCache } from "../services/vendorsApi";
import useSettings from "../hooks/useSettings";
import { formatInrCurrency, roundUnitPrice } from "../utils/formatters";
import AppIcon from "../components/layout/AppIcon";

const PAGE_SIZE = 12;

const STATUS_META = {
  inStock: {
    label: "In Stock",
    badgeClass: "bg-[var(--bg-subtle)] text-[var(--primary)] border-[var(--border-default)]",
    dotClass: "bg-[var(--primary)]",
  },
  lowStock: {
    label: "Low Stock",
    badgeClass: "bg-amber-50 text-amber-700 border-amber-200",
    dotClass: "bg-amber-500",
  },
  outOfStock: {
    label: "Out of Stock",
    badgeClass: "bg-red-50 text-red-700 border-red-200",
    dotClass: "bg-red-500",
  },
};

const getStockStatus = (stock, threshold) => {
  if (stock <= 0) {
    return "outOfStock";
  }
  if (threshold > 0 && stock <= threshold) {
    return "lowStock";
  }
  return "inStock";
};

const formatNumber = (value) => new Intl.NumberFormat("en-US").format(value);

const InventoryHome = () => {
  const navigate = useNavigate();
  const settings = useSettings();
  const { notifications } = useNotifications();

  const [items, setItems] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [rowActionId, setRowActionId] = useState(null);
  const [error, setError] = useState("");

  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [showLowStockOnly, setShowLowStockOnly] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);

  const lowStockThreshold = Number(settings?.inventory?.lowStockThreshold ?? 0);
  const unitLabel = settings?.inventory?.defaultUnit || "PCS";
  const itemAlerts = useMemo(() => {
    return notifications.reduce((acc, notification) => {
      if (!["warning", "critical"].includes(String(notification.severity))) {
        return acc;
      }

      const productId =
        notification.data?.productId ??
        (String(notification.entityId || "").startsWith("item:")
          ? String(notification.entityId).split(":")[1]
          : "");

      if (!productId) {
        return acc;
      }

      if (!acc[productId]) {
        acc[productId] = [];
      }
      acc[productId].push(notification);
      return acc;
    }, {});
  }, [notifications]);

  const formatCurrency = formatInrCurrency;

  const refreshItems = async () => {
    const list = await fetchItems();
    setItems(Array.isArray(list) ? list : []);
  };

  useEffect(() => {
    let isMounted = true;

    const loadInventoryPage = async () => {
      setIsLoading(true);
      setError("");
      try {
        const [itemData, vendorData] = await Promise.all([
          fetchItems(),
          fetchVendors(),
        ]);

        if (!isMounted) {
          return;
        }

        const safeItems = Array.isArray(itemData) ? itemData : [];
        const safeVendors = Array.isArray(vendorData) ? vendorData : [];

        setItems(safeItems);
        setVendors(safeVendors);
        syncVendorsCache(safeVendors);
      } catch (loadError) {
        console.error("Failed to load inventory page:", loadError);
        if (isMounted) {
          setItems([]);
          setVendors([]);
          setError(loadError?.message || "Unable to load inventory data.");
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    void loadInventoryPage();

    return () => {
      isMounted = false;
    };
  }, []);

  const rows = useMemo(() => {
    return items.map((item) => {
      const stock = Number(item.stock) || 0;
      const price = roundUnitPrice(item.price);
      const stockStatus = getStockStatus(stock, lowStockThreshold);

      return {
        ...item,
        stock,
        price,
        itemValue: stock * price,
        stockStatus,
      };
    });
  }, [items, lowStockThreshold]);

  const categories = useMemo(() => {
    return Array.from(
      new Set(rows.map((item) => item.category).filter(Boolean))
    ).sort((a, b) => a.localeCompare(b));
  }, [rows]);

  const statusCounts = useMemo(() => {
    return rows.reduce(
      (count, item) => {
        count[item.stockStatus] += 1;
        return count;
      },
      { inStock: 0, lowStock: 0, outOfStock: 0 }
    );
  }, [rows]);

  const stockValue = useMemo(() => {
    return rows.reduce((sum, item) => sum + item.itemValue, 0);
  }, [rows]);

  const filteredRows = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    return rows.filter((item) => {
      if (query) {
        const searchable = [
          item.name,
          item.category,
          item.hsn,
          item.gst,
          item.description,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();

        if (!searchable.includes(query)) {
          return false;
        }
      }

      if (categoryFilter !== "all" && item.category !== categoryFilter) {
        return false;
      }

      if (statusFilter !== "all" && item.stockStatus !== statusFilter) {
        return false;
      }

      if (showLowStockOnly && item.stockStatus !== "lowStock") {
        return false;
      }

      return true;
    });
  }, [rows, searchQuery, categoryFilter, statusFilter, showLowStockOnly]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));

  useEffect(() => {
    setCurrentPage((page) => Math.min(page, totalPages));
  }, [totalPages]);

  const pagedRows = useMemo(() => {
    const startIndex = (currentPage - 1) * PAGE_SIZE;
    return filteredRows.slice(startIndex, startIndex + PAGE_SIZE);
  }, [filteredRows, currentPage]);

  const startCount = filteredRows.length === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1;
  const endCount = Math.min(currentPage * PAGE_SIZE, filteredRows.length);

  const setFiltersAndResetPage = (changeFn) => {
    changeFn();
    setCurrentPage(1);
  };

  const resetFilters = () => {
    setSearchQuery("");
    setCategoryFilter("all");
    setStatusFilter("all");
    setShowLowStockOnly(false);
    setCurrentPage(1);
  };

  const runRowAction = async (id, action, fallbackError) => {
    if (!id) {
      return;
    }

    setError("");
    setRowActionId(id);
    try {
      await action();
      await refreshItems();
    } catch (actionError) {
      console.error(fallbackError, actionError);
      setError(actionError?.message || fallbackError);
    } finally {
      setRowActionId(null);
    }
  };

  const handleDelete = (item) => {
    const confirmed = window.confirm(`Delete "${item.name || "this item"}"?`);
    if (!confirmed) {
      return;
    }

    void runRowAction(
      item.id,
      () => deleteItemApi(item.id),
      "Unable to delete item."
    );
  };

  const handleIncreaseQty = (item) => {
    void runRowAction(
      item.id,
      () => updateQuantityApi(item.id, item.stock + 1),
      "Unable to increase stock quantity."
    );
  };

  const handleDecreaseQty = (item) => {
    if (item.stock <= 0) {
      return;
    }

    void runRowAction(
      item.id,
      () => updateQuantityApi(item.id, Math.max(0, item.stock - 1)),
      "Unable to decrease stock quantity."
    );
  };

  const topCards = [
    {
      id: "materials",
      label: "Total Materials",
      value: formatNumber(rows.length),
      hint: `${formatNumber(categories.length)} categories`,
      iconClass: "bg-[var(--bg-subtle)] text-[var(--primary)]",
      icon: <Boxes size={18} />,
    },
    {
      id: "low-stock",
      label: "Low Stock",
      value: formatNumber(statusCounts.lowStock),
      hint: `Threshold ${lowStockThreshold} ${unitLabel}`,
      iconClass: "bg-amber-100 text-amber-700",
      icon: <AlertTriangle size={18} />,
    },
    {
      id: "value",
      label: "Inventory Value",
      value: formatCurrency(stockValue),
      hint: "INR valuation",
      iconClass: "bg-emerald-100 text-emerald-700",
      icon: <IndianRupee size={18} />,
    },
    {
      id: "vendors",
      label: "Active Vendors",
      value: formatNumber(vendors.length),
      hint: "Synced vendor directory",
      iconClass: "bg-[var(--bg-subtle)] text-[var(--primary)]",
      icon: <Building2 size={18} />,
    },
  ];

  return (
    <div className="p-4 md:p-6 space-y-5">
      <InventoryPageHeader
        title={<>Inventory overview</>}
        description={<>Track materials, monitor stock levels, and move inventory faster.</>}
        actions={<><div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => navigate("/inventory/receive-goods")}
            className="inline-flex items-center rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:border-slate-300 hover:text-slate-900"
          >
            Receive Inventory
          </button>
          <button
            type="button"
            onClick={() => navigate("/inventory/create-vendors")}
            className="inline-flex items-center rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:border-slate-300 hover:text-slate-900"
          >
            Add Vendor
          </button>
          <button
            type="button"
            onClick={() => navigate("/inventory/create-product")}
            className="inline-flex items-center gap-2 rounded-lg bg-[var(--primary)] px-4 py-2.5 text-sm font-medium text-white hover:bg-[var(--primary-hover)]"
          >
            <AppIcon name="plus" className="h-4 w-4" />
            Create Product
          </button>
        </div></>}
      ></InventoryPageHeader>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Inventory metrics">
        {topCards.map((card) => <MetricCard key={card.id} label={card.label} value={isLoading ? "?" : card.value} hint={card.hint} icon={card.icon} />)}
      </section>

      <section className="inventory-attention-grid" aria-label="Stock health and priorities">
        <article className="inventory-attention-panel">
          <header><div><h2>Inventory attention</h2><p>Stock issues to resolve before the next dispatch</p></div><span className="inventory-register-count">{statusCounts.lowStock + statusCounts.outOfStock} items</span></header>
          {isLoading ? <Skeleton rows={3} /> : rows.filter((item) => item.stockStatus !== "inStock").length === 0 ? <EmptyState title="Stock levels are healthy" description="Materials below your reorder threshold will appear here." icon={<PackageCheck size={22} />} /> :
            [...rows].filter((item) => item.stockStatus !== "inStock").sort((a, b) => a.stock - b.stock).slice(0, 4).map((item) => <button type="button" className="inventory-attention-row" key={item.id} onClick={() => { setSearchQuery(item.name || ""); setStatusFilter("all"); setCurrentPage(1); setShowLowStockOnly(false); }}>
              <span className="inventory-attention-icon"><AlertTriangle size={16} /></span><div><strong>{item.name || "Unnamed material"}</strong><p>{formatNumber(item.stock)} {item.unit || unitLabel} available ? {item.category || "Uncategorized"}</p></div><StatusBadge status={STATUS_META[item.stockStatus].label} />
            </button>)}
        </article>
        <article className="inventory-attention-panel">
          <header><div><h2>Stock availability</h2><p>Current material coverage across the inventory</p></div><Boxes size={18} className="text-slate-400" /></header>
          <div className="inventory-summary-chart">
            <div className="inventory-health-bar" aria-label={`${statusCounts.inStock} in stock, ${statusCounts.lowStock} low stock, ${statusCounts.outOfStock} out of stock`}>
              {[["inStock", "var(--primary)"], ["lowStock", "var(--warning)"], ["outOfStock", "var(--danger)"]].map(([key, color]) => <span key={key} style={{ width: `${rows.length ? statusCounts[key] / rows.length * 100 : 0}%`, background: color }} />)}
            </div>
            <div className="inventory-summary-legend">{Object.entries(STATUS_META).map(([key, meta]) => <button key={key} type="button" onClick={() => setFiltersAndResetPage(() => setStatusFilter(key))}><span>{meta.label}</span><strong>{isLoading ? "?" : formatNumber(statusCounts[key])}</strong></button>)}</div>
          </div>
          <button type="button" className="inventory-attention-row" onClick={() => navigate("/inventory/receive-goods")}><span className="inventory-attention-icon"><PackageCheck size={16} /></span><div><strong>Review incoming inventory</strong><p>Open purchase orders and pending receipts</p></div><ArrowUpRight size={16} /></button>
        </article>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-[minmax(280px,1fr)_220px_220px_auto]">
          <label className="relative block">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
              <AppIcon name="search" className="h-4 w-4" />
            </span>
            <input
              aria-label="Search inventory"
              type="search"
              value={searchQuery}
              onChange={(event) =>
                setFiltersAndResetPage(() => setSearchQuery(event.target.value))
              }
              placeholder="Search material, category, GST, HSN..."
              className="w-full rounded-lg border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm text-slate-700 outline-none transition focus:border-[var(--border-default)] focus:ring-2 focus:ring-[var(--border-default)]"
            />
          </label>

          <select
            aria-label="Filter by category"
            value={categoryFilter}
            onChange={(event) =>
              setFiltersAndResetPage(() => setCategoryFilter(event.target.value))
            }
            className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none transition focus:border-[var(--border-default)] focus:ring-2 focus:ring-[var(--border-default)]"
          >
            <option value="all">All Categories</option>
            {categories.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>

          <select
            aria-label="Filter by stock status"
            value={statusFilter}
            onChange={(event) =>
              setFiltersAndResetPage(() => setStatusFilter(event.target.value))
            }
            className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none transition focus:border-[var(--border-default)] focus:ring-2 focus:ring-[var(--border-default)]"
          >
            <option value="all">All Stock Status</option>
            <option value="inStock">In Stock</option>
            <option value="lowStock">Low Stock</option>
            <option value="outOfStock">Out of Stock</option>
          </select>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() =>
                setFiltersAndResetPage(() => setShowLowStockOnly((value) => !value))
              }
              className={`rounded-lg border px-3 py-2.5 text-sm font-medium transition ${
                showLowStockOnly
                  ? "border-amber-300 bg-amber-50 text-amber-700"
                  : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:text-slate-900"
              }`}
            >
              Low Stock Only
            </button>
            <button
              type="button"
              onClick={resetFilters}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium text-slate-700 hover:border-slate-300 hover:text-slate-900"
            >
              Reset
            </button>
          </div>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-3">
        {Object.entries(STATUS_META).map(([statusKey, meta]) => {
          const isActive = statusFilter === statusKey;
          return (
            <button
              key={statusKey}
              type="button"
              onClick={() =>
                setFiltersAndResetPage(() =>
                  setStatusFilter((value) => (value === statusKey ? "all" : statusKey))
                )
              }
              className={`rounded-xl border bg-white px-4 py-3 text-left shadow-sm transition ${
                isActive
                  ? "border-[var(--border-default)] ring-2 ring-[var(--border-default)]"
                  : "border-slate-200 hover:border-slate-300"
              }`}
            >
              <p className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                <span className={`h-2.5 w-2.5 rounded-full ${meta.dotClass}`} />
                {meta.label}
              </p>
              <p className="mt-2 text-2xl font-semibold text-slate-900">
                {formatNumber(statusCounts[statusKey])}
              </p>
            </button>
          );
        })}
      </section>

      <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">All Inventory Items</h2>
            <p className="text-sm text-slate-500">
              {filteredRows.length === rows.length
                ? `${formatNumber(rows.length)} total items`
                : `${formatNumber(filteredRows.length)} filtered from ${formatNumber(rows.length)} items`}
            </p>
          </div>
          <button
            type="button"
            onClick={() => navigate("/inventory/receive-goods")}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:border-slate-300 hover:text-slate-900"
          >
            Go To Receive Goods
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-slate-700">
              <tr>
                <th className="px-4 py-3 text-left font-semibold min-w-[240px]">Material Name</th>
                <th className="px-4 py-3 text-left font-semibold min-w-[140px]">Category</th>
                <th className="px-4 py-3 text-left font-semibold min-w-[110px]">HSN</th>
                <th className="px-4 py-3 text-left font-semibold min-w-[140px]">Available Stock</th>
                <th className="px-4 py-3 text-left font-semibold min-w-[130px]">Unit Price</th>
                <th className="px-4 py-3 text-left font-semibold min-w-[120px]">Value</th>
                <th className="px-4 py-3 text-left font-semibold min-w-[130px]">Stock Status</th>
                <th className="px-4 py-3 text-left font-semibold min-w-[260px]">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr>
                  <td colSpan="8" className="px-4 py-10 text-center text-slate-500">
                    Loading inventory items...
                  </td>
                </tr>
              )}

              {!isLoading && pagedRows.length === 0 && (
                <tr>
                  <td colSpan="8" className="px-4 py-10 text-center text-slate-500">
                    No items match the selected filters.
                  </td>
                </tr>
              )}

              {!isLoading &&
                pagedRows.map((item) => {
                  const isBusy = rowActionId === item.id;
                  const status = STATUS_META[item.stockStatus];
                  const alertCount = itemAlerts[String(item.id)]?.length || 0;
                  const hasCriticalAlert = (itemAlerts[String(item.id)] || []).some(
                    (notification) => notification.severity === "critical"
                  );

                  return (
                    <tr key={item.id ?? item.name} className="border-t border-slate-100 hover:bg-slate-50/60">
                      <td className="px-4 py-3">
                        <p className="font-medium text-slate-900">{item.name || "-"}</p>
                        <p className="mt-0.5 text-xs text-slate-500 truncate max-w-[260px]">
                          {item.description || "No description"}
                        </p>
                        {alertCount > 0 && (
                          <span
                            className={`mt-2 inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                              hasCriticalAlert
                                ? "bg-red-100 text-red-700"
                                : "bg-amber-100 text-amber-700"
                            }`}
                          >
                            {alertCount} alert{alertCount === 1 ? "" : "s"}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-700">{item.category || "-"}</td>
                      <td className="px-4 py-3 text-slate-700">{item.hsn || "-"}</td>
                      <td className="px-4 py-3 text-slate-900 font-medium">
                        {formatNumber(item.stock)} {unitLabel}
                      </td>
                      <td className="px-4 py-3 text-slate-700">{formatCurrency(item.price)}</td>
                      <td className="px-4 py-3 text-slate-900 font-medium">
                        {formatCurrency(item.itemValue)}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${status.badgeClass}`}
                        >
                          {status.label}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => navigate(`/inventory/edit/${item.id}`)}
                            disabled={!item.id || isBusy}
                            className="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:border-slate-300 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => handleIncreaseQty(item)}
                            disabled={!item.id || isBusy}
                            className="rounded-md border border-[var(--border-default)] bg-[var(--bg-subtle)] px-2.5 py-1 text-xs font-medium text-[var(--primary)] hover:bg-[var(--bg-subtle)] disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            +1 Receive
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDecreaseQty(item)}
                            disabled={!item.id || isBusy || item.stock <= 0}
                            className="rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700 hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            -1 Use
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(item)}
                            disabled={!item.id || isBusy}
                            className="rounded-md border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-medium text-red-700 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60"
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

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-4 py-3 text-sm">
          <p className="text-slate-500">
            Showing {startCount} to {endCount} of {formatNumber(filteredRows.length)} entries
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
              disabled={currentPage === 1}
              className="rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-slate-700 hover:border-slate-300 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Prev
            </button>
            <span className="text-slate-600">
              Page {currentPage} of {totalPages}
            </span>
            <button
              type="button"
              onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
              disabled={currentPage >= totalPages}
              className="rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-slate-700 hover:border-slate-300 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Vendor Directory</h2>
            <p className="text-sm text-slate-500">
              {formatNumber(vendors.length)} vendors linked to inventory flow
            </p>
          </div>
          <button
            type="button"
            onClick={() => navigate("/inventory/create-vendors")}
            className="inline-flex items-center gap-2 rounded-lg bg-[var(--primary)] px-3 py-2 text-sm font-medium text-white hover:bg-[var(--primary-hover)]"
          >
            <AppIcon name="plus" className="h-4 w-4" />
            Create Vendor
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-slate-700">
              <tr>
                <th className="px-4 py-3 text-left font-semibold min-w-[190px]">Vendor Name</th>
                <th className="px-4 py-3 text-left font-semibold min-w-[160px]">Phone</th>
                <th className="px-4 py-3 text-left font-semibold min-w-[220px]">Email</th>
                <th className="px-4 py-3 text-left font-semibold min-w-[190px]">GST Number</th>
                <th className="px-4 py-3 text-left font-semibold min-w-[260px]">Address</th>
              </tr>
            </thead>
            <tbody>
              {vendors.length === 0 && (
                <tr>
                  <td colSpan="5" className="px-4 py-8 text-center text-slate-500">
                    No vendors added yet.
                  </td>
                </tr>
              )}
              {vendors.map((vendor) => (
                <tr key={vendor.id ?? vendor.VendorId} className="border-t border-slate-100 hover:bg-slate-50/60">
                  <td className="px-4 py-3 font-medium text-slate-900">
                    {vendor.name || vendor.VendorName || "-"}
                  </td>
                  <td className="px-4 py-3 text-slate-700">
                    {vendor.phone || vendor.Phone || "-"}
                  </td>
                  <td className="px-4 py-3 text-slate-700">
                    {vendor.email || vendor.Email || "-"}
                  </td>
                  <td className="px-4 py-3 text-slate-700">
                    {vendor.gstNumber || vendor.GSTNumber || "-"}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {vendor.address || vendor.Address || "-"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4 md:p-5">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h3 className="text-base font-semibold text-slate-900">
              Continue the inventory workflow
            </h3>
            <p className="text-sm text-slate-600">
              Review your product library or raise an order for materials you need.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => navigate("/inventory/products")}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:border-slate-300 hover:text-slate-900"
            >
              Product Library
            </button>
            <button
              type="button"
              onClick={() => navigate("/inventory/purchase-order")}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:border-slate-300 hover:text-slate-900"
            >
              Purchase Order
            </button>
            <button
              type="button"
              onClick={() => navigate("/inventory/create-product")}
              className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700"
            >
              <AppIcon name="plus" className="h-4 w-4" />
              Add New Product
            </button>
          </div>
        </div>
      </section>
    </div>
  );
};

export default InventoryHome;
