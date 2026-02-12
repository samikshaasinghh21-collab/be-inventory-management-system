import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

const Vendors = () => {
  const navigate = useNavigate();
  const [vendors, setVendors] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");

  const loadVendors = () => {
    try {
      const stored = JSON.parse(localStorage.getItem("vendors") || "[]");
      setVendors(Array.isArray(stored) ? stored : []);
    } catch {
      setVendors([]);
    }
  };

  useEffect(() => {
    loadVendors();
  }, []);

  useEffect(() => {
    const handleStorage = (event) => {
      if (event.key === "vendors") {
        loadVendors();
      }
    };

    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, []);

  const filteredVendors = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) {
      return vendors;
    }
    return vendors.filter((vendor) =>
      [
        vendor.name,
        vendor.phone,
        vendor.email,
        vendor.gstNumber,
        vendor.address,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query))
    );
  }, [vendors, searchQuery]);

  return (
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
            type="button"
            onClick={loadVendors}
            className="px-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-700 bg-white"
          >
            Refresh
          </button>
          <button
            type="button"
            onClick={() => navigate("/inventory/create-vendors")}
            className="px-5 py-2 rounded-lg text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700"
          >
            + Create Vendor
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-white p-4 rounded-lg shadow-sm border border-slate-200">
          <p className="text-sm text-slate-500">Total Vendors</p>
          <p className="text-2xl font-semibold text-slate-800">
            {vendors.length}
          </p>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-x-auto">
        <div className="px-4 py-3 border-b flex items-center justify-between gap-4">
          <h3 className="text-lg font-semibold text-slate-800">
            Vendor Register
          </h3>
          <input
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Search vendor name, phone, GST, email..."
            className="border border-slate-200 rounded-lg px-3 py-2 text-sm w-72 max-w-full"
          />
        </div>
        <table className="w-full text-sm">
          <thead className="bg-slate-100 text-slate-600">
            <tr>
              <th className="p-3 text-left min-w-[200px]">Vendor Name</th>
              <th className="p-3 text-left min-w-[160px]">Phone</th>
              <th className="p-3 text-left min-w-[220px]">Email</th>
              <th className="p-3 text-left min-w-[180px]">GST</th>
              <th className="p-3 text-left min-w-[260px]">Address</th>
            </tr>
          </thead>
          <tbody>
            {filteredVendors.length === 0 && (
              <tr>
                <td colSpan="5" className="p-6 text-center text-slate-500">
                  {vendors.length === 0
                    ? "No vendors added yet."
                    : "No vendors match your search."}
                </td>
              </tr>
            )}
            {filteredVendors.map((vendor) => (
              <tr key={vendor.id} className="border-t hover:bg-slate-50">
                <td className="p-3 font-medium text-slate-800">
                  {vendor.name || "-"}
                </td>
                <td className="p-3">{vendor.phone || "-"}</td>
                <td className="p-3">{vendor.email || "-"}</td>
                <td className="p-3">{vendor.gstNumber || "-"}</td>
                <td className="p-3 text-slate-600">
                  {vendor.address || "-"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default Vendors;
