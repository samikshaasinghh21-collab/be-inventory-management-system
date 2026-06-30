import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  deleteVendor,
  fetchVendors,
  syncVendorsCache,
  updateVendor,
} from "../../services/vendorsApi";
import { transformUppercaseFieldValue } from "../../utils/inputTransform";

const emptyForm = {
  VendorName: "",
  Phone: "",
  Email: "",
  GSTNumber: "",
  PANNumber: "",
  BankAccountName: "",
  BankAccountNumber: "",
  BankName: "",
  IFSCCode: "",
  BankBranch: "",
  Documents: [],
  Address: "",
  City: "",
  State: "",
  Pincode: "",
};

const UPPERCASE_FIELDS = [
  "VendorName",
  "Phone",
  "Email",
  "GSTNumber",
  "PANNumber",
  "BankAccountName",
  "BankAccountNumber",
  "BankName",
  "IFSCCode",
  "BankBranch",
  "Address",
  "City",
  "State",
  "Pincode",
];

const UPPERCASE_CONTACT_FIELDS = ["contactName", "email", "designation", "phone"];

const createEmptyContact = () => ({
  id: Date.now() + Math.random(),
  contactName: "",
  email: "",
  designation: "",
  phone: "",
});

const MAX_VENDOR_DOCUMENT_SIZE = 5 * 1024 * 1024;

const readVendorDocument = (file) =>
  new Promise((resolve, reject) => {
    if (!file) {
      reject(new Error("Select a valid file."));
      return;
    }
    if (file.size > MAX_VENDOR_DOCUMENT_SIZE) {
      reject(new Error(`${file.name} is larger than 5 MB.`));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      resolve({
        id: `${Date.now()}-${Math.random()}`,
        name: file.name,
        size: file.size,
        type: file.type,
        uploadedAt: new Date().toISOString(),
        dataUrl: reader.result,
      });
    };
    reader.onerror = () => reject(new Error(`Could not read ${file.name}.`));
    reader.readAsDataURL(file);
  });

const formatVendorLocation = (vendor = {}) =>
  [vendor.city, vendor.state, vendor.pincode]
    .map((value) => String(value ?? "").trim())
    .filter(Boolean)
    .join(", ");

