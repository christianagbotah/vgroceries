import {after,before,beforeEach,test} from "node:test";
import assert from "node:assert/strict";
import type {INestApplication} from "@nestjs/common";
import {randomUUID} from "node:crypto";
import {createApplication} from "../src/bootstrap";
import {readConfig} from "../src/config";
import {Database} from "../src/database/database";
import {CashierTillsService} from "../src/cashier-tills/cashier-tills.service";
import {PosHoldsService} from "../src/cashier-tills/pos-holds.service";
import {CheckoutQuoteService} from "../src/orders/checkout-quote.service";
import {AllocationService} from "../src/inventory/allocation.service";
import {commerceTestPassword,seedCommerceFixtures} from "./commerce-fixtures";

let app:INestApplication,db:Database,tills:CashierTillsService,holds:PosHoldsService,base:string;
let counter=0;
const cfg=(enabled=true,ttl=2)=>readConfig({
  DATABASE_URL:process.env.DATABASE_URL!,WEB_ORIGINS:"http://localhost:3000",
  API_STOCK_LOCATION_ID:"loc_accra",API_INSECURE_COOKIES:"true",
  POS_TILL_FOUNDATION_ENABLED:"true",POS_QUOTE_ENABLED:"true",
  POS_STOCK_HOLDS_ENABLED:enabled?"true":"false",
  POS_STOCK_HOLD_TTL_SECONDS:String(ttl),
  COMMERCE_LOCATION_ID:"loc_accra",CHECKOUT_PAYMENT_HOLD_MINUTES:"15",
  CHECKOUT_OFFLINE_HOLD_MINUTES:"1440",GUEST_CHECKOUT_TTL_MINUTES:"1440",
  ORDER_VERIFICATION_ACTIVE_VERSION:"1",
  ORDER_VERIFICATION_KEYS:JSON.stringify({"1":"11".repeat(32)}),
});
const rice=(qty="2")=>[{variantId:"var-rice",quantity:qty}];
const salt=(qty="10")=>[{variantId:"var-salt",quantity:qty}];
async function open(locationId="loc_accra"){
  counter++;
  return tills.open("admin-commerce",`open-hold-${counter}`,`opening-${counter}`,{
    locationId,tillCode:`HOLD-${counter}`,openingFloatMinor:500,
  });
}
async function login(email:string){
  const r=await fetch(base+"/api/v1/auth/sessions",{method:"POST",headers:{
    "content-type":"application/json",origin:"http://localhost:3000",
  },body:JSON.stringify({email,password:commerceTestPassword,client:"native"})});
  assert.equal(r.status,201);
  return (await r.json()).data.accessToken as string;
}
async function request(method:"GET"|"POST",path:string,token?:string,body?:unknown,key="hold-request-001"){
  const r=await fetch(base+"/api/v1"+path,{method,headers:{
    ...(token?{authorization:"Bearer "+token}:{}),
    ...(method==="POST"?{"content-type":"application/json","idempotency-key":key}:{}),
  },...(method==="POST"?{body:JSON.stringify(body)}:{})});
  return {status:r.status,data:await r.json()};
}
async function totals(){
  return {
    orders:await db.order.count(),
    paymentAttempts:await db.paymentAttempt.count(),
    depletions:await db.stockDepletion.count(),
    refunds:await db.refund.count(),
    stockMovements:await db.stockMovement.count(),
    tillMovements:await db.cashierTillMovement.count(),
  };
}
before(async()=>{
  if(!new URL(process.env.DATABASE_URL!).pathname.endsWith("variety_foundation_test"))
    throw Error("POS holds require isolated foundation test database");
  app=await createApplication(cfg());
  await app.listen(0,"127.0.0.1");
  base=await app.getUrl();db=app.get(Database);
  tills=app.get(CashierTillsService);holds=app.get(PosHoldsService);
});
beforeEach(async()=>{await seedCommerceFixtures(db);});
after(async()=>{await app?.close();});

