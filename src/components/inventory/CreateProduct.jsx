import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { createItem } from "../../services/inventoryApi";
import {
  PRODUCT_CATEGORY_OPTIONS,
  PRODUCT_UNIT_OPTIONS,
} from "./productCatalogOptions";
import { TAX_OPTIONS, formatTaxPercentage } from "../../utils/taxUtils";

const INPUT_CLASSNAME =
  "mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-emerald-400 focus:bg-white focus:ring-4 focus:ring-emerald-100";

const TEXTAREA_CLASSNAME = `${INPUT_CLASSNAME} min-h-[140px] resize-y`;

const SECTION_CLASSNAME =
  "rounded-[28px] border border-slate-200/80 bg-white p-5 shadow-[0_18px_45px_-38px_rgba(15,23,42,0.55)] sm:p-6";

const createInitialForm = () => ({
  name: "",
  category: "",
  serialNumber: "",
  unit: "Nos",
  price: "",
  taxPercentage: "18",
  hsn: "",
  description: "",
});

const CreateProduct = () => {
  const navigate = useNavigate();
  const [form, setForm] = useState(createInitialForm);
  const [errors, setErrors] = useState({});
  const [apiError, setApiError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const updateField = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    if (errors[key]) {
      setErrors((prev) => ({ ...prev, [key]: undefined }));
    }
  };

  const validate = () => {
    const nextErrors = {};
    if (!form.name.trim()) {
      nextErrors.name = "Product name is required.";
    }
    const price = Number(form.price);
    if (form.price === "" || Number.isNaN(price) || price <= 0) {
      nextErrors.price = "Enter a valid price.";
    }
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleClose = () => {
    navigate(-1);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!validate() || isSubmitting) {
      return;
    }

    setIsSubmitting(true);
    setApiError("");
    try {
      const createdItem = await createItem({
        name: form.name.trim(),
        category: form.category.trim() || undefined,
        serialNumber: form.serialNumber.trim() || undefined,
        unit: form.unit,
        price: Number(form.price),
        taxPercentage: Number(form.taxPercentage),
        gst: formatTaxPercentage(form.taxPercentage),
        hsn: form.hsn.trim() || undefined,
        description: form.description.trim() || undefined,
        stock: 0,
      });
      console.log("CreateProduct saved item:", createdItem);
      navigate("/inventory/products", {
        state: {
          successMessage: `${
            createdItem?.name || form.name.trim() || "Product"
          } created successfully.`,
          refreshProducts: true,
          createdProduct: createdItem,
        },
      });
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

  const previewName = form.name.trim() || "Untitled product";
  const previewCategory = form.category || "Unassigned category";
  const previewSerial = form.serialNumber.trim() || "No serial number yet";
  const previewPrice =
    form.price === "" || Number.isNaN(Number(form.price))
      ? "Awaiting price"
      : `INR ${Number(form.price).toLocaleString("en-IN", {
          maximumFractionDigits: 2,
        })}`;

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/45 p-3 backdrop-blur-sm sm:p-5">
      <div className="mx-auto flex h-full max-w-6xl flex-col overflow-hidden rounded-[32px] border border-slate-200/80 bg-white shadow-[0_40px_120px_-52px_rgba(15,23,42,0.72)]">
        <div className="relative overflow-hidden border-b border-slate-200 bg-slate-950 px-6 py-6 text-white sm:px-8 sm:py-7">
          <div className="absolute -right-16 top-0 h-48 w-48 rounded-full bg-emerald-400/20 blur-3xl" />
          <div className="absolute bottom-0 left-1/3 h-40 w-40 rounded-full bg-sky-400/10 blur-3xl" />

          <div className="relative flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-3xl">
              <p className="text-xs uppercase tracking-[0.35em] text-emerald-200/80">
                Product Catalog
              </p>
              <h2 className="display-font mt-3 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
                Create a polished catalog entry
              </h2>
              <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-300">
                Capture the product once with pricing, tax, and serial details
                so the catalog, BOQ, and purchase-order flows stay aligned.
              </p>
              <div className="mt-5 flex flex-wrap gap-3">
                <span className="rounded-full border border-white/10 bg-white/10 px-4 py-2 text-sm text-slate-100">
                  Ready for purchasing workflows
                </span>
                <span className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-200">
                  Serial-aware catalog setup
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={handleClose}
              className="grid h-10 w-10 place-items-center rounded-full border border-white/15 bg-white/10 text-slate-100 transition hover:border-white/30 hover:bg-white/15"
              aria-label="Close"
            >
              X
            </button>
          </div>
        </div>

        <div className="grid min-h-0 flex-1 xl:grid-cols-[280px_minmax(0,1fr)]">
          <aside className="hidden border-r border-slate-200 bg-slate-50/95 p-6 xl:block">
            <div className="rounded-[26px] border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-xs uppercase tracking-[0.28em] text-slate-400">
                Sections
              </p>
              <div className="mt-4 space-y-2 text-sm">
                <div className="rounded-2xl border border-slate-200 bg-slate-950 px-4 py-3 font-medium text-white">
                  Basics
                </div>
                <div className="rounded-2xl bg-slate-100 px-4 py-3 text-slate-600">
                  Pricing & Tax
                </div>
                <div className="rounded-2xl bg-slate-100 px-4 py-3 text-slate-600">
                  Notes
                </div>
              </div>
            </div>

            <div className="mt-5 rounded-[26px] border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-xs uppercase tracking-[0.28em] text-slate-400">
                Live Preview
              </p>
              <h3 className="mt-4 text-lg font-semibold text-slate-900">
                {previewName}
              </h3>
              <p className="mt-2 text-sm leading-6 text-slate-500">
                {form.description.trim() ||
                  "Add a concise description so buyers and project teams understand what this product is for."}
              </p>
              <div className="mt-4 flex flex-wrap gap-2 text-xs">
                <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-600">
                  {previewCategory}
                </span>
                <span className="rounded-full bg-emerald-50 px-3 py-1 text-emerald-700">
                  {previewSerial}
                </span>
                <span className="rounded-full bg-indigo-50 px-3 py-1 text-indigo-700">
                  {previewPrice}
                </span>
              </div>
            </div>

            <p className="mt-5 text-xs leading-6 text-slate-500">
              Tax values and product metadata are reused in purchase orders,
              BOQs, and stock workflows after save.
            </p>
          </aside>

          <div className="min-h-0 overflow-y-auto bg-[linear-gradient(180deg,#f8fafc_0%,#ffffff_35%,#eef4f7_100%)] px-4 py-5 sm:px-6 sm:py-6">
            <form
              id="create-product-form"
              className="space-y-6"
              onSubmit={handleSubmit}
              noValidate
            >
              {apiError && (
                <div className="rounded-[22px] border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700 shadow-[0_16px_40px_-34px_rgba(220,38,38,0.55)]">
                  {apiError}
                </div>
              )}

              <section className={SECTION_CLASSNAME}>
                <div className="flex flex-col gap-2 border-b border-slate-100 pb-5 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <p className="text-xs uppercase tracking-[0.28em] text-slate-400">
                      Basic Details
                    </p>
                    <h3 className="mt-2 text-xl font-semibold text-slate-900">
                      Core product identity
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
                      value={form.name}
                      onChange={(event) => updateField("name", event.target.value)}
                      className={INPUT_CLASSNAME}
                      placeholder="Enter the catalog product name"
                      aria-invalid={Boolean(errors.name)}
                    />
                    {errors.name && (
                      <p className="mt-2 text-sm text-red-600">{errors.name}</p>
                    )}
                  </div>

                  <div>
                    <label className="text-sm font-medium text-slate-700">
                      Category
                    </label>
                    <select
                      value={form.category}
                      onChange={(event) =>
                        updateField("category", event.target.value)
                      }
                      className={INPUT_CLASSNAME}
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
                      value={form.serialNumber}
                      onChange={(event) =>
                        updateField("serialNumber", event.target.value)
                      }
                      className={INPUT_CLASSNAME}
                      placeholder="Enter serial number if applicable"
                    />
                  </div>

                  <div>
                    <label className="text-sm font-medium text-slate-700">
                      Unit
                    </label>
                    <select
                      value={form.unit}
                      onChange={(event) => updateField("unit", event.target.value)}
                      className={INPUT_CLASSNAME}
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
                      Unit Price *
                    </label>
                    <input
                      value={form.price}
                      onChange={(event) => updateField("price", event.target.value)}
                      type="number"
                      min="0"
                      step="0.01"
                      inputMode="decimal"
                      className={INPUT_CLASSNAME}
                      placeholder="0.00"
                      aria-invalid={Boolean(errors.price)}
                    />
                    {errors.price && (
                      <p className="mt-2 text-sm text-red-600">{errors.price}</p>
                    )}
                  </div>
                </div>
              </section>

              <section className={SECTION_CLASSNAME}>
                <div className="flex flex-col gap-2 border-b border-slate-100 pb-5 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <p className="text-xs uppercase tracking-[0.28em] text-slate-400">
                      Pricing & Tax
                    </p>
                    <h3 className="mt-2 text-xl font-semibold text-slate-900">
                      Financial details
                    </h3>
                  </div>
                  <span className="text-xs text-slate-500">
                    Stored with the catalog item for downstream documents
                  </span>
                </div>

                <div className="mt-5 grid gap-5 md:grid-cols-2">
                  <div>
                    <label className="text-sm font-medium text-slate-700">
                      Tax (%)
                    </label>
                    <select
                      value={form.taxPercentage}
                      onChange={(event) =>
                        updateField("taxPercentage", event.target.value)
                      }
                      className={INPUT_CLASSNAME}
                    >
                      {TAX_OPTIONS.map((option) => (
                        <option key={option} value={option}>
                          {option}%
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="text-sm font-medium text-slate-700">
                      HSN / SAC
                    </label>
                    <input
                      value={form.hsn}
                      onChange={(event) => updateField("hsn", event.target.value)}
                      className={INPUT_CLASSNAME}
                      placeholder="Enter HSN or SAC code"
                    />
                  </div>
                </div>
              </section>

              <section className={SECTION_CLASSNAME}>
                <div className="border-b border-slate-100 pb-5">
                  <p className="text-xs uppercase tracking-[0.28em] text-slate-400">
                    Notes
                  </p>
                  <h3 className="mt-2 text-xl font-semibold text-slate-900">
                    Description and context
                  </h3>
                  <p className="mt-2 text-sm leading-6 text-slate-500">
                    Keep the description concise so the product row remains easy
                    to scan in the listing and procurement views.
                  </p>
                </div>

                <div className="mt-5">
                  <label className="text-sm font-medium text-slate-700">
                    Description
                  </label>
                  <textarea
                    value={form.description}
                    onChange={(event) =>
                      updateField("description", event.target.value)
                    }
                    className={TEXTAREA_CLASSNAME}
                    placeholder="Add a short description, specs, or buying context"
                  />
                </div>
              </section>
            </form>
          </div>
        </div>

        <div className="flex flex-col gap-4 border-t border-slate-200 bg-slate-50/90 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-slate-500">
            Saving here updates the product catalog and makes the item available
            in product selection flows immediately.
          </p>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={handleClose}
              className="rounded-full border border-slate-200 bg-white px-5 py-2.5 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:text-slate-900"
            >
              Cancel
            </button>
            <button
              form="create-product-form"
              type="submit"
              disabled={isSubmitting}
              className="rounded-full bg-emerald-500 px-5 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSubmitting ? "Saving Product..." : "Save Product"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CreateProduct;
