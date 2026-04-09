import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  deleteItemApi,
  fetchItems,
  updateItemApi,
} from "../../services/inventoryApi";
import {
  PRODUCT_CATEGORY_OPTIONS,
  PRODUCT_UNIT_OPTIONS,
} from "./productCatalogOptions";

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

const EDIT_INPUT_CLASSNAME =
  "mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-emerald-400 focus:bg-white focus:ring-4 focus:ring-emerald-100 disabled:cursor-not-allowed disabled:opacity-70";

const EDIT_SECTION_CLASSNAME =
  "rounded-[28px] border border-slate-200/80 bg-white p-5 shadow-[0_18px_45px_-38px_rgba(15,23,42,0.55)] sm:p-6";

const createEditValues = () => ({
  name: "",
  serialNumber: "",
  category: "",
  unit: "Nos",
  hsn: "",
  rate: "",
  description: "",
});

const normalizeProduct = (product = {}, selectedQty = 0) => {
  const rate = Number(product?.rate ?? product?.price ?? product?.salesPrice ?? 0);
  const qty = Number(product?.qty ?? selectedQty ?? 0);
  const stock = Number(product?.stock ?? product?.Stock ?? 0);
  const taxPercentage = Number(
    product?.taxPercentage ?? product?.TaxPercentage ?? 0
  );
  return {
    ...product,
    id: product?.id ?? product?.ItemId ?? null,
    name: product?.name || "",
    description: product?.description || "",
    serialNumber:
      product?.serialNumber ??
      product?.SerialNumber ??
      product?.serialNo ??
      product?.SerialNo ??
      "",
    hsn: product?.hsn ? String(product.hsn) : "",
    gst: product?.gst ?? product?.GST ?? "",
    sku: product?.sku || "",
    category: product?.category || "",
    brand: product?.brand || "",
    unit: product?.unit || "Nos",
    stock: Number.isFinite(stock) ? stock : 0,
    taxPercentage: Number.isFinite(taxPercentage) ? taxPercentage : 0,
    qty: Number.isFinite(qty) ? qty : 0,
    rate: Number.isFinite(rate) ? rate : 0,
  };
};

const mergeSelectionIntoProducts = (products, previousItems = []) => {
  const qtyById = new Map(
    (Array.isArray(previousItems) ? previousItems : []).map((product) => [
      String(product.id),
      Number(product.qty) || 0,
    ])
  );

  return (Array.isArray(products) ? products : []).map((product) =>
    normalizeProduct(product, qtyById.get(String(product.id)) ?? 0)
  );
};

const upsertProductIntoList = (product, previousItems = []) => {
  const normalizedProduct = normalizeProduct(product);
  let wasReplaced = false;

  const nextItems = (Array.isArray(previousItems) ? previousItems : []).map(
    (item) => {
      if (String(item.id) !== String(normalizedProduct.id)) {
        return item;
      }
      wasReplaced = true;
      return normalizeProduct(
        { ...item, ...normalizedProduct },
        Number(item.qty) || 0
      );
    }
  );

  return wasReplaced ? nextItems : [normalizedProduct, ...nextItems];
};

function LoadingState() {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
      <div className="h-12 w-12 animate-spin rounded-full border-4 border-slate-200 border-t-emerald-500" />
      <h3 className="display-font mt-5 text-3xl font-semibold text-slate-900">
        Loading product catalog
      </h3>
      <p className="mt-3 max-w-xl text-sm leading-7 text-slate-500">
        Pulling the latest products from the inventory API so the listing stays
        aligned with what is saved in the database.
      </p>
    </div>
  );
}

function StatCard({ label, value, detail, accentClass }) {
  return (
    <div className="rounded-[24px] border border-slate-200/80 bg-white/95 p-5 shadow-[0_18px_45px_-38px_rgba(15,23,42,0.7)]">
      <div className="flex items-center justify-between gap-3">
        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium uppercase tracking-[0.2em] text-slate-500">
          {label}
        </span>
        <span className={`h-2.5 w-2.5 rounded-full ${accentClass}`} />
      </div>
      <p className="display-font mt-5 text-3xl font-semibold tracking-tight text-slate-900">
        {value}
      </p>
      <p className="mt-2 text-sm leading-6 text-slate-500">{detail}</p>
    </div>
  );
}

function EmptyState({ hasFilters, onClearFilters, onCreate }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
      <div className="rounded-full bg-slate-100 px-4 py-2 text-xs font-semibold uppercase tracking-[0.25em] text-slate-500">
        No Products Found
      </div>
      <h3 className="display-font mt-5 text-3xl font-semibold text-slate-900">
        The catalog is clear and ready for the next update.
      </h3>
      <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-500">
        {hasFilters
          ? "No products match the current filters. Clear the filters to see the full catalog again."
          : "Create a product to keep your purchasing, BOQ, and cart workflows stocked with clean catalog data."}
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        {hasFilters && (
          <button
            type="button"
            onClick={onClearFilters}
            className="rounded-full border border-slate-200 bg-white px-5 py-2.5 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:text-slate-900"
          >
            Clear Filters
          </button>
        )}
        <button
          type="button"
          onClick={onCreate}
          className="rounded-full bg-slate-950 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-slate-800"
        >
          Create Product
        </button>
      </div>
    </div>
  );
}

