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
  receiveGoodsId: item.receiveGoodsId ?? item.ReceiveGoodsId ?? null,
  receiveGoodsItemId:
    item.receiveGoodsItemId ?? item.ReceiveGoodsItemId ?? item.ReceiveItemId ?? null,
  deliveryChallanId: item.deliveryChallanId ?? item.DeliveryChallanId ?? null,
  deliveryChallanItemId:
    item.deliveryChallanItemId ?? item.DeliveryChallanItemId ?? null,
  itemId: item.itemId ?? item.ItemId ?? null,
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
  reallocatedQty: toNumber(item.reallocatedQty ?? item.ReallocatedQty),
  availableQty: toNumber(item.availableQty ?? item.AvailableQty),
});

export const fetchAvailableInventory = async ({
  projectId,
  locationId,
  excludeConsumptionId,
  excludeReallocateInventoryId,
} = {}) => {
  const response = await api.get("/available-inventory", {
    params: {
      projectId,
      locationId,
      excludeConsumptionId,
      excludeReallocateInventoryId,
    },
  });
  const list = Array.isArray(response.data?.items)
    ? response.data.items
    : Array.isArray(response.data)
    ? response.data
    : [];
  return list.map(normalizeAvailableInventoryItem);
};
