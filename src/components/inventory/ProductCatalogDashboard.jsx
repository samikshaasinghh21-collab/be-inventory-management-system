import React, {
  useDeferredValue,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  deleteProduct,
  getProducts,
  setProducts,
  updateProduct,
} from "../../services/productsStore";
import { deleteItemApi, fetchItems, updateItemApi } from "../../services/inventoryApi";
import useSettings from "../../hooks/useSettings";
import StatusBadge from "../common/StatusBadge";

const CATEGORY_OPTIONS = [
  "Networking",
  "Hardware",
  "Software",
  "Electrical",
  "Consumables",
  "Services",
];

const UNIT_OPTIONS = [
  "Nos",
  "PCS",
  "Set",
  "Box",
  "Bundle",
  "Meter",
  "Foot",
  "Kilogram",
  "Litre",
];

const currencyFormatter = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 2,
});

const compactFormatter = new Intl.NumberFormat("en-IN", {
  notation: "compact",
  maximumFractionDigits: 1,
});

const formatCurrency = (value) => currencyFormatter.format(Number(value) || 0);
const formatCompactNumber = (value) =>
  compactFormatter.format(Number(value) || 0);

const normalizeProduct = (product = {}) => {
  const rate = Number(product?.rate ?? product?.salesPrice ?? product?.price ?? 0);
  const stock = Number(product?.stock ?? product?.Stock ?? 0);
  const qty = Number(product?.qty ?? 0);
  const taxPercentage = Number(
    product?.taxPercentage ?? product?.TaxPercentage ?? 0
  );
  const serialRequiredRaw =
    product?.serialRequired ?? product?.SerialRequired ?? product?.IsSerialTracked ?? false;
  const serialRequired = !["0", "false", "no"].includes(
    String(serialRequiredRaw).trim().toLowerCase()
  );

  return {
    ...product,
    name: product?.name || "",
    description: product?.description || "",
    hsn: product?.hsn ? String(product.hsn) : "",
    gst: product?.gst ?? product?.GST ?? "",
    sku: product?.sku || "",
    category: product?.category || "",
    brand: product?.brand || "",
    unit: product?.unit || "Nos",
    stock: Number.isFinite(stock) ? stock : 0,
    taxPercentage: Number.isFinite(taxPercentage) ? taxPercentage : 0,
    serialRequired,
    serialNumber:
      product?.serialNumber ??
      product?.SerialNumber ??
      product?.SerialNumbe ??
      "",
    qty: Number.isFinite(qty) ? qty : 0,
    rate: Number.isFinite(rate) ? rate : 0,
    price: Number.isFinite(rate) ? rate : 0,
  };
};

const normalizeStoredProducts = (stored) =>
  (Array.isArray(stored) ? stored : []).map((product) => normalizeProduct(product));

const mergeStoredProducts = (apiItems, storedItems) => {
  const storedMap = new Map(
    (Array.isArray(storedItems) ? storedItems : []).map((item) => [
      String(item.id ?? ""),
      item,
    ])
  );

  const merged = (Array.isArray(apiItems) ? apiItems : []).map((item) => {
    const stored = storedMap.get(String(item.id ?? ""));
    if (!stored) {
      return item;
    }

    return {
      ...item,
      ...stored,
      stock: stored.stock ?? item.stock ?? 0,
      qty: stored.qty ?? item.qty ?? 0,
      serialRequired: item.serialRequired ?? stored.serialRequired ?? false,
      serialNumber:
        String(item.serialNumber ?? "").trim() ||
        String(stored.serialNumber ?? "").trim() ||
        "",
    };
  });

  const apiIds = new Set(merged.map((item) => String(item.id ?? "")));
  const extras = (Array.isArray(storedItems) ? storedItems : []).filter(
    (item) => !apiIds.has(String(item.id ?? ""))
  );

  return [...merged, ...extras];
};

function StatCard({ label, value, detail }) {
  return (
    <div className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200/70">
      <p className="text-3xl font-semibold tracking-tight text-slate-950">
        {value}
      </p>
      <p className="mt-3 text-sm font-medium text-slate-700">{label}</p>
      <p className="mt-1 text-sm leading-6 text-slate-500">{detail}</p>
    </div>
  );
}

