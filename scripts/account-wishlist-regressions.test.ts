import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";

const read = (path: string) => readFileSync(path, "utf8");

describe("customer account and wishlist regressions", () => {
  test("wishlist controls add in place instead of navigating to Saved lists", () => {
    const tile = read("src/features/catalog/product-tile.tsx");
    const detail = read("src/app/(storefront)/products/[slug]/page.tsx");
    expect(tile).toContain("WishlistButton");
    expect(detail).toContain("WishlistButton");
    expect(tile).not.toContain('<Link href="/account/lists"><Heart');
    expect(detail).not.toContain('href="/account/lists" className="inline-flex h-9');
  });

  test("account area has a customer login route and session gate", () => {
    expect(existsSync("src/app/(storefront)/account/login/page.tsx")).toBe(true);
    const layout = read("src/app/(storefront)/account/layout.tsx");
    expect(layout).toContain("accountSession");
    expect(layout).toContain("/account/login");
  });
});
