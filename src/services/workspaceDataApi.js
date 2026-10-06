import api from "./api";

const hydrated = new Set();
const pendingWrites = new Map();

export const hydrateWorkspaceData = (key, fallback, apply) => {
  if (hydrated.has(key)) return;
  hydrated.add(key);
  void api.get(`/workspace-data/${key}`).then(({ data }) => {
    if (!data?.ok || !Object.hasOwn(data, "value")) return null;
    if (data.value === null) {
      return api.put(`/workspace-data/${key}`, { value: fallback });
    }
    apply(data.value);
    return null;
  }).catch((error) => {
    // Older backend builds do not expose workspace-data. Keep using the local
    // fallback for this session instead of retrying the same 404 on every read.
    if (error?.response?.status !== 404) {
      hydrated.delete(key);
    }
  });
};

export const persistWorkspaceData = (key, value) => {
  clearTimeout(pendingWrites.get(key));
  pendingWrites.set(key, setTimeout(() => {
    pendingWrites.delete(key);
    void api.put(`/workspace-data/${key}`, { value }).catch(() => {});
  }, 150));
};
