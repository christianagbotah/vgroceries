import {test} from "node:test";
import assert from "node:assert/strict";
import {confirmedSmsPayment} from "../src/notifications/order-sms-payment-evidence";
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
