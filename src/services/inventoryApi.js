import api from "./api";

const emitInventoryChange = () => {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("products:changed"));
  }
};

const normalizeItem = (item = {}) => {
  const taxPercentage = Number(item.taxPercentage ?? item.TaxPercentage ?? 0);
  const gst =
    item.gst ??
    item.GST ??
    (Number.isFinite(taxPercentage) ? `${taxPercentage}%` : "");
  const serialRequiredRaw =
    item.serialRequired ?? item.SerialRequired ?? item.IsSerialTracked ?? false;

  return {
    id: item.id ?? item.ItemId ?? null,
    name: item.name ?? item.Name ?? "",
    category: item.category ?? item.Category ?? "",
    brandId: item.brandId ?? item.BrandId ?? null,
    brand: item.brand ?? item.Brand ?? item.BrandName ?? "",
    hsn: item.hsn ?? item.HSN ?? "",
    unit: item.unit ?? item.Unit ?? "PCS",
    stock: Number(item.stock ?? item.Stock ?? 0),
    currentStock: Number(item.currentStock ?? item.stock ?? item.Stock ?? 0),
    price: Number(item.price ?? item.Price ?? 0),
    taxPercentage: Number.isFinite(taxPercentage) ? taxPercentage : 0,
    gst,
    reOrderLevel: Number(
      item.reOrderLevel ?? item.reorderLevel ?? item.ReOrderLevel ?? 0
    ),
    locationId: item.locationId ?? item.LocationId ?? null,
    locationName:
      item.locationName ??
      item.LocationName ??
      item.location ??
      item.Location ??
      "",
    serialRequired: !["0", "false", "no"].includes(
      String(serialRequiredRaw).trim().toLowerCase()
    ),
    serialNumber:
      item.serialNumber ??
      item.SerialNumber ??
      item.SerialNumbe ??
      "",
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
  const normalized = normalizeItem(response.data?.item ?? response.data);
  emitInventoryChange();
  return normalized;
};

export const updateItemApi = async (id, item) => {
  const response = await api.put(`/items/${id}`, item);
  const normalized = normalizeItem(response.data?.item ?? response.data);
  emitInventoryChange();
  return normalized;
};

export const deleteItemApi = async (id) => {
  await api.delete(`/items/${id}`);
  emitInventoryChange();
};

export const updateQuantityApi = async (id, quantity) => {
  const response = await api.patch(`/items/${id}/quantity`, { stock: quantity });
  const normalized = normalizeItem(response.data?.item ?? response.data);
  emitInventoryChange();
  return normalized;
};

export const itemInfoApi = async (id, name, quantity) => {
  return { id, name, quantity };
};
