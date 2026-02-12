import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getAllocations } from "../services/allocationsStore";
import { deleteProject, getProjects } from "../services/projectsStore";
<<<<<<< HEAD
import { formatDateDDMMYYYY, formatDateTimeDDMMYYYY } from "../utils/dateFormat";
=======
import { formatDate, formatDateTime } from "../utils/dateFormat";

const STATUS_FILTERS = ["All", "Planned", "Active", "On Hold", "Completed"];

const statusBadge = (status) => {
  switch (status) {
    case "Active":
      return "bg-emerald-50 text-emerald-700 border-emerald-200";
    case "On Hold":
      return "bg-amber-50 text-amber-700 border-amber-200";
    case "Completed":
      return "bg-slate-100 text-slate-600 border-slate-200";
    case "Planned":
    default:
      return "bg-indigo-50 text-indigo-700 border-indigo-200";
  }
};
>>>>>>> ab340f3402952da5e02c7b117ed4c40f3d1549b6

const ProjectsHome = () => {
  const navigate = useNavigate();
  const [projects, setProjects] = useState([]);
  const [allocations, setAllocations] = useState([]);
<<<<<<< HEAD
  const [actionSelection, setActionSelection] = useState("");
=======
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [selectedId, setSelectedId] = useState(null);
>>>>>>> ab340f3402952da5e02c7b117ed4c40f3d1549b6

  const loadProjects = () => {
    setProjects(getProjects());
  };

  const loadAllocations = () => {
    setAllocations(getAllocations());
  };

  useEffect(() => {
    loadProjects();
    loadAllocations();
  }, []);

  useEffect(() => {
    const handleStorage = (event) => {
      if (event.key === "project_allocations" || event.key === "projects") {
        loadProjects();
        loadAllocations();
      }
    };

    const handleAllocationChange = () => {
      loadAllocations();
    };

    const handleProjectChange = () => {
      loadProjects();
    };

    window.addEventListener("storage", handleStorage);
    window.addEventListener("allocations:changed", handleAllocationChange);
    window.addEventListener("projects:changed", handleProjectChange);

    return () => {
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener("allocations:changed", handleAllocationChange);
      window.removeEventListener("projects:changed", handleProjectChange);
    };
  }, []);

  useEffect(() => {
    if (selectedId && !projects.some((project) => project.id === selectedId)) {
      setSelectedId(null);
    }
  }, [projects, selectedId]);

  const allocationSummary = useMemo(() => {
    return allocations.reduce((acc, allocation) => {
      const key = String(allocation.projectId ?? "");
      if (!acc[key]) {
        acc[key] = {
          itemCount: 0,
          totalQty: 0,
          lastAllocatedAt: null,
          allocations: [],
        };
      }
      acc[key].itemCount += 1;
      acc[key].totalQty += Number(allocation.quantity) || 0;
      acc[key].allocations.push(allocation);
      if (allocation.createdAt) {
        const ts = new Date(allocation.createdAt).getTime();
        const prev = acc[key].lastAllocatedAt
          ? new Date(acc[key].lastAllocatedAt).getTime()
          : 0;
        if (ts > prev) {
          acc[key].lastAllocatedAt = allocation.createdAt;
        }
      }
      return acc;
    }, {});
  }, [allocations]);

<<<<<<< HEAD
  const summary = useMemo(() => {
    const statusCounts = projects.reduce(
      (acc, project) => {
        const raw = project.status || "Draft";
        const normalized = String(raw).trim().toLowerCase();
        acc.total += 1;
        if (normalized.includes("draft")) acc.draft += 1;
        else if (normalized.includes("pending")) acc.pending += 1;
        else if (normalized.includes("approved")) acc.approved += 1;
        else if (normalized.includes("delivered")) acc.delivered += 1;
        else if (normalized.includes("closed")) acc.closed += 1;
        else acc.other += 1;
        return acc;
      },
      {
        total: 0,
        draft: 0,
        pending: 0,
        approved: 0,
        delivered: 0,
        closed: 0,
        other: 0,
      }
    );

    const totalAllocatedQty = allocations.reduce(
      (sum, allocation) => sum + (Number(allocation.quantity) || 0),
      0
    );

    const pendingActions = statusCounts.draft + statusCounts.pending;

    return {
      statusCounts,
      totalAllocatedQty,
      pendingActions,
    };
  }, [projects, allocations]);

  const getStatusBadgeClass = (status) => {
    const normalized = String(status || "Draft")
      .trim()
      .toLowerCase();
    if (normalized.includes("draft")) {
      return "bg-slate-100 text-slate-700 border-slate-200";
    }
    if (normalized.includes("pending")) {
      return "bg-amber-100 text-amber-800 border-amber-200";
    }
    if (normalized.includes("approved")) {
      return "bg-emerald-100 text-emerald-800 border-emerald-200";
    }
    if (normalized.includes("delivered")) {
      return "bg-sky-100 text-sky-800 border-sky-200";
    }
    if (normalized.includes("closed")) {
      return "bg-gray-200 text-gray-800 border-gray-300";
    }
    return "bg-slate-100 text-slate-700 border-slate-200";
  };
=======
  const filteredProjects = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return projects.filter((project) => {
      const matchesSearch = !query
        ? true
        : [project.name, project.code, project.client, project.status]
            .filter(Boolean)
            .some((value) => String(value).toLowerCase().includes(query));
      const matchesStatus =
        statusFilter === "All" || project.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [projects, searchQuery, statusFilter]);

  const selectedProject =
    projects.find((project) => project.id === selectedId) || null;
  const selectedAllocations =
    allocationSummary[String(selectedProject?.id)]?.allocations || [];
  const selectedSummary =
    allocationSummary[String(selectedProject?.id)] || null;
>>>>>>> ab340f3402952da5e02c7b117ed4c40f3d1549b6

  const handleDelete = (id) => {
    deleteProject(id);
    loadProjects();
    if (selectedId === id) {
      setSelectedId(null);
    }
  };

<<<<<<< HEAD
  const actionRoutes = {
    "Create Project": "/inventory/create-project",
    "Create Bill of Quantity (BOQ)": "/inventory/boq",
    "Select / Manage Location": "/inventory/locations",
    "Purchase Order": "/inventory/purchase-orders",
    "Receive Inventory â€“ Location based": "/inventory/receive-goods",
    "Allocate Inventory to Location / Project":
      "/inventory/allocate-projects",
    "Goods Delivered to Location (Confirmation screen)":
      "/inventory/delivery-confirmation",
    "Consumption (Material Used)": "/inventory/consumption",
    "Reallocate / Return Inventory": "/inventory/return-reallocate",
    "Create DC (for Return or Reallocation)": "/inventory/return-dc",
  };

  const handleActionChange = (value) => {
    setActionSelection(value);
    const route = actionRoutes[value];
    if (route) {
      navigate(route);
    }
  };
=======
  const totalProjects = projects.length;
  const activeProjects = projects.filter((p) => p.status === "Active").length;
  const onHoldProjects = projects.filter((p) => p.status === "On Hold").length;
  const completedProjects = projects.filter((p) => p.status === "Completed").length;
  const totalAllocations = allocations.length;
>>>>>>> ab340f3402952da5e02c7b117ed4c40f3d1549b6

  return (
    <div className="p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between mb-6">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-slate-400">
            Projects
          </p>
          <h1 className="text-3xl font-semibold text-slate-800">
            Project Portfolio
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Track project status, allocations, and key dates in one place.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => {
              loadProjects();
              loadAllocations();
            }}
            className="px-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-700 bg-white"
          >
            Refresh
          </button>
          <button
            onClick={() => navigate("/inventory/allocate-projects")}
            className="px-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-700 bg-white"
          >
            Allocate Items
          </button>
          <button
            onClick={() => navigate("/inventory/create-project")}
            className="px-5 py-2 rounded-lg text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700"
          >
            + Create Project
          </button>
        </div>
      </div>

<<<<<<< HEAD
      <div className="bg-white rounded-lg border border-slate-200 p-4 mb-6">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm font-semibold text-slate-700">
            Project Actions
          </span>
          <select
            value={actionSelection}
            onChange={(e) => handleActionChange(e.target.value)}
            className="min-w-[320px] border border-slate-300 rounded-md px-3 py-2 text-sm text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-slate-300"
          >
            <option value="">Select Action</option>
            <option value="Create Project">Create Project</option>
            <option value="Create Bill of Quantity (BOQ)">
              Create Bill of Quantity (BOQ)
            </option>
            <option value="Select / Manage Location">
              Select / Manage Location
            </option>
            <option value="Purchase Order">Purchase Order</option>
            <option value="Receive Inventory â€“ Location based">
              Receive Inventory â€“ Location based
            </option>
            <option value="Allocate Inventory to Location / Project">
              Allocate Inventory to Location / Project
            </option>
            <option value="Goods Delivered to Location (Confirmation screen)">
              Goods Delivered to Location (Confirmation screen)
            </option>
            <option value="Consumption (Material Used)">
              Consumption (Material Used)
            </option>
            <option value="Reallocate / Return Inventory">
              Reallocate / Return Inventory
            </option>
            <option value="Create DC (for Return or Reallocation)">
              Create DC (for Return or Reallocation)
            </option>
          </select>
          <span className="text-xs text-slate-500">
            Choose an action to continue.
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-lg border border-slate-200 p-4">
          <p className="text-xs uppercase tracking-[0.2em] text-slate-400">
            Total Projects
          </p>
          <p className="text-2xl font-semibold text-slate-800">
            {summary.statusCounts.total}
          </p>
          <p className="text-xs text-slate-500 mt-1">
            Draft: {summary.statusCounts.draft} â€¢ Pending:{" "}
            {summary.statusCounts.pending}
          </p>
        </div>
        <div className="bg-white rounded-lg border border-slate-200 p-4">
          <p className="text-xs uppercase tracking-[0.2em] text-slate-400">
            Total Allocated Qty
          </p>
          <p className="text-2xl font-semibold text-slate-800">
            {summary.totalAllocatedQty.toLocaleString()}
          </p>
          <p className="text-xs text-slate-500 mt-1">
            Approved: {summary.statusCounts.approved} â€¢ Delivered:{" "}
            {summary.statusCounts.delivered}
          </p>
        </div>
        <div className="bg-white rounded-lg border border-slate-200 p-4">
          <p className="text-xs uppercase tracking-[0.2em] text-slate-400">
            Pending Actions
          </p>
          <p className="text-2xl font-semibold text-slate-800">
            {summary.pendingActions}
          </p>
          <p className="text-xs text-slate-500 mt-1">
            Closed: {summary.statusCounts.closed}
          </p>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg shadow-sm overflow-x-auto">
        <table className="w-full text-base">
          <thead className="bg-slate-100">
            <tr className="text-slate-700">
              <th className="p-4 text-left min-w-[200px]">Project Name</th>
              <th className="p-4 text-left min-w-[140px]">Code</th>
              <th className="p-4 text-left min-w-[200px]">Client</th>
              <th className="p-4 text-left min-w-[140px]">Status</th>
              <th className="p-4 text-left min-w-[160px]">Start Date</th>
              <th className="p-4 text-left min-w-[160px]">End Date</th>
              <th className="p-4 text-left min-w-[140px]">Actions</th>
            </tr>
          </thead>
=======
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-6">
        <div className="bg-white p-4 rounded-lg shadow-sm border border-slate-200">
          <p className="text-sm text-slate-500">Total Projects</p>
          <p className="text-2xl font-semibold text-slate-800">
            {totalProjects}
          </p>
        </div>
        <div className="bg-white p-4 rounded-lg shadow-sm border border-slate-200">
          <p className="text-sm text-slate-500">Active</p>
          <p className="text-2xl font-semibold text-emerald-600">
            {activeProjects}
          </p>
        </div>
        <div className="bg-white p-4 rounded-lg shadow-sm border border-slate-200">
          <p className="text-sm text-slate-500">On Hold</p>
          <p className="text-2xl font-semibold text-amber-600">
            {onHoldProjects}
          </p>
        </div>
        <div className="bg-white p-4 rounded-lg shadow-sm border border-slate-200">
          <p className="text-sm text-slate-500">Completed</p>
          <p className="text-2xl font-semibold text-slate-600">
            {completedProjects}
          </p>
        </div>
        <div className="bg-white p-4 rounded-lg shadow-sm border border-slate-200">
          <p className="text-sm text-slate-500">Allocations</p>
          <p className="text-2xl font-semibold text-slate-800">
            {totalAllocations}
          </p>
        </div>
      </div>
>>>>>>> ab340f3402952da5e02c7b117ed4c40f3d1549b6

      <div className="bg-white p-4 rounded-lg shadow-sm border border-slate-200 flex flex-col gap-3 lg:flex-row lg:items-center mb-6">
        <input
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
          className="border border-slate-200 px-4 py-2 rounded-lg text-sm w-full lg:w-72"
          placeholder="Search projects, clients, codes"
        />
        <select
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value)}
          className="border border-slate-200 px-4 py-2 rounded-lg text-sm w-full lg:w-52"
        >
          {STATUS_FILTERS.map((status) => (
            <option key={status} value={status}>
              {status}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => {
            setSearchQuery("");
            setStatusFilter("All");
          }}
          className="px-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-600"
        >
          Clear Filters
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1.15fr_0.85fr] gap-6">
        <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-x-auto">
          <div className="px-4 py-3 border-b flex items-center justify-between">
            <h3 className="text-lg font-semibold text-slate-800">
              Project Register
            </h3>
            <p className="text-sm text-slate-500">
              {filteredProjects.length} projects
            </p>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-slate-100 text-slate-600">
              <tr>
                <th className="p-3 text-left min-w-[220px]">Project</th>
                <th className="p-3 text-left min-w-[140px]">Code</th>
                <th className="p-3 text-left min-w-[180px]">Client</th>
                <th className="p-3 text-left min-w-[140px]">Status</th>
                <th className="p-3 text-left min-w-[180px]">Timeline</th>
                <th className="p-3 text-left min-w-[140px]">Allocations</th>
                <th className="p-3 text-left min-w-[120px]">Actions</th>
              </tr>
            </thead>

<<<<<<< HEAD
            {projects.map((project) => (
              <Fragment key={project.id}>
                <tr className="border-t hover:bg-slate-50">
                  <td className="p-4 font-medium text-slate-800">
                    {project.name}
                  </td>
                  <td className="p-4">
                    {project.code || "-"}
                  </td>
                  <td className="p-4">
                    {project.client || "-"}
                  </td>
                  <td className="p-4">
                    {project.status ? (
                      <span
                        className={`inline-flex items-center px-3 py-1 text-xs font-semibold border rounded-full ${getStatusBadgeClass(
                          project.status
                        )}`}
                      >
                        {project.status}
                      </span>
                    ) : (
                      "-"
                    )}
                  </td>
                  <td className="p-4">
                    {formatDateDDMMYYYY(project.startDate)}
                  </td>
                  <td className="p-4">
                    {formatDateDDMMYYYY(project.endDate)}
                  </td>
                  <td className="p-4">
                    <button
                      onClick={() => handleDelete(project.id)}
                      className="text-red-600"
                    >
                      Delete
                    </button>
=======
            <tbody>
              {filteredProjects.length === 0 && (
                <tr>
                  <td colSpan="7" className="text-center p-6 text-slate-500">
                    {projects.length === 0
                      ? "No projects created yet."
                      : "No projects match your filters."}
>>>>>>> ab340f3402952da5e02c7b117ed4c40f3d1549b6
                  </td>
                </tr>
              )}

              {filteredProjects.map((project) => {
                const isSelected = selectedId === project.id;
                const summary = allocationSummary[String(project.id)];
                return (
                  <tr
                    key={project.id}
                    onClick={() => setSelectedId(project.id)}
                    className={`border-t hover:bg-slate-50 cursor-pointer ${
                      isSelected ? "bg-indigo-50/70" : ""
                    }`}
                  >
                    <td className="p-3">
                      <p className="font-medium text-slate-800">
                        {project.name}
                      </p>
                      <p className="text-xs text-slate-500">
                        {project.client || "Client not set"}
                      </p>
                    </td>
                    <td className="p-3">{project.code || "-"}</td>
                    <td className="p-3">{project.client || "-"}</td>
                    <td className="p-3">
                      <span
                        className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs border ${statusBadge(
                          project.status || "Planned"
                        )}`}
                      >
                        {project.status || "Planned"}
                      </span>
                    </td>
                    <td className="p-3">
                      <p className="text-slate-700">
                        {project.startDate
                          ? formatDate(project.startDate)
                          : "-"}{" "}
                        {project.endDate
                          ? `to ${formatDate(project.endDate)}`
                          : ""}
                      </p>
                    </td>
                    <td className="p-3">
                      <p className="text-slate-700">
                        {summary?.itemCount || 0} items
                      </p>
                      <p className="text-xs text-slate-500">
                        Qty {summary?.totalQty || 0}
                      </p>
                    </td>
                    <td className="p-3">
                      <button
                        onClick={(event) => {
                          event.stopPropagation();
                          handleDelete(project.id);
                        }}
                        className="text-red-600 text-sm"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="space-y-4">
          {!selectedProject ? (
            <div className="bg-white rounded-lg shadow-sm border border-dashed border-slate-200 p-6 text-center text-sm text-slate-500">
              Select a project to see details and allocations.
            </div>
          ) : (
            <>
              <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-5">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <p className="text-xs uppercase tracking-[0.3em] text-slate-400">
                      Project Details
                    </p>
                    <h2 className="text-xl font-semibold text-slate-800">
                      {selectedProject.name}
                    </h2>
                    <p className="text-sm text-slate-500 mt-1">
                      {selectedProject.code || "No code"} |{" "}
                      {selectedProject.client || "Client not set"}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedId(null)}
                    className="text-xs text-slate-500 hover:text-slate-700"
                  >
                    Clear
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                  <div className="flex flex-col">
                    <span className="text-xs uppercase tracking-[0.2em] text-slate-400">
                      Status
                    </span>
                    <span className="font-medium text-slate-800">
                      {selectedProject.status || "Planned"}
                    </span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-xs uppercase tracking-[0.2em] text-slate-400">
                      Timeline
                    </span>
                    <span className="font-medium text-slate-800">
                      {selectedProject.startDate
                        ? formatDate(selectedProject.startDate)
                        : "-"}{" "}
                      {selectedProject.endDate
                        ? `to ${formatDate(selectedProject.endDate)}`
                        : ""}
                    </span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-xs uppercase tracking-[0.2em] text-slate-400">
                      Allocations
                    </span>
                    <span className="font-medium text-slate-800">
                      {selectedSummary?.itemCount || 0} items
                    </span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-xs uppercase tracking-[0.2em] text-slate-400">
                      Total Quantity
                    </span>
                    <span className="font-medium text-slate-800">
                      {selectedSummary?.totalQty || 0}
                    </span>
                  </div>
                </div>

                {selectedProject.notes && (
                  <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
                    <span className="font-medium text-slate-700">
                      Notes:
                    </span>{" "}
                    {selectedProject.notes}
                  </div>
                )}

                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => navigate("/inventory/allocate-projects")}
                    className="px-4 py-2 rounded-lg text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700"
                  >
                    Allocate Items
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(selectedProject.id)}
                    className="px-4 py-2 border border-slate-200 rounded-lg text-sm text-red-600"
                  >
                    Delete Project
                  </button>
                </div>
              </div>

              <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-5">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-base font-semibold text-slate-800">
                    Allocation Summary
                  </h3>
                  <span className="text-xs text-slate-500">
                    {selectedAllocations.length} allocations
                  </span>
                </div>
                {selectedAllocations.length === 0 ? (
                  <p className="text-sm text-slate-500">
                    No allocations recorded for this project yet.
                  </p>
                ) : (
                  <div className="grid grid-cols-1 gap-3">
                    {selectedAllocations
                      .slice()
                      .sort((a, b) => {
                        const aTime = a.createdAt
                          ? new Date(a.createdAt).getTime()
                          : 0;
                        const bTime = b.createdAt
                          ? new Date(b.createdAt).getTime()
                          : 0;
                        return bTime - aTime;
                      })
                      .map((allocation) => (
                        <div
                          key={allocation.id}
                          className="border border-slate-200 rounded-lg p-3 bg-slate-50/60"
                        >
                          <div className="flex items-center justify-between">
                            <p className="text-sm font-medium text-slate-800">
                              {allocation.itemName ||
                                `Item #${allocation.itemId}`}
                            </p>
                            <span className="text-xs text-slate-500">
                              Qty {allocation.quantity}
                            </span>
                          </div>
                          {allocation.notes && (
                            <p className="text-xs text-slate-500 mt-1">
                              Notes: {allocation.notes}
                            </p>
                          )}
                          <p className="text-xs text-slate-400 mt-1">
                            {formatDateTime(allocation.createdAt)}
                          </p>
<<<<<<< HEAD
                        );
                      }
                      return (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          {projectAllocations.map((allocation) => (
                            <div
                              key={allocation.id}
                              className="border border-slate-200 bg-white rounded-lg p-3"
                            >
                              <p className="text-sm font-medium text-slate-800">
                                {allocation.itemName ||
                                  `Item #${allocation.itemId}`}
                              </p>
                              <p className="text-xs text-slate-500">
                                Qty: {allocation.quantity}
                              </p>
                              {allocation.notes && (
                                <p className="text-xs text-slate-500">
                                  Notes: {allocation.notes}
                                </p>
                              )}
                              <p className="text-xs text-slate-400">
                                {formatDateTimeDDMMYYYY(allocation.createdAt)}
                              </p>
                            </div>
                          ))}
=======
>>>>>>> ab340f3402952da5e02c7b117ed4c40f3d1549b6
                        </div>
                      ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default ProjectsHome;


