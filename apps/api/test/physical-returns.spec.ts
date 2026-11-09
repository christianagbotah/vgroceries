import {after,before,beforeEach,test} from "node:test";
import type { PhysicalReturnReceive } from "@variety/contracts";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import { Prisma } from "@prisma/client";
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
  PHYSICAL_RETURNS_CUSTODY_ENABLED:"true",
  PHYSICAL_RETURNS_RESALE_ENABLED:"true",
  PHYSICAL_RETURNS_RESALE_ALLOWED_VARIANTS:"var-soap",
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


async function inspectedQuarantine(tag:string,quantity="1"){
  const x=await fixture(tag);
  const received=await service.receive("admin-commerce","receive-"+tag,"receive-"+tag+"-req",body(x.id,quantity));
  const inspected=await service.inspect("admin-commerce",received.id,"inspect-"+tag,"inspect-"+tag+"-req",{
    summary:"Physical goods inspected and separated into off-sale storage",
    lines:received.lines.map(line=>({itemId:line.id,disposition:"quarantine",
      note:"Goods physically inspected and quarantined from saleable inventory" })),
  });
  return {order:x,receipt:inspected,item:inspected.lines[0]!};
}

test("R2a: exact original lot creates a quarantined, non-saleable stock receipt with custody evidence",async()=>{
  const {receipt,item}=await inspectedQuarantine("CUSTODY");
  const before=await db.$queryRaw<{sellablePhysical:Prisma.Decimal;availableToSell:Prisma.Decimal}[]>`
    SELECT "sellablePhysical","availableToSell" FROM variant_availability WHERE "positionId"='pos-rice'`;
  const oldLot=await db.stockLot.findUniqueOrThrow({where:{id:"lot-rice"}});
  const outcome=await service.quarantine("admin-commerce",item.id,"r2-quarantine-key","r2-custody-request",
    {custodyNote:"Sealed off-sale returns shelf A2; stock confirmed by responsible administrator."});
  assert.equal(outcome.itemId,item.id);
  assert.equal(outcome.quantity,item.quantity);
  assert.equal(outcome.sourceLotId,"lot-rice");
  assert.equal(outcome.sourceLotNumber,"RICE");
  assert.equal(outcome.status,"quarantined");
  const physical=await db.stockLot.findUniqueOrThrow({where:{id:outcome.quarantineLotId}});
  assert.equal(physical.kind,"physical_return_quarantine");
  assert.equal(physical.quarantined,true);
  assert.equal(physical.positionId,oldLot.positionId);
  assert.equal(physical.quantity.toString(),item.quantity);
  assert.equal((await db.stockLot.findUniqueOrThrow({where:{id:"lot-rice"}})).quantity.toString(),oldLot.quantity.toString());
  const movement=await db.stockMovement.findMany({where:{lotId:physical.id}});
  assert.equal(movement.length,1);
  assert.equal(movement[0].reason,"physical_return_quarantine");
  assert.equal(movement[0].delta.toString(),item.quantity);
  const after=await db.$queryRaw<{sellablePhysical:Prisma.Decimal;availableToSell:Prisma.Decimal}[]>`
    SELECT "sellablePhysical","availableToSell" FROM variant_availability WHERE "positionId"='pos-rice'`;
  assert.equal(after[0].sellablePhysical.toString(),before[0].sellablePhysical.toString());
  assert.equal(after[0].availableToSell.toString(),before[0].availableToSell.toString());
  const projected=await service.detail(receipt.id);
  assert.equal(projected.lines[0]?.custody?.quarantineLotId,physical.id);
  assert.equal(await db.refund.count(),0);
  assert.equal(await db.paymentAttempt.count(),0);
});

test("R2a: identical replay is safe and other keys cannot record the same returned goods twice",async()=>{
  const {item}=await inspectedQuarantine("REPLAY");
  const note={custodyNote:"Return sealed in quarantined cage and counting ledger cross-checked."};
  const first=await service.quarantine("admin-commerce",item.id,"custody-once","custody-once-req",note);
  assert.deepEqual(await service.quarantine("admin-commerce",item.id,"custody-once","custody-once-req",note),first);
  await assert.rejects(()=>service.quarantine("admin-commerce",item.id,"custody-once",
    "custody-conflict-req",{custodyNote:"Changed custody note cannot reuse the same transport replay token"}),
    (error:any)=>error?.getStatus?.()===409);
  await assert.rejects(()=>service.quarantine("admin-commerce",item.id,"custody-other",
    "custody-other-req",note),(error:any)=>error?.getStatus?.()===409);
  assert.equal(await db.physicalReturnCustody.count(),1);
  assert.equal(await db.stockMovement.count(),1);
  assert.equal(await db.auditEvent.count({where:{action:"physical_return.quarantine_recorded"}}),1);
});

