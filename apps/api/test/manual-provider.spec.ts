import { after,before,beforeEach,test } from "node:test";
import assert from "node:assert/strict";
import type { INestApplication } from "@nestjs/common";
import { createApplication } from "../src/bootstrap";
import { readConfig } from "../src/config";
import { Database } from "../src/database/database";
import { DispatchCommandService } from "../src/dispatch/dispatch-command.service";
import { DispatchPolicyService } from "../src/dispatch/dispatch-policy.service";
import { DispatchEventService } from "../src/dispatch/dispatch-event.service";
import { ManualProviderService } from "../src/dispatch/manual-provider.service";
import { seedCommerceFixtures } from "./commerce-fixtures";
let app:INestApplication,db:Database,service:DispatchCommandService;
const config=()=>readConfig({DATABASE_URL:process.env.DATABASE_URL!,WEB_ORIGINS:"http://localhost:3000",API_STOCK_LOCATION_ID:"loc_accra",API_INSECURE_COOKIES:"true",COMMERCE_LOCATION_ID:"loc_accra",CHECKOUT_PAYMENT_HOLD_MINUTES:"15",CHECKOUT_OFFLINE_HOLD_MINUTES:"1440",GUEST_CHECKOUT_TTL_MINUTES:"1440",ORDER_VERIFICATION_ACTIVE_VERSION:"1",ORDER_VERIFICATION_KEYS:JSON.stringify({1:"11".repeat(32)})});
const ctx=(key:string)=>({actorId:"admin-commerce",requestId:`req-${key}`,idempotencyKey:key});
before(async()=>{app=await createApplication(config());db=app.get(Database);service=new DispatchCommandService(db,new DispatchPolicyService(),new DispatchEventService(),new ManualProviderService());});beforeEach(async()=>seedCommerceFixtures(db));after(async()=>app?.close());
async function order(){const o=await db.order.create({data:{reference:"VG-MANUAL-PROVIDER",customerUserId:"customer-a",customerName:"Ama",customerPhone:"+233241111111",fulfilment:"delivery",zoneId:"zone-required",paymentMethod:"cash_on_delivery",paymentStatus:"unpaid",fulfilmentStatus:"dispatched",deliveryStatus:"unassigned",subtotalMinor:1000,deliveryFeeMinor:100,totalMinor:1100,verificationKeyVersion:1,verificationCodeHash:"8".repeat(64),stockConsumedAt:new Date()}});await db.fulfilmentRun.create({data:{orderId:o.id,locationId:"loc_accra",handedOverBy:"admin-commerce",handedOverAt:new Date(),handoverKind:"dispatch"}});return o;}

test("manual provider lifecycle is explicit staff evidence and performs zero network calls",async()=>{const o=await order();let calls=0;const original=globalThis.fetch;globalThis.fetch=(async()=>{calls++;throw new Error("network must not be called");}) as typeof fetch;try{const a=await service.assign(o.id,{manualProvider:{providerKey:"manual-courier",providerName:"Manual Courier",reference:"BOOK-1"}},ctx("manual-assign"));await service.manualProviderTransition(a.jobId,{action:"picked_up",note:"Courier collected"},ctx("manual-pickup"));await service.manualProviderTransition(a.jobId,{action:"out_for_delivery",note:"Staff confirmed departure"},ctx("manual-out"));await service.manualProviderTransition(a.jobId,{action:"delivered",proof:{method:"signature",reference:"SIG-1"}},ctx("manual-deliver"));const job=await db.deliveryJob.findUniqueOrThrow({where:{id:a.jobId}});const orderRow=await db.order.findUniqueOrThrow({where:{id:o.id}});assert.equal(job.status,"delivered");assert.equal(job.custodyState,"customer");assert.equal(orderRow.paymentStatus,"unpaid");assert.equal(orderRow.deliveryStatus,"delivered");assert.equal(orderRow.fulfilmentStatus,"delivered");assert.equal(calls,0);assert.equal(await db.deliveryProof.count({where:{deliveryJobId:a.jobId}}),1);}finally{globalThis.fetch=original;}});
