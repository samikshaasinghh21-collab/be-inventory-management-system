import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { createVendor, fetchVendors, syncVendorsCache } from "../../services/vendorsApi";

const initialForm = {
  VendorName: "",
  Phone: "",
  Email: "",
  GSTNumber: "",
  Address: "",
};

const CreateVendors = () => {
  const navigate = useNavigate();
  const [form, setForm] = useState(initialForm);
  const [errors, setErrors] = useState({});
  const [submitError, setSubmitError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const validate = () => {
    const nextErrors = {};
    if (!form.VendorName.trim()) {
      nextErrors.VendorName = "Vendor name is required.";
    }
    if (!form.Phone.trim()) {
      nextErrors.Phone = "Phone number is required.";
    }
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const updateField = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    if (errors[key]) {
      setErrors((prev) => ({ ...prev, [key]: undefined }));
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSubmitError("");

    if (!validate()) {
      return;
    }

    setIsSubmitting(true);
    try {
      await createVendor({
        name: form.VendorName.trim(),
        phone: form.Phone.trim(),
        email: form.Email.trim(),
        gstNumber: form.GSTNumber.trim(),
        address: form.Address.trim(),
      });

      const vendors = await fetchVendors();
      syncVendorsCache(vendors);
      navigate("/inventory/vendors");
    } catch (error) {
      setSubmitError(
        error?.response?.data?.message || error?.message || "Failed to create vendor."
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-[1px] flex items-center justify-center z-50">
      <div className="bg-white w-[920px] max-w-[96vw] rounded-2xl shadow-2xl overflow-hidden border border-slate-200 max-h-[92vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b bg-slate-50">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-slate-500">
              Vendors
            </p>
            <h2 className="text-xl font-semibold text-slate-900">Create Vendor</h2>
          </div>
          <button
            onClick={() => navigate(-1)}
            className="h-9 w-9 grid place-items-center rounded-full border border-slate-200 text-slate-500 hover:text-slate-900 hover:border-slate-300 transition"
            aria-label="Close"
            type="button"
          >
            X
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto p-6">
          <form id="create-vendor-form" className="space-y-6" onSubmit={handleSubmit} noValidate>
            <section className="border border-slate-200 rounded-xl p-5 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-base font-semibold text-slate-800">
                  Vendor Details
                </h3>
                <span className="text-xs text-slate-500">Required fields marked *</span>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                <div>
                  <label className="text-sm font-medium text-slate-700">Vendor Name *</label>
                  <input
                    value={form.VendorName}
                    onChange={(event) => updateField("VendorName", event.target.value)}
                    type="text"
                    placeholder="Ex: ABC Traders"
                    className="w-full mt-1 border border-slate-200 rounded-lg px-4 py-3 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none"
                    aria-invalid={Boolean(errors.VendorName)}
                  />
                  {errors.VendorName && (
                    <p className="mt-1 text-sm text-red-600">{errors.VendorName}</p>
                  )}
                </div>

                <div>
                  <label className="text-sm font-medium text-slate-700">Phone *</label>
                  <input
                    value={form.Phone}
                    onChange={(event) => updateField("Phone", event.target.value)}
                    type="text"
                    placeholder="Ex: 9876543210"
                    className="w-full mt-1 border border-slate-200 rounded-lg px-4 py-3 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none"
                    aria-invalid={Boolean(errors.Phone)}
                  />
                  {errors.Phone && (
                    <p className="mt-1 text-sm text-red-600">{errors.Phone}</p>
                  )}
                </div>

                <div>
                  <label className="text-sm font-medium text-slate-700">Email</label>
                  <input
                    value={form.Email}
                    onChange={(event) => updateField("Email", event.target.value)}
                    type="email"
                    placeholder="Ex: abc@traders.com"
                    className="w-full mt-1 border border-slate-200 rounded-lg px-4 py-3 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none"
                  />
                </div>

                <div>
                  <label className="text-sm font-medium text-slate-700">GST Number</label>
                  <input
                    value={form.GSTNumber}
                    onChange={(event) => updateField("GSTNumber", event.target.value)}
                    type="text"
                    placeholder="Ex: 27ABCDE1234F1Z5"
                    className="w-full mt-1 border border-slate-200 rounded-lg px-4 py-3 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none"
                  />
                </div>

                <div className="lg:col-span-2">
                  <label className="text-sm font-medium text-slate-700">Address</label>
                  <textarea
                    value={form.Address}
                    onChange={(event) => updateField("Address", event.target.value)}
                    placeholder="Ex: Mumbai, Maharashtra"
                    className="w-full mt-1 border border-slate-200 rounded-lg px-4 py-3 text-sm min-h-[120px] focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none"
                  />
                </div>
              </div>
            </section>
          </form>
        </div>

        <div className="flex items-center justify-between px-6 py-4 border-t bg-slate-50">
          {submitError ? (
            <p className="text-xs text-red-600">{submitError}</p>
          ) : (
            <p className="text-xs text-slate-500">
              New vendor will be available in vendor workflows after save.
            </p>
          )}
          <div className="flex gap-3">
            <button
              onClick={() => navigate(-1)}
              className="px-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-700 hover:border-slate-300 hover:text-slate-900"
              type="button"
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button
              form="create-vendor-form"
              type="submit"
              className="px-5 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-60"
              disabled={isSubmitting}
            >
              {isSubmitting ? "Saving..." : "Save Vendor"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CreateVendors;
