import {before,after,beforeEach,test} from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import type {INestApplication} from "@nestjs/common";
import {createApplication} from "../src/bootstrap";
import {readConfig} from "../src/config";
import {Database} from "../src/database/database";
import {CustomerReturnClaimsService} from "../src/customer-return-claims/customer-return-claims.service";
import {commerceTestPassword,seedCommerceFixtures} from "./commerce-fixtures";

let app:INestApplication,db:Database,service:CustomerReturnClaimsService,base:string;
const env=()=>readConfig({
  DATABASE_URL:process.env.DATABASE_URL!,WEB_ORIGINS:"http://localhost:3000",
  API_STOCK_LOCATION_ID:"loc_accra",API_INSECURE_COOKIES:"true",
  CUSTOMER_RETURN_CLAIMS_ENABLED:"true",
});
async function fixture(tag:string,complete=true){
  const id="claim-"+tag+"-"+randomUUID().slice(0,8);
  await db.order.create({data:{
    id,reference:"VGR-CLAIM-"+tag+"-"+randomUUID().slice(0,5),
    customerUserId:"customer-a",customerName:"Customer",customerPhone:"+233241234567",
    fulfilment:"delivery",paymentMethod:"mobile_money",paymentStatus:"succeeded",
    fulfilmentStatus:complete?"delivered":"dispatched",
    deliveryStatus:complete?"delivered":"out_for_delivery",
    stockConsumedAt:new Date(),subtotalMinor:750,totalMinor:750,
    verificationKeyVersion:1,verificationCodeHash:"b".repeat(64),
    lines:{create:[
      {id:id+"-rice",variantId:"var-rice",productId:"product-rice",
        productName:"Test Rice",variantName:"Weighted rice",unit:"kg",
        quantity:"2",unitPriceMinor:250,lineTotalMinor:500},
      {id:id+"-salt",variantId:"var-salt",productId:"product-salt",
        productName:"Test Salt",variantName:"Salt pack",unit:"piece",
        quantity:"2",unitPriceMinor:125,lineTotalMinor:250},
    ]},
  }});
  await db.reservation.createMany({data:[
    {id:id+"-res-rice",positionId:"pos-rice",lotId:"lot-rice",
      claimType:"order",claimId:id,claimLineId:id+"-rice",quantity:"2",state:"consumed",
      expiresAt:new Date(Date.now()+3600000)},
    {id:id+"-res-salt",positionId:"pos-salt",lotId:"lot-salt",
      claimType:"order",claimId:id,claimLineId:id+"-salt",quantity:"2",state:"consumed",
      expiresAt:new Date(Date.now()+3600000)},
  ]});
  const dep=await db.stockDepletion.create({data:{
    claimType:"order",claimId:id,locationId:"loc_accra",kind:"dispatch_handover",
    actorId:"admin-commerce",requestId:"claim-fixture-"+tag,
  }});
  await db.stockDepletionLine.createMany({data:[
    {depletionId:dep.id,reservationId:id+"-res-rice",claimLineId:id+"-rice",
      variantId:"var-rice",lotId:"lot-rice",quantity:"2",lotQuantityBefore:"20",lotQuantityAfter:"18"},
    {depletionId:dep.id,reservationId:id+"-res-salt",claimLineId:id+"-salt",
      variantId:"var-salt",lotId:"lot-salt",quantity:"2",lotQuantityBefore:"10",lotQuantityAfter:"8"},
  ]});
  return id;
}
const body=(id:string,qty="1",line="rice")=>({
  orderId:id,reason:"This delivered item is not what I ordered",
  evidenceNote:"Original packaging and the received product are available for review",
  lines:[{orderLineId:id+"-"+line,quantity:qty,
    reason:"The customer reports a mismatch with the ordered item"}],
});
async function token(email:string){
  const r=await fetch(base+"/api/v1/auth/sessions",{method:"POST",
    headers:{"content-type":"application/json",origin:"http://localhost:3000"},
    body:JSON.stringify({email,password:commerceTestPassword,client:"native"})});
  assert.equal(r.status,201);return (await r.json()).data.accessToken as string;
}
async function http(method:"GET"|"POST",path:string,bearer?:string,payload?:unknown,key="claim-test-replay"){
  const r=await fetch(base+"/api/v1"+path,{method,headers:{
    ...(bearer?{authorization:"Bearer "+bearer}:{}),
    ...(method==="POST"?{"content-type":"application/json","idempotency-key":key}:{}),
  },...(method==="POST"?{body:JSON.stringify(payload)}:{})});
  return {status:r.status,data:await r.json()};
}
before(async()=>{
  if(!new URL(process.env.DATABASE_URL!).pathname.endsWith("variety_foundation_test"))
    throw Error("Use an isolated customer claim test database");
  app=await createApplication(env());await app.listen(0,"127.0.0.1");
  base=await app.getUrl();db=app.get(Database);service=app.get(CustomerReturnClaimsService);
});
beforeEach(async()=>{await seedCommerceFixtures(db);});
after(async()=>{await app?.close();});

