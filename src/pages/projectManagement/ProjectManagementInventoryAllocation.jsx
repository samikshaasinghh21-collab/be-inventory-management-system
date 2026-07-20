import { createElement, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  AlertTriangle, ArrowRight, Check, ChevronLeft, ChevronRight, Clock3,
  Eye, FileCheck2, Filter, History, PackageCheck, Pencil, Plus, Printer,
  RefreshCw, Search, Send, ShieldCheck, Trash2, Truck, X,
} from "lucide-react";
import useSettings from "../../hooks/useSettings";
import { getProjectManagementProjects } from "../../services/projectManagementProjectsStore";
import { getProducts } from "../../services/productsStore";
import {
  approveInventoryAllocation, cancelInventoryAllocation,
  createInventoryAllocation, deleteInventoryAllocation,
  fetchInventoryAllocations, issueInventoryAllocation,
  rejectInventoryAllocation, submitInventoryAllocation,
  updateInventoryAllocation,
} from "../../services/inventoryAllocationsApi";
import { formatInrCurrency } from "../../utils/formatters";

const today = () => new Date().toISOString().slice(0, 10);
const emptyForm = (requester = "") => ({
  projectId: "", siteLocationId: "", warehouseLocationId: "", boqId: "",
  allocationDate: today(), priority: "Medium", requestedBy: requester,
  assignedTo: "", remarks: "", items: [],
});
const q = (value) => Number(value || 0);
const fmtQty = (value) => new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 }).format(q(value));
const fmtDate = (value) => value ? new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(value)) : "—";
const statusTone = (status) => {
  if (["Approved/Reserved", "Issued", "Closed"].includes(status)) return "bg-emerald-50 text-emerald-700 border-emerald-200";
  if (String(status).startsWith("Pending") || status === "Partially Issued") return "bg-amber-50 text-amber-700 border-amber-200";
  if (["Rejected", "Cancelled"].includes(status)) return "bg-rose-50 text-rose-700 border-rose-200";
  return "bg-slate-100 text-slate-700 border-slate-200";
};
const priorityTone = { Urgent: "text-rose-700 bg-rose-50", High: "text-orange-700 bg-orange-50", Medium: "text-blue-700 bg-blue-50", Low: "text-slate-600 bg-slate-100" };

const Field = ({ label, required, children }) => <label className="block text-sm font-medium text-slate-700">
  <span>{label}{required && <span className="text-rose-500"> *</span>}</span>
  <span className="mt-1.5 block">{children}</span>
</label>;
const inputClass = "w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100";

const localLocations = (projects) => {
  const rows = projects.map((project) => ({
    id: project.locationId || `site-${project.id}`,
    name: project.siteName || project.city || `${project.name} Site`,
    type: "Site",
    projectId: project.id,
  }));
  const warehouses = projects.flatMap((project) =>
    (project.inventoryAllocations || []).map((item) => item.storeLocation).filter(Boolean)
  );
  return [
    ...rows,
    ...Array.from(new Set(["Local Main Store", ...warehouses])).map((name) => ({
      id: `warehouse-${name.toLowerCase().replace(/\W+/g, "-")}`,
      name,
      type: "Warehouse",
      projectId: "",
    })),
  ];
};

const localBoqs = () => {
  try {
    const rows = JSON.parse(localStorage.getItem("boqs") || "[]");
    return Array.isArray(rows) ? rows : [];
  } catch {
    return [];
  }
};

