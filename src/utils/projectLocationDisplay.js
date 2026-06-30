export const normalizeProjectSelectionValue = (value) => {
  if (value === undefined || value === null) {
    return "";
  }
  const text = String(value).trim();
  if (!text || text === "0") {
    return "";
  }
  return text;
};

export const isSharedLocation = (location = {}) =>
  normalizeProjectSelectionValue(location.projectId) === "";

export const getProjectLinkedLocations = (projectId, locations = []) => {
  const selectedProjectId = normalizeProjectSelectionValue(projectId);
  if (!selectedProjectId) {
    return [];
  }
  return (Array.isArray(locations) ? locations : []).filter(
    (location) =>
      normalizeProjectSelectionValue(location.projectId) === selectedProjectId
  );
};

export const formatProjectOptionLabel = (project = {}, locations = []) => {
  const parts = [project.name || "Project"];
  if (project.code) {
    parts.push(`[${project.code}]`);
  }
  const linkedLocations = getProjectLinkedLocations(project.id, locations);
  if (linkedLocations.length) {
    parts.push(`- ${linkedLocations.map((location) => location.name).join(", ")}`);
  }
  return parts.join(" ");
};

export const formatLocationOptionLabel = (location = {}, projectMap = {}) => {
  const parts = [location.name || "Location"];
  if (location.code) {
    parts.push(`[${location.code}]`);
  }
  if (isSharedLocation(location)) {
    parts.push("(Shared)");
  } else {
    const linkedProjectName =
      projectMap[String(normalizeProjectSelectionValue(location.projectId))]?.name || "";
    if (linkedProjectName) {
      parts.push(`(${linkedProjectName})`);
    }
  }
  return parts.join(" ");
};
