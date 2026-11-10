import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { fixtureFor, projects } from '../../scripts/ui-fixtures.mjs';

const output = new URL('./', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, recordVideo: { dir: output, size: { width: 1440, height: 1000 } } });
const user = { id: 1, fullName: 'Demo Administrator', name: 'Demo Administrator', email: 'demo@example.test', role: 'Super Admin', permissions: ['*'], authenticationDisabled: true };
const reports = ['Submitted', 'Approved', 'Draft'].map((status, index) => ({
  id: index + 1, projectId: index === 1 ? 2 : 1, reportNumber: `DSR-2026-00${index + 1}`,
  reportDate: '2026-10-23', shift: 'General', weather: 'Clear', status,
  preparedBy: 'Ananya Rao', projectManager: 'Rohan Mehta', siteName: index === 1 ? 'Electronic City' : 'Whitefield',
  summary: 'Network cabinet installation completed on Level 2. Structured cabling and equipment checks are progressing to schedule.',
  workCompleted: 'Installed two network cabinets and tested cable connectivity.',
  tomorrowPlan: 'Complete switch commissioning and quality inspection.',
  taskRows: [{ id: 'demo-task', taskId: 1, taskName: 'Commission network cabinets', status: 'In Progress', reportedProgress: 75, workDone: 'Two cabinets installed and tested.', blockers: 'None' }],
  manpowerRows: [], materialRows: [], equipmentRows: [], qualityRows: [], visitorRows: [], safetyRows: [], photos: [], attachments: [],
  issueRows: index === 2 ? [{ id: 'demo-issue', issue: 'Confirm delivery time for remaining switches', severity: 'Low', status: 'Open' }] : [],
}));
await context.route('**/api/**', async route => {
  const path = new URL(route.request().url()).pathname.replace(/^\/api/, '');
  let data = fixtureFor(path) ?? [];
  if (path === '/auth/me') data = { user };
  else if (path === '/auth/mode') data = { authenticationDisabled: true };
  else if (path === '/health') data = { ok: true, db: 'connected' };
  else if (path === '/project-management/reports') data = { reports };
  else if (path.includes('profile')) data = { user, profile: user };
  else if (path.includes('settings')) data = { settings: {}, company: { name: 'Bangalore Electronics' } };
  // All API requests terminate in this isolated browser; demo records never reach a server.
  await route.fulfill({ status: 200, json: data });
});
const page = await context.newPage();
const started = Date.now();
const errors = [];
page.on('pageerror', error => errors.push(error.message));
try {
  await page.goto('http://localhost:5173/project-management/site-reports', { waitUntil: 'networkidle' });
  await page.getByRole('heading', { name: 'Daily Site Reports', exact: true }).waitFor();
  await page.getByText('DSR-2026-001', { exact: true }).waitFor();
  await page.evaluate(() => {
    const style = document.createElement('style');
    style.textContent = '#demo-caption{position:fixed;left:0;right:0;bottom:0;z-index:2147483647;background:#0f172a;color:white;padding:20px 36px;font:500 21px/1.45 system-ui;box-shadow:0 -4px 24px #0f172a22;pointer-events:none}#demo-caption small{display:block;font:600 11px system-ui;letter-spacing:2px;color:#5eead4;margin-bottom:7px}';
    document.head.append(style);
    const caption = document.createElement('div'); caption.id = 'demo-caption'; document.body.append(caption);
  });
  const trimStart = (Date.now() - started) / 1000;
  const caption = async text => page.evaluate(text => {
    const element = document.querySelector('#demo-caption'); element.replaceChildren();
    const label = document.createElement('small'); label.textContent = 'BE INVENTORY  /  SITE REPORTS  /  SAMPLE DATA';
    element.append(label, document.createTextNode(text));
  }, text);
  const pause = ms => page.waitForTimeout(ms);
  await caption('Daily Site Reports — a clear view of work happening on site.');
  await page.screenshot({ path: `${output}/preview.png` });
  await pause(4500);
  await caption('Track drafts, pending reviews, approvals, and open issues in one place.');
  await pause(4500);
  await caption('Find a report instantly by project, site, or report number.');
  const search = page.getByPlaceholder('Search report, project, site...');
  await search.pressSequentially('Electronic City', { delay: 90 });
  await pause(2500);
  await search.fill('');
  await pause(800);
  await page.getByTitle('View', { exact: true }).first().click();
  await caption('Open the daily summary to review progress and the plan for tomorrow.');
  await page.locator('#site-report-view-panel').waitFor();
  await pause(5000);
  await page.locator('#site-report-view-panel header button').last().click();
  await page.getByRole('button', { name: 'Create Daily Site Report', exact: true }).click();
  await caption('Start a report with the project, shift, site, and person preparing it.');
  await page.locator('.fixed.inset-0.z-50 select').first().selectOption(String(projects[0].id));
  await pause(4500);
  await caption('Record daily work, task progress, manpower, and materials.');
  await page.getByRole('heading', { name: 'Daily Narrative', exact: true }).scrollIntoViewIfNeeded();
  await pause(4000);
  await page.getByRole('heading', { name: 'Task Progress *', exact: true }).scrollIntoViewIfNeeded();
  await pause(3500);
  await caption('Keep safety checks, quality observations, and site photos with each report.');
  await page.getByRole('heading', { name: 'Site Photos', exact: true }).scrollIntoViewIfNeeded();
  await pause(4500);
  await caption('Daily Site Reports — capture the work. Keep the team informed.');
  await pause(3500);
  await writeFile(`${output}/recording.json`, JSON.stringify({ trimStart, errors, width: 1440, height: 1000, sampleData: true }, null, 2));
  if (errors.length) throw new Error(errors.join('\n'));
} finally {
  await context.close();
  console.log(JSON.stringify({ recording: await page.video().path(), output }));
  await browser.close();
}
