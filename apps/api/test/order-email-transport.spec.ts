import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildOrderEmail, sendOrderEmail } from "../src/notifications/order-email-transport";

const config={enabled:true,from:"orders@example.test",sendmailPath:"/usr/sbin/sendmail"};
const message={recipient:"customer@example.test",subject:"Variety Groceries - Payment confirmed",body:"Payment verified: ₵25.00.\nThank you."};

test("email validates header fields and preserves Unicode without header injection",()=>{
 const mime=buildOrderEmail(config,message);
 const [headers,body]=mime.split("\r\n\r\n");
 assert.match(headers,/Content-Transfer-Encoding: base64/);
 assert.equal(Buffer.from(body,"base64").toString("utf8"),message.body);
 for(const patch of [{recipient:"victim@example.test\r\nBcc: other@example.test"},{subject:"Order\r\nBcc: other@example.test"},{recipient:"-X@example.test"},{recipient:"customer@example.test,other@example.test"}])
  assert.throws(()=>buildOrderEmail(config,{...message,...patch}));
 for(const patch of [{enabled:false},{from:"sender@example.test\r\nBcc: other@example.test"},{sendmailPath:"sendmail"}])
  assert.throws(()=>buildOrderEmail({...config,...patch},message));
});
test("local transport acceptance uses a disposable fake executable and never contacts a mail provider",async()=>{
 const dir=await mkdtemp(join(tmpdir(),"vg-email-test-"));
 try{
  const executable=join(dir,"sendmail-fixture"), output=join(dir,"message");
  await writeFile(executable,`#!/bin/sh\ncat > "${output}"\nexit 0\n`,{mode:0o700});
  const result=await sendOrderEmail({...config,sendmailPath:executable},message);
  assert.deepEqual(result,{accepted:true});
  assert.equal(await readFile(output,"utf8"),buildOrderEmail(config,message));
  await writeFile(executable,"#!/bin/sh\ncat >/dev/null\nexit 1\n",{mode:0o700});
  await assert.rejects(()=>sendOrderEmail({...config,sendmailPath:executable},message),/outcome unknown/);
 }finally{await rm(dir,{recursive:true,force:true});}
});
