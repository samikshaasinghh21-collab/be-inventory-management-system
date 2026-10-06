import {
  normalizeProjectRecord,
  normalizeProjectsList,
} from "./projectNormalization";
import { hydrateWorkspaceData, persistWorkspaceData } from "./workspaceDataApi";

const STORAGE_KEY = "projects";
const SERVER_KEY = "legacy-projects";

const emitChange = () => {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("projects:changed"));
  }
};

export const getProjects = () => {
  try {
    const records = normalizeProjectsList(JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]"));
    hydrateWorkspaceData(SERVER_KEY, records, (value) => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(normalizeProjectsList(value)));
      emitChange();
    });
    return records;
  } catch {
    return [];
  }
};

export const setProjects = (projects = [], options = {}) => {
  const normalized = normalizeProjectsList(projects);
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify(normalized)
  );
  persistWorkspaceData(SERVER_KEY, normalized);
  if (options.emit !== false) {
    emitChange();
  }
};

export const saveProject = (project) => {
  const projects = getProjects();
  const next = [...projects, normalizeProjectRecord(project)];
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  persistWorkspaceData(SERVER_KEY, next);
  emitChange();
  return next[next.length - 1];
};

export const deleteProject = (id) => {
  const projects = getProjects();
  const next = projects.filter((project) => project.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  persistWorkspaceData(SERVER_KEY, next);
  emitChange();
};

export const updateProject = (id, updates) => {
  const projects = getProjects();
  const next = projects.map((project) =>
    project.id === id
      ? normalizeProjectRecord({ ...project, ...updates })
      : normalizeProjectRecord(project)
  );
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  persistWorkspaceData(SERVER_KEY, next);
  emitChange();
};
