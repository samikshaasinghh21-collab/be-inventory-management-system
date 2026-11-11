// Isolated HRMS regression checks. All API requests are mocked; no database writes.
import assert from "node:assert/strict";
import { chromium } from "playwright";

const browser = await chromium.launch({ channel: process.env.UI_BROWSER || "msedge", headless: true });
const context = await browser.newContext();
const employees = [
  { id: "TEST-1", name: "Active Employee", salary: 360000, status: "Active", department: "Engineering", pfAmount: 0 },
  { id: "TEST-2", name: "Relieved Employee", salary: 360000, status: "Relieved", department: "Engineering", pfAmount: 0 },
];
const salary = {
  id: "1", employeeId: "TEST-1", month: "October 2026", department: "All",
  salary: 360000, workingDays: 25, unpaidDays: 2.5, lopAmount: 3000,
  professionalTax: 208.33, pfAmount: 0, esiAmount: 0, tdsAmount: 500,
  reimbursement: 123.45, allowances: 1000, savedAt: "2026-10-20T12:00:00Z",
};
const review = {
  id: "REVIEW-1", employeeId: "TEST-1", currentSalary: 300000, revisedSalary: 330000,
  incrementPercent: 10, reviewDate: "2026-10-15", reviewPeriod: "2026",
  reviewerName: "Saved Reviewer", strengths: "Saved strengths", salaryStatus: "Draft",
  metrics: { teamwork: 75 }, savedAt: "2026-10-15T12:00:00Z",
};
let salaryWrites = 0;
let reviewWrite;
await context.route("**/api/**", async (route) => {
  const request = route.request();
  const path = new URL(request.url()).pathname.replace(/^\/api/, "");
  const user = { id: 1, name: "HR Tester", fullName: "HR Tester", role: "Super Admin", permissions: ["*"] };
  let data = [];
  if (path === "/health") data = { ok: true, db: "connected" };
  else if (path === "/auth/me") data = { user };
  else if (path.includes("profile")) data = { user, profile: user };
  else if (path.includes("settings")) data = { settings: {}, company: { name: "Test Company" }, profile: user };
  else if (path === "/hrms/employees") data = { employees };
  else if (path.startsWith("/hrms/employees/")) data = { employee: employees[0] };
  else if (path.startsWith("/hrms/payroll-rules/")) data = { ptRule: { annualAmount: 2500 } };
  else if (path.startsWith("/hrms/leave-entitlements/")) data = { entitlement: 12 };
  else if (path === "/hrms/attendance") data = { attendance: employees.map((employee, i) => ({
    id: String(i + 1), employeeId: employee.id, month: "October 2026",
    statuses: ["H", "A", "L", "O", ...Array(27).fill("P")],
  })) };
  else if (path === "/hrms/salaries") {
    if (request.method() === "POST") {
      salaryWrites++;
      data = { salaryRows: request.postDataJSON().rows.map((row) => ({ ...row, employeeId: row.id, id: "1", month: "October 2026" })) };
    } else data = { salaries: [salary] };
  } else if (path === "/hrms/salary-reassessments") data = { salaryReassessments: [review] };
  else if (path === "/hrms/salary-reassessments/REVIEW-1") {
    reviewWrite = request.postDataJSON();
    data = { salaryReassessment: reviewWrite };
  } else if (path === "/hrms/relieving") data = { relieving: [{ id: "EXIT-1", employeeId: "TEST-2", lastWorkingDate: "2026-10-15", status: "Relieved" }] };
  await route.fulfill({ status: 200, json: data });
});
const page = await context.newPage();
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
const open = async (path) => page.goto(`http://127.0.0.1:5173${path}`, { waitUntil: "networkidle" });
const body = () => page.locator("body").innerText();
const field = (label) => page.getByLabel(label, { exact: true });
try {
  await open("/payroll");
  await field("Month").fill("2026-10");
  await page.getByRole("button", { name: "View", exact: true }).click();
  assert.equal(await field("Applicable working days").inputValue(), "25");
  assert.equal(await field("Unpaid days").inputValue(), "2.5");
  assert.equal(await field("Reimbursement").inputValue(), "123.45");
  assert.match(await field("LOP").inputValue(), /3,000\.00/);
  await field("Applicable working days").fill("-1");
  assert.match(await page.getByRole("alert").innerText(), /working days/);
  await page.getByRole("button", { name: "Save Payroll", exact: true }).click();
  assert.equal(salaryWrites, 0);
  await field("Applicable working days").fill("25");
  await page.getByRole("button", { name: "Save Payroll", exact: true }).click();
  await page.getByText(/Payroll saved to HRMS database/).waitFor();
  assert.equal(salaryWrites, 1);
  console.log("PASS payroll reload, LOP validation and save");

  await open("/reviews");
  for (const title of ["Performance Review", "KPI / Performance Metrics", "Promotion Management", "Approval Workflow", "Assessment Summary"]) {
    assert.equal(await page.getByRole("heading", { name: title, exact: true }).count(), 1);
  }
  await page.getByRole("button", { name: "View", exact: true }).click();
  assert.equal(await field("Reviewer").inputValue(), "Saved Reviewer");
  assert.equal(await page.getByLabel(/^Strengths/).inputValue(), "Saved strengths");
  await page.getByLabel(/^Strengths/).fill("Updated strengths");
  await page.getByRole("button", { name: "Save Draft", exact: true }).click();
  await page.getByText(/Salary reassessment saved/).waitFor();
  assert.equal(reviewWrite.id, "REVIEW-1");
  assert.equal(reviewWrite.strengths, "Updated strengths");
  assert.equal(reviewWrite.currentSalary, 300000);
  await open("/reviews/salary-reassessment");
  assert.equal(await page.getByRole("heading", { name: "KPI / Performance Metrics", exact: true }).count(), 0);
  console.log("PASS Review sections, saved record editing and compensation separation");

  await open("/hrms/reports/attendance?month=2026-10&status=All");
  assert.equal(await page.getByRole("button", { name: "View Details" }).count(), 2);
  await page.getByRole("button", { name: "View Details" }).first().click();
  assert.match(await body(), /Half days\s+1\s+Holiday\s+1/);
  await page.getByLabel(/^Employees/).selectOption("Relieved");
  await page.getByText("1 saved records").waitFor();
  assert.equal(await page.getByRole("button", { name: "View Details" }).count(), 1);
  assert.match(await body(), /Relieved Employee/);
  await open("/hrms/reports/payroll?month=2026-10&status=All");
  await page.getByRole("button", { name: "View Details" }).click();
  assert.match(await body(), /Net Salary\s+27,415\.12/);
  await open("/hrms/reports/review?month=2026-10");
  await page.getByRole("button", { name: "View Details" }).click();
  assert.match(await body(), /Saved strengths/);
  await open("/hrms/reports/relieving?month=2026-10&status=Relieved");
  await page.getByRole("button", { name: "View Details" }).click();
  assert.match(await body(), /Last working date\s+15\/10\/2026/);
  await open("/hrms/reports/salary-summary?month=2026-10");
  assert.equal(await page.getByRole("button", { name: "View Salary Summary", exact: true }).count(), 1);
  assert.equal(await page.getByRole("button", { name: "Generate", exact: true }).count(), 0);
  console.log("PASS report details, month, net salary and employee status filters");

  await open("/payslip");
  await field("Month").fill("2026-10");
  await page.getByRole("button", { name: "Create Payslip", exact: true }).click();
  assert.match(await page.locator("#payslip-print-area").innerText(), /27,415\.12/);
  assert.match(await page.locator("#payslip-print-area").innerText(), /LOP/);
  await field("Month").fill("2026-09");
  await page.getByRole("button", { name: "Create Payslip", exact: true }).click();
  assert.match(await body(), /No saved payroll found/);
  assert.doesNotMatch(await page.locator("#payslip-print-area").innerText(), /27,415\.12/);
  console.log("PASS payslip saved amounts, LOP and missing-payroll handling");

  await open("/employees/profile/TEST-1");
  await page.getByRole("tab", { name: "Attendance", exact: true }).click();
  await page.getByLabel("Month", { exact: true }).fill("2026-10");
  await page.getByText(/Leave used \(2026\): 1/).waitFor();
  assert.match(await body(), /Leave remaining: 11/);
  await page.getByLabel("Individual leave entitlement for 2026").fill("20");
  assert.match(await body(), /Leave remaining: 11/);
  console.log("PASS employee attendance and saved leave entitlement");
  await page.getByRole("tab", { name: "Salary", exact: true }).click();
  await page.getByLabel("Payroll month", { exact: true }).fill("2026-10");
  await page.getByText("Rs. 27,415.12", { exact: true }).waitFor();
  console.log("PASS employee monthly salary matches saved payroll and payslip");
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
}
