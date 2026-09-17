import { chromium } from "playwright";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { fixtureFor } from "./ui-fixtures.mjs";
const browser = await chromium.launch({ channel: process.env.UI_BROWSER || "msedge", headless: true });
const width = Number(process.env.UI_CHECK_WIDTH) || 1440;
const context = await browser.newContext({ viewport: { width, height: 1000 } });
const mode = process.env.UI_CHECK_MODE || "empty";
if (mode !== "live") await context.route("**/api/**", async route => {
  const path = new URL(route.request().url()).pathname.replace(/^\/api/, "");
  if (mode === "offline") return route.fulfill({ status: 503, json: { ok: false, code: "DB_UNAVAILABLE", error: "Test service unavailable" } });
  const user = { id: 1, fullName: "Workspace Administrator", name: "Workspace Administrator", email: "ui-test@example.test", role: "Super Admin", permissions: ["*"] };
  let data = [];
  if (path === "/health") data = { ok: true, db: "connected" };
  else if (path === "/auth/me") data = { user };
  else if (path.includes("profile")) data = { profile: user, user };
  else if (path.includes("settings")) data = { settings: {}, company: { name: "Bangalore Electronics" }, profile: user };
  else if (path.startsWith("/project-management/projects")) data = { projects: [] };
  else if (path.includes("milestones")) data = { milestones: [], summary: {}, pagination: { page: 1, total: 0, pages: 1 } };
  else if (path.includes("dashboard")) data = { summary: {}, projects: [], tasks: [], activities: [] };
  if (mode === "populated") data = fixtureFor(path) ?? data;
  return route.fulfill({ status: 200, json: data });
});
const source = await readFile("src/routes/AppRoutes.jsx", "utf8");
const discovered = [...source.matchAll(/path(?:=|:)\s*["']([^"']+)["']/g)].map(match => match[1]).filter(path => path.startsWith("/"));
const routes = process.env.UI_CHECK_ROUTES ? process.env.UI_CHECK_ROUTES.split(",") : [...new Set(discovered.map(path => path.replace(":employeeId", "ui-test").replace(":id", "ui-test")))];
await mkdir("artifacts/ui-review", { recursive: true });
const results = [];
for (const path of routes) {
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (message.type() === "error" && /Workspace view failed|ReferenceError|TypeError|Objects are not valid|does not recognize|Cannot update/.test(message.text())) errors.push(message.text().slice(0, 1200)); });
  try {
    await page.goto(`http://localhost:5173${path}`, { waitUntil: "networkidle", timeout: 30000 });
    const body = await page.locator("body").innerText();
    const dimensions = await page.evaluate(() => ({ viewport: innerWidth, page: document.documentElement.scrollWidth }));
    const heading = await page.locator("h1").allTextContents();
    if (heading.includes("This view could not be displayed")) errors.push("Error boundary rendered instead of the requested view");
    const result = { path, actual: new URL(page.url()).pathname, heading, bodyLength: body.length, errors, overflow: dimensions.page > dimensions.viewport + 2 };
    results.push(result);
    console.log(JSON.stringify(result));
    if (["/", "/dashboard", "/inventory", "/project-management/dashboard", "/settings", "/profile", "/login", "/attendance", "/employees", "/project-management/projects", "/project-management/tasks", "/inventory/purchase-order", "/inventory/delivery-challan"].includes(path)) await page.screenshot({ path: `artifacts/ui-review/${mode}-${width}-${path.replaceAll("/", "_") || "home"}.png`, fullPage: false });
  } catch (error) { results.push({ path, errors: [error.message] }); console.log(JSON.stringify(results.at(-1))); }
  await page.close();
}
await writeFile(`artifacts/ui-review/routes-${mode}-${width}.json`, JSON.stringify(results, null, 2));
await browser.close();
process.exitCode = results.some(result => result.errors?.length || result.bodyLength < 40 || result.overflow) ? 1 : 0;