export default function Product() {
  const [items, setItems] = useState([]);
  const [productSearch, setProductSearch] = useState("");
  const [hsnSearch, setHsnSearch] = useState("");
  const deferredProductSearch = useDeferredValue(productSearch);
  const deferredHsnSearch = useDeferredValue(hsnSearch);
  const navigate = useNavigate();
  const location = useLocation();
  const [isLoading, setIsLoading] = useState(true);
  const [apiError, setApiError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [editingProduct, setEditingProduct] = useState(null);
  const [editValues, setEditValues] = useState(createEditValues);
  const [editErrors, setEditErrors] = useState({});
  const [isSaving, setIsSaving] = useState(false);

  const loadProducts = async ({ showLoader = true } = {}) => {
    if (showLoader) {
      setIsLoading(true);
    }
    setApiError("");

    try {
      const list = await fetchItems();
      console.log("Product loadProducts normalized items:", list);
      // Preserve local selection quantities while refreshing the catalog from the API.
      setItems((prev) => mergeSelectionIntoProducts(list, prev));
    } catch (error) {
      setApiError(
        error?.response?.data?.error ??
          error?.message ??
          "Failed to load products."
      );
    } finally {
      if (showLoader) {
        setIsLoading(false);
      }
    }
  };

  useEffect(() => {
    void loadProducts();
  }, []);

  useEffect(() => {
    const navigationState = location.state ?? {};
    const nextSuccessMessage = navigationState.successMessage;
    const createdProduct = navigationState.createdProduct;
    const shouldRefreshProducts = Boolean(navigationState.refreshProducts);

    if (!nextSuccessMessage && !createdProduct && !shouldRefreshProducts) {
      return;
    }

    if (nextSuccessMessage) {
      setSuccessMessage(nextSuccessMessage);
    }
    if (createdProduct) {
      console.log("Product navigation state createdProduct:", createdProduct);
      setItems((prev) => upsertProductIntoList(createdProduct, prev));
    }
    if (shouldRefreshProducts) {
      void loadProducts({ showLoader: false });
    }

    navigate(`${location.pathname}${location.search}`, {
      replace: true,
      state: {},
    });
  }, [location.pathname, location.search, location.state, navigate]);

  const updateQty = (id, nextQty) => {
    const safeQty = Math.max(0, Number(nextQty) || 0);

    setItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, qty: safeQty } : item))
    );
  };

  const increaseQty = (id) => {
    const target = items.find((item) => item.id === id);
    updateQty(id, (target?.qty ?? 0) + 1);
  };
 
  const decreaseQty = (id) => {
    const target = items.find((item) => item.id === id);
    const nextQty = Math.max(0, (target?.qty ?? 0) - 1);
    updateQty(id, nextQty);
  };
 
  const toggleSelected = (id, checked) => {
    updateQty(id, checked ? 1 : 0);
  };

  const clearSelection = () => {
    const nextItems = items.map((item) =>
      item.qty > 0 ? { ...item, qty: 0 } : item
    );

    setItems(nextItems);
  };

  const startEdit = (product) => {
    setEditingProduct(product);
    setEditValues({
      name: product.name || "",
      serialNumber: product.serialNumber || "",
      category: product.category || "",
      unit: product.unit || "Nos",
      hsn: product.hsn || "",
      rate: product.rate ?? "",
      description: product.description || "",
    });
    setEditErrors({});
  };

  const cancelEdit = () => {
    setEditingProduct(null);
    setEditValues(createEditValues());
    setEditErrors({});
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

  const updateEditField = (key, value) => {
    setEditValues((prev) => ({
      ...prev,
      [key]: value,
    }));

    if (editErrors[key]) {
      setEditErrors((prev) => ({
        ...prev,
        [key]: undefined,
      }));
    }
  };

  const handleEditSave = async () => {
    if (!editingProduct || !validateEdit() || isSaving) {
      return;
    }

    const updates = {
      name: editValues.name.trim(),
      category: editValues.category,
      serialNumber: editValues.serialNumber.trim() || null,
      unit: editValues.unit,
      hsn: editValues.hsn.trim(),
      price: Number(editValues.rate),
      description: editValues.description.trim(),
      stock: editingProduct.stock ?? 0,
      gst: editingProduct.gst || "",
      taxPercentage: editingProduct.taxPercentage ?? 0,
    };
    console.log("Product handleEditSave payload:", {
      id: editingProduct.id,
      updates,
    });

    setIsSaving(true);
    setApiError("");

    try {
      const updated = await updateItemApi(editingProduct.id, updates);
      setItems((prev) =>
        prev.map((item) =>
          item.id === editingProduct.id
            ? normalizeProduct({ ...item, ...updated }, item.qty)
            : item
        )
      );
      setSuccessMessage(
        `${updated.name || editValues.name.trim() || "Product"} updated successfully.`
      );
      setEditingProduct(null);
      setEditValues(createEditValues());
      setEditErrors({});
    } catch (error) {
      setApiError(
        error?.response?.data?.error ??
          error?.message ??
          "Failed to update product."
      );
    } finally {
      setIsSaving(false);
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

    setApiError("");

    try {
      await deleteItemApi(id);
      setItems((prev) => prev.filter((item) => item.id !== id));
      setSuccessMessage(`${label} deleted successfully.`);
    } catch (error) {
      setApiError(
        error?.response?.data?.error ??
          error?.message ??
          "Failed to delete product."
      );
    }
  };

  const normalizedProductSearch = deferredProductSearch.trim().toLowerCase();
  const normalizedHsnSearch = deferredHsnSearch.trim().toLowerCase();

  const filteredItems = useMemo(
    () =>
      items.filter((item) => {
        const searchableFields = [
          item.name,
          item.description,
          item.serialNumber,
          item.sku,
          item.brand,
          item.category,
        ]
          .filter(Boolean)
          .map((value) => String(value).toLowerCase());

        const matchesProduct =
          !normalizedProductSearch ||
          searchableFields.some((value) => value.includes(normalizedProductSearch));
        const matchesHsn =
          !normalizedHsnSearch ||
          String(item.hsn || "").toLowerCase().includes(normalizedHsnSearch);

        return matchesProduct && matchesHsn;
      }),
    [items, normalizedHsnSearch, normalizedProductSearch]
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
  const distinctCategories = new Set(
    items.map((item) => item.category).filter(Boolean)
  ).size;
  const hasActiveSelection = selectedLines > 0;
  const hasFilters = Boolean(productSearch.trim() || hsnSearch.trim());

  const openCart = () => {
    localStorage.setItem("inventoryCart", JSON.stringify(selectedItems));
    navigate("/inventory/cart");
  };

  const goToCreateProduct = () => {
    navigate("/inventory/create-product");
  };

  const pickParam = new URLSearchParams(location.search).get("pick");
  const isPickingForPo = pickParam === "po";
  const isPickingForBoq = pickParam === "boq";

  const sendToPurchaseOrder = () => {
    const selected = selectedItems.map((item) => ({
      id: item.id,
      name: item.name || "",
      description: item.description || "",
      serialNumber: item.serialNumber || "",
      unit: item.unit || "PCS",
      hsn: item.hsn || "",
      gst: item.gst || "",
      taxPercentage: item.taxPercentage ?? 0,
      rate: item.rate || 0,
      quantity: item.qty || 0,
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
      serialNumber: item.serialNumber || "",
      unit: item.unit || "PCS",
      hsn: item.hsn || "",
      gst: item.gst || "",
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

  const clearFilters = () => {
    setProductSearch("");
    setHsnSearch("");
  };

  const selectionContextLabel = isPickingForPo
    ? "purchase order"
    : isPickingForBoq
      ? "BOQ"
      : "cart";

  const selectionHeadline = isPickingForPo
    ? "These products are ready to move into the purchase order."
    : isPickingForBoq
      ? "These products are ready to move into the BOQ."
      : "Your selected products are ready for the cart.";

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#edf4f6_0%,#f8fafc_28%,#eef2f7_100%)]">
      <div className="mx-auto max-w-[1600px] p-4 sm:p-6 lg:p-8">
        <section className="relative overflow-hidden rounded-[32px] border border-slate-200/80 bg-slate-950 px-6 py-7 text-white shadow-[0_35px_90px_-50px_rgba(15,23,42,0.95)] sm:px-8 sm:py-9">
          <div className="absolute -right-16 -top-14 h-56 w-56 rounded-full bg-emerald-400/20 blur-3xl" />
          <div className="absolute bottom-0 left-1/3 h-40 w-40 rounded-full bg-sky-400/10 blur-3xl" />
          <div className="absolute inset-y-0 right-0 w-1/2 bg-gradient-to-l from-white/[0.04] to-transparent" />

          <div className="relative flex flex-col gap-8 xl:flex-row xl:items-end xl:justify-between">
            <div className="max-w-3xl">
              <p className="text-xs uppercase tracking-[0.35em] text-emerald-200/80">
                Inventory Control
              </p>
              <h1 className="display-font mt-4 text-4xl font-semibold tracking-tight text-white sm:text-5xl">
                Product Catalog
              </h1>
              <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-300 sm:text-base">
                A cleaner, more professional workspace for browsing products,
                updating pricing, and sending selected lines into purchasing
                flows without the clutter.
              </p>

              <div className="mt-6 flex flex-wrap gap-3">
                <span className="rounded-full border border-white/10 bg-white/10 px-4 py-2 text-sm text-slate-100 backdrop-blur">
                  Ready for {selectionContextLabel}
                </span>
                <span className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-200">
                  {selectedLines} lines selected
                </span>
                <span className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-200">
                  {selectedUnits} units
                </span>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:w-[460px]">
              <button
                type="button"
                onClick={() => void loadProducts()}
                disabled={isLoading}
                className="rounded-2xl border border-white/15 bg-white/10 px-5 py-3 text-sm font-medium text-white transition hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isLoading ? "Refreshing..." : "Refresh Catalog"}
              </button>
              <button
                type="button"
                onClick={goToCreateProduct}
                className="rounded-2xl bg-emerald-400 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-emerald-300"
              >
                Create Product
              </button>
              <button
                type="button"
                onClick={openCart}
                disabled={!hasActiveSelection}
                className="rounded-2xl border border-white/15 bg-white px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-white/10 disabled:text-slate-400"
              >
                Add to Cart
              </button>
              {isPickingForPo && (
                <button
                  type="button"
                  onClick={sendToPurchaseOrder}
                  disabled={!hasActiveSelection}
                  className="rounded-2xl bg-sky-400 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-sky-300 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
                >
                  Add to PO
                </button>
              )}
              {isPickingForBoq && (
                <button
                  type="button"
                  onClick={sendToBoq}
                  disabled={!hasActiveSelection}
                  className="rounded-2xl bg-teal-400 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-teal-300 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
                >
                  Add to BOQ
                </button>
              )}
            </div>
          </div>
        </section>

        {(successMessage || apiError) && (
          <section className="mt-6 space-y-3">
            {successMessage && (
              <div className="rounded-[22px] border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm text-emerald-800 shadow-[0_16px_40px_-34px_rgba(21,128,61,0.65)]">
                {successMessage}
              </div>
            )}
            {apiError && (
              <div className="rounded-[22px] border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700 shadow-[0_16px_40px_-34px_rgba(220,38,38,0.55)]">
                {apiError}
              </div>
            )}
          </section>
        )}

        <section className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="Catalog Items"
            value={items.length}
            detail="Products currently synced from the inventory API."
            accentClass="bg-emerald-500"
          />
          <StatCard
            label="Visible Results"
            value={filteredItems.length}
            detail="Products matching the current search and HSN filters."
            accentClass="bg-sky-500"
          />
          <StatCard
            label="Selected Lines"
            value={selectedLines}
            detail="Product rows currently marked and ready for downstream work."
            accentClass="bg-amber-500"
          />
          <StatCard
            label="Selection Value"
            value={formatCurrency(selectedValue)}
            detail="Estimated value of the current selection based on selling price."
            accentClass="bg-fuchsia-500"
          />
        </section>

        <section className="mt-6 overflow-hidden rounded-[28px] border border-slate-200/80 bg-white/95 shadow-[0_22px_60px_-42px_rgba(15,23,42,0.6)]">
          <div className="flex flex-col gap-5 border-b border-slate-200 px-5 py-5 lg:flex-row lg:items-end lg:justify-between lg:px-6">
            <div>
              <p className="text-xs uppercase tracking-[0.28em] text-slate-400">
                Refine View
              </p>
              <h2 className="display-font mt-2 text-2xl font-semibold tracking-tight text-slate-900">
                Search and shortlist products
              </h2>
              <p className="mt-2 text-sm leading-6 text-slate-500">
                Find products by name, description, serial number, category, or
                HSN code without losing pricing context.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <span className="rounded-full bg-slate-100 px-4 py-2 text-sm font-medium text-slate-600">
                {distinctCategories || 0} categories mapped
              </span>
              {hasFilters && (
                <button
                  type="button"
                  onClick={clearFilters}
                  className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:text-slate-900"
                >
                  Clear Filters
                </button>
              )}
            </div>
          </div>

          <div className="grid gap-4 px-5 py-5 lg:grid-cols-[minmax(0,1.7fr)_minmax(260px,1fr)] lg:px-6">
            <label className="block">
              <span className="text-sm font-medium text-slate-700">
                Search catalog
              </span>
              <input
                className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-emerald-400 focus:bg-white focus:ring-4 focus:ring-emerald-100"
                placeholder="Search by name, serial number, category, or description"
                value={productSearch}
                onChange={(event) => setProductSearch(event.target.value)}
              />
            </label>

            <label className="block">
              <span className="text-sm font-medium text-slate-700">
                Filter by HSN / SAC
              </span>
              <input
                className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-emerald-400 focus:bg-white focus:ring-4 focus:ring-emerald-100"
                placeholder="Enter HSN / SAC code"
                value={hsnSearch}
                onChange={(event) => setHsnSearch(event.target.value)}
              />
            </label>
          </div>
        </section>

        {hasActiveSelection && (
          <section className="mt-6 flex flex-col gap-4 rounded-[26px] border border-emerald-200 bg-emerald-50/90 p-5 shadow-[0_16px_40px_-34px_rgba(15,118,110,0.7)] lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.28em] text-emerald-700/80">
                Selection Ready
              </p>
              <h3 className="mt-2 text-xl font-semibold text-slate-900">
                {selectionHeadline}
              </h3>
              <p className="mt-2 text-sm leading-6 text-emerald-950/70">
                {selectedLines} product lines, {selectedUnits} units, and{" "}
                {formatCurrency(selectedValue)} in estimated value are currently
                selected.
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={clearSelection}
                className="rounded-full border border-emerald-300 bg-white px-5 py-2.5 text-sm font-medium text-emerald-800 transition hover:border-emerald-400 hover:bg-emerald-100"
              >
                Clear Selection
              </button>
              <button
                type="button"
                onClick={openCart}
                className="rounded-full bg-slate-950 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800"
              >
                Add to Cart
              </button>
              {isPickingForPo && (
                <button
                  type="button"
                  onClick={sendToPurchaseOrder}
                  className="rounded-full bg-sky-500 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-sky-600"
                >
                  Add to PO
                </button>
              )}
              {isPickingForBoq && (
                <button
                  type="button"
                  onClick={sendToBoq}
                  className="rounded-full bg-teal-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-teal-700"
                >
                  Add to BOQ
                </button>
              )}
            </div>
          </section>
        )}

        <section className="mt-6 overflow-hidden rounded-[28px] border border-slate-200/80 bg-white/95 shadow-[0_22px_60px_-42px_rgba(15,23,42,0.6)]">
          <div className="flex flex-col gap-4 border-b border-slate-200 px-5 py-5 lg:flex-row lg:items-end lg:justify-between lg:px-6">
            <div>
              <p className="text-xs uppercase tracking-[0.28em] text-slate-400">
                Catalog Register
              </p>
              <h2 className="display-font mt-2 text-2xl font-semibold tracking-tight text-slate-900">
                Professionally organized product list
              </h2>
              <p className="mt-2 text-sm leading-6 text-slate-500">
                Each row keeps API-synced catalog details, pick quantity, and
                pricing aligned for purchase orders, BOQs, and cart handoff.
              </p>
            </div>

          <div className="flex flex-wrap gap-2">
              <span className="rounded-full bg-slate-100 px-4 py-2 text-sm font-medium text-slate-600">
                Showing {filteredItems.length} of {items.length}
              </span>
              <span className="rounded-full bg-slate-100 px-4 py-2 text-sm font-medium text-slate-600">
                Qty {formatCompactNumber(selectedUnits)}
              </span>
            </div>
          </div>

          {isLoading ? (
            <LoadingState />
          ) : filteredItems.length === 0 ? (
            <EmptyState
              hasFilters={hasFilters}
              onClearFilters={clearFilters}
              onCreate={goToCreateProduct}
            />
          ) : (
            <>
              <div className="hidden overflow-x-auto lg:block">
                <table className="min-w-full text-left text-sm">
                  <thead className="bg-slate-50 text-xs uppercase tracking-[0.18em] text-slate-500">
                    <tr>
                      <th className="px-6 py-4 font-semibold">Product</th>
                      <th className="px-4 py-4 font-semibold">HSN / SAC</th>
                      <th className="px-4 py-4 font-semibold">Unit</th>
                      <th className="px-4 py-4 font-semibold text-center">
                        Pick Qty
                      </th>
                      <th className="px-4 py-4 font-semibold text-right">
                        Rate
                      </th>
                      <th className="px-4 py-4 font-semibold text-right">
                        Amount
                      </th>
                      <th className="px-6 py-4 font-semibold text-right">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {filteredItems.map((item) => {
                      const amount = item.qty * item.rate;

                      return (
                        <tr
                          key={item.id}
                          className="align-top odd:bg-white even:bg-slate-50/50 transition hover:bg-emerald-50/50"
                        >
                          <td className="px-6 py-5">
                            <div className="flex gap-4">
                              <input
                                type="checkbox"
                                checked={item.qty > 0}
                                onChange={(event) =>
                                  toggleSelected(item.id, event.target.checked)
                                }
                                className="mt-1 h-4 w-4 shrink-0 accent-emerald-600"
                                aria-label={`Select ${item.name || "product"}`}
                              />
                              <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                  <p className="font-semibold text-slate-900">
                                    {item.name || "Untitled product"}
                                  </p>
                                  {item.qty > 0 && (
                                    <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-medium text-emerald-700">
                                      Selected
                                    </span>
                                  )}
                                </div>
                                <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
                                  {item.description ||
                                    "No description available for this product yet."}
                                </p>
                                <div className="mt-3 flex flex-wrap gap-2 text-xs">
                                  <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-600">
                                    {item.category || "Unassigned category"}
                                  </span>
                                  {item.serialNumber && (
                                    <span className="rounded-full bg-emerald-50 px-3 py-1 text-emerald-700">
                                      Serial {item.serialNumber}
                                    </span>
                                  )}
                                  <span className="rounded-full bg-indigo-50 px-3 py-1 text-indigo-700">
                                    Stock {item.stock}
                                  </span>
                                  {item.brand && (
                                    <span className="rounded-full bg-sky-50 px-3 py-1 text-sky-700">
                                      {item.brand}
                                    </span>
                                  )}
                                  {item.sku && (
                                    <span className="rounded-full bg-amber-50 px-3 py-1 text-amber-700">
                                      SKU {item.sku}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-5">
                            <p className="font-medium text-slate-900">
                              {item.hsn || "-"}
                            </p>
                            <p className="mt-2 text-xs uppercase tracking-[0.2em] text-slate-400">
                              HSN / SAC
                            </p>
                          </td>
                          <td className="px-4 py-5">
                            <span className="inline-flex rounded-full bg-slate-100 px-3 py-1.5 text-sm font-medium text-slate-700">
                              {item.unit || "-"}
                            </span>
                          </td>
                          <td className="px-4 py-5 text-center">
                            <div className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 p-1 shadow-sm">
                              <button
                                type="button"
                                onClick={() => decreaseQty(item.id)}
                                className="grid h-8 w-8 place-items-center rounded-full text-lg font-semibold text-slate-600 transition hover:bg-white hover:text-slate-900"
                                aria-label={`Decrease quantity for ${item.name || "product"}`}
                              >
                                -
                              </button>
                              <span className="min-w-[2.75rem] px-2 text-center text-sm font-semibold text-slate-900">
                                {item.qty}
                              </span>
                              <button
                                type="button"
                                onClick={() => increaseQty(item.id)}
                                className="grid h-8 w-8 place-items-center rounded-full text-lg font-semibold text-slate-600 transition hover:bg-white hover:text-slate-900"
                                aria-label={`Increase quantity for ${item.name || "product"}`}
                              >
                                +
                              </button>
                            </div>
                          </td>
                          <td className="px-4 py-5 text-right">
                            <p className="font-semibold text-slate-900">
                              {formatCurrency(item.rate)}
                            </p>
                            <p className="mt-2 text-xs uppercase tracking-[0.2em] text-slate-400">
                              Selling price
                            </p>
                          </td>
                          <td className="px-4 py-5 text-right">
                            <p className="font-semibold text-slate-900">
                              {formatCurrency(amount)}
                            </p>
                            <p className="mt-2 text-xs uppercase tracking-[0.2em] text-slate-400">
                              Pick qty x rate
                            </p>
                          </td>
                          <td className="px-6 py-5">
                            <div className="flex justify-end gap-2">
                              <button
                                type="button"
                                onClick={() => startEdit(item)}
                                className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900"
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
                {filteredItems.map((item) => {
                  const amount = item.qty * item.rate;

                  return (
                    <article
                      key={item.id}
                      className="rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <label className="flex min-w-0 flex-1 gap-3">
                          <input
                            type="checkbox"
                            checked={item.qty > 0}
                            onChange={(event) =>
                              toggleSelected(item.id, event.target.checked)
                            }
                            className="mt-1 h-4 w-4 shrink-0 accent-emerald-600"
                            aria-label={`Select ${item.name || "product"}`}
                          />
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <h3 className="font-semibold text-slate-900">
                                {item.name || "Untitled product"}
                              </h3>
                              {item.qty > 0 && (
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
                            Amount
                          </p>
                          <p className="mt-2 font-semibold text-slate-900">
                            {formatCurrency(amount)}
                          </p>
                        </div>
                      </div>

                      <div className="mt-4 flex flex-wrap gap-2 text-xs">
                        <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-600">
                          {item.category || "Unassigned category"}
                        </span>
                        {item.serialNumber && (
                          <span className="rounded-full bg-emerald-50 px-3 py-1 text-emerald-700">
                            Serial {item.serialNumber}
                          </span>
                        )}
                        <span className="rounded-full bg-indigo-50 px-3 py-1 text-indigo-700">
                          Stock {item.stock}
                        </span>
                        {item.brand && (
                          <span className="rounded-full bg-sky-50 px-3 py-1 text-sky-700">
                            {item.brand}
                          </span>
                        )}
                        {item.sku && (
                          <span className="rounded-full bg-amber-50 px-3 py-1 text-amber-700">
                            SKU {item.sku}
                          </span>
                        )}
                      </div>

                      <div className="mt-4 grid grid-cols-2 gap-3 rounded-2xl bg-slate-50 p-3 text-sm">
                        <div>
                          <p className="text-xs uppercase tracking-[0.2em] text-slate-400">
                            Unit
                          </p>
                          <p className="mt-1 font-medium text-slate-900">
                            {item.unit || "-"}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs uppercase tracking-[0.2em] text-slate-400">
                            HSN / SAC
                          </p>
                          <p className="mt-1 font-medium text-slate-900">
                            {item.hsn || "-"}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs uppercase tracking-[0.2em] text-slate-400">
                            Rate
                          </p>
                          <p className="mt-1 font-medium text-slate-900">
                            {formatCurrency(item.rate)}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs uppercase tracking-[0.2em] text-slate-400">
                            Serial Number
                          </p>
                          <p className="mt-1 font-medium text-slate-900">
                            {item.serialNumber || "-"}
                          </p>
                        </div>
                      </div>

                      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="inline-flex w-fit items-center rounded-full border border-slate-200 bg-slate-50 p-1 shadow-sm">
                          <button
                            type="button"
                            onClick={() => decreaseQty(item.id)}
                            className="grid h-9 w-9 place-items-center rounded-full text-lg font-semibold text-slate-600 transition hover:bg-white hover:text-slate-900"
                            aria-label={`Decrease quantity for ${item.name || "product"}`}
                          >
                            -
                          </button>
                          <span className="min-w-[3rem] px-2 text-center text-sm font-semibold text-slate-900">
                            {item.qty}
                          </span>
                          <button
                            type="button"
                            onClick={() => increaseQty(item.id)}
                            className="grid h-9 w-9 place-items-center rounded-full text-lg font-semibold text-slate-600 transition hover:bg-white hover:text-slate-900"
                            aria-label={`Increase quantity for ${item.name || "product"}`}
                          >
                            +
                          </button>
                        </div>

                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => startEdit(item)}
                            className="flex-1 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900"
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
                      </div>
                    </article>
                  );
                })}
              </div>
            </>
          )}

          {filteredItems.length < 0 && <div className="hidden overflow-x-auto lg:block">
        <table className="w-full text-lg border-collapse">
          <thead className="bg-gray-200">
            <tr>
              <th className="p-4 border">#</th>
              <th className="p-4 border text-left">Item & Description</th>
              <th className="p-4 border text-left">SKU</th>
              <th className="p-4 border text-left">Category</th>
              <th className="p-4 border text-left">Brand</th>
              <th className="p-4 border">Unit</th>
              <th className="p-4 border">HSN</th>
              <th className="p-4 border">Qty</th>
              <th className="p-4 border">Rate</th>
              <th className="p-4 border">Amount</th>
              <th className="p-4 border">Actions</th>
            </tr>
            <tr>
              <th className="p-2 border"></th>
              <th className="p-2 border">
                <input
                  className="w-full border p-2"
                  placeholder="Search product"
                  value={productSearch}
                  onChange={(e) => setProductSearch(e.target.value)}
                />
              </th>
              <th className="p-2 border"></th>
              <th className="p-2 border"></th>
              <th className="p-2 border"></th>
              <th className="p-2 border"></th>
              <th className="p-2 border">
                <input
                  className="w-full border p-2"
                  placeholder="HSN"
                  value={hsnSearch}
                  onChange={(e) => setHsnSearch(e.target.value)}
                />
              </th>
              <th className="p-2 border"></th>
              <th className="p-2 border"></th>
              <th className="p-2 border"></th>
              <th className="p-2 border"></th>
            </tr>
          </thead>
 
          <tbody>
            {filteredItems.map((item, idx) => (
              <tr key={item.id}>
                <td className="border p-4 text-center">{idx + 1}</td>
                <td className="border p-4">
                  <div className="flex gap-3">
                    <input
                      type="checkbox"
                      checked={item.qty > 0}
                      onChange={(e) =>
                        toggleSelected(item.id, e.target.checked)
                      }
                    />
                    <div>
                      <div className="font-semibold">{item.name}</div>
                      <div className="text-sm text-gray-600">
                        {item.description}
                      </div>
                    </div>
                  </div>
                </td>
                <td className="border p-4">{item.sku || "-"}</td>
                <td className="border p-4">{item.category || "-"}</td>
                <td className="border p-4">{item.brand || "-"}</td>
                <td className="border p-4 text-center">
                  {item.unit || "-"}
                </td>
                <td className="border p-4 text-center">{item.hsn}</td>
                <td className="border p-4 text-center">
                  <button onClick={() => decreaseQty(item.id)}>−</button>
                  <span className="mx-3">{item.qty}</span>
                  <button onClick={() => increaseQty(item.id)}>+</button>
                </td>
                <td className="border p-4 text-right">
                  {item.rate.toLocaleString("en-IN")}
                </td>
                <td className="border p-4 text-right">
                  {(item.qty * item.rate).toLocaleString("en-IN")}
                </td>
                <td className="border p-4 text-center">
                  <div className="flex justify-center gap-3">
                    <button
                      onClick={() => startEdit(item)}
                      className="text-indigo-600"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDelete(item.id)}
                      className="text-red-600"
                    >
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>}

        </section>
      </div>

      {editingProduct && (
        <div className="fixed inset-0 z-50 bg-slate-950/45 p-3 backdrop-blur-sm sm:p-5">
          <div className="mx-auto flex h-full max-w-5xl flex-col overflow-hidden rounded-[32px] border border-slate-200/80 bg-white shadow-[0_40px_120px_-52px_rgba(15,23,42,0.72)]">
            <div className="relative overflow-hidden border-b border-slate-200 bg-slate-950 px-6 py-6 text-white sm:px-8 sm:py-7">
              <div className="absolute -right-16 top-0 h-48 w-48 rounded-full bg-emerald-400/20 blur-3xl" />
              <div className="absolute bottom-0 left-1/3 h-40 w-40 rounded-full bg-sky-400/10 blur-3xl" />

              <div className="relative flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                <div className="max-w-3xl">
                  <p className="text-xs uppercase tracking-[0.35em] text-emerald-200/80">
                    Product Catalog
                  </p>
                  <h2 className="display-font mt-3 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
                    Edit product details
                  </h2>
                  <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-300">
                    Update the catalog record and keep the product listing,
                    purchasing flows, and serial metadata in sync.
                  </p>
                  <div className="mt-5 flex flex-wrap gap-3">
                    <span className="rounded-full border border-white/10 bg-white/10 px-4 py-2 text-sm text-slate-100">
                      Stock {editingProduct.stock ?? 0}
                    </span>
                    <span className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-200">
                      Tax {editingProduct.gst || `${editingProduct.taxPercentage ?? 0}%`}
                    </span>
                  </div>
                </div>

                <button
                  onClick={cancelEdit}
                  className="grid h-10 w-10 place-items-center rounded-full border border-white/15 bg-white/10 text-slate-100 transition hover:border-white/30 hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-60"
                  aria-label="Close"
                  type="button"
                  disabled={isSaving}
                >
                  X
                </button>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto bg-[linear-gradient(180deg,#f8fafc_0%,#ffffff_35%,#eef4f7_100%)] px-4 py-5 sm:px-6 sm:py-6">
              <div className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_320px]">
                <div className="space-y-6">
                  <section className={EDIT_SECTION_CLASSNAME}>
                    <div className="flex flex-col gap-2 border-b border-slate-100 pb-5 sm:flex-row sm:items-end sm:justify-between">
                      <div>
                        <p className="text-xs uppercase tracking-[0.28em] text-slate-400">
                          Core Details
                        </p>
                        <h3 className="mt-2 text-xl font-semibold text-slate-900">
                          Product identity
                        </h3>
                      </div>
                      <span className="text-xs text-slate-500">
                        Required fields marked *
                      </span>
                    </div>

                    <div className="mt-5 grid gap-5 md:grid-cols-2">
                      <div className="md:col-span-2">
                        <label className="text-sm font-medium text-slate-700">
                          Product Name *
                        </label>
                        <input
                          value={editValues.name}
                          onChange={(event) =>
                            updateEditField("name", event.target.value)
                          }
                          type="text"
                          className={EDIT_INPUT_CLASSNAME}
                          placeholder="Enter the catalog product name"
                          aria-invalid={Boolean(editErrors.name)}
                          disabled={isSaving}
                        />
                        {editErrors.name && (
                          <p className="mt-2 text-sm text-red-600">
                            {editErrors.name}
                          </p>
                        )}
                      </div>

                      <div>
                        <label className="text-sm font-medium text-slate-700">
                          Category
                        </label>
                        <select
                          value={editValues.category}
                          onChange={(event) =>
                            updateEditField("category", event.target.value)
                          }
                          className={EDIT_INPUT_CLASSNAME}
                          disabled={isSaving}
                        >
                          <option value="">Select category</option>
                          {PRODUCT_CATEGORY_OPTIONS.map((option) => (
                            <option key={option} value={option}>
                              {option}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="text-sm font-medium text-slate-700">
                          Serial Number
                        </label>
                        <input
                          value={editValues.serialNumber}
                          onChange={(event) =>
                            updateEditField("serialNumber", event.target.value)
                          }
                          type="text"
                          className={EDIT_INPUT_CLASSNAME}
                          placeholder="Enter serial number"
                          disabled={isSaving}
                        />
                      </div>

                      <div>
                        <label className="text-sm font-medium text-slate-700">
                          Unit
                        </label>
                        <select
                          value={editValues.unit}
                          onChange={(event) =>
                            updateEditField("unit", event.target.value)
                          }
                          className={EDIT_INPUT_CLASSNAME}
                          disabled={isSaving}
                        >
                          {PRODUCT_UNIT_OPTIONS.map((option) => (
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
                            updateEditField("hsn", event.target.value)
                          }
                          type="text"
                          className={EDIT_INPUT_CLASSNAME}
                          placeholder="Enter HSN or SAC code"
                          disabled={isSaving}
                        />
                      </div>
                    </div>
                  </section>

                  <section className={EDIT_SECTION_CLASSNAME}>
                    <div className="border-b border-slate-100 pb-5">
                      <p className="text-xs uppercase tracking-[0.28em] text-slate-400">
                        Pricing & Notes
                      </p>
                      <h3 className="mt-2 text-xl font-semibold text-slate-900">
                        Financial and descriptive fields
                      </h3>
                      <p className="mt-2 text-sm leading-6 text-slate-500">
                        These values flow back into the catalog table and
                        purchasing pickers after save.
                      </p>
                    </div>

                    <div className="mt-5 grid gap-5">
                      <div>
                        <label className="text-sm font-medium text-slate-700">
                          Selling Price *
                        </label>
                        <input
                          value={editValues.rate}
                          onChange={(event) =>
                            updateEditField("rate", event.target.value)
                          }
                          type="number"
                          min="0"
                          step="0.01"
                          inputMode="decimal"
                          className={EDIT_INPUT_CLASSNAME}
                          placeholder="0.00"
                          aria-invalid={Boolean(editErrors.rate)}
                          disabled={isSaving}
                        />
                        {editErrors.rate && (
                          <p className="mt-2 text-sm text-red-600">
                            {editErrors.rate}
                          </p>
                        )}
                      </div>

                      <div>
                        <label className="text-sm font-medium text-slate-700">
                          Description
                        </label>
                        <textarea
                          value={editValues.description}
                          onChange={(event) =>
                            updateEditField("description", event.target.value)
                          }
                          className={`${EDIT_INPUT_CLASSNAME} min-h-[140px] resize-y`}
                          placeholder="Add a short description or buying context"
                          disabled={isSaving}
                        />
                      </div>
                    </div>
                  </section>
                </div>

                <aside className="space-y-6">
                  <section className={EDIT_SECTION_CLASSNAME}>
                    <p className="text-xs uppercase tracking-[0.28em] text-slate-400">
                      Live Preview
                    </p>
                    <h3 className="mt-4 text-lg font-semibold text-slate-900">
                      {editValues.name.trim() || "Untitled product"}
                    </h3>
                    <p className="mt-2 text-sm leading-6 text-slate-500">
                      {editValues.description.trim() ||
                        "Add a short description so the product listing stays easy to scan."}
                    </p>
                    <div className="mt-4 flex flex-wrap gap-2 text-xs">
                      <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-600">
                        {editValues.category || "Unassigned category"}
                      </span>
                      <span className="rounded-full bg-emerald-50 px-3 py-1 text-emerald-700">
                        {editValues.serialNumber.trim() || "No serial number"}
                      </span>
                      <span className="rounded-full bg-indigo-50 px-3 py-1 text-indigo-700">
                        {editValues.rate === ""
                          ? "Awaiting price"
                          : formatCurrency(editValues.rate)}
                      </span>
                    </div>
                  </section>

                  <section className={EDIT_SECTION_CLASSNAME}>
                    <p className="text-xs uppercase tracking-[0.28em] text-slate-400">
                      Sync Status
                    </p>
                    <div className="mt-4 space-y-3 text-sm text-slate-600">
                      <p>
                        Serial number, category, price, unit, HSN, and
                        description are saved through the API-backed product
                        payload.
                      </p>
                      <p>
                        The catalog refresh runs after create flows and the
                        updated row is patched in place after save.
                      </p>
                    </div>
                  </section>
                </aside>
              </div>
            </div>

            <div className="flex flex-col gap-4 border-t border-slate-200 bg-slate-50/90 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-slate-500">
                Save changes to update the product listing and keep pricing
                accurate across downstream workflows.
              </p>
              <div className="flex flex-wrap gap-3">
                <button
                  onClick={cancelEdit}
                  className="rounded-full border border-slate-200 bg-white px-5 py-2.5 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-60"
                  type="button"
                  disabled={isSaving}
                >
                  Cancel
                </button>
                <button
                  onClick={handleEditSave}
                  className="rounded-full bg-emerald-500 px-5 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={isSaving}
                >
                  {isSaving ? "Saving Changes..." : "Save Changes"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
 
 
