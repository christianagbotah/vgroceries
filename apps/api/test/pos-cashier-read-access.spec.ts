import {before,after,beforeEach,test} from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import type {INestApplication} from "@nestjs/common";
import {createApplication} from "../src/bootstrap";
import {readConfig} from "../src/config";
import {Database} from "../src/database/database";
import {CashierTillsService} from "../src/cashier-tills/cashier-tills.service";
import {hasPermission} from "../src/identity/permissions";
import {commerceTestPassword,seedCommerceFixtures} from "./commerce-fixtures";

let app:INestApplication,db:Database,tills:CashierTillsService,base:string;
const config=()=>readConfig({
  DATABASE_URL:process.env.DATABASE_URL!,
  WEB_ORIGINS:"http://localhost:3000",
  API_STOCK_LOCATION_ID:"loc_accra",
  API_INSECURE_COOKIES:"true",
  POS_TILL_FOUNDATION_ENABLED:"true",
  POS_QUOTE_ENABLED:"true",
  POS_STOCK_HOLDS_ENABLED:"true",
  POS_CASH_SALES_ENABLED:"true",
  COMMERCE_LOCATION_ID:"loc_accra",
  CHECKOUT_PAYMENT_HOLD_MINUTES:"15",
  CHECKOUT_OFFLINE_HOLD_MINUTES:"1440",
  GUEST_CHECKOUT_TTL_MINUTES:"1440",
  ORDER_VERIFICATION_ACTIVE_VERSION:"1",
  ORDER_VERIFICATION_KEYS:JSON.stringify({"1":"11".repeat(32)}),
});
const path=(suffix:string)=>"/api/v1"+suffix;
const key=()=>randomUUID();
async function login(email:string){
  const r=await fetch(pathAt("/auth/sessions"),{
    method:"POST",headers:{"content-type":"application/json",origin:"http://localhost:3000"},
    body:JSON.stringify({email,password:commerceTestPassword,client:"native"}),
  });
  assert.equal(r.status,201,await r.text().catch(()=> ""));
  // A second request is needed because the assertion above consumes
  // the body on failure only (it is not consumed when status is 201).
  return (await r.json()).data.accessToken as string;
}
const pathAt=(suffix:string)=>base+path(suffix);
async function request(method:"GET"|"POST",suffix:string,auth?:string,body?:unknown){
  const res=await fetch(pathAt(suffix),{
    method,
    headers:{
      ...(auth?{authorization:"Bearer "+auth}:{}),
      ...(method==="POST"?{"content-type":"application/json","idempotency-key":key()}:{}),
    },
    ...(method==="POST"?{body:JSON.stringify(body??{})}:{})
  });
  return {status:res.status,body:await res.text()};
}
async function seedCashiers(){
  const admin=await db.user.findUniqueOrThrow({where:{id:"admin-commerce"}});
  await db.location.create({data:{id:"loc_kumasi",name:"Kumasi",active:true}});
  await db.user.createMany({data:[
    {id:"cashier-accra",email:"cashier-accra@example.test",name:"Cashier Accra",
      role:"cashier",passwordHash:admin.passwordHash},
    {id:"cashier-unassigned",email:"cashier-unassigned@example.test",name:"Cashier Unassigned",
      role:"cashier",passwordHash:admin.passwordHash},
    {id:"inventory-readtest",email:"inventory-readtest@example.test",name:"Stock Operator",
      role:"inventory_manager",passwordHash:admin.passwordHash},
  ]});
  await db.userLocation.create({data:{userId:"cashier-accra",locationId:"loc_accra"}});
  const accra=await tills.open("admin-commerce",key(),"open-accra",{
    locationId:"loc_accra",tillCode:"ACCRA-01",openingFloatMinor:1200,
  });
  const kumasi=await tills.open("admin-commerce",key(),"open-kumasi",{
    locationId:"loc_kumasi",tillCode:"KUMASI-01",openingFloatMinor:2000,
  });
  return {accra,kumasi};
}
before(async()=>{
  if(!new URL(process.env.DATABASE_URL!).pathname.endsWith("variety_foundation_test"))
    throw Error("Cashier scope tests require isolated PostgreSQL test database");
  app=await createApplication(config());
  await app.listen(0,"127.0.0.1");base=await app.getUrl();
  db=app.get(Database);tills=app.get(CashierTillsService);
});
beforeEach(async()=>{await seedCommerceFixtures(db);});
after(async()=>{await app?.close();});

