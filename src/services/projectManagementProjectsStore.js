import {
  normalizeProjectRecord,
  normalizeProjectsList,
} from "./projectNormalization";

const STORAGE_KEY = "project_management_projects";
export const PROJECT_MANAGEMENT_PROJECTS_EVENT =
  "project-management:projects-changed";

const canUseLocalStorage = () =>
  typeof window !== "undefined" && typeof window.localStorage !== "undefined";

const emitChange = () => {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(PROJECT_MANAGEMENT_PROJECTS_EVENT));
  }
};

export const getProjectManagementProjects = () => {
  if (!canUseLocalStorage()) return [];

  try {
    return normalizeProjectsList(
      JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]")
    );
  } catch {
    return [];
  }
};

export const setProjectManagementProjects = (projects = []) => {
  if (!canUseLocalStorage()) return [];

  const normalized = normalizeProjectsList(projects);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
  emitChange();
  return normalized;
};

export const ensureProjectManagementProjects = (defaults = []) => {
  const existing = getProjectManagementProjects();
  if (existing.length) return existing;
  return setProjectManagementProjects(defaults);
};

export const saveProjectManagementProject = (project) => {
  const projects = getProjectManagementProjects();
  const next = [normalizeProjectRecord(project), ...projects];
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  emitChange();
  return next[0];
};
