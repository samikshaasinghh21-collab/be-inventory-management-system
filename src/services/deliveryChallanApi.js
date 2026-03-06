import api from "./api";

const normalizeDeliveryChallanItem = (item = {}) => ({
  id:
    item.id ??
    item.Id ??
    item.lineItemId ??
    item.LineItemId ??
    `${Date.now()}-${Math.random()}`,
  deliveryChallanId:
    item.deliveryChallanId ??
    item.DeliveryChallanId ??
    item.DeliveryChallanID ??
    item.ChallanId ??
    null,
  name: item.name ?? item.ItemName ?? item.itemName ?? "",
  description: item.description ?? item.Description ?? "",
  unit: item.unit ?? item.Unit ?? "PCS",
  quantity: Number(item.quantity ?? item.Quantity ?? 0) || 0,
  rate: Number(item.rate ?? item.Rate ?? 0) || 0,
  notes: item.notes ?? item.Notes ?? "",
});

const normalizeDeliveryChallan = (challan = {}) => ({
  id: challan.id ?? challan.DeliveryChallanId ?? challan.Id ?? null,
  dcNumber: challan.dcNumber ?? challan.DCNumber ?? challan.DcNumber ?? "",
  projectId: challan.projectId ?? challan.ProjectId ?? null,
  fromLocationId: challan.fromLocationId ?? challan.FromLocationId ?? null,
  toLocation: challan.toLocation ?? challan.ToLocation ?? "",
  vehicleNumber: challan.vehicleNumber ?? challan.VehicleNumber ?? "",
  eWayBillNumber:
    challan.eWayBillNumber ??
    challan.EWayBillNumber ??
    challan.EBN ??
    "",
  issueDate: challan.issueDate ?? challan.IssueDate ?? null,
  status: challan.status ?? challan.Status ?? "Draft",
  notes: challan.notes ?? challan.Notes ?? "",
  createdAt: challan.createdAt ?? challan.CreatedAt ?? null,
  updatedAt: challan.updatedAt ?? challan.UpdatedAt ?? null,
  items: Array.isArray(challan.items)
    ? challan.items.map(normalizeDeliveryChallanItem)
    : Array.isArray(challan.DeliveryChallanItems)
    ? challan.DeliveryChallanItems.map(normalizeDeliveryChallanItem)
    : [],
});

export const fetchDeliveryChallans = async () => {
  const response = await api.get("/delivery-challans");
  const list = Array.isArray(response.data?.deliveryChallans)
    ? response.data.deliveryChallans
    : Array.isArray(response.data)
    ? response.data
    : [];
  return list.map(normalizeDeliveryChallan);
};

export const createDeliveryChallan = async (payload) => {
  const response = await api.post("/delivery-challans", payload, {
    timeout: 60000,
  });
  return normalizeDeliveryChallan(response.data?.deliveryChallan ?? response.data);
};

export const updateDeliveryChallan = async (id, payload) => {
  const response = await api.put(`/delivery-challans/${id}`, payload, {
    timeout: 60000,
  });
  return normalizeDeliveryChallan(response.data?.deliveryChallan ?? response.data);
};

export const deleteDeliveryChallan = async (id) => {
  await api.delete(`/delivery-challans/${id}`);
};
