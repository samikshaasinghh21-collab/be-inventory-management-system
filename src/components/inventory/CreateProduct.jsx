import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import useSettings from "../../hooks/useSettings";
import { createItem } from "../../services/inventoryApi";
import { fetchBrands } from "../../services/brandsApi";
import { addCategory, getCategories } from "../../services/categoryStore";
import { fetchLocations } from "../../services/locationsApi";
import { saveProduct } from "../../services/productsStore";
import { TAX_OPTIONS, formatTaxPercentage } from "../../utils/taxUtils";
import { roundUnitPrice } from "../../utils/formatters";
import DateInput from "../common/DateInput";

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

const STATUS_OPTIONS = ["Valid", "Inactive"];
const ADD_NEW_BRAND_VALUE = "__add_new_brand__";

const todayIso = () => new Date().toISOString().slice(0, 10);

const createInitialForm = (profileName = "", defaultUnit = "Nos") => ({
  sku: "",
  name: "",
  brand: "",
  customBrand: "",
  category: "",
  customCategory: "",
  salesUnit: defaultUnit,
  purchaseUnit: defaultUnit,
  price: "",
  taxPercentage: "18",
  hsn: "",
  locationId: "",
  itemStatus: "Valid",
  serviceItem: false,
  serialRequired: false,
  openStock: 0,
  currentStock: 0,
  reOrderLevel: 0,
  description: "",
  remarks: "",
  prepBy: profileName,
  updatedBy: profileName,
  createdAt: todayIso(),
  updatedAt: todayIso(),
});

