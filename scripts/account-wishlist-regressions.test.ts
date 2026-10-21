import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";

const read = (path: string) => readFileSync(path, "utf8");

describe("customer account and wishlist regressions", () => {
  test("wishlist controls add in place and consume the product click", () => {
    const tile = read("src/features/catalog/product-tile.tsx");
    const detail = read("src/app/(storefront)/products/[slug]/page.tsx");
    const button = read("src/features/catalog/wishlist-button.tsx");
    expect(tile).toContain("WishlistButton");
    expect(detail).toContain("WishlistButton");
    expect(tile).not.toContain('<Link href="/account/lists"><Heart');
    expect(detail).not.toContain('href="/account/lists" className="inline-flex h-9');
    expect(button).toContain("event.preventDefault()");
    expect(button).toContain("event.stopPropagation()");
  });

  test("account area has a customer login route and session gate", () => {
    expect(existsSync("src/app/(storefront)/account/login/page.tsx")).toBe(true);
    const layout = read("src/app/(storefront)/account/layout.tsx");
    expect(layout).toContain("accountSession");
    expect(layout).toContain("/account/login");
  });

  test("account requests without a session are redirected before the client account shell renders", () => {
    expect(existsSync("src/proxy.ts")).toBe(true);
    if (!existsSync("src/proxy.ts")) return;
    const proxy = read("src/proxy.ts");
    expect(proxy).toContain('request.cookies.get("vg_session")');
    expect(proxy).toContain('url.pathname = "/account/login"');
    expect(proxy).toContain('matcher: ["/account/:path*"]');
  });
});
