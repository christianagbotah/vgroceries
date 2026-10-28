import { createHmac } from "node:crypto";
import { test } from "node:test";
import assert from "node:assert/strict";
import { electronicPaymentMethodSchema } from "@variety/contracts";
import { createApplication } from "../src/bootstrap";
import { readConfig } from "../src/config";
import { PaystackPaymentProvider } from "../src/payments/paystack-payment-provider";
import { PaymentProviderRegistry } from "../src/payments/payment-provider.registry";

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

const providerConfig = () => ({
  secretKey: "sk_test_paystack_secret",
  initializeUrl: "https://api.paystack.example/transaction/initialize",
  verifyUrl: "https://api.paystack.example/transaction/verify/{reference}",
  refundUrl: "https://api.paystack.example/refund",
  refundLookupUrl: "https://api.paystack.example/refund/{id}",
  callbackUrl: "https://portal.varietygroceries.com/checkout/payment-return",
  technicalEmailDomain: "payments.varietygroceries.com",
  identityHmacKey: Buffer.from("11".repeat(32), "hex"),
});

const input = (overrides: Record<string, unknown> = {}) => ({
  attemptId: "attempt-1",
  merchantReference: "VG-PAY-ABC123",
  orderReference: "VG-ORDER-1001",
  method: "hosted_checkout" as const,
  amountMinor: 12345,
  currency: "GHS" as const,
  payerPhone: "+233241111111",
  signal: new AbortController().signal,
  ...overrides,
});

const paymentEnv = () => ({
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
});

const paystackEnv = () => ({
  PAYSTACK_SECRET_KEY: providerConfig().secretKey,
  PAYSTACK_INITIALIZE_URL: "https://api.paystack.co/transaction/initialize",
  PAYSTACK_VERIFY_URL: "https://api.paystack.co/transaction/verify/{reference}",
  PAYSTACK_REFUND_URL: "https://api.paystack.co/refund",
  PAYSTACK_REFUND_LOOKUP_URL: "https://api.paystack.co/refund/{id}",
  PAYSTACK_CALLBACK_URL: providerConfig().callbackUrl,
  PAYSTACK_TECHNICAL_EMAIL_DOMAIN: providerConfig().technicalEmailDomain,
  PAYSTACK_IDENTITY_HMAC_KEY: "11".repeat(32),
});

test("hosted_checkout is a concrete provider flow method", () => {
  assert.equal(electronicPaymentMethodSchema.parse("hosted_checkout"), "hosted_checkout");
});

test("Paystack configuration is complete, provider-bound and production-safe", () => {
  assert.equal(readConfig({ DATABASE_URL: "postgresql://u:p@localhost/db", WEB_ORIGINS: "http://localhost:3000", API_STOCK_LOCATION_ID: "loc", API_INSECURE_COOKIES: "true" }).paystack, null);
  assert.throws(() => readConfig(paymentEnv()), /Paystack.*complete bundle/i);
  const parsed = readConfig({ ...paymentEnv(), ...paystackEnv() }).paystack;
  assert.equal(parsed?.secretKey, providerConfig().secretKey);
  assert.equal(parsed?.technicalEmailDomain, "payments.varietygroceries.com");
  assert.equal(parsed?.identityHmacKey.length, 32);
});

test("Paystack hosted checkout initializes server-side without preselecting a payment rail", async () => {
  const http = fakeFetch({ body: { status: true, message: "Authorization URL created", data: { authorization_url: "https://checkout.paystack.com/access-1", access_code: "access-1", reference: "VG-PAY-ABC123" } } });
  const adapter = new PaystackPaymentProvider(providerConfig(), http.fetcher);
  const result = await adapter.initiate(input());
  assert.deepEqual(result, { kind: "accepted", providerReference: "VG-PAY-ABC123", action: { kind: "redirect", url: "https://checkout.paystack.com/access-1" } });
  assert.equal(http.calls[0].url, providerConfig().initializeUrl);
  const headers = new Headers(http.calls[0].init?.headers);
  assert.equal(headers.get("authorization"), `Bearer ${providerConfig().secretKey}`);
  const body = JSON.parse(String(http.calls[0].init?.body));
  assert.equal(body.amount, "12345");
  assert.equal(body.currency, "GHS");
  assert.equal(body.reference, "VG-PAY-ABC123");
  assert.equal(body.callback_url, providerConfig().callbackUrl);
  assert.equal(Object.hasOwn(body, "channels"), false);
  assert.match(body.email, /^paystack-[a-f0-9]{32}@payments\.varietygroceries\.com$/);
  assert.equal(body.metadata.orderReference, "VG-ORDER-1001");
  assert.equal(body.metadata.payerPhone, "+233241111111");
});

test("Paystack uses a real customer email when one exists and never requires it for phone-first checkout", async () => {
  const http = fakeFetch({ body: { status: true, data: { authorization_url: "https://checkout.paystack.com/access-2", access_code: "access-2", reference: "VG-PAY-ABC123" } } });
  const adapter = new PaystackPaymentProvider(providerConfig(), http.fetcher);
  await adapter.initiate(input({ payerEmail: "ama@example.test" }));
  const body = JSON.parse(String(http.calls[0].init?.body));
  assert.equal(body.email, "ama@example.test");
});

test("Paystack webhook signature is authenticated but final financial truth requires lookup", async () => {
  const adapter = new PaystackPaymentProvider(providerConfig(), fakeFetch().fetcher);
  const rawBody = Buffer.from(JSON.stringify({ event: "charge.success", data: { reference: "VG-PAY-ABC123", id: 4099260516 } }));
  const signature = createHmac("sha512", providerConfig().secretKey).update(rawBody).digest("hex");
  const verified = await adapter.verifyEvent({ rawBody, headers: { "x-paystack-signature": signature } });
  assert.deepEqual(verified, { verification: "lookup_required", merchantReference: "VG-PAY-ABC123", providerReference: "VG-PAY-ABC123", providerEventId: "4099260516" });
  assert.equal((await adapter.verifyEvent({ rawBody, headers: { "x-paystack-signature": "bad" } })).verification, "invalid");
});

test("Paystack Verify Transaction maps authoritative status, money and actual settled channel", async () => {
  const http = fakeFetch({ body: { status: true, message: "Verification successful", data: { id: 4099260516, status: "success", reference: "VG-PAY-ABC123", amount: 12345, currency: "GHS", channel: "mobile_money", paid_at: "2026-10-27T02:00:00.000Z" } } });
  const adapter = new PaystackPaymentProvider(providerConfig(), http.fetcher);
  const observation = await adapter.lookup({ merchantReference: "VG-PAY-ABC123", providerReference: "VG-PAY-ABC123", signal: new AbortController().signal });
  assert.equal(http.calls[0].url, "https://api.paystack.example/transaction/verify/VG-PAY-ABC123");
  assert.deepEqual(observation, { providerId: "paystack", merchantReference: "VG-PAY-ABC123", providerReference: "VG-PAY-ABC123", state: "succeeded", amountMinor: 12345, currency: "GHS", settledChannel: "mobile_money", providerTimestamp: new Date("2026-10-27T02:00:00.000Z") });
});

test("configured Paystack bundle auto-registers hosted checkout in NestJS", async () => {
  const app = await createApplication(readConfig({ ...paymentEnv(), ...paystackEnv() }));
  try {
    const adapter = app.get(PaymentProviderRegistry).requireConfigured();
    assert.equal(adapter.id, "paystack");
    assert.deepEqual(adapter.capabilities(), { methods: ["hosted_checkout"], trustMode: "lookup_required", safeInitiationRetry: false });
  } finally {
    await app.close();
  }
});
