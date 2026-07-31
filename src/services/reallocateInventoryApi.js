import api from "./api";

const emitReallocateInventoryChange = () => {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("reallocate-inventory:changed"));
    window.dispatchEvent(new Event("consumptions:changed"));
    window.dispatchEvent(new Event("delivery-challans:changed"));
    window.dispatchEvent(new Event("receive-goods:changed"));
  }
};

const normalizeDateValue = (value) => {
  if (!value) {
    return null;
  }
  const normalized = String(value);
  return normalized.length >= 10 ? normalized.slice(0, 10) : normalized;
};

const normalizeReallocateInventoryItem = (item = {}) => ({
  id: item.id ?? item.Id ?? null,
  transferId:
    item.transferId ??
    item.TransferId ??
    item.reallocateInventoryId ??
    item.ReallocateInventoryId ??
    null,
  receiveGoodsItemId:
    item.receiveGoodsItemId ?? item.ReceiveGoodsItemId ?? item.ReceiveItemId ?? null,
  deliveryChallanId:
    item.deliveryChallanId ?? item.DeliveryChallanId ?? item.ChallanId ?? null,
  deliveryChallanItemId:
    item.deliveryChallanItemId ??
    item.DeliveryChallanItemId ??
    item.DeliveryChallanLineItemId ??
    null,
  sourceType: item.sourceType ?? item.SourceType ?? "",
  sourceKey: item.sourceKey ?? item.SourceKey ?? "",
  sourceRef: item.sourceRef ?? item.SourceRef ?? "",
  item: item.item ?? item.Item ?? item.name ?? item.Name ?? "",
  name: item.name ?? item.item ?? item.Item ?? item.Name ?? "",
  description: item.description ?? item.Description ?? "",
  unit: item.unit ?? item.Unit ?? "PCS",
  quantity: Number(item.quantity ?? item.Quantity ?? 0) || 0,
});

const normalizeReallocateInventory = (record = {}) => {
  const id =
    record.id ??
    record.transferId ??
    record.Id ??
    record.TransferId ??
    null;

  const referenceType =
    record.referenceType ??
    record.ReferenceType ??
    (record.consumptionId ?? record.ConsumptionId ? "consumption" : "");
  const referenceId =
    record.referenceId ??
    record.ReferenceId ??
    (record.consumptionId ?? record.ConsumptionId ?? null);
  const referenceNo =
    record.referenceNo ??
    record.ReferenceNo ??
    record.consumptionNumber ??
    record.ConsumptionNumber ??
    "";

  return {
    id,
    transferId: id,
    referenceNumber: record.referenceNumber ?? record.ReferenceNumber ?? `REL-${id}`,
    referenceType,
    referenceId,
    referenceNo,
    type: record.type ?? record.Type ?? "Reallocate",
    consumptionId: record.consumptionId ?? record.ConsumptionId ?? null,
    consumptionNumber:
      record.consumptionNumber ?? record.ConsumptionNumber ?? "",
    projectId: record.projectId ?? record.ProjectId ?? null,
    sourceProjectId: record.sourceProjectId ?? record.SourceProjectId ?? null,
    fromLocationId: record.fromLocationId ?? record.FromLocationId ?? null,
    toLocationId: record.toLocationId ?? record.ToLocationId ?? null,
    returnVendorId: record.returnVendorId ?? record.ReturnVendorId ?? null,
    requestDate: normalizeDateValue(
      record.requestDate ?? record.RequestDate ?? record.transferDate ?? record.TransferDate
    ),
    transferDate: record.transferDate ?? record.TransferDate ?? null,
    requestedBy: record.requestedBy ?? record.RequestedBy ?? "",
    movedQuantity:
      record.movedQuantity ?? record.MovedQuantity ?? null,
    remainingQuantity:
      record.remainingQuantity ?? record.RemainingQuantity ?? null,
    eWayBillNumber:
      record.eWayBillNumber ??
      record.EWayBillNumber ??
      record.EwayBillNumber ??
      "",
    status: record.status ?? record.Status ?? "Pending",
    notes: record.notes ?? record.Notes ?? "",
    createdAt: record.createdAt ?? record.CreatedAt ?? null,
    updatedAt: record.updatedAt ?? record.UpdatedAt ?? null,
    items: Array.isArray(record.items)
      ? record.items.map(normalizeReallocateInventoryItem)
      : Array.isArray(record.ReallocateInventoryItems)
      ? record.ReallocateInventoryItems.map(normalizeReallocateInventoryItem)
      : [],
  };
};

export const fetchReallocateInventory = async () => {
  const response = await api.get("/reallocate-inventory");
  const list = Array.isArray(response.data?.reallocations)
    ? response.data.reallocations
    : Array.isArray(response.data)
    ? response.data
    : [];
  return list.map(normalizeReallocateInventory);
};

export const createReallocateInventory = async (payload) => {
  const response = await api.post("/reallocate-inventory", payload, {
    timeout: 60000,
  });
  const normalized = normalizeReallocateInventory(
    response.data?.reallocation ?? response.data
  );
  emitReallocateInventoryChange();
  return normalized;
};

export const updateReallocateInventory = async (id, payload) => {
  const response = await api.put(`/reallocate-inventory/${id}`, payload, {
    timeout: 60000,
  });
  const normalized = normalizeReallocateInventory(
    response.data?.reallocation ?? response.data
  );
  emitReallocateInventoryChange();
  return normalized;
};

export const deleteReallocateInventory = async (id) => {
  await api.delete(`/reallocate-inventory/${id}`);
  emitReallocateInventoryChange();
};
