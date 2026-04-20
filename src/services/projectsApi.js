import api from "./api";
import {
  normalizeProjectRecord,
  normalizeProjectsList,
} from "./projectNormalization";

const emitProjectsChange = () => {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("projects:changed"));
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
  const normalized = normalizeProjectRecord(response.data?.project ?? response.data);
  emitProjectsChange();
  return normalized;
};

export const deleteProjectApi = async (id) => {
  await api.delete(`/projects/${id}`);
  emitProjectsChange();
};
