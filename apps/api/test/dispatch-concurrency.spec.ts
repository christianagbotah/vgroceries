import { after, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import type { INestApplication } from "@nestjs/common";
import { createApplication } from "../src/bootstrap";
import { readConfig } from "../src/config";
import { Database } from "../src/database/database";
import { DispatchCommandService } from "../src/dispatch/dispatch-command.service";
import { DispatchPolicyService } from "../src/dispatch/dispatch-policy.service";
import { DispatchEventService } from "../src/dispatch/dispatch-event.service";
import { seedCommerceFixtures } from "./commerce-fixtures";
let app:INestApplication; let db:Database; let service:DispatchCommandService;
const config=()=>readConfig({DATABASE_URL:process.env.DATABASE_URL!,WEB_ORIGINS:"http://localhost:3000",API_STOCK_LOCATION_ID:"loc_accra",API_INSECURE_COOKIES:"true",COMMERCE_LOCATION_ID:"loc_accra",CHECKOUT_PAYMENT_HOLD_MINUTES:"15",CHECKOUT_OFFLINE_HOLD_MINUTES:"1440",GUEST_CHECKOUT_TTL_MINUTES:"1440",ORDER_VERIFICATION_ACTIVE_VERSION:"1",ORDER_VERIFICATION_KEYS:JSON.stringify({1:"11".repeat(32)})});
const ctx=(key:string,actorId:string)=>({actorId,requestId:`req-${key}`,idempotencyKey:key});
before(async()=>{app=await createApplication(config());db=app.get(Database);service=new DispatchCommandService(db,new DispatchPolicyService(),new DispatchEventService());});beforeEach(async()=>seedCommerceFixtures(db));after(async()=>app?.close());
async function rider(id:string){const u=await db.user.create({data:{email:`race-${id}@example.test`,name:id,passwordHash:"x",role:"rider"}});return db.riderProfile.create({data:{userId:u.id,phone:"+233241234571",kind:"in_house",vehicle:"motorcycle",availabilityState:"available",lastAvailabilityChangedAt:new Date()}});}
async function order(ref:string){const o=await db.order.create({data:{reference:ref,customerUserId:"customer-a",customerName:"Ama",customerPhone:"+233241111111",fulfilment:"delivery",zoneId:"zone-required",paymentMethod:"cash_on_delivery",paymentStatus:"unpaid",fulfilmentStatus:"dispatched",deliveryStatus:"unassigned",subtotalMinor:1000,deliveryFeeMinor:100,totalMinor:1100,verificationKeyVersion:1,verificationCodeHash:"f".repeat(64),stockConsumedAt:new Date()}});await db.fulfilmentRun.create({data:{orderId:o.id,locationId:"loc_accra",handedOverBy:"admin-commerce",handedOverAt:new Date(),handoverKind:"dispatch"}});return o;}

test("two admins cannot create two jobs for one order",async()=>{const a=await rider("a"),b=await rider("b"),o=await order("VG-RACE-ORDER");const results=await Promise.allSettled([service.assign(o.id,{riderProfileId:a.id},ctx("race-order-a","admin-a")),service.assign(o.id,{riderProfileId:b.id},ctx("race-order-b","admin-b"))]);assert.equal(results.filter(x=>x.status==="fulfilled").length,1);assert.equal(await db.deliveryJob.count({where:{orderId:o.id}}),1);});

test("one rider cannot acquire two active jobs concurrently",async()=>{const r=await rider("one"),a=await order("VG-RACE-RIDER-A"),b=await order("VG-RACE-RIDER-B");const results=await Promise.allSettled([service.assign(a.id,{riderProfileId:r.id},ctx("race-rider-a","admin-a")),service.assign(b.id,{riderProfileId:r.id},ctx("race-rider-b","admin-b"))]);assert.equal(results.filter(x=>x.status==="fulfilled").length,1);assert.equal(await db.deliveryJob.count({where:{riderProfileId:r.id,status:{in:["assigned","accepted","picked_up","out_for_delivery","failed","rescheduled","return_to_store"]}}}),1);});
