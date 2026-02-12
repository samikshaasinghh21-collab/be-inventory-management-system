import { Fragment, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getAllocations } from "../services/allocationsStore";
import { deleteProject, getProjects } from "../services/projectsStore";
import { formatDateDDMMYYYY, formatDateTimeDDMMYYYY } from "../utils/dateFormat";

const ProjectsHome = () => {
  const navigate = useNavigate();
  const [projects, setProjects] = useState([]);
  const [allocations, setAllocations] = useState([]);
  const [actionSelection, setActionSelection] = useState("");

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

  const allocationsByProject = useMemo(() => {
    return allocations.reduce((acc, allocation) => {
      const key = String(allocation.projectId ?? "");
      if (!acc[key]) {
        acc[key] = [];
      }
      acc[key].push(allocation);
      return acc;
    }, {});
  }, [allocations]);

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

  const handleDelete = (id) => {
    deleteProject(id);
    loadProjects();
  };

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

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-slate-400">
            Projects
          </p>
          <h1 className="text-3xl font-semibold text-slate-800">
            Project List
          </h1>
        </div>
        <div className="flex gap-2">
          <button
            onClick={loadAllocations}
            className="px-4 py-2 border rounded-md bg-white text-slate-700"
          >
            Refresh Allocations
          </button>
          <button
            onClick={() => navigate("/inventory/allocate-projects")}
            className="px-4 py-2 border rounded-md bg-white text-slate-700"
          >
            Allocate Items
          </button>
          <button
            onClick={() => navigate("/inventory/create-project")}
            className="bg-indigo-600 text-white px-6 py-3 rounded-md text-base font-medium hover:bg-indigo-700"
          >
            + Create Project
          </button>
        </div>
      </div>

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

          <tbody>
            {projects.length === 0 && (
              <tr>
                <td
                  colSpan="7"
                  className="text-center p-6 text-slate-500"
                >
                  No projects created yet
                </td>
              </tr>
            )}

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
                  </td>
                </tr>
                <tr className="bg-slate-50/80 border-t">
                  <td colSpan="7" className="p-4">
                    <p className="text-xs uppercase tracking-[0.3em] text-slate-400 mb-3">
                      Allocations
                    </p>
                    {(() => {
                      const projectAllocations =
                        allocationsByProject[String(project.id)] || [];
                      if (projectAllocations.length === 0) {
                        return (
                          <p className="text-sm text-slate-500">
                            No allocations yet.
                          </p>
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
                        </div>
                      );
                    })()}
                  </td>
                </tr>
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default ProjectsHome;


