import { after, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import type { INestApplication } from "@nestjs/common";
import { createApplication } from "../src/bootstrap";
import { readConfig } from "../src/config";
import { Database } from "../src/database/database";
import { commerceTestPassword, seedCommerceFixtures } from "./commerce-fixtures";
import { FakePaymentProvider } from "./fake-payment-provider";
import { FakeRefundProvider } from "./fake-refund-provider";

let app: INestApplication;
let second: INestApplication;
let db: Database;
let db2: Database;
let fake: FakeRefundProvider;
let base = "";

const config = () => readConfig({
  DATABASE_URL: process.env.DATABASE_URL!, WEB_ORIGINS: "http://localhost:3000",
  API_STOCK_LOCATION_ID: "loc_accra", API_INSECURE_COOKIES: "true",
  COMMERCE_LOCATION_ID: "loc_accra", CHECKOUT_PAYMENT_HOLD_MINUTES: "15",
  CHECKOUT_OFFLINE_HOLD_MINUTES: "1440", GUEST_CHECKOUT_TTL_MINUTES: "1440",
  ORDER_VERIFICATION_ACTIVE_VERSION: "1", ORDER_VERIFICATION_KEYS: JSON.stringify({ 1: "11".repeat(32) }),
  PAYMENT_PROVIDER_ID: "fake", PAYMENT_ENABLED_METHODS: "mobile_money,card_hosted,bank_transfer",
  PAYMENT_CONFIRMED_HOLD_MINUTES: "1440", PAYMENT_PROVIDER_TIMEOUT_MS: "250",
  PAYMENT_RECONCILE_AFTER_SECONDS: "120", PAYMENT_HOSTED_DOMAINS: "pay.example.test",
});

beforeEach(async () => {
  if (!new URL(process.env.DATABASE_URL!).pathname.endsWith("variety_foundation_test")) throw Error("isolated test DB required");
  await app?.close(); await second?.close();
  fake = new FakeRefundProvider();
  app = await createApplication(config(), [new FakePaymentProvider()], [fake]);
  second = await createApplication(config(), [new FakePaymentProvider()], [new FakeRefundProvider()]);
  await app.listen(0, "127.0.0.1");
  base = await app.getUrl(); db = app.get(Database); db2 = second.get(Database);
  await seedCommerceFixtures(db);
});
after(async () => { await second?.close(); await app?.close(); });

async function post(path:string, body:unknown, headers:Record<string,string>={}) {
  const response=await fetch(base+"/api/v1"+path,{method:"POST",headers:{"content-type":"application/json",...headers},body:JSON.stringify(body)});
  return {response,body:await response.json()};
}
async function login(email:string) { const x=await post("/auth/sessions",{email,password:commerceTestPassword,client:"native"},{origin:"http://localhost:3000"}); assert.equal(x.response.status,201); return x.body.data.accessToken as string; }
async function makeRefund(reference:string,status="awaiting_approval") {
  const order=await db.order.create({data:{reference,customerUserId:"customer-a",customerName:"Ama Customer",customerPhone:"+233241111111",fulfilment:"collection",paymentMethod:"mobile_money",paymentStatus:"refund_pending",fulfilmentStatus:"cancelled",deliveryStatus:"unassigned",subtotalMinor:1000,totalMinor:1000,verificationKeyVersion:1,verificationCodeHash:"e".repeat(64),cancelledAt:new Date(),cancelledReason:"Refund test"}});
  const capture=await db.paymentAttempt.create({data:{orderId:order.id,provider:"fake",method:"mobile_money",currency:"GHS",amountMinor:1000,merchantReference:`${reference}-PAY`,providerRef:`${reference}-PROV`,status:"succeeded",initiationState:"accepted",settlementState:"unsettled",resolvedAt:new Date()}});
  const refund=await db.refund.create({data:{orderId:order.id,paymentAttemptId:capture.id,provider:"fake",method:"mobile_money",currency:"GHS",amountMinor:1000,sourceType:"customer_cancellation",reason:"Refund test",status,requestedBy:"admin-commerce",...(status==="approved"?{approvedBy:"admin-commerce",approvedAt:new Date()}: {})}});
  return {order,capture,refund};
}
async function action(token:string,refundId:string,key:string,actionName:"approve"|"execute"|"retry"|"reconcile") { return post(`/refunds/${refundId}/actions`,{action:actionName},{authorization:`Bearer ${token}`,origin:"http://localhost:3000","idempotency-key":key}); }

test("refund approval is admin-only, idempotent and performs no provider I/O", async()=>{
  const admin=await login("admin-commerce@example.test"); const customer=await login("customer-a@example.test"); const c=await makeRefund("VG-REF-ACTION-APPROVE");
  assert.equal((await action(customer,c.refund.id,"refund-customer-denied-01","approve")).response.status,403);
  assert.equal((await action(admin,c.refund.id,"refund-execute-too-early-01","execute")).response.status,409);
  assert.equal(fake.initiateCalls.length,0);
  const first=await action(admin,c.refund.id,"refund-approve-idem-0001","approve"); assert.equal(first.response.status,200); assert.equal(first.body.data.refundStatus,"approved"); assert.equal(first.body.data.orderPaymentStatus,"refund_pending"); assert.equal(fake.initiateCalls.length,0);
  const replay=await action(admin,c.refund.id,"refund-approve-idem-0001","approve"); assert.equal(replay.response.status,200); assert.deepEqual(replay.body.data,first.body.data);
  const conflict=await action(admin,c.refund.id,"refund-approve-idem-0001","execute"); assert.equal(conflict.response.status,409); assert.equal(conflict.body.error.code,"IDEMPOTENCY_CONFLICT");
  const row=await db.refund.findUniqueOrThrow({where:{id:c.refund.id}}); assert.equal(row.approvedBy,"admin-commerce"); assert.ok(row.approvedAt); assert.equal(await db.auditEvent.count({where:{entityId:c.refund.id,action:"refund.approved"}}),1); assert.equal(await db.outboxEvent.count({where:{aggregateId:c.refund.id,type:"refund.approved"}}),1);
});

test("execute commits one stable intent before provider I/O and holds no database lock across the call", async()=>{
  const admin=await login("admin-commerce@example.test"); const c=await makeRefund("VG-REF-ACTION-BOUNDARY","approved"); let observedIntent=false;
  fake.initiateHandler=async(input)=>{
    await db2.$transaction(async(tx)=>{
      await tx.$queryRaw`SELECT id FROM "RefundExecution" WHERE id=${input.executionId} FOR UPDATE NOWAIT`;
      const execution=await tx.refundExecution.findUniqueOrThrow({where:{id:input.executionId}});
      assert.equal(execution.refundId,c.refund.id); assert.equal(execution.merchantRefundReference,input.merchantRefundReference); assert.equal(execution.status,"created"); observedIntent=true;
    });
    return {kind:"accepted",state:"pending",providerRefundReference:"BOUNDARY-RPROV"};
  };
  const result=await action(admin,c.refund.id,"refund-execute-boundary-01","execute"); assert.equal(result.response.status,200); assert.equal(result.body.data.refundStatus,"processing"); assert.equal(result.body.data.executionStatus,"pending"); assert.equal(observedIntent,true); assert.equal(fake.initiateCalls.length,1);
  const execution=await db.refundExecution.findUniqueOrThrow({where:{refundId:c.refund.id}}); assert.equal(execution.attemptCount,1); assert.equal(execution.providerRefundReference,"BOUNDARY-RPROV");
});

test("direct matching provider success records completed refund through the central outcome service", async()=>{
  const admin=await login("admin-commerce@example.test"); const c=await makeRefund("VG-REF-ACTION-SUCCESS","approved");
  fake.initiationResult={kind:"accepted",state:"succeeded",providerRefundReference:"SUCCESS-RPROV",amountMinor:1000,currency:"GHS"};
  const result=await action(admin,c.refund.id,"refund-execute-success-01","execute"); assert.equal(result.response.status,200); assert.equal(result.body.data.refundStatus,"succeeded"); assert.equal(result.body.data.executionStatus,"succeeded"); assert.equal(result.body.data.reconciliationState,"reconciled"); assert.equal(result.body.data.orderPaymentStatus,"refunded"); assert.equal(fake.initiateCalls.length,1);
  assert.equal((await db.paymentAttempt.findUniqueOrThrow({where:{id:c.capture.id}})).status,"succeeded");
});
