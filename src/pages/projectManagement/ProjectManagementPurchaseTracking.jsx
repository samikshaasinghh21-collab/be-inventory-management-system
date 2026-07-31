import { createElement, useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  CalendarClock,
  CheckCircle2,
  ChevronRight,
  CircleDollarSign,
  ClipboardList,
  Download,
  PackageCheck,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  SlidersHorizontal,
  Trash2,
  Truck,
  UserRound,
  X,
} from "lucide-react";
import DateInput from "../../components/common/DateInput";
import useSettings from "../../hooks/useSettings";
import {
  getProjectManagementProjects,
  PROJECT_MANAGEMENT_PROJECTS_EVENT,
} from "../../services/projectManagementProjectsStore";
import {
  createLocalPurchase,
  deleteLocalPurchase,
  getPurchaseFollowUps,
  listLocalPurchases,
  PURCHASE_TRACKING_EVENT,
  refreshPurchaseTracking,
  savePurchaseFollowUp,
  updateLocalPurchase,
} from "../../services/purchaseTrackingStore";
import { formatInrCurrency } from "../../utils/formatters";

const today = () => new Date().toISOString().slice(0, 10);
const numberValue = (value) => Math.max(Number(value) || 0, 0);
const keyOf = (value) => String(value ?? "");
const followUpStatuses = ["Open", "In Progress", "Waiting on Vendor", "Escalated", "Resolved"];
const priorities = ["Low", "Medium", "High", "Critical"];
const purchaseStatuses = ["Requested", "Approved", "Ordered", "In Transit", "Partially Received", "Received", "Delayed", "Cancelled"];
const inputClass = "w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100";
const cardClass = "rounded-xl border border-slate-200 bg-white shadow-sm";

const formatDate = (value) => {
  if (!value) return "—";
  const date = new Date(`${String(value).slice(0, 10)}T00:00:00`);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
};

const formatDateTime = (value) => {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
};

const csvCell = (value) => `"${String(value ?? "").replace(/"/g, '""')}"`;

const emptyPurchaseForm = () => ({
  projectId: "",
  poNumber: "",
  vendor: "",
  itemSummary: "",
  amount: "",
  orderDate: today(),
  expectedDate: "",
  actualDelivery: "",
  status: "Requested",
  orderedQty: "",
  receivedQty: "",
  unit: "PCS",
  notes: "",
});

const toneForDelivery = (status) => ({
  Received: "border-emerald-200 bg-emerald-50 text-emerald-700",
  Partial: "border-amber-200 bg-amber-50 text-amber-700",
  Delayed: "border-rose-200 bg-rose-50 text-rose-700",
  "Due Soon": "border-orange-200 bg-orange-50 text-orange-700",
  Cancelled: "border-slate-200 bg-slate-100 text-slate-600",
  Ordered: "border-blue-200 bg-blue-50 text-blue-700",
}[status] || "border-slate-200 bg-slate-50 text-slate-700");

const toneForFollowUp = (status) => ({
  Resolved: "bg-emerald-100 text-emerald-700",
  Escalated: "bg-rose-100 text-rose-700",
  "Waiting on Vendor": "bg-amber-100 text-amber-700",
  "In Progress": "bg-blue-100 text-blue-700",
}[status] || "bg-slate-100 text-slate-700");

const priorityTone = (priority) => ({
  Critical: "bg-rose-600 text-white",
  High: "bg-orange-100 text-orange-700",
  Medium: "bg-blue-100 text-blue-700",
  Low: "bg-slate-100 text-slate-600",
}[priority] || "bg-slate-100 text-slate-600");

const Badge = ({ children, className = "" }) => (
  <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${className}`}>
    {children}
  </span>
);

const MetricCard = ({ icon, label, value, helper, tone }) => (
  <article className={`${cardClass} p-4`}>
    <div className="flex items-start justify-between gap-3">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
        <p className="mt-2 text-2xl font-bold text-slate-950">{value}</p>
        <p className="mt-1 text-xs text-slate-500">{helper}</p>
      </div>
      <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${tone}`}>
        {createElement(icon, { className: "h-5 w-5" })}
      </span>
    </div>
  </article>
);

