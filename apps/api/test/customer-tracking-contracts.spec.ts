import assert from "node:assert/strict";
import test from "node:test";
import * as Contracts from "@variety/contracts";

const exported = Contracts as unknown as Record<string, unknown>;

type ZodLike = {
  options?: readonly string[];
  safeParse(value: unknown): { success: boolean };
};

function schema(name: string): ZodLike {
  const value = exported[name] as ZodLike | undefined;
  assert.ok(value, `${name} must be exported`);
  assert.equal(typeof value.safeParse, "function", `${name} must be a zod schema`);
  return value;
}

const completeMilestone = {
  id: "shipment-event-1",
  at: "2026-11-02T00:00:00.000Z",
  title: "Arrived at Kumasi hub",
  detail: "Your order reached the next delivery facility.",
  locationLabel: "Kumasi Hub",
  status: "complete",
  kind: "shipment",
};

const journey = {
  source: "shipment",
  state: "at_facility",
  headline: "Your order is at Kumasi Hub",
  detail: "It will continue on the next confirmed delivery step.",
  currentLocationLabel: "Kumasi Hub",
  updatedAt: "2026-11-02T00:00:00.000Z",
  milestones: [completeMilestone],
};

test("customer tracking contracts pin the public state vocabularies", () => {
  assert.deepEqual(schema("customerTrackingStateSchema").options, [
    "preparing",
    "at_facility",
    "in_transit",
    "ready_for_delivery",
    "out_for_delivery",
    "delivery_exception",
    "ready_for_pickup",
    "delivered",
    "collected",
    "returned_to_dispatch",
  ]);
  assert.deepEqual(schema("customerTrackingMilestoneStatusSchema").options, ["complete", "current", "planned"]);
  assert.deepEqual(schema("customerTrackingMilestoneKindSchema").options, ["order", "fulfilment", "shipment", "delivery"]);
});

test("customer tracking milestone is strict and bounded", () => {
  const milestone = schema("customerTrackingMilestoneSchema");
  assert.equal(milestone.safeParse(completeMilestone).success, true);
  assert.equal(milestone.safeParse({ ...completeMilestone, detail: undefined, locationLabel: undefined }).success, true);
  assert.equal(milestone.safeParse({ ...completeMilestone, title: "x".repeat(161) }).success, false);
  assert.equal(milestone.safeParse({ ...completeMilestone, detail: "x".repeat(501) }).success, false);
  assert.equal(milestone.safeParse({ ...completeMilestone, locationLabel: "x".repeat(161) }).success, false);
  assert.equal(milestone.safeParse({ ...completeMilestone, at: "tomorrow" }).success, false);
  assert.equal(milestone.safeParse({ ...completeMilestone, routeRuleId: "secret-route" }).success, false);
  assert.equal(milestone.safeParse({ ...completeMilestone, actorId: "admin-1" }).success, false);
  assert.equal(milestone.safeParse({ ...completeMilestone, paymentStatus: "succeeded" }).success, false);
});

test("customer tracking journey is strict, bounded and contains no operational authority", () => {
  const tracking = schema("customerTrackingJourneySchema");
  assert.equal(tracking.safeParse(journey).success, true);
  assert.equal(tracking.safeParse({ ...journey, detail: undefined, currentLocationLabel: undefined }).success, true);
  assert.equal(tracking.safeParse({ ...journey, headline: "x".repeat(161) }).success, false);
  assert.equal(tracking.safeParse({ ...journey, detail: "x".repeat(501) }).success, false);
  assert.equal(tracking.safeParse({ ...journey, currentLocationLabel: "x".repeat(161) }).success, false);
  assert.equal(tracking.safeParse({ ...journey, updatedAt: "now" }).success, false);
  for (const forbidden of [
    { routeRevision: 3 },
    { currentNodeId: "node-internal" },
    { custody: "rider" },
    { safeMetadata: { anything: true } },
    { eta: "2026-11-02T01:00:00.000Z" },
    { latitude: 5.6 },
    { cashCollectedAt: "2026-11-02T00:00:00.000Z" },
  ]) assert.equal(tracking.safeParse({ ...journey, ...forbidden }).success, false);
});

test("PublicOrder exposes trackingJourney as an optional shared response field", () => {
  const publicOrder = exported.publicOrderSchema as { shape?: Record<string, unknown> } | undefined;
  assert.ok(publicOrder?.shape, "publicOrderSchema must expose a shape");
  assert.ok(publicOrder.shape.trackingJourney, "publicOrderSchema must define optional trackingJourney");
  const field = publicOrder.shape.trackingJourney as ZodLike;
  assert.equal(field.safeParse(undefined).success, true);
  assert.equal(field.safeParse(journey).success, true);
});
