import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

const CreateVendors = () => {
  const navigate = useNavigate();
  const [vendorName, setVendorName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [gstNumber, setGstNumber] = useState("");
  const [address, setAddress] = useState("");
  const [errors, setErrors] = useState({});
  useEffect(() => {
    // no-op placeholder to keep hook order stable if needed later
  }, []);

  const validate = () => {
    const nextErrors = {};
    if (!vendorName.trim()) {
      nextErrors.vendorName = "Vendor name is required.";
    }
    if (!phone.trim()) {
      nextErrors.phone = "Phone number is required.";
    }
    if (email.trim()) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email.trim())) {
        nextErrors.email = "Enter a valid email address.";
      }
    }
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    if (!validate()) {
      return;
    }

    const payload = {
      id: Date.now(),
      name: vendorName.trim(),
      phone: phone.trim(),
      email: email.trim(),
      gstNumber: gstNumber.trim(),
      address: address.trim(),
    };

    console.log("Vendor created (UI only):", payload);
    const existing = JSON.parse(localStorage.getItem("vendors") || "[]");
    const next = [...existing, payload];
    localStorage.setItem("vendors", JSON.stringify(next));
    navigate("/inventory/vendors");
  };

  const clearError = (key) => {
    if (errors[key]) {
      setErrors((prev) => ({ ...prev, [key]: undefined }));
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-[1px] flex items-center justify-center z-50">
      <div className="bg-white w-[900px] max-w-[96vw] rounded-2xl shadow-2xl overflow-hidden border border-slate-200 max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b bg-slate-50">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-slate-500">
              Inventory
            </p>
            <h2 className="text-xl font-semibold text-slate-900">
              Create Vendor
            </h2>
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

        {/* Body */}
        <div className="flex flex-1 min-h-0">
          {/* Left Sidebar */}
          <aside className="w-64 border-r bg-slate-50 p-5 shrink-0">
            <p className="text-xs uppercase tracking-[0.3em] text-slate-400 mb-4">
              Sections
            </p>
            <div className="space-y-2 text-sm">
              <div className="px-3 py-2 rounded-lg bg-white border border-slate-200 text-slate-900 shadow-sm">
                Vendor Details *
              </div>
              <div className="px-3 py-2 rounded-lg text-slate-600">
                Contact
              </div>
              <div className="px-3 py-2 rounded-lg text-slate-600">
                Address
              </div>
            </div>
            <p className="text-xs text-slate-500 mt-6">
              Fields marked with * are required.
            </p>

            <div className="mt-6">
              <button
                type="button"
                onClick={() => navigate("/inventory/vendors")}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm text-slate-700 bg-white hover:border-slate-300 hover:text-slate-900"
              >
                View Registered Vendors
              </button>
            </div>
          </aside>

          {/* Form */}
          <div className="flex-1 min-h-0 overflow-y-auto p-6">
            <form
              id="vendor-form"
              className="space-y-6"
              onSubmit={handleSubmit}
              noValidate
            >
              <section className="border border-slate-200 rounded-xl p-5 shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-base font-semibold text-slate-800">
                    Vendor Details
                  </h3>
                  <span className="text-xs text-slate-500">Required</span>
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                  <div>
                    <label className="text-sm font-medium text-slate-700">
                      Vendor Name *
                    </label>
                    <input
                      value={vendorName}
                      onChange={(event) => {
                        setVendorName(event.target.value);
                        clearError("vendorName");
                      }}
                      type="text"
                      placeholder="Ex: Sunrise Supplies"
                      className="w-full mt-1 border border-slate-200 rounded-lg px-4 py-3 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none"
                      aria-invalid={Boolean(errors.vendorName)}
                    />
                    {errors.vendorName && (
                      <p className="mt-1 text-sm text-red-600">
                        {errors.vendorName}
                      </p>
                    )}
                  </div>

                  <div>
                    <label className="text-sm font-medium text-slate-700">
                      GST Number
                    </label>
                    <input
                      value={gstNumber}
                      onChange={(event) => setGstNumber(event.target.value)}
                      type="text"
                      placeholder="Ex: 27ABCDE1234F1Z5"
                      className="w-full mt-1 border border-slate-200 rounded-lg px-4 py-3 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none"
                    />
                  </div>
                </div>
              </section>

              <section className="border border-slate-200 rounded-xl p-5 shadow-sm">
                <h3 className="text-base font-semibold text-slate-800 mb-4">
                  Contact
                </h3>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                  <div>
                    <label className="text-sm font-medium text-slate-700">
                      Phone Number *
                    </label>
                    <input
                      value={phone}
                      onChange={(event) => {
                        setPhone(event.target.value);
                        clearError("phone");
                      }}
                      type="tel"
                      placeholder="Ex: +1 555 123 4567"
                      className="w-full mt-1 border border-slate-200 rounded-lg px-4 py-3 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none"
                      aria-invalid={Boolean(errors.phone)}
                    />
                    {errors.phone && (
                      <p className="mt-1 text-sm text-red-600">
                        {errors.phone}
                      </p>
                    )}
                  </div>

                  <div>
                    <label className="text-sm font-medium text-slate-700">
                      Email
                    </label>
                    <input
                      value={email}
                      onChange={(event) => {
                        setEmail(event.target.value);
                        clearError("email");
                      }}
                      type="email"
                      placeholder="Ex: accounts@sunrise.com"
                      className="w-full mt-1 border border-slate-200 rounded-lg px-4 py-3 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none"
                      aria-invalid={Boolean(errors.email)}
                    />
                    {errors.email && (
                      <p className="mt-1 text-sm text-red-600">
                        {errors.email}
                      </p>
                    )}
                  </div>
                </div>
              </section>

              <section className="border border-slate-200 rounded-xl p-5 shadow-sm">
                <h3 className="text-base font-semibold text-slate-800 mb-4">
                  Address
                </h3>
                <textarea
                  value={address}
                  onChange={(event) => {
                    setAddress(event.target.value);
                  }}
                  placeholder="Street, City, State, ZIP"
                  className="w-full mt-1 border border-slate-200 rounded-lg px-4 py-3 text-sm min-h-[120px] focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none"
                />
              </section>
            </form>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 px-6 py-4 border-t bg-slate-50">
          <button
            onClick={() => navigate(-1)}
            className="px-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-700 hover:border-slate-300 hover:text-slate-900"
            type="button"
          >
            Cancel
          </button>
          <button
            form="vendor-form"
            type="submit"
            className="px-5 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
};

export default CreateVendors;
