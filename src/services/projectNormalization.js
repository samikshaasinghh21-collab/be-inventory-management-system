const pad = (value) => String(value).padStart(2, "0");

export const normalizeProjectDate = (value) => {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  const trimmed = String(value).trim();
  if (!trimmed) {
    return null;
  }

  const directMatch = /^(\d{4})-(\d{2})-(\d{2})/.exec(trimmed);
  if (directMatch) {
    return `${directMatch[1]}-${directMatch[2]}-${directMatch[3]}`;
  }

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return `${parsed.getUTCFullYear()}-${pad(parsed.getUTCMonth() + 1)}-${pad(parsed.getUTCDate())}`;
};

export const normalizeProjectRecord = (project = {}) => ({
  id: project.id ?? project.ProjectId ?? null,
  name: project.name ?? project.ProjectName ?? "",
  code: project.code ?? project.ProjectCode ?? "",
  client: project.client ?? project.Client ?? "",
  status: project.status ?? project.Status ?? "",
  startDate: normalizeProjectDate(project.startDate ?? project.StartDate),
  endDate: normalizeProjectDate(project.endDate ?? project.EndDate),
  notes: project.notes ?? project.Notes ?? "",
});

export const normalizeProjectsList = (projects = []) =>
  Array.isArray(projects) ? projects.map(normalizeProjectRecord) : [];
