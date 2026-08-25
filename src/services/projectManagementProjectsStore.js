import { normalizeProjectsList } from "./projectNormalization";
import {
  createProjectManagementProject,
  fetchProjectManagementProjects,
} from "./projectManagementApi";

export const PROJECT_MANAGEMENT_PROJECTS_EVENT =
  "project-management:projects-changed";

let projectCache = [];

if (typeof window !== "undefined") {
  try {
    window.localStorage.removeItem("project_management_projects");
  } catch {
    // Storage may be unavailable in restricted browser contexts.
  }
}

const emitChange = () => {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(PROJECT_MANAGEMENT_PROJECTS_EVENT));
  }
};

const sameProject = (left = {}, right = {}) => {
  if (
    left.id !== undefined &&
    left.id !== null &&
    right.id !== undefined &&
    right.id !== null
  ) {
    return String(left.id) === String(right.id);
  }
  const leftCode = String(left.code || left.ProjectCode || "").trim().toLowerCase();
  const rightCode = String(right.code || right.ProjectCode || "").trim().toLowerCase();
  return Boolean(leftCode && rightCode && leftCode === rightCode);
};

export const getProjectManagementProjects = () => projectCache;

export const setProjectManagementProjects = (projects = []) => {
  projectCache = normalizeProjectsList(Array.isArray(projects) ? projects : []);
  emitChange();
  return projectCache;
};

export const hydrateProjectManagementProjects = async () => {
  projectCache = normalizeProjectsList(await fetchProjectManagementProjects());
  emitChange();
  return projectCache;
};

export const saveProjectManagementProject = async (project) => {
  const saved = await createProjectManagementProject(project);
  const [normalized] = normalizeProjectsList([saved]);
  projectCache = [
    normalized,
    ...projectCache.filter((item) => !sameProject(item, saved)),
  ];
  emitChange();
  return normalized;
};
