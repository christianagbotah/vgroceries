import { test } from "node:test";
import assert from "node:assert/strict";
import { readConfig } from "../src/config";
import { HubtelPaymentProvider } from "../src/payments/hubtel-payment-provider";
import type { HubtelPaymentConfig } from "../src/config";

const merchantReference = "VG-PAY-1234567890ABCDEF";
const account = "11684";
const receiveUrl = "https://rmp.hubtel.com/merchantaccount/merchants/{merchantAccountNumber}/receive/mobilemoney";
const statusUrl = "https://api-txnstatus.hubtel.com/transactions/{merchantAccountNumber}/status?clientReference={reference}";

function env() {
  return {
    DATABASE_URL: "postgresql://unit:unit@localhost:5432/vg_test",
    WEB_ORIGINS: "https://isolated-unit.example.test",
    NODE_ENV: "production",
    API_STOCK_LOCATION_ID: "stock",
    PAYMENT_PROVIDER_ID: "hubtel",
    PAYMENT_ENABLED_METHODS: "mobile_money",
    PAYMENT_CONFIRMED_HOLD_MINUTES: "1440",
    PAYMENT_PROVIDER_TIMEOUT_MS: "5000",
    PAYMENT_RECONCILE_AFTER_SECONDS: "120",
    PAYMENT_HOSTED_DOMAINS: "pay.hubtel.com",
    HUBTEL_CLIENT_ID: "test_id_not_live",
    HUBTEL_CLIENT_SECRET: "test_secret_not_live",
    HUBTEL_CALLBACK_URL: "https://portal.varietygroceries.com/api/v1/payments/providers/hubtel/events",
    HUBTEL_RETURN_URL: "https://portal.varietygroceries.com/checkout/payment-return",
    HUBTEL_CANCELLATION_URL: "https://portal.varietygroceries.com/checkout/payment-return?cancelled=1",
    HUBTEL_DIRECT_COLLECTION_ACCOUNT: account,
    HUBTEL_DIRECT_RECEIVE_URL: receiveUrl,
    HUBTEL_DIRECT_STATUS_URL: statusUrl,
  };
}

function hubtelConfig(): HubtelPaymentConfig {
  const config = readConfig(env()).hubtelPayment;
  assert.ok(config?.directReceive);
  return config;
}

function fakeFetch(...replies: {status?: number; body: unknown}[]) {
  const calls: {url: string; init?: RequestInit}[] = [];
  const fetcher = (async (url: string | URL | Request, init?: RequestInit) => {
    const resolved = typeof url === "string" ? url : url instanceof URL ? url.toString() : url.url;
    calls.push({url: resolved, init});
    const reply = replies.shift();
    assert.ok(reply, "Unexpected provider network request");
    return new Response(JSON.stringify(reply.body), {
      status: reply.status ?? 200, headers: {"content-type":"application/json"},
    });
  }) as typeof fetch;
  return {calls, fetcher};
}

function initiation(extra: Record<string, unknown> = {}) {
  return {
    attemptId:"attempt-unit", merchantReference,
    orderReference:"VG-ORDER-TEST",
    method:"mobile_money" as const, amountMinor:100, currency:"GHS" as const,
    payerPhone:"+233241111111",
    payerChannel:"mtn-gh" as const,
    payerName:"Test Owner", payerEmail:"owner@example.test",
    signal:new AbortController().signal, ...extra,
  };
}

function rmpPending(other: Record<string, unknown> = {}) {
  return {
    Message:"Transaction pending. Expect callback request for final state",
    ResponseCode:"0001",
    Data:{
      TransactionId:"provider-transaction-001",
      ClientReference:merchantReference, Amount:1.00,
      Charges:0.02, AmountAfterCharges:1.00, AmountCharged:1.02,
      ...other,
    },
  };
}

function statusPaid(other: Record<string, unknown> = {}) {
  return {
    responseCode:"0000",
    data:{
      status:"Paid", amount:1.00, charges:0.02,
      amountAfterCharges:1.00,
      clientReference:merchantReference,
      transactionId:"provider-transaction-001",
      paymentMethod:"mobilemoney",
      currencyCode:null,
      ...other,
    },
  };
}

test("official Direct Receive Money and hosted are separate, exact endpoint configurations", () => {
  const config = hubtelConfig();
  assert.equal(config.directReceive?.merchantAccountNumber,account);
  assert.equal(config.requestMoneyUrl,undefined);
  assert.equal(config.onlineCheckout,undefined);
  for (const invalid of [
    {HUBTEL_DIRECT_RECEIVE_URL:"https://merchant.example.com/charge"},
    {HUBTEL_DIRECT_STATUS_URL:"https://attacker.example/status?reference={reference}"},
    {HUBTEL_DIRECT_COLLECTION_ACCOUNT:"wrong"},
    {HUBTEL_DIRECT_RECEIVE_URL:""},
    {HUBTEL_DIRECT_STATUS_URL:""},
    {HUBTEL_REQUEST_MONEY_URL:"https://example.test/request/{mobileNumber}"},
    {PAYMENT_ENABLED_METHODS:"hosted_checkout"},
  ]) {
    assert.throws(()=>readConfig({...env(),...invalid}), /Hubtel|payment/i);
  }
});

