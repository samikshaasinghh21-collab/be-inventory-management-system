import api from "./api";

const emitInvoicesChange = () => {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("invoices:changed"));
  }
};

const normalizeDocument = (document = {}) => ({
  name: String(document.name ?? document.fileName ?? "").trim(),
  type: String(document.type ?? document.fileType ?? "").trim(),
  size: Number(document.size ?? document.fileSize ?? 0) || 0,
  uploadedAt: String(document.uploadedAt ?? document.createdAt ?? "").trim(),
  dataUrl: String(document.dataUrl ?? document.fileData ?? "").trim(),
});

const normalizeParty = (party = {}) => ({
  id: party.id ?? party.Id ?? party.vendorId ?? party.VendorId ?? null,
  name: party.name ?? party.Name ?? "",
  companyName: party.companyName ?? party.CompanyName ?? party.name ?? "",
  contactPerson:
    party.contactPerson ?? party.ContactPerson ?? party.contactName ?? party.ContactName ?? "",
  phone: party.phone ?? party.Phone ?? "",
  email: party.email ?? party.Email ?? "",
  gstNumber: party.gstNumber ?? party.GSTNumber ?? party.gst ?? party.GST ?? "",
  address: party.address ?? party.Address ?? "",
  city: party.city ?? party.City ?? "",
  state: party.state ?? party.State ?? "",
  stateCode: party.stateCode ?? party.StateCode ?? "",
  pincode: party.pincode ?? party.Pincode ?? "",
});

const normalizePayment = (payment = {}) => ({
  status: payment.status ?? payment.Status ?? "Unpaid",
  mode: payment.mode ?? payment.Mode ?? "Bank Transfer",
  bankName: payment.bankName ?? payment.BankName ?? "",
  accountNumber: payment.accountNumber ?? payment.AccountNumber ?? "",
  ifsc: payment.ifsc ?? payment.IFSC ?? "",
  paidAmount: Number(payment.paidAmount ?? payment.PaidAmount ?? 0) || 0,
});

const normalizeNotes = (notes = {}) => ({
  internal: notes.internal ?? notes.Internal ?? "",
  supplier: notes.supplier ?? notes.Supplier ?? "",
  delivery: notes.delivery ?? notes.Delivery ?? "",
});

const normalizeItem = (item = {}) => ({
  id: item.id ?? item.Id ?? "",
  sourceItemId: item.sourceItemId ?? item.SourceItemId ?? item.receiveGoodsItemId ?? null,
  poItemId: item.poItemId ?? item.POItemId ?? item.purchaseOrderItemId ?? null,
  productCode: item.productCode ?? item.ProductCode ?? "",
  productName: item.productName ?? item.ProductName ?? item.name ?? item.Name ?? "",
  description: item.description ?? item.Description ?? "",
  hsn: item.hsn ?? item.HSN ?? "",
  uom: item.uom ?? item.UOM ?? item.unit ?? item.Unit ?? "PCS",
  orderedQty: Number(item.orderedQty ?? item.OrderedQty ?? 0) || 0,
  receivedQty: Number(item.receivedQty ?? item.ReceivedQty ?? 0) || 0,
  unitPrice: Number(item.unitPrice ?? item.UnitPrice ?? 0) || 0,
  discount: Number(item.discount ?? item.Discount ?? 0) || 0,
  tax: Number(item.tax ?? item.Tax ?? item.gst ?? item.GST ?? 0) || 0,
  batchNo: item.batchNo ?? item.BatchNo ?? "",
  expiryDate: item.expiryDate ?? item.ExpiryDate ?? "",
});

