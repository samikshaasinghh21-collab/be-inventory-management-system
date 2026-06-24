import { formatCustomerName } from "../utils/formatters";
import { parseDateValue } from "../utils/dateFormat";

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

  const parsed = parseDateValue(trimmed);
  if (!parsed || Number.isNaN(parsed.getTime())) {
    return null;
  }

  return `${parsed.getFullYear()}-${pad(parsed.getMonth() + 1)}-${pad(parsed.getDate())}`;
};

export const normalizeProjectRecord = (project = {}) => ({
  id: project.id ?? project.ProjectId ?? null,
  name: project.name ?? project.ProjectName ?? "",
  code: project.code ?? project.ProjectCode ?? "",
  customerId: project.customerId ?? project.CustomerId ?? null,
  clientId:
    project.clientId ??
    project.ClientId ??
    project.customerId ??
    project.CustomerId ??
    null,
  client: formatCustomerName(project.client ?? project.Client ?? ""),
  companyName:
    formatCustomerName(
      project.companyName ??
        project.ClientCompany ??
        project.clientCompany ??
        ""
    ),
  address:
    project.address ??
    project.ClientAddress ??
    project.clientAddress ??
    "",
  gstNumber:
    project.gstNumber ??
    project.ClientGSTNumber ??
    project.ClientGstNumber ??
    project.clientGstNumber ??
    "",
  phone:
    project.phone ??
    project.ClientPhone ??
    project.clientPhone ??
    "",
  email:
    project.email ??
    project.ClientEmail ??
    project.clientEmail ??
    "",
  contactPerson:
    project.contactPerson ??
    project.ClientContactPerson ??
    project.clientContactPerson ??
    "",
  designation:
    project.designation ??
    project.ClientDesignation ??
    project.clientDesignation ??
    "",
  status: project.status ?? project.Status ?? "",
  startDate: normalizeProjectDate(project.startDate ?? project.StartDate),
  endDate: normalizeProjectDate(project.endDate ?? project.EndDate),
  notes: project.notes ?? project.Notes ?? "",
});

export const normalizeProjectsList = (projects = []) =>
  Array.isArray(projects) ? projects.map(normalizeProjectRecord) : [];
