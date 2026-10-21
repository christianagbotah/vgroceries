import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";

const read = (path: string) => readFileSync(path, "utf8");

describe("storefront account + wishlist production cutover", () => {
  test("product-card heart saves in place instead of navigating to the wishlist page", () => {
    const source = read("src/features/catalog/product-tile.tsx");
    expect(source).toContain("addProductToWishlist");
    expect(source).not.toContain('<Link href="/account/lists"><Heart');
    expect(source).toContain("Saved to wishlist");
  });

  test("product detail delegates wishlist saving to a client action", () => {
    const source = read("src/app/(storefront)/products/[slug]/page.tsx");
    expect(source).toContain("WishlistButton");
    expect(source).not.toContain('href="/account/lists"');
  });

  test("customer sign-in route exists and uses the real identity authority", () => {
    const path = "src/app/(storefront)/account/login/page.tsx";
    expect(existsSync(path)).toBe(true);
    if (!existsSync(path)) return;
    const source = read(path);
    expect(source).toContain("apiOps.authLogin");
    expect(source).toContain('session.actor.role !== "customer"');
    expect(source).toContain("/account");
  });

  test("account shell protects customer pages and real logout carries CSRF", () => {
    const source = read("src/app/(storefront)/account/layout.tsx");
    expect(source).toContain("apiOps.authMe");
    expect(source).toContain("/account/login");
    expect(source).toContain("session.csrfToken");
    expect(source).toContain("apiOps.accountLogout(session.csrfToken)");
  });

  test("account overview derives from real identity + owned orders, not mock-only summary", () => {
    const source = read("src/app/(storefront)/account/page.tsx");
    expect(source).toContain("apiOps.authMe");
    expect(source).toContain("apiOps.accountOrders");
    expect(source).not.toContain("accountSummary");
    expect(source).not.toContain("/account/returns");
    expect(source).not.toContain("/account/addresses");
  });

  test("browser contract exposes identity routes and CSRF transport", () => {
    const endpoints = read("packages/contracts/src/endpoints.ts");
    const client = read("src/services/client.ts");
    const transport = read("src/services/adapters/http.ts");
    const types = read("src/services/adapters/types.ts");
    expect(endpoints).toContain('"auth.login": {"method": "POST", "path": "/auth/sessions"}');
    expect(endpoints).toContain('"auth.me": {"method": "GET", "path": "/auth/me"}');
    expect(client).toContain("authLogin:");
    expect(client).toContain("authMe:");
    expect(types).toContain("csrfToken?: string");
    expect(transport).toContain('"X-CSRF-Token"');
  });
});
