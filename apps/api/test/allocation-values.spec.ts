import { test } from "node:test";
import assert from "node:assert/strict";
import { ApiProblem } from "../src/http/errors";
import {
  normalizeAllocationQuantity,
  validateAllocationLines,
} from "../src/inventory/allocation.values";

function assertValidationFailure(fn: () => unknown) {
  assert.throws(fn, (error: unknown) => {
    assert.ok(error instanceof ApiProblem);
    assert.equal(error.getStatus(), 400);
    assert.equal(
      (error.getResponse() as { code: string }).code,
      "VALIDATION_FAILED",
    );
    return true;
  });
}

test("allocation quantity accepts exact kg and litre decimals", () => {
  assert.equal(normalizeAllocationQuantity("1.250", "kg").toString(), "1.25");
  assert.equal(normalizeAllocationQuantity("0.001", "litre").toString(), "0.001");
});

test("allocation quantity rejects zero, negative, overprecision and non-numeric input", () => {
  for (const raw of ["0", "-1", "1.0001", "abc", "", "1e2"])
    assertValidationFailure(() => normalizeAllocationQuantity(raw, "kg"));
});

test("count-based allocation quantities must be whole units", () => {
  assert.equal(normalizeAllocationQuantity("2", "piece").toString(), "2");
  assertValidationFailure(() => normalizeAllocationQuantity("1.5", "piece"));
  assertValidationFailure(() => normalizeAllocationQuantity("2.25", "carton"));
});

test("allocation lines reject empty and duplicate claim line identifiers", () => {
  assertValidationFailure(() => validateAllocationLines([]));
  assertValidationFailure(() =>
    validateAllocationLines([
      { claimLineId: "line-1", variantId: "var_a", quantity: "1" },
      { claimLineId: "line-1", variantId: "var_b", quantity: "1" },
    ]),
  );
  assert.doesNotThrow(() =>
    validateAllocationLines([
      { claimLineId: "line-1", variantId: "var_a", quantity: "1" },
      { claimLineId: "line-2", variantId: "var_a", quantity: "2" },
    ]),
  );
});
