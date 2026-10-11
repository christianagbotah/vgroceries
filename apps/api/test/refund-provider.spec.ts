import { after, test } from "node:test";
import assert from "node:assert/strict";
import type { INestApplication } from "@nestjs/common";
import type { ElectronicPaymentMethod } from "@variety/contracts";
import { createApplication } from "../src/bootstrap";
import { readConfig } from "../src/config";
import { Database } from "../src/database/database";
import type { RefundProviderAdapter } from "../src/payments/refund-provider";
import { RefundProviderRegistry } from "../src/payments/refund-provider.registry";
import { seedCommerceFixtures } from "./commerce-fixtures";
import { FakePaymentProvider } from "./fake-payment-provider";

const apps: INestApplication[] = [];
after(async () => { for (const app of apps.reverse()) await app.close(); });

const env = () => ({
  DATABASE_URL: process.env.DATABASE_URL!, WEB_ORIGINS: "http://localhost:3000",
  API_STOCK_LOCATION_ID: "loc_accra", API_INSECURE_COOKIES: "true",
  COMMERCE_LOCATION_ID: "loc_accra", CHECKOUT_PAYMENT_HOLD_MINUTES: "15",
  CHECKOUT_OFFLINE_HOLD_MINUTES: "1440", GUEST_CHECKOUT_TTL_MINUTES: "1440",
  ORDER_VERIFICATION_ACTIVE_VERSION: "1", ORDER_VERIFICATION_KEYS: JSON.stringify({ 1: "11".repeat(32) }),
  PAYMENT_PROVIDER_ID: "fake", PAYMENT_ENABLED_METHODS: "mobile_money,card_hosted,bank_transfer",
  PAYMENT_CONFIRMED_HOLD_MINUTES: "1440", PAYMENT_PROVIDER_TIMEOUT_MS: "5000",
  PAYMENT_RECONCILE_AFTER_SECONDS: "120", PAYMENT_HOSTED_DOMAINS: "pay.example.test",
});

function refundAdapter(
  id = "fake",
  methods: ElectronicPaymentMethod[] = ["mobile_money", "card_hosted", "bank_transfer"],
): RefundProviderAdapter {
  return {
    id,
    capabilities: () => ({ methods, lookupSupported: true, safeRetryAfterDefinitiveFailure: false, safeRetryAfterNoRecord: false, safeRetryAfterUnknown: false }),
    initiateRefund: async () => ({ kind: "accepted", state: "pending" }),
    lookupRefund: async (input) => ({ providerId: id, merchantRefundReference: input.merchantRefundReference, state: "pending" }),
  };
}

async function start(refunds: RefundProviderAdapter[] = []) {
  const payment = new FakePaymentProvider();
  const app = await createApplication(readConfig(env()), [payment], refunds);
  apps.push(app);
  await app.listen(0, "127.0.0.1");
  await seedCommerceFixtures(app.get(Database));
  return { app, base: await app.getUrl() };
}

test("configured electronic charging fails readiness without same-provider refund capability", async () => {
  const { base } = await start([]);
  assert.equal((await fetch(base + "/api/v1/health/ready")).status, 503);
});

test("refund readiness requires every enabled payment method", async () => {
  const { base } = await start([refundAdapter("fake", ["mobile_money"])]);
  assert.equal((await fetch(base + "/api/v1/health/ready")).status, 503);
});

test("compatible refund adapter restores readiness", async () => {
  const { base } = await start([refundAdapter()]);
  assert.equal((await fetch(base + "/api/v1/health/ready")).status, 200);
});

test("refund adapter IDs must be stable lowercase identifiers", async () => {
  const { app } = await start([refundAdapter()]);
  const registry = app.get(RefundProviderRegistry);
  assert.throws(
    () => registry.register(refundAdapter("BAD ID")),
    /stable lowercase|identifier/i,
  );
});
