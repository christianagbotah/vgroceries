import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { readConfig } from "../src/config";
import { PaystackPaymentAdapter, PaystackRefundAdapter } from "../src/payments/providers/paystack";
import { createConfiguredProviderAdapters } from "../src/payments/providers/factory";

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

const paymentInput = () => ({
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

test("Paystack initializes the server-owned transaction and returns only the hosted redirect action", async () => {
  const http = fakeFetch({ body: { status: true, message: "Authorization URL created", data: { authorization_url: "https://checkout.paystack.com/access123", access_code: "access123", reference: "VG-PAY-ABC123" } } });
  const adapter = new PaystackPaymentAdapter({ secretKey: "sk_test_secret", callbackUrl: "https://portal.example.test/checkout/payment-return" }, http.fetcher);
  const result = await adapter.initiate(paymentInput());
  assert.deepEqual(result, { kind: "accepted", action: { kind: "redirect", url: "https://checkout.paystack.com/access123" } });
  assert.equal(http.calls.length, 1);
  assert.equal(http.calls[0].url, "https://api.paystack.co/transaction/initialize");
  assert.equal(new Headers(http.calls[0].init?.headers).get("authorization"), "Bearer sk_test_secret");
  const body = JSON.parse(String(http.calls[0].init?.body));
  assert.equal(body.email, "ama@example.test");
  assert.equal(body.amount, "12345");
  assert.equal(body.currency, "GHS");
  assert.equal(body.reference, "VG-PAY-ABC123");
  assert.equal(body.callback_url, "https://portal.example.test/checkout/payment-return");
  assert.deepEqual(body.channels, ["mobile_money"]);
  assert.equal(JSON.parse(body.metadata).orderReference, "VG-ORDER-1001");
});

test("Paystack lookup maps verified money identity and transaction state", async () => {
  const http = fakeFetch({ body: { status: true, data: { id: 4099260516, status: "success", reference: "VG-PAY-ABC123", amount: 12345, currency: "GHS", paid_at: "2026-10-24T10:00:00.000Z" } } });
  const adapter = new PaystackPaymentAdapter({ secretKey: "sk_test_secret", callbackUrl: "https://portal.example.test/return" }, http.fetcher);
  const observation = await adapter.lookup({ merchantReference: "VG-PAY-ABC123", signal: new AbortController().signal });
  assert.equal(http.calls[0].url, "https://api.paystack.co/transaction/verify/VG-PAY-ABC123");
  assert.deepEqual(observation, {
    providerId: "paystack",
    merchantReference: "VG-PAY-ABC123",
    providerReference: "4099260516",
    state: "succeeded",
    amountMinor: 12345,
    currency: "GHS",
    providerTimestamp: new Date("2026-10-24T10:00:00.000Z"),
  });
});

test("Paystack lookup preserves mismatched provider money/reference evidence for authority review", async () => {
  const http = fakeFetch({ body: { status: true, data: { id: 9001, status: "success", reference: "WRONG-REFERENCE", amount: 99999, currency: "NGN", paid_at: "2026-10-24T10:00:00.000Z" } } });
  const adapter = new PaystackPaymentAdapter({ secretKey: "sk_test_secret", callbackUrl: "https://portal.example.test/return" }, http.fetcher);
  const observation = await adapter.lookup({ merchantReference: "VG-PAY-ABC123", signal: new AbortController().signal });
  assert.equal(observation.merchantReference, "WRONG-REFERENCE");
  assert.equal(observation.amountMinor, 99999);
  assert.equal(observation.currency, undefined);
  assert.equal(observation.state, "succeeded");
});

test("Paystack webhook requires the exact raw-body HMAC-SHA512 signature", async () => {
  const secretKey = "sk_test_secret";
  const body = Buffer.from(JSON.stringify({ event: "charge.success", data: { id: 4099260516, status: "success", reference: "VG-PAY-ABC123", amount: 12345, currency: "GHS", paid_at: "2026-10-24T10:00:00.000Z" } }));
  const signature = createHmac("sha512", secretKey).update(body).digest("hex");
  const adapter = new PaystackPaymentAdapter({ secretKey, callbackUrl: "https://portal.example.test/return" }, fakeFetch().fetcher);
  const verified = await adapter.verifyEvent({ rawBody: body, headers: { "x-paystack-signature": signature } });
  assert.equal(verified.verification, "verified");
  if (verified.verification === "verified") {
    assert.equal(verified.observation.merchantReference, "VG-PAY-ABC123");
    assert.equal(verified.observation.providerReference, "4099260516");
    assert.equal(verified.observation.amountMinor, 12345);
    assert.equal(verified.observation.currency, "GHS");
    assert.equal(verified.observation.state, "succeeded");
  }
  assert.deepEqual(await adapter.verifyEvent({ rawBody: body, headers: { "x-paystack-signature": "0".repeat(128) } }), { verification: "invalid" });
});

test("Paystack refund create uses the original provider transaction and lookup maps processed state", async () => {
  const http = fakeFetch(
    { body: { status: true, message: "Refund has been queued for processing", data: { id: 3018284, status: "pending", amount: 5000, currency: "GHS", createdAt: "2026-10-24T10:10:00.000Z" } } },
    { body: { status: true, message: "Refund retrieved", data: { id: 3018284, status: "processed", amount: 5000, currency: "GHS", refunded_at: "2026-10-24T10:20:00.000Z" } } },
  );
  const adapter = new PaystackRefundAdapter({ secretKey: "sk_test_secret" }, http.fetcher);
  const initiated = await adapter.initiateRefund({ refundId: "refund-1", executionId: "exec-1", merchantRefundReference: "VG-REF-1001", originalPaymentMerchantReference: "VG-PAY-ABC123", originalPaymentProviderReference: "4099260516", originalPaymentAmountMinor: 12345, orderReference: "VG-ORDER-1001", method: "mobile_money", amountMinor: 5000, currency: "GHS", signal: new AbortController().signal });
  assert.deepEqual(initiated, { kind: "accepted", state: "pending", providerRefundReference: "3018284" });
  assert.equal(http.calls[0].url, "https://api.paystack.co/refund");
  const createBody = JSON.parse(String(http.calls[0].init?.body));
  assert.equal(createBody.transaction, "4099260516");
  assert.equal(createBody.amount, 5000);
  assert.equal(createBody.currency, "GHS");
  assert.match(createBody.merchant_note, /VG-REF-1001/);
  const observed = await adapter.lookupRefund({ merchantRefundReference: "VG-REF-1001", providerRefundReference: "3018284", signal: new AbortController().signal });
  assert.equal(http.calls[1].url, "https://api.paystack.co/refund/3018284");
  assert.deepEqual(observed, { providerId: "paystack", merchantRefundReference: "VG-REF-1001", providerRefundReference: "3018284", state: "succeeded", amountMinor: 5000, currency: "GHS", providerTimestamp: new Date("2026-10-24T10:20:00.000Z") });
});

test("Paystack factory supplies payment and refund adapters only when Paystack is selected", () => {
  const config = readConfig({
    DATABASE_URL: "postgresql://user:pass@localhost:5432/db", WEB_ORIGINS: "http://localhost:3000", API_STOCK_LOCATION_ID: "loc_accra", API_INSECURE_COOKIES: "true",
    PAYMENT_PROVIDER_ID: "paystack", PAYMENT_ENABLED_METHODS: "mobile_money,card_hosted,bank_transfer", PAYMENT_CONFIRMED_HOLD_MINUTES: "1440", PAYMENT_PROVIDER_TIMEOUT_MS: "5000", PAYMENT_RECONCILE_AFTER_SECONDS: "120", PAYMENT_HOSTED_DOMAINS: "checkout.paystack.com",
    PAYSTACK_SECRET_KEY: "sk_test_secret", PAYSTACK_CALLBACK_URL: "https://portal.example.test/checkout/payment-return",
  });
  const adapters = createConfiguredProviderAdapters(config, fakeFetch().fetcher);
  assert.deepEqual(adapters.paymentAdapters.map((adapter) => adapter.id), ["paystack"]);
  assert.deepEqual(adapters.refundAdapters.map((adapter) => adapter.id), ["paystack"]);
});
