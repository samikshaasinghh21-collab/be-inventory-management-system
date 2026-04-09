import api from "./api";
import {
  normalizeProjectRecord,
  normalizeProjectsList,
} from "./projectNormalization";

export const fetchProjects = async () => {
  try {
    const response = await api.get("/projects");

    const list = Array.isArray(response.data)
      ? response.data
      : response.data?.projects ?? [];

    return normalizeProjectsList(list);
  } catch (error) {
    console.error("API Error:", error);
    throw error;
  }
};

export const createProject = async (payload) => {
  const response = await api.post("/projects", payload);
  return normalizeProjectRecord(response.data?.project ?? response.data);
};

export const updateProjectApi = async (id, payload) => {
  const response = await api.put(`/projects/${id}`, payload);
  return normalizeProjectRecord(response.data?.project ?? response.data);
};

export const deleteProjectApi = async (id) => {
  await api.delete(`/projects/${id}`);
};