import api from "./api";

const toNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const normalizeAvailableInventoryItem = (item = {}) => ({
  projectId: item.projectId ?? item.ProjectId ?? null,
  locationId: item.locationId ?? item.LocationId ?? null,
  sourceType: item.sourceType ?? item.SourceType ?? "",
  sourceKey: item.sourceKey ?? item.SourceKey ?? "",
  sourceRowId:
    item.sourceRowId ??
    item.SourceRowId ??
    item.sourceKey ??
    item.SourceKey ??
    "",
  receiveGoodsId: item.receiveGoodsId ?? item.ReceiveGoodsId ?? null,
  receiptItemId:
    item.receiptItemId ??
    item.ReceiptItemId ??
    item.receiveGoodsItemId ??
    item.ReceiveGoodsItemId ??
    item.ReceiveItemId ??
    null,
  receiveGoodsItemId:
    item.receiveGoodsItemId ?? item.ReceiveGoodsItemId ?? item.ReceiveItemId ?? null,
  deliveryChallanId: item.deliveryChallanId ?? item.DeliveryChallanId ?? null,
  deliveryChallanItemId:
    item.deliveryChallanItemId ?? item.DeliveryChallanItemId ?? null,
  itemId: item.itemId ?? item.ItemId ?? null,
  itemCode:
    item.itemCode ??
    item.ItemCode ??
    item.itemId ??
    item.ItemId ??
    "",
  name: item.name ?? item.Item ?? item.item ?? "",
  description: item.description ?? item.Description ?? "",
  unit: item.unit ?? item.Unit ?? "PCS",
  hsn: item.hsn ?? item.HSN ?? "",
  gst: item.gst ?? item.GST ?? "",
  rate: toNumber(item.rate ?? item.Rate ?? item.unitPrice ?? item.UnitPrice),
  sourceRef: item.sourceRef ?? item.SourceRef ?? "",
  sourceDate: item.sourceDate ?? item.SourceDate ?? null,
  sourceQty: toNumber(item.sourceQty ?? item.SourceQty),
  consumedQty: toNumber(item.consumedQty ?? item.ConsumedQty),
  adjustedQty: toNumber(
    item.adjustedQty ?? item.AdjustedQty ?? item.reallocatedQty ?? item.ReallocatedQty
  ),
  reallocatedQty: toNumber(
    item.reallocatedQty ?? item.ReallocatedQty ?? item.adjustedQty ?? item.AdjustedQty
  ),
  remainingAvailableQty: toNumber(
    item.remainingAvailableQty ??
      item.RemainingAvailableQty ??
      item.availableQty ??
      item.AvailableQty
  ),
  availableQty: toNumber(
    item.availableQty ??
      item.AvailableQty ??
      item.remainingAvailableQty ??
      item.RemainingAvailableQty
  ),
});

export const fetchAvailableInventory = async ({
  projectId,
  locationId,
  destinationLocationId,
  excludeDeliveryChallanId,
  excludeConsumptionId,
  excludeReallocateInventoryId,
  includeConsumptionLeftover,
} = {}) => {
  if (import.meta.env.DEV) {
    console.debug("[Consumption lookup] requesting available inventory", {
      projectId,
      sourceLocationId: locationId,
      destinationLocationId,
    });
  }
  const response = await api.get("/available-inventory", {
    params: {
      projectId,
      locationId,
      destinationLocationId,
      excludeDeliveryChallanId,
      excludeConsumptionId,
      excludeReallocateInventoryId,
      includeConsumptionLeftover,
      _: Date.now(),
    },
    headers: {
      "Cache-Control": "no-cache",
      Pragma: "no-cache",
    },
  });
  const list = Array.isArray(response.data?.items)
    ? response.data.items
    : Array.isArray(response.data)
    ? response.data
    : [];
  const normalized = list.map(normalizeAvailableInventoryItem);
  if (import.meta.env.DEV) {
    console.debug("[Consumption lookup] available inventory response", {
      rowCount: normalized.length,
      dcRowsWithBalance: normalized.filter(
        (row) =>
          String(row.sourceType || "").trim().toLowerCase() === "dc" &&
          row.remainingAvailableQty > 0
      ).length,
    });
  }
  return normalized;
};
