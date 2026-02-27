import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import useSettings from "../../hooks/useSettings";
import DateInput from "../common/DateInput";
import { fetchPurchaseOrders } from "../../services/purchaseOrdersApi";
import { fetchProjects } from "../../services/projectsApi";
import { fetchVendors } from "../../services/vendorsApi";
import { fetchLocations } from "../../services/locationsApi";
import {
  fetchReceiveGoods,
  saveReceiveGoods,
} from "../../services/receiveGoodsApi";
import {
  addWorkflowItem,
  getWorkflowList,
  updateWorkflowItem,
} from "../../services/workflowStore";
import { formatDate } from "../../utils/dateFormat";

const INVOICE_KEY = "workflow_invoices";

const toNullableInt = (value) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
};

const buildReceiveItems = (record, receipt) => {
  const receivedByItemId = new Map();
  const receivedWithoutItemId = [];

  for (const item of receipt?.items || []) {
    const itemId = toNullableInt(item.itemId ?? item.ItemId);
    const qty = Number(item.receivedQty ?? item.ReceivedQty ?? 0) || 0;
    if (itemId !== null) {
      receivedByItemId.set(itemId, qty);
    } else {
      receivedWithoutItemId.push(qty);
    }
  }

  let fallbackIndex = 0;
  return (record?.items || []).map((item, idx) => {
    const lineId = item.id ?? item.itemId ?? `po-line-${idx}`;
    const itemId = toNullableInt(item.itemId ?? item.ItemId);
    const receivedQty =
      itemId !== null
        ? receivedByItemId.get(itemId) ?? 0
        : receivedWithoutItemId[fallbackIndex++] ?? 0;

    return {
      id: lineId,
      itemId,
      name: item.name || (itemId ? `Item ${itemId}` : ""),
      unit: item.unit || "PCS",
      orderedQty: Number(item.quantity) || 0,
      receivedQty,
    };
  });
};

const createReceiveForm = (record, receipt) => ({
  receivedDate:
    receipt?.receivedDate ||
    record?.receivedDate ||
    new Date().toISOString().slice(0, 10),
  receivedBy: receipt?.receivedBy || record?.receivedBy || "",
  notes: receipt?.notes || record?.receivedNotes || "",
  items: buildReceiveItems(record, receipt),
});

const computeReceiveStatus = (items, fallback = "Draft") => {
  const normalized = Array.isArray(items) ? items : [];
  if (normalized.length === 0) {
    return fallback;
  }

  const anyReceived = normalized.some(
    (item) => Number(item.receivedQty) > 0
  );
  const allReceived = normalized.every((item) => {
    const ordered = Number(item.orderedQty) || 0;
    const received = Number(item.receivedQty) || 0;
    if (ordered === 0) {
      return true;
    }
    return received >= ordered;
  });

  if (allReceived) {
    return "Closed";
  }
  if (anyReceived) {
    return "Partially Received";
  }
  return fallback;
};

