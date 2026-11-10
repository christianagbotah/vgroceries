import {after,before,beforeEach,test} from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import type {INestApplication} from "@nestjs/common";
import {createApplication} from "../src/bootstrap";
import {readConfig} from "../src/config";
import {Database} from "../src/database/database";
import {CashierTillsService} from "../src/cashier-tills/cashier-tills.service";
import {PosTillReconciliationService} from "../src/cashier-tills/pos-till-reconciliation.service";
import {PosHoldsService} from "../src/cashier-tills/pos-holds.service";
import {PosCashSalesService} from "../src/cashier-tills/pos-cash-sales.service";
import {CheckoutQuoteService} from "../src/orders/checkout-quote.service";
import {StockDepletionService} from "../src/inventory/stock-depletion.service";
import {commerceTestPassword,seedCommerceFixtures} from "./commerce-fixtures";

let app:INestApplication,db:Database,tills:CashierTillsService,
  holds:PosHoldsService,sales:PosCashSalesService,base:string;
let seq=0;
const config=(salesOn=true,ttl=2)=>readConfig({
  DATABASE_URL:process.env.DATABASE_URL!,
  WEB_ORIGINS:"http://localhost:3000",
  API_STOCK_LOCATION_ID:"loc_accra",
  API_INSECURE_COOKIES:"true",
  POS_TILL_FOUNDATION_ENABLED:"true",
  POS_QUOTE_ENABLED:"true",
  POS_STOCK_HOLDS_ENABLED:"true",
  POS_CASH_SALES_ENABLED:salesOn?"true":"false",
  POS_STOCK_HOLD_TTL_SECONDS:String(ttl),
  COMMERCE_LOCATION_ID:"loc_accra",
  CHECKOUT_PAYMENT_HOLD_MINUTES:"15",
  CHECKOUT_OFFLINE_HOLD_MINUTES:"1440",
  GUEST_CHECKOUT_TTL_MINUTES:"1440",
  ORDER_VERIFICATION_ACTIVE_VERSION:"1",
  ORDER_VERIFICATION_KEYS:JSON.stringify({"1":"11".repeat(32)}),
});
const cart=[{variantId:"var-rice",quantity:"2"},
  {variantId:"var-salt",quantity:"1"}];
async function open(){
  seq++;
  return tills.open("admin-commerce",`cash-till-open-${seq}`,`open-${seq}`,{
    locationId:"loc_accra",tillCode:`CASH-${seq}`,openingFloatMinor:1000,
  });
}
async function held(){
  const till=await open();
  const hold=await holds.create("admin-commerce",`cash-hold-${seq}`,`held-${seq}`,{
    tillSessionId:till.id,lines:cart,
  });
  return {till,hold};
}
async function token(email:string){
  const r=await fetch(base+"/api/v1/auth/sessions",{
    method:"POST",headers:{
      "content-type":"application/json",origin:"http://localhost:3000",
    },body:JSON.stringify({email,password:commerceTestPassword,client:"native"}),
  });
  assert.equal(r.status,201);
  return (await r.json()).data.accessToken as string;
}
async function api(method:"GET"|"POST",path:string,auth?:string,body?:unknown,key="sale-key-001"){
  const r=await fetch(base+"/api/v1"+path,{method,headers:{
    ...(auth?{authorization:"Bearer "+auth}:{}),
    ...(method==="POST"?{
      "content-type":"application/json","idempotency-key":key,
    }:{}),
  },...(method==="POST"?{body:JSON.stringify(body)}:{})});
  return {status:r.status,payload:await r.json()};
}
const request=(id:string,cash=600)=>({
  holdId:id,cashReceivedMinor:cash,cashCountConfirmed:true as const,
  goodsHandedOver:true as const,
  handoverNote:"Physically counted customer cash and handed over all products",
});
async function untouched(){
  return {
    orders:await db.order.count(),
    payments:await db.paymentAttempt.count(),
    refunds:await db.refund.count(),
    cashMovements:await db.cashierTillMovement.count(),
  };
}
before(async()=>{
  if(!new URL(process.env.DATABASE_URL!).pathname.endsWith("variety_foundation_test"))
    throw Error("POS cash tests require isolated PostgreSQL foundation database");
  app=await createApplication(config());
  await app.listen(0,"127.0.0.1");base=await app.getUrl();
  db=app.get(Database);tills=app.get(CashierTillsService);
  holds=app.get(PosHoldsService);sales=app.get(PosCashSalesService);
});
beforeEach(async()=>{await seedCommerceFixtures(db);});
after(async()=>{await app?.close();});

