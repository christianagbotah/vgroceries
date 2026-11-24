import { test } from "node:test";
import assert from "node:assert/strict";
import { createApplication } from "../src/bootstrap";
import { readConfig, type HubtelRefundConfig } from "../src/config";
import { PaymentPolicyService } from "../src/payments/payment-policy.service";
import { RefundProviderRegistry } from "../src/payments/refund-provider.registry";
import { HubtelRefundProvider } from "../src/payments/hubtel-refund-provider";
import { HubtelPaymentProvider } from "../src/payments/hubtel-payment-provider";
import type { RefundProviderAdapter } from "../src/payments/refund-provider";

const hostedEnv = () => ({
  DATABASE_URL: "postgresql://postgres:postgres@127.0.0.1:5432/variety_foundation_test",
  WEB_ORIGINS: "http://localhost:3000",
  API_STOCK_LOCATION_ID: "loc_accra",
  API_INSECURE_COOKIES: "true",
  PAYMENT_PROVIDER_ID: "hubtel",
  PAYMENT_ENABLED_METHODS: "hosted_checkout",
  PAYMENT_CONFIRMED_HOLD_MINUTES: "1440",
  PAYMENT_PROVIDER_TIMEOUT_MS: "5000",
  PAYMENT_RECONCILE_AFTER_SECONDS: "120",
  PAYMENT_HOSTED_DOMAINS: "pay.hubtel.com",
  HUBTEL_CLIENT_ID: "fake-id-for-tests-only",
  HUBTEL_CLIENT_SECRET: "fake-api-secret-for-tests-only",
  HUBTEL_CALLBACK_URL: "https://example.test/api/v1/payments/providers/hubtel/events",
  HUBTEL_RETURN_URL: "https://example.test/checkout/payment-return",
  HUBTEL_CANCELLATION_URL: "https://example.test/checkout/payment-return?cancelled=1",
  HUBTEL_COLLECTION_ACCOUNT_NUMBER: "999999999",
  HUBTEL_ONLINE_CHECKOUT_URL: "https://payproxyapi.hubtel.com/items/initiate",
  HUBTEL_COLLECTION_STATUS_URL: "https://api-txnstatus.hubtel.com/transactions/{merchantAccountNumber}/status?clientReference={reference}",
});

const legacyRefundConfig = (): HubtelRefundConfig => ({
  baseUrl: "https://refund-api.hubtel.com",
  basicUsername: "unused-test-id",
  basicPassword: "unused-test-secret",
  collectionAccount: "999999999",
  callbackOrigin: "https://example.test",
  callbackSecret: "a-long-test-callback-secret-not-live",
});

async function runReadiness(refunds: RefundProviderAdapter[] = []) {
  const app = await createApplication(readConfig(hostedEnv()), [], refunds);
  try {
    const policy = app.get(PaymentPolicyService);
    assert.doesNotThrow(() => policy.assertReadyIfConfigured());
    assert.equal(policy.resolveElectronicMethod().method, "hosted_checkout");
    // Refund operations remain independently capability-gated.
    assert.throws(() => app.get(RefundProviderRegistry).require("hubtel", "hosted_checkout"), /Refund capability|refund capability/i);
  } finally {
    await app.close();
  }
}

test("Hosted Hubtel collection readiness does not require a refund processor", async () => {
  await runReadiness();
});

test("MoMo-only Hubtel refund API cannot authorize hosted checkout refunds", async () => {
  const refund = new HubtelRefundProvider(legacyRefundConfig(), async () => {
    throw new Error("No provider requests should be made during readiness");
  });
  assert.deepEqual(refund.capabilities().methods, ["mobile_money"]);
  await runReadiness([refund]);
});

test("Hosted-only Hubtel must not offer Direct MoMo or claim on-initiation settlement", async () => {
  const config = readConfig(hostedEnv());
  assert.deepEqual(new HubtelPaymentProvider(config.hubtelPayment!).capabilities(), {
    methods: ["hosted_checkout"],
    trustMode: "lookup_required",
    safeInitiationRetry: false,
  });
  assert.equal(config.hubtelPayment?.requestMoneyUrl, undefined);
  assert.equal(config.hubtelPayment?.statusUrl, undefined);
});

test("A simulated future refund adapter is a test-only contract, never a production refund bypass", async () => {
  const fake: RefundProviderAdapter = {
    id: "hubtel",
    capabilities: () => ({
      methods: ["hosted_checkout"],
      lookupSupported: true,
      safeRetryAfterDefinitiveFailure: false,
      safeRetryAfterNoRecord: false,
      safeRetryAfterUnknown: false,
    }),
    initiateRefund: async () => { throw new Error("Test stub is not a payment implementation"); },
    lookupRefund: async () => { throw new Error("Test stub is not a payment implementation"); },
  };
  const app = await createApplication(readConfig(hostedEnv()), [], [fake]);
  try {
    app.get(PaymentPolicyService).assertReadyIfConfigured();
    assert.equal(app.get(PaymentPolicyService).resolveElectronicMethod().method, "hosted_checkout");
  } finally {
    await app.close();
  }
});
