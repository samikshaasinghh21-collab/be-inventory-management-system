const createNavItem = (item, extra = {}) => ({
  badge: null,
  children: [],
  exact: false,
  icon: "grid",
  matchPrefixes: [],
  searchKeywords: [],
  subtitle: "",
  ...item,
  ...extra,
});

export const NAVIGATION_SECTIONS = [
  {
    id: "workspace",
    label: "Workspace",
    items: [
      createNavItem({
        id: "dashboard",
        label: "Dashboard",
        to: "/",
        exact: true,
        icon: "home",
        subtitle: "Command center, trends, and recent activity.",
        searchKeywords: ["overview", "summary", "home"],
      }),
      createNavItem({
        id: "inventory-home",
        label: "Inventory",
        to: "/inventory",
        exact: true,
        icon: "package",
        subtitle: "Inventory overview, stock value, and vendor directory.",
        searchKeywords: ["stock", "materials", "overview"],
      }),
      createNavItem({
        id: "reports",
        label: "Reports",
        to: "/inventory/reports",
        icon: "chart",
        matchPrefixes: ["/inventory/reports"],
        subtitle: "Operational reports, register summaries, and exports.",
        searchKeywords: ["analytics", "exports", "registers"],
      }),
    ],
  },
  {
    id: "workflow",
    label: "Inventory Workflow",
    items: [
      createNavItem({
        id: "projects",
        label: "Projects",
        to: "/inventory/projects",
        icon: "folder",
        matchPrefixes: ["/inventory/projects", "/inventory/create-project"],
        subtitle: "Project list, allocation context, and site-level workflows.",
        searchKeywords: ["sites", "project management"],
      }),
      createNavItem({
        id: "boq",
        label: "BOQ",
        to: "/inventory/boq",
        icon: "layers",
        matchPrefixes: ["/inventory/boq"],
        subtitle: "Bill of quantities, versions, and material planning.",
        searchKeywords: ["bill of quantities", "planning", "estimate"],
      }),
      createNavItem({
        id: "procurement",
        label: "Procurement",
        icon: "clipboard",
        subtitle: "Purchase order workflows and registers.",
        children: [
          createNavItem({
            id: "purchase-orders",
            label: "Purchase Order",
            to: "/inventory/purchase-order",
            icon: "clipboard",
            matchPrefixes: ["/inventory/purchase-order", "/inventory/purchase-orders"],
            subtitle: "Create and manage purchase orders.",
            searchKeywords: ["po", "procurement", "purchase order"],
          }),
          createNavItem({
            id: "purchase-register",
            label: "Purchase Register",
            to: "/inventory/purchase-order-register",
            icon: "table",
            matchPrefixes: ["/inventory/purchase-order-register"],
            subtitle: "Track purchase order status and history.",
            searchKeywords: ["register", "purchase history"],
          }),
        ],
      }),
      createNavItem({
        id: "receiving",
        label: "Receiving",
        icon: "receipt",
        subtitle: "Goods receipt operations and receiving registers.",
        children: [
          createNavItem({
            id: "receive-inventory",
            label: "Receive Inventory",
            to: "/inventory/receive-goods",
            icon: "receipt",
            matchPrefixes: ["/inventory/receive-goods"],
            subtitle: "Receive and reconcile material against purchase orders.",
            searchKeywords: ["goods receipt", "grn", "received goods"],
          }),
          createNavItem({
            id: "receive-register",
            label: "Receive Register",
            to: "/inventory/receive-goods-register",
            icon: "table",
            matchPrefixes: ["/inventory/receive-goods-register"],
            subtitle: "Monitor receive-goods history and availability.",
            searchKeywords: ["receipt history", "receive register"],
          }),
        ],
      }),
      createNavItem({
        id: "delivery-challan",
        label: "Delivery Challan",
        to: "/inventory/delivery-challan",
        icon: "truck",
        matchPrefixes: ["/inventory/delivery-challan", "/inventory/allocate-projects"],
        subtitle: "Dispatch materials to projects and monitor challan balance.",
        searchKeywords: ["dispatch", "dc", "allocation"],
      }),
      createNavItem({
        id: "consumption",
        label: "Consumption",
        to: "/inventory/consumption",
        icon: "activity",
        matchPrefixes: ["/inventory/consumption"],
        subtitle: "Log site consumption and monitor BOQ availability.",
        searchKeywords: ["usage", "site usage", "consumed"],
      }),
      createNavItem({
        id: "reallocation",
        label: "Reallocation",
        to: "/inventory/reallocate-return",
        icon: "repeat",
        matchPrefixes: [
          "/inventory/reallocate-return",
          "/inventory/reallocation-register",
          "/inventory/return-dc",
        ],
        subtitle: "Move or transfer goods between locations.",
        searchKeywords: ["transfer", "movement", "return dc", "reallocate"],
        children: [
          createNavItem({
            id: "new-reallocation",
            label: "New Reallocation",
            to: "/inventory/reallocate-return",
            icon: "repeat",
            matchPrefixes: ["/inventory/reallocate-return"],
            subtitle: "Create a goods movement or return record.",
          }),
          createNavItem({
            id: "reallocation-register",
            label: "Reallocation",
            to: "/inventory/reallocation-register",
            icon: "table",
            matchPrefixes: ["/inventory/reallocation-register"],
            subtitle: "Review goods movement history.",
          }),
        ],
      }),
      createNavItem({
        id: "invoice",
        label: "Purchase Invoice",
        to: "/inventory/invoice",
        icon: "file",
        matchPrefixes: ["/inventory/invoice"],
        subtitle: "Invoice references and billing-adjacent inventory records.",
        searchKeywords: ["billing", "invoice"],
      }),
    ],
  },
  {
    id: "hrm",
    label: "HRM",
    items: [
      createNavItem({
        id: "hrms-root",
        label: "HRMS",
        to: "/dashboard",
        icon: "users",
        matchPrefixes: [
          "/dashboard",
          "/employees",
          "/reviews",
          "/attendance",
          "/payroll",
          "/payslip",
          "/relieving",
          "/search",
          "/reports",
          "/permissions",
          "/hrms",
        ],
        subtitle: "Employees, reviews, payroll, relieving, and reports.",
        searchKeywords: ["hrm", "hrms", "human resources", "employee"],
        children: [
          createNavItem({
            id: "hrms-dashboard",
            label: "HRMS Dashboard",
            to: "/dashboard",
            exact: true,
            icon: "home",
            subtitle: "HR overview and pending actions.",
            searchKeywords: ["hr dashboard", "human resources dashboard"],
          }),
          createNavItem({
            id: "hrms-employees",
            label: "Employees",
            to: "/employees",
            icon: "users",
            matchPrefixes: ["/employees", "/hrms/employees"],
            subtitle: "Employee records and profile documents.",
            searchKeywords: ["employee management", "staff"],
            children: [
              createNavItem({
                id: "hrms-add-employee",
                label: "Add Employee",
                to: "/employees/add",
                icon: "plus",
                subtitle: "Create a new employee record.",
                searchKeywords: ["new employee", "employee onboarding"],
              }),
              createNavItem({
                id: "hrms-employee-list",
                label: "Employee List",
                to: "/employees",
                exact: true,
                icon: "table",
                subtitle: "View and manage all employees.",
                searchKeywords: ["employee directory", "staff list"],
              }),
              createNavItem({
                id: "hrms-employee-profile",
                label: "Employee Profile",
                to: "/employees/profile",
                icon: "user",
                subtitle: "Inspect complete employee details.",
                searchKeywords: ["profile", "employee details"],
              }),
              createNavItem({
                id: "hrms-print-profile",
                label: "Print Profile",
                to: "/employees/print-profile",
                icon: "file",
                subtitle: "Generate employee profile PDF.",
                searchKeywords: ["employee profile pdf", "print employee"],
              }),
            ],
          }),
          createNavItem({
            id: "hrms-reviews",
            label: "Reviews",
            to: "/reviews",
            icon: "clipboard",
            matchPrefixes: ["/reviews", "/hrms/reviews"],
            subtitle: "Performance reviews and salary reassessment.",
            searchKeywords: ["performance review", "appraisal"],
            children: [
              createNavItem({
                id: "hrms-add-review",
                label: "Add Review",
                to: "/reviews",
                exact: true,
                icon: "plus",
                subtitle: "Record an employee review.",
                searchKeywords: ["new review", "appraisal entry"],
              }),
              createNavItem({
                id: "hrms-salary-reassessment",
                label: "Salary Reassessment",
                to: "/reviews/salary-reassessment",
                icon: "chart",
                subtitle: "Revise salary after review.",
                searchKeywords: ["salary revision", "reassessment"],
              }),
              createNavItem({
                id: "hrms-review-history",
                label: "Review History",
                to: "/reviews/history",
                icon: "clock",
                subtitle: "Review previous appraisals.",
                searchKeywords: ["review report", "review records"],
              }),
            ],
          }),
          createNavItem({
            id: "hrms-payroll",
            label: "Payroll",
            to: "/payroll",
            icon: "receipt",
            matchPrefixes: ["/attendance", "/payroll", "/payslip", "/hrms/payroll"],
            subtitle: "Attendance, salary processing, and payslips.",
            searchKeywords: ["salary", "attendance", "payslip"],
            children: [
              createNavItem({
                id: "hrms-monthly-attendance",
                label: "Monthly Attendance",
                to: "/attendance",
                icon: "table",
                subtitle: "Enter attendance for payroll.",
                searchKeywords: ["attendance entry", "monthly attendance"],
              }),
              createNavItem({
                id: "hrms-salary-processing",
                label: "Salary Processing",
                to: "/payroll",
                exact: true,
                icon: "activity",
                subtitle: "Calculate earnings and deductions.",
                searchKeywords: ["payroll calculation", "process salary"],
              }),
              createNavItem({
                id: "hrms-payslip",
                label: "Payslip",
                to: "/payslip",
                icon: "file",
                subtitle: "Generate monthly payslips.",
                searchKeywords: ["payslip pdf", "salary slip"],
              }),
            ],
          }),
          createNavItem({
            id: "hrms-relieving",
            label: "Relieving",
            to: "/relieving",
            icon: "logout",
            matchPrefixes: ["/relieving", "/hrms/relieving"],
            subtitle: "Exit requests, settlement, and letters.",
            searchKeywords: ["exit", "final settlement", "relieving"],
            children: [
              createNavItem({
                id: "hrms-exit-request",
                label: "Exit Request",
                to: "/relieving",
                exact: true,
                icon: "logout",
                subtitle: "Start employee relieving process.",
                searchKeywords: ["resignation", "notice period"],
              }),
              createNavItem({
                id: "hrms-final-settlement",
                label: "Final Settlement",
                to: "/relieving/final-settlement",
                icon: "receipt",
                subtitle: "Calculate final settlement.",
                searchKeywords: ["fnf", "settlement report"],
              }),
              createNavItem({
                id: "hrms-letters",
                label: "Letters",
                to: "/relieving/letters",
                icon: "file",
                subtitle: "Generate relieving and experience letters.",
                searchKeywords: ["relieving letter", "experience letter"],
              }),
            ],
          }),
          createNavItem({
            id: "hrms-search",
            label: "Search",
            to: "/search",
            icon: "search",
            subtitle: "Find employee records quickly.",
            searchKeywords: ["employee search", "hr search"],
          }),
          createNavItem({
            id: "hrms-reports",
            label: "Reports",
            to: "/reports",
            icon: "chart",
            subtitle: "HR, payroll, review, and relieving reports.",
            searchKeywords: ["hr reports", "pdf reports"],
          }),
          createNavItem({
            id: "hrms-permissions",
            label: "User Login & Permissions",
            to: "/permissions",
            icon: "settings",
            subtitle: "Roles, permissions, and access control.",
            searchKeywords: ["roles", "permissions", "login"],
          }),
        ],
      }),
    ],
  },
  {
    id: "project-management",
    label: "Project Management",
    items: [
      createNavItem({
        id: "project-management-root",
        label: "Project Management",
        to: "/project-management/dashboard",
        icon: "folder",
        matchPrefixes: ["/project-management"],
        subtitle: "Projects, tasks, teams, costs, documents, and site activity.",
        searchKeywords: ["project management", "projects", "tasks", "site"],
        children: [
          createNavItem({
            id: "project-management-dashboard",
            label: "Dashboard",
            to: "/project-management/dashboard",
            exact: true,
            icon: "home",
            subtitle: "Project KPIs, budgets, deadlines, and delivery status.",
            searchKeywords: ["project dashboard", "project overview"],
          }),
          createNavItem({
            id: "project-management-projects",
            label: "Projects",
            to: "/project-management/projects",
            icon: "folder",
            matchPrefixes: ["/project-management/projects"],
            subtitle: "Project records, clients, managers, and status.",
            searchKeywords: ["project register", "clients", "sites"],
          }),
          createNavItem({
            id: "project-management-tasks",
            label: "Tasks",
            to: "/project-management/tasks",
            icon: "clipboard",
            matchPrefixes: ["/project-management/tasks"],
            subtitle: "Tasks, owners, priorities, and completion tracking.",
            searchKeywords: ["project tasks", "task management"],
          }),
          createNavItem({
            id: "project-management-team-allocation",
            label: "Team Allocation",
            to: "/project-management/team-allocation",
            icon: "users",
            matchPrefixes: ["/project-management/team-allocation"],
            subtitle: "Employees and roles allocated to projects.",
            searchKeywords: ["team allocation", "employees", "manpower"],
          }),
          createNavItem({
            id: "project-management-site-reports",
            label: "Site Reports",
            to: "/project-management/site-reports",
            icon: "file",
            matchPrefixes: ["/project-management/site-reports"],
            subtitle: "Daily site updates, observations, and progress notes.",
            searchKeywords: ["site reports", "daily report"],
          }),
          createNavItem({
            id: "project-management-inventory-allocation",
            label: "Inventory Allocation",
            to: "/project-management/inventory-allocation",
            icon: "package",
            matchPrefixes: ["/project-management/inventory-allocation"],
            subtitle: "Project material allocation and stock requirements.",
            searchKeywords: ["inventory allocation", "materials", "stock"],
          }),
          createNavItem({
            id: "project-management-purchase-tracking",
            label: "Purchase Tracking",
            to: "/project-management/purchase-tracking",
            icon: "receipt",
            matchPrefixes: ["/project-management/purchase-tracking"],
            subtitle: "Project purchase orders, receipts, and delivery status.",
            searchKeywords: ["purchase tracking", "procurement", "po"],
          }),
          createNavItem({
            id: "project-management-financials",
            label: "Financials",
            to: "/project-management/financials",
            icon: "chart",
            matchPrefixes: ["/project-management/financials"],
            subtitle: "Budgets, costs, holds, and billing progress.",
            searchKeywords: ["project financials", "budget", "cost"],
          }),
          createNavItem({
            id: "project-management-documents",
            label: "Documents",
            to: "/project-management/documents",
            icon: "file",
            matchPrefixes: ["/project-management/documents"],
            subtitle: "Project files, drawings, contracts, and approvals.",
            searchKeywords: ["project documents", "files", "drawings"],
          }),
          createNavItem({
            id: "project-management-timeline",
            label: "Timeline",
            to: "/project-management/timeline",
            icon: "clock",
            matchPrefixes: ["/project-management/timeline"],
            subtitle: "Milestones, schedules, and delivery dates.",
            searchKeywords: ["project timeline", "milestones", "schedule"],
          }),
          createNavItem({
            id: "project-management-attendance",
            label: "Project Attendance",
            to: "/project-management/project-attendance",
            icon: "table",
            matchPrefixes: ["/project-management/project-attendance"],
            subtitle: "Site attendance and daily manpower tracking.",
            searchKeywords: ["project attendance", "site attendance", "manpower"],
          }),
        ],
      }),
    ],
  },
  {
    id: "masters",
    label: "Master Data",
    items: [
      createNavItem({
        id: "products",
        label: "Products",
        to: "/inventory/products",
        icon: "cube",
        matchPrefixes: [
          "/inventory/products",
          "/inventory/create-product",
          "/inventory/create-item",
          "/inventory/edit/",
        ],
        subtitle: "Product catalog, inventory item setup, and material metadata.",
        searchKeywords: ["items", "catalog", "materials"],
      }),
      createNavItem({
        id: "vendors",
        label: "Vendors",
        to: "/inventory/vendors",
        icon: "users",
        matchPrefixes: ["/inventory/vendors", "/inventory/create-vendors"],
        subtitle: "Vendor master records and procurement contacts.",
        searchKeywords: ["suppliers", "vendor master"],
      }),
      createNavItem({
        id: "customers",
        label: "Customers",
        to: "/inventory/customers",
        icon: "contacts",
        matchPrefixes: ["/inventory/customers"],
        subtitle: "Customer records and downstream delivery contexts.",
        searchKeywords: ["clients", "buyers"],
      }),
      createNavItem({
        id: "locations",
        label: "Locations",
        to: "/inventory/locations",
        icon: "pin",
        matchPrefixes: ["/inventory/locations"],
        subtitle: "Warehouse, project site, and destination management.",
        searchKeywords: ["warehouses", "sites", "stores"],
      }),
    ],
  },
  {
    id: "tools",
    label: "Tools & Assets",
    items: [
      createNavItem({
        id: "tools",
        label: "Tools",
        to: "/inventory/tools",
        icon: "tool",
        matchPrefixes: ["/inventory/tools"],
        subtitle: "Tool issue, allocation, handover, and maintenance workflows.",
        children: [
          createNavItem({
            id: "tools-home",
            label: "Dashboard",
            to: "/inventory/tools",
            exact: true,
            icon: "tool",
            matchPrefixes: ["/inventory/tools", "/inventory/tools/list"],
            subtitle: "Tool inventory dashboard and overview.",
            searchKeywords: ["tool dashboard", "asset dashboard"],
          }),
          createNavItem({
            id: "tools-new",
            label: "Add Tool",
            to: "/inventory/tools/new",
            icon: "plus",
            matchPrefixes: ["/inventory/tools/new"],
            subtitle: "Register a new tool or asset.",
            searchKeywords: ["create tool", "asset onboarding"],
          }),
          createNavItem({
            id: "tools-assign",
            label: "Assign Tool",
            to: "/inventory/tools/assign",
            icon: "arrow-right",
            matchPrefixes: ["/inventory/tools/assign"],
            subtitle: "Assign tools to employees and teams.",
            searchKeywords: ["tool issue", "assign assets"],
          }),
          createNavItem({
            id: "tools-handover",
            label: "Handover",
            to: "/inventory/tools/handover",
            icon: "repeat",
            matchPrefixes: ["/inventory/tools/handover"],
            subtitle: "Switch or hand over tools between employees.",
            searchKeywords: ["switch tool", "tool transfer"],
          }),
          createNavItem({
            id: "tools-analytics",
            label: "Analytics",
            to: "/inventory/tools/analytics",
            icon: "chart",
            matchPrefixes: ["/inventory/tools/analytics"],
            subtitle: "Tool performance and asset analytics.",
          }),
          createNavItem({
            id: "tools-maintenance",
            label: "Maintenance",
            to: "/inventory/tools/maintenance",
            icon: "spark",
            matchPrefixes: ["/inventory/tools/maintenance"],
            subtitle: "Maintenance planning and service workload tracking.",
          }),
          createNavItem({
            id: "tools-assignments",
            label: "Assignments",
            to: "/inventory/tools/assignments",
            icon: "table",
            matchPrefixes: ["/inventory/tools/assignments"],
            subtitle: "Assignment history and allocation register.",
          }),
          createNavItem({
            id: "tools-history",
            label: "History",
            to: "/inventory/tools/history",
            icon: "clock",
            matchPrefixes: ["/inventory/tools/history"],
            subtitle: "Asset movement history and logs.",
          }),
          createNavItem({
            id: "tools-map",
            label: "Map",
            to: "/inventory/tools/map",
            icon: "pin",
            matchPrefixes: ["/inventory/tools/map"],
            subtitle: "Map-based tool visibility and tracking.",
          }),
        ],
      }),
    ],
  },
  {
    id: "account",
    label: "Administration",
    items: [
      createNavItem({
        id: "profile",
        label: "Profile",
        to: "/profile",
        icon: "user",
        matchPrefixes: ["/profile", "/account"],
        subtitle: "Personal profile, workspace details, and preferences.",
        searchKeywords: ["account", "workspace profile"],
      }),
      createNavItem({
        id: "settings",
        label: "Settings",
        to: "/settings",
        icon: "settings",
        matchPrefixes: ["/settings"],
        subtitle: "Application settings, preferences, security, and branding.",
        searchKeywords: ["preferences", "security", "configuration"],
      }),
    ],
  },
];

