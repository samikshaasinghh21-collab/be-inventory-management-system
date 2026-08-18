import api from "./api";
import { DEFAULT_PURCHASE_ORDER_TERMS } from "../utils/purchaseOrderTerms";
import { roundUnitPrice } from "../utils/formatters";
import { parseTaxPercentage } from "../utils/taxUtils";

const emitPurchaseOrdersChange = ({
  includeBoqs = false,
  includeReceiveGoods = false,
} = {}) => {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("purchase-orders:changed"));
    if (includeBoqs) {
      window.dispatchEvent(new Event("boqs:changed"));
    }
    if (includeReceiveGoods) {
      window.dispatchEvent(new Event("receive-goods:changed"));
    }
  }
};

const normalizePoItem = (item = {}) => {
  const serialRequiredRaw =
    item.serialRequired ?? item.SerialRequired ?? item.IsSerialTracked ?? false;
  const quantity =
    Number(
      item.quantity ?? item.Quantity ?? item.Qty ?? item.orderedQty ?? item.OrderedQty ?? 0
    ) || 0;
  const receivedQty = Number(
    item.receivedQty ?? item.ReceivedQty ?? item.totalReceivedQty ?? item.TotalReceivedQty ?? 0
  ) || 0;
  const availableQty = Number(
    item.availableQty ?? item.AvailableQty ?? item.totalAvailableQty ?? item.TotalAvailableQty ?? receivedQty
  ) || 0;
  const poBalanceQty = Math.max(
    Number(
      item.poBalanceQty ??
        item.PoBalanceQty ??
        item.totalPoBalanceQty ??
        item.TotalPoBalanceQty ??
        Math.max(quantity - receivedQty, 0)
    ) || 0,
    0
  );

  const unitPrice = roundUnitPrice(
    item.unitPrice ?? item.UnitPrice ?? item.rate ?? item.Rate ?? 0
  );

  return {
    id: item.id ?? item.Id ?? item.POItemId ?? null,
    poItemId:
      item.poItemId ??
      item.POItemId ??
      item.purchaseOrderItemId ??
      item.PurchaseOrderItemId ??
      item.id ??
      item.Id ??
      null,
    purchaseOrderId: item.purchaseOrderId ?? item.PurchaseOrderId ?? null,
    itemId: item.itemId ?? item.ItemId ?? null,
    boqItemId: item.boqItemId ?? item.BoqItemId ?? item.BOQItemId ?? null,
    name: item.name ?? item.Name ?? item.ItemName ?? "",
    description: item.description ?? item.Description ?? "",
    unit: item.unit ?? item.Unit ?? "PCS",
    hsn: item.hsn ?? item.HSN ?? item.hsnCode ?? item.HSNCode ?? "",
    gst: item.gst ?? item.GST ?? item.gstRate ?? item.GSTRate ?? "",
    serialNumber: item.serialNumber ?? item.SerialNumber ?? "",
    serialRequired: !["0", "false", "no"].includes(
      String(serialRequiredRaw).trim().toLowerCase()
    ),
    taxPercentage: parseTaxPercentage(
      item.taxPercentage ??
        item.TaxPercentage ??
        item.gst ??
        item.GST ??
        item.gstRate ??
        item.GSTRate ??
        0
    ),
    location: item.location ?? item.Location ?? item.notes ?? item.Notes ?? "",
    notes: item.notes ?? item.Notes ?? item.location ?? item.Location ?? "",
    quantity,
    orderedQty: quantity,
    receivedQty,
    totalReceivedQty: receivedQty,
    availableQty,
    totalAvailableQty: availableQty,
    poBalanceQty,
    totalPoBalanceQty: poBalanceQty,
    unitPrice,
    totalPrice: quantity * unitPrice,
  };
};

const normalizePurchaseOrder = (order = {}) => ({
  id: order.id ?? order.Id ?? order.PurchaseOrderId ?? null,
  poNumber:
    order.poNumber ??
    order.PONumber ??
    order.PoNumber ??
    order.purchaseOrderNumber ??
    "",
  projectId: order.projectId ?? order.ProjectId ?? null,
  vendorId: order.vendorId ?? order.VendorId ?? null,
  locationId: order.locationId ?? order.LocationId ?? null,
  shipToLocationId:
    order.shipToLocationId ??
    order.ShipToLocationId ??
    order.locationId ??
    order.LocationId ??
    null,
  boqId: order.boqId ?? order.BOQId ?? order.BoqId ?? null,
  status: order.status ?? order.Status ?? "Draft",
  orderDate: order.orderDate ?? order.OrderDate ?? null,
  expectedDate:
    order.expectedDeliveryDate ??
    order.ExpectedDeliveryDate ??
    order.expectedDate ??
    order.ExpectedDate ??
    null,
  notes: order.notes ?? order.Notes ?? "",
  termsAndConditions:
    order.termsAndConditions ??
    order.TermsAndConditions ??
    DEFAULT_PURCHASE_ORDER_TERMS,
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
  const normalized = normalizePurchaseOrder(response.data?.purchaseOrder ?? response.data);
  emitPurchaseOrdersChange({ includeBoqs: true, includeReceiveGoods: true });
  return normalized;
};

export const updatePurchaseOrder = async (id, payload) => {
  const response = await api.put(`/purchase-orders/${id}`, payload);
  const normalized = normalizePurchaseOrder(response.data?.purchaseOrder ?? response.data);
  emitPurchaseOrdersChange({ includeBoqs: true, includeReceiveGoods: true });
  return normalized;
};

export const updatePurchaseOrderStatus = async (id, status, options = {}) => {
  const response = await api.patch(`/purchase-orders/${id}/status`, {
    status,
    allowLockedEdit: options.allowLockedEdit === true,
  });
  const normalized = normalizePurchaseOrder(response.data?.purchaseOrder ?? response.data);
  emitPurchaseOrdersChange({ includeBoqs: true, includeReceiveGoods: true });
  return normalized;
};

export const deletePurchaseOrder = async (id) => {
  await api.delete(`/purchase-orders/${id}`);
  emitPurchaseOrdersChange({ includeBoqs: true, includeReceiveGoods: true });
};
