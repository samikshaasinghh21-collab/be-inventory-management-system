import { createElement, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Eye,
  FolderKanban,
  ListChecks,
  Search,
  UserPlus,
  Users,
} from "lucide-react";
import {
  PROJECT_MANAGEMENT_PROJECTS_EVENT,
  hydrateProjectManagementProjects,
  getProjectManagementProjects,
} from "../../services/projectManagementProjectsStore";
import { formatDate } from "../../utils/dateFormat";

const TASK_STATUS_OPTIONS = [
  "All",
  "Not Started",
  "Assigned",
  "In Progress",
  "Under Review",
  "Completed",
  "Blocked",
  "Cancelled",
];

const PRIORITY_OPTIONS = ["All", "Critical", "High", "Medium", "Low"];

const inputClass =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100";

const statusStyles = {
  "Not Started": "border-slate-200 bg-slate-50 text-slate-700",
  Assigned: "border-blue-200 bg-blue-50 text-blue-700",
  "In Progress": "border-emerald-200 bg-emerald-50 text-emerald-700",
  "Under Review": "border-amber-200 bg-amber-50 text-amber-700",
  Completed: "border-violet-200 bg-violet-50 text-violet-700",
  Blocked: "border-rose-200 bg-rose-50 text-rose-700",
  Cancelled: "border-slate-300 bg-slate-200 text-slate-700",
};

const priorityStyles = {
  Critical: "border-red-200 bg-red-50 text-red-700",
  High: "border-orange-200 bg-orange-50 text-orange-700",
  Medium: "border-indigo-200 bg-indigo-50 text-indigo-700",
  Low: "border-slate-200 bg-slate-50 text-slate-700",
};

const numberValue = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const percentValue = (value) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.min(100, Math.round(parsed)));
};

const formatDateValue = (value) => {
  const formatted = formatDate(value);
  return formatted === "-" ? "Not set" : formatted;
};

const isPastDate = (dateValue) => {
  if (!dateValue) return false;
  const due = new Date(dateValue);
  if (Number.isNaN(due.getTime())) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  due.setHours(0, 0, 0, 0);
  return due < today;
};

const getTaskName = (task = {}) =>
  task.taskName || task.title || task.name || "";

const getTaskDescription = (task = {}) =>
  task.description || task.taskDescription || task.notes || "";

const getTaskStatus = (task = {}) => task.status || "Assigned";

const getAssignedTo = (task = {}) => task.assignedTo || task.owner || "";

const getAssignedBy = (task = {}, project = {}) =>
  task.assignedBy || project.projectManager || "Project office";

const getTaskProgress = (task = {}) => {
  const direct = Number(task.progress);
  if (Number.isFinite(direct) && direct > 0) return percentValue(direct);
  const status = getTaskStatus(task);
  if (status === "Completed") return 100;
  if (status === "Under Review") return 85;
  if (status === "In Progress") return 55;
  if (status === "Assigned") return 15;
  return 0;
};

const buildTaskRows = (projects = []) =>
  projects.flatMap((project) =>
    (project.tasks || []).map((task, index) => ({
      ...task,
      taskId: task.taskId || `TSK-${String(index + 1).padStart(3, "0")}`,
      projectId: task.projectId || project.id,
      projectName: task.projectName || project.name,
      projectCode: project.code,
      projectManager: project.projectManager,
      projectStatus: project.status,
      client: project.client || project.companyName,
      assignedBy: getAssignedBy(task, project),
      assignedTo: getAssignedTo(task),
      sortDate: task.createdAt || task.updatedAt || project.updatedAt || project.createdAt,
    }))
  );

const sortTaskRows = (rows = []) =>
  [...rows].sort((a, b) => {
    const dateA = new Date(a.sortDate || 0).getTime() || 0;
    const dateB = new Date(b.sortDate || 0).getTime() || 0;
    if (dateA !== dateB) return dateB - dateA;
    return String(a.taskId || "").localeCompare(String(b.taskId || ""));
  });

