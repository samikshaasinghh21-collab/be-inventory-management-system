import api from "./api";

export const normalizeVendorContact = (contact = {}) => ({
  id: contact.id ?? contact.VendorContactId ?? null,
  vendorId: contact.vendorId ?? contact.VendorId ?? null,
  contactName:
    contact.contactName ?? contact.ContactName ?? contact.name ?? "",
  email: contact.email ?? contact.Email ?? "",
  designation: contact.designation ?? contact.Designation ?? "",
  phone: contact.phone ?? contact.Phone ?? "",
});

export const normalizeVendor = (vendor = {}) => {
  const id = vendor.id ?? vendor.VendorId ?? vendor.vendorId ?? null;
  const name = vendor.name ?? vendor.VendorName ?? "";
  const phone = vendor.phone ?? vendor.Phone ?? "";
  const email = vendor.email ?? vendor.Email ?? "";
  const gstNumber = vendor.gstNumber ?? vendor.GSTNumber ?? "";
  const address = vendor.address ?? vendor.Address ?? "";
  const city = vendor.city ?? vendor.City ?? "";
  const state = vendor.state ?? vendor.State ?? "";
  const pincode = vendor.pincode ?? vendor.Pincode ?? "";
  const contacts = Array.isArray(vendor.contacts)
    ? vendor.contacts.map(normalizeVendorContact)
    : Array.isArray(vendor.VendorContacts)
    ? vendor.VendorContacts.map(normalizeVendorContact)
    : [];

  return {
    ...vendor,
    id,
    name,
    phone,
    email,
    gstNumber,
    address,
    city,
    state,
    pincode,
    contacts,
    VendorId: vendor.VendorId ?? id,
    VendorName: vendor.VendorName ?? name,
    Phone: vendor.Phone ?? phone,
    Email: vendor.Email ?? email,
    GSTNumber: vendor.GSTNumber ?? gstNumber,
    Address: vendor.Address ?? address,
    City: vendor.City ?? city,
    State: vendor.State ?? state,
    Pincode: vendor.Pincode ?? pincode,
    VendorContacts: vendor.VendorContacts ?? contacts,
  };
};

export const fetchVendors = async () => {
  const response = await api.get("/vendors");
  const list = Array.isArray(response.data) ? response.data : [];
  return list.map(normalizeVendor);
};

export const createVendor = async (payload) => {
  const response = await api.post("/vendors", payload);
  return normalizeVendor(response.data?.vendor ?? response.data);
};

export const updateVendor = async (id, payload) => {
  const response = await api.put(`/vendors/${id}`, payload);
  return normalizeVendor(response.data?.vendor ?? response.data);
};

export const deleteVendor = async (id) => {
  await api.delete(`/vendors/${id}`);
};

export const syncVendorsCache = (vendors) => {
  localStorage.setItem("vendors", JSON.stringify(vendors));
};
