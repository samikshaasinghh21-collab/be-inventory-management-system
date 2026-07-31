export const projectKpis = [
  {
    id: "total-projects",
    label: "Total Projects",
    value: 48,
    helper: "All time projects",
    icon: "folder",
    color: "violet",
  },
  {
    id: "active-projects",
    label: "Active Projects",
    value: 18,
    helper: "37.50% of total",
    icon: "activity",
    color: "emerald",
  },
  {
    id: "completed-projects",
    label: "Completed Projects",
    value: 22,
    helper: "45.83% of total",
    icon: "grid",
    color: "blue",
  },
  {
    id: "delayed-projects",
    label: "Delayed Projects",
    value: 8,
    helper: "16.67% of total",
    icon: "clock",
    color: "rose",
  },
  {
    id: "upcoming-deadlines",
    label: "Upcoming Deadlines",
    value: 12,
    helper: "Next 30 days",
    icon: "calendar",
    color: "amber",
  },
  {
    id: "total-project-cost",
    label: "Total Project Cost",
    value: 24580000,
    helper: "All projects",
    icon: "chart",
    color: "purple",
    format: "currency",
  },
];

export const projectCostSummary = {
  totalBudget: 24580000,
  budgetUsed: 14875000,
  remainingBudget: 9705000,
  onHoldAmount: 1200000,
  utilization: 60.6,
  segments: [
    { label: "Total Budget", value: 24580000, color: "#2563eb" },
    { label: "Budget Used", value: 14875000, color: "#22c55e" },
    { label: "Remaining Budget", value: 9705000, color: "#f59e0b" },
    { label: "On Hold", value: 1200000, color: "#ef4444" },
  ],
};

export const projectStatusSummary = [
  { label: "Planning", value: 10, color: "#2563eb" },
  { label: "In Progress", value: 18, color: "#22c55e" },
  { label: "On Hold", value: 6, color: "#f59e0b" },
  { label: "Completed", value: 22, color: "#8b5cf6" },
  { label: "Cancelled", value: 4, color: "#ef4444" },
];

export const teamAllocationSummary = {
  total: 56,
  segments: [
    { label: "Project Managers", value: 8, color: "#2563eb", icon: "briefcase" },
    { label: "Engineers", value: 24, color: "#22c55e", icon: "users" },
    { label: "Technicians", value: 18, color: "#f59e0b", icon: "tool" },
    { label: "Support Staff", value: 6, color: "#ef4444", icon: "contacts" },
  ],
};

export const upcomingDeadlines = [
  {
    id: "deadline-1",
    projectName: "ABC Hospital Project",
    deadline: "15 May 2024",
    daysRemaining: 3,
  },
  {
    id: "deadline-2",
    projectName: "Green City Tower",
    deadline: "20 May 2024",
    daysRemaining: 8,
  },
  {
    id: "deadline-3",
    projectName: "Metro Station Work",
    deadline: "25 May 2024",
    daysRemaining: 13,
  },
  {
    id: "deadline-4",
    projectName: "IT Park Phase 2",
    deadline: "30 May 2024",
    daysRemaining: 18,
  },
  {
    id: "deadline-5",
    projectName: "Smart Warehouse",
    deadline: "05 Jun 2024",
    daysRemaining: 24,
  },
];

export const recentProjects = [
  {
    id: "PRJ-2024-001",
    name: "ABC Hospital Project",
    client: "ABC Healthcare",
    manager: "Rahul Sharma",
    status: "In Progress",
    progress: 65,
    budget: 4500000,
    deadline: "15 May 2024",
  },
  {
    id: "PRJ-2024-002",
    name: "Green City Tower",
    client: "Green Build Pvt. Ltd.",
    manager: "Sneha Patel",
    status: "Planning",
    progress: 20,
    budget: 3500000,
    deadline: "20 May 2024",
  },
  {
    id: "PRJ-2024-003",
    name: "Metro Station Work",
    client: "Metro Rail Corp.",
    manager: "Vikram Mehta",
    status: "Completed",
    progress: 100,
    budget: 6200000,
    deadline: "25 May 2024",
  },
  {
    id: "PRJ-2024-004",
    name: "IT Park Phase 2",
    client: "NovaTech Parks",
    manager: "Priya Iyer",
    status: "On Hold",
    progress: 42,
    budget: 5800000,
    deadline: "30 May 2024",
  },
  {
    id: "PRJ-2024-005",
    name: "Smart Warehouse",
    client: "Swift Logistics",
    manager: "Amit Verma",
    status: "In Progress",
    progress: 78,
    budget: 4250000,
    deadline: "05 Jun 2024",
  },
];

export const projectManagementPlaceholderPages = [
  {
    key: "projects",
    path: "/project-management/projects",
    title: "Projects",
    description: "Manage project records, client assignments, status, budgets, and site ownership.",
    actionLabel: "Create Project",
    emptyMessage: "No project management records have been created yet.",
  },
  {
    key: "tasks",
    path: "/project-management/tasks",
    title: "Tasks",
    description: "Track project tasks, priorities, owners, due dates, and completion status.",
    actionLabel: "Create Task",
    emptyMessage: "No project tasks are available yet.",
  },
  {
    key: "team-allocation",
    path: "/project-management/team-allocation",
    title: "Team Allocation",
    description: "Assign project managers, engineers, technicians, and support teams to project sites.",
    actionLabel: "Add Allocation",
    emptyMessage: "No team allocation records are available yet.",
  },
  {
    key: "site-reports",
    path: "/project-management/site-reports",
    title: "Daily Site Reports",
    description: "Capture site updates, work progress, issues, photos, and daily observations.",
    actionLabel: "Create Report",
    emptyMessage: "No site reports have been submitted yet.",
  },
  {
    key: "inventory-allocation",
    path: "/project-management/inventory-allocation",
    title: "Inventory Allocation",
    description: "Monitor material reservations, issued inventory, and project stock requirements.",
    actionLabel: "Allocate Inventory",
    emptyMessage: "No inventory allocations are available yet.",
  },
  {
    key: "purchase-tracking",
    path: "/project-management/purchase-tracking",
    title: "Purchase Tracking",
    description: "Follow project-linked purchase requests, orders, receipts, and supplier delivery status.",
    actionLabel: "Track Purchase",
    emptyMessage: "No purchase tracking records are available yet.",
  },
  {
    key: "financials",
    path: "/project-management/financials",
    title: "Financials",
    description: "Review project budgets, planned costs, actual spend, hold amounts, and billing status.",
    actionLabel: "Add Financial Entry",
    emptyMessage: "No financial entries are available yet.",
  },
  {
    key: "documents",
    path: "/project-management/documents",
    title: "Documents",
    description: "Organize project drawings, contracts, approvals, reports, and handover files.",
    actionLabel: "Add Document",
    emptyMessage: "No project documents are available yet.",
  },
  {
    key: "timeline",
    path: "/project-management/timeline",
    title: "Timeline",
    description: "Plan project milestones, dependencies, target dates, and schedule changes.",
    actionLabel: "Add Milestone",
    emptyMessage: "No timeline milestones are available yet.",
  },
  {
    key: "project-attendance",
    path: "/project-management/project-attendance",
    title: "Project Attendance",
    description: "Track site-wise attendance, shift coverage, field teams, and daily manpower.",
    actionLabel: "Mark Attendance",
    emptyMessage: "No project attendance records are available yet.",
  },
];

export const projectManagementPageMap = projectManagementPlaceholderPages.reduce(
  (pages, page) => ({
    ...pages,
    [page.key]: page,
  }),
  {}
);