const buildRows = ({ orders, projects, followUps }) => {
  const projectMap = new Map(projects.map((item) => [keyOf(item.id), item]));

  return orders.map((order) => {
    const orderReceipts = Array.isArray(order.receipts) ? order.receipts : [];
    const itemOrderedQty = (order.items || []).reduce(
      (sum, item) => sum + numberValue(item.quantity ?? item.orderedQty),
      0
    );
    const orderedQty = itemOrderedQty || numberValue(order.orderedQty);
    const poReceivedQty = (order.items || []).reduce(
      (sum, item) => sum + numberValue(item.totalReceivedQty ?? item.receivedQty),
      0
    );
    const latestReceipt = orderReceipts[0];
    const receiptReceivedQty = (latestReceipt?.items || []).reduce(
      (sum, item) => sum + numberValue(item.totalReceivedQty ?? item.receivedQty),
      0
    );
    const receivedQty = Math.min(
      Math.max(poReceivedQty, receiptReceivedQty, numberValue(order.receivedQty)),
      orderedQty || Infinity
    );
    const balanceQty = Math.max(orderedQty - receivedQty, 0);
    const normalizedPoStatus = String(order.status || "").toLowerCase();
    const progress = orderedQty
      ? Math.min(100, Math.round((receivedQty / orderedQty) * 100))
      : normalizedPoStatus === "received"
        ? 100
        : 0;
    const expectedDate = String(order.expectedDate || "").slice(0, 10);
    const daysUntilDelivery = expectedDate
      ? Math.ceil((new Date(`${expectedDate}T00:00:00`).getTime() - new Date(`${today()}T00:00:00`).getTime()) / 86400000)
      : null;
    let deliveryStatus = "Ordered";
    if (normalizedPoStatus.includes("cancel")) deliveryStatus = "Cancelled";
    else if (normalizedPoStatus === "received" || normalizedPoStatus === "closed" || (orderedQty > 0 && balanceQty === 0)) deliveryStatus = "Received";
    else if (normalizedPoStatus.includes("partial")) deliveryStatus = "Partial";
    else if (normalizedPoStatus === "delayed") deliveryStatus = "Delayed";
    else if (expectedDate && daysUntilDelivery < 0) deliveryStatus = "Delayed";
    else if (receivedQty > 0) deliveryStatus = "Partial";
    else if (expectedDate && daysUntilDelivery <= 7) deliveryStatus = "Due Soon";

    const followUp = followUps[keyOf(order.id)] || {
      followUpStatus: "Open",
      priority: deliveryStatus === "Delayed" ? "High" : "Medium",
      owner: "",
      nextFollowUpDate: "",
      note: "",
      history: [],
    };
    const amount = numberValue(order.amount ?? order.total) || (order.items || []).reduce(
      (sum, item) => sum + numberValue(item.totalPrice || numberValue(item.quantity) * numberValue(item.unitPrice)),
      0
    );

    return {
      ...order,
      project: projectMap.get(keyOf(order.projectId)),
      vendor: { name: order.vendor || order.vendorName || "" },
      location: { name: order.location || order.locationName || "" },
      receipts: orderReceipts,
      latestReceipt,
      orderedQty,
      receivedQty,
      balanceQty,
      progress,
      amount,
      expectedDate,
      daysUntilDelivery,
      deliveryStatus,
      followUp,
    };
  });
};

