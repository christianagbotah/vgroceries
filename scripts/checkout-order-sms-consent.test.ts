import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

describe("checkout order-only SMS consent", () => {
  const page = readFileSync("src/app/(storefront)/checkout/page.tsx", "utf8");
  test("SMS preference is off by default and gated separately from provider credentials", () => {
    expect(page).toContain("useState(false)");
    expect(page).toContain('const [smsUpdatesOptIn, setSmsUpdatesOptIn] = useState(false)');
    expect(page).toContain('NEXT_PUBLIC_ORDER_SMS_OPT_IN_ENABLED === "1"');
    expect(page).toContain("checked={smsUpdatesOptIn}");
    expect(page).toContain("not marketing consent");
    expect(page).toContain("phone verification and service availability");
  });
  test("only deliberate opt-in is included in checkout and phone changes revoke selection", () => {
    expect(page).toContain("...(smsUpdatesEnabled && smsUpdatesOptIn ? { smsUpdatesOptIn: true } : {})");
    expect(page).toContain("setCustomerPhone(e.target.value); setSmsUpdatesOptIn(false);");
  });
});

test("requested SMS verification is prominent before receipt and payment without forcing OTP or payment",()=>{
 const status=readFileSync("src/app/(storefront)/checkout/status/[id]/page.tsx","utf8");
 expect(status.indexOf("<OrderSmsVerification key=")).toBeGreaterThan(0);
 expect(status.indexOf("<OrderSmsVerification key=")).toBeLessThan(status.indexOf("<OrderReceiptExperience order="));
 const prompt=readFileSync("src/features/checkout/order-sms-verification.tsx","utf8");
 expect(prompt).toContain("SMS updates waiting for verification");
 expect(prompt).toContain("expire after 24 hours");
 expect(prompt).toContain("onClick={() => void requestCode()}");
 expect(prompt).not.toContain("paymentInitiate");
});
