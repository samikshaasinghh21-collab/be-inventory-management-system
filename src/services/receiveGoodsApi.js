import api from "./api";

export const normalizeReceiveGoodsItem = (item = {}) => {
  const orderedQty = Number(item.orderedQty ?? item.OrderedQty ?? 0) || 0;
  const receivedQty = Number(item.receivedQty ?? item.ReceivedQty ?? 0) || 0;
  return {
    id: item.id ?? item.Id ?? null,
    receiveGoodsId:
      item.receiveGoodsId ??
      item.ReceiveGoodsId ??
      item.ReceivegoodsId ??
      null,
    purchaseOrderId: item.purchaseOrderId ?? item.PurchaseOrderId ?? null,
    itemId: item.itemId ?? item.ItemId ?? null,
    orderedQty,
    receivedQty,
    balanceQty:
      Number(item.balanceQty ?? item.BalanceQty ?? orderedQty - receivedQty) ||
      0,
    createdAt: item.createdAt ?? item.CreatedAt ?? null,
  };
};

export const normalizeReceiveGoods = (receipt = {}) => {
  const id =
    receipt.receiveGoodsId ??
    receipt.ReceiveGoodsId ??
    receipt.id ??
    receipt.Id ??
    null;
  return {
    id,
    receiveGoodsId: id,
    purchaseOrderId:
      receipt.purchaseOrderId ??
      receipt.PurchaseOrderId ??
      receipt.purchaseorderId ??
      null,
    projectId: receipt.projectId ?? receipt.ProjectId ?? null,
    vendorId: receipt.vendorId ?? receipt.VendorId ?? null,
    locationId: receipt.locationId ?? receipt.LocationId ?? null,
    receivedDate: receipt.receivedDate ?? receipt.ReceivedDate ?? null,
    receivedBy: receipt.receivedBy ?? receipt.ReceivedBy ?? "",
    notes: receipt.notes ?? receipt.Notes ?? "",
    status: receipt.status ?? receipt.Status ?? "",
    createdAt: receipt.createdAt ?? receipt.CreatedAt ?? null,
    updatedAt: receipt.updatedAt ?? receipt.UpdatedAt ?? null,
    items: Array.isArray(receipt.items)
      ? receipt.items.map(normalizeReceiveGoodsItem)
      : [],
  };
};

export const fetchReceiveGoods = async (purchaseOrderId) => {
  const response = await api.get("/receive-goods", {
    params: purchaseOrderId ? { purchaseOrderId } : undefined,
  });
  const list = Array.isArray(response.data?.receipts)
    ? response.data.receipts
    : Array.isArray(response.data)
    ? response.data
    : [];
  return list.map(normalizeReceiveGoods);
};

export const saveReceiveGoods = async (payload) => {
  const response = await api.post("/receive-goods", payload, {
    timeout: 60000,
  });
  return normalizeReceiveGoods(response.data?.receipt ?? response.data);
};
