import {before,after,test} from "node:test";
import assert from "node:assert/strict";
import type {INestApplication} from "@nestjs/common";
import {createApplication} from "../src/bootstrap";
import {readConfig} from "../src/config";
import {AllocationService} from "../src/inventory/allocation.service";
import {Database} from "../src/database/database";
import {hashPassword} from "../src/identity/crypto";
import {seedCommerceFixtures,commerceTestPassword} from "./commerce-fixtures";
let app:INestApplication, db:Database, base:string;
const oldTransferFlag=process.env.INTERNAL_TRANSFERS_ENABLED;
const route="/inventory/transfer-requisitions";
async function call(path:string, method="GET", body?:unknown, token?:string, key?:string){
 const r=await fetch(base+"/api/v1"+path,{method,headers:{...(body===undefined?{}:{"content-type":"application/json"}),...(token?{authorization:"Bearer "+token}:{}),...(key?{"idempotency-key":key}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});
 return {status:r.status,payload:await r.json()};
}
async function login(id:string){
 const r=await call("/auth/sessions","POST",{email:id+"@example.test",password:commerceTestPassword,client:"native"});
 assert.equal(r.status,201);return r.payload.data.accessToken as string;
}
before(async()=>{
 if(new URL(process.env.DATABASE_URL!).pathname!=="/variety_foundation_test")throw Error("Requires disposable foundation database");
 process.env.INTERNAL_TRANSFERS_ENABLED="true";
 app=await createApplication(readConfig({DATABASE_URL:process.env.DATABASE_URL!,WEB_ORIGINS:"http://localhost:3000",API_STOCK_LOCATION_ID:"loc_accra",API_INSECURE_COOKIES:"true"}));
 await app.listen(0,"127.0.0.1");base=await app.getUrl();db=app.get(Database);
 await seedCommerceFixtures(db);
 await db.location.createMany({data:[{id:"loc_b",name:"Branch B"},{id:"loc_c",name:"Branch C"}]});
 const passwordHash=await hashPassword(commerceTestPassword);
 for(const [id,locationId] of [["requester","loc_accra"],["source","loc_b"],["other","loc_c"]]){
  await db.user.create({data:{id,email:id+"@example.test",name:id,role:"inventory_manager",passwordHash,locations:{create:{locationId}}}});
 }
});
after(async()=>{await app?.close();if(oldTransferFlag===undefined)delete process.env.INTERNAL_TRANSFERS_ENABLED;else process.env.INTERNAL_TRANSFERS_ENABLED=oldTransferFlag;});
test("head office selects source; requests and decisions are durable, scoped and stock-neutral",async()=>{
 const a=await login("requester"), b=await login("source"), c=await login("other"), admin=await login("admin-commerce");
 const input={destinationId:"loc_accra",note:"Replenish stock",lines:[{variantId:"var-rice",quantity:"2.500"}]};
 const original=await db.stockLot.findUniqueOrThrow({where:{id:"lot-rice"}});
 assert.equal((await call(route,"POST",input,b,"wrong-scope-1")).status,403);
 assert.equal((await call(route,"POST",{...input,sourceId:"loc_b"},a,"forged-source")).status,400);
 assert.equal((await call(route,"POST",input,a)).status,400);
 const created=await call(route,"POST",input,a,"transfer-request-1");
 assert.equal(created.status,201,JSON.stringify(created.payload));
 const id=created.payload.data.id;
 assert.equal(created.payload.data.status,"requested");
 assert.equal(created.payload.data.sourceId,null);
 const replay=await call(route,"POST",{...input,lines:[{variantId:"var-rice",quantity:"2.5"}]},a,"transfer-request-1");
 assert.equal(replay.payload.data.id,id);
 assert.equal((await call(route,"POST",{...input,note:"different"},a,"transfer-request-1")).status,409);
 assert.equal((await call(route,"GET",undefined,b)).payload.data.items.length,0);
 assert.equal((await call(route,"GET",undefined,c)).payload.data.items.length,0);
 const decision={action:"authorize",version:1,sourceId:"loc_b",note:"Head office approved"};
 assert.equal((await call(route+"/"+id+"/decision","POST",decision,a)).status,403);
 assert.equal((await call(route+"/"+id+"/decision","POST",{...decision,sourceId:"loc_accra"},admin)).status,409);
 assert.equal((await call(route+"/"+id+"/decision","POST",{...decision,sourceId:"loc_inactive"},admin)).status,409);
 const approved=await call(route+"/"+id+"/decision","POST",decision,admin);
 assert.equal(approved.status,200,JSON.stringify(approved.payload));
 assert.equal(approved.payload.data.status,"authorized");
 assert.equal(approved.payload.data.stockReserved,false);
 assert.equal(approved.payload.data.stockMoved,false);
 assert.equal(approved.payload.data.financialPostingCreated,false);
 assert.equal((await call(route+"/"+id+"/decision","POST",decision,admin)).status,200);
 assert.equal((await call(route+"/"+id+"/decision","POST",{...decision,sourceId:"loc_c"},admin)).status,409);
 assert.equal((await call(route,"GET",undefined,b)).payload.data.items[0].id,id);
 assert.equal((await call(route,"GET",undefined,c)).payload.data.items.length,0);
 assert.equal((await db.stockLot.findUniqueOrThrow({where:{id:"lot-rice"}})).quantity.toString(),original.quantity.toString());
 assert.equal(await db.reservation.count(),0);
 assert.equal(await db.stockMovement.count(),0);
 assert.equal(await db.auditEvent.count({where:{entityId:id,action:"transfer.requested"}}),1);
 assert.equal(await db.auditEvent.count({where:{entityId:id,action:"transfer.authorized"}}),1);
});

test("transfer holds share sale availability, reject unknown cost, replay once and release only the transfer",async()=>{
 const a=await login("requester"), b=await login("source"), admin=await login("admin-commerce");
 const id=(await db.internalTransferRequest.findFirstOrThrow({where:{status:"authorized"}})).id;
 const reserve=route+"/"+id+"/reserve";
 await db.stockPosition.create({data:{id:"branch-b-rice",variantId:"var-rice",locationId:"loc_b",safetyStock:"1",lots:{create:{id:"branch-b-lot",lotNumber:"B-RICE",quantity:"10"}}}});
 assert.equal((await call(reserve,"POST",{version:2},a)).status,404);
 assert.equal((await call(reserve,"POST",{version:2},b)).status,409);
 assert.equal((await db.internalTransferRequest.findUniqueOrThrow({where:{id}})).status,"authorized");
 await db.stockLot.update({where:{id:"branch-b-lot"},data:{unitCostMinor:2500}});
 const allocator=app.get(AllocationService);
 const saleInput={claimType:"order" as const,claimId:"synthetic-existing-order",locationId:"loc_b",expiresAt:new Date(Date.now()+3600000),actorId:"admin-commerce",requestId:"synthetic-order-reservation",lines:[{claimLineId:"sale-line",variantId:"var-rice",quantity:"6"}]};
 await db.$transaction(tx=>allocator.create(tx,saleInput));
 const accepted=await call(reserve,"POST",{version:2},b);
 assert.equal(accepted.status,200,JSON.stringify(accepted.payload));
 assert.equal(accepted.payload.data.status,"reserved");
 assert.equal(accepted.payload.data.reservationStatus,"active");
 assert.equal(accepted.payload.data.stockReserved,true);
 assert.equal(accepted.payload.data.stockMoved,false);
 assert.equal(accepted.payload.data.financialPostingCreated,false);
 assert.equal((await call(reserve,"POST",{version:2},b)).status,200);
 assert.equal(await db.reservation.count({where:{claimType:"internal_transfer",claimId:id}}),1);
 const overview=await call("/inventory/overview?locationId=loc_b","GET",undefined,b);
 assert.equal(overview.status,200);
 assert.equal(overview.payload.data.rows.find((x:{variantId:string})=>x.variantId==="var-rice").availableToSell,"0.5");
 await assert.rejects(db.$transaction(tx=>allocator.create(tx,{...saleInput,claimId:"synthetic-overbooking",lines:[{claimLineId:"overbooking-line",variantId:"var-rice",quantity:"1"}]})));
 assert.equal((await db.stockLot.findUniqueOrThrow({where:{id:"branch-b-lot"}})).quantity.toString(),"10");
 const cancel=route+"/"+id+"/cancel-reservation";
 assert.equal((await call(cancel,"POST",{version:3,note:"No longer required"},b)).status,403);
 const cancelled=await call(cancel,"POST",{version:3,note:"No longer required"},admin);
 assert.equal(cancelled.status,200,JSON.stringify(cancelled.payload));
 assert.equal(cancelled.payload.data.status,"cancelled");
 assert.equal(cancelled.payload.data.stockReserved,false);
 assert.equal((await call(cancel,"POST",{version:3,note:"No longer required"},admin)).status,200);
 assert.equal((await db.reservation.findFirstOrThrow({where:{claimType:"internal_transfer",claimId:id}})).state,"released");
 assert.equal((await db.reservation.findFirstOrThrow({where:{claimType:"order",claimId:saleInput.claimId}})).state,"active");
 assert.equal(await db.stockMovement.count(),0);
 assert.equal(await db.auditEvent.count({where:{entityId:id,action:"transfer.reserved"}}),1);
 assert.equal(await db.auditEvent.count({where:{entityId:id,action:"transfer.cancelled"}}),1);
});

test("dispatch consumes exact authorized holds once and preserves original cost in transit without destination receipt",async()=>{
 const a=await login("requester"), b=await login("source"), admin=await login("admin-commerce");
 const request=await call(route,"POST",{destinationId:"loc_accra",note:"Dispatch test",lines:[{variantId:"var-rice",quantity:"2.5"}]},a,"dispatch-request-1");
 assert.equal(request.status,201);
 const id=request.payload.data.id;
 assert.equal((await call(route+"/"+id+"/decision","POST",{action:"authorize",version:1,sourceId:"loc_b",note:"Authorized"},admin)).status,200);
 const dispatch=route+"/"+id+"/dispatch", body={version:3,handoverReference:"TEST-HANDOVER-1"};
 assert.equal((await call(dispatch,"POST",body,b)).status,409);
 assert.equal((await call(route+"/"+id+"/reserve","POST",{version:2},b)).status,200);
 assert.equal((await call(dispatch,"POST",body,a)).status,404);
 const dest=await db.stockLot.findUniqueOrThrow({where:{id:"lot-rice"}});
 const sent=await call(dispatch,"POST",body,b);
 assert.equal(sent.status,200,JSON.stringify(sent.payload));
 const view=sent.payload.data;
 assert.equal(view.status,"in_transit");
 assert.equal(view.reservationStatus,"consumed");
 assert.equal(view.stockMoved,true);
 assert.equal(view.financialPostingCreated,false);
 assert.equal(view.dispatch.totalValueMinor,"6250");
 assert.equal(view.dispatch.lots[0].quantity,"2.5");
 assert.equal(view.dispatch.lots[0].unitCostMinor,2500);
 assert.equal(view.dispatch.lots[0].lotNumber,"B-RICE");
 assert.equal((await db.stockLot.findUniqueOrThrow({where:{id:"branch-b-lot"}})).quantity.toString(),"7.5");
 assert.equal((await db.stockLot.findUniqueOrThrow({where:{id:"lot-rice"}})).quantity.toString(),dest.quantity.toString());
 assert.equal((await call(dispatch,"POST",body,b)).payload.data.dispatch.id,view.dispatch.id);
 assert.equal((await call(dispatch,"POST",{...body,handoverReference:"DIFFERENT"},b)).status,409);
 assert.equal((await call(route+"/"+id+"/cancel-reservation","POST",{version:3,note:"Cannot undo dispatch"},admin)).status,409);
 assert.equal(await db.stockDepletion.count({where:{claimType:"internal_transfer",claimId:id}}),1);
 assert.equal(await db.internalTransferDispatch.count({where:{transferId:id}}),1);
 assert.equal(await db.auditEvent.count({where:{entityId:id,action:"transfer.dispatched"}}),1);
 assert.equal((await db.reservation.findFirstOrThrow({where:{claimType:"order",claimId:"synthetic-existing-order"}})).state,"active");
});

test("transfer selection options respect current staff location scope and bound product search",async()=>{
 const a=await login("requester"),admin=await login("admin-commerce");
 const scoped=await call(route+"/options","GET",undefined,a);
 assert.equal(scoped.status,200,JSON.stringify(scoped.payload));
 assert.equal(scoped.payload.data.role,"inventory_manager");
 assert.deepEqual(scoped.payload.data.locations.map((l:{id:string})=>l.id),["loc_accra"]);
 const all=await call(route+"/options","GET",undefined,admin);
 assert.equal(all.status,200);
 assert.equal(all.payload.data.locations.some((l:{id:string})=>l.id==="loc_b"),true);
 assert.equal(all.payload.data.locations.some((l:{id:string})=>l.id==="loc_inactive"),false);
 const search=await call(route+"/options?q=rice","GET",undefined,a);
 assert.equal(search.status,200);
 assert.equal(search.payload.data.variants.some((v:{id:string})=>v.id==="var-rice"),true);
 assert.equal((await call(route+"/options?q="+("x".repeat(101)),"GET",undefined,a)).status,400);
 assert.equal((await call(route+"/options")).status,401);
});

test("database rejects backward transitions and alteration of authorized transfer history",async()=>{
 const row=await db.internalTransferRequest.findFirstOrThrow({where:{status:"in_transit"},include:{lines:true}});
 await assert.rejects(db.internalTransferRequest.update({where:{id:row.id},data:{note:"changed original requisition"}}));
 await assert.rejects(db.internalTransferRequest.update({where:{id:row.id},data:{status:"reserved",version:3}}));
 await assert.rejects(db.internalTransferRequest.update({where:{id:row.id},data:{sourceId:"loc_c"}}));
 await assert.rejects(db.internalTransferRequestLine.update({where:{id:row.lines[0].id},data:{quantity:"999"}}));
 await assert.rejects(db.internalTransferRequestLine.delete({where:{id:row.lines[0].id}}));
 const after=await db.internalTransferRequest.findUniqueOrThrow({where:{id:row.id},include:{lines:true}});
 assert.equal(after.status,"in_transit");
 assert.equal(after.version,4);
 assert.equal(after.note,row.note);
 assert.equal(after.sourceId,row.sourceId);
 assert.equal(after.lines[0].quantity.toString(),row.lines[0].quantity.toString());
});


test("disabled transfer authority refuses reads and writes even for administrators",async()=>{
 const admin=await login("admin-commerce");
 const before=await db.internalTransferRequest.count();
 process.env.INTERNAL_TRANSFERS_ENABLED="false";
 try{
  assert.equal((await call(route,"GET",undefined,admin)).status,503);
  assert.equal((await call(route+"/options","GET",undefined,admin)).status,503);
  assert.equal((await call(route,"POST",{destinationId:"loc_accra",note:"Fixture",lines:[{variantId:"var-rice",quantity:"1"}]},admin,"disabled-fixture")).status,503);
  assert.equal(await db.internalTransferRequest.count(),before);
 }finally{process.env.INTERNAL_TRANSFERS_ENABLED="true";}
});

test("destination receipts are scoped, idempotent, partial and conserve original dispatched value",async()=>{
 const a=await login("requester"),b=await login("source");
 const row=await db.internalTransferRequest.findFirstOrThrow({where:{status:"in_transit"},include:{dispatch:{include:{lots:true}}}});
 const lot=row.dispatch!.lots[0],url=route+"/"+row.id+"/receive";
 const first={receiptReference:"RECEIPT-1",lines:[{dispatchLotId:lot.id,quantity:"1"}]};
 const old=process.env.INTERNAL_TRANSFER_RECEIPTS_ENABLED;
 process.env.INTERNAL_TRANSFER_RECEIPTS_ENABLED="false";
 try{
  assert.equal((await call(url,"POST",first,a,"receive-1")).status,503);
  process.env.INTERNAL_TRANSFER_RECEIPTS_ENABLED="true";
  assert.equal((await call(url,"POST",first,b,"receive-1")).status,404);
  assert.equal((await call(url,"POST",{...first,lines:[{...first.lines[0],unitCostMinor:1}]},a,"receive-1")).status,400);
  const one=await call(url,"POST",first,a,"receive-1");
  assert.equal(one.status,200,JSON.stringify(one.payload));
  assert.equal(one.payload.data.lines[0].valueMinor,"2500");
  assert.equal((await call(url,"POST",first,a,"receive-1")).payload.data.id,one.payload.data.id);
  assert.equal((await call(url,"POST",{...first,receiptReference:"DIFFERENT"},a,"receive-1")).status,409);
  assert.equal((await call(url,"POST",{receiptReference:"OVER",lines:[{dispatchLotId:lot.id,quantity:"2"}]},a,"receive-over")).status,409);
  const final=await Promise.all([call(url,"POST",{receiptReference:"FINAL",lines:[{dispatchLotId:lot.id,quantity:"1.5"}]},a,"receive-2"),call(url,"POST",{receiptReference:"FINAL",lines:[{dispatchLotId:lot.id,quantity:"1.5"}]},a,"receive-2")]);
  assert.ok(final.every(r=>r.status===200),JSON.stringify(final));
  assert.equal(final[0].payload.data.id,final[1].payload.data.id);
  const ledger=await db.internalTransferReceiptLine.findMany({where:{dispatchLotId:lot.id},include:{destinationLot:{include:{position:true}}}});
  assert.equal(ledger.length,2);
  assert.equal(ledger.reduce((sum,l)=>sum+l.valueMinor,0n),6250n);
  assert.equal(ledger.reduce((sum,l)=>sum+Number(l.quantity),0),2.5);
  assert.ok(ledger.every(l=>l.destinationLot.position.locationId==="loc_accra"&&l.destinationLot.lotNumber==="B-RICE"&&l.destinationLot.unitCostMinor===2500));
  assert.equal((await db.stockLot.findUniqueOrThrow({where:{id:"branch-b-lot"}})).quantity.toString(),"7.5");
  assert.equal(await db.stockMovement.count({where:{reason:"internal_transfer_receipt"}}),2);
  await assert.rejects(db.internalTransferReceiptLine.update({where:{id:ledger[0].id},data:{valueMinor:0n}}));
 }finally{if(old===undefined)delete process.env.INTERNAL_TRANSFER_RECEIPTS_ENABLED;else process.env.INTERNAL_TRANSFER_RECEIPTS_ENABLED=old;}
});