test("POS timestamps use UTC on every application database connection",async()=>{
  // A VPS may initialise PostgreSQL in a local timezone. A connection-level
  // UTC setting prevents a five-minute hold being interpreted hours ahead.
  const sessions=await Promise.all(Array.from({length:3},()=>db.$queryRaw<
    Array<{zone:string}>
  >`SELECT current_setting('TimeZone') AS zone`));
  for(const rows of sessions)assert.equal(rows[0]?.zone,"UTC");
});

test("one counted cash sale atomically depletes reserved goods and updates till balance",async()=>{
  const {till,hold}=await held(),before=await untouched();
  const admin=await token("admin-commerce@example.test");
  const result=await api("POST","/admin/pos/cash-sales",admin,request(hold.id),
    "cash-sale-ok-001");
  assert.equal(result.status,200,JSON.stringify(result.payload));
  const sale=result.payload.data;
  assert.match(sale.reference,/^VG-POS-[A-Z0-9]{12}$/);
  assert.equal(sale.subtotalMinor,523);
  assert.equal(sale.cashReceivedMinor,600);
  assert.equal(sale.changeGivenMinor,77);
  assert.equal(sale.paymentMethod,"cash");
  assert.equal(sale.taxInvoiceIssued,false);
  assert.equal(sale.electronicPaymentVerified,false);
  assert.equal(sale.goodsHandedOver,true);
  assert.equal(sale.stockDepletionId.length>0,true);
  assert.equal(await db.posCashSale.count(),1);
  assert.equal(await db.posCashReceiptLine.count({where:{saleId:sale.id}}),2);
  assert.equal(await db.stockDepletion.count({where:{
    claimType:"pos_draft",claimId:hold.id,kind:"pos_handover",
  }}),1);
  assert.equal(await db.reservation.count({where:{
    claimType:"pos_draft",claimId:hold.id,state:"consumed",
  }}),2);
  const storedHold=await holds.detail(hold.id);
  assert.equal(storedHold.status,"consumed");
  assert.equal(storedHold.stockReserved,false);
  assert.equal(storedHold.cashSaleRecorded,true);
  assert.equal(storedHold.goodsHandedOver,true);
  const quote=await app.get(CheckoutQuoteService).quote({lines:cart});
  assert.equal(quote.lines.find(l=>l.variantId==="var-rice")!.available,"16");
  assert.equal(quote.lines.find(l=>l.variantId==="var-salt")!.available,"9");
  const shift=await tills.detail(till.id);
  assert.equal(shift.expectedDrawerOnlyMinor,1000);
  assert.equal(shift.cashSalesMinor,523);
  assert.equal(shift.expectedDrawerCashMinor,1523);
  assert.equal(shift.includesSales,true);
  assert.deepEqual(await untouched(),before);
  const repeat=await api("POST","/admin/pos/cash-sales",admin,
    request(hold.id),"cash-sale-ok-001");
  assert.equal(repeat.status,200);
  assert.equal(repeat.payload.data.id,sale.id);
  assert.equal((await api("POST","/admin/pos/cash-sales",admin,
    request(hold.id,700),"cash-sale-ok-001")).status,409);
  assert.equal((await api("POST","/admin/pos/cash-sales",admin,
    request(hold.id),"cash-sale-retry-different-key")).status,409);
  await assert.rejects(()=>holds.release("admin-commerce",hold.id,
    "release-sold","release",{
      note:"Try to release an already completed stock sale",
    }),(e:any)=>e?.getStatus?.()===409);
  const receipt=await api("GET",`/admin/pos/cash-sales/${sale.id}`,admin);
  assert.equal(receipt.status,200);
  assert.equal(receipt.payload.data.reference,sale.reference);
  const printResponse=await fetch(
    base+`/api/v1/admin/pos/cash-sales/${sale.id}/print`,{
      headers:{authorization:"Bearer "+admin},
    });
  assert.equal(printResponse.status,200);
  assert.match(printResponse.headers.get("content-type")??"",/text\/html/);
  assert.match(printResponse.headers.get("cache-control")??"",/no-store/);
  const html=await printResponse.text();
  assert.match(html,/VARIETY GROCERIES/);
  assert.match(html,/Fixture Rice/);
  assert.match(html,/₵5\.23/);
  assert.match(html,/₵6\.00/);
  assert.match(html,/₵0\.77/);
  assert.match(html,/NOT A TAX INVOICE/);
  assert.equal((await api("GET","/admin/pos/cash-sales",admin)).status,200);
  const movement=await tills.move("admin-commerce",till.id,
    "cash-sale-drop-001","drop",{
      kind:"drop",amountMinor:100,note:"Verified cash drop to the safe",
    });
  assert.equal(movement.expectedDrawerCashMinor,1423);
  const closing=await tills.close("admin-commerce",till.id,
    "cash-sale-close-001","close",{
      countedCashMinor:1423,note:"Counted all cash including completed POS sale",
    });
  assert.equal(closing.closingExpectedMinor,1423);
  assert.equal(closing.closingDifferenceMinor,0);
  const reconciled=await app.get(PosTillReconciliationService).preview(till.id);
  assert.equal(reconciled.cashSalesCount,1);
  assert.equal(reconciled.cashSalesMinor,523);
  assert.equal(reconciled.openingFloatMinor,1000);
  assert.equal(reconciled.manualCashDropsMinor,100);
  assert.equal(reconciled.expectedDrawerCashMinor,1423);
  assert.equal(reconciled.actualCountedCashMinor,1423);
  assert.equal(reconciled.closingMatchesLedger,true);
  assert.equal(reconciled.recentCashSales[0]?.reference,sale.reference);
  assert.equal(reconciled.electronicPaymentsReconciled,false);
  assert.equal(reconciled.refundsReconciled,false);
});

