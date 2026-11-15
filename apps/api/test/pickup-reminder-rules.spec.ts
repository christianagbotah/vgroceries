import { test } from "node:test";
import assert from "node:assert/strict";
import {
  pickupReminderWindow, pickupReminderEventId, pickupReminderPayloadMatches,
  pickupReminderOrderEligible,
} from "../src/notifications/pickup-reminder-rules";

const now = new Date("2026-11-15T10:00:00.000Z");
const booked = {
  orderId: "order-1", nodeId: "pickup-1",
  status: "booked",
  startsAt: new Date("2026-11-15T11:00:00.000Z"),
  bookedAt: new Date("2026-11-15T09:00:00.000Z"),
};
const payload = {
  nodeId: booked.nodeId,
  startsAt: booked.startsAt.toISOString(),
  bookedAt: booked.bookedAt.toISOString(),
};
const eligible = {
  paymentStatus: "succeeded",
  fulfilmentStatus: "dispatched",
  cancelledAt: null as Date | null,
  pickupSnapshot: {
    nodeId: booked.nodeId,
    node: { active: true, customerVisible: true, kind: "pickup_point" },
  },
  refunds: [] as { status: string }[],
  shipments: [{
    status: "ready_for_pickup", destinationKind: "pickup_point",
    finalPickupNodeId: booked.nodeId, currentNodeId: booked.nodeId,
    completedAt: null as Date | null, currentLegId: null as string | null,
  }],
};

test("reminder window is strictly before the scheduled start, at most 90 minutes ahead", () => {
  assert.equal(pickupReminderWindow(new Date(now.getTime() + 90 * 60_000), now), true);
  assert.equal(pickupReminderWindow(new Date(now.getTime() + 90 * 60_000 + 1), now), false);
  assert.equal(pickupReminderWindow(new Date(now.getTime() + 1), now), true);
  assert.equal(pickupReminderWindow(now, now), false);
  assert.equal(pickupReminderWindow(new Date(now.getTime() - 1), now), false);
  assert.equal(pickupReminderWindow(new Date("invalid"), now), false);
});

test("booking identity is deterministic but changes after a verified reschedule", () => {
  const same = pickupReminderEventId(booked);
  assert.equal(same, pickupReminderEventId({ ...booked }));
  assert.ok(same.startsWith("pickup-reminder-"));
  assert.notEqual(same, pickupReminderEventId({
    ...booked, bookedAt: new Date(booked.bookedAt.getTime() + 1000),
  }));
  assert.notEqual(same, pickupReminderEventId({
    ...booked, startsAt: new Date(booked.startsAt.getTime() + 30_000),
  }));
});

test("stale and tampered appointment reminder payloads are rejected", () => {
  assert.equal(pickupReminderPayloadMatches(payload, booked), true);
  assert.equal(pickupReminderPayloadMatches(payload, null), false);
  assert.equal(pickupReminderPayloadMatches(payload, { ...booked, status: "cancelled" }), false);
  assert.equal(pickupReminderPayloadMatches({ ...payload, nodeId: "another-centre" }, booked), false);
  assert.equal(pickupReminderPayloadMatches({ ...payload, startsAt: "bogus" }, booked), false);
  assert.equal(pickupReminderPayloadMatches({ ...payload, bookedAt: "bogus" }, booked), false);
  assert.equal(pickupReminderPayloadMatches({ phone: "spoofed" }, booked), false);
});

test("eligible collection reminder requires paid dispatched parcel at its active public centre", () => {
  assert.equal(pickupReminderOrderEligible(eligible, booked.nodeId), true);
  assert.equal(pickupReminderOrderEligible({ ...eligible, paymentStatus: "unpaid" }, booked.nodeId), false);
  assert.equal(pickupReminderOrderEligible({ ...eligible, fulfilmentStatus: "collected" }, booked.nodeId), false);
  assert.equal(pickupReminderOrderEligible({ ...eligible, cancelledAt: now }, booked.nodeId), false);
  assert.equal(pickupReminderOrderEligible({ ...eligible, refunds: [{ status: "processing" }] }, booked.nodeId), false);
  assert.equal(pickupReminderOrderEligible({ ...eligible, pickupSnapshot: {
    ...eligible.pickupSnapshot, node: { ...eligible.pickupSnapshot.node, active: false },
  } }, booked.nodeId), false);
  assert.equal(pickupReminderOrderEligible({ ...eligible, pickupSnapshot: {
    ...eligible.pickupSnapshot, node: { ...eligible.pickupSnapshot.node, customerVisible: false },
  } }, booked.nodeId), false);
  assert.equal(pickupReminderOrderEligible({ ...eligible, shipments: [{
    ...eligible.shipments[0]!, status: "completed",
  }] }, booked.nodeId), false);
  assert.equal(pickupReminderOrderEligible({ ...eligible, shipments: [{
    ...eligible.shipments[0]!, currentLegId: "active-transit",
  }] }, booked.nodeId), false);
});
