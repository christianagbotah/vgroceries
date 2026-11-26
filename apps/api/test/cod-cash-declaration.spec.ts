import { after, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import type { INestApplication } from "@nestjs/common";
import { codCashDeclarationRequestSchema, codCashDeclarationViewSchema } from "@variety/contracts";
import { createApplication } from "../src/bootstrap";
import { readConfig } from "../src/config";
import { Database } from "../src/database/database";
import { CodCashDeclarationService } from "../src/dispatch/cod-cash-declaration.service";
import { ApiProblem } from "../src/http/errors";
import { commerceTestPassword, seedCommerceFixtures } from "./commerce-fixtures";

let app: INestApplication, db: Database, base: string;
const config = (enabled = true) => readConfig({
  DATABASE_URL: process.env.DATABASE_URL!, WEB_ORIGINS: "http://localhost:3000",
  API_STOCK_LOCATION_ID: "loc_accra", API_INSECURE_COOKIES: "true",
  COMMERCE_LOCATION_ID: "loc_accra", CHECKOUT_PAYMENT_HOLD_MINUTES: "15",
  CHECKOUT_OFFLINE_HOLD_MINUTES: "1440", GUEST_CHECKOUT_TTL_MINUTES: "1440",
  ORDER_VERIFICATION_ACTIVE_VERSION: "1", ORDER_VERIFICATION_KEYS: JSON.stringify({ 1: "11".repeat(32) }),
  COD_CASH_DECLARATIONS_ENABLED: enabled ? "true" : "false",
});
const evidence = { amountMinor: 2100, cashCountConfirmed: true, riderPossessionConfirmed: true,
  note: "I counted the exact physical cash and am holding it for handover." } as const;

async function token(email: string) {
  const response = await fetch(base+"/api/v1/auth/sessions",{method:"POST",headers:{
    "content-type":"application/json",origin:"http://localhost:3000",
  },body:JSON.stringify({email,password:commerceTestPassword,client:"native"})});
  assert.equal(response.status,201);
  return (await response.json()).data.accessToken as string;
}
async function post(jobId:string, bearer:string|undefined, key:string, body:unknown=evidence) {
  const response = await fetch(`${base}/api/v1/rider/jobs/${jobId}/cod-cash-declaration`,{
    method:"POST", headers:{"content-type":"application/json","idempotency-key":key,
      ...(bearer?{authorization:`Bearer ${bearer}`}:{})}, body:JSON.stringify(body),
  });
  return {status:response.status,body:await response.json()};
}
async function createRider(name:string) {
  const customer=await db.user.findUniqueOrThrow({where:{id:"customer-a"}});
  const u=await db.user.create({data:{email:`cod-${name}@example.test`,name:`COD Rider ${name}`,
    passwordHash:customer.passwordHash,role:"rider"}});
  const profile=await db.riderProfile.create({data:{userId:u.id,phone:"+233241234579",kind:"in_house",
    vehicle:"motorcycle",availabilityState:"available",lastAvailabilityChangedAt:new Date()}});
  return {u,profile};
}
async function createDelivery(name:string, opts:{delivered?:boolean;paymentStatus?:string;amountMinor?:number}={}){
  const rider=await createRider(name);
  const before=new Date(Date.now()-45000);
  const at=new Date(Date.now()-15000);
  const order=await db.order.create({data:{reference:`VG-COD-COLLECTION-${name}`,customerUserId:"customer-a",
    customerName:"Sensitive Customer",customerPhone:"+233241111111",
    fulfilment:"delivery",zoneId:"zone-required",paymentMethod:"cash_on_delivery",
    paymentStatus:opts.paymentStatus??"unpaid",fulfilmentStatus:"dispatched",deliveryStatus:"unassigned",
    subtotalMinor:opts.amountMinor??2100,deliveryFeeMinor:0,totalMinor:opts.amountMinor??2100,
    verificationKeyVersion:1,verificationCodeHash:"4".repeat(64),stockConsumedAt:before}});
  await db.fulfilmentRun.create({data:{orderId:order.id,locationId:"loc_accra",
    handedOverBy:"admin-commerce",handoverKind:"dispatch",handedOverAt:before}});
  const job=await db.deliveryJob.create({data:{orderId:order.id,assignmentKind:"rider",
    riderProfileId:rider.profile.id,status:"assigned",custodyState:"dispatch",
    assignedBy:"admin-commerce",assignedAt:at}});
  if(opts.delivered!==false){
    await db.deliveryProof.create({data:{deliveryJobId:job.id,method:"signature",reference:"COD-PROOF-1",
      recordedByKind:"rider",recordedById:rider.u.id,recordedAt:new Date()}});
    await db.deliveryJob.update({where:{id:job.id},data:{status:"delivered",custodyState:"customer",deliveredAt:new Date()}});
    await db.order.update({where:{id:order.id},data:{deliveryStatus:"delivered",fulfilmentStatus:"delivered"}});
  }
  return {job,order,rider};
}

before(async()=>{app=await createApplication(config());await app.listen(0,"127.0.0.1");base=await app.getUrl();db=app.get(Database);});
beforeEach(async()=>seedCommerceFixtures(db));
after(async()=>app?.close());

test("COD cash declaration input and environment gates fail closed", async()=>{
  assert.equal(readConfig({DATABASE_URL:"postgresql://user:pass@localhost/test",WEB_ORIGINS:"http://localhost:3000",
    API_STOCK_LOCATION_ID:"loc_accra"}).codCashDeclarationsEnabled,false);
  assert.throws(()=>readConfig({
    DATABASE_URL:"postgresql://user:pass@localhost/test",WEB_ORIGINS:"http://localhost:3000",
    API_STOCK_LOCATION_ID:"loc_accra",COD_CASH_DECLARATIONS_ENABLED:"yes"}), /COD_CASH_DECLARATIONS_ENABLED/);
  await assert.rejects(
    new CodCashDeclarationService(db,config(false)).declare("rider","job","cod-disabled-key01","request-test",evidence),
    (cause:unknown) => cause instanceof ApiProblem && cause.getStatus() === 503,
  );
  assert.equal(codCashDeclarationRequestSchema.safeParse(evidence).success,true);
  for(const input of [{...evidence,amountMinor:0},{...evidence,amountMinor:2100.5},
    {...evidence,cashCountConfirmed:false},{...evidence,riderPossessionConfirmed:false},
    {...evidence,note:"short"},{...evidence,amountMinor:100000001},
    {...evidence,riderId:"forged"}]) assert.equal(codCashDeclarationRequestSchema.safeParse(input).success,false);
});

test("only the owning rider can declare exact physical COD cash after proven delivery; a declaration never settles money",async()=>{
  const delivered=await createDelivery("completed");
  const other=await createRider("outsider");
  const admin=await token("admin-commerce@example.test");
  const rider=await token(delivered.rider.u.email!);
  const stranger=await token(other.u.email!);
  // Before any physical-cash declaration, no unverified cash record exists.
  const initialHistory=await fetch(base+"/api/v1/rider/jobs?scope=history",{
    headers:{authorization:`Bearer ${rider}`},
  });
  assert.equal(initialHistory.status,200);
  const initialJob=(await initialHistory.json()).data.jobs.find((row:{jobId:string})=>row.jobId===delivered.job.id);
  assert.ok(initialJob);
  assert.equal(initialJob.codCashDeclaration,undefined);
  assert.equal((await post(delivered.job.id,undefined,"cod-no-auth-key-01")).status,401);
  assert.equal((await post(delivered.job.id,admin,"cod-admin-key-001")).status,403);
  assert.equal((await post(delivered.job.id,stranger,"cod-foreign-key01")).status,404);
  assert.equal((await post(delivered.job.id,rider,"cod-bad-amount-001",{...evidence,amountMinor:2099})).status,422);
  assert.equal((await post(delivered.job.id,rider,"cod-bad-note-001",{...evidence,note:"short"})).status,400);
  assert.equal((await db.codCashDeclaration.count()),0);
  const [a,b]=await Promise.all([
    post(delivered.job.id,rider,"cod-retry-same-key01"),
    post(delivered.job.id,rider,"cod-retry-same-key01"),
  ]);
  assert.equal(a.status,200,JSON.stringify(a.body));
  assert.equal(b.status,200,JSON.stringify(b.body));
  assert.equal(a.body.data.id,b.body.data.id);
  assert.equal(codCashDeclarationViewSchema.safeParse(a.body.data).success,true);
  assert.equal(a.body.data.status,"rider_declared_unverified");
  assert.equal(a.body.data.supervisorVerified,false);
  assert.equal(a.body.data.remitted,false);
  assert.equal(a.body.data.paymentStatusChanged,false);
  assert.equal((await db.codCashDeclaration.count()),1);
  assert.equal((await db.auditEvent.count({where:{action:"cod.rider_cash_declared"}})),1);
  assert.equal((await db.outboxEvent.count({where:{type:"cod.rider_cash_declared"}})),1);
  assert.equal((await post(delivered.job.id,rider,"cod-retry-same-key01",{...evidence,note:"Changed note is a new command"})).status,409);
  assert.equal((await post(delivered.job.id,rider,"cod-different-key01")).status,409);
  const order=await db.order.findUniqueOrThrow({where:{id:delivered.order.id}});
  assert.equal(order.paymentStatus,"unpaid");
  assert.equal(order.totalMinor,2100);
  assert.equal(await db.paymentAttempt.count(),0);
  assert.equal(await db.refund.count(),0);
  const list=await fetch(base+"/api/v1/admin/dispatch/cod-exceptions",{headers:{authorization:`Bearer ${admin}`}});
  assert.equal(list.status,200);
  const report=(await list.json()).data;
  assert.equal(report.items.find((x:{orderId:string})=>x.orderId===order.id).collectionEvidence,"rider_declared_unverified");
  assert.equal(report.items.find((x:{orderId:string})=>x.orderId===order.id).remittanceEvidence,"not_recorded_in_variety");
  assert.equal(JSON.stringify(report).includes("Sensitive Customer"),false);
  // The same REAL rider sees the persisted unverified declaration after
  // signing in again; no note, actor ID or remittance status is exposed.
  const history=await fetch(base+"/api/v1/rider/jobs?scope=history",{
    headers:{authorization:`Bearer ${rider}`},
  });
  assert.equal(history.status,200);
  const historyBody=(await history.json()).data;
  const historyJob=historyBody.jobs.find((row:{jobId:string})=>row.jobId===delivered.job.id);
  assert.ok(historyJob);
  assert.equal(historyJob.codCashDeclaration.status,"rider_declared_unverified");
  assert.equal(historyJob.codCashDeclaration.amountMinor,2100);
  assert.match(historyJob.codCashDeclaration.declaredAt,/^\d{4}-\d{2}-\d{2}T/);
  assert.equal(JSON.stringify(historyJob.codCashDeclaration).includes(evidence.note),false);
  assert.equal(JSON.stringify(historyJob.codCashDeclaration).includes(delivered.rider.u.id),false);
  assert.equal(historyJob.paymentStatus,"unpaid");
  assert.equal(historyJob.codDueMinor,2100);
});

test("COD declaration blocked for incomplete or electronically-paid deliveries and cannot be tampered through SQL",async()=>{
  const pending=await createDelivery("incomplete",{delivered:false});
  const tokenPending=await token(pending.rider.u.email!);
  assert.equal((await post(pending.job.id,tokenPending,"cod-pending-key01")).status,409);
  const paid=await createDelivery("already-paid",{paymentStatus:"succeeded"});
  const tokenPaid=await token(paid.rider.u.email!);
  assert.equal((await post(paid.job.id,tokenPaid,"cod-paid-key0001")).status,409);
  const good=await createDelivery("immutable");
  const tokenGood=await token(good.rider.u.email!);
  const created=await post(good.job.id,tokenGood,"cod-immutable-key01");
  assert.equal(created.status,200);
  await assert.rejects(db.codCashDeclaration.update({where:{id:created.body.data.id},data:{amountMinor:1}}));
  await assert.rejects(db.codCashDeclaration.delete({where:{id:created.body.data.id}}));
  await assert.rejects(db.codCashDeclaration.create({data:{
    deliveryJobId:pending.job.id,orderId:pending.order.id,riderProfileId:pending.rider.profile.id,
    declaredByUserId:pending.rider.u.id,amountMinor:2100,cashCountConfirmed:true,
    riderPossessionConfirmed:true,note:evidence.note,requestId:"bypass-provenance",
  }}));
  assert.equal((await db.codCashDeclaration.count()),1);
  assert.equal((await db.order.findUniqueOrThrow({where:{id:good.order.id}})).paymentStatus,"unpaid");
});

test("OpenAPI documents COD declaration as rider-only, feature gated, replay-protected, never a payment-settlement endpoint",async()=>{
  const r=await fetch(base+"/api/v1/openapi.json"); assert.equal(r.status,200);
  const doc=await r.json();
  assert.equal(Object.keys(doc.paths).length,165);
  const op=doc.paths["/api/v1/rider/jobs/{jobId}/cod-cash-declaration"]?.post;
  assert.ok(op);
  assert.deepEqual(op.security,[{cookieAuth:[]},{bearerAuth:[]}]);
  assert.ok(op.parameters.some((p:{name:string;required:boolean})=>p.name==="Idempotency-Key"&&p.required));
  assert.equal(op.requestBody.content["application/json"].schema.$ref,"#/components/schemas/CodCashDeclarationRequest");
  assert.equal(op.responses["200"].content["application/json"].schema.$ref,"#/components/schemas/CodCashDeclarationViewEnvelope");
  assert.equal(doc.paths["/api/v1/cod/remittances"],undefined);
});
