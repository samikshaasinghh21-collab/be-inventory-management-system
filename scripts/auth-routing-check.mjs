import assert from "node:assert/strict";
import process from "node:process";
import { chromium } from "playwright";

const base = process.env.UI_BASE_URL || "http://127.0.0.1:5173";
const browser = await chromium.launch({ channel: process.env.UI_BROWSER || "msedge", headless: true });
try {
  const page = await browser.newPage();
  page.setDefaultTimeout(15_000);
  page.setDefaultNavigationTimeout(20_000);
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(`${base}/login`, { waitUntil: "domcontentloaded" });
  console.log("Checking login redirect");
  await page.waitForURL(`${base}/`);
  assert.equal(await page.locator('input[type="password"]').count(), 0);
  await page.goto(`${base}/inventory/purchase-order`, { waitUntil: "domcontentloaded" });
  console.log("Checking direct route");
  await page.getByRole("banner").waitFor();
  assert.equal(new URL(page.url()).pathname, "/inventory/purchase-order");
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.getByRole("banner").waitFor();
  assert.equal(new URL(page.url()).pathname, "/inventory/purchase-order");
  assert.equal(await page.locator('input[type="password"]').count(), 0);

  // Simulate restoration without changing the running backend's access mode.
  await page.route("**/api/auth/mode", (route) => route.fulfill({
    json: { ok: true, authenticationDisabled: false },
  }));
  await page.goto(`${base}/login`, { waitUntil: "domcontentloaded" });
  await page.locator('input[type="password"]').waitFor();
  assert.equal(new URL(page.url()).pathname, "/login");
  assert.deepEqual(errors, []);
  console.log("PASS: login bypass, direct route, refresh, restored login form, no frontend exceptions");
} finally {
  await browser.close();
}