const ROUTE_ALIASES = [
  createNavItem({
    id: "create-project",
    label: "Create Project",
    to: "/inventory/create-project",
    icon: "plus",
    matchPrefixes: ["/inventory/create-project"],
    subtitle: "Add a new project to the inventory workspace.",
    searchKeywords: ["new project"],
  }),
  createNavItem({
    id: "create-product",
    label: "Create Product",
    to: "/inventory/create-product",
    icon: "plus",
    matchPrefixes: ["/inventory/create-product", "/inventory/create-item"],
    subtitle: "Create a new product or material record.",
    searchKeywords: ["new item", "new product"],
  }),
  createNavItem({
    id: "edit-product",
    label: "Edit Product",
    to: "/inventory/products",
    icon: "edit",
    matchPrefixes: ["/inventory/edit/"],
    subtitle: "Update product details, pricing, and stock metadata.",
    searchKeywords: ["edit item", "edit product"],
  }),
  createNavItem({
    id: "create-vendor",
    label: "Create Vendor",
    to: "/inventory/create-vendors",
    icon: "plus",
    matchPrefixes: ["/inventory/create-vendors"],
    subtitle: "Create a vendor and procurement contact record.",
    searchKeywords: ["new vendor", "add supplier"],
  }),
  createNavItem({
    id: "boq-detail",
    label: "BOQ Detail",
    to: "/inventory/boq",
    icon: "layers",
    matchPrefixes: ["/inventory/boq/"],
    subtitle: "Inspect BOQ line items, versions, and totals.",
    searchKeywords: ["boq details"],
  }),
];

