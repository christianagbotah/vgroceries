import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import type { INestApplication } from "@nestjs/common";
import { createApplication } from "../src/bootstrap";

let app: INestApplication;
let document: any;
const security = [{ cookieAuth: [] }, { bearerAuth: [] }];
const paths = {
  list: "/api/v1/admin/logistics/shipments",
  detail: "/api/v1/admin/logistics/shipments/{shipmentId}",
  plan: "/api/v1/admin/logistics/orders/{orderId}/plan",
  depart: "/api/v1/admin/logistics/shipments/{shipmentId}/depart",
  arrive: "/api/v1/admin/logistics/shipments/{shipmentId}/arrive",
  reroute: "/api/v1/admin/logistics/shipments/{shipmentId}/reroute",
  checkpoint: "/api/v1/admin/logistics/shipments/{shipmentId}/checkpoints",
  collect: "/api/v1/admin/logistics/shipments/{shipmentId}/collect",
} as const;

before(async()=>{ app=await createApplication(); await app.listen(0,"127.0.0.1"); document=await (await fetch((await app.getUrl())+"/api/v1/openapi.json")).json(); });
after(async()=>{ await app.close(); });
const parameter=(op:any,name:string)=>(op.parameters??[]).find((entry:any)=>entry.name===name);
const requestRef=(op:any)=>op.requestBody?.content?.["application/json"]?.schema?.$ref;
const assertAdmin=(op:any)=>{ assert.deepEqual(op.security,security); assert.match(String(op.description).toLowerCase(),/admin/); };
const assertMutation=(op:any)=>{ assertAdmin(op); assert.equal(parameter(op,"Idempotency-Key")?.required,true); assert.ok(parameter(op,"X-CSRF-Token")); };

test("production OpenAPI publishes exactly eight L2 shipment and pickup collection authority paths on a 149-path surface",()=>{
  assert.equal(Object.keys(document.paths).length,149);
  for(const path of Object.values(paths)) assert.ok(document.paths[path],`missing ${path}`);
  for(const absent of ["/api/v1/shipments","/api/v1/shipments/{shipmentId}","/api/v1/admin/logistics/notifications","/api/v1/admin/logistics/courier-webhooks","/api/v1/cod/remittances","/api/v1/returns","/api/v1/pos"]) assert.equal(document.paths[absent],undefined,`unexpected later-wave authority ${absent}`);
});

test("shipment reads are admin-authenticated and mutations publish replay plus CSRF boundaries",()=>{
  assertAdmin(document.paths[paths.list].get); assertAdmin(document.paths[paths.detail].get);
  assert.equal(parameter(document.paths[paths.list].get,"Idempotency-Key"),undefined);
  for(const path of [paths.plan,paths.depart,paths.arrive,paths.reroute,paths.checkpoint,paths.collect]) assertMutation(document.paths[path].post);
  assert.equal(requestRef(document.paths[paths.plan].post),"#/components/schemas/PlanShipmentRequest");
  assert.equal(requestRef(document.paths[paths.depart].post),"#/components/schemas/ShipmentDepartRequest");
  assert.equal(requestRef(document.paths[paths.arrive].post),"#/components/schemas/ShipmentArriveRequest");
  assert.equal(requestRef(document.paths[paths.reroute].post),"#/components/schemas/ShipmentRerouteRequest");
  assert.equal(requestRef(document.paths[paths.checkpoint].post),"#/components/schemas/ShipmentCheckpointRequest");
  assert.equal(requestRef(document.paths[paths.collect].post),"#/components/schemas/PickupCollectRequest");
  assert.deepEqual(document.paths[paths.collect].post.responses["200"].content["application/json"].schema, {$ref:"#/components/schemas/PickupCollectResponseEnvelope"});
});

test("shipment OpenAPI schemas stay strict and do not publish financial or L3 notification authority",()=>{
  for(const name of ["PlanShipmentRequest","ShipmentDepartRequest","ShipmentArriveRequest","ShipmentRerouteRequest","ShipmentCheckpointRequest","ShipmentListResponseEnvelope","ShipmentDetailViewEnvelope","ShipmentActionResponseEnvelope"]) assert.ok(document.components.schemas[name],`missing schema ${name}`);
  for(const name of ["PlanShipmentRequest","ShipmentDepartRequest","ShipmentArriveRequest","ShipmentRerouteRequest","ShipmentCheckpointRequest"]) assert.equal(document.components.schemas[name].additionalProperties,false,`${name} must be strict`);
  const text=JSON.stringify(Object.fromEntries(Object.entries(document.paths).filter(([path])=>path.includes("/admin/logistics/shipments")||path.includes("/admin/logistics/orders/")))).toLowerCase();
  for(const forbidden of ["cashcollectedat","remittedat","stockdepletion","cardnumber","providerwebhook","notificationdelivery"]) assert.equal(text.includes(forbidden),false,`forbidden authority ${forbidden}`);
  assert.match(String(document.info.description).toLowerCase(),/shipment execution/);
  assert.match(String(document.info.description).toLowerCase(),/tracking|notification/);
});
