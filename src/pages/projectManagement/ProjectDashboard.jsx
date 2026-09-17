import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, AlertTriangle, CalendarDays, CheckCircle2, Clock3, FolderKanban, ListChecks, RefreshCw, Users, Wallet } from "lucide-react";
import { Card, DataTable, EmptyState, MetricCard, PageHeader, ProgressBar, Skeleton } from "../../components/ui";
import StatusBadge from "../../components/common/StatusBadge";
import { formatInrCurrency } from "../../utils/formatters";
import { formatDate } from "../../utils/dateFormat";
import { getProjectManagementProjects, hydrateProjectManagementProjects, PROJECT_MANAGEMENT_PROJECTS_EVENT } from "../../services/projectManagementProjectsStore";
import "../../styles/projects.css";

const number = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;
const closed = (status) => ["Completed", "Cancelled"].includes(status);
const budgetFor = (project) => number(project.approvedBudget) || number(project.estimatedBudget);
const spendFor = (project) => Array.isArray(project.financials) && project.financials.length
  ? project.financials.reduce((sum, entry) => sum + number(entry.actual ?? entry.amount), 0)
  : number(project.expenses);
const daysUntil = (value) => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0); date.setHours(0, 0, 0, 0);
  return Math.round((date - today) / 86400000);
};
const healthFor = (project) => {
  if (closed(project.status)) return project.status;
  if (project.status === "Delayed" || (daysUntil(project.endDate) !== null && daysUntil(project.endDate) < 0)) return "Delayed";
  if (project.status === "On Hold" || (budgetFor(project) > 0 && spendFor(project) > budgetFor(project)) || (project.tasks || []).some((task) => !closed(task.status) && daysUntil(task.dueDate) !== null && daysUntil(task.dueDate) < 0)) return "At Risk";
  return "On Track";
};

