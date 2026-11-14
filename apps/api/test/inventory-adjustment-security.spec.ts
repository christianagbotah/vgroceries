import { test } from "node:test";
import assert from "node:assert/strict";
import { InventoryAdjustmentService, requestAdjustmentSchema, decideAdjustmentSchema } from "../src/inventory/inventory-adjustment.service";
import { hasPermission } from "../src/identity/permissions";
import { ApiProblem } from "../src/http/errors";

const actor = (role: string, locations: string[] = ["loc_accra"]) => ({
  actor: { id: "person-a", role, locationIds: locations }, requestId: "req-test",
}) as never;
const service = () => new InventoryAdjustmentService({} as never, {
  stockLocationId: "loc_accra",
} as never);
const body = {
  lotId: "lot-1", variantId: "variant-1",
  delta: "-1", reason: "Physical count discrepancy",
};
const rejects = (error: unknown, status: number) =>
  error instanceof ApiProblem && error.getStatus() === status;

test("only stock officers/admin may request; only admin may approve; cashiers have neither", () => {
  assert.equal(hasPermission("admin", "inventory.adjust.request"), true);
  assert.equal(hasPermission("admin", "inventory.adjust.approve"), true);
  assert.equal(hasPermission("inventory_manager", "inventory.adjust.request"), true);
  assert.equal(hasPermission("inventory_manager", "inventory.adjust.approve"), false);
  assert.equal(hasPermission("cashier", "inventory.adjust.request"), false);
  assert.equal(hasPermission("cashier", "inventory.adjust.approve"), false);
});

test("adjustment request refuses malformed money-like and unknown parameters", () => {
  assert.equal(requestAdjustmentSchema.safeParse(body).success, true);
  for (const delta of ["0", "+0", "-0.000", "1e4", "1.2345", "1000000000000", "NaN", "Infinity"]) {
    const result = requestAdjustmentSchema.safeParse({ ...body, delta });
    if (delta === "0" || delta === "+0" || delta === "-0.000") {
      // Parsing accepts the syntax, but the service refuses zero physical deltas.
      assert.equal(result.success, true);
    } else assert.equal(result.success, false);
  }
  assert.equal(requestAdjustmentSchema.safeParse({ ...body, actor: "admin" }).success, false);
  assert.equal(requestAdjustmentSchema.safeParse({ ...body, reason: "short" }).success, false);
  assert.equal(requestAdjustmentSchema.safeParse({ ...body, locationId: "../other" }).success, false);
});

test("approval request requires canonical UUID and exactly approve or reject", () => {
  assert.equal(decideAdjustmentSchema.safeParse({
    adjustmentId: "3a25da17-889a-45f8-90de-49c1043394a1",
    decision: "approve",
  }).success, true);
  assert.equal(decideAdjustmentSchema.safeParse({
    adjustmentId: "fake-id", decision: "approve",
  }).success, false);
  assert.equal(decideAdjustmentSchema.safeParse({
    adjustmentId: "3a25da17-889a-45f8-90de-49c1043394a1",
    decision: "approved", actor: "impersonated-admin",
  }).success, false);
});

test("branch deny happens before any DB read/write for listing or requesting", async () => {
  const svc = service();
  await assert.rejects(svc.list(actor("inventory_manager", [])), (e) => rejects(e, 403));
  await assert.rejects(svc.request(actor("inventory_manager", []), body, "abc12345"), (e) => rejects(e, 403));
  await assert.rejects(svc.request(actor("cashier", []), body, "abc12345"), (e) => rejects(e, 403));
  await assert.rejects(svc.request(actor("cashier", ["loc_accra"]), body, "abc12345"), (e) => rejects(e, 403));
  await assert.rejects(svc.list(actor("cashier", ["loc_accra"])), (e) => rejects(e, 403));
});

test("non-admin decision denied before any DB lock or mutation", async () => {
  const svc = service();
  await assert.rejects(svc.decide(actor("inventory_manager"), {
    adjustmentId: "3a25da17-889a-45f8-90de-49c1043394a1", decision: "approve",
  }), (e) => rejects(e, 403));
  await assert.rejects(svc.decide(actor("cashier"), {
    adjustmentId: "3a25da17-889a-45f8-90de-49c1043394a1", decision: "reject",
  }), (e) => rejects(e, 403));
});

test("zero quantity corrections fail before DB access", async () => {
  const svc = service();
  for (const delta of ["0", "-0.000", "+0"]) {
    await assert.rejects(svc.request(actor("admin"), { ...body, delta }, "valid-key-123"),
      (e) => rejects(e, 400));
  }
});
