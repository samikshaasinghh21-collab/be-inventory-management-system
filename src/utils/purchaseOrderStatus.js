export const normalizePurchaseOrderStatus = (status) =>
  String(status || "").trim().toLowerCase();

export const isClosedPurchaseOrder = (status) =>
  normalizePurchaseOrderStatus(status) === "closed";
