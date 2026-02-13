import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  deleteVendor,
  syncVendorsCache,
  updateVendor,
} from "../../services/vendorsApi";

const emptyForm = {
  VendorName: "",
  Phone: "",
  Email: "",
  GSTNumber: "",
  Address: "",
};

const Vendors = () => {
  const navigate = useNavigate();
  const [vendors, setVendors] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [editingVendor, setEditingVendor] = useState(null);
  const [editForm, setEditForm] = useState(emptyForm);
  const [editErrors, setEditErrors] = useState({});
  const [editError, setEditError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isDeletingId, setIsDeletingId] = useState(null);
  const [actionError, setActionError] = useState("");
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteError, setDeleteError] = useState("");

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

  const openEdit = (vendor) => {
    setEditingVendor(vendor);
    setEditForm({
      VendorName: vendor.name ?? vendor.VendorName ?? "",
      Phone: vendor.phone ?? vendor.Phone ?? "",
      Email: vendor.email ?? vendor.Email ?? "",
      GSTNumber: vendor.gstNumber ?? vendor.GSTNumber ?? "",
      Address: vendor.address ?? vendor.Address ?? "",
    });
    setEditErrors({});
    setEditError("");
  };

  const closeEdit = () => {
    setEditingVendor(null);
    setEditForm(emptyForm);
    setEditErrors({});
    setEditError("");
  };

  const updateEditField = (key, value) => {
    setEditForm((prev) => ({ ...prev, [key]: value }));
    if (editErrors[key]) {
      setEditErrors((prev) => ({ ...prev, [key]: undefined }));
    }
  };

  const validateEdit = () => {
    const nextErrors = {};
    if (!editForm.VendorName.trim()) {
      nextErrors.VendorName = "Vendor name is required.";
    }
    if (!editForm.Phone.trim()) {
      nextErrors.Phone = "Phone number is required.";
    }
    setEditErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleEditSubmit = async (event) => {
    event.preventDefault();
    setEditError("");
    setActionError("");

    if (!editingVendor) {
      return;
    }
    if (!validateEdit()) {
      return;
    }

    setIsSaving(true);
    try {
      const updated = await updateVendor(editingVendor.id, {
        name: editForm.VendorName.trim(),
        phone: editForm.Phone.trim(),
        email: editForm.Email.trim(),
        gstNumber: editForm.GSTNumber.trim(),
        address: editForm.Address.trim(),
      });

      const nextVendors = vendors.map((vendor) =>
        vendor.id === updated.id ? { ...vendor, ...updated } : vendor
      );
      setVendors(nextVendors);
      syncVendorsCache(nextVendors);
      closeEdit();
    } catch (error) {
      setEditError(
        error?.response?.data?.message || error?.message || "Failed to update vendor."
      );
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteRequest = (vendor) => {
    setDeleteTarget(vendor);
    setDeleteError("");
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) {
      return;
    }

    setActionError("");
    setDeleteError("");
    setIsDeletingId(deleteTarget.id);
    try {
      await deleteVendor(deleteTarget.id);
      const nextVendors = vendors.filter((item) => item.id !== deleteTarget.id);
      setVendors(nextVendors);
      syncVendorsCache(nextVendors);
      setDeleteTarget(null);
    } catch (error) {
      setDeleteError(
        error?.response?.data?.message || error?.message || "Failed to delete vendor."
      );
    } finally {
      setIsDeletingId(null);
    }
  };

  const handleDeleteCancel = () => {
    setDeleteTarget(null);
    setDeleteError("");
  };

  return (
    <div className="p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center mb-6">
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
          <div>
            <h3 className="text-lg font-semibold text-slate-800">
              Vendor Register
            </h3>
            {actionError && (
              <p className="text-xs text-red-600 mt-1">{actionError}</p>
            )}
          </div>
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
              <th className="p-3 text-left min-w-[160px]">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredVendors.length === 0 && (
              <tr>
                <td colSpan="6" className="p-6 text-center text-slate-500">
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
                <td className="p-3">
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => openEdit(vendor)}
                      className="px-3 py-1 rounded-md text-xs font-medium bg-indigo-600 text-white hover:bg-indigo-700 transition"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteRequest(vendor)}
                      className="px-3 py-1 rounded-md text-xs font-medium bg-red-600 text-white hover:bg-red-700 transition"
                      disabled={isDeletingId === vendor.id}
                    >
                      {isDeletingId === vendor.id ? "Deleting..." : "Delete"}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editingVendor && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-[1px] flex items-center justify-center z-50">
          <div className="bg-white w-[900px] max-w-[96vw] rounded-2xl shadow-2xl overflow-hidden border border-slate-200 max-h-[92vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b bg-slate-50">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-slate-500">
                  Vendors
                </p>
                <h2 className="text-xl font-semibold text-slate-900">Edit Vendor</h2>
              </div>
              <button
                onClick={closeEdit}
                className="h-9 w-9 grid place-items-center rounded-full border border-slate-200 text-slate-500 hover:text-slate-900 hover:border-slate-300 transition"
                aria-label="Close"
                type="button"
              >
                X
              </button>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto p-6">
              <form id="edit-vendor-form" className="space-y-6" onSubmit={handleEditSubmit} noValidate>
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
                        value={editForm.VendorName}
                        onChange={(event) => updateEditField("VendorName", event.target.value)}
                        type="text"
                        placeholder="Ex: ABC Traders"
                        className="w-full mt-1 border border-slate-200 rounded-lg px-4 py-3 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none"
                        aria-invalid={Boolean(editErrors.VendorName)}
                      />
                      {editErrors.VendorName && (
                        <p className="mt-1 text-sm text-red-600">{editErrors.VendorName}</p>
                      )}
                    </div>

                    <div>
                      <label className="text-sm font-medium text-slate-700">Phone *</label>
                      <input
                        value={editForm.Phone}
                        onChange={(event) => updateEditField("Phone", event.target.value)}
                        type="text"
                        placeholder="Ex: 9876543210"
                        className="w-full mt-1 border border-slate-200 rounded-lg px-4 py-3 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none"
                        aria-invalid={Boolean(editErrors.Phone)}
                      />
                      {editErrors.Phone && (
                        <p className="mt-1 text-sm text-red-600">{editErrors.Phone}</p>
                      )}
                    </div>

                    <div>
                      <label className="text-sm font-medium text-slate-700">Email</label>
                      <input
                        value={editForm.Email}
                        onChange={(event) => updateEditField("Email", event.target.value)}
                        type="email"
                        placeholder="Ex: abc@traders.com"
                        className="w-full mt-1 border border-slate-200 rounded-lg px-4 py-3 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none"
                      />
                    </div>

                    <div>
                      <label className="text-sm font-medium text-slate-700">GST Number</label>
                      <input
                        value={editForm.GSTNumber}
                        onChange={(event) => updateEditField("GSTNumber", event.target.value)}
                        type="text"
                        placeholder="Ex: 27ABCDE1234F1Z5"
                        className="w-full mt-1 border border-slate-200 rounded-lg px-4 py-3 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none"
                      />
                    </div>

                    <div className="lg:col-span-2">
                      <label className="text-sm font-medium text-slate-700">Address</label>
                      <textarea
                        value={editForm.Address}
                        onChange={(event) => updateEditField("Address", event.target.value)}
                        placeholder="Ex: Mumbai, Maharashtra"
                        className="w-full mt-1 border border-slate-200 rounded-lg px-4 py-3 text-sm min-h-[120px] focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none"
                      />
                    </div>
                  </div>
                </section>
              </form>
            </div>

            <div className="flex items-center justify-between px-6 py-4 border-t bg-slate-50">
              {editError ? (
                <p className="text-xs text-red-600">{editError}</p>
              ) : (
                <p className="text-xs text-slate-500">
                  Update vendor details and save changes.
                </p>
              )}
              <div className="flex gap-3">
                <button
                  onClick={closeEdit}
                  className="px-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-700 hover:border-slate-300 hover:text-slate-900"
                  type="button"
                  disabled={isSaving}
                >
                  Cancel
                </button>
                <button
                  form="edit-vendor-form"
                  type="submit"
                  className="px-5 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-60"
                  disabled={isSaving}
                >
                  {isSaving ? "Saving..." : "Save Changes"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {deleteTarget && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-[1px] flex items-center justify-center z-50">
          <div className="bg-white w-[520px] max-w-[92vw] rounded-2xl shadow-[0_25px_60px_-12px_rgba(15,23,42,0.45)] border border-slate-200 overflow-hidden">
            <div className="px-6 py-5 border-b bg-slate-900">
              <p className="text-xs uppercase tracking-[0.3em] text-slate-300">
                Vendors
              </p>
              <h2 className="text-lg font-semibold text-white">Delete Vendor</h2>
            </div>
            <div className="px-6 py-5 text-sm text-slate-600">
              <p>
                Are you sure you want to delete{" "}
                <span className="font-semibold text-slate-900">
                  {deleteTarget.name || deleteTarget.VendorName || "this vendor"}
                </span>
                ? This action cannot be undone.
              </p>
              {deleteError && (
                <p className="mt-3 text-xs text-red-600">{deleteError}</p>
              )}
            </div>
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t bg-slate-50">
              <button
                type="button"
                onClick={handleDeleteCancel}
                className="px-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-700 hover:border-slate-300 hover:text-slate-900 bg-white transition"
                disabled={isDeletingId === deleteTarget.id}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteConfirm}
                className="px-4 py-2 rounded-lg text-sm font-medium text-white bg-red-600 hover:bg-red-700 transition disabled:opacity-60"
                disabled={isDeletingId === deleteTarget.id}
              >
                {isDeletingId === deleteTarget.id ? "Deleting..." : "Delete Vendor"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Vendors;
