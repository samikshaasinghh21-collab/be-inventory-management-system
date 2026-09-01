import assert from "node:assert/strict";
import test from "node:test";

import { calculateFinalAvailableQty } from "../../src/utils/inventoryBalance.js";

test("final available quantity subtracts consumption and moved stock", () => {
  assert.equal(
    calculateFinalAvailableQty({
      sourceQty: 100,
      consumedQty: 35,
      reallocatedQty: 10,
      availableQty: 100,
    }),
    55
  );
});

test("final available quantity keeps a fully consumed row at zero", () => {
  assert.equal(
    calculateFinalAvailableQty({ sourceQty: 20, consumedQty: 20 }),
    0
  );
});

test("final available quantity falls back to a persisted balance", () => {
  assert.equal(calculateFinalAvailableQty({ availableQty: 12 }), 12);
});
