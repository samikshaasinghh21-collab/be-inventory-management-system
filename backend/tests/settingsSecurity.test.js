import assert from "node:assert/strict";
import test from "node:test";
import {
  hasPermission,
  hasStepUpScope,
  passwordPolicyError,
  permissionsForRole,
} from "../src/auth.js";

test("predefined role permissions preserve administration boundaries", () => {
  assert.equal(hasPermission({ role: "Super Admin" }, "anything"), true);
  assert.equal(hasPermission({ role: "Admin" }, "users.manage"), true);
  assert.equal(hasPermission({ role: "Manager" }, "users.manage"), false);
  assert.equal(hasPermission({ role: "Engineer" }, "tasks.update.assigned"), true);
  assert.equal(hasPermission({ role: "Viewer" }, "drawings.create"), false);
});

test("permission definitions are returned as immutable predefined values", () => {
  assert.deepEqual(permissionsForRole("Storekeeper"), ["documents.view", "inventory.manage"]);
  assert.deepEqual(permissionsForRole("unknown"), permissionsForRole("Viewer"));
});

test("password policy requires 14 characters and rejects common passwords", () => {
  assert.match(passwordPolicyError("Short1!"), /14/);
  assert.match(passwordPolicyError("password1234"), /commonly used/);
  assert.equal(passwordPolicyError("correct horse battery staple 7"), null);
});

test("step-up grants are action-scoped and expire", () => {
  const valid = new Date(Date.now() + 60_000).toISOString();
  const expired = new Date(Date.now() - 60_000).toISOString();
  assert.equal(hasStepUpScope({ StepUpScopesJson: JSON.stringify({ "users.manage": valid }) }, "users.manage"), true);
  assert.equal(hasStepUpScope({ StepUpScopesJson: JSON.stringify({ "users.manage": valid }) }, "settings.security"), false);
  assert.equal(hasStepUpScope({ StepUpScopesJson: JSON.stringify({ "users.manage": expired }) }, "users.manage"), false);
});
