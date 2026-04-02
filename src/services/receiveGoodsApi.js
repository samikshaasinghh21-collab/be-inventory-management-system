import api from "./api";

const toQuantity = (value) => {
  if (value === null || value === undefined || value === "") {
    return 0;
  }
  const sanitized =
    typeof value === "string" ? value.replace(/,/g, "").trim() : value;
  const parsed = Number(sanitized);
  return Number.isFinite(parsed) ? parsed : 0;
};

const toChronologyTime = (...values) => {
  for (const value of values) {
    if (!value) {
      continue;
    }
    const time = new Date(value).getTime();
    if (Number.isFinite(time)) {
      return time;
    }
  }
  return 0;
};

const compareReceiveChronology = (left = {}, right = {}) => {
  const rightTime = toChronologyTime(right.receivedDate, right.createdAt);
  const leftTime = toChronologyTime(left.receivedDate, left.createdAt);
  if (rightTime !== leftTime) {
    return rightTime - leftTime;
  }
  return (
    toQuantity(right.receiveGoodsId ?? right.id) -
    toQuantity(left.receiveGoodsId ?? left.id)
  );
};

export const normalizeReceiveGoodsItem = (item = {}) => {
  const orderedQty = toQuantity(item.orderedQty ?? item.OrderedQty ?? 0);
  const receivedQty = toQuantity(item.receivedQty ?? item.ReceivedQty ?? 0);
  const explicitBalance = toQuantity(item.balanceQty ?? item.BalanceQty);
  const computedBalance = Math.max(orderedQty - receivedQty, 0);
  return {
    id: item.id ?? item.Id ?? null,
    receiveGoodsId:
      item.receiveGoodsId ??
      item.ReceiveGoodsId ??
      item.ReceivegoodsId ??
      null,
    purchaseOrderId: item.purchaseOrderId ?? item.PurchaseOrderId ?? null,
    itemId: item.itemId ?? item.ItemId ?? null,
    name: item.name ?? item.Name ?? item.ItemName ?? "",
    description: item.description ?? item.Description ?? "",
    unit: item.unit ?? item.Unit ?? "PCS",
    notes: item.notes ?? item.Notes ?? "",
    orderedQty,
    receivedQty,
    balanceQty: Math.max(
      explicitBalance > 0 || computedBalance === 0
        ? explicitBalance
        : computedBalance,
      0
    ),
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
  const rawShowProjectDetails =
    receipt.showProjectDetails ?? receipt.ShowProjectDetails ?? null;
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
    billTo: receipt.billTo ?? receipt.BillTo ?? "",
    shipTo: receipt.shipTo ?? receipt.ShipTo ?? "",
    showProjectDetails:
      rawShowProjectDetails === null || rawShowProjectDetails === undefined
        ? true
        : !["0", "false", "no"].includes(String(rawShowProjectDetails).toLowerCase()),
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
  return list.map(normalizeReceiveGoods).sort(compareReceiveChronology);
};

export const saveReceiveGoods = async (payload) => {
  const response = await api.post("/receive-goods", payload, {
    timeout: 60000,
  });
  return normalizeReceiveGoods(response.data?.receipt ?? response.data);
};
