import {test} from "node:test";
import assert from "node:assert/strict";
import {customerDestinationFingerprint} from "../src/notifications/customer-message-crypto";
import {planOrderEmail,normalizeOrderEmail,hasOrderEmailProof,orderEmailCopy} from "../src/notifications/order-email-policy";
const before=new Date("2026-11-26T08:00:00Z"),eventTime=new Date("2026-11-26T08:00:01Z"),now=new Date("2026-11-26T08:01:00Z");
const email="customer@example.test";
const consent={orderId:"order",recipientFingerprint:customerDestinationFingerprint(email),policyVersion:"order-email-v1",recordedAt:before,verifiedAt:null as Date|null,revokedAt:null as Date|null};
const order={id:"order",reference:"VG-ABCDEF123456",customerEmail:email,emailConsent:consent};
const event={id:"event",type:"order.created",aggregateId:"order",createdAt:eventTime};
const input={order,event,enabled:true,evaluatedAt:now};
test("email consent is channel-specific, order-bound, address-bound and not retrospective",()=>{
 const plan=planOrderEmail(input);assert.equal(plan?.channel,"email");assert.equal(plan?.recipientFingerprint,consent.recipientFingerprint);
 assert.equal(JSON.stringify(plan).includes(email),false);
 for(const c of [null,{...consent,orderId:"other"},{...consent,policyVersion:"order-sms-v1"},{...consent,recordedAt:now},{...consent,revokedAt:now}]){
  assert.equal(planOrderEmail({...input,order:{...order,emailConsent:c}}),null);
 }
 assert.equal(planOrderEmail({...input,order:{...order,customerEmail:"other@example.test"}}),null);
 assert.equal(planOrderEmail({...input,enabled:false}),null);
});
test("payment and delivery email require independent committed evidence",()=>{
 for(const type of ["payment.succeeded","payment.pending","payment.failed","payment.expired","payment.requires_review","delivery.delivered","delivery.out_for_delivery","delivery.failed"]){
  const changed={...input,event:{...event,type}};
  assert.equal(planOrderEmail(changed),null);
  assert.ok(planOrderEmail({...changed,paymentConfirmed:true,deliveryConfirmed:true}));
 }
 assert.equal(planOrderEmail({...input,event:{...event,type:"refund.succeeded"}}),null);
});
test("address normalization rejects header injection and mailbox proof is fresh and independent",()=>{
 assert.equal(normalizeOrderEmail(" Customer@Example.TEST "),email);
 for(const value of ["a@b","x@example.test\r\nBcc:y@example.test","a@example.test,b@example.test","-x@example.test",null])assert.equal(normalizeOrderEmail(value),null);
 assert.equal(hasOrderEmailProof(consent,now),false);
 assert.equal(hasOrderEmailProof({...consent,verifiedAt:eventTime},now),true);
 assert.equal(hasOrderEmailProof({...consent,verifiedAt:new Date(before.getTime()-1)},now),false);
 assert.equal(hasOrderEmailProof({...consent,verifiedAt:new Date(now.getTime()+1)},now),false);
 assert.equal(hasOrderEmailProof({...consent,verifiedAt:eventTime,revokedAt:now},now),false);
});
test("payment email uses cedi amount and created email does not ask a paid customer to pay again",()=>{
 const paid={reference:order.reference,totalMinor:2535,paymentMethod:"electronic",paymentStatus:"succeeded"};
 assert.match(orderEmailCopy("payment.succeeded",paid).body,/₵25\.35/);
 assert.doesNotMatch(orderEmailCopy("order.created",paid).body,/secure payment instructions/);
 assert.match(orderEmailCopy("order.created",{...paid,paymentStatus:"pending"}).body,/Do not pay twice/);
});

test("pending and failure copy never claims receipt or asks for an immediate repeat payment",()=>{
 const orderState={reference:order.reference,totalMinor:500,paymentMethod:"electronic",paymentStatus:"pending"};
 assert.match(orderEmailCopy("payment.pending",orderState).body,/do not pay again/i);
 assert.match(orderEmailCopy("payment.failed",orderState).body,/If debited, contact support/i);
 assert.match(orderEmailCopy("payment.requires_review",orderState).body,/Do not pay again/i);
 assert.doesNotMatch(orderEmailCopy("payment.pending",orderState).body,/Amount received/);
});