test("POS hold uses online shared availability and original stored prices, without selling or charging",async()=>{
  const till=await open(),admin=await login("admin-commerce@example.test");
  const before=await totals();
  const result=await request("POST","/admin/pos/holds",admin,{
    tillSessionId:till.id,lines:[...rice(),...salt("1")],
  },"pos-hold-shared-001");
  assert.equal(result.status,200,JSON.stringify(result.data));
  const hold=result.data.data;
  assert.equal(hold.status,"held");
  assert.equal(hold.stockReserved,true);
  assert.equal(hold.subtotalMinor,523);
  assert.equal(hold.orderCreated,false);
  assert.equal(hold.paymentVerified,false);
  assert.equal(hold.goodsHandedOver,false);
  assert.deepEqual((await totals()),before);
  const online=await app.get(CheckoutQuoteService).quote({lines:[...rice(),...salt("1")]});
  assert.equal(online.lines.find(x=>x.variantId==="var-rice")!.available,"16");
  assert.equal(online.lines.find(x=>x.variantId==="var-salt")!.available,"9");
  assert.equal(await db.reservation.count({where:{claimType:"pos_draft",claimId:hold.id,state:"active"}}),2);
  const replay=await request("POST","/admin/pos/holds",admin,{
    tillSessionId:till.id,lines:[...rice(),...salt("1")],
  },"pos-hold-shared-001");
  assert.equal(replay.status,200);
  assert.equal(replay.data.data.id,hold.id);
  assert.equal((await request("POST","/admin/pos/holds",admin,{
    tillSessionId:till.id,lines:rice("1"),
  },"pos-hold-shared-001")).status,409);
  assert.equal((await request("POST","/admin/pos/holds",admin,{
    tillSessionId:till.id,lines:rice("1"),
  },"pos-hold-second-001")).status,409);
  const cancel=await request("POST",`/admin/pos/holds/${hold.id}/release`,admin,{
    note:"Customer cancelled the counter cart before payment",
  },"pos-hold-release-001");
  assert.equal(cancel.status,200);
  assert.equal(cancel.data.data.stockReserved,false);
  assert.equal(cancel.data.data.status,"released");
  assert.deepEqual(await totals(),before);
  const restored=await app.get(CheckoutQuoteService).quote({lines:rice()});
  assert.equal(restored.lines[0].available,"18");
  await tills.close("admin-commerce",till.id,"after-release-001","close",{
    countedCashMinor:500,note:"No sales took place during this till shift",
  });
});

test("counter holds reject tampered line prices, duplicate units and unauthorised calls",async()=>{
  const till=await open(),admin=await login("admin-commerce@example.test"),
    customer=await login("customer-a@example.test");
  const valid={tillSessionId:till.id,lines:rice()};
  assert.equal((await request("GET","/admin/pos/holds")).status,401);
  assert.equal((await request("POST","/admin/pos/holds",customer,valid)).status,403);
  assert.equal((await request("POST","/admin/pos/holds",admin,
    {...valid,subtotalMinor:1},"bad-subtotal-001")).status,400);
  assert.equal((await request("POST","/admin/pos/holds",admin,
    {...valid,lines:[{...rice()[0],unitPriceMinor:1}]},"bad-price-001")).status,400);
  assert.equal((await request("POST","/admin/pos/holds",admin,
    {...valid,lines:[...rice(),...rice()]},"bad-duplicate-001")).status,400);
  assert.equal((await request("POST","/admin/pos/holds",admin,
    {...valid,lines:[{variantId:"var-salt",quantity:"0.5"}]},"bad-piece-001")).status,400);
  assert.equal((await request("POST","/admin/pos/holds",admin,
    {...valid,lines:rice("1000")},"bad-outofstock-001")).status,409);
  assert.equal((await request("POST","/admin/pos/holds",admin,
    {...valid,lines:[{variantId:"nonexistent",quantity:"1"}]},"bad-unknown-001")).status,404);
  const off=new PosHoldsService(db,cfg(false),app.get(AllocationService));
  await assert.rejects(()=>off.create("admin-commerce","off-pos-001","req",valid),
    (e:any)=>e?.getStatus?.()===503);
  assert.throws(()=>readConfig({
    DATABASE_URL:process.env.DATABASE_URL!,
    WEB_ORIGINS:"http://localhost:3000",
    API_STOCK_LOCATION_ID:"loc_accra",
    API_INSECURE_COOKIES:"true",
    POS_STOCK_HOLDS_ENABLED:"true",
  }),/POS_STOCK_HOLDS_ENABLED requires/);
});

