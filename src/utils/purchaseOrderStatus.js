export const normalizePurchaseOrderStatus = (status) =>
  String(status || "").trim().toLowerCase();

export const isClosedPurchaseOrder = (status) =>
  normalizePurchaseOrderStatus(status) === "closed";

export const isCancelledPurchaseOrder = (status) => {
  const normalized = normalizePurchaseOrderStatus(status);
  return normalized === "cancelled" || normalized === "canceled";
};

export const isLockedPurchaseOrder = (status) =>
  isClosedPurchaseOrder(status) || isCancelledPurchaseOrder(status);

export const getPurchaseOrderLockMessage = (status) =>
  isCancelledPurchaseOrder(status)
    ? "This Purchase Order is Cancelled."
    : "This Purchase Order is Closed.";
