import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { paymentProviderActionSchema } from "@variety/contracts";
import { readConfig } from "../src/config";
import { createApplication } from "../src/bootstrap";
import { ETranzactPaymentAdapter } from "../src/payments/providers/etranzact";
import { createConfiguredProviderAdapters } from "../src/payments/providers/factory";

function fakeFetch(...responses: Array<{ status?: number; body: string; contentType?: string }>) {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const fetcher = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    calls.push({ url, init });
    const response = responses.shift();
    assert.ok(response, `Unexpected fetch call to ${url}`);
    return new Response(response.body, {
      status: response.status ?? 200,
      headers: { "content-type": response.contentType ?? "application/x-www-form-urlencoded" },
    });
  }) as typeof fetch;
  return { calls, fetcher };
}

const provider = () => ({
  terminalId: "7000000001",
  secretKey: "merchant-secret",
  checkoutUrl: "https://web.etranzact.example/WebConnectPlus/caller.jsp",
  queryUrl: "https://web.etranzact.example/WebConnectPlus/query.jsp",
  responseUrl: "https://portal.example.test/api/v1/payments/providers/etranzact/events",
});

const input = () => ({
  attemptId: "attempt-1",
  merchantReference: "VG-PAY-ETZ-1001",
  orderReference: "VG-ORDER-1001",
  method: "card_hosted" as const,
  amountMinor: 12345,
  currency: "GHS" as const,
  payerName: "Ama Customer",
  payerEmail: "ama@example.test",
  payerPhone: "+233241111111",
  signal: new AbortController().signal,
});

function checksum(...parts: string[]) {
  return createHash("sha256").update(parts.join(""), "utf8").digest("hex");
}

test("form_post provider action contract is strict and scalar-only", () => {
  assert.equal(paymentProviderActionSchema.safeParse({ kind: "form_post", url: provider().checkoutUrl, fields: { TERMINAL_ID: "7000000001", AMOUNT: "123.45" } }).success, true);
  assert.equal(paymentProviderActionSchema.safeParse({ kind: "form_post", url: provider().checkoutUrl, fields: { nested: { secret: true } } }).success, false);
  assert.equal(paymentProviderActionSchema.safeParse({ kind: "form_post", url: provider().checkoutUrl, fields: { a: "b" }, html: "<script>" }).success, false);
});

test("eTranzact WebConnect initiation returns server-generated SHA-256 form fields only", async () => {
  const adapter = new ETranzactPaymentAdapter(provider(), fakeFetch().fetcher);
  const result = await adapter.initiate(input());
  assert.equal(result.kind, "accepted");
  if (result.kind !== "accepted") return;
  assert.equal(result.providerReference, undefined);
  assert.equal(result.action.kind, "form_post");
  if (result.action.kind !== "form_post") return;
  assert.equal(result.action.url, provider().checkoutUrl);
  assert.deepEqual(result.action.fields, {
    TERMINAL_ID: "7000000001",
    TRANSACTION_ID: "VG-PAY-ETZ-1001",
    AMOUNT: "123.45",
    DESCRIPTION: "Payment for VG-ORDER-1001",
    RESPONSE_URL: provider().responseUrl,
    CURRENCY_CODE: "GHS",
    EMAIL: "ama@example.test",
    FULL_NAME: "Ama Customer",
    CHECKSUM: checksum("123.45", "7000000001", "VG-PAY-ETZ-1001", provider().responseUrl, "merchant-secret"),
  });
});

test("eTranzact form callback is trusted only when FINAL_CHECKSUM matches exact money and reference", async () => {
  const adapter = new ETranzactPaymentAdapter(provider(), fakeFetch().fetcher);
  const success = "0";
  const amount = "123.45";
  const final = checksum(success, amount, "7000000001", "VG-PAY-ETZ-1001", provider().responseUrl, "merchant-secret");
  const body = new URLSearchParams({ SUCCESS: success, AMOUNT: amount, TERMINAL_ID: "7000000001", TRANSACTION_ID: "VG-PAY-ETZ-1001", TRANSACTION_REF: "ETZ-REF-9001", RESPONSE_URL: provider().responseUrl, FINAL_CHECKSUM: final }).toString();
  const verified = await adapter.verifyEvent({ rawBody: Buffer.from(body), headers: { "content-type": "application/x-www-form-urlencoded" } });
  assert.equal(verified.verification, "verified");
  if (verified.verification === "verified") {
    assert.equal(verified.observation.providerId, "etranzact");
    assert.equal(verified.observation.merchantReference, "VG-PAY-ETZ-1001");
    assert.equal(verified.observation.providerReference, undefined);
    assert.equal(verified.observation.amountMinor, 12345);
    assert.equal(verified.observation.currency, "GHS");
    assert.equal(verified.observation.state, "succeeded");
  }
  const forged = new URLSearchParams({ SUCCESS: success, AMOUNT: "999.99", TERMINAL_ID: "7000000001", TRANSACTION_ID: "VG-PAY-ETZ-1001", RESPONSE_URL: provider().responseUrl, FINAL_CHECKSUM: final }).toString();
  assert.deepEqual(await adapter.verifyEvent({ rawBody: Buffer.from(forged), headers: { "content-type": "application/x-www-form-urlencoded" } }), { verification: "invalid" });
});

