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
async function order(ref:string,status="dispatched",handed=true){const o=await db.order.create({data:{reference:ref,customerUserId:"customer-a",customerName:"Ama Customer",customerPhone:"+233241111111",fulfilment:"delivery",zoneId:"zone-required",paymentMethod:"cash_on_delivery",paymentStatus:"unpaid",fulfilmentStatus:status,deliveryStatus:"unassigned",subtotalMinor:1000,deliveryFeeMinor:100,totalMinor:1100,verificationKeyVersion:1,verificationCodeHash:"7".repeat(64),stockConsumedAt:handed?new Date():null}});if(handed)await db.fulfilmentRun.create({data:{orderId:o.id,locationId:"loc_accra",handedOverBy:"admin-commerce",handedOverAt:new Date(),handoverKind:"dispatch"}});return o;}
async function rider(id:string,availabilityState:"available"|"offline"="available"){const u=await db.user.create({data:{email:`query-${id}@example.test`,name:`Query ${id}`,passwordHash:"x",role:"rider"}});return db.riderProfile.create({data:{userId:u.id,phone:"+233241234573",kind:"in_house",vehicle:"motorcycle",availabilityState,lastAvailabilityChangedAt:new Date()}});}

test("dispatch queue projects handed-over orders without jobs as unassigned and excludes packed orders",async()=>{const ready=await order("VG-QUERY-READY");await order("VG-QUERY-PACKED","packed",false);const result=await queries.listDispatch({page:1,perPage:25});const row=result.items.find(x=>x.orderId===ready.id);assert.ok(row);assert.equal(row.deliveryStatus,"unassigned");assert.equal(row.jobId,undefined);assert.deepEqual(row.allowedActions,["assign"]);assert.equal(result.items.some(x=>x.reference==="VG-QUERY-PACKED"),false);});

test("dispatch projections derive assignment actions and rider busy state on the server",async()=>{const r=await rider("busy"),offline=await rider("offline","offline"),o=await order("VG-QUERY-ASSIGNED");const j=await db.deliveryJob.create({data:{orderId:o.id,assignmentKind:"rider",riderProfileId:r.id,status:"assigned",custodyState:"dispatch",assignedBy:"admin-commerce",assignedAt:new Date()}});await db.order.update({where:{id:o.id},data:{deliveryStatus:"assigned"}});const detail=await queries.dispatchDetail(j.id);assert.equal(detail.assignment?.riderProfileId,r.id);assert.equal(detail.allowedActions.includes("reassign"),true);const fleet=await queries.listRiders();assert.equal(fleet.riders.find(x=>x.riderProfileId===r.id)?.effectiveAvailability,"busy");assert.equal(fleet.riders.find(x=>x.riderProfileId===offline.id)?.effectiveAvailability,"offline");});


test("returned-to-store projection explicitly awaits Returns inspection",async()=>{
  const r=await rider("returned-inspection"),o=await order("VG-QUERY-RETURNED-INSPECTION");
  const returnedAt=new Date();
  const j=await db.deliveryJob.create({data:{orderId:o.id,assignmentKind:"rider",riderProfileId:r.id,status:"return_to_store",custodyState:"store_returned",assignedBy:"admin-commerce",assignedAt:new Date(),returnedToStoreAt:returnedAt}});
  await db.order.update({where:{id:o.id},data:{deliveryStatus:"return_to_store"}});
  const detail=await queries.dispatchDetail(j.id);
  assert.equal((detail as any).returnsInspectionMessage,"Returned to store — awaiting Returns inspection.");
  const queue=await queries.listDispatch({page:1,perPage:25,status:"return_to_store"});
  assert.equal((queue.items.find(x=>x.jobId===j.id) as any)?.returnsInspectionMessage,"Returned to store — awaiting Returns inspection.");
  await db.deliveryJob.update({where:{id:j.id},data:{status:"unassigned"}});
  await db.order.update({where:{id:o.id},data:{deliveryStatus:"unassigned"}});
  const unassigned=await queries.dispatchDetail(j.id);
  assert.deepEqual(unassigned.allowedActions,["assign"]);
  assert.equal((unassigned as any).returnsInspectionMessage,"Returned to store — awaiting Returns inspection.");
});


test("dispatch queue excludes cancelled or non-dispatched handed-over anomalies",async()=>{
  const cancelled=await order("VG-QUERY-CANCELLED-HANDOVER");
  await db.order.update({where:{id:cancelled.id},data:{fulfilmentStatus:"cancelled",cancelledAt:new Date()}});
  const completed=await order("VG-QUERY-NONDISPATCH-HANDOVER");
  await db.order.update({where:{id:completed.id},data:{fulfilmentStatus:"delivered"}});
  const result=await queries.listDispatch({page:1,perPage:100});
  assert.equal(result.items.some(x=>x.orderId===cancelled.id),false);
  assert.equal(result.items.some(x=>x.orderId===completed.id),false);
});

test("delivered dispatch filter includes rider and manual-provider completions",async()=>{
  const r=await rider("completed-rider");
  const riderOrder=await order("VG-QUERY-DELIVERED-RIDER");
  const providerOrder=await order("VG-QUERY-DELIVERED-PROVIDER");
  const deliveredAt=new Date();
  const riderJob=await db.deliveryJob.create({data:{orderId:riderOrder.id,assignmentKind:"rider",riderProfileId:r.id,status:"delivered",custodyState:"customer",assignedBy:"admin-commerce",assignedAt:new Date(),deliveredAt}});
  const providerJob=await db.deliveryJob.create({data:{orderId:providerOrder.id,assignmentKind:"manual_provider",providerKey:"manual-test",providerNameSnapshot:"Manual Test",status:"delivered",custodyState:"customer",assignedBy:"admin-commerce",assignedAt:new Date(),deliveredAt}});
  await db.order.update({where:{id:riderOrder.id},data:{deliveryStatus:"delivered",fulfilmentStatus:"delivered"}});
  await db.order.update({where:{id:providerOrder.id},data:{deliveryStatus:"delivered",fulfilmentStatus:"delivered"}});
  const completed=await queries.listDispatch({page:1,perPage:100,status:"delivered"});
  assert.equal(completed.items.some(x=>x.jobId===riderJob.id),true);
  assert.equal(completed.items.some(x=>x.jobId===providerJob.id),true);
});
