import api from "./api";

export const normalizeCustomerContact = (contact = {}) => ({
  id: contact.id ?? contact.CustomerContactId ?? contact.customerContactId ?? null,
  customerId: contact.customerId ?? contact.CustomerId ?? null,
  contactName:
    contact.contactName ?? contact.ContactName ?? contact.name ?? "",
  email: contact.email ?? contact.Email ?? "",
  designation: contact.designation ?? contact.Designation ?? "",
  phone: contact.phone ?? contact.Phone ?? "",
});

export const normalizeCustomer = (customer = {}) => {
  const contacts = Array.isArray(customer.contacts)
    ? customer.contacts.map(normalizeCustomerContact)
    : Array.isArray(customer.CustomerContacts)
    ? customer.CustomerContacts.map(normalizeCustomerContact)
    : [];
  const primaryContact = contacts[0] ?? null;

  return {
    id: customer.id ?? customer.CustomerId ?? customer.customerId ?? null,
    name: customer.name ?? customer.CustomerName ?? "",
    companyName: customer.companyName ?? customer.CompanyName ?? "",
    address: customer.address ?? customer.Address ?? "",
    gstNumber: customer.gstNumber ?? customer.GSTNumber ?? "",
    gstType:
      String(customer.gstType ?? customer.GSTType ?? "intra")
        .trim()
        .toLowerCase() === "inter"
        ? "inter"
        : "intra",
    city: customer.city ?? customer.City ?? "",
    state: customer.state ?? customer.State ?? "",
    pincode: customer.pincode ?? customer.Pincode ?? "",
    phone:
      customer.phone ??
      customer.ContactNumber ??
      customer.Phone ??
      primaryContact?.phone ??
      "",
    email:
      customer.email ??
      customer.Email ??
      primaryContact?.email ??
      "",
    contactPerson:
      customer.contactPerson ??
      customer.ContactPerson ??
      primaryContact?.contactName ??
      "",
    designation:
      customer.designation ??
      customer.Designation ??
      primaryContact?.designation ??
      "",
    contacts,
  };
};

export const fetchCustomers = async () => {
  const response = await api.get("/customers");
  const list = Array.isArray(response.data) ? response.data : [];
  return list.map(normalizeCustomer);
};

export const createCustomer = async (payload) => {
  const response = await api.post("/customers", payload);
  return normalizeCustomer(response.data?.customer ?? response.data);
};

export const updateCustomer = async (id, payload) => {
  const response = await api.put(`/customers/${id}`, payload);
  return normalizeCustomer(response.data?.customer ?? response.data);
};

export const deleteCustomer = async (id) => {
  await api.delete(`/customers/${id}`);
};
