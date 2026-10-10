import { after, test } from "node:test";
import assert from "node:assert/strict";
import type { INestApplication } from "@nestjs/common";
import { createApplication } from "../src/bootstrap";
import { Database } from "../src/database/database";
import { PaymentPolicyService } from "../src/payments/payment-policy.service";
import { readConfig } from "../src/config";
import { seedCommerceFixtures } from "./commerce-fixtures";
import { FakePaymentProvider } from "./fake-payment-provider";

const apps: INestApplication[] = [];
after(async () => { for (const app of apps.reverse()) await app.close(); });

const env = (payments = true) => ({
  DATABASE_URL: process.env.DATABASE_URL!, WEB_ORIGINS: "http://localhost:3000",
  API_STOCK_LOCATION_ID: "loc_accra", API_INSECURE_COOKIES: "true",
  COMMERCE_LOCATION_ID: "loc_accra", CHECKOUT_PAYMENT_HOLD_MINUTES: "15",
  CHECKOUT_OFFLINE_HOLD_MINUTES: "1440", GUEST_CHECKOUT_TTL_MINUTES: "1440",
  ORDER_VERIFICATION_ACTIVE_VERSION: "1", ORDER_VERIFICATION_KEYS: JSON.stringify({ 1: "11".repeat(32) }),
  ...(payments ? {
    PAYMENT_PROVIDER_ID: "fake", PAYMENT_ENABLED_METHODS: "mobile_money,card_hosted,bank_transfer",
    PAYMENT_CONFIRMED_HOLD_MINUTES: "1440", PAYMENT_PROVIDER_TIMEOUT_MS: "5000",
    PAYMENT_RECONCILE_AFTER_SECONDS: "120", PAYMENT_HOSTED_DOMAINS: "pay.example.test",
  } : {}),
});

async function start(config = readConfig(env()), fake?: FakePaymentProvider) {
  const app = await createApplication(config, fake ? [fake] : []); apps.push(app);
  await app.listen(0, "127.0.0.1"); await seedCommerceFixtures(app.get(Database));
  return { app, base: await app.getUrl(), policy: app.get(PaymentPolicyService) };
}

test("absent provider bundle is bootable but electronic method is closed", async () => {
  const { base, policy } = await start(readConfig(env(false)));
  assert.equal((await fetch(base + "/api/v1/health/ready")).status, 200);
  assert.throws(() => policy.assertElectronicMethodAvailable("mobile_money"), /not configured/i);
});

test("configured missing or capability-incompatible provider fails readiness", async () => {
  const missing = await start();
  assert.equal((await fetch(missing.base + "/api/v1/health/ready")).status, 503);
  const fake = new FakePaymentProvider(); fake.capabilitiesValue = { methods: ["mobile_money"], trustMode: "verified_event", safeInitiationRetry: true };
  const incompatible = await start(readConfig(env()), fake);
  assert.equal((await fetch(incompatible.base + "/api/v1/health/ready")).status, 503);
});

test("compatible injected provider restores readiness and method policy", async () => {
  const fake = new FakePaymentProvider();
  const { base, policy } = await start(readConfig(env()), fake);
  assert.equal((await fetch(base + "/api/v1/health/ready")).status, 200);
  assert.equal(policy.assertElectronicMethodAvailable("mobile_money").id, "fake");
  assert.equal(policy.assertElectronicMethodAvailable("card_hosted").id, "fake");
});

test("hosted redirect actions require HTTPS and configured hostname", async () => {
  const fake = new FakePaymentProvider(); const { policy } = await start(readConfig(env()), fake);
  assert.throws(() => policy.validateProviderAction({ kind: "redirect", url: "http://pay.example.test/checkout" }), /HTTPS/);
  assert.throws(() => policy.validateProviderAction({ kind: "redirect", url: "https://evil.example/checkout" }), /allowlist/);
  assert.deepEqual(policy.validateProviderAction({ kind: "redirect", url: "https://pay.example.test/checkout" }), { kind: "redirect", url: "https://pay.example.test/checkout" });
  assert.deepEqual(policy.validateProviderAction({ kind: "prompt", message: "Approve in wallet" }), { kind: "prompt", message: "Approve in wallet" });
});
