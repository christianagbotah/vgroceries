import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createDeliveryRouteRuleRequestSchema,
  createLogisticsLaneRequestSchema,
  createLogisticsNodeRequestSchema,
  deliveryRouteRuleViewSchema,
  logisticsLaneModeSchema,
  logisticsNodeKindSchema,
  routeDestinationKindSchema,
  routeSimulationRequestSchema,
  routeSimulationResponseSchema,
  routeTerminalRoleSchema,
  workflowEventKindSchema,
  workflowVersionStatusSchema,
  restEndpoints,
} from "@variety/contracts";

const eventKinds = [
  "order_placed",
  "order_confirmed",
  "picking_started",
  "packed",
  "fulfilment_handed_over",
  "shipment_departed",
  "shipment_arrived",
  "shipment_handover",
  "shipment_rerouted",
  "shipment_delayed",
  "ready_for_pickup",
  "customer_collected",
  "rider_assigned",
  "rider_accepted",
  "rider_picked_up",
  "out_for_delivery",
  "delivery_failed",
  "delivery_rescheduled",
  "delivered",
  "returned_toward_store",
  "custom_checkpoint",
] as const;

function pickupRuleInput() {
  return {
    name: "Ashanti pickup route",
    originNodeId: "node_hq",
    deliveryZoneId: "zone_ashanti",
    fulfilment: "delivery",
    destinationKind: "pickup_point",
    finalPickupNodeId: "node_pickup",
    workflowVersionId: "wf_v1",
    priority: 20,
    stops: [
      { position: 1, nodeId: "node_hq", terminalRole: "transit" },
      { position: 2, nodeId: "node_pickup", terminalRole: "customer_pickup" },
    ],
    legs: [{ position: 1, laneId: "lane_1" }],
  } as const;
}

const candidate = {
  ruleId: "rule_1",
  name: "Ashanti pickup route",
  priority: 20,
  workflowVersionId: "wf_v1",
  destinationKind: "pickup_point",
  stops: [
    { position: 1, nodeId: "node_hq", nodeCode: "ACC_HQ", nodePublicName: "Accra Head Office", terminalRole: "transit" },
    { position: 2, nodeId: "node_pickup", nodeCode: "KSI_PICKUP", nodePublicName: "Kumasi Pickup Centre", terminalRole: "customer_pickup" },
  ],
  legs: [
    {
      position: 1,
      laneId: "lane_1",
      mode: "linehaul",
      originNodeId: "node_hq",
      destinationNodeId: "node_pickup",
    },
  ],
} as const;

test("logistics contract accepts canonical configuration", () => {
  assert.deepEqual(logisticsNodeKindSchema.options, [
    "head_office",
    "warehouse",
    "fulfilment_center",
    "hub",
    "outlet",
    "pickup_point",
    "cross_dock",
    "partner_facility",
    "other",
  ]);
  assert.deepEqual(logisticsLaneModeSchema.options, [
    "internal_transfer",
    "linehaul",
    "third_party",
    "customer_pickup",
    "last_mile",
  ]);
  assert.deepEqual(workflowVersionStatusSchema.options, ["draft", "published", "retired"]);
  assert.deepEqual(routeDestinationKindSchema.options, ["doorstep", "pickup_point"]);
  assert.deepEqual(routeTerminalRoleSchema.options, ["transit", "customer_pickup", "final_mile_dispatch"]);
  assert.deepEqual(workflowEventKindSchema.options, [...eventKinds]);

  assert.equal(
    createLogisticsNodeRequestSchema.safeParse({
      code: "ACC_HQ",
      name: "Accra Head Office",
      publicName: "Accra Head Office",
      kind: "head_office",
      customerVisible: true,
      active: true,
    }).success,
    true,
  );
  assert.equal(
    createLogisticsLaneRequestSchema.safeParse({
      originNodeId: "node_hq",
      destinationNodeId: "node_pickup",
      mode: "linehaul",
      typicalMinutes: 240,
      serviceDays: [1, 2, 3, 4, 5, 6, 7],
      priority: 0,
      active: true,
    }).success,
    true,
  );
  assert.equal(createDeliveryRouteRuleRequestSchema.safeParse(pickupRuleInput()).success, true);

  const requiredMappings = {
    "admin.logistics.nodes": ["GET", "/admin/logistics/nodes"],
    "admin.logistics.node": ["GET", "/admin/logistics/nodes/{nodeId}"],
    "admin.logistics.node.create": ["POST", "/admin/logistics/nodes"],
    "admin.logistics.node.update": ["POST", "/admin/logistics/nodes/{nodeId}"],
    "admin.logistics.lanes": ["GET", "/admin/logistics/lanes"],
    "admin.logistics.lane": ["GET", "/admin/logistics/lanes/{laneId}"],
    "admin.logistics.lane.create": ["POST", "/admin/logistics/lanes"],
    "admin.logistics.lane.update": ["POST", "/admin/logistics/lanes/{laneId}"],
    "admin.logistics.workflows": ["GET", "/admin/logistics/workflows"],
    "admin.logistics.workflow": ["GET", "/admin/logistics/workflows/{templateId}"],
    "admin.logistics.workflow.create": ["POST", "/admin/logistics/workflows"],
    "admin.logistics.workflow.draft": ["POST", "/admin/logistics/workflows/{templateId}/drafts"],
    "admin.logistics.workflow.save": ["POST", "/admin/logistics/workflows/{templateId}/versions/{versionId}"],
    "admin.logistics.workflow.publish": ["POST", "/admin/logistics/workflows/{templateId}/publish"],
    "admin.logistics.route-rules": ["GET", "/admin/logistics/route-rules"],
    "admin.logistics.route-rule": ["GET", "/admin/logistics/route-rules/{ruleId}"],
    "admin.logistics.route-rule.create": ["POST", "/admin/logistics/route-rules"],
    "admin.logistics.route-rule.update": ["POST", "/admin/logistics/route-rules/{ruleId}"],
    "admin.logistics.route-rule.activate": ["POST", "/admin/logistics/route-rules/{ruleId}/activate"],
    "admin.logistics.route-rule.simulate": ["POST", "/admin/logistics/route-rules/simulate"],
  } as const;
  for (const [operation, [method, path]] of Object.entries(requiredMappings)) {
    assert.equal(restEndpoints[operation]?.method, method, `${operation} method`);
    assert.equal(restEndpoints[operation]?.path, path, `${operation} path`);
  }
});

