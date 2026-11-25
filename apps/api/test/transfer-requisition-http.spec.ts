import {before,after,test} from "node:test";
import assert from "node:assert/strict";
import type {INestApplication} from "@nestjs/common";
import {createApplication} from "../src/bootstrap";
import {readConfig} from "../src/config";
import {Database} from "../src/database/database";
import {hashPassword} from "../src/identity/crypto";
import {seedCommerceFixtures,commerceTestPassword} from "./commerce-fixtures";
let app:INestApplication, db:Database, base:string;
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
 app=await createApplication(readConfig({DATABASE_URL:process.env.DATABASE_URL!,WEB_ORIGINS:"http://localhost:3000",API_STOCK_LOCATION_ID:"loc_accra",API_INSECURE_COOKIES:"true"}));
 await app.listen(0,"127.0.0.1");base=await app.getUrl();db=app.get(Database);
 await seedCommerceFixtures(db);
 await db.location.createMany({data:[{id:"loc_b",name:"Branch B"},{id:"loc_c",name:"Branch C"}]});
 const passwordHash=await hashPassword(commerceTestPassword);
 for(const [id,locationId] of [["requester","loc_accra"],["source","loc_b"],["other","loc_c"]]){
  await db.user.create({data:{id,email:id+"@example.test",name:id,role:"inventory_manager",passwordHash,locations:{create:{locationId}}}});
 }
});
after(async()=>{await app?.close();});
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
