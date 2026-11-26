import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
describe("order-scoped guest SMS verification", () => {
  test("checkout renders the optional verification panel only when the API requires it", () => {
    const page=readFileSync("src/app/(storefront)/checkout/status/[id]/page.tsx","utf8");
    expect(page).toContain("order.smsPhoneVerificationRequired ?");
    expect(page).toContain("reference={order.reference}");
    expect(page).toContain("onVerified={() => void load()}");
  });
  test("only explicit interaction sends OTP; code verification remains independent of payment", () => {
    const panel=readFileSync("src/features/checkout/order-sms-verification.tsx","utf8");
    expect(panel).toContain("apiOps.requestOrderOtp(reference)");
    expect(panel).toContain("apiOps.verifyOrderOtp(reference, challenge.challengeId, code)");
    expect(panel).toContain("disabled={busy || waitSeconds > 0}");
    expect(panel).toContain("You can continue checkout");
    expect(panel).not.toContain("paymentInitiate");
    expect(panel).not.toContain("localStorage");
  });
});