test("online checkout and POS hold cannot both reserve the same last stock",async()=>{
  const till=await open(),admin=await login("admin-commerce@example.test"),
    customer=await login("customer-a@example.test");
  const before=await totals();
  const saleBody={
    idempotencyKey:"online-pos-race-001",customerName:"Ama Customer",
    customerPhone:"+233241111111",fulfilment:"collection",
    paymentMethod:"cash_counter",lines:salt("10"),
  };
  const [pos,online]=await Promise.all([
    request("POST","/admin/pos/holds",admin,{
      tillSessionId:till.id,lines:salt("10"),
    },"pos-online-race-001"),
    request("POST","/checkout/complete",customer,saleBody,"online-pos-race-001"),
  ]);
  const succeeded=[pos.status===200,online.status===201];
  assert.equal(succeeded.filter(Boolean).length,1,JSON.stringify({pos,online}));
  const q=await app.get(CheckoutQuoteService).quote({lines:salt("1")});
  assert.equal(q.lines[0].available,"0");
  assert.equal(await db.stockDepletion.count(),0);
  assert.equal(await db.stockMovement.count(),before.stockMovements);
  assert.equal(await db.paymentAttempt.count(),before.paymentAttempts);
  const totalClaims=await db.reservation.count({where:{state:"active",expiresAt:{gt:new Date()}}});
  assert.equal(totalClaims,1);
});

test("two POS tills contending for the same last unit cannot oversubscribe",async()=>{
  const a=await open(),b=await open();
  const [x,y]=await Promise.allSettled([
    holds.create("admin-commerce","till-a-race-001","req-a",{
      tillSessionId:a.id,lines:salt("10"),
    }),
    holds.create("admin-commerce","till-b-race-001","req-b",{
      tillSessionId:b.id,lines:salt("10"),
    }),
  ]);
  assert.equal([x,y].filter(r=>r.status==="fulfilled").length,1);
  const q=await app.get(CheckoutQuoteService).quote({lines:salt("1")});
  assert.equal(q.lines[0].available,"0");
  assert.equal(await db.posStockHold.count(),1);
  assert.equal(await db.reservation.count({where:{claimType:"pos_draft"}}),1);
});

test("expiry restores stock, stale replay never falsely reports reserved, and next cart can be held",async()=>{
  const a=await open(),first=await holds.create("admin-commerce","exp-hold-001","req",{
    tillSessionId:a.id,lines:rice("18"),
  });
  const now=await app.get(CheckoutQuoteService).quote({lines:rice("1")});
  assert.equal(now.lines[0].available,"0");
  await new Promise(resolve=>setTimeout(resolve,2350));
  const old=await holds.detail(first.id);
  assert.equal(old.status,"expired");
  assert.equal(old.stockReserved,false);
  const again=await holds.create("admin-commerce","exp-hold-001","req",{
    tillSessionId:a.id,lines:rice("18"),
  });
  assert.equal(again.id,first.id);
  assert.equal(again.stockReserved,false);
  const next=await holds.create("admin-commerce","exp-new-001","req-new",{
    tillSessionId:a.id,lines:rice("17"),
  });
  assert.equal(next.status,"held");
  assert.equal(await db.reservation.count({where:{claimType:"pos_draft",claimId:first.id,state:"expired"}}),1);
  const q=await app.get(CheckoutQuoteService).quote({lines:rice("1")});
  assert.equal(q.lines[0].available,"1");
});

test("database rejects forged claims and till close until an active cart releases",async()=>{
  const till=await open();
  await assert.rejects(()=>db.posStockHold.create({data:{
    id:randomUUID(),tillSessionId:till.id,locationId:"loc_accra",
    createdByUserId:"customer-a",subtotalMinor:125,
    expiresAt:new Date(Date.now()+5000),
  }}));
  const pos=await holds.create("admin-commerce","guard-pos-001","req",{
    tillSessionId:till.id,lines:salt("1"),
  });
  await assert.rejects(()=>db.posStockHoldLine.update({
    where:{id:pos.lines[0].id},data:{quantity:"4"},
  }));
  await assert.rejects(()=>db.posStockHoldLine.delete({where:{id:pos.lines[0].id}}));
  await assert.rejects(()=>db.reservation.create({data:{
    positionId:"pos-salt",lotId:"lot-salt",claimType:"pos_draft",
    claimId:randomUUID(),claimLineId:pos.lines[0].id,
    quantity:"1",expiresAt:new Date(Date.now()+5000),
  }}));
  await assert.rejects(()=>tills.close("admin-commerce",till.id,"still-held-close-001","close",{
    countedCashMinor:500,note:"Attempt to close a till holding reserved stock",
  }),(e:any)=>e?.getStatus?.()===409);
  await holds.release("admin-commerce",pos.id,"guard-release-001","rel",{
    note:"Customer left the shop without making payment",
  });
  await tills.close("admin-commerce",till.id,"safe-close-001","close",{
    countedCashMinor:500,note:"All reserved goods were released before closure",
  });
});
