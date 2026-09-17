import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowUpRight, Box, BriefcaseBusiness, CalendarDays, CheckCircle2, CircleAlert, Clock3, RefreshCw, ShoppingCart, UsersRound } from "lucide-react";
import { Button, Card, DataTable, EmptyState, MetricCard, PageHeader, ProgressBar, Skeleton, StatusBadge, Tabs } from "../ui";
import { fetchProjectManagementProjects } from "../../services/projectManagementApi";
import { normalizeProjectsList } from "../../services/projectNormalization";
import { fetchAllHrmsEmployees } from "../../services/hrmsEmployeesApi";
import { fetchHrmsAttendance } from "../../services/hrmsAttendanceApi";
import { formatDate, parseDateValue } from "../../utils/dateFormat";
import { formatInrCurrency, formatQuantity } from "../../utils/formatters";

const closed = status => /^(completed|closed|cancelled|canceled|relieved)$/i.test(String(status || ""));
const overdue = date => { const parsed = parseDateValue(date); const today = new Date(); today.setHours(0, 0, 0, 0); return parsed && parsed < today; };
const projectHealth = project => closed(project.status) ? project.status : overdue(project.endDate) || project.status === "Delayed" ? "Delayed" : project.status === "On Hold" || (project.tasks || []).some(task => !closed(task.status) && overdue(task.dueDate)) ? "At Risk" : "On Track";
const TextLink = ({ to, children }) => <Link className="executive-link" to={to}>{children}<ArrowUpRight size={14} /></Link>;

