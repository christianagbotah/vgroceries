import { test } from "node:test";
import assert from "node:assert/strict";
import { createApplication } from "../src/bootstrap";
import { readConfig } from "../src/config";
import { PaystackRefundProvider } from "../src/payments/paystack-refund-provider";
import { RefundProviderRegistry } from "../src/payments/refund-provider.registry";

function fakeFetch(...responses: Array<{ status?: number; body: unknown }>) {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const fetcher = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    calls.push({ url, init });
    const next = responses.shift();
    assert.ok(next, `Unexpected fetch call to ${url}`);
    return new Response(JSON.stringify(next.body), {
      status: next.status ?? 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
  return { calls, fetcher };
}

const config = () => ({
  secretKey: "sk_test_variety_paystack_secret",
  initializeUrl: "https://api.paystack.co/transaction/initialize",
  verifyUrl: "https://api.paystack.co/transaction/verify/{reference}",
  refundUrl: "https://api.paystack.co/refund",
  refundLookupUrl: "https://api.paystack.co/refund/{id}",
  callbackUrl: "https://shop.example.test/checkout/payment-return",
  technicalEmailDomain: "payments.example.test",
  identityHmacKey: Buffer.from("11".repeat(32), "hex"),
});

const input = (overrides: Record<string, unknown> = {}) => ({
  refundId: "refund-1",
  executionId: "execution-1",
  merchantRefundReference: "VG-REF-ONE",
  originalPaymentMerchantReference: "VG-PAY-ONE",
  originalPaymentProviderReference: "VG-PAY-ONE",
  originalPaymentAmountMinor: 12000,
  originalPaymentResolvedAt: new Date("2026-10-28T07:00:00.000Z"),
  orderReference: "VG-ORDER-ONE",
  method: "hosted_checkout" as const,
  amountMinor: 3500,
  currency: "GHS" as const,
  signal: new AbortController().signal,
  ...overrides,
});

test("Paystack refund initiates a provider-owned partial refund against the original transaction reference", async () => {
  const http = fakeFetch({ body: { status: true, message: "Refund queued", data: { id: 7801, amount: 3500, currency: "GHS", status: "pending" } } });
  const adapter = new PaystackRefundProvider(config(), http.fetcher);
  const result = await adapter.initiateRefund(input());
  assert.deepEqual(result, { kind: "accepted", state: "pending", providerRefundReference: "7801" });
  assert.equal(http.calls[0].url, "https://api.paystack.co/refund");
  assert.equal(new Headers(http.calls[0].init?.headers).get("authorization"), "Bearer sk_test_variety_paystack_secret");
  assert.deepEqual(JSON.parse(String(http.calls[0].init?.body)), {
    transaction: "VG-PAY-ONE",
    amount: 3500,
    currency: "GHS",
    merchant_note: "Variety Groceries refund VG-REF-ONE for VG-ORDER-ONE",
  });
});

test("Paystack refund accepts an already processed response only with matching money identity", async () => {
  const http = fakeFetch({ body: { status: true, data: { id: 7802, amount: 3500, currency: "GHS", status: "processed" } } });
  const adapter = new PaystackRefundProvider(config(), http.fetcher);
  assert.deepEqual(await adapter.initiateRefund(input()), {
    kind: "accepted", state: "succeeded", providerRefundReference: "7802", amountMinor: 3500, currency: "GHS",
  });
});

test("Paystack refund lookup normalizes processed, pending and failed provider states", async () => {
  const processed = fakeFetch({ body: { status: true, data: { id: 7803, amount: 3500, currency: "GHS", status: "processed", refunded_at: "2026-10-28T08:00:00.000Z" } } });
  const adapter = new PaystackRefundProvider(config(), processed.fetcher);
  assert.deepEqual(await adapter.lookupRefund({ merchantRefundReference: "VG-REF-ONE", providerRefundReference: "7803", signal: new AbortController().signal }), {
    providerId: "paystack", merchantRefundReference: "VG-REF-ONE", providerRefundReference: "7803",
    state: "succeeded", amountMinor: 3500, currency: "GHS", providerTimestamp: new Date("2026-10-28T08:00:00.000Z"),
  });

  const pending = fakeFetch({ body: { status: true, data: { id: 7804, amount: 3500, currency: "GHS", status: "processing" } } });
  const pendingAdapter = new PaystackRefundProvider(config(), pending.fetcher);
  assert.equal((await pendingAdapter.lookupRefund({ merchantRefundReference: "VG-REF-TWO", providerRefundReference: "7804", signal: new AbortController().signal })).state, "pending");

  const failed = fakeFetch({ body: { status: true, data: { id: 7805, amount: 3500, currency: "GHS", status: "failed" } } });
  const failedAdapter = new PaystackRefundProvider(config(), failed.fetcher);
  const failedResult = await failedAdapter.lookupRefund({ merchantRefundReference: "VG-REF-THREE", providerRefundReference: "7805", signal: new AbortController().signal });
  assert.equal(failedResult.state, "failed");
  assert.equal(failedResult.failureCode, "paystack_refund_failed");
});

test("Paystack refund never guesses or resends when provider identity is uncertain", async () => {
  const http = fakeFetch();
  const adapter = new PaystackRefundProvider(config(), http.fetcher);
  assert.deepEqual(adapter.capabilities(), {
    methods: ["hosted_checkout"], lookupSupported: true,
    safeRetryAfterDefinitiveFailure: false, safeRetryAfterNoRecord: false, safeRetryAfterUnknown: false,
  });
  const lookup = await adapter.lookupRefund({ merchantRefundReference: "VG-REF-UNKNOWN", signal: new AbortController().signal });
  assert.equal(lookup.state, "unknown");
  assert.equal(http.calls.length, 0);
});

test("Paystack definitive refund rejection is rejected but provider/server uncertainty throws", async () => {
  const rejected = fakeFetch({ status: 422, body: { status: false, message: "Refund not eligible" } });
  const adapter = new PaystackRefundProvider(config(), rejected.fetcher);
  const result = await adapter.initiateRefund(input());
  assert.equal(result.kind, "rejected");

  const authFailure = fakeFetch({ status: 401, body: { status: false, message: "Invalid key" } });
  const authFailureAdapter = new PaystackRefundProvider(config(), authFailure.fetcher);
  await assert.rejects(() => authFailureAdapter.initiateRefund(input()), /Paystack refund request failed/i);

  const uncertain = fakeFetch({ status: 503, body: { status: false, message: "Temporarily unavailable" } });
  const uncertainAdapter = new PaystackRefundProvider(config(), uncertain.fetcher);
  await assert.rejects(() => uncertainAdapter.initiateRefund(input()), /Paystack refund request failed/i);
});

test("configured Paystack bundle auto-registers hosted-checkout refund parity", async () => {
  const app = await createApplication(readConfig({
    DATABASE_URL: "postgresql://u:p@localhost:5432/db",
    WEB_ORIGINS: "http://localhost:3000",
    API_STOCK_LOCATION_ID: "loc",
    API_INSECURE_COOKIES: "true",
    PAYMENT_PROVIDER_ID: "paystack",
    PAYMENT_ENABLED_METHODS: "hosted_checkout",
    PAYMENT_CONFIRMED_HOLD_MINUTES: "1440",
    PAYMENT_PROVIDER_TIMEOUT_MS: "5000",
    PAYMENT_RECONCILE_AFTER_SECONDS: "120",
    PAYMENT_HOSTED_DOMAINS: "checkout.paystack.com",
    PAYSTACK_SECRET_KEY: "sk_test_variety_paystack_secret",
    PAYSTACK_INITIALIZE_URL: "https://api.paystack.co/transaction/initialize",
    PAYSTACK_VERIFY_URL: "https://api.paystack.co/transaction/verify/{reference}",
    PAYSTACK_REFUND_URL: "https://api.paystack.co/refund",
    PAYSTACK_REFUND_LOOKUP_URL: "https://api.paystack.co/refund/{id}",
    PAYSTACK_CALLBACK_URL: "http://localhost:3000/checkout/payment-return",
    PAYSTACK_TECHNICAL_EMAIL_DOMAIN: "payments.example.test",
    PAYSTACK_IDENTITY_HMAC_KEY: "11".repeat(32),
  }));
  try {
    assert.equal(app.get(RefundProviderRegistry).require("paystack", "hosted_checkout").id, "paystack");
  } finally {
    await app.close();
  }
});
