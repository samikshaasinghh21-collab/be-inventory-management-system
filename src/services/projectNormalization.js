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
  projectCategory:
    project.projectCategory ?? project.ProjectCategory ?? project.category ?? "",
  description:
    project.description ?? project.ProjectDescription ?? project.notes ?? project.Notes ?? "",
  priority: project.priority ?? project.Priority ?? "Medium",
  projectManager:
    project.projectManager ?? project.ProjectManager ?? project.manager ?? "",
  siteEngineer: project.siteEngineer ?? project.SiteEngineer ?? "",
  teamLead: project.teamLead ?? project.TeamLead ?? "",
  department: project.department ?? project.Department ?? "",
  actualEndDate: normalizeProjectDate(
    project.actualEndDate ?? project.ActualEndDate
  ),
  milestoneTemplate:
    project.milestoneTemplate ?? project.MilestoneTemplate ?? "",
  estimatedBudget: Number(project.estimatedBudget ?? project.EstimatedBudget ?? 0) || 0,
  approvedBudget: Number(project.approvedBudget ?? project.ApprovedBudget ?? 0) || 0,
  materialBudget: Number(project.materialBudget ?? project.MaterialBudget ?? 0) || 0,
  labourBudget: Number(project.labourBudget ?? project.LabourBudget ?? 0) || 0,
  otherCostBudget: Number(project.otherCostBudget ?? project.OtherCostBudget ?? 0) || 0,
  expenses: Number(project.expenses ?? project.Expenses ?? 0) || 0,
  progress: Number(project.progress ?? project.Progress ?? 0) || 0,
  teamSize: Number(project.teamSize ?? project.TeamSize ?? 0) || 0,
  resourceUtilization:
    Number(project.resourceUtilization ?? project.ResourceUtilization ?? 0) || 0,
  siteName: project.siteName ?? project.SiteName ?? "",
  siteAddress: project.siteAddress ?? project.SiteAddress ?? project.address ?? "",
  city: project.city ?? project.City ?? "",
  state: project.state ?? project.State ?? "",
  siteContactPerson:
    project.siteContactPerson ?? project.SiteContactPerson ?? project.contactPerson ?? "",
  siteContactNumber:
    project.siteContactNumber ?? project.SiteContactNumber ?? project.phone ?? "",
  tasks: Array.isArray(project.tasks) ? project.tasks : [],
  teamAllocations: Array.isArray(project.teamAllocations)
    ? project.teamAllocations
    : [],
  milestones: Array.isArray(project.milestones) ? project.milestones : [],
  inventoryAllocations: Array.isArray(project.inventoryAllocations)
    ? project.inventoryAllocations
    : [],
  purchases: Array.isArray(project.purchases) ? project.purchases : [],
  financials: Array.isArray(project.financials) ? project.financials : [],
  documents: Array.isArray(project.documents) ? project.documents : [],
  activities: Array.isArray(project.activities) ? project.activities : [],
  openIssues: Number(project.openIssues ?? project.OpenIssues ?? 0) || 0,
  pendingInvoices:
    Number(project.pendingInvoices ?? project.PendingInvoices ?? 0) || 0,
  createdAt: project.createdAt ?? project.CreatedAt ?? null,
  updatedAt: project.updatedAt ?? project.UpdatedAt ?? null,
});

export const normalizeProjectsList = (projects = []) =>
  Array.isArray(projects) ? projects.map(normalizeProjectRecord) : [];
