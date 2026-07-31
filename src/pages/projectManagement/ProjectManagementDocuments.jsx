import { createElement, useEffect, useMemo, useState } from "react";
import {
  Archive, CheckCircle2, ChevronLeft, ChevronRight, Download, Eye, FileText,
  History, Link2, Pencil, Plus, RefreshCw, Search, Send, ShieldCheck, Tags,
  Trash2, Upload, X, XCircle,
} from "lucide-react";
import { hydrateProjectManagementProjects } from "../../services/projectManagementProjectsStore";
import {
  approveDocument,
  deleteDocument,
  downloadAuthenticatedFile,
  fetchDocumentDetails,
  fetchDocumentLinkOptions,
  fetchDocumentRevisionBlob,
  fetchDocuments,
  rejectDocument,
  restoreDocument,
  submitDocument,
  supersedeDocument,
  updateDocumentDetails,
  uploadDocument,
  uploadDocumentRevision,
} from "../../services/projectManagementApi";
import { formatDate } from "../../utils/dateFormat";

const inputClass =
  "w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100";
const cardClass = "rounded-2xl border border-slate-200 bg-white shadow-sm";
const statuses = ["Draft", "Submitted", "Approved", "Rejected", "Superseded"];
const disciplines = ["Electrical", "Civil", "Mechanical", "ELV", "IT / Network", "Safety", "Quality", "Commercial", "General"];
const confidentialityOptions = ["Public", "Internal", "Confidential", "Restricted"];
const issuePurposes = ["For Information", "For Review", "For Approval", "For Construction", "As Built", "For Record"];
const linkLabels = {
  Site: "Sites",
  Task: "Tasks",
  Milestone: "Milestones",
  DailySiteReport: "Daily Site Reports",
  BOQ: "BOQs",
  PurchaseOrder: "Purchase Orders",
  InventoryAllocation: "Inventory Allocations",
};

const emptyForm = {
  projectId: "",
  name: "",
  description: "",
  category: "Drawing",
  customCategory: "",
  discipline: "General",
  documentDate: new Date().toISOString().slice(0, 10),
  externalReference: "",
  issuePurpose: "For Information",
  responsiblePersonId: "",
  responsiblePersonName: "",
  confidentiality: "Internal",
  tagsText: "",
  links: [],
  remarks: "",
  changeSummary: "Initial issue",
  clientRevisionReference: "",
  file: null,
};

const statusTone = {
  Draft: "border-slate-200 bg-slate-100 text-slate-700",
  Submitted: "border-blue-200 bg-blue-50 text-blue-700",
  Approved: "border-emerald-200 bg-emerald-50 text-emerald-700",
  Rejected: "border-rose-200 bg-rose-50 text-rose-700",
  Superseded: "border-amber-200 bg-amber-50 text-amber-700",
};

const bytes = (value) => {
  const size = Number(value) || 0;
  if (size < 1024) return `${size} B`;
  if (size < 1024 ** 2) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 ** 2).toFixed(1)} MB`;
};

const errorText = (error, fallback) =>
  error?.response?.data?.error || error?.message || fallback;

const Badge = ({ status }) => (
  <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${statusTone[status] || statusTone.Draft}`}>
    {status}
  </span>
);

const Metric = ({ label, value, icon: Icon, tone }) => (
  <article className={`${cardClass} p-4`}>
    <span className={`grid h-10 w-10 place-items-center rounded-xl ${tone}`}>{createElement(Icon, { className: "h-5 w-5" })}</span>
    <p className="mt-3 text-2xl font-bold text-slate-950">{value}</p>
    <p className="mt-1 text-xs font-medium text-slate-500">{label}</p>
  </article>
);

