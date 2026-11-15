/// <reference types="bun-types" />
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { selectedPurchasableVariant } from "../src/features/catalog/selected-purchasable-variant";

const variants = [
  { id: "small", isAvailable: false, priceMinor: 550 },
  { id: "large", isAvailable: true, priceMinor: 1200 },
];

describe("Storefront product card respects verified stock and customer intent", () => {
  test("never substitutes a different pack when a selected SKU is sold out", () => {
    expect(selectedPurchasableVariant(variants, "small")).toBeNull();
    expect(selectedPurchasableVariant(variants, "missing")).toBeNull();
    expect(selectedPurchasableVariant(variants, "large")).toEqual(variants[1]);
  });
  test("does not make a fully sold-out product purchasable", () => {
    expect(selectedPurchasableVariant(variants.map(v => ({ ...v, isAvailable: false })), "large")).toBeNull();
    expect(selectedPurchasableVariant([], "large")).toBeNull();
  });
  test("available exact choice retains server-authoritative SKU and price", () => {
    const choice = selectedPurchasableVariant(variants, "large");
    expect(choice).toEqual({ id: "large", isAvailable: true, priceMinor: 1200 });
  });
  test("UI has no fabricated five-star reviews and uses accessible purchase controls", () => {
    const tile = readFileSync("src/features/catalog/product-tile.tsx", "utf8");
    expect(tile).not.toContain("Popular product preview");
    expect(tile).not.toContain('Star className="size-3 fill-current"');
    expect(tile).toContain("selectedPurchasableVariant(product.variants, variantId)");
    expect(tile).toContain("if (!purchasable) return;");
    expect(tile).toContain("Selected size unavailable. Choose another available size.");
    expect(tile).toContain('className="h-11 w-full rounded-xl');
    expect(tile).toContain('className="mt-2 h-11 min-h-11 w-full');
    expect(tile).toContain('className="min-h-11" disabled={!v.isAvailable}');
    expect(tile).toContain('disabled>{available.length ? "Choose available size" : "Sold out"}');
  });
});