test("R2a: destroyed or uninspected goods cannot be placed into quarantine inventory",async()=>{
  const x=await fixture("DESTROYED");
  const r=await service.receive("admin-commerce","destroy-receive","destroy-receive-req",body(x.id));
  await assert.rejects(()=>service.quarantine("admin-commerce",r.lines[0].id,"early-key",
    "early-req",{custodyNote:"Not yet inspected, so physical stock admission must fail"}),
    (error:any)=>error?.getStatus?.()===422);
  await service.inspect("admin-commerce",r.id,"destroy-inspect","destroy-inspect-req",{
    summary:"Goods found unsuitable for quarantine and held for disposal",
    lines:[{itemId:r.lines[0].id,disposition:"destroy",
      note:"Package destroyed and held for controlled disposal"}],
  });
  await assert.rejects(()=>service.quarantine("admin-commerce",r.lines[0].id,"destroy-key",
    "destroy-req",{custodyNote:"Destroyed goods must not become on-hand return inventory"}),
    (error:any)=>error?.getStatus?.()===422);
  assert.equal(await db.stockMovement.count(),0);
  assert.equal(await db.physicalReturnCustody.count(),0);
});

test("R2a: concurrent different custody keys create exactly one lot, one movement and one record",async()=>{
  const {item}=await inspectedQuarantine("RACE-R2");
  const note={custodyNote:"Stock quarantined and witnessed in designated receiving cage"};
  const results=await Promise.allSettled([
    service.quarantine("admin-commerce",item.id,"r2-race-a","r2-a-request",note),
    service.quarantine("admin-commerce",item.id,"r2-race-b","r2-b-request",note),
  ]);
  assert.equal(results.filter(r=>r.status==="fulfilled").length,1);
  assert.equal(await db.physicalReturnCustody.count(),1);
  assert.equal(await db.stockMovement.count(),1);
  assert.equal(await db.stockLot.count({where:{kind:"physical_return_quarantine"}}),1);
  assert.equal(await db.refund.count(),0);
});

test("R2a: SQL rejects forged quarantine lot without evidence, and forbids resale or destructive mutations",async()=>{
  await assert.rejects(()=>db.stockLot.create({data:{
    positionId:"pos-rice",quantity:"1",lotNumber:"SQL-FORGED-QUARANTINE",
    quarantined:true,kind:"physical_return_quarantine",
  }}));
  const {item}=await inspectedQuarantine("SQL-IMMUTABLE");
  const result=await service.quarantine("admin-commerce",item.id,"r2-sql-test",
    "r2-sql-test-req",{custodyNote:"Quarantine cage logged with physical counting control note"});
  await assert.rejects(()=>db.stockLot.update({where:{id:result.quarantineLotId},data:{
    quarantined:false,kind:"regular",
  }}));
  await assert.rejects(()=>db.stockLot.update({where:{id:result.quarantineLotId},data:{quantity:"500"}}));
  await assert.rejects(()=>db.stockLot.delete({where:{id:result.quarantineLotId}}));
  await assert.rejects(()=>db.physicalReturnCustody.delete({where:{itemId:item.id}}));
  await assert.rejects(()=>db.physicalReturnCustody.update({where:{itemId:item.id},data:{quantity:"500"}}));
  assert.equal((await db.stockLot.findUniqueOrThrow({where:{id:result.quarantineLotId}})).quarantined,true);
});

