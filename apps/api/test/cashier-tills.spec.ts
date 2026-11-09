import {before,after,beforeEach,test} from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import type {INestApplication} from "@nestjs/common";
import {createApplication} from "../src/bootstrap";
import {readConfig} from "../src/config";
import {Database} from "../src/database/database";
import {CashierTillsService} from "../src/cashier-tills/cashier-tills.service";
import {commerceTestPassword,seedCommerceFixtures} from "./commerce-fixtures";

let app:INestApplication,db:Database,tills:CashierTillsService,base:string;
const config=(enabled:boolean)=>readConfig({
  DATABASE_URL:process.env.DATABASE_URL!,WEB_ORIGINS:"http://localhost:3000",
  API_STOCK_LOCATION_ID:"loc_accra",API_INSECURE_COOKIES:"true",
  POS_TILL_FOUNDATION_ENABLED:enabled?"true":"false",
});
const till=()=>("T"+randomUUID().slice(0,8)).toUpperCase();
async function token(email:string){
  const r=await fetch(base+"/api/v1/auth/sessions",{method:"POST",
    headers:{"content-type":"application/json",origin:"http://localhost:3000"},
    body:JSON.stringify({email,password:commerceTestPassword,client:"native"}),
  });
  assert.equal(r.status,201);
  return (await r.json()).data.accessToken as string;
}
async function req(method:"GET"|"POST",path:string,auth?:string,body?:unknown,key="till-open-001"){
  const r=await fetch(base+"/api/v1"+path,{method,headers:{
    ...(auth?{authorization:"Bearer "+auth}:{}),
    ...(method==="POST"?{"content-type":"application/json","idempotency-key":key}:{}),
  },...(method==="POST"?{body:JSON.stringify(body)}:{})});
  return {status:r.status,body:await r.json()};
}
before(async()=>{
  if(!new URL(process.env.DATABASE_URL!).pathname.endsWith("variety_foundation_test"))
    throw Error("Cashier till tests require isolated PostgreSQL test database");
  app=await createApplication(config(true));
  await app.listen(0,"127.0.0.1");base=await app.getUrl();
  db=app.get(Database);tills=app.get(CashierTillsService);
});
beforeEach(async()=>{await seedCommerceFixtures(db);});
after(async()=>{await app?.close();});

test("POS till controls are administrator-only, strict, replay-protected, default OFF",async()=>{
  const admin=await token("admin-commerce@example.test");
  const customer=await token("customer-a@example.test");
  const url="/admin/pos/tills",open={locationId:"loc_accra",tillCode:till(),openingFloatMinor:1000};
  assert.equal((await req("GET",url)).status,401);
  assert.equal((await req("GET",url,customer)).status,403);
  assert.equal((await req("POST",url,customer,open,"till-cust-001")).status,403);
  assert.equal((await req("POST",url,admin,{...open,unexpected:"injection"},"till-invalid-001")).status,400);
  assert.equal((await req("POST",url,admin,{...open,openingFloatMinor:-1},"till-negative-001")).status,400);
  const result=await req("POST",url,admin,open,"till-valid-001");
  assert.equal(result.status,200,JSON.stringify(result.body));
  assert.equal(result.body.data.openingFloatMinor,1000);
  assert.equal(result.body.data.expectedDrawerOnlyMinor,1000);
  assert.equal(result.body.data.includesSales,false);
  const replay=await req("POST",url,admin,open,"till-valid-001");
  assert.equal(replay.body.data.id,result.body.data.id);
  assert.equal((await req("POST",url,admin,{...open,openingFloatMinor:2000},"till-valid-001")).status,409);
  assert.equal((await req("POST",url,admin,open,"till-duplicate-001")).status,409);
  assert.equal((await req("GET",url+"/"+result.body.data.id,admin)).status,200);
  assert.equal((await req("POST",url+"/"+result.body.data.id+"/movements",customer,
    {kind:"cash_in",amountMinor:100,note:"Unauthorized entry"},"cust-move-001")).status,403);
  const closed=new CashierTillsService(db,config(false));
  await assert.rejects(()=>closed.open("admin-commerce","disabled-open-001","disabled",open),
    (e:any)=>e?.getStatus?.()===503);
});