test("Hubtel Direct Receive issues the documented MoMo prompt, never a paid receipt or paylink", async()=>{
  const network=fakeFetch({body:rmpPending()});
  const provider=new HubtelPaymentProvider(hubtelConfig(),network.fetcher);
  assert.deepEqual(provider.capabilities(),{
    methods:["mobile_money"], trustMode:"lookup_required", safeInitiationRetry:false,
  });
  const result=await provider.initiate(initiation());
  assert.equal(result.kind,"accepted");
  if(result.kind!=="accepted")return;
  assert.equal(result.providerReference,"provider-transaction-001");
  assert.equal(result.action.kind,"prompt");
  assert.equal(network.calls.length,1);
  assert.equal(network.calls[0].url,"https://rmp.hubtel.com/merchantaccount/merchants/11684/receive/mobilemoney");
  assert.equal(network.calls[0].init?.method,"POST");
  assert.equal(new Headers(network.calls[0].init?.headers).get("authorization"),
    "Basic "+Buffer.from("test_id_not_live:test_secret_not_live").toString("base64"));
  const body=JSON.parse(String(network.calls[0].init?.body));
  assert.deepEqual(body,{
    CustomerName:"Test Owner",
    CustomerMsisdn:"233241111111",
    Channel:"mtn-gh",
    Amount:1.00,
    Description:"Variety Groceries VG-ORDER-TEST",
    ClientReference:merchantReference,
    PrimaryCallbackUrl:hubtelConfig().callbackUrl,
    CustomerEmail:"owner@example.test",
  });
  assert.equal("checkoutUrl" in body,false);
  assert.equal("CardNumber" in body,false);
});

test("unverified phone, unknown network and outside amount range never send a prompt",async()=>{
  const network=fakeFetch();
  const provider=new HubtelPaymentProvider(hubtelConfig(),network.fetcher);
  const changes=[
    {payerPhone:undefined},
    {payerPhone:"+23300000000"},
    {payerPhone:"0241111111"},
    {payerPhone:"+999241111111"},
    {payerChannel:undefined},
    {payerChannel:"invalid"},
    {amountMinor:99},
    {amountMinor:3_000_001},
    {merchantReference:"untrusted-ref"},
    {currency:"USD"},
  ];
  for(const extra of changes) {
    const result=await provider.initiate(initiation(extra));
    assert.equal(result.kind,"rejected",JSON.stringify(extra));
  }
  assert.equal(network.calls.length,0);
});

test("merchant/transaction/amount discrepancies or ambiguous provider errors never create a confirmed charge",async()=>{
  for(const changed of [
    {ClientReference:"UNRELATED"},
    {ClientReference:""},
    {TransactionId:""},
    {Amount:1.01},
    {Amount:1.001},
  ]){
    const network=fakeFetch({body:rmpPending(changed)});
    const provider=new HubtelPaymentProvider(hubtelConfig(),network.fetcher);
    await assert.rejects(provider.initiate(initiation()),/lacks matching/);
    assert.equal(network.calls.length,1);
  }
  const ambiguous=new HubtelPaymentProvider(hubtelConfig(),fakeFetch({
    status:503,body:rmpPending(),
  }).fetcher);
  await assert.rejects(ambiguous.initiate(initiation()),/unconfirmed/);
  const rejected=new HubtelPaymentProvider(hubtelConfig(),fakeFetch({
    status:400,body:{ResponseCode:"4103",Data:null},
  }).fetcher);
  assert.equal((await rejected.initiate(initiation())).kind,"rejected");
});

test("official Direct Receive status verifies only exact merchant, provider transaction and amount",async()=>{
  const network=fakeFetch({body:statusPaid()});
  const provider=new HubtelPaymentProvider(hubtelConfig(),network.fetcher);
  const observation=await provider.lookup({
    merchantReference,providerReference:"provider-transaction-001",
    expectedAmountMinor:100,signal:new AbortController().signal,
  });
  assert.equal(network.calls[0].url,
    "https://api-txnstatus.hubtel.com/transactions/11684/status?clientReference="+merchantReference);
  assert.equal(network.calls[0].init?.method,"GET");
  assert.equal(observation.providerReference,"provider-transaction-001");
  assert.equal(observation.amountMinor,100);
  assert.equal(observation.currency,"GHS");
  assert.equal(observation.state,"succeeded");
  // Direct Receive's fee fields can differ from Online Checkout gross/net:
  // amount may be 1.00, charges 0.02, amountAfterCharges 1.00.
  for(const mismatch of [
    {transactionId:"other"},
    {clientReference:"other"},
    {currencyCode:"USD"},
  ]){
    const fail=new HubtelPaymentProvider(hubtelConfig(),fakeFetch({body:statusPaid(mismatch)}).fetcher);
    await assert.rejects(fail.lookup({
      merchantReference,providerReference:"provider-transaction-001",
      expectedAmountMinor:100,signal:new AbortController().signal,
    }));
  }
  const underpaid=new HubtelPaymentProvider(hubtelConfig(),fakeFetch({body:statusPaid({amount:0.50})}).fetcher);
  const got=await underpaid.lookup({
    merchantReference,providerReference:"provider-transaction-001",
    expectedAmountMinor:100,signal:new AbortController().signal,
  });
  assert.equal(got.amountMinor,50,"Underpayment must never be normalized to a paid 100-pesewa order.");
});
