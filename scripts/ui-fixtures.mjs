// Synthetic records used only by the isolated browser checks; never sent to the server.
const today = new Date();
const day = offset => { const value = new Date(today); value.setDate(value.getDate() + offset); return value.toISOString().slice(0,10); };
export const employees = [
  { id: "EMP-1001", name: "Ananya Rao", department: "Engineering", designation: "Project engineer", email: "ananya@example.test", phone: "9000000001", joined: day(-160), status: "Active", manager: "Rohan Mehta", salary: 45000, documents: {} },
  { id: "EMP-1002", name: "Rohan Mehta", department: "Operations", designation: "Project manager", email: "rohan@example.test", phone: "9000000002", joined: day(-340), status: "Active", salary: 75000, documents: {} },
  { id: "EMP-1003", name: "Priya Nair", department: "Procurement", designation: "Procurement specialist", email: "priya@example.test", phone: "9000000003", joined: day(-2), status: "Active", salary: 48000, documents: {} },
];
export const items = [{ id: 1, name: "Network distribution switch", description: "24-port managed switch", category: "Networking", stock: 4, price: 12500, rate: 12500, unit: "NOS", reorderLevel: 10, minimumStock: 10, hsn: "8517", taxPercentage: 18 }, { id: 2, name: "Structured cabling", description: "CAT6 cable roll", category: "Cabling", stock: 36, price: 4200, rate: 4200, unit: "ROLL", reorderLevel: 5, hsn: "8544", taxPercentage: 18 }];
const line = { ...items[0], itemId: 1, boqItemId: 1, poItemId: 1, quantity: 10, orderedQty: 10, receivedQty: 4, availableQty: 4, unitPrice: 12500, rate: 12500, amount: 125000, gst: 18 };
export const projects = [
  { id: 1, code: "BE-26001", name: "Whitefield campus infrastructure", client: "Example Infrastructure", clientId: 1, customerId: 1, projectManager: "Rohan Mehta", siteEngineer: "Ananya Rao", locationId: 1, siteName: "Whitefield", city: "Bengaluru", status: "In Progress", startDate: day(-50), endDate: day(22), progress: 64, estimatedBudget: 2400000, approvedBudget: 2200000, expenses: 1100000, teamSize: 8, createdAt: day(-55), updatedAt: day(-1), tasks: [{ id: 1, projectId: 1, taskName: "Commission network cabinets", title: "Commission network cabinets", assignedTo: "Ananya Rao", assignedEmployeeId: "EMP-1001", status: "In Progress", progress: 60, priority: "High", dueDate: day(-2), startDate: day(-10), milestoneId: 1 }], milestones: [{ id: 1, projectId: 1, title: "Network commissioning", name: "Network commissioning", milestoneName: "Network commissioning", status: "Work in Progress", progress: 60, targetDate: day(7), startDate: day(-5), owner: "Ananya Rao", tasks: [] }], teamAllocations: [], siteReports: [], documents: [], purchases: [], inventoryAllocations: [], financials: [], activities: [] },
  { id: 2, code: "BE-26002", name: "Electronic City security systems", client: "Example Facilities", clientId: 1, customerId: 1, projectManager: "Rohan Mehta", locationId: 2, siteName: "Electronic City", status: "In Progress", startDate: day(-35), endDate: day(40), progress: 28, estimatedBudget: 1400000, approvedBudget: 1400000, expenses: 300000, teamSize: 5, createdAt: day(-35), tasks: [], milestones: [], teamAllocations: [], documents: [] },
];
export const purchaseOrders = [{ id: 1, poNumber: "BE/PO/26001", projectId: 1, vendorId: 1, locationId: 1, boqId: 1, status: "Ordered", orderDate: day(-12), expectedDate: day(-1), total: 147500, subtotal: 125000, items: [line] }, { id: 2, poNumber: "BE/PO/26002", projectId: 2, vendorId: 1, locationId: 2, status: "Draft", orderDate: day(-1), expectedDate: day(8), total: 49560, items: [{ ...line, quantity: 4, receivedQty: 0, unitPrice: 10500 }] }];
export const boqs = [{ id: 1, boqNumber: "BE/BOQ/26001", projectId: 1, date: day(-20), status: "Approved", version: 1, preparedBy: "Rohan Mehta", items: [line], total: 125000 }];
export function fixtureFor(path) {
  if (path === "/hrms/employees") return { employees };
  if (path.startsWith("/hrms/employees/")) return { employee: employees[0] };
  if (path === "/hrms/attendance") return { attendance: employees.map((employee,i) => ({ id: i+1, employeeId: employee.id, employeeName: employee.name, month: today.toLocaleDateString("en-US", { month: "long", year: "numeric" }), statuses: Array.from({ length:31 }, (_, index) => index === today.getDate()-1 && i === 2 ? "L" : "P"), savedAt: day(0) })) };
  if (path === "/project-management/projects") return { projects };
  if (path === "/project-management/milestones") return { milestones: projects[0].milestones, summary: { total: 1, inProgress: 1, completed: 0, overdue: 0, atRisk: 0 }, pagination: { page: 1, total: 1, pages: 1 } };
  if (path === "/project-management/milestones/1") return { milestone: { ...projects[0].milestones[0], tasks: projects[0].tasks, activity: [], documents: [] } };
  if (path === "/projects") return projects;
  if (path === "/items" || path === "/inventory") return items;
  if (path === "/vendors") return [{ id: 1, name: "Example Technology Supply", contactPerson: "Vendor contact", email: "supply@example.test", phone: "9000000090", gstNumber: "29AAAAA0000A1Z5" }];
  if (path === "/customers") return [{ id: 1, name: "Example Infrastructure", companyName: "Example Infrastructure" }];
  if (path === "/locations") return [{ id: 1, name: "Whitefield warehouse", projectId: 1, type: "Warehouse" }, { id: 2, name: "Electronic City site", projectId: 2, type: "Site" }];
  if (path === "/purchase-orders") return { purchaseOrders };
  if (path === "/boqs") return { boqs };
  if (path.startsWith("/boqs/")) return { boq: boqs[0] };
  if (path === "/receive-goods") return [{ id: 1, purchaseOrderId: 1, projectId: 1, locationId: 1, receivedDate: day(-1), documentNumber: "GRN-26001", items: [{ ...line, receivedQty: 4 }] }];
  if (path === "/consumptions") return [{ id: 1, projectId: 1, locationId: 1, consumptionDate: day(-1), items: [{ ...line, quantity: 2 }] }];
  return undefined;
}
