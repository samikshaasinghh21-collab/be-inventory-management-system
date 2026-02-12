import api from "./api";

export const normalizeVendor = (vendor = {}) => {
  const id = vendor.id ?? vendor.VendorId ?? vendor.vendorId ?? null;
  const name = vendor.name ?? vendor.VendorName ?? "";
  const phone = vendor.phone ?? vendor.Phone ?? "";
  const email = vendor.email ?? vendor.Email ?? "";
  const gstNumber = vendor.gstNumber ?? vendor.GSTNumber ?? "";
  const address = vendor.address ?? vendor.Address ?? "";

  return {
    ...vendor,
    id,
    name,
    phone,
    email,
    gstNumber,
    address,
    VendorId: vendor.VendorId ?? id,
    VendorName: vendor.VendorName ?? name,
    Phone: vendor.Phone ?? phone,
    Email: vendor.Email ?? email,
    GSTNumber: vendor.GSTNumber ?? gstNumber,
    Address: vendor.Address ?? address,
  };
};

export const fetchVendors = async () => {
  const response = await api.get("/vendors");
  const list = Array.isArray(response.data) ? response.data : [];
  return list.map(normalizeVendor);
};

export const syncVendorsCache = (vendors) => {
  localStorage.setItem("vendors", JSON.stringify(vendors));
};
