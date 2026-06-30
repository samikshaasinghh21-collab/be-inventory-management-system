import {
  normalizeProjectRecord,
  normalizeProjectsList,
} from "./projectNormalization";
import { fetchProjects } from "./projectsApi";
import { getProjects as getInventoryProjects } from "./projectsStore";

const STORAGE_KEY = "project_management_projects";
export const PROJECT_MANAGEMENT_PROJECTS_EVENT =
  "project-management:projects-changed";

const SHARED_PROJECT_FIELDS = [
  "id",
  "name",
  "code",
  "customerId",
  "clientId",
  "locationId",
  "client",
  "companyName",
  "address",
  "gstNumber",
  "phone",
  "email",
  "contactPerson",
  "designation",
  "status",
  "projectManagerId",
  "siteEngineerId",
  "teamLeadId",
  "startDate",
  "endDate",
  "notes",
  "createdAt",
  "updatedAt",
];

const PROJECT_COLLECTION_FIELDS = [
  "tasks",
  "teamAllocations",
  "milestones",
  "inventoryAllocations",
  "purchases",
  "financials",
  "documents",
  "activities",
];

const canUseLocalStorage = () =>
  typeof window !== "undefined" && typeof window.localStorage !== "undefined";

const emitChange = () => {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(PROJECT_MANAGEMENT_PROJECTS_EVENT));
  }
};

const getStoredProjectManagementProjects = () => {
  if (!canUseLocalStorage()) return [];

  try {
    return normalizeProjectsList(
      JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]")
    );
  } catch {
    return [];
  }
};

const getProjectKey = (project = {}, index = 0) =>
  String(
    project?.id ??
      project?.code ??
      `${project?.name ?? "project"}-${index}`
  )
    .trim()
    .toLowerCase();

const hasValue = (value) =>
  ![undefined, null, ""].includes(value);

const mergeProjectRecord = (
  projectManagementProject = {},
  inventoryProject = {}
) => {
  const localProject = normalizeProjectRecord(projectManagementProject);
  const sharedProject = normalizeProjectRecord(inventoryProject);
  const mergedProject = {
    ...sharedProject,
    ...localProject,
  };

  SHARED_PROJECT_FIELDS.forEach((field) => {
    if (!hasValue(mergedProject[field]) && hasValue(sharedProject[field])) {
      mergedProject[field] = sharedProject[field];
    }
  });

  PROJECT_COLLECTION_FIELDS.forEach((field) => {
    mergedProject[field] = Array.isArray(localProject[field])
      ? localProject[field]
      : Array.isArray(sharedProject[field])
        ? sharedProject[field]
        : [];
  });

  return normalizeProjectRecord(mergedProject);
};

export const mergeProjectCollections = (
  inventoryProjects = [],
  projectManagementProjects = []
) => {
  const inventoryMap = new Map(
    normalizeProjectsList(inventoryProjects).map((project, index) => [
      getProjectKey(project, index),
      project,
    ])
  );
  const projectManagementMap = new Map(
    normalizeProjectsList(projectManagementProjects).map((project, index) => [
      getProjectKey(project, index),
      project,
    ])
  );

  const orderedKeys = [
    ...inventoryMap.keys(),
    ...Array.from(projectManagementMap.keys()).filter(
      (key) => !inventoryMap.has(key)
    ),
  ];

  return orderedKeys.map((key) =>
    mergeProjectRecord(
      projectManagementMap.get(key),
      inventoryMap.get(key)
    )
  );
};

export const getProjectManagementProjects = () =>
  mergeProjectCollections(
    getInventoryProjects(),
    getStoredProjectManagementProjects()
  );

export const setProjectManagementProjects = (projects = []) => {
  if (!canUseLocalStorage()) return [];

  const normalized = mergeProjectCollections(getInventoryProjects(), projects);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
  emitChange();
  return normalized;
};

export const ensureProjectManagementProjects = (defaults = []) => {
  const existing = getStoredProjectManagementProjects();
  if (existing.length) return existing;
  return setProjectManagementProjects(defaults);
};

export const saveProjectManagementProject = (project) => {
  const projects = getProjectManagementProjects();
  const next = [normalizeProjectRecord(project), ...projects];
  return setProjectManagementProjects(next)[0];
};

export const hydrateProjectManagementProjects = async (defaults = []) => {
  const fallbackProjects = getInventoryProjects();

  try {
    const latestProjects = await fetchProjects();
    return setProjectManagementProjects(
      mergeProjectCollections(
        latestProjects,
        getStoredProjectManagementProjects().length
          ? getStoredProjectManagementProjects()
          : defaults
      )
    );
  } catch {
    return setProjectManagementProjects(
      mergeProjectCollections(
        fallbackProjects,
        getStoredProjectManagementProjects().length
          ? getStoredProjectManagementProjects()
          : defaults
      )
    );
  }
};