const Vendors = () => {
  const navigate = useNavigate();
  const [vendors, setVendors] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [editingVendor, setEditingVendor] = useState(null);
  const [editForm, setEditForm] = useState(emptyForm);
  const [contacts, setContacts] = useState([createEmptyContact()]);
  const [editErrors, setEditErrors] = useState({});
  const [editError, setEditError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isDeletingId, setIsDeletingId] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteError, setDeleteError] = useState("");

  const loadVendors = async () => {
    setIsLoading(true);
    setLoadError("");
    try {
      const list = await fetchVendors();
      setVendors(list);
      syncVendorsCache(list);
    } catch (error) {
      setLoadError(
        error?.response?.data?.message ||
          error?.response?.data?.error ||
          error?.message ||
          "Failed to load vendors."
      );
      setVendors([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadVendors();
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
        vendor.panNumber,
        vendor.bankAccountName,
        vendor.bankAccountNumber,
        vendor.bankName,
        vendor.ifscCode,
        vendor.bankBranch,
        vendor.address,
        vendor.city,
        vendor.state,
        vendor.pincode,
        ...(vendor.contacts || []).flatMap((contact) => [
          contact.contactName,
          contact.email,
          contact.designation,
          contact.phone,
        ]),
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query))
    );
  }, [vendors, searchQuery]);

  const openEdit = (vendor) => {
    setEditingVendor(vendor);
    setEditForm({
      VendorName: vendor.name ?? "",
      Phone: vendor.phone ?? "",
      Email: vendor.email ?? "",
      GSTNumber: vendor.gstNumber ?? "",
      PANNumber: vendor.panNumber ?? "",
      BankAccountName: vendor.bankAccountName ?? "",
      BankAccountNumber: vendor.bankAccountNumber ?? "",
      BankName: vendor.bankName ?? "",
      IFSCCode: vendor.ifscCode ?? "",
      BankBranch: vendor.bankBranch ?? "",
      Documents: (vendor.documents ?? []).map((document, index) => ({
        ...document,
        id: document.id ?? `${vendor.id || "vendor"}-document-${index}`,
      })),
      Address: vendor.address ?? "",
      City: vendor.city ?? "",
      State: vendor.state ?? "",
      Pincode: vendor.pincode ?? "",
    });
    setContacts(
      vendor.contacts?.length
        ? vendor.contacts.map((contact) => ({
            id: contact.id ?? Date.now() + Math.random(),
            contactName: contact.contactName ?? "",
            email: contact.email ?? "",
            designation: contact.designation ?? "",
            phone: contact.phone ?? "",
          }))
        : [createEmptyContact()]
    );
    setEditErrors({});
    setEditError("");
  };

  const closeEdit = () => {
    setEditingVendor(null);
    setEditForm(emptyForm);
    setContacts([createEmptyContact()]);
    setEditErrors({});
    setEditError("");
  };

  const updateEditField = (key, value) => {
    setEditForm((prev) => ({
      ...prev,
      [key]: transformUppercaseFieldValue(key, value, UPPERCASE_FIELDS),
    }));
    if (editErrors[key]) {
      setEditErrors((prev) => ({ ...prev, [key]: undefined }));
    }
  };

  const updateContact = (id, key, value) => {
    setContacts((prev) =>
      prev.map((contact) =>
        contact.id === id
          ? {
              ...contact,
              [key]: transformUppercaseFieldValue(
                key,
                value,
                UPPERCASE_CONTACT_FIELDS
              ),
            }
          : contact
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

  const handleEditDocumentUpload = async (event) => {
    const files = Array.from(event.target.files || []);
    if (!files.length) {
      return;
    }
    try {
      const documents = await Promise.all(files.map(readVendorDocument));
      updateEditField("Documents", [...(editForm.Documents || []), ...documents]);
      setEditError("");
    } catch (error) {
      setEditError(error?.message || "Failed to upload vendor document.");
    } finally {
      event.target.value = "";
    }
  };

  const removeEditDocument = (id) => {
    updateEditField(
      "Documents",
      (editForm.Documents || []).filter((document) => document.id !== id)
    );
  };

  const validateEdit = () => {
    const nextErrors = {};
    if (!editForm.VendorName.trim()) {
      nextErrors.VendorName = "Vendor name is required.";
    }
    if (!editForm.Phone.trim()) {
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

    setEditErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleEditSubmit = async (event) => {
    event.preventDefault();
    if (!editingVendor || !validateEdit() || isSaving) {
      return;
    }

    setIsSaving(true);
    try {
      const updated = await updateVendor(editingVendor.id, {
        name: editForm.VendorName.trim(),
        phone: editForm.Phone.trim(),
        email: editForm.Email.trim() || undefined,
        gstNumber: editForm.GSTNumber.trim() || undefined,
        panNumber: editForm.PANNumber.trim() || undefined,
        bankAccountName: editForm.BankAccountName.trim() || undefined,
        bankAccountNumber: editForm.BankAccountNumber.trim() || undefined,
        bankName: editForm.BankName.trim() || undefined,
        ifscCode: editForm.IFSCCode.trim() || undefined,
        bankBranch: editForm.BankBranch.trim() || undefined,
        documents: editForm.Documents || [],
        address: editForm.Address.trim() || undefined,
        city: editForm.City.trim() || undefined,
        state: editForm.State.trim() || undefined,
        pincode: editForm.Pincode.trim() || undefined,
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

      const nextVendors = vendors.map((vendor) =>
        vendor.id === updated.id ? updated : vendor
      );
      setVendors(nextVendors);
      syncVendorsCache(nextVendors);
      closeEdit();
    } catch (error) {
      setEditError(
        error?.response?.data?.message ||
          error?.response?.data?.error ||
          error?.message ||
          "Failed to update vendor."
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
      await deleteVendor(deleteTarget.id);
      const nextVendors = vendors.filter((vendor) => vendor.id !== deleteTarget.id);
      setVendors(nextVendors);
      syncVendorsCache(nextVendors);
      setDeleteTarget(null);
    } catch (error) {
      setDeleteError(
        error?.response?.data?.message ||
          error?.response?.data?.error ||
          error?.message ||
          "Failed to delete vendor."
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
          <h1 className="text-3xl font-semibold text-slate-800">Vendors</h1>
          <p className="mt-1 text-sm text-slate-500">
            Manage vendors and multiple contact persons in one register.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={loadVendors}
            className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700"
          >
            Refresh
          </button>
          <button
            type="button"
            onClick={() => navigate("/inventory/create-vendors")}
            className="rounded-lg bg-indigo-600 px-5 py-2 text-sm font-medium text-white hover:bg-indigo-700"
          >
            + Add Vendor
          </button>
        </div>
      </div>

      <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-sm text-slate-500">Total Vendors</p>
          <p className="text-2xl font-semibold text-slate-800">
            {isLoading ? "..." : vendors.length}
          </p>
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between gap-4 border-b px-4 py-3">
          <div>
            <h3 className="text-lg font-semibold text-slate-800">
              Vendor Register
            </h3>
            {loadError && (
              <p className="mt-1 text-xs text-amber-700">{loadError}</p>
            )}
          </div>
          <input
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Search vendor, GST, contact person, email..."
            className="w-80 max-w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
          />
        </div>
        <table className="w-full text-sm">
          <thead className="bg-slate-100 text-slate-600">
            <tr>
              <th className="p-3 text-left min-w-[180px]">Vendor Name</th>
              <th className="p-3 text-left min-w-[150px]">Phone</th>
              <th className="p-3 text-left min-w-[180px]">Email</th>
              <th className="p-3 text-left min-w-[150px]">GST</th>
              <th className="p-3 text-left min-w-[150px]">PAN</th>
              <th className="p-3 text-left min-w-[200px]">Bank</th>
              <th className="p-3 text-left min-w-[220px]">Primary Contact</th>
              <th className="p-3 text-left min-w-[120px]">Contacts</th>
              <th className="p-3 text-left min-w-[180px]">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredVendors.length === 0 && (
              <tr>
                <td colSpan="9" className="p-6 text-center text-slate-500">
                  {vendors.length === 0
                    ? "No vendors added yet."
                    : "No vendors match your search."}
                </td>
              </tr>
            )}
            {filteredVendors.map((vendor) => {
              const primaryContact = vendor.contacts?.[0];
              return (
                <tr key={vendor.id} className="border-t hover:bg-slate-50">
                  <td className="p-3 font-medium text-slate-800">
                    <div>{vendor.name || "-"}</div>
                    <div className="text-xs text-slate-500">
                      {vendor.address || "No address"}
                    </div>
                    {formatVendorLocation(vendor) ? (
                      <div className="text-xs text-slate-500">
                        {formatVendorLocation(vendor)}
                      </div>
                    ) : null}
                  </td>
                  <td className="p-3">{vendor.phone || "-"}</td>
                  <td className="p-3">{vendor.email || "-"}</td>
                  <td className="p-3">{vendor.gstNumber || "-"}</td>
                  <td className="p-3">{vendor.panNumber || "-"}</td>
                  <td className="p-3">
                    <div>{vendor.bankName || "-"}</div>
                    <div className="text-xs text-slate-500">
                      {vendor.bankAccountNumber || "No account"}
                    </div>
                    {vendor.documents?.length ? (
                      <div className="text-xs text-slate-500">
                        {vendor.documents.length} file(s)
                      </div>
                    ) : null}
                  </td>
                  <td className="p-3">
                    {primaryContact ? (
                      <>
                        <div className="font-medium text-slate-700">
                          {primaryContact.contactName}
                        </div>
                        <div className="text-xs text-slate-500">
                          {primaryContact.designation}
                        </div>
                      </>
                    ) : (
                      "-"
                    )}
                  </td>
                  <td className="p-3">{vendor.contacts?.length || 0}</td>
                  <td className="p-3">
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => openEdit(vendor)}
                        className="rounded-md bg-indigo-600 px-3 py-1 text-xs font-medium text-white hover:bg-indigo-700"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setDeleteTarget(vendor);
                          setDeleteError("");
                        }}
                        className="rounded-md bg-red-600 px-3 py-1 text-xs font-medium text-white hover:bg-red-700"
                        disabled={isDeletingId === vendor.id}
                      >
                        {isDeletingId === vendor.id ? "Deleting..." : "Delete"}
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {editingVendor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-[1px]">
          <div className="flex max-h-[92vh] w-[980px] max-w-[96vw] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b bg-slate-50 px-6 py-4">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-slate-500">
                  Vendors
                </p>
                <h2 className="text-xl font-semibold text-slate-900">
                  Edit Vendor
                </h2>
              </div>
              <button
                type="button"
                onClick={closeEdit}
                className="grid h-9 w-9 place-items-center rounded-full border border-slate-200 text-slate-500 hover:border-slate-300 hover:text-slate-900"
              >
                X
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6">
              <form
                id="edit-vendor-form"
                className="space-y-6"
                onSubmit={handleEditSubmit}
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
                        value={editForm.VendorName}
                        onChange={(event) =>
                          updateEditField("VendorName", event.target.value)
                        }
                        className="mt-1 w-full rounded-lg border border-slate-200 px-4 py-3 text-sm"
                      />
                      {editErrors.VendorName && (
                        <p className="mt-1 text-sm text-red-600">
                          {editErrors.VendorName}
                        </p>
                      )}
                    </div>

                    <div>
                      <label className="text-sm font-medium text-slate-700">
                        Phone *
                      </label>
                      <input
                        value={editForm.Phone}
                        onChange={(event) =>
                          updateEditField("Phone", event.target.value)
                        }
                        className="mt-1 w-full rounded-lg border border-slate-200 px-4 py-3 text-sm"
                      />
                      {editErrors.Phone && (
                        <p className="mt-1 text-sm text-red-600">
                          {editErrors.Phone}
                        </p>
                      )}
                    </div>

                    <div>
                      <label className="text-sm font-medium text-slate-700">
                        Email
                      </label>
                      <input
                        value={editForm.Email}
                        onChange={(event) =>
                          updateEditField("Email", event.target.value)
                        }
                        className="mt-1 w-full rounded-lg border border-slate-200 px-4 py-3 text-sm"
                      />
                    </div>

                    <div>
                      <label className="text-sm font-medium text-slate-700">
                        GST Number
                      </label>
                      <input
                        value={editForm.GSTNumber}
                        onChange={(event) =>
                          updateEditField("GSTNumber", event.target.value)
                        }
                        className="mt-1 w-full rounded-lg border border-slate-200 px-4 py-3 text-sm"
                      />
                    </div>

                    <div>
                      <label className="text-sm font-medium text-slate-700">
                        PAN Number
                      </label>
                      <input
                        value={editForm.PANNumber}
                        onChange={(event) =>
                          updateEditField("PANNumber", event.target.value.toUpperCase())
                        }
                        className="mt-1 w-full rounded-lg border border-slate-200 px-4 py-3 text-sm"
                      />
                    </div>

                    <div>
                      <label className="text-sm font-medium text-slate-700">
                        Bank Account Name
                      </label>
                      <input
                        value={editForm.BankAccountName}
                        onChange={(event) =>
                          updateEditField("BankAccountName", event.target.value)
                        }
                        className="mt-1 w-full rounded-lg border border-slate-200 px-4 py-3 text-sm"
                      />
                    </div>

                    <div>
                      <label className="text-sm font-medium text-slate-700">
                        Bank Account Number
                      </label>
                      <input
                        value={editForm.BankAccountNumber}
                        onChange={(event) =>
                          updateEditField("BankAccountNumber", event.target.value)
                        }
                        className="mt-1 w-full rounded-lg border border-slate-200 px-4 py-3 text-sm"
                      />
                    </div>

                    <div>
                      <label className="text-sm font-medium text-slate-700">
                        Bank Name
                      </label>
                      <input
                        value={editForm.BankName}
                        onChange={(event) =>
                          updateEditField("BankName", event.target.value)
                        }
                        className="mt-1 w-full rounded-lg border border-slate-200 px-4 py-3 text-sm"
                      />
                    </div>

                    <div>
                      <label className="text-sm font-medium text-slate-700">
                        IFSC Code
                      </label>
                      <input
                        value={editForm.IFSCCode}
                        onChange={(event) =>
                          updateEditField("IFSCCode", event.target.value.toUpperCase())
                        }
                        className="mt-1 w-full rounded-lg border border-slate-200 px-4 py-3 text-sm"
                      />
                    </div>

                    <div>
                      <label className="text-sm font-medium text-slate-700">
                        Bank Branch
                      </label>
                      <input
                        value={editForm.BankBranch}
                        onChange={(event) =>
                          updateEditField("BankBranch", event.target.value)
                        }
                        className="mt-1 w-full rounded-lg border border-slate-200 px-4 py-3 text-sm"
                      />
                    </div>

                    <div className="lg:col-span-2">
                      <label className="text-sm font-medium text-slate-700">
                        Upload Documents
                      </label>
                      <input
                        type="file"
                        multiple
                        onChange={handleEditDocumentUpload}
                        className="mt-1 w-full rounded-lg border border-slate-200 px-4 py-3 text-sm"
                      />
                      {(editForm.Documents || []).length > 0 && (
                        <div className="mt-3 space-y-2">
                          {editForm.Documents.map((document) => (
                            <div
                              key={document.id}
                              className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-sm"
                            >
                              <span className="truncate text-slate-700">
                                {document.name}
                              </span>
                              <button
                                type="button"
                                onClick={() => removeEditDocument(document.id)}
                                className="text-xs font-medium text-red-600"
                              >
                                Remove
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="lg:col-span-2">
                      <label className="text-sm font-medium text-slate-700">
                        Address
                      </label>
                      <textarea
                        value={editForm.Address}
                        onChange={(event) =>
                          updateEditField("Address", event.target.value)
                        }
                        className="mt-1 min-h-[120px] w-full rounded-lg border border-slate-200 px-4 py-3 text-sm"
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium text-slate-700">
                        City
                      </label>
                      <input
                        value={editForm.City}
                        onChange={(event) =>
                          updateEditField("City", event.target.value)
                        }
                        className="mt-1 w-full rounded-lg border border-slate-200 px-4 py-3 text-sm"
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium text-slate-700">
                        State
                      </label>
                      <input
                        value={editForm.State}
                        onChange={(event) =>
                          updateEditField("State", event.target.value)
                        }
                        className="mt-1 w-full rounded-lg border border-slate-200 px-4 py-3 text-sm"
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium text-slate-700">
                        Pincode
                      </label>
                      <input
                        value={editForm.Pincode}
                        onChange={(event) =>
                          updateEditField("Pincode", event.target.value)
                        }
                        className="mt-1 w-full rounded-lg border border-slate-200 px-4 py-3 text-sm"
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
                        Add, update, or remove contacts under the same vendor.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={addContact}
                      className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-700"
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
                            className="text-xs font-medium text-red-600"
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
                            {editErrors[`contactName-${index}`] && (
                              <p className="mt-1 text-sm text-red-600">
                                {editErrors[`contactName-${index}`]}
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
                                updateContact(
                                  contact.id,
                                  "email",
                                  event.target.value
                                )
                              }
                              className="mt-1 w-full rounded-lg border border-slate-200 px-4 py-3 text-sm"
                            />
                            {editErrors[`contactEmail-${index}`] && (
                              <p className="mt-1 text-sm text-red-600">
                                {editErrors[`contactEmail-${index}`]}
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
                            {editErrors[`contactDesignation-${index}`] && (
                              <p className="mt-1 text-sm text-red-600">
                                {editErrors[`contactDesignation-${index}`]}
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
                                updateContact(
                                  contact.id,
                                  "phone",
                                  event.target.value
                                )
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
              {editError ? (
                <p className="text-xs text-red-600">{editError}</p>
              ) : (
                <p className="text-xs text-slate-500">
                  Save vendor changes to update purchase-order contact details.
                </p>
              )}
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={closeEdit}
                  className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-700"
                  disabled={isSaving}
                >
                  Cancel
                </button>
                <button
                  form="edit-vendor-form"
                  type="submit"
                  className="rounded-lg bg-indigo-600 px-5 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-[1px]">
          <div className="w-[520px] max-w-[92vw] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
            <div className="border-b bg-slate-900 px-6 py-5">
              <p className="text-xs uppercase tracking-[0.3em] text-slate-300">
                Vendors
              </p>
              <h2 className="text-lg font-semibold text-white">
                Delete Vendor
              </h2>
            </div>
            <div className="px-6 py-5 text-sm text-slate-600">
              <p>
                Are you sure you want to delete{" "}
                <span className="font-semibold text-slate-900">
                  {deleteTarget.name || "this vendor"}
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