export const HEADER_QUICK_ACTIONS = [
  {
    id: "quick-project",
    label: "New Project",
    to: "/inventory/create-project",
    icon: "plus",
  },
  {
    id: "quick-product",
    label: "New Product",
    to: "/inventory/create-product",
    icon: "cube",
  },
  {
    id: "quick-po",
    label: "Purchase Order",
    to: "/inventory/purchase-order",
    icon: "clipboard",
  },
];

const normalizePath = (value = "") => value.replace(/\/+$/, "") || "/";

const buildSearchLabel = (item) => {
  if (!item.parentLabel) {
    return item.label;
  }
  return `${item.parentLabel} / ${item.label}`;
};

const flattenItems = (items = [], sectionLabel, parentLabel = "") =>
  (Array.isArray(items) ? items : []).flatMap((item) => {
    const next = {
      ...item,
      sectionLabel,
      parentLabel,
    };

    const children = flattenItems(
      item.children || [],
      sectionLabel,
      item.label || parentLabel
    );

    return [next, ...children];
  });

export const FLAT_NAVIGATION_ITEMS = [
  ...NAVIGATION_SECTIONS.flatMap((section) =>
    flattenItems(section.items || [], section.label)
  ),
  ...ROUTE_ALIASES,
].map((item) => ({
  ...item,
  searchLabel: buildSearchLabel(item),
}));