const ReceiveGoods = () => {
  const navigate = useNavigate();
  const settings = useSettings();
  const currency = settings?.preferences?.currency || "INR";
  const [records, setRecords] = useState([]);
  const [receipts, setReceipts] = useState([]);
  const [projects, setProjects] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [locations, setLocations] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [receiveForm, setReceiveForm] = useState(() => createReceiveForm());
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const loadRecords = async () => {
    try {
      setLoading(true);
      setError("");
      const list = await fetchPurchaseOrders();
      setRecords(Array.isArray(list) ? list : []);
    } catch (err) {
      setRecords([]);
      setError(err?.message || "Failed to load purchase orders");
    } finally {
      setLoading(false);
    }
  };

  const loadReceipts = async () => {
    try {
      const list = await fetchReceiveGoods();
      setReceipts(Array.isArray(list) ? list : []);
    } catch {
      setReceipts([]);
    }
  };

  const loadLocations = async () => {
    try {
      const list = await fetchLocations();
      setLocations(Array.isArray(list) ? list : []);
    } catch {
      setLocations([]);
    }
  };

  const loadProjects = async () => {
    try {
      const list = await fetchProjects();
      setProjects(Array.isArray(list) ? list : []);
    } catch {
      setProjects([]);
    }
  };

  const loadVendors = async () => {
    try {
      const list = await fetchVendors();
      setVendors(Array.isArray(list) ? list : []);
    } catch {
      setVendors([]);
    }
  };

  useEffect(() => {
    void loadProjects();
    void loadLocations();
    void loadVendors();
    void loadRecords();
    void loadReceipts();
  }, []);

  useEffect(() => {
    if (selectedId && !records.some((record) => record.id === selectedId)) {
      setSelectedId(null);
    }
  }, [records, selectedId]);

  const projectMap = useMemo(() => {
    return projects.reduce((acc, project) => {
      acc[String(project.id)] = project;
      return acc;
    }, {});
  }, [projects]);

  const vendorMap = useMemo(() => {
    return vendors.reduce((acc, vendor) => {
      acc[String(vendor.id)] = vendor;
      return acc;
    }, {});
  }, [vendors]);

  const locationMap = useMemo(() => {
    return locations.reduce((acc, location) => {
      acc[String(location.id)] = location;
      return acc;
    }, {});
  }, [locations]);

  const selectedRecord =
    records.find((record) => record.id === selectedId) || null;
  const selectedReceipt = selectedRecord
    ? receipts.find(
        (receipt) =>
          Number(receipt.purchaseOrderId) === Number(selectedRecord.id)
      )
    : null;
  const selectedProject = selectedRecord
    ? projectMap[String(selectedRecord.projectId)]
    : null;
  const selectedVendor = selectedRecord
    ? vendorMap[String(selectedRecord.vendorId)]
    : null;
  const selectedLocation = selectedRecord
    ? locationMap[
        String(selectedRecord.locationId ?? selectedReceipt?.locationId)
      ]
    : null;
  const selectedItems = Array.isArray(selectedRecord?.items)
    ? selectedRecord.items
    : [];

  useEffect(() => {
    if (selectedRecord) {
      const matchedReceipt = receipts.find(
        (receipt) =>
          Number(receipt.purchaseOrderId) === Number(selectedRecord.id)
      );
      setReceiveForm(createReceiveForm(selectedRecord, matchedReceipt));
    } else {
      setReceiveForm(createReceiveForm());
    }
  }, [selectedRecord, receipts]);

  const receiveItems = (receiveForm.items || []).map((item) => ({
    ...item,
    orderedQty: Number(item.orderedQty) || 0,
    receivedQty: Number(item.receivedQty) || 0,
  }));

  const totalOrderedQty = receiveItems.reduce(
    (sum, item) => sum + item.orderedQty,
    0
  );
  const totalReceivedQty = receiveItems.reduce(
    (sum, item) => sum + item.receivedQty,
    0
  );
  const totalBalanceQty = Math.max(totalOrderedQty - totalReceivedQty, 0);
  const nextStatusPreview = selectedRecord
    ? computeReceiveStatus(receiveItems, selectedRecord.status || "Draft")
    : "Draft";

  const formatCurrency = (value) => {
    const amount = Number(value) || 0;
    try {
      return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency,
        maximumFractionDigits: 2,
      }).format(amount);
    } catch {
      return `${currency} ${amount.toLocaleString()}`;
    }
  };

  const totalValue = records.reduce(
    (sum, record) => sum + (Number(record.total) || 0),
    0
  );

  const handleReceiveFieldChange = (field, value) => {
    setReceiveForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleReceiveQtyChange = (id, value) => {
    setReceiveForm((prev) => ({
      ...prev,
      items: prev.items.map((item) =>
        item.id === id ? { ...item, receivedQty: value } : item
      ),
    }));
  };

  const handleReceiveSubmit = async (event) => {
    event.preventDefault();
    if (!selectedRecord) {
      return;
    }

    setSaving(true);
    setError("");

    const normalizedItems = receiveForm.items.map((item) => {
      const orderedQty = Number(item.orderedQty) || 0;
      let receivedQty = Number(item.receivedQty) || 0;
      if (Number.isNaN(receivedQty) || receivedQty < 0) {
        receivedQty = 0;
      }
      if (orderedQty > 0 && receivedQty > orderedQty) {
        receivedQty = orderedQty;
      }
      return {
        id: item.id,
        itemId: toNullableInt(item.itemId),
        orderedQty,
        receivedQty,
      };
    });

    const status = computeReceiveStatus(
      normalizedItems,
      selectedRecord.status || "Draft"
    );

    try {
      const receipt = await saveReceiveGoods({
        purchaseOrderId: selectedRecord.id,
        projectId: selectedRecord.projectId,
        vendorId: selectedRecord.vendorId,
        locationId: selectedRecord.locationId,
        receivedDate: receiveForm.receivedDate,
        receivedBy: receiveForm.receivedBy.trim(),
        notes: receiveForm.notes.trim(),
        status,
        items: normalizedItems,
      });

      await Promise.all([loadReceipts(), loadRecords()]);
      setReceiveForm(createReceiveForm(selectedRecord, receipt));

      const invoiceList = getWorkflowList(INVOICE_KEY);
      const existingInvoice = invoiceList.find(
        (invoice) => invoice.sourcePoId === selectedRecord.id
      );
      const invoiceItems = (selectedRecord.items || [])
        .map((item) => {
          const receivedMatch = normalizedItems.find(
            (received) => received.id === item.id
          );
          const qty = Number(receivedMatch?.receivedQty) || 0;
          if (qty <= 0) {
            return null;
          }
          return {
            id: item.id,
            name: item.name || "",
            description: item.description || "",
            unit: item.unit || "PCS",
            quantity: qty,
            rate: item.rate ?? item.unitPrice ?? 0,
            notes: item.notes || "",
          };
        })
        .filter(Boolean);

      const invoiceTotal = invoiceItems.reduce((sum, item) => {
        const qty = Number(item.quantity) || 0;
        const rate = Number(item.rate) || 0;
        return sum + qty * rate;
      }, 0);

      const invoicePayload = {
        id: existingInvoice?.id ?? Date.now(),
        invoiceNumber:
          existingInvoice?.invoiceNumber ||
          `INV-${selectedRecord.poNumber || Date.now()}`,
        clientName:
          selectedProject?.client ||
          selectedProject?.name ||
          selectedVendor?.name ||
          "",
        projectId: selectedRecord.projectId || "",
        status: existingInvoice?.status || "Draft",
        issueDate:
          receiveForm.receivedDate || new Date().toISOString().slice(0, 10),
        dueDate: existingInvoice?.dueDate || "",
        notes: receiveForm.notes.trim(),
        items: invoiceItems,
        total: invoiceTotal,
        sourcePoId: selectedRecord.id,
        sourcePoNumber: selectedRecord.poNumber || "",
        receivedBy: receiveForm.receivedBy.trim(),
        receivedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        createdAt: existingInvoice?.createdAt || new Date().toISOString(),
      };

      if (existingInvoice) {
        updateWorkflowItem(INVOICE_KEY, existingInvoice.id, invoicePayload);
      } else {
        addWorkflowItem(INVOICE_KEY, invoicePayload);
      }

      navigate("/inventory/receive-goods-register");
    } catch (err) {
      const message =
        err?.code === "ECONNABORTED"
          ? "Receipt save timed out. Please retry; if it repeats, restart backend and check server logs."
          : err?.response?.data?.error ||
            err?.message ||
            "Failed to save receipt";
      setError(message);
    } finally {
      setSaving(false);
    }
  };

  const resetReceiveForm = () => {
    if (selectedRecord) {
      const receipt = receipts.find(
        (r) => Number(r.purchaseOrderId) === Number(selectedRecord.id)
      );
      setReceiveForm(createReceiveForm(selectedRecord, receipt));
    } else {
      setReceiveForm(createReceiveForm());
    }
  };

  return (
    <div className="p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between mb-6">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-slate-400">
              Inventory
            </p>
            <h1 className="text-3xl font-semibold text-slate-800">
              Receive Goods
            </h1>
            <p className="text-sm text-slate-500 mt-1">
              Review purchase orders and project details before receiving stock.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                loadRecords();
                loadReceipts();
            }}
            className="px-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-700 bg-white"
            >
              Refresh POs
            </button>
            <button
              type="button"
              onClick={loadVendors}
              className="px-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-700 bg-white"
            >
              Refresh Vendors
            </button>
            <button
              type="button"
              onClick={() => navigate("/inventory/purchase-order")}
              className="px-4 py-2 rounded-lg text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700"
            >
              Create PO
            </button>
            <button
              type="button"
              onClick={() => navigate("/inventory/receive-goods-register")}
              className="px-4 py-2 rounded-lg text-sm font-medium text-indigo-700 bg-indigo-50 border border-indigo-200"
            >
              View Receipts
            </button>
          </div>
        </div>

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-white p-4 rounded-lg shadow-sm border border-slate-200">
          <p className="text-sm text-slate-500">Total POs</p>
          <p className="text-2xl font-semibold text-slate-800">
            {records.length}
          </p>
        </div>
        <div className="bg-white p-4 rounded-lg shadow-sm border border-slate-200">
          <p className="text-sm text-slate-500">Open Orders</p>
          <p className="text-2xl font-semibold text-slate-800">
            {records.filter((record) => record.status !== "Closed").length}
          </p>
        </div>
        <div className="bg-white p-4 rounded-lg shadow-sm border border-slate-200">
          <p className="text-sm text-slate-500">Total Value</p>
          <p className="text-2xl font-semibold text-slate-800">
            {formatCurrency(totalValue)}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1.15fr_0.85fr] gap-6">
        <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-x-auto">
          <div className="px-4 py-3 border-b flex items-center justify-between">
            <h3 className="text-lg font-semibold text-slate-800">
              Purchase Orders
            </h3>
            <p className="text-sm text-slate-500">
              Click a PO to view details.
            </p>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-slate-100 text-slate-600">
              <tr>
                <th className="p-3 text-left min-w-[150px]">PO No</th>
                <th className="p-3 text-left min-w-[180px]">Project</th>
                <th className="p-3 text-left min-w-[180px]">Vendor</th>
                <th className="p-3 text-left min-w-[140px]">Status</th>
                <th className="p-3 text-left min-w-[120px]">Items</th>
                <th className="p-3 text-left min-w-[140px]">Expected</th>
                <th className="p-3 text-left min-w-[140px]">Value</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan="7" className="p-6 text-center text-slate-500">
                    Loading purchase orders...
                  </td>
                </tr>
              )}
              {!loading && records.length === 0 && (
                <tr>
                  <td colSpan="7" className="p-6 text-center text-slate-500">
                    No purchase orders created yet.
                  </td>
                </tr>
              )}
              {!loading &&
                records.map((record, idx) => {
                  const isSelected = selectedId === record.id;
                  return (
                    <tr
                      key={record.id ?? `po-${idx}`}
                      onClick={() => {
                        setSelectedId(record.id);
                        const receipt = receipts.find(
                          (r) =>
                            Number(r.purchaseOrderId) === Number(record.id)
                        );
                        setReceiveForm(createReceiveForm(record, receipt));
                      }}
                      className={`border-t hover:bg-slate-50 cursor-pointer ${
                        isSelected ? "bg-indigo-50/70" : ""
                      }`}
                    >
                      <td className="p-3 font-medium text-slate-800">
                        {record.poNumber}
                      </td>
                      <td className="p-3">
                        <span className="text-indigo-600 font-medium">
                          {projectMap[String(record.projectId)]?.name || "-"}
                        </span>
                      </td>
                      <td className="p-3">
                        {vendorMap[String(record.vendorId)]?.name || "-"}
                      </td>
                      <td className="p-3">{record.status || "-"}</td>
                      <td className="p-3">{record.items?.length || 0}</td>
                      <td className="p-3">{formatDate(record.expectedDate) || "-"}</td>
                      <td className="p-3 font-medium">
                        {formatCurrency(record.total || 0)}
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>

        <div className="space-y-4">
          {!selectedRecord ? (
            <div className="bg-white rounded-lg shadow-sm border border-dashed border-slate-200 p-6 text-center text-sm text-slate-500">
              Select a purchase order to see project and PO details.
            </div>
          ) : (
            <>
              <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-5">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <p className="text-xs uppercase tracking-[0.3em] text-slate-400">
                      PO Details
                    </p>
                    <h2 className="text-xl font-semibold text-slate-800">
                      {selectedRecord.poNumber || "Purchase Order"}
                    </h2>
                    <p className="text-sm text-slate-500 mt-1">
                      Status: {selectedRecord.status || "-"}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedId(null)}
                    className="text-xs text-slate-500 hover:text-slate-700"
                  >
                    Clear
                  </button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                  <div className="flex flex-col">
                    <span className="text-xs uppercase tracking-[0.2em] text-slate-400">
                      Project
                    </span>
                    <span className="font-medium text-slate-800">
                      {selectedProject?.name || "-"}
                    </span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-xs uppercase tracking-[0.2em] text-slate-400">
                      Vendor
                    </span>
                    <span className="font-medium text-slate-800">
                      {selectedVendor?.name || "-"}
                    </span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-xs uppercase tracking-[0.2em] text-slate-400">
                      Location
                    </span>
                    <span className="font-medium text-slate-800">
                      {selectedLocation?.name || "-"}
                    </span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-xs uppercase tracking-[0.2em] text-slate-400">
                      Order Date
                    </span>
                    <span className="font-medium text-slate-800">
                      {formatDate(selectedRecord.orderDate) || "-"}
                    </span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-xs uppercase tracking-[0.2em] text-slate-400">
                      Expected Date
                    </span>
                    <span className="font-medium text-slate-800">
                      {formatDate(selectedRecord.expectedDate) || "-"}
                    </span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-xs uppercase tracking-[0.2em] text-slate-400">
                      Total Value
                    </span>
                    <span className="font-medium text-slate-800">
                      {formatCurrency(selectedRecord.total || 0)}
                    </span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-xs uppercase tracking-[0.2em] text-slate-400">
                      Received Date
                    </span>
                    <span className="font-medium text-slate-800">
                      {formatDate(selectedReceipt?.receivedDate) || "-"}
                    </span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-xs uppercase tracking-[0.2em] text-slate-400">
                      Received By
                    </span>
                    <span className="font-medium text-slate-800">
                      {selectedReceipt?.receivedBy || "-"}
                    </span>
                  </div>
                </div>
                {selectedRecord.notes && (
                  <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
                    <span className="font-medium text-slate-700">
                      Notes:
                    </span>{" "}
                    {selectedRecord.notes}
                  </div>
                )}
                {selectedReceipt?.notes && (
                  <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
                    <span className="font-medium text-slate-700">
                      Receiving Notes:
                    </span>{" "}
                    {selectedReceipt.notes}
                  </div>
                )}
              </div>

              <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-5">
                <h3 className="text-base font-semibold text-slate-800 mb-3">
                  Project Details
                </h3>
                {!selectedProject ? (
                  <p className="text-sm text-slate-500">
                    Project details not available.
                  </p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                    <div className="flex flex-col">
                      <span className="text-xs uppercase tracking-[0.2em] text-slate-400">
                        Project Code
                      </span>
                      <span className="font-medium text-slate-800">
                        {selectedProject.code || "-"}
                      </span>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-xs uppercase tracking-[0.2em] text-slate-400">
                        Client
                      </span>
                      <span className="font-medium text-slate-800">
                        {selectedProject.client || "-"}
                      </span>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-xs uppercase tracking-[0.2em] text-slate-400">
                        Status
                      </span>
                      <span className="font-medium text-slate-800">
                        {selectedProject.status || "-"}
                      </span>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-xs uppercase tracking-[0.2em] text-slate-400">
                        Start Date
                      </span>
                      <span className="font-medium text-slate-800">
                        {formatDate(selectedProject.startDate) || "-"}
                      </span>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-xs uppercase tracking-[0.2em] text-slate-400">
                        End Date
                      </span>
                      <span className="font-medium text-slate-800">
                        {formatDate(selectedProject.endDate) || "-"}
                      </span>
                    </div>
                    <div className="flex flex-col sm:col-span-2">
                      <span className="text-xs uppercase tracking-[0.2em] text-slate-400">
                        Notes
                      </span>
                      <span className="font-medium text-slate-800">
                        {selectedProject.notes || "-"}
                      </span>
                    </div>
                  </div>
                )}
              </div>

              <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-5">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-base font-semibold text-slate-800">
                    Line Items
                  </h3>
                  <span className="text-xs text-slate-500">
                    {selectedItems.length} items
                  </span>
                </div>
                {selectedItems.length === 0 ? (
                  <p className="text-sm text-slate-500">
                    No line items on this PO.
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-100 text-slate-600">
                        <tr>
                          <th className="p-3 text-left min-w-[160px]">Item</th>
                          <th className="p-3 text-left min-w-[160px]">
                            Description
                          </th>
                          <th className="p-3 text-left min-w-[90px]">Unit</th>
                          <th className="p-3 text-left min-w-[90px]">Qty</th>
                          <th className="p-3 text-left min-w-[110px]">Rate</th>
                          <th className="p-3 text-left min-w-[120px]">
                            Amount
                          </th>
                          <th className="p-3 text-left min-w-[160px]">Notes</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedItems.map((item, idx) => {
                          const qty = Number(item.quantity) || 0;
                          const rate =
                            Number(item.rate ?? item.unitPrice) || 0;
                          const amount = qty * rate;
                          return (
                            <tr
                              key={item.id ?? item.itemId ?? `line-${idx}`}
                              className="border-t"
                            >
                              <td className="p-3 font-medium text-slate-800">
                                {item.name || (item.itemId ? `Item ${item.itemId}` : "-")}
                              </td>
                              <td className="p-3 text-slate-600">
                                {item.description || "-"}
                              </td>
                              <td className="p-3">{item.unit || "-"}</td>
                              <td className="p-3">
                                {item.quantity ? qty : "-"}
                              </td>
                              <td className="p-3">
                                {item.rate || item.unitPrice
                                  ? formatCurrency(rate)
                                  : "-"}
                              </td>
                              <td className="p-3 font-medium">
                                {amount ? formatCurrency(amount) : "-"}
                              </td>
                              <td className="p-3 text-slate-600">
                                {item.notes || "-"}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
                <div className="mt-3 flex justify-end text-sm text-slate-600">
                  <span className="font-medium text-slate-800 mr-2">
                    Total:
                  </span>
                  {formatCurrency(selectedRecord.total || 0)}
                </div>
              </div>

              <form
                onSubmit={handleReceiveSubmit}
                className="bg-white rounded-lg shadow-sm border border-slate-200 p-5"
              >
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between mb-4">
                  <div>
                    <h3 className="text-base font-semibold text-slate-800">
                      Receive Goods
                    </h3>
                    <p className="text-xs text-slate-500">
                      Enter received quantities to update PO status.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={resetReceiveForm}
                    className="px-3 py-1.5 border border-slate-200 rounded-md text-xs text-slate-600"
                  >
                    Reset
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
                  <div>
                    <label className="text-sm font-medium text-slate-700">
                      Received Date
                    </label>
                    <DateInput
                      value={receiveForm.receivedDate}
                      onChange={(value) =>
                        handleReceiveFieldChange("receivedDate", value)
                      }
                      className="w-full mt-1 border border-slate-200 rounded-lg px-3 py-2 text-sm"
                      placeholder="dd/mm/yyyy"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-slate-700">
                      Received By
                    </label>
                    <input
                      type="text"
                      value={receiveForm.receivedBy}
                      onChange={(event) =>
                        handleReceiveFieldChange(
                          "receivedBy",
                          event.target.value
                        )
                      }
                      placeholder="Store manager"
                      className="w-full mt-1 border border-slate-200 rounded-lg px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-slate-700">
                      Status Preview
                    </label>
                    <div className="mt-1 border border-slate-200 rounded-lg px-3 py-2 text-sm bg-slate-50 text-slate-700">
                      {nextStatusPreview}
                    </div>
                  </div>
                  <div className="sm:col-span-3">
                    <label className="text-sm font-medium text-slate-700">
                      Receiving Notes
                    </label>
                    <textarea
                      value={receiveForm.notes}
                      onChange={(event) =>
                        handleReceiveFieldChange("notes", event.target.value)
                      }
                      placeholder="Delivery condition or acceptance notes."
                      className="w-full mt-1 border border-slate-200 rounded-lg px-3 py-2 text-sm min-h-[90px]"
                    />
                  </div>
                </div>

                {receiveItems.length === 0 ? (
                  <p className="text-sm text-slate-500">
                    No line items available to receive.
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-100 text-slate-600">
                        <tr>
                          <th className="p-3 text-left min-w-[160px]">Item</th>
                          <th className="p-3 text-left min-w-[100px]">Unit</th>
                          <th className="p-3 text-left min-w-[110px]">
                            Ordered
                          </th>
                          <th className="p-3 text-left min-w-[120px]">
                            Received
                          </th>
                          <th className="p-3 text-left min-w-[120px]">
                            Balance
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {receiveItems.map((item, idx) => {
                          const balance = Math.max(
                            item.orderedQty - item.receivedQty,
                            0
                          );
                          return (
                            <tr
                              key={item.id ?? item.itemId ?? `receive-${idx}`}
                              className="border-t"
                            >
                              <td className="p-3 font-medium text-slate-800">
                                {item.name || (item.itemId ? `Item ${item.itemId}` : "-")}
                              </td>
                              <td className="p-3">{item.unit || "-"}</td>
                              <td className="p-3">{item.orderedQty}</td>
                              <td className="p-3">
                                <input
                                  type="number"
                                  min="0"
                                  max={item.orderedQty}
                                  step="1"
                                  value={item.receivedQty}
                                  onChange={(event) =>
                                    handleReceiveQtyChange(
                                      item.id,
                                      event.target.value
                                    )
                                  }
                                  className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm"
                                />
                              </td>
                              <td className="p-3 text-slate-600">
                                {balance}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}

                <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between text-sm text-slate-600">
                  <div className="flex flex-wrap gap-4">
                    <span>
                      <span className="text-slate-500">Ordered:</span>{" "}
                      {totalOrderedQty}
                    </span>
                    <span>
                      <span className="text-slate-500">Received:</span>{" "}
                      {totalReceivedQty}
                    </span>
                    <span>
                      <span className="text-slate-500">Balance:</span>{" "}
                      {totalBalanceQty}
                    </span>
                  </div>
                  <button
                    type="submit"
                    disabled={saving}
                    className="px-5 py-2 rounded-lg text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700"
                  >
                    {saving ? "Saving..." : "Save Receipt"}
                  </button>
                </div>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default ReceiveGoods;
