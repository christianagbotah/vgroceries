import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { assembleProductMedia } from "../src/features/catalog/product-media-gallery";
import { selectedPurchasableVariant } from "../src/features/catalog/selected-purchasable-variant";

const root = resolve(import.meta.dir, "..");
const read = (p: string) => readFileSync(resolve(root, p), "utf8");

describe("source-only accessible product quick-look overlay", () => {
  test("product cards show a touchable quick look separate from navigation and add-to-cart", () => {
    const tile = read("src/features/catalog/product-tile.tsx");
    expect(tile).toContain('aria-label={"Quick look at " + product.name}');
    expect(tile).toContain("setQuickLookOpen(true)");
    expect(tile).toContain("setQuickLookVisited(true)");
    expect(tile).toContain('href={');
    expect(tile).toContain("to cart");
    expect(tile).toContain("min-h-10");
    expect(tile).toContain("Quick look");
  });

  test("modal code is split off initial product-grid bundle and only mounted after visit", () => {
    const tile = read("src/features/catalog/product-tile.tsx");
    expect(tile).toContain("import dynamic from");
    expect(tile).toContain('import("@/features/catalog/product-quick-look")');
    expect(tile).toContain("ssr: false");
    expect(tile).toContain("quickLookVisited ? <ProductQuickLook");
    expect(tile).toContain("onOpenChange={setQuickLookOpen}");
    expect(tile).toContain("product={product}");
  });

  test("gallery selects ONLY approved featured and ordered gallery photos; legacy stays fallback", () => {
    const featured = { id: "f", url: "/media/approved-front.webp", altText: "Physical rice front", width: 1200, height: 1200 };
    const side = { id: "s", url: "/media/approved-side.webp", altText: "Physical rice side", width: 1200, height: 1200 };
    expect(assembleProductMedia("Rice", featured, [side, featured], "/seed.webp")).toEqual([featured, side]);
    const fallback = assembleProductMedia("Rice", undefined, [], "/seed.webp");
    expect(fallback).toHaveLength(1);
    expect(fallback[0].isLegacyFallback).toBe(true);
  });

  test("no mistaken variant substitution: sold out selected pack remains denied", () => {
    const variants = [
      { id: "a", isAvailable: false, name: "5 kg" },
      { id: "b", isAvailable: true, name: "2 kg" },
    ];
    expect(selectedPurchasableVariant(variants, "a")).toBeNull();
    expect(selectedPurchasableVariant(variants, "b")?.id).toBe("b");
  });

  test("the existing purchase panel remains the only cart writer", () => {
    const look = read("src/features/catalog/product-quick-look.tsx");
    const panel = read("src/features/catalog/product-purchase-panel.tsx");
    expect(look).toContain("<ProductPurchasePanel product={product} onAdded={() => onOpenChange(false)} />");
    expect(panel).toContain("if (!variant || !isAvailable) return");
    expect(panel.indexOf("add({")).toBeLessThan(panel.indexOf("flyProductToCart("));
    expect(panel.indexOf("flyProductToCart(")).toBeLessThan(panel.indexOf("onAdded?.()"));
    expect(panel).toContain('setQuantity("1")');
    expect(panel).toContain('closest("[data-vg-quicklook-root]")');
    expect(panel).toContain('querySelector<HTMLImageElement>("[data-vg-product-hero] img")');
    expect(look).not.toContain("useCart(");
    expect(look).not.toContain("apiOps.");
    expect(look).not.toContain("paymentInitiate");
  });

  test("accessible modal supports keyboard arrows, touch swipes and full-detail fallback", () => {
    const look = read("src/features/catalog/product-quick-look.tsx");
    expect(look).toContain("<Dialog open={open} onOpenChange={onOpenChange}>");
    expect(look).toContain("<DialogTitle");
    expect(look).toContain("<DialogDescription");
    expect(look).toContain("tabIndex={0}");
    expect(look).toContain('event.key === "ArrowRight"');
    expect(look).toContain('event.key === "ArrowLeft"');
    expect(look).toContain("onTouchStart");
    expect(look).toContain("onTouchEnd");
    expect(look).toContain("useReducedMotion()");
    expect(look).toContain('href={"/products/" + encodeURIComponent(product.slug)}');
    expect(look).toContain("focus-visible:outline-2");
  });

  test("gallery never describes a seed image as approved photography", () => {
    const look = read("src/features/catalog/product-quick-look.tsx");
    expect(look).toContain("active.isLegacyFallback");
    expect(look).toContain("Catalogue image");
    expect(look).toContain("Verify exact packaging");
    expect(look).toContain("ingredients");
  });

  test("source remains read-only except the existing client cart", () => {
    const look = read("src/features/catalog/product-quick-look.tsx");
    for (const forbidden of [
      "fetch(", "createOrder(", "completeSale(", "holdStock(", "reserveInventory(",
      "apiOps.", "POS_CASH_SALES_ENABLED", "paymentVerified:", "customerUserId",
    ]) expect(look).not.toContain(forbidden);
    expect(look).toContain("<ProductPurchasePanel product={product}");
    expect(read("src/features/catalog/product-purchase-panel.tsx")).toContain("product.variants");
  });
});
