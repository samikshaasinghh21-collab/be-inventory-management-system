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
    serialNumber:
      item.serialNumber ??
      item.SerialNumber ??
      item.serialNo ??
      item.SerialNo ??
      "",
    hsn: item.hsn ?? item.HSN ?? "",
    unit: item.unit ?? item.Unit ?? "PCS",
    stock: Number(item.stock ?? item.Stock ?? 0),
    price: Number(item.price ?? item.Price ?? 0),
    taxPercentage: Number.isFinite(taxPercentage) ? taxPercentage : 0,
    gst,
    description: item.description ?? item.Description ?? "",
  };
};

const extractItemsList = (payload) => {
  if (Array.isArray(payload)) {
    return payload;
  }
  if (Array.isArray(payload?.items)) {
    return payload.items;
  }
  if (Array.isArray(payload?.data)) {
    return payload.data;
  }
  if (Array.isArray(payload?.data?.items)) {
    return payload.data.items;
  }
  return [];
};

const extractItemRecord = (payload) =>
  payload?.item ?? payload?.data?.item ?? payload?.data ?? payload;

export const fetchItems = async () => {
  const response = await api.get("/items");
  console.log("inventoryApi /items response:", response.data);
  const list = extractItemsList(response.data);
  return list.map(normalizeItem);
};

export const createItem = async (item) => {
  console.log("inventoryApi createItem payload:", item);
  const response = await api.post("/items", item);
  console.log("inventoryApi createItem response:", response.data);
  return normalizeItem(extractItemRecord(response.data));
};

export const updateItemApi = async (id, item) => {
  console.log("inventoryApi updateItem payload:", { id, item });
  const response = await api.put(`/items/${id}`, item);
  console.log("inventoryApi updateItem response:", response.data);
  return normalizeItem(extractItemRecord(response.data));
};

export const deleteItemApi = async (id) => {
  await api.delete(`/items/${id}`);
};

export const updateQuantityApi = async (id, quantity) => {
  const response = await api.patch(`/items/${id}/quantity`, { stock: quantity });
  return normalizeItem(extractItemRecord(response.data));
};

export const itemInfoApi = async (id, name, quantity) => {
  return { id, name, quantity };
};
