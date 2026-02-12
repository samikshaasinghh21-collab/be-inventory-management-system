import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { fetchVendors, syncVendorsCache } from "../../services/vendorsApi";

const Vendors = () => {
  const navigate = useNavigate();
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
