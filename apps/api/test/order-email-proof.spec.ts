import {after,before,beforeEach,test} from "node:test";
import assert from "node:assert/strict";
import type {INestApplication} from "@nestjs/common";
import {mkdtemp,writeFile,readFile,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {createApplication} from "../src/bootstrap";
import {Database} from "../src/database/database";
import {OrderEmailProofService} from "../src/notifications/order-email-proof.service";
import {customerDestinationFingerprint} from "../src/notifications/customer-message-crypto";
import {seedCommerceFixtures} from "./commerce-fixtures";
import type {CheckoutPrincipal} from "../src/commerce-identity/checkout-principal.service";

let app:INestApplication,db:Database,proof:OrderEmailProofService,dir:string;
const envKeys=["CUSTOMER_ORDER_EMAIL_PROOF_ENABLED","CUSTOMER_ORDER_EMAIL_OTP_HMAC_KEY","CUSTOMER_MESSAGE_ENCRYPTION_KEY","CUSTOMER_ORDER_EMAIL_FROM","CUSTOMER_ORDER_EMAIL_SENDMAIL_PATH"] as const;
const saved=new Map(envKeys.map(k=>[k,process.env[k]]));
const owner:CheckoutPrincipal={kind:"customer",userId:"customer-a",actorId:"customer-a",actorScope:"customer:customer-a"};
const other:CheckoutPrincipal={kind:"customer",userId:"customer-b",actorId:"customer-b",actorScope:"customer:customer-b"};
const email="proof@example.test";
const t=new Date();
before(async()=>{
 dir=await mkdtemp(join(tmpdir(),"vg-email-proof-"));
 const sendmail=join(dir,"sendmail-fixture");
 await writeFile(sendmail,`#!/bin/sh\ncat > "${join(dir,"mail")}"\n`,{mode:0o700});
 process.env.CUSTOMER_ORDER_EMAIL_PROOF_ENABLED="true";
 process.env.CUSTOMER_ORDER_EMAIL_OTP_HMAC_KEY="61".repeat(32);
 process.env.CUSTOMER_MESSAGE_ENCRYPTION_KEY="62".repeat(32);
 process.env.CUSTOMER_ORDER_EMAIL_FROM="orders@example.test";
 process.env.CUSTOMER_ORDER_EMAIL_SENDMAIL_PATH=sendmail;
 app=await createApplication();await app.init();db=app.get(Database);proof=app.get(OrderEmailProofService);
});
beforeEach(async()=>{
 await seedCommerceFixtures(db);
 await db.customerOtpChallenge.deleteMany({where:{purpose:"order_email_verification"}});
 await db.order.create({data:{id:"email-order",reference:"VG-EMAILTEST001",customerUserId:"customer-a",customerName:"Fixture Customer",customerPhone:"+233241111111",customerEmail:email,fulfilment:"collection",paymentMethod:"cash_counter",paymentStatus:"unpaid",fulfilmentStatus:"awaiting_confirmation",deliveryStatus:"unassigned",subtotalMinor:500,totalMinor:500,verificationKeyVersion:1,verificationCodeHash:"a".repeat(64)}});
 await db.orderEmailConsent.create({data:{orderId:"email-order",recipientFingerprint:customerDestinationFingerprint(email),policyVersion:"order-email-v1",recordedAt:new Date(t.getTime()-1000)}});
});
after(async()=>{if(app)await app.close();if(dir)await rm(dir,{recursive:true,force:true});for(const [k,v] of saved){if(v===undefined)delete process.env[k];else process.env[k]=v;}});
async function issued(){
 const r=await proof.request(owner,"email-order",t);
 assert.equal(r.verified,false);
 if(r.verified)throw Error("unexpected verified result");
 const mime=await readFile(join(dir,"mail"),"utf8");
 const body=Buffer.from(mime.split("\r\n\r\n")[1],"base64").toString("utf8");
 const match=body.match(/code is (\d{6})\./);
 assert.ok(match);
 assert.deepEqual(Object.keys(r).sort(),["challengeId","expiresAt","verified"]);
 return {id:r.challengeId,code:match[1]};
}
test("mailbox proof is order-owner scoped, single-use and rate limited; no code persisted or returned",async()=>{
 await assert.rejects(()=>proof.status(other,"email-order",t),/Order not found/);
 await assert.rejects(()=>proof.request(other,"email-order",t),/Order not found/);
 assert.equal((await proof.status(owner,"email-order",t)).state,"verification_required");
 const {id,code}=await issued();
 const row=await db.customerOtpChallenge.findUniqueOrThrow({where:{id}});
 assert.notEqual(row.codeDigest,code);assert.notEqual(row.recipientEncrypted,email);
 await assert.rejects(()=>proof.request(owner,"email-order",t),/Please wait/);
 await assert.rejects(()=>proof.verify(other,"email-order",id,code,t),/Order not found/);
 await assert.rejects(()=>proof.verify(owner,"email-order",id,code==="000000"?"111111":"000000",t),/Invalid or expired/);
 assert.equal((await proof.verify(owner,"email-order",id,code,t)).verified,true);
 assert.equal((await proof.status(owner,"email-order",t)).state,"verified");
 await assert.rejects(()=>proof.verify(owner,"email-order",id,code,t),/Invalid or expired/);
});
test("revocation remains available with delivery disabled and locks outstanding challenges",async()=>{
 const {id,code}=await issued();
 process.env.CUSTOMER_ORDER_EMAIL_PROOF_ENABLED="false";
 try{
  assert.equal((await proof.revoke(owner,"email-order",t)).revoked,true);
  assert.equal((await proof.revoke(owner,"email-order",t)).revoked,true);
 }finally{process.env.CUSTOMER_ORDER_EMAIL_PROOF_ENABLED="true";}
 assert.equal((await proof.status(owner,"email-order",t)).state,"revoked");
 assert.equal((await db.customerOtpChallenge.findUniqueOrThrow({where:{id}})).status,"locked");
 await assert.rejects(()=>proof.verify(owner,"email-order",id,code,t),/Email updates are not available/);
});
test("expired code and changed mailbox cannot establish consent proof",async()=>{
 const {id,code}=await issued();
 await assert.rejects(()=>proof.verify(owner,"email-order",id,code,new Date(t.getTime()+300000)),/Invalid or expired/);
 await db.order.update({where:{id:"email-order"},data:{customerEmail:"changed@example.test"}});
 await assert.rejects(()=>proof.verify(owner,"email-order",id,code,t),/Email updates are not available/);
});
