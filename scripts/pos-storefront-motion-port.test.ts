import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { assembleProductMedia } from "../src/features/catalog/product-media-gallery";
import { announceCartImpact, CART_IMPACT_EVENT, flyProductToCart } from "../src/features/checkout/cart-motion";

const root = resolve(import.meta.dir, "..");
const read = (p: string) => readFileSync(resolve(root, p), "utf8");

describe("POS-integrated storefront motion parity without changing stock authority", () => {
  test("approved featured media stays first, duplicates disappear, and fallback is honest", () => {
    const featured = {
      id: "approved-front", url: "/photos/front.jpg", altText: "Actual front of the 5kg rice bag",
      width: 1200, height: 1200,
    };
    const side = {
      id: "approved-side", url: "/photos/side.jpg", altText: "Actual side of the 5kg rice bag",
      width: 1200, height: 1200,
    };
    const media = assembleProductMedia("Rice 5 kg", featured, [featured, side, side], "/legacy.jpg");
    expect(media.map((i) => i.id)).toEqual(["approved-front", "approved-side"]);
    expect(media[0].altText).toContain("Actual front");
    const fallback = assembleProductMedia("Rice 5 kg", undefined, [], "/legacy.jpg");
    expect(fallback).toHaveLength(1);
    expect(fallback[0].isLegacyFallback).toBe(true);
    expect(fallback[0].url).toBe("/legacy.jpg");
  });
  test("gallery has accessible thumbnail, keyboard, swipe, reduced-motion and enlarge controls", () => {
    const gallery = read("src/features/catalog/product-media-gallery.tsx");
    for (const needle of [
      "AnimatePresence", "useReducedMotion", "onKeyDown", "ArrowLeft", "ArrowRight",
      "onTouchStart", "onTouchEnd", "aria-pressed={selected}",
      "DialogContent", "data-vg-product-hero", "object-contain",
    ]) expect(gallery).toContain(needle);
    expect(gallery).not.toContain("autoplay");
    expect(gallery).not.toContain("setInterval");
  });
  test("cart flight stays cosmetic and never changes inventory or cart state", () => {
    const source = read("src/features/checkout/cart-motion.ts");
    expect(CART_IMPACT_EVENT).toBe("vg:cart-impact");
    expect(source).toContain("prefers-reduced-motion: reduce");
    expect(source).toContain('node.dataset.vgCartFlight');
    expect(source).not.toContain("useCart");
    expect(source).not.toContain("apiOps");
    expect(source).not.toContain("checkout.complete");
    expect(source).toContain("window.setTimeout(cleanup");
    expect(() => announceCartImpact()).not.toThrow();
    expect(() => flyProductToCart(null)).not.toThrow();
  });
  test("tile and pack purchase keep live SKU recheck and animate only after accepted cart add", () => {
    for (const path of [
      "src/features/catalog/product-tile.tsx",
      "src/features/catalog/product-purchase-panel.tsx",
    ]) {
      const source = read(path);
      const recheck = source.indexOf("apiOps.byVariants");
      const accepted = source.indexOf("const accepted = add(");
      const fly = source.indexOf("try { flyProductToCart");
      expect(recheck).toBeGreaterThan(0);
      expect(accepted).toBeGreaterThan(recheck);
      expect(fly).toBeGreaterThan(accepted);
      expect(source).toMatch(/finally\s*\{\s*setAdding\(false\);\s*\}/);
      expect(source).toContain("ref={addRef}");
    }
  });
  test("animated cart icon appears in header AND on mobile and responds to the flight impact", () => {
    const shell = read("src/components/layout/storefront-shell.tsx");
    const icon = read("src/features/checkout/motion-cart-icon.tsx");
    expect(shell).toContain("<MotionCartIcon count={itemCount} />");
    expect(shell).toContain("<MotionCartIcon count={itemCount} mobile />");
    expect(icon).toContain("CART_IMPACT_EVENT");
    expect(icon).toContain("useReducedMotion");
    expect(icon).toContain('data-vg-cart-target={mobile ? "mobile" : "header"}');
  });
  test("checkout CSRF repair and full official gold brand remain in place", () => {
    expect(read("src/services/client.ts")).toContain("withFreshGuestCheckoutRetry");
    expect(read("src/components/layout/storefront-shell.tsx")).toContain("/brand/variety-lockup.svg");
  });
});
