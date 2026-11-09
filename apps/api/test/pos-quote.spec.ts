import {after,before,beforeEach,test} from "node:test";
import assert from "node:assert/strict";
import type {INestApplication} from "@nestjs/common";
import {createApplication} from "../src/bootstrap";
import {readConfig} from "../src/config";
import {Database} from "../src/database/database";
import {CashierTillsService} from "../src/cashier-tills/cashier-tills.service";
import {PosQuoteService} from "../src/cashier-tills/pos-quote.service";
import {CheckoutQuoteService} from "../src/orders/checkout-quote.service";
import {commerceTestPassword,seedCommerceFixtures} from "./commerce-fixtures";

let app:INestApplication,db:Database,tills:CashierTillsService,quotes:PosQuoteService,base:string;
let sequence=0;
const config=(enabled:boolean,tillEnabled=true)=>readConfig({
  DATABASE_URL:process.env.DATABASE_URL!, WEB_ORIGINS:"http://localhost:3000",
  API_STOCK_LOCATION_ID:"loc_accra",API_INSECURE_COOKIES:"true",
  POS_TILL_FOUNDATION_ENABLED:tillEnabled?"true":"false",
  POS_QUOTE_ENABLED:enabled?"true":"false",
  COMMERCE_LOCATION_ID:"loc_accra",CHECKOUT_PAYMENT_HOLD_MINUTES:"15",
  CHECKOUT_OFFLINE_HOLD_MINUTES:"1440",GUEST_CHECKOUT_TTL_MINUTES:"1440",
  ORDER_VERIFICATION_ACTIVE_VERSION:"1",
  ORDER_VERIFICATION_KEYS:JSON.stringify({"1":"11".repeat(32)}),
});
const lines=[{variantId:"var-rice",quantity:"2"},{variantId:"var-salt",quantity:"1"}];
async function token(email:string){
  const response=await fetch(base+"/api/v1/auth/sessions",{method:"POST",
    headers:{"content-type":"application/json",origin:"http://localhost:3000"},
    body:JSON.stringify({email,password:commerceTestPassword,client:"native"})});
  assert.equal(response.status,201);
  return (await response.json()).data.accessToken as string;
}
async function request(bearer:string|undefined,body:unknown){
  const r=await fetch(base+"/api/v1/admin/pos/quote",{
    method:"POST",headers:{
      "content-type":"application/json",
      ...(bearer?{authorization:"Bearer "+bearer}:{}),
    },body:JSON.stringify(body)});
  return {status:r.status,body:await r.json()};
}
async function open(locationId="loc_accra"){
  sequence++;
  return tills.open("admin-commerce",`pos-quote-open-${sequence}`,`pos-quote-req-${sequence}`,{
    locationId,tillCode:"QUOTE-"+sequence.toString().padStart(3,"0"),openingFloatMinor:300,
  });
}
async function counts(){
  return {
    orders:await db.order.count(),payments:await db.paymentAttempt.count(),
    reservations:await db.reservation.count(),depletion:await db.stockDepletion.count(),
    movements:await db.stockMovement.count(),drawerMovements:await db.cashierTillMovement.count(),
  };
}
before(async()=>{
  if(!new URL(process.env.DATABASE_URL!).pathname.endsWith("variety_foundation_test"))
    throw Error("POS quote tests require isolated PostgreSQL test database");
  app=await createApplication(config(true));
  await app.listen(0,"127.0.0.1");
  base=await app.getUrl();db=app.get(Database);
  tills=app.get(CashierTillsService);quotes=app.get(PosQuoteService);
});
beforeEach(async()=>{await seedCommerceFixtures(db);});
after(async()=>{await app?.close();});

test("POS quote uses exact online checkout prices and stock without a reservation or sale",async()=>{
  const cashier=await token("admin-commerce@example.test");
  const till=await open();const before=await counts();
  const result=await request(cashier,{sessionId:till.id,lines});
  assert.equal(result.status,200,JSON.stringify(result.body));
  const v=result.body.data;
  assert.equal(v.quoteOnly,true);
  assert.equal(v.stockReserved,false);
  assert.equal(v.orderCreated,false);
  assert.equal(v.paymentVerified,false);
  assert.equal(v.sessionId,till.id);
  assert.equal(v.locationId,"loc_accra");
  assert.equal(v.pricing.ok,true);
  assert.equal(v.pricing.deliveryFeeMinor,0);
  assert.equal(v.pricing.subtotalMinor,523);
  assert.equal(v.pricing.lines.find((l:any)=>l.variantId==="var-rice").available,"18");
  const online=await app.get(CheckoutQuoteService).quote({lines});
  assert.deepEqual(v.pricing,online);
  assert.deepEqual(await counts(),before);
});

test("POS quote refuses unknown fields, forged prices, invalid units, and unauthorized users",async()=>{
  const till=await open();
  const admin=await token("admin-commerce@example.test");
  const customer=await token("customer-a@example.test");
  const data={sessionId:till.id,lines};
  assert.equal((await request(undefined,data)).status,401);
  assert.equal((await request(customer,data)).status,403);
  assert.equal((await request(admin,{...data,unitPriceMinor:1})).status,400);
  assert.equal((await request(admin,{...data,lines:[{...lines[0],unitPriceMinor:1}]})).status,400);
  assert.equal((await request(admin,{...data,lines:[lines[0],lines[0]]})).status,400);
  assert.equal((await request(admin,{...data,lines:[{variantId:"var-salt",quantity:"1.5"}]})).status,400);
  assert.equal((await request(admin,{...data,lines:[{variantId:"var-rice",quantity:"-10"}]})).status,400);
  assert.equal((await request(admin,{...data,lines:[]})).status,400);
  assert.equal((await request(admin,{...data,lines:[{variantId:"missing",quantity:"1"}]})).status,404);
});

test("out-of-stock quotes are honest snapshots and do not hold stock",async()=>{
  const till=await open(),admin=await token("admin-commerce@example.test");
  const before=await counts();
  const r=await request(admin,{sessionId:till.id,lines:[{variantId:"var-rice",quantity:"19"}]});
  assert.equal(r.status,200);
  assert.equal(r.body.data.pricing.ok,false);
  assert.equal(r.body.data.pricing.conflicts[0].available,"18");
  assert.equal(r.body.data.stockReserved,false);
  assert.deepEqual(await counts(),before);
});

test("quotes reject a closed till and cannot falsely use another store's inventory",async()=>{
  const admin=await token("admin-commerce@example.test");
  const till=await open();
  await tills.close("admin-commerce",till.id,"quote-close","quote-close-req",{
    countedCashMinor:300,note:"All recorded drawer cash counted",
  });
  assert.equal((await request(admin,{sessionId:till.id,lines})).status,409);
  await db.location.create({data:{id:"loc_other_pos",name:"Other retail branch",active:true}});
  const other=await open("loc_other_pos");
  const r=await request(admin,{sessionId:other.id,lines});
  assert.equal(r.status,422);
  assert.equal(r.body.error.code,"POS_LOCATION_NOT_SUPPORTED");
});

test("quote gate remains independently OFF and requires the till foundation",async()=>{
  const till=await open();
  const off=new PosQuoteService(db,config(false),app.get(CheckoutQuoteService));
  await assert.rejects(()=>off.quote({sessionId:till.id,lines}),
    (e:any)=>e?.getStatus?.()===503);
  assert.throws(()=>config(true,false),/POS_QUOTE_ENABLED requires/);
});
