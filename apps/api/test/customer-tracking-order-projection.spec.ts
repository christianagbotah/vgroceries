import { test } from "node:test";
import assert from "node:assert/strict";
import type { Database } from "../src/database/database";
import { OrderProjectionService } from "../src/orders/order-projection.service";
import { legacyOrderTrackingJourney } from "../src/orders/legacy-order-tracking";
import { OrderQueryService } from "../src/orders/order-query.service";
import { ShipmentCustomerTrackingService } from "../src/logistics/shipment-customer-tracking.service";
import { TrackingThrottleService } from "../src/orders/tracking-throttle.service";
import { VerificationCodeService } from "../src/orders/verification-code.service";

const now = new Date("2026-11-02T11:00:00.000Z");
const order = {
  id: "test-order", reference: "VG-TEST-1", customerUserId: "customer-a", guestSessionId: "guest-a",
  verificationKeyVersion: 1, verificationCodeHash: "hashed-only",
  customerName: "Ama", customerPhone: "+233240000000", channel: "online",
  fulfilment: "delivery", slot: null, createdAt: now,
  subtotalMinor: 1000, discountMinor: 0, deliveryFeeMinor: 100, totalMinor: 1100,
  paymentMethod: "cash_on_delivery", paymentStatus: "unpaid",
  fulfilmentStatus: "awaiting_confirmation", deliveryStatus: "unassigned",
  paymentAttempts: [], refunds: [], lines: [], events: [
    { createdAt: now, action: "order.created", actorKind: "guest", fromStatus: null, toStatus: "awaiting_confirmation", note: "private note" },
  ], stockConsumedAt: null,
};
const journey = {
  source: "shipment" as const,
  state: "in_transit" as const,
  headline: "Your order is moving between delivery facilities",
  updatedAt: now.toISOString(),
  milestones: [{ id: "e1", at: now.toISOString(), title: "Order left hub", kind: "shipment" as const, status: "current" as const }],
};

function harness(useShipment = true) {
  const failures: string[] = [];
  const db = {
    order: { findUnique: async ({ where }: { where: { id?: string; reference?: string } }) =>
      (where.id === order.id || where.reference === order.reference ? order : null) },
    auditEvent: { create: async () => ({}) },
  } as unknown as Database;
  const tracking = { project: async () => useShipment ? journey : null } as unknown as ShipmentCustomerTrackingService;
  const projection = new OrderProjectionService(db, tracking);
  const throttle = { registerFailure: async (_clientKey: string, reference: string) => {
    failures.push(reference);
  } } as unknown as TrackingThrottleService;
  const verification = { verify: (_id: string, code: string) => code === "GOOD" } as unknown as VerificationCodeService;
  const query = new OrderQueryService(db, projection, throttle, verification);
  return { query, projection, failures };
}

test("verified guest and authenticated customer receive the same customer-safe Shipment journey", async () => {
  const { query } = harness();
  const owner = await query.status({ kind: "customer", userId: "customer-a" } as never, order.id);
  const guestSession = await query.status({ kind: "guest", guestSessionId: "guest-a" } as never, order.id);
  const guestCode = await query.track(order.reference, "GOOD", "ip", "req-id");
  assert.deepEqual(owner.trackingJourney, journey);
  assert.deepEqual(guestSession.trackingJourney, owner.trackingJourney);
  assert.deepEqual(guestCode.trackingJourney, owner.trackingJourney);
  assert.equal(owner.events[0]?.action, "order.created");
  assert.equal(JSON.stringify(owner.trackingJourney).includes("customerPhone"), false);
  assert.equal(JSON.stringify(owner.trackingJourney).includes("hashed-only"), false);
});

