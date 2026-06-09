import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import AppIcon from "../../components/layout/AppIcon";
import { formatInrCurrency } from "../../utils/formatters";
import {
  projectCostSummary,
  projectKpis,
  projectStatusSummary,
  recentProjects,
  teamAllocationSummary,
  upcomingDeadlines,
} from "./projectManagementData";

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
  "In Progress": "bg-emerald-50 text-emerald-700",
  "On Hold": "bg-amber-50 text-amber-700",
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

const CostSummary = () => (
  <SectionCard title="Project Cost Summary" className="xl:col-span-5">
    <div className="grid gap-6 lg:grid-cols-[240px_1fr] lg:items-center">
      <div className="flex justify-center">
        <DonutChart
          segments={projectCostSummary.segments}
          centerValue={formatInrCurrency(projectCostSummary.totalBudget)}
          centerLabel="Total Budget"
        />
      </div>

      <div className="space-y-4">
        {projectCostSummary.segments.map((segment) => (
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
          style={{ width: `${projectCostSummary.utilization}%` }}
        />
      </div>
      <span className="text-sm font-semibold text-blue-700">
        {projectCostSummary.utilization}%
      </span>
    </div>
  </SectionCard>
);

const StatusBarChart = () => {
  const maxValue = Math.max(...projectStatusSummary.map((item) => item.value), 1);

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
        {projectStatusSummary.map((status) => {
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

const TeamAllocation = () => {
  const totalRow = {
    label: "Total Employees Allocated",
    value: teamAllocationSummary.total,
    color: "#2563eb",
    icon: "users",
  };
  const rows = [totalRow, ...teamAllocationSummary.segments];

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
            segments={teamAllocationSummary.segments}
            centerValue={teamAllocationSummary.total}
            centerLabel="Total"
            sizeClass="h-40 w-40"
          />
        </div>
      </div>
    </SectionCard>
  );
};

const DeadlineList = () => (
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
      {upcomingDeadlines.map((item) => (
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
      ))}
    </div>
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

const RecentProjectsTable = () => (
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
          {recentProjects.map((project) => (
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
                    className="grid h-9 w-9 place-items-center rounded-lg border border-slate-200 text-slate-500 transition hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-700"
                    aria-label={`View ${project.name}`}
                    title="View project"
                  >
                    <AppIcon name="file" className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    className="grid h-9 w-9 place-items-center rounded-lg border border-slate-200 text-slate-500 transition hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-700"
                    aria-label={`Edit ${project.name}`}
                    title="Edit project"
                  >
                    <AppIcon name="edit" className="h-4 w-4" />
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </SectionCard>
);

const ProjectDashboard = () => {
  const navigate = useNavigate();

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
          <button
            type="button"
            onClick={() => navigate("/project-management/projects")}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700"
          >
            <AppIcon name="plus" className="h-4 w-4" />
            New Project
          </button>
          <select className="rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100">
            <option>May 2024</option>
            <option>June 2024</option>
            <option>July 2024</option>
          </select>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        {projectKpis.map((item) => (
          <KpiCard key={item.id} item={item} />
        ))}
      </section>

      <section className="grid gap-4 xl:grid-cols-12">
        <CostSummary />
        <StatusBarChart />
      </section>

      <section className="grid gap-4 xl:grid-cols-12">
        <TeamAllocation />
        <DeadlineList />
      </section>

      <RecentProjectsTable />
    </div>
  );
};

export default ProjectDashboard;
