import { Fragment, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getAllocations } from "../services/allocationsStore";
import { deleteProject, getProjects } from "../services/projectsStore";

const ProjectsHome = () => {
  const navigate = useNavigate();
  const [projects, setProjects] = useState([]);
  const [allocations, setAllocations] = useState([]);

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

  const handleDelete = (id) => {
    deleteProject(id);
    loadProjects();
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
                    {project.status || "-"}
                  </td>
                  <td className="p-4">
                    {project.startDate || "-"}
                  </td>
                  <td className="p-4">
                    {project.endDate || "-"}
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
                                {allocation.createdAt
                                  ? new Date(
                                      allocation.createdAt
                                    ).toLocaleString()
                                  : "-"}
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
