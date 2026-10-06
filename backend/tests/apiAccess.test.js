import assert from "node:assert/strict";
import test from "node:test";
import { authorizeApiRequest, permissionsForApiRequest } from "../src/apiAccess.js";
import { sanitizeErrorPayload } from "../src/errorResponse.js";
import { paginatePayload } from "../src/pagination.js";

test("API policy separates HRMS, finance, procurement, and inventory permissions", () => {
  assert.deepEqual(permissionsForApiRequest("GET", "/hrms/employees"), ["hrms.view"]);
  assert.deepEqual(permissionsForApiRequest("POST", "/hrms/employees"), ["hrms.manage"]);
  assert.deepEqual(permissionsForApiRequest("GET", "/invoices"), ["finance.view"]);
  assert.deepEqual(permissionsForApiRequest("POST", "/items"), ["inventory.manage"]);
});

test("API policy returns 403 when a role lacks module access", () => {
  let response;
  authorizeApiRequest(
    { method: "GET", path: "/hrms/employees", user: { role: "Viewer" } },
    { status(code) { response = { code }; return this; }, json(body) { response.body = body; return this; } },
    () => assert.fail("authorization unexpectedly succeeded")
  );
  assert.equal(response.code, 403);
  assert.equal(response.body.code, "FORBIDDEN");
});

test("production 5xx responses do not expose internal error details", () => {
  assert.deepEqual(
    sanitizeErrorPayload(500, { ok: false, error: "Invalid object dbo.Secret" }, true),
    { ok: false, code: "INTERNAL_ERROR", error: "Internal server error" }
  );
  assert.equal(sanitizeErrorPayload(400, { error: "Useful validation" }, true).error, "Useful validation");
});

test("pagination is bounded and preserves the existing response envelope", () => {
  const result = paginatePayload({ ok: true, employees: [1, 2, 3, 4, 5] }, 2, 2);
  assert.deepEqual(result.employees, [3, 4]);
  assert.deepEqual(result.pagination, { page: 2, pageSize: 2, total: 5, pages: 3 });
});
