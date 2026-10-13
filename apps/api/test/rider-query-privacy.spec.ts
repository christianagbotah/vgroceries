import {after,before,beforeEach,test} from "node:test";
import assert from "node:assert/strict";
import type {INestApplication} from "@nestjs/common";
import {createApplication} from "../src/bootstrap";
import {readConfig} from "../src/config";
import {Database} from "../src/database/database";
import {DispatchQueryService} from "../src/dispatch/dispatch-query.service";
import {DispatchPolicyService} from "../src/dispatch/dispatch-policy.service";
import {seedCommerceFixtures} from "./commerce-fixtures";
let app:INestApplication,db:Database,queries:DispatchQueryService;
const config=()=>readConfig({DATABASE_URL:process.env.DATABASE_URL!,WEB_ORIGINS:"http://localhost:3000",API_STOCK_LOCATION_ID:"loc_accra",API_INSECURE_COOKIES:"true",COMMERCE_LOCATION_ID:"loc_accra",CHECKOUT_PAYMENT_HOLD_MINUTES:"15",CHECKOUT_OFFLINE_HOLD_MINUTES:"1440",GUEST_CHECKOUT_TTL_MINUTES:"1440",ORDER_VERIFICATION_ACTIVE_VERSION:"1",ORDER_VERIFICATION_KEYS:JSON.stringify({1:"11".repeat(32)})});
before(async()=>{app=await createApplication(config());db=app.get(Database);queries=new DispatchQueryService(db,new DispatchPolicyService());});beforeEach(async()=>seedCommerceFixtures(db));after(async()=>app?.close());
async function rider(id:string){const u=await db.user.create({data:{email:`privacy-${id}@example.test`,name:`Privacy ${id}`,passwordHash:"x",role:"rider"}});const p=await db.riderProfile.create({data:{userId:u.id,phone:"+233241234574",kind:"contracted",vehicle:"car",availabilityState:"available",lastAvailabilityChangedAt:new Date()}});return {u,p};}
async function job(ref:string,riderProfileId:string,customerName:string){const o=await db.order.create({data:{reference:ref,customerUserId:"customer-a",customerName,customerPhone:"+233241111111",fulfilment:"delivery",zoneId:"zone-required",paymentMethod:"cash_on_delivery",paymentStatus:"unpaid",fulfilmentStatus:"dispatched",deliveryStatus:"assigned",subtotalMinor:1000,deliveryFeeMinor:100,totalMinor:1100,verificationKeyVersion:1,verificationCodeHash:"6".repeat(64),stockConsumedAt:new Date(),deliveryAddress:{create:{label:"Drop",recipientName:customerName,phone:"+233241111111",locality:"Accra",street:`${customerName} Secret Street`}},lines:{create:{variantId:"var-rice",productId:"product-rice",productName:"Fixture Rice",variantName:"Weighted rice",unit:"kg",quantity:"1",unitPriceMinor:199,lineTotalMinor:199}}}});await db.fulfilmentRun.create({data:{orderId:o.id,locationId:"loc_accra",handedOverBy:"admin-commerce",handedOverAt:new Date(),handoverKind:"dispatch"}});return db.deliveryJob.create({data:{orderId:o.id,assignmentKind:"rider",riderProfileId,status:"assigned",custodyState:"dispatch",assignedBy:"admin-commerce",assignedAt:new Date()}});}

test("rider reads expose only the authenticated rider's jobs",async()=>{const a=await rider("a"),b=await rider("b");const own=await job("VG-PRIVACY-A",a.p.id,"Ama Own");const foreign=await job("VG-PRIVACY-B",b.p.id,"Kojo Foreign");const list=await queries.riderJobs(a.u.id);assert.equal(list.jobs.length,1);assert.equal(list.jobs[0]?.jobId,own.id);assert.equal(list.jobs.some(x=>x.jobId===foreign.id),false);await assert.rejects(()=>queries.riderJob(a.u.id,foreign.id));const detail=await queries.riderJob(a.u.id,own.id);assert.match(detail.address?.street??"",/Ama Own/);assert.equal(JSON.stringify(list).includes("Kojo Foreign"),false);});

test("rider me derives effective availability and history remains ownership-scoped",async()=>{const a=await rider("history-a"),b=await rider("history-b");const own=await job("VG-HISTORY-A",a.p.id,"Own History");const foreign=await job("VG-HISTORY-B",b.p.id,"Foreign History");for(const j of [own,foreign]){await db.deliveryJob.update({where:{id:j.id},data:{status:"delivered",custodyState:"customer",deliveredAt:new Date()}});await db.order.update({where:{id:j.orderId},data:{deliveryStatus:"delivered",fulfilmentStatus:"delivered"}});}const me=await queries.riderMe(a.u.id);assert.equal(me.effectiveAvailability,"available");const history=await queries.riderHistory(a.u.id);assert.equal(history.jobs.length,1);assert.equal(history.jobs[0]?.jobId,own.id);assert.equal(JSON.stringify(history).includes("Foreign History"),false);});

test("unassignment revokes former rider detail access while retaining provenance", async()=>{
  const a=await rider("unassigned-access");
  const own=await job("VG-PRIVACY-UNASSIGNED",a.p.id,"Former Customer");
  await db.deliveryJob.update({where:{id:own.id},data:{status:"unassigned",custodyState:"dispatch"}});
  await db.order.update({where:{id:own.orderId},data:{deliveryStatus:"unassigned"}});
  await assert.rejects(()=>queries.riderJob(a.u.id,own.id));
  const persisted=await db.deliveryJob.findUniqueOrThrow({where:{id:own.id}});
  assert.equal(persisted.riderProfileId,a.p.id);
});
