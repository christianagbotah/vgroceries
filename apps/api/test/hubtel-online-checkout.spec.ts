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
      merchantAccountNumber: "11684",
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
    HUBTEL_COLLECTION_ACCOUNT_NUMBER: "11684",
    HUBTEL_ONLINE_CHECKOUT_URL: "https://payproxyapi.hubtel.com/items/initiate",
    HUBTEL_COLLECTION_STATUS_URL: "https://api-txnstatus.hubtel.com/transactions/{merchantAccountNumber}/status?clientReference={reference}",
  };
}

test("Hubtel hosted config works without Direct Request Money URLs", () => {
  const config = readConfig(baseEnv());
  assert.ok(config.hubtelPayment?.onlineCheckout);
  assert.equal(config.hubtelPayment?.onlineCheckout?.merchantAccountNumber, "11684");
  assert.equal(config.hubtelPayment?.requestMoneyUrl, undefined);
  assert.equal(config.payments?.enabledMethods[0], "hosted_checkout");
  assert.throws(() => readConfig({ ...baseEnv(), HUBTEL_COLLECTION_ACCOUNT_NUMBER: "" }), /complete merchant account/);
  assert.throws(() => readConfig({ ...baseEnv(), PAYMENT_HOSTED_DOMAINS: "bad.example" }), /pay\.hubtel\.com/);
  assert.throws(() => readConfig({ ...baseEnv(), PAYMENT_ENABLED_METHODS: "mobile_money,hosted_checkout" }), /direct Request Money|hosted_checkout must be first/);
  assert.throws(() => readConfig({ ...baseEnv(), HUBTEL_ONLINE_CHECKOUT_URL: "https://evil.example/items/initiate" }), /official production or sandbox/);
  assert.throws(() => readConfig({ ...baseEnv(), NODE_ENV: "production", WEB_ORIGINS: "https://portal.varietygroceries.com", API_INSECURE_COOKIES: "false", HUBTEL_ONLINE_CHECKOUT_URL: "https://code.hubtel.com/sandbox/v1/payproxyapi/items/initiate" }), /official production or sandbox/);
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
  assert.equal(body.merchantAccountNumber, "11684");
  assert.equal(body.clientReference, reference);
  assert.equal(body.callbackUrl, hostedConfig().callbackUrl);
  assert.equal(body.returnUrl, hostedConfig().returnUrl);
  assert.equal(body.cancellationUrl, hostedConfig().cancellationUrl);
  assert.equal("Channel" in body, false);
  assert.equal("CustomerMsisdn" in body, false);
  assert.equal("cardNumber" in body, false);
});

test("Hubtel hosted checkout refuses a wrong reference, oversized reference and untrusted paylink", async () => {
  const wrong = new HubtelPaymentProvider(hostedConfig(), mockFetch({ json: checkoutReply({ clientReference: "VG-OTHER" }) }).fetcher);
  await assert.rejects(wrong.initiate(paymentInput()), /mismatched or incomplete/);
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
  assert.equal(http.calls[0].url, "https://api-txnstatus.hubtel.com/transactions/11684/status?clientReference=" + reference);
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
  await assert.rejects(mismatch.lookup({ merchantReference: reference, signal: new AbortController().signal }), /reference does not match/);
  for (const change of [{ currencyCode: "USD" }, { amount: 123.456 }]) {
    const provider = new HubtelPaymentProvider(hostedConfig(), mockFetch({ json: statusReply(change) }).fetcher);
    const observation = await provider.lookup({ merchantReference: reference, signal: new AbortController().signal });
    assert.equal(observation.state, "unknown");
  }
});

test("verified Hubtel hosted checkout extra customer charge is reconciled to merchant order amount", async () => {
  // Captured shape of the merchant's owner-authorized ₵1 test:
  // Hubtel status Amount=1.01, Charges=.01, AmountAfterCharges=1.00.
  const provider = new HubtelPaymentProvider(hostedConfig(), mockFetch({
    json: statusReply({ amount: 1.01, charges: 0.01, amountAfterCharges: 1.00 }),
  }).fetcher);
  const observation = await provider.lookup({
    merchantReference: reference, expectedAmountMinor: 100,
    signal: new AbortController().signal,
  });
  assert.equal(observation.state, "succeeded");
  assert.equal(observation.amountMinor, 100);
  assert.equal(observation.currency, "GHS");
  assert.equal(observation.providerReference, "hubtel-txn-001");

  // Without an immutable database amount, the adapter is not permitted to
  // silently reinterpret a provider-reported gross as a checkout price.
  const withoutExpected = new HubtelPaymentProvider(hostedConfig(), mockFetch({
    json: statusReply({ amount: 1.01, charges: 0.01, amountAfterCharges: 1.00 }),
  }).fetcher);
  assert.equal((await withoutExpected.lookup({
    merchantReference: reference, signal: new AbortController().signal,
  })).amountMinor, 101);
});

test("Hubtel hosted merchant-borne fees preserve exact gross checkout amount", async () => {
  const provider = new HubtelPaymentProvider(hostedConfig(), mockFetch({
    json: statusReply({ amount: 1.00, charges: 0.01, amountAfterCharges: 0.99 }),
  }).fetcher);
  const result = await provider.lookup({
    merchantReference: reference, expectedAmountMinor: 100,
    signal: new AbortController().signal,
  });
  assert.equal(result.state, "succeeded");
  assert.equal(result.amountMinor, 100);
});

test("hosted fee identity never turns an underpayment or inconsistent fee fields into success", async () => {
  const scenarios = [
    { data: { amount: 0.90, charges: 0.01, amountAfterCharges: 0.89 }, expectedState: "succeeded", expectedAmount: 90 },
    { data: { amount: 1.01, charges: 0.02, amountAfterCharges: 1.00 }, expectedState: "unknown", expectedAmount: 101 },
    { data: { amount: 1.01, charges: 0.005, amountAfterCharges: 1.00 }, expectedState: "unknown", expectedAmount: 101 },
    { data: { amount: 1.01, charges: 0.01, amountAfterCharges: 0.99 }, expectedState: "unknown", expectedAmount: 101 },
    { data: { amount: 1.01, amountAfterCharges: 1.00 }, expectedState: "unknown", expectedAmount: 101 },
    { data: { amount: 1.01, charges: 0.01, amountAfterCharges: 1.00, currencyCode: "USD" }, expectedState: "unknown", expectedAmount: 100 },
  ] as const;
  for (const sample of scenarios) {
    const provider = new HubtelPaymentProvider(hostedConfig(), mockFetch({
      json: statusReply(sample.data),
    }).fetcher);
    const got = await provider.lookup({
      merchantReference: reference, expectedAmountMinor: 100,
      signal: new AbortController().signal,
    });
    assert.equal(got.state, sample.expectedState, JSON.stringify(sample.data));
    assert.equal(got.amountMinor, sample.expectedAmount, JSON.stringify(sample.data));
    assert.ok(got.state !== "succeeded" || got.amountMinor !== 100, "A mismatched amount must never be accepted as paid in full.");
  }
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
    await assert.rejects(provider.initiate(paymentInput()), /could not be authoritatively confirmed/);
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
    await assert.rejects(provider.lookup({ merchantReference: reference, signal: new AbortController().signal }), /status is not available/);
  }
});
