import api from "./api";

const getPurchaseOrderNotes = (order = {}) => {
  const candidates = [
    order.notes,
    order.Notes,
    order.Terms,
    order.terms,
    order.TermsAndConditions,
    order.termsAndConditions,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === "string") {
      if (candidate.trim()) return candidate;
      continue;
    }
    if (candidate != null) {
      return candidate;
    }
  }

  return "";
};

const normalizePoItem = (item = {}) => ({
  id: item.id ?? item.Id ?? null,
  poItemId: item.poItemId ?? item.purchaseOrderItemId ?? item.PurchaseOrderItemId ?? item.id ?? item.Id ?? null,
  purchaseOrderId: item.purchaseOrderId ?? item.PurchaseOrderId ?? null,
  itemId: item.itemId ?? item.ItemId ?? null,
  name: item.name ?? item.Name ?? item.ItemName ?? "",
  description: item.description ?? item.Description ?? "",
  unit: item.unit ?? item.Unit ?? "PCS",
  hsn: item.hsn ?? item.HSN ?? item.hsnCode ?? item.HSNCode ?? "",
  gst: item.gst ?? item.GST ?? item.gstRate ?? item.GSTRate ?? "",
  taxPercentage: Number(item.taxPercentage ?? item.TaxPercentage ?? 0),
  location: item.location ?? item.Location ?? item.notes ?? item.Notes ?? "",
  notes: item.notes ?? item.Notes ?? item.location ?? item.Location ?? "",
  quantity: Number(item.quantity ?? item.Quantity ?? item.Qty ?? 0),
  unitPrice: Number(
    item.unitPrice ?? item.UnitPrice ?? item.rate ?? item.Rate ?? 0
  ),
  totalPrice: Number(
    item.totalPrice ??
      item.TotalPrice ??
      item.total ??
      item.Total ??
      ((item.quantity ?? item.Quantity ?? item.Qty ?? 0) *
        (item.unitPrice ?? item.UnitPrice ?? item.rate ?? item.Rate ?? 0))
  ),
});

const normalizePurchaseOrder = (order = {}) => ({
  id: order.id ?? order.PurchaseOrderId ?? null,
  poNumber:
    order.poNumber ??
    order.PONumber ??
    order.PoNumber ??
    order.purchaseOrderNumber ??
    "",
  projectId: order.projectId ?? order.ProjectId ?? null,
  vendorId: order.vendorId ?? order.VendorId ?? null,
  locationId: order.locationId ?? order.LocationId ?? null,
  status: order.status ?? order.Status ?? "Draft",
  orderDate: order.orderDate ?? order.OrderDate ?? null,
  expectedDate:
    order.expectedDeliveryDate ??
    order.ExpectedDeliveryDate ??
    order.expectedDate ??
    order.ExpectedDate ??
    null,
  notes: getPurchaseOrderNotes(order),
  total: Number(order.total ?? order.Total ?? 0),
  items: Array.isArray(order.items)
    ? order.items.map(normalizePoItem)
    : Array.isArray(order.PurchaseOrderItems)
    ? order.PurchaseOrderItems.map(normalizePoItem)
    : [],
});

export const fetchPurchaseOrders = async () => {
  const response = await api.get("/purchase-orders");
  console.log("API:", response.data);
  const list = Array.isArray(response.data?.purchaseOrders)
    ? response.data.purchaseOrders
    : Array.isArray(response.data)
    ? response.data
    : [];
  const normalizedList = list.map((order) => {
    const normalizedOrder = normalizePurchaseOrder(order);
    console.log("purchaseOrdersApi normalizePurchaseOrder:", normalizedOrder);
    return normalizedOrder;
  });
  return normalizedList;
};

export const createPurchaseOrder = async (payload) => {
  const response = await api.post("/purchase-orders", payload);
  return normalizePurchaseOrder(response.data?.purchaseOrder ?? response.data);
};

export const fetchPurchaseOrderById = async (id) => {
  const response = await api.get(`/purchase-orders/${id}`);
  console.log("API:", response.data);
  const normalizedOrder = normalizePurchaseOrder(
    response.data?.purchaseOrder ?? response.data
  );
  console.log("purchaseOrdersApi normalizePurchaseOrder:", normalizedOrder);
  return normalizedOrder;
};

export const updatePurchaseOrder = async (id, payload) => {
  const response = await api.put(`/purchase-orders/${id}`, payload);
  return normalizePurchaseOrder(response.data?.purchaseOrder ?? response.data);
};

export const deletePurchaseOrder = async (id) => {
  await api.delete(`/purchase-orders/${id}`);
};
