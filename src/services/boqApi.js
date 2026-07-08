import api from "./api";
import { roundUnitPrice } from "../utils/formatters";

const emitBoqChange = () => {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("boqs:changed"));
    window.dispatchEvent(new Event("purchase-orders:changed"));
    window.dispatchEvent(new Event("receive-goods:changed"));
  }
};

const parseQuantity = (...values) => {
  for (const value of values) {
    if (value === undefined || value === null || value === "") {
      continue;
    }
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return 0;
};

const normalizeLinkedPurchaseOrder = (order = {}) => ({
  id: order.id ?? order.Id ?? order.PurchaseOrderId ?? null,
  boqId: order.boqId ?? order.BOQId ?? order.BoqId ?? null,
  poNumber: order.poNumber ?? order.PONumber ?? "",
  status: order.status ?? order.Status ?? "",
  orderDate: order.orderDate ?? order.OrderDate ?? null,
  expectedDate:
    order.expectedDate ??
    order.ExpectedDate ??
    order.expectedDeliveryDate ??
    order.ExpectedDeliveryDate ??
    null,
  total: Number(order.total ?? order.Total ?? 0) || 0,
  updatedAt: order.updatedAt ?? order.UpdatedAt ?? null,
});

const normalizeBoqItem = (item = {}) => {
  const rate = roundUnitPrice(item.rate ?? item.Rate ?? item.unitPrice ?? item.UnitPrice ?? 0);
  const rawInventoryQty =
    item.inventoryQty ??
    item.InventoryQty ??
    item.currentStock ??
    item.CurrentStock ??
    item.stock ??
    item.Stock ??
    null;
  const inventoryQty = Number.isFinite(Number(rawInventoryQty))
    ? Number(rawInventoryQty)
    : null;
  const quantity = parseQuantity(
    item.quantity,
    item.Quantity,
    item.unitQty,
    item.UnitQty,
    item.unitQuantity,
    item.UnitQuantity,
    item.qty,
    item.Qty
  );
  const rawConsumed =
    item.consumedQty ?? item.ConsumedQty ?? item.totalConsumed ?? item.TotalConsumed ?? null;
  const consumedQty = Number.isFinite(Number(rawConsumed)) ? Number(rawConsumed) : null;
  const rawAvailable =
    item.availableQty ?? item.AvailableQty ?? item.remainingQty ?? item.RemainingQty ?? null;
  const availableQty = Number.isFinite(Number(rawAvailable))
    ? Number(rawAvailable)
    : Number.isFinite(consumedQty)
    ? Math.max(quantity - consumedQty, 0)
    : null;
  const amount = quantity * rate;
  return {
    id: item.id ?? item.LineItemId ?? null,
    boqId: item.boqId ?? item.BOQId ?? null,
    itemId: item.itemId ?? item.ItemId ?? item.inventoryItemId ?? item.InventoryItemId ?? null,
    name: item.name ?? item.ItemName ?? "",
    description: item.description ?? item.Description ?? "",
    serialNumber: item.serialNumber ?? item.SerialNumber ?? "",
    unit: item.unit ?? item.Unit ?? "",
    hsn: item.hsn ?? item.HSN ?? item.hsnCode ?? item.HSNCode ?? "",
    gst: item.gst ?? item.GST ?? item.gstRate ?? item.GSTRate ?? "",
    taxPercentage: Number(item.taxPercentage ?? item.TaxPercentage ?? 0),
    quantity,
    consumedQty,
    availableQty,
    inventoryQty,
    currentStock: inventoryQty,
    stock: inventoryQty,
    rate,
    unitPrice: rate,
    notes: item.notes ?? item.Notes ?? "",
    amount,
  };
};

const normalizeBoq = (boq = {}) => {
  const linkedPurchaseOrders = Array.isArray(boq.linkedPurchaseOrders)
    ? boq.linkedPurchaseOrders.map(normalizeLinkedPurchaseOrder)
    : [];
  const items = Array.isArray(boq.items)
    ? boq.items.map(normalizeBoqItem)
    : Array.isArray(boq.BOQLineItems)
    ? boq.BOQLineItems.map(normalizeBoqItem)
    : [];

  const computedTotal = items.reduce((sum, item) => sum + Number(item.amount || 0), 0);

  return {
    id: boq.id ?? boq.BOQId ?? null,
    projectId: boq.projectId ?? boq.ProjectId ?? null,
    boqNumber: boq.boqNumber ?? boq.BOQNumber ?? "",
    version: String(boq.version ?? boq.Version ?? "1"),
    preparedBy: boq.preparedBy ?? boq.PreparedBy ?? "",
    status: boq.status ?? boq.Status ?? "",
    date: boq.date ?? boq.BOQDate ?? boq.Date ?? null,
    notes: boq.notes ?? boq.Notes ?? "",
    linkedPurchaseOrders,
    linkedPurchaseOrderCount:
      Number(boq.linkedPurchaseOrderCount ?? boq.LinkedPurchaseOrderCount ?? 0) ||
      linkedPurchaseOrders.length,
    latestPurchaseOrder:
      boq.latestPurchaseOrder || boq.LatestPurchaseOrder
        ? normalizeLinkedPurchaseOrder(
            boq.latestPurchaseOrder ?? boq.LatestPurchaseOrder
          )
        : linkedPurchaseOrders[0] ?? null,
    items,
    total: Number(boq.total ?? boq.Total ?? 0) || computedTotal,
  };
};

export const fetchBoqs = async () => {
  const response = await api.get("/boqs");
  const list = Array.isArray(response.data?.boqs)
    ? response.data.boqs
    : Array.isArray(response.data)
    ? response.data
    : [];
  return list.map(normalizeBoq);
};

export const fetchBoq = async (id) => {
  const response = await api.get(`/boqs/${id}`);
  const raw = response.data?.boq ?? response.data;
  return normalizeBoq(raw);
};

export const createBoq = async (payload) => {
  const response = await api.post("/boqs", payload);
  const normalized = normalizeBoq(response.data?.boq ?? response.data);
  emitBoqChange();
  return normalized;
};

export const updateBoq = async (id, payload) => {
  const response = await api.put(`/boqs/${id}`, payload);
  const normalized = normalizeBoq(response.data?.boq ?? response.data);
  emitBoqChange();
  return normalized;
};

export const deleteBoq = async (id) => {
  await api.delete(`/boqs/${id}`);
  emitBoqChange();
};
