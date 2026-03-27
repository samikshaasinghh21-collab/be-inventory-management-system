import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { fetchCustomers } from "../../services/customersApi";
import { createProject } from "../../services/projectsApi";
import { saveProject } from "../../services/projectsStore";
import DateInput from "../common/DateInput";

const STATUS_OPTIONS = ["Planned", "Active", "On Hold", "Completed"];

const emptyForm = {
  name: "",
  code: "",
  customerId: "",
  status: "Planned",
  startDate: "",
  endDate: "",
  notes: "",
};

const getCustomerPrimaryName = (customer = {}) =>
  customer.companyName || customer.name || "";

const getCustomerOptionLabel = (customer = {}) =>
  getCustomerPrimaryName(customer) || "Unnamed customer";

const CreateProjects = () => {
  const navigate = useNavigate();
  const [form, setForm] = useState(emptyForm);
  const [customers, setCustomers] = useState([]);
  const [customerError, setCustomerError] = useState("");
  const [errors, setErrors] = useState({});
  const [apiError, setApiError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const selectedCustomer =
    customers.find((customer) => String(customer.id) === String(form.customerId)) ||
    null;

  const loadCustomers = async () => {
    try {
      setCustomerError("");
      const list = await fetchCustomers();
      setCustomers(Array.isArray(list) ? list : []);
    } catch (error) {
      setCustomerError(
        error?.response?.data?.error ??
          error?.message ??
          "Unable to load customers."
      );
      setCustomers([]);
    }
  };

  useEffect(() => {
    void loadCustomers();
  }, []);

  const validate = () => {
    const nextErrors = {};
    if (!form.name.trim()) {
      nextErrors.name = "Project name is required.";
    }
    if (!form.customerId) {
      nextErrors.customerId = "Select a customer.";
    }
    if (form.startDate && form.endDate && form.endDate < form.startDate) {
      nextErrors.endDate = "End date must be after the start date.";
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
    if (!validate() || isSubmitting) {
      return;
    }

    setIsSubmitting(true);
    setApiError("");

    try {
      const payload = {
        name: form.name.trim(),
        code: form.code.trim() || undefined,
        customerId: form.customerId || null,
        client: getCustomerPrimaryName(selectedCustomer) || undefined,
        companyName: selectedCustomer?.companyName || undefined,
        address: selectedCustomer?.address || undefined,
        gstNumber: selectedCustomer?.gstNumber || undefined,
        phone: selectedCustomer?.phone || undefined,
        email: selectedCustomer?.email || undefined,
        contactPerson: selectedCustomer?.contactPerson || undefined,
        designation: selectedCustomer?.designation || undefined,
        status: form.status || undefined,
        startDate: form.startDate || null,
        endDate: form.endDate || null,
        notes: form.notes.trim() || undefined,
      };

      const created = await createProject(payload);
      saveProject({
        ...created,
        createdAt: created?.createdAt ?? new Date().toISOString(),
      });
      navigate("/inventory/projects");
    } catch (error) {
      setApiError(
        error?.response?.data?.error ??
          error?.message ??
          "Failed to create project."
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-[1px]">
      <div className="flex max-h-[92vh] w-[1080px] max-w-[96vw] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b bg-slate-50 px-6 py-4">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-slate-500">
              Inventory Management
            </p>
            <h2 className="text-xl font-semibold text-slate-900">
              Create Project
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
                Client Details
              </div>
              <div className="rounded-lg px-3 py-2 text-slate-600">
                Timeline
              </div>
              <div className="rounded-lg px-3 py-2 text-slate-600">Notes</div>
            </div>
          </aside>

          <div className="flex-1 min-h-0 overflow-y-auto p-6">
            <form
              id="create-project-form"
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
                  <div>
                    <label className="text-sm font-medium text-slate-700">
                      Project Name *
                    </label>
                    <input
                      value={form.name}
                      onChange={(event) => updateField("name", event.target.value)}
                      placeholder="Ex: Mall Renovation"
                      className="mt-1 w-full rounded-lg border border-slate-200 px-4 py-3 text-sm"
                    />
                    {errors.name && (
                      <p className="mt-1 text-sm text-red-600">{errors.name}</p>
                    )}
                  </div>

                  <div>
                    <label className="text-sm font-medium text-slate-700">
                      Project Code
                    </label>
                    <input
                      value={form.code}
                      onChange={(event) => updateField("code", event.target.value)}
                      placeholder="Ex: PRJ-2026-001"
                      className="mt-1 w-full rounded-lg border border-slate-200 px-4 py-3 text-sm"
                    />
                  </div>

                  <div>
                    <label className="text-sm font-medium text-slate-700">
                      Customer *
                    </label>
                    <select
                      value={form.customerId}
                      onChange={(event) =>
                        updateField("customerId", event.target.value)
                      }
                      className="mt-1 w-full rounded-lg border border-slate-200 px-4 py-3 text-sm"
                    >
                      <option value="">
                        {customers.length
                          ? "Select customer"
                          : "Add a customer first"}
                      </option>
                      {customers.map((customer) => (
                        <option key={customer.id} value={customer.id}>
                          {getCustomerOptionLabel(customer)}
                        </option>
                      ))}
                    </select>
                    {errors.customerId && (
                      <p className="mt-1 text-sm text-red-600">
                        {errors.customerId}
                      </p>
                    )}
                    {customerError && (
                      <p className="mt-1 text-xs text-amber-700">
                        {customerError}
                      </p>
                    )}
                    {!customerError && customers.length === 0 && (
                      <p className="mt-1 text-xs text-amber-700">
                        Add a customer in the customer register before creating
                        the project.
                      </p>
                    )}
                  </div>

                  <div>
                    <label className="text-sm font-medium text-slate-700">
                      Status
                    </label>
                    <select
                      value={form.status}
                      onChange={(event) => updateField("status", event.target.value)}
                      className="mt-1 w-full rounded-lg border border-slate-200 px-4 py-3 text-sm"
                    >
                      {STATUS_OPTIONS.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </section>

              <section className="rounded-xl border border-slate-200 p-5 shadow-sm">
                <div className="mb-4 flex items-center justify-between">
                  <h3 className="text-base font-semibold text-slate-800">
                    Client Details
                  </h3>
                  <span className="text-xs text-slate-500">
                    Auto-filled from customer record
                  </span>
                </div>

                {!selectedCustomer ? (
                  <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-5 text-sm text-slate-500">
                    Select a customer to populate the project client details.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
                    <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
                      <span className="text-xs uppercase tracking-wide text-slate-500">
                        Company Name
                      </span>
                      <p className="mt-1 font-medium text-slate-700">
                        {getCustomerPrimaryName(selectedCustomer) || "-"}
                      </p>
                    </div>
                    <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
                      <span className="text-xs uppercase tracking-wide text-slate-500">
                        GST Number
                      </span>
                      <p className="mt-1 font-medium text-slate-700">
                        {selectedCustomer.gstNumber || "-"}
                      </p>
                    </div>
                    <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
                      <span className="text-xs uppercase tracking-wide text-slate-500">
                        Contact Person
                      </span>
                      <p className="mt-1 font-medium text-slate-700">
                        {selectedCustomer.contactPerson || "-"}
                      </p>
                    </div>
                    <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
                      <span className="text-xs uppercase tracking-wide text-slate-500">
                        Email
                      </span>
                      <p className="mt-1 font-medium text-slate-700">
                        {selectedCustomer.email || "-"}
                      </p>
                    </div>
                    <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
                      <span className="text-xs uppercase tracking-wide text-slate-500">
                        Phone
                      </span>
                      <p className="mt-1 font-medium text-slate-700">
                        {selectedCustomer.phone || "-"}
                      </p>
                    </div>
                    <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
                      <span className="text-xs uppercase tracking-wide text-slate-500">
                        Designation
                      </span>
                      <p className="mt-1 font-medium text-slate-700">
                        {selectedCustomer.designation || "-"}
                      </p>
                    </div>
                    <div className="lg:col-span-2 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
                      <span className="text-xs uppercase tracking-wide text-slate-500">
                        Address
                      </span>
                      <p className="mt-1 font-medium text-slate-700">
                        {selectedCustomer.address || "-"}
                      </p>
                    </div>
                  </div>
                )}
              </section>

              <section className="rounded-xl border border-slate-200 p-5 shadow-sm">
                <h3 className="mb-4 text-base font-semibold text-slate-800">
                  Timeline
                </h3>
                <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
                  <div>
                    <label className="text-sm font-medium text-slate-700">
                      Start Date
                    </label>
                    <DateInput
                      value={form.startDate}
                      onChange={(value) => updateField("startDate", value || "")}
                      className="mt-1 w-full rounded-lg border border-slate-200 px-4 py-3 text-sm"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-slate-700">
                      End Date
                    </label>
                    <DateInput
                      value={form.endDate}
                      onChange={(value) => updateField("endDate", value || "")}
                      className="mt-1 w-full rounded-lg border border-slate-200 px-4 py-3 text-sm"
                    />
                    {errors.endDate && (
                      <p className="mt-1 text-sm text-red-600">
                        {errors.endDate}
                      </p>
                    )}
                  </div>
                </div>
              </section>

              <section className="rounded-xl border border-slate-200 p-5 shadow-sm">
                <h3 className="mb-4 text-base font-semibold text-slate-800">
                  Notes
                </h3>
                <textarea
                  value={form.notes}
                  onChange={(event) => updateField("notes", event.target.value)}
                  placeholder="Project notes or special requirements"
                  className="min-h-[140px] w-full rounded-lg border border-slate-200 px-4 py-3 text-sm"
                />
              </section>
            </form>
          </div>
        </div>

        <div className="flex items-center justify-between border-t bg-slate-50 px-6 py-4">
          <p className="text-xs text-slate-500">
            Projects help organize inventory allocation and tracking.
          </p>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => navigate(-1)}
              className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-700"
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button
              form="create-project-form"
              type="submit"
              disabled={isSubmitting}
              className="rounded-lg bg-indigo-600 px-5 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-70"
            >
              {isSubmitting ? "Saving..." : "Save Project"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CreateProjects;
