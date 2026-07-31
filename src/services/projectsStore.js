import {
  normalizeProjectRecord,
  normalizeProjectsList,
} from "./projectNormalization";

const STORAGE_KEY = "projects";

const emitChange = () => {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("projects:changed"));
  }
};

export const getProjects = () => {
  try {
    return normalizeProjectsList(
      JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]")
    );
  } catch {
    return [];
  }
};

export const setProjects = (projects = [], options = {}) => {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify(normalizeProjectsList(projects))
  );
  if (options.emit !== false) {
    emitChange();
  }
};

export const saveProject = (project) => {
  const projects = getProjects();
  const next = [...projects, normalizeProjectRecord(project)];
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  emitChange();
  return next[next.length - 1];
};

export const deleteProject = (id) => {
  const projects = getProjects();
  const next = projects.filter((project) => project.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
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
  emitChange();
};