test("R2a: source lot ambiguity fails closed without creating saleable or quarantined stock",async()=>{
  const {item,order}=await inspectedQuarantine("AMBIGUOUS");
  // A second immutable original source lot for this same handed-over line
  // makes historical provenance ambiguous; R2a requires unambiguous proof.
  const second=await db.stockLot.create({data:{positionId:"pos-rice",
    lotNumber:"SECOND-LOT-ORIGINAL",quantity:"4",kind:"regular",quarantined:false}});
  const rs=await db.reservation.create({data:{
    positionId:"pos-rice",lotId:second.id,claimType:"order",
    claimId:order.id,claimLineId:order.id+"-rice",generation:2,
    quantity:"0.5",state:"consumed",expiresAt:new Date(Date.now()+3600000),
  }});
  const depleted=await db.stockDepletion.findUniqueOrThrow({where:{
    claimType_claimId:{claimType:"order",claimId:order.id},
  }});
  await db.stockDepletionLine.create({data:{
    depletionId:depleted.id,reservationId:rs.id,claimLineId:order.id+"-rice",
    variantId:"var-rice",lotId:second.id,quantity:"0.5",
    lotQuantityBefore:"4",lotQuantityAfter:"3.5",
  }});
  await assert.rejects(()=>service.quarantine("admin-commerce",item.id,"r2-ambiguous",
    "r2-ambiguous-req",{custodyNote:"Must not infer which of two original depleted stock lots was returned"}),
    (error:any)=>error?.getStatus?.()===422);
  assert.equal(await db.physicalReturnCustody.count(),0);
  assert.equal(await db.stockMovement.count(),0);
});

test("R2a: independent server flag refuses custody even if physical intake is enabled",async()=>{
  const {item}=await inspectedQuarantine("R2-FLAG");
  const closed=await createApplication(readConfig({
    DATABASE_URL:process.env.DATABASE_URL!,WEB_ORIGINS:"http://localhost:3000",
    API_STOCK_LOCATION_ID:"loc_accra",API_INSECURE_COOKIES:"true",
    PHYSICAL_RETURNS_INTAKE_ENABLED:"true",PHYSICAL_RETURNS_CUSTODY_ENABLED:"false",
  }));
  try{
    const disabled=closed.get(PhysicalReturnsService);
    await assert.rejects(()=>disabled.quarantine("admin-commerce",item.id,"r2-closed",
      "r2-closed-request",{custodyNote:"Physical stock is present, but this environment is not approved"}),
      (error:any)=>error?.getStatus?.()===503);
    assert.equal((await disabled.list({page:1,perPage:20})).custodyEnabled,false);
  }finally{await closed.close();}
  assert.equal(await db.physicalReturnCustody.count(),0);
  assert.equal(await db.stockMovement.count(),0);
});

test("R2a: authenticated administrator-only custody route requires strict note and replay key",async()=>{
  const {item}=await inspectedQuarantine("R2-HTTP");
  const admin=await token("admin-commerce@example.test");
  const customer=await token("customer-a@example.test");
  const route="/admin/physical-returns/items/"+item.id+"/quarantine";
  const body={custodyNote:"Custody bay marked off-sale and quantity verified"};
  assert.equal((await request("POST",route,undefined,body,"r2-no-auth")).status,401);
  assert.equal((await request("POST",route,customer,body,"r2-customer")).status,403);
  assert.equal((await request("POST",route,admin,{...body,refundMinor:100},"r2-extra")).status,400);
  assert.equal((await request("POST",route,admin,{custodyNote:"too short"},"r2-short")).status,400);
  const accepted=await request("POST",route,admin,body,"r2-http-success");
  assert.equal(accepted.status,200,JSON.stringify(accepted.body));
  assert.equal(accepted.body.data.status,"quarantined");
  assert.equal((await request("POST",route,admin,body,"r2-http-success")).status,200);
});

test("R2a: direct SQL cannot duplicate or alter a quarantined stock movement",async()=>{
  const {item}=await inspectedQuarantine("MOVEMENT");
  const result=await service.quarantine("admin-commerce",item.id,"r2-movement",
    "r2-movement-req",{custodyNote:"Goods held in secure off-sale bay with verified count"});
  const movement=await db.stockMovement.findFirstOrThrow({where:{lotId:result.quarantineLotId}});
  await assert.rejects(()=>db.stockMovement.create({data:{
    lotId:result.quarantineLotId,receiptId:movement.receiptId,
    delta:"1",resultingQty:"2",reason:"physical_return_quarantine",actorId:"admin-commerce",
  }}));
  await assert.rejects(()=>db.stockMovement.update({where:{id:movement.id},
    data:{delta:"500",resultingQty:"501"}}));
  await assert.rejects(()=>db.stockMovement.delete({where:{id:movement.id}}));
  assert.equal(await db.stockMovement.count({where:{lotId:result.quarantineLotId}}),1);
});