test("completed customer-owned order creates request only; no stock or payment changes",async()=>{
  const id=await fixture("CREATE");
  const stock=await db.stockLot.findMany({select:{id:true,quantity:true}});
  const r=await service.create("customer-a","create","create-req",body(id,"1.25"));
  assert.equal(r.status,"requested");assert.equal(r.lines[0]?.quantity,"1.25");
  assert.ok(r.reference.startsWith("VGRQ-"));
  assert.ok(!JSON.stringify(r).includes("+233241234567"));
  const available=await service.eligibility("customer-a",id);
  assert.equal(available.lines[0]?.availableQuantity,"0.75");
  assert.equal(await db.refund.count(),0);
  assert.equal(await db.paymentAttempt.count(),0);
  assert.equal(await db.stockReceipt.count(),0);
  assert.equal(await db.stockMovement.count(),0);
  assert.deepEqual(
    (await db.stockLot.findMany({select:{id:true,quantity:true}})).map(x=>x.quantity.toString()),
    stock.map(x=>x.quantity.toString()),
  );
});

test("another customer cannot request, see or inspect someone else's completed order",async()=>{
  const id=await fixture("AUTH");
  const owner=await token("customer-a@example.test");
  const stranger=await token("customer-b@example.test");
  const admin=await token("admin-commerce@example.test");
  assert.equal((await http("GET","/account/return-claims")).status,401);
  assert.equal((await http("GET","/account/return-claims",admin)).status,403);
  assert.equal((await http("POST","/account/return-claims",stranger,body(id),"wrong-owner")).status,404);
  assert.equal((await http("POST","/account/return-claims",owner,{...body(id),refundMinor:100},"injection")).status,400);
  const real=await http("POST","/account/return-claims",owner,body(id),"valid-owner");
  assert.equal(real.status,200,JSON.stringify(real.data));
  const claimId=real.data.data.id;
  assert.equal((await http("GET","/account/return-claims/"+claimId,stranger)).status,404);
  assert.equal((await http("GET","/account/return-claims/orders/"+id+"/eligibility",stranger)).status,404);
  assert.equal((await http("GET","/account/return-claims/"+claimId,owner)).status,200);
});

test("quantity cap is shared across partial claims and final decisions; no over-returns",async()=>{
  const id=await fixture("PARTIAL");
  const a=await service.create("customer-a","partial-a","partial-a-req",body(id,"1.5"));
  assert.equal(a.status,"requested");
  await service.create("customer-a","partial-b","partial-b-req",body(id,"0.5"));
  await assert.rejects(()=>service.create("customer-a","partial-excess","partial-excess-req",body(id,"0.001")),
    (e:any)=>e?.getStatus?.()===409);
  assert.equal((await service.eligibility("customer-a",id)).lines[0]?.availableQuantity,"0");
  assert.equal(await db.customerReturnClaim.count(),2);
});

test("customer can cancel only a pending claim, freeing verified quantity",async()=>{
  const id=await fixture("CANCEL");
  const claim=await service.create("customer-a","initial","initial-req",body(id,"2"));
  const cancelled=await service.cancel("customer-a",claim.id,"cancel","cancel-req");
  assert.equal(cancelled.status,"cancelled");
  assert.deepEqual(await service.cancel("customer-a",claim.id,"cancel","cancel-req"),cancelled);
  await assert.rejects(()=>service.cancel("customer-a",claim.id,"other-key","other-req"),
    (e:any)=>e?.getStatus?.()===409);
  assert.equal((await service.eligibility("customer-a",id)).lines[0]?.availableQuantity,"2");
  assert.equal((await service.create("customer-a","reclaimed","reclaimed-req",body(id,"2"))).status,"requested");
});

test("admin accept/reject is final and replay-safe; no refund, COD or physical receipt",async()=>{
  const id=await fixture("DECISION");
  const claim=await service.create("customer-a","submit","submit-req",body(id));
  const args={decision:"accept" as const,
    reviewNote:"This request is accepted for a separate staff inspection of actual goods."};
  const accepted=await service.decide("admin-commerce",claim.id,"approve","approve-req",args);
  assert.equal(accepted.status,"accepted");
  assert.deepEqual(await service.decide("admin-commerce",claim.id,"approve","approve-req",args),accepted);
  await assert.rejects(()=>service.decide("admin-commerce",claim.id,"other","other-req",{
    decision:"reject",reviewNote:"Cannot reverse the completed staff decision."}),
    (e:any)=>e?.getStatus?.()===409);
  assert.equal(await db.refund.count(),0);
  assert.equal(await db.physicalReturnReceipt.count(),0);
  assert.equal(await db.stockMovement.count(),0);
  const other=await service.create("customer-a","other-line","other-line-req",body(id,"1","salt"));
  const rejected=await service.decide("admin-commerce",other.id,"reject","reject-req",{
    decision:"reject",reviewNote:"The return request does not pass the staff's eligibility review."});
  assert.equal(rejected.status,"rejected");
  assert.equal((await service.eligibility("customer-a",id)).lines.find(x=>x.orderLineId===id+"-salt")?.availableQuantity,"2");
});

