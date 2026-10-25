import { test } from "node:test";
import assert from "node:assert/strict";
import { readConfig } from "../src/config";
import { createApplication } from "../src/bootstrap";
import { createConfiguredProviderAdapters } from "../src/payments/providers/factory";

function baseEnv() {
  return {
    DATABASE_URL: process.env.DATABASE_URL!,
    WEB_ORIGINS: "http://localhost:3000",
    API_STOCK_LOCATION_ID: "loc_accra",
    API_INSECURE_COOKIES: "true",
    COMMERCE_LOCATION_ID: "loc_accra",
    CHECKOUT_PAYMENT_HOLD_MINUTES: "15",
    CHECKOUT_OFFLINE_HOLD_MINUTES: "1440",
    GUEST_CHECKOUT_TTL_MINUTES: "1440",
    ORDER_VERIFICATION_ACTIVE_VERSION: "1",
    ORDER_VERIFICATION_KEYS: JSON.stringify({ 1: "11".repeat(32) }),
  };
}

async function capability(env: Record<string, string | undefined>) {
  const config = readConfig(env);
  const configured = createConfiguredProviderAdapters(config);
  const app = await createApplication(config, configured.paymentAdapters, configured.refundAdapters);
  try {
    await app.listen(0, "127.0.0.1");
    const response = await fetch((await app.getUrl()) + "/api/v1/checkout/capabilities");
    return { status: response.status, body: await response.json() };
  } finally {
    await app.close();
  }
}

test("checkout capabilities fail closed when electronic payments are not configured", async () => {
  assert.ok(process.env.DATABASE_URL, "isolated DATABASE_URL is required");
  const result = await capability(baseEnv());
  assert.equal(result.status, 200);
  assert.deepEqual(result.body, { ok: true, data: { electronicPaymentAvailable: false } });
});

test("checkout capabilities expose only a boolean when a hosted Paystack method and refund path are ready", async () => {
  const result = await capability({
    ...baseEnv(),
    PAYMENT_PROVIDER_ID: "paystack",
    PAYMENT_ENABLED_METHODS: "card_hosted",
    PAYMENT_CONFIRMED_HOLD_MINUTES: "1440",
    PAYMENT_PROVIDER_TIMEOUT_MS: "5000",
    PAYMENT_RECONCILE_AFTER_SECONDS: "120",
    PAYMENT_HOSTED_DOMAINS: "checkout.paystack.com",
    PAYSTACK_SECRET_KEY: "sk_test_secret",
    PAYSTACK_CALLBACK_URL: "https://portal.example.test/checkout/payment-return",
  });
  assert.equal(result.status, 200);
  assert.deepEqual(result.body, { ok: true, data: { electronicPaymentAvailable: true } });
  assert.equal(JSON.stringify(result.body).includes("paystack"), false);
  assert.equal(JSON.stringify(result.body).includes("card_hosted"), false);
});

test("checkout capabilities keep Hubtel hosted collection hidden until its refund adapter is configured", async () => {
  const result = await capability({
    ...baseEnv(),
    PAYMENT_PROVIDER_ID: "hubtel",
    PAYMENT_ENABLED_METHODS: "card_hosted",
    PAYMENT_CONFIRMED_HOLD_MINUTES: "1440",
    PAYMENT_PROVIDER_TIMEOUT_MS: "5000",
    PAYMENT_RECONCILE_AFTER_SECONDS: "120",
    PAYMENT_HOSTED_DOMAINS: "pay.hubtel.com",
    HUBTEL_CLIENT_ID: "cid",
    HUBTEL_CLIENT_SECRET: "secret",
    HUBTEL_REQUEST_MONEY_URL: "https://api.hubtel.example/request-money/{mobileNumber}",
    HUBTEL_STATUS_URL: "https://api.hubtel.example/status/{reference}",
    HUBTEL_CALLBACK_URL: "https://portal.example.test/api/v1/payments/providers/hubtel/events",
    HUBTEL_RETURN_URL: "https://portal.example.test/checkout/payment-return",
    HUBTEL_CANCELLATION_URL: "https://portal.example.test/checkout/payment-return?cancelled=1",
  });
  assert.equal(result.status, 200);
  assert.deepEqual(result.body, { ok: true, data: { electronicPaymentAvailable: false } });
});