const DocumentForm = ({
  form, setForm, projects, categories, permissions, options, onProjectChange,
  onSave, onClose, saving, editing,
}) => {
  const toggleLink = (type, option) => {
    const exists = form.links.some((link) => link.type === type && String(link.id) === String(option.id));
    setForm({
      ...form,
      links: exists
        ? form.links.filter((link) => !(link.type === type && String(link.id) === String(option.id)))
        : [...form.links, { type, id: String(option.id), label: option.label }],
    });
  };
  return (
    <div className="fixed inset-0 z-[80] grid place-items-center bg-slate-950/50 p-3">
      <div className="flex max-h-[95vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <header className="flex items-start justify-between border-b border-slate-200 p-5">
          <div><p className="text-xs font-semibold uppercase tracking-widest text-indigo-500">Document control</p>
            <h2 className="mt-1 text-xl font-bold text-slate-950">{editing ? "Edit document details" : "Create document"}</h2>
            <p className="mt-1 text-sm text-slate-500">{editing ? "Update metadata and linked records without replacing the file." : "Upload the controlled initial revision and its metadata."}</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><X /></button>
        </header>
        <div className="overflow-y-auto p-5">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {!editing && <label className="text-sm font-medium text-slate-700">Project *
              <select className={`${inputClass} mt-1`} value={form.projectId} onChange={(event) => onProjectChange(event.target.value)}>
                <option value="">Select project</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.name} {project.code ? `(${project.code})` : ""}</option>)}
              </select>
            </label>}
            <label className="text-sm font-medium text-slate-700">Document title *
              <input className={`${inputClass} mt-1`} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
            </label>
            <label className="text-sm font-medium text-slate-700">Category *
              <select className={`${inputClass} mt-1`} value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })}>
                {categories.map((category) => <option key={category} disabled={category === "Drawing" && !permissions.canCreateDrawing}>{category}</option>)}
              </select>
            </label>
            {form.category === "Other" && <label className="text-sm font-medium text-slate-700">Custom category *
              <input className={`${inputClass} mt-1`} value={form.customCategory} onChange={(event) => setForm({ ...form, customCategory: event.target.value })} />
            </label>}
            <label className="text-sm font-medium text-slate-700">Discipline
              <select className={`${inputClass} mt-1`} value={form.discipline} onChange={(event) => setForm({ ...form, discipline: event.target.value })}>{disciplines.map((item) => <option key={item}>{item}</option>)}</select>
            </label>
            <label className="text-sm font-medium text-slate-700">Document date
              <input type="date" className={`${inputClass} mt-1`} value={form.documentDate || ""} onChange={(event) => setForm({ ...form, documentDate: event.target.value })} />
            </label>
            <label className="text-sm font-medium text-slate-700">Issue purpose
              <select className={`${inputClass} mt-1`} value={form.issuePurpose} onChange={(event) => setForm({ ...form, issuePurpose: event.target.value })}>{issuePurposes.map((item) => <option key={item}>{item}</option>)}</select>
            </label>
            <label className="text-sm font-medium text-slate-700">External / client reference
              <input className={`${inputClass} mt-1`} value={form.externalReference} onChange={(event) => setForm({ ...form, externalReference: event.target.value })} />
            </label>
            <label className="text-sm font-medium text-slate-700">Responsible person
              <input className={`${inputClass} mt-1`} value={form.responsiblePersonName} onChange={(event) => setForm({ ...form, responsiblePersonName: event.target.value })} />
            </label>
            <label className="text-sm font-medium text-slate-700">Confidentiality
              <select className={`${inputClass} mt-1`} value={form.confidentiality} onChange={(event) => setForm({ ...form, confidentiality: event.target.value })}>{confidentialityOptions.map((item) => <option key={item}>{item}</option>)}</select>
            </label>
            <label className="text-sm font-medium text-slate-700 md:col-span-2">Tags
              <input className={`${inputClass} mt-1`} placeholder="Comma-separated tags" value={form.tagsText} onChange={(event) => setForm({ ...form, tagsText: event.target.value })} />
            </label>
            <label className="text-sm font-medium text-slate-700 md:col-span-2 lg:col-span-3">Description
              <textarea rows="3" className={`${inputClass} mt-1`} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} />
            </label>
          </div>
          {!editing && <section className="mt-5 rounded-2xl border border-slate-200 p-4">
            <h3 className="font-semibold text-slate-900">Initial revision</h3>
            <div className="mt-3 grid gap-4 md:grid-cols-2">
              <label className="text-sm font-medium text-slate-700">File * (maximum 25 MB)
                <input type="file" className={`${inputClass} mt-1`} onChange={(event) => setForm({ ...form, file: event.target.files?.[0] || null })} />
              </label>
              <label className="text-sm font-medium text-slate-700">Client revision reference
                <input className={`${inputClass} mt-1`} value={form.clientRevisionReference} onChange={(event) => setForm({ ...form, clientRevisionReference: event.target.value })} />
              </label>
              <label className="text-sm font-medium text-slate-700">Change summary
                <input className={`${inputClass} mt-1`} value={form.changeSummary} onChange={(event) => setForm({ ...form, changeSummary: event.target.value })} />
              </label>
              <label className="text-sm font-medium text-slate-700">Remarks
                <input className={`${inputClass} mt-1`} value={form.remarks} onChange={(event) => setForm({ ...form, remarks: event.target.value })} />
              </label>
            </div>
          </section>}
          <section className="mt-5 rounded-2xl border border-slate-200 p-4">
            <div className="flex items-center gap-2"><Link2 className="h-4 w-4 text-indigo-600" /><h3 className="font-semibold text-slate-900">Linked records</h3></div>
            {!form.projectId ? <p className="mt-3 text-sm text-slate-500">Select a project to load its related records.</p> :
              <div className="mt-3 grid gap-4 md:grid-cols-2 lg:grid-cols-3">{Object.entries(linkLabels).map(([type, label]) => (
                <div key={type}><p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
                  <div className="max-h-36 space-y-1 overflow-y-auto rounded-xl border border-slate-200 p-2">
                    {(options[type] || []).map((option) => <label key={option.id} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-slate-50">
                      <input type="checkbox" checked={form.links.some((link) => link.type === type && String(link.id) === String(option.id))} onChange={() => toggleLink(type, option)} />
                      <span className="truncate">{option.label}</span>
                    </label>)}
                    {!(options[type] || []).length && <p className="px-2 py-3 text-xs text-slate-400">No records</p>}
                  </div>
                </div>
              ))}</div>}
          </section>
        </div>
        <footer className="flex justify-end gap-2 border-t border-slate-200 p-4">
          <button onClick={onClose} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold">Cancel</button>
          <button disabled={saving} onClick={onSave} className="rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{saving ? "Saving…" : "Save document"}</button>
        </footer>
      </div>
    </div>
  );
};

