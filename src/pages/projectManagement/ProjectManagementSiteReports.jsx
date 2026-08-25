import { createElement, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CalendarDays,
  Camera,
  CheckCircle2,
  ChevronDown,
  ClipboardCheck,
  Download,
  Eye,
  FileText,
  HardHat,
  Image,
  Pencil,
  Plus,
  Printer,
  Search,
  Send,
  ShieldCheck,
  Trash2,
  Users,
  X,
} from "lucide-react";
import DateInput from "../../components/common/DateInput";
import {
  PROJECT_MANAGEMENT_PROJECTS_EVENT,
  getProjectManagementProjects,
  hydrateProjectManagementProjects,
} from "../../services/projectManagementProjectsStore";
import { siteReportsService } from "../../services/siteReportsService";
import { downloadAuthenticatedFile } from "../../services/projectManagementApi";
import { formatDate } from "../../utils/dateFormat";
import { printSection } from "../../utils/printUtils";
import { getCurrentUser, isManager } from "../../services/authService";

const inputClass =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100";
const sectionClass =
  "rounded-xl border border-slate-200 bg-white p-4 shadow-sm";
const shifts = ["General", "Morning", "Evening", "Night"];
const weatherOptions = [
  "Clear",
  "Cloudy",
  "Rain",
  "Heavy Rain",
  "Hot",
  "Windy",
];
const statuses = ["All", "Draft", "Submitted", "Approved", "Rejected"];
const severities = ["Low", "Medium", "High", "Critical"];
const photoCategories = [
  "Progress",
  "Safety",
  "Quality",
  "Material",
  "Issue",
  "Other",
];
const today = () => new Date().toISOString().slice(0, 10);
const uid = (prefix) =>
  `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
const n = (value) => Math.max(Number(value) || 0, 0);

const emptyForm = () => ({
  id: "",
  projectId: "",
  reportDate: today(),
  shift: "General",
  weather: "Clear",
  preparedBy: "",
  projectManager: "",
  siteName: "",
  locationId: "",
  additionalReport: false,
  summary: "",
  workCompleted: "",
  tomorrowPlan: "",
  delays: "",
  observations: "",
  clientInstructions: "",
  milestoneIds: [],
  taskRows: [],
  manpowerRows: [],
  materialRows: [],
  equipmentRows: [],
  safetyRows: [],
  qualityRows: [],
  issueRows: [],
  visitorRows: [],
  photos: [],
  attachments: [],
});

const blankRows = {
  materialRows: () => ({
    id: uid("mat"),
    item: "",
    unit: "PCS",
    received: "",
    used: "",
    returned: "",
    balance: "",
    reference: "",
  }),
  equipmentRows: () => ({
    id: uid("eq"),
    equipment: "",
    hours: "",
    condition: "Good",
    remarks: "",
  }),
  safetyRows: () => ({
    id: uid("safe"),
    observation: "",
    type: "Observation",
    severity: "Low",
    action: "",
  }),
  qualityRows: () => ({
    id: uid("quality"),
    inspection: "",
    result: "Passed",
    remarks: "",
  }),
  issueRows: () => ({
    id: uid("issue"),
    issue: "",
    severity: "Medium",
    owner: "",
    targetDate: "",
    status: "Open",
  }),
  visitorRows: () => ({
    id: uid("visitor"),
    name: "",
    company: "",
    purpose: "",
    notes: "",
  }),
};

const statusClass = (status) =>
  ({
    Draft: "bg-slate-100 text-slate-700",
    Submitted: "bg-amber-100 text-amber-800",
    Approved: "bg-emerald-100 text-emerald-800",
    Rejected: "bg-rose-100 text-rose-800",
  })[status] || "bg-slate-100 text-slate-700";

const activeAllocation = (row) => !["Released", "On Hold"].includes(row.status);
const taskProgress = (task) => Math.min(100, n(task.progress));

const compressPhoto = (file) =>
  new Promise((resolve, reject) => {
    if (!file.type.startsWith("image/"))
      return reject(new Error("Only image files can be attached."));
    const reader = new FileReader();
    reader.onerror = () =>
      reject(new Error("The selected photo could not be read."));
    reader.onload = () => {
      const img = document.createElement("img");
      img.onerror = () => reject(new Error("The selected photo is invalid."));
      img.onload = () => {
        const max = 1280;
        const scale = Math.min(1, max / Math.max(img.width, img.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        canvas
          .getContext("2d")
          .drawImage(img, 0, 0, canvas.width, canvas.height);
        let quality = 0.78;
        let dataUrl = canvas.toDataURL("image/jpeg", quality);
        while (dataUrl.length > 475000 && quality > 0.3) {
          quality -= 0.1;
          dataUrl = canvas.toDataURL("image/jpeg", quality);
        }
        if (dataUrl.length > 475000)
          return reject(
            new Error("Photo remains larger than 350 KB after compression."),
          );
        resolve({
          id: uid("photo"),
          name: file.name,
          category: "Progress",
          caption: "",
          capturedAt: new Date().toISOString(),
          dataUrl,
        });
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });

const readAttachment = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error(`Could not read ${file.name}.`));
    reader.onload = () =>
      resolve({
        id: uid("attachment"),
        name: file.name,
        category: "Attachment",
        caption: "",
        capturedAt: new Date().toISOString(),
        dataUrl: reader.result,
      });
    reader.readAsDataURL(file);
  });

const validate = (form, project) => {
  if (!form.projectId) return "Project is required.";
  if (!form.reportDate) return "Report date is required.";
  if (!form.shift) return "Shift is required.";
  if (!form.preparedBy.trim()) return "Prepared by is required.";
  if (!form.workCompleted.trim()) return "Work performed today is required.";
  if (
    form.taskRows.length > 0 &&
    !form.taskRows.some((row) => row.workCompleted.trim())
  )
    return "Add work progress for at least one task.";
  for (const row of form.taskRows) {
    if (
      row.status === "Work in Progress" &&
      n(row.reportedProgress) < n(row.previousProgress)
    )
      return `Progress for ${row.taskName} cannot decrease.`;
    if (n(row.reportedProgress) > 100)
      return `Progress for ${row.taskName} cannot exceed 100%.`;
    if (n(row.hours) > 24)
      return `Task hours for ${row.taskName} cannot exceed 24.`;
    if (
      row.status === "Work in Progress" &&
      (n(row.reportedProgress) < 1 || n(row.reportedProgress) > 99)
    )
      return `Work in Progress for ${row.taskName} requires a percentage from 1 to 99.`;
    if (
      row.status === "Work in Progress" &&
      !String(row.remainingWorkRemarks || row.blockers || "").trim()
    )
      return `Remaining-work remarks are required for ${row.taskName}.`;
  }
  if (
    form.manpowerRows.some((row) => n(row.regularHours) + n(row.overtime) > 24)
  )
    return "Manpower regular and overtime hours cannot exceed 24 per person.";
  if (
    form.materialRows.some((row) =>
      [row.received, row.used, row.returned, row.balance].some(
        (value) => Number(value) < 0,
      ),
    )
  )
    return "Material quantities cannot be negative.";
  if (
    form.issueRows.some(
      (row) => row.targetDate && row.targetDate < form.reportDate,
    )
  )
    return "Issue target dates cannot be before the report date.";
  const allocatedNames = new Set(
    (project?.teamAllocations || [])
      .filter(activeAllocation)
      .map((row) => String(row.employee || row.member || "").toLowerCase()),
  );
  return allocatedNames.size &&
    !allocatedNames.has(form.preparedBy.toLowerCase())
    ? "Prepared by is not currently allocated to this project. You can still save as manager override."
    : "";
};

const Kpi = ({ label, value, icon, tone }) => (
  <article className={sectionClass}>
    <div className="flex items-center gap-3">
      <span className={`grid h-10 w-10 place-items-center rounded-lg ${tone}`}>
        {createElement(icon, { className: "h-5 w-5" })}
      </span>
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          {label}
        </p>
        <p className="text-xl font-bold text-slate-950">{value}</p>
      </div>
    </div>
  </article>
);

const RowSection = ({
  title,
  rows,
  collection,
  onAdd,
  onChange,
  onRemove,
  columns,
}) => (
  <section className={sectionClass}>
    <div className="mb-3 flex items-center justify-between">
      <h3 className="font-semibold text-slate-900">{title}</h3>
      <button
        type="button"
        onClick={onAdd}
        className="inline-flex items-center gap-1 rounded-lg border border-indigo-200 px-3 py-1.5 text-xs font-semibold text-indigo-700"
      >
        <Plus className="h-3.5 w-3.5" /> Add
      </button>
    </div>
    {!rows.length ? (
      <p className="rounded-lg bg-slate-50 p-4 text-sm text-slate-500">
        No entries added.
      </p>
    ) : (
      <div className="space-y-3">
        {rows.map((row, index) => (
          <div
            key={row.id || index}
            className="grid gap-2 rounded-lg border border-slate-100 bg-slate-50 p-3 md:grid-cols-2 xl:grid-cols-4"
          >
            {columns.map((column) => (
              <label
                key={column.key}
                className={column.wide ? "xl:col-span-2" : ""}
              >
                <span className="mb-1 block text-xs font-medium text-slate-500">
                  {column.label}
                </span>
                {column.options ? (
                  <select
                    className={inputClass}
                    value={row[column.key] || ""}
                    onChange={(e) =>
                      onChange(collection, index, column.key, e.target.value)
                    }
                  >
                    {column.options.map((option) => (
                      <option key={option}>{option}</option>
                    ))}
                  </select>
                ) : (
                  <input
                    type={column.type || "text"}
                    min={column.type === "number" ? 0 : undefined}
                    className={inputClass}
                    value={row[column.key] ?? ""}
                    onChange={(e) =>
                      onChange(collection, index, column.key, e.target.value)
                    }
                  />
                )}
              </label>
            ))}
            <button
              type="button"
              onClick={() => onRemove(collection, index)}
              className="self-end justify-self-start rounded-lg p-2 text-rose-600 hover:bg-rose-50"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    )}
  </section>
);

const ProjectManagementSiteReports = () => {
  const canApproveReports = isManager();
  const [projects, setProjects] = useState(() =>
    getProjectManagementProjects(),
  );
  const [rawReports, setReports] = useState(() => siteReportsService.list());
  const [form, setForm] = useState(emptyForm);
  const [drawer, setDrawer] = useState(false);
  const [view, setView] = useState(null);
  const [dirty, setDirty] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [projectFilter, setProjectFilter] = useState("All");
  const [statusFilter, setStatusFilter] = useState("All");
  const [preparedFilter, setPreparedFilter] = useState("All");
  const [severityFilter, setSeverityFilter] = useState("All");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  const refresh = async () => {
    const [projectRows, reportRows] = await Promise.all([
      hydrateProjectManagementProjects(),
      siteReportsService.refresh(),
    ]);
    setProjects(projectRows);
    setReports(reportRows);
  };
  useEffect(() => {
    const handleProjectCacheChange = () => {
      setProjects(getProjectManagementProjects());
    };
    const handleExternalProjectChange = () => {
      void refresh().catch((loadError) =>
        setError(loadError?.response?.data?.error || loadError.message)
      );
    };
    window.addEventListener(
      PROJECT_MANAGEMENT_PROJECTS_EVENT,
      handleProjectCacheChange
    );
    window.addEventListener("projects:changed", handleExternalProjectChange);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh().catch((loadError) => setError(loadError?.response?.data?.error || loadError.message));
    return () => {
      window.removeEventListener(
        PROJECT_MANAGEMENT_PROJECTS_EVENT,
        handleProjectCacheChange
      );
      window.removeEventListener("projects:changed", handleExternalProjectChange);
    };
  }, []);
  useEffect(() => {
    const beforeUnload = (event) => {
      if (dirty) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [dirty]);

  const project = projects.find(
    (item) => String(item.id) === String(form.projectId),
  );
  const reports = useMemo(() => {
    const projectNames = new Map(
      projects.map((item) => [String(item.id), String(item.name || "").trim()]),
    );
    return rawReports.map((report) => ({
      ...report,
      projectName:
        projectNames.get(String(report.projectId)) || report.projectName || "",
    }));
  }, [projects, rawReports]);
  const filtered = useMemo(
    () =>
      reports.filter((report) => {
        const term = search.trim().toLowerCase();
        if (
          projectFilter !== "All" &&
          String(report.projectId) !== projectFilter
        )
          return false;
        if (statusFilter !== "All" && report.status !== statusFilter)
          return false;
        if (preparedFilter !== "All" && report.preparedBy !== preparedFilter)
          return false;
        if (
          severityFilter !== "All" &&
          !(report.issueRows || []).some(
            (row) => row.severity === severityFilter,
          )
        )
          return false;
        if (fromDate && report.reportDate < fromDate) return false;
        if (toDate && report.reportDate > toDate) return false;
        return (
          !term ||
          [
            report.reportNumber,
            report.projectName,
            report.preparedBy,
            report.summary,
            report.siteName,
          ].some((value) =>
            String(value || "")
              .toLowerCase()
              .includes(term),
          )
        );
      }),
    [
      reports,
      search,
      projectFilter,
      statusFilter,
      preparedFilter,
      severityFilter,
      fromDate,
      toDate,
    ],
  );
  const preparedOptions = [
    ...new Set(reports.map((report) => report.preparedBy).filter(Boolean)),
  ].sort();
  const openIssues = reports
    .flatMap((report) => report.issueRows || [])
    .filter((row) => row.status !== "Closed").length;
  const safetyIncidents = reports
    .flatMap((report) => report.safetyRows || [])
    .filter((row) => row.type === "Incident").length;

  const update = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }));
    setDirty(true);
    setError("");
  };
  const selectProject = (projectId) => {
    const selected = projects.find(
      (item) => String(item.id) === String(projectId),
    );
    const allocations = (selected?.teamAllocations || []).filter(
      activeAllocation,
    );
    setForm((current) => ({
      ...current,
      projectId,
      projectManager: selected?.projectManager || "",
      siteName: selected?.siteName || selected?.address || "",
      locationId: selected?.locationId || "",
      milestoneIds: [],
      preparedBy:
        allocations[0]?.employee ||
        allocations[0]?.member ||
        selected?.projectManager ||
        getCurrentUser()?.name ||
        "",
      taskRows: (selected?.tasks || [])
        .filter((task) => task.status !== "Cancelled")
        .map((task) => ({
          id: uid("taskrow"),
          taskId: task.id,
          taskName: task.taskName || task.title || task.name || task.taskId,
          owner: task.assignedTo || task.owner || "",
          previousProgress: taskProgress(task),
          reportedProgress: taskProgress(task),
          status:
            task.status === "Partial"
              ? "Work in Progress"
              : task.status || "Pending",
          remainingWorkRemarks: task.remainingWorkRemarks || "",
          workCompleted: "",
          blockers: "",
          hours: "",
        })),
      manpowerRows: allocations.map((row) => ({
        id: uid("man"),
        employee: row.employee || row.member || "",
        role: row.role || "",
        attendance: "Present",
        regularHours: "8",
        overtime: "0",
        remarks: "",
      })),
    }));
    setDirty(true);
  };
  const openCreate = () => {
    setForm(emptyForm());
    setDrawer(true);
    setDirty(false);
    setError("");
    setMessage("");
  };
  const openEdit = (report) => {
    setForm({ ...emptyForm(), ...report });
    setDrawer(true);
    setDirty(false);
    setError("");
  };
  const closeDrawer = () => {
    if (dirty && !window.confirm("Discard unsaved site report changes?"))
      return;
    setDrawer(false);
    setDirty(false);
  };
  const rowChange = (collection, index, key, value) =>
    update(
      collection,
      form[collection].map((row, rowIndex) =>
        rowIndex === index ? { ...row, [key]: value } : row,
      ),
    );
  const updateTaskStatus = (index, status) => {
    const rows = form.taskRows.map((row, rowIndex) =>
      rowIndex === index
        ? {
            ...row,
            status,
            reportedProgress:
              status === "Completed"
                ? 100
                : status === "Pending"
                  ? 0
                  : row.reportedProgress,
          }
        : row
    );
    update("taskRows", rows);
  };
  const addRow = (collection) =>
    update(collection, [...form[collection], blankRows[collection]()]);
  const removeRow = (collection, index) =>
    update(
      collection,
      form[collection].filter((_, rowIndex) => rowIndex !== index),
    );

  const save = async () => {
    const validation = validate(form, project);
    const isOverride = validation.includes("not currently allocated");
    if (validation && !isOverride) return setError(validation);
    if (
      isOverride &&
      !window.confirm(`${validation} Continue as manager override?`)
    )
      return;
    try {
      if (form.id) await siteReportsService.update(form.id, form);
      else await siteReportsService.create(form);
      setDrawer(false);
      setDirty(false);
      setMessage(
        form.id ? "Site report updated." : "Draft site report created.",
      );
      await refresh();
    } catch (saveError) {
      setError(
        saveError?.response?.data?.error ||
          saveError.message ||
          "Site report could not be saved."
      );
    }
  };
  const action = async (callback, success) => {
    try {
      await callback();
      setMessage(success);
      setError("");
      await refresh();
      setView(null);
    } catch (actionError) {
      setError(
        actionError?.response?.data?.error ||
          actionError.message ||
          "Site report action failed."
      );
    }
  };
  const submit = (report) =>
    void action(
      () => siteReportsService.submit(report.id),
      `${report.reportNumber} submitted for approval.`,
    );
  const approve = (report) => {
    const managerRemarks = window.prompt("Manager remarks (optional):", report.managerRemarks || "");
    if (managerRemarks === null) return;
    void action(
      () =>
        siteReportsService.approve(report.id, {
          managerRemarks,
        }),
      `${report.reportNumber} approved and task progress synchronized.`,
    );
  };
  const reject = (report) => {
    const reason = window.prompt("Enter the rejection reason:");
    if (reason === null) return;
    void action(
      () =>
        siteReportsService.reject(report.id, {
          reason,
        }),
      `${report.reportNumber} rejected.`,
    );
  };
  const remove = (report) => {
    if (!window.confirm(`Delete ${report.reportNumber}?`)) return;
    void action(
      () => siteReportsService.delete(report.id),
      `${report.reportNumber} deleted.`,
    );
  };

  const addPhotos = async (files) => {
    const selected = Array.from(files || []);
    if (form.photos.length + selected.length > 4)
      return setError("A report can contain a maximum of four photos.");
    try {
      const photos = await Promise.all(selected.map(compressPhoto));
      update("photos", [...form.photos, ...photos]);
    } catch (photoError) {
      setError(photoError.message);
    }
  };
  const addAttachments = async (files) => {
    try {
      const next = await Promise.all(Array.from(files || []).map(readAttachment));
      update("attachments", [...(form.attachments || []), ...next]);
    } catch (attachmentError) {
      setError(attachmentError.message);
    }
  };
  const exportCsv = () => {
    const header = [
      "Report Number",
      "Date",
      "Project",
      "Site",
      "Shift",
      "Prepared By",
      "Status",
      "Summary",
      "Open Issues",
      "Safety Incidents",
    ];
    const rows = filtered.map((report) => [
      report.reportNumber,
      report.reportDate,
      report.projectName,
      report.siteName,
      report.shift,
      report.preparedBy,
      report.status,
      report.summary,
      (report.issueRows || []).filter((row) => row.status !== "Closed").length,
      (report.safetyRows || []).filter((row) => row.type === "Incident").length,
    ]);
    const csv = [header, ...rows]
      .map((row) =>
        row
          .map((value) => `"${String(value ?? "").replace(/"/g, '""')}"`)
          .join(","),
      )
      .join("\n");
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    link.download = `site-reports-${today()}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  return (
    <div className="space-y-5">
      <section className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[.28em] text-indigo-500">
            Project Management
          </p>
          <h1 className="mt-2 text-3xl font-bold text-slate-950">
            Daily Site Reports
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Daily progress, manpower, materials, safety, quality, issues,
            photos, and approvals.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={exportCsv}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700"
          >
            <Download className="h-4 w-4" />
            Export CSV
          </button>
          <button
            onClick={openCreate}
            className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white"
          >
            <Plus className="h-4 w-4" />
            Create Daily Site Report
          </button>
        </div>
      </section>
      {(message || error) && (
        <div
          className={`rounded-lg border px-4 py-3 text-sm ${error ? "border-rose-200 bg-rose-50 text-rose-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`}
        >
          {error || message}
        </div>
      )}
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        <Kpi
          label="Reports"
          value={reports.length}
          icon={FileText}
          tone="bg-indigo-50 text-indigo-600"
        />
        <Kpi
          label="Drafts"
          value={reports.filter((r) => r.status === "Draft").length}
          icon={Pencil}
          tone="bg-slate-100 text-slate-600"
        />
        <Kpi
          label="Pending"
          value={reports.filter((r) => r.status === "Submitted").length}
          icon={Send}
          tone="bg-amber-50 text-amber-600"
        />
        <Kpi
          label="Approved"
          value={reports.filter((r) => r.status === "Approved").length}
          icon={CheckCircle2}
          tone="bg-emerald-50 text-emerald-600"
        />
        <Kpi
          label="Open Issues"
          value={openIssues}
          icon={AlertTriangle}
          tone="bg-rose-50 text-rose-600"
        />
        <Kpi
          label="Incidents"
          value={safetyIncidents}
          icon={ShieldCheck}
          tone="bg-orange-50 text-orange-600"
        />
      </section>
      <section className={sectionClass}>
        <div className="grid gap-3 lg:grid-cols-4 xl:grid-cols-7">
          <label className="relative lg:col-span-2">
            <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
            <input
              className={`${inputClass} pl-9`}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search report, project, site..."
            />
          </label>
          <select
            className={inputClass}
            value={projectFilter}
            onChange={(e) => setProjectFilter(e.target.value)}
          >
            <option value="All">All Projects</option>
            {projects.map((p) => (
              <option key={p.id} value={String(p.id)}>
                {p.name}
              </option>
            ))}
          </select>
          <select
            className={inputClass}
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            {statuses.map((s) => (
              <option key={s}>{s === "All" ? "All Status" : s}</option>
            ))}
          </select>
          <select
            className={inputClass}
            value={preparedFilter}
            onChange={(e) => setPreparedFilter(e.target.value)}
          >
            <option>All</option>
            {preparedOptions.map((p) => (
              <option key={p}>{p}</option>
            ))}
          </select>
          <DateInput
            value={fromDate}
            onChange={setFromDate}
            placeholder="From date"
          />
          <DateInput
            value={toDate}
            onChange={setToDate}
            placeholder="To date"
          />
          <select
            className={inputClass}
            value={severityFilter}
            onChange={(e) => setSeverityFilter(e.target.value)}
          >
            <option>All</option>
            {severities.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </div>
      </section>
      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-[1100px] w-full text-sm">
            <thead className="bg-slate-100 text-xs uppercase text-slate-500">
              <tr>
                {[
                  "Report",
                  "Date / Shift",
                  "Project / Site",
                  "Prepared By",
                  "Progress",
                  "Issues",
                  "Status",
                  "Actions",
                ].map((h) => (
                  <th key={h} className="px-4 py-3 text-left font-semibold">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((report) => (
                <tr key={report.id} className="hover:bg-slate-50">
                  <td className="px-4 py-4 font-semibold text-indigo-700">
                    {report.reportNumber}
                  </td>
                  <td className="px-4 py-4">
                    <p>{formatDate(report.reportDate)}</p>
                    <p className="text-xs text-slate-500">
                      {report.shift} · {report.weather}
                    </p>
                  </td>
                  <td className="px-4 py-4">
                    <p className="font-semibold text-slate-900">
                      {report.projectName}
                    </p>
                    <p className="text-xs text-slate-500">
                      {report.siteName || "Site not specified"}
                    </p>
                  </td>
                  <td className="px-4 py-4">{report.preparedBy}</td>
                  <td className="px-4 py-4">
                    {Math.round(
                      (report.taskRows || []).filter((row) => row.status !== "Cancelled").reduce(
                        (sum, row) => sum + n(row.reportedProgress),
                        0,
                      ) /
                        Math.max(
                          (report.taskRows || []).filter((row) => row.status !== "Cancelled").length,
                          1
                        ),
                    )}
                    %
                  </td>
                  <td className="px-4 py-4">
                    {
                      (report.issueRows || []).filter(
                        (row) => row.status !== "Closed",
                      ).length
                    }
                  </td>
                  <td className="px-4 py-4">
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusClass(report.status)}`}
                    >
                      {report.status}
                    </span>
                  </td>
                  <td className="px-4 py-4">
                    <div className="flex gap-1">
                      <button
                        title="View"
                        onClick={() => setView(report)}
                        className="rounded p-2 text-slate-600 hover:bg-slate-100"
                      >
                        <Eye className="h-4 w-4" />
                      </button>
                      {["Draft", "Rejected"].includes(report.status) && (
                        <>
                          <button
                            title="Edit"
                            onClick={() => openEdit(report)}
                            className="rounded p-2 text-indigo-600 hover:bg-indigo-50"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button
                            title="Submit"
                            onClick={() => submit(report)}
                            className="rounded p-2 text-amber-600 hover:bg-amber-50"
                          >
                            <Send className="h-4 w-4" />
                          </button>
                          <button
                            title="Delete"
                            onClick={() => remove(report)}
                            className="rounded p-2 text-rose-600 hover:bg-rose-50"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </>
                      )}
                      {report.status === "Submitted" && canApproveReports && (
                        <>
                          <button
                            title="Approve"
                            onClick={() => approve(report)}
                            className="rounded p-2 text-emerald-600 hover:bg-emerald-50"
                          >
                            <CheckCircle2 className="h-4 w-4" />
                          </button>
                          <button
                            title="Reject"
                            onClick={() => reject(report)}
                            className="rounded p-2 text-rose-600 hover:bg-rose-50"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {!filtered.length && (
                <tr>
                  <td
                    colSpan="8"
                    className="px-4 py-16 text-center text-slate-500"
                  >
                    No matching site reports found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {drawer && (
        <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/40">
          <div className="h-full w-full max-w-6xl overflow-y-auto bg-slate-50 shadow-2xl">
            <div className="sticky top-0 z-10 flex items-center justify-between border-b bg-white px-5 py-4">
              <div>
                <h2 className="text-xl font-bold text-slate-950">
                  {form.id ? "Edit Site Report" : "Create Daily Site Report"}
                </h2>
                <p className="text-sm text-slate-500">
                  Draft → Submitted → Approved / Rejected
                </p>
              </div>
              <button
                onClick={closeDrawer}
                className="rounded-lg p-2 hover:bg-slate-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-4 p-5">
              {error && (
                <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
                  {error}
                </div>
              )}
              <section className={sectionClass}>
                <h3 className="mb-3 font-semibold">Report Details</h3>
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  <label>
                    <span className="mb-1 block text-xs text-slate-500">
                      Project *
                    </span>
                    <select
                      disabled={Boolean(form.id)}
                      className={inputClass}
                      value={form.projectId}
                      onChange={(e) => selectProject(e.target.value)}
                    >
                      <option value="">Select project</option>
                      {projects.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span className="mb-1 block text-xs text-slate-500">
                      Report Date *
                    </span>
                    <DateInput
                      value={form.reportDate}
                      onChange={(value) => update("reportDate", value)}
                    />
                  </label>
                  <label>
                    <span className="mb-1 block text-xs text-slate-500">
                      Shift *
                    </span>
                    <select
                      className={inputClass}
                      value={form.shift}
                      onChange={(e) => update("shift", e.target.value)}
                    >
                      {shifts.map((s) => (
                        <option key={s}>{s}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span className="mb-1 block text-xs text-slate-500">
                      Weather
                    </span>
                    <select
                      className={inputClass}
                      value={form.weather}
                      onChange={(e) => update("weather", e.target.value)}
                    >
                      {weatherOptions.map((s) => (
                        <option key={s}>{s}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span className="mb-1 block text-xs text-slate-500">
                      Prepared By *
                    </span>
                    <input
                      list="report-employees"
                      className={inputClass}
                      value={form.preparedBy}
                      onChange={(e) => update("preparedBy", e.target.value)}
                    />
                    <datalist id="report-employees">
                      {(project?.teamAllocations || [])
                        .map((a) => a.employee || a.member)
                        .filter(Boolean)
                        .map((name) => (
                          <option key={name} value={name} />
                        ))}
                    </datalist>
                  </label>
                  <label>
                    <span className="mb-1 block text-xs text-slate-500">
                      Project Manager
                    </span>
                    <input
                      readOnly
                      className={`${inputClass} bg-slate-50`}
                      value={form.projectManager}
                    />
                  </label>
                  <label className="xl:col-span-2">
                    <span className="mb-1 block text-xs text-slate-500">
                      Site
                    </span>
                    <input
                      className={inputClass}
                      value={form.siteName}
                      onChange={(e) => update("siteName", e.target.value)}
                    />
                  </label>
                  <label className="md:col-span-2 xl:col-span-4">
                    <span className="mb-1 block text-xs text-slate-500">
                      Explicit Milestone Links
                    </span>
                    <select
                      multiple
                      className={`${inputClass} min-h-24`}
                      value={(form.milestoneIds || []).map(String)}
                      onChange={(event) =>
                        update(
                          "milestoneIds",
                          Array.from(event.target.selectedOptions).map((option) =>
                            Number(option.value),
                          ),
                        )
                      }
                    >
                      {(project?.milestones || []).map((milestone) => (
                        <option key={milestone.id} value={milestone.id}>
                          {milestone.milestoneNumber || milestone.name} — {milestone.name}
                        </option>
                      ))}
                    </select>
                    <span className="mt-1 block text-xs text-slate-500">
                      Reports are also linked automatically through their task progress rows.
                    </span>
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={form.additionalReport}
                      onChange={(e) =>
                        update("additionalReport", e.target.checked)
                      }
                    />
                    Additional report for this shift
                  </label>
                </div>
              </section>
              <section className={sectionClass}>
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <h3 className="font-semibold">Report Attachments</h3>
                    <p className="text-xs text-slate-500">PDFs, drawings, and supporting files are stored with the report.</p>
                  </div>
                  <label className="cursor-pointer rounded-lg border border-indigo-200 px-3 py-2 text-xs font-semibold text-indigo-700">
                    <FileText className="mr-1 inline h-4 w-4" /> Add Attachments
                    <input hidden type="file" multiple onChange={(event) => addAttachments(event.target.files)} />
                  </label>
                </div>
                <div className="mt-3 space-y-2">
                  {(form.attachments || []).map((file, index) => (
                    <div key={file.id} className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-sm">
                      <span>{file.name}</span>
                      <button type="button" onClick={() => update("attachments", form.attachments.filter((_item, itemIndex) => itemIndex !== index))} className="font-semibold text-rose-600">Remove</button>
                    </div>
                  ))}
                </div>
              </section>
              <section className={sectionClass}>
                <h3 className="mb-3 font-semibold">Daily Narrative</h3>
                <div className="grid gap-3 md:grid-cols-2">
                  {[
                    ["summary", "Executive Summary"],
                    ["workCompleted", "Work Performed Today *"],
                    ["tomorrowPlan", "Tomorrow's Plan"],
                    ["delays", "Delays / Constraints"],
                    ["observations", "General Observations"],
                    ["clientInstructions", "Client Instructions"],
                  ].map(([key, label]) => (
                    <label key={key}>
                      <span className="mb-1 block text-xs text-slate-500">
                        {label}
                      </span>
                      <textarea
                        rows="3"
                        className={inputClass}
                        value={form[key]}
                        onChange={(e) => update(key, e.target.value)}
                      />
                    </label>
                  ))}
                </div>
              </section>
              <section className={sectionClass}>
                <h3 className="mb-3 font-semibold">Task Progress *</h3>
                {!form.taskRows.length ? (
                  <p className="text-sm text-slate-500">
                    This project has no tasks. Create a task before submitting a
                    report.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {form.taskRows.map((row, index) => (
                      <div
                        key={row.id}
                        className="grid gap-2 rounded-lg bg-slate-50 p-3 md:grid-cols-2 xl:grid-cols-8"
                      >
                        <div className="xl:col-span-2">
                          <p className="font-semibold">{row.taskName}</p>
                          <p className="text-xs text-slate-500">
                            Owner: {row.owner || "Unassigned"} · Previous:{" "}
                            {row.previousProgress}%
                          </p>
                        </div>
                        <label>
                          <span className="text-xs text-slate-500">Task Status</span>
                          <select
                            className={inputClass}
                            value={row.status || "Pending"}
                            onChange={(event) => updateTaskStatus(index, event.target.value)}
                          >
                            <option>Work in Progress</option>
                            <option>Pending</option>
                            <option>Completed</option>
                            <option>Cancelled</option>
                          </select>
                        </label>
                        <label>
                          <span className="text-xs text-slate-500">
                            Reported %
                          </span>
                          <input
                            type="number"
                            min={row.previousProgress}
                            max="100"
                            className={inputClass}
                            disabled={["Pending", "Completed"].includes(row.status)}
                            value={row.reportedProgress}
                            onChange={(e) =>
                              rowChange(
                                "taskRows",
                                index,
                                "reportedProgress",
                                e.target.value,
                              )
                            }
                          />
                        </label>
                        <label>
                          <span className="text-xs text-slate-500">Hours</span>
                          <input
                            type="number"
                            min="0"
                            max="24"
                            className={inputClass}
                            value={row.hours}
                            onChange={(e) =>
                              rowChange(
                                "taskRows",
                                index,
                                "hours",
                                e.target.value,
                              )
                            }
                          />
                        </label>
                        <label className="xl:col-span-2">
                          <span className="text-xs text-slate-500">
                            Work Completed *
                          </span>
                          <input
                            className={inputClass}
                            value={row.workCompleted}
                            onChange={(e) =>
                              rowChange(
                                "taskRows",
                                index,
                                "workCompleted",
                                e.target.value,
                              )
                            }
                          />
                        </label>
                        <label className="xl:col-span-8">
                          <span className="text-xs text-slate-500">
                            {row.status === "Work in Progress"
                              ? "Remaining-work remarks *"
                              : "Issues / blockers"}
                          </span>
                          <input
                            className={inputClass}
                            value={row.blockers}
                            onChange={(e) =>
                              update(
                                "taskRows",
                                form.taskRows.map((taskRow, rowIndex) =>
                                  rowIndex === index
                                    ? {
                                        ...taskRow,
                                        blockers: e.target.value,
                                        remainingWorkRemarks: e.target.value,
                                      }
                                    : taskRow
                                )
                              )
                            }
                          />
                        </label>
                      </div>
                    ))}
                  </div>
                )}
              </section>
              <section className={sectionClass}>
                <h3 className="mb-3 font-semibold">Manpower</h3>
                <div className="space-y-2">
                  {form.manpowerRows.map((row, index) => (
                    <div
                      key={row.id}
                      className="grid gap-2 rounded-lg bg-slate-50 p-3 md:grid-cols-3 xl:grid-cols-6"
                    >
                      <input
                        className={inputClass}
                        value={row.employee}
                        onChange={(e) =>
                          rowChange(
                            "manpowerRows",
                            index,
                            "employee",
                            e.target.value,
                          )
                        }
                        placeholder="Employee"
                      />
                      <input
                        className={inputClass}
                        value={row.role}
                        onChange={(e) =>
                          rowChange(
                            "manpowerRows",
                            index,
                            "role",
                            e.target.value,
                          )
                        }
                        placeholder="Role"
                      />
                      <select
                        className={inputClass}
                        value={row.attendance}
                        onChange={(e) =>
                          rowChange(
                            "manpowerRows",
                            index,
                            "attendance",
                            e.target.value,
                          )
                        }
                      >
                        {["Present", "Absent", "Half Day", "Leave"].map((s) => (
                          <option key={s}>{s}</option>
                        ))}
                      </select>
                      <input
                        type="number"
                        min="0"
                        max="24"
                        className={inputClass}
                        value={row.regularHours}
                        onChange={(e) =>
                          rowChange(
                            "manpowerRows",
                            index,
                            "regularHours",
                            e.target.value,
                          )
                        }
                        placeholder="Hours"
                      />
                      <input
                        type="number"
                        min="0"
                        max="24"
                        className={inputClass}
                        value={row.overtime}
                        onChange={(e) =>
                          rowChange(
                            "manpowerRows",
                            index,
                            "overtime",
                            e.target.value,
                          )
                        }
                        placeholder="OT"
                      />
                      <input
                        className={inputClass}
                        value={row.remarks}
                        onChange={(e) =>
                          rowChange(
                            "manpowerRows",
                            index,
                            "remarks",
                            e.target.value,
                          )
                        }
                        placeholder="Remarks"
                      />
                    </div>
                  ))}
                </div>
              </section>
              <RowSection
                title="Materials (informational only)"
                collection="materialRows"
                rows={form.materialRows}
                onAdd={() => addRow("materialRows")}
                onChange={rowChange}
                onRemove={removeRow}
                columns={[
                  { key: "item", label: "Material", wide: true },
                  { key: "unit", label: "Unit" },
                  { key: "received", label: "Received", type: "number" },
                  { key: "used", label: "Used", type: "number" },
                  { key: "returned", label: "Returned", type: "number" },
                  { key: "balance", label: "Balance", type: "number" },
                  {
                    key: "reference",
                    label: "Inventory / Consumption Ref",
                    wide: true,
                  },
                ]}
              />
              <RowSection
                title="Equipment Usage"
                collection="equipmentRows"
                rows={form.equipmentRows}
                onAdd={() => addRow("equipmentRows")}
                onChange={rowChange}
                onRemove={removeRow}
                columns={[
                  { key: "equipment", label: "Equipment", wide: true },
                  { key: "hours", label: "Hours", type: "number" },
                  {
                    key: "condition",
                    label: "Condition",
                    options: ["Good", "Needs Service", "Breakdown"],
                  },
                  { key: "remarks", label: "Remarks", wide: true },
                ]}
              />
              <RowSection
                title="Safety"
                collection="safetyRows"
                rows={form.safetyRows}
                onAdd={() => addRow("safetyRows")}
                onChange={rowChange}
                onRemove={removeRow}
                columns={[
                  {
                    key: "observation",
                    label: "Observation / Incident",
                    wide: true,
                  },
                  {
                    key: "type",
                    label: "Type",
                    options: [
                      "Observation",
                      "Toolbox Talk",
                      "Near Miss",
                      "Incident",
                    ],
                  },
                  { key: "severity", label: "Severity", options: severities },
                  { key: "action", label: "Corrective Action", wide: true },
                ]}
              />
              <RowSection
                title="Quality Inspections"
                collection="qualityRows"
                rows={form.qualityRows}
                onAdd={() => addRow("qualityRows")}
                onChange={rowChange}
                onRemove={removeRow}
                columns={[
                  { key: "inspection", label: "Inspection", wide: true },
                  {
                    key: "result",
                    label: "Result",
                    options: ["Passed", "Observation", "Failed", "Pending"],
                  },
                  { key: "remarks", label: "Remarks", wide: true },
                ]}
              />
              <RowSection
                title="Issues"
                collection="issueRows"
                rows={form.issueRows}
                onAdd={() => addRow("issueRows")}
                onChange={rowChange}
                onRemove={removeRow}
                columns={[
                  { key: "issue", label: "Issue", wide: true },
                  { key: "severity", label: "Severity", options: severities },
                  { key: "owner", label: "Owner" },
                  { key: "targetDate", label: "Target Date", type: "date" },
                  {
                    key: "status",
                    label: "Status",
                    options: ["Open", "In Progress", "Closed"],
                  },
                ]}
              />
              <RowSection
                title="Visitors / Client Notes"
                collection="visitorRows"
                rows={form.visitorRows}
                onAdd={() => addRow("visitorRows")}
                onChange={rowChange}
                onRemove={removeRow}
                columns={[
                  { key: "name", label: "Visitor" },
                  { key: "company", label: "Company" },
                  { key: "purpose", label: "Purpose" },
                  { key: "notes", label: "Notes", wide: true },
                ]}
              />
              <section className={sectionClass}>
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-semibold">Site Photos</h3>
                    <p className="text-xs text-slate-500">
                      Maximum 4 compressed photos, approximately 350 KB each.
                    </p>
                  </div>
                  <label className="cursor-pointer rounded-lg border border-indigo-200 px-3 py-2 text-xs font-semibold text-indigo-700">
                    <Camera className="mr-1 inline h-4 w-4" />
                    Add Photos
                    <input
                      hidden
                      type="file"
                      accept="image/*"
                      multiple
                      onChange={(e) => addPhotos(e.target.files)}
                    />
                  </label>
                </div>
                <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  {form.photos.map((photo, index) => (
                    <div
                      key={photo.id}
                      className="overflow-hidden rounded-lg border"
                    >
                      <img
                        src={photo.dataUrl}
                        alt={photo.caption || photo.name}
                        className="h-32 w-full object-cover"
                      />
                      <div className="space-y-2 p-2">
                        <select
                          className={inputClass}
                          value={photo.category}
                          onChange={(e) =>
                            rowChange(
                              "photos",
                              index,
                              "category",
                              e.target.value,
                            )
                          }
                        >
                          {photoCategories.map((c) => (
                            <option key={c}>{c}</option>
                          ))}
                        </select>
                        <input
                          className={inputClass}
                          value={photo.caption}
                          onChange={(e) =>
                            rowChange(
                              "photos",
                              index,
                              "caption",
                              e.target.value,
                            )
                          }
                          placeholder="Caption"
                        />
                        <button
                          type="button"
                          onClick={() => removeRow("photos", index)}
                          className="text-xs font-semibold text-rose-600"
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
              <div className="sticky bottom-0 flex justify-end gap-2 border-t bg-white p-4">
                <button
                  onClick={closeDrawer}
                  className="rounded-lg border px-4 py-2.5 text-sm font-semibold"
                >
                  Cancel
                </button>
                <button
                  onClick={save}
                  className="rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white"
                >
                  Save Draft
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {view && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/50 p-4 print:static print:block print:bg-white print:p-0">
          <article
            id="site-report-view-panel"
            className="document-view-panel max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-xl bg-white shadow-2xl print:max-h-none print:max-w-none print:shadow-none"
          >
            <header className="flex items-start justify-between border-b p-5">
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-indigo-600">
                  Daily Site Report
                </p>
                <h2 className="text-2xl font-bold">{view.reportNumber}</h2>
                <p className="text-sm text-slate-500">
                  {view.projectName} · {formatDate(view.reportDate)} ·{" "}
                  {view.shift}
                </p>
              </div>
              <div className="flex gap-2 print:hidden">
                <button
                  type="button"
                  aria-label="Print site report"
                  onClick={() =>
                    void printSection({
                      selector: "#site-report-view-panel",
                      title: `Site Report ${view.reportNumber}`,
                      subtitle: `${view.projectName || ""} - ${formatDate(
                        view.reportDate
                      )}`,
                    })
                  }
                  className="rounded-lg border p-2"
                >
                  <Printer className="h-4 w-4" />
                </button>
                <button
                  onClick={() => setView(null)}
                  className="rounded-lg border p-2"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </header>
            <div className="space-y-5 p-6">
              <div className="grid gap-3 sm:grid-cols-4">
                <div>
                  <p className="text-xs text-slate-500">Status</p>
                  <p className="font-semibold">{view.status}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Site</p>
                  <p className="font-semibold">{view.siteName || "-"}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Prepared By</p>
                  <p className="font-semibold">{view.preparedBy}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Weather</p>
                  <p className="font-semibold">{view.weather}</p>
                </div>
              </div>
              <div>
                <h3 className="font-semibold">Executive Summary</h3>
                <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">
                  {view.summary}
                </p>
              </div>
              <div>
                <h3 className="font-semibold">Task Progress</h3>
                <table className="mt-2 w-full text-sm">
                  <thead className="bg-slate-100">
                    <tr>
                      <th className="p-2 text-left">Task</th>
                      <th className="p-2 text-left">Status</th>
                      <th className="p-2 text-left">Progress</th>
                      <th className="p-2 text-left">Work</th>
                      <th className="p-2 text-left">Blockers</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(view.taskRows || []).map((row) => (
                      <tr key={row.id} className="border-b">
                        <td className="p-2">{row.taskName}</td>
                        <td className="p-2">{row.status === "Partial" ? "Work in Progress" : row.status}</td>
                        <td className="p-2">
                          {row.previousProgress}% → {row.reportedProgress}%
                        </td>
                        <td className="p-2">{row.workCompleted}</td>
                        <td className="p-2">{row.blockers || "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {(view.managerRemarks || view.rejectionReason) && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
                  <h3 className="font-semibold text-amber-900">Manager Review</h3>
                  {view.managerRemarks && <p className="mt-1 text-sm text-amber-900">{view.managerRemarks}</p>}
                  {view.rejectionReason && <p className="mt-1 text-sm text-rose-700">Rejected: {view.rejectionReason}</p>}
                </div>
              )}
              {view.photos?.length > 0 && (
                <div>
                  <h3 className="font-semibold">Site Photos</h3>
                  <div className="mt-2 grid grid-cols-2 gap-3">
                    {view.photos.map((photo) => (
                      <figure key={photo.id}>
                        {photo.dataUrl ? (
                          <img
                            src={photo.dataUrl}
                            alt={photo.caption}
                            className="h-44 w-full rounded-lg object-cover"
                          />
                        ) : (
                          <button
                            type="button"
                            onClick={() => downloadAuthenticatedFile(photo.downloadUrl, photo.name)}
                            className="grid h-44 w-full place-items-center rounded-lg border border-slate-200 bg-slate-50 text-sm font-semibold text-indigo-700"
                          >
                            Download {photo.name}
                          </button>
                        )}
                        <figcaption className="mt-1 text-xs">
                          {photo.category}: {photo.caption || photo.name}
                        </figcaption>
                      </figure>
                    ))}
                  </div>
                </div>
              )}
              {view.attachments?.length > 0 && (
                <div>
                  <h3 className="font-semibold">Attachments</h3>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {view.attachments.map((file) => (
                      <button
                        key={file.id}
                        type="button"
                        onClick={() => downloadAuthenticatedFile(file.downloadUrl, file.name)}
                        className="rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-sm font-semibold text-indigo-700"
                      >
                        {file.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <h3 className="font-semibold">Tomorrow's Plan</h3>
                  <p className="text-sm">{view.tomorrowPlan || "-"}</p>
                </div>
                <div>
                  <h3 className="font-semibold">Delays</h3>
                  <p className="text-sm">{view.delays || "-"}</p>
                </div>
              </div>
              {view.status === "Rejected" && (
                <div className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">
                  <strong>Rejection reason:</strong> {view.rejectionReason}
                </div>
              )}
            </div>
          </article>
        </div>
      )}
    </div>
  );
};

export default ProjectManagementSiteReports;
