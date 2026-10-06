const safeParse = (value) => {
  if (!value) {
    return [];
  }
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const emitChange = (key) => {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(`${key}:changed`));
  }
};

export const getWorkflowList = (key) => {
  if (typeof window === "undefined") {
    return [];
  }
  const list = safeParse(localStorage.getItem(key));
  const serverKey = `workflow-${String(key).toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "")}`;
  hydrateWorkspaceData(serverKey, list, (value) => {
    localStorage.setItem(key, JSON.stringify(Array.isArray(value) ? value : []));
    emitChange(key);
  });
  return list;
};

const persistWorkflow = (key, value) => {
  const serverKey = `workflow-${String(key).toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "")}`;
  persistWorkspaceData(serverKey, value);
};

export const addWorkflowItem = (key, item) => {
  const list = getWorkflowList(key);
  const next = [...list, item];
  localStorage.setItem(key, JSON.stringify(next));
  persistWorkflow(key, next);
  emitChange(key);
  return item;
};

export const updateWorkflowItem = (key, id, updates) => {
  const list = getWorkflowList(key);
  const next = list.map((item) =>
    item.id === id ? { ...item, ...updates } : item
  );
  localStorage.setItem(key, JSON.stringify(next));
  persistWorkflow(key, next);
  emitChange(key);
  return next.find((item) => item.id === id);
};

export const deleteWorkflowItem = (key, id) => {
  const list = getWorkflowList(key);
  const next = list.filter((item) => item.id !== id);
  localStorage.setItem(key, JSON.stringify(next));
  persistWorkflow(key, next);
  emitChange(key);
  return next;
};
import { hydrateWorkspaceData, persistWorkspaceData } from "./workspaceDataApi";
