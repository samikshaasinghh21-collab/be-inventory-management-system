import api from "./api";

const emitLocationsChange = () => {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("locations:changed"));
  }
};

const normalizeLocation = (location = {}) => ({
  id: location.id ?? location.LocationId ?? null,
  name:
    location.name ??
    location.Name ??
    location.locationName ??
    location.LocationName ??
    "",
  code: location.code ?? location.Code ?? "",
  type: location.type ?? location.Type ?? "Site",
  projectId: location.projectId ?? location.ProjectId ?? "",
  manager: location.manager ?? location.Manager ?? "",
  phone: location.phone ?? location.Phone ?? "",
  address: location.address ?? location.Address ?? "",
  status: location.status ?? location.Status ?? "Active",
  createdAt: location.createdAt ?? location.CreatedAt ?? null,
  updatedAt: location.updatedAt ?? location.UpdatedAt ?? null,
});

export const fetchLocations = async (projectId = null) => {
  const parsedProjectId = Number.parseInt(projectId, 10);
  const hasProjectFilter = Number.isFinite(parsedProjectId);
  const response = await api.get("/locations", {
    params: hasProjectFilter ? { projectId: parsedProjectId } : undefined,
  });
  const list = Array.isArray(response.data?.locations)
    ? response.data.locations
    : Array.isArray(response.data)
    ? response.data
    : [];
  return list.map(normalizeLocation);
};

export const createLocation = async (payload) => {
  const response = await api.post("/locations", payload);
  const normalized = normalizeLocation(response.data?.location ?? response.data);
  emitLocationsChange();
  return normalized;
};

export const updateLocation = async (id, payload) => {
  const response = await api.put(`/locations/${id}`, payload);
  const normalized = normalizeLocation(response.data?.location ?? response.data);
  emitLocationsChange();
  return normalized;
};

export const deleteLocation = async (id) => {
  await api.delete(`/locations/${id}`);
  emitLocationsChange();
};