async function nonFoodResaleFixture(tag:string,sourceDays=120){
  const x=await fixture("RESALE-"+tag);
  await db.category.create({data:{id:"cat-household",slug:"household-essentials",name:"Household Essentials"}});
  await db.product.create({data:{
    id:"product-soap",slug:"resale-fixture-sealed-soap",name:"Factory sealed home cleaner",
    categoryId:"cat-household",published:true,tags:["non-food"],
    variants:{create:{id:"var-soap",sku:"FIXTURE-NONFOOD-SOAP",
      name:"Sealed cleaner unit",unit:"piece",priceMinor:399}},
  }});
  const expiry=new Date(Date.now()+sourceDays*86400000);
  expiry.setUTCHours(0,0,0,0);
  await db.stockPosition.create({data:{
    id:"pos-soap",variantId:"var-soap",locationId:"loc_accra",safetyStock:"0",
    lots:{create:{id:"lot-soap",lotNumber:"SOAP-LOT-001",
      quantity:"12",expiryDate:expiry,kind:"regular",quarantined:false,
      unitCostMinor:250}},
  }});
  await db.orderLine.create({data:{
    id:x.id+"-soap",orderId:x.id,variantId:"var-soap",productId:"product-soap",
    productName:"Factory sealed home cleaner",variantName:"Sealed cleaner unit",
    unit:"piece",quantity:"2",unitPriceMinor:399,lineTotalMinor:798,
  }});
  await db.reservation.create({data:{
    id:x.id+"-res-soap",positionId:"pos-soap",lotId:"lot-soap",
    claimType:"order",claimId:x.id,claimLineId:x.id+"-soap",
    quantity:"2",state:"consumed",expiresAt:new Date(Date.now()+3600000),
  }});
  const depletion=await db.stockDepletion.findUniqueOrThrow({
    where:{claimType_claimId:{claimType:"order",claimId:x.id}},
  });
  await db.stockDepletionLine.create({data:{
    depletionId:depletion.id,reservationId:x.id+"-res-soap",claimLineId:x.id+"-soap",
    variantId:"var-soap",lotId:"lot-soap",quantity:"2",
    lotQuantityBefore:"12",lotQuantityAfter:"10",
  }});
  const received=await service.receive("admin-commerce","resale-receive-"+tag,
    "resale-receive-req-"+tag,{
      orderId:x.id,reason:"Sealed non-food cleaner returned by customer",
      evidenceNote:"Factory sealed product physically counted at stock receiving quarantine bay",
      lines:[{orderLineId:x.id+"-soap",quantity:"1",condition:"sealed"}],
    });
  await service.inspect("admin-commerce",received.id,
    "resale-inspect-"+tag,"resale-inspect-req-"+tag,{
      summary:"Non-food sealed cleaner inspected separately before quarantine placement",
      lines:[{itemId:received.lines[0].id,disposition:"quarantine",
        note:"Original unopened cleaner packaging examined and kept off the saleable shelf"}],
    });
  await service.quarantine("admin-commerce",received.lines[0].id,"resale-custody-"+tag,
    "resale-custody-req-"+tag,{
      custodyNote:"Sealed non-food cleaner held in segregated quarantine rack Q5, verified count",
    });
  const admin=await db.user.findUniqueOrThrow({where:{id:"admin-commerce"}});
  await db.user.createMany({data:[
    {id:"admin-proposer",email:"resale-proposer@example.test",name:"Resale proposer",
      passwordHash:admin.passwordHash,role:"admin"},
    {id:"admin-reviewer",email:"resale-reviewer@example.test",name:"Resale reviewer",
      passwordHash:admin.passwordHash,role:"admin"},
    {id:"admin-reviewer-2",email:"resale-reviewer-2@example.test",name:"Second reviewer",
      passwordHash:admin.passwordHash,role:"admin"},
  ]});
  return {orderId:x.id,itemId:received.lines[0].id,sourceExpiry:expiry};
}
const resaleProposal=()=>({
  safetyClassification:"non_food_factory_sealed" as const,
  factorySealIntact:true as const,tamperAndContaminationAbsent:true as const,
  sourceTraceabilityVerified:true as const,expiryAndStorageVerified:true as const,
  evidenceNote:"I verified factory seals, clean packaging, original lot and expiry, and the separate non-food resale eligibility evidence.",
});
const approveDecision=()=>({
  decision:"approve" as const,
  decisionNote:"Second independent administrator verified intact packaging, origin, expiry and safety classification.",
});