const ProjectManagementDocuments = () => {
  const [projects, setProjects] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [categories, setCategories] = useState([]);
  const [permissions, setPermissions] = useState({});
  const [pagination, setPagination] = useState({ page: 1, pageSize: 50, total: 0 });
  const [statusCounts, setStatusCounts] = useState({});
  const [filters, setFilters] = useState({ search: "", projectId: "", category: "", status: "", discipline: "" });
  const [sort, setSort] = useState({ field: "updatedAt", direction: "desc" });
  const [form, setForm] = useState(null);
  const [linkOptions, setLinkOptions] = useState({});
  const [selected, setSelected] = useState(null);
  const [detailTab, setDetailTab] = useState("overview");
  const [revisionForm, setRevisionForm] = useState(null);
  const [preview, setPreview] = useState({ url: "", type: "", loading: false });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const load = async (page = pagination.page, activeFilters = filters) => {
    setLoading(true); setError("");
    try {
      const [projectRows, result] = await Promise.all([
        hydrateProjectManagementProjects(),
        fetchDocuments({ ...activeFilters, page, pageSize: pagination.pageSize }),
      ]);
      setProjects(projectRows);
      setDocuments(result.documents || []);
      setCategories(result.categories || []);
      setPermissions(result.permissions || {});
      setPagination(result.pagination || { page, pageSize: 50, total: 0 });
      setStatusCounts(result.statusCounts || {});
    } catch (loadError) {
      setError(errorText(loadError, "Documents could not be loaded."));
    } finally { setLoading(false); }
  };

  useEffect(() => {
    // Initial API synchronization.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => () => {
    if (preview.url) URL.revokeObjectURL(preview.url);
  }, [preview.url]);

  const sortedDocuments = useMemo(() => [...documents].sort((left, right) => {
    const a = String(left[sort.field] || "");
    const b = String(right[sort.field] || "");
    return (sort.direction === "asc" ? 1 : -1) * a.localeCompare(b, undefined, { numeric: true });
  }), [documents, sort]);

  const metrics = {
    total: pagination.total,
    draft: statusCounts.Draft || 0,
    review: statusCounts.Submitted || 0,
    approved: statusCounts.Approved || 0,
  };

  const loadOptions = async (projectId) => {
    if (!projectId) { setLinkOptions({}); return; }
    try { setLinkOptions(await fetchDocumentLinkOptions(projectId)); }
    catch (optionError) { setError(errorText(optionError, "Linked records could not be loaded.")); }
  };

  const openCreate = () => {
    const category = permissions.canCreateDrawing ? "Drawing" : "Report";
    setForm({ ...emptyForm, category });
    setLinkOptions({});
    setError(""); setMessage("");
  };

  const openDetail = async (documentId, tab = "overview") => {
    setError(""); setDetailTab(tab);
    try {
      const detail = await fetchDocumentDetails(documentId);
      setSelected(detail);
      if (tab === "preview") await showPreview(detail);
    } catch (detailError) { setError(errorText(detailError, "Document details could not be loaded.")); }
  };

  const refreshSelected = async (documentId = selected?.id) => {
    if (!documentId) return;
    const detail = await fetchDocumentDetails(documentId);
    setSelected(detail);
    await load(pagination.page);
  };

  const openEdit = async () => {
    if (!selected) return;
    await loadOptions(selected.projectId);
    setForm({
      ...emptyForm,
      ...selected,
      projectId: String(selected.projectId),
      tagsText: (selected.tags || []).join(", "),
      links: (selected.links || []).map((link) => ({ type: link.type, id: String(link.linkId), label: link.label })),
      editingId: selected.id,
      file: null,
    });
  };

  const saveForm = async () => {
    if (!form?.name.trim()) return setError("Document title is required.");
    if (!form.editingId && (!form.projectId || !form.file)) return setError("Project and initial file are required.");
    if (form.category === "Other" && !form.customCategory.trim()) return setError("Custom category is required.");
    if (form.file && form.file.size > 25 * 1024 * 1024) return setError("The file exceeds 25 MB.");
    setSaving(true); setError("");
    const payload = {
      ...form,
      tags: form.tagsText.split(",").map((tag) => tag.trim()).filter(Boolean),
    };
    try {
      const saved = form.editingId
        ? await updateDocumentDetails(form.editingId, payload)
        : (await uploadDocument(form.projectId, payload)).document;
      setForm(null);
      setMessage(form.editingId ? "Document details updated." : "Document created at R0.");
      await load(1);
      if (selected || form.editingId) setSelected(saved);
    } catch (saveError) { setError(errorText(saveError, "Document could not be saved.")); }
    finally { setSaving(false); }
  };

  const saveRevision = async () => {
    if (!revisionForm?.file) return setError("Select a revision file.");
    if (revisionForm.file.size > 25 * 1024 * 1024) return setError("The file exceeds 25 MB.");
    setSaving(true); setError("");
    try {
      await uploadDocumentRevision(selected.id, revisionForm);
      setRevisionForm(null); setMessage("New immutable revision uploaded.");
      await refreshSelected();
    } catch (revisionError) { setError(errorText(revisionError, "Revision could not be uploaded.")); }
    finally { setSaving(false); }
  };

  const workflow = async (action) => {
    if (!selected) return;
    setSaving(true); setError("");
    try {
      if (action === "submit") await submitDocument(selected.id);
      if (action === "approve") await approveDocument(selected.id);
      if (action === "reject") {
        const reason = window.prompt("Enter the rejection reason:");
        if (!reason) return;
        await rejectDocument(selected.id, reason);
      }
      if (action === "supersede") {
        const reason = window.prompt("Enter the superseding reason:");
        if (!reason) return;
        await supersedeDocument(selected.id, reason);
      }
      if (action === "restore") await restoreDocument(selected.id);
      setMessage(`Document ${action} action completed.`);
      await refreshSelected();
    } catch (workflowError) { setError(errorText(workflowError, "Workflow action failed.")); }
    finally { setSaving(false); }
  };

  const remove = async () => {
    if (!selected || !window.confirm(`Delete ${selected.documentNumber}? This remains in the audit history.`)) return;
    try {
      await deleteDocument(selected.id);
      setSelected(null); setMessage("Document removed from the active register.");
      await load(1);
    } catch (deleteError) { setError(errorText(deleteError, "Document could not be deleted.")); }
  };

  const showPreview = async (document = selected, revision = null) => {
    const target = revision || document?.revisions?.find((item) => item.revision === document.revision) || document?.revisions?.[0];
    if (!target) return;
    if (preview.url) URL.revokeObjectURL(preview.url);
    setPreview({ url: "", type: "", loading: true });
    try {
      const blob = await fetchDocumentRevisionBlob(target.id);
      setPreview({ url: URL.createObjectURL(blob), type: target.contentType || blob.type, loading: false });
      setDetailTab("preview");
    } catch (previewError) {
      setPreview({ url: "", type: "", loading: false });
      setError(errorText(previewError, "Preview could not be loaded."));
    }
  };

  const changeSort = (field) => setSort((current) => ({
    field,
    direction: current.field === field && current.direction === "asc" ? "desc" : "asc",
  }));

  return (
    <div className="space-y-5 pb-8">
      <header className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div><p className="text-xs font-semibold uppercase tracking-[0.28em] text-indigo-500">Project Management</p>
          <h1 className="mt-2 text-3xl font-bold text-slate-950">Documents</h1>
          <p className="mt-1 text-sm text-slate-500">Controlled files, immutable revisions, approvals, and links to project execution records.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => load()} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700"><RefreshCw className="h-4 w-4" /> Refresh</button>
          {permissions.canCreateSupporting && <button onClick={openCreate} className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white"><Plus className="h-4 w-4" /> Create Document</button>}
        </div>
      </header>

      {error && <div className="flex justify-between rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700"><span>{error}</span><button onClick={() => setError("")}><X className="h-4 w-4" /></button></div>}
      {message && <div className="flex justify-between rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700"><span>{message}</span><button onClick={() => setMessage("")}><X className="h-4 w-4" /></button></div>}

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="Active documents" value={metrics.total} icon={FileText} tone="bg-indigo-50 text-indigo-600" />
        <Metric label="Draft" value={metrics.draft} icon={Pencil} tone="bg-slate-100 text-slate-600" />
        <Metric label="Awaiting approval" value={metrics.review} icon={Send} tone="bg-blue-50 text-blue-600" />
        <Metric label="Approved" value={metrics.approved} icon={ShieldCheck} tone="bg-emerald-50 text-emerald-600" />
      </section>

      <section className={`${cardClass} p-4`}>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
          <label className="relative xl:col-span-2"><Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" /><input className={`${inputClass} pl-9`} placeholder="Search number, title or reference…" value={filters.search} onChange={(event) => setFilters({ ...filters, search: event.target.value })} /></label>
          <select className={inputClass} value={filters.projectId} onChange={(event) => setFilters({ ...filters, projectId: event.target.value })}><option value="">All projects</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select>
          <select className={inputClass} value={filters.category} onChange={(event) => setFilters({ ...filters, category: event.target.value })}><option value="">All categories</option>{categories.map((category) => <option key={category}>{category}</option>)}</select>
          <select className={inputClass} value={filters.status} onChange={(event) => setFilters({ ...filters, status: event.target.value })}><option value="">All statuses</option>{statuses.map((status) => <option key={status}>{status}</option>)}</select>
          <div className="flex gap-2"><button onClick={() => load(1)} className="flex-1 rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white">Apply</button><button onClick={() => { const empty = { search: "", projectId: "", category: "", status: "", discipline: "" }; setFilters(empty); void load(1, empty); }} className="rounded-xl border px-3 text-sm">Clear</button></div>
        </div>
      </section>

      <section className={`${cardClass} overflow-hidden`}>
        <div className="overflow-x-auto"><table className="min-w-[1200px] w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr>
            {[["documentNumber", "Document"], ["projectName", "Project"], ["category", "Category"], ["discipline", "Discipline"], ["revision", "Revision"], ["status", "Status"], ["updatedAt", "Updated"]].map(([field, label]) => <th key={field} className="cursor-pointer px-4 py-3 font-semibold" onClick={() => changeSort(field)}>{label}</th>)}
            <th className="px-4 py-3 font-semibold">Actions</th>
          </tr></thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? <tr><td colSpan="8" className="py-16 text-center text-slate-500">Loading controlled documents…</td></tr> :
              sortedDocuments.map((document) => <tr key={document.id} className="hover:bg-slate-50/70">
                <td className="px-4 py-4"><button onClick={() => openDetail(document.id)} className="font-semibold text-indigo-700 hover:underline">{document.documentNumber}</button><p className="mt-1 max-w-xs truncate text-xs text-slate-500">{document.name}</p></td>
                <td className="px-4 py-4"><p className="font-medium text-slate-800">{document.projectName}</p><p className="text-xs text-slate-400">{document.projectCode}</p></td>
                <td className="px-4 py-4">{document.category === "Other" ? document.customCategory : document.category}</td>
                <td className="px-4 py-4">{document.discipline || "—"}</td>
                <td className="px-4 py-4 font-semibold">{document.revisionLabel}</td>
                <td className="px-4 py-4"><Badge status={document.status} /></td>
                <td className="px-4 py-4"><p>{document.updatedBy}</p><p className="text-xs text-slate-400">{formatDate(document.updatedAt)}</p></td>
                <td className="px-4 py-4"><div className="flex gap-1">
                  <button title="Details" onClick={() => openDetail(document.id)} className="rounded-lg p-2 text-slate-500 hover:bg-indigo-50 hover:text-indigo-700"><Eye className="h-4 w-4" /></button>
                  <button title="Download current revision" onClick={() => downloadAuthenticatedFile(`/api/project-management/documents/${document.id}/download`, document.name)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><Download className="h-4 w-4" /></button>
                </div></td>
              </tr>)}
            {!loading && !documents.length && <tr><td colSpan="8" className="py-16 text-center"><FileText className="mx-auto h-10 w-10 text-slate-300" /><p className="mt-3 font-semibold text-slate-700">No documents match this view</p><p className="mt-1 text-sm text-slate-500">Change filters or create the first controlled document.</p></td></tr>}
          </tbody>
        </table></div>
        <footer className="flex items-center justify-between border-t px-4 py-3 text-sm text-slate-500"><span>{pagination.total} document(s)</span><div className="flex items-center gap-2">
          <button disabled={pagination.page <= 1} onClick={() => load(pagination.page - 1)} className="rounded-lg border p-2 disabled:opacity-40"><ChevronLeft className="h-4 w-4" /></button>
          <span>Page {pagination.page} of {Math.max(1, Math.ceil(pagination.total / pagination.pageSize))}</span>
          <button disabled={pagination.page * pagination.pageSize >= pagination.total} onClick={() => load(pagination.page + 1)} className="rounded-lg border p-2 disabled:opacity-40"><ChevronRight className="h-4 w-4" /></button>
        </div></footer>
      </section>

      {form && <DocumentForm form={form} setForm={setForm} projects={projects} categories={categories} permissions={permissions} options={linkOptions}
        onProjectChange={(projectId) => { setForm({ ...form, projectId, links: [] }); void loadOptions(projectId); }}
        onSave={saveForm} onClose={() => setForm(null)} saving={saving} editing={Boolean(form.editingId)} />}

      {revisionForm && <div className="fixed inset-0 z-[90] grid place-items-center bg-slate-950/50 p-4"><div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl">
        <header className="flex justify-between border-b p-5"><div><h2 className="text-xl font-bold">Upload revision</h2><p className="mt-1 text-sm text-slate-500">The next revision will be R{Number(selected?.revision || 0) + 1}.</p></div><button onClick={() => setRevisionForm(null)}><X /></button></header>
        <div className="space-y-4 p-5">
          <label className="block text-sm font-medium">File *<input type="file" className={`${inputClass} mt-1`} onChange={(event) => setRevisionForm({ ...revisionForm, file: event.target.files?.[0] || null })} /></label>
          <label className="block text-sm font-medium">Client revision reference<input className={`${inputClass} mt-1`} value={revisionForm.clientRevisionReference} onChange={(event) => setRevisionForm({ ...revisionForm, clientRevisionReference: event.target.value })} /></label>
          <label className="block text-sm font-medium">Change summary<input className={`${inputClass} mt-1`} value={revisionForm.changeSummary} onChange={(event) => setRevisionForm({ ...revisionForm, changeSummary: event.target.value })} /></label>
          <label className="block text-sm font-medium">Remarks<textarea className={`${inputClass} mt-1`} value={revisionForm.remarks} onChange={(event) => setRevisionForm({ ...revisionForm, remarks: event.target.value })} /></label>
        </div><footer className="flex justify-end gap-2 border-t p-4"><button onClick={() => setRevisionForm(null)} className="rounded-xl border px-4 py-2">Cancel</button><button disabled={saving} onClick={saveRevision} className="rounded-xl bg-indigo-600 px-4 py-2 font-semibold text-white">Upload revision</button></footer>
      </div></div>}

      {selected && <div className="fixed inset-0 z-[70] flex justify-end bg-slate-950/35"><aside className="flex h-full w-full max-w-4xl flex-col bg-white shadow-2xl">
        <header className="border-b bg-white p-5"><div className="flex items-start justify-between gap-3"><div><div className="flex flex-wrap items-center gap-2"><p className="text-xs font-semibold uppercase tracking-widest text-indigo-600">{selected.documentNumber}</p><Badge status={selected.status} /><span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold">{selected.revisionLabel}</span></div><h2 className="mt-2 text-2xl font-bold text-slate-950">{selected.name}</h2><p className="mt-1 text-sm text-slate-500">{selected.projectName} · {selected.category} · {selected.discipline || "General"}</p></div><button onClick={() => setSelected(null)} className="rounded-xl p-2 hover:bg-slate-100"><X /></button></div>
          <div className="mt-4 flex flex-wrap gap-2">
            <button onClick={() => downloadAuthenticatedFile(`/api/project-management/documents/${selected.id}/download`, selected.name)} className="inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold"><Download className="h-4 w-4" /> Download</button>
            {selected.canEdit && ["Draft", "Rejected"].includes(selected.status) && <button onClick={openEdit} className="inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold"><Pencil className="h-4 w-4" /> Edit</button>}
            {selected.canEdit && selected.status !== "Superseded" && <button onClick={() => setRevisionForm({ file: null, clientRevisionReference: "", changeSummary: "", remarks: "" })} className="inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold"><Upload className="h-4 w-4" /> Revision</button>}
            {selected.canEdit && ["Draft", "Rejected"].includes(selected.status) && <button disabled={saving} onClick={() => workflow("submit")} className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-3 py-2 text-sm font-semibold text-white"><Send className="h-4 w-4" /> Submit</button>}
            {selected.canApprove && selected.status === "Submitted" && <><button onClick={() => workflow("approve")} className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-3 py-2 text-sm font-semibold text-white"><CheckCircle2 className="h-4 w-4" /> Approve</button><button onClick={() => workflow("reject")} className="inline-flex items-center gap-2 rounded-xl bg-rose-600 px-3 py-2 text-sm font-semibold text-white"><XCircle className="h-4 w-4" /> Reject</button></>}
            {selected.canApprove && selected.status === "Approved" && <button onClick={() => workflow("supersede")} className="inline-flex items-center gap-2 rounded-xl bg-amber-600 px-3 py-2 text-sm font-semibold text-white"><Archive className="h-4 w-4" /> Supersede</button>}
            {selected.canApprove && ["Rejected", "Superseded"].includes(selected.status) && <button onClick={() => workflow("restore")} className="rounded-xl border px-3 py-2 text-sm font-semibold">Restore to Draft</button>}
            {selected.canDelete && <button onClick={remove} className="ml-auto inline-flex items-center gap-2 rounded-xl border border-rose-200 px-3 py-2 text-sm font-semibold text-rose-700"><Trash2 className="h-4 w-4" /> Delete</button>}
          </div>
        </header>
        <nav className="flex gap-1 overflow-x-auto border-b px-5">{[["overview", "Overview", FileText], ["links", "Linked Records", Link2], ["revisions", "Revisions", History], ["preview", "Preview", Eye], ["activity", "Activity", RefreshCw]].map(([key, label, Icon]) => <button key={key} onClick={() => { setDetailTab(key); if (key === "preview") void showPreview(); }} className={`inline-flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-semibold ${detailTab === key ? "border-indigo-600 text-indigo-700" : "border-transparent text-slate-500"}`}>{createElement(Icon, { className: "h-4 w-4" })}{label}</button>)}</nav>
        <div className="flex-1 overflow-y-auto p-5">
          {detailTab === "overview" && <div className="space-y-5"><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{[
            ["Document number", selected.documentNumber], ["Category", selected.category === "Other" ? selected.customCategory : selected.category],
            ["Discipline", selected.discipline || "—"], ["Document date", formatDate(selected.documentDate)], ["Issue purpose", selected.issuePurpose || "—"],
            ["External reference", selected.externalReference || "—"], ["Responsible person", selected.responsiblePersonName || "—"],
            ["Confidentiality", selected.confidentiality], ["Uploaded by", `${selected.uploadedBy} · ${formatDate(selected.uploadedAt)}`],
          ].map(([label, value]) => <div key={label} className="rounded-xl bg-slate-50 p-4"><p className="text-xs font-medium text-slate-400">{label}</p><p className="mt-1 font-semibold text-slate-800">{value}</p></div>)}</div>
            <section className="rounded-xl border p-4"><h3 className="font-semibold">Description</h3><p className="mt-2 whitespace-pre-wrap text-sm text-slate-600">{selected.description || "No description."}</p></section>
            <section className="rounded-xl border p-4"><div className="flex items-center gap-2"><Tags className="h-4 w-4" /><h3 className="font-semibold">Tags</h3></div><div className="mt-3 flex flex-wrap gap-2">{selected.tags?.map((tag) => <span key={tag} className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700">{tag}</span>)}{!selected.tags?.length && <span className="text-sm text-slate-400">No tags</span>}</div></section>
            {selected.rejectionReason && <section className="rounded-xl border border-rose-200 bg-rose-50 p-4"><h3 className="font-semibold text-rose-800">Rejection reason</h3><p className="mt-1 text-sm text-rose-700">{selected.rejectionReason}</p></section>}
          </div>}
          {detailTab === "links" && <div className="grid gap-4 md:grid-cols-2">{Object.entries(linkLabels).map(([type, label]) => <section key={type} className="rounded-xl border"><h3 className="border-b px-4 py-3 font-semibold">{label}</h3><div className="p-3">{selected.links?.filter((link) => link.type === type).map((link) => <div key={link.id} className="rounded-lg bg-slate-50 px-3 py-2 text-sm font-medium">{link.label}</div>)}{!selected.links?.some((link) => link.type === type) && <p className="px-2 py-3 text-sm text-slate-400">No linked records</p>}</div></section>)}</div>}
          {detailTab === "revisions" && <div className="space-y-3">{selected.revisions?.map((revision) => <article key={revision.id} className="rounded-xl border p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex items-center gap-2"><h3 className="font-bold">{revision.revisionLabel}</h3><Badge status={revision.status} /></div><p className="mt-1 text-sm text-slate-600">{revision.fileName} · {bytes(revision.fileSize)}</p><p className="mt-1 text-xs text-slate-400">{revision.uploadedBy} · {formatDate(revision.uploadedAt)}</p></div><div className="flex gap-2"><button onClick={() => showPreview(selected, revision)} className="rounded-lg border p-2"><Eye className="h-4 w-4" /></button><button onClick={() => downloadAuthenticatedFile(revision.downloadUrl, revision.fileName)} className="rounded-lg border p-2"><Download className="h-4 w-4" /></button></div></div>{revision.changeSummary && <p className="mt-3 rounded-lg bg-slate-50 p-3 text-sm">{revision.changeSummary}</p>}{revision.clientRevisionReference && <p className="mt-2 text-xs text-slate-500">Client reference: {revision.clientRevisionReference}</p>}</article>)}</div>}
          {detailTab === "preview" && <div className="grid min-h-[560px] place-items-center rounded-xl border bg-slate-50">{preview.loading ? <p className="text-slate-500">Loading preview…</p> : preview.url && preview.type.startsWith("image/") ? <img src={preview.url} alt={selected.name} className="max-h-[75vh] max-w-full object-contain" /> : preview.url && preview.type === "application/pdf" ? <iframe title={selected.name} src={preview.url} className="h-[70vh] w-full rounded-xl" /> : <div className="text-center"><FileText className="mx-auto h-12 w-12 text-slate-300" /><p className="mt-3 font-semibold text-slate-700">Inline preview is unavailable for this format.</p><button onClick={() => downloadAuthenticatedFile(`/api/project-management/documents/${selected.id}/download`, selected.name)} className="mt-3 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white">Download file</button></div>}</div>}
          {detailTab === "activity" && <div className="space-y-3">{selected.activity?.map((event) => <article key={event.id} className="flex gap-3 rounded-xl border p-4"><span className="mt-1 h-2.5 w-2.5 rounded-full bg-indigo-500" /><div><p className="font-semibold text-slate-800">{String(event.action).replaceAll(".", " ")}</p><p className="mt-1 text-sm text-slate-500">{event.actor || "System"} · {formatDate(event.createdAt)}</p></div></article>)}{!selected.activity?.length && <p className="py-12 text-center text-slate-400">No document activity recorded yet.</p>}</div>}
        </div>
      </aside></div>}
    </div>
  );
};

export default ProjectManagementDocuments;
