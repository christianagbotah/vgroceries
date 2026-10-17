import { after, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import type { INestApplication } from "@nestjs/common";
import { createApplication } from "../src/bootstrap";
import { readConfig } from "../src/config";
import { Database } from "../src/database/database";
import { ApiProblem } from "../src/http/errors";
import { RiderCommandService } from "../src/dispatch/rider-command.service";
import { DispatchPolicyService } from "../src/dispatch/dispatch-policy.service";
import { DispatchEventService } from "../src/dispatch/dispatch-event.service";
import { seedCommerceFixtures } from "./commerce-fixtures";

let app: INestApplication; let db: Database; let service: RiderCommandService;
const config=()=>readConfig({DATABASE_URL:process.env.DATABASE_URL!,WEB_ORIGINS:"http://localhost:3000",API_STOCK_LOCATION_ID:"loc_accra",API_INSECURE_COOKIES:"true",COMMERCE_LOCATION_ID:"loc_accra",CHECKOUT_PAYMENT_HOLD_MINUTES:"15",CHECKOUT_OFFLINE_HOLD_MINUTES:"1440",GUEST_CHECKOUT_TTL_MINUTES:"1440",ORDER_VERIFICATION_ACTIVE_VERSION:"1",ORDER_VERIFICATION_KEYS:JSON.stringify({1:"11".repeat(32)})});
const ctx=(key:string)=>({requestId:`req-${key}`,idempotencyKey:key});
before(async()=>{if(!new URL(process.env.DATABASE_URL!).pathname.endsWith("variety_foundation_test"))throw Error("isolated database required");app=await createApplication(config());db=app.get(Database);service=new RiderCommandService(db,new DispatchPolicyService(),new DispatchEventService());});
beforeEach(async()=>seedCommerceFixtures(db));after(async()=>app?.close());
async function rider(id:string){const user=await db.user.create({data:{email:`rider-owner-${id}@example.test`,name:`Rider ${id}`,passwordHash:"x",role:"rider"}});const profile=await db.riderProfile.create({data:{userId:user.id,phone:"+233241234575",kind:"in_house",vehicle:"motorcycle",availabilityState:"available",lastAvailabilityChangedAt:new Date()}});return {user,profile};}
async function job(ref:string,riderProfileId:string){const order=await db.order.create({data:{reference:ref,customerUserId:"customer-a",customerName:"Ama",customerPhone:"+233241111111",fulfilment:"delivery",zoneId:"zone-required",paymentMethod:"cash_on_delivery",paymentStatus:"unpaid",fulfilmentStatus:"dispatched",deliveryStatus:"assigned",subtotalMinor:1000,deliveryFeeMinor:100,totalMinor:1100,verificationKeyVersion:1,verificationCodeHash:"9".repeat(64),stockConsumedAt:new Date()}});await db.fulfilmentRun.create({data:{orderId:order.id,locationId:"loc_accra",handedOverBy:"admin-commerce",handedOverAt:new Date(),handoverKind:"dispatch"}});return db.deliveryJob.create({data:{orderId:order.id,assignmentKind:"rider",riderProfileId,status:"assigned",custodyState:"dispatch",assignedBy:"admin-commerce",assignedAt:new Date()}});}
function codeOf(e:unknown){return e instanceof ApiProblem?(e.getResponse() as {code:string}).code:"";}

test("rider commands derive ownership from authenticated user and hide foreign jobs",async()=>{const a=await rider("a"),b=await rider("b");const own=await job("VG-RIDER-OWN",a.profile.id);const foreign=await job("VG-RIDER-FOREIGN",b.profile.id);await assert.rejects(()=>service.accept(a.user.id,foreign.id,{},ctx("owner-foreign")),(e)=>codeOf(e)==="NOT_FOUND");const result=await service.accept(a.user.id,own.id,{},ctx("owner-own"));assert.equal(result.deliveryStatus,"accepted");assert.equal((await db.deliveryJob.findUniqueOrThrow({where:{id:foreign.id}})).status,"assigned");});

test("browser supplied rider identity cannot bypass authenticated ownership",async()=>{const a=await rider("body-a"),b=await rider("body-b");const own=await job("VG-RIDER-BODY",a.profile.id);await assert.rejects(()=>service.accept(a.user.id,own.id,{riderId:b.profile.id} as never,ctx("owner-body")),(e)=>codeOf(e)==="VALIDATION_FAILED");assert.equal((await db.deliveryJob.findUniqueOrThrow({where:{id:own.id}})).status,"assigned");});