test("unauthorised, fabricated tender, missing attestation and insufficient cash are rejected",async()=>{
  const {hold}=await held(),before=await untouched();
  const admin=await token("admin-commerce@example.test");
  const customer=await token("customer-a@example.test");
  const url="/admin/pos/cash-sales";
  assert.equal((await api("GET",url)).status,401);
  assert.equal((await api("GET",url,customer)).status,403);
  assert.equal((await api("POST",url,customer,request(hold.id),
    "cash-unauthorized")).status,403);
  assert.equal((await api("POST",url,admin,{
    ...request(hold.id),paymentMethod:"mobile_money",
  },"cash-fabricated-method")).status,400);
  assert.equal((await api("POST",url,admin,{
    ...request(hold.id),cashCountConfirmed:false,
  },"cash-unattested")).status,400);
  assert.equal((await api("POST",url,admin,{
    ...request(hold.id),goodsHandedOver:false,
  },"cash-no-handover")).status,400);
  assert.equal((await api("POST",url,admin,{
    ...request(hold.id),changeGivenMinor:0,
  },"cash-forged-change")).status,400);
  const underpaid=await api("POST",url,admin,request(hold.id,522),
    "cash-underpay");
  assert.equal(underpaid.status,422,JSON.stringify(underpaid.payload));
  assert.equal(await db.stockDepletion.count(),0);
  assert.equal(await db.posCashSale.count(),0);
  assert.deepEqual(await untouched(),before);
  const off=new PosCashSalesService(db,config(false),
    app.get(StockDepletionService));
  await assert.rejects(()=>off.complete("admin-commerce","disabled","req",
    request(hold.id)),(e:any)=>e?.getStatus?.()===503);
});

test("price changes or expired reservations veto sale before money and stock change",async()=>{
  const {hold}=await held();
  const old=await db.variant.findUniqueOrThrow({where:{id:"var-rice"}});
  await db.variant.update({where:{id:"var-rice"},data:{
    priceMinor:old.priceMinor+1,
  }});
  await assert.rejects(()=>sales.complete("admin-commerce","changed-price","req",
    request(hold.id)),(e:any)=>e?.getStatus?.()===409);
  assert.equal(await db.posCashSale.count(),0);
  assert.equal(await db.stockDepletion.count(),0);
  await db.variant.update({where:{id:"var-rice"},data:{
    priceMinor:old.priceMinor,
  }});
  const {hold:another}=await held();
  await new Promise(resolve=>setTimeout(resolve,2300));
  await assert.rejects(()=>sales.complete("admin-commerce","expired-sale","req",
    request(another.id)),(e:any)=>e?.getStatus?.()===409);
  assert.equal(await db.posCashSale.count(),0);
  assert.equal(await db.stockDepletion.count(),0);
});

