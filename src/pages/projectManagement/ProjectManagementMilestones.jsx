import { createElement, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  Download,
  Eye,
  Flag,
  Gauge,
  Link2,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  ShieldAlert,
  Trash2,
  X,
} from "lucide-react";
import DateInput from "../../components/common/DateInput";
import { hydrateProjectManagementProjects } from "../../services/projectManagementProjectsStore";
import {
  approveDailySiteReport,
  cancelMilestone,
  createMilestone,
  createProjectTask,
  createMilestoneRisk,
  deleteMilestone,
  deleteMilestoneRisk,
  downloadAuthenticatedFile,
  fetchArchivedMilestones,
  fetchDailySiteReports,
  fetchMilestoneDetails,
  fetchMilestones,
  openAuthenticatedFile,
  rejectDailySiteReport,
  restoreMilestone,
  setMilestoneHealthOverride,
  submitDailySiteReport,
  updateMilestone,
  updateMilestoneRisk,
} from "../../services/projectManagementApi";
import { formatDate } from "../../utils/dateFormat";

const inputClass =
  "w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100";
const cardClass = "rounded-2xl border border-slate-200 bg-white shadow-sm";
const priorities = ["All", "Low", "Medium", "High", "Critical"];
const statuses = ["All", "Pending", "Partial", "Completed", "Cancelled"];
const healthOptions = ["All", "On Track", "At Risk", "Overdue", "Completed", "Cancelled"];
const stageOptions = ["Design", "Procure", "Implement", "Allocate"];
const tabs = ["Overview", "Linked Tasks", "Actual Reports", "Documents", "Risks & Issues", "Activity"];
const emptyForm = {
  id: null,
  projectId: "",
  stage: "Design",
  name: "",
  description: "",
  priority: "Medium",
  deliverable: "",
  acceptanceCriteria: "",
  baselineStartDate: "",
  baselineTargetDate: "",
  startDate: "",
  targetDate: "",
  actualStartDate: "",
  responsiblePerson: "",
  notes: "",
  taskIds: [],
  dependencyIds: [],
  reportIds: [],
};
const emptyTask = {
  taskName: "",
  description: "",
  assignedEmployeeName: "",
  priority: "Medium",
  startDate: "",
  dueDate: "",
  status: "Pending",
  completionPercentage: 0,
  estimatedHours: "",
  dependencies: "",
  remarks: "",
};
const emptyRisk = {
  id: null,
  type: "Risk",
  severity: "Medium",
  title: "",
  description: "",
  owner: "",
  dueDate: "",
  status: "Open",
  mitigationResolution: "",
};

const tone = (value) => ({
  Completed: "bg-emerald-100 text-emerald-800",
  Approved: "bg-emerald-100 text-emerald-800",
  "On Track": "bg-emerald-100 text-emerald-800",
  Partial: "bg-blue-100 text-blue-800",
  Submitted: "bg-amber-100 text-amber-800",
  "At Risk": "bg-amber-100 text-amber-800",
  Overdue: "bg-rose-100 text-rose-800",
  Rejected: "bg-rose-100 text-rose-800",
  Critical: "bg-rose-100 text-rose-800",
  High: "bg-orange-100 text-orange-800",
  Cancelled: "bg-slate-200 text-slate-700",
  Draft: "bg-slate-100 text-slate-700",
}[value] || "bg-indigo-50 text-indigo-700");

