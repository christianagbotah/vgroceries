import { after, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import type { INestApplication } from "@nestjs/common";
import { createApplication } from "../src/bootstrap";
import { readConfig } from "../src/config";
import { Database } from "../src/database/database";
import { DispatchCommandService } from "../src/dispatch/dispatch-command.service";
import { DispatchQueryService } from "../src/dispatch/dispatch-query.service";
import { RiderCommandService } from "../src/dispatch/rider-command.service";
import { ShipmentExecutionService } from "../src/logistics/shipment-execution.service";
import { seedCommerceFixtures } from "./commerce-fixtures";

let app: INestApplication;
let db: Database;
let dispatch: DispatchCommandService;
let queries: DispatchQueryService;
let riders: RiderCommandService;
let movement: ShipmentExecutionService;

const config = () => readConfig({
  DATABASE_URL: process.env.DATABASE_URL!, WEB_ORIGINS: "http://localhost:3000",
  API_STOCK_LOCATION_ID: "loc_accra", API_INSECURE_COOKIES: "true",
  COMMERCE_LOCATION_ID: "loc_accra", CHECKOUT_PAYMENT_HOLD_MINUTES: "15",
  CHECKOUT_OFFLINE_HOLD_MINUTES: "1440", GUEST_CHECKOUT_TTL_MINUTES: "1440",
  ORDER_VERIFICATION_ACTIVE_VERSION: "1", ORDER_VERIFICATION_KEYS: JSON.stringify({ 1: "11".repeat(32) }),
  LOGISTICS_SHIPMENT_EXECUTION_ENABLED: "true",
});
const ctx = (key: string) => ({ actorId: "admin-commerce", requestId: `req-${key}`, idempotencyKey: key });
const riderCtx = (key: string) => ({ requestId: `req-${key}`, idempotencyKey: key });

async function rider(tag: string) {
  const user = await db.user.create({ data: { email: `shipment-rider-${tag}@example.test`, name: `Shipment Rider ${tag}`, passwordHash: "x", role: "rider" } });
  const profile = await db.riderProfile.create({ data: { userId: user.id, phone: `+23324${String(tag.length).padStart(7,"0")}`, kind: "in_house", vehicle: "motorcycle", availabilityState: "available", lastAvailabilityChangedAt: new Date() } });
  return { user, profile };
}

async function handedOrder(ref: string) {
  const now = new Date();
  const order = await db.order.create({ data: {
    reference: ref, customerUserId: "customer-a", customerName: "Ama Customer", customerPhone: "+233241111111",
    fulfilment: "delivery", zoneId: "zone-required", paymentMethod: "cash_on_delivery", paymentStatus: "unpaid",
    fulfilmentStatus: "dispatched", deliveryStatus: "unassigned", subtotalMinor: 1000, deliveryFeeMinor: 100, totalMinor: 1100,
    verificationKeyVersion: 1, verificationCodeHash: "d".repeat(64), stockConsumedAt: now,
  } });
  await db.fulfilmentRun.create({ data: { orderId: order.id, locationId: "loc_accra", confirmedBy: "admin-commerce", confirmedAt: now, handedOverBy: "admin-commerce", handedOverAt: now, handoverKind: "dispatch" } });
  return order;
}

async function routeAuthority(tag: string, mode: "direct" | "linehaul") {
  const source = await db.logisticsNode.create({ data: { code: `FM_SRC_${tag}`, name: "Final-mile source", publicName: "Final-mile source", kind: "fulfilment_center", active: true } });
  const terminal = mode === "direct" ? source : await db.logisticsNode.create({ data: { code: `FM_TERM_${tag}`, name: "Final-mile hub", publicName: "Final-mile hub", kind: "hub", active: true } });
  const template = await db.deliveryWorkflowTemplate.create({ data: { name: `Final-mile workflow ${tag}`, description: "", active: true } });
  const version = await db.deliveryWorkflowVersion.create({ data: { templateId: template.id, versionNumber: 1, status: "published", revision: 1, createdBy: "admin-commerce", publishedBy: "admin-commerce", publishedAt: new Date() } });
  const rule = await db.deliveryRouteRule.create({ data: { name: `Final-mile route ${tag}`, originNodeId: source.id, deliveryZoneId: "zone-required", fulfilment: "delivery", destinationKind: "doorstep", workflowVersionId: version.id, priority: 1, active: true, createdBy: "admin-commerce" } });
  const lane = mode === "linehaul" ? await db.logisticsLane.create({ data: { originNodeId: source.id, destinationNodeId: terminal.id, mode: "linehaul", typicalMinutes: 30, serviceDays: [], priority: 0, active: true } }) : null;
  return { source, terminal, version, rule, lane };
}

async function finalReadyShipment(orderId: string, tag: string) {
  const a = await routeAuthority(tag, "direct");
  const shipment = await db.shipment.create({ data: {
    orderId, sequence: 1, workflowVersionId: a.version.id, routeRuleId: a.rule.id, routeRevision: 1,
    status: "final_mile_ready", originNodeId: a.source.id, destinationKind: "doorstep",
    destinationAddress: { recipientName: "Ama Customer", locality: "Labone", street: "A Street" },
    currentNodeId: a.source.id, custody: "source_staff", activatedAt: new Date(), version: 2,
  } });
  await db.shipmentStop.create({ data: { shipmentId: shipment.id, routeRevision: 1, position: 1, nodeId: a.source.id, nodeCode: a.source.code, nodePublicName: a.source.publicName, nodeKind: a.source.kind, nodeKindLabel: a.source.kindLabel, terminalRole: "final_mile_dispatch" } });
  return shipment;
}

async function inTransitShipment(orderId: string, tag: string) {
  const a = await routeAuthority(tag, "linehaul");
  const shipment = await db.shipment.create({ data: {
    orderId, sequence: 1, workflowVersionId: a.version.id, routeRuleId: a.rule.id, routeRevision: 1,
    status: "at_node", originNodeId: a.source.id, destinationKind: "doorstep",
    destinationAddress: { recipientName: "Ama Customer", locality: "Labone", street: "A Street" },
    currentNodeId: a.source.id, custody: "source_staff", activatedAt: new Date(), version: 2,
  } });
  const s1 = await db.shipmentStop.create({ data: { shipmentId: shipment.id, routeRevision: 1, position: 1, nodeId: a.source.id, nodeCode: a.source.code, nodePublicName: a.source.publicName, nodeKind: a.source.kind, nodeKindLabel: a.source.kindLabel, terminalRole: "transit" } });
  const s2 = await db.shipmentStop.create({ data: { shipmentId: shipment.id, routeRevision: 1, position: 2, nodeId: a.terminal.id, nodeCode: a.terminal.code, nodePublicName: a.terminal.publicName, nodeKind: a.terminal.kind, nodeKindLabel: a.terminal.kindLabel, terminalRole: "final_mile_dispatch" } });
  const leg = await db.shipmentLeg.create({ data: { shipmentId: shipment.id, routeRevision: 1, position: 1, originStopId: s1.id, destinationStopId: s2.id, laneId: a.lane!.id, mode: "linehaul", typicalMinutes: 30, status: "in_transit", departedAt: new Date(Date.now()-60_000), version: 2 } });
  await db.shipment.update({ where: { id: shipment.id }, data: { status: "in_transit", currentNodeId: null, currentLegId: leg.id, custody: "linehaul_internal", version: { increment: 1 } } });
  return { shipment: await db.shipment.findUniqueOrThrow({ where: { id: shipment.id } }), leg, terminal: a.terminal };
}

async function stockSnapshot() {
  return {
    lots: (await db.stockLot.findMany({ orderBy: { id: "asc" }, select: { id: true, quantity: true } })).map(x=>({id:x.id,quantity:x.quantity.toString()})),
    reservations: await db.reservation.findMany({ orderBy: { id: "asc" }, select: { id: true, state: true } }),
    depletionCount: await db.stockDepletion.count(),
  };
}

before(async()=>{
  if(!new URL(process.env.DATABASE_URL!).pathname.endsWith("variety_foundation_test")) throw Error("isolated database required");
  app=await createApplication(config()); db=app.get(Database); dispatch=app.get(DispatchCommandService); queries=app.get(DispatchQueryService); riders=app.get(RiderCommandService); movement=app.get(ShipmentExecutionService);
});
beforeEach(async()=>{ await seedCommerceFixtures(db); });
after(async()=>{ await app.close(); });

test("dispatch queue and assignment admit legacy/direct-ready orders but reject routed shipments before final-mile readiness", async()=>{
  const r=await rider("gate");
  const legacy=await handedOrder("VG-FM-LEGACY");
  const direct=await handedOrder("VG-FM-DIRECT"); const directShipment=await finalReadyShipment(direct.id,"DIRECT");
  const routed=await handedOrder("VG-FM-ROUTED"); const routedShipment=await inTransitShipment(routed.id,"ROUTED");
  const queue=await queries.listDispatch({page:1,perPage:100});
  assert.equal(queue.items.some(x=>x.orderId===legacy.id),true);
  assert.equal(queue.items.some(x=>x.orderId===direct.id),true);
  assert.equal(queue.items.some(x=>x.orderId===routed.id),false);
  const legacyAssigned=await dispatch.assign(legacy.id,{riderProfileId:r.profile.id},ctx("legacy-assign")); assert.equal(legacyAssigned.deliveryStatus,"assigned");
  await dispatch.unassign(legacyAssigned.jobId,{},ctx("legacy-unassign"));
  const directBefore=await db.shipment.findUniqueOrThrow({where:{id:directShipment.id}});
  const directAssigned=await dispatch.assign(direct.id,{riderProfileId:r.profile.id},ctx("direct-assign")); assert.equal(directAssigned.deliveryStatus,"assigned");
  const directAfter=await db.shipment.findUniqueOrThrow({where:{id:directShipment.id}});
  assert.equal(directAfter.status,"final_mile_ready"); assert.equal(directAfter.custody,directBefore.custody); assert.equal(directAfter.currentNodeId,directBefore.currentNodeId);
  assert.equal(await db.shipmentEvent.count({where:{shipmentId:directShipment.id,eventKind:"rider_assigned"}}),1);
  await dispatch.unassign(directAssigned.jobId,{},ctx("direct-unassign"));
  await assert.rejects(()=>dispatch.assign(routed.id,{riderProfileId:r.profile.id},ctx("routed-blocked")),(e:any)=>e?.getStatus?.()===422);
  assert.equal(await db.deliveryJob.count({where:{orderId:routed.id}}),0);
  assert.equal((await db.shipment.findUniqueOrThrow({where:{id:routedShipment.shipment.id}})).status,"in_transit");
});

test("arrival and assignment race cannot commit assignment before final-mile readiness", async()=>{
  const r=await rider("race"); const order=await handedOrder("VG-FM-RACE"); const routed=await inTransitShipment(order.id,"RACE");
  const [arrival,assignment]=await Promise.allSettled([
    movement.arrive(routed.shipment.id,"admin-commerce","fm-race-arrive",{},"req-fm-race-arrive"),
    dispatch.assign(order.id,{riderProfileId:r.profile.id},ctx("fm-race-assign")),
  ]);
  assert.equal(arrival.status,"fulfilled");
  const shipment=await db.shipment.findUniqueOrThrow({where:{id:routed.shipment.id}}); assert.equal(shipment.status,"final_mile_ready");
  const job=await db.deliveryJob.findUnique({where:{orderId:order.id}});
  if(assignment.status==="fulfilled") { assert.ok(job); assert.equal(await db.shipmentEvent.count({where:{shipmentId:shipment.id,eventKind:"rider_assigned"}}),1); }
  else assert.equal(job,null);
});

test("rider pickup moves shipment custody once and delivery completes shipment without settling COD or changing inventory", async()=>{
  const r=await rider("life"); const order=await handedOrder("VG-FM-RIDER"); const shipment=await finalReadyShipment(order.id,"RIDER"); const stockBefore=await stockSnapshot();
  const assigned=await dispatch.assign(order.id,{riderProfileId:r.profile.id},ctx("fm-rider-assign"));
  await riders.accept(r.user.id,assigned.jobId,{},riderCtx("fm-rider-accept"));
  const picked=await riders.pickup(r.user.id,assigned.jobId,{note:"sealed"},riderCtx("fm-rider-pickup"));
  assert.equal(picked.deliveryStatus,"picked_up");
  const pickedReplay=await riders.pickup(r.user.id,assigned.jobId,{note:"sealed"},riderCtx("fm-rider-pickup")); assert.deepEqual(pickedReplay,picked);
  let row=await db.shipment.findUniqueOrThrow({where:{id:shipment.id}}); assert.equal(row.status,"final_mile"); assert.equal(row.custody,"rider"); assert.equal(row.currentNodeId,null);
  assert.equal(await db.shipmentEvent.count({where:{shipmentId:shipment.id,eventKind:"rider_picked_up"}}),1);
  await riders.outForDelivery(r.user.id,assigned.jobId,{},riderCtx("fm-rider-out"));
  await riders.deliver(r.user.id,assigned.jobId,{proof:{method:"signature",reference:"sig-fm-rider"}},riderCtx("fm-rider-deliver"));
  row=await db.shipment.findUniqueOrThrow({where:{id:shipment.id}}); assert.equal(row.status,"completed"); assert.equal(row.custody,"customer"); assert.ok(row.completedAt);
  assert.equal((await db.order.findUniqueOrThrow({where:{id:order.id}})).paymentStatus,"unpaid");
  assert.deepEqual(await stockSnapshot(),stockBefore);
  assert.equal(await db.shipmentEvent.count({where:{shipmentId:shipment.id,eventKind:"delivered"}}),1);
});

test("manual-provider pickup and delivery synchronize shipment custody without network or payment authority", async()=>{
  const order=await handedOrder("VG-FM-PROVIDER"); const shipment=await finalReadyShipment(order.id,"PROVIDER"); const stockBefore=await stockSnapshot();
  const assigned=await dispatch.assign(order.id,{manualProvider:{providerKey:"manual-fixture",providerName:"Manual Fixture",reference:"BOOK-FM"}},ctx("fm-provider-assign"));
  await dispatch.manualProviderTransition(assigned.jobId,{action:"picked_up",note:"Collected"},ctx("fm-provider-pickup"));
  let row=await db.shipment.findUniqueOrThrow({where:{id:shipment.id}}); assert.equal(row.status,"final_mile"); assert.equal(row.custody,"provider"); assert.equal(row.currentNodeId,null);
  assert.equal(await db.shipmentEvent.count({where:{shipmentId:shipment.id,eventKind:"shipment_handover"}}),1);
  await dispatch.manualProviderTransition(assigned.jobId,{action:"out_for_delivery",note:"Departed"},ctx("fm-provider-out"));
  await dispatch.manualProviderTransition(assigned.jobId,{action:"delivered",proof:{method:"signature",reference:"sig-fm-provider"}},ctx("fm-provider-deliver"));
  row=await db.shipment.findUniqueOrThrow({where:{id:shipment.id}}); assert.equal(row.status,"completed"); assert.equal(row.custody,"customer"); assert.ok(row.completedAt);
  assert.equal((await db.order.findUniqueOrThrow({where:{id:order.id}})).paymentStatus,"unpaid"); assert.deepEqual(await stockSnapshot(),stockBefore);
});

test("physically returned final-mile goods re-enter dispatch readiness and can be reassigned without restocking", async()=>{
  const first=await rider("return-first"),replacement=await rider("return-next");
  const order=await handedOrder("VG-FM-RETURN"); const shipment=await finalReadyShipment(order.id,"RETURN"); const stockBefore=await stockSnapshot();
  const dispatchNodeId=shipment.currentNodeId; assert.ok(dispatchNodeId);
  const assigned=await dispatch.assign(order.id,{riderProfileId:first.profile.id},ctx("fm-return-assign"));
  await riders.accept(first.user.id,assigned.jobId,{},riderCtx("fm-return-accept"));
  await riders.pickup(first.user.id,assigned.jobId,{},riderCtx("fm-return-pickup"));
  await riders.outForDelivery(first.user.id,assigned.jobId,{},riderCtx("fm-return-out"));
  await riders.fail(first.user.id,assigned.jobId,{reason:"customer_unavailable"},riderCtx("fm-return-fail"));
  await dispatch.returnToStore(assigned.jobId,{note:"Bring parcel back"},ctx("fm-return-request"));
  let row=await db.shipment.findUniqueOrThrow({where:{id:shipment.id}}); assert.equal(row.status,"final_mile"); assert.equal(row.custody,"rider"); assert.equal(row.currentNodeId,null);
  await dispatch.receiveReturnedGoods(assigned.jobId,{note:"Received sealed"},ctx("fm-return-received"));
  row=await db.shipment.findUniqueOrThrow({where:{id:shipment.id}}); assert.equal(row.status,"final_mile_ready"); assert.equal(row.currentNodeId,dispatchNodeId); assert.ok(["source_staff","node_staff"].includes(row.custody??""));
  assert.equal(await db.shipmentEvent.count({where:{shipmentId:shipment.id,eventKind:"returned_toward_store"}}),1);
  assert.equal(await db.shipmentEvent.count({where:{shipmentId:shipment.id,eventKind:"returned_to_dispatch"}}),1);
  const reassigned=await dispatch.reassign(assigned.jobId,{riderProfileId:replacement.profile.id},ctx("fm-return-reassign")); assert.equal(reassigned.deliveryStatus,"assigned");
  assert.equal((await db.shipment.findUniqueOrThrow({where:{id:shipment.id}})).status,"final_mile_ready");
  assert.equal((await db.order.findUniqueOrThrow({where:{id:order.id}})).paymentStatus,"unpaid"); assert.deepEqual(await stockSnapshot(),stockBefore);
});
