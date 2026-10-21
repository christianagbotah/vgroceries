import { describe, expect, test } from "bun:test";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dir, "..");
const read = (path: string) => readFileSync(join(root, path), "utf8");

describe("storefront native-like account UX", () => {
  test("desktop header exposes delivery, account, wishlist and cart labels", () => {
    const shell = read("src/components/layout/storefront-shell.tsx");
    for (const label of ["Deliver to", "Accra, Ghana", "Account", "Wishlist", "Cart"])
      expect(shell).toContain(label);
  });

  test("mobile storefront has persistent bottom navigation and a bottom-sheet search", () => {
    const shell = read("src/components/layout/storefront-shell.tsx");
    expect(shell).toContain("StorefrontMobileNav");
    expect(shell).toContain('side="bottom"');
    for (const label of ["Home", "Shop", "Search", "Cart", "Account"])
      expect(shell).toContain(label);
  });

  test("account order tracking bypasses guest verification code entry", () => {
    const detail = read("src/app/(storefront)/account/orders/[id]/page.tsx");
    const track = read("src/app/(storefront)/track/page.tsx");
    expect(detail).toContain("/track?orderId=");
    expect(track).toContain('params.get("orderId")');
    expect(track).toContain("apiOps.orderStatus(orderId)");
  });

  test("account uses production customer identity and does not advertise mock-only tabs", () => {
    expect(existsSync(join(root, "src/app/(storefront)/account/login/page.tsx"))).toBe(true);
    const layout = read("src/app/(storefront)/account/layout.tsx");
    const client = read("src/services/client.ts");
    const endpoints = read("packages/contracts/src/endpoints.ts");
    expect(layout).toContain("apiOps.authMe");
    expect(layout).toContain("Log out");
    expect(layout).not.toContain('{ href: "/account/profile"');
    expect(layout).not.toContain('{ href: "/account/addresses"');
    expect(layout).not.toContain('{ href: "/account/returns"');
    expect(client).toContain("authLogin");
    expect(client).toContain("authMe");
    expect(client).toContain("accountLogout");
    expect(endpoints).toContain('"auth.login"');
    expect(endpoints).toContain('"auth.me"');
    expect(endpoints).toContain('"account.logout"');
  });
});
