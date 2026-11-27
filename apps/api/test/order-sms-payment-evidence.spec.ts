import {test} from "node:test";
import assert from "node:assert/strict";
import {confirmedSmsPayment,confirmedPaymentStatus} from "../src/notifications/order-sms-payment-evidence";
const event={type:"payment.succeeded",aggregateId:"attempt-1",payload:{attemptId:"attempt-1",orderId:"order-1",coverage:"confirmed"},createdAt:new Date("2026-11-25T10:00:01Z")};
const attempt={id:"attempt-1",orderId:"order-1",status:"succeeded",initiationState:"accepted",settlementState:"unsettled",currency:"GHS",amountMinor:500,resolvedAt:new Date("2026-11-25T10:00:00Z")};
const order={id:"order-1",paymentStatus:"succeeded",totalMinor:500,cancelledAt:null,fulfilmentStatus:"confirmed"};
const now=new Date("2026-11-25T10:00:05Z");
test("payment SMS requires confirmed coverage and authoritative matching money identity",()=>{
 assert.equal(confirmedSmsPayment(event,attempt,order,now),true);
 assert.equal(confirmedSmsPayment(event,{...attempt,settlementState:"reconciled"},order,now),true);
 for(const patch of [{status:"pending"},{settlementState:"exception"},{amountMinor:499},{currency:"USD"},{orderId:"different"},{resolvedAt:null}])
  assert.equal(confirmedSmsPayment(event,{...attempt,...patch},order,now),false);
 for(const patch of [{coverage:"failed"},{coverage:"not_applied"},{orderId:"different"},{attemptId:"different"}])
  assert.equal(confirmedSmsPayment({...event,payload:{...event.payload,...patch}},attempt,order,now),false);
 assert.equal(confirmedSmsPayment(event,attempt,{...order,paymentStatus:"requires_review"},now),false);
 assert.equal(confirmedSmsPayment(event,attempt,{...order,cancelledAt:new Date()},now),false);
});

test("database transaction timestamp may precede application resolution clock",()=>{
 assert.equal(confirmedSmsPayment(event,{...attempt,resolvedAt:new Date("2026-11-25T10:00:02Z")},order,now),true);
 assert.equal(confirmedSmsPayment(event,{...attempt,resolvedAt:new Date("2026-11-25T10:01:00Z")},order,now),false);
});


test("payment status notifications require exact latest persisted state, never claim payment received",()=>{
 const pending={...event,type:"payment.initiation_pending"};
 const current={...attempt,status:"pending",resolvedAt:null};
 const awaiting={...order,paymentStatus:"pending"};
 assert.equal(confirmedPaymentStatus(pending,current,awaiting,current.id,now),"payment.pending");
 assert.equal(confirmedPaymentStatus(pending,current,awaiting,"newer",now),null);
 assert.equal(confirmedPaymentStatus(pending,current,order,current.id,now),null);
 assert.equal(confirmedPaymentStatus(pending,{...current,settlementState:"exception"},awaiting,current.id,now),null);
 assert.equal(confirmedPaymentStatus({...pending,payload:{attemptId:"wrong",orderId:order.id}},current,awaiting,current.id,now),null);
 const failed={...attempt,status:"failed",initiationState:"rejected"};
 const failedOrder={...order,paymentStatus:"failed"};
 for(const type of ["payment.failed","payment.initiation_failed"])assert.equal(confirmedPaymentStatus({...event,type},failed,failedOrder,failed.id,now),"payment.failed");
 assert.equal(confirmedPaymentStatus({...event,type:"payment.failed"},failed,order,failed.id,now),null);
 assert.equal(confirmedPaymentStatus({...event,type:"payment.failed"},{...failed,resolvedAt:null},failedOrder,failed.id,now),null);
 assert.equal(confirmedPaymentStatus({...event,type:"payment.expired"},{...attempt,status:"expired"},{...order,paymentStatus:"expired"},attempt.id,now),"payment.expired");
 assert.equal(confirmedPaymentStatus({...event,type:"payment.requires_review"},{...attempt,settlementState:"exception"},{...order,paymentStatus:"requires_review"},"newer",now),"payment.requires_review");
 assert.equal(confirmedPaymentStatus({...event,type:"payment.requires_review"},attempt,{...order,paymentStatus:"requires_review"},attempt.id,now),null);
});