test("drawer movements and close are replay-safe, immutable and never sell stock or settle money",async()=>{
  const opening=await tills.open("admin-commerce","drawer-open-001","open-request",{
    locationId:"loc_accra",tillCode:till(),openingFloatMinor:1000,
  });
  const baseline={
    orders:await db.order.count(),
    payments:await db.paymentAttempt.count(),
    depletion:await db.stockDepletion.count(),
    refunds:await db.refund.count(),
    stock:await db.stockMovement.count(),
  };
  const in1=await tills.move("admin-commerce",opening.id,"move-in-001","move-1",{
    kind:"cash_in",amountMinor:500,note:"Drawer change replenishment",
  });
  assert.equal(in1.expectedDrawerOnlyMinor,1500);
  const replay=await tills.move("admin-commerce",opening.id,"move-in-001","move-replay",{
    kind:"cash_in",amountMinor:500,note:"Drawer change replenishment",
  });
  assert.equal(replay.movements.length,1);
  await tills.move("admin-commerce",opening.id,"move-out-001","move-2",{
    kind:"cash_out",amountMinor:300,note:"Counted cash to office safe",
  });
  const third=await tills.move("admin-commerce",opening.id,"move-drop-001","move-3",{
    kind:"drop",amountMinor:200,note:"Verified bank deposit cash drop",
  });
  assert.equal(third.expectedDrawerOnlyMinor,1000);
  await assert.rejects(()=>tills.move("admin-commerce",opening.id,"move-invalid-001","bad",{
    kind:"drop",amountMinor:1001,note:"Would overdraw the recorded float",
  }),(e:any)=>e?.getStatus?.()===409);
  const end=await tills.close("admin-commerce",opening.id,"drawer-close-001","close-request",{
    countedCashMinor:950,note:"Physical drawer counted with independent witness",
  });
  assert.equal(end.status,"closed");
  assert.equal(end.closingExpectedMinor,1000);
  assert.equal(end.closingDifferenceMinor,-50);
  assert.equal(end.includesSales,false);
  const endReplay=await tills.close("admin-commerce",opening.id,"drawer-close-001","close-replay",{
    countedCashMinor:950,note:"Physical drawer counted with independent witness",
  });
  assert.equal(endReplay.id,end.id);
  await assert.rejects(()=>tills.move("admin-commerce",opening.id,"move-after-close","late",{
    kind:"cash_in",amountMinor:100,note:"Post-close movement attempt",
  }),(e:any)=>e?.getStatus?.()===409);
  await assert.rejects(()=>db.cashierTillSession.update({
    where:{id:opening.id},data:{openingFloatMinor:777},
  }));
  await assert.rejects(()=>db.cashierTillMovement.update({
    where:{id:third.movements[0]!.id},data:{amountMinor:99},
  }));
  assert.deepEqual({
    orders:await db.order.count(),payments:await db.paymentAttempt.count(),
    depletion:await db.stockDepletion.count(),refunds:await db.refund.count(),
    stock:await db.stockMovement.count(),
  },baseline);
});

test("database guard rejects forged cashier role, invalid location, and closed-session movements",async()=>{
  const one=await tills.open("admin-commerce","guard-open-001","open",{
    locationId:"loc_accra",tillCode:till(),openingFloatMinor:100,
  });
  await assert.rejects(()=>db.cashierTillSession.create({data:{
    id:randomUUID(),locationId:"loc_accra",tillCode:till(),
    openedByUserId:"customer-a",openingFloatMinor:100,
  }}));
  await assert.rejects(()=>db.cashierTillMovement.create({data:{
    sessionId:one.id,kind:"cash_in",amountMinor:1,
    note:"Direct SQL customer forgery",actorUserId:"customer-a",
  }}));
  // A direct writer must not forge a closed till with missing counted cash or
  // a missing difference: SQL CHECK must reject NULL, not treat it as success.
  await assert.rejects(()=>db.cashierTillSession.update({where:{id:one.id},data:{
    status:"closed",closedAt:new Date(),closedByUserId:"admin-commerce",
    closingExpectedMinor:100,closeNote:"Incomplete closing record",
  }}));
  await assert.rejects(()=>db.cashierTillSession.update({where:{id:one.id},data:{
    status:"closed",closedAt:new Date(),closedByUserId:"admin-commerce",
    closingCountedMinor:100,closingExpectedMinor:100,closingDifferenceMinor:2,
    closeNote:"Forged arithmetic closing record",
  }}));
  await tills.close("admin-commerce",one.id,"guard-close-001","close",{
    countedCashMinor:100,note:"Drawer counts checked and written",
  });
  await assert.rejects(()=>db.cashierTillMovement.create({data:{
    sessionId:one.id,kind:"cash_in",amountMinor:1,
    note:"Attempt late movement after close",actorUserId:"admin-commerce",
  }}));
  await assert.rejects(()=>db.cashierTillSession.delete({where:{id:one.id}}));
});
