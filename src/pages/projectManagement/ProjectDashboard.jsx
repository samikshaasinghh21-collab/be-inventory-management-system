import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import AppIcon from "../../components/layout/AppIcon";
import { formatInrCurrency } from "../../utils/formatters";
import {
  getProjectManagementProjects,
  hydrateProjectManagementProjects,
  PROJECT_MANAGEMENT_PROJECTS_EVENT,
} from "../../services/projectManagementProjectsStore";
import { formatDate } from "../../utils/dateFormat";

const kpiColors = {
  violet: "bg-violet-100 text-violet-600",
  emerald: "bg-emerald-100 text-emerald-600",
  blue: "bg-blue-100 text-blue-600",
  rose: "bg-rose-100 text-rose-600",
  amber: "bg-amber-100 text-amber-600",
  purple: "bg-purple-100 text-purple-600",
};

const statusStyles = {
  Planning: "bg-blue-50 text-blue-700",
  Active: "bg-emerald-50 text-emerald-700",
  "In Progress": "bg-emerald-50 text-emerald-700",
  "On Hold": "bg-amber-50 text-amber-700",
  Delayed: "bg-rose-50 text-rose-700",
  Completed: "bg-violet-50 text-violet-700",
  Cancelled: "bg-rose-50 text-rose-700",
};

const formatValue = (value, format) => {
  if (format === "currency") {
    return formatInrCurrency(value);
  }
  return Number(value || 0).toLocaleString("en-IN");
};

const buildConicGradient = (segments = []) => {
  const total = segments.reduce((sum, segment) => sum + Number(segment.value || 0), 0);
  if (!total) {
    return "conic-gradient(#e2e8f0 0deg 360deg)";
  }

  let cursor = 0;
  const stops = segments.map((segment) => {
    const start = cursor;
    const size = (Number(segment.value || 0) / total) * 360;
    cursor += size;
    return `${segment.color} ${start}deg ${cursor}deg`;
  });

  return `conic-gradient(${stops.join(", ")})`;
};

const KpiCard = ({ item }) => (
  <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
    <div className="flex items-start gap-4">
      <span
        className={`grid h-12 w-12 shrink-0 place-items-center rounded-xl ${
          kpiColors[item.color] || kpiColors.blue
        }`}
      >
        <AppIcon name={item.icon} className="h-5 w-5" />
      </span>
      <div className="min-w-0">
        <p className="text-sm font-medium text-slate-500">{item.label}</p>
        <p className="mt-2 text-2xl font-bold text-slate-950">
          {formatValue(item.value, item.format)}
        </p>
        <p className="mt-2 text-xs text-slate-500">{item.helper}</p>
      </div>
    </div>
  </article>
);

const SectionCard = ({ title, action, children, className = "" }) => (
  <section
    className={`rounded-xl border border-slate-200 bg-white p-5 shadow-sm ${className}`.trim()}
  >
    <div className="mb-5 flex items-center justify-between gap-3">
      <h2 className="text-lg font-semibold text-slate-950">{title}</h2>
      {action}
    </div>
    {children}
  </section>
);

const DonutChart = ({ segments, centerValue, centerLabel, sizeClass = "h-44 w-44" }) => {
  const background = useMemo(() => buildConicGradient(segments), [segments]);

  return (
    <div
      className={`grid shrink-0 place-items-center rounded-full ${sizeClass}`}
      style={{ background }}
      aria-label={centerLabel}
    >
      <div className="grid h-[58%] w-[58%] place-items-center rounded-full bg-white text-center shadow-inner">
        <div>
          <p className="text-lg font-bold text-slate-950">{centerValue}</p>
          <p className="text-xs text-slate-500">{centerLabel}</p>
        </div>
      </div>
    </div>
  );
};

const CostSummary = ({ summary }) => (
  <SectionCard title="Project Cost Summary" className="xl:col-span-5">
    <div className="grid gap-6 lg:grid-cols-[240px_1fr] lg:items-center">
      <div className="flex justify-center">
        <DonutChart
          segments={summary.segments}
          centerValue={formatInrCurrency(summary.totalBudget)}
          centerLabel="Total Budget"
        />
      </div>

      <div className="space-y-4">
        {summary.segments.map((segment) => (
          <div key={segment.label} className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <span
                className="h-3 w-3 rounded-full"
                style={{ backgroundColor: segment.color }}
              />
              <span className="text-sm font-medium text-slate-600">{segment.label}</span>
            </div>
            <span className="text-sm font-semibold text-slate-950">
              {formatInrCurrency(segment.value)}
            </span>
          </div>
        ))}
      </div>
    </div>

    <div className="mt-6 grid gap-3 sm:grid-cols-[auto_1fr_auto] sm:items-center">
      <span className="text-sm font-semibold text-slate-900">Budget Utilization</span>
      <div className="h-2.5 overflow-hidden rounded-full bg-slate-200">
        <div
          className="h-full rounded-full bg-gradient-to-r from-blue-600 to-indigo-500"
          style={{ width: `${summary.utilization}%` }}
        />
      </div>
      <span className="text-sm font-semibold text-blue-700">
        {summary.utilization}%
      </span>
    </div>
  </SectionCard>
);

