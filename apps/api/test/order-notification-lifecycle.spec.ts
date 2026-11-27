import {test} from "node:test";
import assert from "node:assert/strict";
import {customerMessage} from "../src/notifications/customer-channel-policy";
import {confirmedSmsRefund} from "../src/notifications/order-sms-refund-evidence";
import {currentOrderSmsState} from "../src/notifications/order-sms-dispatch";
import {planOrderSms} from "../src/notifications/order-sms-staging-policy";
import {planOrderEmail,orderEmailCopy} from "../src/notifications/order-email-policy";
import {customerDestinationFingerprint} from "../src/notifications/customer-message-crypto";
const when=new Date("2026-11-27T08:00:00Z"),now=new Date("2026-11-27T08:01:00Z"), reference="VG-ABCDEF123456";
const money={provider:"hubtel",method:"mobile_money",currency:"GHS",amountMinor:300};
const event={type:"refund.succeeded",aggregateId:"refund",payload:{refundId:"refund",orderId:"order"},createdAt:when};
const refund={id:"refund",orderId:"order",paymentAttemptId:"capture",...money,status:"succeeded",resolvedAt:when,
 execution:{refundId:"refund",...money,status:"succeeded",reconciliationState:"reconciled",resolvedAt:when},
 paymentAttempt:{id:"capture",orderId:"order",...money,status:"succeeded",amountMinor:500}};
test("refund alerts require reconciled matching execution and capture, not just an outbox event",()=>{
 assert.equal(confirmedSmsRefund(event,refund,"order",now),300);
 assert.equal(confirmedSmsRefund(event,{...refund,status:"processing"},"order",now),null);
 assert.equal(confirmedSmsRefund(event,{...refund,execution:{...refund.execution,reconciliationState:"exception"}},"order",now),null);
 assert.equal(confirmedSmsRefund(event,{...refund,execution:{...refund.execution,amountMinor:299}},"order",now),null);
 assert.equal(confirmedSmsRefund(event,{...refund,paymentAttempt:{...refund.paymentAttempt,orderId:"other"}},"order",now),null);
 assert.equal(confirmedSmsRefund(event,{...refund,paymentAttempt:{...refund.paymentAttempt,amountMinor:299}},"order",now),null);
 assert.equal(confirmedSmsRefund({...event,payload:{refundId:"other",orderId:"order"}},refund,"order",now),null);
});
test("both channels require independently confirmed refund amount and order consent",()=>{
 const phone="+233241111111",email="customer@example.test", recordedAt=new Date(when.getTime()-1000);
 const order={id:"order",reference,customerPhone:phone,customerEmail:email,
 smsConsent:{orderId:"order",recipientFingerprint:customerDestinationFingerprint(phone),policyVersion:"order-sms-v1",recordedAt,revokedAt:null},
 emailConsent:{orderId:"order",recipientFingerprint:customerDestinationFingerprint(email),policyVersion:"order-email-v1",recordedAt,verifiedAt:null,revokedAt:null}};
 const input={event:{id:"event",type:"refund.succeeded",aggregateId:"order",createdAt:when},order,enabled:true,evaluatedAt:now};
 assert.equal(planOrderSms(input),null);assert.equal(planOrderEmail(input),null);
 assert.ok(planOrderSms({...input,refundAmountMinor:300}));assert.ok(planOrderEmail({...input,refundAmountMinor:300}));
 assert.equal(planOrderEmail({...input,refundAmountMinor:0}),null);
 assert.equal(currentOrderSmsState("refund.succeeded","cancelled",when),true);
 assert.match(orderEmailCopy("refund.succeeded",{reference,totalMinor:500,paymentStatus:"refunded",paymentMethod:"mobile_money"},300).body,/₵3\.00/);
});
test("preparation and collection wording and stale-state suppression",()=>{
 assert.match(customerMessage("fulfilment.picking_started",reference).body,/preparing/);
 assert.match(customerMessage("fulfilment.packed",reference,undefined,"ready_for_collection").body,/ready for collection/);
 assert.match(customerMessage("fulfilment.handed_over",reference).body,/collected/);
 assert.equal(currentOrderSmsState("fulfilment.picking_started","picking",null),true);
 assert.equal(currentOrderSmsState("fulfilment.picking_started","packed",null),false);
 assert.equal(currentOrderSmsState("fulfilment.handed_over","collected",null),true);
 assert.equal(currentOrderSmsState("fulfilment.handed_over","dispatched",null),false);
});
