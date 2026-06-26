import api from "./api";
import { roundUnitPrice } from "../utils/formatters";
import { parseDateValue } from "../utils/dateFormat";

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
    const date = parseDateValue(value);
    const time = date ? date.getTime() : NaN;
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

const emitReceiveGoodsChange = () => {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("receive-goods:changed"));
    window.dispatchEvent(new Event("purchase-orders:changed"));
  }
};

export const normalizeReceiveGoodsItem = (item = {}) => {
  const orderedQty = toQuantity(item.orderedQty ?? item.OrderedQty ?? 0);
  const receivedQty = toQuantity(item.receivedQty ?? item.ReceivedQty ?? 0);
  const rawExplicitBalance = item.balanceQty ?? item.BalanceQty;
  const explicitBalance =
    rawExplicitBalance === undefined || rawExplicitBalance === null || rawExplicitBalance === ""
      ? null
      : toQuantity(rawExplicitBalance);
  const computedBalance = Math.max(orderedQty - receivedQty, 0);
  const poBalanceQty = Math.max(explicitBalance ?? computedBalance, 0);
  const rawConsumedQty = item.consumedQty ?? item.ConsumedQty;
  const consumedQty =
    rawConsumedQty === undefined || rawConsumedQty === null || rawConsumedQty === ""
      ? 0
      : toQuantity(rawConsumedQty);
  const rawAvailableQty = item.availableQty ?? item.AvailableQty;
  const availableQty =
    rawAvailableQty === undefined || rawAvailableQty === null || rawAvailableQty === ""
      ? Math.max(receivedQty - consumedQty, 0)
      : toQuantity(rawAvailableQty);
  const receiptReceivedQty = toQuantity(
    item.receiptReceivedQty ?? item.ReceiptReceivedQty ?? item.receivedQty ?? item.ReceivedQty ?? 0
  );
  const previouslyReceivedQty = Math.max(
    toQuantity(
      item.previouslyReceivedQty ??
        item.PreviouslyReceivedQty ??
        item.previousReceivedQty ??
        item.PreviousReceivedQty ??
        0
    ),
    0
  );
  const availableBalanceQty = Math.max(
    toQuantity(
      item.availableBalanceQty ??
        item.AvailableBalanceQty ??
        item.receivableQty ??
        item.ReceivableQty ??
        Math.max(orderedQty - previouslyReceivedQty, 0)
    ),
    0
  );
  const receiptAvailableQty = toQuantity(
    item.receiptAvailableQty ??
      item.ReceiptAvailableQty ??
      item.availableQty ??
      item.AvailableQty ??
      Math.max(receiptReceivedQty - consumedQty, 0)
  );
  const receiptBalanceQty = toQuantity(
    item.receiptBalanceQty ??
      item.ReceiptBalanceQty ??
      item.balanceQty ??
      item.BalanceQty ??
      Math.max(availableBalanceQty - receiptReceivedQty, 0)
  );
  const totalReceivedQty = toQuantity(
    item.totalReceivedQty ??
      item.TotalReceivedQty ??
      Math.max(previouslyReceivedQty + receiptReceivedQty, 0)
  );
  const totalAvailableQty = toQuantity(
    item.totalAvailableQty ??
      item.TotalAvailableQty ??
      item.availableQty ??
      item.AvailableQty ??
      totalReceivedQty
  );
  const totalPoBalanceQty = Math.max(
    toQuantity(
      item.totalPoBalanceQty ??
        item.TotalPoBalanceQty ??
        item.poBalanceQty ??
        item.PoBalanceQty ??
        item.balanceQty ??
        item.BalanceQty ??
        Math.max(orderedQty - totalReceivedQty, 0)
    ),
    0
  );
  const serialRequiredRaw =
    item.serialRequired ?? item.SerialRequired ?? item.IsSerialTracked ?? false;
  const parseSerialNumbers = (value) => {
    if (Array.isArray(value)) {
      return value.map((entry) => String(entry ?? "").trim()).filter(Boolean);
    }
    if (!value) {
      return [];
    }
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed)
        ? parsed.map((entry) => String(entry ?? "").trim()).filter(Boolean)
        : [];
    } catch {
      return [];
    }
  };
  return {
    id:
      item.id ??
      item.Id ??
      item.receiveGoodsItemId ??
      item.ReceiveGoodsItemId ??
      item.ReceiveGoodsItemID ??
      null,
    receiveGoodsId:
      item.receiveGoodsId ??
      item.ReceiveGoodsId ??
      item.ReceivegoodsId ??
      null,
    purchaseOrderId: item.purchaseOrderId ?? item.PurchaseOrderId ?? null,
    poItemId:
      item.poItemId ??
      item.POItemId ??
      item.purchaseOrderItemId ??
      item.PurchaseOrderItemId ??
      null,
    itemId: item.itemId ?? item.ItemId ?? null,
    name: item.name ?? item.Name ?? item.ItemName ?? "",
    description: item.description ?? item.Description ?? "",
    unit: item.unit ?? item.Unit ?? "PCS",
    hsn: item.hsn ?? item.HSN ?? item.hsnCode ?? item.HSNCode ?? "",
    gst: item.gst ?? item.GST ?? item.gstRate ?? item.GSTRate ?? "",
    taxPercentage: toQuantity(item.taxPercentage ?? item.TaxPercentage ?? 0),
    unitPrice: roundUnitPrice(item.unitPrice ?? item.UnitPrice ?? item.rate ?? item.Rate ?? 0),
    taxableAmount: toQuantity(item.taxableAmount ?? item.TaxableAmount ?? 0),
    cgstPercent: toQuantity(item.cgstPercent ?? item.CGSTPercent ?? 0),
    sgstPercent: toQuantity(item.sgstPercent ?? item.SGSTPercent ?? 0),
    igstPercent: toQuantity(item.igstPercent ?? item.IGSTPercent ?? 0),
    cgstAmount: toQuantity(item.cgstAmount ?? item.CGSTAmount ?? 0),
    sgstAmount: toQuantity(item.sgstAmount ?? item.SGSTAmount ?? 0),
    igstAmount: toQuantity(item.igstAmount ?? item.IGSTAmount ?? 0),
    gstAmount: toQuantity(item.gstAmount ?? item.GSTAmount ?? 0),
    serialRequired: !["0", "false", "no"].includes(
      String(serialRequiredRaw).trim().toLowerCase()
    ),
    serialNumbers: parseSerialNumbers(
      item.serialNumbers ?? item.SerialNumbers ?? item.serialNumbersJson ?? item.SerialNumbersJson
    ),
    notes: item.notes ?? item.Notes ?? "",
    orderedQty,
    receivedQty,
    balanceQty: poBalanceQty,
    poBalanceQty,
    consumedQty,
    availableQty,
    receiptReceivedQty,
    receiptAvailableQty,
    receiptBalanceQty,
    previouslyReceivedQty,
    availableBalanceQty,
    totalReceivedQty,
    totalAvailableQty,
    totalPoBalanceQty,
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
    boqId: receipt.boqId ?? receipt.BOQId ?? receipt.BoqId ?? null,
    projectId: receipt.projectId ?? receipt.ProjectId ?? null,
    vendorId: receipt.vendorId ?? receipt.VendorId ?? null,
    locationId: receipt.locationId ?? receipt.LocationId ?? null,
    receivedDate: receipt.receivedDate ?? receipt.ReceivedDate ?? null,
    receivedBy: receipt.receivedBy ?? receipt.ReceivedBy ?? "",
    invoiceNumber: receipt.invoiceNumber ?? receipt.InvoiceNumber ?? "",
    invoiceDate: receipt.invoiceDate ?? receipt.InvoiceDate ?? null,
    invoiceDocumentName:
      receipt.invoiceDocumentName ?? receipt.InvoiceDocumentName ?? "",
    invoiceDocumentType:
      receipt.invoiceDocumentType ?? receipt.InvoiceDocumentType ?? "",
    invoiceDocumentSize:
      Number(receipt.invoiceDocumentSize ?? receipt.InvoiceDocumentSize ?? 0) || 0,
    invoiceDocumentData:
      receipt.invoiceDocumentData ?? receipt.InvoiceDocumentData ?? "",
    billFrom:
      receipt.billFrom ??
      receipt.BillFrom ??
      receipt.billTo ??
      receipt.BillTo ??
      "",
    billTo:
      receipt.billFrom ??
      receipt.BillFrom ??
      receipt.billTo ??
      receipt.BillTo ??
      "",
    shipTo: receipt.shipTo ?? receipt.ShipTo ?? "",
    showProjectDetails:
      rawShowProjectDetails === null || rawShowProjectDetails === undefined
        ? true
        : !["0", "false", "no"].includes(String(rawShowProjectDetails).toLowerCase()),
    notes: receipt.notes ?? receipt.Notes ?? "",
    taxMode:
      String(receipt.taxMode ?? receipt.TaxMode ?? "intra").trim().toLowerCase() === "inter"
        ? "inter"
        : "intra",
    status: receipt.status ?? receipt.Status ?? "",
    createdAt: receipt.createdAt ?? receipt.CreatedAt ?? null,
    updatedAt: receipt.updatedAt ?? receipt.UpdatedAt ?? null,
    items: Array.isArray(receipt.items)
      ? receipt.items.map(normalizeReceiveGoodsItem)
      : [],
  };
};

export const fetchReceiveGoods = async (purchaseOrderIdOrFilters = null) => {
  const params =
    purchaseOrderIdOrFilters &&
    typeof purchaseOrderIdOrFilters === "object" &&
    !Array.isArray(purchaseOrderIdOrFilters)
      ? purchaseOrderIdOrFilters
      : purchaseOrderIdOrFilters
      ? { purchaseOrderId: purchaseOrderIdOrFilters }
      : undefined;
  const response = await api.get("/receive-goods", {
    params,
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
  const normalized = normalizeReceiveGoods(response.data?.receipt ?? response.data);
  emitReceiveGoodsChange();
  return normalized;
};

export const updateReceiveGoods = async (id, payload) => {
  const response = await api.put(`/receive-goods/${id}`, payload, {
    timeout: 60000,
  });
  const normalized = normalizeReceiveGoods(response.data?.receipt ?? response.data);
  emitReceiveGoodsChange();
  return normalized;
};

export const deleteReceiveGoods = async (id, payload = {}) => {
  await api.delete(`/receive-goods/${id}`, {
    data: payload,
    timeout: 60000,
  });
  emitReceiveGoodsChange();
};
