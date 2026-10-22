import { test } from "node:test";
import assert from "node:assert/strict";
import {
  arriveShipmentRequestSchema,
  checkpointShipmentRequestSchema,
  checkoutCompleteRequestSchema,
  checkoutCompleteRestRequestSchema,
  departShipmentRequestSchema,
  planShipmentRequestSchema,
  rerouteShipmentRequestSchema,
  restEndpoints,
  shipmentCustodySchema,
  shipmentEventActorKindSchema,
  shipmentEventViewSchema,
  shipmentLegStatusSchema,
  shipmentLegViewSchema,
  shipmentListResponseSchema,
  shipmentStatusSchema,
  shipmentStopViewSchema,
  shipmentViewSchema,
} from "@variety/contracts";
import { readConfig } from "../src/config";

const baseEnv = () => ({
  DATABASE_URL: "postgresql://lightworld@127.0.0.1:55432/unit_variety_foundation_test",
  WEB_ORIGINS: "http://localhost:3000",
  API_STOCK_LOCATION_ID: "loc_accra",
  API_INSECURE_COOKIES: "true",
});

const deliveryCheckout = (overrides: Record<string, unknown> = {}) => ({
  lines: [{ variantId: "var_rice", quantity: "1" }],
  customerName: "Ama Mensah",
  customerPhone: "+233241234567",
  fulfilment: "delivery",
  zoneId: "zone_accra",
  paymentMethod: "mobile_money",
  idempotencyKey: "checkout-l2-0001",
  ...overrides,
});

test("shipment execution contracts expose the exact protected vocabularies", () => {
  assert.deepEqual(shipmentStatusSchema.options, [
    "planned",
    "active_at_node",
    "in_transit",
    "exception",
    "ready_for_pickup",
    "customer_collected",
    "final_mile_ready",
  ]);
  assert.deepEqual(shipmentLegStatusSchema.options, [
    "planned",
    "ready",
    "in_transit",
    "arrived",
    "exception",
    "superseded",
  ]);
  assert.deepEqual(shipmentCustodySchema.options, [
    "source_staff",
    "node_staff",
    "linehaul_internal",
    "provider",
    "customer",
  ]);
  assert.deepEqual(shipmentEventActorKindSchema.options, ["staff", "rider", "system"]);
});

test("shipment mutation schemas are strict and never accept client-authored custody or route movement truth", () => {
  assert.equal(departShipmentRequestSchema.safeParse({ expectedVersion: 2, handoverReference: "MAN-44", note: "Loaded" }).success, true);
  assert.equal(departShipmentRequestSchema.safeParse({ expectedVersion: 2, nodeId: "node_hub" }).success, false);
  assert.equal(departShipmentRequestSchema.safeParse({ expectedVersion: 2, custody: "provider" }).success, false);

  assert.equal(arriveShipmentRequestSchema.safeParse({ expectedVersion: 3, note: "Received intact" }).success, true);
  assert.equal(arriveShipmentRequestSchema.safeParse({ expectedVersion: 3, destinationNodeId: "node_hub" }).success, false);
  assert.equal(arriveShipmentRequestSchema.safeParse({ expectedVersion: 3, status: "arrived" }).success, false);

  assert.equal(rerouteShipmentRequestSchema.safeParse({ expectedVersion: 4, reason: "Hub unavailable" }).success, true);
  assert.equal(rerouteShipmentRequestSchema.safeParse({ expectedVersion: 4, replacementRuleId: "rule_hidden", reason: "Hub unavailable" }).success, false);
  assert.equal(rerouteShipmentRequestSchema.safeParse({ expectedVersion: 4, reason: "Hub unavailable", stops: [] }).success, false);

  assert.equal(checkpointShipmentRequestSchema.safeParse({ expectedVersion: 5, title: "Checked at transfer desk", detail: "Parcel seal confirmed", note: "Internal note" }).success, true);
  for (const protectedField of ["status", "custody", "paymentStatus", "stockStatus", "proof"]) {
    assert.equal(
      checkpointShipmentRequestSchema.safeParse({ expectedVersion: 5, title: "Checked", [protectedField]: "forged" }).success,
      false,
      `checkpoint must reject ${protectedField}`,
    );
  }

  assert.equal(planShipmentRequestSchema.safeParse({ destinationKind: "doorstep" }).success, true);
  assert.equal(planShipmentRequestSchema.safeParse({ destinationKind: "pickup_point", finalPickupNodeId: "node_pickup", serviceLevel: "standard" }).success, true);
  assert.equal(planShipmentRequestSchema.safeParse({ destinationKind: "pickup_point" }).success, false);
  assert.equal(planShipmentRequestSchema.safeParse({ destinationKind: "doorstep", finalPickupNodeId: "node_pickup" }).success, false);
  assert.equal(planShipmentRequestSchema.safeParse({ destinationKind: "doorstep", routeRuleId: "rule_hidden" }).success, false);
});

