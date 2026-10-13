import { test } from "node:test";
import assert from "node:assert/strict";
import {
  deliveryStatusSchema,
  dispatchActionSchema,
  dispatchAssignRequestSchema,
  dispatchBlockerSchema,
  dispatchFailureReasonSchema,
  dispatchProofMethodSchema,
  dispatchProviderTransitionRequestSchema,
  riderActionSchema,
  riderAvailabilityRequestSchema,
  riderDeliverRequestSchema,
  riderFailRequestSchema,
  riderNoteRequestSchema,
} from "@variety/contracts";

test("dispatch contracts pin production vocabularies", () => {
  assert.deepEqual(deliveryStatusSchema.options, [
    "unassigned",
    "assigned",
    "accepted",
    "picked_up",
    "out_for_delivery",
    "delivered",
    "failed",
    "rescheduled",
    "return_to_store",
  ]);
  assert.deepEqual(dispatchActionSchema.options, [
    "assign",
    "unassign",
    "reassign",
    "reschedule",
    "return_to_store",
    "receive_returned_goods",
    "provider_transition",
  ]);
  assert.deepEqual(riderActionSchema.options, [
    "set_availability",
    "accept",
    "pickup",
    "out_for_delivery",
    "deliver",
    "fail",
    "note",
  ]);
  assert.deepEqual(dispatchProofMethodSchema.options, ["signature", "photo_note"]);
  assert.equal(dispatchProofMethodSchema.safeParse("pin").success, false);
  assert.deepEqual(dispatchFailureReasonSchema.options, [
    "customer_unavailable",
    "customer_refused",
    "address_problem",
    "unable_to_contact",
    "access_or_safety_issue",
    "vehicle_or_operational_issue",
    "other",
  ]);
  assert.ok(dispatchBlockerSchema.options.includes("rider_busy"));
  assert.ok(dispatchBlockerSchema.options.includes("custody_not_safe_for_reassignment"));
  assert.ok(dispatchBlockerSchema.options.includes("proof_required"));
});

test("dispatch contracts require exactly one assignment target", () => {
  assert.equal(dispatchAssignRequestSchema.safeParse({ riderProfileId: "rider_1" }).success, true);
  assert.equal(
    dispatchAssignRequestSchema.safeParse({
      manualProvider: { providerKey: "manual", providerName: "Local courier", reference: "BOOK-1" },
    }).success,
    true,
  );
  assert.equal(dispatchAssignRequestSchema.safeParse({}).success, false);
  assert.equal(
    dispatchAssignRequestSchema.safeParse({
      riderProfileId: "rider_1",
      manualProvider: { providerKey: "manual", reference: "BOOK-1" },
    }).success,
    false,
  );
});

test("dispatch contracts reject stale COD remittance and browser identity authority", () => {
  assert.equal(
    dispatchAssignRequestSchema.safeParse({ riderProfileId: "rider_1", riderId: "browser-rider" }).success,
    false,
  );
  assert.equal(
    riderDeliverRequestSchema.safeParse({
      proof: { method: "signature", reference: "recipient-signature" },
      cashCollected: true,
    }).success,
    false,
  );
  assert.equal(
    riderFailRequestSchema.safeParse({ reason: "customer_unavailable", riderId: "browser-rider" }).success,
    false,
  );
  assert.equal(
    dispatchProviderTransitionRequestSchema.safeParse({ action: "remit", amountMinor: 5000 }).success,
    false,
  );
});

test("dispatch contracts normalize bounded notes and availability", () => {
  const availability = riderAvailabilityRequestSchema.parse({ availability: "available" });
  assert.equal(availability.availability, "available");
  assert.equal(riderAvailabilityRequestSchema.safeParse({ availability: "busy" }).success, false);

  const note = riderNoteRequestSchema.parse({ note: "  customer requested side gate  " });
  assert.equal(note.note, "customer requested side gate");
  assert.equal(riderNoteRequestSchema.safeParse({ note: " ".repeat(20) }).success, false);
  assert.equal(riderNoteRequestSchema.safeParse({ note: "x".repeat(501) }).success, false);
});

test("dispatch contracts require truthful proof and bounded failure reason", () => {
  assert.equal(
    riderDeliverRequestSchema.safeParse({ proof: { method: "signature", reference: "Ama Mensah" } }).success,
    true,
  );
  assert.equal(riderDeliverRequestSchema.safeParse({ proof: { method: "signature" } }).success, false);
  assert.equal(riderDeliverRequestSchema.safeParse({ proof: { method: "pin", reference: "1234" } }).success, false);

  assert.equal(riderFailRequestSchema.safeParse({ reason: "customer_refused" }).success, true);
  assert.equal(riderFailRequestSchema.safeParse({ reason: "made_up_reason" }).success, false);
});
