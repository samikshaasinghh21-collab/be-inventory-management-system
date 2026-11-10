import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { createInFlightRequests } from "../../shared/inFlightRequests.js";

const serverSource = readFileSync(new URL("../src/server.js", import.meta.url), "utf8");
const tableNames = ["Employees", "Reviews", "SalaryReassessments", "Attendance", "Salaries", "Relieving"];

function loadInitializers(query) {
  const context = vm.createContext({
    runtimeSchemaUpdatesEnabled: true,
    getPool: async () => ({ request: () => ({ query }) }),
    HRMS_DATABASE_NAME: "HRMS",
    escapeSqlLiteral: (value) => value,
    toIdentifier: (value) => `[${value}]`,
    hrmsTable: (name) => `[HRMS].[dbo].[${name}]`,
    hrmsObjectName: (name) => `HRMS.dbo.${name}`,
  });
  for (const name of tableNames) {
    const fn = `ensureHrms${name}Table`;
    const start = serverSource.indexOf(`const ${fn} = async () => {`);
    assert.ok(start >= 0);
    const end = serverSource.indexOf("\n};", start) + 3;
    vm.runInContext(`let ${fn}Promise = null;\n${serverSource.slice(start, end)}`, context);
  }
  return (name) => vm.runInContext(`ensureHrms${name}Table()`, context);
}

test("concurrent and subsequent HRMS reads initialize each schema only once", async () => {
  let queries = 0;
  const ensure = loadInitializers(async () => { queries += 1; });
  await Promise.all(tableNames.flatMap((name) => [ensure(name), ensure(name)]));
  // Salaries has two initialization batches; the other tables have one each.
  assert.equal(queries, 7);
  await Promise.all(tableNames.map(ensure));
  assert.equal(queries, 7);
});

for (const name of tableNames) {
  test(`${name} initialization retries after a database failure`, async () => {
    let fail = false;
    let queries = 0;
    const ensure = loadInitializers(async () => {
      queries += 1;
      if (fail) throw new Error("database temporarily unavailable");
    });
    if (name !== "Employees") await ensure("Employees");
    fail = true;
    await assert.rejects(ensure(name), /temporarily unavailable/);
    fail = false;
    await ensure(name);
    const initializedQueries = queries;
    await ensure(name);
    assert.equal(queries, initializedQueries);
  });
}

test("employee reads share concurrent requests and fetch fresh data afterwards", async () => {
  const requests = createInFlightRequests();
  let calls = 0;
  const fetch = async () => ++calls;
  const first = requests.run("employees", fetch);
  assert.equal(requests.run("employees", fetch), first);
  assert.equal(await first, 1);
  assert.equal(await requests.run("employees", fetch), 2);
  await assert.rejects(requests.run("employees", () => Promise.reject(new Error("offline"))));
  assert.equal(await requests.run("employees", fetch), 3);
});

test("employee changes invalidate pending reads without removing newer requests", async () => {
  const requests = createInFlightRequests();
  let finishOld;
  let finishNew;
  const old = requests.run("employees", () => new Promise((resolve) => { finishOld = resolve; }));
  await Promise.resolve();
  requests.clear();
  const fresh = requests.run("employees", () => new Promise((resolve) => { finishNew = resolve; }));
  await Promise.resolve();
  finishOld("old");
  await old;
  assert.equal(requests.run("employees", () => assert.fail("must share new request")), fresh);
  finishNew("new");
  assert.equal(await fresh, "new");
});
