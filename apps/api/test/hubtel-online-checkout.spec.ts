import { test } from "node:test";
import assert from "node:assert/strict";
import { readConfig, type HubtelPaymentConfig } from "../src/config";
import { HubtelPaymentProvider } from "../src/payments/hubtel-payment-provider";

function mockFetch(...responses: Array<{ status?: number; json: unknown }>) {
  const calls: Array<{ url: string; options: RequestInit | undefined }> = [];
  const fetcher = (async (url: string | URL | Request, options?: RequestInit) => {
    const parsed = typeof url === "string" ? url : url instanceof URL ? url.toString() : url.url;
    calls.push({ url: parsed, options });
    const reply = responses.shift();
    assert.ok(reply, "Unexpected network request");
    return new Response(JSON.stringify(reply.json), {
      status: reply.status ?? 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
  return { calls, fetcher };
}

const reference = "VG-PAY-AABBCCDDEEFF001122334455";

function hostedConfig(): HubtelPaymentConfig {
  return {
    clientId: "sandbox-hubtel-client",
    clientSecret: "sandbox-hubtel-secret",
    callbackUrl: "https://example.test/api/v1/payments/providers/hubtel/events",
    returnUrl: "https://example.test/checkout/payment-return",
    cancellationUrl: "https://example.test/checkout/payment-return?cancelled=1",
    onlineCheckout: {
      merchantAccountNumber: "999999999",
      initiateUrl: "https://payproxyapi.hubtel.com/items/initiate",
      statusUrl: "https://api-txnstatus.hubtel.com/transactions/{merchantAccountNumber}/status?clientReference={reference}",
    },
  };
}
function paymentInput(extra: Record<string, unknown> = {}) {
  return {
    attemptId: "attempt-1",
    merchantReference: reference,
    orderReference: "VG-ORDER-1001",
    method: "hosted_checkout" as const,
    amountMinor: 12345,
    currency: "GHS" as const,
    signal: new AbortController().signal,
    ...extra,
  };
}
function checkoutReply(other: Record<string, unknown> = {}) {
  return {
    responseCode: "0000",
    status: "Success",
    data: {
      checkoutId: "checkout-001",
      checkoutUrl: "https://pay.hubtel.com/checkout-001",
      clientReference: reference,
      checkoutDirectUrl: "https://pay.hubtel.com/checkout-001/direct",
      ...other,
    },
  };
}
function statusReply(other: Record<string, unknown> = {}) {
  return {
    message: "Successful",
    responseCode: "0000",
    data: {
      status: "Paid",
      amount: 123.45,
      currencyCode: null,
      clientReference: reference,
      transactionId: "hubtel-txn-001",
      paymentMethod: "mobilemoney",
      date: "2026-11-17T09:00:00.000Z",
      ...other,
    },
  };
}
function baseEnv() {
  return {
    DATABASE_URL: "postgresql://u:p@localhost/db",
    WEB_ORIGINS: "http://localhost:3000",
    API_STOCK_LOCATION_ID: "loc",
    API_INSECURE_COOKIES: "true",
    PAYMENT_PROVIDER_ID: "hubtel",
    PAYMENT_ENABLED_METHODS: "hosted_checkout",
    PAYMENT_CONFIRMED_HOLD_MINUTES: "1440",
    PAYMENT_PROVIDER_TIMEOUT_MS: "5000",
    PAYMENT_RECONCILE_AFTER_SECONDS: "120",
    PAYMENT_HOSTED_DOMAINS: "pay.hubtel.com",
    HUBTEL_CLIENT_ID: "sandbox-hubtel-client",
    HUBTEL_CLIENT_SECRET: "sandbox-hubtel-secret",
    HUBTEL_CALLBACK_URL: "https://example.test/api/v1/payments/providers/hubtel/events",
    HUBTEL_RETURN_URL: "https://example.test/checkout/payment-return",
    HUBTEL_CANCELLATION_URL: "https://example.test/checkout/payment-return?cancelled=1",
    HUBTEL_COLLECTION_ACCOUNT_NUMBER: "999999999",
    HUBTEL_ONLINE_CHECKOUT_URL: "https://payproxyapi.hubtel.com/items/initiate",
    HUBTEL_COLLECTION_STATUS_URL: "https://api-txnstatus.hubtel.com/transactions/{merchantAccountNumber}/status?clientReference={reference}",
  };
}

test("Hubtel hosted config works without Direct Request Money URLs", () => {
  const config = readConfig(baseEnv());
  assert.ok(config.hubtelPayment?.onlineCheckout);
  assert.equal(config.hubtelPayment?.onlineCheckout?.merchantAccountNumber, "999999999");
  assert.equal(config.hubtelPayment?.requestMoneyUrl, undefined);
  assert.equal(config.payments?.enabledMethods[0], "hosted_checkout");
  assert.throws(() => readConfig({ ...baseEnv(), HUBTEL_COLLECTION_ACCOUNT_NUMBER: "" }), /complete merchant account/);
  assert.throws(() => readConfig({ ...baseEnv(), PAYMENT_HOSTED_DOMAINS: "bad.example" }), /pay\.hubtel\.com/);
  assert.throws(() => readConfig({ ...baseEnv(), PAYMENT_ENABLED_METHODS: "mobile_money,hosted_checkout" }), /exactly one of hosted_checkout or mobile_money/);
  assert.throws(() => readConfig({
    ...baseEnv(),
    HUBTEL_REQUEST_MONEY_URL: "https://api.hubtel.com/request-money/{mobileNumber}",
    HUBTEL_STATUS_URL: "https://api.hubtel.com/status/{reference}",
  }), /Direct Request Money URLs may only be configured with mobile_money/);
  assert.throws(() => readConfig({ ...baseEnv(), HUBTEL_ONLINE_CHECKOUT_URL: "https://evil.example/items/initiate" }), /official production or non-production sandbox/);
  assert.throws(() => readConfig({
    ...baseEnv(),
    HUBTEL_COLLECTION_STATUS_URL: "https://api-txnstatus.hubtel.com/transactions/{merchantAccountNumber}/status?clientReference={reference}&forcePaid=1",
  }), /official production or non-production sandbox/);
  const sandbox = readConfig({
    ...baseEnv(), NODE_ENV: "test", PAYMENT_HOSTED_DOMAINS: "pay.hubtel.com,code.hubtel.com",
    HUBTEL_ONLINE_CHECKOUT_URL: "https://code.hubtel.com/sandbox/v1/payproxyapi/items/initiate",
    HUBTEL_COLLECTION_STATUS_URL: "https://code.hubtel.com/sandbox/v1/api-txnstatus/transactions/{merchantAccountNumber}/status?clientReference={reference}",
  });
  assert.ok(sandbox.hubtelPayment?.onlineCheckout);

  assert.throws(() => readConfig({ ...baseEnv(), NODE_ENV: "production", WEB_ORIGINS: "https://portal.varietygroceries.com", API_INSECURE_COOKIES: "false", HUBTEL_ONLINE_CHECKOUT_URL: "https://code.hubtel.com/sandbox/v1/payproxyapi/items/initiate" }), /official production or non-production sandbox/);
});

test("Hubtel-hosted payment only returns an action, never an immediate paid receipt", async () => {
  const http = mockFetch({ json: checkoutReply() });
  const provider = new HubtelPaymentProvider(hostedConfig(), http.fetcher);
  assert.deepEqual(provider.capabilities(), {
    methods: ["hosted_checkout"],
    trustMode: "lookup_required",
    safeInitiationRetry: false,
  });
  const started = await provider.initiate(paymentInput());
  assert.deepEqual(started, { kind: "accepted", action: { kind: "redirect", url: "https://pay.hubtel.com/checkout-001" } });
  assert.equal(http.calls.length, 1);
  assert.equal(http.calls[0].url, hostedConfig().onlineCheckout?.initiateUrl);
  const options = http.calls[0].options;
  assert.equal(options?.method, "POST");
  assert.equal(new Headers(options?.headers).get("authorization"), "Basic " + Buffer.from("sandbox-hubtel-client:sandbox-hubtel-secret").toString("base64"));
  const body = JSON.parse(String(options?.body));
  assert.equal(body.totalAmount, 123.45);
  assert.equal(body.merchantAccountNumber, "999999999");
  assert.equal(body.clientReference, reference);
  assert.equal(body.callbackUrl, hostedConfig().callbackUrl);
  assert.equal(body.returnUrl, hostedConfig().returnUrl);
  assert.equal(body.cancellationUrl, hostedConfig().cancellationUrl);
  assert.equal("Channel" in body, false);
  assert.equal("CustomerMsisdn" in body, false);
  assert.equal("cardNumber" in body, false);
});

test("Hosted checkout passes only provider-required contact details; no card or wallet secrets", async () => {
  const http = mockFetch({json:checkoutReply()});
  const provider = new HubtelPaymentProvider(hostedConfig(),http.fetcher);
  const outcome = await provider.initiate(paymentInput({
    payerPhone:"+233241111111",payerEmail:"ama@example.test",payerName:"Ama Mensah",
  }));
  assert.equal(outcome.kind,"accepted");
  const body = JSON.parse(String(http.calls[0].options?.body));
  assert.equal(body.payeeMobileNumber,"233241111111");
  assert.equal(body.payeeEmail,"ama@example.test");
  assert.equal(body.payeeName,"Ama Mensah");
  for(const forbidden of ["cardNumber","pan","cvv","otp","walletPin","paymentStatus"])
    assert.equal(Object.hasOwn(body,forbidden),false,forbidden);
});

test("Hubtel hosted checkout refuses a wrong reference, oversized reference and untrusted paylink", async () => {
  const wrong = new HubtelPaymentProvider(hostedConfig(), mockFetch({ json: checkoutReply({ clientReference: "VG-OTHER" }) }).fetcher);
  await assert.rejects(wrong.initiate(paymentInput()), /incomplete or mismatched/);
  const evil = new HubtelPaymentProvider(hostedConfig(), mockFetch({ json: checkoutReply({ checkoutUrl: "https://evil.example/checkout-001" }) }).fetcher);
  await assert.rejects(evil.initiate(paymentInput()), /untrusted/);
  const noNetwork = mockFetch();
  const p = new HubtelPaymentProvider(hostedConfig(), noNetwork.fetcher);
  assert.equal((await p.initiate(paymentInput({merchantReference:"VG-PAY-"+ "A".repeat(32)}))).kind, "rejected");
  assert.equal(noNetwork.calls.length, 0);
});

test("Hubtel status verification is by immutable client reference, not by checkout ID", async () => {
  const http = mockFetch({ json: statusReply() });
  const provider = new HubtelPaymentProvider(hostedConfig(), http.fetcher);
  const found = await provider.lookup({ merchantReference: reference, signal: new AbortController().signal });
  assert.equal(http.calls[0].url, "https://api-txnstatus.hubtel.com/transactions/999999999/status?clientReference=" + reference);
  assert.equal(found.providerId, "hubtel");
  assert.equal(found.merchantReference, reference);
  assert.equal(found.state, "succeeded");
  assert.equal(found.amountMinor, 12345);
  assert.equal(found.currency, "GHS");
  assert.equal(found.settledChannel, "mobilemoney");
  assert.equal(found.providerReference, "hubtel-txn-001");
  assert.equal(found.providerEventId, "hubtel-txn:hubtel-txn-001");
});

test("Hubtel lookup fails closed for changed transaction reference, invalid currency and precision", async () => {
  const mismatch = new HubtelPaymentProvider(hostedConfig(), mockFetch({ json: statusReply({ clientReference: "OTHER" }) }).fetcher);
  await assert.rejects(mismatch.lookup({ merchantReference: reference, signal: new AbortController().signal }), /merchant reference could not be verified/);
  for (const change of [
    { currencyCode: "USD" },
    { Currency: "GBP", currencyCode: "GHS" },
    { amount: 123.456 },
    { transactionId: "" },
  ]) {
    const provider = new HubtelPaymentProvider(hostedConfig(), mockFetch({ json: statusReply(change) }).fetcher);
    await assert.rejects(
      provider.lookup({ merchantReference: reference, signal: new AbortController().signal }),
      /currency could not be verified|lacks independently verified money and transaction identity/,
    );
  }
  const prior = new HubtelPaymentProvider(hostedConfig(), mockFetch({json: statusReply()}).fetcher);
  await assert.rejects(
    prior.lookup({merchantReference:reference,providerReference:"another-transaction",signal:new AbortController().signal}),
    /transaction reference could not be verified/,
  );
});

test("Hubtel Online Checkout callback is evidence requiring an authoritative lookup", async () => {
  const provider = new HubtelPaymentProvider(hostedConfig(), mockFetch().fetcher);
  const rawBody = Buffer.from(JSON.stringify({
    ResponseCode: "0000",
    Status: "Success",
    Data: { CheckoutId: "checkout-001", ClientReference: reference, Amount: 123.45 },
  }));
  const verification = await provider.verifyEvent({ rawBody, headers: {} });
  assert.equal(verification.verification, "lookup_required");
  if (verification.verification !== "lookup_required") throw new Error("Event should require lookup");
  assert.equal(verification.merchantReference, reference);
});

test("Direct Mobile Money remains separately guarded when only Online Checkout is configured", async () => {
  const http = mockFetch();
  const provider = new HubtelPaymentProvider(hostedConfig(), http.fetcher);
  const result = await provider.initiate(paymentInput({ method: "mobile_money", payerPhone: "+233241111111" }));
  assert.equal(result.kind, "rejected");
  assert.equal(http.calls.length, 0);
});

test("ambiguous Hubtel checkout creation remains uncertain rather than inviting a duplicate payment", async () => {
  for (const response of [
    { status: 200, json: { responseCode: "0005", status: "Failed", data: null } },
    { status: 400, json: { responseCode: "4000", status: "Failed", data: null } },
    { status: 503, json: { responseCode: "0000", status: "Success", data: checkoutReply().data } },
    { status: 200, json: { responseCode: "0000", status: "Success", data: null } },
  ]) {
    const http = mockFetch(response);
    const provider = new HubtelPaymentProvider(hostedConfig(), http.fetcher);
    await assert.rejects(provider.initiate(paymentInput()), /could not be confirmed/);
    assert.equal(http.calls.length, 1);
    assert.equal(JSON.parse(String(http.calls[0].options?.body)).clientReference, reference);
  }
});

test("a card payment records only the verified provider channel, without guessing a network", async () => {
  const provider = new HubtelPaymentProvider(hostedConfig(), mockFetch({
    json: statusReply({ paymentMethod: "visa", status: "Paid" }),
  }).fetcher);
  const paid = await provider.lookup({ merchantReference: reference, signal: new AbortController().signal });
  assert.equal(paid.state, "succeeded");
  assert.equal(paid.settledChannel, "visa");
  assert.equal(paid.amountMinor, 12345);
});

test("status API failures never turn an unresolved checkout into a completed payment", async () => {
  for (const response of [
    { status: 403, json: { message: "IP not allowlisted", responseCode: "4030" } },
    { status: 200, json: { responseCode: "0005", data: null } },
  ]) {
    const provider = new HubtelPaymentProvider(hostedConfig(), mockFetch(response).fetcher);
    await assert.rejects(provider.lookup({ merchantReference: reference, signal: new AbortController().signal }), /status could not be verified/);
  }
});
