import api from "./api";

const normalizeBrand = (brand = {}) => ({
  id: brand.id ?? brand.BrandId ?? brand.brandId ?? null,
  name: brand.name ?? brand.BrandName ?? brand.brandName ?? "",
});

export const fetchBrands = async () => {
  const response = await api.get("/brands");
  const list = Array.isArray(response.data?.brands)
    ? response.data.brands
    : Array.isArray(response.data)
    ? response.data
    : [];
  return list.map(normalizeBrand);
};

export const createBrand = async (payload) => {
  const response = await api.post("/brands", payload);
  return normalizeBrand(response.data?.brand ?? response.data);
};
