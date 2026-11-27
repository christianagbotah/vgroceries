import {test,expect} from "bun:test";
import {readFileSync} from "node:fs";
test("failed notification preference reads remain recoverable without sending an OTP or changing payment",()=>{
 const email=readFileSync("src/features/checkout/order-email-verification.tsx","utf8");
 expect(email).toContain('Retry email preference');
 expect(email).toContain('setRevision(v=>v+1)');
 expect(email).toContain('setStatus(null);setError("Email preference status could not be loaded.")');
 expect(email).toContain('locked.current||loading||!status');
 const sms=readFileSync("src/features/checkout/order-sms-preference.tsx","utf8");
 expect(sms).toContain('setState(null);setError("SMS preference could not be loaded.")');
 expect(sms).toContain('lock.current||loading||state!=="requested"');
 for(const panel of [email,sms]){
  expect(panel).not.toContain("paymentInitiate");
  expect(panel).not.toContain("localStorage");
 }
});
