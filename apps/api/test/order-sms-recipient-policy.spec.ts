import {test} from "node:test";
import assert from "node:assert/strict";
import {guestOrderSmsProofWhere,registeredOrderSmsPhoneVerified,orderCreatedPaymentInstruction} from "../src/notifications/order-sms-recipient-policy";

const recordedAt=new Date("2026-11-26T08:00:00Z"),now=new Date("2026-11-26T08:01:00Z");
test("guest proof is bound to order, exact fingerprint, consumed purpose and consent time",()=>{
 assert.deepEqual(guestOrderSmsProofWhere("fixture-order","fixture-fingerprint",recordedAt,now),{
  userId:"fixture-order",purpose:"sensitive_action",recipientFingerprint:"fixture-fingerprint",status:"consumed",
  createdAt:{gte:recordedAt,lte:now},consumedAt:{gte:recordedAt,lte:now},
 });
});
test("registered recipient requires active customer and current matching verified phone",()=>{
 const user={active:true,role:"customer",phone:"+233241111111",phoneVerifiedAt:recordedAt};
 assert.equal(registeredOrderSmsPhoneVerified(user,user.phone,now),true);
 for(const patch of [{active:false},{role:"admin"},{phoneVerifiedAt:null},{phoneVerifiedAt:new Date(now.getTime()+1)},{phone:"+233242222222"}])
  assert.equal(registeredOrderSmsPhoneVerified({...user,...patch},user.phone,now),false);
 assert.equal(registeredOrderSmsPhoneVerified(null,user.phone,now),false);
});
test("only pending electronic orders may ask to complete existing payment",()=>{
 assert.match(orderCreatedPaymentInstruction("electronic","pending"),/existing order/);
 for(const status of ["succeeded","requires_review","failed","refunded"])
  assert.equal(orderCreatedPaymentInstruction("electronic",status),"");
 assert.equal(orderCreatedPaymentInstruction("cash_on_delivery","unpaid"),"");
});
