import assert from "node:assert/strict";
import test from "node:test";

process.env.NODE_ENV = "test";
process.env.AUTH_DISABLED = "false";

test("protected API routes reject requests without a session", async (context) => {
  const { app } = await import("../src/server.js");
  const server = app.listen(0, "127.0.0.1");
  context.after(() => new Promise((resolve) => server.close(resolve)));
  await new Promise((resolve) => server.once("listening", resolve));
  const { port } = server.address();

  for (const path of ["/api/items", "/api/hrms/employees", "/api/invoices", "/api/delivery-challans"]) {
    const response = await fetch(`http://127.0.0.1:${port}${path}`);
    assert.equal(response.status, 401, `${path} must require authentication`);
    assert.equal((await response.json()).code, "AUTH_REQUIRED");
  }
});
