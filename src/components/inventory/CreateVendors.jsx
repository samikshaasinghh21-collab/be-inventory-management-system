import { useState } from "react";
import { useNavigate } from "react-router-dom";

const CreateVendors = () => {
  const navigate = useNavigate();
  const [vendorName, setVendorName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [gstNumber, setGstNumber] = useState("");
  const [address, setAddress] = useState("");
  const [errors, setErrors] = useState({});

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
    localStorage.setItem("vendors", JSON.stringify([...existing, payload]));
    navigate("/inventory");
  };

  const clearError = (key) => {
    if (errors[key]) {
      setErrors((prev) => ({ ...prev, [key]: undefined }));
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white w-[900px] max-w-[95vw] rounded-xl shadow-xl overflow-hidden border max-h-[90vh] overflow-y-auto">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="text-lg font-semibold">Create Vendor</h2>
          <button
            onClick={() => navigate(-1)}
            className="text-xl text-slate-500 hover:text-black"
            aria-label="Close"
            type="button"
          >
            X
          </button>
        </div>

        {/* Body */}
        <div className="flex">

          {/* Left Sidebar */}
          <div className="w-60 border-r p-4 text-base">
            <div className="mb-4 font-medium text-indigo-600 bg-indigo-50 px-3 py-2 rounded">
              Vendor Details *
            </div>
            <p className="text-slate-600 mb-3">Contact</p>
            <p className="text-slate-600">Address</p>
          </div>

          {/* Form */}
          <div className="flex-1 p-6">
            <form
              id="vendor-form"
              className="space-y-6"
              onSubmit={handleSubmit}
              noValidate
            >
              <div>
                <label className="text-base font-medium">
                  Vendor Name *
                </label>
                <input
                  value={vendorName}
                  onChange={(event) => {
                    setVendorName(event.target.value);
                    clearError("vendorName");
                  }}
                  type="text"
                  placeholder="ex: Sunrise Supplies"
                  className="w-full mt-1 border rounded px-4 py-3 text-base"
                  aria-invalid={Boolean(errors.vendorName)}
                />
                {errors.vendorName && (
                  <p className="mt-1 text-sm text-red-600">
                    {errors.vendorName}
                  </p>
                )}
              </div>

              <div>
                <label className="text-base font-medium">
                  Phone Number *
                </label>
                <input
                  value={phone}
                  onChange={(event) => {
                    setPhone(event.target.value);
                    clearError("phone");
                  }}
                  type="tel"
                  placeholder="ex: +1 555 123 4567"
                  className="w-full mt-1 border rounded px-4 py-3 text-base"
                  aria-invalid={Boolean(errors.phone)}
                />
                {errors.phone && (
                  <p className="mt-1 text-sm text-red-600">
                    {errors.phone}
                  </p>
                )}
              </div>

              <div>
                <label className="text-base font-medium">
                  Email
                </label>
                <input
                  value={email}
                  onChange={(event) => {
                    setEmail(event.target.value);
                    clearError("email");
                  }}
                  type="email"
                  placeholder="ex: accounts@sunrise.com"
                  className="w-full mt-1 border rounded px-4 py-3 text-base"
                  aria-invalid={Boolean(errors.email)}
                />
                {errors.email && (
                  <p className="mt-1 text-sm text-red-600">
                    {errors.email}
                  </p>
                )}
              </div>

              <div>
                <label className="text-base font-medium">
                  GST Number
                </label>
                <input
                  value={gstNumber}
                  onChange={(event) => setGstNumber(event.target.value)}
                  type="text"
                  placeholder="ex: 27ABCDE1234F1Z5"
                  className="w-full mt-1 border rounded px-4 py-3 text-base"
                />
              </div>

              <div>
                <label className="text-base font-medium">
                  Address
                </label>
                <textarea
                  value={address}
                  onChange={(event) => {
                    setAddress(event.target.value);
                  }}
                  placeholder="Street, City, State, ZIP"
                  className="w-full mt-1 border rounded px-4 py-3 text-base min-h-[110px]"
                />
              </div>
            </form>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 px-6 py-4 border-t">
          <button
            onClick={() => navigate(-1)}
            className="px-4 py-2 border rounded"
            type="button"
          >
            Cancel
          </button>
          <button
            form="vendor-form"
            type="submit"
            className="px-5 py-2 bg-indigo-600 text-white rounded"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
};

export default CreateVendors;
