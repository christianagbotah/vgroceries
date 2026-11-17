import { createHmac } from "node:crypto";
import { test } from "node:test";
import assert from "node:assert/strict";
import { readConfig, type FlutterwaveConfig } from "../src/config";
import { FlutterwavePaymentProvider } from "../src/payments/flutterwave-payment-provider";

const config = (): FlutterwaveConfig => ({
  secretKey: "test_secret_key_not_real_987654321",
  webhookSecret: "test_webhook_secret_not_real",
  initiateUrl: "https://api.flutterwave.com/v3/payments",
  lookupUrl: "https://api.flutterwave.com/v3/transactions/verify_by_reference",
  returnUrl: "https://portal.varietygroceries.com/checkout/payment-return",
  technicalEmailDomain: "payments.varietygroceries.com",
  identityHmacKey: Buffer.from("11".repeat(32), "hex"),
});
function fakeFetch(...responses: unknown[]) {
  const calls: {url:string,init?:RequestInit}[]=[];
  const fetcher = (async (input:string|URL|Request,init?:RequestInit)=>{
    const url=typeof input==="string"?input:input instanceof URL?input.toString():input.url;
    calls.push({url,init});
    assert.ok(responses.length,"Unexpected request");
    return Response.json(responses.shift());
  }) as typeof fetch;
  return {fetcher,calls};
}
const input = (extra:Record<string,unknown>={})=>({
  attemptId:"a-1",merchantReference:"VG-PAY-REF1",orderReference:"VG-ORDER-1",
  method:"hosted_checkout" as const,amountMinor:12345,currency:"GHS" as const,
  payerPhone:"+233241111111",signal:new AbortController().signal,...extra,
});
const success = (extra:Record<string,unknown>={})=>({
  status:"success",data:{id:1234,tx_ref:"VG-PAY-REF1",flw_ref:"FLW-1",status:"successful",
    currency:"GHS",amount:123.45,payment_type:"mobilemoneyghana",...extra},
});
const env = ()=>({
  DATABASE_URL:"postgresql://u:p@localhost/db",
  API_STOCK_LOCATION_ID:"loc",WEB_ORIGINS:"http://localhost:3000",
  API_INSECURE_COOKIES:"true",
  PAYMENT_PROVIDER_ID:"flutterwave",
  PAYMENT_ENABLED_METHODS:"hosted_checkout",
  PAYMENT_CONFIRMED_HOLD_MINUTES:"1440",PAYMENT_PROVIDER_TIMEOUT_MS:"5000",
  PAYMENT_RECONCILE_AFTER_SECONDS:"120",PAYMENT_HOSTED_DOMAINS:"checkout.flutterwave.com",
  FLUTTERWAVE_SECRET_KEY:config().secretKey,
  FLUTTERWAVE_WEBHOOK_SECRET:config().webhookSecret,
  FLUTTERWAVE_RETURN_URL:config().returnUrl,
  FLUTTERWAVE_TECHNICAL_EMAIL_DOMAIN:config().technicalEmailDomain,
  FLUTTERWAVE_IDENTITY_HMAC_KEY:"11".repeat(32),
});
test("Flutterwave config rejects incomplete or non-hosted payment methods",()=>{
  assert.equal(readConfig({DATABASE_URL:"postgresql://u:p@localhost/db",API_STOCK_LOCATION_ID:"loc",WEB_ORIGINS:"http://localhost:3000"}).flutterwavePayment,null);
  assert.throws(()=>readConfig({...env(),FLUTTERWAVE_WEBHOOK_SECRET:""}),/complete bundle/);
  assert.throws(()=>readConfig({...env(),PAYMENT_ENABLED_METHODS:"mobile_money"}),/hosted_checkout/);
  assert.equal(readConfig(env()).flutterwavePayment?.returnUrl,config().returnUrl);
});
test("hosted checkout sends amount in cedis and leaves rail selection to provider",async()=>{
  const mock=fakeFetch({status:"success",data:{link:"https://checkout.flutterwave.com/v3/hosted/pay/test"}});
  const provider=new FlutterwavePaymentProvider(config(),mock.fetcher);
  const result=await provider.initiate(input());
  assert.equal(result.kind,"accepted");
  const body=JSON.parse(String(mock.calls[0].init?.body));
  assert.equal(body.amount,"123.45");
  assert.equal(body.currency,"GHS");
  assert.equal(body.tx_ref,"VG-PAY-REF1");
  assert.equal(body.payment_options,undefined);
  assert.equal(body.redirect_url,config().returnUrl);
  assert.match(body.customer.email,/^flutterwave-[a-f0-9]{32}@/);
  assert.equal(new Headers(mock.calls[0].init?.headers).get("authorization"),"Bearer "+config().secretKey);
});
test("provider redirects must target the trusted Flutterwave host",async()=>{
  const mock=fakeFetch({status:"success",data:{link:"https://example.test/collect"}});
  const provider=new FlutterwavePaymentProvider(config(),mock.fetcher);
  assert.equal((await provider.initiate(input())).kind,"rejected");
});
test("valid webhook only triggers independent lookup, never marks payment paid",async()=>{
  const provider=new FlutterwavePaymentProvider(config(),fakeFetch().fetcher);
  const rawBody=Buffer.from(JSON.stringify({event:"charge.completed",data:{tx_ref:"VG-PAY-REF1",id:1234}}));
  const legacy=await provider.verifyEvent({rawBody,headers:{"verif-hash":config().webhookSecret}});
  assert.equal(legacy.verification,"lookup_required");
  const signature=createHmac("sha256",config().webhookSecret).update(rawBody).digest("base64");
  const modern=await provider.verifyEvent({rawBody,headers:{"flutterwave-signature":signature}});
  assert.equal(modern.verification,"lookup_required");
  assert.equal((await provider.verifyEvent({rawBody,headers:{"verif-hash":"wrong"}})).verification,"invalid");
});
test("lookup verifies exact reference, amount, GHS, and the observed payment channel",async()=>{
  const mock=fakeFetch(success());
  const provider=new FlutterwavePaymentProvider(config(),mock.fetcher);
  const result=await provider.lookup({merchantReference:"VG-PAY-REF1",signal:new AbortController().signal});
  assert.equal(result.state,"succeeded");
  assert.equal(result.amountMinor,12345);
  assert.equal(result.currency,"GHS");
  assert.equal(result.settledChannel,"mobilemoneyghana");
  assert.match(mock.calls[0].url,/verify_by_reference\?tx_ref=VG-PAY-REF1/);
  for(const changed of [{tx_ref:"WRONG"},{currency:"USD"},{amount:123.456}]){
    const p=new FlutterwavePaymentProvider(config(),fakeFetch(success(changed)).fetcher);
    const o=await p.lookup({merchantReference:"VG-PAY-REF1",signal:new AbortController().signal});
    assert.equal(o.state,"unknown");
  }
});
test("verified card brand may be persisted without capturing card secrets",async()=>{
  const p=new FlutterwavePaymentProvider(config(),fakeFetch(success({payment_type:"card",card:{type:"VISA"}})).fetcher);
  const o=await p.lookup({merchantReference:"VG-PAY-REF1",signal:new AbortController().signal});
  assert.equal(o.settledChannel,"card_visa");
});
