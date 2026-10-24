import { test } from "node:test";
import assert from "node:assert/strict";
import { readConfig } from "../src/config";

const base = () => ({
  DATABASE_URL: "postgresql://user:pass@localhost:5432/db",
  WEB_ORIGINS: "http://localhost:3000",
  API_STOCK_LOCATION_ID: "loc_accra",
  API_INSECURE_COOKIES: "true",
  PAYMENT_PROVIDER_ID: "paystack",
  PAYMENT_ENABLED_METHODS: "mobile_money,card_hosted,bank_transfer",
  PAYMENT_CONFIRMED_HOLD_MINUTES: "1440",
  PAYMENT_PROVIDER_TIMEOUT_MS: "5000",
  PAYMENT_RECONCILE_AFTER_SECONDS: "120",
  PAYMENT_HOSTED_DOMAINS: "checkout.paystack.com",
});

test("selected paystack provider requires and parses only its protected credential bundle", () => {
  assert.throws(() => readConfig(base()), /PAYSTACK_SECRET_KEY/);
  const config = readConfig({ ...base(), PAYSTACK_SECRET_KEY: "sk_test_example", PAYSTACK_CALLBACK_URL: "https://portal.example.test/checkout/payment-return" });
  assert.deepEqual(config.payments?.provider, {
    kind: "paystack",
    secretKey: "sk_test_example",
    callbackUrl: "https://portal.example.test/checkout/payment-return",
  });
});

test("hubtel and etranzact provider bundles are selected without requiring other providers", () => {
  const hubtel = readConfig({ ...base(), PAYMENT_PROVIDER_ID: "hubtel", PAYMENT_HOSTED_DOMAINS: "pay.hubtel.com", HUBTEL_CLIENT_ID: "cid", HUBTEL_CLIENT_SECRET: "secret", HUBTEL_REQUEST_MONEY_URL: "https://api.hubtel.example/request-money/{mobileNumber}", HUBTEL_STATUS_URL: "https://api.hubtel.example/status/{reference}", HUBTEL_CALLBACK_URL: "https://portal.example.test/api/v1/payments/providers/hubtel/events", HUBTEL_RETURN_URL: "https://portal.example.test/checkout/payment-return", HUBTEL_CANCELLATION_URL: "https://portal.example.test/checkout/payment-return?cancelled=1" });
  assert.equal(hubtel.payments?.provider.kind, "hubtel");
  const etz = readConfig({ ...base(), PAYMENT_PROVIDER_ID: "etranzact", PAYMENT_HOSTED_DOMAINS: "pay.etranzact.example", ETRANZACT_TERMINAL_ID: "TERMINAL1", ETRANZACT_SECRET_KEY: "secret", ETRANZACT_CHECKOUT_URL: "https://pay.etranzact.example/webconnect/v3/caller.jsp", ETRANZACT_QUERY_URL: "https://pay.etranzact.example/webconnect/v3/query.jsp", ETRANZACT_RESPONSE_URL: "https://portal.example.test/api/v1/payments/providers/etranzact/events" });
  assert.equal(etz.payments?.provider.kind, "etranzact");
});

test("provider endpoints must be HTTPS outside explicit test/dev localhost use", () => {
  assert.throws(() => readConfig({ ...base(), NODE_ENV: "production", WEB_ORIGINS: "https://portal.example.test", API_INSECURE_COOKIES: "false", PAYSTACK_SECRET_KEY: "secret", PAYSTACK_CALLBACK_URL: "http://portal.example.test/return" }), /HTTPS/);
});
