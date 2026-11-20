import {after,beforeEach,test} from "node:test";
import assert from "node:assert/strict";
import type {INestApplication} from "@nestjs/common";
import type {RefundProviderAdapter} from "../src/payments/refund-provider";
import {createApplication} from "../src/bootstrap";
import {readConfig} from "../src/config";
import {Database} from "../src/database/database";
import {HubtelPaymentProvider} from "../src/payments/hubtel-payment-provider";
import {commerceTestPassword,seedCommerceFixtures} from "./commerce-fixtures";

/**
 * Hubtel-hosted payment UAT against *isolated* PostgreSQL.
 *
 * IMPORTANT: No merchant secrets or live provider calls are used. All Hubtel
 * HTTP requests are intercepted by the strict local mock. The refund adapter
 * is intentionally a test-only capability shim, NOT an approved card/wallet
 * refund rail. In production the real MoMo-only Hubtel refund adapter MUST
 * still block hosted checkout launch.
 */
const CALLBACK_URL="https://example.test/api/v1/payments/providers/hubtel/events";
const TEST_TXN="hubtel-test-transaction-900001";
const expectedDomains=new Set(["payproxyapi.hubtel.com","api-txnstatus.hubtel.com"]);
let app:INestApplication;
let db:Database;
let base="";
let calls:{method:string;url:string}[]=[];
let recorded=new Map<string,number>();
let statusMode:"paid"|"unpaid"|"forbidden"|"wrong_amount"="paid";

const config=()=>readConfig({
  DATABASE_URL:process.env.DATABASE_URL!,
  WEB_ORIGINS:"http://localhost:3000",
  API_STOCK_LOCATION_ID:"loc_accra",API_INSECURE_COOKIES:"true",
  COMMERCE_LOCATION_ID:"loc_accra",CHECKOUT_PAYMENT_HOLD_MINUTES:"15",
  CHECKOUT_OFFLINE_HOLD_MINUTES:"1440",GUEST_CHECKOUT_TTL_MINUTES:"1440",
  ORDER_VERIFICATION_ACTIVE_VERSION:"1",ORDER_VERIFICATION_KEYS:JSON.stringify({1:"11".repeat(32)}),
  PAYMENT_PROVIDER_ID:"hubtel",PAYMENT_ENABLED_METHODS:"hosted_checkout",
  PAYMENT_CONFIRMED_HOLD_MINUTES:"1440",PAYMENT_PROVIDER_TIMEOUT_MS:"1000",
  PAYMENT_RECONCILE_AFTER_SECONDS:"120",PAYMENT_HOSTED_DOMAINS:"pay.hubtel.com",
  HUBTEL_CLIENT_ID:"strict-test-id-never-real",
  HUBTEL_CLIENT_SECRET:"strict-test-key-never-real",
  HUBTEL_CALLBACK_URL:CALLBACK_URL,
  HUBTEL_RETURN_URL:"https://example.test/checkout/payment-return",
  HUBTEL_CANCELLATION_URL:"https://example.test/checkout/payment-return?cancelled=1",
  HUBTEL_COLLECTION_ACCOUNT_NUMBER:"999999999",
  HUBTEL_ONLINE_CHECKOUT_URL:"https://payproxyapi.hubtel.com/items/initiate",
  HUBTEL_COLLECTION_STATUS_URL:"https://api-txnstatus.hubtel.com/transactions/{merchantAccountNumber}/status?clientReference={reference}",
});

const noFinancialRefund:RefundProviderAdapter={
  id:"hubtel",
  capabilities:()=>({
    methods:["hosted_checkout"],lookupSupported:true,
    safeRetryAfterDefinitiveFailure:false,
    safeRetryAfterNoRecord:false,
    safeRetryAfterUnknown:false,
  }),
  initiateRefund:async()=>{throw new Error("No real or mock refund transaction is allowed in this payment UAT");},
  lookupRefund:async()=>{throw new Error("No refund verification is allowed in this payment UAT");},
};