export const normalizeInvoice = (invoice = {}) => ({
  invoiceId: invoice.invoiceId ?? invoice.InvoiceId ?? invoice.id ?? invoice.Id ?? null,
  id: invoice.invoiceId ?? invoice.InvoiceId ?? invoice.id ?? invoice.Id ?? null,
  invoiceNumber: invoice.invoiceNumber ?? invoice.InvoiceNumber ?? "",
  status: invoice.status ?? invoice.Status ?? "Draft",
  invoiceDate: invoice.invoiceDate ?? invoice.InvoiceDate ?? "",
  dueDate: invoice.dueDate ?? invoice.DueDate ?? "",
  poReference: invoice.poReference ?? invoice.POReference ?? "",
  paymentTerms: invoice.paymentTerms ?? invoice.PaymentTerms ?? "Net 30 Days",
  currency: invoice.currency ?? invoice.Currency ?? "INR - Indian Rupee",
  taxMode: invoice.taxMode ?? invoice.TaxMode ?? "intra",
  placeOfSupply: invoice.placeOfSupply ?? invoice.PlaceOfSupply ?? "",
  reverseCharge: invoice.reverseCharge ?? invoice.ReverseCharge ?? "No",
  irn: invoice.irn ?? invoice.IRN ?? "",
  qrReference: invoice.qrReference ?? invoice.QRReference ?? "",
  receiveGoodsId: invoice.receiveGoodsId ?? invoice.ReceiveGoodsId ?? null,
  purchaseOrderId: invoice.purchaseOrderId ?? invoice.PurchaseOrderId ?? null,
  vendorId: invoice.vendorId ?? invoice.VendorId ?? null,
  projectId: invoice.projectId ?? invoice.ProjectId ?? null,
  supplier: normalizeParty(invoice.supplier ?? invoice.Supplier ?? {}),
  buyer: normalizeParty(invoice.buyer ?? invoice.Buyer ?? {}),
  items: Array.isArray(invoice.items ?? invoice.Items)
    ? (invoice.items ?? invoice.Items).map(normalizeItem)
    : [],
  payment: normalizePayment(invoice.payment ?? invoice.Payment ?? {}),
  notes: normalizeNotes(invoice.notes ?? invoice.Notes ?? {}),
  documents: Array.isArray(invoice.documents ?? invoice.Documents)
    ? (invoice.documents ?? invoice.Documents).map(normalizeDocument)
    : [],
  totals:
    invoice.totals ??
    invoice.Totals ?? {
      totalItems: 0,
      totalQuantity: 0,
      subtotal: 0,
      discount: 0,
      taxable: 0,
      cgst: 0,
      sgst: 0,
      igst: 0,
      taxAmount: 0,
      roundOff: 0,
      grandTotal: 0,
      dueAmount: 0,
    },
  createdAt: invoice.createdAt ?? invoice.CreatedAt ?? null,
  updatedAt: invoice.updatedAt ?? invoice.UpdatedAt ?? null,
});

export const fetchInvoices = async (params = {}) => {
  const response = await api.get("/invoices", { params });
  const list = Array.isArray(response.data?.invoices)
    ? response.data.invoices
    : Array.isArray(response.data)
    ? response.data
    : [];
  return list.map(normalizeInvoice);
};

export const fetchInvoice = async (id) => {
  const response = await api.get(`/invoices/${id}`);
  return normalizeInvoice(response.data?.invoice ?? response.data);
};

export const createInvoice = async (payload) => {
  const response = await api.post("/invoices", payload);
  const normalized = normalizeInvoice(response.data?.invoice ?? response.data);
  emitInvoicesChange();
  return normalized;
};

export const updateInvoice = async (id, payload) => {
  const response = await api.put(`/invoices/${id}`, payload);
  const normalized = normalizeInvoice(response.data?.invoice ?? response.data);
  emitInvoicesChange();
  return normalized;
};

export const updateInvoiceStatus = async (id, status) => {
  const response = await api.put(`/invoices/${id}/status`, { status });
  const normalized = normalizeInvoice(response.data?.invoice ?? response.data);
  emitInvoicesChange();
  return normalized;
};

export const deleteInvoice = async (id) => {
  await api.delete(`/invoices/${id}`);
  emitInvoicesChange();
};
