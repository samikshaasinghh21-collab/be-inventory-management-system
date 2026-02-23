import api from "./api";

const normalizeProject = (project = {}) => ({
  id: project.id ?? project.ProjectId ?? null,
  name: project.name ?? project.ProjectName ?? "",
  code: project.code ?? project.ProjectCode ?? "",
  client: project.client ?? project.Client ?? "",
  status: project.status ?? project.Status ?? "",
  startDate: project.startDate ?? project.StartDate ?? null,
  endDate: project.endDate ?? project.EndDate ?? null,
  notes: project.notes ?? project.Notes ?? "",
});

export const fetchProjects = async () => {
  const response = await api.get("/projects");
  const list = Array.isArray(response.data)
    ? response.data
    : response.data?.projects ?? [];
  return list.map(normalizeProject);
};

export const createProject = async (payload) => {
  const response = await api.post("/projects", payload);
  return normalizeProject(response.data?.project ?? response.data);
};

export const updateProjectApi = async (id, payload) => {
  const response = await api.put(`/projects/${id}`, payload);
  return normalizeProject(response.data?.project ?? response.data);
};

export const deleteProjectApi = async (id) => {
  await api.delete(`/projects/${id}`);
};
