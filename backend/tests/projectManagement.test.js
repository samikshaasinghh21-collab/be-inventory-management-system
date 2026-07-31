import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateAverageProgress,
  calculateMilestoneHealth,
  buildMilestoneNumber,
  buildDocumentNumber,
  canCreateDocumentCategory,
  canEditDocument,
  documentCategory,
  nextDocumentRevision,
  hasDependencyCycle,
  milestoneStatus,
  normalizeReportTaskStatus,
  normalizeTaskUpdate,
} from "../src/projectManagement.js";
import { hasPermission, requirePermission } from "../src/auth.js";

test("Pending forces zero completion", () => {
  const result = normalizeTaskUpdate({ status: "Pending", completionPercentage: 85 });
  assert.equal(result.completionPercentage, 0);
});

test("Completed forces full completion", () => {
  const result = normalizeTaskUpdate({ status: "Completed", completionPercentage: 20 });
  assert.equal(result.completionPercentage, 100);
});

test("Partial requires a percentage between 1 and 99", () => {
  assert.throws(
    () =>
      normalizeTaskUpdate({
        status: "Partial",
        completionPercentage: 100,
        remainingWorkRemarks: "Testing remains",
      }),
    /1 to 99/
  );
});

test("Partial requires remaining-work remarks", () => {
  assert.throws(
    () => normalizeTaskUpdate({ status: "Partial", completionPercentage: 50 }),
    /Remaining-work remarks/
  );
});

test("Cancelled retains the current completion percentage", () => {
  const result = normalizeTaskUpdate(
    { status: "Cancelled" },
    { completionPercentage: 42 }
  );
  assert.equal(result.completionPercentage, 42);
});

test("cancelled tasks are excluded from progress averages", () => {
  assert.equal(
    calculateAverageProgress([
      { status: "Partial", completionPercentage: 40 },
      { status: "Completed", completionPercentage: 100 },
      { status: "Cancelled", completionPercentage: 90 },
    ]),
    70
  );
});

test("a collection containing only cancelled tasks has zero derived progress", () => {
  assert.equal(
    calculateAverageProgress([{ status: "Cancelled", completionPercentage: 75 }]),
    0
  );
});

test("milestone numbering sanitizes the project code and pads its sequence", () => {
  assert.equal(buildMilestoneNumber("KSP/IT-02", 9, 7), "MS-KSPIT02-0007");
  assert.equal(buildMilestoneNumber("", 42, 1), "MS-42-0001");
});

test("milestone status is derived from progress except cancellation", () => {
  assert.equal(milestoneStatus(0), "Pending");
  assert.equal(milestoneStatus(60), "Partial");
  assert.equal(milestoneStatus(100), "Completed");
  assert.equal(milestoneStatus(100, true), "Cancelled");
});

test("milestone health detects overdue, schedule risk, blockers, and overrides", () => {
  const now = new Date("2026-07-30T12:00:00Z");
  assert.equal(calculateMilestoneHealth({
    progress: 40, startDate: "2026-07-01", targetDate: "2026-07-20", now,
  }).health, "Overdue");
  assert.equal(calculateMilestoneHealth({
    progress: 10, startDate: "2026-07-01", targetDate: "2026-08-01", now,
  }).health, "At Risk");
  assert.equal(calculateMilestoneHealth({
    progress: 80, targetDate: "2026-08-30", openBlockingCount: 1, now,
  }).health, "At Risk");
  assert.equal(calculateMilestoneHealth({
    progress: 10, targetDate: "2026-08-30", healthOverride: "On Track", now,
  }).health, "On Track");
});

test("milestone dependency cycle detection handles direct and indirect cycles", () => {
  assert.equal(hasDependencyCycle([[1, 2], [2, 3]]), false);
  assert.equal(hasDependencyCycle([[1, 2], [2, 3], [3, 1]]), true);
  assert.equal(hasDependencyCycle([[1, 1]]), true);
});

test("report Work in Progress maps to canonical Partial", () => {
  assert.equal(normalizeReportTaskStatus("Work in Progress"), "Partial");
  assert.equal(normalizeReportTaskStatus("Completed"), "Completed");
});

test("Admin and Manager can create drawings under the superseding matrix", () => {
  for (const role of ["Super Admin", "Admin", "Manager"]) {
    let nextCalled = false;
    requirePermission("drawings.create")(
      { user: { role } },
      {},
      () => { nextCalled = true; }
    );
    assert.equal(nextCalled, true);
  }
  assert.equal(hasPermission({ role: "Manager" }, "drawings.delete.own"), true);
  assert.equal(hasPermission({ role: "Manager" }, "drawings.delete.any"), false);
  assert.equal(hasPermission({ role: "Admin" }, "drawings.delete.any"), true);
});

test("document numbering uses a sanitized project sequence", () => {
  assert.equal(buildDocumentNumber("KSP/IT/02", 10, 7), "DOC-KSPIT02-0007");
  assert.equal(buildDocumentNumber("", 42, 1), "DOC-42-0001");
  assert.equal(nextDocumentRevision(0), 1);
  assert.equal(nextDocumentRevision(4), 5);
});

test("document categories use the controlled taxonomy", () => {
  assert.equal(documentCategory("Method Statement"), "Method Statement");
  assert.throws(() => documentCategory("Uncontrolled category"), /valid document category/);
});

test("Engineer permissions are limited to owned supporting documents", () => {
  const engineer = { id: 9, role: "Engineer" };
  assert.equal(canCreateDocumentCategory(engineer, "Report"), true);
  assert.equal(canCreateDocumentCategory(engineer, "Drawing"), false);
  assert.equal(canEditDocument(engineer, { Category: "Report", UploadedBy: 9 }), true);
  assert.equal(canEditDocument(engineer, { Category: "Report", UploadedBy: 10 }), false);
  assert.equal(canEditDocument(engineer, { Category: "Drawing", UploadedBy: 9 }), false);
});