test("logistics contract rejects invented authority states", () => {
  assert.equal(workflowEventKindSchema.safeParse("payment_received").success, false);
  assert.equal(workflowEventKindSchema.safeParse("stock_restocked").success, false);
  assert.equal(logisticsNodeKindSchema.safeParse("regional").success, false);

  for (const bad of [
    { code: "", name: "HQ", publicName: "HQ", kind: "head_office" },
    { code: "HQ", name: "", publicName: "HQ", kind: "head_office" },
    { code: "HQ", name: "HQ", publicName: "", kind: "head_office" },
  ]) {
    assert.equal(createLogisticsNodeRequestSchema.safeParse(bad).success, false);
  }

  for (const typicalMinutes of [0, -1]) {
    assert.equal(
      createLogisticsLaneRequestSchema.safeParse({
        originNodeId: "a",
        destinationNodeId: "b",
        mode: "linehaul",
        typicalMinutes,
        priority: 0,
      }).success,
      false,
    );
  }

  const missingPickup = { ...pickupRuleInput() } as Record<string, unknown>;
  delete missingPickup.finalPickupNodeId;
  assert.equal(createDeliveryRouteRuleRequestSchema.safeParse(missingPickup).success, false);

  const badStop = pickupRuleInput();
  assert.equal(
    createDeliveryRouteRuleRequestSchema.safeParse({
      ...badStop,
      stops: [{ ...badStop.stops[0], position: 0 }, badStop.stops[1]],
    }).success,
    false,
  );

  assert.equal(
    deliveryRouteRuleViewSchema.safeParse({
      id: "rule",
      ...pickupRuleInput(),
      active: true,
      version: 1,
      createdBy: "admin",
      createdAt: "2026-10-17T10:00:00Z",
      updatedAt: "2026-10-17T10:00:00Z",
      paymentStatus: "succeeded",
    }).success,
    false,
  );
});

test("route simulation contract distinguishes matched no-match ambiguous", () => {
  assert.equal(
    routeSimulationRequestSchema.safeParse({
      originNodeId: "node_hq",
      fulfilment: "delivery",
      deliveryZoneId: "zone_ashanti",
      destinationKind: "pickup_point",
      finalPickupNodeId: "node_pickup",
    }).success,
    true,
  );
  assert.equal(
    routeSimulationRequestSchema.safeParse({
      originNodeId: "node_hq",
      fulfilment: "delivery",
      deliveryZoneId: "zone_ashanti",
      destinationKind: "pickup_point",
    }).success,
    false,
  );

  assert.equal(routeSimulationResponseSchema.safeParse({ status: "matched", selectedRule: candidate, candidates: [candidate] }).success, true);
  assert.equal(routeSimulationResponseSchema.safeParse({ status: "no_match", candidates: [] }).success, true);
  assert.equal(routeSimulationResponseSchema.safeParse({ status: "ambiguous", candidates: [candidate, { ...candidate, ruleId: "rule_2", name: "Other route" }] }).success, true);
  assert.equal(routeSimulationResponseSchema.safeParse({ status: "matched", candidates: [candidate] }).success, false);
  assert.equal(routeSimulationResponseSchema.safeParse({ status: "no_match", selectedRule: candidate, candidates: [candidate] }).success, false);
  assert.equal(routeSimulationResponseSchema.safeParse({ status: "ambiguous", candidates: [candidate] }).success, false);
});
