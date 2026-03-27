import api from "./api";

export const normalizeCustomer = (customer = {}) => ({
  id: customer.id ?? customer.CustomerId ?? customer.customerId ?? null,
  name: customer.name ?? customer.CustomerName ?? "",
  companyName: customer.companyName ?? customer.CompanyName ?? "",
  address: customer.address ?? customer.Address ?? "",
  gstNumber: customer.gstNumber ?? customer.GSTNumber ?? "",
  phone:
    customer.phone ?? customer.ContactNumber ?? customer.Phone ?? "",
  email: customer.email ?? customer.Email ?? "",
  contactPerson:
    customer.contactPerson ?? customer.ContactPerson ?? "",
  designation: customer.designation ?? customer.Designation ?? "",
});

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
