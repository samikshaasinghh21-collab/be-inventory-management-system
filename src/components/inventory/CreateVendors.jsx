import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  createVendor,
  fetchVendors,
  syncVendorsCache,
} from "../../services/vendorsApi";

const createEmptyContact = () => ({
  id: Date.now() + Math.random(),
  contactName: "",
  email: "",
  designation: "",
  phone: "",
});

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
  const [contacts, setContacts] = useState([createEmptyContact()]);
  const [errors, setErrors] = useState({});
  const [submitError, setSubmitError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const updateField = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    if (errors[key]) {
      setErrors((prev) => ({ ...prev, [key]: undefined }));
    }
  };

  const updateContact = (id, key, value) => {
    setContacts((prev) =>
      prev.map((contact) =>
        contact.id === id ? { ...contact, [key]: value } : contact
      )
    );
  };

  const addContact = () => {
    setContacts((prev) => [...prev, createEmptyContact()]);
  };

  const removeContact = (id) => {
    setContacts((prev) => {
      const next = prev.filter((contact) => contact.id !== id);
      return next.length ? next : [createEmptyContact()];
    });
  };

  const validate = () => {
    const nextErrors = {};
    if (!form.VendorName.trim()) {
      nextErrors.VendorName = "Vendor name is required.";
    }
    if (!form.Phone.trim()) {
      nextErrors.Phone = "Phone number is required.";
    }

    const normalizedContacts = contacts.filter((contact) =>
      [
        contact.contactName,
        contact.email,
        contact.designation,
        contact.phone,
      ].some((value) => String(value || "").trim())
    );

    normalizedContacts.forEach((contact, index) => {
      if (!contact.contactName.trim()) {
        nextErrors[`contactName-${index}`] = "Contact name is required.";
      }
      if (!contact.email.trim()) {
        nextErrors[`contactEmail-${index}`] = "Email is required.";
      }
      if (!contact.designation.trim()) {
        nextErrors[`contactDesignation-${index}`] = "Designation is required.";
      }
    });

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSubmitError("");

    if (!validate() || isSubmitting) {
      return;
    }

    setIsSubmitting(true);
    try {
      await createVendor({
        name: form.VendorName.trim(),
        phone: form.Phone.trim(),
        email: form.Email.trim() || undefined,
        gstNumber: form.GSTNumber.trim() || undefined,
        address: form.Address.trim() || undefined,
        contacts: contacts
          .filter((contact) =>
            [
              contact.contactName,
              contact.email,
              contact.designation,
              contact.phone,
            ].some((value) => String(value || "").trim())
          )
          .map((contact) => ({
            contactName: contact.contactName.trim(),
            email: contact.email.trim(),
            designation: contact.designation.trim(),
            phone: contact.phone.trim() || undefined,
          })),
      });

      const vendors = await fetchVendors();
      syncVendorsCache(vendors);
      navigate("/inventory/vendors");
    } catch (error) {
      setSubmitError(
        error?.response?.data?.message ||
          error?.response?.data?.error ||
          error?.message ||
          "Failed to create vendor."
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
              Vendors
            </p>
            <h2 className="text-xl font-semibold text-slate-900">
              Create Vendor
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

        <div className="flex-1 overflow-y-auto p-6">
          <form
            id="create-vendor-form"
            className="space-y-6"
            onSubmit={handleSubmit}
            noValidate
          >
            <section className="rounded-xl border border-slate-200 p-5 shadow-sm">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-base font-semibold text-slate-800">
                  Vendor Details
                </h3>
                <span className="text-xs text-slate-500">
                  Required fields marked *
                </span>
              </div>

              <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
                <div>
                  <label className="text-sm font-medium text-slate-700">
                    Vendor Name *
                  </label>
                  <input
                    value={form.VendorName}
                    onChange={(event) =>
                      updateField("VendorName", event.target.value)
                    }
                    className="mt-1 w-full rounded-lg border border-slate-200 px-4 py-3 text-sm"
                  />
                  {errors.VendorName && (
                    <p className="mt-1 text-sm text-red-600">
                      {errors.VendorName}
                    </p>
                  )}
                </div>

                <div>
                  <label className="text-sm font-medium text-slate-700">
                    Phone *
                  </label>
                  <input
                    value={form.Phone}
                    onChange={(event) => updateField("Phone", event.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-200 px-4 py-3 text-sm"
                  />
                  {errors.Phone && (
                    <p className="mt-1 text-sm text-red-600">{errors.Phone}</p>
                  )}
                </div>

                <div>
                  <label className="text-sm font-medium text-slate-700">
                    Email
                  </label>
                  <input
                    value={form.Email}
                    onChange={(event) => updateField("Email", event.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-200 px-4 py-3 text-sm"
                  />
                </div>

                <div>
                  <label className="text-sm font-medium text-slate-700">
                    GST Number
                  </label>
                  <input
                    value={form.GSTNumber}
                    onChange={(event) =>
                      updateField("GSTNumber", event.target.value)
                    }
                    className="mt-1 w-full rounded-lg border border-slate-200 px-4 py-3 text-sm"
                  />
                </div>

                <div className="lg:col-span-2">
                  <label className="text-sm font-medium text-slate-700">
                    Address
                  </label>
                  <textarea
                    value={form.Address}
                    onChange={(event) => updateField("Address", event.target.value)}
                    className="mt-1 min-h-[120px] w-full rounded-lg border border-slate-200 px-4 py-3 text-sm"
                  />
                </div>
              </div>
            </section>

            <section className="rounded-xl border border-slate-200 p-5 shadow-sm">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h3 className="text-base font-semibold text-slate-800">
                    Contact Persons
                  </h3>
                  <p className="text-sm text-slate-500">
                    Add multiple contacts for the same vendor.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={addContact}
                  className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-700 hover:border-slate-300"
                >
                  + Add Contact
                </button>
              </div>

              <div className="space-y-4">
                {contacts.map((contact, index) => (
                  <div
                    key={contact.id}
                    className="rounded-xl border border-slate-200 p-4"
                  >
                    <div className="mb-4 flex items-center justify-between">
                      <h4 className="text-sm font-semibold text-slate-800">
                        Contact {index + 1}
                      </h4>
                      <button
                        type="button"
                        onClick={() => removeContact(contact.id)}
                        className="text-xs font-medium text-red-600 hover:text-red-700"
                      >
                        Remove
                      </button>
                    </div>

                    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                      <div>
                        <label className="text-sm font-medium text-slate-700">
                          Contact Name
                        </label>
                        <input
                          value={contact.contactName}
                          onChange={(event) =>
                            updateContact(
                              contact.id,
                              "contactName",
                              event.target.value
                            )
                          }
                          className="mt-1 w-full rounded-lg border border-slate-200 px-4 py-3 text-sm"
                        />
                        {errors[`contactName-${index}`] && (
                          <p className="mt-1 text-sm text-red-600">
                            {errors[`contactName-${index}`]}
                          </p>
                        )}
                      </div>
                      <div>
                        <label className="text-sm font-medium text-slate-700">
                          Email ID
                        </label>
                        <input
                          value={contact.email}
                          onChange={(event) =>
                            updateContact(contact.id, "email", event.target.value)
                          }
                          className="mt-1 w-full rounded-lg border border-slate-200 px-4 py-3 text-sm"
                        />
                        {errors[`contactEmail-${index}`] && (
                          <p className="mt-1 text-sm text-red-600">
                            {errors[`contactEmail-${index}`]}
                          </p>
                        )}
                      </div>
                      <div>
                        <label className="text-sm font-medium text-slate-700">
                          Designation
                        </label>
                        <input
                          value={contact.designation}
                          onChange={(event) =>
                            updateContact(
                              contact.id,
                              "designation",
                              event.target.value
                            )
                          }
                          className="mt-1 w-full rounded-lg border border-slate-200 px-4 py-3 text-sm"
                        />
                        {errors[`contactDesignation-${index}`] && (
                          <p className="mt-1 text-sm text-red-600">
                            {errors[`contactDesignation-${index}`]}
                          </p>
                        )}
                      </div>
                      <div>
                        <label className="text-sm font-medium text-slate-700">
                          Phone Number
                        </label>
                        <input
                          value={contact.phone}
                          onChange={(event) =>
                            updateContact(contact.id, "phone", event.target.value)
                          }
                          className="mt-1 w-full rounded-lg border border-slate-200 px-4 py-3 text-sm"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </form>
        </div>

        <div className="flex items-center justify-between border-t bg-slate-50 px-6 py-4">
          {submitError ? (
            <p className="text-xs text-red-600">{submitError}</p>
          ) : (
            <p className="text-xs text-slate-500">
              Vendors and contact persons will be available in purchase-order
              workflows after save.
            </p>
          )}
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
              form="create-vendor-form"
              type="submit"
              className="rounded-lg bg-indigo-600 px-5 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
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
