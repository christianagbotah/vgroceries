import { test } from "node:test";
import assert from "node:assert/strict";
import { createApplication } from "../src/bootstrap";
import { readConfig } from "../src/config";
import { EtranzactPaymentProvider } from "../src/payments/etranzact-payment-provider";
import { PaymentProviderRegistry } from "../src/payments/payment-provider.registry";
import { RefundProviderRegistry } from "../src/payments/refund-provider.registry";

function fakeFetch(...responses: Array<{ status?: number; body?: string }>) {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const fetcher = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    calls.push({ url, init });
    const response = responses.shift();
    assert.ok(response, `Unexpected fetch call to ${url}`);
    return new Response(response.body ?? "", { status: response.status ?? 200 });
  }) as typeof fetch;
  return { calls, fetcher };
}

const providerConfig = () => ({
  terminalId: "0000000001",
  secretKey: "DEMO_KEY",
  initializeUrl: "https://webpay.example.test/webconnect/v3/caller.jsp",
  queryUrl: "https://webpay.example.test/webconnect/v3/query.jsp",
  responseUrl: "https://portal.varietygroceries.com/api/v1/payments/providers/etranzact/return",
  customerReturnUrl: "https://portal.varietygroceries.com/checkout/status/{orderId}",
  logoUrl: "https://varietygroceries.com/brand/variety-mark.png",
  technicalEmailDomain: "payments.varietygroceries.com",
  identityHmacKey: Buffer.from("22".repeat(32), "hex"),
});

const input = (overrides: Record<string, unknown> = {}) => ({
  attemptId: "attempt-1",
  merchantReference: "VG-PAY-ABC123",
  orderReference: "VG-ORDER-1001",
  method: "hosted_checkout" as const,
  amountMinor: 12345,
  currency: "GHS" as const,
  payerName: "Ama Mensah",
  payerPhone: "+233241111111",
  signal: new AbortController().signal,
  ...overrides,
});

const paymentEnv = () => ({
  DATABASE_URL: "postgresql://u:p@localhost:5432/db",
  WEB_ORIGINS: "http://localhost:3000",
  API_STOCK_LOCATION_ID: "loc",
  API_INSECURE_COOKIES: "true",
  PAYMENT_PROVIDER_ID: "etranzact",
  PAYMENT_ENABLED_METHODS: "hosted_checkout",
  PAYMENT_CONFIRMED_HOLD_MINUTES: "1440",
  PAYMENT_PROVIDER_TIMEOUT_MS: "5000",
  PAYMENT_RECONCILE_AFTER_SECONDS: "120",
  PAYMENT_HOSTED_DOMAINS: "webpay.example.test",
});

const etranzactEnv = () => ({
  ETRANZACT_TERMINAL_ID: providerConfig().terminalId,
  ETRANZACT_SECRET_KEY: providerConfig().secretKey,
  ETRANZACT_INITIALIZE_URL: providerConfig().initializeUrl,
  ETRANZACT_QUERY_URL: providerConfig().queryUrl,
  ETRANZACT_RESPONSE_URL: providerConfig().responseUrl,
  ETRANZACT_CUSTOMER_RETURN_URL: providerConfig().customerReturnUrl,
  ETRANZACT_LOGO_URL: providerConfig().logoUrl,
  ETRANZACT_TECHNICAL_EMAIL_DOMAIN: providerConfig().technicalEmailDomain,
  ETRANZACT_IDENTITY_HMAC_KEY: "22".repeat(32),
});

test("eTranzact configuration is complete, provider-bound and production-safe", () => {
  assert.equal(readConfig({ DATABASE_URL: "postgresql://u:p@localhost/db", WEB_ORIGINS: "http://localhost:3000", API_STOCK_LOCATION_ID: "loc", API_INSECURE_COOKIES: "true" }).etranzact, null);
  assert.throws(() => readConfig(paymentEnv()), /eTranzact.*complete bundle/i);
  const config = readConfig({ ...paymentEnv(), ...etranzactEnv() }).etranzact;
  assert.equal(config?.terminalId, "0000000001");
  assert.equal(config?.initializeUrl, providerConfig().initializeUrl);
  assert.equal(config?.queryUrl, providerConfig().queryUrl);
  assert.equal(config?.customerReturnUrl, providerConfig().customerReturnUrl);
  assert.equal(config?.identityHmacKey.length, 32);
});