const Badge = ({ label, type = "status" }) => {
  const styles = type === "priority" ? priorityStyles : statusStyles;
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${
        styles[label] || "border-slate-200 bg-slate-100 text-slate-700"
      }`}
    >
      {label || "-"}
    </span>
  );
};

const ProgressMeter = ({ value }) => (
  <div className="flex min-w-[130px] items-center gap-3">
    <div className="h-2 w-20 overflow-hidden rounded-full bg-slate-200">
      <div
        className="h-full rounded-full bg-emerald-500"
        style={{ width: `${percentValue(value)}%` }}
      />
    </div>
    <span className="text-xs font-semibold text-slate-600">
      {percentValue(value)}%
    </span>
  </div>
);

const KpiCard = ({ icon: IconComponent, label, value, helper, tone = "indigo" }) => {
  const toneClasses = {
    indigo: "bg-indigo-50 text-indigo-600",
    emerald: "bg-emerald-50 text-emerald-600",
    rose: "bg-rose-50 text-rose-600",
    violet: "bg-violet-50 text-violet-600",
    amber: "bg-amber-50 text-amber-600",
    slate: "bg-slate-100 text-slate-600",
  };

  return (
    <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <span
          className={`grid h-10 w-10 shrink-0 place-items-center rounded-lg ${
            toneClasses[tone] || toneClasses.indigo
          }`}
        >
          {createElement(IconComponent, { className: "h-5 w-5" })}
        </span>
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            {label}
          </p>
          <p className="mt-1 text-xl font-bold text-slate-950">{value}</p>
          <p className="mt-1 truncate text-xs text-slate-500">{helper}</p>
        </div>
      </div>
    </article>
  );
};

const DetailItem = ({ label, value }) => (
  <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
      {label}
    </p>
    <p className="mt-2 text-sm font-medium text-slate-900">{value || "-"}</p>
  </div>
);

const TaskDetailDrawer = ({ task, onClose, onViewProject }) => {
  if (!task) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/40 backdrop-blur-sm">
      <div className="flex h-full w-full max-w-2xl flex-col overflow-hidden bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-6 py-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-indigo-500">
              Task Details
            </p>
            <h2 className="mt-2 text-2xl font-bold text-slate-950">
              {getTaskName(task) || task.taskId || "Task"}
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Review assignment, schedule, ownership, and delivery progress.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-600 transition hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-700"
          >
            Close
          </button>
        </div>

        <div className="flex-1 space-y-6 overflow-y-auto px-6 py-6">
          <div className="flex flex-wrap items-center gap-3">
            <Badge label={getTaskStatus(task)} />
            <Badge label={task.priority || "Medium"} type="priority" />
            <span className="text-sm text-slate-500">
              {task.taskId || "No task ID"} • {task.projectName || "No project"}
            </span>
          </div>

          <section className="grid gap-4 md:grid-cols-2">
            <DetailItem label="Project" value={task.projectName || "-"} />
            <DetailItem label="Project Code" value={task.projectCode || "-"} />
            <DetailItem label="Client" value={task.client || "-"} />
            <DetailItem label="Project Manager" value={task.projectManager || "-"} />
            <DetailItem label="Assigned To" value={task.assignedTo || "-"} />
            <DetailItem label="Assigned By" value={task.assignedBy || "-"} />
            <DetailItem label="Start Date" value={formatDateValue(task.startDate)} />
            <DetailItem label="Due Date" value={formatDateValue(task.dueDate)} />
            <DetailItem
              label="Estimated Hours"
              value={numberValue(task.estimatedHours).toLocaleString("en-IN")}
            />
            <DetailItem
              label="Progress"
              value={`${percentValue(getTaskProgress(task))}%`}
            />
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
              Description
            </h3>
            <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-700">
              {getTaskDescription(task) || "No description added for this task yet."}
            </p>
          </section>

          <section className="grid gap-4 md:grid-cols-2">
            <DetailItem label="Dependencies" value={task.dependencies || "-"} />
            <DetailItem label="Project Status" value={task.projectStatus || "-"} />
            <DetailItem
              label="Created"
              value={formatDateValue(task.createdAt || task.sortDate)}
            />
            <DetailItem
              label="Last Updated"
              value={formatDateValue(task.updatedAt || task.sortDate)}
            />
          </section>

          <section className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
              Notes
            </h3>
            <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-700">
              {task.notes || task.comments || "No notes added for this task yet."}
            </p>
          </section>
        </div>

        <div className="flex flex-col gap-3 border-t border-slate-200 px-6 py-4 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onViewProject}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-700"
          >
            <FolderKanban className="h-4 w-4" />
            View Project
          </button>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-700"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};

const ProjectManagementTasks = () => {
  const navigate = useNavigate();
  const [projects, setProjects] = useState(() => getProjectManagementProjects());
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [priorityFilter, setPriorityFilter] = useState("All");
  const [ownerFilter, setOwnerFilter] = useState("All");
  const [selectedTask, setSelectedTask] = useState(null);

  useEffect(() => {
    const handleProjectsChange = () => setProjects(getProjectManagementProjects());
    if (typeof window !== "undefined") {
      window.addEventListener(
        PROJECT_MANAGEMENT_PROJECTS_EVENT,
        handleProjectsChange
      );
      window.addEventListener("projects:changed", handleProjectsChange);
    }
    void hydrateProjectManagementProjects().then(setProjects);

    return () => {
      if (typeof window !== "undefined") {
        window.removeEventListener(
          PROJECT_MANAGEMENT_PROJECTS_EVENT,
          handleProjectsChange
        );
        window.removeEventListener("projects:changed", handleProjectsChange);
      }
    };
  }, []);

  const taskRows = useMemo(
    () => sortTaskRows(buildTaskRows(projects)),
    [projects]
  );

  const ownerOptions = useMemo(
    () =>
      Array.from(new Set(taskRows.map((task) => task.assignedTo).filter(Boolean))).sort(),
    [taskRows]
  );

  const filteredTasks = useMemo(() => {
    const term = search.trim().toLowerCase();
    return taskRows.filter((task) => {
      const status = getTaskStatus(task);
      if (statusFilter !== "All" && status !== statusFilter) return false;
      if (priorityFilter !== "All" && task.priority !== priorityFilter) {
        return false;
      }
      if (ownerFilter !== "All" && task.assignedTo !== ownerFilter) return false;
      if (!term) return true;

      return [
        task.taskId,
        getTaskName(task),
        getTaskDescription(task),
        task.projectName,
        task.projectCode,
        task.client,
        task.assignedTo,
        task.assignedBy,
        task.priority,
        status,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(term));
    });
  }, [ownerFilter, priorityFilter, search, statusFilter, taskRows]);

  const metrics = useMemo(() => {
    const total = taskRows.length;
    const completed = taskRows.filter(
      (task) => getTaskStatus(task) === "Completed"
    ).length;
    const inProgress = taskRows.filter((task) =>
      ["Assigned", "In Progress", "Under Review"].includes(getTaskStatus(task))
    ).length;
    const blocked = taskRows.filter((task) =>
      ["Blocked", "Cancelled"].includes(getTaskStatus(task))
    ).length;
    const overdue = taskRows.filter(
      (task) => getTaskStatus(task) !== "Completed" && isPastDate(task.dueDate)
    ).length;

    return { total, completed, inProgress, blocked, overdue };
  }, [taskRows]);

  const kpis = [
    {
      label: "Total Tasks",
      value: metrics.total.toLocaleString("en-IN"),
      helper: "Across all projects",
      icon: ListChecks,
      tone: "indigo",
    },
    {
      label: "Active Tasks",
      value: metrics.inProgress.toLocaleString("en-IN"),
      helper: "Assigned or in motion",
      icon: Clock3,
      tone: "emerald",
    },
    {
      label: "Overdue",
      value: metrics.overdue.toLocaleString("en-IN"),
      helper: "Past due date",
      icon: AlertTriangle,
      tone: "rose",
    },
    {
      label: "Completed",
      value: metrics.completed.toLocaleString("en-IN"),
      helper: "Closed tasks",
      icon: CheckCircle2,
      tone: "violet",
    },
    {
      label: "Blocked",
      value: metrics.blocked.toLocaleString("en-IN"),
      helper: "Needs attention",
      icon: CalendarDays,
      tone: "amber",
    },
  ];

  return (
    <div className="space-y-5">
      <section className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-indigo-500">
            Project Management
          </p>
          <h1 className="mt-2 text-2xl font-bold text-slate-950 md:text-3xl">
            Tasks
          </h1>
          <p className="mt-1 max-w-3xl text-sm text-slate-500">
            Track assigned project tasks, owners, due dates, status, and progress.
          </p>
        </div>
        <button
          type="button"
          onClick={() => navigate("/project-management/projects")}
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700"
        >
          <UserPlus className="h-4 w-4" />
          Assign Task
        </button>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {kpis.map((item) => (
          <KpiCard key={item.label} {...item} />
        ))}
      </section>

      <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 p-4">
          <div className="grid gap-3 lg:grid-cols-[1fr_180px_180px_220px]">
            <label className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search tasks, projects, owners..."
                className={`${inputClass} pl-9`}
              />
            </label>
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              className={inputClass}
            >
              {TASK_STATUS_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option === "All" ? "All Status" : option}
                </option>
              ))}
            </select>
            <select
              value={priorityFilter}
              onChange={(event) => setPriorityFilter(event.target.value)}
              className={inputClass}
            >
              {PRIORITY_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option === "All" ? "All Priority" : option}
                </option>
              ))}
            </select>
            <select
              value={ownerFilter}
              onChange={(event) => setOwnerFilter(event.target.value)}
              className={inputClass}
            >
              <option value="All">All Assigned To</option>
              {ownerOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-[1540px] w-full text-sm">
            <thead className="bg-slate-100 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3 text-left font-semibold">Task ID</th>
                <th className="px-4 py-3 text-left font-semibold">Task Name</th>
                <th className="px-4 py-3 text-left font-semibold">Project</th>
                <th className="px-4 py-3 text-left font-semibold">Client</th>
                <th className="px-4 py-3 text-left font-semibold">Assigned To</th>
                <th className="px-4 py-3 text-left font-semibold">Assigned By</th>
                <th className="px-4 py-3 text-left font-semibold">Start Date</th>
                <th className="px-4 py-3 text-left font-semibold">Due Date</th>
                <th className="px-4 py-3 text-left font-semibold">Priority</th>
                <th className="px-4 py-3 text-left font-semibold">Status</th>
                <th className="px-4 py-3 text-left font-semibold">Progress</th>
                <th className="px-4 py-3 text-right font-semibold">
                  Estimated Hours
                </th>
                <th className="px-4 py-3 text-left font-semibold">Dependencies</th>
                <th className="px-4 py-3 text-left font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {filteredTasks.length === 0 ? (
                <tr>
                  <td colSpan="14" className="px-4 py-14 text-center">
                    <div className="flex flex-col items-center">
                      <span className="grid h-14 w-14 place-items-center rounded-xl bg-indigo-50 text-indigo-600">
                        <ListChecks className="h-6 w-6" />
                      </span>
                      <h3 className="mt-4 text-base font-semibold text-slate-900">
                        {taskRows.length
                          ? "No matching tasks found"
                          : "No tasks assigned yet"}
                      </h3>
                      <p className="mt-2 max-w-md text-sm text-slate-500">
                        Assign tasks from the Projects page and they will appear here.
                      </p>
                      <button
                        type="button"
                        onClick={() => navigate("/project-management/projects")}
                        className="mt-5 inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700"
                      >
                        <UserPlus className="h-4 w-4" />
                        Go to Projects
                      </button>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredTasks.map((task) => (
                  <tr key={`${task.projectId}-${task.id}`} className="hover:bg-slate-50">
                    <td className="px-4 py-4 font-semibold text-slate-700">
                      {task.taskId || "-"}
                    </td>
                    <td className="px-4 py-4">
                      <p className="font-semibold text-slate-950">
                        {getTaskName(task) || "-"}
                      </p>
                      <p className="mt-1 line-clamp-1 text-xs text-slate-500">
                        {getTaskDescription(task) || "No description"}
                      </p>
                    </td>
                    <td className="px-4 py-4">
                      <p className="font-semibold text-slate-800">
                        {task.projectName || "-"}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        {task.projectCode || "No project code"}
                      </p>
                    </td>
                    <td className="px-4 py-4 text-slate-600">
                      {task.client || "-"}
                    </td>
                    <td className="px-4 py-4 text-slate-600">
                      <span className="inline-flex items-center gap-2">
                        <Users className="h-4 w-4 text-slate-400" />
                        {task.assignedTo || "-"}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-slate-600">
                      {task.assignedBy || "-"}
                    </td>
                    <td className="px-4 py-4 text-slate-600">
                      {formatDateValue(task.startDate)}
                    </td>
                    <td className="px-4 py-4 text-slate-600">
                      {formatDateValue(task.dueDate)}
                    </td>
                    <td className="px-4 py-4">
                      <Badge label={task.priority || "Medium"} type="priority" />
                    </td>
                    <td className="px-4 py-4">
                      <Badge label={getTaskStatus(task)} />
                    </td>
                    <td className="px-4 py-4">
                      <ProgressMeter value={getTaskProgress(task)} />
                    </td>
                    <td className="px-4 py-4 text-right font-semibold text-slate-900">
                      {numberValue(task.estimatedHours).toLocaleString("en-IN")}
                    </td>
                    <td className="px-4 py-4 text-slate-600">
                      {task.dependencies || "-"}
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setSelectedTask(task)}
                          className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 transition hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-700"
                        >
                          <Eye className="h-4 w-4" />
                          View
                        </button>
                        <button
                          type="button"
                          onClick={() => navigate("/project-management/projects")}
                          className="inline-flex items-center justify-center gap-2 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs font-semibold text-indigo-700 transition hover:bg-indigo-100"
                        >
                          <FolderKanban className="h-4 w-4" />
                          Project
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-600">
              <FolderKanban className="h-5 w-5" />
            </span>
            <div>
              <h2 className="text-base font-semibold text-slate-950">
                Task assignments come from project records
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                Create or assign a task from any project and this register updates from localStorage.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => navigate("/project-management/projects")}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-indigo-200 bg-indigo-50 px-4 py-2.5 text-sm font-semibold text-indigo-700 transition hover:bg-indigo-100"
          >
            <UserPlus className="h-4 w-4" />
            Assign from Projects
          </button>
        </div>
      </section>

      {selectedTask && (
        <TaskDetailDrawer
          task={selectedTask}
          onClose={() => setSelectedTask(null)}
          onViewProject={() => {
            setSelectedTask(null);
            navigate("/project-management/projects");
          }}
        />
      )}
    </div>
  );
};

export default ProjectManagementTasks;
