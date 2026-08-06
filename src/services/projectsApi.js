import api from "./api";
import {
  normalizeProjectRecord,
  normalizeProjectsList,
} from "./projectNormalization";
import { getProjects, setProjects } from "./projectsStore";

const emitProjectsChange = (detail = null) => {
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      detail
        ? new CustomEvent("projects:changed", { detail })
        : new Event("projects:changed")
    );
  }
};

export const fetchProjects = async () => {
  const response = await api.get("/projects");
  const list = Array.isArray(response.data)
    ? response.data
    : response.data?.projects ?? [];
  return normalizeProjectsList(list);
};

export const createProject = async (payload) => {
  const response = await api.post("/projects", payload);
  const normalized = normalizeProjectRecord(response.data?.project ?? response.data);
  emitProjectsChange();
  return normalized;
};

export const updateProjectApi = async (id, payload) => {
  const response = await api.put(`/projects/${id}`, payload);
  const cachedProjects = getProjects();
  const existingProject = cachedProjects.find(
    (project) => String(project.id) === String(id)
  );
  const responseProject = response.data?.project ?? response.data ?? {};
  const normalized = normalizeProjectRecord({
    ...(existingProject || {}),
    ...(payload || {}),
    ...responseProject,
    id: responseProject.id ?? responseProject.ProjectId ?? existingProject?.id ?? id,
    name:
      responseProject.name ??
      responseProject.ProjectName ??
      payload?.name ??
      existingProject?.name ??
      "",
  });
  if (cachedProjects.length) {
    setProjects(
      cachedProjects.map((project) =>
        String(project.id) === String(normalized.id) ? normalized : project
      ),
      { emit: false }
    );
  }
  emitProjectsChange({ action: "updated", project: normalized });
  return normalized;
};

export const deleteProjectApi = async (id) => {
  await api.delete(`/projects/${id}`);
  emitProjectsChange();
};
