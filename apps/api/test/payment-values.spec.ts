import test from "node:test";
import assert from "node:assert/strict";
import {
  electronicPaymentMethodSchema,
  paymentInitiationRequestSchema,
  type ElectronicPaymentMethod,
} from "@variety/contracts";
import { readConfig } from "../src/config";

const baseEnv = {
  DATABASE_URL: "postgresql://test:test@127.0.0.1:5432/test",
  API_STOCK_LOCATION_ID: "loc_accra",
  WEB_ORIGINS: "http://localhost:3000",
};

function paymentEnv(extra: Record<string, string> = {}) {
  return {
    ...baseEnv,
    PAYMENT_PROVIDER_ID: "fake",
    PAYMENT_ENABLED_METHODS: "mobile_money,card_hosted,bank_transfer",
    PAYMENT_CONFIRMED_HOLD_MINUTES: "1440",
    PAYMENT_PROVIDER_TIMEOUT_MS: "5000",
    PAYMENT_RECONCILE_AFTER_SECONDS: "120",
    PAYMENT_HOSTED_DOMAINS: "pay.example.test,secure.example.test",
    ...extra,
  };
}

test("payment configuration is closed when the whole bundle is absent", () => {
  assert.equal(readConfig(baseEnv).payments, null);
});

test("payment configuration rejects partial bundles", () => {
  assert.throws(
    () => readConfig({ ...baseEnv, PAYMENT_PROVIDER_ID: "fake" }),
    /Payment configuration must be supplied as a complete bundle/,
  );
});

test("payment configuration validates methods, bounds and hosted domains", () => {
  const config = readConfig(paymentEnv()).payments!;
  assert.equal(config.providerId, "fake");
  assert.deepEqual(config.enabledMethods, ["mobile_money", "card_hosted", "bank_transfer"] satisfies ElectronicPaymentMethod[]);
  assert.equal(config.confirmedHoldMinutes, 1440);
  assert.equal(config.requestTimeoutMs, 5000);
  assert.equal(config.reconcileAfterSeconds, 120);
  assert.deepEqual(config.hostedDomains, ["pay.example.test", "secure.example.test"]);

  assert.throws(() => readConfig(paymentEnv({ PAYMENT_ENABLED_METHODS: "cash_on_delivery" })), /PAYMENT_ENABLED_METHODS/);
  assert.throws(() => readConfig(paymentEnv({ PAYMENT_CONFIRMED_HOLD_MINUTES: "0" })), /PAYMENT_CONFIRMED_HOLD_MINUTES/);
  assert.throws(() => readConfig(paymentEnv({ PAYMENT_PROVIDER_TIMEOUT_MS: "99" })), /PAYMENT_PROVIDER_TIMEOUT_MS/);
  assert.throws(() => readConfig(paymentEnv({ PAYMENT_PROVIDER_TIMEOUT_MS: "30001" })), /PAYMENT_PROVIDER_TIMEOUT_MS/);
  assert.throws(() => readConfig(paymentEnv({ PAYMENT_RECONCILE_AFTER_SECONDS: "29" })), /PAYMENT_RECONCILE_AFTER_SECONDS/);
  assert.throws(() => readConfig(paymentEnv({ PAYMENT_RECONCILE_AFTER_SECONDS: "86401" })), /PAYMENT_RECONCILE_AFTER_SECONDS/);
  assert.throws(() => readConfig(paymentEnv({ PAYMENT_HOSTED_DOMAINS: "https://pay.example.test/path" })), /PAYMENT_HOSTED_DOMAINS/);
  assert.throws(() => readConfig(paymentEnv({ PAYMENT_HOSTED_DOMAINS: "PAY.EXAMPLE.TEST" })), /PAYMENT_HOSTED_DOMAINS/);
});

test("payment initiation accepts only an optional Ghana payer phone", () => {
  assert.deepEqual(paymentInitiationRequestSchema.parse({}), {});
  assert.deepEqual(paymentInitiationRequestSchema.parse({ payerPhone: "+233241234567" }), { payerPhone: "+233241234567" });
  for (const value of [
    { payerPhone: "0241234567" },
    { amountMinor: 100 },
    { currency: "GHS" },
    { status: "succeeded" },
    { provider: "fake" },
    { pan: "4111111111111111" },
    { cvv: "123" },
  ]) assert.equal(paymentInitiationRequestSchema.safeParse(value).success, false);
});

test("electronic payment method vocabulary excludes cash methods", () => {
  for (const method of ["mobile_money", "card_hosted", "bank_transfer"])
    assert.equal(electronicPaymentMethodSchema.safeParse(method).success, true);
  for (const method of ["cash_counter", "cash_on_delivery"])
    assert.equal(electronicPaymentMethodSchema.safeParse(method).success, false);
});