const getItemMatchers = (item = {}) => {
  const matchers = Array.isArray(item.matchPrefixes) ? [...item.matchPrefixes] : [];
  if (item.to && !matchers.includes(item.to)) {
    matchers.push(item.to);
  }
  return matchers
    .map((value) => normalizePath(value))
    .filter(Boolean);
};

const getBestMatchLength = (pathname, item) => {
  const normalizedPathname = normalizePath(pathname);
  if (item.exact) {
    return normalizedPathname === normalizePath(item.to) ? 1000 : -1;
  }

  const matches = getItemMatchers(item).filter((matcher) =>
    normalizedPathname === matcher || normalizedPathname.startsWith(`${matcher}/`)
  );

  if (!matches.length) {
    return -1;
  }

  return Math.max(...matches.map((value) => value.length));
};

export const isNavigationItemActive = (pathname, item) =>
  getBestMatchLength(pathname, item) >= 0 ||
  (item.children || []).some((child) => isNavigationItemActive(pathname, child));

export const getDefaultDestination = (item = {}) => {
  if (item.to) {
    return item.to;
  }
  return item.children?.[0]?.to ?? "/";
};

export const getRouteMeta = (pathname) => {
  const bestMatch = FLAT_NAVIGATION_ITEMS.reduce(
    (current, item) => {
      const score = getBestMatchLength(pathname, item);
      if (score < 0 || score <= current.score) {
        return current;
      }
      return { item, score };
    },
    { item: null, score: -1 }
  ).item;

  if (bestMatch) {
    return bestMatch;
  }

  const cleaned = normalizePath(pathname)
    .split("/")
    .filter(Boolean)
    .slice(-1)[0];

  const fallbackLabel = cleaned
    ? cleaned
        .split("-")
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(" ")
    : "Dashboard";

  return createNavItem({
    id: "fallback-route",
    label: fallbackLabel,
    to: pathname,
    icon: "grid",
    subtitle: "Workspace view",
  });
};