test("R2b two-person approval transfers one sealed non-food lot without double-counting physical goods or creating refunds",async()=>{
  const x=await nonFoodResaleFixture("GOOD");
  const before=await db.$queryRaw<{physical:Prisma.Decimal;sellable:Prisma.Decimal}[]>`
    SELECT (SELECT sum(quantity) FROM "StockLot" WHERE "positionId"='pos-soap') AS physical,
      "sellablePhysical" AS sellable FROM variant_availability WHERE "positionId"='pos-soap'`;
  const proposed=await service.proposeResale("admin-proposer",x.itemId,"r2b-good-propose","r2b-propose-req",resaleProposal());
  assert.equal(proposed.status,"pending");
  const untouched=await db.stockLot.findMany({where:{positionId:"pos-soap"}});
  assert.equal(untouched.filter(l=>l.kind==="regular").length,1);
  const approved=await service.decideResale("admin-reviewer",x.itemId,"r2b-good-approve",
    "r2b-approve-req",approveDecision());
  assert.equal(approved.status,"approved");
  assert.equal(approved.proposedBy,"admin-proposer");
  assert.equal(approved.decidedBy,"admin-reviewer");
  assert.ok(approved.saleableLotId);
  const q=await db.physicalReturnCustody.findUniqueOrThrow({where:{itemId:x.itemId}});
  const qlot=await db.stockLot.findUniqueOrThrow({where:{id:q.quarantineLotId}});
  const released=await db.stockLot.findUniqueOrThrow({where:{id:approved.saleableLotId!}});
  assert.equal(qlot.quantity.toString(),"0");
  assert.equal(qlot.quarantined,true);
  assert.equal(qlot.kind,"physical_return_quarantine");
  assert.equal(released.kind,"regular");
  assert.equal(released.quarantined,false);
  assert.equal(released.positionId,"pos-soap");
  assert.equal(released.quantity.toString(),"1");
  assert.equal(released.unitCostMinor,250);
  assert.equal(released.expiryDate?.toISOString(),x.sourceExpiry.toISOString());
  const stock=await db.$queryRaw<{physical:Prisma.Decimal;sellable:Prisma.Decimal}[]>`
    SELECT (SELECT sum(quantity) FROM "StockLot" WHERE "positionId"='pos-soap') AS physical,
      "sellablePhysical" AS sellable FROM variant_availability WHERE "positionId"='pos-soap'`;
  assert.equal(stock[0].physical.toString(),before[0].physical.toString());
  assert.equal(stock[0].sellable.minus(before[0].sellable).toString(),"1");
  const movement=await db.stockMovement.findMany({where:{receiptId:approved.transferReceiptId!}});
  assert.deepEqual(movement.map(m=>m.delta.toString()).sort(),["-1","1"]);
  assert.equal(await db.refund.count(),0);
  assert.equal(await db.paymentAttempt.count(),0);
  const detail=await service.detail((await db.physicalReturnItem.findUniqueOrThrow({where:{id:x.itemId}})).receiptId);
  assert.equal(detail.lines[0].resaleReview?.status,"approved");
});

test("R2b returns reject review does not change inventory availability and cannot be reversed",async()=>{
  const x=await nonFoodResaleFixture("REJECT");
  await service.proposeResale("admin-proposer",x.itemId,"reject-propose","reject-propose-req",resaleProposal());
  const before=await db.stockLot.findMany({where:{positionId:"pos-soap"}});
  const rejected=await service.decideResale("admin-reviewer",x.itemId,"reject-final","reject-final-req",{
    decision:"reject",decisionNote:"Second reviewer could not establish safe resale conditions for this lot.",
  });
  assert.equal(rejected.status,"rejected");
  assert.equal(rejected.saleableLotId,null);
  assert.deepEqual((await db.stockLot.findMany({where:{positionId:"pos-soap"}}))
    .map(l=>l.quantity.toString()),before.map(l=>l.quantity.toString()));
  await assert.rejects(()=>service.decideResale("admin-reviewer-2",x.itemId,"reject-reopen",
    "reject-reopen-req",approveDecision()),(e:any)=>e?.getStatus?.()===409);
  assert.equal(await db.stockMovement.count({where:{reason:"physical_return_resale_transfer_in"}}),0);
  assert.equal(await db.refund.count(),0);
});