test("eTranzact hosted checkout returns an exact provider form without selecting a rail", async () => {
  const adapter = new EtranzactPaymentProvider(providerConfig());
  const result = await adapter.initiate(input());
  assert.equal(result.kind, "accepted");
  if (result.kind !== "accepted" || result.action.kind !== "form_post") assert.fail("Expected hosted form POST");
  assert.equal(result.providerReference, "VG-PAY-ABC123");
  assert.equal(result.action.url, providerConfig().initializeUrl);
  assert.deepEqual(result.action.fields, {
    TERMINAL_ID: "0000000001",
    RESPONSE_URL: providerConfig().responseUrl,
    TRANSACTION_ID: "VG-PAY-ABC123",
    AMOUNT: "123.45",
    DESCRIPTION: "Variety Groceries order VG-ORDER-1001",
    EMAIL: result.action.fields.EMAIL,
    PHONENO: "0241111111",
    FULL_NAME: "Ama Mensah",
    CURRENCY_CODE: "GHS",
    CHECKSUM: "5a79a49b2dbd55fdfbc434e889eef4da",
    LOGO_URL: providerConfig().logoUrl,
  });
  assert.match(result.action.fields.EMAIL, /^etranzact-[a-f0-9]{32}@payments\.varietygroceries\.com$/);
  assert.equal(Object.hasOwn(result.action.fields, "CARD_TYPE"), false);
});

test("eTranzact preserves a real customer email for receipts", async () => {
  const adapter = new EtranzactPaymentProvider(providerConfig());
  const result = await adapter.initiate(input({ payerEmail: "AMA@example.test" }));
  assert.equal(result.kind, "accepted");
  if (result.kind !== "accepted" || result.action.kind !== "form_post") assert.fail("Expected hosted form POST");
  assert.equal(result.action.fields.EMAIL, "ama@example.test");
});

test("eTranzact callback is trusted only when FINAL_CHECKSUM and payment identity validate", async () => {
  const adapter = new EtranzactPaymentProvider(providerConfig());
  const rawBody = Buffer.from(new URLSearchParams({
    TERMINAL_ID: "0000000001",
    TRANSACTION_ID: "VG-PAY-ABC123",
    AMOUNT: "123.45",
    RESPONSE_URL: providerConfig().responseUrl,
    CURRENCY_CODE: "GHS",
    SUCCESS: "0",
    RESPONSE_CODE: "0",
    TRANS_NUM: "01ESAUKS2ICHLUF9ZQOCASXGJ",
    CARD_TYPE: "VISA",
    FINAL_CHECKSUM: "0c97e5ce1722b1f87abd1af3a789a3cb",
  }).toString());
  const verified = await adapter.verifyEvent({ rawBody, headers: { "content-type": "application/x-www-form-urlencoded" } });
  assert.deepEqual(verified, {
    verification: "verified",
    providerEventId: "01ESAUKS2ICHLUF9ZQOCASXGJ",
    observation: {
      providerId: "etranzact",
      merchantReference: "VG-PAY-ABC123",
      providerReference: "01ESAUKS2ICHLUF9ZQOCASXGJ",
      providerEventId: "01ESAUKS2ICHLUF9ZQOCASXGJ",
      state: "succeeded",
      amountMinor: 12345,
      currency: "GHS",
      settledChannel: "visa",
    },
  });

  const tampered = Buffer.from(rawBody.toString().replace("AMOUNT=123.45", "AMOUNT=999.99"));
  assert.equal((await adapter.verifyEvent({ rawBody: tampered, headers: {} })).verification, "invalid");
});

test("eTranzact requery posts only the merchant transaction id and waits for authenticated callback truth", async () => {
  const http = fakeFetch({ status: 200, body: "Query accepted" });
  const adapter = new EtranzactPaymentProvider(providerConfig(), http.fetcher);
  const observation = await adapter.lookup({
    merchantReference: "VG-PAY-ABC123",
    providerReference: "01ESAUKS2ICHLUF9ZQOCASXGJ",
    signal: new AbortController().signal,
  });
  assert.equal(http.calls[0].url, providerConfig().queryUrl);
  assert.equal(http.calls[0].init?.method, "POST");
  assert.equal(new Headers(http.calls[0].init?.headers).get("content-type"), "application/x-www-form-urlencoded");
  assert.equal(String(http.calls[0].init?.body), "TRANSACTION_ID=VG-PAY-ABC123");
  assert.deepEqual(observation, {
    providerId: "etranzact",
    merchantReference: "VG-PAY-ABC123",
    providerReference: "01ESAUKS2ICHLUF9ZQOCASXGJ",
    state: "pending",
    customerSafeMessage: "Payment verification has been requested from eTranzact.",
  });
});

test("configured eTranzact bundle auto-registers hosted checkout but does not fabricate refund authority", async () => {
  const app = await createApplication(readConfig({ ...paymentEnv(), ...etranzactEnv() }));
  try {
    const adapter = app.get(PaymentProviderRegistry).requireConfigured();
    assert.equal(adapter.id, "etranzact");
    assert.deepEqual(adapter.capabilities(), { methods: ["hosted_checkout"], trustMode: "verified_event", safeInitiationRetry: false });
    assert.throws(
      () => app.get(RefundProviderRegistry).require("etranzact", "hosted_checkout"),
      /refund capability.*unavailable/i,
    );
  } finally {
    await app.close();
  }
});