const StatusBarChart = ({ rows }) => {
  const maxValue = Math.max(...rows.map((item) => item.value), 1);

  return (
    <SectionCard
      title="Projects by Status"
      className="xl:col-span-7"
      action={
        <select className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100">
          <option>This Month</option>
          <option>This Quarter</option>
          <option>This Year</option>
        </select>
      }
    >
      <div className="flex h-64 items-end gap-3 border-b border-l border-slate-200 px-3 pb-0 sm:gap-5">
        {rows.map((status) => {
          const height = Math.max((status.value / maxValue) * 100, 10);

          return (
            <div key={status.label} className="flex h-full min-w-0 flex-1 flex-col justify-end">
              <div className="flex flex-1 flex-col justify-end">
                <span className="mb-2 text-center text-sm font-semibold text-slate-900">
                  {status.value}
                </span>
                <div className="flex h-44 items-end justify-center">
                  <span
                    className="w-full max-w-[4.5rem] rounded-t-lg shadow-sm"
                    style={{
                      height: `${height}%`,
                      backgroundColor: status.color,
                    }}
                  />
                </div>
              </div>
              <span className="mt-3 truncate text-center text-xs font-medium text-slate-600">
                {status.label}
              </span>
            </div>
          );
        })}
      </div>
    </SectionCard>
  );
};

const TeamAllocation = ({ summary }) => {
  const totalRow = {
    label: "Total Employees Allocated",
    value: summary.total,
    color: "#2563eb",
    icon: "users",
  };
  const rows = [totalRow, ...summary.segments];

  return (
    <SectionCard title="Team Allocation Summary" className="xl:col-span-5">
      <div className="grid gap-6 lg:grid-cols-[1fr_220px] lg:items-center">
        <div className="space-y-4">
          {rows.map((row) => (
            <div key={row.label} className="flex items-center justify-between gap-4">
              <div className="flex min-w-0 items-center gap-3">
                <span
                  className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-slate-100"
                  style={{ color: row.color }}
                >
                  <AppIcon name={row.icon} className="h-4 w-4" />
                </span>
                <span className="truncate text-sm font-medium text-slate-600">
                  {row.label}
                </span>
              </div>
              <span className="text-sm font-bold text-slate-950">{row.value}</span>
            </div>
          ))}
        </div>

        <div className="flex justify-center">
          <DonutChart
            segments={summary.segments}
            centerValue={summary.total}
            centerLabel="Total"
            sizeClass="h-40 w-40"
          />
        </div>
      </div>
    </SectionCard>
  );
};

const DeadlineList = ({ deadlines }) => (
  <SectionCard
    title="Upcoming Deadlines"
    className="xl:col-span-7"
    action={
      <button
        type="button"
        className="rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-sm font-semibold text-blue-700 transition hover:bg-blue-100"
      >
        View All
      </button>
    }
  >
    <div className="divide-y divide-slate-100">
      {deadlines.length ? deadlines.map((item) => (
        <div
          key={item.id}
          className="grid gap-3 py-3 sm:grid-cols-[1fr_auto_auto] sm:items-center"
        >
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-violet-50 text-violet-600">
              <AppIcon name="calendar" className="h-4 w-4" />
            </span>
            <span className="truncate text-sm font-semibold text-slate-800">
              {item.projectName}
            </span>
          </div>
          <span className="text-sm font-medium text-slate-700">{item.deadline}</span>
          <span className="w-fit rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">
            {item.daysRemaining} Days Left
          </span>
        </div>
      )) : (
        <p className="py-8 text-center text-sm text-slate-500">
          No upcoming project deadlines.
        </p>
      )}
    </div>
  </SectionCard>
);

