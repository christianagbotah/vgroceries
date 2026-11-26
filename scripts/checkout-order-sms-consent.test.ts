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
