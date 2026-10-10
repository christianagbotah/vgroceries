import { test } from "node:test";
import assert from "node:assert/strict";
import type { CompleteOrderRequest } from "@variety/contracts";
import { readConfig } from "../src/config";
import { ApiProblem } from "../src/http/errors";
import {
  roundLineTotalMinor,
  canonicalCheckoutRequest,
  checkoutRequestHash,
  validateCheckoutContact,
  validateCheckoutLines,
} from "../src/orders/checkout.values";
import { VerificationCodeService } from "../src/orders/verification-code.service";

const baseEnv = () => ({
  DATABASE_URL: "postgresql://lightworld@127.0.0.1:56420/variety_foundation_test",
  WEB_ORIGINS: "http://localhost:3000",
  API_STOCK_LOCATION_ID: "loc_accra",
  API_INSECURE_COOKIES: "true",
});
const completeEnv = () => ({
  ...baseEnv(),
  COMMERCE_LOCATION_ID: "loc_accra",
  CHECKOUT_PAYMENT_HOLD_MINUTES: "15",
  CHECKOUT_OFFLINE_HOLD_MINUTES: "1440",
  GUEST_CHECKOUT_TTL_MINUTES: "1440",
  ORDER_VERIFICATION_ACTIVE_VERSION: "2",
  ORDER_VERIFICATION_KEYS: JSON.stringify({
    1: "11".repeat(32),
    2: "22".repeat(32),
  }),
});
function request(overrides: Partial<CompleteOrderRequest> = {}): CompleteOrderRequest {
  return {
    lines: [{ variantId: "var_rice", quantity: "1.250" }],
    customerName: " Ama Mensah ",
    customerPhone: "+233 24 123 4567",
    customerEmail: " ama@example.test ",
    customerId: "customer@example.test",
    fulfilment: "collection",
    paymentMethod: "cash_counter",
    note: "  leave carefully  ",
    idempotencyKey: "checkout-key-1",
    ...overrides,
  };
}
function expectValidation(fn: () => unknown) {
  assert.throws(fn, (error: unknown) => {
    assert.ok(error instanceof ApiProblem);
    assert.equal(error.getStatus(), 400);
    assert.equal((error.getResponse() as { code: string }).code, "VALIDATION_FAILED");
    return true;
  });
}

test("weighted price rounds half up at the line boundary", () => {
  assert.equal(roundLineTotalMinor(125, "0.5"), 63);
  assert.equal(roundLineTotalMinor(199, "1.005"), 200);
  assert.equal(roundLineTotalMinor(250, "4"), 1000);
});

test("count lines reject fractional and duplicate variants", () => {
  expectValidation(() =>
    validateCheckoutLines([{ variantId: "salt", quantity: "1.5" }], new Map([["salt", "piece"]])),
  );
  expectValidation(() =>
    validateCheckoutLines(
      [
        { variantId: "rice", quantity: "1" },
        { variantId: "rice", quantity: "2" },
      ],
      new Map([["rice", "kg"]]),
    ),
  );
  assert.doesNotThrow(() =>
    validateCheckoutLines([{ variantId: "rice", quantity: "0.125" }], new Map([["rice", "kg"]])),
  );
});

test("semantic checkout hash ignores replay metadata and redundant matching customerId but changes with business input", () => {
  const a = request();
  const b = request({ idempotencyKey: "another-replay-key", customerId: undefined });
  assert.deepEqual(canonicalCheckoutRequest(a), canonicalCheckoutRequest(b));
  assert.equal(checkoutRequestHash(a), checkoutRequestHash(b));
  assert.notEqual(checkoutRequestHash(a), checkoutRequestHash(request({ lines: [{ variantId: "var_rice", quantity: "2" }] })));
});

test("verification codes are 10 Crockford characters deterministic and versioned", () => {
  const config = readConfig(completeEnv());
  const service = new VerificationCodeService(config);
  const a = service.codeFor("ord_123");
  assert.match(a, /^[0-9A-HJKMNP-TV-Z]{10}$/);
  assert.equal(a, service.codeFor("ord_123"));
  assert.notEqual(a, service.codeFor("ord_123", 1));
  const digest = service.digestFor("ord_123", a, 2);
  assert.match(digest, /^[a-f0-9]{64}$/);
  assert.equal(service.verify("ord_123", a, 2, digest), true);
  assert.equal(service.verify("ord_123", "0000000000", 2, digest), false);
});

test("retained verification key versions reproduce old codes", () => {
  const service = new VerificationCodeService(readConfig(completeEnv()));
  const old = service.codeFor("ord_old", 1);
  const digest = service.digestFor("ord_old", old, 1);
  assert.equal(service.codeFor("ord_old", 1), old);
  assert.equal(service.verify("ord_old", old.toLowerCase(), 1, digest), true);
});

test("checkout config allows the fully absent commerce bundle as closed, rejects partial/malformed bundles, and accepts a complete bundle with the active key present", () => {
  assert.equal(readConfig(baseEnv()).commerce, null);
  assert.throws(() => readConfig({ ...baseEnv(), COMMERCE_LOCATION_ID: "loc_accra" }));
  assert.throws(() => readConfig({ ...completeEnv(), CHECKOUT_PAYMENT_HOLD_MINUTES: "0" }));
  assert.throws(() => readConfig({ ...completeEnv(), ORDER_VERIFICATION_KEYS: JSON.stringify({ 1: "11".repeat(32) }) }));
  const config = readConfig(completeEnv());
  assert.equal(config.commerce?.locationId, "loc_accra");
  assert.equal(config.commerce?.paymentHoldMinutes, 15);
  assert.equal(config.commerce?.offlineHoldMinutes, 1440);
  assert.equal(config.commerce?.guestTtlMinutes, 1440);
  assert.equal(config.commerce?.verificationActiveKeyVersion, 2);
  assert.equal(config.commerce?.verificationKeys.get(2)?.length, 32);
});

test("checkout contact and address boundaries reject whitespace and malformed Ghana data", () => {
  for (const bad of [
    request({ customerName: "   " }),
    request({ customerPhone: "0201234567" }),
    request({ customerEmail: "not-an-email" }),
    request({
      fulfilment: "delivery",
      paymentMethod: "mobile_money",
      zoneId: "zone_a",
      guestAddress: { recipientName: " ", phone: "+233241234567", locality: "Accra", street: "Road" },
    }),
    request({
      fulfilment: "delivery",
      paymentMethod: "mobile_money",
      zoneId: "zone_a",
      guestAddress: { recipientName: "Ama", phone: "+233241234567", locality: "Accra", street: "Road", ghanaPostGps: "BAD" },
    }),
  ]) expectValidation(() => validateCheckoutContact(bad));
  assert.doesNotThrow(() => validateCheckoutContact(request()));
});