const DelayedTasks = ({ tasks, onOpenMilestones }) => (
  <SectionCard
    title="Delayed Tasks"
    action={<button type="button" onClick={onOpenMilestones} className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">Open Milestones</button>}
  >
    {tasks.length ? (
      <div className="overflow-x-auto">
        <table className="min-w-[850px] w-full text-sm">
          <thead className="bg-rose-50 text-left text-xs uppercase tracking-wide text-rose-700"><tr><th className="px-4 py-3">Task</th><th className="px-4 py-3">Project</th><th className="px-4 py-3">Stage</th><th className="px-4 py-3">Milestone</th><th className="px-4 py-3">Owner</th><th className="px-4 py-3">Due</th><th className="px-4 py-3">Delay</th></tr></thead>
          <tbody className="divide-y divide-slate-100">{tasks.map((task) => <tr key={`${task.projectId}-${task.id}`} className="bg-white hover:bg-rose-50/40"><td className="px-4 py-3 font-semibold text-slate-900">{task.taskName || task.title}</td><td className="px-4 py-3 text-slate-700">{task.projectName}</td><td className="px-4 py-3"><span className="rounded-full bg-indigo-50 px-2 py-1 text-xs font-semibold text-indigo-700">{task.stage || "Implement"}</span></td><td className="px-4 py-3 text-slate-700">{task.milestoneName}</td><td className="px-4 py-3 text-slate-600">{task.assignedTo || task.assignedEmployeeName || "Unassigned"}</td><td className="px-4 py-3 text-slate-700">{formatDate(task.dueDate)}</td><td className="px-4 py-3"><span className="rounded-full bg-rose-100 px-2.5 py-1 text-xs font-bold text-rose-700">{task.daysDelayed} day{task.daysDelayed === 1 ? "" : "s"}</span></td></tr>)}</tbody>
        </table>
      </div>
    ) : <p className="py-8 text-center text-sm text-slate-500">No delayed tasks for the selected project view.</p>}
  </SectionCard>
);

const ProgressMeter = ({ value }) => (
  <div className="flex min-w-[130px] items-center gap-3">
    <div className="h-2 w-20 overflow-hidden rounded-full bg-slate-200">
      <div className="h-full rounded-full bg-emerald-500" style={{ width: `${value}%` }} />
    </div>
    <span className="text-xs font-semibold text-slate-600">{value}%</span>
  </div>
);

const ProjectStatusBadge = ({ status }) => (
  <span
    className={`inline-flex rounded-lg px-3 py-1 text-xs font-semibold ${
      statusStyles[status] || "bg-slate-100 text-slate-700"
    }`}
  >
    {status}
  </span>
);

const RecentProjectsTable = ({ projects, onOpenProjects }) => (
  <SectionCard title="Recent Projects">
    <div className="overflow-x-auto">
      <table className="min-w-[1050px] w-full text-sm">
        <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-4 py-3 text-left font-semibold">Project ID</th>
            <th className="px-4 py-3 text-left font-semibold">Project Name</th>
            <th className="px-4 py-3 text-left font-semibold">Client</th>
            <th className="px-4 py-3 text-left font-semibold">Manager</th>
            <th className="px-4 py-3 text-left font-semibold">Status</th>
            <th className="px-4 py-3 text-left font-semibold">Progress</th>
            <th className="px-4 py-3 text-left font-semibold">Budget</th>
            <th className="px-4 py-3 text-left font-semibold">Deadline</th>
            <th className="px-4 py-3 text-left font-semibold">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {projects.length ? projects.map((project) => (
            <tr key={project.id} className="transition hover:bg-slate-50">
              <td className="px-4 py-4 font-semibold text-slate-700">{project.id}</td>
              <td className="px-4 py-4 font-semibold text-slate-950">{project.name}</td>
              <td className="px-4 py-4 text-slate-600">{project.client}</td>
              <td className="px-4 py-4 text-slate-600">{project.manager}</td>
              <td className="px-4 py-4">
                <ProjectStatusBadge status={project.status} />
              </td>
              <td className="px-4 py-4">
                <ProgressMeter value={project.progress} />
              </td>
              <td className="px-4 py-4 font-semibold text-slate-800">
                {formatInrCurrency(project.budget)}
              </td>
              <td className="px-4 py-4 text-slate-600">{project.deadline}</td>
              <td className="px-4 py-4">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={onOpenProjects}
                    className="grid h-9 w-9 place-items-center rounded-lg border border-slate-200 text-slate-500 transition hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-700"
                    aria-label={`View ${project.name}`}
                    title="View project"
                  >
                    <AppIcon name="file" className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={onOpenProjects}
                    className="grid h-9 w-9 place-items-center rounded-lg border border-slate-200 text-slate-500 transition hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-700"
                    aria-label={`Edit ${project.name}`}
                    title="Edit project"
                  >
                    <AppIcon name="edit" className="h-4 w-4" />
                  </button>
                </div>
              </td>
            </tr>
          )) : (
            <tr>
              <td colSpan="9" className="px-4 py-12 text-center text-slate-500">
                No projects have been created in the database yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  </SectionCard>
);

const ProjectDashboard = () => {
  const navigate = useNavigate();
  const [projects, setProjects] = useState(() => getProjectManagementProjects());
  const [projectFilter, setProjectFilter] = useState("All");
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    const syncProjects = () => setProjects(getProjectManagementProjects());
    window.addEventListener(PROJECT_MANAGEMENT_PROJECTS_EVENT, syncProjects);
    void hydrateProjectManagementProjects()
      .then(setProjects)
      .catch((error) =>
        setLoadError(
          error?.response?.data?.error ||
            error?.message ||
            "Project dashboard data could not be loaded."
        )
      );
    return () =>
      window.removeEventListener(PROJECT_MANAGEMENT_PROJECTS_EVENT, syncProjects);
  }, []);

  const dashboard = useMemo(() => {
    const scopedProjects = projectFilter === "All"
      ? projects
      : projects.filter((project) => String(project.id) === String(projectFilter));
    const amount = (value) => {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : 0;
    };
    const budgetFor = (project) =>
      amount(project.approvedBudget) || amount(project.estimatedBudget);
    const spentFor = (project) => {
      const entries = Array.isArray(project.financials) ? project.financials : [];
      return entries.length
        ? entries.reduce((sum, row) => sum + amount(row.actual ?? row.amount), 0)
        : amount(project.expenses);
    };
    const totalBudget = scopedProjects.reduce((sum, project) => sum + budgetFor(project), 0);
    const budgetUsed = scopedProjects.reduce((sum, project) => sum + spentFor(project), 0);
    const remainingBudget = Math.max(totalBudget - budgetUsed, 0);
    const onHoldAmount = scopedProjects
      .filter((project) => project.status === "On Hold")
      .reduce((sum, project) => sum + budgetFor(project), 0);
    const utilization = totalBudget
      ? Math.min(100, Math.round((budgetUsed / totalBudget) * 1000) / 10)
      : 0;

    const statusDefinitions = [
      ["Planning", "#2563eb"],
      ["Active", "#22c55e"],
      ["On Hold", "#f59e0b"],
      ["Delayed", "#ef4444"],
      ["Completed", "#8b5cf6"],
      ["Cancelled", "#64748b"],
    ];
    const statusRows = statusDefinitions.map(([label, color]) => ({
      label,
      color,
      value: scopedProjects.filter((project) => project.status === label).length,
    }));

    const allocations = scopedProjects.flatMap((project) => project.teamAllocations || [])
      .filter((row) => !["Released", "Cancelled"].includes(row.status));
    const teamDefinitions = [
      ["Project Managers", "manager", "#2563eb", "briefcase"],
      ["Engineers", "engineer", "#22c55e", "users"],
      ["Technicians", "technician", "#f59e0b", "tool"],
      ["Support Staff", "support", "#ef4444", "contacts"],
    ];
    const teamSegments = teamDefinitions.map(([label, keyword, color, icon]) => ({
      label,
      color,
      icon,
      value: allocations.filter((row) =>
        String(row.role || "").toLowerCase().includes(keyword)
      ).length,
    }));
    const categorizedTeamCount = teamSegments.reduce((sum, row) => sum + row.value, 0);
    if (allocations.length > categorizedTeamCount) {
      teamSegments[3].value += allocations.length - categorizedTeamCount;
    }

    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const deadlines = scopedProjects
      .map((project) => {
        const deadline = project.endDate ? new Date(project.endDate) : null;
        if (!deadline || Number.isNaN(deadline.getTime())) return null;
        deadline.setHours(0, 0, 0, 0);
        return {
          id: project.id,
          projectName: project.name,
          deadline: formatDate(project.endDate),
          daysRemaining: Math.ceil((deadline.getTime() - now.getTime()) / 86400000),
        };
      })
      .filter((row) => row && row.daysRemaining >= 0)
      .sort((left, right) => left.daysRemaining - right.daysRemaining)
      .slice(0, 5);

    const recent = [...scopedProjects]
      .sort((left, right) =>
        String(right.updatedAt || right.createdAt || right.id).localeCompare(
          String(left.updatedAt || left.createdAt || left.id)
        )
      )
      .slice(0, 5)
      .map((project) => ({
        id: project.code || project.id,
        name: project.name,
        client: project.companyName || project.client || "-",
        manager: project.projectManager || "-",
        status: project.status || "Draft",
        progress: Math.max(0, Math.min(100, amount(project.progress))),
        budget: budgetFor(project),
        deadline: formatDate(project.endDate),
      }));

    const delayedTasks = scopedProjects.flatMap((project) => (project.tasks || []).map((task) => {
      const due = task.dueDate ? new Date(task.dueDate) : null;
      if (!due || Number.isNaN(due.getTime()) || ["Completed", "Cancelled"].includes(task.status)) return null;
      due.setHours(0, 0, 0, 0);
      const daysDelayed = Math.floor((now.getTime() - due.getTime()) / 86400000);
      return daysDelayed > 0 ? { ...task, projectId: project.id, projectName: project.name, daysDelayed } : null;
    })).filter(Boolean).sort((left, right) => right.daysDelayed - left.daysDelayed);
    const active = scopedProjects.filter((project) => project.status === "Active").length;
    const completed = scopedProjects.filter((project) => project.status === "Completed").length;
    const delayed = scopedProjects.filter((project) => project.status === "Delayed").length;
    const upcomingCount = deadlines.filter((row) => row.daysRemaining <= 30).length;
    return {
      kpis: [
        { id: "total-projects", label: "Total Projects", value: scopedProjects.length, helper: projectFilter === "All" ? "Database records" : "Selected project", icon: "folder", color: "violet" },
        { id: "active-projects", label: "Active Projects", value: active, helper: "Currently executing", icon: "activity", color: "emerald" },
        { id: "completed-projects", label: "Completed Projects", value: completed, helper: "Closed projects", icon: "grid", color: "blue" },
        { id: "delayed-projects", label: "Delayed Projects", value: delayed, helper: "Needs attention", icon: "clock", color: "rose" },
        { id: "delayed-tasks", label: "Delayed Tasks", value: delayedTasks.length, helper: "Past due and incomplete", icon: "clipboard", color: "rose" },
        { id: "upcoming-deadlines", label: "Upcoming Deadlines", value: upcomingCount, helper: "Next 30 days", icon: "calendar", color: "amber" },
        { id: "total-project-cost", label: "Total Project Cost", value: totalBudget, helper: "Approved budgets", icon: "chart", color: "purple", format: "currency" },
      ],
      costSummary: {
        totalBudget,
        utilization,
        segments: [
          { label: "Total Budget", value: totalBudget, color: "#2563eb" },
          { label: "Budget Used", value: budgetUsed, color: "#22c55e" },
          { label: "Remaining Budget", value: remainingBudget, color: "#f59e0b" },
          { label: "On Hold", value: onHoldAmount, color: "#ef4444" },
        ],
      },
      statusRows,
      teamSummary: { total: allocations.length, segments: teamSegments },
      deadlines,
      recent,
      delayedTasks,
    };
  }, [projectFilter, projects]);

  return (
    <div className="space-y-5">
      <section className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-indigo-500">
            Project Management
          </p>
          <h1 className="mt-2 text-2xl font-bold text-slate-950 md:text-3xl">
            Project Dashboard
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Overview of all projects, budgets, teams, deadlines, and key statistics.
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <select
            value={projectFilter}
            onChange={(event) => setProjectFilter(event.target.value)}
            className="min-w-64 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-700 outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100"
            aria-label="Filter dashboard by project"
          >
            <option value="All">All Projects</option>
            {projects.map((project) => <option key={project.id} value={project.id}>{project.name}{project.code ? ` (${project.code})` : ""}</option>)}
          </select>
          <button
            type="button"
            onClick={() => navigate("/project-management/projects")}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700"
          >
            <AppIcon name="plus" className="h-4 w-4" />
            New Project
          </button>
        </div>
      </section>

      {loadError ? (
        <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {loadError}
        </p>
      ) : null}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        {dashboard.kpis.map((item) => (
          <KpiCard key={item.id} item={item} />
        ))}
      </section>

      <DelayedTasks tasks={dashboard.delayedTasks} onOpenMilestones={() => navigate("/project-management/milestones")} />

      <section className="grid gap-4 xl:grid-cols-12">
        <CostSummary summary={dashboard.costSummary} />
        <StatusBarChart rows={dashboard.statusRows} />
      </section>

      <section className="grid gap-4 xl:grid-cols-12">
        <TeamAllocation summary={dashboard.teamSummary} />
        <DeadlineList deadlines={dashboard.deadlines} />
      </section>

      <RecentProjectsTable
        projects={dashboard.recent}
        onOpenProjects={() => navigate("/project-management/projects")}
      />
    </div>
  );
};

export default ProjectDashboard;
