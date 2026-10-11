import { after, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import type { INestApplication } from "@nestjs/common";
import { createApplication } from "../src/bootstrap";
import { readConfig } from "../src/config";
import { Database } from "../src/database/database";
import { commerceTestPassword, seedCommerceFixtures } from "./commerce-fixtures";
import { FakePaymentProvider } from "./fake-payment-provider";
import { FakeRefundProvider } from "./fake-refund-provider";

let app:INestApplication; let db:Database; let fake:FakeRefundProvider; let base="";
const config=()=>readConfig({DATABASE_URL:process.env.DATABASE_URL!,WEB_ORIGINS:"http://localhost:3000",API_STOCK_LOCATION_ID:"loc_accra",API_INSECURE_COOKIES:"true",COMMERCE_LOCATION_ID:"loc_accra",CHECKOUT_PAYMENT_HOLD_MINUTES:"15",CHECKOUT_OFFLINE_HOLD_MINUTES:"1440",GUEST_CHECKOUT_TTL_MINUTES:"1440",ORDER_VERIFICATION_ACTIVE_VERSION:"1",ORDER_VERIFICATION_KEYS:JSON.stringify({1:"11".repeat(32)}),PAYMENT_PROVIDER_ID:"fake",PAYMENT_ENABLED_METHODS:"mobile_money,card_hosted,bank_transfer",PAYMENT_CONFIRMED_HOLD_MINUTES:"1440",PAYMENT_PROVIDER_TIMEOUT_MS:"100",PAYMENT_RECONCILE_AFTER_SECONDS:"120",PAYMENT_HOSTED_DOMAINS:"pay.example.test"});
beforeEach(async()=>{if(!new URL(process.env.DATABASE_URL!).pathname.endsWith("variety_foundation_test"))throw Error("isolated test DB required");await app?.close();fake=new FakeRefundProvider();app=await createApplication(config(),[new FakePaymentProvider()],[fake]);await app.listen(0,"127.0.0.1");base=await app.getUrl();db=app.get(Database);await seedCommerceFixtures(db);});
after(async()=>{await app?.close();});
async function post(path:string,body:unknown,headers:Record<string,string>={}){const response=await fetch(base+"/api/v1"+path,{method:"POST",headers:{"content-type":"application/json",...headers},body:JSON.stringify(body)});return{response,body:await response.json()};}
async function admin(){const x=await post("/auth/sessions",{email:"admin-commerce@example.test",password:commerceTestPassword,client:"native"},{origin:"http://localhost:3000"});assert.equal(x.response.status,201);return x.body.data.accessToken as string;}
async function makeRefund(reference:string,status="approved"){
 const order=await db.order.create({data:{reference,customerUserId:"customer-a",customerName:"Ama",customerPhone:"+233241111111",fulfilment:"collection",paymentMethod:"mobile_money",paymentStatus:"refund_pending",fulfilmentStatus:"cancelled",deliveryStatus:"unassigned",subtotalMinor:1000,totalMinor:1000,verificationKeyVersion:1,verificationCodeHash:"f".repeat(64),cancelledAt:new Date(),cancelledReason:"Refund"}});
 const capture=await db.paymentAttempt.create({data:{orderId:order.id,provider:"fake",method:"mobile_money",currency:"GHS",amountMinor:1000,merchantReference:`${reference}-PAY`,providerRef:`${reference}-PROV`,status:"succeeded",initiationState:"accepted",settlementState:"unsettled",resolvedAt:new Date()}});
 const refund=await db.refund.create({data:{orderId:order.id,paymentAttemptId:capture.id,provider:"fake",method:"mobile_money",currency:"GHS",amountMinor:1000,sourceType:"customer_cancellation",reason:"Refund",status,requestedBy:"admin-commerce",approvedBy:"admin-commerce",approvedAt:new Date()}});return{order,capture,refund};
}
async function action(token:string,id:string,key:string,name:"execute"|"retry"|"reconcile"){return post(`/refunds/${id}/actions`,{action:name},{authorization:`Bearer ${token}`,origin:"http://localhost:3000","idempotency-key":key});}

test("timeout after provider acceptance becomes uncertain and same-key replay recovers by lookup without resend",async()=>{
 const token=await admin();const c=await makeRefund("VG-REF-RECOVER-TIMEOUT");let merchant="";
 fake.initiateHandler=async(input)=>{merchant=input.merchantRefundReference;throw new Error("simulated network timeout after acceptance");};
 const first=await action(token,c.refund.id,"refund-timeout-idem-0001","execute");assert.equal(first.response.status,200);assert.equal(first.body.data.refundStatus,"requires_review");assert.equal(first.body.data.executionStatus,"uncertain");assert.equal(fake.initiateCalls.length,1);
 const execution=await db.refundExecution.findUniqueOrThrow({where:{refundId:c.refund.id}});assert.equal(execution.merchantRefundReference,merchant);assert.equal(execution.attemptCount,1);
 fake.lookupHandler=async(input)=>({providerId:"fake",merchantRefundReference:input.merchantRefundReference,providerRefundReference:"RECOVER-RPROV",state:"succeeded",amountMinor:1000,currency:"GHS"});
 const recovered=await action(token,c.refund.id,"refund-timeout-idem-0001","execute");assert.equal(recovered.response.status,200);assert.equal(recovered.body.data.refundStatus,"succeeded");assert.equal(recovered.body.data.executionStatus,"succeeded");assert.equal(recovered.body.data.orderPaymentStatus,"refunded");assert.equal(fake.initiateCalls.length,1);assert.equal(fake.lookupCalls.length,1);assert.equal(fake.lookupCalls[0]!.merchantRefundReference,merchant);
 const recon=await db.refundReconciliation.findMany({where:{refundId:c.refund.id}});assert.equal(recon.length,1);assert.equal(recon[0]!.trigger,"execute_recovery");assert.equal(recon[0]!.result,"matched");
});

async function makeUncertainExecution(reference:string,state:"failed"|"not_found"|"unknown"){
 const c=await makeRefund(reference,"requires_review");
 const execution=await db.refundExecution.create({data:{refundId:c.refund.id,provider:"fake",method:"mobile_money",currency:"GHS",amountMinor:1000,merchantRefundReference:`${reference}-REFUND`,originalPaymentMerchantReference:c.capture.merchantReference,originalPaymentProviderReference:c.capture.providerRef,status:state==="failed"?"failed":"uncertain",reconciliationState:"exception",attemptCount:1,...(state==="failed"?{failureReason:"Prior definitive failure",resolvedAt:new Date()}: {})}});
 return{...c,execution,state};
}

test("retry lookup obeys provider capability before any resend for failed, no-record and unknown outcomes",async()=>{
 const token=await admin();
 for(const state of ["failed","not_found","unknown"] as const){
   const unsafe=await makeUncertainExecution(`VG-REF-RETRY-UNSAFE-${state.toUpperCase()}`,state);
   fake.lookupHandler=async(input)=>({providerId:"fake",merchantRefundReference:input.merchantRefundReference,state, ...(state==="failed"?{failureCode:"DECLINED",customerSafeMessage:"Refund failed."}: {})});
   fake.capabilitiesValue={...fake.capabilitiesValue,safeRetryAfterDefinitiveFailure:false,safeRetryAfterNoRecord:false,safeRetryAfterUnknown:false};
   const before=fake.initiateCalls.length;const blocked=await action(token,unsafe.refund.id,`refund-retry-unsafe-${state}-01`,"retry");assert.equal(blocked.response.status,200);assert.equal(blocked.body.data.refundStatus,state==="failed"?"failed":"requires_review");assert.equal(fake.initiateCalls.length,before,state);
   const rec=await db.refundReconciliation.findFirstOrThrow({where:{refundId:unsafe.refund.id},orderBy:{createdAt:"desc"}});assert.equal(rec.trigger,"retry");assert.equal(rec.observedState,state);

   const safe=await makeUncertainExecution(`VG-REF-RETRY-SAFE-${state.toUpperCase()}`,state);
   fake.capabilitiesValue={...fake.capabilitiesValue,safeRetryAfterDefinitiveFailure:state==="failed",safeRetryAfterNoRecord:state==="not_found",safeRetryAfterUnknown:state==="unknown"};
   fake.initiationResult={kind:"accepted",state:"pending",providerRefundReference:`SAFE-${state}-RPROV`};
   const beforeSafe=fake.initiateCalls.length;const retried=await action(token,safe.refund.id,`refund-retry-safe-${state}-01`,"retry");assert.equal(retried.response.status,200);assert.equal(retried.body.data.refundStatus,"processing");assert.equal(retried.body.data.executionStatus,"pending");assert.equal(fake.initiateCalls.length,beforeSafe+1,state);assert.equal(fake.initiateCalls.at(-1)!.merchantRefundReference,safe.execution.merchantRefundReference);assert.equal((await db.refundExecution.findUniqueOrThrow({where:{id:safe.execution.id}})).attemptCount,2);
 }
});

test("manual reconcile performs lookup only and applies matching authoritative success",async()=>{
 const token=await admin();const c=await makeRefund("VG-REF-MANUAL-RECON","processing");const execution=await db.refundExecution.create({data:{refundId:c.refund.id,provider:"fake",method:"mobile_money",currency:"GHS",amountMinor:1000,merchantRefundReference:"VG-REF-MANUAL-RECON-REFUND",originalPaymentMerchantReference:c.capture.merchantReference,originalPaymentProviderReference:c.capture.providerRef,status:"pending",reconciliationState:"unreconciled",attemptCount:1}});
 fake.lookupHandler=async(input)=>({providerId:"fake",merchantRefundReference:input.merchantRefundReference,providerRefundReference:"MANUAL-RPROV",state:"succeeded",amountMinor:1000,currency:"GHS"});
 const result=await action(token,c.refund.id,"refund-manual-reconcile-01","reconcile");assert.equal(result.response.status,200);assert.equal(result.body.data.refundStatus,"succeeded");assert.equal(result.body.data.orderPaymentStatus,"refunded");assert.equal(fake.initiateCalls.length,0);assert.equal(fake.lookupCalls.length,1);
 const recon=await db.refundReconciliation.findFirstOrThrow({where:{refundExecutionId:execution.id}});assert.equal(recon.trigger,"manual_reconcile");assert.equal(recon.result,"matched");
});

test("local outbox fault after provider success recovers by lookup and never sends a second transfer",async()=>{
 const token=await admin();const c=await makeRefund("VG-REF-RECOVER-OUTBOX");let merchant="";
 fake.initiateHandler=async(input)=>{merchant=input.merchantRefundReference;return{kind:"accepted",state:"succeeded",providerRefundReference:"OUTBOX-RPROV",amountMinor:1000,currency:"GHS"};};
 await db.$executeRawUnsafe(`CREATE FUNCTION reject_refund_success_outbox() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.type='refund.succeeded' THEN RAISE EXCEPTION 'refund success outbox fault'; END IF; RETURN NEW; END; $$`);
 await db.$executeRawUnsafe(`CREATE TRIGGER reject_refund_success_outbox BEFORE INSERT ON "OutboxEvent" FOR EACH ROW EXECUTE FUNCTION reject_refund_success_outbox()`);
 try{
   const first=await action(token,c.refund.id,"refund-outbox-recovery-01","execute");assert.equal(first.response.status,200);assert.equal(first.body.data.refundStatus,"requires_review");assert.equal(first.body.data.executionStatus,"uncertain");assert.equal(fake.initiateCalls.length,1);
 }finally{
   await db.$executeRawUnsafe(`DROP TRIGGER reject_refund_success_outbox ON "OutboxEvent"`);await db.$executeRawUnsafe(`DROP FUNCTION reject_refund_success_outbox()`);
 }
 fake.lookupHandler=async(input)=>({providerId:"fake",merchantRefundReference:input.merchantRefundReference,providerRefundReference:"OUTBOX-RPROV",state:"succeeded",amountMinor:1000,currency:"GHS"});
 const recovered=await action(token,c.refund.id,"refund-outbox-recovery-01","execute");assert.equal(recovered.response.status,200);assert.equal(recovered.body.data.refundStatus,"succeeded");assert.equal(fake.initiateCalls.length,1);assert.equal(fake.lookupCalls.length,1);assert.equal(fake.lookupCalls[0]!.merchantRefundReference,merchant);assert.equal((await db.refundExecution.findUniqueOrThrow({where:{refundId:c.refund.id}})).attemptCount,1);
});
