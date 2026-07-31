import api from "./api";

export const POD_STATUS = {
  PENDING: "POD_PENDING",
  UPLOADED: "POD_UPLOADED",
  UNDER_VERIFICATION: "POD_UNDER_VERIFICATION",
  VERIFIED: "POD_VERIFIED",
  REJECTED: "POD_REJECTED",
  DISPUTED: "POD_DISPUTED",
  WAIVED: "POD_WAIVED",
};

export const POD_STATUS_LABELS = {
  [POD_STATUS.PENDING]: "POD Pending",
  [POD_STATUS.UPLOADED]: "POD Uploaded",
  [POD_STATUS.UNDER_VERIFICATION]: "Under Verification",
  [POD_STATUS.VERIFIED]: "POD Verified",
  [POD_STATUS.REJECTED]: "POD Rejected",
  [POD_STATUS.DISPUTED]: "POD Disputed",
  [POD_STATUS.WAIVED]: "POD Waived",
};

const POD_STATUS_ALIASES = {
  pending: POD_STATUS.PENDING,
  "pod pending": POD_STATUS.PENDING,
  pod_pending: POD_STATUS.PENDING,
  uploaded: POD_STATUS.UPLOADED,
  "pod uploaded": POD_STATUS.UPLOADED,
  pod_uploaded: POD_STATUS.UPLOADED,
  "under verification": POD_STATUS.UNDER_VERIFICATION,
  pod_under_verification: POD_STATUS.UNDER_VERIFICATION,
  verified: POD_STATUS.VERIFIED,
  "pod verified": POD_STATUS.VERIFIED,
  received: POD_STATUS.VERIFIED,
  delivered: POD_STATUS.VERIFIED,
  pod_verified: POD_STATUS.VERIFIED,
  rejected: POD_STATUS.REJECTED,
  "pod rejected": POD_STATUS.REJECTED,
  pod_rejected: POD_STATUS.REJECTED,
  disputed: POD_STATUS.DISPUTED,
  "pod disputed": POD_STATUS.DISPUTED,
  pod_disputed: POD_STATUS.DISPUTED,
  waived: POD_STATUS.WAIVED,
  "pod waived": POD_STATUS.WAIVED,
  "not required": POD_STATUS.WAIVED,
  pod_waived: POD_STATUS.WAIVED,
};

export const normalizePodStatus = (value) => {
  const raw = String(value ?? "").trim();
  if (!raw) {
    return POD_STATUS.PENDING;
  }
  if (POD_STATUS_LABELS[raw]) {
    return raw;
  }
  const normalized = raw.replace(/\s+/g, " ").toLowerCase();
  return POD_STATUS_ALIASES[normalized] ?? POD_STATUS.PENDING;
};

export const getPodStatusLabel = (value) =>
  POD_STATUS_LABELS[normalizePodStatus(value)] ?? POD_STATUS_LABELS[POD_STATUS.PENDING];

const emitDeliveryChallanChange = () => {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("delivery-challans:changed"));
    window.dispatchEvent(new Event("receive-goods:changed"));
    window.dispatchEvent(new Event("consumptions:changed"));
    window.dispatchEvent(new Event("reallocate-inventory:changed"));
  }
};

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
  deliveryChallanItemId:
    item.deliveryChallanItemId ??
    item.DeliveryChallanItemId ??
    item.deliveryChallanLineItemId ??
    item.DeliveryChallanLineItemId ??
    null,
  receiveGoodsItemId:
    item.receiveGoodsItemId ?? item.ReceiveGoodsItemId ?? null,
  receiptItemId:
    item.receiptItemId ??
    item.ReceiptItemId ??
    item.receiveGoodsItemId ??
    item.ReceiveGoodsItemId ??
    null,
  sourceType: item.sourceType ?? item.SourceType ?? "",
  sourceKey: item.sourceKey ?? item.SourceKey ?? "",
  sourceRowId:
    item.sourceRowId ??
    item.SourceRowId ??
    item.sourceKey ??
    item.SourceKey ??
    "",
  sourceRef: item.sourceRef ?? item.SourceRef ?? "",
  poItemId:
    item.poItemId ??
    item.POItemId ??
    item.purchaseOrderItemId ??
    item.PurchaseOrderItemId ??
    null,
  itemId: item.itemId ?? item.ItemId ?? null,
  name: item.name ?? item.ItemName ?? item.itemName ?? "",
  description: item.description ?? item.Description ?? "",
  unit: item.unit ?? item.Unit ?? "PCS",
  hsn: item.hsn ?? item.HSN ?? item.hsnCode ?? item.HSNCode ?? "",
  gst: item.gst ?? item.GST ?? item.gstRate ?? item.GSTRate ?? "",
  quantity: Number(item.quantity ?? item.Quantity ?? 0) || 0,
  consumedQty: Number(item.consumedQty ?? item.ConsumedQty ?? 0) || 0,
  balanceQty: Number(item.balanceQty ?? item.BalanceQty ?? 0) || 0,
  rate: Number(item.rate ?? item.Rate ?? 0) || 0,
  notes: item.notes ?? item.Notes ?? "",
});

