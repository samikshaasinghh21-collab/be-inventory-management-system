import StatusBadge from "../../components/common/StatusBadge";
import { PageHeader, MetricCard as SharedMetricCard, DataTable, Avatar } from "../../components/ui";
import "../../styles/projects.css";
import { createElement, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Eye,
  FolderKanban,
  ListChecks,
  Pencil,
  Search,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import {
  PROJECT_MANAGEMENT_PROJECTS_EVENT,
  hydrateProjectManagementProjects,
  getProjectManagementProjects,
} from "../../services/projectManagementProjectsStore";
import {
  fetchTaskHistory,
  downloadAuthenticatedFile,
  updateProjectTask,
} from "../../services/projectManagementApi";
import { formatDate } from "../../utils/dateFormat";

const TASK_STATUS_OPTIONS = [
  "All",
  "Pending",
  "Partial",
  "Completed",
  "Cancelled",
];

const PRIORITY_OPTIONS = ["All", "Critical", "High", "Medium", "Low"];
const TASK_ATTACHMENT_MAX_BYTES = 25 * 1024 * 1024;
const TASK_ATTACHMENT_EXTENSIONS = new Set([
  "pdf", "jpg", "jpeg", "png", "webp", "dwg", "dxf", "docx", "xlsx",
  "pptx", "txt", "csv", "zip",
]);

const inputClass =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-teal-300 focus:ring-2 focus:ring-teal-100";



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

const getTaskStatus = (task = {}) => task.status || "Pending";

const getAssignedTo = (task = {}) => task.assignedTo || task.owner || "";

const getAssignedBy = (task = {}, project = {}) =>
  task.assignedBy || project.projectManager || "Project office";

const getTaskProgress = (task = {}) => {
  const direct = Number(task.progress);
  if (Number.isFinite(direct) && direct > 0) return percentValue(direct);
  const status = getTaskStatus(task);
  if (status === "Completed") return 100;
  if (status === "Partial") return percentValue(task.completionPercentage);
  return 0;
};

const validateTaskUpdate = (form, attachments = []) => {
  const completion = Number(form.completionPercentage);
  if (form.status === "Partial") {
    if (!Number.isFinite(completion) || completion < 1 || completion > 99) {
      return "Partial progress must be between 1% and 99%.";
    }
    if (!form.remainingWorkRemarks.trim()) {
      return "Enter the remaining work before saving Partial progress.";
    }
  }
  if (attachments.length > 8) {
    return "Attach no more than 8 files to one task update.";
  }
  for (const file of attachments) {
    const extension = String(file.name || "").split(".").pop()?.toLowerCase();
    if (!TASK_ATTACHMENT_EXTENSIONS.has(extension)) {
      return `${file.name} is not a supported attachment type.`;
    }
    if (file.size > TASK_ATTACHMENT_MAX_BYTES) {
      return `${file.name} exceeds the 25 MB attachment limit.`;
    }
  }
  return "";
};

const TaskUpdateModal = ({ task, onClose, onSaved }) => {
  const [form, setForm] = useState({
    status: getTaskStatus(task),
    completionPercentage: getTaskProgress(task),
    remainingWorkRemarks: task.remainingWorkRemarks || "",
    progressRemarks: "",
    remarks: task.remarks || "",
    assignedEmployeeName: task.assignedTo || "",
    dueDate: task.dueDate ? String(task.dueDate).slice(0, 10) : "",
  });
  const [attachments, setAttachments] = useState([]);
  const [history, setHistory] = useState([]);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void fetchTaskHistory(task.id).then((result) => setHistory(result.history || [])).catch(() => {});
  }, [task.id]);

  const setField = (key, value) => {
    setForm((current) => ({ ...current, [key]: value }));
    setError("");
  };
  const changeStatus = (status) => {
    setForm((current) => ({
      ...current,
      status,
      completionPercentage:
        status === "Completed"
          ? 100
          : status === "Pending"
            ? 0
            : status === "Partial" &&
                (Number(current.completionPercentage) < 1 ||
                  Number(current.completionPercentage) > 99)
              ? 1
              : current.completionPercentage,
    }));
    setError("");
  };
  const save = async () => {
    const validationError = validateTaskUpdate(form, attachments);
    if (validationError) {
      setError(validationError);
      return;
    }
    setSaving(true);
    setError("");
    try {
      await updateProjectTask(
        task.id,
        {
          ...form,
          completionPercentage:
            form.status === "Completed"
              ? 100
              : form.status === "Pending"
                ? 0
                : percentValue(form.completionPercentage),
        },
        attachments
      );
      await onSaved();
      onClose();
    } catch (saveError) {
      setError(saveError?.response?.data?.error || saveError.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] grid place-items-center bg-slate-950/45 p-4 ">
      <div className="max-h-[94vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-teal-500">Update Task</p>
            <h2 className="mt-1 text-xl font-bold text-slate-950">{getTaskName(task)}</h2>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="grid gap-4 p-6 md:grid-cols-2">
          <label className="text-sm font-medium text-slate-700">
            Status
            <select className={`${inputClass} mt-1`} value={form.status} onChange={(event) => changeStatus(event.target.value)}>
              {TASK_STATUS_OPTIONS.filter((item) => item !== "All").map((item) => <option key={item}>{item}</option>)}
            </select>
          </label>
          <label className="text-sm font-medium text-slate-700">
            Completion %
            <input className={`${inputClass} mt-1`} type="number" min="0" max="100"
              disabled={form.status === "Pending" || form.status === "Completed"}
              value={form.completionPercentage}
              onChange={(event) => setField("completionPercentage", event.target.value)} />
          </label>
          {form.status === "Partial" && (
            <label className="text-sm font-medium text-slate-700 md:col-span-2">
              Remaining-work remarks *
              <textarea className={`${inputClass} mt-1`} rows="3" value={form.remainingWorkRemarks}
                onChange={(event) => setField("remainingWorkRemarks", event.target.value)} />
              <span className="mt-1 block text-xs font-normal text-slate-500">
                Required for Partial status; record what work is still pending.
              </span>
            </label>
          )}
          <label className="text-sm font-medium text-slate-700">
            Assigned employee
            <input className={`${inputClass} mt-1`} value={form.assignedEmployeeName}
              onChange={(event) => setField("assignedEmployeeName", event.target.value)} />
          </label>
          <label className="text-sm font-medium text-slate-700">
            Due date
            <input className={`${inputClass} mt-1`} type="date" value={form.dueDate}
              onChange={(event) => setField("dueDate", event.target.value)} />
          </label>
          <label className="text-sm font-medium text-slate-700 md:col-span-2">
            Progress remarks
            <textarea className={`${inputClass} mt-1`} rows="2" value={form.progressRemarks}
              onChange={(event) => setField("progressRemarks", event.target.value)} />
          </label>
          <label className="text-sm font-medium text-slate-700 md:col-span-2">
            General remarks
            <textarea className={`${inputClass} mt-1`} rows="2" value={form.remarks}
              onChange={(event) => setField("remarks", event.target.value)} />
          </label>
          <label className="text-sm font-medium text-slate-700 md:col-span-2">
            Attachments
            <input className={`${inputClass} mt-1`} type="file" multiple
              accept=".pdf,.jpg,.jpeg,.png,.webp,.dwg,.dxf,.docx,.xlsx,.pptx,.txt,.csv,.zip"
              onChange={(event) => {
                setAttachments(Array.from(event.target.files || []));
                setError("");
              }} />
            <span className="mt-1 block text-xs font-normal text-slate-500">
              PDF, image, drawing, Office, text, CSV, or ZIP files up to 25 MB each.
            </span>
          </label>
          {error && <p className="md:col-span-2 rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
          <section className="md:col-span-2">
            <h3 className="font-semibold text-slate-900">Update history</h3>
            <div className="mt-2 max-h-52 space-y-2 overflow-y-auto">
              {!history.length ? <p className="text-sm text-slate-500">No updates recorded yet.</p> : history.map((item) => (
                <div key={item.id} className="rounded-lg border border-slate-200 p-3 text-sm">
                  <p className="font-medium text-slate-800">{item.updatedBy} · {formatDateValue(item.updatedAt)}</p>
                  <p className="mt-1 text-slate-500">{item.changedFields.join(", ") || "Remarks/attachments updated"}</p>
                  {item.progressRemarks && <p className="mt-1 text-slate-700">{item.progressRemarks}</p>}
                  {item.attachments?.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {item.attachments.map((file) => (
                        <button
                          key={file.id}
                          type="button"
                          onClick={() => downloadAuthenticatedFile(file.downloadUrl, file.name)}
                          className="rounded-md bg-teal-50 px-2 py-1 text-xs font-semibold text-teal-700"
                        >
                          {file.name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>
        </div>
        <div className="flex justify-end gap-2 border-t border-slate-200 px-6 py-4">
          <button type="button" onClick={onClose} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold">Cancel</button>
          <button type="button" disabled={saving} onClick={save} className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">
            {saving ? "Saving..." : "Save Update"}
          </button>
        </div>
      </div>
    </div>
  );
};

const buildTaskRows = (projects = []) =>
  projects.flatMap((project) =>
    (project.tasks || []).map((task, index) => ({
      ...task,
      taskId: task.taskId || `TSK-${String(index + 1).padStart(3, "0")}`,
      projectId: task.projectId || project.id,
      projectName: task.projectName || project.name,
      projectCode: project.code,
      milestoneId: task.milestoneId,
      milestoneName: task.milestoneName || "Unassigned milestone",
      milestoneNumber: task.milestoneNumber || "",
      stage: task.stage || "Implement",
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

const Badge = ({ label, status, children }) => <StatusBadge status={status || label || children} />;

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

const KpiCard = ({ icon, label, value, helper, tone = "", style = "" }) => (
  <SharedMetricCard icon={icon} label={label} value={value} hint={helper}
    tone={/rose|red/.test(tone || style) ? "danger" : /amber|orange/.test(tone || style) ? "warning" : "neutral"} />
);

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
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/40 ">
      <div className="flex h-full w-full max-w-2xl flex-col overflow-hidden bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-6 py-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-teal-500">
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
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-600 transition hover:border-teal-200 hover:bg-teal-50 hover:text-teal-700"
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
            <DetailItem label="Stage" value={task.stage || "-"} />
            <DetailItem label="Milestone" value={task.milestoneName || "-"} />
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
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-teal-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-teal-700"
          >
            <FolderKanban className="h-4 w-4" />
            View Project
          </button>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-teal-200 hover:bg-teal-50 hover:text-teal-700"
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
  const [query] = useSearchParams();
  const [viewMode, setViewMode] = useState("table");
  const [onlyOverdue, setOnlyOverdue] = useState(() => query.get("view") === "overdue");
  const [projects, setProjects] = useState(() => getProjectManagementProjects());
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [priorityFilter, setPriorityFilter] = useState("All");
  const [ownerFilter, setOwnerFilter] = useState("All");
  const [selectedTask, setSelectedTask] = useState(null);
  const [taskToUpdate, setTaskToUpdate] = useState(null);
  const [loadError, setLoadError] = useState("");

  const reload = async () => {
    const rows = await hydrateProjectManagementProjects();
    setProjects(rows);
    setLoadError("");
  };

  useEffect(() => {
    const handleProjectsChange = () => setProjects(getProjectManagementProjects());
    if (typeof window !== "undefined") {
      window.addEventListener(
        PROJECT_MANAGEMENT_PROJECTS_EVENT,
        handleProjectsChange
      );
      window.addEventListener("projects:changed", handleProjectsChange);
    }
    void hydrateProjectManagementProjects()
      .then(setProjects)
      .catch((error) =>
        setLoadError(
          error?.response?.data?.error ||
            error?.message ||
            "Project tasks could not be loaded."
        )
      );

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
      if (onlyOverdue && (["Completed", "Cancelled"].includes(status) || !isPastDate(task.dueDate))) return false;
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
        task.milestoneName,
        task.milestoneNumber,
        task.stage,
        task.client,
        task.assignedTo,
        task.assignedBy,
        task.priority,
        status,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(term));
    });
  }, [onlyOverdue, ownerFilter, priorityFilter, search, statusFilter, taskRows]);

  const metrics = useMemo(() => {
    const total = taskRows.length;
    const completed = taskRows.filter(
      (task) => getTaskStatus(task) === "Completed"
    ).length;
    const inProgress = taskRows.filter((task) =>
      ["Pending", "Partial"].includes(getTaskStatus(task))
    ).length;
    const blocked = taskRows.filter((task) =>
      ["Cancelled"].includes(getTaskStatus(task))
    ).length;
    const overdue = taskRows.filter(
      (task) => !["Completed", "Cancelled"].includes(getTaskStatus(task)) && isPastDate(task.dueDate)
    ).length;

    return { total, completed, inProgress, blocked, overdue };
  }, [taskRows]);

  const kpis = [
    {
      label: "Total Tasks",
      value: metrics.total.toLocaleString("en-IN"),
      helper: "Across all projects",
      icon: ListChecks,
      tone: "teal",
    },
    {
      label: "Active Tasks",
      value: metrics.inProgress.toLocaleString("en-IN"),
      helper: "Pending or partially complete",
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
      tone: "teal",
    },
    {
      label: "Cancelled",
      value: metrics.blocked.toLocaleString("en-IN"),
      helper: "Excluded from progress averages",
      icon: CalendarDays,
      tone: "amber",
    },
  ];

  return (
    <div className="pm-workspace space-y-5">
      <PageHeader eyebrow="Project management" title="Tasks" description="Tasks are organized by project stage and always remain under their milestone." actions={<>
<button
          type="button"
          onClick={() => navigate("/project-management/milestones")}
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-teal-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-teal-700"
        >
          <UserPlus className="h-4 w-4" />
          Open Milestones
        </button>
        </>} />

      {loadError ? (
        <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {loadError}
        </p>
      ) : null}

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

        <div className="pm-table-toolbar">
          <p><strong>{filteredTasks.length}</strong> tasks in view ? Open a task for dependencies and full assignment details.</p>
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" className="pm-inline-button" aria-pressed={onlyOverdue} onClick={() => setOnlyOverdue(!onlyOverdue)}><AlertTriangle size={14} />{onlyOverdue ? "Showing overdue" : "Overdue only"}</button>
            <div className="pm-segmented" aria-label="Task display">
              <button type="button" aria-pressed={viewMode === "table"} onClick={() => setViewMode("table")}>List</button>
              <button type="button" aria-pressed={viewMode === "board"} onClick={() => setViewMode("board")}>Board</button>
            </div>
          </div>
        </div>
        {viewMode === "table" ? <DataTable rows={filteredTasks} rowKey="id" pageSize={15} emptyTitle={taskRows.length ? "No tasks match your filters" : "No tasks assigned yet"} emptyDescription="Create tasks within a milestone to connect assignments with project delivery." columns={[
          { key: "taskName", label: "Task", sortable: true, render: (task) => <div className="pm-task-summary"><button type="button" className="pm-link" onClick={() => setSelectedTask(task)}>{getTaskName(task) || "Untitled task"}</button><p>{task.taskId} ? {task.stage} ? {task.milestoneName || "No milestone"}</p></div> },
          { key: "projectName", label: "Project", sortable: true, render: (task) => <div><p className="font-medium">{task.projectName || "Unlinked project"}</p><p className="mt-1 text-xs text-slate-500">{task.client || task.projectCode}</p></div> },
          { key: "assignedTo", label: "Assignee", sortable: true, render: (task) => <span className="flex items-center gap-2"><Avatar name={task.assignedTo || "Unassigned"} size="sm" /><span>{task.assignedTo || "Unassigned"}</span></span> },
          { key: "dueDate", label: "Due date", sortable: true, render: (task) => <div className={!['Completed','Cancelled'].includes(getTaskStatus(task)) && isPastDate(task.dueDate) ? "pm-task-due--overdue" : "whitespace-nowrap"}>{formatDateValue(task.dueDate)}{!['Completed','Cancelled'].includes(getTaskStatus(task)) && isPastDate(task.dueDate) && <p className="mt-1 text-xs">Overdue</p>}</div> },
          { key: "priority", label: "Priority", render: (task) => <Badge label={task.priority || "Medium"} /> },
          { key: "status", label: "Status", render: (task) => <Badge label={getTaskStatus(task)} /> },
          { key: "progress", label: "Progress", render: (task) => <ProgressMeter value={getTaskProgress(task)} /> },
          { key: "actions", label: "", render: (task) => <div className="pm-row-actions"><button type="button" aria-label={`View ${getTaskName(task)}`} title="View task" onClick={() => setSelectedTask(task)}><Eye size={15} /></button><button type="button" aria-label={`Update ${getTaskName(task)}`} title="Update progress" onClick={() => setTaskToUpdate(task)}><Pencil size={15} /></button></div> },
        ]} /> : <div className="pm-task-board">
          {TASK_STATUS_OPTIONS.filter((status) => status !== "All").map((status) => {
            const tasks = filteredTasks.filter((task) => getTaskStatus(task) === status);
            return <section className="pm-task-column" key={status}><header><Badge label={status} /><span>{tasks.length}</span></header>
              {tasks.map((task) => <article key={`${task.projectId}-${task.id}`} className={`pm-task-card ${!['Completed','Cancelled'].includes(status) && isPastDate(task.dueDate) ? "pm-task-card--overdue" : ""}`}>
                <button type="button" onClick={() => setSelectedTask(task)}>{getTaskName(task)}</button><p>{task.projectName} ? {task.milestoneName}</p>
                <div className="mt-3"><ProgressMeter value={getTaskProgress(task)} /></div>
                <p>{task.assignedTo || "Unassigned"} ? Due {formatDateValue(task.dueDate)}</p>
                <footer><Badge label={task.priority || "Medium"} /><button type="button" className="pm-link text-xs" onClick={() => setTaskToUpdate(task)}>Update</button></footer>
              </article>)}
              {!tasks.length && <p className="py-5 text-center text-xs text-slate-500">No {status.toLowerCase()} tasks</p>}
            </section>;
          })}
        </div>}
      </section>

      <p className="text-xs text-slate-500">Tasks stay connected to their milestone. Use Update to record progress, remarks and supporting documents.</p>

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
      {taskToUpdate && (
        <TaskUpdateModal
          task={taskToUpdate}
          onClose={() => setTaskToUpdate(null)}
          onSaved={reload}
        />
      )}
    </div>
  );
};

export default ProjectManagementTasks;
