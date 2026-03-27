import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { createItem } from "../../services/inventoryApi";
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

const CreateProduct = () => {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    name: "",
    unit: "Nos",
    price: "",
    taxPercentage: "18",
    hsn: "",
    description: "",
  });
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

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!validate() || isSubmitting) {
      return;
    }

    setIsSubmitting(true);
    setApiError("");
    try {
      await createItem({
        name: form.name.trim(),
        unit: form.unit,
        price: Number(form.price),
        taxPercentage: Number(form.taxPercentage),
        gst: formatTaxPercentage(form.taxPercentage),
        hsn: form.hsn.trim() || undefined,
        description: form.description.trim() || undefined,
        stock: 0,
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
      <div className="flex max-h-[92vh] w-[980px] max-w-[96vw] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b bg-slate-50 px-6 py-4">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-slate-500">
              Products
            </p>
            <h2 className="text-xl font-semibold text-slate-900">
              Create Product
            </h2>
          </div>
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="grid h-9 w-9 place-items-center rounded-full border border-slate-200 text-slate-500 hover:border-slate-300 hover:text-slate-900"
          >
            X
          </button>
        </div>

        <div className="flex flex-1 min-h-0">
          <aside className="w-64 shrink-0 border-r bg-slate-50 p-5">
            <p className="mb-4 text-xs uppercase tracking-[0.3em] text-slate-400">
              Sections
            </p>
            <div className="space-y-2 text-sm">
              <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-900 shadow-sm">
                Basic Details
              </div>
              <div className="rounded-lg px-3 py-2 text-slate-600">
                Pricing & Tax
              </div>
              <div className="rounded-lg px-3 py-2 text-slate-600">
                Optional Details
              </div>
            </div>
            <p className="mt-6 text-xs text-slate-500">
              Tax values are reused in purchase orders and billing.
            </p>
          </aside>

          <div className="flex-1 min-h-0 overflow-y-auto p-6">
            <form
              id="create-product-form"
              className="space-y-6"
              onSubmit={handleSubmit}
              noValidate
            >
              {apiError && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {apiError}
                </div>
              )}

              <section className="rounded-xl border border-slate-200 p-5 shadow-sm">
                <div className="mb-4 flex items-center justify-between">
                  <h3 className="text-base font-semibold text-slate-800">
                    Basic Details
                  </h3>
                  <span className="text-xs text-slate-500">
                    Required fields marked *
                  </span>
                </div>

                <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
                  <div className="lg:col-span-2">
                    <label className="text-sm font-medium text-slate-700">
                      Product Name *
                    </label>
                    <input
                      value={form.name}
                      onChange={(event) => updateField("name", event.target.value)}
                      className="mt-1 w-full rounded-lg border border-slate-200 px-4 py-3 text-sm"
                    />
                    {errors.name && (
                      <p className="mt-1 text-sm text-red-600">{errors.name}</p>
                    )}
                  </div>

                  <div>
                    <label className="text-sm font-medium text-slate-700">
                      Unit
                    </label>
                    <select
                      value={form.unit}
                      onChange={(event) => updateField("unit", event.target.value)}
                      className="mt-1 w-full rounded-lg border border-slate-200 px-4 py-3 text-sm"
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
                      Unit Price *
                    </label>
                    <input
                      value={form.price}
                      onChange={(event) => updateField("price", event.target.value)}
                      className="mt-1 w-full rounded-lg border border-slate-200 px-4 py-3 text-sm"
                    />
                    {errors.price && (
                      <p className="mt-1 text-sm text-red-600">{errors.price}</p>
                    )}
                  </div>
                </div>
              </section>

              <section className="rounded-xl border border-slate-200 p-5 shadow-sm">
                <h3 className="mb-4 text-base font-semibold text-slate-800">
                  Pricing & Tax
                </h3>
                <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
                  <div>
                    <label className="text-sm font-medium text-slate-700">
                      Tax (%)
                    </label>
                    <select
                      value={form.taxPercentage}
                      onChange={(event) =>
                        updateField("taxPercentage", event.target.value)
                      }
                      className="mt-1 w-full rounded-lg border border-slate-200 px-4 py-3 text-sm"
                    >
                      {TAX_OPTIONS.map((option) => (
                        <option key={option} value={option}>
                          {option}%
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </section>

              <section className="rounded-xl border border-slate-200 p-5 shadow-sm">
                <h3 className="mb-4 text-base font-semibold text-slate-800">
                  Optional Details
                </h3>
                <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
                  <div>
                    <label className="text-sm font-medium text-slate-700">
                      HSN / SAC
                    </label>
                    <input
                      value={form.hsn}
                      onChange={(event) => updateField("hsn", event.target.value)}
                      className="mt-1 w-full rounded-lg border border-slate-200 px-4 py-3 text-sm"
                    />
                  </div>
                  <div className="lg:col-span-2">
                    <label className="text-sm font-medium text-slate-700">
                      Description
                    </label>
                    <textarea
                      value={form.description}
                      onChange={(event) =>
                        updateField("description", event.target.value)
                      }
                      className="mt-1 min-h-[120px] w-full rounded-lg border border-slate-200 px-4 py-3 text-sm"
                    />
                  </div>
                </div>
              </section>
            </form>
          </div>
        </div>

        <div className="flex items-center justify-between border-t bg-slate-50 px-6 py-4">
          <p className="text-xs text-slate-500">
            Products appear in BOQ and purchase-order pickers after save.
          </p>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => navigate(-1)}
              className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-700"
            >
              Cancel
            </button>
            <button
              form="create-product-form"
              type="submit"
              disabled={isSubmitting}
              className="rounded-lg bg-indigo-600 px-5 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
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
