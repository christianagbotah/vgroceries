import { test } from "node:test";
import assert from "node:assert/strict";
import { readConfig } from "../src/config";
import { createApplication } from "../src/bootstrap";
import { Database } from "../src/database/database";
import { HubtelPaymentAdapter } from "../src/payments/providers/hubtel";
import { createConfiguredProviderAdapters } from "../src/payments/providers/factory";
import { seedCommerceFixtures } from "./commerce-fixtures";

function fakeFetch(...responses: Array<{ status?: number; body: unknown }>) {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const fetcher = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    calls.push({ url, init });
    const response = responses.shift();
    assert.ok(response, `Unexpected fetch call to ${url}`);
    return new Response(JSON.stringify(response.body), {
      status: response.status ?? 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
  return { calls, fetcher };
}

const config = () => ({
  clientId: "hubtel-client",
  clientSecret: "hubtel-secret",
  requestMoneyUrl: "https://api.hubtel.example/request-money/{mobileNumber}",
  statusUrl: "https://api.hubtel.example/status/{reference}",
  callbackUrl: "https://portal.example.test/api/v1/payments/providers/hubtel/events",
  returnUrl: "https://portal.example.test/checkout/payment-return",
  cancellationUrl: "https://portal.example.test/checkout/payment-return?cancelled=1",
});

const input = () => ({
  attemptId: "attempt-1",
  merchantReference: "VG-PAY-ABC123",
  orderReference: "VG-ORDER-1001",
  method: "mobile_money" as const,
  amountMinor: 12345,
  currency: "GHS" as const,
  payerName: "Ama Customer",
  payerEmail: "ama@example.test",
  payerPhone: "+233241111111",
  signal: new AbortController().signal,
});

test("Hubtel Request Money uses Basic auth, GHS decimal amount and hosted paylink", async () => {
  const http = fakeFetch({ status: 201, body: { message: "success", code: "0000", data: { paylinkId: "paylink-001", clientReference: "VG-PAY-ABC123", paylinkUrl: "https://pay.hubtel.com/paylink-001", expiresAt: 1234567890 } } });
  const adapter = new HubtelPaymentAdapter(config(), http.fetcher);
  const result = await adapter.initiate(input());
  assert.deepEqual(result, { kind: "accepted", providerReference: "paylink-001", action: { kind: "redirect", url: "https://pay.hubtel.com/paylink-001" } });
  assert.equal(http.calls[0].url, "https://api.hubtel.example/request-money/%2B233241111111");
  assert.equal(new Headers(http.calls[0].init?.headers).get("authorization"), `Basic ${Buffer.from("hubtel-client:hubtel-secret").toString("base64")}`);
  const body = JSON.parse(String(http.calls[0].init?.body));
  assert.equal(body.amount, 123.45);
  assert.equal(body.title, "Variety Groceries");
  assert.match(body.description, /VG-ORDER-1001/);
  assert.equal(body.clientReference, "VG-PAY-ABC123");
  assert.equal(body.callbackUrl, config().callbackUrl);
  assert.equal(body.returnUrl, config().returnUrl);
  assert.equal(body.cancellationUrl, config().cancellationUrl);
});

test("Hubtel initiation fails safely when a payer phone is unavailable", async () => {
  const http = fakeFetch();
  const adapter = new HubtelPaymentAdapter(config(), http.fetcher);
  const result = await adapter.initiate({ ...input(), payerPhone: undefined });
  assert.deepEqual(result, { kind: "rejected", failureCode: "PAYER_PHONE_REQUIRED", customerSafeMessage: "A Ghana mobile number is required to start this payment." });
  assert.equal(http.calls.length, 0);
});

test("Hubtel callback is only lookup-required evidence even when callback says paid", async () => {
  const adapter = new HubtelPaymentAdapter(config(), fakeFetch().fetcher);
  const rawBody = Buffer.from(JSON.stringify({ message: "Payment received", responseCode: "0000", data: { paymentType: "mobile_money", status: "Paid", amount: 123.45, paylinkId: "paylink-001", phoneNumber: "+233241111111", clientReference: "VG-PAY-ABC123" } }));
  const verified = await adapter.verifyEvent({ rawBody, headers: {} });
  assert.equal(verified.verification, "lookup_required");
  if (verified.verification === "lookup_required") {
    assert.equal(verified.merchantReference, "VG-PAY-ABC123");
    assert.equal(verified.providerReference, "paylink-001");
    assert.match(verified.providerEventId ?? "", /^hubtel:/);
  }
});

test("Hubtel lookup uses configured official status URL and normalizes authoritative money evidence", async () => {
  const http = fakeFetch({ body: { responseCode: "0000", data: { status: "Paid", amount: 123.45, clientReference: "VG-PAY-ABC123", paylinkId: "paylink-001", transactionDate: "2026-10-24T10:00:00.000Z" } } });
  const adapter = new HubtelPaymentAdapter(config(), http.fetcher);
  const observed = await adapter.lookup({ merchantReference: "VG-PAY-ABC123", providerReference: "paylink-001", signal: new AbortController().signal });
  assert.equal(http.calls[0].url, "https://api.hubtel.example/status/VG-PAY-ABC123");
  assert.equal(new Headers(http.calls[0].init?.headers).get("authorization"), `Basic ${Buffer.from("hubtel-client:hubtel-secret").toString("base64")}`);
  assert.deepEqual(observed, {
    providerId: "hubtel",
    merchantReference: "VG-PAY-ABC123",
    providerReference: "paylink-001",
    state: "succeeded",
    amountMinor: 12345,
    currency: "GHS",
    providerTimestamp: new Date("2026-10-24T10:00:00.000Z"),
  });
});

test("Hubtel lookup preserves wrong reference and amount for central authority review", async () => {
  const http = fakeFetch({ body: { responseCode: "0000", data: { status: "Paid", amount: 99.99, clientReference: "WRONG", paylinkId: "different-link" } } });
  const adapter = new HubtelPaymentAdapter(config(), http.fetcher);
  const observed = await adapter.lookup({ merchantReference: "VG-PAY-ABC123", providerReference: "paylink-001", signal: new AbortController().signal });
  assert.equal(observed.merchantReference, "WRONG");
  assert.equal(observed.providerReference, "different-link");
  assert.equal(observed.amountMinor, 9999);
  assert.equal(observed.state, "succeeded");
});

test("Hubtel factory supplies collection only and deliberately no refund adapter", () => {
  const cfg = readConfig({
    DATABASE_URL: "postgresql://user:pass@localhost:5432/db", WEB_ORIGINS: "http://localhost:3000", API_STOCK_LOCATION_ID: "loc_accra", API_INSECURE_COOKIES: "true",
    PAYMENT_PROVIDER_ID: "hubtel", PAYMENT_ENABLED_METHODS: "mobile_money,card_hosted", PAYMENT_CONFIRMED_HOLD_MINUTES: "1440", PAYMENT_PROVIDER_TIMEOUT_MS: "5000", PAYMENT_RECONCILE_AFTER_SECONDS: "120", PAYMENT_HOSTED_DOMAINS: "pay.hubtel.com",
    HUBTEL_CLIENT_ID: "cid", HUBTEL_CLIENT_SECRET: "secret", HUBTEL_REQUEST_MONEY_URL: "https://api.hubtel.example/request-money/{mobileNumber}", HUBTEL_STATUS_URL: "https://api.hubtel.example/status/{reference}", HUBTEL_CALLBACK_URL: "https://portal.example.test/api/v1/payments/providers/hubtel/events", HUBTEL_RETURN_URL: "https://portal.example.test/checkout/payment-return", HUBTEL_CANCELLATION_URL: "https://portal.example.test/checkout/payment-return?cancelled=1",
  });
  const adapters = createConfiguredProviderAdapters(cfg, fakeFetch().fetcher);
  assert.deepEqual(adapters.paymentAdapters.map((adapter) => adapter.id), ["hubtel"]);
  assert.ok(adapters.paymentAdapters[0].capabilities().methods.includes("card_hosted"), "Hubtel factory must select the hosted paylink adapter used by high-level electronic checkout");
  assert.deepEqual(adapters.refundAdapters, []);
});

test("selected Hubtel remains fail-closed at readiness because no verified refund adapter is fabricated", async () => {
  assert.ok(process.env.DATABASE_URL, "isolated DATABASE_URL is required");
  const cfg = readConfig({
    DATABASE_URL: process.env.DATABASE_URL, WEB_ORIGINS: "http://localhost:3000", API_STOCK_LOCATION_ID: "loc_accra", API_INSECURE_COOKIES: "true",
    COMMERCE_LOCATION_ID: "loc_accra", CHECKOUT_PAYMENT_HOLD_MINUTES: "15", CHECKOUT_OFFLINE_HOLD_MINUTES: "1440", GUEST_CHECKOUT_TTL_MINUTES: "1440", ORDER_VERIFICATION_ACTIVE_VERSION: "1", ORDER_VERIFICATION_KEYS: JSON.stringify({ 1: "11".repeat(32) }),
    PAYMENT_PROVIDER_ID: "hubtel", PAYMENT_ENABLED_METHODS: "mobile_money,card_hosted", PAYMENT_CONFIRMED_HOLD_MINUTES: "1440", PAYMENT_PROVIDER_TIMEOUT_MS: "5000", PAYMENT_RECONCILE_AFTER_SECONDS: "120", PAYMENT_HOSTED_DOMAINS: "pay.hubtel.com",
    HUBTEL_CLIENT_ID: "cid", HUBTEL_CLIENT_SECRET: "secret", HUBTEL_REQUEST_MONEY_URL: "https://api.hubtel.example/request-money/{mobileNumber}", HUBTEL_STATUS_URL: "https://api.hubtel.example/status/{reference}", HUBTEL_CALLBACK_URL: "https://portal.example.test/api/v1/payments/providers/hubtel/events", HUBTEL_RETURN_URL: "https://portal.example.test/checkout/payment-return", HUBTEL_CANCELLATION_URL: "https://portal.example.test/checkout/payment-return?cancelled=1",
  });
  const configured = createConfiguredProviderAdapters(cfg, fakeFetch().fetcher);
  const app = await createApplication(cfg, configured.paymentAdapters, configured.refundAdapters);
  try {
    await app.listen(0, "127.0.0.1");
    await seedCommerceFixtures(app.get(Database));
    assert.equal((await fetch((await app.getUrl()) + "/api/v1/health/ready")).status, 503);
  } finally {
    await app.close();
  }
});
