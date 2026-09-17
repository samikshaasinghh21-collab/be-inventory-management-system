import assert from "node:assert/strict";
import { chromium } from "playwright";
import { fixtureFor } from "./ui-fixtures.mjs";
const browser = await chromium.launch({ channel: "msedge", headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
await context.route("**/api/**", route => {
  const path = new URL(route.request().url()).pathname.replace(/^\/api/, "");
  const user = { id: 1, name: "Workspace Administrator", fullName: "Workspace Administrator", role: "Super Admin", permissions: ["*"], email: "review@example.test" };
  const data = path === "/health" ? { ok: true, db: "connected" } : path === "/auth/me" ? { user } : path.includes("/settings/profile") ? { profile: user } : fixtureFor(path) ?? [];
  return route.fulfill({ json: data });
});
const page = await context.newPage();
const failures = [];
page.on("pageerror", error => failures.push(error.message));
page.on("console", message => { if (message.type() === "error" && /Workspace view failed|ReferenceError|TypeError|Objects are not valid/.test(message.text())) failures.push(message.text()); });
const navigate = async path => { await page.goto(`http://localhost:5173${path}`, { waitUntil: "networkidle" }); };
const run = async (name, callback) => { try { await callback(); console.log(`PASS ${name}`); } catch (error) { failures.push(name + ": " + error.message); console.log(`FAIL ${name}: ${error.message}`); } };
await run("Sidebar collapse and expand", async () => {
  await navigate("/dashboard");
  await page.getByRole("button", { name: "Collapse sidebar", exact: true }).click();
  await page.waitForFunction(() => Math.round(document.querySelector(".app-sidebar").getBoundingClientRect().width) === 68);
  assert.equal(await page.locator(".app-sidebar").evaluate(node => Math.round(node.getBoundingClientRect().width)), 68);
  await page.getByRole("button", { name: "Expand sidebar", exact: true }).click();
});
await run("Global search keyboard shortcut", async () => {
  await page.keyboard.press("Control+k");
  await page.getByRole("searchbox", { name: "Search workspace navigation" }).fill("milestone");
  await page.getByRole("searchbox", { name: "Search workspace navigation" }).press("Enter");
  await page.waitForURL("**/project-management/milestones");
});
await run("Executive project filter and register", async () => {
  await navigate("/");
  await page.getByRole("combobox", { name: "Filter overview by project" }).selectOption("1");
  assert.equal(await page.getByRole("combobox", { name: "Filter overview by project" }).inputValue(), "1");
  await page.getByRole("tab", { name: "Project register", exact: true }).click();
  assert.match(await page.locator(".ui-data-table").innerText(), /Whitefield campus infrastructure/);
  assert.doesNotMatch(await page.locator(".ui-data-table").innerText(), /Electronic City security systems/);
});
await run("Profile tabs preserve unsaved input", async () => {
  await navigate("/profile");
  const inputs = page.locator('section:not([hidden]) input');
  await inputs.first().fill("Review name");
  await page.getByRole("tab", { name: "Personal details", exact: true }).click();
  await page.getByRole("tab", { name: "Contact & access", exact: true }).click();
  assert.equal(await inputs.first().inputValue(), "Review name");
});
await run("Employee profile tabs", async () => {
  await navigate("/employees/profile/EMP-1001");
  await page.getByRole("tab", { name: "Employment", exact: true }).click();
  assert.match(await page.locator("#main-content").innerText(), /Engineering/);
  await page.getByRole("tab", { name: "Documents", exact: true }).click();
  assert.ok(await page.getByRole("tab", { name: "Documents", exact: true }).getAttribute("aria-selected") === "true");
});
await run("Settings shows selected category", async () => {
  await navigate("/settings");
  await page.locator(".people-settings-nav").getByRole("button", { name: "Organization", exact: true }).click();
  assert.ok(await page.locator(".people-settings-nav").getByRole("button", { name: "Organization", exact: true }).getAttribute("aria-current") === "page");
  assert.equal(await page.getByRole("heading", { name: "My Profile", exact: true }).count(), 0);
});
await run("Project dashboard deep link", async () => {
  await navigate("/project-management/projects?project=1");
  assert.ok(await page.getByRole("button", { name: "Close", exact: true }).isVisible());
  assert.match(await page.locator("main").innerText(), /Whitefield campus infrastructure/i);
  await page.getByRole("button", { name: "Close", exact: true }).click();
  assert.equal(new URL(page.url()).searchParams.has("project"), false);
});
await run("Tool CSV validates duplicates and preserves existing records", async () => {
  await navigate("/inventory/tools/bulk-import");
  await page.evaluate(() => localStorage.setItem("tools", JSON.stringify([{ id: "TL-900", name: "Existing tool", type: "Drill", serialNumber: "EXISTING-900" }])));
  const before = await page.evaluate(() => JSON.parse(localStorage.getItem("tools") || "[]").length);
  const upload = page.getByLabel("Upload tool CSV");
  await upload.setInputFiles({ name: "tools.csv", mimeType: "text/csv", buffer: Buffer.from("name,type,serialNumber\nReview drill,Drill,UI-UNIQUE-1\nReview drill,Drill,UI-UNIQUE-1") });
  await page.getByText("Duplicate serial number", { exact: true }).waitFor();
  assert.ok(await page.getByRole("button", { name: "Import 2 tools" }).isDisabled());
  await upload.setInputFiles({ name: "tools.csv", mimeType: "text/csv", buffer: Buffer.from("name,type,serialNumber\nReview drill,Drill,UI-UNIQUE-1") });
  await page.getByRole("button", { name: "Import 1 tools" }).click();
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem("tools")).length), before + 1);
});
await run("Mobile navigation and Escape", async () => {
  await page.setViewportSize({ width: 768, height: 1000 });
  await navigate("/dashboard");
  await page.getByRole("button", { name: "Open navigation", exact: true }).click();
  assert.equal(await page.locator(".app-sidebar").getAttribute("aria-hidden"), "false");
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => document.querySelector(".app-sidebar").getAttribute("aria-hidden") === "true");
});
if (process.env.UI_INSPECT) {
  await page.setViewportSize({ width: 1440, height: 1000 });
  for (const path of ["/inventory/tools", "/inventory/receive-goods", "/project-management/projects", "/employees"]) {
    await navigate(path);
    console.log(JSON.stringify({ path, controls: await page.locator('main button, main input, main select').evaluateAll(nodes => nodes.map(node => ({ tag: node.tagName, text: node.textContent?.trim().slice(0,70), placeholder: node.getAttribute("placeholder"), label: node.getAttribute("aria-label"), type: node.getAttribute("type") }))) }));
  }
}
await browser.close();
console.log(JSON.stringify({ failures }, null, 2));
process.exitCode = failures.length ? 1 : 0;
