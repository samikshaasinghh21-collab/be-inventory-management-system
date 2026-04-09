import api from "./api";

const normalizeBoqItem = (item = {}) => {
  const quantity = Number(item.quantity ?? item.Quantity ?? 0);
  const rate = Number(item.rate ?? item.Rate ?? 0);
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
  const amountFromValues = quantity * rate;
  const amount = Number(item.amount ?? item.Amount ?? amountFromValues) || amountFromValues;
  return {
    id: item.id ?? item.LineItemId ?? null,
    boqId: item.boqId ?? item.BOQId ?? null,
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
    rate,
    unitPrice: rate,
    notes: item.notes ?? item.Notes ?? "",
    amount,
  };
};

const normalizeBoq = (boq = {}) => {
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
  return normalizeBoq(response.data?.boq ?? response.data);
};

export const updateBoq = async (id, payload) => {
  const response = await api.put(`/boqs/${id}`, payload);
  return normalizeBoq(response.data?.boq ?? response.data);
};

export const deleteBoq = async (id) => {
  await api.delete(`/boqs/${id}`);
};
