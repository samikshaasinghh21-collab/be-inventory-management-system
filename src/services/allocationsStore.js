const STORAGE_KEY = "project_allocations";

const emitChange = () => {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("allocations:changed"));
  }
};

export const getAllocations = () => {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
  } catch {
    return [];
  }
};

export const saveAllocation = (allocation) => {
  const allocations = getAllocations();
  const next = [...allocations, allocation];
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  emitChange();
  return allocation;
};

export const updateAllocation = (id, updates) => {
  const allocations = getAllocations();
  const next = allocations.map((allocation) =>
    allocation.id === id ? { ...allocation, ...updates } : allocation
  );
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  emitChange();
};

export const deleteAllocation = (id) => {
  const allocations = getAllocations();
  const next = allocations.filter((allocation) => allocation.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  emitChange();
};
