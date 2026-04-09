import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { createItem } from "../../services/inventoryApi";
import { addCategory, getCategories } from "../../services/categoryStore";
import { TAX_OPTIONS, formatTaxPercentage } from "../../utils/taxUtils";

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

const createInitialForm = () => ({
  name: "",
  category: "",
  customCategory: "",
  unit: "Nos",
  price: "",
  taxPercentage: "18",
  hsn: "",
  serialNumber: "",
  description: "",
});

const CreateProduct = () => {
  const navigate = useNavigate();
  const [form, setForm] = useState(createInitialForm);
  const [categories, setCategories] = useState(() => getCategories());
  const [errors, setErrors] = useState({});
  const [apiError, setApiError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const syncCategories = () => setCategories(getCategories());
    window.addEventListener("categories:changed", syncCategories);
    return () => window.removeEventListener("categories:changed", syncCategories);
  }, []);

  const resolvedCategoryOptions = useMemo(() => {
    const values = [...categories];
    const custom = String(form.customCategory || "").trim();
    if (custom && !values.some((value) => value.toLowerCase() === custom.toLowerCase())) {
      values.push(custom);
    }
    return values.sort((left, right) => left.localeCompare(right));
  }, [categories, form.customCategory]);

  const updateField = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
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
        customCategory: "Enter a category name before adding it.",
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
    const chosenCategory = String(form.category || form.customCategory || "").trim();

    if (!form.name.trim()) {
      nextErrors.name = "Product name is required.";
    }
    if (!chosenCategory) {
      nextErrors.category = "Select or add a product category.";
    }
    if (form.price !== "" && (!Number.isFinite(price) || price < 0)) {
      nextErrors.price = "Enter a valid default unit price.";
    }

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!validate() || isSubmitting) {
      return;
    }

    const chosenCategory = String(form.category || form.customCategory || "").trim();

    setIsSubmitting(true);
    setApiError("");
    try {
      if (chosenCategory) {
        addCategory(chosenCategory);
      }

      await createItem({
        name: form.name.trim(),
        category: chosenCategory,
        unit: form.unit,
        price: Number(form.price) || 0,
        taxPercentage: Number(form.taxPercentage) || 0,
        gst: formatTaxPercentage(form.taxPercentage),
        hsn: form.hsn.trim() || undefined,
        serialNumber: form.serialNumber.trim() || undefined,
        description: form.description.trim() || undefined,
        stock: 0,
        serialRequired: false,
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-[1px]">
      <div className="flex max-h-[92vh] w-[1040px] max-w-[96vw] flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl">
        <div className="border-b border-slate-200 bg-[linear-gradient(135deg,#0f172a_0%,#1d4ed8_100%)] px-6 py-5 text-white">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.35em] text-sky-100/80">
                Product Master
              </p>
              <h2 className="mt-2 text-2xl font-semibold">Create Product</h2>
              <p className="mt-2 max-w-2xl text-sm text-sky-50/90">
                Set up the product definition once with the pricing, tax, and manual
                serial details you want to keep on file.
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

        <div className="flex-1 min-h-0 overflow-y-auto p-6">
          <form id="create-product-form" className="space-y-6" onSubmit={handleSubmit} noValidate>
              {apiError && (
                <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {apiError}
                </div>
              )}

              <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="mb-4 flex items-center justify-between">
                  <h3 className="text-base font-semibold text-slate-900">Basic Details</h3>
                  <span className="text-xs text-slate-500">Fields marked * are required</span>
                </div>

                <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
                  <div className="lg:col-span-2">
                    <label className="text-sm font-medium text-slate-700">Product Name *</label>
                    <input
                      value={form.name}
                      onChange={(event) => updateField("name", event.target.value)}
                      placeholder="Laptop Dell"
                      className="mt-1 w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                    />
                    {errors.name && <p className="mt-1 text-sm text-red-600">{errors.name}</p>}
                  </div>

                  <div>
                    <label className="text-sm font-medium text-slate-700">Product Category *</label>
                    <select
                      value={form.category}
                      onChange={(event) => updateField("category", event.target.value)}
                      className="mt-1 w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                    >
                      <option value="">Select category</option>
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
                    <label className="text-sm font-medium text-slate-700">Add New Category</label>
                    <div className="mt-1 flex gap-2">
                      <input
                        value={form.customCategory}
                        onChange={(event) => updateField("customCategory", event.target.value)}
                        placeholder="Electronics"
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

                  <div>
                    <label className="text-sm font-medium text-slate-700">Unit</label>
                    <select
                      value={form.unit}
                      onChange={(event) => updateField("unit", event.target.value)}
                      className="mt-1 w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                    >
                      {UNIT_OPTIONS.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="text-sm font-medium text-slate-700">Default Unit Price</label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={form.price}
                      onChange={(event) => updateField("price", event.target.value)}
                      placeholder="0.00"
                      className="mt-1 w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                    />
                    {errors.price && <p className="mt-1 text-sm text-red-600">{errors.price}</p>}
                  </div>
                </div>
              </section>

              <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <h3 className="text-base font-semibold text-slate-900">Compliance & Details</h3>
                <div className="mt-4 grid grid-cols-1 gap-5 lg:grid-cols-2">
                  <div>
                    <label className="text-sm font-medium text-slate-700">HSN Code</label>
                    <input
                      value={form.hsn}
                      onChange={(event) => updateField("hsn", event.target.value)}
                      placeholder="8471"
                      className="mt-1 w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                    />
                  </div>

                  <div>
                    <label className="text-sm font-medium text-slate-700">GST %</label>
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
                  </div>

                  <div className="lg:col-span-2">
                    <label className="text-sm font-medium text-slate-700">Serial Number</label>
                    <input
                      value={form.serialNumber}
                      onChange={(event) => updateField("serialNumber", event.target.value)}
                      placeholder="Type serial number manually"
                      className="mt-1 w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                    />
                  </div>
                </div>
              </section>

              <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <h3 className="text-base font-semibold text-slate-900">Description</h3>
                <textarea
                  value={form.description}
                  onChange={(event) => updateField("description", event.target.value)}
                  placeholder="Optional product notes, specs, or procurement guidance."
                  className="mt-4 min-h-[140px] w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                />
              </section>
          </form>
        </div>

        <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50 px-6 py-4">
          <p className="text-xs text-slate-500">
            This product will be available in the product list, purchase orders, and receive-goods flow.
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
