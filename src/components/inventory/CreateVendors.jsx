<<<<<<< HEAD
import { useEffect, useMemo, useState } from "react";
=======
import { useEffect, useState } from "react";
>>>>>>> ab340f3402952da5e02c7b117ed4c40f3d1549b6
import { useNavigate } from "react-router-dom";
import { fetchVendors, syncVendorsCache } from "../../services/vendorsApi";

const Vendors = () => {
  const navigate = useNavigate();
<<<<<<< HEAD
  const [vendors, setVendors] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");

  // 🔹 Fetch Vendors From Backend
  const loadVendors = async () => {
    try {
      const data = await fetchVendors();
      setVendors(data);
      syncVendorsCache(data);
    } catch (err) {
      console.error("Error fetching vendors:", err);
      setVendors([]);
=======
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
>>>>>>> ab340f3402952da5e02c7b117ed4c40f3d1549b6
    }
  };

  useEffect(() => {
    loadVendors();
  }, []);

  // 🔹 Search Filter
  const filteredVendors = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return vendors;

    return vendors.filter((vendor) =>
      [
        vendor.VendorName,
        vendor.Phone,
        vendor.Email,
        vendor.GSTNumber,
        vendor.Address,
      ]
        .filter(Boolean)
        .some((value) =>
          String(value).toLowerCase().includes(query)
        )
    );
  }, [vendors, searchQuery]);

  return (
<<<<<<< HEAD
    <div className="p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between mb-6">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-slate-400">
            Inventory
          </p>
          <h1 className="text-3xl font-semibold text-slate-800">
            Vendors
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Manage all registered vendors and contact details.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
=======
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
>>>>>>> ab340f3402952da5e02c7b117ed4c40f3d1549b6
            type="button"
            onClick={loadVendors}
            className="px-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-700 bg-white"
          >
            Refresh
          </button>

<<<<<<< HEAD
          <button
=======
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
>>>>>>> ab340f3402952da5e02c7b117ed4c40f3d1549b6
            type="button"
            onClick={() => navigate("/inventory/create-vendors")}
            className="px-5 py-2 rounded-lg text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700"
          >
<<<<<<< HEAD
            + Create Vendor
=======
            Cancel
          </button>
          <button
            form="vendor-form"
            type="submit"
            className="px-5 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700"
          >
            Save
>>>>>>> ab340f3402952da5e02c7b117ed4c40f3d1549b6
          </button>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-x-auto">
        <div className="px-4 py-3 border-b flex items-center justify-between gap-4">
          <h3 className="text-lg font-semibold text-slate-800">
            Vendor Register
          </h3>

          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search vendor name, phone, GST, email..."
            className="border border-slate-200 rounded-lg px-3 py-2 text-sm w-72 max-w-full"
          />
        </div>

        <table className="w-full text-sm">
          <thead className="bg-slate-100 text-slate-600">
            <tr>
              <th className="p-3 text-left">Vendor Name</th>
              <th className="p-3 text-left">Phone</th>
              <th className="p-3 text-left">Email</th>
              <th className="p-3 text-left">GST</th>
              <th className="p-3 text-left">Address</th>
            </tr>
          </thead>

          <tbody>
            {filteredVendors.length === 0 ? (
              <tr>
                <td colSpan="5" className="p-6 text-center text-slate-500">
                  No vendors found.
                </td>
              </tr>
            ) : (
              filteredVendors.map((vendor) => (
                <tr
                  key={vendor.VendorId}
                  className="border-t hover:bg-slate-50"
                >
                  <td className="p-3 font-medium text-slate-800">
                    {vendor.VendorName || "-"}
                  </td>
                  <td className="p-3">{vendor.Phone || "-"}</td>
                  <td className="p-3">{vendor.Email || "-"}</td>
                  <td className="p-3">{vendor.GSTNumber || "-"}</td>
                  <td className="p-3">{vendor.Address || "-"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default Vendors;
