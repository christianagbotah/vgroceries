import { after,before,beforeEach,test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { INestApplication } from "@nestjs/common";
import { createApplication } from "../src/bootstrap";
import { readConfig } from "../src/config";
import { Database } from "../src/database/database";
import { ShipmentCollectionService } from "../src/logistics/shipment-collection.service";
import { PickupAppointmentService, candidatePickupSlots } from "../src/logistics/pickup-appointment.service";
import { VerificationCodeService } from "../src/orders/verification-code.service";
import { commerceTestPassword,seedCommerceFixtures } from "./commerce-fixtures";
import type { CheckoutPrincipal } from "../src/commerce-identity/checkout-principal.service";
let app:INestApplication,db:Database,appointment:PickupAppointmentService,collection:ShipmentCollectionService,
  verification:VerificationCodeService,base:string;
const env=()=>readConfig({
  DATABASE_URL:process.env.DATABASE_URL!,WEB_ORIGINS:"http://localhost:3000",
  API_STOCK_LOCATION_ID:"loc_accra",API_INSECURE_COOKIES:"true",
  COMMERCE_LOCATION_ID:"loc_accra",CHECKOUT_PAYMENT_HOLD_MINUTES:"15",
  CHECKOUT_OFFLINE_HOLD_MINUTES:"1440",GUEST_CHECKOUT_TTL_MINUTES:"1440",
  ORDER_VERIFICATION_ACTIVE_VERSION:"1",ORDER_VERIFICATION_KEYS:JSON.stringify({1:"11".repeat(32)}),
  LOGISTICS_SHIPMENT_EXECUTION_ENABLED:"true",LOGISTICS_CUSTOMER_PICKUP_ENABLED:"true",
});
const owner:CheckoutPrincipal={kind:"customer",userId:"customer-a",actorId:"customer-a",actorScope:"customer:customer-a"};
const other:CheckoutPrincipal={kind:"customer",userId:"customer-b",actorId:"customer-b",actorScope:"customer:customer-b"};
const policy=(active=true)=>({
  active,serviceDays:[1,2,3,4,5,6,7],opensAt:"08:00",closesAt:"20:00",
  slotMinutes:30 as const,capacity:1,minLeadMinutes:30,maxDaysAhead:7,
});
async function fixture(tag: string) {
  const source = await db.logisticsNode.create({
    data: { code: `COLL_SRC_${tag}`, name: "Collection source", publicName: "Collection source", kind: "fulfilment_center", active: true },
  });
  const terminal = await db.logisticsNode.create({
    data: { code: `COLL_END_${tag}`, name: "Pickup centre", publicName: "Kumasi collection point", kind: "pickup_point", active: true, customerVisible: true, pickupFeeMinor:1000 },
  });
  const lane = await db.logisticsLane.create({ data: {
    originNodeId: source.id, destinationNodeId: terminal.id, mode: "linehaul",
    typicalMinutes: 90, priority: 0, serviceDays: [], active: true,
  } });
  const workflow = await db.deliveryWorkflowTemplate.create({ data: { name: `Pickup receipt ${tag}`, description: "Verified pickup receipt fixture", active: true } });
  const version = await db.deliveryWorkflowVersion.create({ data: {
    templateId: workflow.id, versionNumber: 1, status: "draft", revision: 1,
    createdBy: "admin-commerce", publishedBy: "admin-commerce", publishedAt: new Date(),
    stages: { create: [
      { stageKey: "placed", eventKind: "order_placed", customerTitleTemplate: "Order placed", adminLabel: "Order placed", customerVisible: true, sortOrder: 1, exceptionSeverity: "info", notificationsAllowed: false },
      { stageKey: "collected", eventKind: "customer_collected", customerTitleTemplate: "Collected", adminLabel: "Collected", customerVisible: true, sortOrder: 2, exceptionSeverity: "info", notificationsAllowed: false },
    ] },
  } });
  await db.deliveryWorkflowVersion.update({ where: { id: version.id }, data: { status: "published" } });
  const route = await db.deliveryRouteRule.create({ data: {
    name: `Pickup receipt route ${tag}`, originNodeId: source.id, deliveryZoneId: "zone-required",
    fulfilment: "delivery", destinationKind: "pickup_point", finalPickupNodeId: terminal.id,
    workflowVersionId: version.id, active: true, priority: 10, createdBy: "admin-commerce",
  } });
  const orderId = randomUUID();
  const code = verification.codeFor(orderId, 1);
  const handled = new Date(Date.now() - 5 * 60 * 1000);
  const order = await db.order.create({ data: {
    id: orderId, reference: `VG-COLL-${tag}`, customerUserId: "customer-a",
    customerName: "Ama Mensah", customerPhone: "+233241111111",
    fulfilment: "delivery", zoneId: "zone-required", paymentMethod: "mobile_money",
    paymentStatus: "succeeded", fulfilmentStatus: "dispatched", deliveryStatus: "unassigned",
    subtotalMinor: 2500, deliveryFeeMinor: 1000, totalMinor: 3500,
    verificationKeyVersion: 1, verificationCodeHash: verification.digestFor(orderId, code, 1),
    stockConsumedAt: handled,
    fulfilmentRun: { create: { locationId: "loc_accra", confirmedAt: handled,
      packedAt: handled, handedOverAt: handled, handedOverBy: "admin-commerce",
      handoverKind: "dispatch" } },
  } });
  const shipment = await db.shipment.create({ data: {
    orderId, sequence: 1, workflowVersionId: version.id, routeRuleId: route.id,
    status: "ready_for_pickup", originNodeId: source.id, destinationKind: "pickup_point",
    finalPickupNodeId: terminal.id, currentNodeId: terminal.id, custody: "node_staff",
    activatedAt: handled, version: 2,
  } });
  await db.orderPickupSnapshot.create({data:{orderId,nodeId:terminal.id,name:terminal.publicName,
    feeBasis:"centre_pickup",feeMinor:1000}});
  const s1 = await db.shipmentStop.create({ data: {
    shipmentId: shipment.id, routeRevision: 1, position: 1, nodeId: source.id,
    nodeCode: source.code, nodePublicName: source.publicName, nodeKind: source.kind,
    nodeKindLabel: source.kindLabel, terminalRole: "transit",
  } });
  const s2 = await db.shipmentStop.create({ data: {
    shipmentId: shipment.id, routeRevision: 1, position: 2, nodeId: terminal.id,
    nodeCode: terminal.code, nodePublicName: terminal.publicName, nodeKind: terminal.kind,
    nodeKindLabel: terminal.kindLabel, terminalRole: "customer_pickup",
  } });
  await db.shipmentLeg.create({ data: {
    shipmentId: shipment.id, routeRevision: 1, position: 1,
    originStopId: s1.id, destinationStopId: s2.id, laneId: lane.id, mode: lane.mode,
    typicalMinutes: lane.typicalMinutes, status: "arrived",
    departedAt: new Date(handled.getTime() + 30000), arrivedAt: new Date(handled.getTime() + 60000),
  } });
  return { source, terminal, order, shipment, code };
}
async function ready(tag:string,active=true){
 const x=await fixture(tag);
 await appointment.savePolicy(x.terminal.id,"admin-commerce",`policy-${tag}`,policy(active),`req-${tag}`);
 return x;
}
async function auth(email:string){
 const r=await fetch(base+"/api/v1/auth/sessions",{method:"POST",
   headers:{"content-type":"application/json",origin:"http://localhost:3000"},
   body:JSON.stringify({email,password:commerceTestPassword,client:"native"})});
 const json=await r.json();
 assert.equal(r.status,201,JSON.stringify(json));
 return json.data.accessToken as string;
}
async function request(method:"GET"|"POST",path:string,token:string,body?:unknown,key="appt-key-001"){
 const r=await fetch(base+"/api/v1"+path,{method,
   headers:{authorization:`Bearer ${token}`,...(method==="POST"?{
      "content-type":"application/json","idempotency-key":key,
    }:{})},...(method==="POST"?{body:JSON.stringify(body)}:{})});
 return {status:r.status,body:await r.json()};
}
before(async()=>{
 if(!new URL(process.env.DATABASE_URL!).pathname.endsWith("variety_foundation_test"))
  throw Error("Require a separate PostgreSQL test database.");
 app=await createApplication(env());await app.listen(0,"127.0.0.1");
 base=await app.getUrl();db=app.get(Database);
 appointment=app.get(PickupAppointmentService);collection=app.get(ShipmentCollectionService);
 verification=app.get(VerificationCodeService);
});
beforeEach(async()=>{await seedCommerceFixtures(db);});
after(async()=>{await app?.close();});
test("only admin can save a valid centre policy and replay does not duplicate actions",async()=>{
 const x=await fixture("POLICY");
 const a=await auth("admin-commerce@example.test"),c=await auth("customer-a@example.test");
 const path=`/admin/logistics/nodes/${x.terminal.id}/pickup-appointment-policy`;
 assert.equal((await request("POST",path,c,policy(),"policy-unauthorised")).status,403);
 assert.equal((await request("POST",path,a,{...policy(),serviceDays:[1,1]},"policy-invalid-days")).status,400);
 const created=await request("POST",path,a,policy(),"policy-created-1");
 assert.equal(created.status,200,JSON.stringify(created.body));
 assert.equal(created.body.data.capacity,1);
 const replay=await request("POST",path,a,policy(),"policy-created-1");
 assert.deepEqual(replay.body.data,created.body.data);
 assert.equal((await request("POST",path,a,{...policy(),capacity:2},"policy-created-1")).status,409);
 assert.equal((await request("GET",path,a)).body.data.active,true);
 assert.equal((await request("POST",`/admin/logistics/nodes/${x.source.id}/pickup-appointment-policy`,
  a,policy(),"policy-source-1")).status,422);
 assert.equal(await db.pickupAppointmentPolicy.count(),1);
});
test("appointment availability is owner-only and never appears before real pickup readiness",async()=>{
 const x=await ready("OWNER");
 await assert.rejects(()=>appointment.options(x.order.id,other),(e:any)=>e?.getStatus?.()===404);
 const a=await auth("admin-commerce@example.test"),c=await auth("customer-a@example.test");
 assert.equal((await request("GET",`/orders/${x.order.id}/pickup-appointments`,a)).status,403);
 const response=await request("GET",`/orders/${x.order.id}/pickup-appointments`,c);
 assert.equal(response.status,200,JSON.stringify(response.body));
 assert.equal(response.body.data.ready,true);
 assert.ok(response.body.data.slots.length>0);
 await db.shipment.update({where:{id:x.shipment.id},data:{status:"at_node"}});
 assert.equal((await appointment.options(x.order.id,owner)).ready,false);
 await assert.rejects(()=>appointment.change(x.order.id,owner,"not-ready",
   {kind:"book",startsAt:response.body.data.slots[0].startsAt},"req-not-ready"),
   (e:any)=>e?.getStatus?.()===422);
 assert.equal(await db.pickupAppointment.count(),0);
});
test("booking, changing, cancelling and replay never mutate payment, stock or delivery",async()=>{
 const x=await ready("LIFECYCLE");
 const slots=(await appointment.options(x.order.id,owner)).slots;
 const first=slots[0]!,next=slots[1]!;
 const before=(await db.stockLot.findUniqueOrThrow({where:{id:"lot-rice"}})).quantity.toString();
 const booked=await appointment.change(x.order.id,owner,"book-life-1",
   {kind:"book",startsAt:first.startsAt},"req-book-1");
 assert.equal(booked.appointment.startsAt,first.startsAt);
 assert.deepEqual(await appointment.change(x.order.id,owner,"book-life-1",
   {kind:"book",startsAt:first.startsAt},"req-book-1"),booked);
 await assert.rejects(()=>appointment.change(x.order.id,owner,"book-life-1",
   {kind:"book",startsAt:next.startsAt},"req-key-conflict"),(e:any)=>e?.getStatus?.()===409);
 const changed=await appointment.change(x.order.id,owner,"book-life-2",
   {kind:"book",startsAt:next.startsAt},"req-book-2");
 assert.equal(changed.appointment.startsAt,next.startsAt);
 const cancelled=await appointment.change(x.order.id,owner,"cancel-life-1",{kind:"cancel"},"req-cancel");
 assert.equal(cancelled.appointment.status,"cancelled");
 assert.deepEqual(await appointment.change(x.order.id,owner,"cancel-life-1",{kind:"cancel"},"req-cancel"),cancelled);
 assert.equal(await db.pickupAppointment.count({where:{orderId:x.order.id}}),1);
 assert.equal((await db.stockLot.findUniqueOrThrow({where:{id:"lot-rice"}})).quantity.toString(),before);
 assert.equal(await db.paymentAttempt.count({where:{orderId:x.order.id}}),0);
 assert.equal(await db.deliveryJob.count({where:{orderId:x.order.id}}),0);
 assert.equal(await db.orderEvent.count({where:{orderId:x.order.id,action:"pickup.appointment_booked"}}),2);
 assert.equal(await db.orderEvent.count({where:{orderId:x.order.id,action:"pickup.appointment_cancelled"}}),1);
});
async function anotherCustomerAtCentre(x:Awaited<ReturnType<typeof fixture>>,tag:string) {
 const id=randomUUID(),at=new Date(Date.now()-5*60*1000),code=verification.codeFor(id,1);
 await db.order.create({data:{
   id,reference:`VG-APPT-${tag}`,customerUserId:"customer-b",
   customerName:"Kojo Customer",customerPhone:"+233242222222",
   fulfilment:"delivery",zoneId:"zone-required",paymentMethod:"mobile_money",
   paymentStatus:"succeeded",fulfilmentStatus:"dispatched",deliveryStatus:"unassigned",
   subtotalMinor:2500,deliveryFeeMinor:1000,totalMinor:3500,
   verificationKeyVersion:1,verificationCodeHash:verification.digestFor(id,code,1),
   stockConsumedAt:at,fulfilmentRun:{create:{locationId:"loc_accra",
      confirmedAt:at,packedAt:at,handedOverAt:at,handedOverBy:"admin-commerce",handoverKind:"dispatch"}},
 }});
 await db.shipment.create({data:{
   orderId:id,sequence:1,workflowVersionId:x.shipment.workflowVersionId,
   routeRuleId:x.shipment.routeRuleId,status:"ready_for_pickup",
   originNodeId:x.source.id,destinationKind:"pickup_point",finalPickupNodeId:x.terminal.id,
   currentNodeId:x.terminal.id,custody:"node_staff",activatedAt:at,version:2,
 }});
 await db.orderPickupSnapshot.create({data:{
   orderId:id,nodeId:x.terminal.id,name:x.terminal.publicName,
   feeBasis:"centre_pickup",feeMinor:1000,
 }});
 return id;
}
test("concurrent customers cannot oversell the final place at a collection centre",async()=>{
 const x=await ready("CAPACITY");
 const secondId=await anotherCustomerAtCentre(x,"CAPACITY");
 const slot=(await appointment.options(x.order.id,owner)).slots[0]!;
 const results=await Promise.allSettled([
   appointment.change(x.order.id,owner,"capacity-one",{kind:"book",startsAt:slot.startsAt},"req-cap-1"),
   appointment.change(secondId,other,"capacity-two",{kind:"book",startsAt:slot.startsAt},"req-cap-2"),
 ]);
 assert.equal(results.filter(r=>r.status==="fulfilled").length,1,JSON.stringify(results));
 assert.equal(await db.pickupAppointment.count({where:{nodeId:x.terminal.id,status:"booked",
   startsAt:new Date(slot.startsAt)}}),1);
 assert.equal((await appointment.options(x.order.id,owner)).slots
   .find(s=>s.startsAt===slot.startsAt)?.available,0);
});
test("centre shutdown blocks new bookings but permits existing customer cancellations",async()=>{
 const x=await ready("SHUTDOWN");
 const start=(await appointment.options(x.order.id,owner)).slots[0]!.startsAt;
 await appointment.change(x.order.id,owner,"shutdown-book",{kind:"book",startsAt:start},"req-shut-book");
 await appointment.savePolicy(x.terminal.id,"admin-commerce","shutdown-policy",
   policy(false),"req-shut-policy");
 const options=await appointment.options(x.order.id,owner);
 assert.equal(options.enabled,false);
 assert.equal(options.appointment?.status,"booked");
 await assert.rejects(()=>appointment.change(x.order.id,owner,"shutdown-new",
   {kind:"book",startsAt:start},"req-shut-new"),(e:any)=>e?.getStatus?.()===422);
 const cancelled=await appointment.change(x.order.id,owner,"shutdown-cancel",{kind:"cancel"},"req-shut-cancel");
 assert.equal(cancelled.appointment.status,"cancelled");
});
test("verified physical collection completes an appointment with no second stock deduction",async()=>{
 const x=await ready("HANDOVER");
 const start=(await appointment.options(x.order.id,owner)).slots[0]!.startsAt;
 await appointment.change(x.order.id,owner,"handover-book",{kind:"book",startsAt:start},"req-handover-book");
 const stock=(await db.stockLot.findUniqueOrThrow({where:{id:"lot-rice"}})).quantity.toString();
 const result=await collection.collect(x.shipment.id,"admin-commerce","handover-verified",
   {verificationCode:x.code,receiverName:"Ama Mensah",identityCheck:"recipient_photo_id_checked"},
   "req-handover-verified");
 assert.equal(result.status,"completed");
 const booked=await db.pickupAppointment.findUniqueOrThrow({where:{orderId:x.order.id}});
 assert.equal(booked.status,"completed");
 assert.equal(booked.completedAt?.toISOString(),result.collectedAt);
 assert.equal(await db.shipmentCollectionReceipt.count({where:{shipmentId:x.shipment.id}}),1);
 assert.equal((await db.stockLot.findUniqueOrThrow({where:{id:"lot-rice"}})).quantity.toString(),stock);
 await assert.rejects(()=>db.pickupAppointment.update({where:{orderId:x.order.id},
   data:{status:"booked",completedAt:null}}));
});
test("SQL rejects fake completed appointments and orders booked at the wrong centre",async()=>{
 const x=await ready("SQL");
 const slot=(await appointment.options(x.order.id,owner)).slots[0]!;
 const data={orderId:x.order.id,startsAt:new Date(slot.startsAt),endsAt:new Date(slot.endsAt)};
 await assert.rejects(()=>db.pickupAppointment.create({data:{
   ...data,nodeId:x.source.id,status:"booked",
 }}));
 await assert.rejects(()=>db.pickupAppointment.create({data:{
   ...data,nodeId:x.terminal.id,status:"completed",completedAt:new Date(),
 }}));
 assert.equal(await db.pickupAppointment.count(),0);
});
test("weekday windows exclude the past, closed days and dates beyond booking horizon",()=>{
 const now=new Date("2026-11-08T21:00:00.000Z");
 const slots=candidatePickupSlots({...policy(),nodeId:"test-centre",serviceDays:[1],opensAt:"09:00",closesAt:"11:00",
   maxDaysAhead:3},now);
 assert.ok(slots.length>0);
 assert.ok(slots.every(s=>s.startsAt.getUTCDay()===1));
 assert.ok(slots.every(s=>s.startsAt.getTime()>=now.getTime()+30*60000));
 assert.ok(slots.every(s=>s.endsAt.getUTCHours()<=11));
});
test("unpaid, refunded and inactive pickup centres never offer appointment times",async()=>{
 const x=await ready("BLOCKERS");
 const starts=(await appointment.options(x.order.id,owner)).slots[0]!.startsAt;
 await db.order.update({where:{id:x.order.id},data:{paymentStatus:"pending"}});
 assert.equal((await appointment.options(x.order.id,owner)).ready,false);
 await assert.rejects(()=>appointment.change(x.order.id,owner,"not-paid",
   {kind:"book",startsAt:starts},"req-not-paid"),(e:any)=>e?.getStatus?.()===422);
 await db.order.update({where:{id:x.order.id},data:{paymentStatus:"succeeded"}});
 const attempt=await db.paymentAttempt.create({data:{
   orderId:x.order.id,provider:"fake",method:"mobile_money",
   merchantReference:"VG-APPT-REFUND-TEST",status:"succeeded",
   initiationState:"accepted",settlementState:"unsettled",amountMinor:3500,
 }});
 await db.refund.create({data:{
   orderId:x.order.id,paymentAttemptId:attempt.id,provider:"fake",method:"mobile_money",
   amountMinor:500,sourceType:"customer_cancellation",reason:"Under review",
   requestedBy:"customer-a",status:"awaiting_approval",
 }});
 assert.equal((await appointment.options(x.order.id,owner)).ready,false);
 await assert.rejects(()=>appointment.change(x.order.id,owner,"refund-block",
   {kind:"book",startsAt:starts},"req-refund-block"),(e:any)=>e?.getStatus?.()===422);
 const y=await ready("HIDDEN");
 await db.logisticsNode.update({where:{id:y.terminal.id},data:{customerVisible:false}});
 assert.equal((await appointment.options(y.order.id,owner)).ready,false);
 assert.equal(await db.pickupAppointment.count(),0);
});
test("global release flags keep customer appointment availability and booking off",async()=>{
 const x=await ready("GATES");
 const gated=new PickupAppointmentService(db,{...env(),customerPickupEnabled:false});
 const options=await gated.options(x.order.id,owner);
 assert.equal(options.enabled,false);
 assert.equal(options.slots.length,0);
 await assert.rejects(()=>gated.change(x.order.id,owner,"flags-off",
   {kind:"book",startsAt:new Date(Date.now()+86400_000).toISOString()},"req-flagged"),
   (e:any)=>e?.getStatus?.()===503);
});

test("admin-only centre holiday closures support validated replay-safe closure and reopening",async()=>{
 const x=await ready("HOLIDAY");
 const a=await auth("admin-commerce@example.test"),c=await auth("customer-a@example.test");
 const date=(await appointment.options(x.order.id,owner)).slots[0]!.startsAt.slice(0,10);
 const path=`/admin/logistics/nodes/${x.terminal.id}/pickup-closures`;
 assert.equal((await request("GET",path,c)).status,403);
 assert.equal((await request("POST",path,c,{date,closed:true,reason:"National holiday"},"holiday-role")).status,403);
 assert.equal((await request("POST",path,a,{date,closed:true,reason:"x"},"holiday-invalid")).status,400);
 const closed=await request("POST",path,a,{date,closed:true,reason:"National holiday"},"holiday-save");
 assert.equal(closed.status,200,JSON.stringify(closed.body));
 assert.deepEqual({date:closed.body.data.date,closed:closed.body.data.closed,reason:closed.body.data.reason},
   {date,closed:true,reason:"National holiday"});
 const replay=await request("POST",path,a,{date,closed:true,reason:"National holiday"},"holiday-save");
 assert.equal(replay.status,200);
 assert.deepEqual(replay.body.data,closed.body.data);
 const conflict=await request("POST",path,a,{date,closed:true,reason:"Different event"},"holiday-save");
 assert.equal(conflict.status,409);
 const list=await request("GET",path,a);
 assert.equal(list.status,200);
 assert.ok(list.body.data.some((r:any)=>r.date===date&&r.closed===true));
 assert.equal(await db.pickupCentreClosure.count({where:{nodeId:x.terminal.id}}),1);
 const reopening=await request("POST",path,a,{date,closed:false,reason:null},"holiday-reopen");
 assert.equal(reopening.status,200,JSON.stringify(reopening.body));
 assert.equal(reopening.body.data.closed,false);
 assert.equal(reopening.body.data.reason,null);
 assert.equal(await db.pickupCentreClosure.count({where:{nodeId:x.terminal.id}}),1);
 assert.equal(await db.auditEvent.count({where:{entityId:x.terminal.id,action:"pickup.centre.closure_saved"}}),2);
});
test("a closed pickup date disappears from availability, reopening restores slots without new stock writes",async()=>{
 const x=await ready("SLOTS-CLOSED");
 const all=(await appointment.options(x.order.id,owner)).slots;
 const date=all[0]!.startsAt.slice(0,10);
 const after=all.find(s=>s.startsAt.slice(0,10)!==date)!;
 assert.ok(after);
 const before=(await db.stockLot.findUniqueOrThrow({where:{id:"lot-rice"}})).quantity.toString();
 await appointment.saveClosure(x.terminal.id,"admin-commerce","calendar-date-one",
   {date,closed:true,reason:"Annual inventory count"},"calendar-date-req");
 const closed=await appointment.options(x.order.id,owner);
 assert.equal(closed.ready,true);
 assert.ok(closed.slots.length>0);
 assert.ok(closed.slots.every(slot=>slot.startsAt.slice(0,10)!==date));
 assert.ok(closed.slots.some(slot=>slot.startsAt===after.startsAt));
 await assert.rejects(()=>appointment.change(x.order.id,owner,"holiday-book",
   {kind:"book",startsAt:all[0]!.startsAt},"holiday-book-req"),
   (e:any)=>e?.getStatus?.()===422);
 await assert.rejects(()=>db.pickupAppointment.create({data:{
   orderId:x.order.id,nodeId:x.terminal.id,status:"booked",
   startsAt:new Date(all[0]!.startsAt),endsAt:new Date(all[0]!.endsAt),
 }}));
 assert.equal(await db.pickupAppointment.count({where:{orderId:x.order.id}}),0);
 await appointment.saveClosure(x.terminal.id,"admin-commerce","calendar-reopen",
   {date,closed:false,reason:null},"calendar-reopen-req");
 assert.ok((await appointment.options(x.order.id,owner)).slots.some(slot=>slot.startsAt===all[0]!.startsAt));
 assert.equal((await db.stockLot.findUniqueOrThrow({where:{id:"lot-rice"}})).quantity.toString(),before);
 assert.equal(await db.paymentAttempt.count({where:{orderId:x.order.id}}),0);
});
test("existing bookings stop closure, preserving customer visit and inventory",async()=>{
 const x=await ready("HAS-BOOKING");
 const slot=(await appointment.options(x.order.id,owner)).slots[0]!;
 const date=slot.startsAt.slice(0,10);
 const before=(await db.order.findUniqueOrThrow({where:{id:x.order.id}})).totalMinor;
 await appointment.change(x.order.id,owner,"save-first",
   {kind:"book",startsAt:slot.startsAt},"save-first-req");
 await assert.rejects(()=>appointment.saveClosure(x.terminal.id,"admin-commerce","close-booked",
   {date,closed:true,reason:"Unexpected maintenance"},"close-booked-req"),
   (e:any)=>e?.getStatus?.()===409&&e?.getResponse?.()?.code==="PICKUP_CLOSURE_HAS_BOOKINGS");
 await assert.rejects(()=>db.pickupCentreClosure.create({data:{
   nodeId:x.terminal.id,date:new Date(date+"T00:00:00Z"),closed:true,
   reason:"Direct SQL closure",updatedBy:"admin-commerce",
 }}));
 assert.equal(await db.pickupCentreClosure.count({where:{nodeId:x.terminal.id}}),0);
 assert.equal((await db.pickupAppointment.findUniqueOrThrow({where:{orderId:x.order.id}})).status,"booked");
 assert.equal((await db.order.findUniqueOrThrow({where:{id:x.order.id}})).totalMinor,before);
 await appointment.change(x.order.id,owner,"cancel-first",{kind:"cancel"},"cancel-first-req");
 const row=await appointment.saveClosure(x.terminal.id,"admin-commerce","close-after-cancel",
   {date,closed:true,reason:"Unexpected maintenance"},"close-after-cancel-req");
 assert.equal(row.closed,true);
});
test("simultaneous booking and calendar closure cannot both succeed for the same centre day",async()=>{
 const x=await ready("RACE-CLOSURE");
 const slot=(await appointment.options(x.order.id,owner)).slots[0]!;
 const date=slot.startsAt.slice(0,10);
 const results=await Promise.allSettled([
   appointment.change(x.order.id,owner,"race-book-1",
     {kind:"book",startsAt:slot.startsAt},"race-book-req"),
   appointment.saveClosure(x.terminal.id,"admin-commerce","race-close-1",
     {date,closed:true,reason:"Urgent facility maintenance"},"race-close-req"),
 ]);
 assert.equal(results.filter(r=>r.status==="fulfilled").length,1,JSON.stringify(results));
 const booking=await db.pickupAppointment.findUnique({where:{orderId:x.order.id}});
 const closure=await db.pickupCentreClosure.findUnique({where:{nodeId_date:{
   nodeId:x.terminal.id,date:new Date(date+"T00:00:00Z"),
 }}});
 assert.ok(!(booking?.status==="booked"&&closure?.closed));
});
test("closure dates are bounded, cannot be added to a non-pickup node, and SQL rejects forged records",async()=>{
 const x=await ready("CLOSURE-GUARD");
 const tomorrow=new Date(Date.now()+86400_000).toISOString().slice(0,10);
 const past=new Date(Date.now()-86400_000).toISOString().slice(0,10);
 await assert.rejects(()=>appointment.saveClosure(x.terminal.id,"admin-commerce","invalid-past",
   {date:past,closed:true,reason:"Already passed"},"invalid-past-req"),(e:any)=>e?.getStatus?.()===422);
 await assert.rejects(()=>appointment.saveClosure(x.source.id,"admin-commerce","wrong-node",
   {date:tomorrow,closed:true,reason:"Wrong kind"},"wrong-node-req"),(e:any)=>e?.getStatus?.()===422);
 await assert.rejects(()=>db.pickupCentreClosure.create({data:{
   nodeId:x.source.id,date:new Date(tomorrow+"T00:00:00Z"),closed:true,reason:"Bad node",updatedBy:"admin-commerce",
 }}));
 await assert.rejects(()=>db.pickupCentreClosure.create({data:{
   nodeId:x.terminal.id,date:new Date(past+"T00:00:00Z"),closed:true,reason:"Past day",updatedBy:"admin-commerce",
 }}));
 assert.equal(await db.pickupCentreClosure.count(),0);
});

test("direct SQL closure and booking race serialize without leaving a booked closed day",async()=>{
 const x=await ready("SQL-RACE");
 const slot=(await appointment.options(x.order.id,owner)).slots[0]!;
 const date=slot.startsAt.slice(0,10);
 const results=await Promise.allSettled([
   db.pickupAppointment.create({data:{
     orderId:x.order.id,nodeId:x.terminal.id,status:"booked",
     startsAt:new Date(slot.startsAt),endsAt:new Date(slot.endsAt),
   }}),
   db.pickupCentreClosure.create({data:{
     nodeId:x.terminal.id,date:new Date(date+"T00:00:00Z"),
     closed:true,reason:"Direct SQL race test",updatedBy:"admin-commerce",
   }}),
 ]);
 assert.equal(results.filter(r=>r.status==="fulfilled").length,1);
 const closure=await db.pickupCentreClosure.findUnique({where:{nodeId_date:{
   nodeId:x.terminal.id,date:new Date(date+"T00:00:00Z"),
 }}});
 const booking=await db.pickupAppointment.findUnique({where:{orderId:x.order.id}});
 assert.ok(!(closure?.closed&&booking?.status==="booked"));
});