test("undelivered or piece-fraction returns are rejected before claiming anything",async()=>{
  const incomplete=await fixture("INCOMPLETE",false);
  await assert.rejects(()=>service.create("customer-a","before-delivery","before-req",
    body(incomplete)),(e:any)=>e?.getStatus?.()===422);
  const completed=await fixture("FRACTION");
  await assert.rejects(()=>service.create("customer-a","fraction","fraction-req",
    body(completed,"0.5","salt")),(e:any)=>e?.getStatus?.()===400);
  assert.equal(await db.customerReturnClaim.count(),0);
});

test("competing concurrent requests for more than the stock-depleted quantity permit only one",async()=>{
  const id=await fixture("RACE");
  const settled=await Promise.allSettled([
    service.create("customer-a","race-a","race-a-req",body(id,"1.5")),
    service.create("customer-a","race-b","race-b-req",body(id,"1.5")),
  ]);
  assert.equal(settled.filter(x=>x.status==="fulfilled").length,1);
  assert.equal(await db.customerReturnClaim.count(),1);
  assert.equal(await db.refund.count(),0);
});

test("direct SQL cannot forge empty request, edit quantities or undo a terminal review",async()=>{
  const id=await fixture("FORGERY");
  await assert.rejects(()=>db.customerReturnClaim.create({data:{
    reference:"FORGED-NO-LINES",orderId:id,customerUserId:"customer-a",
    reason:"No actual goods are being claimed for return",
  }}));
  const r=await service.create("customer-a","real-request","real-req",body(id));
  await assert.rejects(()=>db.customerReturnClaimLine.update({
    where:{claimId_orderLineId:{claimId:r.id,orderLineId:id+"-rice"}},
    data:{quantity:"999"},
  }));
  await assert.rejects(()=>db.customerReturnClaim.delete({where:{id:r.id}}));
  await assert.rejects(()=>db.customerReturnClaimLine.create({data:{
    claimId:r.id,orderLineId:id+"-salt",quantity:"1",
    reason:"Late addition to claim must not be allowed",
  }}));
  await service.decide("admin-commerce",r.id,"reject","reject-req",{
    decision:"reject",reviewNote:"Staff rejected this request after a separate review.",
  });
  await assert.rejects(()=>db.customerReturnClaim.update({where:{id:r.id},
    data:{status:"accepted",reviewNote:"Forbidden terminal rewrite"}}));
});

test("disabled customer authority reports closed and cannot create requests",async()=>{
  const id=await fixture("FEATURE-OFF");
  const off=await createApplication(readConfig({
    DATABASE_URL:process.env.DATABASE_URL!,WEB_ORIGINS:"http://localhost:3000",
    API_STOCK_LOCATION_ID:"loc_accra",API_INSECURE_COOKIES:"true",
    CUSTOMER_RETURN_CLAIMS_ENABLED:"false",
  }));
  try{
    const closed=off.get(CustomerReturnClaimsService);
    assert.equal((await closed.list("customer-a",1,20)).enabled,false);
    await assert.rejects(()=>closed.create("customer-a","closed","closed-req",body(id)),
      (e:any)=>e?.getStatus?.()===503);
  }finally{await off.close();}
  assert.equal(await db.customerReturnClaim.count(),0);
});

test("HTTP staff decision has strict admin-only role and cannot carry a refund amount",async()=>{
  const id=await fixture("STAFF");
  const r=await service.create("customer-a","staff-inbox","staff-inbox-req",body(id));
  const customer=await token("customer-a@example.test");
  const admin=await token("admin-commerce@example.test");
  const path="/admin/return-claims/"+r.id+"/decision";
  assert.equal((await http("GET","/admin/return-claims",customer)).status,403);
  assert.equal((await http("POST",path,customer,{
    decision:"accept",reviewNote:"Customer cannot authorize their own return",
  },"wrong-role")).status,403);
  assert.equal((await http("POST",path,admin,{
    decision:"accept",reviewNote:"short",
  },"bad-note")).status,400);
  assert.equal((await http("POST",path,admin,{
    decision:"accept",reviewNote:"Approved only for physical inspection by staff",
    refundMinor:100,
  },"bad-money")).status,400);
  const decision=await http("POST",path,admin,{
    decision:"accept",reviewNote:"Verified for further inspection; no money is authorized.",
  },"good-accept");
  assert.equal(decision.status,200,JSON.stringify(decision.data));
  assert.equal(decision.data.data.status,"accepted");
  assert.equal(await db.refund.count(),0);
});
