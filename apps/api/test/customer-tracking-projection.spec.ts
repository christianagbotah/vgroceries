import { test } from "node:test";
import assert from "node:assert/strict";
import type { Database } from "../src/database/database";
import { ShipmentCustomerTrackingService, trackingState } from "../src/logistics/shipment-customer-tracking.service";
import { customerTrackingJourneySchema } from "@variety/contracts";

const at = (minute: number) => new Date(Date.UTC(2026, 10, 2, 10, minute));
const visible = (publicName: string) => ({ publicName, customerVisible: true });
const hidden = (publicName: string) => ({ publicName, customerVisible: false });

type MockOptions = {
  status?: string;
  destinationKind?: string;
  currentNode?: ReturnType<typeof visible> | null;
  events?: Array<Record<string, unknown>>;
  stages?: Array<Record<string, unknown>>;
  noShipment?: boolean;
};

const stage = (eventKind: string, title: string, planned = false, order = 1) => ({
  id: "stage-private-" + order,
  stageKey: "internal-stage-" + order,
  eventKind,
  sortOrder: order,
  customerTitleTemplate: title,
  customerDetailTemplate: null,
  customerVisible: true,
  showPlannedWhenPending: planned,
});

const event = (eventKind: string, minute: number, node: ReturnType<typeof visible> | null = null, extra: Record<string, unknown> = {}) => ({
  id: "internal-event-" + minute + "-" + eventKind,
  eventKind, occurredAt: at(minute), createdAt: at(minute), node,
  routeRevision: 3, actorId: "secret-rider", requestId: "secret-request",
  safeMetadata: { token: "private-metadata", laneId: "lane-private" },
  customerTitle: null, customerDetail: null,
  ...extra,
});

function fixture(options: MockOptions = {}) {
  const findCalls: unknown[] = [];
  let queriedRun = false;
  const shipment = options.noShipment ? null : {
    id: "shipment-private",
    status: options.status ?? "at_node",
    destinationKind: options.destinationKind ?? "doorstep",
    activatedAt: at(5),
    completedAt: null,
    order: { createdAt: at(0) },
    currentNode: options.currentNode === undefined ? visible("Accra Dispatch") : options.currentNode,
    workflowVersion: {
      id: "workflow-private", stages: options.stages ?? [
        stage("order_placed", "Order placed", false, 1),
        stage("packed", "Packed and ready", true, 2),
        stage("delivered", "Delivered safely", true, 3),
      ],
    },
    events: options.events ?? [event("fulfilment_handed_over", 5, visible("Accra Dispatch"))],
  };
  const db = {
    shipment: { findUnique: async (query: unknown) => {
      findCalls.push(query);
      return shipment;
    } },
    fulfilmentRun: { findUnique: async () => {
      queriedRun = true;
      return { confirmedAt: at(1), pickingStartedAt: at(2), packedAt: at(3), handedOverAt: at(5) };
    } },
  } as unknown as Database;
  return {
    service: new ShipmentCustomerTrackingService(db),
    findCalls,
    runQueried: () => queriedRun,
  };
}

test("legacy/no Shipment returns null without querying FulfilmentRun", async () => {
  const x = fixture({ noShipment: true });
  assert.equal(await x.service.project("order-customer"), null);
  assert.equal(x.runQueried(), false);
});

test("pinned workflow stages show only committed times, and future stages are explicitly planned", async () => {
  const x = fixture();
  const result = await x.service.project("order-customer");
  assert.ok(result);
  assert.equal(result.source, "shipment");
  assert.equal(result.state, "at_facility");
  assert.equal(result.currentLocationLabel, "Accra Dispatch");
  assert.equal(result.headline, "Your order is at a delivery facility");
  assert.equal(result.updatedAt, at(5).toISOString());
  const placed = result.milestones.find((item) => item.title === "Order placed");
  const packed = result.milestones.find((item) => item.title === "Packed and ready");
  const delivery = result.milestones.find((item) => item.title === "Delivered safely");
  assert.equal(placed?.at, at(0).toISOString());
  assert.equal(packed?.at, at(3).toISOString());
  assert.equal(delivery?.status, "planned");
  assert.equal(customerTrackingJourneySchema.safeParse(result).success, true);
  assert.ok(x.findCalls.length === 1);
  const query = x.findCalls[0] as any;
  assert.equal(query.where.orderId_sequence.orderId, "order-customer");
  assert.equal(query.where.orderId_sequence.sequence, 1);
  assert.equal(query.include.events.take, 120);
  assert.ok(!JSON.stringify(result).includes("workflow-private"));
});