test("guessed/foreign order does not reveal a journey and incorrect guest code is rejected", async () => {
  const { query, failures } = harness();
  await assert.rejects(() => query.status({ kind: "customer", userId: "other-user" } as never, order.id),
    (err: any) => err?.getStatus?.() === 404);
  await assert.rejects(() => query.status({ kind: "guest", guestSessionId: "other-guest" } as never, order.id),
    (err: any) => err?.getStatus?.() === 404);
  await assert.rejects(() => query.track(order.reference, "BAD", "ip", "req-id"),
    (err: any) => err?.getStatus?.() === 403);
  assert.deepEqual(failures, [order.reference]);
});

test("legacy orders receive a bounded readable fallback without staff notes or hidden metadata", async () => {
  const { projection } = harness(false);
  const result = await projection.publicOrder(order.id);
  assert.equal(result.trackingJourney?.source, "legacy");
  assert.equal(result.trackingJourney?.state, "preparing");
  assert.equal(result.trackingJourney?.milestones[0]?.title, "Order placed");
  assert.ok(!JSON.stringify(result.trackingJourney).includes("private note"));
  assert.ok(!JSON.stringify(result.trackingJourney).includes("guest-a"));
});

test("tracking projection failures never silently return raw Shipment details or a bogus legacy timeline", async () => {
  const db = { order: { findUnique: async () => order } } as unknown as Database;
  const tracker = { project: async () => { throw new Error("tracking projection unavailable"); } } as unknown as ShipmentCustomerTrackingService;
  const projection = new OrderProjectionService(db, tracker);
  await assert.rejects(() => projection.publicOrder(order.id), /tracking projection unavailable/);
});


test("cancelled legacy orders never claim active preparation or another delivery", () => {
  const result = legacyOrderTrackingJourney({
    createdAt: now, fulfilment: "delivery", fulfilmentStatus: "cancelled", deliveryStatus: "unassigned",
    events: [{ createdAt: now, action: "order.cancelled_with_refund", note: null }],
  });
  assert.equal(result.state, "delivery_exception");
  assert.equal(result.headline, "Your order was cancelled");
  assert.equal(result.milestones[0]?.title, "Order cancelled");
  assert.equal(result.milestones[0]?.status, "complete");
});

test("ready legacy collection orders show collection readiness without inventing Shipment milestones", () => {
  const result = legacyOrderTrackingJourney({
    createdAt: now, fulfilment: "collection", fulfilmentStatus: "ready_for_collection", deliveryStatus: "unassigned", events: [],
  });
  assert.equal(result.state, "ready_for_pickup");
  assert.equal(result.headline, "Your order is ready for collection");
  assert.equal(result.source, "legacy");
  assert.equal(result.milestones.length, 1);
});


test("cancelled orders with a planned Shipment show cancellation equally for owners and verified guests", async () => {
  const cancelledOrder = { ...order, fulfilmentStatus: "cancelled", events: [
    { ...order.events[0]!, createdAt: new Date(now.getTime() + 60000), action: "order.cancelled", toStatus: "cancelled" },
  ] };
  const db = {
    order: { findUnique: async () => cancelledOrder },
    auditEvent: { create: async () => ({}) },
  } as unknown as Database;
  const tracking = { project: async () => ({ ...journey, state: "preparing", milestones: [
    { ...journey.milestones[0]!, title: "Future delivery", status: "planned" },
  ] }) } as unknown as ShipmentCustomerTrackingService;
  const projection = new OrderProjectionService(db, tracking);
  const query = new OrderQueryService(db, projection, { registerFailure: async () => {} } as unknown as TrackingThrottleService,
    { verify: () => true } as unknown as VerificationCodeService);
  const owner = await query.status({ kind: "customer", userId: "customer-a" } as never, order.id);
  const guest = await query.track(order.reference, "GOOD", "ip", "request");
  assert.deepEqual(owner.trackingJourney, guest.trackingJourney);
  assert.equal(owner.trackingJourney?.headline, "Your order was cancelled");
  assert.equal(owner.trackingJourney?.milestones.some(step => step.status === "planned"), false);
  assert.equal(owner.trackingJourney?.milestones.at(-1)?.title, "Order cancelled");
});
