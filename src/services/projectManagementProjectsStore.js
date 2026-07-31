import {
  normalizeProjectRecord,
  normalizeProjectsList,
} from "./projectNormalization";
import {
  createProjectManagementProject,
  fetchProjectManagementProjects,
} from "./projectManagementApi";

const STORAGE_KEY = "project_management_projects";
export const PROJECT_MANAGEMENT_PROJECTS_EVENT =
  "project-management:projects-changed";

const PROJECT_COLLECTION_FIELDS = [
  "tasks",
  "teamAllocations",
  "milestones",
  "inventoryAllocations",
  "purchases",
  "financials",
  "documents",
  "activities",
  "siteReports",
];

const canUseLocalStorage = () =>
  typeof window !== "undefined" && typeof window.localStorage !== "undefined";

const readStoredProjects = () => {
  if (!canUseLocalStorage()) return [];
  try {
    return normalizeProjectsList(
      JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "[]")
    );
  } catch {
    return [];
  }
};

let projectCache = readStoredProjects();

const emitChange = () => {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(PROJECT_MANAGEMENT_PROJECTS_EVENT));
  }
};

const recordKey = (record, index) => {
  if (record?.id !== undefined && record?.id !== null && record?.id !== "") {
    return `id:${String(record.id)}`;
  }
  return `value:${JSON.stringify(record)}:${index}`;
};

const mergeCollection = (legacy = [], server = []) => {
  const merged = new Map();
  (Array.isArray(legacy) ? legacy : []).forEach((record, index) => {
    merged.set(recordKey(record, index), record);
  });
  (Array.isArray(server) ? server : []).forEach((record, index) => {
    const key = recordKey(record, index);
    merged.set(key, { ...(merged.get(key) || {}), ...record });
  });
  return Array.from(merged.values());
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

const mergeProject = (legacyProject = {}, serverProject = {}) => {
  const legacy = normalizeProjectRecord(legacyProject);
  const server = normalizeProjectRecord(serverProject);
  const merged = normalizeProjectRecord({ ...legacy, ...serverProject });

  PROJECT_COLLECTION_FIELDS.forEach((field) => {
    merged[field] = mergeCollection(legacy[field], server[field]);
  });

  return merged;
};

const mergeProjects = (legacyProjects = [], serverProjects = []) => {
  const remainingLegacy = [...normalizeProjectsList(legacyProjects)];
  const merged = normalizeProjectsList(serverProjects).map((serverProject) => {
    const legacyIndex = remainingLegacy.findIndex((legacyProject) =>
      sameProject(legacyProject, serverProject)
    );
    const legacyProject =
      legacyIndex >= 0 ? remainingLegacy.splice(legacyIndex, 1)[0] : {};
    return mergeProject(legacyProject, serverProject);
  });

  return [...merged, ...remainingLegacy];
};

const persistCache = () => {
  if (canUseLocalStorage()) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(projectCache));
  }
};

export const getProjectManagementProjects = () => projectCache;

export const setProjectManagementProjects = (projects = []) => {
  projectCache = normalizeProjectsList(Array.isArray(projects) ? projects : []);
  persistCache();
  emitChange();
  return projectCache;
};

export const ensureProjectManagementProjects = (defaults = []) => {
  if (projectCache.length) return projectCache;
  return setProjectManagementProjects(defaults);
};

export const hydrateProjectManagementProjects = async (defaults = []) => {
  const legacyProjects = projectCache.length ? projectCache : readStoredProjects();
  try {
    const serverProjects = await fetchProjectManagementProjects();
    projectCache = mergeProjects(
      legacyProjects.length ? legacyProjects : defaults,
      serverProjects
    );
  } catch (error) {
    if (!legacyProjects.length && !defaults.length) throw error;
    projectCache = normalizeProjectsList(
      legacyProjects.length ? legacyProjects : defaults
    );
  }
  persistCache();
  emitChange();
  return projectCache;
};

export const saveProjectManagementProject = async (project) => {
  const saved = await createProjectManagementProject(project);
  const existing = projectCache.find((item) => sameProject(item, saved));
  const merged = mergeProject(existing, saved);
  projectCache = [
    merged,
    ...projectCache.filter((item) => !sameProject(item, saved)),
  ];
  persistCache();
  emitChange();
  return merged;
};