test("same held cart cannot be sold twice concurrently with different keys",async()=>{
  const {hold}=await held();
  const responses=await Promise.allSettled([
    sales.complete("admin-commerce","race-cash-a","race-a",request(hold.id)),
    sales.complete("admin-commerce","race-cash-b","race-b",request(hold.id)),
  ]);
  assert.equal(responses.filter(r=>r.status==="fulfilled").length,1);
  assert.equal(await db.posCashSale.count(),1);
  assert.equal(await db.stockDepletion.count({where:{claimType:"pos_draft"}}),1);
});

test("SQL rejects false sales, altered receipt amounts and stock depletion without cash evidence",async()=>{
  const {hold}=await held();
  await assert.rejects(()=>db.posCashSale.create({data:{
    id:randomUUID(),reference:"VG-POS-FAKE12345678",
    holdId:hold.id,tillSessionId:hold.tillSessionId,
    locationId:"loc_accra",soldByUserId:"admin-commerce",
    stockDepletionId:randomUUID(),
    subtotalMinor:523,cashReceivedMinor:600,changeGivenMinor:77,
    handoverNote:"Forged cash-sale record without depleted stock",
    cashCountConfirmed:true,goodsHandedOver:true,
  }}));
  const sale=await sales.complete("admin-commerce","db-real-sale","req",
    request(hold.id));
  await assert.rejects(()=>db.posCashSale.update({
    where:{id:sale.id},data:{subtotalMinor:100},
  }));
  await assert.rejects(()=>db.posCashSale.delete({where:{id:sale.id}}));
  const savedLine=await db.posCashReceiptLine.findFirstOrThrow({
    where:{saleId:sale.id},
  });
  await assert.rejects(()=>db.posCashReceiptLine.update({
    where:{id:savedLine.id},data:{productName:"Forged rename"},
  }));
  await assert.rejects(()=>db.posCashReceiptLine.delete({
    where:{id:savedLine.id},
  }));
  await assert.rejects(()=>db.posStockHold.update({
    where:{id:hold.id},data:{status:"released",releasedAt:new Date(),
      releaseNote:"Forged return to stock after completed cash sale"},
  }));
  await assert.rejects(()=>db.cashierTillSession.update({
    where:{id:hold.tillSessionId},
    data:{status:"closed",closedAt:new Date(),closedByUserId:"admin-commerce",
      closingCountedMinor:1000,closingExpectedMinor:1000,
      closingDifferenceMinor:0,closeNote:"False cash count excluding real sale"},
  }));
});

test("reprints preserve sale-time item names and escape hostile catalog markup",async()=>{
  const oldName='<img src=x onerror="alert(1)">';
  const oldVariant='<script>alert("receipt")</script>';
  await db.product.update({where:{id:"product-rice"},data:{name:oldName}});
  await db.variant.update({where:{id:"var-rice"},data:{name:oldVariant}});
  const {hold}=await held();
  const sale=await sales.complete("admin-commerce","receipt-snapshot-001",
    "print-request",request(hold.id));
  await db.product.update({where:{id:"product-rice"},data:{
    name:"Changed product name after sale",
  }});
  await db.variant.update({where:{id:"var-rice"},data:{
    name:"Changed variant name after sale",
  }});
  const html=await sales.printReceipt(sale.id);
  assert.ok(html.includes("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;"));
  assert.ok(html.includes("&lt;script&gt;alert(&quot;receipt&quot;)&lt;/script&gt;"));
  assert.ok(!html.includes('<img src=x'));
  assert.ok(!html.includes('<script>alert'));
  assert.ok(!html.includes("Changed product name after sale"));
  assert.ok(!html.includes("Changed variant name after sale"));
  const customer=await token("customer-a@example.test");
  const unauthorized=await fetch(
    base+`/api/v1/admin/pos/cash-sales/${sale.id}/print`,{
      headers:{authorization:"Bearer "+customer},
    });
  assert.equal(unauthorized.status,403);
  const admin=await token("admin-commerce@example.test");
  const missing=await fetch(
    base+`/api/v1/admin/pos/cash-sales/${randomUUID()}/print`,{
      headers:{authorization:"Bearer "+admin},
    });
  assert.equal(missing.status,404);
});
