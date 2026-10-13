import { after, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import type { INestApplication } from "@nestjs/common";
import { createApplication } from "../src/bootstrap";
import { readConfig } from "../src/config";
import { Database } from "../src/database/database";
import { ApiProblem } from "../src/http/errors";
import { DispatchCommandService } from "../src/dispatch/dispatch-command.service";
import { DispatchPolicyService } from "../src/dispatch/dispatch-policy.service";
import { DispatchEventService } from "../src/dispatch/dispatch-event.service";
import { seedCommerceFixtures } from "./commerce-fixtures";

let app: INestApplication; let db: Database; let service: DispatchCommandService;
const config = () => readConfig({ DATABASE_URL: process.env.DATABASE_URL!, WEB_ORIGINS: "http://localhost:3000", API_STOCK_LOCATION_ID: "loc_accra", API_INSECURE_COOKIES: "true", COMMERCE_LOCATION_ID: "loc_accra", CHECKOUT_PAYMENT_HOLD_MINUTES: "15", CHECKOUT_OFFLINE_HOLD_MINUTES: "1440", GUEST_CHECKOUT_TTL_MINUTES: "1440", ORDER_VERIFICATION_ACTIVE_VERSION: "1", ORDER_VERIFICATION_KEYS: JSON.stringify({1:"11".repeat(32)}) });
const ctx = (key: string, actorId = "admin-commerce") => ({ actorId, requestId: `req-${key}`, idempotencyKey: key });

before(async()=>{ if(!new URL(process.env.DATABASE_URL!).pathname.endsWith("variety_foundation_test")) throw Error("isolated database required"); app=await createApplication(config()); db=app.get(Database); service=new DispatchCommandService(db,new DispatchPolicyService(),new DispatchEventService()); });
beforeEach(async()=>{ await seedCommerceFixtures(db); });
after(async()=>{ await app?.close(); });

async function rider(suffix: string, availabilityState: "available"|"offline"="available") {
  const user=await db.user.create({data:{email:`rider-${suffix}@example.test`,name:`Rider ${suffix}`,passwordHash:"x",role:"rider"}});
  return db.riderProfile.create({data:{userId:user.id,phone:`+23324${suffix.padStart(7,"0").slice(-7)}`,kind:"in_house",vehicle:"motorcycle",availabilityState,lastAvailabilityChangedAt:new Date()}});
}
async function eligible(reference: string) {
  const order=await db.order.create({data:{reference,customerUserId:"customer-a",customerName:"Ama",customerPhone:"+233241111111",fulfilment:"delivery",zoneId:"zone-required",paymentMethod:"cash_on_delivery",paymentStatus:"unpaid",fulfilmentStatus:"dispatched",deliveryStatus:"unassigned",subtotalMinor:1000,deliveryFeeMinor:100,totalMinor:1100,verificationKeyVersion:1,verificationCodeHash:"d".repeat(64),stockConsumedAt:new Date()}});
  await db.fulfilmentRun.create({data:{orderId:order.id,locationId:"loc_accra",confirmedBy:"admin-commerce",confirmedAt:new Date(),handedOverBy:"admin-commerce",handedOverAt:new Date(),handoverKind:"dispatch"}});
  return order;
}
async function stockSnapshot() {
  return { lots: await db.stockLot.findMany({orderBy:{id:"asc"},select:{id:true,quantity:true}}), reservations: await db.reservation.findMany({orderBy:{id:"asc"},select:{id:true,state:true}}), depletionCount: await db.stockDepletion.count() };
}
function codeOf(error: unknown) { return error instanceof ApiProblem ? (error.getResponse() as {code:string}).code : ""; }

test("assign creates one durable job and never mutates inventory authority", async()=>{
  const profile=await rider("1"); const order=await eligible("VG-DISPATCH-ASSIGN"); const before=await stockSnapshot();
  const result=await service.assign(order.id,{riderProfileId:profile.id},ctx("assign-key-1"));
  assert.equal(result.deliveryStatus,"assigned"); assert.equal((await db.deliveryJob.count({where:{orderId:order.id}})),1);
  assert.equal((await db.order.findUniqueOrThrow({where:{id:order.id}})).stockConsumedAt?.toISOString(),order.stockConsumedAt?.toISOString());
  assert.deepEqual(await stockSnapshot(),before);
});

test("assignment rejects non-handover offline and busy riders", async()=>{
  const available=await rider("2"); const offline=await rider("3","offline");
  const packed=await db.order.create({data:{reference:"VG-DISPATCH-PACKED",customerUserId:"customer-a",customerName:"Ama",customerPhone:"+233241111111",fulfilment:"delivery",zoneId:"zone-required",paymentMethod:"cash_on_delivery",paymentStatus:"unpaid",fulfilmentStatus:"packed",deliveryStatus:"unassigned",subtotalMinor:1000,deliveryFeeMinor:100,totalMinor:1100,verificationKeyVersion:1,verificationCodeHash:"e".repeat(64)}});
  await assert.rejects(()=>service.assign(packed.id,{riderProfileId:available.id},ctx("assign-key-2")));
  const order1=await eligible("VG-DISPATCH-OFFLINE"); await assert.rejects(()=>service.assign(order1.id,{riderProfileId:offline.id},ctx("assign-key-3")));
  const order2=await eligible("VG-DISPATCH-BUSY-1"); await service.assign(order2.id,{riderProfileId:available.id},ctx("assign-key-4"));
  const order3=await eligible("VG-DISPATCH-BUSY-2"); await assert.rejects(()=>service.assign(order3.id,{riderProfileId:available.id},ctx("assign-key-5")));
});

test("assignment replay is stable and changed body conflicts", async()=>{
  const one=await rider("4"); const two=await rider("5"); const order=await eligible("VG-DISPATCH-REPLAY");
  const first=await service.assign(order.id,{riderProfileId:one.id},ctx("assign-replay-1"));
  assert.deepEqual(await service.assign(order.id,{riderProfileId:one.id},ctx("assign-replay-1")),first);
  await assert.rejects(()=>service.assign(order.id,{riderProfileId:two.id},ctx("assign-replay-1")),(e)=>codeOf(e)==="IDEMPOTENCY_CONFLICT");
  assert.equal(await db.deliveryJob.count({where:{orderId:order.id}}),1);
});

test("unassign and reassign are custody-safe and availability is declared separately", async()=>{
  const one=await rider("6"); const two=await rider("7"); const order=await eligible("VG-DISPATCH-REASSIGN");
  const assigned=await service.assign(order.id,{riderProfileId:one.id},ctx("assign-reassign-1"));
  await service.unassign(assigned.jobId,{},ctx("unassign-1"));
  assert.equal((await db.deliveryJob.findUniqueOrThrow({where:{id:assigned.jobId}})).status,"unassigned");
  await service.reassign(assigned.jobId,{riderProfileId:two.id},ctx("reassign-1"));
  assert.equal((await db.deliveryJob.findUniqueOrThrow({where:{id:assigned.jobId}})).riderProfileId,two.id);
  await db.deliveryJob.update({where:{id:assigned.jobId},data:{status:"picked_up",custodyState:"rider",pickedUpAt:new Date()}});
  await assert.rejects(()=>service.reassign(assigned.jobId,{riderProfileId:one.id},ctx("reassign-unsafe-1")));
  await service.setRiderAvailability(one.id,{availability:"offline"},ctx("availability-1"));
  assert.equal((await db.riderProfile.findUniqueOrThrow({where:{id:one.id}})).availabilityState,"offline");
});
