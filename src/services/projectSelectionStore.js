const STORAGE_KEY = "inventory_active_project_id";

const emitChange = () => {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("inventory:active-project-changed"));
  }
};

export const getActiveProjectId = () => {
  if (typeof window === "undefined") {
    return "";
  }
  return String(localStorage.getItem(STORAGE_KEY) ?? "").trim();
};

export const setActiveProjectId = (projectId) => {
  if (typeof window === "undefined") {
    return "";
  }
  const nextValue = String(projectId ?? "").trim();
  if (nextValue) {
    localStorage.setItem(STORAGE_KEY, nextValue);
  } else {
    localStorage.removeItem(STORAGE_KEY);
  }
  emitChange();
  return nextValue;
};