const normalizeDeliveryChallan = (challan = {}) => ({
  id: challan.id ?? challan.DeliveryChallanId ?? challan.Id ?? null,
  dcNumber: challan.dcNumber ?? challan.DCNumber ?? challan.DcNumber ?? "",
  projectId: challan.projectId ?? challan.ProjectId ?? null,
  receiveGoodsId:
    challan.receiveGoodsId ??
    challan.ReceiveGoodsId ??
    challan.receivegoodsId ??
    null,
  receiveGoodsIds: Array.isArray(challan.receiveGoodsIds)
    ? challan.receiveGoodsIds
    : Array.isArray(challan.ReceiveGoodsIds)
    ? challan.ReceiveGoodsIds
    : [],
  fromLocationId: challan.fromLocationId ?? challan.FromLocationId ?? null,
  toLocationId: challan.toLocationId ?? challan.ToLocationId ?? null,
  toLocation: challan.toLocation ?? challan.ToLocation ?? "",
  vehicleNumber: challan.vehicleNumber ?? challan.VehicleNumber ?? "",
  eWayBillNumber:
    challan.eWayBillNumber ??
    challan.EWayBillNumber ??
    challan.EBN ??
    "",
  issueDate: challan.issueDate ?? challan.IssueDate ?? null,
  status: challan.status ?? challan.Status ?? "Draft",
  podStatus: normalizePodStatus(challan.podStatus ?? challan.PODStatus),
  podReference: challan.podReference ?? challan.PODReference ?? "",
  podDate: challan.podDate ?? challan.PODDate ?? null,
  podDocumentName:
    challan.podDocumentName ?? challan.PODDocumentName ?? challan.podFileName ?? "",
  podDocumentType:
    challan.podDocumentType ?? challan.PODDocumentType ?? challan.podFileType ?? "",
  podDocumentSize:
    Number(challan.podDocumentSize ?? challan.PODDocumentSize ?? challan.podFileSize ?? 0) ||
    0,
  podDocumentData: challan.podDocumentData ?? challan.PODDocumentData ?? "",
  podUploadedAt: challan.podUploadedAt ?? challan.PODUploadedAt ?? null,
  podUploadedBy: challan.podUploadedBy ?? challan.PODUploadedBy ?? "",
  podVerifiedAt: challan.podVerifiedAt ?? challan.PODVerifiedAt ?? null,
  podVerifiedBy: challan.podVerifiedBy ?? challan.PODVerifiedBy ?? "",
  podRejectedAt: challan.podRejectedAt ?? challan.PODRejectedAt ?? null,
  podRejectedBy: challan.podRejectedBy ?? challan.PODRejectedBy ?? "",
  podRejectionRemarks:
    challan.podRejectionRemarks ?? challan.PODRejectionRemarks ?? "",
  podDisputedAt: challan.podDisputedAt ?? challan.PODDisputedAt ?? null,
  podDisputedBy: challan.podDisputedBy ?? challan.PODDisputedBy ?? "",
  podDisputeRemarks: challan.podDisputeRemarks ?? challan.PODDisputeRemarks ?? "",
  podResolvedAt: challan.podResolvedAt ?? challan.PODResolvedAt ?? null,
  podResolvedBy: challan.podResolvedBy ?? challan.PODResolvedBy ?? "",
  podResolutionRemarks:
    challan.podResolutionRemarks ?? challan.PODResolutionRemarks ?? "",
  podWaivedAt: challan.podWaivedAt ?? challan.PODWaivedAt ?? null,
  podWaivedBy: challan.podWaivedBy ?? challan.PODWaivedBy ?? "",
  podWaiverReason: challan.podWaiverReason ?? challan.PODWaiverReason ?? "",
  podWaiverApprovedBy:
    challan.podWaiverApprovedBy ?? challan.PODWaiverApprovedBy ?? "",
  notes: challan.notes ?? challan.Notes ?? "",
  deliveredQty: Number(challan.deliveredQty ?? challan.DeliveredQty ?? 0) || 0,
  consumedQty: Number(challan.consumedQty ?? challan.ConsumedQty ?? 0) || 0,
  balanceQty: Number(challan.balanceQty ?? challan.BalanceQty ?? 0) || 0,
  createdAt: challan.createdAt ?? challan.CreatedAt ?? null,
  updatedAt: challan.updatedAt ?? challan.UpdatedAt ?? null,
  items: Array.isArray(challan.items)
    ? challan.items.map(normalizeDeliveryChallanItem)
    : Array.isArray(challan.DeliveryChallanItems)
    ? challan.DeliveryChallanItems.map(normalizeDeliveryChallanItem)
    : [],
});

