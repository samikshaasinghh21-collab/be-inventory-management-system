import api from "./api";

const normalizeItem = (item = {}) => {
  const taxPercentage = Number(item.taxPercentage ?? item.TaxPercentage ?? 0);
  const gst =
    item.gst ??
    item.GST ??
    (Number.isFinite(taxPercentage) ? `${taxPercentage}%` : "");

  return {
    id: item.id ?? item.ItemId ?? null,
    name: item.name ?? item.Name ?? "",
    category: item.category ?? item.Category ?? "",
    hsn: item.hsn ?? item.HSN ?? "",
    unit: item.unit ?? item.Unit ?? "PCS",
    stock: Number(item.stock ?? item.Stock ?? 0),
    price: Number(item.price ?? item.Price ?? 0),
    taxPercentage: Number.isFinite(taxPercentage) ? taxPercentage : 0,
    gst,
    description: item.description ?? item.Description ?? "",
  };
};

export const fetchItems = async () => {
  const response = await api.get("/items");
  const list = Array.isArray(response.data) ? response.data : [];
  return list.map(normalizeItem);
};

export const createItem = async (item) => {
  const response = await api.post("/items", item);
  return normalizeItem(response.data?.item ?? response.data);
};

export const updateItemApi = async (id, item) => {
  const response = await api.put(`/items/${id}`, item);
  return normalizeItem(response.data?.item ?? response.data);
};

export const deleteItemApi = async (id) => {
  await api.delete(`/items/${id}`);
};

export const updateQuantityApi = async (id, quantity) => {
  const response = await api.patch(`/items/${id}/quantity`, { stock: quantity });
  return normalizeItem(response.data?.item ?? response.data);
};

export const itemInfoApi = async (id, name, quantity) => {
  return { id, name, quantity };
};