const ProjectManagementInventoryAllocation = () => {
  const navigate = useNavigate();
  const settings = useSettings();
  const profileName = settings?.profile?.name || settings?.profile?.fullName || "Current User";
  const role = String(settings?.profile?.role || "Viewer");
  const normalizedRole = role.toLowerCase();
  const canApprove = ["admin", "manager", "project manager", "inventory manager"].includes(normalizedRole);
  const canIssue = canApprove || ["warehouse", "warehouse manager", "store manager"].includes(normalizedRole);
  const [allocations, setAllocations] = useState([]);
  const [projects, setProjects] = useState([]);
  const [locations, setLocations] = useState([]);
  const [boqs, setBoqs] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [tab, setTab] = useState("overview");
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState({ projectId: "", site: "", status: "", priority: "", warehouse: "", boqId: "", from: "", to: "" });
  const [modal, setModal] = useState(false);
  const [step, setStep] = useState(0);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(() => emptyForm(profileName));
  const [materialSearch, setMaterialSearch] = useState("");
  const [selected, setSelected] = useState(null);
  const [actionModal, setActionModal] = useState(null);
  const [actionRemarks, setActionRemarks] = useState("");
  const [issueQuantities, setIssueQuantities] = useState({});

  const projectMap = useMemo(() => new Map(projects.map((p) => [String(p.id), p])), [projects]);
  const locationMap = useMemo(() => new Map(locations.map((l) => [String(l.id), l])), [locations]);
  const boqMap = useMemo(() => new Map(boqs.map((b) => [String(b.id), b])), [boqs]);

  const load = async () => {
    setLoading(true); setError("");
    try {
      const projectRows = getProjectManagementProjects();
      const allocationRows = fetchInventoryAllocations();
      const locationRows = localLocations(projectRows);
      const boqRows = localBoqs();
      setAllocations(allocationRows); setProjects(projectRows); setLocations(locationRows); setBoqs(boqRows);
      setProducts(getProducts());
      if (selected) setSelected(allocationRows.find((row) => String(row.id) === String(selected.id)) || null);
    } catch (err) { setError(err?.response?.data?.error || err?.message || "Failed to load allocations."); }
    finally { setLoading(false); }
  };
  useEffect(() => {
    // Initial synchronization with the allocation API.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    const handler = () => void load(); window.addEventListener("inventory-allocations:changed", handler);
    return () => window.removeEventListener("inventory-allocations:changed", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const inventory = useMemo(() => {
    if (!form.projectId || !form.warehouseLocationId || !modal) return [];
    const project = projects.find((item) => String(item.id) === String(form.projectId));
    const productRows = products.map((product, index) => ({
      ...product,
      itemId: product.id,
      itemCode: product.itemCode || product.code || product.sku || "",
      name: product.name || product.itemName || product.productName || `Material ${index + 1}`,
      unit: product.unit || "PCS",
      rate: q(product.rate ?? product.price ?? product.unitPrice),
      availableQty: q(product.availableQty ?? product.currentStock ?? product.stock ?? product.quantity),
      sourceKey: String(product.sourceKey || product.id || product.itemCode || `product-${index + 1}`),
      sourceRef: product.itemCode || product.code || "Local product",
    }));
    const projectMaterialRows = (project?.inventoryAllocations || []).flatMap((allocation, index) => {
      const sourceItems = Array.isArray(allocation.items) ? allocation.items : [allocation];
      return sourceItems.map((item, itemIndex) => ({
        ...item,
        itemId: item.itemId || item.id,
        itemCode: item.itemCode || item.code || "",
        name: item.name || item.itemName || `Project material ${index + itemIndex + 1}`,
        unit: item.unit || "PCS",
        rate: q(item.rate),
        availableQty: q(item.availableQty ?? item.stock ?? item.requiredQty ?? item.required ?? item.remainingQty),
        sourceKey: String(item.sourceKey || item.itemCode || item.id || `project-material-${index}-${itemIndex}`),
        sourceRef: item.sourceRef || item.itemCode || "Project local stock",
      }));
    });
    const bySource = new Map();
    [...productRows, ...projectMaterialRows].forEach((item) => {
      if (!bySource.has(item.sourceKey) && item.availableQty > 0) bySource.set(item.sourceKey, item);
    });
    const reserved = new Map();
    allocations.filter((allocation) => ["Approved/Reserved", "Partially Issued"].includes(allocation.status))
      .forEach((allocation) => (allocation.items || []).forEach((item) => {
        reserved.set(item.sourceKey, q(reserved.get(item.sourceKey)) + Math.max(q(item.approvedQty) - q(item.issuedQty), 0));
      }));
    return Array.from(bySource.values()).map((item) => ({
      ...item,
      reservedQty: q(reserved.get(item.sourceKey)),
      netAvailableQty: Math.max(item.availableQty - q(reserved.get(item.sourceKey)), 0),
    })).filter((item) => item.netAvailableQty > 0);
  }, [allocations, form.projectId, form.warehouseLocationId, modal, products, projects]);

  const projectLocations = locations.filter((l) => !l.projectId || String(l.projectId) === String(form.projectId));
  const projectBoqs = boqs.filter((b) => String(b.projectId) === String(form.projectId));
  const chosenBoq = boqMap.get(String(form.boqId));
  const getBoqItem = (row) => chosenBoq?.items?.find((item) => String(item.itemId) === String(row.itemId) || String(item.name).toLowerCase() === String(row.name).toLowerCase());

  const rows = useMemo(() => allocations.filter((row) => {
    if (tab === "approvals" && !String(row.status).startsWith("Pending")) return false;
    if (filters.projectId && String(row.projectId) !== filters.projectId) return false;
    if (filters.site && String(row.siteLocationId) !== filters.site) return false;
    if (filters.status && row.status !== filters.status) return false;
    if (filters.priority && row.priority !== filters.priority) return false;
    if (filters.warehouse && String(row.warehouseLocationId) !== filters.warehouse) return false;
    if (filters.boqId && String(row.boqId) !== filters.boqId) return false;
    if (filters.from && String(row.allocationDate).slice(0, 10) < filters.from) return false;
    if (filters.to && String(row.allocationDate).slice(0, 10) > filters.to) return false;
    const haystack = [row.allocationNumber, row.requestedBy, row.assignedTo, projectMap.get(String(row.projectId))?.name, ...(row.items || []).map((i) => `${i.name} ${i.sourceRef}`)].join(" ").toLowerCase();
    return haystack.includes(search.trim().toLowerCase());
  }), [allocations, tab, filters, search, projectMap]);

  const metrics = useMemo(() => allocations.reduce((acc, row) => {
    const totals = row.totals || {}; acc.value += q(totals.value); acc.reserved += Math.max(q(totals.approvedQty) - q(totals.issuedQty), 0);
    acc.issued += q(totals.issuedQty); acc.consumed += q(totals.consumedQty); acc.returned += q(totals.returnedQty);
    if (String(row.status).startsWith("Pending")) acc.pending += 1;
    if ((row.items || []).some((i) => q(i.approvedQty) > q(i.requestedQty))) acc.conflicts += 1;
    acc.projects.add(String(row.projectId)); return acc;
  }, { value: 0, reserved: 0, pending: 0, issued: 0, consumed: 0, returned: 0, conflicts: 0, projects: new Set() }), [allocations]);

  const openCreate = () => { setEditingId(null); setForm(emptyForm(profileName)); setStep(0); setError(""); setModal(true); };
  const openEdit = (row) => { setEditingId(row.id); setForm({ ...emptyForm(profileName), ...row, projectId: String(row.projectId || ""), siteLocationId: String(row.siteLocationId || ""), warehouseLocationId: String(row.warehouseLocationId || ""), boqId: String(row.boqId || ""), allocationDate: String(row.allocationDate || today()).slice(0, 10), items: (row.items || []).map((i) => ({ ...i, requestedQty: i.requestedQty })) }); setStep(0); setModal(true); };
  const patchForm = (key, value) => setForm((prev) => ({ ...prev, [key]: value, ...(key === "projectId" ? { siteLocationId: "", warehouseLocationId: "", boqId: "", items: [] } : {}) }));
  const addMaterial = (row) => {
    if (form.items.some((i) => i.sourceKey === row.sourceKey)) return setError("This inventory source is already selected.");
    const boqItem = getBoqItem(row); const net = q(row.netAvailableQty ?? row.availableQty); const boqBalance = q(boqItem?.availableQty ?? boqItem?.quantity);
    setForm((prev) => ({ ...prev, items: [...prev.items, { ...row, boqItemId: boqItem?.id || null, requestedQty: Math.min(net, boqItem ? boqBalance : net), isUnplanned: !boqItem, justification: "" }] }));
  };
  const changeItem = (index, key, value) => setForm((prev) => ({ ...prev, items: prev.items.map((item, i) => i === index ? { ...item, [key]: value } : item) }));
  const removeItem = (index) => setForm((prev) => ({ ...prev, items: prev.items.filter((_, i) => i !== index) }));
  const validateStep = () => {
    setError("");
    if (step === 0 && (!form.projectId || !form.siteLocationId || !form.warehouseLocationId || !form.requestedBy)) return setError("Complete all required general information."), false;
    if (step === 1 && !form.items.length) return setError("Select at least one material."), false;
    if (step >= 1) for (const item of form.items) {
      if (q(item.requestedQty) <= 0) return setError(`${item.name} needs a positive quantity.`), false;
      if (q(item.requestedQty) > q(item.netAvailableQty ?? item.availableQty)) return setError(`${item.name} exceeds net available stock.`), false;
      if (item.isUnplanned && !String(item.justification || "").trim()) return setError(`${item.name} needs an unplanned-material justification.`), false;
      const bi = chosenBoq?.items?.find((b) => String(b.id) === String(item.boqItemId));
      if (bi && q(item.requestedQty) > q(bi.availableQty ?? bi.quantity)) return setError(`${item.name} exceeds the BOQ balance.`), false;
    }
    return true;
  };
  const save = async (submitAfter = false) => {
    if (!validateStep()) return; setBusy(true); setError("");
    try {
      const payload = { ...form, projectId: form.projectId, siteLocationId: form.siteLocationId, warehouseLocationId: form.warehouseLocationId, boqId: form.boqId || null, items: form.items.map((i) => ({ ...i, requestedQty: q(i.requestedQty), name: i.name })) };
      const saved = editingId ? await updateInventoryAllocation(editingId, payload) : await createInventoryAllocation(payload);
      if (submitAfter) await submitInventoryAllocation(saved.id, { performedBy: profileName, performedRole: role, remarks: "Submitted from allocation workspace" });
      setModal(false); await load();
    } catch (err) { setError(err?.response?.data?.error || err?.message || "Could not save allocation."); }
    finally { setBusy(false); }
  };
  const act = async () => {
    if (!actionModal) return; setBusy(true); setError("");
    try {
      const payload = { performedBy: profileName, performedRole: role, remarks: actionRemarks };
      if (actionModal.action === "approve") await approveInventoryAllocation(actionModal.row.id, payload);
      if (actionModal.action === "reject") await rejectInventoryAllocation(actionModal.row.id, payload);
      if (actionModal.action === "cancel") await cancelInventoryAllocation(actionModal.row.id, payload);
      if (actionModal.action === "issue") await issueInventoryAllocation(actionModal.row.id, { ...payload, issueDate: today(), items: Object.entries(issueQuantities).map(([allocationItemId, quantity]) => ({ allocationItemId, quantity: q(quantity) })).filter((item) => item.quantity > 0) });
      setActionModal(null); setActionRemarks(""); await load();
    } catch (err) { setError(err?.response?.data?.error || err?.message || "Action failed."); }
    finally { setBusy(false); }
  };
  const remove = async (row) => { if (!window.confirm(`Delete draft ${row.allocationNumber}?`)) return; try { await deleteInventoryAllocation(row.id); await load(); } catch (err) { setError(err?.response?.data?.error || err?.message); } };
  const submit = async (row) => { try { await submitInventoryAllocation(row.id, { performedBy: profileName, performedRole: role }); await load(); } catch (err) { setError(err?.response?.data?.error || err?.message); } };
  const openAction = (action, row) => {
    setActionRemarks("");
    setIssueQuantities(Object.fromEntries((row.items || []).map((item) => [item.id, Math.max(q(item.approvedQty) - q(item.issuedQty), 0)])));
    setActionModal({ action, row });
  };

  const metricCards = [
    ["Allocated value", formatInrCurrency(metrics.value), PackageCheck, "text-indigo-600 bg-indigo-50"],
    ["Reserved quantity", fmtQty(metrics.reserved), ShieldCheck, "text-violet-600 bg-violet-50"],
    ["Pending approvals", metrics.pending, Clock3, "text-amber-600 bg-amber-50"],
    ["Issued quantity", fmtQty(metrics.issued), Truck, "text-blue-600 bg-blue-50"],
    ["Consumed", fmtQty(metrics.consumed), FileCheck2, "text-emerald-600 bg-emerald-50"],
    ["Returned", fmtQty(metrics.returned), RefreshCw, "text-cyan-600 bg-cyan-50"],
    ["Stock conflicts", metrics.conflicts, AlertTriangle, "text-rose-600 bg-rose-50"],
    ["Active projects", metrics.projects.size, PackageCheck, "text-slate-600 bg-slate-100"],
  ];

  return <div className="space-y-5 pb-8">
    <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
      <div><p className="text-xs font-semibold uppercase tracking-[.25em] text-indigo-500">Project management</p><h1 className="mt-2 text-3xl font-semibold text-slate-950">Inventory Allocation</h1><p className="mt-1 text-sm text-slate-500">Reserve project materials, control approvals, and issue approved stock.</p></div>
      <button onClick={openCreate} className="inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700"><Plus size={17}/> Allocate inventory</button>
    </header>
    {error && <div className="flex items-start justify-between rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700"><span>{error}</span><button onClick={() => setError("")}><X size={16}/></button></div>}
    <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8">{metricCards.map(([label,value,MetricIcon,tone]) => <article key={label} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><span className={`grid h-9 w-9 place-items-center rounded-lg ${tone}`}>{createElement(MetricIcon, { size: 18 })}</span><p className="mt-3 text-xl font-semibold text-slate-950">{value}</p><p className="mt-1 text-xs text-slate-500">{label}</p></article>)}</section>
    <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center gap-1 border-b border-slate-200 px-4 pt-3">{[["overview","Overview"],["allocations","Allocations"],["approvals",`Approvals (${metrics.pending})`]].map(([key,label]) => <button key={key} onClick={() => setTab(key)} className={`border-b-2 px-4 py-3 text-sm font-semibold ${tab===key?"border-indigo-600 text-indigo-700":"border-transparent text-slate-500 hover:text-slate-800"}`}>{label}</button>)}</div>
      <div className="border-b border-slate-100 p-4">
        <div className="flex flex-col gap-3 xl:flex-row"><label className="relative flex-1"><Search size={16} className="absolute left-3 top-3 text-slate-400"/><input value={search} onChange={(e)=>setSearch(e.target.value)} placeholder="Search allocation, item, requester or project..." className={`${inputClass} pl-9`}/></label>
          <select value={filters.projectId} onChange={(e)=>setFilters({...filters,projectId:e.target.value})} className={inputClass}><option value="">All projects</option>{projects.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select>
          <select value={filters.status} onChange={(e)=>setFilters({...filters,status:e.target.value})} className={inputClass}><option value="">All statuses</option>{["Draft","Pending Project Manager","Pending Inventory Manager","Approved/Reserved","Partially Issued","Issued","Rejected","Cancelled"].map(s=><option key={s}>{s}</option>)}</select>
          <select value={filters.priority} onChange={(e)=>setFilters({...filters,priority:e.target.value})} className={inputClass}><option value="">All priorities</option>{["Low","Medium","High","Urgent"].map(p=><option key={p}>{p}</option>)}</select>
          <button onClick={()=>setFilters({projectId:"",site:"",status:"",priority:"",warehouse:"",boqId:"",from:"",to:""})} className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 px-3 text-sm text-slate-600"><Filter size={16}/> Clear</button>
        </div>
        <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <select value={filters.site} onChange={(e)=>setFilters({...filters,site:e.target.value})} className={inputClass}><option value="">All sites</option>{locations.filter(l=>!filters.projectId||String(l.projectId)===filters.projectId).map(l=><option key={l.id} value={l.id}>{l.name}</option>)}</select>
          <select value={filters.warehouse} onChange={(e)=>setFilters({...filters,warehouse:e.target.value})} className={inputClass}><option value="">All warehouses</option>{locations.map(l=><option key={l.id} value={l.id}>{l.name}</option>)}</select>
          <select value={filters.boqId} onChange={(e)=>setFilters({...filters,boqId:e.target.value})} className={inputClass}><option value="">All BOQs</option>{boqs.filter(b=>!filters.projectId||String(b.projectId)===filters.projectId).map(b=><option key={b.id} value={b.id}>{b.boqNumber}</option>)}</select>
          <input type="date" aria-label="From date" value={filters.from} onChange={(e)=>setFilters({...filters,from:e.target.value})} className={inputClass}/>
          <input type="date" aria-label="To date" value={filters.to} onChange={(e)=>setFilters({...filters,to:e.target.value})} className={inputClass}/>
        </div>
      </div>
      <div className="overflow-x-auto"><table className="min-w-[1200px] w-full text-left text-sm"><thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr>{["Allocation","Project / site","Materials","Requested","Reserved","Issued","Consumed / returned","Value","Priority","Status","Actions"].map(h=><th key={h} className="px-4 py-3 font-semibold">{h}</th>)}</tr></thead><tbody className="divide-y divide-slate-100">
        {loading ? <tr><td colSpan="11" className="py-16 text-center text-slate-500">Loading allocations…</td></tr> : rows.length===0 ? <tr><td colSpan="11" className="py-16 text-center"><PackageCheck className="mx-auto text-slate-300" size={36}/><p className="mt-3 font-medium text-slate-700">No allocations found</p><p className="mt-1 text-slate-500">Create a reservation or adjust the filters.</p></td></tr> : rows.map(row => <tr key={row.id} className="align-top hover:bg-slate-50/60">
          <td className="px-4 py-4"><button onClick={()=>setSelected(row)} className="font-semibold text-indigo-700 hover:underline">{row.allocationNumber}</button><p className="mt-1 text-xs text-slate-500">{fmtDate(row.allocationDate)}</p></td>
          <td className="px-4 py-4"><p className="font-medium text-slate-800">{projectMap.get(String(row.projectId))?.name||`Project ${row.projectId}`}</p><p className="mt-1 text-xs text-slate-500">{locationMap.get(String(row.siteLocationId))?.name||"—"}</p></td>
          <td className="max-w-[220px] px-4 py-4"><p className="truncate font-medium text-slate-700">{row.items?.[0]?.name||"—"}</p><p className="mt-1 text-xs text-slate-500">{row.items?.length>1?`+${row.items.length-1} more item(s)`:row.items?.[0]?.sourceRef}</p></td>
          <td className="px-4 py-4 font-medium">{fmtQty(row.totals?.requestedQty)}</td><td className="px-4 py-4">{fmtQty(Math.max(q(row.totals?.approvedQty)-q(row.totals?.issuedQty),0))}</td><td className="px-4 py-4">{fmtQty(row.totals?.issuedQty)}</td><td className="px-4 py-4"><span>{fmtQty(row.totals?.consumedQty)}</span><span className="text-slate-400"> / {fmtQty(row.totals?.returnedQty)}</span></td><td className="px-4 py-4 font-medium">{formatInrCurrency(row.totals?.value||0)}</td>
          <td className="px-4 py-4"><span className={`rounded-md px-2 py-1 text-xs font-semibold ${priorityTone[row.priority]}`}>{row.priority}</span></td><td className="px-4 py-4"><span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${statusTone(row.status)}`}>{row.status}</span></td>
          <td className="px-4 py-4"><div className="flex flex-wrap gap-1"><button title="View" onClick={()=>setSelected(row)} className="rounded-md p-2 text-slate-500 hover:bg-indigo-50 hover:text-indigo-700"><Eye size={16}/></button>{row.status==="Draft"&&<><button title="Edit" onClick={()=>openEdit(row)} className="rounded-md p-2 text-slate-500 hover:bg-slate-100"><Pencil size={16}/></button><button title="Submit" onClick={()=>submit(row)} className="rounded-md p-2 text-indigo-600 hover:bg-indigo-50"><Send size={16}/></button><button title="Delete" onClick={()=>remove(row)} className="rounded-md p-2 text-rose-500 hover:bg-rose-50"><Trash2 size={16}/></button></>}{canApprove&&String(row.status).startsWith("Pending")&&<button title="Approve" onClick={()=>openAction("approve",row)} className="rounded-md p-2 text-emerald-600 hover:bg-emerald-50"><Check size={17}/></button>}{canIssue&&["Approved/Reserved","Partially Issued"].includes(row.status)&&<button title="Issue" onClick={()=>openAction("issue",row)} className="rounded-md p-2 text-blue-600 hover:bg-blue-50"><Truck size={17}/></button>}<button title="Print" onClick={()=>window.print()} className="rounded-md p-2 text-slate-500 hover:bg-slate-100"><Printer size={16}/></button></div></td>
        </tr>)}</tbody></table></div>
    </section>

    {modal && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-3"><div className="flex max-h-[94vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
      <div className="flex items-start justify-between border-b p-5"><div><h2 className="text-xl font-semibold text-slate-950">{editingId?"Edit allocation":"Allocate inventory"}</h2><p className="mt-1 text-sm text-slate-500">Reserve materials before warehouse issue.</p></div><button onClick={()=>setModal(false)} className="rounded-lg p-2 hover:bg-slate-100"><X size={20}/></button></div>
      <div className="border-b px-5 py-3"><div className="flex items-center gap-2 overflow-x-auto">{["General information","Material selection","BOQ validation","Review"].map((label,i)=><div key={label} className="flex items-center"><span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full text-xs font-bold ${i<=step?"bg-indigo-600 text-white":"bg-slate-100 text-slate-500"}`}>{i+1}</span><span className={`ml-2 whitespace-nowrap text-sm ${i===step?"font-semibold text-indigo-700":"text-slate-500"}`}>{label}</span>{i<3&&<ArrowRight size={15} className="mx-3 text-slate-300"/>}</div>)}</div></div>
      <div className="overflow-y-auto p-5">{error&&<div className="mb-4 rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}
        {step===0&&<div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3"><Field label="Project" required><select className={inputClass} value={form.projectId} onChange={e=>patchForm("projectId",e.target.value)}><option value="">Select project</option>{projects.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></Field><Field label="Project site" required><select className={inputClass} value={form.siteLocationId} onChange={e=>patchForm("siteLocationId",e.target.value)}><option value="">Select site</option>{projectLocations.map(l=><option key={l.id} value={l.id}>{l.name} ({l.type})</option>)}</select></Field><Field label="Source warehouse" required><select className={inputClass} value={form.warehouseLocationId} onChange={e=>patchForm("warehouseLocationId",e.target.value)}><option value="">Select warehouse</option>{locations.map(l=><option key={l.id} value={l.id}>{l.name} ({l.type})</option>)}</select></Field><Field label="Allocation date" required><input type="date" className={inputClass} value={form.allocationDate} onChange={e=>patchForm("allocationDate",e.target.value)}/></Field><Field label="Priority"><select className={inputClass} value={form.priority} onChange={e=>patchForm("priority",e.target.value)}>{["Low","Medium","High","Urgent"].map(p=><option key={p}>{p}</option>)}</select></Field><Field label="BOQ"><select className={inputClass} value={form.boqId} onChange={e=>patchForm("boqId",e.target.value)}><option value="">No BOQ / unplanned</option>{projectBoqs.map(b=><option key={b.id} value={b.id}>{b.boqNumber} — {b.status}</option>)}</select></Field><Field label="Requested by" required><input className={inputClass} value={form.requestedBy} onChange={e=>patchForm("requestedBy",e.target.value)}/></Field><Field label="Assigned to"><input className={inputClass} value={form.assignedTo} onChange={e=>patchForm("assignedTo",e.target.value)} placeholder="Engineer / supervisor"/></Field><Field label="Remarks"><input className={inputClass} value={form.remarks} onChange={e=>patchForm("remarks",e.target.value)} placeholder="Purpose or work package"/></Field></div>}
        {step===1&&<div className="grid gap-5 lg:grid-cols-[1fr_1fr]"><section><div className="relative mb-3"><Search className="absolute left-3 top-3 text-slate-400" size={16}/><input className={`${inputClass} pl-9`} placeholder="Search warehouse material..." value={materialSearch} onChange={e=>setMaterialSearch(e.target.value)}/></div><div className="max-h-[430px] space-y-2 overflow-y-auto">{inventory.filter(i=>`${i.name} ${i.itemCode} ${i.sourceRef}`.toLowerCase().includes(materialSearch.toLowerCase())).map(item=><button key={item.sourceKey} onClick={()=>addMaterial(item)} className="flex w-full items-center justify-between rounded-xl border border-slate-200 p-3 text-left hover:border-indigo-300 hover:bg-indigo-50/40"><span><span className="block font-medium text-slate-800">{item.name}</span><span className="mt-1 block text-xs text-slate-500">{item.sourceRef} · {item.unit}</span></span><span className="text-right"><span className="block text-sm font-semibold text-emerald-700">{fmtQty(item.netAvailableQty)} available</span><span className="block text-xs text-slate-400">Physical {fmtQty(item.availableQty)} · Reserved {fmtQty(item.reservedQty)}</span></span></button>)}</div></section><section><h3 className="mb-3 font-semibold text-slate-900">Selected materials ({form.items.length})</h3><div className="space-y-3">{form.items.map((item,i)=><article key={item.sourceKey} className="rounded-xl border border-slate-200 p-3"><div className="flex justify-between"><div><p className="font-medium text-slate-800">{item.name}</p><p className="text-xs text-slate-500">Net available {fmtQty(item.netAvailableQty)} {item.unit}</p></div><button onClick={()=>removeItem(i)} className="text-rose-500"><Trash2 size={16}/></button></div><div className="mt-3 grid gap-3 sm:grid-cols-2"><Field label="Requested quantity"><input type="number" min="0" step="0.01" className={inputClass} value={item.requestedQty} onChange={e=>changeItem(i,"requestedQty",e.target.value)}/></Field><Field label="Planning"><select className={inputClass} value={item.isUnplanned?"unplanned":"boq"} onChange={e=>changeItem(i,"isUnplanned",e.target.value==="unplanned")}><option value="boq">BOQ linked</option><option value="unplanned">Unplanned material</option></select></Field></div>{item.isUnplanned&&<input className={`${inputClass} mt-3`} placeholder="Mandatory unplanned material justification" value={item.justification||""} onChange={e=>changeItem(i,"justification",e.target.value)}/>}</article>)}{!form.items.length&&<div className="rounded-xl border border-dashed border-slate-300 p-10 text-center text-sm text-slate-500">Select materials from available warehouse stock.</div>}</div></section></div>}
        {step===2&&<div className="overflow-x-auto"><table className="w-full min-w-[850px] text-sm"><thead className="bg-slate-50 text-left text-xs uppercase text-slate-500"><tr>{["Material","BOQ required","BOQ balance","Physical stock","Already reserved","Net available","Requested","Result"].map(h=><th key={h} className="px-3 py-3">{h}</th>)}</tr></thead><tbody className="divide-y">{form.items.map(item=>{const bi=chosenBoq?.items?.find(b=>String(b.id)===String(item.boqItemId));const ok=q(item.requestedQty)<=q(item.netAvailableQty)&&(!bi||q(item.requestedQty)<=q(bi.availableQty??bi.quantity));return <tr key={item.sourceKey}><td className="px-3 py-4 font-medium">{item.name}</td><td className="px-3">{bi?fmtQty(bi.quantity):"Unplanned"}</td><td className="px-3">{bi?fmtQty(bi.availableQty??bi.quantity):"—"}</td><td className="px-3">{fmtQty(item.availableQty)}</td><td className="px-3">{fmtQty(item.reservedQty)}</td><td className="px-3">{fmtQty(item.netAvailableQty)}</td><td className="px-3 font-semibold">{fmtQty(item.requestedQty)}</td><td className="px-3">{ok?<span className="inline-flex items-center gap-1 text-emerald-700"><Check size={15}/> Valid</span>:<span className="inline-flex items-center gap-1 text-rose-700"><AlertTriangle size={15}/> Exceeds balance</span>}</td></tr>})}</tbody></table></div>}
        {step===3&&<div className="space-y-5"><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{[["Project",projectMap.get(String(form.projectId))?.name],["Site",locationMap.get(String(form.siteLocationId))?.name],["Warehouse",locationMap.get(String(form.warehouseLocationId))?.name],["BOQ",boqMap.get(String(form.boqId))?.boqNumber||"Unplanned"]].map(([a,b])=><div key={a} className="rounded-xl bg-slate-50 p-4"><p className="text-xs uppercase text-slate-400">{a}</p><p className="mt-1 font-semibold text-slate-800">{b||"—"}</p></div>)}</div><div className="rounded-xl border border-slate-200"><div className="border-b px-4 py-3 font-semibold text-slate-900">Materials</div>{form.items.map(item=><div key={item.sourceKey} className="flex items-center justify-between border-b px-4 py-3 last:border-0"><div><p className="font-medium">{item.name}</p><p className="text-xs text-slate-500">{item.isUnplanned?"Unplanned":"BOQ linked"} · {item.sourceRef}</p></div><div className="text-right"><p className="font-semibold">{fmtQty(item.requestedQty)} {item.unit}</p><p className="text-xs text-slate-500">{formatInrCurrency(q(item.requestedQty)*q(item.rate))}</p></div></div>)}</div></div>}
      </div>
      <div className="flex items-center justify-between border-t p-4"><button disabled={step===0||busy} onClick={()=>setStep(step-1)} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-semibold disabled:opacity-40"><ChevronLeft size={16}/> Back</button><div className="flex gap-2">{step===3&&<button disabled={busy} onClick={()=>save(false)} className="rounded-lg border border-indigo-200 px-4 py-2.5 text-sm font-semibold text-indigo-700">Save draft</button>}{step<3?<button onClick={()=>validateStep()&&setStep(step+1)} className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white">Continue <ChevronRight size={16}/></button>:<button disabled={busy} onClick={()=>save(true)} className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"><Send size={16}/>{busy?"Saving…":"Save & submit"}</button>}</div></div>
    </div></div>}

    {selected&&<div className="fixed inset-0 z-40 flex justify-end bg-slate-950/30"><aside className="h-full w-full max-w-2xl overflow-y-auto bg-white shadow-2xl"><div className="sticky top-0 z-10 flex items-start justify-between border-b bg-white p-5"><div><p className="text-xs font-semibold uppercase text-indigo-500">Allocation detail</p><h2 className="mt-1 text-xl font-semibold">{selected.allocationNumber}</h2><span className={`mt-2 inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${statusTone(selected.status)}`}>{selected.status}</span></div><button onClick={()=>setSelected(null)} className="rounded-lg p-2 hover:bg-slate-100"><X size={20}/></button></div><div className="space-y-5 p-5"><div className="grid gap-3 sm:grid-cols-2"><div className="rounded-xl bg-slate-50 p-4"><p className="text-xs text-slate-400">Project</p><p className="mt-1 font-semibold">{projectMap.get(String(selected.projectId))?.name}</p><p className="mt-1 text-sm text-slate-500">{locationMap.get(String(selected.siteLocationId))?.name}</p></div><div className="rounded-xl bg-slate-50 p-4"><p className="text-xs text-slate-400">Request</p><p className="mt-1 font-semibold">{selected.requestedBy}</p><p className="mt-1 text-sm text-slate-500">{fmtDate(selected.allocationDate)} · {selected.priority}</p></div></div><section className="rounded-xl border"><h3 className="border-b px-4 py-3 font-semibold">Materials</h3>{selected.items?.map(item=><div key={item.id} className="border-b p-4 last:border-0"><div className="flex justify-between"><div><p className="font-medium">{item.name}</p><p className="text-xs text-slate-500">{item.sourceRef} · {item.unit}</p></div><p className="font-semibold">{formatInrCurrency(item.rate*item.approvedQty)}</p></div><div className="mt-3 grid grid-cols-4 gap-2 text-center text-xs"><div className="rounded-lg bg-slate-50 p-2"><b className="block text-sm">{fmtQty(item.requestedQty)}</b>Requested</div><div className="rounded-lg bg-violet-50 p-2 text-violet-700"><b className="block text-sm">{fmtQty(item.approvedQty)}</b>Approved</div><div className="rounded-lg bg-blue-50 p-2 text-blue-700"><b className="block text-sm">{fmtQty(item.issuedQty)}</b>Issued</div><div className="rounded-lg bg-emerald-50 p-2 text-emerald-700"><b className="block text-sm">{fmtQty(item.consumedQty)}</b>Consumed</div></div></div>)}</section>{selected.linkedDeliveryChallans?.length>0&&<section className="rounded-xl border"><h3 className="border-b px-4 py-3 font-semibold">Delivery challans</h3>{selected.linkedDeliveryChallans.map(dc=><button key={dc.id} onClick={()=>navigate("/inventory/delivery-challan")} className="flex w-full items-center justify-between border-b px-4 py-3 text-left last:border-0 hover:bg-slate-50"><span><b className="text-indigo-700">{dc.dcNumber}</b><span className="ml-2 text-sm text-slate-500">{fmtDate(dc.issueDate)}</span></span><ArrowRight size={16}/></button>)}</section>}<section className="rounded-xl border"><h3 className="flex items-center gap-2 border-b px-4 py-3 font-semibold"><History size={17}/> Audit timeline</h3><div className="p-4">{selected.audit?.map(entry=><div key={entry.id} className="relative border-l-2 border-slate-200 pb-5 pl-5 last:pb-0"><span className="absolute -left-[6px] top-1 h-2.5 w-2.5 rounded-full bg-indigo-500"/><p className="font-medium text-slate-800">{entry.action.replaceAll("_"," ")}</p><p className="mt-1 text-sm text-slate-500">{entry.performedBy||"System"} · {entry.performedRole||"Workflow"} · {fmtDate(entry.createdAt)}</p>{entry.remarks&&<p className="mt-1 text-sm text-slate-600">{entry.remarks}</p>}</div>)}</div></section><div className="flex flex-wrap gap-2"><button onClick={()=>navigate("/inventory/boq")} className="rounded-lg border px-3 py-2 text-sm font-semibold">View BOQ</button><button onClick={()=>navigate("/inventory/consumption")} className="rounded-lg border px-3 py-2 text-sm font-semibold">Consumption</button><button onClick={()=>navigate("/inventory/reallocation-register")} className="rounded-lg border px-3 py-2 text-sm font-semibold">Returns</button>{canApprove&&String(selected.status).startsWith("Pending")&&<><button onClick={()=>setActionModal({action:"approve",row:selected})} className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white">Approve</button><button onClick={()=>setActionModal({action:"reject",row:selected})} className="rounded-lg bg-rose-600 px-3 py-2 text-sm font-semibold text-white">Reject</button></>}{canIssue&&["Approved/Reserved","Partially Issued"].includes(selected.status)&&<button onClick={()=>setActionModal({action:"issue",row:selected})} className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white">Issue stock</button>}</div></div></aside></div>}

    {actionModal&&<div className="fixed inset-0 z-[60] grid place-items-center bg-slate-950/40 p-4"><div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl"><h3 className="text-lg font-semibold capitalize">{actionModal.action} allocation</h3><p className="mt-1 text-sm text-slate-500">{actionModal.row.allocationNumber} · {projectMap.get(String(actionModal.row.projectId))?.name}</p>{actionModal.action==="issue"&&<div className="mt-4 space-y-2 rounded-xl border p-3">{actionModal.row.items.map(item=><label key={item.id} className="flex items-center justify-between gap-3 text-sm"><span><b className="block text-slate-800">{item.name}</b><span className="text-xs text-slate-500">Reserved balance {fmtQty(Math.max(q(item.approvedQty)-q(item.issuedQty),0))} {item.unit}</span></span><input type="number" min="0" max={Math.max(q(item.approvedQty)-q(item.issuedQty),0)} step="0.01" className="w-28 rounded-lg border px-2 py-2 text-right" value={issueQuantities[item.id]??0} onChange={e=>setIssueQuantities({...issueQuantities,[item.id]:e.target.value})}/></label>)}</div>}<textarea rows="4" className={`${inputClass} mt-4`} placeholder="Remarks" value={actionRemarks} onChange={e=>setActionRemarks(e.target.value)}/><div className="mt-4 flex justify-end gap-2"><button onClick={()=>setActionModal(null)} className="rounded-lg border px-4 py-2 text-sm font-semibold">Cancel</button><button disabled={busy} onClick={act} className={`rounded-lg px-4 py-2 text-sm font-semibold text-white ${actionModal.action==="reject"?"bg-rose-600":actionModal.action==="issue"?"bg-blue-600":"bg-emerald-600"}`}>{busy?"Working…":"Confirm"}</button></div></div></div>}
  </div>;
};

export default ProjectManagementInventoryAllocation;
