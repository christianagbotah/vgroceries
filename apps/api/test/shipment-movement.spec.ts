import { after, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import type { INestApplication } from "@nestjs/common";
import { createApplication } from "../src/bootstrap";
import { readConfig } from "../src/config";
import { Database } from "../src/database/database";
import { ShipmentExecutionService } from "../src/logistics/shipment-execution.service";
import { seedCommerceFixtures } from "./commerce-fixtures";

let app: INestApplication; let db: Database; let execution: ShipmentExecutionService;
const config = () => readConfig({
  DATABASE_URL: process.env.DATABASE_URL!, WEB_ORIGINS: "http://localhost:3000", API_STOCK_LOCATION_ID: "loc_accra", API_INSECURE_COOKIES: "true",
  COMMERCE_LOCATION_ID: "loc_accra", CHECKOUT_PAYMENT_HOLD_MINUTES: "15", CHECKOUT_OFFLINE_HOLD_MINUTES: "1440", GUEST_CHECKOUT_TTL_MINUTES: "1440",
  ORDER_VERIFICATION_ACTIVE_VERSION: "1", ORDER_VERIFICATION_KEYS: JSON.stringify({ 1: "11".repeat(32) }), LOGISTICS_SHIPMENT_EXECUTION_ENABLED: "true",
});

async function topology(tag: string, terminalRole: "final_mile_dispatch"|"customer_pickup" = "final_mile_dispatch") {
  const source = await db.logisticsNode.create({ data: { code: `MOV_SRC_${tag}`, name: "Movement source", publicName: "Movement source", kind: "fulfilment_center", inventoryLocationId: "loc_accra", active: true } });
  const hub = await db.logisticsNode.create({ data: { code: `MOV_HUB_${tag}`, name: "Movement hub", publicName: "Movement hub", kind: "hub", active: true } });
  const terminal = await db.logisticsNode.create({ data: { code: `MOV_TERM_${tag}`, name: "Movement terminal", publicName: "Movement terminal", kind: terminalRole === "customer_pickup" ? "pickup_point" : "hub", active: true } });
  const lane1 = await db.logisticsLane.create({ data: { originNodeId: source.id, destinationNodeId: hub.id, mode: "linehaul", typicalMinutes: 90, serviceDays: [], priority: 0, active: true } });
  const lane2 = await db.logisticsLane.create({ data: { originNodeId: hub.id, destinationNodeId: terminal.id, mode: "third_party", providerKey: "fixture-carrier", typicalMinutes: 60, serviceDays: [], priority: 0, active: true } });
  const template = await db.deliveryWorkflowTemplate.create({ data: { name: `Movement workflow ${tag}`, description: "", active: true } });
  const version = await db.deliveryWorkflowVersion.create({ data: { templateId: template.id, versionNumber: 1, status: "published", revision: 1, createdBy: "admin-commerce", publishedBy: "admin-commerce", publishedAt: new Date() } });
  const rule = await db.deliveryRouteRule.create({ data: { name: `Movement route ${tag}`, originNodeId: source.id, deliveryZoneId: "zone-required", fulfilment: "delivery", destinationKind: terminalRole === "customer_pickup" ? "pickup_point" : "doorstep", finalPickupNodeId: terminalRole === "customer_pickup" ? terminal.id : null, workflowVersionId: version.id, priority: 1, active: true, createdBy: "admin-commerce" } });
  const order = await db.order.create({ data: { reference: `VG-MOV-${tag}`, customerUserId: "customer-a", customerName: "Ama", customerPhone: "+233241111111", fulfilment: "delivery", zoneId: "zone-required", paymentMethod: "cash_on_delivery", paymentStatus: "unpaid", fulfilmentStatus: "dispatched", deliveryStatus: "unassigned", subtotalMinor: 1000, deliveryFeeMinor: 1200, totalMinor: 2200, verificationKeyVersion: 1, verificationCodeHash: "f".repeat(64) } });
  const shipment = await db.shipment.create({ data: { orderId: order.id, sequence: 1, workflowVersionId: version.id, routeRuleId: rule.id, routeRevision: 1, status: "at_node", originNodeId: source.id, destinationKind: terminalRole === "customer_pickup" ? "pickup_point" : "doorstep", finalPickupNodeId: terminalRole === "customer_pickup" ? terminal.id : null, ...(terminalRole === "final_mile_dispatch" ? { destinationAddress: { recipientName: "Ama", locality: "Labone", street: "A Street" } } : {}), currentNodeId: source.id, custody: "source_staff", activatedAt: new Date(), version: 2 } });
  const s1 = await db.shipmentStop.create({ data: { shipmentId: shipment.id, routeRevision: 1, position: 1, nodeId: source.id, nodeCode: source.code, nodePublicName: source.publicName, nodeKind: source.kind, nodeKindLabel: source.kindLabel, terminalRole: "transit" } });
  const s2 = await db.shipmentStop.create({ data: { shipmentId: shipment.id, routeRevision: 1, position: 2, nodeId: hub.id, nodeCode: hub.code, nodePublicName: hub.publicName, nodeKind: hub.kind, nodeKindLabel: hub.kindLabel, terminalRole: "transit" } });
  const s3 = await db.shipmentStop.create({ data: { shipmentId: shipment.id, routeRevision: 1, position: 3, nodeId: terminal.id, nodeCode: terminal.code, nodePublicName: terminal.publicName, nodeKind: terminal.kind, nodeKindLabel: terminal.kindLabel, terminalRole } });
  const l1 = await db.shipmentLeg.create({ data: { shipmentId: shipment.id, routeRevision: 1, position: 1, originStopId: s1.id, destinationStopId: s2.id, laneId: lane1.id, mode: lane1.mode, typicalMinutes: lane1.typicalMinutes, status: "ready", version: 2 } });
  const l2 = await db.shipmentLeg.create({ data: { shipmentId: shipment.id, routeRevision: 1, position: 2, originStopId: s2.id, destinationStopId: s3.id, laneId: lane2.id, mode: lane2.mode, providerKey: lane2.providerKey, typicalMinutes: lane2.typicalMinutes, status: "planned", version: 1 } });
  return { order, shipment, source, hub, terminal, l1, l2 };
}

before(async()=>{ if(!new URL(process.env.DATABASE_URL!).pathname.endsWith("variety_foundation_test")) throw Error("isolated database required"); app=await createApplication(config()); db=app.get(Database); execution=app.get(ShipmentExecutionService); });
beforeEach(async()=>{ await seedCommerceFixtures(db); }); after(async()=>{await app.close();});

test("depart advances the exact ready leg once, derives linehaul custody, and replay is stable", async()=>{
  const x=await topology("DEP"); const stockBefore=await db.stockLot.findUniqueOrThrow({where:{id:"lot-rice"}});
  const first=await execution.depart(x.shipment.id,"admin-commerce","move-depart-1",{note:"loaded"},"req-move-depart-1");
  const replay=await execution.depart(x.shipment.id,"admin-commerce","move-depart-1",{note:"loaded"},"req-move-depart-replay");
  assert.deepEqual(replay,first); assert.equal(first.status,"in_transit"); assert.equal(first.currentNodeId,null); assert.equal(first.currentLegId,x.l1.id); assert.equal(first.custody,"linehaul_internal");
  const leg=await db.shipmentLeg.findUniqueOrThrow({where:{id:x.l1.id}}); assert.equal(leg.status,"in_transit"); assert.ok(leg.departedAt);
  assert.equal(await db.shipmentEvent.count({where:{shipmentId:x.shipment.id,eventKind:"shipment_departed"}}),1);
  assert.equal(await db.auditEvent.count({where:{entityId:x.shipment.id,action:"logistics.shipment.departed"}}),1);
  assert.equal(await db.outboxEvent.count({where:{aggregateId:x.shipment.id,type:"logistics.shipment.departed"}}),1);
  assert.equal((await db.stockLot.findUniqueOrThrow({where:{id:"lot-rice"}})).quantity.toString(),stockBefore.quantity.toString());
  assert.equal(await db.paymentAttempt.count({where:{orderId:x.order.id}}),0);
  await assert.rejects(()=>execution.depart(x.shipment.id,"admin-commerce","move-depart-1",{note:"changed"},"req-changed"),(e:any)=>e?.getStatus?.()===409);
});

test("depart rejects the wrong state or a non-origin current node without side effects", async()=>{
  const x=await topology("BADDEP"); await db.shipment.update({where:{id:x.shipment.id},data:{currentNodeId:x.hub.id}});
  await assert.rejects(()=>execution.depart(x.shipment.id,"admin-commerce","bad-depart",{},"req-bad-depart"));
  assert.equal(await db.shipmentEvent.count({where:{shipmentId:x.shipment.id,eventKind:"shipment_departed"}}),0);
});

test("arrive completes the active leg, makes the next leg ready, and final arrival becomes final-mile-ready", async()=>{
  const x=await topology("ARR"); await execution.depart(x.shipment.id,"admin-commerce","arr-depart-1",{},"req-arr-depart-1");
  const atHub=await execution.arrive(x.shipment.id,"admin-commerce","arr-arrive-1",{note:"hub scan"},"req-arr-arrive-1");
  assert.equal(atHub.status,"at_node"); assert.equal(atHub.currentNodeId,x.hub.id); assert.equal(atHub.currentLegId,null); assert.equal(atHub.custody,"node_staff");
  assert.equal((await db.shipmentLeg.findUniqueOrThrow({where:{id:x.l2.id}})).status,"ready");
  await execution.depart(x.shipment.id,"admin-commerce","arr-depart-2",{},"req-arr-depart-2");
  const final=await execution.arrive(x.shipment.id,"admin-commerce","arr-arrive-2",{},"req-arr-arrive-2");
  assert.equal(final.status,"final_mile_ready"); assert.equal(final.currentNodeId,x.terminal.id); assert.equal(final.custody,"node_staff");
  assert.equal(await db.shipmentEvent.count({where:{shipmentId:x.shipment.id,eventKind:"shipment_arrived"}}),2);
});

test("pickup terminal arrival becomes ready-for-pickup and wrong-leg/skipped arrival is rejected", async()=>{
  const x=await topology("PICK","customer_pickup");
  await assert.rejects(()=>execution.arrive(x.shipment.id,"admin-commerce","skip-arrive",{},"req-skip"));
  await execution.depart(x.shipment.id,"admin-commerce","pick-dep1",{},"req-pick-dep1"); await execution.arrive(x.shipment.id,"admin-commerce","pick-arr1",{},"req-pick-arr1");
  await execution.depart(x.shipment.id,"admin-commerce","pick-dep2",{},"req-pick-dep2"); const final=await execution.arrive(x.shipment.id,"admin-commerce","pick-arr2",{},"req-pick-arr2");
  assert.equal(final.status,"ready_for_pickup"); assert.equal(final.currentNodeId,x.terminal.id);
});

test("custom checkpoint is append-only informational evidence and changes no shipment projection", async()=>{
  const x=await topology("CHK"); const before=await db.shipment.findUniqueOrThrow({where:{id:x.shipment.id}});
  const out=await execution.checkpoint(x.shipment.id,"admin-commerce","checkpoint-1",{title:"Security scan",detail:"Seal intact"},"req-checkpoint-1");
  const afterRow=await db.shipment.findUniqueOrThrow({where:{id:x.shipment.id}});
  for(const k of ["status","currentNodeId","currentLegId","custody","version"] as const) assert.deepEqual(afterRow[k],before[k]);
  assert.equal(out.status,before.status); const event=await db.shipmentEvent.findFirstOrThrow({where:{shipmentId:x.shipment.id,eventKind:"custom_checkpoint"}}); assert.equal(event.customerTitle,"Security scan"); assert.equal(event.customerDetail,"Seal intact");
});