test("eTranzact query posts terminal/reference and maps authoritative TRANS_AMOUNT", async () => {
  const response = new URLSearchParams({ SUCCESS: "0", TRANSACTION_ID: "VG-PAY-ETZ-1001", TRANS_AMOUNT: "123.45", TRANS_DATE: "2026-10-24T10:00:00.000Z", CHANNEL: "WEB" }).toString();
  const http = fakeFetch({ body: response });
  const adapter = new ETranzactPaymentAdapter(provider(), http.fetcher);
  const observed = await adapter.lookup({ merchantReference: "VG-PAY-ETZ-1001", signal: new AbortController().signal });
  assert.equal(http.calls[0].url, provider().queryUrl);
  assert.equal(new Headers(http.calls[0].init?.headers).get("content-type"), "application/x-www-form-urlencoded");
  assert.equal(String(http.calls[0].init?.body), "TERMINAL_ID=7000000001&TRANSACTION_ID=VG-PAY-ETZ-1001");
  assert.deepEqual(observed, { providerId: "etranzact", merchantReference: "VG-PAY-ETZ-1001", state: "succeeded", amountMinor: 12345, currency: "GHS", providerTimestamp: new Date("2026-10-24T10:00:00.000Z") });
});

test("provider callback endpoint preserves raw urlencoded bytes for eTranzact verification", async () => {
  const cfg = readConfig({ DATABASE_URL: process.env.DATABASE_URL!, WEB_ORIGINS: "http://localhost:3000", API_STOCK_LOCATION_ID: "loc_accra", API_INSECURE_COOKIES: "true", PAYMENT_PROVIDER_ID: "etranzact", PAYMENT_ENABLED_METHODS: "card_hosted", PAYMENT_CONFIRMED_HOLD_MINUTES: "1440", PAYMENT_PROVIDER_TIMEOUT_MS: "5000", PAYMENT_RECONCILE_AFTER_SECONDS: "120", PAYMENT_HOSTED_DOMAINS: "web.etranzact.example", ETRANZACT_TERMINAL_ID: "7000000001", ETRANZACT_SECRET_KEY: "merchant-secret", ETRANZACT_CHECKOUT_URL: provider().checkoutUrl, ETRANZACT_QUERY_URL: provider().queryUrl, ETRANZACT_RESPONSE_URL: provider().responseUrl });
  const adapters = createConfiguredProviderAdapters(cfg, fakeFetch().fetcher);
  const app = await createApplication(cfg, adapters.paymentAdapters, adapters.refundAdapters);
  try {
    await app.listen(0, "127.0.0.1");
    const response = await fetch((await app.getUrl()) + "/api/v1/payments/providers/etranzact/events", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: "SUCCESS=0&AMOUNT=123.45" });
    assert.equal(response.status, 401);
  } finally { await app.close(); }
});

test("eTranzact factory supplies payment adapter but no undocumented refund adapter", () => {
  const cfg = readConfig({ DATABASE_URL: "postgresql://user:pass@localhost:5432/db", WEB_ORIGINS: "http://localhost:3000", API_STOCK_LOCATION_ID: "loc_accra", API_INSECURE_COOKIES: "true", PAYMENT_PROVIDER_ID: "etranzact", PAYMENT_ENABLED_METHODS: "card_hosted", PAYMENT_CONFIRMED_HOLD_MINUTES: "1440", PAYMENT_PROVIDER_TIMEOUT_MS: "5000", PAYMENT_RECONCILE_AFTER_SECONDS: "120", PAYMENT_HOSTED_DOMAINS: "web.etranzact.example", ETRANZACT_TERMINAL_ID: "7000000001", ETRANZACT_SECRET_KEY: "merchant-secret", ETRANZACT_CHECKOUT_URL: provider().checkoutUrl, ETRANZACT_QUERY_URL: provider().queryUrl, ETRANZACT_RESPONSE_URL: provider().responseUrl });
  const adapters = createConfiguredProviderAdapters(cfg, fakeFetch().fetcher);
  assert.deepEqual(adapters.paymentAdapters.map((adapter) => adapter.id), ["etranzact"]);
  assert.deepEqual(adapters.refundAdapters, []);
});