export default function ExecutiveOverview({ data, metrics, loading, refreshing, errors, reload, activeTab, setActiveTab, selectedProjectId, setSelectedProjectId, search, setSearch, visiblePending, visibleActivities, vendorMap }) {
  const [management, setManagement] = useState({ projects: [], employees: [], attendance: [], unavailable: [], loading: true });
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true;
    Promise.allSettled([fetchProjectManagementProjects(), fetchAllHrmsEmployees(), fetchHrmsAttendance()]).then(results => {
      if (!active) return;
      setManagement({ projects: results[0].status === "fulfilled" ? normalizeProjectsList(results[0].value) : [], employees: results[1].status === "fulfilled" ? results[1].value : [], attendance: results[2].status === "fulfilled" ? results[2].value : [], unavailable: results.map((result, i) => result.status === "rejected" ? ["Projects", "Employees", "Attendance"][i] : null).filter(Boolean), loading: false });
    });
    return () => { active = false; };
  }, [revision]);
  const refresh = () => { reload({ silent: true }); setRevision(value => value + 1); };
  const projects = management.projects.filter(project => selectedProjectId === "all" || String(project.id) === selectedProjectId);
  const activeProjects = projects.filter(project => !closed(project.status));
  const risks = activeProjects.filter(project => projectHealth(project) !== "On Track");
  const tasks = projects.flatMap(project => (project.tasks || []).map(task => ({ ...task, projectName: project.name })));
  const overdueTasks = tasks.filter(task => !closed(task.status) && overdue(task.dueDate));
  const purchaseOrders = data.purchaseOrders.filter(po => selectedProjectId === "all" || String(po.projectId) === selectedProjectId);
  const lateOrders = purchaseOrders.filter(po => !closed(po.status) && overdue(po.expectedDate || po.expectedDeliveryDate));
  const pendingApprovals = purchaseOrders.filter(po => /pending.*approv|awaiting.*approv|submitted/i.test(po.status || ""));
  const lowStock = data.items.filter(item => Number(item.reorderLevel ?? item.minimumStock ?? item.minStock) > 0 && Number(item.stock) < Number(item.reorderLevel ?? item.minimumStock ?? item.minStock));
  const now = new Date();
  const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const monthName = now.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  const workforce = management.employees.filter(employee => !closed(employee.status));
  const attendance = management.attendance.filter(record => record.month === monthKey || record.month === monthName);
  const byEmployee = new Map([...attendance].sort((a,b) => String(a.savedAt || "").localeCompare(String(b.savedAt || ""))).map(record => [String(record.employeeId), record]));
  const todayCounts = workforce.reduce((counts, employee) => { const status = byEmployee.get(String(employee.employeeId || employee.id))?.statuses?.[now.getDate() - 1]; counts[status || "unrecorded"] = (counts[status || "unrecorded"] || 0) + 1; return counts; }, {});
  const unavailable = errors.length || management.unavailable.length;
  const actions = [
    { count: overdueTasks.length, label: "Tasks overdue", detail: "Confirm next steps with task owners", to: "/project-management/tasks?view=overdue", icon: Clock3, tone: "danger" },
    { count: lateOrders.length, label: "Receipts delayed", detail: "Follow up on expected deliveries", to: "/inventory/purchase-order-register", icon: ShoppingCart, tone: "warning" },
    { count: pendingApprovals.length, label: "POs awaiting approval", detail: "Review submitted purchase orders", to: "/inventory/purchase-order-register", icon: CheckCircle2, tone: "warning" },
    { count: lowStock.length, label: "Items below reorder level", detail: "Review stock before the next allocation", to: "/inventory/products", icon: Box, tone: "warning" },
  ].filter(action => action.count > 0);
  const healthRows = ["On Track", "At Risk", "Delayed"].map(label => ({ label, count: activeProjects.filter(project => projectHealth(project) === label).length }));
  return <div className="executive-workspace">
    <PageHeader eyebrow="Workspace / overview" title="Operations overview" description="A clear view of your projects, people and inventory. Start with what needs your attention." actions={<><span className="executive-date"><CalendarDays size={14} />{now.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</span><Button variant="secondary" disabled={refreshing} onClick={refresh}><RefreshCw size={15} />{refreshing ? "Refreshing…" : "Refresh"}</Button></>} />
    {unavailable ? <div className="executive-notice" role="status"><CircleAlert size={17} /><span>Some data could not be refreshed. Available records are shown; totals may be incomplete.</span><button type="button" onClick={refresh}>Try again</button></div> : null}
    <div className="executive-toolbar"><Tabs items={[{ id: "overview", label: "Overview" }, { id: "reports", label: "Project register" }]} value={activeTab} onChange={setActiveTab} /><label><span>Project</span><select aria-label="Filter overview by project" value={selectedProjectId} onChange={event => setSelectedProjectId(event.target.value)}><option value="all">All projects</option>{data.projects.map(project => <option value={String(project.id)} key={project.id}>{project.name}</option>)}</select></label></div>
    {loading ? <Skeleton rows={7} /> : activeTab === "reports" ? <Card title="Project operations register" description="Order commitments, receipt quantities and recorded consumption."><DataTable searchable rows={metrics.projectReportRows} columns={[{ key: "name", label: "Project", sortable: true }, { key: "code", label: "Code" }, { key: "boqs", label: "BOQs", align: "right" }, { key: "pending", label: "Open POs", align: "right" }, { key: "value", label: "Order value", align: "right", render: row => formatInrCurrency(row.value) }, { key: "received", label: "Received qty", align: "right" }, { key: "consumed", label: "Consumed qty", align: "right" }]} emptyTitle="No project records yet" emptyDescription="Project procurement and inventory records will appear here." /></Card> : <>
      <section className="executive-metrics" aria-label="Key business metrics">
        <MetricCard label="Active projects" value={management.loading || management.unavailable.includes("Projects") ? "—" : activeProjects.length} hint="Open project portfolio" icon={BriefcaseBusiness} />
        <MetricCard label="Projects at risk" value={management.loading || management.unavailable.includes("Projects") ? "—" : risks.length} hint="At risk or delayed" tone="warning" icon={CircleAlert} />
        <MetricCard label="Open purchase orders" value={metrics.cards.pendingOrders} hint={`${formatInrCurrency(metrics.cards.pendingAmount)} committed`} icon={ShoppingCart} />
        <MetricCard label={selectedProjectId === "all" ? "Inventory value" : "Project order value"} value={formatInrCurrency(metrics.cards.inventoryValue)} hint={selectedProjectId === "all" ? "Stock × recorded unit price" : "Total purchase order commitments"} icon={Box} />
        <MetricCard label="Employees present" value={management.loading || management.unavailable.some(name => ["Employees", "Attendance"].includes(name)) ? "—" : todayCounts.P || 0} hint={`${workforce.length} employees · saved attendance`} icon={UsersRound} />
        <MetricCard label="Pending approvals" value={pendingApprovals.length} hint="Submitted purchase orders" icon={CheckCircle2} />
      </section>
      <div className="executive-main-grid">
        <div className="executive-column">
          <Card title="Project health" description="Schedule and task signals across your active portfolio" action={<TextLink to="/project-management/dashboard">Project workspace</TextLink>}>
            <div className="executive-health-summary">{healthRows.map(row => <div key={row.label}><span className={`executive-dot executive-dot-${row.label.replaceAll(" ", "-").toLowerCase()}`} /><span>{row.label}</span><strong>{row.count}</strong></div>)}</div>
            <DataTable rows={projects.slice(0, 5)} columns={[{ key: "name", label: "Project", render: row => <Link className="executive-project-name" to={`/project-management/projects?project=${encodeURIComponent(row.id)}`}>{row.name}<small>{row.client || row.code || "Project workspace"}</small></Link> }, { key: "progress", label: "Progress", render: row => <div className="executive-progress"><ProgressBar value={row.progress} label={`${row.name} completion`} /><span>{Number(row.progress) || 0}%</span></div> }, { key: "endDate", label: "Target", render: row => formatDate(row.endDate) }, { key: "status", label: "Health", render: row => <StatusBadge status={projectHealth(row)} /> }]} emptyTitle="Your project portfolio starts here" emptyDescription="Create a project to track its delivery, resources and schedule." />
          </Card>
          <Card title="Procurement pipeline" description="Current orders by recorded status" action={<TextLink to="/inventory/purchase-order-register">Purchase register</TextLink>}>
            <div className="executive-pipeline">{["Draft", "Approved", "Ordered", "Partial", "Completed"].map(status => { const count = purchaseOrders.filter(po => status === "Partial" ? /partial/i.test(po.status) : status === "Completed" ? /completed|closed/i.test(po.status) : String(po.status).toLowerCase() === status.toLowerCase()).length; return <div key={status}><StatusBadge status={status} /><strong>{count}</strong><ProgressBar value={purchaseOrders.length ? count / purchaseOrders.length * 100 : 0} /></div>; })}</div>
            <div className="executive-subhead"><h3>Open orders</h3><input type="search" aria-label="Search open orders and activity" placeholder="Search orders or activity…" value={search} onChange={event => setSearch(event.target.value)} /></div>
            <DataTable rows={visiblePending} columns={[{ key: "poNumber", label: "Purchase order", render: row => <Link className="executive-link" to="/inventory/purchase-order-register">{row.poNumber || `PO-${row.id}`}</Link> }, { key: "vendorId", label: "Supplier", render: row => vendorMap[String(row.vendorId)]?.name || "—" }, { key: "expectedDate", label: "Expected", render: row => formatDate(row.expectedDate) }, { key: "total", label: "Amount", align: "right", render: row => formatInrCurrency(row.total) }]} emptyTitle="No open purchase orders" emptyDescription="Orders awaiting completion will appear here." />
          </Card>
          <Card title="Material activity" description="Received and consumed quantities at your busiest locations · last 7 days">
            {metrics.locationSeries.length ? <><div className="executive-chart" role="img" aria-label="Seven-day received and consumed quantities by location">{metrics.chartDays.map((day, index) => <div className="executive-chart-day" key={index}><div>{day.values.map((value, i) => <span key={i} title={`${day.label}, ${metrics.locationSeries[i].label}: ${value}`} style={{ height: `${Math.max(2, value / metrics.chartMax * 100)}%`, background: `var(--chart-${i + 1})` }} />)}</div><small>{day.label}</small></div>)}</div><div className="executive-chart-legend">{metrics.locationSeries.map((series, i) => <span key={series.id}><i style={{ background: `var(--chart-${i+1})` }} />{series.label}</span>)}</div></> : <EmptyState title="Material activity will appear here" description="Record receipts and consumption with locations to build the seven-day activity view." />}
          </Card>
        </div>
        <div className="executive-column">
          <Card title="Action centre" description="Priorities for your next review" className="executive-attention">
            {actions.length ? actions.map(({ icon: Icon, ...action }) => <Link className="executive-action" to={action.to} key={action.label}><span className={`executive-action-icon ${action.tone}`}><Icon size={17} /></span><span><strong>{action.label}</strong><small>{action.detail}</small></span><b>{action.count}</b><ArrowUpRight size={14} /></Link>) : <EmptyState icon={CheckCircle2} title={unavailable ? "Waiting for complete data" : "No immediate flags"} description={unavailable ? "Refresh the unavailable sources to check operational priorities." : "No overdue tasks, delayed orders or low stock were found in the available records."} />}
          </Card>
          <Card title="Workforce today" description="Organization-wide · saved attendance" action={<TextLink to="/dashboard">HR workspace</TextLink>}>
            <div className="executive-workforce-number"><strong>{todayCounts.P || 0}<small> / {workforce.length}</small></strong><span>employees present</span></div><ProgressBar value={workforce.length ? (todayCounts.P || 0) / workforce.length * 100 : 0} label="Present employees" />
            <div className="executive-workforce-grid">{[["Absent", todayCounts.A || 0], ["On leave", todayCounts.L || 0], ["Holiday", todayCounts.H || 0], ["Not recorded", todayCounts.unrecorded || 0]].map(([label,value]) => <div key={label}><span>{label}</span><strong>{value}</strong></div>)}</div>
          </Card>
          <Card title="Recent activity" description="Latest recorded inventory events" action={<TextLink to="/inventory/reports">Registers</TextLink>}>
            {visibleActivities.length ? visibleActivities.slice(0,5).map(entry => <div className="executive-activity" key={entry.id}><span className="executive-dot" /><div><strong>{entry.title}</strong><p>{entry.detail}</p><time>{formatDate(entry.date)}</time></div></div>) : <EmptyState title="No activity yet" description="Your team's inventory updates will appear here." />}
          </Card>
          <Card title="Resource commitments" description="Current project selection"><div className="executive-total"><span>Purchase order value</span><strong>{formatInrCurrency(metrics.finance.purchaseValue)}</strong></div><div className="executive-total"><span>Recorded consumption</span><strong>{formatInrCurrency(metrics.finance.consumedValue)}</strong></div><div className="executive-total"><span>Received quantity</span><strong>{formatQuantity(metrics.cards.receivedQty)}</strong></div></Card>
        </div>
      </div>
    </>}
  </div>;
}