export default function ProjectDashboard() {
  const navigate = useNavigate();
  const [projects, setProjects] = useState(() => getProjectManagementProjects());
  const [projectFilter, setProjectFilter] = useState("All");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const load = async () => {
    setLoading(true);
    try { setProjects(await hydrateProjectManagementProjects()); setLoadError(""); }
    catch { setLoadError("Unable to refresh project information. Check your connection and try again."); }
    finally { setLoading(false); }
  };
  useEffect(() => {
    let active = true;
    const sync = () => setProjects(getProjectManagementProjects());
    window.addEventListener(PROJECT_MANAGEMENT_PROJECTS_EVENT, sync);
    hydrateProjectManagementProjects().then((rows) => { if (active) setProjects(rows); })
      .catch(() => { if (active) setLoadError("Unable to load project information. Check your connection and try again."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; window.removeEventListener(PROJECT_MANAGEMENT_PROJECTS_EVENT, sync); };
  }, []);

  const data = useMemo(() => {
    const scoped = projectFilter === "All" ? projects : projects.filter((project) => String(project.id) === projectFilter);
    const open = scoped.filter((project) => !closed(project.status));
    const tasks = scoped.flatMap((project) => (project.tasks || []).map((task) => ({ ...task, projectId: project.id, projectName: project.name })));
    const overdueTasks = tasks.filter((task) => !closed(task.status) && daysUntil(task.dueDate) !== null && daysUntil(task.dueDate) < 0).sort((a, b) => daysUntil(a.dueDate) - daysUntil(b.dueDate));
    const milestones = scoped.flatMap((project) => (project.milestones || []).map((milestone) => ({ ...milestone, projectName: project.name })));
    const overdueMilestones = milestones.filter((milestone) => !closed(milestone.status) && daysUntil(milestone.targetDate || milestone.endDate) !== null && daysUntil(milestone.targetDate || milestone.endDate) < 0);
    const allocations = scoped.flatMap((project) => project.teamAllocations || []).filter((allocation) => !["Released", "Cancelled"].includes(allocation.status));
    const totalBudget = scoped.reduce((sum, project) => sum + budgetFor(project), 0);
    const spent = scoped.reduce((sum, project) => sum + spendFor(project), 0);
    const overBudget = scoped.filter((project) => budgetFor(project) > 0 && spendFor(project) > budgetFor(project));
    const health = ["On Track", "At Risk", "Delayed"].map((label) => ({ label, value: open.filter((project) => healthFor(project) === label).length }));
    const deadlines = open.filter((project) => daysUntil(project.endDate) !== null && daysUntil(project.endDate) >= 0).sort((a, b) => daysUntil(a.endDate) - daysUntil(b.endDate)).slice(0, 5);
    const recent = [...scoped].sort((a, b) => String(b.updatedAt || b.createdAt || b.id).localeCompare(String(a.updatedAt || a.createdAt || a.id))).slice(0, 6);
    const reports = scoped.flatMap((project) => (project.siteReports || []).map((report) => ({ ...report, projectName: project.name }))).sort((a, b) => String(b.reportDate || b.date).localeCompare(String(a.reportDate || a.date))).slice(0, 3);
    return { scoped, open, tasks, overdueTasks, overdueMilestones, allocations, totalBudget, spent, overBudget, health, deadlines, recent, reports };
  }, [projects, projectFilter]);
  const openProject = (project) => navigate(`/project-management/projects?project=${encodeURIComponent(project.id)}`);
  const utilization = data.totalBudget ? Math.round(data.spent / data.totalBudget * 100) : 0;
  const attention = [
    { count: data.overdueTasks.length, title: "Overdue tasks", description: "Follow up with owners and unblock delivery.", icon: Clock3, route: "/project-management/tasks?view=overdue", tone: "danger" },
    { count: data.overdueMilestones.length, title: "Milestones past target", description: "Review dependencies and confirm revised dates.", icon: CalendarDays, route: "/project-management/milestones?health=Overdue", tone: "danger" },
    { count: data.overBudget.length, title: "Projects over budget", description: "Review actual costs against approved budgets.", icon: Wallet, route: "/project-management/financials", tone: "warning" },
    { count: data.health.find((row) => row.label === "At Risk").value, title: "Projects at risk", description: "Schedule, task or cost issues need a review.", icon: AlertTriangle, route: "/project-management/projects", tone: "warning" },
  ];

  return <div className="pm-workspace space-y-5">
    <PageHeader eyebrow="Project management" title="Project overview" description="Delivery health, resources and costs. Focus on the work that needs your attention."
      actions={<><button className="pm-inline-button" onClick={load} disabled={loading}><RefreshCw size={15} className={loading ? "animate-spin" : ""} />Refresh</button><button className="pm-inline-button pm-inline-button--primary" onClick={() => navigate("/project-management/projects")}><FolderKanban size={15} />Open projects</button></>} />
    <div className="pm-table-toolbar rounded-lg border border-slate-200 bg-white">
      <p>Portfolio control <span aria-hidden="true"> / </span> {projectFilter === "All" ? "All projects" : data.scoped[0]?.name || "Selected project"}</p>
      <select value={projectFilter} onChange={(event) => setProjectFilter(event.target.value)} aria-label="Filter overview by project" className="max-w-full min-w-56 px-3 py-2 border">
        <option value="All">All projects</option>{projects.map((project) => <option value={project.id} key={project.id}>{project.name}</option>)}
      </select>
    </div>
    {loadError && <div role="alert" className="flex items-center justify-between gap-4 rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700"><span>{loadError}</span><button className="pm-inline-button" onClick={load}>Retry</button></div>}
    {loading && !projects.length ? <Skeleton rows={5} /> : <>
      <section className="pm-summary-grid" aria-label="Project performance">
        <MetricCard label="Active projects" value={data.open.length} hint={`${data.scoped.length} total in this view`} icon={FolderKanban} />
        <MetricCard label="Needs attention" value={data.health.filter((row) => row.label !== "On Track").reduce((sum, row) => sum + row.value, 0)} hint="At risk or delayed" icon={AlertTriangle} tone="warning" />
        <MetricCard label="Overdue tasks" value={data.overdueTasks.length} hint="Past due and incomplete" icon={Clock3} tone="danger" onClick={() => navigate("/project-management/tasks?view=overdue")} />
        <MetricCard label="Open tasks" value={data.tasks.filter((task) => !closed(task.status)).length} hint="Across project milestones" icon={ListChecks} />
        <MetricCard label="Team allocations" value={data.allocations.length} hint="Active assignments" icon={Users} />
        <MetricCard label="Budget used" value={`${utilization}%`} hint={formatInrCurrency(data.spent)} icon={Wallet} tone={utilization > 100 ? "danger" : "neutral"} />
      </section>
      <div className="pm-dashboard-grid">
        <div className="pm-dashboard-column">
          <Card title="Project health" description="Schedule, task and budget signals across open projects." action={<button className="pm-inline-button" onClick={() => navigate("/project-management/projects")}>View portfolio <ArrowRight size={14} /></button>}>
            {data.open.length ? data.health.map((row) => <div className="pm-health-row" key={row.label}><span>{row.label}</span><div className="pm-health-track"><span style={{ width: `${row.value / Math.max(data.open.length, 1) * 100}%`, background: row.label === "Delayed" ? "var(--danger)" : row.label === "At Risk" ? "var(--warning)" : "var(--primary)" }} /></div><strong>{row.value}</strong></div>) : <EmptyState title="Your portfolio starts here" description="Create a project to track its timeline, budget and delivery health." action={<button className="pm-inline-button" onClick={() => navigate("/project-management/projects")}>Create a project</button>} />}
          </Card>
          <Card title="Project portfolio" description="Recently updated projects and their current delivery position.">
            <DataTable rows={data.recent} pageSize={6} emptyTitle="No projects yet" emptyDescription="Projects will appear here once they are created." columns={[
              { key: "name", label: "Project", render: (project) => <div><button className="pm-link" onClick={() => openProject(project)}>{project.name}</button><p className="mt-1 text-xs text-slate-500">{project.companyName || project.client || project.code || "Client not assigned"}</p></div> },
              { key: "health", label: "Health", render: (project) => <StatusBadge status={healthFor(project)} /> },
              { key: "progress", label: "Progress", render: (project) => <ProgressBar value={number(project.progress)} label /> },
              { key: "endDate", label: "Target", render: (project) => <span className="whitespace-nowrap">{formatDate(project.endDate)}</span> },
            ]} />
          </Card>
          <Card title="Delivery watchlist" description="The most overdue tasks, ordered by days past their target." action={<button className="pm-inline-button" onClick={() => navigate("/project-management/tasks?view=overdue")}>All tasks <ArrowRight size={14} /></button>}>
            {data.overdueTasks.length ? data.overdueTasks.slice(0,4).map((task) => <button key={`${task.projectId}-${task.id}`} className="pm-action-row" onClick={() => navigate("/project-management/tasks?view=overdue")}><span className="pm-attention-icon pm-attention-icon--danger"><Clock3 size={17} /></span><div><strong>{task.taskName || task.title || "Untitled task"}</strong><p>{task.projectName} ? {task.assignedTo || task.assignedEmployeeName || "Unassigned"}</p></div><StatusBadge status={`${Math.abs(daysUntil(task.dueDate))}d overdue`} tone="danger" /></button>) : <EmptyState icon={CheckCircle2} title="No overdue tasks" description="No open task is past its recorded due date in this view." />}
          </Card>
        </div>
        <div className="pm-dashboard-column">
          <Card title="Action centre" description="Priorities for your next review.">
            {attention.filter((item) => item.count > 0).length ? attention.filter((item) => item.count > 0).map(({ icon: Icon, ...item }) => <button key={item.title} className="pm-action-row" onClick={() => navigate(item.route)}><span className={`pm-attention-icon pm-attention-icon--${item.tone}`}><Icon size={17} /></span><div><strong>{item.count} {item.title.toLowerCase()}</strong><p>{item.description}</p></div><ArrowRight size={15} /></button>) : <EmptyState icon={CheckCircle2} title="No immediate flags" description="No overdue work or budget exceptions were found in the current project records." />}
          </Card>
          <Card title="Budget position" description="Recorded costs against the approved portfolio budget." action={<button className="pm-inline-button" onClick={() => navigate("/project-management/financials")} aria-label="Open financials"><ArrowRight size={15} /></button>}>
            <p className="pm-budget-total">{formatInrCurrency(data.totalBudget)}</p><p className="pm-budget-meta">Approved / estimated budget</p>
            <div className="pm-budget-track"><span style={{ width: `${Math.min(utilization,100)}%`, background: utilization > 100 ? "var(--danger)" : "var(--primary)" }} /></div>
            <div className="pm-budget-caption"><span>{utilization}% used</span><span>{data.overBudget.length} over budget</span></div>
            <div className="pm-stat-line"><span>Actual spend</span><strong>{formatInrCurrency(data.spent)}</strong></div>
            <div className="pm-stat-line"><span>{data.spent > data.totalBudget ? "Budget exceeded by" : "Budget remaining"}</span><strong>{formatInrCurrency(Math.abs(data.totalBudget - data.spent))}</strong></div>
          </Card>
          <Card title="Upcoming deadlines" description="Next project targets, ordered by date.">
            {data.deadlines.length ? data.deadlines.map((project) => <button key={project.id} className="pm-action-row" onClick={() => openProject(project)}><span className="pm-attention-icon"><CalendarDays size={16} /></span><div><strong>{project.name}</strong><p>{formatDate(project.endDate)}</p></div><span className="text-xs font-semibold text-slate-600">{daysUntil(project.endDate) === 0 ? "Today" : `${daysUntil(project.endDate)}d left`}</span></button>) : <EmptyState title="No upcoming targets" description="Add target dates to open projects to see upcoming delivery commitments." />}
          </Card>
          {data.reports.length > 0 && <Card title="Recent site activity" action={<button className="pm-inline-button" onClick={() => navigate("/project-management/site-reports")}>All reports</button>}>{data.reports.map((report) => <div key={report.id} className="pm-action-row"><div><strong>{report.projectName}</strong><p>{report.summary || report.workCompleted || report.reportNumber}</p><p>{formatDate(report.reportDate || report.date)}</p></div><StatusBadge status={report.status || "Draft"} /></div>)}</Card>}
        </div>
      </div>
    </>}
  </div>;
}
