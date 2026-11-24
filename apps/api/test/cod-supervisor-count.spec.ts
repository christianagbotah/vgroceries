import { after, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import type { INestApplication } from "@nestjs/common";
import {
  codSupervisorCountRequestSchema, codSupervisorCountViewSchema, codExceptionInboxSchema,
} from "@variety/contracts";
import { createApplication } from "../src/bootstrap";
import { readConfig } from "../src/config";
import { Database } from "../src/database/database";
import { CodSupervisorCountService } from "../src/dispatch/cod-supervisor-count.service";
import { ApiProblem } from "../src/http/errors";
import { commerceTestPassword, seedCommerceFixtures } from "./commerce-fixtures";

const env = (enabled=true) => readConfig({
  DATABASE_URL:process.env.DATABASE_URL!, WEB_ORIGINS:"http://localhost:3000",
  API_STOCK_LOCATION_ID:"loc_accra", API_INSECURE_COOKIES:"true",
  COMMERCE_LOCATION_ID:"loc_accra", CHECKOUT_PAYMENT_HOLD_MINUTES:"15",
  CHECKOUT_OFFLINE_HOLD_MINUTES:"1440", GUEST_CHECKOUT_TTL_MINUTES:"1440",
  ORDER_VERIFICATION_ACTIVE_VERSION:"1",
  ORDER_VERIFICATION_KEYS:JSON.stringify({1:"11".repeat(32)}),
  COD_CASH_DECLARATIONS_ENABLED:"true",
  COD_SUPERVISOR_COUNT_ENABLED:enabled?"true":"false",
});
const countBody = { amountMinor:2100, physicalCashPresentConfirmed:true,
  independentCountConfirmed:true,
  note:"I independently witnessed and physically counted the notes." } as const;
let app:INestApplication,db:Database,base:string;
before(async()=>{app=await createApplication(env());await app.listen(0,"127.0.0.1");
  base=await app.getUrl();db=app.get(Database);});
beforeEach(async()=>seedCommerceFixtures(db));
after(async()=>app?.close());

async function token(email:string) {
  const r=await fetch(base+"/api/v1/auth/sessions",{method:"POST",
    headers:{"content-type":"application/json",origin:"http://localhost:3000"},
    body:JSON.stringify({email,password:commerceTestPassword,client:"native"})});
  assert.equal(r.status,201);
  return (await r.json()).data.accessToken as string;
}
async function post(declarationId:string, bearer:string|undefined, key:string, body:unknown=countBody) {
  const r=await fetch(`${base}/api/v1/admin/dispatch/cod-declarations/${declarationId}/supervisor-counts`,{
    method:"POST",headers:{"content-type":"application/json",
      ...(key?{"idempotency-key":key}:{}),
      ...(bearer?{authorization:`Bearer ${bearer}`}:{})},
    body:JSON.stringify(body),
  });
  return {status:r.status,body:await r.json()};
}
async function createUnpaidDeclaredDelivery(name:string) {
  const main=await db.user.findUniqueOrThrow({where:{id:"admin-commerce"}});
  const rider=await db.user.create({data:{email:`cod-review-rider-${name}@example.test`,
    name:"Review Rider",passwordHash:main.passwordHash,role:"rider"}});
  const riderProfile=await db.riderProfile.create({data:{userId:rider.id,phone:"+233241234578",
    kind:"in_house",vehicle:"motorcycle",availabilityState:"available",
    lastAvailabilityChangedAt:new Date()}});
  const order=await db.order.create({data:{
    reference:`VG-COD-SUPERVISOR-${name}`,customerUserId:"customer-a",
    customerName:"Sensitive Buyer",customerPhone:"+233241112233",
    fulfilment:"delivery",zoneId:"zone-required",paymentMethod:"cash_on_delivery",
    paymentStatus:"unpaid",fulfilmentStatus:"dispatched",deliveryStatus:"unassigned",
    subtotalMinor:2100,deliveryFeeMinor:0,totalMinor:2100,
    verificationKeyVersion:1,verificationCodeHash:"4".repeat(64),
    stockConsumedAt:new Date(Date.now()-60000),
  }});
  await db.fulfilmentRun.create({data:{orderId:order.id,locationId:"loc_accra",
    handoverKind:"dispatch",handedOverBy:main.id,handedOverAt:new Date(Date.now()-30000)}});
  const job=await db.deliveryJob.create({data:{
    orderId:order.id,assignmentKind:"rider",riderProfileId:riderProfile.id,
    status:"assigned",custodyState:"dispatch",assignedBy:main.id,assignedAt:new Date(),
  }});
  await db.deliveryProof.create({data:{deliveryJobId:job.id,method:"signature",
    reference:`COD-COUNT-PROOF-${name}`,recordedByKind:"rider",recordedById:rider.id,recordedAt:new Date()}});
  await db.deliveryJob.update({where:{id:job.id},
    data:{status:"delivered",custodyState:"customer",deliveredAt:new Date()}});
  await db.order.update({where:{id:order.id},
    data:{deliveryStatus:"delivered",fulfilmentStatus:"delivered"}});
  const declaration=await db.codCashDeclaration.create({data:{
    orderId:order.id,deliveryJobId:job.id,riderProfileId:riderProfile.id,
    declaredByUserId:rider.id,amountMinor:2100,cashCountConfirmed:true,
    riderPossessionConfirmed:true,note:"I counted and hold exact physical cash.",
    requestId:"review-declaration-source",
  }});
  return {order,job,declaration,rider};
}
async function secondAdmin() {
  const main=await db.user.findUniqueOrThrow({where:{id:"admin-commerce"}});
  return db.user.create({data:{email:"cod-independent-admin@example.test",
    name:"Independent Second Reviewer",passwordHash:main.passwordHash,role:"admin"}});
}
async function reviewInboxRow(bearer:string,orderId:string) {
  const res=await fetch(base+"/api/v1/admin/dispatch/cod-exceptions?phase=delivered&evidence=rider_declared_unverified",{
    headers:{authorization:`Bearer ${bearer}`},
  });
  assert.equal(res.status,200);
  const data=(await res.json()).data;
  assert.equal(codExceptionInboxSchema.safeParse(data).success,true);
  const row=data.items.find((item:{orderId:string})=>item.orderId===orderId);
  assert.ok(row,"the verified rider COD order must be in the exception queue");
  return {row,data};
}

test("D2 supervisor review remains disabled by default and rejects unsafe configuration",async()=>{
  assert.equal(readConfig({DATABASE_URL:"postgresql://user:pass@localhost/test",
    WEB_ORIGINS:"http://localhost:3000",API_STOCK_LOCATION_ID:"loc_accra"})
    .codSupervisorCountEnabled,false);
  for(const bad of ["yes","1","TRUE"]){
    assert.throws(()=>readConfig({DATABASE_URL:"postgresql://user:pass@localhost/test",
      WEB_ORIGINS:"http://localhost:3000",API_STOCK_LOCATION_ID:"loc_accra",
      COD_SUPERVISOR_COUNT_ENABLED:bad}),/COD_SUPERVISOR_COUNT_ENABLED/);
  }
  assert.throws(()=>readConfig({DATABASE_URL:"postgresql://user:pass@localhost/test",
    WEB_ORIGINS:"http://localhost:3000",API_STOCK_LOCATION_ID:"loc_accra",
    COD_SUPERVISOR_COUNT_ENABLED:"true"}),/requires COD_CASH_DECLARATIONS_ENABLED/);
  await assert.rejects(new CodSupervisorCountService(db,env(false)).observe(
    "admin-commerce","missing","cod-count-disabled-001","request",countBody),
    (e:unknown)=>e instanceof ApiProblem&&e.getStatus()===503);
  assert.equal(codSupervisorCountRequestSchema.safeParse(countBody).success,true);
  for(const bad of [{...countBody,amountMinor:-1},{...countBody,amountMinor:1.5},
    {...countBody,physicalCashPresentConfirmed:false},
    {...countBody,independentCountConfirmed:false},{...countBody,note:"short"},
    {...countBody,orderId:"fake"}])
    assert.equal(codSupervisorCountRequestSchema.safeParse(bad).success,false);
});

test("two DIFFERENT admins may independently count; replay never duplicates, agreement is NOT cash receipt",async()=>{
  const {order,declaration,rider}=await createUnpaidDeclaredDelivery("matching");
  const other=await secondAdmin();
  const first=await token("admin-commerce@example.test");
  const second=await token(other.email!);
  const customer=await token("customer-a@example.test");
  const riderToken=await token(rider.email!);
  const id=declaration.id;
  assert.equal((await post(id,undefined,"review-no-session01")).status,401);
  assert.equal((await post(id,customer,"review-customer01")).status,403);
  assert.equal((await post(id,riderToken,"review-rider001")).status,403);
  assert.equal((await post(id,first,"",countBody)).status,400);
  assert.equal((await post(id,first,"review-invalid001",{...countBody,physicalCashPresentConfirmed:false})).status,400);
  const [a,b]=await Promise.all([post(id,first,"review-first-same01"),post(id,first,"review-first-same01")]);
  assert.equal(a.status,200,JSON.stringify(a.body));assert.equal(b.status,200,JSON.stringify(b.body));
  assert.deepEqual(a.body.data,b.body.data);
  assert.equal(a.body.data.sequence,1);
  assert.equal(a.body.data.status,"first_count_recorded_unverified");
  assert.equal(codSupervisorCountViewSchema.safeParse(a.body.data).success,true);
  assert.equal(a.body.data.cashAccepted,false);
  assert.equal(a.body.data.paymentStatusChanged,false);
  assert.equal(a.body.data.remitted,false);
  const firstReview=(await reviewInboxRow(first,order.id)).row;
  assert.equal(firstReview.supervisorCountReview.status,"first_count_recorded_unverified");
  assert.deepEqual(firstReview.supervisorCountReview.observations,[{
    sequence:1,amountMinor:2100,recordedAt:a.body.data.recordedAt,
  }]);
  assert.equal(firstReview.supervisorCountReview.cashAccepted,false);
  assert.equal((await post(id,first,"review-first-same01",{...countBody,amountMinor:2099})).status,409);
  assert.equal((await post(id,first,"review-repeat-actor01")).status,409);
  const c=await post(id,second,"review-second-actor01");
  assert.equal(c.status,200,JSON.stringify(c.body));
  assert.equal(c.body.data.sequence,2);
  assert.equal(c.body.data.status,"dual_count_agreed_unverified");
  assert.equal(c.body.data.cashAccepted,false);
  const {row:review,data:reviewData}=await reviewInboxRow(first,order.id);
  assert.equal(review.supervisorCountReview.status,"dual_count_agreed_unverified");
  assert.deepEqual(review.supervisorCountReview.observations,[
    {sequence:1,amountMinor:2100,recordedAt:a.body.data.recordedAt},
    {sequence:2,amountMinor:2100,recordedAt:c.body.data.recordedAt},
  ]);
  assert.equal(review.remittanceEvidence,"not_recorded_in_variety");
  assert.equal(reviewData.totalOrderFaceValueMinor,2100);
  const leaked=JSON.stringify(reviewData);
  for(const field of ["reviewerUserId","independentCountConfirmed","physicalCashPresentConfirmed",countBody.note,"Sensitive Buyer","+233241112233"])
    assert.equal(leaked.includes(field),false,`private supervisor record leaked: ${field}`);
  assert.equal(codExceptionInboxSchema.safeParse({...reviewData,items:[{...review,supervisorCountReview:{...review.supervisorCountReview,status:"count_disagreement_requires_review"}}]}).success,false);
  assert.equal(codExceptionInboxSchema.safeParse({...reviewData,items:[{...review,supervisorCountReview:{...review.supervisorCountReview,cashAccepted:true}}]}).success,false);
  assert.equal(codExceptionInboxSchema.safeParse({...reviewData,items:[{...review,supervisorCountReview:{...review.supervisorCountReview,observations:[{sequence:2,amountMinor:2100,recordedAt:c.body.data.recordedAt}]}}]}).success,false);
  assert.equal((await post(id,second,"review-third-count01")).status,409);
  assert.equal((await db.codSupervisorCount.count({where:{declarationId:id}})),2);
  assert.equal((await db.auditEvent.count({where:{action:"cod.supervisor_cash_count_attested"}})),2);
  assert.equal((await db.outboxEvent.count({where:{type:"cod.supervisor_cash_count_attested"}})),2);
  const orderAfter=await db.order.findUniqueOrThrow({where:{id:order.id}});
  assert.equal(orderAfter.paymentStatus,"unpaid");
  assert.equal(orderAfter.stockConsumedAt?.getTime(),order.stockConsumedAt?.getTime());
  assert.equal((await db.paymentAttempt.count()),0);
  assert.equal((await db.refund.count()),0);
  const raw=JSON.stringify(c.body.data);
  for(const pii of ["Sensitive Buyer","+233241112233",countBody.note,"reviewerUserId"])
    assert.equal(raw.includes(pii),false);
  const row=await db.codSupervisorCount.findFirstOrThrow({where:{declarationId:id}});
  await assert.rejects(db.codSupervisorCount.update({where:{id:row.id},data:{amountMinor:0}}));
  await assert.rejects(db.codSupervisorCount.delete({where:{id:row.id}}));
});

test("disagreement is explicit, untrusted direct SQL and duplicate same-reviewer evidence are rejected",async()=>{
  const {declaration,rider,order}=await createUnpaidDeclaredDelivery("disagreement");
  const other=await secondAdmin();
  const first=await token("admin-commerce@example.test");
  const second=await token(other.email!);
  assert.equal((await post(declaration.id,first,"review-mismatch-first01")).status,200);
  const mismatch=await post(declaration.id,second,"review-mismatch-second01",
    {...countBody,amountMinor:1999});
  assert.equal(mismatch.status,200,JSON.stringify(mismatch.body));
  assert.equal(mismatch.body.data.status,"count_disagreement_requires_review");
  assert.equal(mismatch.body.data.cashAccepted,false);
  const mismatchInbox=(await reviewInboxRow(first,order.id)).row;
  assert.equal(mismatchInbox.supervisorCountReview.status,"count_disagreement_requires_review");
  assert.deepEqual(mismatchInbox.supervisorCountReview.observations.map((x:{amountMinor:number})=>x.amountMinor),[2100,1999]);
  assert.equal(mismatchInbox.supervisorCountReview.cashAccepted,false);
  assert.equal((await db.order.findUniqueOrThrow({where:{id:order.id}})).paymentStatus,"unpaid");
  await assert.rejects(db.codSupervisorCount.create({data:{
    declarationId:declaration.id,reviewerUserId:rider.id,sequence:2,
    amountMinor:2100,physicalCashPresentConfirmed:true,
    independentCountConfirmed:true,note:countBody.note,requestId:"forged-rider",
  }}));
  await assert.rejects(db.codSupervisorCount.create({data:{
    declarationId:declaration.id,reviewerUserId:other.id,sequence:2,
    amountMinor:2100,physicalCashPresentConfirmed:false,
    independentCountConfirmed:true,note:countBody.note,requestId:"forged-attestation",
  }}));
  assert.equal((await db.codSupervisorCount.count()),2);
});

test("OpenAPI exposes gated count observation without a merchant collection, remittance or settlement route",async()=>{
  const r=await fetch(base+"/api/v1/openapi.json");assert.equal(r.status,200);
  const doc=await r.json();
  const op=doc.paths["/api/v1/admin/dispatch/cod-declarations/{declarationId}/supervisor-counts"]?.post;
  assert.ok(op);
  assert.deepEqual(op.security,[{cookieAuth:[]},{bearerAuth:[]}]);
  assert.ok(op.parameters.some((p:{name:string;required:boolean})=>p.name==="Idempotency-Key"&&p.required));
  assert.equal(op.requestBody.content["application/json"].schema.$ref,"#/components/schemas/CodSupervisorCountRequest");
  assert.equal(op.responses["200"].content["application/json"].schema.$ref,"#/components/schemas/CodSupervisorCountViewEnvelope");
  assert.equal(doc.paths["/api/v1/cod/collections"],undefined);
  assert.equal(doc.paths["/api/v1/cod/remittances"],undefined);
  assert.equal(Object.keys(doc.paths).length,164);
});
