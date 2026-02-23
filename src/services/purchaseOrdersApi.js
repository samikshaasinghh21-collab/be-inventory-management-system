import api from "./api";

const normalizePoItem = (item = {}) => ({
  id: item.id ?? item.Id ?? null,
  purchaseOrderId: item.purchaseOrderId ?? item.PurchaseOrderId ?? null,
  itemId: item.itemId ?? item.ItemId ?? null,
  quantity: Number(item.quantity ?? item.Quantity ?? 0),
  unitPrice: Number(item.unitPrice ?? item.UnitPrice ?? 0),
  totalPrice: Number(item.totalPrice ?? item.TotalPrice ?? ((item.quantity ?? 0) * (item.unitPrice ?? 0))),
});

const normalizePurchaseOrder = (order = {}) => ({
  id: order.id ?? order.PurchaseOrderId ?? null,
  projectId: order.projectId ?? order.ProjectId ?? null,
  vendorId: order.vendorId ?? order.VendorId ?? null,
  status: order.status ?? order.Status ?? "Draft",
  orderDate: order.orderDate ?? order.OrderDate ?? null,
  expectedDate:
    order.expectedDeliveryDate ??
    order.ExpectedDeliveryDate ??
    order.expectedDate ??
    order.ExpectedDate ??
    null,
  notes: order.notes ?? order.Notes ?? "",
  total: Number(order.total ?? order.Total ?? 0),
  items: Array.isArray(order.items)
    ? order.items.map(normalizePoItem)
    : Array.isArray(order.PurchaseOrderItems)
    ? order.PurchaseOrderItems.map(normalizePoItem)
    : [],
});

export const fetchPurchaseOrders = async () => {
  const response = await api.get("/purchase-orders");
  const list = Array.isArray(response.data?.purchaseOrders)
    ? response.data.purchaseOrders
    : Array.isArray(response.data)
    ? response.data
    : [];
  return list.map(normalizePurchaseOrder);
};

export const createPurchaseOrder = async (payload) => {
  const response = await api.post("/purchase-orders", payload);
  return normalizePurchaseOrder(response.data?.purchaseOrder ?? response.data);
};

export const updatePurchaseOrder = async (id, payload) => {
  const response = await api.put(`/purchase-orders/${id}`, payload);
  return normalizePurchaseOrder(response.data?.purchaseOrder ?? response.data);
};

export const deletePurchaseOrder = async (id) => {
  await api.delete(`/purchase-orders/${id}`);
};