test("cashier identity is read-only and unauthorised roles cannot read reports",async()=>{
  const {accra}=await seedCashiers();
  const admin=await login("admin-commerce@example.test");
  const cashier=await login("cashier-accra@example.test");
  const nonCashier=await login("inventory-readtest@example.test");
  assert.equal(hasPermission("cashier","pos.cash-report.read"),true);
  assert.equal(hasPermission("cashier","inventory.receive"),false);
  assert.equal(hasPermission("cashier","catalog.product.create"),false);
  assert.equal(hasPermission("inventory_manager","pos.cash-report.read"),false);
  assert.equal((await request("GET","/admin/pos/tills")).status,401);
  assert.equal((await request("GET","/admin/pos/tills",nonCashier)).status,403);
  assert.equal((await request("GET","/admin/pos/tills",cashier)).status,200);
  assert.equal((await request("GET","/admin/pos/tills",admin)).status,200);
  const invalidMutations=[
    ["/admin/pos/tills",{locationId:"loc_accra",tillCode:"FORGED",openingFloatMinor:100}],
    ["/admin/pos/tills/"+accra.id+"/movements",
      {kind:"cash_in",amountMinor:100,note:"Unauthorised cash movement"}],
    ["/admin/pos/tills/"+accra.id+"/close",
      {countedCashMinor:1200,note:"Unauthorised shift close"}],
    ["/admin/pos/quote",{tillSessionId:accra.id,lines:[]}],
    ["/admin/pos/holds",{tillSessionId:accra.id,lines:[]}],
    ["/admin/pos/cash-sales",{holdId:randomUUID()}],
  ] as const;
  for(const [endpoint,body] of invalidMutations){
    assert.equal((await request("POST",endpoint,cashier,body)).status,403,endpoint);
  }
  assert.equal((await db.cashierTillSession.count()),2);
  assert.equal((await db.cashierTillMovement.count()),0);
  assert.equal((await db.posCashSale.count()),0);
  assert.equal((await db.stockDepletion.count()),0);
});

test("cashier sees only assigned active location and cannot guess other till IDs or CSV",async()=>{
  const {accra,kumasi}=await seedCashiers();
  const cashier=await login("cashier-accra@example.test");
  const admin=await login("admin-commerce@example.test");
  const none=await login("cashier-unassigned@example.test");
  const list=await request("GET","/admin/pos/tills",cashier);
  assert.equal(list.status,200);
  const rows=JSON.parse(list.body).data;
  assert.equal(rows.sessions.length,1);
  assert.equal(rows.sessions[0].id,accra.id);
  assert.equal(rows.includesSales,false);
  const full=JSON.parse((await request("GET","/admin/pos/tills",admin)).body).data;
  assert.equal(full.sessions.length,2);
  const empty=JSON.parse((await request("GET","/admin/pos/tills",none)).body).data;
  assert.equal(empty.sessions.length,0);
  assert.equal(empty.includesSales,false);
  assert.equal((await request("GET","/admin/pos/tills/"+accra.id,cashier)).status,200);
  assert.equal((await request("GET","/admin/pos/tills/"+kumasi.id,cashier)).status,404);
  assert.equal((await request("GET","/admin/pos/tills/"+kumasi.id+"/reconciliation",cashier)).status,404);
  assert.equal((await request("GET","/admin/pos/tills/"+kumasi.id+"/reconciliation.csv",cashier)).status,404);
  const good=await request("GET","/admin/pos/tills/"+accra.id+"/reconciliation",cashier);
  assert.equal(good.status,200);
  assert.equal(JSON.parse(good.body).data.locationId,"loc_accra");
  assert.equal((await request("GET","/admin/pos/tills/"+accra.id+"/reconciliation.csv",cashier)).status,200);
});

test("grant removal and inactive location block previously issued cashier sessions",async()=>{
  const {accra}=await seedCashiers();
  const cashier=await login("cashier-accra@example.test");
  assert.equal((await request("GET","/admin/pos/tills/"+accra.id,cashier)).status,200);
  await db.userLocation.delete({where:{
    userId_locationId:{userId:"cashier-accra",locationId:"loc_accra"},
  }});
  assert.equal((await request("GET","/admin/pos/tills/"+accra.id,cashier)).status,404);
  assert.equal(JSON.parse((await request("GET","/admin/pos/tills",cashier)).body).data.sessions.length,0);
  await db.userLocation.create({data:{userId:"cashier-accra",locationId:"loc_accra"}});
  await db.location.update({where:{id:"loc_accra"},data:{active:false}});
  assert.equal((await request("GET","/admin/pos/tills/"+accra.id,cashier)).status,404);
  assert.equal((await request("GET","/admin/pos/tills/"+accra.id+"/reconciliation.csv",cashier)).status,404);
  assert.equal(JSON.parse((await request("GET","/admin/pos/tills",cashier)).body).data.sessions.length,0);
});
