import api from "./api";

const emitConsumptionChange = () => {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("consumptions:changed"));
  }
};

const normalizeConsumptionItem = (item = {}) => ({
  id: item.id ?? item.Id ?? null,
  consumptionId:
    item.consumptionId ?? item.ConsumptionId ?? item.ConsumptionID ?? null,
  name: item.name ?? item.Item ?? item.item ?? item.Name ?? "",
  description: item.description ?? item.Description ?? "",
  unit: item.unit ?? item.Unit ?? "PCS",
  quantity: Number(item.quantity ?? item.Quantity ?? 0) || 0,
  rate: Number(item.rate ?? item.Rate ?? 0) || 0,
  notes: item.notes ?? item.Notes ?? "",
});

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
  locationId: consumption.locationId ?? consumption.LocationId ?? null,
  consumptionDate:
    consumption.consumptionDate ??
    consumption.ConsumptionDate ??
    consumption.date ??
    consumption.Date ??
    null,
  issuedBy: consumption.issuedBy ?? consumption.IssuedBy ?? "",
  status: consumption.status ?? consumption.Status ?? "Logged",
  notes: consumption.notes ?? consumption.Notes ?? "",
  createdAt: consumption.createdAt ?? consumption.CreatedAt ?? null,
  updatedAt: consumption.updatedAt ?? consumption.UpdatedAt ?? null,
  items: Array.isArray(consumption.items)
    ? consumption.items.map(normalizeConsumptionItem)
    : Array.isArray(consumption.ConsumptionItems)
    ? consumption.ConsumptionItems.map(normalizeConsumptionItem)
    : [],
});

export const fetchConsumptions = async () => {
  const response = await api.get("/consumptions");
  const list = Array.isArray(response.data?.consumptions)
    ? response.data.consumptions
    : Array.isArray(response.data)
    ? response.data
    : [];
  return list.map(normalizeConsumption);
};

export const createConsumption = async (payload) => {
  const response = await api.post("/consumptions", payload, {
    timeout: 60000,
  });
  const normalized = normalizeConsumption(response.data?.consumption ?? response.data);
  emitConsumptionChange();
  return normalized;
};

export const updateConsumption = async (id, payload) => {
  const response = await api.put(`/consumptions/${id}`, payload, {
    timeout: 60000,
  });
  const normalized = normalizeConsumption(response.data?.consumption ?? response.data);
  emitConsumptionChange();
  return normalized;
};

export const deleteConsumption = async (id) => {
  await api.delete(`/consumptions/${id}`);
  emitConsumptionChange();
};
