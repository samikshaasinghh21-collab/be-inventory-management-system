import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { deleteProject, getProjects } from "../services/projectsStore";

const ProjectsHome = () => {
  const navigate = useNavigate();
  const [projects, setProjects] = useState([]);

  const loadProjects = () => {
    setProjects(getProjects());
  };

  useEffect(() => {
    loadProjects();
  }, []);

  const handleDelete = (id) => {
    deleteProject(id);
    loadProjects();
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-slate-400">Projects</p>
          <h1 className="text-3xl font-semibold text-slate-800">Projects</h1>
        </div>
        <button
          type="button"
          onClick={() => navigate("/inventory/create-project")}
          className="px-5 py-2 rounded-lg text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700"
        >
          + Create Project
        </button>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-100 text-slate-600">
            <tr>
              <th className="p-3 text-left">Project Name</th>
              <th className="p-3 text-left">Client</th>
              <th className="p-3 text-left">Status</th>
              <th className="p-3 text-left">Actions</th>
            </tr>
          </thead>
          <tbody>
            {projects.length === 0 && (
              <tr>
                <td colSpan="4" className="p-6 text-center text-slate-500">
                  No projects found.
                </td>
              </tr>
            )}
            {projects.map((project) => (
              <tr key={project.id} className="border-t">
                <td className="p-3">{project.name || "-"}</td>
                <td className="p-3">{project.client || "-"}</td>
                <td className="p-3">{project.status || "-"}</td>
                <td className="p-3">
                  <button
                    type="button"
                    onClick={() => handleDelete(project.id)}
                    className="text-red-600"
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default ProjectsHome;
