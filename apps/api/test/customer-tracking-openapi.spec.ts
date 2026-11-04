import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const doc = JSON.parse(readFileSync(resolve(process.cwd(), "../../docs/openapi-foundation.json"), "utf8"));

test("L3 enriches both existing secure order endpoints without adding a public route", () => {
  assert.equal(Object.keys(doc.paths).length, 113);
  const track = doc.paths["/api/v1/orders/track"].post;
  const detail = doc.paths["/api/v1/orders/{orderId}"].get;
  assert.deepEqual(track.responses["200"].content["application/json"].schema, { $ref: "#/components/schemas/PublicOrderEnvelope" });
  assert.deepEqual(detail.responses["200"].content["application/json"].schema, { $ref: "#/components/schemas/PublicOrderEnvelope" });
  assert.deepEqual(track.security, []);
  assert.deepEqual(detail.security, [{ cookieAuth: [] }, { bearerAuth: [] }, { guestAuth: [] }]);
});

test("L3 published shape is strict and has no operational IDs, GPS, ETA or money mutation fields", () => {
  const order = doc.components.schemas.PublicOrder;
  const journey = order.properties.trackingJourney;
  assert.ok(journey);
  assert.equal(journey.additionalProperties, false);
  assert.ok(journey.required.includes("headline"));
  assert.ok(journey.required.includes("milestones"));
  const milestone = journey.properties.milestones.items;
  assert.equal(milestone.additionalProperties, false);
  assert.deepEqual(journey.properties.state.enum, [
    "preparing", "at_facility", "in_transit", "ready_for_delivery", "out_for_delivery",
    "delivery_exception", "ready_for_pickup", "delivered", "collected", "returned_to_dispatch",
  ]);
  const published = JSON.stringify(journey);
  for (const privateField of [
    "nodeId", "routeRuleId", "routeRevision", "workflowVersionId", "laneId", "custody",
    "actorId", "requestId", "safeMetadata", "cashCollectedAt", "stockConsumedAt", "latitude", "longitude", "eta",
  ]) assert.ok(!published.includes('"' + privateField + '"'), "must omit " + privateField);
});