const ProjectManagementPurchaseTracking = () => {
  const settings = useSettings();
  const currentUser = settings?.profile?.name || settings?.profile?.fullName || "";
  const [orders, setOrders] = useState(() => listLocalPurchases());
  const [projects, setProjects] = useState(() => getProjectManagementProjects());
  const [followUps, setFollowUps] = useState(() => getPurchaseFollowUps());
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState("All");
  const [projectFilter, setProjectFilter] = useState("All");
  const [vendorFilter, setVendorFilter] = useState("All");
  const [ownerFilter, setOwnerFilter] = useState("All");
  const [priorityFilter, setPriorityFilter] = useState("All");
  const [selected, setSelected] = useState(null);
  const [followUpForm, setFollowUpForm] = useState(null);
  const [purchaseForm, setPurchaseForm] = useState(null);
  const [editingPurchaseId, setEditingPurchaseId] = useState(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async ({ quiet = false } = {}) => {
    if (quiet) setRefreshing(true);
    else setLoading(true);
    setError("");
    try {
      await refreshPurchaseTracking();
      setProjects(getProjectManagementProjects());
      setOrders(listLocalPurchases());
      setFollowUps(getPurchaseFollowUps());
    } catch (loadError) {
      setError(loadError?.response?.data?.error || loadError?.message || "Purchase tracking could not be loaded.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    // Initial synchronization with connected inventory services.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  useEffect(() => {
    const refreshConnected = () => load({ quiet: true });
    const refreshLocal = () => setFollowUps(getPurchaseFollowUps());
    window.addEventListener("projects:changed", refreshConnected);
    window.addEventListener(PROJECT_MANAGEMENT_PROJECTS_EVENT, refreshConnected);
    window.addEventListener(PURCHASE_TRACKING_EVENT, refreshLocal);
    return () => {
      window.removeEventListener("projects:changed", refreshConnected);
      window.removeEventListener(PROJECT_MANAGEMENT_PROJECTS_EVENT, refreshConnected);
      window.removeEventListener(PURCHASE_TRACKING_EVENT, refreshLocal);
    };
  }, [load]);

  const rows = useMemo(
    () => buildRows({ orders, projects, followUps }),
    [orders, projects, followUps]
  );

  const visibleRows = useMemo(() => rows.filter((row) => {
    if (tab === "Attention" && !["Delayed", "Due Soon"].includes(row.deliveryStatus) && !["Escalated", "Waiting on Vendor"].includes(row.followUp.followUpStatus)) return false;
    if (tab === "In Transit" && !["Ordered", "Due Soon", "Partial"].includes(row.deliveryStatus)) return false;
    if (tab === "Received" && row.deliveryStatus !== "Received") return false;
    if (projectFilter !== "All" && keyOf(row.projectId) !== projectFilter) return false;
    if (vendorFilter !== "All" && row.vendor?.name !== vendorFilter) return false;
    if (ownerFilter !== "All" && (row.followUp.owner || "Unassigned") !== ownerFilter) return false;
    if (priorityFilter !== "All" && row.followUp.priority !== priorityFilter) return false;
    const term = search.trim().toLowerCase();
    if (!term) return true;
    return [
      row.poNumber,
      row.project?.name,
      row.project?.code,
      row.vendor?.name,
      row.location?.name,
      row.status,
      row.deliveryStatus,
      row.followUp.owner,
      ...(row.items || []).map((item) => item.name),
    ].some((value) => String(value || "").toLowerCase().includes(term));
  }).sort((left, right) => {
    const rank = { Delayed: 0, "Due Soon": 1, Partial: 2, Ordered: 3, Received: 4, Cancelled: 5 };
    return (rank[left.deliveryStatus] ?? 6) - (rank[right.deliveryStatus] ?? 6)
      || String(left.expectedDate || "9999").localeCompare(String(right.expectedDate || "9999"));
  }), [rows, tab, projectFilter, vendorFilter, ownerFilter, priorityFilter, search]);

  const metrics = useMemo(() => ({
    committed: rows.filter((row) => row.deliveryStatus !== "Cancelled").reduce((sum, row) => sum + row.amount, 0),
    open: rows.filter((row) => !["Received", "Cancelled"].includes(row.deliveryStatus)).length,
    delayed: rows.filter((row) => row.deliveryStatus === "Delayed").length,
    received: rows.filter((row) => row.deliveryStatus === "Received").length,
    averageProgress: rows.length ? Math.round(rows.reduce((sum, row) => sum + row.progress, 0) / rows.length) : 0,
  }), [rows]);

  const owners = [...new Set(rows.map((row) => row.followUp.owner || "Unassigned"))].sort();
  const vendorOptions = [...new Set(rows.map((row) => row.vendor?.name).filter(Boolean))].sort();
  const openDetails = (row) => {
    setSelected(row);
    setFollowUpForm({
      followUpStatus: row.followUp.followUpStatus || "Open",
      priority: row.followUp.priority || "Medium",
      owner: row.followUp.owner || currentUser,
      nextFollowUpDate: row.followUp.nextFollowUpDate || "",
      note: "",
    });
    setError("");
    setMessage("");
  };

  useEffect(() => {
    if (!selected) return;
    const refreshed = rows.find((row) => keyOf(row.id) === keyOf(selected.id));
    // Keep the open drawer synchronized after connected or local updates.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (refreshed) setSelected(refreshed);
  }, [rows, selected]);

  const saveFollowUp = async () => {
    if (!selected || !followUpForm) return;
    if (followUpForm.nextFollowUpDate && followUpForm.followUpStatus === "Resolved") {
      setError("Resolved follow-ups should not have a next follow-up date.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const saved = await savePurchaseFollowUp(selected.id, followUpForm);
      setFollowUps(getPurchaseFollowUps());
      setFollowUpForm((current) => ({ ...current, note: "" }));
      setMessage(`Follow-up saved in the database at ${formatDateTime(saved.updatedAt)}.`);
    } catch (saveError) {
      setError(saveError?.message || "Could not save the follow-up.");
    } finally {
      setSaving(false);
    }
  };

  const openCreatePurchase = () => {
    setEditingPurchaseId(null);
    setPurchaseForm(emptyPurchaseForm());
    setSelected(null);
    setError("");
    setMessage("");
  };

  const openEditPurchase = (row) => {
    setEditingPurchaseId(row.id);
    setPurchaseForm({
      ...emptyPurchaseForm(),
      projectId: keyOf(row.projectId),
      poNumber: row.poNumber || "",
      vendor: row.vendor?.name || "",
      itemSummary: row.itemSummary || row.summary || "",
      amount: row.amount || "",
      orderDate: String(row.orderDate || today()).slice(0, 10),
      expectedDate: row.expectedDate || "",
      actualDelivery: row.actualDelivery || "",
      status: row.status || "Requested",
      orderedQty: row.orderedQty || "",
      receivedQty: row.receivedQty || "",
      unit: row.unit || "PCS",
      notes: row.notes || "",
    });
    setSelected(null);
    setError("");
    setMessage("");
  };

  const savePurchase = async () => {
    if (!purchaseForm) return;
    if (!purchaseForm.projectId || !purchaseForm.vendor.trim() || !purchaseForm.itemSummary.trim() || !purchaseForm.orderDate) {
      setError("Project, vendor, item summary, and order date are required.");
      return;
    }
    if (numberValue(purchaseForm.receivedQty) > numberValue(purchaseForm.orderedQty)) {
      setError("Received quantity cannot exceed ordered quantity.");
      return;
    }
    if (purchaseForm.expectedDate && purchaseForm.expectedDate < purchaseForm.orderDate) {
      setError("Expected delivery cannot be before the order date.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const orderedQty = numberValue(purchaseForm.orderedQty);
      const receivedQty = numberValue(purchaseForm.receivedQty);
      const payload = {
        ...purchaseForm,
        amount: numberValue(purchaseForm.amount),
        orderedQty,
        receivedQty,
        status: orderedQty > 0 && receivedQty >= orderedQty
          ? "Received"
          : receivedQty > 0
            ? "Partially Received"
            : purchaseForm.status,
        actualDelivery: orderedQty > 0 && receivedQty >= orderedQty
          ? purchaseForm.actualDelivery || today()
          : purchaseForm.actualDelivery,
      };
      if (editingPurchaseId) await updateLocalPurchase(editingPurchaseId, payload);
      else await createLocalPurchase(payload);
      await load({ quiet: true });
      setPurchaseForm(null);
      setEditingPurchaseId(null);
    } catch (saveError) {
      setError(saveError?.message || "Could not save the local purchase record.");
    } finally {
      setSaving(false);
    }
  };

  const removePurchase = async (row) => {
    if (!window.confirm(`Delete ${row.poNumber || "this purchase record"} from the database?`)) return;
    try {
      await deleteLocalPurchase(row.id);
      setSelected(null);
      await load({ quiet: true });
    } catch (deleteError) {
      setError(deleteError?.message || "Could not delete the local purchase record.");
    }
  };

  const exportCsv = () => {
    const headers = ["PO Number", "Project", "Vendor", "PO Status", "Delivery Health", "Expected Date", "Ordered Qty", "Received Qty", "Balance Qty", "Progress", "Amount", "Follow-up Status", "Priority", "Owner", "Next Follow-up"];
    const lines = visibleRows.map((row) => [
      row.poNumber || row.id,
      row.project?.name || "",
      row.vendor?.name || "",
      row.status,
      row.deliveryStatus,
      row.expectedDate,
      row.orderedQty,
      row.receivedQty,
      row.balanceQty,
      `${row.progress}%`,
      row.amount,
      row.followUp.followUpStatus,
      row.followUp.priority,
      row.followUp.owner,
      row.followUp.nextFollowUpDate,
    ].map(csvCell).join(","));
    const blob = new Blob([[headers.map(csvCell).join(","), ...lines].join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `project-purchase-tracking-${today()}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-5 pb-8">
      <section className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-indigo-500">Project Management</p>
          <h1 className="mt-2 text-2xl font-bold text-slate-950 md:text-3xl">Purchase Tracking</h1>
          <p className="mt-1 max-w-3xl text-sm text-slate-500">
            Track project purchases, delivery progress, and follow-ups with SQL-backed persistence.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => void load({ quiet: true })} disabled={refreshing} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-60">
            <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} /> Refresh
          </button>
          <button type="button" onClick={exportCsv} disabled={!visibleRows.length} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-60">
            <Download className="h-4 w-4" /> Export
          </button>
          <button type="button" onClick={openCreatePurchase} className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700">
            <Plus className="h-4 w-4" /> Add Purchase
          </button>
        </div>
      </section>

      {error && !selected && <div className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700"><AlertCircle className="h-4 w-4" />{error}</div>}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <MetricCard icon={CircleDollarSign} label="Committed Value" value={formatInrCurrency(metrics.committed)} helper={`${rows.length} purchase orders`} tone="bg-indigo-50 text-indigo-600" />
        <MetricCard icon={Truck} label="Open Deliveries" value={metrics.open} helper={`${metrics.averageProgress}% average received`} tone="bg-blue-50 text-blue-600" />
        <MetricCard icon={AlertCircle} label="Delayed" value={metrics.delayed} helper="Past expected date" tone="bg-rose-50 text-rose-600" />
        <MetricCard icon={PackageCheck} label="Fully Received" value={metrics.received} helper="No PO balance" tone="bg-emerald-50 text-emerald-600" />
        <MetricCard icon={CalendarClock} label="Needs Attention" value={rows.filter((row) => ["Delayed", "Due Soon"].includes(row.deliveryStatus) || row.followUp.followUpStatus === "Escalated").length} helper="Delivery or follow-up risk" tone="bg-amber-50 text-amber-600" />
      </section>

      <section className={cardClass}>
        <div className="border-b border-slate-100 p-4">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex flex-wrap gap-2">
              {["All", "Attention", "In Transit", "Received"].map((item) => (
                <button key={item} type="button" onClick={() => setTab(item)} className={`rounded-lg px-3.5 py-2 text-sm font-semibold transition ${tab === item ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>
                  {item}
                </button>
              ))}
            </div>
            <label className="relative w-full xl:max-w-md">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search PO, project, vendor, item or owner..." className={`${inputClass} pl-9`} />
            </label>
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-[auto_1fr_1fr_1fr_1fr]">
            <span className="inline-flex items-center gap-2 self-center text-xs font-semibold uppercase tracking-wide text-slate-500"><SlidersHorizontal className="h-4 w-4" /> Filters</span>
            <select value={projectFilter} onChange={(event) => setProjectFilter(event.target.value)} className={inputClass}><option value="All">All projects</option>{projects.map((project) => <option key={project.id} value={keyOf(project.id)}>{project.name || project.code}</option>)}</select>
            <select value={vendorFilter} onChange={(event) => setVendorFilter(event.target.value)} className={inputClass}><option value="All">All vendors</option>{vendorOptions.map((vendor) => <option key={vendor}>{vendor}</option>)}</select>
            <select value={ownerFilter} onChange={(event) => setOwnerFilter(event.target.value)} className={inputClass}><option value="All">All owners</option>{owners.map((owner) => <option key={owner}>{owner}</option>)}</select>
            <select value={priorityFilter} onChange={(event) => setPriorityFilter(event.target.value)} className={inputClass}><option value="All">All priorities</option>{priorities.map((priority) => <option key={priority}>{priority}</option>)}</select>
          </div>
        </div>

        {loading ? (
          <div className="grid min-h-[360px] place-items-center"><div className="text-center"><RefreshCw className="mx-auto h-7 w-7 animate-spin text-indigo-500"/><p className="mt-3 text-sm text-slate-500">Loading local purchase records...</p></div></div>
        ) : !visibleRows.length ? (
          <div className="grid min-h-[360px] place-items-center px-4 text-center"><div><ClipboardList className="mx-auto h-12 w-12 text-slate-300"/><h3 className="mt-4 font-semibold text-slate-900">No purchases match this view</h3><p className="mt-1 text-sm text-slate-500">Change the filters or add a local project purchase.</p><button type="button" onClick={openCreatePurchase} className="mt-4 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white">Add Purchase</button></div></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-[1220px] w-full text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr><th className="px-4 py-3 text-left">Purchase Order</th><th className="px-4 py-3 text-left">Project / Vendor</th><th className="px-4 py-3 text-left">Delivery</th><th className="px-4 py-3 text-left">Receipt Progress</th><th className="px-4 py-3 text-right">Value</th><th className="px-4 py-3 text-left">Follow-up</th><th className="px-4 py-3 text-left">Owner / Next Action</th><th className="px-4 py-3 text-right">Action</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {visibleRows.map((row) => (
                  <tr key={row.id} className="group hover:bg-slate-50/70">
                    <td className="px-4 py-4"><p className="font-semibold text-slate-950">{row.poNumber || `PO-${row.id}`}</p><p className="mt-1 text-xs text-slate-500">{formatDate(row.orderDate)} · {row.items?.length || 0} items · {row.status || "Draft"}</p></td>
                    <td className="px-4 py-4"><p className="font-medium text-slate-800">{row.project?.name || "Unlinked project"}</p><p className="mt-1 text-xs text-slate-500">{row.vendor?.name || "Vendor unavailable"}</p></td>
                    <td className="px-4 py-4"><Badge className={`border ${toneForDelivery(row.deliveryStatus)}`}>{row.deliveryStatus}</Badge><p className="mt-2 text-xs text-slate-500">ETA {formatDate(row.expectedDate)}</p></td>
                    <td className="px-4 py-4"><div className="flex items-center justify-between text-xs"><span className="font-semibold text-slate-700">{row.receivedQty} / {row.orderedQty}</span><span className="text-slate-500">{row.progress}%</span></div><div className="mt-2 h-2 w-44 overflow-hidden rounded-full bg-slate-100"><div className={`h-full rounded-full ${row.deliveryStatus === "Delayed" ? "bg-rose-500" : "bg-emerald-500"}`} style={{ width: `${row.progress}%` }}/></div><p className="mt-1.5 text-xs text-slate-500">Balance {row.balanceQty} · {row.receipts.length} receipt{row.receipts.length === 1 ? "" : "s"}</p></td>
                    <td className="px-4 py-4 text-right font-semibold text-slate-900">{formatInrCurrency(row.amount)}</td>
                    <td className="px-4 py-4"><div className="flex flex-wrap gap-1.5"><Badge className={toneForFollowUp(row.followUp.followUpStatus)}>{row.followUp.followUpStatus}</Badge><Badge className={priorityTone(row.followUp.priority)}>{row.followUp.priority}</Badge></div></td>
                    <td className="px-4 py-4"><p className="flex items-center gap-1.5 font-medium text-slate-700"><UserRound className="h-3.5 w-3.5 text-slate-400"/>{row.followUp.owner || "Unassigned"}</p><p className={`mt-1 text-xs ${row.followUp.nextFollowUpDate && row.followUp.nextFollowUpDate < today() && row.followUp.followUpStatus !== "Resolved" ? "font-semibold text-rose-600" : "text-slate-500"}`}>Next: {formatDate(row.followUp.nextFollowUpDate)}</p></td>
                    <td className="px-4 py-4 text-right"><button type="button" onClick={() => openDetails(row)} className="inline-flex items-center gap-1 rounded-lg border border-indigo-200 px-3 py-2 text-xs font-semibold text-indigo-700 hover:bg-indigo-50">Track <ChevronRight className="h-3.5 w-3.5"/></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3 text-xs text-slate-500"><span>Showing {visibleRows.length} of {rows.length} purchase records</span><span>Purchase and follow-up data is saved in SQL Server</span></div>
      </section>

      {purchaseForm && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/45 p-4 backdrop-blur-sm">
          <div className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white shadow-2xl">
            <header className="flex items-start justify-between border-b border-slate-200 px-5 py-4">
              <div><p className="text-xs font-semibold uppercase tracking-widest text-indigo-600">Project purchase</p><h2 className="mt-1 text-xl font-bold text-slate-950">{editingPurchaseId ? "Edit Purchase" : "Add Purchase"}</h2><p className="mt-1 text-sm text-slate-500">This record will be saved in SQL Server.</p></div>
              <button type="button" onClick={() => { setPurchaseForm(null); setError(""); }} className="rounded-lg border border-slate-200 p-2 text-slate-500"><X className="h-4 w-4"/></button>
            </header>
            <div className="space-y-4 p-5">
              {error && <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}
              <div className="grid gap-4 sm:grid-cols-2">
                <label><span className="mb-1 block text-xs font-medium text-slate-500">Project *</span><select value={purchaseForm.projectId} disabled={Boolean(editingPurchaseId)} onChange={(event) => setPurchaseForm((current) => ({ ...current, projectId: event.target.value }))} className={`${inputClass} disabled:bg-slate-100`}><option value="">Select project</option>{projects.map((project) => <option key={project.id} value={keyOf(project.id)}>{project.name || project.code}</option>)}</select></label>
                <label><span className="mb-1 block text-xs font-medium text-slate-500">PO Number</span><input value={purchaseForm.poNumber} onChange={(event) => setPurchaseForm((current) => ({ ...current, poNumber: event.target.value }))} placeholder="Auto-generated if blank" className={inputClass}/></label>
                <label><span className="mb-1 block text-xs font-medium text-slate-500">Vendor *</span><input value={purchaseForm.vendor} onChange={(event) => setPurchaseForm((current) => ({ ...current, vendor: event.target.value }))} placeholder="Vendor name" className={inputClass}/></label>
                <label><span className="mb-1 block text-xs font-medium text-slate-500">Status</span><select value={purchaseForm.status} onChange={(event) => setPurchaseForm((current) => ({ ...current, status: event.target.value }))} className={inputClass}>{purchaseStatuses.map((status) => <option key={status}>{status}</option>)}</select></label>
                <label className="sm:col-span-2"><span className="mb-1 block text-xs font-medium text-slate-500">Item Summary *</span><input value={purchaseForm.itemSummary} onChange={(event) => setPurchaseForm((current) => ({ ...current, itemSummary: event.target.value }))} placeholder="Materials or services covered by this purchase" className={inputClass}/></label>
                <label><span className="mb-1 block text-xs font-medium text-slate-500">Order Date *</span><DateInput value={purchaseForm.orderDate} onChange={(value) => setPurchaseForm((current) => ({ ...current, orderDate: value }))} placeholder="dd/mm/yyyy" className={inputClass}/></label>
                <label><span className="mb-1 block text-xs font-medium text-slate-500">Expected Delivery</span><DateInput value={purchaseForm.expectedDate} onChange={(value) => setPurchaseForm((current) => ({ ...current, expectedDate: value }))} placeholder="dd/mm/yyyy" className={inputClass}/></label>
                <label><span className="mb-1 block text-xs font-medium text-slate-500">Actual Delivery</span><DateInput value={purchaseForm.actualDelivery} onChange={(value) => setPurchaseForm((current) => ({ ...current, actualDelivery: value }))} placeholder="dd/mm/yyyy" className={inputClass}/></label>
                <label><span className="mb-1 block text-xs font-medium text-slate-500">Purchase Value</span><input type="number" min="0" value={purchaseForm.amount} onChange={(event) => setPurchaseForm((current) => ({ ...current, amount: event.target.value }))} placeholder="0" className={inputClass}/></label>
                <label><span className="mb-1 block text-xs font-medium text-slate-500">Ordered Quantity</span><input type="number" min="0" value={purchaseForm.orderedQty} onChange={(event) => setPurchaseForm((current) => ({ ...current, orderedQty: event.target.value }))} className={inputClass}/></label>
                <label><span className="mb-1 block text-xs font-medium text-slate-500">Received Quantity</span><input type="number" min="0" value={purchaseForm.receivedQty} onChange={(event) => setPurchaseForm((current) => ({ ...current, receivedQty: event.target.value }))} className={inputClass}/></label>
                <label><span className="mb-1 block text-xs font-medium text-slate-500">Unit</span><input value={purchaseForm.unit} onChange={(event) => setPurchaseForm((current) => ({ ...current, unit: event.target.value }))} placeholder="PCS" className={inputClass}/></label>
                <label className="sm:col-span-2"><span className="mb-1 block text-xs font-medium text-slate-500">Delivery Notes</span><textarea rows="3" value={purchaseForm.notes} onChange={(event) => setPurchaseForm((current) => ({ ...current, notes: event.target.value }))} placeholder="Dispatch details, invoice reference, delay reason, or delivery notes" className={inputClass}/></label>
              </div>
            </div>
            <footer className="flex justify-end gap-2 border-t border-slate-200 px-5 py-4"><button type="button" onClick={() => setPurchaseForm(null)} className="rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700">Cancel</button><button type="button" onClick={savePurchase} disabled={saving} className="rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60">{saving ? "Saving..." : "Save Purchase"}</button></footer>
          </div>
        </div>
      )}

      {selected && followUpForm && (
        <div className="fixed inset-0 z-50 bg-slate-950/45 backdrop-blur-sm">
          <div className="ml-auto flex h-full w-full max-w-4xl flex-col bg-white shadow-2xl">
            <header className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
              <div><p className="text-xs font-semibold uppercase tracking-widest text-indigo-600">Purchase control</p><div className="mt-1 flex flex-wrap items-center gap-2"><h2 className="text-xl font-bold text-slate-950">{selected.poNumber || `PO-${selected.id}`}</h2><Badge className={`border ${toneForDelivery(selected.deliveryStatus)}`}>{selected.deliveryStatus}</Badge></div><p className="mt-1 text-sm text-slate-500">{selected.project?.name || "Unlinked project"} · {selected.vendor?.name || "Vendor unavailable"}</p></div>
              <button type="button" onClick={() => setSelected(null)} className="rounded-lg border border-slate-200 p-2 text-slate-500 hover:bg-slate-50"><X className="h-4 w-4"/></button>
            </header>

            <div className="flex-1 space-y-5 overflow-y-auto bg-slate-50 p-5">
              {(error || message) && <div className={`rounded-lg border px-4 py-3 text-sm ${error ? "border-rose-200 bg-rose-50 text-rose-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`}>{error || message}</div>}
              <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {[["PO Value", formatInrCurrency(selected.amount)], ["Expected Delivery", formatDate(selected.expectedDate)], ["Received", `${selected.receivedQty} of ${selected.orderedQty}`], ["Balance", selected.balanceQty]].map(([label, value]) => <div key={label} className={`${cardClass} p-4`}><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p><p className="mt-2 text-lg font-bold text-slate-950">{value}</p></div>)}
              </section>

              <section className={`${cardClass} p-4`}>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><h3 className="font-semibold text-slate-900">Project purchase record</h3><p className="mt-1 text-xs text-slate-500">Purchase and delivery quantities are stored in SQL Server.</p></div><div className="flex flex-wrap gap-2"><button type="button" onClick={() => openEditPurchase(selected)} className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 px-3 py-2 text-xs font-semibold text-indigo-700"><Pencil className="h-3.5 w-3.5"/> Edit</button><button type="button" onClick={() => removePurchase(selected)} className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 px-3 py-2 text-xs font-semibold text-rose-700"><Trash2 className="h-3.5 w-3.5"/> Delete</button></div></div>
                <div className="mt-4 overflow-x-auto"><table className="min-w-[700px] w-full text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-3 py-2 text-left">Item Summary</th><th className="px-3 py-2 text-left">Unit</th><th className="px-3 py-2 text-right">Ordered</th><th className="px-3 py-2 text-right">Received</th><th className="px-3 py-2 text-right">Balance</th><th className="px-3 py-2 text-right">Value</th></tr></thead><tbody><tr><td className="px-3 py-3 font-medium text-slate-800">{selected.itemSummary || selected.summary || "Purchase materials"}</td><td className="px-3 py-3 text-slate-500">{selected.unit || "PCS"}</td><td className="px-3 py-3 text-right">{selected.orderedQty}</td><td className="px-3 py-3 text-right text-emerald-700">{selected.receivedQty}</td><td className="px-3 py-3 text-right font-semibold">{selected.balanceQty}</td><td className="px-3 py-3 text-right">{formatInrCurrency(selected.amount)}</td></tr></tbody></table></div>
              </section>

              <section className={`${cardClass} p-4`}>
                <div><h3 className="font-semibold text-slate-900">Delivery update</h3><p className="mt-1 text-xs text-slate-500">Update received quantity and actual delivery date by editing this local record.</p></div>
                <div className="mt-4 flex items-start gap-3 rounded-lg border border-slate-100 p-3"><span className={`grid h-9 w-9 shrink-0 place-items-center rounded-full ${selected.receivedQty > 0 ? "bg-emerald-50 text-emerald-600" : "bg-slate-100 text-slate-500"}`}><CheckCircle2 className="h-4 w-4"/></span><div><p className="font-semibold text-slate-800">{selected.receivedQty > 0 ? `${selected.receivedQty} ${selected.unit || "PCS"} received` : "Awaiting first delivery update"}</p><p className="mt-1 text-xs text-slate-500">Actual delivery: {formatDate(selected.actualDelivery)} · Current status: {selected.status}</p>{selected.notes && <p className="mt-2 text-sm text-slate-700">{selected.notes}</p>}</div></div>
              </section>

              <section className={`${cardClass} p-4`}>
                <div><h3 className="font-semibold text-slate-900">Purchase follow-up</h3><p className="mt-1 text-xs text-slate-500">Project-team tracking is saved in SQL Server without changing the purchase order.</p></div>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <label><span className="mb-1 block text-xs font-medium text-slate-500">Follow-up status</span><select value={followUpForm.followUpStatus} onChange={(event) => setFollowUpForm((current) => ({ ...current, followUpStatus: event.target.value, ...(event.target.value === "Resolved" ? { nextFollowUpDate: "" } : {}) }))} className={inputClass}>{followUpStatuses.map((status) => <option key={status}>{status}</option>)}</select></label>
                  <label><span className="mb-1 block text-xs font-medium text-slate-500">Priority</span><select value={followUpForm.priority} onChange={(event) => setFollowUpForm((current) => ({ ...current, priority: event.target.value }))} className={inputClass}>{priorities.map((priority) => <option key={priority}>{priority}</option>)}</select></label>
                  <label><span className="mb-1 block text-xs font-medium text-slate-500">Owner</span><input value={followUpForm.owner} onChange={(event) => setFollowUpForm((current) => ({ ...current, owner: event.target.value }))} placeholder="Person responsible" className={inputClass}/></label>
                  <label><span className="mb-1 block text-xs font-medium text-slate-500">Next follow-up</span><input type="date" value={followUpForm.nextFollowUpDate} disabled={followUpForm.followUpStatus === "Resolved"} onChange={(event) => setFollowUpForm((current) => ({ ...current, nextFollowUpDate: event.target.value }))} className={`${inputClass} disabled:bg-slate-100`}/></label>
                  <label className="sm:col-span-2"><span className="mb-1 block text-xs font-medium text-slate-500">Update note</span><textarea rows="3" value={followUpForm.note} onChange={(event) => setFollowUpForm((current) => ({ ...current, note: event.target.value }))} placeholder="Example: Vendor confirmed dispatch; vehicle number expected tomorrow." className={inputClass}/></label>
                </div>
                <div className="mt-4 flex justify-end"><button type="button" onClick={saveFollowUp} disabled={saving} className="rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60">{saving ? "Saving..." : "Save Follow-up"}</button></div>
              </section>

              <section className={`${cardClass} p-4`}>
                <h3 className="font-semibold text-slate-900">Follow-up history</h3>
                {!selected.followUp.history?.length ? <p className="mt-3 text-sm text-slate-500">No local follow-up activity yet.</p> : <div className="mt-4 space-y-4">{selected.followUp.history.map((entry) => <div key={entry.id} className="relative border-l-2 border-indigo-100 pl-4"><span className="absolute -left-[5px] top-1 h-2 w-2 rounded-full bg-indigo-500"/><div className="flex flex-wrap items-center gap-2"><Badge className={toneForFollowUp(entry.status)}>{entry.status}</Badge><span className="text-xs text-slate-500">{entry.owner || "Unassigned"} · {formatDateTime(entry.createdAt)}</span></div>{entry.note && <p className="mt-2 text-sm text-slate-700">{entry.note}</p>}</div>)}</div>}
              </section>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProjectManagementPurchaseTracking;
