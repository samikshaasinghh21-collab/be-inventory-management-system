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
import { fetchItems, updateItemApi } from "../../services/inventoryApi";
 
const initialItems = [
  {
    id: 1,
    name: "MX204-HWBASE-AC-FS",
    description:
      "MX204 Fixed AC System - HW and STD Junos; Feature right to use must be ordered separately",
    hsn: "85176290",
    qty: 0,
    unit: "Nos",
    rate: 568924.43,
  },
  {
    id: 2,
    name: "CBL-EX-PWR-C13-IN",
    description: "AC Power Cable - India (6A/250V, 2.5m)",
    hsn: "854442",
    qty: 0,
    unit: "Nos",
    rate: 1746.77,
  },
  {
    id: 3,
    name: "QSFPP 4X10GE-SR",
    description:
      "QSFP+, 4x10GBASE-SR, MMF OM3 300m and OM4 400m, MPO-12 connector, Std Temp",
    hsn: "851762",
    qty: 0,
    unit: "Nos",
    rate: 20853.92,
  },
  {
    id: 4,
    name: "SFPP-10G-LR-C",
    description:
      "SFP, 1G, Copper 100m, Standard Temperature, RJ-45 connector",
    hsn: "85176290",
    qty: 0,
    unit: "Nos",
    rate: 2696.76,
  },
  {
    id: 5,
    name: "RJ45 CONNECTOR (SFP-1G-T-C)",
    description:
      "SFP, 1G, Copper 100m, Standard Temperature",
    hsn: "85366990",
    qty: 0,
    unit: "Nos",
    rate: 4208.58,
  },
  {
    id: 6,
    name: "S-MX-4C-A1-C1-P",
    description:
      "SW, MX, 4x100GE ports, Adv1, Class 1, without SW Support, Perpetual",
    hsn: "997331",
    qty: 0,
    unit: "Nos",
    rate: 201567.49,
  },
  {
    id: 7,
    name: "PAR-SUP-MX-4C-A1P",
    description:
      "PSS Basic Support for S-MX-4C-A1-C1-P",
    hsn: "998313",
    qty: 0,
    unit: "Nos",
    rate: 226849.61,
  },
  {
    id: 8,
    name: "PAR-NDS-MX204-B",
    description:
      "PSS Next Day Ship Support for MX204-HW-BASE",
    hsn: "998313",
    qty: 0,
    unit: "Nos",
    rate: 206968.67,
  },
  {
    id: 9,
    name: "EX9208-RED3B-AC",
    description:
      "Redundant EX9208 system configuration with chassis, routing engines, switch fabrics, PSUs and blank panels",
    hsn: "85176290",
    qty: 0,
    unit: "Nos",
    rate: 1940647.0,
  },
  {
    id: 10,
    name: "CBL-M-PWR-RA-EU",
    description:
      "M320 AC Power Cable, Europe, Right Angle",
    hsn: "85444299",
    qty: 0,
    unit: "Nos",
    rate: 2083.86,
  },
  {
    id: 11,
    name: "EX9200-40XS",
    description:
      "0-port 10GbE SFP+ line card; MACsec capable; optics sold separately",
    hsn: "85176290",
    qty: 0,
    unit: "Nos",
    rate: 962865.9,
  },
  {
    id: 12,
    name: "SFPP-10G-SR-C",
    description:
      "SFP+, 10GBASE-SR, MMF OM3/OM4, Duplex LC connector, Std Temp",
    hsn: "85176290",
    qty: 0,
    unit: "Nos",
    rate: 2574.18,
  },
  {
    id: 13,
    name: "SFP-1G-SX-C",
    description:
      "SFP, 1G, FDDI/OM1/OM2 MMF, Extended Temp, Duplex LC",
    hsn: "85176290",
    qty: 0,
    unit: "Nos",
    rate: 1866.28,
  },
  {
    id: 14,
    name: "PAR-NDS-EX9208-3B",
    description:
      "PSS Next Day Ship Support for EX9208-BASE3B",
    hsn: "998313",
    qty: 0,
    unit: "Nos",
    rate: 1198257.8,
  },
  {
    id: 15,
    name: "EX4400-24X",
    description:
      "24x10GbaseX switch with 2x100G uplinks, MACsec AES256",
    hsn: "851762",
    qty: 0,
    unit: "Nos",
    rate: 303354.86,
  },
  {
    id: 16,
    name: "EX4400-EM-1C",
    description:
      "1x100G MACsec AES256 extension module for EX4400",
    hsn: "851762",
    qty: 0,
    unit: "Nos",
    rate: 69395.6,
  },
  {
    id: 17,
    name: "S-EX-P-C2-P",
    description:
      "SW, EX, Premium, Class 2 (24 ports), Perpetual",
    hsn: "997311",
    qty: 0,
    unit: "Nos",
    rate: 66627.34,
  },
  {
    id: 18,
    name: "JPSU-550-C-AC-AFO",
    description:
      "550W compact AC AFO power supply for EX4400 switches",
    hsn: "850440",
    qty: 0,
    unit: "Nos",
    rate: 18468.72,
  },
  {
    id: 19,
    name: "CBL-EX-PWR-C13-IN",
    description:
      "AC Power Cable - India (10A/250V, 2.5m)",
    hsn: "854442",
    qty: 0,
    unit: "Nos",
    rate: 4075.79,
  },
  {
    id: 20,
    name: "PAR-NDS-EX44-24X",
    description:
      "PSS Next Day Ship Support for EX4400-24X",
    hsn: "998313",
    qty: 0,
    unit: "Nos",
    rate: 131467.05,
  },
  {
    id: 21,
    name: "EX4100-24T",
    description:
      "EX4100 24-Port 10/100/1000BaseT, 4x10G SFP+, 4x25G SFP28, Std SW",
    hsn: "85176290",
    qty: 0,
    unit: "Nos",
    rate: 108095.13,
  },
  {
    id: 22,
    name: "JNP-SFP-25G-DAC-1M",
    description:
      "SFP28, 25GE DAC Cable, 1 meter, Std Temp, 30 AWG",
    hsn: "851762",
    qty: 0,
    unit: "Nos",
    rate: 3105.36,
  },
  {
    id: 23,
    name: "PAR-NDS-EX41-24T",
    description:
      "PSS Next Day Ship Support for EX4100-24T",
    hsn: "998313",
    qty: 0,
    unit: "Nos",
    rate: 33556.28,
  },
  {
    id: 24,
    name: "JPSU-150-AC-AFO",
    description:
      "EX4100 / EX3400 150W AC PSU front-to-back airflow",
    hsn: "85044090",
    qty: 0,
    unit: "Nos",
    rate: 24490.46,
  },
];
 
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