const providerFetch:typeof fetch=async(input,init)=>{
  const url=typeof input==="string"?input:input instanceof URL?input.toString():input.url;
  const route=new URL(url);
  const method=init?.method??"GET";
  assert.ok(expectedDomains.has(route.hostname),"unexpected provider hostname");
  calls.push({method,url:route.origin+route.pathname});
  assert.equal(new Headers(init?.headers).get("authorization"),
    "Basic "+Buffer.from("strict-test-id-never-real:strict-test-key-never-real").toString("base64"));
  assert.equal(init?.redirect,"error");
  if(route.hostname==="payproxyapi.hubtel.com"){
    assert.equal(method,"POST");
    assert.equal(route.pathname,"/items/initiate");
    const payload=JSON.parse(String(init?.body));
    assert.equal(payload.merchantAccountNumber,"999999999");
    assert.match(payload.clientReference,/^VG-PAY-[0-9A-F]{24}$/);
    assert.equal(recorded.has(payload.clientReference),false,"duplicate provider checkout initiation");
    recorded.set(payload.clientReference,Math.round(payload.totalAmount*100));
    return Response.json({
      responseCode:"0000",status:"Success",data:{
        checkoutId:"test-checkout-session",
        checkoutUrl:"https://pay.hubtel.com/test-checkout-session",
        clientReference:payload.clientReference,
      },
    });
  }
  assert.equal(method,"GET");
  assert.equal(route.pathname,"/transactions/999999999/status");
  const reference=route.searchParams.get("clientReference");
  assert.ok(reference&&recorded.has(reference),"lookup must use original merchant reference");
  if(statusMode==="forbidden")return Response.json({message:"Forbidden"},{status:403});
  const amountMinor=recorded.get(reference)!+(statusMode==="wrong_amount"?1:0);
  return Response.json({
    responseCode:"0000",message:"Successful",data:{
      clientReference:reference,
      transactionId:TEST_TXN,
      status:statusMode==="unpaid"?"Unpaid":"Paid",
      paymentMethod:"mobilemoney",
      amount:amountMinor/100,
      currencyCode:null,
      date:"2026-11-20T00:00:00Z",
    },
  });
};

async function start(){
  if(app)await app.close();
  calls=[];
  recorded=new Map();
  statusMode="paid";
  const configuration=config();
  const provider=new HubtelPaymentProvider(configuration.hubtelPayment!,providerFetch);
  app=await createApplication(configuration,[provider],[noFinancialRefund]);
  await app.listen(0,"127.0.0.1");
  base=await app.getUrl();
  db=app.get(Database);
  await seedCommerceFixtures(db);
}
beforeEach(async()=>{
  const database=process.env.DATABASE_URL;
  if(!database||!new URL(database).pathname.endsWith("variety_foundation_test"))
    throw Error("Hubtel merchant UAT refuses non-disposable databases: requires variety_foundation_test");
  await start();
});
after(async()=>{await app?.close();});

async function post(path:string,body:unknown,headers:Record<string,string>={}){
  const response=await fetch(base+"/api/v1"+path,{
    method:"POST",headers:{"content-type":"application/json",...headers},
    body:JSON.stringify(body),
  });
  return {status:response.status,body:await response.json()};
}
async function session(email="customer-a@example.test"){
  const login=await post("/auth/sessions",{
    email,password:commerceTestPassword,client:"native",
  },{origin:"http://localhost:3000"});
  assert.equal(login.status,201);
  return login.body.data.accessToken as string;
}
async function checkout(){
  const token=await session();
  const suffix=`${Date.now()}${Math.random().toString().slice(2)}`;
  const headers={
    authorization:`Bearer ${token}`,origin:"http://localhost:3000",
    "idempotency-key":"hubtel-order-"+suffix,
  };
  const order=await post("/checkout/complete",{
    lines:[{variantId:"var-salt",quantity:"1"}],
    customerName:"Test Customer",customerPhone:"+233241111111",
    fulfilment:"collection",paymentMethod:"electronic",
  },headers);
  assert.equal(order.status,201);
  const orderId=order.body.data.orderId as string;
  const initiation=await post(`/orders/${orderId}/payment-attempts`,{},{
    ...headers,"idempotency-key":"hubtel-pay-"+suffix,
  });
  assert.equal(initiation.status,201);
  const attempt=await db.paymentAttempt.findUniqueOrThrow({
    where:{id:initiation.body.data.attemptId as string},
  });
  assert.equal(attempt.provider,"hubtel");
  assert.equal(attempt.method,"hosted_checkout");
  assert.equal(recorded.get(attempt.merchantReference),attempt.amountMinor);
  assert.equal(initiation.body.data.attemptStatus,"pending");
  assert.equal(initiation.body.data.action.kind,"redirect");
  assert.equal((await db.order.findUniqueOrThrow({where:{id:orderId}})).paymentStatus,"pending");
  return {token,orderId,attempt,initiation,paymentIdempotencyKey:headers["idempotency-key"].replace("hubtel-order-","hubtel-pay-")};
}
async function callback(merchantReference:string,claimedStatus:string,nonce="same"){
  const response=await fetch(base+"/api/v1/payments/providers/hubtel/events",{
    method:"POST",headers:{"content-type":"application/json"},
    body:JSON.stringify({data:{
      clientReference:merchantReference,transactionId:TEST_TXN,
      status:claimedStatus,nonce,
    }}),
  });
  return {status:response.status,body:await response.json()};
}
function providerCalls(method:string){
  return calls.filter(x=>x.method===method).length;
}