test("R2b proposer, receiver, inspector or custodian cannot approve own saleable release",async()=>{
  const x=await nonFoodResaleFixture("SELF");
  await service.proposeResale("admin-proposer",x.itemId,"self-proposal","self-proposal-req",resaleProposal());
  for(const actor of ["admin-proposer","admin-commerce"]){
    await assert.rejects(()=>service.decideResale(actor,x.itemId,"self-decision-"+actor,
      "self-decision-req-"+actor,approveDecision()),(e:any)=>e?.getStatus?.()===403);
  }
  assert.equal((await db.physicalReturnResaleReview.findUniqueOrThrow({where:{itemId:x.itemId}})).status,"pending");
  assert.equal(await db.stockMovement.count({where:{reason:"physical_return_resale_transfer_in"}}),0);
});

test("R2b duplicate approve key replays safely while alternate or changed keys are refused",async()=>{
  const x=await nonFoodResaleFixture("REPLAY");
  const proposal=await service.proposeResale("admin-proposer",x.itemId,"replay-propose","replay-propose-req",resaleProposal());
  assert.deepEqual(await service.proposeResale("admin-proposer",x.itemId,"replay-propose","replay-propose-req",resaleProposal()),proposal);
  const approved=await service.decideResale("admin-reviewer",x.itemId,"replay-decision","replay-decision-req",approveDecision());
  assert.deepEqual(await service.decideResale("admin-reviewer",x.itemId,"replay-decision","replay-decision-req",approveDecision()),approved);
  await assert.rejects(()=>service.decideResale("admin-reviewer",x.itemId,"replay-decision",
    "changed-replay-req",{decision:"reject",decisionNote:"This request is different from the previously committed approval."}),
    (e:any)=>e?.getStatus?.()===409);
  await assert.rejects(()=>service.decideResale("admin-reviewer-2",x.itemId,"another-approve",
    "another-approve-req",approveDecision()),(e:any)=>e?.getStatus?.()===409);
  assert.equal(await db.stockMovement.count({where:{reason:"physical_return_resale_transfer_in"}}),1);
  assert.equal(await db.stockMovement.count({where:{reason:"physical_return_resale_transfer_out"}}),1);
});

test("R2b independent reviewers race: only one release, no double credit",async()=>{
  const x=await nonFoodResaleFixture("RACE");
  await service.proposeResale("admin-proposer",x.itemId,"race-proposal","race-proposal-req",resaleProposal());
  const all=await Promise.allSettled([
    service.decideResale("admin-reviewer",x.itemId,"race-a","race-a-req",approveDecision()),
    service.decideResale("admin-reviewer-2",x.itemId,"race-b","race-b-req",approveDecision()),
  ]);
  assert.equal(all.filter(x=>x.status==="fulfilled").length,1,JSON.stringify(all));
  assert.equal(await db.stockMovement.count({where:{reason:"physical_return_resale_transfer_in"}}),1);
  assert.equal(await db.stockLot.count({where:{lotNumber:{startsWith:"RET-RESALE-"}}}),1);
  assert.equal(await db.refund.count(),0);
});

test("R2b reject food/unallowlisted, unsealed and insufficient shelf-life, and never touch stock",async()=>{
  const x=await nonFoodResaleFixture("UNSAFE");
  await assert.rejects(()=>service.proposeResale("admin-proposer","not-an-item","missing","missing-req",resaleProposal()),
    (e:any)=>e?.getStatus?.()===404);
  await db.stockLot.update({where:{id:"lot-soap"},data:{expiryDate:new Date(Date.now()+5*86400000)}});
  await assert.rejects(()=>service.proposeResale("admin-proposer",x.itemId,"expiry-short","expiry-short-req",resaleProposal()),
    (e:any)=>e?.getStatus?.()===422);
  assert.equal(await db.physicalReturnResaleReview.count(),0);
  assert.equal(await db.stockMovement.count({where:{reason:"physical_return_resale_transfer_in"}}),0);
});

