import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, ClipboardList, Wrench } from "lucide-react";
import InventoryPageHeader from "../../components/inventory/InventoryPageHeader";
import { Card, DataTable, MetricCard, ProgressBar, StatusBadge } from "../../components/ui";
import { getTools, getToolAssignments, getToolMaintenance } from "../../services/toolsStore";
import { formatDate } from "../../utils/dateFormat";
import { formatInrCurrency } from "../../utils/formatters";

export default function ToolsSectionShell({ title, subtitle, view = "analytics" }) {
  const [snapshot] = useState(() => ({ tools: getTools(), assignments: getToolAssignments(), maintenance: getToolMaintenance() }));
  const [status, setStatus] = useState("all");
  const { tools, assignments, maintenance } = snapshot;
  const toolMap = useMemo(() => new Map(tools.map(tool => [tool.id, tool])), [tools]);
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const activeAssignments = assignments.filter(record => !record.actualReturnDate);
  const overdue = activeAssignments.filter(record => record.expectedReturnDate && record.expectedReturnDate < today);
  const openMaintenance = maintenance.filter(record => !record.resolvedDate && record.status !== "Completed");
  const assignedIds = new Set(activeAssignments.map(record => record.toolId));
  const maintenanceIds = new Set(openMaintenance.map(record => record.toolId));
  const categories = [...new Set(tools.map(tool => tool.type || "Uncategorized"))].map(type => {
    const categoryTools = tools.filter(tool => (tool.type || "Uncategorized") === type);
    return { id: type, type, count: categoryTools.length, assigned: categoryTools.filter(tool => assignedIds.has(tool.id)).length, maintenance: categoryTools.filter(tool => maintenanceIds.has(tool.id)).length, available: categoryTools.filter(tool => !assignedIds.has(tool.id) && !maintenanceIds.has(tool.id)).length };
  });
  const assignmentRows = assignments.map(record => ({ ...record, name: toolMap.get(record.toolId)?.name || record.toolId, location: toolMap.get(record.toolId)?.baseLocation || "—", status: record.actualReturnDate ? "Returned" : record.expectedReturnDate && record.expectedReturnDate < today ? "Overdue" : "In use" }));
  const maintenanceRows = maintenance.map(record => ({ ...record, name: toolMap.get(record.toolId)?.name || record.toolId, status: record.resolvedDate ? "Completed" : record.status || "Open" }));
  const historyRows = [...assignments.flatMap(record => [
    { id: `out-${record.id}`, name: toolMap.get(record.toolId)?.name || record.toolId, date: record.checkoutDate, event: "Checked out", detail: record.assignedTo || "Unassigned", status: "Issued" },
    ...(record.actualReturnDate ? [{ id: `in-${record.id}`, name: toolMap.get(record.toolId)?.name || record.toolId, date: record.actualReturnDate, event: "Returned", detail: record.conditionCheck || "Condition not recorded", status: "Completed" }] : []),
  ]), ...maintenanceRows.map(record => ({ id: `service-${record.id}`, name: record.name, date: record.resolvedDate || record.reportedDate, event: record.resolvedDate ? "Service completed" : "Maintenance reported", detail: record.issue, status: record.status }))].sort((a,b) => String(b.date || "").localeCompare(String(a.date || "")));
  const columns = view === "maintenance" ? [
    { key: "name", label: "Tool", sortable: true }, { key: "issue", label: "Issue" }, { key: "reportedDate", label: "Reported", sortable: true, render: row => formatDate(row.reportedDate) }, { key: "resolvedDate", label: "Resolved", render: row => row.resolvedDate ? formatDate(row.resolvedDate) : "Awaiting resolution" }, { key: "cost", label: "Service cost", align: "right", render: row => formatInrCurrency(row.cost || 0) }, { key: "status", label: "Status", render: row => <StatusBadge status={row.status} /> },
  ] : view === "history" ? [
    { key: "date", label: "Date", sortable: true, render: row => formatDate(row.date) }, { key: "name", label: "Tool", sortable: true }, { key: "event", label: "Activity" }, { key: "detail", label: "Details" }, { key: "status", label: "Status", render: row => <StatusBadge status={row.status} /> },
  ] : view === "categories" ? [
    { key: "type", label: "Category", sortable: true }, { key: "count", label: "Total tools", sortable: true, align: "right" }, { key: "available", label: "Available", align: "right" }, { key: "assigned", label: "Assigned", align: "right" }, { key: "maintenance", label: "In maintenance", align: "right" },
  ] : [
    { key: "name", label: "Tool", sortable: true }, { key: "assignedTo", label: "Assigned to", sortable: true }, { key: "location", label: "Base location" }, { key: "checkoutDate", label: "Checked out", render: row => formatDate(row.checkoutDate) }, { key: "expectedReturnDate", label: "Expected return", sortable: true, render: row => formatDate(row.expectedReturnDate) }, { key: "status", label: "Status", render: row => <StatusBadge status={row.status} /> },
  ];
  const rows = view === "maintenance" ? maintenanceRows : view === "history" ? historyRows : view === "categories" ? categories : assignmentRows;
  const filteredRows = status === "all" ? rows : rows.filter(row => row.status === status);
  const statuses = [...new Set(rows.map(row => row.status).filter(Boolean))];
  return <div className="p-4 md:p-6 space-y-5">
    <InventoryPageHeader title={title} description={subtitle} actions={<Link to={view === "maintenance" ? "/inventory/tools" : "/inventory/tools/assign"} className="app-btn app-btn-primary">{view === "maintenance" ? "Manage tools" : "Assign tool"}</Link>} />
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <MetricCard label="Registered tools" value={tools.length} hint={`${categories.length} tool categories`} icon={<Wrench size={17} />} />
      <MetricCard label="Currently assigned" value={assignedIds.size} hint={`${tools.length ? Math.round(assignedIds.size / tools.length * 100) : 0}% of tools in use`} icon={<ClipboardList size={17} />} />
      <MetricCard label="Overdue returns" value={overdue.length} hint="Assignments past their return date" tone={overdue.length ? "danger" : "neutral"} icon={<AlertTriangle size={17} />} />
      <MetricCard label="Open maintenance" value={openMaintenance.length} hint="Service records awaiting completion" icon={<Wrench size={17} />} />
    </div>
    {view === "analytics" ? <div className="inventory-attention-grid">
      <Card title="Tool availability by category" description="Current allocation from saved tool records">
        {categories.map(category => <div key={category.id} className="p-4 border-b border-slate-100"><div className="flex justify-between gap-3 mb-3 text-sm"><strong>{category.type}</strong><span className="text-slate-500">{category.assigned} assigned / {category.count} tools</span></div><ProgressBar value={category.count ? category.assigned / category.count * 100 : 0} label={`${category.type} utilization`} /><p className="mt-2 text-xs text-slate-500">{category.available} available · {category.maintenance} in maintenance</p></div>)}
      </Card>
      <Card title="Priorities for the tool custodian" description="Review returns and service issues first">
        <Link className="inventory-attention-row" to="/inventory/tools/assignments"><span className="inventory-attention-icon"><AlertTriangle size={17} /></span><div><strong>{overdue.length} overdue returns</strong><p>Follow up with the assigned employees</p></div></Link>
        <Link className="inventory-attention-row" to="/inventory/tools/maintenance"><span className="inventory-attention-icon"><Wrench size={17} /></span><div><strong>{openMaintenance.length} unresolved service records</strong><p>{formatInrCurrency(openMaintenance.reduce((sum, row) => sum + (Number(row.cost) || 0), 0))} recorded service cost</p></div></Link>
        <Link className="inventory-attention-row" to="/inventory/tools"><span className="inventory-attention-icon"><ClipboardList size={17} /></span><div><strong>{tools.filter(tool => !assignedIds.has(tool.id) && !maintenanceIds.has(tool.id)).length} tools available</strong><p>Review stock before purchasing additional equipment</p></div></Link>
      </Card>
    </div> : <Card title={view === "maintenance" ? "Service register" : view === "history" ? "Tool activity" : view === "categories" ? "Category overview" : "Assignment register"} description={`${filteredRows.length} records`} action={statuses.length > 0 ? <select aria-label="Filter by status" value={status} onChange={event => setStatus(event.target.value)}><option value="all">All statuses</option>{statuses.map(value => <option key={value}>{value}</option>)}</select> : null}>
      <DataTable columns={columns} rows={filteredRows} searchable emptyTitle="No records in this view" emptyDescription="Tool assignments and service activity will appear here as they are recorded." />
    </Card>}
    <p className="text-xs text-slate-500">Tool records are saved in this browser. This workspace reflects the same records used by the tool register.</p>
  </div>;
}