const normalizePodAuditEntry = (entry = {}) => ({
  id: entry.id ?? entry.auditId ?? entry.AuditId ?? null,
  deliveryChallanId:
    entry.deliveryChallanId ?? entry.DeliveryChallanId ?? entry.ChallanId ?? null,
  action: entry.action ?? entry.actionName ?? entry.ActionName ?? "",
  fromStatus: normalizePodStatus(entry.fromStatus ?? entry.FromStatus),
  toStatus: normalizePodStatus(entry.toStatus ?? entry.ToStatus),
  performedBy: entry.performedBy ?? entry.PerformedBy ?? "",
  performedRole: entry.performedRole ?? entry.PerformedRole ?? "",
  remarks: entry.remarks ?? entry.Remarks ?? entry.details ?? entry.Details ?? "",
  createdAt: entry.createdAt ?? entry.CreatedAt ?? null,
  snapshot: entry.snapshot ?? entry.SnapshotJson ?? entry.snapshotJson ?? null,
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

export const fetchDeliveryChallan = async (id) => {
  const response = await api.get(`/delivery-challans/${id}`);
  return normalizeDeliveryChallan(response.data?.deliveryChallan ?? response.data);
};

export const fetchNextDeliveryChallanNumber = async () => {
  const response = await api.get("/delivery-challans/next-number");
  return (
    response.data?.dcNumber ??
    response.data?.nextNumber ??
    response.data?.deliveryChallanNumber ??
    ""
  );
};

export const createDeliveryChallan = async (payload) => {
  console.debug("createDeliveryChallan request payload", payload);
  try {
    const response = await api.post("/delivery-challans", payload, {
      timeout: 60000,
    });
    const normalized = normalizeDeliveryChallan(
      response.data?.deliveryChallan ?? response.data
    );
    emitDeliveryChallanChange();
    return normalized;
  } catch (error) {
    console.error(
      "createDeliveryChallan failed",
      error?.response?.data ?? error?.message ?? error
    );
    throw error;
  }
};

export const updateDeliveryChallan = async (id, payload) => {
  const response = await api.put(`/delivery-challans/${id}`, payload, {
    timeout: 60000,
  });
  const normalized = normalizeDeliveryChallan(
    response.data?.deliveryChallan ?? response.data
  );
  emitDeliveryChallanChange();
  return normalized;
};

export const uploadDeliveryChallanPod = async (id, payload) => {
  const response = await api.post(`/delivery-challans/${id}/pod/upload`, payload, {
    timeout: 60000,
  });
  const normalized = normalizeDeliveryChallan(
    response.data?.deliveryChallan ?? response.data
  );
  emitDeliveryChallanChange();
  return normalized;
};

export const updateDeliveryChallanPodStatus = async (id, payload) => {
  const response = await api.post(`/delivery-challans/${id}/pod/status`, payload, {
    timeout: 60000,
  });
  const normalized = normalizeDeliveryChallan(
    response.data?.deliveryChallan ?? response.data
  );
  emitDeliveryChallanChange();
  return normalized;
};

export const fetchDeliveryChallanPodAudit = async (id) => {
  const response = await api.get(`/delivery-challans/${id}/pod/audit`);
  const list = Array.isArray(response.data?.auditLog)
    ? response.data.auditLog
    : Array.isArray(response.data)
    ? response.data
    : [];
  return list.map(normalizePodAuditEntry);
};

export const deleteDeliveryChallan = async (id) => {
  await api.delete(`/delivery-challans/${id}`);
  emitDeliveryChallanChange();
};
