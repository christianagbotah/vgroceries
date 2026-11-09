import {after,before,beforeEach,test} from "node:test";
import type { PhysicalReturnReceive } from "@variety/contracts";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import type {INestApplication} from "@nestjs/common";
import {createApplication} from "../src/bootstrap";
import {readConfig} from "../src/config";
import {Database} from "../src/database/database";
import {PhysicalReturnsService} from "../src/physical-returns/physical-returns.service";
import {commerceTestPassword,seedCommerceFixtures} from "./commerce-fixtures";

let app:INestApplication,db:Database,service:PhysicalReturnsService,base:string;
const env=()=>readConfig({
  DATABASE_URL:process.env.DATABASE_URL!,WEB_ORIGINS:"http://localhost:3000",
  API_STOCK_LOCATION_ID:"loc_accra",API_INSECURE_COOKIES:"true",
  PHYSICAL_RETURNS_INTAKE_ENABLED:"true",
});
const body=(id:string,qty="1"):PhysicalReturnReceive=>({
  orderId:id,reason:"Customer returned an item",
  evidenceNote:"Staff physically received sealed package from customer",
  lines:[{orderLineId:id+"-rice",quantity:qty,condition:"sealed"}],
});
async function fixture(tag:string,complete=true,paid=true) {
  const id="return-"+tag+"-"+randomUUID().slice(0,8);
  await db.order.create({data:{
    id,reference:"VG-RETURN-"+tag+"-"+randomUUID().slice(0,5),
    customerUserId:"customer-a",customerName:"Ama Customer",
    customerPhone:"+233241111111",fulfilment:"delivery",
    paymentMethod:paid?"mobile_money":"cash_on_delivery",
    paymentStatus:paid?"succeeded":"unpaid",
    fulfilmentStatus:complete?"delivered":"dispatched",deliveryStatus:complete?"delivered":"out_for_delivery",
    stockConsumedAt:new Date(),subtotalMinor:750,totalMinor:750,
    verificationKeyVersion:1,verificationCodeHash:"a".repeat(64),
    lines:{create:[
      {id:id+"-rice",variantId:"var-rice",productId:"product-rice",productName:"Fixture Rice",
        variantName:"Weighted rice",unit:"kg",quantity:"2.000",unitPriceMinor:250,lineTotalMinor:500},
      {id:id+"-salt",variantId:"var-salt",productId:"product-salt",productName:"Fixture Salt",
        variantName:"Salt pack",unit:"piece",quantity:"2.000",unitPriceMinor:125,lineTotalMinor:250},
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
  const depleted=await db.stockDepletion.create({data:{
    claimType:"order",claimId:id,locationId:"loc_accra",kind:"dispatch_handover",
    actorId:"admin-commerce",requestId:"physical-fixture-"+tag,
  }});
  await db.stockDepletionLine.createMany({data:[
    {depletionId:depleted.id,reservationId:id+"-res-rice",claimLineId:id+"-rice",
      variantId:"var-rice",lotId:"lot-rice",quantity:"2",
      lotQuantityBefore:"20",lotQuantityAfter:"18"},
    {depletionId:depleted.id,reservationId:id+"-res-salt",claimLineId:id+"-salt",
      variantId:"var-salt",lotId:"lot-salt",quantity:"2",
      lotQuantityBefore:"10",lotQuantityAfter:"8"},
  ]});
  return {id};
}
async function token(email:string){
  const response=await fetch(base+"/api/v1/auth/sessions",{method:"POST",
    headers:{"content-type":"application/json",origin:"http://localhost:3000"},
    body:JSON.stringify({email,password:commerceTestPassword,client:"native"})});
  assert.equal(response.status,201);
  return (await response.json()).data.accessToken as string;
}
async function request(method:"GET"|"POST",path:string,bearer?:string,payload?:unknown,key="physical-intake-001"){
  const response=await fetch(base+"/api/v1"+path,{
    method,headers:{
      ...(bearer?{authorization:"Bearer "+bearer}:{}),
      ...(method==="POST"?{"content-type":"application/json","idempotency-key":key}:{}),
    },
    ...(method==="POST"?{body:JSON.stringify(payload)}:{}),
  });
  return {status:response.status,body:await response.json()};
}
const receiving=(actor:string,id:string,key:string,quantity="1")=>
  service.receive(actor,key,"req-"+key,body(id,quantity));
before(async()=>{
  if(!new URL(process.env.DATABASE_URL!).pathname.endsWith("variety_foundation_test"))
    throw Error("Physical returns tests require an isolated PostgreSQL test DB");
  app=await createApplication(env());
  await app.listen(0,"127.0.0.1");base=await app.getUrl();
  db=app.get(Database);service=app.get(PhysicalReturnsService);
});
beforeEach(async()=>{await seedCommerceFixtures(db);});
after(async()=>{await app?.close();});

test("physical receipt requires authenticated administrator, strict body, and real source handover",async()=>{
  const x=await fixture("ACCESS");
  const admin=await token("admin-commerce@example.test");
  const customer=await token("customer-a@example.test");
  const url="/admin/physical-returns";
  assert.equal((await request("GET",url)).status,401);
  assert.equal((await request("GET",url,customer)).status,403);
  assert.equal((await request("POST",url,customer,body(x.id),"invalid-role")).status,403);
  assert.equal((await request("POST",url,admin,{...body(x.id),injected:true},"invalid-body")).status,400);
  assert.equal((await request("POST",url,admin,{...body(x.id),lines:[]},"invalid-empty")).status,400);
  const received=await request("POST",url,admin,body(x.id),"intake-received");
  assert.equal(received.status,200,JSON.stringify(received.body));
  assert.equal(received.body.data.status,"received");
  assert.equal(received.body.data.lines.length,1);
  assert.equal(received.body.data.lines[0].disposition,"awaiting_inspection");
  assert.equal(received.body.data.lines[0].quantity,"1");
  assert.ok(!JSON.stringify(received.body).includes("+233241111111"));
  const read=await request("GET",url+"/"+received.body.data.id,admin);
  assert.equal(read.status,200);
  assert.equal(read.body.data.reference,received.body.data.reference);
  assert.equal((await request("GET",url+"/"+received.body.data.id,customer)).status,403);
  const index=await request("GET",url+"?orderId="+encodeURIComponent(x.id),admin);
  assert.equal(index.body.data.total,1);
  assert.equal(index.body.data.enabled,true);
});

test("partial receipts and replays cannot ever return more than depleted order-line quantity",async()=>{
  const x=await fixture("PARTIAL");
  const before=(await db.stockLot.findUniqueOrThrow({where:{id:"lot-rice"}})).quantity.toString();
  const first=await receiving("admin-commerce",x.id,"physical-first","1.25");
  assert.equal(first.lines[0].quantity,"1.25");
  assert.deepEqual(await receiving("admin-commerce",x.id,"physical-first","1.25"),first);
  await assert.rejects(()=>receiving("admin-commerce",x.id,"physical-first","0.75"),
    (e:any)=>e?.getStatus?.()===409);
  const second=await receiving("admin-commerce",x.id,"physical-second","0.75");
  assert.equal(second.lines[0].quantity,"0.75");
  await assert.rejects(()=>receiving("admin-commerce",x.id,"physical-third","0.001"),
    (e:any)=>e?.getStatus?.()===409);
  assert.equal(await db.physicalReturnReceipt.count(),2);
  assert.equal((await db.stockLot.findUniqueOrThrow({where:{id:"lot-rice"}})).quantity.toString(),before);
  assert.equal(await db.stockMovement.count(),0);
  assert.equal(await db.refund.count(),0);
  assert.equal(await db.paymentAttempt.count(),0);
});

test("final inspection requires every line; quarantine/destroy cannot restore inventory or issue refunds",async()=>{
  const x=await fixture("INSPECTION");
  const raw:PhysicalReturnReceive={...body(x.id),lines:[
    {orderLineId:x.id+"-rice",quantity:"1",condition:"opened"},
    {orderLineId:x.id+"-salt",quantity:"2",condition:"damaged"},
  ]};
  const r=await service.receive("admin-commerce","inspect-receive","inspect-req",raw);
  const snapshot=await db.stockLot.findMany({select:{id:true,quantity:true}});
  const half={summary:"All returned goods inspected at original location",
    lines:[{itemId:r.lines[0].id,disposition:"quarantine" as const,
      note:"Opened pack retained in separate hold area"}]};
  await assert.rejects(()=>service.inspect("admin-commerce",r.id,"inspect-incomplete",
    "inspect-incomplete-req",half),(e:any)=>e?.getStatus?.()===422);
  const inspection={...half,lines:[
    {itemId:r.lines[0].id,disposition:"quarantine" as const,note:"Opened pack retained in secure quarantine"},
    {itemId:r.lines[1].id,disposition:"destroy" as const,note:"Damaged pack segregated for controlled disposal"},
  ]};
  const inspected=await service.inspect("admin-commerce",r.id,"inspect-final","inspect-final-req",inspection);
  assert.equal(inspected.status,"inspected");
  assert.deepEqual(inspected.lines.map(line=>line.disposition).sort(),["destroy","quarantine"]);
  assert.deepEqual(await service.inspect("admin-commerce",r.id,"inspect-final","inspect-final-req",inspection),inspected);
  await assert.rejects(()=>service.inspect("admin-commerce",r.id,"inspect-new","inspect-new-req",inspection),
    (e:any)=>e?.getStatus?.()===409);
  assert.deepEqual((await db.stockLot.findMany({select:{id:true,quantity:true}})).map(x=>x.quantity.toString()),
    snapshot.map(x=>x.quantity.toString()));
  assert.equal(await db.stockMovement.count(),0);
  assert.equal(await db.refund.count(),0);
  assert.equal(await db.auditEvent.count({where:{entityId:r.id}}),2);
});

test("uncompleted, forged and wrong-location returns are rejected before any receipt is stored",async()=>{
  const pending=await fixture("PENDING",false);
  await assert.rejects(()=>receiving("admin-commerce",pending.id,"not-delivered"),
    (e:any)=>e?.getStatus?.()===422);
  const good=await fixture("GOOD");
  const invalid=await request("POST","/admin/physical-returns",
    await token("admin-commerce@example.test"),
    {...body(good.id),locationId:"loc_inactive"},"forged-location");
  assert.equal(invalid.status,400);
  await assert.rejects(()=>service.receive("admin-commerce","bad-line","req-line",{
    ...body(good.id),lines:[{orderLineId:"foreign-line",quantity:"1",condition:"unknown"}],
  }),(e:any)=>e?.getStatus?.()===422);
  await assert.rejects(()=>service.receive("admin-commerce","bad-unit","req-unit",{
    ...body(good.id),lines:[{orderLineId:good.id+"-salt",quantity:"0.5",condition:"sealed"}],
  }),(e:any)=>e?.getStatus?.()===400);
  assert.equal(await db.physicalReturnReceipt.count(),0);
  assert.equal(await db.refund.count(),0);
});

test("COD paid state is not forged: physical intake is allowed after confirmed delivery",async()=>{
  const x=await fixture("COD",true,false);
  const r=await receiving("admin-commerce",x.id,"cod-received");
  assert.equal(r.status,"received");
  const o=await db.order.findUniqueOrThrow({where:{id:x.id}});
  assert.equal(o.paymentStatus,"unpaid");
  assert.equal(o.paymentMethod,"cash_on_delivery");
  assert.equal(await db.refund.count(),0);
});

test("direct SQL cannot write forged/overquantity receipt evidence or change inspected records",async()=>{
  const x=await fixture("SQL");
  const r=await receiving("admin-commerce",x.id,"sql-first","1");
  await assert.rejects(()=>db.physicalReturnItem.create({data:{
    receiptId:r.id,orderLineId:x.id+"-salt",variantId:"var-rice",
    quantity:"1",condition:"sealed",disposition:"awaiting_inspection",
  }}));
  await assert.rejects(()=>db.physicalReturnItem.create({data:{
    receiptId:r.id,orderLineId:x.id+"-salt",variantId:"var-salt",
    quantity:"3",condition:"sealed",disposition:"awaiting_inspection",
  }}));
  await assert.rejects(()=>db.physicalReturnItem.update({where:{id:r.lines[0].id},data:{quantity:"1.5"}}));
  await assert.rejects(()=>db.physicalReturnReceipt.update({where:{id:r.id},data:{
    status:"inspected",inspectedBy:"admin-commerce",inspectedAt:new Date(),inspectionSummary:"Looks good to sell again",
  }}));
  await assert.rejects(()=>db.physicalReturnItem.delete({where:{id:r.lines[0].id}}));
  await assert.rejects(()=>db.physicalReturnReceipt.delete({where:{id:r.id}}));
  assert.equal((await service.detail(r.id)).status,"received");
});

test("parallel independent physical returns cannot exceed the original depleted quantity",async()=>{
  const x=await fixture("RACE");
  const results=await Promise.allSettled([
    receiving("admin-commerce",x.id,"race-return-a","1.25"),
    receiving("admin-commerce",x.id,"race-return-b","1.25"),
  ]);
  assert.equal(results.filter(v=>v.status==="fulfilled").length,1,JSON.stringify(results));
  const total=await db.physicalReturnItem.aggregate({_sum:{quantity:true}});
  assert.equal(total._sum.quantity?.toString(),"1.25");
  assert.equal(await db.stockMovement.count(),0);
});

test("default-off flag forbids physical receipts and inspection even for admin",async()=>{
  const x=await fixture("FLAG");
  const closed=await createApplication(readConfig({
    DATABASE_URL:process.env.DATABASE_URL!,WEB_ORIGINS:"http://localhost:3000",
    API_STOCK_LOCATION_ID:"loc_accra",API_INSECURE_COOKIES:"true",
    PHYSICAL_RETURNS_INTAKE_ENABLED:"false",
  }));
  try{
    const disabled=closed.get(PhysicalReturnsService);
    await assert.rejects(()=>disabled.receive("admin-commerce","disabled-first","disabled-req",body(x.id)),
      (e:any)=>e?.getStatus?.()===503);
    assert.equal((await disabled.list({page:1,perPage:20})).enabled,false);
  }finally{await closed.close();}
  assert.equal(await db.physicalReturnReceipt.count(),0);
});

test("deferred SQL constraint rejects an empty forged receipt with no goods",async()=>{
  const x=await fixture("EMPTY");
  await assert.rejects(()=>db.physicalReturnReceipt.create({data:{
    reference:"VGR-EMPTY-"+randomUUID().slice(0,8),orderId:x.id,locationId:"loc_accra",
    reason:"Alleged physical item returned",evidenceNote:"Forged note with no witnessed line",
    receivedBy:"admin-commerce",
  }}));
  assert.equal(await db.physicalReturnReceipt.count(),0);
});
test("direct SQL cannot partly inspect an item while the parent remains uninspected",async()=>{
  const x=await fixture("PART-INSPECT");
  const r=await receiving("admin-commerce",x.id,"part-inspect-receive");
  await assert.rejects(()=>db.physicalReturnItem.update({where:{id:r.lines[0].id},data:{
    disposition:"quarantine",inspectedBy:"admin-commerce",inspectedAt:new Date(),
    inspectionNote:"Attempted isolated inspection without final case",
  }}));
  assert.equal((await service.detail(r.id)).status,"received");
  assert.equal((await service.detail(r.id)).lines[0]?.disposition,"awaiting_inspection");
});