test("R2b direct SQL fails to forge approval or stock movements and preserves terminal review history",async()=>{
  const x=await nonFoodResaleFixture("SQL");
  await service.proposeResale("admin-proposer",x.itemId,"sql-propose","sql-propose-req",resaleProposal());
  const fakeReceipt=await db.stockReceipt.create({data:{receivedBy:"admin-reviewer",note:"Fake"}});
  await assert.rejects(()=>db.physicalReturnResaleReview.update({where:{itemId:x.itemId},data:{
    status:"approved",decidedBy:"admin-reviewer",decidedAt:new Date(),
    decisionNote:"Forged direct SQL approval with no matching transfer",
    saleableLotId:"lot-soap",transferReceiptId:fakeReceipt.id,
  }}));
  await assert.rejects(()=>db.physicalReturnResaleReview.delete({where:{itemId:x.itemId}}));
  await assert.rejects(()=>db.stockLot.create({data:{
    positionId:"pos-soap",lotNumber:"RET-RESALE-FORGED",quantity:"1",
    quarantined:false,kind:"regular",
  }}));
  const decision=await service.decideResale("admin-reviewer",x.itemId,"sql-real","sql-real-req",approveDecision());
  const q=await db.physicalReturnCustody.findUniqueOrThrow({where:{itemId:x.itemId}});
  await assert.rejects(()=>db.stockLot.update({where:{id:q.quarantineLotId},data:{quarantined:false,kind:"regular"}}));
  await assert.rejects(()=>db.physicalReturnResaleReview.update({where:{itemId:x.itemId},data:{decisionNote:"Revised"}}));
  await assert.rejects(()=>db.physicalReturnResaleReview.delete({where:{itemId:x.itemId}}));
  await assert.rejects(()=>db.stockMovement.create({data:{
    lotId:q.quarantineLotId,receiptId:decision.transferReceiptId!,
    delta:"-1",resultingQty:"0",reason:"physical_return_resale_transfer_out",actorId:"admin-reviewer",
  }}));
  assert.equal(await db.refund.count(),0);
});

test("R2b HTTP requires administrator and rejects forged safety attestations",async()=>{
  const x=await nonFoodResaleFixture("HTTP");
  const admin=await token("resale-proposer@example.test");
  const reviewer=await token("resale-reviewer@example.test");
  const customer=await token("customer-a@example.test");
  const proposalUrl="/admin/physical-returns/items/"+x.itemId+"/resale-review";
  const decisionUrl="/admin/physical-returns/items/"+x.itemId+"/resale-decision";
  assert.equal((await request("POST",proposalUrl,undefined,resaleProposal(),"no-auth")).status,401);
  assert.equal((await request("POST",proposalUrl,customer,resaleProposal(),"customer")).status,403);
  assert.equal((await request("POST",proposalUrl,admin,{...resaleProposal(),factorySealIntact:false},"unsafe-flag")).status,400);
  assert.equal((await request("POST",proposalUrl,admin,{...resaleProposal(),refundMinor:100},"unsafe-money")).status,400);
  const proposed=await request("POST",proposalUrl,admin,resaleProposal(),"http-propose");
  assert.equal(proposed.status,200,JSON.stringify(proposed.body));
  assert.equal(proposed.body.data.status,"pending");
  assert.equal((await request("POST",decisionUrl,admin,approveDecision(),"self-review")).status,403);
  const approved=await request("POST",decisionUrl,reviewer,approveDecision(),"http-decide");
  assert.equal(approved.status,200,JSON.stringify(approved.body));
  assert.equal(approved.body.data.status,"approved");
  assert.equal((await request("POST",decisionUrl,reviewer,approveDecision(),"http-decide")).status,200);
});