test("hosted callback lies about failure but authoritative Paid lookup settles order exactly once",async()=>{
  const {orderId,attempt,token,paymentIdempotencyKey}=await checkout();
  assert.equal(providerCalls("POST"),1);
  assert.equal(providerCalls("GET"),0);
  const first=await callback(attempt.merchantReference,"Failed");
  assert.equal(first.status,200);
  assert.equal(first.body.data.duplicate,false);
  assert.equal(providerCalls("GET"),1);
  assert.equal((await db.paymentAttempt.findUniqueOrThrow({where:{id:attempt.id}})).status,"succeeded");
  assert.equal((await db.order.findUniqueOrThrow({where:{id:orderId}})).paymentStatus,"succeeded");
  assert.equal(await db.outboxEvent.count({where:{type:"payment.succeeded",aggregateId:attempt.id}}),1);
  const copy=await callback(attempt.merchantReference,"Failed");
  assert.equal(copy.status,200);
  assert.equal(copy.body.data.duplicate,true);
  assert.equal(providerCalls("POST"),1);
  assert.equal(await db.outboxEvent.count({where:{type:"payment.succeeded",aggregateId:attempt.id}}),1);
  assert.equal(await db.paymentProviderEvent.count({where:{paymentAttemptId:attempt.id}}),1);
  assert.equal((await db.paymentAttempt.findUniqueOrThrow({where:{id:attempt.id}})).callbackCount,2);
  const replay=await post(`/orders/${orderId}/payment-attempts`,{},{
    authorization:`Bearer ${token}`,origin:"http://localhost:3000",
    "idempotency-key":paymentIdempotencyKey,
  });
  assert.equal(replay.status,201);
  assert.equal(replay.body.data.attemptId,attempt.id);
  assert.equal(providerCalls("POST"),1);
});

test("false Paid callback cannot settle while real Hubtel status is Unpaid",async()=>{
  const {orderId,attempt}=await checkout();
  statusMode="unpaid";
  const event=await callback(attempt.merchantReference,"Paid");
  assert.equal(event.status,200);
  assert.equal((await db.order.findUniqueOrThrow({where:{id:orderId}})).paymentStatus,"pending");
  assert.notEqual((await db.paymentAttempt.findUniqueOrThrow({where:{id:attempt.id}})).status,"succeeded");
  assert.equal(await db.outboxEvent.count({where:{type:"payment.succeeded",aggregateId:attempt.id}}),0);
  assert.equal(providerCalls("POST"),1);
});

test("Hubtel 403 on lookup preserves payment uncertainty and never issues another charge",async()=>{
  const {orderId,attempt,token,paymentIdempotencyKey}=await checkout();
  statusMode="forbidden";
  const event=await callback(attempt.merchantReference,"Paid");
  // HTTP 200 may acknowledge persisted callback evidence even when the
  // independent provider status call returned 403. It is NOT a paid receipt.
  assert.equal(event.status,200);
  assert.equal(await db.paymentProviderEvent.count({where:{paymentAttemptId:attempt.id}}),1);
  assert.notEqual((await db.order.findUniqueOrThrow({where:{id:orderId}})).paymentStatus,"succeeded");
  assert.notEqual((await db.paymentAttempt.findUniqueOrThrow({where:{id:attempt.id}})).status,"succeeded");
  assert.equal(await db.outboxEvent.count({where:{type:"payment.succeeded",aggregateId:attempt.id}}),0);
  const replay=await post(`/orders/${orderId}/payment-attempts`,{},{
    authorization:`Bearer ${token}`,origin:"http://localhost:3000",
    "idempotency-key":paymentIdempotencyKey,
  });
  assert.ok([201,409,503].includes(replay.status));
  assert.equal(providerCalls("POST"),1,"transport failure cannot create duplicate charge");
});

test("a one-pesewa status mismatch fails closed despite Paid label and transaction ID",async()=>{
  const {orderId,attempt}=await checkout();
  statusMode="wrong_amount";
  const event=await callback(attempt.merchantReference,"Paid");
  assert.equal(event.status,200);
  assert.notEqual((await db.order.findUniqueOrThrow({where:{id:orderId}})).paymentStatus,"succeeded");
  assert.equal(await db.outboxEvent.count({where:{type:"payment.succeeded",aggregateId:attempt.id}}),0);
  assert.equal(providerCalls("POST"),1);
});