const normalizeProduct = (product) => {
  const rate = Number(product?.rate ?? product?.salesPrice ?? product?.price ?? 0);
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
    taxPercentage: Number.isFinite(taxPercentage) ? taxPercentage : 0,
    serialRequired,
    serialNumber:
      product?.serialNumber ??
      product?.SerialNumber ??
      product?.SerialNumbe ??
      "",
    qty: Number.isFinite(qty) ? qty : 0,
    rate: Number.isFinite(rate) ? rate : 0,
  };
};

const normalizeStoredProducts = (stored) =>
  (Array.isArray(stored) ? stored : []).map((product) =>
    normalizeProduct(product)
  );

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
  const [items, setItems] = useState(() =>
    normalizeStoredProducts(getProducts())
  );
  const [productSearch, setProductSearch] = useState("");
  const [hsnSearch, setHsnSearch] = useState("");
  const deferredProductSearch = useDeferredValue(productSearch);
  const deferredHsnSearch = useDeferredValue(hsnSearch);
  const navigate = useNavigate();
  const location = useLocation();
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

  const seedInitialProducts = () => {
    const existing = normalizeStoredProducts(getProducts());
    const existingIds = new Set(existing.map((product) => product.id));
    const missing = initialItems
      .filter((product) => !existingIds.has(product.id))
      .map((product) => normalizeProduct(product));

    const next = missing.length > 0 ? [...existing, ...missing] : existing;
    if (missing.length > 0) {
      setProducts(next);
    }
    return next;
  };

  const loadProducts = async () => {
    const storedItems = normalizeStoredProducts(getProducts());
    try {
      const apiItems = normalizeStoredProducts(await fetchItems());
      const merged = mergeStoredProducts(apiItems, storedItems);
      setProducts(merged);
      setItems(merged);
    } catch (error) {
      if (storedItems.length > 0) {
        setItems(storedItems);
        return;
      }
      const seeded = seedInitialProducts();
      setItems(seeded);
    }
  };

  const refreshFromStorage = () => {
    setItems(normalizeStoredProducts(getProducts()));
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
    void loadProducts();

    return () => {
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener("products:changed", handleProductsChanged);
    };
  }, []);
 
  const updateQty = (id, nextQty) => {
    const safeQty = Math.max(0, Number(nextQty) || 0);

    setItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, qty: safeQty } : item))
    );
    updateProduct(id, { qty: safeQty });
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
    setProducts(nextItems);
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
        prev.map((item) => (item.id === editingProduct.id ? { ...item, ...nextItem } : item))
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

  const handleDelete = (id) => {
    const target = items.find((item) => item.id === id);
    const label = target?.name || "this product";

    if (
      typeof window !== "undefined" &&
      !window.confirm(`Delete "${label}" from the product catalog?`)
    ) {
      return;
    }

    deleteProduct(id);
    setItems((prev) => prev.filter((item) => item.id !== id));
  };

  const normalizedProductSearch = deferredProductSearch.trim().toLowerCase();
  const normalizedHsnSearch = deferredHsnSearch.trim().toLowerCase();

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

  const goToCreateProduct = () => navigate("/inventory/create-product");

  const pickParam = new URLSearchParams(location.search).get("pick");
  const isPickingForPo = pickParam === "po";
  const isPickingForBoq = pickParam === "boq";

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
              className="rounded-2xl border border-white/15 bg-white/10 px-5 py-3 text-sm font-medium text-white transition hover:bg-white/15"
            >
              Refresh Catalog
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

        <section className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="Catalog Items"
            value={items.length}
            detail="Products available in the local product catalog."
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
                Find products by name, description, SKU, brand, category, or
                HSN code without losing the pricing context.
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
                placeholder="Search by name, SKU, brand, category, or description"
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
                Each row keeps pricing, quantity, and catalog details aligned
                for purchase orders, BOQs, and cart handoff.
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

          {filteredItems.length === 0 ? (
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
                      <th className="px-4 py-4 font-semibold">Serial Number</th>
                      <th className="px-4 py-4 font-semibold text-center">
                        Qty
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
                          className="align-top transition hover:bg-slate-50/80"
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
                          <td className="px-4 py-5">
                            <p className="font-medium text-slate-900 break-all">
                              {item.serialNumber || "-"}
                            </p>
                            <p className="mt-2 text-xs uppercase tracking-[0.2em] text-slate-400">
                              Serial Number
                            </p>
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
                              Qty x rate
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
                        <div className="col-span-2">
                          <p className="text-xs uppercase tracking-[0.2em] text-slate-400">
                            Serial Number
                          </p>
                          <p className="mt-1 font-medium text-slate-900">
                            {item.serialNumber || "-"}
                          </p>
                        </div>
                        <div className="col-span-2">
                          <p className="text-xs uppercase tracking-[0.2em] text-slate-400">
                            Rate
                          </p>
                          <p className="mt-1 font-medium text-slate-900">
                            {formatCurrency(item.rate)}
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
              <th className="p-4 border">Serial Number</th>
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
                  {item.serialNumber || "-"}
                </td>
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
        <div className="fixed inset-0 bg-black/40 backdrop-blur-[1px] flex items-center justify-center z-50">
          <div className="bg-white w-[900px] max-w-[96vw] rounded-2xl shadow-2xl overflow-hidden border border-slate-200 max-h-[92vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b bg-slate-50">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-slate-500">
                  Product Catalog
                </p>
                <h2 className="text-xl font-semibold text-slate-900">
                  Edit Product
                </h2>
              </div>
              <button
                onClick={cancelEdit}
                className="h-9 w-9 grid place-items-center rounded-full border border-slate-200 text-slate-500 hover:text-slate-900 hover:border-slate-300 transition"
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
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
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
                    className="w-full mt-1 border border-slate-200 rounded-lg px-4 py-3 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none"
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
                    className="w-full mt-1 border border-slate-200 rounded-lg px-4 py-3 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none"
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
                    className="w-full mt-1 border border-slate-200 rounded-lg px-4 py-3 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none"
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
                    className="w-full mt-1 border border-slate-200 rounded-lg px-4 py-3 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none"
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
                    className="w-full mt-1 border border-slate-200 rounded-lg px-4 py-3 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none"
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
                    className="w-full mt-1 border border-slate-200 rounded-lg px-4 py-3 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none"
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
                    className="w-full mt-1 border border-slate-200 rounded-lg px-4 py-3 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none"
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
                    className="w-full mt-1 border border-slate-200 rounded-lg px-4 py-3 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none"
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
                    className="w-full mt-1 border border-slate-200 rounded-lg px-4 py-3 text-sm min-h-[120px] focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none"
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between px-6 py-4 border-t bg-slate-50">
              <p className="text-xs text-slate-500">
                Update catalog details and keep pricing accurate.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={cancelEdit}
                  className="px-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-700 hover:border-slate-300 hover:text-slate-900"
                  type="button"
                >
                  Cancel
                </button>
                <button
                  onClick={handleEditSave}
                  className="px-5 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700"
                >
                  Save Changes
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
 
 