test("R2b default-off flag prevents proposal and decisions when R1/R2a stay enabled",async()=>{
  const x=await nonFoodResaleFixture("FLAG");
  const closed=await createApplication(readConfig({
    DATABASE_URL:process.env.DATABASE_URL!,WEB_ORIGINS:"http://localhost:3000",
    API_STOCK_LOCATION_ID:"loc_accra",API_INSECURE_COOKIES:"true",
    PHYSICAL_RETURNS_INTAKE_ENABLED:"true",PHYSICAL_RETURNS_CUSTODY_ENABLED:"true",
    PHYSICAL_RETURNS_RESALE_ENABLED:"false",PHYSICAL_RETURNS_RESALE_ALLOWED_VARIANTS:"var-soap",
  }));
  try{
    const api=closed.get(PhysicalReturnsService);
    await assert.rejects(()=>api.proposeResale("admin-proposer",x.itemId,"off","off-req",resaleProposal()),
      (e:any)=>e?.getStatus?.()===503);
    await assert.rejects(()=>api.decideResale("admin-reviewer",x.itemId,"off-decide","off-decide-req",approveDecision()),
      (e:any)=>e?.getStatus?.()===503);
    assert.equal((await api.list({page:1,perPage:20})).resaleEnabled,false);
  }finally{await closed.close();}
  assert.equal(await db.physicalReturnResaleReview.count(),0);
  assert.equal(await db.stockMovement.count({where:{reason:"physical_return_resale_transfer_in"}}),0);
});

test("R2b allowlist alone cannot relabel a grocery/food category for resale",async()=>{
  const x=await nonFoodResaleFixture("FOOD-CATEGORY");
  await db.product.update({where:{id:"product-soap"},data:{categoryId:"cat-commerce"}});
  await assert.rejects(()=>service.proposeResale("admin-proposer",x.itemId,"wrong-category",
    "wrong-category-req",resaleProposal()),(e:any)=>e?.getStatus?.()===422);
  assert.equal(await db.physicalReturnResaleReview.count(),0);
  assert.equal(await db.stockMovement.count({where:{reason:"physical_return_resale_transfer_in"}}),0);
});

test("R2b reviewer rechecks original expiry before release; expired proposal cannot raise sellable quantity",async()=>{
  const x=await nonFoodResaleFixture("EXPIRED-DECISION");
  await service.proposeResale("admin-proposer",x.itemId,"expiry-proposed",
    "expiry-proposed-req",resaleProposal());
  const before=await db.stockLot.findUniqueOrThrow({where:{id:"lot-soap"}});
  await db.stockLot.update({where:{id:"lot-soap"},data:{
    expiryDate:new Date(Date.now()+4*86400000),
  }});
  await assert.rejects(()=>service.decideResale("admin-reviewer",x.itemId,"expired-review",
    "expired-review-req",approveDecision()),(e:any)=>e?.getStatus?.()===422);
  const review=await db.physicalReturnResaleReview.findUniqueOrThrow({where:{itemId:x.itemId}});
  assert.equal(review.status,"pending");
  assert.equal(review.saleableLotId,null);
  assert.equal(await db.stockLot.count({where:{kind:"physical_return_quarantine"}}),1);
  assert.equal(await db.stockMovement.count({where:{reason:"physical_return_resale_transfer_in"}}),0);
  assert.equal((await db.stockLot.findUniqueOrThrow({where:{id:"lot-soap"}})).quantity.toString(),before.quantity.toString());
});

test("R2b default-empty allowlist denies all inventory release even when the flag is enabled",async()=>{
  const x=await nonFoodResaleFixture("EMPTY-ALLOWLIST");
  const closed=await createApplication(readConfig({
    DATABASE_URL:process.env.DATABASE_URL!,WEB_ORIGINS:"http://localhost:3000",
    API_STOCK_LOCATION_ID:"loc_accra",API_INSECURE_COOKIES:"true",
    PHYSICAL_RETURNS_INTAKE_ENABLED:"true",PHYSICAL_RETURNS_CUSTODY_ENABLED:"true",
    PHYSICAL_RETURNS_RESALE_ENABLED:"true",PHYSICAL_RETURNS_RESALE_ALLOWED_VARIANTS:"",
  }));
  try{
    const gated=closed.get(PhysicalReturnsService);
    await assert.rejects(()=>gated.proposeResale("admin-proposer",x.itemId,
      "no-variant-whitelist","no-variant-whitelist-req",resaleProposal()),
      (e:any)=>e?.getStatus?.()===422);
  }finally{await closed.close();}
  assert.equal(await db.physicalReturnResaleReview.count(),0);
  assert.equal(await db.stockMovement.count({where:{reason:"physical_return_resale_transfer_in"}}),0);
});