test("multi-hop current location is hidden while in transit, with actual visible arrival history", async () => {
  const x = fixture({
    status: "in_transit",
    currentNode: null,
    events: [
      event("shipment_departed", 8, visible("Accra Dispatch")),
      event("shipment_arrived", 12, visible("Kumasi Transit Hub")),
      event("shipment_departed", 14, visible("Kumasi Transit Hub")),
    ],
    stages: [stage("order_placed", "Order placed"), stage("shipment_arrived", "Arrived at a logistics hub", false, 2)],
  });
  const result = await x.service.project("order-customer");
  assert.ok(result);
  assert.equal(result.state, "in_transit");
  assert.equal(result.currentLocationLabel, undefined);
  assert.equal(result.milestones.find((item) => item.title === "Arrived at a logistics hub")?.locationLabel, "Kumasi Transit Hub");
  assert.ok(result.milestones.find((item) => item.title === "Your order left a delivery facility"));
  assert.ok(result.milestones.some((item) => item.status === "current"));
  const publicJson = JSON.stringify(result);
  for (const secret of ["secret-rider", "lane-private", "workflow-private", "secret-request", "routeRevision", "nodeId"]) {
    assert.ok(!publicJson.includes(secret), "must never leak " + secret);
  }
});

test("invisible facilities never supply current or historical customer locations", async () => {
  const secret = hidden("CONFIDENTIAL INTERNAL HUB");
  const x = fixture({ currentNode: secret, events: [event("shipment_arrived", 12, secret)] });
  const result = await x.service.project("order-customer");
  assert.ok(result);
  assert.equal(result.currentLocationLabel, undefined);
  assert.equal(result.milestones.some((item) => item.locationLabel), false);
  assert.ok(!JSON.stringify(result).includes("CONFIDENTIAL"));
});

test("guarded checkpoint custom copy is included without copying arbitrary metadata", async () => {
  const x = fixture({
    events: [
      event("shipment_arrived", 11, visible("Takoradi Hub")),
      event("custom_checkpoint", 12, visible("Takoradi Hub"), {
        customerTitle: "Parcel security checked", customerDetail: "Package sealed and safe.",
      }),
    ],
  });
  const result = await x.service.project("order-customer");
  assert.ok(result);
  const milestone = result.milestones.find((item) => item.title === "Parcel security checked");
  assert.equal(milestone?.detail, "Package sealed and safe.");
  assert.equal(milestone?.locationLabel, undefined);
  assert.ok(!JSON.stringify(result).includes("private-metadata"));
});

test("final-mile exceptions and physical dispatch return never claim delivery or stock restoration", async () => {
  const statuses = [
    ["final_mile_ready", [event("returned_to_dispatch", 20)], "returned_to_dispatch"],
    ["final_mile", [event("delivery_failed", 16)], "delivery_exception"],
    ["final_mile", [event("delivery_failed", 16), event("out_for_delivery", 20)], "out_for_delivery"],
    ["final_mile", [event("returned_toward_store", 18)], "delivery_exception"],
    ["final_mile_ready", [event("shipment_arrived", 18)], "ready_for_delivery"],
    ["completed", [event("delivered", 20)], "delivered"],
  ] as const;
  for (const [status, events, state] of statuses) {
    const x = fixture({ status, events: [...events] });
    const result = await x.service.project("order-customer");
    assert.ok(result);
    assert.equal(result.state, state);
    assert.ok(!JSON.stringify(result).toLowerCase().includes("restock"));
    assert.ok(!JSON.stringify(result).includes("cashCollectedAt"));
  }
  assert.equal(trackingState("ready_for_pickup", "pickup_point", []), "ready_for_pickup");
  assert.equal(trackingState("completed", "pickup_point", ["customer_collected"]), "collected");
});

test("event chronology is deterministic across revisions and repeated arrivals", async () => {
  const x = fixture({
    status: "at_node",
    events: [
      event("shipment_arrived", 30, visible("Second Hub")),
      event("shipment_arrived", 11, visible("First Hub")),
      event("shipment_rerouted", 20),
    ],
    stages: [stage("shipment_arrived", "Reached first hub")],
  });
  const result = await x.service.project("order-customer");
  assert.ok(result);
  assert.deepEqual(result.milestones.map((item) => item.title),
    ["Reached first hub", "Delivery route updated", "Your order reached a delivery facility"]);
  assert.equal(result.milestones[2]?.locationLabel, "Second Hub");
});
