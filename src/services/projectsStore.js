const STORAGE_KEY = "projects";

const emitChange = () => {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("projects:changed"));
  }
};

export const getProjects = () => {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
  } catch {
    return [];
  }
};

export const saveProject = (project) => {
  const projects = getProjects();
  const next = [...projects, project];
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  emitChange();
  return project;
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
    project.id === id ? { ...project, ...updates } : project
  );
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  emitChange();
};
