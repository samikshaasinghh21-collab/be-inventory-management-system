import assert from "node:assert/strict";
import process from "node:process";
import test from "node:test";
import { sql } from "../src/config/db.js";
import {
  authenticate, authenticationDisabled, requireEnrollment, requireStepUp,
} from "../src/auth.js";

test("temporary authentication bypass and restoration", async (t) => {
  const originalEnv = { ...process.env };
  t.after(() => { process.env = originalEnv; });
  for (const prefix of ["SUPER_ADMIN", "ADMIN", "MANAGER"]) {
    delete process.env[`${prefix}_EMAIL`];
    delete process.env[`${prefix}_PASSWORD`];
  }
  let databaseFailure = false;
  const queries = [];
  const pool = { request: () => {
    const request = {
      input: () => request,
      query: async (query) => {
        queries.push(query);
        if (databaseFailure) throw new Error("Database offline");
        if (query.includes("SELECT name FROM sys.tables")) {
          return { recordset: ["AppUsers", "AppSessions", "WebAuthnCredentials", "AuthChallenges"].map((name) => ({ name })) };
        }
        return { recordset: query.includes("SELECT TOP 1 u.*") ? [{
          UserId: 42, FullName: "Test Admin", Email: "admin@example.test",
          RoleName: "Admin", IsActive: true, AccountStatus: "Active",
          TotpEnabled: false, PasskeyCount: 0,
        }] : [] };
      },
    };
    return request;
  } };
  t.mock.method(sql.ConnectionPool.prototype, "connect", async () => pool);
  const response = () => ({
    statusCode: 200,
    status(value) { this.statusCode = value; return this; },
    json(value) { this.body = value; return this; },
  });

  delete process.env.AUTH_DISABLED;
  process.env.NODE_ENV = "production";
  assert.equal(authenticationDisabled(), true);
  process.env.REQUIRE_MFA_ENROLLMENT = "true";
  for (const method of ["GET", "POST", "PUT", "PATCH", "DELETE"]) {
    const req = { method, cookies: { be_session: "expired-cookie" } };
    const res = response();
    let continued = false;
    await authenticate(req, res, (error) => { assert.ifError(error); continued = true; });
    assert.equal(continued, true);
    assert.equal(req.user.id, 42);
    assert.equal(req.user.authenticationDisabled, true);
    assert.equal(req.user.enrollmentRequired, false);
    assert.equal(req.session.SessionId, null);
    let checks = 0;
    requireEnrollment(req, res, () => checks++);
    requireStepUp("purchase_orders.override_closed")(req, res, () => checks++);
    assert.equal(checks, 2);
  }
  assert.equal(queries.some((query) => query.includes("SET LastSeenAt=")), false);
  assert.equal(queries.some((query) => /CREATE TABLE|ALTER TABLE/.test(query)), false);

  databaseFailure = true;
  const failed = response();
  let caught;
  await authenticate({ cookies: {} }, failed, (error) => { caught = error; });
  assert.match(caught.message, /Database offline/);
  assert.equal(failed.body, undefined);
  databaseFailure = false;

  process.env.AUTH_DISABLED = "false";
  assert.equal(authenticationDisabled(), false);
  process.env.NODE_ENV = "test";
  const protectedResponse = response();
  await authenticate({ cookies: {} }, protectedResponse, () => assert.fail("Must require login"));
  assert.equal(protectedResponse.statusCode, 401);
  assert.equal(protectedResponse.body.code, "AUTH_REQUIRED");
});
