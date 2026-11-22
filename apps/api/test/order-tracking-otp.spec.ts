import "reflect-metadata";
import { test } from "node:test";
import assert from "node:assert/strict";
import type { ApiConfig } from "../src/config";
import type { Database } from "../src/database/database";
import type { OrderProjectionService } from "../src/orders/order-projection.service";
import type { TrackingThrottleService } from "../src/orders/tracking-throttle.service";
import { VerificationCodeService } from "../src/orders/verification-code.service";
import { normalizedGhanaSmsPhone, OrderTrackingOtpService } from "../src/orders/order-tracking-otp.service";

test("only the stored Ghana mobile number can be an SMS destination", () => {
  assert.equal(normalizedGhanaSmsPhone("024 123 4567"), "233241234567");
  assert.equal(normalizedGhanaSmsPhone("+233 54 123 4567"), "233541234567");
  assert.equal(normalizedGhanaSmsPhone("0123456789"), null);
  assert.equal(normalizedGhanaSmsPhone("+447700900123"), null);
});

test("OTP is sent to the stored phone, cannot be replayed, and never persists plaintext", async () => {
  const oldFetch = globalThis.fetch;
  const oldConfig = {
    id: process.env.HUBTEL_SMS_CLIENT_ID,
    secret: process.env.HUBTEL_SMS_CLIENT_SECRET,
    sender: process.env.HUBTEL_SMS_SENDER_ID,
  };
  process.env.HUBTEL_SMS_CLIENT_ID = "test-client";
  process.env.HUBTEL_SMS_CLIENT_SECRET = "test-secret";
  process.env.HUBTEL_SMS_SENDER_ID = "Variety";
  const sent: Array<{To:string;From:string;Content:string}> = [];
  globalThis.fetch = async (_input, init) => {
    sent.push(JSON.parse(String(init?.body)));
    return new Response(JSON.stringify({ status: 0, messageId: "fake" }), { status: 200 });
  };

  type Challenge = {
    id:string; orderId:string; otpDigest:string; keyVersion:number; requestIpHash:string;
    attempts:number; expiresAt:Date; consumedAt:Date|null; createdAt:Date;
  };
  const challenges = new Map<string,Challenge>();
  const order = { id:"order-1", customerPhone:"0241234567", reference:"VG-ABCDEF12" };
  const fakeDb = {
    order: { findUnique: async ({where}:{where:{reference:string}}) => where.reference===order.reference ? order : null },
    orderTrackingOtpChallenge: {
      findFirst: async () => [...challenges.values()].at(-1) ? { createdAt:[...challenges.values()].at(-1)!.createdAt } : null,
      count: async () => challenges.size,
      create: async ({data}:{data:Omit<Challenge,"attempts"|"consumedAt"|"createdAt">}) => {
        const row = {...data,attempts:0,consumedAt:null,createdAt:new Date()};
        challenges.set(row.id,row); return row;
      },
      findUnique: async ({where}:{where:{id:string}}) => challenges.get(where.id) ?? null,
      delete: async ({where}:{where:{id:string}}) => {challenges.delete(where.id);},
      updateMany: async ({where,data}:{
        where:{id?:string;orderId?:string;consumedAt:null;expiresAt?:{gt:Date};attempts?:{lt:number}};
        data:{attempts?:{increment:number};consumedAt?:Date};
      }) => {
        let count=0;
        for(const row of challenges.values()){
          if(where.id && row.id!==where.id)continue;
          if(where.orderId && row.orderId!==where.orderId)continue;
          if(row.consumedAt!==null)continue;
          if(where.expiresAt && row.expiresAt<=where.expiresAt.gt)continue;
          if(where.attempts && row.attempts>=where.attempts.lt)continue;
          if(data.attempts)row.attempts+=data.attempts.increment;
          if(data.consumedAt)row.consumedAt=data.consumedAt;
          count++;
        }
        return { count };
      },
    },
  };
  const config = {commerce:{verificationActiveKeyVersion:1,verificationKeys:new Map([[1,Buffer.alloc(32,9)]])}} as unknown as ApiConfig;
  const verification = new VerificationCodeService(config);
  const projection = {publicOrder:async (id:string)=>({id,verified:true})} as unknown as OrderProjectionService;
  const throttle = {registerFailure:async()=>undefined} as unknown as TrackingThrottleService;
  const service = new OrderTrackingOtpService(fakeDb as unknown as Database,projection,throttle,verification,config);
  try {
    const challenge = await service.request("vg-abcdef12","198.51.100.20");
    assert.equal(sent.length,1);
    assert.equal(sent[0].To,"233241234567");
    assert.equal(sent[0].From,"Variety");
    const match = sent[0].Content.match(/\b(\d{6})\b/);
    assert.ok(match,"SMS must include six-digit code");
    const code = match[1];
    const row = challenges.get(challenge.challengeId)!;
    assert.match(row.otpDigest,/^[a-f0-9]{64}$/);
    assert.ok(!JSON.stringify(row).includes(code));
    assert.rejects(service.verify(order.reference,challenge.challengeId,"111111","198.51.100.20"));
    const details = await service.verify(order.reference,challenge.challengeId,code,"198.51.100.20");
    assert.deepEqual(details,{id:"order-1",verified:true});
    await assert.rejects(service.verify(order.reference,challenge.challengeId,code,"198.51.100.20"));
    await assert.rejects(service.request(order.reference,"198.51.100.20"));
    assert.equal(sent.length,1,"cooldown must prevent a second chargeable SMS");
  } finally {
    globalThis.fetch = oldFetch;
    if(oldConfig.id===undefined)delete process.env.HUBTEL_SMS_CLIENT_ID;else process.env.HUBTEL_SMS_CLIENT_ID=oldConfig.id;
    if(oldConfig.secret===undefined)delete process.env.HUBTEL_SMS_CLIENT_SECRET;else process.env.HUBTEL_SMS_CLIENT_SECRET=oldConfig.secret;
    if(oldConfig.sender===undefined)delete process.env.HUBTEL_SMS_SENDER_ID;else process.env.HUBTEL_SMS_SENDER_ID=oldConfig.sender;
  }
});
