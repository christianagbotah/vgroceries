import "reflect-metadata";
import assert from "node:assert/strict";
import { test } from "node:test";
import { OrdersController } from "../src/orders/orders.controller";
import { OtpIssueRateLimited } from "../src/notifications/customer-otp-repository";

function controller(codeAccepted: boolean) {
  let lookedUp = 0;
  let failed = 0;
  const db = {
    order: {findUnique: async () => ({id:"11111111-1111-4111-8111-111111111111"})},
    customerOtpChallenge: {findFirst: async () => ({id:"22222222-2222-4222-8222-222222222222"})},
  };
  const query = {
    limitTracking: async () => { lookedUp++; },
    registerFailedTracking: async () => { failed++; },
    verifiedOrderDetails: async () => ({ reference:"VG-ABCDEF123456", verified:true }),
  };
  const orders = new OrdersController({} as never,query as never,db as never);
  // Stub provider / DB repo: never send an SMS or touch real order records.
  (orders as unknown as {otpRepo:()=>unknown}).otpRepo=()=>({verify:async()=>codeAccepted});
  return {orders, metrics:()=>({lookedUp,failed})};
}
const body = { reference:"VG-ABCDEF123456",challengeId:"22222222-2222-4222-8222-222222222222",code:"123456" };
const req = {ip:"198.51.100.12",socket:{remoteAddress:"127.0.0.1"}};

test("successful private SMS verification counts as a lookup, not a failed code", async()=>{
  const {orders,metrics}=controller(true);
  const result=await orders.verifyOrderOtp(body,req as never);
  assert.equal((result.data as unknown as {verified:boolean}).verified,true);
  assert.deepEqual(metrics(),{lookedUp:1,failed:0});
});

test("failed SMS proof consumes failed-code allowance but never exposes details",async()=>{
  const {orders,metrics}=controller(false);
  await assert.rejects(orders.verifyOrderOtp(body,req as never),(err:unknown)=>{
    assert.equal((err as {getStatus:()=>number}).getStatus(),403);
    return true;
  });
  assert.deepEqual(metrics(),{lookedUp:1,failed:1});
});

test("OTP resend limit exposes its actual remaining seconds",()=>{
  const error=new OtpIssueRateLimited(3589);
  assert.equal(error.retryAfterSeconds,3589);
  assert.match(error.message,/limit/);
});
