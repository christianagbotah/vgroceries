import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(path, "utf8");

const checkoutPath = "src/app/(storefront)/checkout/page.tsx";
const loginPath = "src/app/(storefront)/account/login/page.tsx";
const signupPath = "src/app/(storefront)/account/signup/page.tsx";

describe("checkout authentication choice", () => {
  test("guest account lookup can never turn checkout into an authentication error page", () => {
    const checkout = read(checkoutPath);
    expect(checkout).not.toContain("Promise.all([apiOps.zones(), apiOps.accountSummary()])");
    expect(checkout).toContain("apiOps.accountSummary().catch(() => null)");
    expect(checkout).toContain("Continue as guest");
    expect(checkout).toContain("Sign in");
    expect(checkout).toContain("Create account");
  });

  test("checkout auth actions preserve the cart flow and return customers to checkout", () => {
    const checkout = read(checkoutPath);
    expect(checkout).toContain('/account/login?next=%2Fcheckout');
    expect(checkout).toContain('/account/signup?next=%2Fcheckout');

    for (const path of [loginPath, signupPath]) {
      const source = read(path);
      expect(source).toContain('new URLSearchParams(window.location.search).get("next")');
      expect(source).toContain("router.replace(returnPath)");
      expect(source).toContain('!candidate.startsWith("//")');
    }
  });

  test("real delivery configuration failures still use the checkout error state", () => {
    const checkout = read(checkoutPath);
    expect(checkout).toContain("Could not load delivery options. Please try again.");
    expect(checkout).toContain("<ErrorState");
  });
});
