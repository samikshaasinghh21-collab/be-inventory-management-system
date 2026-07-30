import api from "./api";

const emitConsumptionChange = () => {
  if (typeof window !== "undefined") {
    console.debug("[timing] Consumption API dispatch synchronization events", {
      events: [
        "consumptions:changed",
        "delivery-challans:changed",
        "receive-goods:changed",
        "products:changed",
        "boqs:changed",
        "reallocate-inventory:changed",
      ],
    });
    window.dispatchEvent(new Event("consumptions:changed"));
    window.dispatchEvent(new Event("delivery-challans:changed"));
    window.dispatchEvent(new Event("receive-goods:changed"));
    window.dispatchEvent(new Event("products:changed"));
    window.dispatchEvent(new Event("boqs:changed"));
    window.dispatchEvent(new Event("reallocate-inventory:changed"));
  }
};

const parseIdList = (value) => {
  if (Array.isArray(value)) {
    return value;
  }
  if (!value) {
    return [];
  }
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const normalizeConsumptionItem = (item = {}) => ({
  id: item.id ?? item.Id ?? null,
  consumptionId:
    item.consumptionId ?? item.ConsumptionId ?? item.ConsumptionID ?? null,
  boqItemId:
    item.boqItemId ?? item.BoqItemId ?? item.BOQItemId ?? item.LineItemId ?? null,
  itemId: item.itemId ?? item.ItemId ?? null,
  deliveryChallanId:
    item.deliveryChallanId ??
    item.DeliveryChallanId ??
    item.DeliveryChallanID ??
    item.ChallanId ??
    null,
  deliveryChallanItemId:
    item.deliveryChallanItemId ??
    item.DeliveryChallanItemId ??
    item.DeliveryChallanLineItemId ??
    null,
  receiveGoodsItemId:
    item.receiveGoodsItemId ?? item.ReceiveGoodsItemId ?? item.ReceiveItemId ?? null,
  receiveGoodsId: item.receiveGoodsId ?? item.ReceiveGoodsId ?? null,
  sourceType: item.sourceType ?? item.SourceType ?? "",
  sourceKey: item.sourceKey ?? item.SourceKey ?? "",
  sourceRef:
    item.sourceRef ?? item.SourceRef ?? item.deliveryChallanRef ?? item.DeliveryChallanRef ?? "",
  name: item.name ?? item.Item ?? item.item ?? item.Name ?? "",
  description: item.description ?? item.Description ?? "",
  unit: item.unit ?? item.Unit ?? "PCS",
  hsn: item.hsn ?? item.HSN ?? item.hsnCode ?? item.HSNCode ?? "",
  gst: item.gst ?? item.GST ?? item.gstRate ?? item.GSTRate ?? "",
  quantity: Number(item.quantity ?? item.Quantity ?? 0) || 0,
  consumeQty: Number(item.consumeQty ?? item.ConsumeQty ?? item.quantity ?? item.Quantity ?? 0) || 0,
  sourceQty: Number(item.sourceQty ?? item.SourceQty ?? 0) || 0,
  totalConsumedQty:
    Number(item.totalConsumedQty ?? item.TotalConsumedQty ?? item.consumedQty ?? item.ConsumedQty ?? 0) || 0,
  adjustedQty:
    Number(item.adjustedQty ?? item.AdjustedQty ?? item.reallocatedQty ?? item.ReallocatedQty ?? 0) || 0,
  remainingQty:
    item.remainingQty ??
    item.RemainingQty ??
    item.remainingAvailableQty ??
    item.RemainingAvailableQty ??
    item.availableQty ??
    item.AvailableQty ??
    item.balanceQty ??
    item.BalanceQty ??
    null,
  remainingAvailableQty:
    item.remainingAvailableQty ?? item.RemainingAvailableQty ?? null,
  availableQty:
    item.availableQty ?? item.AvailableQty ?? item.remainingQty ?? item.RemainingQty ?? null,
  balanceQty: item.balanceQty ?? item.BalanceQty ?? null,
  rate: Number(item.rate ?? item.Rate ?? 0) || 0,
  notes: item.notes ?? item.Notes ?? "",
});

const buildConsumptionItemKey = (item = {}, index = 0) => {
  const id = item.id ?? item.Id;
  if (id !== null && id !== undefined && id !== "") {
    return `id:${id}`;
  }
  const sourceKey = String(item.sourceKey ?? item.SourceKey ?? "").trim();
  if (sourceKey) {
    return `source-key:${sourceKey}`;
  }
  const sourceIds = [
    item.deliveryChallanItemId ?? item.DeliveryChallanItemId,
    item.receiveGoodsItemId ?? item.ReceiveGoodsItemId,
    item.boqItemId ?? item.BoqItemId ?? item.BOQItemId,
    item.itemId ?? item.ItemId,
  ]
    .map((value) => String(value ?? "").trim())
    .filter(Boolean)
    .join(":");
  if (sourceIds) {
    return `source:${sourceIds}:${Number(item.quantity ?? item.Quantity ?? 0) || 0}`;
  }
  const name = String(
    item.name ?? item.Item ?? item.item ?? item.Name ?? ""
  ).trim().toLowerCase();
  if (!name) {
    return `index:${index}`;
  }
  return [
    "line",
    name,
    String(item.unit ?? item.Unit ?? "PCS").trim().toUpperCase(),
    Number(item.quantity ?? item.Quantity ?? 0) || 0,
    Number(item.rate ?? item.Rate ?? 0) || 0,
    String(item.notes ?? item.Notes ?? "").trim().toLowerCase(),
  ].join(":");
};

const dedupeConsumptionItems = (items = []) => {
  const uniqueItems = new Map();
  (Array.isArray(items) ? items : []).forEach((item, index) => {
    const normalizedItem = normalizeConsumptionItem(item);
    const key = buildConsumptionItemKey(normalizedItem, index);
    if (!uniqueItems.has(key)) {
      uniqueItems.set(key, normalizedItem);
    }
  });
  return Array.from(uniqueItems.values());
};

const normalizeConsumption = (consumption = {}) => ({
  id: consumption.id ?? consumption.ConsumptionId ?? consumption.Id ?? null,
  consumptionId:
    consumption.consumptionId ??
    consumption.ConsumptionId ??
    consumption.id ??
    consumption.Id ??
    null,
  consumptionNumber:
    consumption.consumptionNumber ?? consumption.ConsumptionNumber ?? "",
  projectId: consumption.projectId ?? consumption.ProjectId ?? null,
  fromLocationId: consumption.fromLocationId ?? consumption.FromLocationId ?? null,
  locationId: consumption.locationId ?? consumption.LocationId ?? null,
  receiveGoodsId: consumption.receiveGoodsId ?? consumption.ReceiveGoodsId ?? null,
  deliveryChallanId:
    consumption.deliveryChallanId ??
    consumption.DeliveryChallanId ??
    consumption.DeliverychallanId ??
    null,
  deliveryChallanIds: parseIdList(
    consumption.deliveryChallanIds ??
      consumption.DeliveryChallanIds ??
      consumption.DeliveryChallanIdsJson
  ),
  deliveryChallanRef:
    consumption.deliveryChallanRef ??
    consumption.DeliveryChallanRef ??
    consumption.dcReference ??
    consumption.DCReference ??
    "",
  consumptionDate:
    consumption.consumptionDate ??
    consumption.ConsumptionDate ??
    consumption.date ??
    consumption.Date ??
    null,
  issuedBy: consumption.issuedBy ?? consumption.IssuedBy ?? "",
  status: consumption.status ?? consumption.Status ?? "Logged",
  notes: consumption.notes ?? consumption.Notes ?? "",
  companyAddress:
    consumption.companyAddress ?? consumption.CompanyAddress ?? "",
  companyGstin:
    consumption.companyGstin ??
    consumption.CompanyGstin ??
    consumption.CompanyGSTIN ??
    "",
  companyPhone: consumption.companyPhone ?? consumption.CompanyPhone ?? "",
  companyEmail: consumption.companyEmail ?? consumption.CompanyEmail ?? "",
  createdAt: consumption.createdAt ?? consumption.CreatedAt ?? null,
  updatedAt: consumption.updatedAt ?? consumption.UpdatedAt ?? null,
  items: dedupeConsumptionItems(
    Array.isArray(consumption.items)
      ? consumption.items
      : Array.isArray(consumption.ConsumptionItems)
      ? consumption.ConsumptionItems
      : []
  ),
});

const buildConsumptionRecordKey = (record = {}, index = 0) => {
  const id = record.id ?? record.consumptionId;
  if (id !== null && id !== undefined && id !== "") {
    return `id:${id}`;
  }
  const reference = String(record.consumptionNumber ?? "").trim().toLowerCase();
  if (reference) {
    return `ref:${reference}`;
  }
  const challanIds = (record.deliveryChallanIds || [])
    .map((value) => String(value ?? "").trim())
    .filter(Boolean)
    .sort()
    .join(",");
  const compositeParts = [
    record.projectId ?? "",
    record.fromLocationId ?? "",
    record.locationId ?? "",
    record.deliveryChallanId ?? challanIds ?? "",
    String(record.deliveryChallanRef ?? "").trim().toLowerCase(),
    record.consumptionDate ?? "",
    String(record.issuedBy ?? "").trim().toLowerCase(),
  ];
  return compositeParts.some((part) => String(part ?? "").trim())
    ? `record:${compositeParts.join(":")}`
    : `index:${index}`;
};

const dedupeConsumptions = (records = []) => {
  const uniqueRecords = new Map();
  (Array.isArray(records) ? records : []).forEach((record, index) => {
    const normalizedRecord = normalizeConsumption(record);
    const key = buildConsumptionRecordKey(normalizedRecord, index);
    const existingRecord = uniqueRecords.get(key);
    if (!existingRecord) {
      uniqueRecords.set(key, normalizedRecord);
      return;
    }
    uniqueRecords.set(key, {
      ...existingRecord,
      ...normalizedRecord,
      items: dedupeConsumptionItems([
        ...(existingRecord.items || []),
        ...(normalizedRecord.items || []),
      ]),
    });
  });
  return Array.from(uniqueRecords.values());
};

export const fetchConsumptions = async () => {
  const response = await api.get("/consumptions");
  const list = Array.isArray(response.data?.consumptions)
    ? response.data.consumptions
    : Array.isArray(response.data)
    ? response.data
    : [];
  return dedupeConsumptions(list);
};

export const createConsumption = async (payload) => {
  const startedAt = performance.now();
  console.debug("[timing] createConsumption request start", {
    itemCount: Array.isArray(payload?.items) ? payload.items.length : 0,
  });
  const response = await api.post("/consumptions", payload, {
    timeout: 60000,
  });
  console.debug("[timing] createConsumption response received", {
    elapsedMs: Math.round(performance.now() - startedAt),
  });
  const normalized = normalizeConsumption(response.data?.consumption ?? response.data);
  emitConsumptionChange();
  console.debug("[timing] createConsumption complete", {
    elapsedMs: Math.round(performance.now() - startedAt),
  });
  return normalized;
};

export const updateConsumption = async (id, payload) => {
  const startedAt = performance.now();
  console.debug("[timing] updateConsumption request start", {
    id,
    itemCount: Array.isArray(payload?.items) ? payload.items.length : 0,
  });
  const response = await api.put(`/consumptions/${id}`, payload, {
    timeout: 60000,
  });
  console.debug("[timing] updateConsumption response received", {
    id,
    elapsedMs: Math.round(performance.now() - startedAt),
  });
  const normalized = normalizeConsumption(response.data?.consumption ?? response.data);
  emitConsumptionChange();
  console.debug("[timing] updateConsumption complete", {
    id,
    elapsedMs: Math.round(performance.now() - startedAt),
  });
  return normalized;
};

export const deleteConsumption = async (id) => {
  await api.delete(`/consumptions/${id}`);
  emitConsumptionChange();
};
