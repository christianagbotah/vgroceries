import {test} from "node:test";
import assert from "node:assert/strict";
import {planOrderSms,orderSmsStageEvents} from "../src/notifications/order-sms-staging-policy";
import {customerDestinationFingerprint} from "../src/notifications/customer-message-crypto";
const phone="+233241111111";
const recordedAt=new Date("2026-11-25T09:00:00Z");
const event={id:"event-1",type:"order.created",aggregateId:"order-1",createdAt:new Date("2026-11-25T09:00:01Z")};
const consent={orderId:"order-1",recipientFingerprint:customerDestinationFingerprint(phone),policyVersion:"order-sms-v1",recordedAt,revokedAt:null as Date|null};
const order={id:"order-1",reference:"VG-TEST12345678",customerPhone:phone,smsConsent:consent};
const base={event,order,enabled:true,evaluatedAt:new Date("2026-11-25T09:01:00Z")};
test("order-owned events produce only a consent-bound metadata plan",()=>{
 for(const type of orderSmsStageEvents){
  const plan=planOrderSms({...base,event:{...event,type}});
  assert.deepEqual(plan,{sourceEventId:event.id,channel:"sms",recipientFingerprint:consent.recipientFingerprint,templateKey:type,consentRecordedAt:recordedAt});
  assert.ok(!JSON.stringify(plan).includes(phone));
 }
});
test("staging rejects absent, revoked, future or mismatched consent",()=>{
 assert.equal(planOrderSms({...base,enabled:false}),null);
 assert.equal(planOrderSms({...base,order:{...order,smsConsent:null}}),null);
 for(const change of [{orderId:"another-order"},{recipientFingerprint:"bad"},{policyVersion:"unknown"},{recordedAt:new Date("2026-11-25T10:00:00Z")},{revokedAt:new Date("2026-11-25T09:00:30Z")}])
  assert.equal(planOrderSms({...base,order:{...order,smsConsent:{...consent,...change}}}),null);
 assert.equal(planOrderSms({...base,order:{...order,customerPhone:"+233241111112"}}),null);
 assert.equal(planOrderSms({...base,event:{...event,aggregateId:"another-order"}}),null);
});
test("unverified financial/courier events, invalid destinations and references fail closed",()=>{
 for(const type of ["payment.succeeded","payment.pending","payment.failed","payment.expired","payment.requires_review","refund.succeeded","delivery.delivered","delivery.out_for_delivery","delivery.failed","unknown"])
  assert.equal(planOrderSms({...base,event:{...event,type}}),null);
 assert.equal(planOrderSms({...base,order:{...order,reference:"invalid"}}),null);
 assert.equal(planOrderSms({...base,order:{...order,customerPhone:"0241111111"}}),null);
});