test("checkout destination selection defaults to doorstep and enforces fulfilment cross-field rules", () => {
  assert.equal(checkoutCompleteRequestSchema.safeParse(deliveryCheckout()).success, true);
  assert.equal(checkoutCompleteRequestSchema.safeParse(deliveryCheckout({ deliveryDestination: { kind: "doorstep" } })).success, true);
  assert.equal(checkoutCompleteRequestSchema.safeParse(deliveryCheckout({ deliveryDestination: { kind: "pickup_point", finalPickupNodeId: "node_pickup" } })).success, true);
  assert.equal(checkoutCompleteRequestSchema.safeParse(deliveryCheckout({ deliveryDestination: { kind: "pickup_point" } })).success, false);
  assert.equal(checkoutCompleteRequestSchema.safeParse(deliveryCheckout({ deliveryDestination: { kind: "doorstep", finalPickupNodeId: "node_pickup" } })).success, false);
  assert.equal(checkoutCompleteRequestSchema.safeParse(deliveryCheckout({ destinationKind: "pickup_point", finalPickupNodeId: "node_pickup" })).success, false);

  const collection = deliveryCheckout({ fulfilment: "collection", paymentMethod: "cash_counter", zoneId: undefined });
  assert.equal(checkoutCompleteRequestSchema.safeParse(collection).success, true);
  assert.equal(checkoutCompleteRequestSchema.safeParse({ ...collection, deliveryDestination: { kind: "doorstep" } }).success, false);

  const restBody = { ...deliveryCheckout({ deliveryDestination: { kind: "pickup_point", finalPickupNodeId: "node_pickup" } }) };
  delete (restBody as { idempotencyKey?: string }).idempotencyKey;
  assert.equal(checkoutCompleteRestRequestSchema.safeParse(restBody).success, true);
});

test("shipment execution exports stable admin view schemas", () => {
  const stop = {
    id: "stop_1",
    shipmentId: "ship_1",
    routeRevision: 1,
    position: 1,
    nodeId: "node_accra",
    nodeCode: "ACC_HQ",
    nodePublicName: "Accra Fulfilment Centre",
    nodeKind: "fulfilment_center",
    terminalRole: "transit",
  };
  const leg = {
    id: "leg_1",
    shipmentId: "ship_1",
    routeRevision: 1,
    position: 1,
    originStopId: "stop_1",
    destinationStopId: "stop_2",
    laneId: "lane_1",
    laneMode: "linehaul",
    typicalMinutes: 240,
    status: "ready",
    version: 1,
  };
  const event = {
    id: "evt_1",
    shipmentId: "ship_1",
    routeRevision: 1,
    eventKind: "fulfilment_handed_over",
    actorKind: "staff",
    actorId: "staff_1",
    newCustody: "source_staff",
    occurredAt: "2026-10-20T10:00:00Z",
    createdAt: "2026-10-20T10:00:01Z",
  };
  assert.equal(shipmentStopViewSchema.safeParse(stop).success, true);
  assert.equal(shipmentLegViewSchema.safeParse(leg).success, true);
  assert.equal(shipmentEventViewSchema.safeParse(event).success, true);

  const shipment = {
    id: "ship_1",
    orderId: "ord_1",
    orderReference: "VG-1001",
    sequence: 1,
    workflowVersionId: "wf_v1",
    routeRuleId: "rule_1",
    status: "active_at_node",
    originNodeId: "node_accra",
    destinationKind: "doorstep",
    currentRouteRevision: 1,
    currentNodeId: "node_accra",
    custodyState: "source_staff",
    version: 1,
    createdAt: "2026-10-20T09:00:00Z",
    updatedAt: "2026-10-20T10:00:01Z",
    stops: [stop],
    legs: [leg],
    events: [event],
    allowedActions: ["depart", "reroute", "checkpoint"],
  };
  assert.equal(shipmentViewSchema.safeParse(shipment).success, true);
  assert.equal(
    shipmentViewSchema.safeParse({
      ...shipment,
      status: "planned",
      currentNodeId: null,
      custodyState: null,
      activatedAt: null,
      allowedActions: [],
    }).success,
    true,
    "planned pre-handover shipments must not fabricate custody",
  );
  assert.equal(shipmentListResponseSchema.safeParse({ items: [shipment], total: 1, page: 1, pages: 1, perPage: 25 }).success, true);
});

test("shipment execution endpoint registry adds exactly the seven L2 operations", () => {
  const expected = {
    "admin.logistics.shipments": ["GET", "/admin/logistics/shipments"],
    "admin.logistics.shipment": ["GET", "/admin/logistics/shipments/{shipmentId}"],
    "admin.logistics.shipment.plan": ["POST", "/admin/logistics/orders/{orderId}/plan-shipment"],
    "admin.logistics.shipment.depart": ["POST", "/admin/logistics/shipments/{shipmentId}/depart"],
    "admin.logistics.shipment.arrive": ["POST", "/admin/logistics/shipments/{shipmentId}/arrive"],
    "admin.logistics.shipment.reroute": ["POST", "/admin/logistics/shipments/{shipmentId}/reroute"],
    "admin.logistics.shipment.checkpoint": ["POST", "/admin/logistics/shipments/{shipmentId}/checkpoint"],
  } as const;
  for (const [operation, [method, path]] of Object.entries(expected)) {
    assert.equal(restEndpoints[operation]?.method, method, `${operation} method`);
    assert.equal(restEndpoints[operation]?.path, path, `${operation} path`);
  }
  assert.equal(Object.keys(restEndpoints).filter((key) => key.startsWith("admin.logistics.shipment")).length, 7);
});

test("shipment execution rollout switch is default-off and accepts only exact true or false", () => {
  assert.equal(readConfig(baseEnv()).logisticsShipmentExecutionEnabled, false);
  assert.equal(readConfig({ ...baseEnv(), LOGISTICS_SHIPMENT_EXECUTION_ENABLED: "false" }).logisticsShipmentExecutionEnabled, false);
  assert.equal(readConfig({ ...baseEnv(), LOGISTICS_SHIPMENT_EXECUTION_ENABLED: "true" }).logisticsShipmentExecutionEnabled, true);
  for (const invalid of ["TRUE", "1", "yes", "", " false "]) {
    assert.throws(
      () => readConfig({ ...baseEnv(), LOGISTICS_SHIPMENT_EXECUTION_ENABLED: invalid }),
      /LOGISTICS_SHIPMENT_EXECUTION_ENABLED/,
    );
  }
});