function EmptyState({ hasFilters, onClearFilters, onCreate }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
      <div className="rounded-full bg-slate-100 px-4 py-2 text-xs font-semibold uppercase tracking-[0.25em] text-slate-500">
        No Products Found
      </div>
      <h3 className="mt-5 text-2xl font-semibold tracking-tight text-slate-950">
        No products match the current view.
      </h3>
      <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-500">
        {hasFilters
          ? "No products match the current filters. Clear the filters to see the full catalog again."
          : "Create a product to keep the catalog organized and up to date."}
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        {hasFilters && (
          <button
            type="button"
            onClick={onClearFilters}
            className="rounded-full border border-slate-200 bg-white px-5 py-2.5 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:text-slate-950"
          >
            Clear Filters
          </button>
        )}
        <button
          type="button"
          onClick={onCreate}
          className="rounded-full bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-500"
        >
          Create Product
        </button>
      </div>
    </div>
  );
}

export default function ProductCatalogDashboard() {
  const navigate = useNavigate();
  const location = useLocation();
  const settings = useSettings();
  const company = settings?.company || {};
  const profile = settings?.profile || {};
  const [items, setItems] = useState(() =>
    normalizeStoredProducts(getProducts())
  );
  const [productSearch, setProductSearch] = useState("");
  const [hsnSearch, setHsnSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const deferredProductSearch = useDeferredValue(productSearch);
  const deferredHsnSearch = useDeferredValue(hsnSearch);
  const deferredCategoryFilter = useDeferredValue(categoryFilter);
  const [editingProduct, setEditingProduct] = useState(null);
  const [editValues, setEditValues] = useState({
    name: "",
    sku: "",
    category: "",
    brand: "",
    unit: "Nos",
    hsn: "",
    rate: "",
    serialNumber: "",
    serialRequired: false,
    description: "",
  });
  const [editErrors, setEditErrors] = useState({});
  const [editApiError, setEditApiError] = useState("");

  const refreshFromStorage = () => {
    setItems(normalizeStoredProducts(getProducts()));
  };

  const loadProducts = async () => {
    const storedItems = normalizeStoredProducts(getProducts());
    try {
      const apiItems = normalizeStoredProducts(await fetchItems());
      const merged = mergeStoredProducts(apiItems, storedItems);
      setProducts(merged);
      setItems(merged);
    } catch {
      if (storedItems.length > 0) {
        setItems(storedItems);
        return;
      }
      setItems([]);
    }
  };

  useEffect(() => {
    const handleStorage = (event) => {
      if (event.key === "products") {
        refreshFromStorage();
      }
    };

    const handleProductsChanged = () => {
      refreshFromStorage();
    };

    window.addEventListener("storage", handleStorage);
    window.addEventListener("products:changed", handleProductsChanged);
    const initialLoad = window.setTimeout(() => {
      void loadProducts();
    }, 0);

    return () => {
      window.clearTimeout(initialLoad);
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener("products:changed", handleProductsChanged);
    };
  }, []);

  const updateSelection = (id, selected) => {
    const nextQty = selected ? 1 : 0;

    setItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, qty: nextQty } : item))
    );
    updateProduct(id, { qty: nextQty });
  };

  const startEdit = (product) => {
    setEditingProduct(product);
    setEditValues({
      name: product.name || "",
      sku: product.sku || "",
      category: product.category || "",
      brand: product.brand || "",
      unit: product.unit || "Nos",
      hsn: product.hsn || "",
      rate: product.rate ?? "",
      serialNumber: product.serialNumber || "",
      serialRequired: product.serialRequired ?? false,
      description: product.description || "",
    });
    setEditErrors({});
    setEditApiError("");
  };

  const cancelEdit = () => {
    setEditingProduct(null);
    setEditErrors({});
    setEditApiError("");
  };

  const validateEdit = () => {
    const nextErrors = {};
    if (!editValues.name.trim()) {
      nextErrors.name = "Product name is required.";
    }
    const rate = Number(editValues.rate);
    if (editValues.rate === "" || Number.isNaN(rate) || rate <= 0) {
      nextErrors.rate = "Enter a valid selling price.";
    }
    setEditErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleEditSave = async () => {
    if (!editingProduct || !validateEdit()) {
      return;
    }

    const updates = {
      name: editValues.name.trim(),
      sku: editValues.sku.trim(),
      category: editValues.category,
      brand: editValues.brand.trim(),
      unit: editValues.unit,
      hsn: editValues.hsn.trim(),
      rate: Number(editValues.rate),
      serialNumber: editValues.serialNumber.trim(),
      serialRequired: editValues.serialRequired ?? false,
      description: editValues.description.trim(),
      qty: editingProduct.qty ?? 0,
      stock: editingProduct.stock ?? 0,
    };

    try {
      setEditApiError("");
      const savedItem = await updateItemApi(editingProduct.id, updates);
      const nextItem = {
        ...editingProduct,
        ...updates,
        ...savedItem,
      };
      updateProduct(editingProduct.id, nextItem);
      setItems((prev) =>
        prev.map((item) =>
          item.id === editingProduct.id ? { ...item, ...nextItem } : item
        )
      );
      setEditingProduct(null);
      setEditErrors({});
    } catch (error) {
      setEditApiError(
        error?.response?.data?.error ??
          error?.message ??
          "Failed to update product."
      );
    }
  };

  const handleDelete = async (id) => {
    const target = items.find((item) => item.id === id);
    const label = target?.name || "this product";

    if (
      typeof window !== "undefined" &&
      !window.confirm(`Delete "${label}" from the product catalog?`)
    ) {
      return;
    }

    try {
      setEditApiError("");
      await deleteItemApi(id);
      deleteProduct(id);
      setItems((prev) => prev.filter((item) => item.id !== id));
    } catch (error) {
      setEditApiError(
        error?.response?.data?.error ??
          error?.message ??
          "Failed to delete product."
      );
    }
  };

  const normalizedProductSearch = deferredProductSearch.trim().toLowerCase();
  const normalizedHsnSearch = deferredHsnSearch.trim().toLowerCase();
  const normalizedCategoryFilter = deferredCategoryFilter.trim().toLowerCase();

  const filteredItems = useMemo(
    () =>
      items.filter((item) => {
        const searchableFields = [
          item.name,
          item.description,
          item.sku,
          item.brand,
          item.category,
          item.serialNumber,
        ]
          .filter(Boolean)
          .map((value) => String(value).toLowerCase());

        const matchesProduct =
          !normalizedProductSearch ||
          searchableFields.some((value) => value.includes(normalizedProductSearch));
        const matchesHsn =
          !normalizedHsnSearch ||
          String(item.hsn || "").toLowerCase().includes(normalizedHsnSearch);
        const matchesCategory =
          !normalizedCategoryFilter ||
          String(item.category || "").toLowerCase() === normalizedCategoryFilter;

        return matchesProduct && matchesHsn && matchesCategory;
      }),
    [
      items,
      normalizedCategoryFilter,
      normalizedHsnSearch,
      normalizedProductSearch,
    ]
  );

  const selectedItems = useMemo(
    () => items.filter((item) => item.qty > 0),
    [items]
  );
  const selectedLines = selectedItems.length;
  const selectedUnits = selectedItems.reduce((sum, item) => sum + item.qty, 0);
  const selectedValue = selectedItems.reduce(
    (sum, item) => sum + item.qty * item.rate,
    0
  );
  const hasFilters = Boolean(
    productSearch.trim() || hsnSearch.trim() || categoryFilter.trim()
  );
  const categoryOptions = useMemo(() => {
    const mergedCategories = new Set(CATEGORY_OPTIONS);
    items.forEach((item) => {
      if (item.category) {
        mergedCategories.add(item.category);
      }
    });
    return Array.from(mergedCategories);
  }, [items]);

  const systemStatus = useMemo(() => {
    const profileName = String(profile.fullName || "").trim();
    const companySignals = [
      company.name,
      company.email,
      company.address,
      company.gstin,
    ]
      .map((value) => String(value || "").trim())
      .filter(Boolean);

    return {
      realtimeInventory: items.length > 0,
      reportsReady: items.some((item) => Number(item.rate ?? item.price ?? 0) > 0),
      workspaceSynced: Boolean(
        companySignals.length > 0 ||
          (profileName && profileName !== "Demo Account")
      ),
    };
  }, [
    company.address,
    company.email,
    company.gstin,
    company.name,
    items,
    profile.fullName,
  ]);

  const pickParam = new URLSearchParams(location.search).get("pick");
  const isPickingForPo = pickParam === "po";
  const isPickingForBoq = pickParam === "boq";
  const selectionContextLabel = isPickingForBoq
    ? "Ready for BOQ"
    : isPickingForPo
      ? "Ready for Purchase Order"
      : "Selection Ready";
  const selectionActionClass =
    "rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-500";

  const goToCreateProduct = () => navigate("/inventory/create-product");

  const clearFilters = () => {
    setProductSearch("");
    setHsnSearch("");
    setCategoryFilter("");
  };

  const clearSelection = () => {
    const nextItems = items.map((item) =>
      item.qty > 0 ? { ...item, qty: 0 } : item
    );

    setItems(nextItems);
    setProducts(nextItems);
  };

  const sendToPurchaseOrder = () => {
    const selected = selectedItems.map((item) => ({
      id: item.id,
      name: item.name || "",
      description: item.description || "",
      unit: item.unit || "PCS",
      hsn: item.hsn || "",
      gst: item.gst || "",
      serialRequired: item.serialRequired ?? false,
      serialNumber: item.serialNumber ?? "",
      taxPercentage: item.taxPercentage ?? 0,
      rate: item.rate || 0,
      quantity: item.qty || 0,
      location: "",
    }));

    if (selected.length === 0) {
      return;
    }

    localStorage.setItem("po_selected_products", JSON.stringify(selected));
    navigate("/inventory/purchase-order");
  };

  const sendToBoq = () => {
    const selected = selectedItems.map((item) => ({
      id: item.id,
      name: item.name || "",
      description: item.description || "",
      unit: item.unit || "PCS",
      hsn: item.hsn || "",
      gst: item.gst || "",
      serialNumber: item.serialNumber ?? "",
      taxPercentage: item.taxPercentage ?? 0,
      rate: item.rate || 0,
      quantity: item.qty || 0,
      notes: "",
    }));

    if (selected.length === 0) {
      return;
    }

    localStorage.setItem("boq_selected_products", JSON.stringify(selected));
    navigate("/inventory/boq");
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <div className="mx-auto max-w-[1440px] px-4 py-6 sm:px-6 lg:px-8">
        <div className="space-y-6">
          <section className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm lg:flex-row lg:items-center lg:justify-between">
            <div className="max-w-3xl">
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">
                Inventory Workspace
              </p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">
                Product Catalog
              </h1>
              <p className="mt-2 text-sm leading-6 text-slate-500">
                Manage inventory products, pricing, and metadata.
              </p>
              <div className="mt-3 flex flex-wrap gap-3">
                <StatusBadge
                  visible={systemStatus.realtimeInventory}
                  label="Realtime Inventory Enabled"
                  description="Delivery challan and consumption totals stay aligned across registers."
                  color="green"
                />
                <StatusBadge
                  visible={systemStatus.reportsReady}
                  label="Reports Ready"
                  description="Use the reports workspace for daily movement summaries and exports."
                  color="blue"
                />
                <StatusBadge
                  visible={systemStatus.workspaceSynced}
                  label="Workspace Synced"
                  description="Profile, settings, and project-aware navigation are up to date."
                  color="purple"
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => void loadProducts()}
                className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
              >
                Refresh Catalog
              </button>
              <button
                type="button"
                onClick={goToCreateProduct}
                className="inline-flex items-center justify-center rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-500"
              >
                + Create Product
              </button>
            </div>
          </section>

          <div className="flex flex-wrap gap-2">
            <span className="inline-flex items-center rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700 ring-1 ring-inset ring-emerald-200">
              {selectionContextLabel}
            </span>
            <span className="inline-flex items-center rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700 ring-1 ring-inset ring-slate-200">
              {formatCompactNumber(selectedLines)} Lines Selected
            </span>
            <span className="inline-flex items-center rounded-full bg-sky-50 px-3 py-1 text-xs font-medium text-sky-700 ring-1 ring-inset ring-sky-200">
              {formatCompactNumber(selectedUnits)} Units
            </span>
          </div>

          {selectedLines > 0 && (
            <section className="flex flex-col gap-4 rounded-xl border border-emerald-200 bg-emerald-50/80 p-4 shadow-sm lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.28em] text-emerald-700/80">
                  Selection Ready
                </p>
                <h3 className="mt-2 text-lg font-semibold tracking-tight text-slate-950">
                  {selectedLines} lines, {selectedUnits} units
                </h3>
                <p className="mt-1 text-sm leading-6 text-emerald-950/70">
                  Estimated selection value: {formatCurrency(selectedValue)}.
                </p>
              </div>

              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={clearSelection}
                  className="rounded-xl border border-emerald-300 bg-white px-4 py-2.5 text-sm font-medium text-emerald-800 transition hover:border-emerald-400 hover:bg-emerald-100"
                >
                  Clear Selection
                </button>
                {isPickingForBoq && (
                  <button
                    type="button"
                    onClick={sendToBoq}
                    className={selectionActionClass}
                  >
                    Add to BOQ
                  </button>
                )}
                {isPickingForPo && (
                  <button
                    type="button"
                    onClick={sendToPurchaseOrder}
                    className={selectionActionClass}
                  >
                    Add to PO
                  </button>
                )}
              </div>
            </section>
          )}

          <section className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Catalog Items"
              value={formatCompactNumber(items.length)}
              detail="Products available in the catalog."
            />
            <StatCard
              label="Visible Results"
              value={formatCompactNumber(filteredItems.length)}
              detail="Products matching the current search, HSN, and category filters."
            />
            <StatCard
              label="Selected Lines"
              value={formatCompactNumber(selectedLines)}
              detail="Rows currently selected in the catalog."
            />
            <StatCard
              label="Selection Value"
              value={formatCurrency(selectedValue)}
              detail="Estimated value of the selected catalog items."
            />
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">
                  Filters
                </p>
                <h2 className="mt-2 text-xl font-semibold tracking-tight text-slate-950">
                  Search products
                </h2>
                <p className="mt-1 text-sm leading-6 text-slate-500">
                  Filter by product name, SKU, brand, HSN / SAC, or category.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
                  Showing {formatCompactNumber(filteredItems.length)} of{" "}
                  {formatCompactNumber(items.length)}
                </span>
                {hasFilters && (
                  <button
                    type="button"
                    onClick={clearFilters}
                    className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-700 transition hover:border-slate-300 hover:text-slate-950"
                  >
                    Clear Filters
                  </button>
                )}
              </div>
            </div>

            <div className="mt-5 grid gap-4 lg:grid-cols-12">
              <label className="block lg:col-span-6">
                <span className="text-sm font-medium text-slate-700">
                  Search products...
                </span>
                <input
                  className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-emerald-400 focus:bg-white focus:ring-4 focus:ring-emerald-100"
                  placeholder="Search by name, SKU, brand..."
                  value={productSearch}
                  onChange={(event) => setProductSearch(event.target.value)}
                />
              </label>

              <label className="block lg:col-span-3">
                <span className="text-sm font-medium text-slate-700">
                  HSN / SAC filter
                </span>
                <input
                  className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-emerald-400 focus:bg-white focus:ring-4 focus:ring-emerald-100"
                  placeholder="Enter HSN / SAC code"
                  value={hsnSearch}
                  onChange={(event) => setHsnSearch(event.target.value)}
                />
              </label>

              <label className="block lg:col-span-3">
                <span className="text-sm font-medium text-slate-700">
                  Category filter
                </span>
                <select
                  className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-emerald-400 focus:bg-white focus:ring-4 focus:ring-emerald-100"
                  value={categoryFilter}
                  onChange={(event) => setCategoryFilter(event.target.value)}
                >
                  <option value="">All categories</option>
                  {categoryOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </section>

          <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="flex flex-col gap-3 border-b border-slate-200 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">
                  Product Table
                </p>
                <h2 className="mt-2 text-lg font-semibold tracking-tight text-slate-950">
                  Clean catalog overview
                </h2>
              </div>
              <p className="text-sm text-slate-500">
                Sticky header, aligned pricing, and row-level actions.
              </p>
            </div>

            {filteredItems.length === 0 ? (
              <EmptyState
                hasFilters={hasFilters}
                onClearFilters={clearFilters}
                onCreate={goToCreateProduct}
              />
            ) : (
              <>
                <div className="hidden max-h-[72vh] overflow-auto lg:block">
                  <table className="min-w-full border-separate border-spacing-0 text-left text-sm">
                    <thead className="sticky top-0 z-10 bg-slate-50 text-xs uppercase tracking-[0.18em] text-slate-500">
                      <tr>
                        <th className="w-12 px-5 py-4 font-semibold">Select</th>
                        <th className="px-5 py-4 font-semibold">SKU</th>
                        <th className="px-5 py-4 font-semibold">Product Name</th>
                        <th className="px-5 py-4 font-semibold">Category</th>
                        <th className="px-5 py-4 font-semibold text-right">Price</th>
                        <th className="px-5 py-4 font-semibold text-right">Stock</th>
                        <th className="px-5 py-4 font-semibold">HSN Code</th>
                        <th className="px-5 py-4 font-semibold text-right">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {filteredItems.map((item, index) => {
                        const isSelected = item.qty > 0;
                        const rowClass =
                          index % 2 === 0 ? "bg-white" : "bg-slate-50/60";

                        return (
                          <tr
                            key={item.id}
                            className={`${rowClass} align-top transition hover:bg-emerald-50/40 ${
                              isSelected ? "bg-emerald-50/60" : ""
                            }`}
                          >
                            <td className="px-5 py-4">
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={(event) =>
                                  updateSelection(item.id, event.target.checked)
                                }
                                className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                                aria-label={`Select ${item.name || "product"}`}
                              />
                            </td>
                            <td className="px-5 py-4 font-medium text-slate-900">
                              {item.sku || "-"}
                            </td>
                            <td className="px-5 py-4">
                              <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                  <p className="font-semibold text-slate-950">
                                    {item.name || "Untitled product"}
                                  </p>
                                  {isSelected && (
                                    <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-medium text-emerald-700">
                                      Selected
                                    </span>
                                  )}
                                </div>
                                <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-500">
                                  {item.description ||
                                    "No description available for this product yet."}
                                </p>
                              </div>
                            </td>
                            <td className="px-5 py-4">
                              <span className="inline-flex rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
                                {item.category || "Unassigned category"}
                              </span>
                            </td>
                            <td className="px-5 py-4 text-right font-semibold text-slate-950">
                              {formatCurrency(item.rate ?? item.price ?? 0)}
                            </td>
                            <td className="px-5 py-4 text-right font-semibold text-slate-950">
                              {formatCompactNumber(item.stock ?? 0)}
                            </td>
                            <td className="px-5 py-4 font-medium text-slate-900">
                              {item.hsn || "-"}
                            </td>
                            <td className="px-5 py-4">
                              <div className="flex justify-end gap-2">
                                <button
                                  type="button"
                                  onClick={() => startEdit(item)}
                                  className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-950"
                                >
                                  Edit
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDelete(item.id)}
                                  className="rounded-full border border-red-200 bg-red-50 px-4 py-2 text-sm font-medium text-red-700 transition hover:border-red-300 hover:bg-red-100"
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

                <div className="space-y-4 p-4 lg:hidden">
                  {filteredItems.map((item, index) => {
                    const isSelected = item.qty > 0;
                    const cardClass =
                      index % 2 === 0 ? "bg-white" : "bg-slate-50/70";

                    return (
                      <article
                        key={item.id}
                        className={`rounded-xl border p-4 shadow-sm ${cardClass} ${
                          isSelected
                            ? "border-emerald-200 bg-emerald-50/60"
                            : "border-slate-200"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <label className="flex min-w-0 flex-1 gap-3">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={(event) =>
                                updateSelection(item.id, event.target.checked)
                              }
                              className="mt-1 h-4 w-4 shrink-0 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                              aria-label={`Select ${item.name || "product"}`}
                            />
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <h3 className="font-semibold text-slate-950">
                                  {item.name || "Untitled product"}
                                </h3>
                                {isSelected && (
                                  <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-medium text-emerald-700">
                                    Selected
                                  </span>
                                )}
                              </div>
                              <p className="mt-2 text-sm leading-6 text-slate-500">
                                {item.description ||
                                  "No description available for this product yet."}
                              </p>
                            </div>
                          </label>

                          <div className="shrink-0 text-right">
                            <p className="text-xs uppercase tracking-[0.2em] text-slate-400">
                              Price
                            </p>
                            <p className="mt-2 font-semibold text-slate-950">
                              {formatCurrency(item.rate ?? item.price ?? 0)}
                            </p>
                          </div>
                        </div>

                        <div className="mt-4 flex flex-wrap gap-2 text-xs">
                          <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-600">
                            {item.sku || "SKU not set"}
                          </span>
                          <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-600">
                            {item.category || "Unassigned category"}
                          </span>
                        </div>

                        <div className="mt-4 grid grid-cols-2 gap-3 rounded-xl bg-slate-50 p-3 text-sm">
                          <div>
                            <p className="text-xs uppercase tracking-[0.2em] text-slate-400">
                              Stock
                            </p>
                            <p className="mt-1 font-medium text-slate-950">
                              {formatCompactNumber(item.stock ?? 0)}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs uppercase tracking-[0.2em] text-slate-400">
                              HSN Code
                            </p>
                            <p className="mt-1 font-medium text-slate-950">
                              {item.hsn || "-"}
                            </p>
                          </div>
                        </div>

                        <div className="mt-4 flex gap-2">
                          <button
                            type="button"
                            onClick={() => startEdit(item)}
                            className="flex-1 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-950"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(item.id)}
                            className="flex-1 rounded-full border border-red-200 bg-red-50 px-4 py-2 text-sm font-medium text-red-700 transition hover:border-red-300 hover:bg-red-100"
                          >
                            Delete
                          </button>
                        </div>
                      </article>
                    );
                  })}
                </div>
              </>
            )}
          </section>
        </div>

        {editingProduct && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-[1px]">
            <div className="flex max-h-[92vh] w-[900px] max-w-[96vw] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
              <div className="flex items-center justify-between border-b bg-slate-50 px-6 py-4">
                <div>
                  <p className="text-xs uppercase tracking-[0.3em] text-slate-500">
                    Product Catalog
                  </p>
                  <h2 className="text-xl font-semibold text-slate-950">
                    Edit Product
                  </h2>
                </div>
                <button
                  onClick={cancelEdit}
                  className="grid h-9 w-9 place-items-center rounded-full border border-slate-200 text-slate-500 transition hover:border-slate-300 hover:text-slate-950"
                  aria-label="Close"
                  type="button"
                >
                  X
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-6">
                {editApiError && (
                  <div className="mb-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                    {editApiError}
                  </div>
                )}

                <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
                  <div className="lg:col-span-2">
                    <label className="text-sm font-medium text-slate-700">
                      Product Name *
                    </label>
                    <input
                      value={editValues.name}
                      onChange={(event) =>
                        setEditValues((prev) => ({
                          ...prev,
                          name: event.target.value,
                        }))
                      }
                      type="text"
                      className="mt-1 w-full rounded-lg border border-slate-200 px-4 py-3 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200"
                      aria-invalid={Boolean(editErrors.name)}
                    />
                    {editErrors.name && (
                      <p className="mt-1 text-sm text-red-600">
                        {editErrors.name}
                      </p>
                    )}
                  </div>

                  <div>
                    <label className="text-sm font-medium text-slate-700">
                      SKU / Part No
                    </label>
                    <input
                      value={editValues.sku}
                      onChange={(event) =>
                        setEditValues((prev) => ({
                          ...prev,
                          sku: event.target.value,
                        }))
                      }
                      type="text"
                      className="mt-1 w-full rounded-lg border border-slate-200 px-4 py-3 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200"
                    />
                  </div>

                  <div>
                    <label className="text-sm font-medium text-slate-700">
                      Category
                    </label>
                    <select
                      value={editValues.category}
                      onChange={(event) =>
                        setEditValues((prev) => ({
                          ...prev,
                          category: event.target.value,
                        }))
                      }
                      className="mt-1 w-full rounded-lg border border-slate-200 px-4 py-3 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200"
                    >
                      <option value="">Select Category</option>
                      {CATEGORY_OPTIONS.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="text-sm font-medium text-slate-700">
                      Brand
                    </label>
                    <input
                      value={editValues.brand}
                      onChange={(event) =>
                        setEditValues((prev) => ({
                          ...prev,
                          brand: event.target.value,
                        }))
                      }
                      type="text"
                      className="mt-1 w-full rounded-lg border border-slate-200 px-4 py-3 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200"
                    />
                  </div>

                  <div>
                    <label className="text-sm font-medium text-slate-700">
                      Unit
                    </label>
                    <select
                      value={editValues.unit}
                      onChange={(event) =>
                        setEditValues((prev) => ({
                          ...prev,
                          unit: event.target.value,
                        }))
                      }
                      className="mt-1 w-full rounded-lg border border-slate-200 px-4 py-3 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200"
                    >
                      {UNIT_OPTIONS.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="text-sm font-medium text-slate-700">
                      HSN / SAC
                    </label>
                    <input
                      value={editValues.hsn}
                      onChange={(event) =>
                        setEditValues((prev) => ({
                          ...prev,
                          hsn: event.target.value,
                        }))
                      }
                      type="text"
                      className="mt-1 w-full rounded-lg border border-slate-200 px-4 py-3 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200"
                    />
                  </div>

                  <div>
                    <label className="text-sm font-medium text-slate-700">
                      Selling Price *
                    </label>
                    <input
                      value={editValues.rate}
                      onChange={(event) =>
                        setEditValues((prev) => ({
                          ...prev,
                          rate: event.target.value,
                        }))
                      }
                      type="text"
                      className="mt-1 w-full rounded-lg border border-slate-200 px-4 py-3 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200"
                      aria-invalid={Boolean(editErrors.rate)}
                    />
                    {editErrors.rate && (
                      <p className="mt-1 text-sm text-red-600">
                        {editErrors.rate}
                      </p>
                    )}
                  </div>

                  <div className="lg:col-span-2">
                    <label className="text-sm font-medium text-slate-700">
                      Serial Number
                    </label>
                    <input
                      value={editValues.serialNumber}
                      onChange={(event) =>
                        setEditValues((prev) => ({
                          ...prev,
                          serialNumber: event.target.value,
                        }))
                      }
                      type="text"
                      placeholder="Type serial number manually"
                      className="mt-1 w-full rounded-lg border border-slate-200 px-4 py-3 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200"
                    />
                  </div>

                  <div className="lg:col-span-2">
                    <label className="text-sm font-medium text-slate-700">
                      Description
                    </label>
                    <textarea
                      value={editValues.description}
                      onChange={(event) =>
                        setEditValues((prev) => ({
                          ...prev,
                          description: event.target.value,
                        }))
                      }
                      className="mt-1 min-h-[120px] w-full rounded-lg border border-slate-200 px-4 py-3 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200"
                    />
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between border-t bg-slate-50 px-6 py-4">
                <p className="text-xs text-slate-500">
                  Update catalog details and keep pricing accurate.
                </p>
                <div className="flex gap-3">
                  <button
                    onClick={cancelEdit}
                    className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-700 transition hover:border-slate-300 hover:text-slate-950"
                    type="button"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleEditSave}
                    className="rounded-lg bg-emerald-600 px-5 py-2 text-sm font-medium text-white transition hover:bg-emerald-500"
                  >
                    Save Changes
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
