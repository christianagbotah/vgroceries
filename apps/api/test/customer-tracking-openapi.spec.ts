import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const doc = JSON.parse(readFileSync(resolve(process.cwd(), "../../docs/openapi-foundation.json"), "utf8"));

test("L3 enriches both existing secure order endpoints without adding a public route", () => {
  assert.equal(Object.keys(doc.paths).length, 123);
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

test("appointment routes use strict owned-customer/guest or administrator security with replay controls",()=>{
  const read=doc.paths["/api/v1/orders/{orderId}/pickup-appointments"].get;
  const write=doc.paths["/api/v1/orders/{orderId}/pickup-appointments"].post;
  const cancel=doc.paths["/api/v1/orders/{orderId}/pickup-appointments/cancel"].post;
  const admin=doc.paths["/api/v1/admin/logistics/nodes/{nodeId}/pickup-appointment-policy"];
  const customerSecurity=[{cookieAuth:[]},{bearerAuth:[]},{guestAuth:[]}];
  assert.deepEqual(read.security,customerSecurity);
  assert.deepEqual(write.security,customerSecurity);
  assert.deepEqual(cancel.security,customerSecurity);
  assert.deepEqual(admin.get.security,[{cookieAuth:[]},{bearerAuth:[]}]);
  assert.deepEqual(admin.post.security,[{cookieAuth:[]},{bearerAuth:[]}]);
  for(const operation of [write,cancel,admin.post]){
    assert.ok(operation.parameters.some((p:any)=>p.name==="Idempotency-Key"&&p.required));
    assert.ok(operation.parameters.some((p:any)=>p.name==="X-CSRF-Token"));
  }
  assert.deepEqual(write.requestBody.content["application/json"].schema,
    {$ref:"#/components/schemas/BookPickupAppointmentRequest"});
  assert.deepEqual(cancel.requestBody.content["application/json"].schema,
    {$ref:"#/components/schemas/CancelPickupAppointmentRequest"});
  assert.deepEqual(admin.post.requestBody.content["application/json"].schema,
    {$ref:"#/components/schemas/PickupAppointmentPolicyInput"});
  assert.deepEqual(read.responses["200"].content["application/json"].schema,
    {$ref:"#/components/schemas/PickupAppointmentOptionsEnvelope"});
  const surface=JSON.stringify(doc.components.schemas.PickupAppointmentOptions);
  for(const sensitive of ["paymentAttemptId","receiptId","staffActorId","verificationCode","customerUserId"])
    assert.ok(!surface.includes('"'+sensitive+'"'));
});

test("pickup calendar closure endpoints are administrator-only, strict, replay-protected and have no customer authority",()=>{
  const path=doc.paths["/api/v1/admin/logistics/nodes/{nodeId}/pickup-closures"];
  assert.ok(path);
  for(const operation of [path.get,path.post]){
    assert.deepEqual(operation.security,[{cookieAuth:[]},{bearerAuth:[]}]);
    assert.ok(operation.parameters.some((parameter:any)=>parameter.name==="nodeId"&&parameter.required));
  }
  assert.ok(path.post.parameters.some((parameter:any)=>parameter.name==="Idempotency-Key"&&parameter.required));
  assert.ok(path.post.parameters.some((parameter:any)=>parameter.name==="X-CSRF-Token"));
  assert.deepEqual(path.get.responses["200"].content["application/json"].schema,
    {$ref:"#/components/schemas/PickupCentreClosureListEnvelope"});
  assert.deepEqual(path.post.requestBody.content["application/json"].schema,
    {$ref:"#/components/schemas/PickupCentreClosureInput"});
  const serialized=JSON.stringify(doc.components.schemas.PickupCentreClosureView);
  for(const secret of ["updatedBy","customerUserId","customerPhone","orderId","actorId","paymentStatus"])
    assert.ok(!serialized.includes('"'+secret+'"'));
});

test("Physical Returns R1 publishes admin-only replay-protected receipts and inspection, without refund or stock writes",()=>{
  for(const path of ["/api/v1/admin/physical-returns",
    "/api/v1/admin/physical-returns/{returnId}",
    "/api/v1/admin/physical-returns/{returnId}/inspect"]){
    assert.ok(doc.paths[path],`missing physical-return authority path ${path}`);
  }
  const root=doc.paths["/api/v1/admin/physical-returns"];
  assert.deepEqual(root.get.security,[{cookieAuth:[]},{bearerAuth:[]}]);
  assert.deepEqual(root.post.security,[{cookieAuth:[]},{bearerAuth:[]}]);
  for(const op of [root.post,doc.paths["/api/v1/admin/physical-returns/{returnId}/inspect"].post]){
    assert.ok(op.parameters.some((x:any)=>x.name==="Idempotency-Key"&&x.required));
    assert.ok(op.parameters.some((x:any)=>x.name==="X-CSRF-Token"));
    assert.ok(/no|without/i.test(op.description));
  }
  assert.deepEqual(root.post.requestBody.content["application/json"].schema,
    {$ref:"#/components/schemas/PhysicalReturnReceive"});
  assert.deepEqual(doc.paths["/api/v1/admin/physical-returns/{returnId}/inspect"].post.requestBody.content["application/json"].schema,
    {$ref:"#/components/schemas/PhysicalReturnInspect"});
  const view=JSON.stringify(doc.components.schemas.PhysicalReturnView);
  for(const secret of ["customerPhone","verificationCode","merchantReference","paymentAttemptId","cashCollectedAt"])
    assert.ok(!view.includes('"'+secret+'"'));
});
