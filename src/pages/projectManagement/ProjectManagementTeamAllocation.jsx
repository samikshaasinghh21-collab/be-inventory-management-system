import { createElement, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  BriefcaseBusiness,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  FolderKanban,
  Pencil,
  Search,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import DateInput from "../../components/common/DateInput";
import {
  PROJECT_MANAGEMENT_PROJECTS_EVENT,
  getProjectManagementProjects,
  hydrateProjectManagementProjects,
  setProjectManagementProjects,
} from "../../services/projectManagementProjectsStore";
import {
  fetchHrmsEmployees,
  getHrmsEmployeeErrorMessage,
} from "../../services/hrmsEmployeesApi";
import { formatDate, parseDateValue } from "../../utils/dateFormat";

const ACTIVE_STATUS_OPTIONS = ["Active", "Planned", "On Hold"];
const STATUS_OPTIONS = ["Active", "Planned", "Released", "On Hold"];
const AVAILABILITY_OPTIONS = ["Available", "Occupied", "On Leave", "Overallocated"];
const ROLE_OPTIONS = [
  "Project Manager",
  "Site Engineer",
  "Team Lead",
  "Supervisor",
  "Technician",
  "Helper",
  "QA Engineer",
  "Safety Officer",
  "Store Coordinator",
];
const CORE_ROLES = ["Project Manager", "Site Engineer", "Team Lead"];

const inputClass =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100";
const selectClass = `${inputClass} appearance-none`;
const cardClass = "rounded-xl border border-slate-200 bg-white p-5 shadow-sm";

const emptyForm = {
  id: null,
  projectId: "",
  employee: "",
  role: "",
  department: "",
  allocationPercent: "100",
  startDate: "",
  endDate: "",
  status: "Active",
  availability: "Available",
};

const statusStyles = {
  Active: "border-emerald-200 bg-emerald-50 text-emerald-700",
  Planned: "border-blue-200 bg-blue-50 text-blue-700",
  Released: "border-slate-200 bg-slate-100 text-slate-700",
  "On Hold": "border-amber-200 bg-amber-50 text-amber-700",
};

const availabilityStyles = {
  Available: "border-sky-200 bg-sky-50 text-sky-700",
  Occupied: "border-indigo-200 bg-indigo-50 text-indigo-700",
  "On Leave": "border-amber-200 bg-amber-50 text-amber-700",
  Overallocated: "border-rose-200 bg-rose-50 text-rose-700",
};

const numberValue = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const percentValue = (value) => {
  const parsed = Math.round(numberValue(value));
  return Math.max(0, Math.min(100, parsed));
};

const todayIso = () => new Date().toISOString();

const makeId = (prefix) =>
  `${prefix}-${Math.random().toString(36).slice(2, 7)}${Date.now()
    .toString(36)
    .slice(-4)}`;

const formatDateValue = (value) => {
  const formatted = formatDate(value);
  return formatted === "-" ? "Not set" : formatted;
};

const normalizeText = (value) => String(value || "").trim().toLowerCase();

const isActiveAllocation = (allocation = {}) =>
  ACTIVE_STATUS_OPTIONS.includes(allocation.status || "Active");

const compareDateAsc = (a, b) => {
  const timeA = parseDateValue(a)?.getTime() || Number.MAX_SAFE_INTEGER;
  const timeB = parseDateValue(b)?.getTime() || Number.MAX_SAFE_INTEGER;
  return timeA - timeB;
};

const getEmployeeKey = (value) => normalizeText(value);

const getAllocationAvailability = (allocation, employeeTotals) => {
  if (allocation.availability === "On Leave") return "On Leave";
  if (allocation.status === "Released") return "Available";
  if (allocation.status === "On Hold") return "On Leave";

  const total = employeeTotals[getEmployeeKey(allocation.employee || allocation.member)] || 0;
  if (total > 100) return "Overallocated";
  if (total >= 100) return "Occupied";
  return "Available";
};

const buildAllocationRows = (projects = []) =>
  projects.flatMap((project) =>
    (project.teamAllocations || []).map((allocation) => ({
      ...allocation,
      id: allocation.id || makeId("team"),
      employee: allocation.employee || allocation.member || "",
      member: allocation.member || allocation.employee || "",
      role: allocation.role || "Team Member",
      department: allocation.department || project.department || "",
      allocationPercent: percentValue(
        allocation.allocationPercent ??
          String(allocation.allocation || "").replace("%", "")
      ),
      projectId: project.id,
      projectName: project.name,
      projectCode: project.code,
      projectStatus: project.status,
      projectManager: project.projectManager,
      siteName: project.siteName,
      sortDate: allocation.updatedAt || project.updatedAt || project.createdAt,
    }))
  );

const summarizeEmployees = (rows = []) => {
  const activeRows = rows.filter(isActiveAllocation);
  const totals = activeRows.reduce((acc, row) => {
    const key = getEmployeeKey(row.employee);
    if (!key) return acc;
    acc[key] = (acc[key] || 0) + percentValue(row.allocationPercent);
    return acc;
  }, {});

  const byEmployee = activeRows.reduce((acc, row) => {
    const key = getEmployeeKey(row.employee);
    if (!key) return acc;
    if (!acc[key]) {
      acc[key] = {
        key,
        employee: row.employee,
        department: row.department || "Unassigned",
        role: row.role || "Team Member",
        totalAllocation: 0,
        projectCount: 0,
        projects: [],
        nextReleaseDate: "",
      };
    }

    const current = acc[key];
    current.department = current.department || row.department || "Unassigned";
    current.totalAllocation += percentValue(row.allocationPercent);
    current.projects.push(row);
    current.projectCount = current.projects.length;
    const candidateDates = current.projects
      .map((project) => project.endDate)
      .filter(Boolean)
      .sort(compareDateAsc);
    current.nextReleaseDate = candidateDates[0] || "";
    return acc;
  }, {});

  Object.values(byEmployee).forEach((employee) => {
    employee.availability =
      employee.totalAllocation > 100
        ? "Overallocated"
        : employee.totalAllocation >= 100
          ? "Occupied"
          : "Available";
  });

  return {
    totals,
    list: Object.values(byEmployee).sort((a, b) =>
      String(a.employee).localeCompare(String(b.employee))
    ),
  };
};

const summarizeProjects = (projects = []) =>
  projects.map((project) => {
    const activeTeam = (project.teamAllocations || []).filter(isActiveAllocation);
    const roleSet = new Set(activeTeam.map((item) => item.role).filter(Boolean));
    const missingRoles = CORE_ROLES.filter((role) => !roleSet.has(role));
    const allocationTotal = activeTeam.reduce(
      (sum, item) => sum + percentValue(item.allocationPercent),
      0
    );
    return {
      projectId: project.id,
      projectName: project.name,
      projectCode: project.code,
      projectStatus: project.status,
      activeResources: activeTeam.length,
      allocationTotal,
      missingRoles,
      utilization:
        activeTeam.length > 0
          ? Math.round(allocationTotal / activeTeam.length)
          : 0,
    };
  });

const recalculateProjectWorkload = (projects = []) => {
  const rawRows = buildAllocationRows(projects);
  const employeeTotals = summarizeEmployees(rawRows).totals;

  return projects.map((project) => {
    const nextAllocations = (project.teamAllocations || []).map((allocation) => {
      const employee = allocation.employee || allocation.member || "";
      const allocationPercent = percentValue(
        allocation.allocationPercent ??
          String(allocation.allocation || "").replace("%", "")
      );
      const nextAvailability = getAllocationAvailability(
        { ...allocation, employee, allocationPercent },
        employeeTotals
      );

      return {
        ...allocation,
        employee,
        member: allocation.member || employee,
        allocationPercent,
        allocation: `${allocationPercent}%`,
        availability: nextAvailability,
      };
    });

    const activeTeam = nextAllocations.filter(isActiveAllocation);
    const allocationTotal = activeTeam.reduce(
      (sum, item) => sum + percentValue(item.allocationPercent),
      0
    );

    return {
      ...project,
      teamAllocations: nextAllocations,
      teamSize: nextAllocations.length,
      resourceUtilization:
        activeTeam.length > 0
          ? Math.min(100, Math.round(allocationTotal / activeTeam.length))
          : 0,
      updatedAt: todayIso(),
    };
  });
};

const buildActivityEntry = (projectName, employee, action, role) => ({
  id: makeId("activity"),
  title: `Team allocation ${action}`,
  description: `${employee} ${action} for ${projectName}${role ? ` as ${role}` : ""}.`,
  actor: "Project office",
  date: todayIso(),
});

const Badge = ({ label, variant = "status" }) => {
  const styles = variant === "availability" ? availabilityStyles : statusStyles;
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

const KpiCard = ({ icon: IconComponent, label, value, helper, tone = "indigo" }) => {
  const toneClasses = {
    indigo: "bg-indigo-50 text-indigo-600",
    emerald: "bg-emerald-50 text-emerald-600",
    amber: "bg-amber-50 text-amber-600",
    rose: "bg-rose-50 text-rose-600",
    sky: "bg-sky-50 text-sky-600",
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

const ProjectManagementTeamAllocation = () => {
  const navigate = useNavigate();
  const [projects, setProjects] = useState(() => getProjectManagementProjects());
  const [employees, setEmployees] = useState([]);
  const [employeeLoadError, setEmployeeLoadError] = useState("");
  const [search, setSearch] = useState("");
  const [projectFilter, setProjectFilter] = useState("All");
  const [departmentFilter, setDepartmentFilter] = useState("All");
  const [roleFilter, setRoleFilter] = useState("All");
  const [availabilityFilter, setAvailabilityFilter] = useState("All");
  const [statusFilter, setStatusFilter] = useState("All");
  const [selectedId, setSelectedId] = useState("");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

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

  useEffect(() => {
    let cancelled = false;

    const loadEmployees = async () => {
      try {
        const response = await fetchHrmsEmployees(1, 200);
        if (!cancelled) {
          setEmployees(Array.isArray(response.employees) ? response.employees : []);
          setEmployeeLoadError("");
        }
      } catch (loadError) {
        if (!cancelled) {
          setEmployees([]);
          setEmployeeLoadError(
            getHrmsEmployeeErrorMessage(
              loadError,
              "HRMS employee suggestions are unavailable right now."
            )
          );
        }
      }
    };

    loadEmployees();

    return () => {
      cancelled = true;
    };
  }, []);

  const allocationRows = useMemo(() => buildAllocationRows(projects), [projects]);
  const employeeSummary = useMemo(
    () => summarizeEmployees(allocationRows),
    [allocationRows]
  );
  const projectSummary = useMemo(() => summarizeProjects(projects), [projects]);

  const employeeDirectory = useMemo(() => {
    const directory = new Map();

    employees.forEach((employee) => {
      const name = String(employee.name || employee.fullName || "").trim();
      if (!name) return;
      directory.set(getEmployeeKey(name), {
        name,
        department: employee.department || "",
        role: employee.designation || "",
        employeeId: employee.employeeId || employee.id || "",
      });
    });

    allocationRows.forEach((row) => {
      const name = String(row.employee || row.member || "").trim();
      if (!name) return;
      if (!directory.has(getEmployeeKey(name))) {
        directory.set(getEmployeeKey(name), {
          name,
          department: row.department || "",
          role: row.role || "",
          employeeId: "",
        });
      }
    });

    return Array.from(directory.values()).sort((a, b) =>
      String(a.name).localeCompare(String(b.name))
    );
  }, [allocationRows, employees]);

  const filteredRows = useMemo(() => {
    const term = search.trim().toLowerCase();

    return allocationRows.filter((row) => {
      if (projectFilter !== "All" && row.projectId !== projectFilter) return false;
      if (
        departmentFilter !== "All" &&
        (row.department || "Unassigned") !== departmentFilter
      ) {
        return false;
      }
      if (roleFilter !== "All" && row.role !== roleFilter) return false;
      if (availabilityFilter !== "All" && row.availability !== availabilityFilter) {
        return false;
      }
      if (statusFilter !== "All" && row.status !== statusFilter) return false;
      if (!term) return true;

      return [
        row.employee,
        row.role,
        row.department,
        row.projectName,
        row.projectCode,
        row.projectManager,
        row.siteName,
        row.status,
        row.availability,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(term));
    });
  }, [
    allocationRows,
    availabilityFilter,
    departmentFilter,
    projectFilter,
    roleFilter,
    search,
    statusFilter,
  ]);

  const selectedRow =
    filteredRows.find((row) => row.id === selectedId) ||
    allocationRows.find((row) => row.id === selectedId) ||
    null;

  const selectedEmployeeSummary = useMemo(() => {
    if (!selectedRow) return null;
    return employeeSummary.list.find(
      (item) => item.key === getEmployeeKey(selectedRow.employee)
    );
  }, [employeeSummary.list, selectedRow]);

  const formEmployeeSummary = useMemo(() => {
    if (!form.employee.trim()) return null;
    return employeeSummary.list.find(
      (item) => item.key === getEmployeeKey(form.employee)
    );
  }, [employeeSummary.list, form.employee]);

  const projectedAllocationTotal = useMemo(() => {
    if (!form.employee.trim()) return 0;
    const currentTotal =
      employeeSummary.totals[getEmployeeKey(form.employee)] || 0;
    const existingAllocation =
      form.id && selectedRow && getEmployeeKey(selectedRow.employee) === getEmployeeKey(form.employee)
        ? percentValue(selectedRow.allocationPercent)
        : 0;
    return currentTotal - existingAllocation + percentValue(form.allocationPercent);
  }, [employeeSummary.totals, form.allocationPercent, form.employee, form.id, selectedRow]);

  const metrics = useMemo(() => {
    const activeEmployeeCount = employeeSummary.list.length;
    const availableCount = employeeSummary.list.filter(
      (item) => item.totalAllocation < 100
    ).length;
    const overallocatedCount = employeeSummary.list.filter(
      (item) => item.totalAllocation > 100
    ).length;
    const staffedProjects = projectSummary.filter(
      (item) => item.activeResources > 0
    ).length;

    return {
      totalAllocations: allocationRows.length,
      activeEmployeeCount,
      availableCount,
      overallocatedCount,
      staffedProjects,
    };
  }, [allocationRows.length, employeeSummary.list, projectSummary]);

  const projectOptions = useMemo(
    () =>
      projects
        .map((project) => ({
          id: project.id,
          label: project.name,
          code: project.code,
        }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    [projects]
  );

  const departmentOptions = useMemo(
    () =>
      Array.from(
        new Set(allocationRows.map((row) => row.department || "Unassigned"))
      ).sort(),
    [allocationRows]
  );

  const roleOptions = useMemo(
    () => Array.from(new Set(allocationRows.map((row) => row.role).filter(Boolean))).sort(),
    [allocationRows]
  );

  const resetForm = () => {
    setForm(emptyForm);
    setDrawerOpen(false);
    setError("");
  };

  const openCreateDrawer = () => {
    setMessage("");
    setError("");
    setForm({
      ...emptyForm,
      projectId: projectOptions[0]?.id || "",
    });
    setDrawerOpen(true);
  };

  const openEditDrawer = (row) => {
    setMessage("");
    setError("");
    setForm({
      id: row.id,
      projectId: row.projectId,
      employee: row.employee,
      role: row.role,
      department: row.department || "",
      allocationPercent: String(percentValue(row.allocationPercent)),
      startDate: row.startDate || "",
      endDate: row.endDate || "",
      status: row.status || "Active",
      availability: row.availability || "Available",
    });
    setDrawerOpen(true);
  };

  const handleFormChange = (field, value) => {
    setForm((current) => {
      const next = { ...current, [field]: value };
      if (field === "employee") {
        const matched = employeeDirectory.find(
          (item) => getEmployeeKey(item.name) === getEmployeeKey(value)
        );
        if (matched) {
          next.department = current.department || matched.department || current.department;
          next.role = current.role || matched.role || current.role;
        }
      }
      return next;
    });
  };

  const handleSave = () => {
    setError("");
    setMessage("");

    if (!form.projectId) {
      setError("Choose a project before saving the allocation.");
      return;
    }
    if (!form.employee.trim()) {
      setError("Select or enter an employee name.");
      return;
    }
    if (!form.role.trim()) {
      setError("Enter the project role for this allocation.");
      return;
    }
    if (!form.startDate) {
      setError("Choose an allocation start date.");
      return;
    }

    const allocationPercent = percentValue(form.allocationPercent);
    if (!allocationPercent) {
      setError("Allocation percent must be greater than 0.");
      return;
    }

    if (
      form.endDate &&
      parseDateValue(form.startDate) &&
      parseDateValue(form.endDate) &&
      parseDateValue(form.endDate) < parseDateValue(form.startDate)
    ) {
      setError("End date cannot be earlier than start date.");
      return;
    }

    const allocationRecord = {
      id: form.id || makeId("team"),
      employee: form.employee.trim(),
      member: form.employee.trim(),
      role: form.role.trim(),
      department: form.department.trim() || "Unassigned",
      allocationPercent,
      allocation: `${allocationPercent}%`,
      startDate: form.startDate || null,
      endDate: form.endDate || null,
      status: form.status,
      availability: form.availability,
      updatedAt: todayIso(),
    };

    const nextProjects = projects.map((project) => {
      const currentAllocations = project.teamAllocations || [];
      const withoutCurrent = currentAllocations.filter(
        (item) => item.id !== allocationRecord.id
      );
      if (project.id === form.projectId) {
        const mode = form.id ? "updated" : "added";
        return {
          ...project,
          teamAllocations: [allocationRecord, ...withoutCurrent],
          activities: [
            buildActivityEntry(
              project.name,
              allocationRecord.employee,
              mode,
              allocationRecord.role
            ),
            ...(project.activities || []),
          ],
        };
      }

      if (currentAllocations.length !== withoutCurrent.length) {
        return { ...project, teamAllocations: withoutCurrent };
      }

      return project;
    });

    const normalized = recalculateProjectWorkload(nextProjects);
    setProjectManagementProjects(normalized);
    setMessage(
      form.id
        ? "Allocation updated. Project workload has been refreshed."
        : "Allocation saved. Resource capacity has been recalculated."
    );
    resetForm();
  };

  const handleRelease = (row) => {
    const confirmed = window.confirm(
      `Release ${row.employee} from ${row.projectName}?`
    );
    if (!confirmed) return;

    const nextProjects = projects.map((project) => {
      if (project.id !== row.projectId) return project;
      return {
        ...project,
        teamAllocations: (project.teamAllocations || []).map((allocation) =>
          allocation.id === row.id
            ? {
                ...allocation,
                status: "Released",
                availability: "Available",
                endDate: allocation.endDate || new Date().toISOString().slice(0, 10),
                updatedAt: todayIso(),
              }
            : allocation
        ),
        activities: [
          buildActivityEntry(project.name, row.employee, "released", row.role),
          ...(project.activities || []),
        ],
      };
    });

    setProjectManagementProjects(recalculateProjectWorkload(nextProjects));
    setMessage(`${row.employee} has been released from ${row.projectName}.`);
  };

  const noProjects = projectOptions.length === 0;

  const kpis = [
    {
      label: "Total Allocations",
      value: metrics.totalAllocations.toLocaleString("en-IN"),
      helper: "All project assignments",
      icon: ClipboardList,
      tone: "indigo",
    },
    {
      label: "Active Resources",
      value: metrics.activeEmployeeCount.toLocaleString("en-IN"),
      helper: "Employees with live workload",
      icon: Users,
      tone: "emerald",
    },
    {
      label: "Available Capacity",
      value: metrics.availableCount.toLocaleString("en-IN"),
      helper: "People below 100% utilization",
      icon: CheckCircle2,
      tone: "sky",
    },
    {
      label: "Overallocated",
      value: metrics.overallocatedCount.toLocaleString("en-IN"),
      helper: "Needs rebalancing",
      icon: AlertTriangle,
      tone: "rose",
    },
    {
      label: "Staffed Projects",
      value: metrics.staffedProjects.toLocaleString("en-IN"),
      helper: "Projects with assigned team",
      icon: FolderKanban,
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
            Team Allocation
          </h1>
          <p className="mt-1 max-w-3xl text-sm text-slate-500">
            Allocate people to projects, monitor workload, spot overutilization,
            and rebalance staffing before it impacts delivery.
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <button
            type="button"
            onClick={() => navigate("/project-management/projects")}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
          >
            <BriefcaseBusiness className="h-4 w-4" />
            Open Projects
          </button>
          <button
            type="button"
            onClick={openCreateDrawer}
            disabled={noProjects}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            <UserPlus className="h-4 w-4" />
            Add Allocation
          </button>
        </div>
      </section>

      {message ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {message}
        </div>
      ) : null}

      {employeeLoadError ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
          {employeeLoadError}
        </div>
      ) : null}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {kpis.map((item) => (
          <KpiCard key={item.label} {...item} />
        ))}
      </section>

      {noProjects ? (
        <section className={cardClass}>
          <div className="flex min-h-[240px] flex-col items-center justify-center text-center">
            <span className="grid h-14 w-14 place-items-center rounded-xl bg-indigo-50 text-indigo-600">
              <FolderKanban className="h-6 w-6" />
            </span>
            <h2 className="mt-4 text-lg font-semibold text-slate-900">
              Create a project before allocating a team
            </h2>
            <p className="mt-2 max-w-xl text-sm text-slate-500">
              This workspace uses project records as the source of truth. Once at
              least one project exists, you can assign employees, monitor capacity,
              and release or rebalance resources here.
            </p>
            <button
              type="button"
              onClick={() => navigate("/project-management/projects")}
              className="mt-5 inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700"
            >
              <UserPlus className="h-4 w-4" />
              Create Project
            </button>
          </div>
        </section>
      ) : (
        <>
          <section className="grid gap-4 xl:grid-cols-[minmax(0,1.5fr)_380px]">
            <div className={`${cardClass} overflow-hidden`}>
              <div className="flex flex-col gap-3 border-b border-slate-200 pb-4 md:flex-row md:items-center md:justify-between">
                <div>
                  <h2 className="text-base font-semibold text-slate-900">
                    Allocation Register
                  </h2>
                  <p className="mt-1 text-sm text-slate-500">
                    Search, filter, edit, and release project allocations from one workspace.
                  </p>
                </div>
                <label className="relative w-full md:max-w-sm">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Search employee, project, role..."
                    className="w-full rounded-lg border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100"
                  />
                </label>
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-3 xl:grid-cols-5">
                <select
                  value={projectFilter}
                  onChange={(event) => setProjectFilter(event.target.value)}
                  className={selectClass}
                >
                  <option value="All">All projects</option>
                  {projectOptions.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.label}
                    </option>
                  ))}
                </select>
                <select
                  value={departmentFilter}
                  onChange={(event) => setDepartmentFilter(event.target.value)}
                  className={selectClass}
                >
                  <option value="All">All departments</option>
                  {departmentOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
                <select
                  value={roleFilter}
                  onChange={(event) => setRoleFilter(event.target.value)}
                  className={selectClass}
                >
                  <option value="All">All roles</option>
                  {roleOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
                <select
                  value={availabilityFilter}
                  onChange={(event) => setAvailabilityFilter(event.target.value)}
                  className={selectClass}
                >
                  <option value="All">All availability</option>
                  {AVAILABILITY_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
                <select
                  value={statusFilter}
                  onChange={(event) => setStatusFilter(event.target.value)}
                  className={selectClass}
                >
                  <option value="All">All statuses</option>
                  {STATUS_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </div>

              <div className="mt-4 overflow-x-auto">
                <table className="min-w-[1080px] w-full text-sm">
                  <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-4 py-3 text-left font-semibold">Employee</th>
                      <th className="px-4 py-3 text-left font-semibold">Project</th>
                      <th className="px-4 py-3 text-left font-semibold">Role</th>
                      <th className="px-4 py-3 text-left font-semibold">Department</th>
                      <th className="px-4 py-3 text-right font-semibold">Allocation</th>
                      <th className="px-4 py-3 text-left font-semibold">Date Range</th>
                      <th className="px-4 py-3 text-left font-semibold">Availability</th>
                      <th className="px-4 py-3 text-left font-semibold">Status</th>
                      <th className="px-4 py-3 text-left font-semibold">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {filteredRows.length === 0 ? (
                      <tr>
                        <td colSpan="9" className="px-4 py-12 text-center text-slate-500">
                          No allocations match the current filters.
                        </td>
                      </tr>
                    ) : (
                      filteredRows.map((row) => (
                        <tr
                          key={row.id}
                          className={`transition hover:bg-slate-50 ${
                            selectedId === row.id ? "bg-indigo-50/60" : ""
                          }`}
                        >
                          <td className="px-4 py-3">
                            <button
                              type="button"
                              onClick={() => setSelectedId(row.id)}
                              className="text-left"
                            >
                              <p className="font-semibold text-slate-900">{row.employee}</p>
                              <p className="text-xs text-slate-500">{row.projectManager || "Project office"}</p>
                            </button>
                          </td>
                          <td className="px-4 py-3">
                            <p className="font-semibold text-slate-900">{row.projectName}</p>
                            <p className="text-xs text-slate-500">{row.projectCode || "-"}</p>
                          </td>
                          <td className="px-4 py-3 text-slate-600">{row.role}</td>
                          <td className="px-4 py-3 text-slate-600">{row.department || "-"}</td>
                          <td className="px-4 py-3 text-right font-semibold text-slate-900">
                            {percentValue(row.allocationPercent)}%
                          </td>
                          <td className="px-4 py-3 text-slate-600">
                            {formatDateValue(row.startDate)} to {formatDateValue(row.endDate)}
                          </td>
                          <td className="px-4 py-3">
                            <Badge label={row.availability} variant="availability" />
                          </td>
                          <td className="px-4 py-3">
                            <Badge label={row.status} />
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex flex-wrap gap-2">
                              <button
                                type="button"
                                onClick={() => setSelectedId(row.id)}
                                className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                              >
                                View
                              </button>
                              <button
                                type="button"
                                onClick={() => openEditDrawer(row)}
                                className="inline-flex items-center gap-1 rounded-lg border border-indigo-200 px-3 py-1.5 text-xs font-semibold text-indigo-700 transition hover:bg-indigo-50"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                                Edit
                              </button>
                              {row.status !== "Released" ? (
                                <button
                                  type="button"
                                  onClick={() => handleRelease(row)}
                                  className="rounded-lg border border-rose-200 px-3 py-1.5 text-xs font-semibold text-rose-700 transition hover:bg-rose-50"
                                >
                                  Release
                                </button>
                              ) : null}
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="space-y-4">
              <section className={cardClass}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="text-base font-semibold text-slate-900">
                      {selectedRow ? "Allocation Detail" : "Workload Snapshot"}
                    </h2>
                    <p className="mt-1 text-sm text-slate-500">
                      {selectedRow
                        ? "Selected employee allocation, capacity, and release window."
                        : "Pick an allocation row to inspect workload and capacity."}
                    </p>
                  </div>
                  {selectedRow ? (
                    <button
                      type="button"
                      onClick={() => openEditDrawer(selectedRow)}
                      className="rounded-lg border border-indigo-200 px-3 py-1.5 text-xs font-semibold text-indigo-700 transition hover:bg-indigo-50"
                    >
                      Edit
                    </button>
                  ) : null}
                </div>

                {selectedRow ? (
                  <div className="mt-4 space-y-4">
                    <div className="rounded-xl bg-slate-50 p-4">
                      <p className="text-lg font-semibold text-slate-950">
                        {selectedRow.employee}
                      </p>
                      <p className="mt-1 text-sm text-slate-500">
                        {selectedRow.role} on {selectedRow.projectName}
                      </p>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="rounded-lg border border-slate-200 p-3">
                        <p className="text-xs uppercase tracking-wide text-slate-500">
                          Total Utilization
                        </p>
                        <p className="mt-1 text-lg font-semibold text-slate-950">
                          {selectedEmployeeSummary?.totalAllocation || percentValue(selectedRow.allocationPercent)}%
                        </p>
                      </div>
                      <div className="rounded-lg border border-slate-200 p-3">
                        <p className="text-xs uppercase tracking-wide text-slate-500">
                          Live Projects
                        </p>
                        <p className="mt-1 text-lg font-semibold text-slate-950">
                          {selectedEmployeeSummary?.projectCount || 1}
                        </p>
                      </div>
                    </div>
                    <dl className="space-y-3 text-sm">
                      <div className="flex items-start justify-between gap-4">
                        <dt className="text-slate-500">Department</dt>
                        <dd className="font-medium text-slate-900">{selectedRow.department || "-"}</dd>
                      </div>
                      <div className="flex items-start justify-between gap-4">
                        <dt className="text-slate-500">Project code</dt>
                        <dd className="font-medium text-slate-900">{selectedRow.projectCode || "-"}</dd>
                      </div>
                      <div className="flex items-start justify-between gap-4">
                        <dt className="text-slate-500">Next release</dt>
                        <dd className="font-medium text-slate-900">
                          {formatDateValue(selectedEmployeeSummary?.nextReleaseDate || selectedRow.endDate)}
                        </dd>
                      </div>
                      <div className="flex items-start justify-between gap-4">
                        <dt className="text-slate-500">Availability</dt>
                        <dd>
                          <Badge label={selectedRow.availability} variant="availability" />
                        </dd>
                      </div>
                    </dl>
                  </div>
                ) : (
                  <div className="mt-4 rounded-xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
                    Choose any row from the register to review the employee's current workload, allocation health, and upcoming release date.
                  </div>
                )}
              </section>

              <section className={cardClass}>
                <h2 className="text-base font-semibold text-slate-900">
                  Employee Workload
                </h2>
                <div className="mt-4 space-y-3">
                  {employeeSummary.list.length === 0 ? (
                    <p className="text-sm text-slate-500">No active workloads yet.</p>
                  ) : (
                    employeeSummary.list.slice(0, 6).map((employee) => (
                      <div
                        key={employee.key}
                        className="rounded-lg border border-slate-200 p-3"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="font-semibold text-slate-900">{employee.employee}</p>
                            <p className="text-xs text-slate-500">
                              {employee.projectCount} active project
                              {employee.projectCount === 1 ? "" : "s"}
                            </p>
                          </div>
                          <Badge
                            label={employee.availability}
                            variant="availability"
                          />
                        </div>
                        <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
                          <div
                            className={`h-full rounded-full ${
                              employee.totalAllocation > 100
                                ? "bg-rose-500"
                                : employee.totalAllocation >= 100
                                  ? "bg-indigo-500"
                                  : "bg-emerald-500"
                            }`}
                            style={{
                              width: `${Math.min(100, employee.totalAllocation)}%`,
                            }}
                          />
                        </div>
                        <div className="mt-2 flex items-center justify-between text-xs text-slate-500">
                          <span>{employee.totalAllocation}% allocated</span>
                          <span>Next release {formatDateValue(employee.nextReleaseDate)}</span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </section>
            </div>
          </section>

          <section className="grid gap-4 xl:grid-cols-2">
            <section className={cardClass}>
              <div className="flex items-center gap-2">
                <CalendarDays className="h-4 w-4 text-indigo-600" />
                <h2 className="text-base font-semibold text-slate-900">
                  Staffing Gaps
                </h2>
              </div>
              <div className="mt-4 space-y-3">
                {projectSummary.filter((item) => item.missingRoles.length > 0).length === 0 ? (
                  <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">
                    Core roles are covered across the currently staffed projects.
                  </div>
                ) : (
                  projectSummary
                    .filter((item) => item.missingRoles.length > 0)
                    .slice(0, 6)
                    .map((item) => (
                      <div key={item.projectId} className="rounded-lg border border-slate-200 p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="font-semibold text-slate-900">{item.projectName}</p>
                            <p className="text-xs text-slate-500">{item.projectCode || "-"}</p>
                          </div>
                          <button
                            type="button"
                            onClick={openCreateDrawer}
                            className="rounded-lg border border-indigo-200 px-3 py-1.5 text-xs font-semibold text-indigo-700 transition hover:bg-indigo-50"
                          >
                            Fill Gap
                          </button>
                        </div>
                        <p className="mt-3 text-sm text-slate-600">
                          Missing roles: {item.missingRoles.join(", ")}
                        </p>
                      </div>
                    ))
                )}
              </div>
            </section>

            <section className={cardClass}>
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-rose-600" />
                <h2 className="text-base font-semibold text-slate-900">
                  Rebalance Queue
                </h2>
              </div>
              <div className="mt-4 space-y-3">
                {employeeSummary.list.filter((item) => item.totalAllocation > 100).length === 0 ? (
                  <div className="rounded-lg border border-sky-200 bg-sky-50 p-4 text-sm text-sky-700">
                    No employee is overallocated right now.
                  </div>
                ) : (
                  employeeSummary.list
                    .filter((item) => item.totalAllocation > 100)
                    .map((item) => (
                      <div key={item.key} className="rounded-lg border border-slate-200 p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="font-semibold text-slate-900">{item.employee}</p>
                            <p className="text-xs text-slate-500">
                              {item.projectCount} active assignments
                            </p>
                          </div>
                          <span className="rounded-full bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-700">
                            {item.totalAllocation}% load
                          </span>
                        </div>
                        <p className="mt-3 text-sm text-slate-600">
                          Review these projects first:{" "}
                          {item.projects
                            .map((project) => project.projectName)
                            .slice(0, 3)
                            .join(", ")}
                        </p>
                      </div>
                    ))
                )}
              </div>
            </section>
          </section>
        </>
      )}

      {drawerOpen ? (
        <div className="fixed inset-0 z-40 flex justify-end bg-slate-950/30">
          <div className="h-full w-full max-w-xl overflow-y-auto bg-white p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-slate-200 pb-4">
              <div>
                <h2 className="text-lg font-semibold text-slate-950">
                  {form.id ? "Edit Allocation" : "Add Allocation"}
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  Create or update a project assignment and recalculate workload instantly.
                </p>
              </div>
              <button
                type="button"
                onClick={resetForm}
                className="rounded-lg border border-slate-200 p-2 text-slate-600 transition hover:bg-slate-50"
                aria-label="Close allocation drawer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-5 space-y-4">
              {error ? (
                <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                  {error}
                </div>
              ) : null}

              <div className="grid gap-4 md:grid-cols-2">
                <label className="space-y-1.5">
                  <span className="text-sm font-medium text-slate-700">Project</span>
                  <select
                    value={form.projectId}
                    onChange={(event) => handleFormChange("projectId", event.target.value)}
                    className={selectClass}
                  >
                    <option value="">Select project</option>
                    {projectOptions.map((project) => (
                      <option key={project.id} value={project.id}>
                        {project.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="space-y-1.5">
                  <span className="text-sm font-medium text-slate-700">Employee</span>
                  <input
                    list="team-allocation-employees"
                    value={form.employee}
                    onChange={(event) => handleFormChange("employee", event.target.value)}
                    placeholder="Select or enter employee"
                    className={inputClass}
                  />
                  <datalist id="team-allocation-employees">
                    {employeeDirectory.map((employee) => (
                      <option key={employee.name} value={employee.name} />
                    ))}
                  </datalist>
                </label>

                <label className="space-y-1.5">
                  <span className="text-sm font-medium text-slate-700">Role</span>
                  <input
                    list="team-allocation-roles"
                    value={form.role}
                    onChange={(event) => handleFormChange("role", event.target.value)}
                    placeholder="Project role"
                    className={inputClass}
                  />
                  <datalist id="team-allocation-roles">
                    {Array.from(new Set([...ROLE_OPTIONS, ...roleOptions])).map((role) => (
                      <option key={role} value={role} />
                    ))}
                  </datalist>
                </label>

                <label className="space-y-1.5">
                  <span className="text-sm font-medium text-slate-700">Department</span>
                  <input
                    value={form.department}
                    onChange={(event) => handleFormChange("department", event.target.value)}
                    placeholder="Department"
                    className={inputClass}
                  />
                </label>

                <label className="space-y-1.5">
                  <span className="text-sm font-medium text-slate-700">Allocation %</span>
                  <input
                    type="number"
                    min="1"
                    max="100"
                    value={form.allocationPercent}
                    onChange={(event) =>
                      handleFormChange("allocationPercent", event.target.value)
                    }
                    className={inputClass}
                  />
                </label>

                <label className="space-y-1.5">
                  <span className="text-sm font-medium text-slate-700">Status</span>
                  <select
                    value={form.status}
                    onChange={(event) => handleFormChange("status", event.target.value)}
                    className={selectClass}
                  >
                    {STATUS_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="space-y-1.5">
                  <span className="text-sm font-medium text-slate-700">Start Date</span>
                  <DateInput
                    value={form.startDate}
                    onChange={(value) => handleFormChange("startDate", value)}
                    className={inputClass}
                  />
                </label>

                <label className="space-y-1.5">
                  <span className="text-sm font-medium text-slate-700">End Date</span>
                  <DateInput
                    value={form.endDate}
                    onChange={(value) => handleFormChange("endDate", value)}
                    className={inputClass}
                  />
                </label>
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">
                      Capacity preview
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      Total load for this employee after save.
                    </p>
                  </div>
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-semibold ${
                      projectedAllocationTotal > 100
                        ? "bg-rose-50 text-rose-700"
                        : projectedAllocationTotal >= 100
                          ? "bg-indigo-50 text-indigo-700"
                          : "bg-emerald-50 text-emerald-700"
                    }`}
                  >
                    {projectedAllocationTotal}% projected
                  </span>
                </div>
                <p className="mt-3 text-sm text-slate-600">
                  {formEmployeeSummary
                    ? `${formEmployeeSummary.employee} is currently on ${formEmployeeSummary.projectCount} active project${formEmployeeSummary.projectCount === 1 ? "" : "s"}.`
                    : "This employee does not have another active workload recorded yet."}
                </p>
                {projectedAllocationTotal > 100 ? (
                  <p className="mt-2 text-sm font-medium text-rose-700">
                    Warning: this employee will become overallocated after save.
                  </p>
                ) : null}
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={resetForm}
                  className="rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  className="rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-700"
                >
                  {form.id ? "Update Allocation" : "Save Allocation"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default ProjectManagementTeamAllocation;
