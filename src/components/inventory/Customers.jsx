import { useEffect, useMemo, useState } from "react";
import {
  createCustomer,
  deleteCustomer,
  fetchCustomers,
  updateCustomer,
} from "../../services/customersApi";

const emptyForm = {
  name: "",
  companyName: "",
  address: "",
  gstNumber: "",
  phone: "",
  email: "",
  contactPerson: "",
  designation: "",
};

const resolveCustomerName = ({ companyName = "", name = "" } = {}) =>
  companyName.trim() || name.trim();

const getCustomerPrimaryName = (customer = {}) =>
  customer.name || customer.companyName || "-";

const getCustomerCompanyName = (customer = {}) => {
  const primaryName = getCustomerPrimaryName(customer);
  return customer.companyName && customer.companyName !== primaryName
    ? customer.companyName
    : "-";
};

const Customers = () => {
  const [customers, setCustomers] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [apiError, setApiError] = useState("");
  const [modalMode, setModalMode] = useState("create");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [errors, setErrors] = useState({});
  const [isSaving, setIsSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteError, setDeleteError] = useState("");
  const [isDeletingId, setIsDeletingId] = useState(null);

  const loadCustomers = async () => {
    try {
      setLoading(true);
      setApiError("");
      const list = await fetchCustomers();
      setCustomers(list);
    } catch (error) {
      setApiError(
        error?.response?.data?.error ??
          error?.message ??
          "Failed to load customers."
      );
      setCustomers([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadCustomers();
  }, []);

  const filteredCustomers = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) {
      return customers;
    }
    return customers.filter((customer) =>
      [
        customer.name,
        customer.companyName,
        customer.address,
        customer.gstNumber,
        customer.phone,
        customer.email,
        customer.contactPerson,
        customer.designation,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query))
    );
  }, [customers, searchQuery]);

  const openCreate = () => {
    setModalMode("create");
    setIsModalOpen(true);
    setEditingCustomer(null);
    setForm(emptyForm);
    setErrors({});
    setApiError("");
  };

  const openEdit = (customer) => {
    setModalMode("edit");
    setIsModalOpen(true);
    setEditingCustomer(customer);
    setForm({
      name: customer.name ?? "",
      companyName: customer.companyName ?? "",
      address: customer.address ?? "",
      gstNumber: customer.gstNumber ?? "",
      phone: customer.phone ?? "",
      email: customer.email ?? "",
      contactPerson: customer.contactPerson ?? "",
      designation: customer.designation ?? "",
    });
    setErrors({});
    setApiError("");
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingCustomer(null);
    setForm(emptyForm);
    setErrors({});
  };

  const updateField = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    if (errors[key]) {
      setErrors((prev) => ({ ...prev, [key]: undefined }));
    }
  };

  const validate = () => {
    const nextErrors = {};
    if (!resolveCustomerName(form)) {
      nextErrors.companyName = "Company name is required.";
    }
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!validate()) {
      return;
    }

    setIsSaving(true);
    setApiError("");
    const nextName = resolveCustomerName(form);
    const payload = {
      name: nextName,
      companyName: form.companyName.trim() || undefined,
      address: form.address.trim() || undefined,
      gstNumber: form.gstNumber.trim() || undefined,
      phone: form.phone.trim() || undefined,
      email: form.email.trim() || undefined,
      contactPerson: form.contactPerson.trim() || undefined,
      designation: form.designation.trim() || undefined,
    };

    try {
      if (modalMode === "edit" && editingCustomer?.id) {
        const updated = await updateCustomer(editingCustomer.id, payload);
        setCustomers((prev) =>
          prev.map((customer) =>
            customer.id === editingCustomer.id ? updated : customer
          )
        );
      } else {
        const created = await createCustomer(payload);
        setCustomers((prev) => [created, ...prev]);
      }
      closeModal();
    } catch (error) {
      setApiError(
        error?.response?.data?.error ??
          error?.message ??
          "Failed to save customer."
      );
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) {
      return;
    }

    setDeleteError("");
    setIsDeletingId(deleteTarget.id);
    try {
      await deleteCustomer(deleteTarget.id);
      setCustomers((prev) =>
        prev.filter((customer) => customer.id !== deleteTarget.id)
      );
      setDeleteTarget(null);
    } catch (error) {
      setDeleteError(
        error?.response?.data?.error ??
          error?.message ??
          "Failed to delete customer."
      );
    } finally {
      setIsDeletingId(null);
    }
  };

  return (
    <div className="p-6">
      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-slate-400">
            Inventory Management
          </p>
          <h1 className="text-3xl font-semibold text-slate-800">Customers</h1>
          <p className="mt-1 text-sm text-slate-500">
            Manage customer records and client contacts for project creation.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={loadCustomers}
            className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700"
          >
            Refresh
          </button>
          <button
            type="button"
            onClick={openCreate}
            className="rounded-lg bg-indigo-600 px-5 py-2 text-sm font-medium text-white hover:bg-indigo-700"
          >
            + Add Customer
          </button>
        </div>
      </div>

      <div className="mb-6 grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-sm text-slate-500">Total Customers</p>
          <p className="text-2xl font-semibold text-slate-800">
            {loading ? "..." : customers.length}
          </p>
        </div>
      </div>

      {apiError && (
        <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {apiError}
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h3 className="text-lg font-semibold text-slate-800">
              Customer Register
            </h3>
            <p className="text-sm text-slate-500">
              Search and maintain project-ready customer records.
            </p>
          </div>
          <input
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Search customer, company, GST, contact..."
            className="w-80 max-w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
          />
        </div>

        <table className="w-full text-sm">
          <thead className="bg-slate-100 text-slate-600">
            <tr>
              <th className="p-3 text-left min-w-[180px]">Customer</th>
              <th className="p-3 text-left min-w-[180px]">Company</th>
              <th className="p-3 text-left min-w-[180px]">Contact Person</th>
              <th className="p-3 text-left min-w-[180px]">Email</th>
              <th className="p-3 text-left min-w-[140px]">Phone</th>
              <th className="p-3 text-left min-w-[160px]">GST Number</th>
              <th className="p-3 text-left min-w-[200px]">Actions</th>
            </tr>
          </thead>
          <tbody>
            {!loading && filteredCustomers.length === 0 && (
              <tr>
                <td colSpan="7" className="p-6 text-center text-slate-500">
                  {customers.length === 0
                    ? "No customers added yet."
                    : "No customers match your search."}
                </td>
              </tr>
            )}
            {filteredCustomers.map((customer) => (
              <tr key={customer.id} className="border-t hover:bg-slate-50">
                <td className="p-3 font-medium text-slate-800">
                  {getCustomerPrimaryName(customer)}
                </td>
                <td className="p-3">{getCustomerCompanyName(customer)}</td>
                <td className="p-3">
                  <div className="font-medium text-slate-700">
                    {customer.contactPerson || "-"}
                  </div>
                  <div className="text-xs text-slate-500">
                    {customer.designation || "No designation"}
                  </div>
                </td>
                <td className="p-3">{customer.email || "-"}</td>
                <td className="p-3">{customer.phone || "-"}</td>
                <td className="p-3">{customer.gstNumber || "-"}</td>
                <td className="p-3">
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => openEdit(customer)}
                      className="rounded-md bg-indigo-600 px-3 py-1 text-xs font-medium text-white hover:bg-indigo-700"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setDeleteTarget(customer);
                        setDeleteError("");
                      }}
                      className="rounded-md bg-red-600 px-3 py-1 text-xs font-medium text-white hover:bg-red-700"
                      disabled={isDeletingId === customer.id}
                    >
                      {isDeletingId === customer.id ? "Deleting..." : "Delete"}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-[1px]">
          <div className="max-h-[92vh] w-[900px] max-w-[96vw] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b bg-slate-50 px-6 py-4">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-slate-500">
                  Customers
                </p>
                <h2 className="text-xl font-semibold text-slate-900">
                  {modalMode === "edit" ? "Edit Customer" : "Add Customer"}
                </h2>
              </div>
              <button
                type="button"
                onClick={closeModal}
                className="grid h-9 w-9 place-items-center rounded-full border border-slate-200 text-slate-500 hover:border-slate-300 hover:text-slate-900"
              >
                X
              </button>
            </div>

            <form
              id="customer-form"
              onSubmit={handleSubmit}
              className="max-h-[calc(92vh-80px)] overflow-y-auto p-6 space-y-6"
            >
              <section className="rounded-xl border border-slate-200 p-5 shadow-sm">
                <div className="mb-4 flex items-center justify-between">
                  <h3 className="text-base font-semibold text-slate-800">
                    Customer Details
                  </h3>
                  <span className="text-xs text-slate-500">
                    Required fields marked *
                  </span>
                </div>

                <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
                  <div>
                    <label className="text-sm font-medium text-slate-700">
                      Company Name *
                    </label>
                    <input
                      value={form.companyName}
                      onChange={(event) =>
                        updateField("companyName", event.target.value)
                      }
                      className="mt-1 w-full rounded-lg border border-slate-200 px-4 py-3 text-sm"
                    />
                    {errors.companyName && (
                      <p className="mt-1 text-sm text-red-600">
                        {errors.companyName}
                      </p>
                    )}
                  </div>
                  <div>
                    <label className="text-sm font-medium text-slate-700">
                      Contact Number
                    </label>
                    <input
                      value={form.phone}
                      onChange={(event) => updateField("phone", event.target.value)}
                      className="mt-1 w-full rounded-lg border border-slate-200 px-4 py-3 text-sm"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-slate-700">
                      Email
                    </label>
                    <input
                      value={form.email}
                      onChange={(event) => updateField("email", event.target.value)}
                      className="mt-1 w-full rounded-lg border border-slate-200 px-4 py-3 text-sm"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-slate-700">
                      Contact Person
                    </label>
                    <input
                      value={form.contactPerson}
                      onChange={(event) =>
                        updateField("contactPerson", event.target.value)
                      }
                      className="mt-1 w-full rounded-lg border border-slate-200 px-4 py-3 text-sm"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-slate-700">
                      Designation
                    </label>
                    <input
                      value={form.designation}
                      onChange={(event) =>
                        updateField("designation", event.target.value)
                      }
                      className="mt-1 w-full rounded-lg border border-slate-200 px-4 py-3 text-sm"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-slate-700">
                      GST Number
                    </label>
                    <input
                      value={form.gstNumber}
                      onChange={(event) =>
                        updateField("gstNumber", event.target.value)
                      }
                      className="mt-1 w-full rounded-lg border border-slate-200 px-4 py-3 text-sm"
                    />
                  </div>
                  <div className="lg:col-span-2">
                    <label className="text-sm font-medium text-slate-700">
                      Address
                    </label>
                    <textarea
                      value={form.address}
                      onChange={(event) =>
                        updateField("address", event.target.value)
                      }
                      className="mt-1 min-h-[120px] w-full rounded-lg border border-slate-200 px-4 py-3 text-sm"
                    />
                  </div>
                </div>
              </section>

              <div className="flex items-center justify-between border-t bg-slate-50 px-1 pt-4">
                <p className="text-xs text-slate-500">
                  Customer records are used to auto-fill project client details.
                </p>
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={closeModal}
                    className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-700"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSaving}
                    className="rounded-lg bg-indigo-600 px-5 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
                  >
                    {isSaving ? "Saving..." : "Save Customer"}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-[1px]">
          <div className="w-[520px] max-w-[92vw] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
            <div className="border-b bg-slate-900 px-6 py-5">
              <p className="text-xs uppercase tracking-[0.3em] text-slate-300">
                Customers
              </p>
              <h2 className="text-lg font-semibold text-white">
                Delete Customer
              </h2>
            </div>
            <div className="px-6 py-5 text-sm text-slate-600">
              <p>
                Are you sure you want to delete{" "}
                <span className="font-semibold text-slate-900">
                  {deleteTarget.name || "this customer"}
                </span>
                ?
              </p>
              {deleteError && (
                <p className="mt-3 text-xs text-red-600">{deleteError}</p>
              )}
            </div>
            <div className="flex items-center justify-end gap-3 border-t bg-slate-50 px-6 py-4">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700"
                disabled={isDeletingId === deleteTarget.id}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDelete}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-60"
                disabled={isDeletingId === deleteTarget.id}
              >
                {isDeletingId === deleteTarget.id ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Customers;