const Badge = ({ children }) => (
  <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${tone(children)}`}>
    {children}
  </span>
);

const Kpi = ({ label, value, icon, style }) => (
  <div className={`${cardClass} flex items-center gap-3 p-4`}>
    <div className={`grid h-10 w-10 place-items-center rounded-xl ${style}`}>
      {createElement(icon, { className: "h-5 w-5" })}
    </div>
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className="text-2xl font-bold text-slate-950">{value}</p>
    </div>
  </div>
);

const Progress = ({ value }) => (
  <div className="flex min-w-32 items-center gap-2">
    <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-200">
      <div className="h-full rounded-full bg-indigo-600" style={{ width: `${Math.min(100, Number(value) || 0)}%` }} />
    </div>
    <span className="text-xs font-semibold text-slate-700">{Number(value) || 0}%</span>
  </div>
);

const DetailField = ({ label, children }) => (
  <div>
    <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</p>
    <div className="mt-1 text-sm text-slate-800">{children || "—"}</div>
  </div>
);

const RowList = ({ title, rows = [], render }) => (
  <div>
    <h4 className="mb-2 text-sm font-bold text-slate-900">{title}</h4>
    {!rows.length ? (
      <p className="rounded-xl bg-slate-50 p-3 text-sm text-slate-500">No information recorded.</p>
    ) : (
      <div className="space-y-2">{rows.map(render)}</div>
    )}
  </div>
);

const ProjectManagementMilestones = () => {
  const navigate = useNavigate();
  const [projects, setProjects] = useState([]);
  const [reports, setReports] = useState([]);
  const [milestones, setMilestones] = useState([]);
  const [archived, setArchived] = useState([]);
  const [showArchive, setShowArchive] = useState(false);
  const [summary, setSummary] = useState({});
  const [form, setForm] = useState(null);
  const [detail, setDetail] = useState(null);
  const [riskForm, setRiskForm] = useState(null);
  const [taskForm, setTaskForm] = useState(null);
  const [activeTab, setActiveTab] = useState("Overview");
  const [search, setSearch] = useState("");
  const [projectFilter, setProjectFilter] = useState("All");
  const [statusFilter, setStatusFilter] = useState("All");
  const [healthFilter, setHealthFilter] = useState("All");
  const [priorityFilter, setPriorityFilter] = useState("All");
  const [stageFilter, setStageFilter] = useState("All");
  const [ownerFilter, setOwnerFilter] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const [projectRows, reportRows, response, archivedRows] = await Promise.all([
        hydrateProjectManagementProjects(),
        fetchDailySiteReports(),
        fetchMilestones({ pageSize: 100 }),
        fetchArchivedMilestones().catch(() => []),
      ]);
      setProjects(projectRows);
      setReports(reportRows);
      setMilestones(response.milestones || []);
      setArchived(archivedRows);
      setSummary(response.summary || {});
      setError("");
    } catch (loadError) {
      setError(loadError?.response?.data?.error || loadError.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Data-loading effect updates state after API promises settle.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, []);

  const selectedProject = projects.find((project) => String(project.id) === String(form?.projectId));
  const projectReports = reports.filter((report) => String(report.projectId) === String(form?.projectId));
  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return milestones.filter((item) => {
      if (projectFilter !== "All" && String(item.projectId) !== projectFilter) return false;
      if (statusFilter !== "All" && item.status !== statusFilter) return false;
      if (healthFilter !== "All" && item.health !== healthFilter) return false;
      if (priorityFilter !== "All" && item.priority !== priorityFilter) return false;
      if (stageFilter !== "All" && item.stage !== stageFilter) return false;
      if (ownerFilter && !String(item.responsiblePerson || "").toLowerCase().includes(ownerFilter.toLowerCase())) return false;
      if (fromDate && String(item.targetDate || "").slice(0, 10) < fromDate) return false;
      if (toDate && String(item.targetDate || "").slice(0, 10) > toDate) return false;
      return !term || [
        item.milestoneNumber, item.name, item.projectName, item.deliverable, item.responsiblePerson,
      ].some((value) => String(value || "").toLowerCase().includes(term));
    });
  }, [milestones, search, projectFilter, statusFilter, healthFilter, priorityFilter, stageFilter, ownerFilter, fromDate, toDate]);

  const refreshDetail = async (id = detail?.id) => {
    if (!id) return;
    const next = await fetchMilestoneDetails(id);
    setDetail(next);
    return next;
  };

  const openDetail = async (item) => {
    setBusy(true);
    setError("");
    try {
      setDetail(await fetchMilestoneDetails(item.id));
      setActiveTab("Overview");
    } catch (openError) {
      setError(openError?.response?.data?.error || openError.message);
    } finally {
      setBusy(false);
    }
  };

  const openEdit = (item) => {
    const source = detail?.id === item.id ? detail : item;
    setForm({
      ...emptyForm,
      ...source,
      projectId: source.projectId,
      taskIds: source.taskIds || [],
      dependencyIds: (source.dependencies || []).map((dependency) => dependency.id),
      reportIds: (source.reports || []).filter((report) => report.associationSources?.includes("Explicit")).map((report) => report.id),
    });
  };

  const run = async (callback, success, refreshId = detail?.id) => {
    setBusy(true);
    setError("");
    try {
      await callback();
      setMessage(success);
      await load();
      if (refreshId) await refreshDetail(refreshId);
    } catch (actionError) {
      setError(actionError?.response?.data?.error || actionError.message);
    } finally {
      setBusy(false);
    }
  };

  const saveMilestone = async () => {
    if (!form.projectId || !String(form.name || "").trim()) return setError("Project and milestone name are required.");
    if (form.startDate && form.targetDate && form.targetDate < form.startDate) return setError("Target date cannot be before start date.");
    setBusy(true);
    try {
      const response = form.id
        ? await updateMilestone(form.id, form)
        : await createMilestone(form.projectId, form);
      setForm(null);
      setMessage(form.id ? "Milestone updated." : "Milestone created.");
      await load();
      if (detail?.id === response.milestone?.id) setDetail(response.milestone);
    } catch (saveError) {
      setError(saveError?.response?.data?.error || saveError.message);
    } finally {
      setBusy(false);
    }
  };

  const saveRisk = async () => {
    if (!riskForm?.title?.trim()) return setError("Risk or issue title is required.");
    await run(
      () => riskForm.id
        ? updateMilestoneRisk(detail.id, riskForm.id, riskForm)
        : createMilestoneRisk(detail.id, riskForm),
      riskForm.id ? "Risk or issue updated." : "Risk or issue added.",
    );
    setRiskForm(null);
  };

  const saveTask = async () => {
    if (!taskForm?.taskName?.trim()) return setError("Task name is required.");
    if (!taskForm?.dueDate) return setError("Task due date is required.");
    if (taskForm.startDate && taskForm.dueDate < taskForm.startDate) return setError("Task due date cannot be before its start date.");
    setBusy(true);
    setError("");
    try {
      await createProjectTask(detail.projectId, {
        ...taskForm,
        milestoneId: detail.id,
        assignedTo: taskForm.assignedEmployeeName,
      });
      setTaskForm(null);
      setMessage(`Task created under ${detail.name}.`);
      await load();
      await refreshDetail(detail.id);
      setActiveTab("Linked Tasks");
    } catch (saveError) {
      setError(saveError?.response?.data?.error || saveError.message);
    } finally {
      setBusy(false);
    }
  };

  const reportAction = (action, report) => {
    if (action === "submit") {
      return run(() => submitDailySiteReport(report.id), `${report.reportNumber} submitted.`);
    }
    if (action === "approve") {
      const managerRemarks = window.prompt("Manager remarks (optional):", report.managerRemarks || "");
      if (managerRemarks === null) return;
      return run(() => approveDailySiteReport(report.id, { managerRemarks }), `${report.reportNumber} approved.`);
    }
    const reason = window.prompt("Rejection reason:");
    if (!reason) return;
    return run(() => rejectDailySiteReport(report.id, { reason }), `${report.reportNumber} rejected.`);
  };

  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[.28em] text-indigo-500">Project Management</p>
          <h1 className="mt-2 text-3xl font-bold text-slate-950">Milestone Control Center</h1>
          <p className="mt-1 text-sm text-slate-500">Project checkpoints with task-derived progress and actual site-report evidence.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowArchive(true)} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold">
            <Trash2 className="h-4 w-4" /> Archived ({archived.length})
          </button>
          <button onClick={() => void load()} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold">
            <RefreshCw className="h-4 w-4" /> Refresh
          </button>
          <button onClick={() => setForm({ ...emptyForm })} className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white">
            <Plus className="h-4 w-4" /> Add Milestone
          </button>
        </div>
      </header>

      {(error || message) && (
        <div className={`rounded-xl border px-4 py-3 text-sm ${error ? "border-rose-200 bg-rose-50 text-rose-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`}>
          {error || message}
        </div>
      )}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Kpi label="Milestones" value={summary.total || 0} icon={Flag} style="bg-indigo-50 text-indigo-600" />
        <Kpi label="Completed" value={summary.completed || 0} icon={CheckCircle2} style="bg-emerald-50 text-emerald-600" />
        <Kpi label="At Risk" value={summary.atRisk || 0} icon={ShieldAlert} style="bg-amber-50 text-amber-600" />
        <Kpi label="Overdue" value={summary.overdue || 0} icon={AlertTriangle} style="bg-rose-50 text-rose-600" />
        <Kpi label="Avg. Project Progress" value={`${summary.averageProjectProgress || 0}%`} icon={Gauge} style="bg-blue-50 text-blue-600" />
      </section>

      <section className={`${cardClass} p-4`}>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-9">
          <label className="relative xl:col-span-2">
            <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
            <input className={`${inputClass} pl-9`} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search milestone, project, owner..." />
          </label>
          <select className={inputClass} value={projectFilter} onChange={(event) => setProjectFilter(event.target.value)}>
            <option value="All">All Projects</option>
            {projects.map((project) => <option key={project.id} value={String(project.id)}>{project.name}</option>)}
          </select>
          <select className={inputClass} value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
            {statuses.map((status) => <option key={status}>{status === "All" ? "All Statuses" : status}</option>)}
          </select>
          <select className={inputClass} value={healthFilter} onChange={(event) => setHealthFilter(event.target.value)}>
            {healthOptions.map((health) => <option key={health}>{health === "All" ? "All Health" : health}</option>)}
          </select>
          <select className={inputClass} value={priorityFilter} onChange={(event) => setPriorityFilter(event.target.value)}>
            {priorities.map((priority) => <option key={priority}>{priority === "All" ? "All Priorities" : priority}</option>)}
          </select>
          <select className={inputClass} value={stageFilter} onChange={(event) => setStageFilter(event.target.value)}>
            <option value="All">All Stages</option>
            {stageOptions.map((stage) => <option key={stage}>{stage}</option>)}
          </select>
          <input className={inputClass} value={ownerFilter} onChange={(event) => setOwnerFilter(event.target.value)} placeholder="Owner" />
          <div className="grid grid-cols-2 gap-2">
            <DateInput value={fromDate} onChange={setFromDate} />
            <DateInput value={toDate} onChange={setToDate} />
          </div>
        </div>
      </section>

      <section className={`${cardClass} overflow-hidden`}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1180px] text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="p-4">Milestone</th><th className="p-4">Project</th><th className="p-4">Stage</th><th className="p-4">Responsible</th>
                <th className="p-4">Target</th><th className="p-4">Linked records</th><th className="p-4">Progress</th>
                <th className="p-4">Status</th><th className="p-4">Health</th><th className="p-4">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((item) => (
                <tr key={item.id} className="hover:bg-slate-50/70">
                  <td className="p-4">
                    <button onClick={() => void openDetail(item)} className="text-left">
                      <p className="text-xs font-semibold text-indigo-600">{item.milestoneNumber}</p>
                      <p className="font-bold text-slate-900">{item.name}</p>
                      <p className="max-w-64 truncate text-xs text-slate-500">{item.deliverable || item.description}</p>
                    </button>
                  </td>
                  <td className="p-4">{item.projectName}</td>
                  <td className="p-4"><Badge>{item.stage || "Implement"}</Badge></td>
                  <td className="p-4">{item.responsiblePerson || "Unassigned"}</td>
                  <td className="p-4">{formatDate(item.targetDate)}</td>
                  <td className="p-4 text-xs text-slate-600">{item.taskCount} tasks · {item.reportCount} reports · {item.documentCount} docs</td>
                  <td className="p-4"><Progress value={item.progress} /></td>
                  <td className="p-4"><Badge>{item.status}</Badge></td>
                  <td className="p-4"><Badge>{item.health}</Badge><p className="mt-1 max-w-48 text-xs text-slate-400">{item.healthReason}</p></td>
                  <td className="p-4">
                    <div className="flex gap-1">
                      <button onClick={() => void openDetail(item)} className="rounded-lg border p-2" title="View"><Eye className="h-4 w-4" /></button>
                      <button onClick={() => openEdit(item)} className="rounded-lg border p-2" title="Edit"><Pencil className="h-4 w-4" /></button>
                      <button onClick={() => {
                        if (window.confirm(`Archive ${item.name}?`)) void run(() => deleteMilestone(item.id), "Milestone archived.", null);
                      }} className="rounded-lg border border-rose-200 p-2 text-rose-600" title="Archive"><Trash2 className="h-4 w-4" /></button>
                    </div>
                  </td>
                </tr>
              ))}
              {!loading && !filtered.length && <tr><td colSpan="10" className="p-14 text-center text-slate-500">No milestones match the selected filters.</td></tr>}
              {loading && <tr><td colSpan="10" className="p-14 text-center text-slate-500">Loading milestone control center…</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      {detail && (
        <div className="fixed inset-0 z-[75] bg-slate-950/45">
          <aside className="ml-auto flex h-full w-full max-w-6xl flex-col bg-slate-50 shadow-2xl">
            <header className="border-b border-slate-200 bg-white p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-bold text-indigo-600">{detail.milestoneNumber} · {detail.projectName}</p>
                  <h2 className="mt-1 text-2xl font-bold text-slate-950">{detail.name}</h2>
                  <div className="mt-2 flex flex-wrap gap-2"><Badge>{detail.stage || "Implement"}</Badge><Badge>{detail.status}</Badge><Badge>{detail.health}</Badge><Badge>{detail.priority}</Badge></div>
                </div>
                <div className="flex gap-2">
                  {detail.permissions?.canManage && <button onClick={() => openEdit(detail)} className="rounded-xl border p-2.5"><Pencil className="h-4 w-4" /></button>}
                  <button onClick={() => setDetail(null)} className="rounded-xl border p-2.5"><X className="h-4 w-4" /></button>
                </div>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-4">
                <div><p className="text-xs text-slate-500">Milestone progress</p><Progress value={detail.progress} /></div>
                <DetailField label="Target date">{formatDate(detail.targetDate)}</DetailField>
                <DetailField label="Responsible">{detail.responsiblePerson}</DetailField>
                <DetailField label="Project progress">{detail.projectProgress}%</DetailField>
              </div>
              <nav className="mt-5 flex gap-1 overflow-x-auto">
                {tabs.map((tab) => (
                  <button key={tab} onClick={() => setActiveTab(tab)} className={`whitespace-nowrap rounded-lg px-3 py-2 text-sm font-semibold ${activeTab === tab ? "bg-indigo-600 text-white" : "text-slate-600 hover:bg-slate-100"}`}>
                    {tab}
                  </button>
                ))}
              </nav>
            </header>

            <div className="flex-1 overflow-y-auto p-5">
              {activeTab === "Overview" && (
                <div className="grid gap-4 lg:grid-cols-3">
                  <section className={`${cardClass} space-y-5 p-5 lg:col-span-2`}>
                    <div className="grid gap-5 sm:grid-cols-2">
                      <DetailField label="Deliverable">{detail.deliverable}</DetailField>
                      <DetailField label="Acceptance criteria">{detail.acceptanceCriteria}</DetailField>
                      <DetailField label="Description">{detail.description}</DetailField>
                      <DetailField label="Notes">{detail.notes}</DetailField>
                    </div>
                    <div className="grid gap-4 border-t pt-5 sm:grid-cols-3">
                      <DetailField label="Baseline">{formatDate(detail.baselineStartDate)} → {formatDate(detail.baselineTargetDate)}</DetailField>
                      <DetailField label="Current plan">{formatDate(detail.startDate)} → {formatDate(detail.targetDate)}</DetailField>
                      <DetailField label="Actual">{formatDate(detail.actualStartDate)} → {formatDate(detail.actualCompletionDate)}</DetailField>
                    </div>
                    <RowList title="Dependencies" rows={detail.dependencies} render={(dependency) => (
                      <div key={dependency.id} className="flex items-center gap-2 rounded-xl border p-3 text-sm">
                        <Link2 className="h-4 w-4 text-indigo-500" /> {dependency.milestoneNumber} — {dependency.name}
                      </div>
                    )} />
                  </section>
                  <section className={`${cardClass} space-y-4 p-5`}>
                    <div>
                      <p className="text-xs font-semibold uppercase text-slate-400">Schedule health</p>
                      <div className="mt-2"><Badge>{detail.health}</Badge></div>
                      <p className="mt-2 text-sm text-slate-600">{detail.healthReason}</p>
                      {detail.healthOverride && <p className="mt-2 rounded-lg bg-amber-50 p-2 text-xs text-amber-800">Override: {detail.healthOverrideReason}</p>}
                    </div>
                    {detail.permissions?.canManage && (
                      <>
                        <button onClick={() => {
                          const health = window.prompt("Health override: On Track, At Risk, or Overdue", detail.healthOverride || detail.health);
                          if (!health) return;
                          const reason = window.prompt("Reason for override:");
                          if (!reason) return;
                          void run(() => setMilestoneHealthOverride(detail.id, health, reason), "Health override saved.");
                        }} className="w-full rounded-xl border px-3 py-2 text-sm font-semibold">Override health</button>
                        {detail.healthOverride && <button onClick={() => void run(() => setMilestoneHealthOverride(detail.id, null, null), "Health override cleared.")} className="w-full rounded-xl border px-3 py-2 text-sm font-semibold">Clear override</button>}
                        {detail.status !== "Cancelled" && <button onClick={() => {
                          const reason = window.prompt("Cancellation reason:");
                          if (reason) void run(() => cancelMilestone(detail.id, reason), "Milestone cancelled.");
                        }} className="w-full rounded-xl border border-rose-200 px-3 py-2 text-sm font-semibold text-rose-700">Cancel milestone</button>}
                      </>
                    )}
                  </section>
                </div>
              )}

              {activeTab === "Linked Tasks" && (
                <div className="space-y-3">
                  {detail.permissions?.canManage && detail.status !== "Cancelled" && (
                    <div className="flex justify-end">
                      <button onClick={() => setTaskForm({ ...emptyTask, startDate: String(detail.startDate || "").slice(0, 10), dueDate: String(detail.targetDate || "").slice(0, 10) })} className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white">
                        <Plus className="h-4 w-4" /> Create Task under Milestone
                      </button>
                    </div>
                  )}
                  {(detail.tasks || []).map((task) => (
                    <section key={task.id} className={`${cardClass} grid gap-4 p-4 md:grid-cols-6 md:items-center`}>
                      <div className="md:col-span-2"><p className="font-bold">{task.taskName}</p><p className="text-xs text-slate-500">{task.description}</p></div>
                      <div><p className="text-xs text-slate-400">Assignee</p><p className="text-sm">{task.assignedEmployeeName || "Unassigned"}</p></div>
                      <div><p className="text-xs text-slate-400">Due</p><p className="text-sm">{formatDate(task.dueDate)}</p></div>
                      <div><Badge>{task.status}</Badge><div className="mt-2"><Progress value={task.progress} /></div></div>
                      <button onClick={() => navigate("/project-management/tasks")} className="rounded-xl border px-3 py-2 text-sm font-semibold">Task history <ChevronRight className="ml-1 inline h-4 w-4" /></button>
                      {task.remainingWorkRemarks && <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800 md:col-span-6">Remaining work: {task.remainingWorkRemarks}</p>}
                    </section>
                  ))}
                  {!detail.tasks?.length && <p className={`${cardClass} p-12 text-center text-slate-500`}>No tasks are linked to this milestone.</p>}
                </div>
              )}

              {activeTab === "Actual Reports" && (
                <div className="space-y-4">
                  {(detail.reports || []).map((report) => (
                    <section key={report.id} className={`${cardClass} overflow-hidden`}>
                      <div className="flex flex-col gap-3 border-b p-4 md:flex-row md:items-center md:justify-between">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-bold">{report.reportNumber}</p><Badge>{report.status}</Badge>
                            {report.officialEvidence && <span className="rounded-full bg-emerald-600 px-2.5 py-1 text-xs font-bold text-white">Official evidence</span>}
                            {(report.associationSources || []).map((source) => <span key={source} className="rounded-full bg-indigo-50 px-2 py-1 text-xs text-indigo-700">{source}</span>)}
                          </div>
                          <p className="mt-1 text-sm text-slate-500">{formatDate(report.reportDate)} · {report.siteName} · {report.preparedBy}</p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {detail.permissions?.canManageReports && ["Draft", "Rejected"].includes(report.status) && <button onClick={() => reportAction("submit", report)} className="rounded-lg border px-3 py-2 text-xs font-semibold">Submit</button>}
                          {detail.permissions?.canApproveReports && report.status === "Submitted" && <>
                            <button onClick={() => reportAction("approve", report)} className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white">Approve</button>
                            <button onClick={() => reportAction("reject", report)} className="rounded-lg bg-rose-600 px-3 py-2 text-xs font-semibold text-white">Reject</button>
                          </>}
                          <button onClick={() => navigate("/project-management/site-reports")} className="rounded-lg border px-3 py-2 text-xs font-semibold">Open report</button>
                        </div>
                      </div>
                      <div className="grid gap-5 p-4 lg:grid-cols-2">
                        <div className="space-y-4">
                          <DetailField label="Work performed">{report.workCompleted}</DetailField>
                          <DetailField label="Issues / delays">{report.delays}</DetailField>
                          <DetailField label="Tomorrow's plan">{report.tomorrowPlan}</DetailField>
                          <DetailField label="Manager remarks">{report.managerRemarks || report.rejectionReason}</DetailField>
                        </div>
                        <div className="space-y-4">
                          <RowList title="Task progress" rows={report.taskRows} render={(row) => (
                            <div key={row.id} className="rounded-xl bg-slate-50 p-3">
                              <div className="flex justify-between gap-3"><p className="font-semibold">{row.taskName}</p><Badge>{row.status}</Badge></div>
                              <Progress value={row.reportedProgress} /><p className="mt-2 text-xs text-slate-600">{row.workCompleted}</p>
                            </div>
                          )} />
                        </div>
                        <RowList title="Labour" rows={report.manpowerRows} render={(row, index) => <pre key={row.id || index} className="overflow-x-auto rounded-lg bg-slate-50 p-2 text-xs">{JSON.stringify(row, null, 2)}</pre>} />
                        <RowList title="Materials" rows={report.materialRows} render={(row, index) => <pre key={row.id || index} className="overflow-x-auto rounded-lg bg-slate-50 p-2 text-xs">{JSON.stringify(row, null, 2)}</pre>} />
                        <RowList title="Equipment" rows={report.equipmentRows} render={(row, index) => <pre key={row.id || index} className="overflow-x-auto rounded-lg bg-slate-50 p-2 text-xs">{JSON.stringify(row, null, 2)}</pre>} />
                        <RowList title="Issues" rows={report.issueRows} render={(row, index) => <pre key={row.id || index} className="overflow-x-auto rounded-lg bg-slate-50 p-2 text-xs">{JSON.stringify(row, null, 2)}</pre>} />
                        <div className="lg:col-span-2">
                          <h4 className="mb-2 text-sm font-bold">Photos and attachments</h4>
                          <div className="flex flex-wrap gap-2">
                            {[...(report.photos || []), ...(report.attachments || [])].map((file) => (
                              <button key={file.id} onClick={() => void openAuthenticatedFile(file.downloadUrl)} className="inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm">
                                <Eye className="h-4 w-4" /> {file.name}
                              </button>
                            ))}
                            {!report.photos?.length && !report.attachments?.length && <p className="text-sm text-slate-500">No attachments.</p>}
                          </div>
                        </div>
                      </div>
                    </section>
                  ))}
                  {!detail.reports?.length && <p className={`${cardClass} p-12 text-center text-slate-500`}>No task-derived or explicitly linked reports yet.</p>}
                </div>
              )}

              {activeTab === "Documents" && (
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {(detail.documents || []).map((document) => (
                    <section key={document.id} className={`${cardClass} p-4`}>
                      <p className="text-xs font-bold text-indigo-600">{document.documentNumber}</p>
                      <h3 className="mt-1 font-bold">{document.name}</h3>
                      <div className="mt-2 flex gap-2"><Badge>{document.status}</Badge><Badge>{document.category}</Badge></div>
                      <p className="mt-3 text-sm text-slate-500">{document.revisionLabel} · Updated {formatDate(document.updatedAt)}</p>
                      <div className="mt-4 flex gap-2">
                        <button onClick={() => void openAuthenticatedFile(document.downloadUrl)} className="rounded-lg border p-2"><Eye className="h-4 w-4" /></button>
                        <button onClick={() => void downloadAuthenticatedFile(document.downloadUrl, document.name)} className="rounded-lg border p-2"><Download className="h-4 w-4" /></button>
                      </div>
                    </section>
                  ))}
                  {!detail.documents?.length && <p className={`${cardClass} p-12 text-center text-slate-500 md:col-span-2 xl:col-span-3`}>No controlled documents are linked to this milestone.</p>}
                </div>
              )}

              {activeTab === "Risks & Issues" && (
                <div className="space-y-4">
                  {detail.permissions?.canManage && <button onClick={() => setRiskForm({ ...emptyRisk })} className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white"><Plus className="h-4 w-4" /> Add risk or issue</button>}
                  <div className="grid gap-3 lg:grid-cols-2">
                    {(detail.risks || []).map((risk) => (
                      <section key={risk.id} className={`${cardClass} p-4`}>
                        <div className="flex items-start justify-between gap-3">
                          <div><div className="flex gap-2"><Badge>{risk.type}</Badge><Badge>{risk.severity}</Badge><Badge>{risk.status}</Badge></div><h3 className="mt-3 font-bold">{risk.title}</h3></div>
                          {detail.permissions?.canManage && <div className="flex gap-1"><button onClick={() => setRiskForm({ ...emptyRisk, ...risk })} className="rounded-lg border p-2"><Pencil className="h-4 w-4" /></button><button onClick={() => void run(() => deleteMilestoneRisk(detail.id, risk.id), "Risk or issue removed.")} className="rounded-lg border border-rose-200 p-2 text-rose-600"><Trash2 className="h-4 w-4" /></button></div>}
                        </div>
                        <p className="mt-3 text-sm text-slate-600">{risk.description || "No description"}</p>
                        <div className="mt-4 grid grid-cols-2 gap-3"><DetailField label="Owner">{risk.owner}</DetailField><DetailField label="Due">{formatDate(risk.dueDate)}</DetailField></div>
                        {risk.mitigationResolution && <p className="mt-3 rounded-xl bg-slate-50 p-3 text-sm"><strong>Mitigation:</strong> {risk.mitigationResolution}</p>}
                        {detail.permissions?.canManage && !["Resolved", "Closed"].includes(risk.status) && <button onClick={() => void run(() => updateMilestoneRisk(detail.id, risk.id, { status: "Resolved" }), "Risk or issue resolved.")} className="mt-3 rounded-lg border px-3 py-2 text-xs font-semibold">Mark resolved</button>}
                      </section>
                    ))}
                  </div>
                  {!detail.risks?.length && <p className={`${cardClass} p-12 text-center text-slate-500`}>No risks, issues, or blockers recorded.</p>}
                </div>
              )}

              {activeTab === "Activity" && (
                <div className="space-y-3">
                  {(detail.activity || []).map((event) => (
                    <section key={event.id} className={`${cardClass} flex gap-3 p-4`}>
                      <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-indigo-50 text-indigo-600"><Activity className="h-4 w-4" /></div>
                      <div><p className="font-semibold">{event.action}</p><p className="text-xs text-slate-500">{event.actor || "System"} · {formatDate(event.createdAt)}</p>{event.after && <pre className="mt-2 max-h-32 overflow-auto rounded-lg bg-slate-50 p-2 text-xs">{JSON.stringify(event.after, null, 2)}</pre>}</div>
                    </section>
                  ))}
                  {!detail.activity?.length && <p className={`${cardClass} p-12 text-center text-slate-500`}>No milestone activity has been recorded yet.</p>}
                </div>
              )}
            </div>
          </aside>
        </div>
      )}

      {form && (
        <div className="fixed inset-0 z-[90] grid place-items-center bg-slate-950/50 p-4">
          <div className="max-h-[94vh] w-full max-w-4xl overflow-y-auto rounded-3xl bg-white shadow-2xl">
            <header className="sticky top-0 z-10 flex items-center justify-between border-b bg-white p-5"><div><p className="text-xs font-bold text-indigo-600">{form.id ? form.milestoneNumber : "NEW CHECKPOINT"}</p><h2 className="text-xl font-bold">{form.id ? "Update" : "Create"} Milestone</h2></div><button onClick={() => setForm(null)}><X /></button></header>
            <div className="grid gap-4 p-5 md:grid-cols-2">
              <label className="text-sm font-medium">Project *<select disabled={Boolean(form.id)} className={`${inputClass} mt-1`} value={form.projectId} onChange={(event) => setForm({ ...form, projectId: event.target.value, taskIds: [], dependencyIds: [], reportIds: [] })}><option value="">Select project</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label>
              <label className="text-sm font-medium">Milestone name *<input className={`${inputClass} mt-1`} value={form.name || ""} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label>
              <label className="text-sm font-medium">Project stage *<select className={`${inputClass} mt-1`} value={form.stage || "Design"} onChange={(event) => setForm({ ...form, stage: event.target.value })}>{stageOptions.map((value) => <option key={value}>{value}</option>)}</select></label>
              <label className="text-sm font-medium">Priority<select className={`${inputClass} mt-1`} value={form.priority || "Medium"} onChange={(event) => setForm({ ...form, priority: event.target.value })}>{priorities.slice(1).map((value) => <option key={value}>{value}</option>)}</select></label>
              <label className="text-sm font-medium">Responsible person<input className={`${inputClass} mt-1`} value={form.responsiblePerson || ""} onChange={(event) => setForm({ ...form, responsiblePerson: event.target.value })} /></label>
              <label className="text-sm font-medium">Current start<DateInput value={String(form.startDate || "").slice(0, 10)} onChange={(value) => setForm({ ...form, startDate: value || "" })} /></label>
              <label className="text-sm font-medium">Current target<DateInput value={String(form.targetDate || "").slice(0, 10)} onChange={(value) => setForm({ ...form, targetDate: value || "" })} /></label>
              <label className="text-sm font-medium">Baseline start<DateInput value={String(form.baselineStartDate || "").slice(0, 10)} onChange={(value) => setForm({ ...form, baselineStartDate: value || "" })} /></label>
              <label className="text-sm font-medium">Baseline target<DateInput value={String(form.baselineTargetDate || "").slice(0, 10)} onChange={(value) => setForm({ ...form, baselineTargetDate: value || "" })} /></label>
              <label className="text-sm font-medium md:col-span-2">Deliverable<textarea rows="2" className={`${inputClass} mt-1`} value={form.deliverable || ""} onChange={(event) => setForm({ ...form, deliverable: event.target.value })} /></label>
              <label className="text-sm font-medium md:col-span-2">Acceptance criteria<textarea rows="2" className={`${inputClass} mt-1`} value={form.acceptanceCriteria || ""} onChange={(event) => setForm({ ...form, acceptanceCriteria: event.target.value })} /></label>
              <label className="text-sm font-medium md:col-span-2">Description<textarea rows="2" className={`${inputClass} mt-1`} value={form.description || ""} onChange={(event) => setForm({ ...form, description: event.target.value })} /></label>
              <label className="text-sm font-medium">Dependencies<select multiple className={`${inputClass} mt-1 min-h-32`} value={(form.dependencyIds || []).map(String)} onChange={(event) => setForm({ ...form, dependencyIds: Array.from(event.target.selectedOptions).map((option) => Number(option.value)) })}>{(selectedProject?.milestones || []).filter((item) => item.id !== form.id).map((item) => <option key={item.id} value={item.id}>{item.milestoneNumber || item.name} — {item.name}</option>)}</select></label>
              <label className="text-sm font-medium md:col-span-2">Explicit report links<select multiple className={`${inputClass} mt-1 min-h-28`} value={(form.reportIds || []).map(String)} onChange={(event) => setForm({ ...form, reportIds: Array.from(event.target.selectedOptions).map((option) => Number(option.value)) })}>{projectReports.map((report) => <option key={report.id} value={report.id}>{report.reportNumber} — {formatDate(report.reportDate)}</option>)}</select></label>
              <label className="text-sm font-medium md:col-span-2">Notes<textarea rows="2" className={`${inputClass} mt-1`} value={form.notes || ""} onChange={(event) => setForm({ ...form, notes: event.target.value })} /></label>
            </div>
            <footer className="sticky bottom-0 flex justify-end gap-2 border-t bg-white p-5"><button onClick={() => setForm(null)} className="rounded-xl border px-4 py-2.5">Cancel</button><button disabled={busy} onClick={() => void saveMilestone()} className="rounded-xl bg-indigo-600 px-4 py-2.5 font-semibold text-white disabled:opacity-60">Save Milestone</button></footer>
          </div>
        </div>
      )}

      {taskForm && detail && (
        <div className="fixed inset-0 z-[95] grid place-items-center bg-slate-950/50 p-4">
          <div className="max-h-[94vh] w-full max-w-3xl overflow-y-auto rounded-3xl bg-white shadow-2xl">
            <header className="flex items-start justify-between border-b p-5">
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-indigo-600">{detail.stage || "Implement"} · {detail.milestoneNumber}</p>
                <h2 className="mt-1 text-xl font-bold">Create Task under {detail.name}</h2>
                <p className="mt-1 text-sm text-slate-500">This task will stay linked to this milestone and contribute to its progress.</p>
              </div>
              <button onClick={() => setTaskForm(null)}><X /></button>
            </header>
            <div className="grid gap-4 p-5 md:grid-cols-2">
              <label className="text-sm font-medium md:col-span-2">Task name *<input className={`${inputClass} mt-1`} value={taskForm.taskName} onChange={(event) => setTaskForm({ ...taskForm, taskName: event.target.value })} /></label>
              <label className="text-sm font-medium md:col-span-2">Description<textarea rows="3" className={`${inputClass} mt-1`} value={taskForm.description} onChange={(event) => setTaskForm({ ...taskForm, description: event.target.value })} /></label>
              <label className="text-sm font-medium">Assigned employee<input className={`${inputClass} mt-1`} value={taskForm.assignedEmployeeName} onChange={(event) => setTaskForm({ ...taskForm, assignedEmployeeName: event.target.value })} /></label>
              <label className="text-sm font-medium">Priority<select className={`${inputClass} mt-1`} value={taskForm.priority} onChange={(event) => setTaskForm({ ...taskForm, priority: event.target.value })}>{priorities.slice(1).map((value) => <option key={value}>{value}</option>)}</select></label>
              <label className="text-sm font-medium">Start date<DateInput value={taskForm.startDate} onChange={(value) => setTaskForm({ ...taskForm, startDate: value || "" })} /></label>
              <label className="text-sm font-medium">Due date *<DateInput value={taskForm.dueDate} onChange={(value) => setTaskForm({ ...taskForm, dueDate: value || "" })} /></label>
              <label className="text-sm font-medium">Estimated hours<input type="number" min="0" className={`${inputClass} mt-1`} value={taskForm.estimatedHours} onChange={(event) => setTaskForm({ ...taskForm, estimatedHours: event.target.value })} /></label>
              <label className="text-sm font-medium">Dependencies<input className={`${inputClass} mt-1`} value={taskForm.dependencies} onChange={(event) => setTaskForm({ ...taskForm, dependencies: event.target.value })} /></label>
              <label className="text-sm font-medium md:col-span-2">Remarks<textarea rows="2" className={`${inputClass} mt-1`} value={taskForm.remarks} onChange={(event) => setTaskForm({ ...taskForm, remarks: event.target.value })} /></label>
            </div>
            <footer className="flex justify-end gap-2 border-t p-5">
              <button onClick={() => setTaskForm(null)} className="rounded-xl border px-4 py-2.5">Cancel</button>
              <button disabled={busy} onClick={() => void saveTask()} className="rounded-xl bg-indigo-600 px-4 py-2.5 font-semibold text-white disabled:opacity-60">Create Task</button>
            </footer>
          </div>
        </div>
      )}

      {riskForm && (
        <div className="fixed inset-0 z-[100] grid place-items-center bg-slate-950/50 p-4">
          <div className="w-full max-w-2xl rounded-3xl bg-white shadow-2xl">
            <header className="flex items-center justify-between border-b p-5"><h2 className="text-xl font-bold">{riskForm.id ? "Update" : "Add"} Risk or Issue</h2><button onClick={() => setRiskForm(null)}><X /></button></header>
            <div className="grid gap-4 p-5 md:grid-cols-2">
              <label className="text-sm font-medium">Type<select className={`${inputClass} mt-1`} value={riskForm.type} onChange={(event) => setRiskForm({ ...riskForm, type: event.target.value })}>{["Risk", "Issue", "Blocker"].map((value) => <option key={value}>{value}</option>)}</select></label>
              <label className="text-sm font-medium">Severity<select className={`${inputClass} mt-1`} value={riskForm.severity} onChange={(event) => setRiskForm({ ...riskForm, severity: event.target.value })}>{priorities.slice(1).map((value) => <option key={value}>{value}</option>)}</select></label>
              <label className="text-sm font-medium md:col-span-2">Title *<input className={`${inputClass} mt-1`} value={riskForm.title} onChange={(event) => setRiskForm({ ...riskForm, title: event.target.value })} /></label>
              <label className="text-sm font-medium md:col-span-2">Description<textarea className={`${inputClass} mt-1`} rows="3" value={riskForm.description || ""} onChange={(event) => setRiskForm({ ...riskForm, description: event.target.value })} /></label>
              <label className="text-sm font-medium">Owner<input className={`${inputClass} mt-1`} value={riskForm.owner || ""} onChange={(event) => setRiskForm({ ...riskForm, owner: event.target.value })} /></label>
              <label className="text-sm font-medium">Due date<DateInput value={String(riskForm.dueDate || "").slice(0, 10)} onChange={(value) => setRiskForm({ ...riskForm, dueDate: value || "" })} /></label>
              <label className="text-sm font-medium">Status<select className={`${inputClass} mt-1`} value={riskForm.status} onChange={(event) => setRiskForm({ ...riskForm, status: event.target.value })}>{["Open", "In Progress", "Resolved", "Closed"].map((value) => <option key={value}>{value}</option>)}</select></label>
              <label className="text-sm font-medium md:col-span-2">Mitigation / resolution<textarea className={`${inputClass} mt-1`} rows="3" value={riskForm.mitigationResolution || ""} onChange={(event) => setRiskForm({ ...riskForm, mitigationResolution: event.target.value })} /></label>
            </div>
            <footer className="flex justify-end gap-2 border-t p-5"><button onClick={() => setRiskForm(null)} className="rounded-xl border px-4 py-2">Cancel</button><button onClick={() => void saveRisk()} className="rounded-xl bg-indigo-600 px-4 py-2 font-semibold text-white">Save</button></footer>
          </div>
        </div>
      )}

      {showArchive && (
        <div className="fixed inset-0 z-[105] grid place-items-center bg-slate-950/50 p-4">
          <div className="max-h-[85vh] w-full max-w-3xl overflow-y-auto rounded-3xl bg-white shadow-2xl">
            <header className="sticky top-0 flex items-center justify-between border-b bg-white p-5">
              <div><h2 className="text-xl font-bold">Archived Milestones</h2><p className="text-sm text-slate-500">Restore checkpoints without losing their linked history.</p></div>
              <button onClick={() => setShowArchive(false)}><X /></button>
            </header>
            <div className="space-y-3 p-5">
              {archived.map((item) => (
                <div key={item.id} className="flex flex-col justify-between gap-3 rounded-2xl border border-slate-200 p-4 sm:flex-row sm:items-center">
                  <div><p className="text-xs font-bold text-indigo-600">{item.milestoneNumber}</p><p className="font-bold">{item.name}</p><p className="text-sm text-slate-500">{item.projectName}</p></div>
                  <button onClick={() => void run(async () => {
                    await restoreMilestone(item.id);
                    setShowArchive(false);
                  }, "Milestone restored.", null)} className="rounded-xl border border-emerald-200 px-4 py-2 text-sm font-semibold text-emerald-700">Restore</button>
                </div>
              ))}
              {!archived.length && <p className="p-10 text-center text-slate-500">No archived milestones.</p>}
            </div>
          </div>
        </div>
      )}

      {busy && <div className="fixed bottom-5 right-5 z-[120] rounded-xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white shadow-xl">Saving changes…</div>}
    </div>
  );
};

export default ProjectManagementMilestones;