const CreateProduct = () => {
  const navigate = useNavigate();
  const settings = useSettings();
  const profileName = settings?.profile?.fullName || "";
  const defaultUnit = settings?.inventory?.defaultUnit || "Nos";

  const [form, setForm] = useState(() => createInitialForm(profileName, defaultUnit));
  const [brands, setBrands] = useState([]);
  const [categories, setCategories] = useState(() => getCategories());
  const [locations, setLocations] = useState([]);
  const [errors, setErrors] = useState({});
  const [apiError, setApiError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const syncCategories = () => setCategories(getCategories());
    window.addEventListener("categories:changed", syncCategories);
    return () => window.removeEventListener("categories:changed", syncCategories);
  }, []);

  useEffect(() => {
    let active = true;

    const loadLocations = async () => {
      try {
        const list = await fetchLocations();
        if (!active) return;
        setLocations(Array.isArray(list) ? list : []);
      } catch {
        if (active) {
          setLocations([]);
        }
      }
    };

    const refreshLocations = () => {
      void loadLocations();
    };

    void loadLocations();
    window.addEventListener("locations:changed", refreshLocations);
    return () => {
      active = false;
      window.removeEventListener("locations:changed", refreshLocations);
    };
  }, []);

  useEffect(() => {
    let active = true;

    const loadBrands = async () => {
      try {
        const list = await fetchBrands();
        if (!active) {
          return;
        }
        setBrands(Array.isArray(list) ? list : []);
      } catch {
        if (active) {
          setBrands([]);
        }
      }
    };

    void loadBrands();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!form.locationId) {
      return;
    }
    const exists = locations.some((location) => String(location.id) === String(form.locationId));
    if (!exists) {
      setForm((prev) => ({ ...prev, locationId: "" }));
    }
  }, [form.locationId, locations]);

  const resolvedCategoryOptions = useMemo(() => {
    const values = [...categories];
    const custom = String(form.customCategory || "").trim();
    if (custom && !values.some((value) => value.toLowerCase() === custom.toLowerCase())) {
      values.push(custom);
    }
    return values.sort((left, right) => left.localeCompare(right));
  }, [categories, form.customCategory]);

  const locationMap = useMemo(() => {
    return locations.reduce((acc, location) => {
      acc[String(location.id)] = location;
      return acc;
    }, {});
  }, [locations]);

  const resolvedBrandOptions = useMemo(() => {
    const optionMap = new Map();
    brands.forEach((brand) => {
      const name = String(brand.name || "").trim();
      if (!name) {
        return;
      }
      const key = name.toLowerCase();
      if (!optionMap.has(key)) {
        optionMap.set(key, name);
      }
    });
    return Array.from(optionMap.values()).sort((left, right) =>
      left.localeCompare(right)
    );
  }, [brands]);

  const selectedLocation = form.locationId ? locationMap[String(form.locationId)] : null;
  const selectedBrand = form.brand === ADD_NEW_BRAND_VALUE
    ? String(form.customBrand || "").trim()
    : String(form.brand || "").trim();
  const selectedCategory = String(form.category || form.customCategory || "").trim();

  const updateField = (key, value) => {
    const nextValue =
      key === "price" && value !== "" ? String(roundUnitPrice(value)) : value;
    setForm((prev) => {
      const next = { ...prev, [key]: nextValue };
      if (key === "prepBy") {
        next.updatedBy = value;
      }
      if (key === "brand" && value !== ADD_NEW_BRAND_VALUE) {
        next.customBrand = "";
      }
      if (key === "serviceItem" && value) {
        next.serialRequired = false;
      }
      if (key === "serialRequired" && value) {
        next.serviceItem = false;
      }
      return next;
    });

    if (errors[key]) {
      setErrors((prev) => ({ ...prev, [key]: undefined }));
    }
    if (apiError) {
      setApiError("");
    }
  };

  const handleAddCategory = () => {
    const value = String(form.customCategory || "").trim();
    if (!value) {
      setErrors((prev) => ({
        ...prev,
        customCategory: "Enter a grouping name before adding it.",
      }));
      return;
    }

    const nextCategories = addCategory(value);
    setCategories(nextCategories);
    setForm((prev) => ({
      ...prev,
      category: value,
      customCategory: "",
    }));
    setErrors((prev) => ({ ...prev, customCategory: undefined, category: undefined }));
  };

  const validate = () => {
    const nextErrors = {};
    const price = Number(form.price);
    const reorderLevel = Number(form.reOrderLevel);

    if (!form.name.trim()) {
      nextErrors.name = "Product name is required.";
    }
    if (!selectedCategory) {
      nextErrors.category = "Select or add a product grouping.";
    }
    if (form.brand === ADD_NEW_BRAND_VALUE && !selectedBrand) {
      nextErrors.brand = "Enter a brand name.";
    }
    if (form.price !== "" && (!Number.isFinite(price) || price < 0)) {
      nextErrors.price = "Enter a valid default unit price.";
    }
    if (
      form.reOrderLevel !== "" &&
      (!Number.isFinite(reorderLevel) || reorderLevel < 0)
    ) {
      nextErrors.reOrderLevel = "Enter a valid reorder level.";
    }

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!validate() || isSubmitting) {
      return;
    }

    const locationName = selectedLocation?.name || "";
    const price = roundUnitPrice(form.price);
    const currentStock = Number(form.currentStock) || 0;
    const openStock = Number(form.openStock) || 0;
    const now = todayIso();
    const brandValue = selectedBrand;
    const taxPercentage = Number(form.taxPercentage) || 0;
    const gst = formatTaxPercentage(form.taxPercentage);
    const serviceItem = Boolean(form.serviceItem);
    const serialRequired = Boolean(form.serialRequired);
    const payload = {
      name: form.name.trim(),
      category: selectedCategory,
      unit: form.salesUnit,
      price,
      taxPercentage,
      gst,
      hsn: form.hsn.trim() || undefined,
      description: form.description.trim() || undefined,
      stock: currentStock,
      serialRequired,
      sku: form.sku.trim() || undefined,
      brand: brandValue || undefined,
      purchaseUnit: form.purchaseUnit,
      salesUnit: form.salesUnit,
      reOrderLevel: Number(form.reOrderLevel) || 0,
      locationId: form.locationId || undefined,
      locationName: locationName || undefined,
      itemStatus: form.itemStatus,
      serviceItem,
      openStock,
      currentStock,
      remarks: form.remarks.trim() || undefined,
      prepBy: form.prepBy.trim() || undefined,
      updatedBy: form.updatedBy.trim() || undefined,
      createdAt: form.createdAt,
      updatedAt: now,
    };

    setIsSubmitting(true);
    setApiError("");
    try {
      if (selectedCategory) {
        addCategory(selectedCategory);
      }

      const created = await createItem(payload);
      saveProduct({
        ...created,
        ...payload,
        brand: brandValue || "",
        category: selectedCategory,
        productGrouping: selectedCategory,
        salesUnit: form.salesUnit,
        purchaseUnit: form.purchaseUnit,
        unit: form.salesUnit,
        location: locationName,
        locationId: form.locationId || "",
        locationName,
        itemStatus: form.itemStatus,
        serviceItem,
        serialRequired,
        openStock,
        currentStock,
        reOrderLevel: Number(form.reOrderLevel) || 0,
        description: form.description.trim() || "",
        remarks: form.remarks.trim() || "",
        prepBy: form.prepBy.trim() || "",
        updatedBy: form.updatedBy.trim() || form.prepBy.trim() || "",
        createdAt: form.createdAt,
        updatedAt: now,
        sku: form.sku.trim() || "",
        hsn: form.hsn.trim() || "",
        price,
        taxPercentage,
        gst,
        stock: currentStock,
      });

      navigate("/inventory/products");
    } catch (error) {
      setApiError(
        error?.response?.data?.error ??
          error?.message ??
          "Failed to save product."
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 backdrop-blur-[1px]">
      <div className="flex max-h-[92vh] w-[1140px] max-w-[96vw] flex-col overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-2xl">
        <div className="border-b border-slate-200 bg-[linear-gradient(135deg,#0f172a_0%,#1d4ed8_100%)] px-6 py-5 text-white">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.35em] text-sky-100/80">
                Product Master
              </p>
              <h2 className="mt-2 text-2xl font-semibold">Create Product</h2>
              <p className="mt-2 max-w-2xl text-sm text-sky-50/90">
                Set up the product definition once with grouping, units, stock,
                and audit details for the rest of the inventory flow.
              </p>
            </div>
            <button
              type="button"
              onClick={() => navigate(-1)}
              className="grid h-10 w-10 place-items-center rounded-full border border-white/25 text-white transition hover:bg-white/10"
            >
              X
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto bg-slate-50/60 p-6">
          <form id="create-product-form" className="space-y-6" onSubmit={handleSubmit} noValidate>
            {apiError && (
              <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {apiError}
              </div>
            )}

            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-base font-semibold text-slate-900">Core Details</h3>
                <span className="text-xs text-slate-500">Fields marked * are required</span>
              </div>

              <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
                <label className="lg:col-span-2">
                  <span className="text-sm font-medium text-slate-700">Item Code ID</span>
                  <input
                    value={form.sku}
                    onChange={(event) => updateField("sku", event.target.value)}
                    placeholder="ITM-0001"
                    className="mt-1 w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                  />
                </label>

                <label className="lg:col-span-2">
                  <span className="text-sm font-medium text-slate-700">
                    Product Name *
                  </span>
                  <input
                    value={form.name}
                    onChange={(event) => updateField("name", event.target.value)}
                    placeholder="Laptop Dell"
                    className="mt-1 w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                  />
                  {errors.name && <p className="mt-1 text-sm text-red-600">{errors.name}</p>}
                </label>

                <label>
                  <span className="text-sm font-medium text-slate-700">Brand</span>
                  <select
                    value={form.brand}
                    onChange={(event) => updateField("brand", event.target.value)}
                    className="mt-1 w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                  >
                    <option value="">Select brand</option>
                    {resolvedBrandOptions.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                    <option value={ADD_NEW_BRAND_VALUE}>Add New Brand</option>
                  </select>
                  <p className="mt-1 text-xs text-slate-500">
                    Choose an existing brand or add one on the fly.
                  </p>
                  {errors.brand && <p className="mt-1 text-sm text-red-600">{errors.brand}</p>}
                </label>

                {form.brand === ADD_NEW_BRAND_VALUE && (
                  <label>
                    <span className="text-sm font-medium text-slate-700">Custom Brand</span>
                    <input
                      value={form.customBrand}
                      onChange={(event) => updateField("customBrand", event.target.value)}
                      placeholder="Enter brand name"
                      className="mt-1 w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                    />
                  </label>
                )}

                <div>
                  <label className="text-sm font-medium text-slate-700">
                    Product Grouping *
                  </label>
                  <select
                    value={form.category}
                    onChange={(event) => updateField("category", event.target.value)}
                    className="mt-1 w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                  >
                    <option value="">Select grouping</option>
                    {resolvedCategoryOptions.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                  {errors.category && (
                    <p className="mt-1 text-sm text-red-600">{errors.category}</p>
                  )}
                </div>

                <div>
                  <label className="text-sm font-medium text-slate-700">
                    Add New Grouping
                  </label>
                  <div className="mt-1 flex gap-2">
                    <input
                      value={form.customCategory}
                      onChange={(event) => updateField("customCategory", event.target.value)}
                      placeholder="Networking"
                      className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                    />
                    <button
                      type="button"
                      onClick={handleAddCategory}
                      className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-100"
                    >
                      Add
                    </button>
                  </div>
                  {errors.customCategory && (
                    <p className="mt-1 text-sm text-red-600">{errors.customCategory}</p>
                  )}
                </div>

                <label className="lg:col-span-2">
                  <span className="text-sm font-medium text-slate-700">Description</span>
                  <textarea
                    value={form.description}
                    onChange={(event) => updateField("description", event.target.value)}
                    placeholder="Optional product notes, specs, or procurement guidance."
                    className="mt-1 min-h-[120px] w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                  />
                </label>
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h3 className="text-base font-semibold text-slate-900">Units & Inventory</h3>
              <div className="mt-4 grid grid-cols-1 gap-5 lg:grid-cols-3">
                <label>
                  <span className="text-sm font-medium text-slate-700">Sales Unit</span>
                  <select
                    value={form.salesUnit}
                    onChange={(event) => updateField("salesUnit", event.target.value)}
                    className="mt-1 w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                  >
                    {UNIT_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </label>

                <label>
                  <span className="text-sm font-medium text-slate-700">Purchase Unit</span>
                  <select
                    value={form.purchaseUnit}
                    onChange={(event) => updateField("purchaseUnit", event.target.value)}
                    className="mt-1 w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                  >
                    {UNIT_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </label>

                <label>
                  <span className="text-sm font-medium text-slate-700">Re-Order Level</span>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={form.reOrderLevel}
                    onChange={(event) => updateField("reOrderLevel", event.target.value)}
                    placeholder="0"
                    className="mt-1 w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                  />
                  {errors.reOrderLevel && (
                    <p className="mt-1 text-sm text-red-600">{errors.reOrderLevel}</p>
                  )}
                </label>

                <label>
                  <span className="text-sm font-medium text-slate-700">Location</span>
                  <select
                    value={form.locationId}
                    onChange={(event) => updateField("locationId", event.target.value)}
                    className="mt-1 w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                  >
                    <option value="">
                      {locations.length ? "Select location" : "No locations available"}
                    </option>
                    {locations.map((location) => (
                      <option key={location.id} value={location.id}>
                        {location.name}
                      </option>
                    ))}
                  </select>
                  {selectedLocation ? (
                    <p className="mt-1 text-xs text-slate-500">
                      Selected: {selectedLocation.name}
                    </p>
                  ) : null}
                </label>

                <label>
                  <span className="text-sm font-medium text-slate-700">HSN Code</span>
                  <input
                    value={form.hsn}
                    onChange={(event) => updateField("hsn", event.target.value)}
                    placeholder="8471"
                    className="mt-1 w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                  />
                </label>

                <label>
                  <span className="text-sm font-medium text-slate-700">
                    Default Unit Price
                  </span>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={form.price}
                    onChange={(event) => updateField("price", event.target.value)}
                    placeholder="0.00"
                    className="mt-1 w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                  />
                  {errors.price && <p className="mt-1 text-sm text-red-600">{errors.price}</p>}
                </label>
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h3 className="text-base font-semibold text-slate-900">Configuration & Tax</h3>
              <div className="mt-4 grid grid-cols-1 gap-5 lg:grid-cols-2">
                <label>
                  <span className="text-sm font-medium text-slate-700">Item Status</span>
                  <select
                    value={form.itemStatus}
                    onChange={(event) => updateField("itemStatus", event.target.value)}
                    className="mt-1 w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                  >
                    {STATUS_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="flex items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <div>
                    <p className="text-sm font-medium text-slate-800">Service Item?</p>
                    <p className="text-xs text-slate-500">
                      Mark this for services that should not carry stock.
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    checked={form.serviceItem}
                    onChange={(event) => updateField("serviceItem", event.target.checked)}
                    className="h-4 w-4"
                  />
                </label>

                <label className="flex items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <div>
                    <p className="text-sm font-medium text-slate-800">Serial Tracking?</p>
                    <p className="text-xs text-slate-500">
                      Enable unique serial tracking for this item.
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    checked={form.serialRequired}
                    onChange={(event) => updateField("serialRequired", event.target.checked)}
                    className="h-4 w-4"
                  />
                </label>

                <label>
                  <span className="text-sm font-medium text-slate-700">GST %</span>
                  <select
                    value={form.taxPercentage}
                    onChange={(event) => updateField("taxPercentage", event.target.value)}
                    className="mt-1 w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                  >
                    {TAX_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {option}%
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h3 className="text-base font-semibold text-slate-900">Stock Info</h3>
              <div className="mt-4 grid grid-cols-1 gap-5 md:grid-cols-2">
                <label>
                  <span className="text-sm font-medium text-slate-700">Open Stock</span>
                  <input
                    readOnly
                    value={Number(form.openStock || 0).toFixed(2)}
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 outline-none"
                  />
                </label>

                <label>
                  <span className="text-sm font-medium text-slate-700">Current Stock</span>
                  <input
                    readOnly
                    value={Number(form.currentStock || 0).toFixed(2)}
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 outline-none"
                  />
                </label>
              </div>
              <p className="mt-3 text-xs text-slate-500">
                Stock values stay read-only here and should come from receipts,
                consumption, or other transactions.
              </p>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h3 className="text-base font-semibold text-slate-900">Remarks & Audit</h3>
              <div className="mt-4 grid grid-cols-1 gap-5 lg:grid-cols-2">
                <label className="lg:col-span-2">
                  <span className="text-sm font-medium text-slate-700">Remarks</span>
                  <textarea
                    value={form.remarks}
                    onChange={(event) => updateField("remarks", event.target.value)}
                    placeholder="Extra notes, sourcing guidance, or handling details."
                    className="mt-1 min-h-[120px] w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                  />
                </label>

                <label>
                  <span className="text-sm font-medium text-slate-700">Prep By</span>
                  <input
                    value={form.prepBy}
                    onChange={(event) => updateField("prepBy", event.target.value)}
                    placeholder="Prepared by"
                    className="mt-1 w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                  />
                </label>

                <label>
                  <span className="text-sm font-medium text-slate-700">Date (Created)</span>
                  <DateInput
                    value={form.createdAt}
                    onChange={() => {}}
                    showCalendarButton={false}
                    readOnly
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none"
                  />
                </label>

                <label>
                  <span className="text-sm font-medium text-slate-700">Updated By</span>
                  <input
                    value={form.updatedBy}
                    readOnly
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none"
                  />
                </label>

                <label>
                  <span className="text-sm font-medium text-slate-700">Date (Updated)</span>
                  <DateInput
                    value={form.updatedAt}
                    onChange={() => {}}
                    showCalendarButton={false}
                    readOnly
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none"
                  />
                </label>
              </div>
            </section>
          </form>
        </div>

        <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50 px-6 py-4">
          <p className="text-xs text-slate-500">
            This product will be available in the product list, purchase orders,
            and receive-goods flow.
          </p>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => navigate(-1)}
              className="rounded-xl border border-slate-200 px-4 py-2 text-sm text-slate-700 transition hover:border-slate-300 hover:text-slate-900"
            >
              Cancel
            </button>
            <button
              form="create-product-form"
              type="submit"
              disabled={isSubmitting}
              className="rounded-xl bg-blue-600 px-5 py-2 text-sm font-medium text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSubmitting ? "Saving..." : "Save Product"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CreateProduct;
