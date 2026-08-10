import assert from "node:assert/strict";
import test from "node:test";
import { isAllowedOrigin } from "../src/corsConfig.js";

test("allows common local Vite dev origins", () => {
  assert.equal(isAllowedOrigin("http://localhost:5175"), true);
  assert.equal(isAllowedOrigin("http://localhost:5176"), true);
  assert.equal(isAllowedOrigin("http://127.0.0.1:5173"), true);
  assert.equal(isAllowedOrigin("http://localhost:5173"), true);
});

test("rejects unrelated remote origins", () => {
  assert.equal(isAllowedOrigin("https://example.com"), false);
  assert.equal(isAllowedOrigin("http://remotehost:3000"), false);
});
